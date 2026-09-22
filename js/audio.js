export class GameAudio {
  constructor() {
    this.context = null;
    this.settings = { muted: false, volume: 0.7 };
  }

  applySettings(settings) {
    this.settings = settings;
  }

  async enable() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.context = AudioContext ? new AudioContext() : null;
    }
    if (this.context?.state === 'suspended') {
      try {
        await this.context.resume();
      } catch (error) {
        console.warn('Audio requires a gesture in the audience view.', error);
      }
    }
    return this.context?.state === 'running';
  }

  play(name) {
    if (this.settings.muted || this.settings.volume === 0 || this.context?.state !== 'running') {
      return;
    }
    const tones = {
      wall: [190, 0.06, 'square'],
      paddle: [360, 0.08, 'triangle'],
      brick: [620, 0.06, 'square'],
      miss: [120, 0.2, 'sawtooth'],
      clear: [780, 0.18, 'triangle'],
    };
    const [frequency, duration, type] = tones[name] || tones.wall;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const volume = Math.max(0.001, this.settings.volume * 0.08);
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start();
    oscillator.stop(this.context.currentTime + duration);
  }
}
