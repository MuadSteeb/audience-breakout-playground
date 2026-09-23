import { DEFAULT_SETTINGS, GRID_COLUMNS } from './defaults.js';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const PADDLE_RESPONSE_SECONDS = 0.12;

export class BreakoutGame {
  constructor(width, height, audio) {
    this.width = width;
    this.height = height;
    this.audio = audio;
    this.score = 0;
    this.paused = false;
    this.running = false;
    this.missResetAt = 0;
    this.settings = null;
    this.bricks = [];
    this.paddle = { x: width / 2 - 70, y: 0, width: 140, height: 20, targetX: width / 2 - 70, travelSpeed: 0 };
    this.ball = { x: 0, y: 0, radius: 12, speedX: 0, speedY: 0 };
    this.ballGeneration = 0;
    this.strengthSeconds = 0;
    this.paddleWidthBonus = 0;
    this.lastVisionBias = 0;
    this.lastInDeadZone = true;
  }

  applySettings(settings) {
    const previousSpeed = Math.hypot(this.ball.speedX, this.ball.speedY);
    const previousBaseSpeed = this.settings?.physics.ballSpeed;
    this.settings = settings;
    this.resizePaddle(settings.physics.paddleWidth + this.paddleWidthBonus);
    this.paddle.height = settings.physics.paddleHeight;
    this.paddle.y = this.height - this.paddle.height - this.width / GRID_COLUMNS;
    this.paddle.x = clamp(this.paddle.x, 18, this.width - this.paddle.width - 18);
    this.paddle.targetX = clamp(this.paddle.targetX, 18, this.width - this.paddle.width - 18);
    this.ball.radius = settings.physics.ballSize / 2;
    if (previousSpeed > 0 && previousBaseSpeed && previousBaseSpeed !== settings.physics.ballSpeed) {
      const ratio = settings.physics.ballSpeed / previousBaseSpeed;
      this.ball.speedX *= ratio;
      this.ball.speedY *= ratio;
    }
  }

  start() {
    if (!this.bricks.length) {
      this.createBricks();
    }
    if (!this.ball.speedX && !this.ball.speedY) {
      this.resetBall();
    }
    this.running = true;
    this.paused = false;
  }

  togglePause() {
    if (this.running) {
      this.paused = !this.paused;
    }
  }

  createBricks() {
    const rows = 7;
    const cols = GRID_COLUMNS;
    const brickWidth = this.width / cols;
    const brickHeight = brickWidth;
    this.bricks = [];
    this.strengthSeconds = 0;
    this.paddleWidthBonus = 0;
    this.resizePaddle(this.settings.physics.paddleWidth);
    for (let row = 2; row < rows; row += 1) {
      for (let col = 2; col < cols - 2; col += 1) {
        this.bricks.push({
          x: col * brickWidth,
          y: row * brickHeight,
          width: brickWidth,
          height: brickHeight,
          alive: true,
          shade: (row + col + row * 2) % 5,
          type: 'normal',
        });
      }
    }
    const shuffled = [...this.bricks];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    let assigned = 0;
    for (const [type, rate] of [['strength', 0.05], ['bonus', 0.05], ['error', 0.025]]) {
      const specialCount = Math.round(this.bricks.length * rate);
      for (let index = 0; index < specialCount; index += 1) {
        const brick = shuffled[assigned++];
        brick.type = type;
        if (type === 'strength') brick.variant = index % 3;
      }
    }
  }

  resizePaddle(width) {
    const nextWidth = clamp(width, 60, Math.min(360, this.width - 36));
    const offset = (this.paddle.width - nextWidth) / 2;
    this.paddle.width = nextWidth;
    this.paddle.x = clamp(this.paddle.x + offset, 18, this.width - nextWidth - 18);
    this.paddle.targetX = clamp(this.paddle.targetX + offset, 18, this.width - nextWidth - 18);
    this.paddleWidthBonus = nextWidth - this.settings.physics.paddleWidth;
  }

  applyBrickEffect(brick) {
    if (brick.type === 'strength') {
      this.strengthSeconds = 10;
    } else if (brick.type === 'bonus' || brick.type === 'error') {
      const direction = brick.type === 'bonus' ? 1 : -1;
      this.resizePaddle(this.paddle.width + direction * this.width / GRID_COLUMNS);
    }
  }

  resetBoard() {
    this.createBricks();
    this.resetBall();
  }

  resetScore() {
    this.score = 0;
  }

  resetBall() {
    this.ballGeneration += 1;
    this.strengthSeconds = 0;
    const speed = this.settings?.physics.ballSpeed || DEFAULT_SETTINGS.physics.ballSpeed;
    this.ball.x = this.paddle.x + this.paddle.width / 2;
    this.ball.y = this.paddle.y - this.ball.radius - 4;
    this.ball.speedX = speed * 0.7 * (Math.random() < 0.5 ? -1 : 1);
    this.ball.speedY = -Math.sqrt(speed ** 2 - this.ball.speedX ** 2);
    this.missResetAt = 0;
  }

  setPaddleControl(vision) {
    if (this.settings.manualControl.enabled) {
      this._applyProportionalControl(this.settings.manualControl.position / 50 - 1, 1);
      return;
    }
    this.setVisionControl(vision);
  }

  setVisionControl({ bias }) {
    const { deadZone, sensitivity } = this.settings.vision;
    const magnitude = Math.abs(bias);
    if (magnitude <= deadZone) {
      this.paddle.targetX = this.paddle.x;
      this.paddle.travelSpeed = 0;
      this.lastVisionBias = bias;
      this.lastInDeadZone = true;
      return;
    }
    if (this.settings.vision.controlMode === 'proportional') {
      this._applyProportionalControl(bias);
    } else {
      this._applyEdgeControl(bias);
    }
    const speedFraction = clamp(
      (magnitude - deadZone) / (1 - deadZone) * sensitivity * this.settings.physics.paddleSpeedScale,
      0, 1,
    );
    this.paddle.travelSpeed = this.settings.physics.paddleSpeed * speedFraction;
  }

  _applyEdgeControl(bias) {
    this.paddle.targetX = bias < 0 ? 18 : this.width - this.paddle.width - 18;
    this.lastVisionBias = bias;
    this.lastInDeadZone = false;
  }

  _applyProportionalControl(bias, sensitivity = this.settings.vision.sensitivity) {
    const minX = 18;
    const maxX = this.width - this.paddle.width - 18;
    const centerX = (minX + maxX) / 2;
    const halfSpan = (maxX - minX) / 2;
    const scaled = clamp(bias * sensitivity, -1, 1);
    this.paddle.targetX = clamp(centerX + scaled * halfSpan, minX, maxX);
    this.paddle.travelSpeed = this.settings.physics.paddleSpeed;
    this.lastVisionBias = bias;
    this.lastInDeadZone = false;
  }

  paddleIntent() {
    const bias = this.lastVisionBias ?? 0;
    const inDeadZone = this.lastInDeadZone ?? true;
    let direction = 'hold';
    if (!inDeadZone) {
      if (this.paddle.targetX > this.paddle.x) {
        direction = 'right';
      } else if (this.paddle.targetX < this.paddle.x) {
        direction = 'left';
      } else {
        direction = 'hold';
      }
    }
    return {
      targetX: this.paddle.targetX,
      travelSpeed: this.paddle.travelSpeed,
      inDeadZone,
      direction,
      bias,
    };
  }

  update(deltaSeconds, now) {
    if (!this.running || this.paused) {
      return;
    }
    if (this.missResetAt) {
      if (now >= this.missResetAt) {
        this.resetBall();
      }
      return;
    }
    const delta = deltaSeconds * this.settings.physics.timeScale;
    const travel = Math.max(Math.abs(this.ball.speedX), Math.abs(this.ball.speedY)) * delta;
    const stepDistance = Math.max(this.ball.radius * 0.5, 2);
    const steps = Math.min(Math.max(Math.ceil(travel / stepDistance), 1), 120);
    const stepDelta = delta / steps;
    // Time-based easing filters target jitter without depending on frame rate or ball substeps.
    const paddleFollow = -Math.expm1(-stepDelta / PADDLE_RESPONSE_SECONDS);
    for (let step = 0; step < steps; step += 1) {
      this.strengthSeconds = Math.max(0, this.strengthSeconds - deltaSeconds / steps);
      const maxPaddleStep = this.paddle.travelSpeed * stepDelta;
      this.paddle.x += clamp(
        (this.paddle.targetX - this.paddle.x) * paddleFollow,
        -maxPaddleStep,
        maxPaddleStep,
      );
      this.paddle.x = clamp(this.paddle.x, 18, this.width - this.paddle.width - 18);
      this.ball.x += this.ball.speedX * stepDelta;
      this.ball.y += this.ball.speedY * stepDelta;
      this.handleWallCollisions(now);
      if (this.missResetAt) {
        break;
      }
      this.handlePaddleCollision();
      const generation = this.ballGeneration;
      this.handleBrickCollisions();
      if (generation !== this.ballGeneration) break;
    }
  }

  handleWallCollisions(now) {
    const ball = this.ball;
    if (ball.x - ball.radius <= 0 || ball.x + ball.radius >= this.width) {
      ball.speedX *= -1;
      ball.x = clamp(ball.x, ball.radius, this.width - ball.radius);
      this.audio.play('wall');
    }
    if (ball.y - ball.radius <= 0) {
      ball.speedY *= -1;
      ball.y = ball.radius;
      this.audio.play('wall');
    }
    if (ball.y - ball.radius > this.height) {
      this.missResetAt = now + 800;
      this.audio.play('miss');
    }
  }

  handlePaddleCollision() {
    const ball = this.ball;
    const paddle = this.paddle;
    if (
      ball.speedY > 0
      && ball.y + ball.radius >= paddle.y
      && ball.y - ball.radius <= paddle.y + paddle.height
      && ball.x >= paddle.x
      && ball.x <= paddle.x + paddle.width
    ) {
      const relative = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
      const angle = relative * (Math.PI / 3);
      const speed = Math.min(
        Math.hypot(ball.speedX, ball.speedY) * this.settings.physics.speedUp,
        this.settings.physics.ballSpeed * 2.5,
      );
      ball.speedX = Math.sin(angle) * speed;
      ball.speedY = -Math.cos(angle) * speed;
      ball.y = paddle.y - ball.radius - 1;
      this.audio.play('paddle');
    }
  }

  handleBrickCollisions() {
    const ball = this.ball;
    for (const brick of this.bricks) {
      if (!brick.alive) {
        continue;
      }
      const overlapsX = ball.x + ball.radius > brick.x
        && ball.x - ball.radius < brick.x + brick.width;
      const overlapsY = ball.y + ball.radius > brick.y
        && ball.y - ball.radius < brick.y + brick.height;
      if (!overlapsX || !overlapsY) {
        continue;
      }
      brick.alive = false;
      this.score += 1;
      this.audio.play('brick');
      this.applyBrickEffect(brick);
      const piercing = this.strengthSeconds > 0;
      if (!piercing) {
        const overlaps = [
          { axis: 'x', value: ball.x + ball.radius - brick.x },
          { axis: 'x', value: brick.x + brick.width - (ball.x - ball.radius) },
          { axis: 'y', value: ball.y + ball.radius - brick.y },
          { axis: 'y', value: brick.y + brick.height - (ball.y - ball.radius) },
        ];
        const collision = overlaps.reduce((minimum, item) => item.value < minimum.value ? item : minimum);
        if (collision.axis === 'x') {
          ball.speedX *= -1;
        } else {
          ball.speedY *= -1;
        }
      }
      if (this.bricks.every((item) => !item.alive)) {
        this.audio.play('clear');
        this.createBricks();
        this.resetBall();
        return;
      }
      if (!piercing) return;
    }
  }

  snapshot() {
    return {
      physics: this.settings ? { ...this.settings.physics } : null,
      running: this.running,
      paused: this.paused,
      score: this.score,
      strengthSeconds: this.strengthSeconds,
      ball: { x: this.ball.x, y: this.ball.y },
      paddle: { x: this.paddle.x, width: this.paddle.width },
    };
  }
}
