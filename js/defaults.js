export const SCHEMA_VERSION = 1;
export const CHANNEL_NAME = 'audience-breakout-v1';
export const SETTINGS_STORAGE_KEY = 'audience-breakout:settings';
export const PRESETS_STORAGE_KEY = 'audience-breakout:presets';
export const FALLBACK_MESSAGE_KEY = 'audience-breakout:message';

export const DEFAULT_SETTINGS = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  appearance: {
    title: 'Breakout Vision',
    eyebrow: 'Computer vision demo',
    message: 'Move together. Break everything.',
    showScore: true,
    showMessage: true,
    showWebcam: true,
    mirrorWebcam: true,
    showCrowd: true,
    showBricks: true,
    showPaddle: true,
    showBall: true,
    showDiagnostics: false,
    showLightOverlay: false,
    ballColor: '#f6fff8',
    paddleColor: '#d2ff6c',
    stageColor: '#0a120e',
    textColor: '#f0f6fc',
    brickLowColor: '#20112d',
    brickHighColor: '#b392ff',
    webcamOpacity: 0.3,
  },
  audio: {
    muted: false,
    volume: 0.7,
  },
  physics: {
    ballSpeed: 170,
    speedUp: 1.02,
    timeScale: 1,
    ballSize: 24,
    paddleSpeed: 700,
    paddleWidth: 168,
    paddleHeight: 18,
  },
  vision: {
    targetColor: '#39d353',
    tolerance: 105,
    minimumStrength: 110,
    deadZone: 0.1,
    sensitivity: 1,
    sampleStride: 4,
    perspectiveGain: 0,
    sideBias: 0,
    controlMode: 'proportional',
  },
  crowd: {
    enabled: false,
    leftCount: 120,
    rightCount: 120,
    color: '#39d353',
    blockSize: 7,
    minimumOpacity: 0.4,
    maximumOpacity: 1,
    jitter: 18,
  },
});
