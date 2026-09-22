function hexToRgb(hex) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

export class VisionDetector {
  constructor(gameWidth, gameHeight) {
    this.gameWidth = gameWidth;
    this.gameHeight = gameHeight;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 225;
    this.canvas.height = 125;
    this.context = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  detect(source, settings, sourceReady, simulatedCounts = { left: 0, right: 0 }) {
    const context = this.context;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.fillStyle = '#000';
    context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (sourceReady) {
      context.save();
      if (settings.appearance.mirrorWebcam) {
        context.translate(this.canvas.width, 0);
        context.scale(-1, 1);
      }
      context.drawImage(source, 0, 0, this.canvas.width, this.canvas.height);
      context.restore();
    }
    const pixels = context.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
    const target = hexToRgb(settings.vision.targetColor);
    const toleranceSquared = settings.vision.tolerance ** 2;
    const stride = settings.vision.sampleStride;
    const perspectiveGain = Math.min(4, Math.max(0, Number(settings.vision.perspectiveGain) || 0));
    const collectMatches = Boolean(settings.appearance?.showDiagnostics || settings.appearance?.showLightOverlay);
    const matches = collectMatches ? [] : null;
    let left = simulatedCounts.left;
    let right = simulatedCounts.right;
    const midX = this.canvas.width / 2;
    const heightDenominator = Math.max(1, this.canvas.height - 1);
    for (let y = 0; y < this.canvas.height; y += stride) {
      for (let x = 0; x < this.canvas.width; x += stride) {
        const index = (y * this.canvas.width + x) * 4;
        const r = pixels[index];
        const g = pixels[index + 1];
        const b = pixels[index + 2];
        if (Math.max(r, g, b) < settings.vision.minimumStrength) {
          continue;
        }
        const distance = (r - target.r) ** 2 + (g - target.g) ** 2 + (b - target.b) ** 2;
        if (distance <= toleranceSquared) {
          const weight = perspectiveGain > 0
            ? 1 + perspectiveGain * (1 - y / heightDenominator)
            : 1;
          if (x < midX) {
            left += weight;
          } else {
            right += weight;
          }
          if (matches) {
            matches.push({ x, y });
          }
        }
      }
    }
    const rawLeft = left;
    const rawRight = right;
    const sideBiasRaw = Math.round(Number(settings.vision.sideBias) || 0);
    const sideBias = Math.min(200, Math.max(-200, sideBiasRaw));
    let appliedSide = 'none';
    let appliedAmount = 0;
    if (sideBias < 0) {
      const magnitude = -sideBias;
      appliedSide = 'left';
      appliedAmount = Math.min(magnitude, rawLeft);
      left = Math.max(0, rawLeft - magnitude);
    } else if (sideBias > 0) {
      appliedSide = 'right';
      appliedAmount = Math.min(sideBias, rawRight);
      right = Math.max(0, rawRight - sideBias);
    }
    const total = left + right;
    const bias = total ? (right - left) / total : 0;
    return {
      left: Math.round(left),
      right: Math.round(right),
      rawLeft: Math.round(rawLeft),
      rawRight: Math.round(rawRight),
      bias,
      matches,
      sampleWidth: this.canvas.width,
      sampleHeight: this.canvas.height,
      sampleStride: stride,
      perspectiveGain,
      appliedBias: { side: appliedSide, amount: Math.round(appliedAmount), requested: sideBias },
    };
  }
}
