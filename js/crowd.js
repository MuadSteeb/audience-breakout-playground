function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function hexToRgb(hex) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

export class CrowdSimulator {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.left = [];
    this.right = [];
    this.settings = null;
  }

  applySettings(settings) {
    this.settings = settings;
    this.syncSide('left', settings.leftCount);
    this.syncSide('right', settings.rightCount);
  }

  createBlock(side) {
    const size = this.settings?.blockSize || 7;
    const margin = 18;
    const centerGap = this.width * 0.05;
    const halfWidth = this.width / 2;
    const minX = side === 'left' ? margin : halfWidth + centerGap / 2;
    const maxX = side === 'left'
      ? halfWidth - centerGap / 2 - margin - size
      : this.width - margin - size;
    return {
      x: Math.random() * Math.max(1, maxX - minX) + minX,
      y: Math.random() * (this.height * 0.7 - size) + this.height * 0.2,
      opacitySeed: Math.random(),
    };
  }

  syncSide(side, count) {
    const blocks = this[side];
    while (blocks.length < count) {
      blocks.push(this.createBlock(side));
    }
    blocks.length = Math.min(blocks.length, count);
  }

  update(deltaSeconds = 1 / 60) {
    if (!this.settings?.enabled || this.settings.jitter === 0) {
      return;
    }
    const movementChance = 1 - Math.pow(0.92, Math.max(deltaSeconds, 0) * 60);
    for (const side of ['left', 'right']) {
      const halfWidth = this.width / 2;
      const centerGap = this.width * 0.05;
      const minX = side === 'left' ? 18 : halfWidth + centerGap / 2;
      const maxX = side === 'left' ? halfWidth - centerGap / 2 - 18 : this.width - 18;
      for (const block of this[side]) {
        if (Math.random() > movementChance) {
          continue;
        }
        const size = this.settings.blockSize;
        block.x = clamp(
          block.x + (Math.random() - 0.5) * this.settings.jitter,
          minX,
          maxX - size,
        );
        block.y = clamp(
          block.y + (Math.random() - 0.5) * this.settings.jitter,
          this.height * 0.2,
          this.height * 0.9 - size,
        );
      }
    }
  }

  detectionCounts() {
    if (!this.settings?.enabled) {
      return { left: 0, right: 0 };
    }
    return { left: this.left.length, right: this.right.length };
  }

  draw(context, scaleX = 1, scaleY = 1) {
    if (!this.settings?.enabled) {
      return;
    }
    const { r, g, b } = hexToRgb(this.settings.color);
    const opacityRange = this.settings.maximumOpacity - this.settings.minimumOpacity;
    for (const side of ['left', 'right']) {
      for (const block of this[side]) {
        const opacity = this.settings.minimumOpacity + block.opacitySeed * opacityRange;
        context.fillStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
        context.fillRect(
          block.x * scaleX,
          block.y * scaleY,
          this.settings.blockSize * scaleX,
          this.settings.blockSize * scaleY,
        );
      }
    }
  }
}
