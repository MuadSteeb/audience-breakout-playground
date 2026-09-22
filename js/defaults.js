export const SCHEMA_VERSION = 3;
export const CHANNEL_NAME = 'audience-breakout-v1';
export const SETTINGS_STORAGE_KEY = 'audience-breakout:settings';
export const PRESETS_STORAGE_KEY = 'audience-breakout:presets';
export const FALLBACK_MESSAGE_KEY = 'audience-breakout:message';

export const DEFAULT_SETTINGS = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  appearance: {
    title: 'Audience breakout',
    eyebrow: "GitHub Universe '26",
    message: 'Move together. Break everything.',
    showScore: true,
    showMessage: true,
    showWebcam: false,
    mirrorWebcam: true,
    showCrowd: true,
    showBricks: true,
    showPaddle: true,
    showBall: true,
    showDiagnostics: false,
    showLightOverlay: false,
    ballColor: '#57615b',
    paddleColor: '#57615b',
    stageColor: '#e9edec',
    textColor: '#343d37',
    brickLowColor: '#57615b',
    brickHighColor: '#57615b',
    webcamOpacity: 0.1,
  },
  audio: {
    muted: false,
    volume: 0.7,
  },
  physics: {
    ballSpeed: 170,
    speedUp: 1.02,
    timeScale: 1,
    ballSize: 20,
    paddleSpeed: 700,
    paddleWidth: 140,
    paddleHeight: 20,
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
  manualControl: {
    enabled: false,
    position: 50,
  },
});
