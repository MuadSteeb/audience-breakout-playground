import { GRID_COLUMNS } from './defaults.js';

function hexToRgb(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function interpolateColor(start, end, amount) {
  const from = hexToRgb(start);
  const to = hexToRgb(end);
  return `rgb(${from.map((value, index) => Math.round(value + (to[index] - value) * amount)).join(',')})`;
}

const ACCENT = '#5fed83';
const TRAIL_COLORS = ['#1a7f37', '#583af7', '#c05200'];
const BURST_COLORS = ['#5fed83', '#bba00a', '#583af7', '#c05200', '#f73678', '#ae85ff'];
const STRENGTH_COLORS = ['#ae85ff', '#f73678', '#583af7'];
const PIXEL_DIGITS = [
  ['111', '101', '101', '101', '111'],
  ['010', '110', '010', '010', '111'],
  ['111', '001', '111', '100', '111'],
  ['111', '001', '111', '001', '111'],
  ['101', '101', '111', '001', '001'],
  ['111', '100', '111', '001', '111'],
  ['111', '100', '111', '101', '111'],
  ['111', '001', '001', '001', '001'],
  ['111', '101', '111', '101', '111'],
  ['111', '101', '111', '001', '111'],
];

export class GameRenderer {
  constructor(canvas, { leftCanvas = null, rightCanvas = null, reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.sidePanels = [
      { canvas: leftCanvas, side: 'left' },
      { canvas: rightCanvas, side: 'right' },
    ].filter((panel) => panel.canvas).map((panel) => ({
      ...panel,
      context: panel.canvas.getContext('2d'),
    }));
    this.reducedMotion = reducedMotion;
    this.effectTime = 0;
    this.trailTimer = 0;
    this.trail = [];
    this.particles = [];
    this.lastScore = 0;
    this.lastBoard = null;
    this.lastBallGeneration = -1;
  }

  draw(game, crowd, settings, source, sourceReady, vision = null, paddleIntent = null, deltaSeconds = 0) {
    const context = this.context;
    const { width, height } = this.canvas;
    this.updateEffects(game, deltaSeconds);
    context.clearRect(0, 0, width, height);
    context.fillStyle = settings.appearance.stageColor;
    context.fillRect(0, 0, width, height);

    if (settings.appearance.showWebcam && sourceReady) {
      context.save();
      context.globalAlpha = settings.appearance.webcamOpacity;
      if (settings.appearance.mirrorWebcam) {
        context.translate(width, 0);
        context.scale(-1, 1);
      }
      context.drawImage(source, 0, 0, width, height);
      context.restore();
    }

    this.drawGrid();
    if (settings.appearance.showBricks) {
      for (const brick of game.bricks) {
        if (brick.alive) {
          this.drawBrick(brick, settings);
        }
      }
    }
    this.drawEffects(game, settings);
    if (settings.appearance.showPaddle) {
      context.fillStyle = settings.appearance.paddleColor;
      context.fillRect(game.paddle.x, game.paddle.y, game.paddle.width, game.paddle.height);
      context.fillStyle = '#d9dfdb';
      const cell = width / GRID_COLUMNS;
      for (let x = cell; x < game.paddle.width; x += cell) {
        context.fillRect(game.paddle.x + x, game.paddle.y, 1, game.paddle.height);
      }
    }
    if (settings.appearance.showBall && game.running) {
      context.fillStyle = game.strengthSeconds > 0 ? '#583af7' : settings.appearance.ballColor;
      context.fillRect(
        game.ball.x - game.ball.radius, game.ball.y - game.ball.radius,
        game.ball.radius * 2, game.ball.radius * 2,
      );
    }
    if (settings.appearance.showLightOverlay && !settings.appearance.showDiagnostics) {
      this.drawLightOverlay(settings, vision);
    }
    if (settings.appearance.showDiagnostics) {
      this.drawDiagnostics(game, settings, vision, paddleIntent);
    }
    for (const panel of this.sidePanels) {
      this.drawSidePanel(panel, game.score, vision?.[panel.side] ?? 0, settings);
    }
  }

  drawGrid() {
    const context = this.context;
    const cell = this.canvas.width / GRID_COLUMNS;
    context.beginPath();
    context.strokeStyle = '#d9dfdb';
    context.lineWidth = 1;
    for (let x = 0; x <= this.canvas.width; x += cell) {
      context.moveTo(x + 0.5, 0);
      context.lineTo(x + 0.5, this.canvas.height);
    }
    for (let y = 0; y <= this.canvas.height; y += cell) {
      context.moveTo(0, y + 0.5);
      context.lineTo(this.canvas.width, y + 0.5);
    }
    context.stroke();
  }

  updateEffects(game, deltaSeconds) {
    const reset = this.lastBoard !== game.bricks || this.lastBallGeneration !== game.ballGeneration;
    if (reset || this.reducedMotion || game.score < this.lastScore) {
      this.trail = [];
      this.particles = [];
      this.trailTimer = 0;
    }
    this.lastBoard = game.bricks;
    this.lastBallGeneration = game.ballGeneration;
    const delta = game.running && !game.paused
      ? Math.min(Math.max(deltaSeconds, 0), 0.05) * game.settings.physics.timeScale
      : 0;
    if (!this.reducedMotion) {
      this.effectTime += delta;
      if (!reset && game.score > this.lastScore) {
        const count = Math.min(game.score - this.lastScore, 4) * 12;
        for (let index = 0; index < count; index += 1) {
          const angle = index * 2.39996;
          const speed = 45 + (index % 5) * 22;
          this.particles.push({
            x: game.ball.x,
            y: game.ball.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 30,
            age: 0,
            color: BURST_COLORS[index % BURST_COLORS.length],
            size: 3 + index % 3,
          });
        }
        this.particles = this.particles.slice(-160);
      }
      for (const particle of this.particles) {
        particle.age += delta;
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        particle.vy += 90 * delta;
      }
      this.particles = this.particles.filter((particle) => particle.age < 0.55);
      this.trailTimer += delta;
      if (delta > 0 && !game.missResetAt && (this.trailTimer >= 0.03 || !this.trail.length)) {
        this.trail.push({
          at: this.effectTime,
          x: game.ball.x,
          y: game.ball.y,
          paddleX: game.paddle.x,
        });
        this.trailTimer %= 0.03;
      }
      this.trail = this.trail.filter((point) => this.effectTime - point.at < 0.18).slice(-8);
    }
    this.lastScore = game.score;
  }

  drawEffects(game, settings) {
    const context = this.context;
    const cell = this.canvas.width / GRID_COLUMNS;
    context.save();
    for (const point of this.trail) {
      const age = this.effectTime - point.at;
      context.fillStyle = TRAIL_COLORS[Math.min(2, Math.floor(age / 0.06))];
      context.globalAlpha = 0.4 * (1 - age / 0.18);
      if (settings.appearance.showBall) {
        context.fillRect(
          Math.round((point.x - game.ball.radius) / cell) * cell,
          Math.round((point.y - game.ball.radius) / cell) * cell,
          game.ball.radius * 2, game.ball.radius * 2,
        );
      }
      if (settings.appearance.showPaddle) {
        context.fillRect(point.paddleX, game.paddle.y, game.paddle.width, game.paddle.height);
      }
    }
    if (settings.appearance.showBricks) {
      for (const particle of this.particles) {
        context.fillStyle = particle.color;
        context.globalAlpha = 1 - particle.age / 0.55;
        context.fillRect(Math.round(particle.x), Math.round(particle.y), particle.size, particle.size);
      }
    }
    context.restore();
  }

  drawSidePanel({ canvas, context, side }, score, value, settings) {
    const { width, height } = canvas;
    const count = Math.max(0, Math.round(value));
    const total = Math.max(0, Math.round(score));
    const digits = String(total).padStart(2, '0');
    const cell = Math.min(27, (width - 40) / (digits.length * 4 - 1));
    const left = (width - (digits.length * 4 - 1) * cell) / 2;
    const label = settings.appearance.showScore
      ? `Total bricks cleared: ${total}`
      : `${side === 'left' ? 'Left' : 'Right'} audience lights`;
    if (canvas.getAttribute('aria-label') !== label) {
      canvas.setAttribute('aria-label', label);
    }
    context.clearRect(0, 0, width, height);
    context.fillStyle = total > 0 ? '#1a7f37' : '#d9dfdb';
    context.strokeStyle = '#e9edec';
    context.lineWidth = 1;
    const visibleDigits = settings.appearance.showScore ? [...digits] : [];
    visibleDigits.forEach((digit, index) => {
      PIXEL_DIGITS[Number(digit)].forEach((row, y) => {
        [...row].forEach((filled, x) => {
          if (filled === '0') return;
          const px = left + (index * 4 + x) * cell;
          const py = 20 + y * cell;
          context.fillRect(px, py, cell, cell);
          context.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
        });
      });
    });
    if (!settings.appearance.showCrowd) return;
    context.fillStyle = settings.crowd.enabled ? settings.crowd.color : ACCENT;
    const size = Math.min(4, Math.max(1, settings.crowd.blockSize * 0.22));
    const opacityRange = settings.crowd.maximumOpacity - settings.crowd.minimumOpacity;
    const motion = this.reducedMotion ? 0 : this.effectTime * settings.crowd.jitter / 225;
    for (let index = 0; index < Math.min(count, 180); index += 1) {
      const progress = (index * 0.618034 + motion) % 1;
      const x = width / 2 + Math.sin(index * 19.31 + (side === 'left' ? 0 : 3)) * width * 0.44 * progress;
      const y = height * (0.4 + progress * 0.52);
      context.globalAlpha = settings.crowd.minimumOpacity + opacityRange * ((index % 11) / 10);
      context.fillRect(Math.round(x), Math.round(y), size, size);
    }
    context.globalAlpha = 1;
  }

  drawLightOverlay(settings, vision) {
    if (!vision?.matches || !vision.sampleWidth || !vision.sampleHeight) {
      return;
    }
    const context = this.context;
    const { width, height } = this.canvas;
    const perspectiveGain = Math.min(4, Math.max(0, Number(vision?.perspectiveGain ?? settings.vision.perspectiveGain ?? 0) || 0));
    const scaleX = width / vision.sampleWidth;
    const scaleY = height / vision.sampleHeight;
    const dotSize = Math.max(2, Math.min(scaleX, scaleY) * (vision.sampleStride || 1) * 0.9);
    const heightDenominator = Math.max(1, vision.sampleHeight - 1);
    context.save();
    for (const point of vision.matches) {
      const weight = perspectiveGain > 0
        ? 1 + perspectiveGain * (1 - point.y / heightDenominator)
        : 1;
      const alpha = perspectiveGain > 0
        ? Math.min(0.9, 0.35 + 0.55 * ((weight - 1) / perspectiveGain))
        : 0.55;
      context.fillStyle = `rgba(255, 80, 200, ${alpha.toFixed(3)})`;
      context.fillRect(
        point.x * scaleX - dotSize / 2,
        point.y * scaleY - dotSize / 2,
        dotSize,
        dotSize,
      );
    }
    context.restore();
  }

  drawDiagnostics(game, settings, vision, paddleIntent) {
    const context = this.context;
    const { width, height } = this.canvas;
    const midX = width / 2;

    context.save();
    context.lineWidth = 2;
    context.strokeStyle = 'rgba(255, 220, 90, 0.9)';
    context.setLineDash([8, 6]);
    context.strokeRect(1, 1, midX - 2, height - 2);
    context.strokeRect(midX + 1, 1, midX - 2, height - 2);
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(midX, 0);
    context.lineTo(midX, height);
    context.strokeStyle = 'rgba(255, 220, 90, 0.5)';
    context.lineWidth = 1;
    context.stroke();
    context.restore();

    const perspectiveGain = Math.min(4, Math.max(0, Number(vision?.perspectiveGain ?? settings.vision.perspectiveGain ?? 0) || 0));

    if (perspectiveGain > 0) {
      const stripWidth = 6;
      const gradient = context.createLinearGradient(0, 0, 0, height);
      const topAlpha = Math.min(0.85, 0.35 + perspectiveGain * 0.25);
      gradient.addColorStop(0, `rgba(120, 220, 255, ${topAlpha.toFixed(3)})`);
      gradient.addColorStop(1, 'rgba(120, 220, 255, 0)');
      context.save();
      context.fillStyle = gradient;
      context.fillRect(0, 0, stripWidth, height);
      context.fillRect(width - stripWidth, 0, stripWidth, height);
      context.restore();
    }

    if (vision?.matches && vision.sampleWidth && vision.sampleHeight) {
      const scaleX = width / vision.sampleWidth;
      const scaleY = height / vision.sampleHeight;
      const dotSize = Math.max(2, Math.min(scaleX, scaleY) * (vision.sampleStride || 1) * 0.9);
      const heightDenominator = Math.max(1, vision.sampleHeight - 1);
      context.save();
      for (const point of vision.matches) {
        // VisionDetector already mirrors the source before sampling when
        // mirrorWebcam is on, so match coordinates are already aligned with
        // the mirrored webcam drawn on the game canvas — no extra flip here.
        const weight = perspectiveGain > 0
          ? 1 + perspectiveGain * (1 - point.y / heightDenominator)
          : 1;
        const alpha = perspectiveGain > 0
          ? Math.min(0.9, 0.35 + 0.55 * ((weight - 1) / perspectiveGain))
          : 0.55;
        context.fillStyle = `rgba(255, 80, 200, ${alpha.toFixed(3)})`;
        context.fillRect(
          point.x * scaleX - dotSize / 2,
          point.y * scaleY - dotSize / 2,
          dotSize,
          dotSize,
        );
      }
      context.restore();
    }

    const left = vision?.left ?? 0;
    const right = vision?.right ?? 0;
    const bias = vision?.bias ?? 0;
    const biasPct = Math.round(bias * 100);
    const biasLabel = bias === 0 ? 'bias: 0%' : `bias: ${biasPct > 0 ? '+' : ''}${biasPct}% → ${biasPct > 0 ? 'right' : 'left'}`;
    const appliedBias = vision?.appliedBias ?? { side: 'none', amount: 0, requested: 0 };
    const showLeftBias = appliedBias.side === 'left' && appliedBias.amount > 0;
    const showRightBias = appliedBias.side === 'right' && appliedBias.amount > 0;
    const boxHeight = showLeftBias || showRightBias ? 58 : 36;

    context.save();
    context.font = 'bold 20px system-ui, sans-serif';
    context.textBaseline = 'top';
    context.fillStyle = 'rgba(0, 0, 0, 0.55)';
    context.fillRect(8, 8, 180, boxHeight);
    context.fillRect(width - 188, 8, 180, boxHeight);
    context.fillStyle = 'rgba(255, 220, 90, 1)';
    context.fillText(`LEFT  ${left}`, 16, 14);
    context.textAlign = 'right';
    context.fillText(`RIGHT ${right}`, width - 16, 14);
    context.textAlign = 'left';
    if (showLeftBias) {
      context.font = '14px system-ui, sans-serif';
      context.fillStyle = 'rgba(255, 180, 120, 1)';
      context.fillText(`bias -${appliedBias.amount}`, 16, 40);
    }
    if (showRightBias) {
      context.font = '14px system-ui, sans-serif';
      context.fillStyle = 'rgba(255, 180, 120, 1)';
      context.textAlign = 'right';
      context.fillText(`bias -${appliedBias.amount}`, width - 16, 40);
      context.textAlign = 'left';
    }
    context.restore();

    if (paddleIntent) {
      const ghostY = game.paddle.y;
      const ghostW = game.paddle.width;
      const ghostH = game.paddle.height;
      context.save();
      context.lineWidth = 2;
      context.strokeStyle = paddleIntent.inDeadZone
        ? 'rgba(160, 160, 160, 0.9)'
        : 'rgba(120, 220, 255, 0.95)';
      context.setLineDash([6, 4]);
      context.strokeRect(paddleIntent.targetX, ghostY, ghostW, ghostH);
      context.setLineDash([]);
      context.restore();

      const controlMode = settings.manualControl.enabled ? 'manual' : settings.vision.controlMode;
      const deadZoneLine = controlMode === 'manual'
        ? `dead zone: n/a (${controlMode})`
        : paddleIntent.inDeadZone
          ? `dead zone: yes (|bias| ≤ ${settings.vision.deadZone})`
          : `dead zone: no → ${paddleIntent.direction}`;
      const lines = [
        `mode: ${controlMode}`,
        controlMode === 'manual' ? `manual position: ${settings.manualControl.position}%` : biasLabel,
        `target X: ${Math.round(paddleIntent.targetX)}`,
        `travel: ${Math.round(paddleIntent.travelSpeed)} px/s`,
        deadZoneLine,
        `perspective gain: ${perspectiveGain.toFixed(2)}`,
      ];
      context.save();
      context.font = '14px system-ui, sans-serif';
      context.textBaseline = 'top';
      const boxW = 260;
      const boxH = lines.length * 20 + 12;
      const boxX = 8;
      const boxY = height - boxH - 8;
      context.fillStyle = 'rgba(0, 0, 0, 0.6)';
      context.fillRect(boxX, boxY, boxW, boxH);
      context.fillStyle = 'rgba(255, 255, 255, 0.95)';
      lines.forEach((line, index) => {
        context.fillText(line, boxX + 10, boxY + 6 + index * 20);
      });
      context.restore();
    }
  }

  drawBrick(brick, settings) {
    const context = this.context;
    const color = brick.type === 'strength' ? STRENGTH_COLORS[brick.variant]
      : brick.type === 'bonus' ? ACCENT
        : brick.type === 'error' ? '#f41e1e'
          : interpolateColor(
      settings.appearance.brickLowColor,
      settings.appearance.brickHighColor,
      brick.shade / 4,
    );
    context.fillStyle = color;
    context.fillRect(brick.x, brick.y, brick.width, brick.height);
    context.strokeStyle = '#d9dfdb';
    context.strokeRect(brick.x + 0.5, brick.y + 0.5, brick.width - 1, brick.height - 1);
    const symbol = { strength: '^', bonus: '+', error: '-' }[brick.type];
    if (symbol) {
      context.save();
      context.fillStyle = brick.type === 'bonus' || (brick.type === 'strength' && brick.variant === 0)
        ? '#343d37' : '#ffffff';
      context.font = `bold ${Math.round(brick.height * 0.7)}px "Mona Sans Mono", monospace`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(symbol, brick.x + brick.width / 2, brick.y + brick.height / 2);
      context.restore();
    }
  }
}
