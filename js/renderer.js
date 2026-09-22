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

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
  }

  draw(game, crowd, settings, source, sourceReady, vision = null, paddleIntent = null) {
    const context = this.context;
    const { width, height } = this.canvas;
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

    if (settings.appearance.showCrowd) {
      crowd.draw(context);
    }
    if (settings.appearance.showBricks) {
      for (const brick of game.bricks) {
        if (brick.alive) {
          this.drawBrick(brick, settings);
        }
      }
    }
    if (settings.appearance.showPaddle) {
      context.fillStyle = settings.appearance.paddleColor;
      context.fillRect(game.paddle.x, game.paddle.y, game.paddle.width, game.paddle.height);
    }
    if (settings.appearance.showBall) {
      context.beginPath();
      context.arc(game.ball.x, game.ball.y, game.ball.radius, 0, Math.PI * 2);
      context.fillStyle = settings.appearance.ballColor;
      context.fill();
    }
    if (settings.appearance.showLightOverlay && !settings.appearance.showDiagnostics) {
      this.drawLightOverlay(settings, vision);
    }
    if (settings.appearance.showDiagnostics) {
      this.drawDiagnostics(game, settings, vision, paddleIntent);
    }
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
      const deadZoneLine = controlMode !== 'edge'
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
    const color = interpolateColor(
      settings.appearance.brickLowColor,
      settings.appearance.brickHighColor,
      brick.shade / 4,
    );
    context.fillStyle = color;
    for (let y = 0; y < brick.height; y += 4) {
      for (let x = 0; x < brick.width; x += 4) {
        if ((x + y) % 8 < 7 || (brick.x + brick.y + x + y) % 9 === 0) {
          context.fillRect(brick.x + x, brick.y + y, 4, 4);
        }
      }
    }
    context.strokeStyle = 'rgba(255,255,255,0.28)';
    context.strokeRect(brick.x + 0.5, brick.y + 0.5, brick.width - 1, brick.height - 1);
  }
}
