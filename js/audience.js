import { GameAudio } from './audio.js';
import { createGameChannel } from './channel.js';
import { CrowdSimulator } from './crowd.js';
import { BreakoutGame } from './game.js';
import { GameRenderer } from './renderer.js';
import { loadSettings, normalizeSettings, saveSettings } from './settings.js';
import { VisionDetector } from './vision.js';

const canvas = document.querySelector('#gameCanvas');
const video = document.querySelector('#webcam');
const demoImage = document.querySelector('#demoImage');
const startupPanel = document.querySelector('#startupPanel');
const scoreLabels = document.querySelectorAll('.side-label');
const stageMessage = document.querySelector('#stageMessage');
const startCameraButton = document.querySelector('#startCameraButton');
const startDemoButton = document.querySelector('#startDemoButton');
const cameraSelect = document.querySelector('#cameraSelect');
const playState = document.querySelector('#playState');
const powerStatus = document.querySelector('#powerStatus');
const audienceStatus = document.querySelector('#audienceStatus');

const CAMERA_DEVICE_STORAGE_KEY = 'audience.cameraDeviceId';
let selectedCameraDeviceId = '';
try {
  selectedCameraDeviceId = localStorage.getItem(CAMERA_DEVICE_STORAGE_KEY) || '';
} catch (error) {
  selectedCameraDeviceId = '';
}

let settings = loadSettings();
let settingsRevision = 1;
let cameraState = 'offline';
let mode = 'stopped';
let latestVision = { left: 0, right: 0, bias: 0 };
let lastTimestamp = 0;
let lastSnapshotAt = 0;
let audioReady = false;
let pendingCameraStart = false;
let pendingDemoStart = false;

const audio = new GameAudio();
const game = new BreakoutGame(canvas.width, canvas.height, audio);
const crowd = new CrowdSimulator(canvas.width, canvas.height);
const vision = new VisionDetector(canvas.width, canvas.height);
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const renderer = new GameRenderer(canvas, {
  leftCanvas: document.querySelector('#leftMeter'),
  rightCanvas: document.querySelector('#rightMeter'),
  leftCameraCanvas: document.querySelector('#leftCamera'),
  rightCameraCanvas: document.querySelector('#rightCamera'),
  reducedMotion: motionPreference.matches,
});
motionPreference.addEventListener('change', (event) => {
  renderer.reducedMotion = event.matches;
});

function sourceReady() {
  if (mode === 'demo') {
    return demoImage.complete && demoImage.naturalWidth > 0;
  }
  return cameraState === 'live' && video.videoWidth > 0 && video.videoHeight > 0;
}

function activeSource() {
  return mode === 'demo' ? demoImage : video;
}

function applySettings(nextSettings, revision) {
  settings = normalizeSettings(nextSettings);
  if (typeof revision === 'number' && revision > settingsRevision) {
    settingsRevision = revision;
  }
  saveSettings(settings);
  audio.applySettings(settings.audio);
  game.applySettings(settings);
  crowd.applySettings(settings.crowd);
  stageMessage.textContent = settings.appearance.message;
  stageMessage.hidden = !settings.appearance.showMessage;
  scoreLabels.forEach((label) => { label.hidden = !settings.appearance.showScore; });
  document.body.style.backgroundColor = settings.appearance.stageColor;
  document.body.style.color = settings.appearance.textColor;
  stageMessage.style.color = settings.appearance.textColor;
}

function runtimeState() {
  return {
    ...game.snapshot(),
    cameraState,
    mode,
    vision: latestVision,
    audioReady,
    settingsRevision,
  };
}

function sendRuntimeHeartbeat() {
  channel.send('runtime', { runtime: runtimeState() });
  lastSnapshotAt = performance.now();
}

function sendFullSnapshot(requestId) {
  channel.send('snapshot', {
    settings,
    settingsRevision,
    runtime: runtimeState(),
    requestId,
  });
  lastSnapshotAt = performance.now();
}

let lastStatus = '';

function setStatus(message) {
  lastStatus = message;
  audienceStatus.textContent = message;
}

function stopCamera() {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }
  cameraState = 'offline';
}

async function tryEnableAudio() {
  try {
    audioReady = await audio.enable();
  } catch (error) {
    console.warn('Audio enable failed:', error);
    audioReady = false;
  }
  return audioReady;
}

function persistSelectedCamera() {
  try {
    if (selectedCameraDeviceId) {
      localStorage.setItem(CAMERA_DEVICE_STORAGE_KEY, selectedCameraDeviceId);
    } else {
      localStorage.removeItem(CAMERA_DEVICE_STORAGE_KEY);
    }
  } catch (error) {
    /* ignore storage errors */
  }
}

async function populateCameraDevices() {
  if (!cameraSelect || !navigator.mediaDevices?.enumerateDevices) return;
  let devices = [];
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch (error) {
    console.warn('Unable to enumerate media devices:', error);
    return;
  }
  const cameras = devices.filter((device) => device.kind === 'videoinput');
  const previousValue = cameraSelect.value;
  cameraSelect.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Front camera (default)';
  cameraSelect.appendChild(defaultOption);
  cameras.forEach((camera, index) => {
    const option = document.createElement('option');
    option.value = camera.deviceId;
    option.textContent = camera.label || `Camera ${index + 1}`;
    cameraSelect.appendChild(option);
  });
  const desired = selectedCameraDeviceId || previousValue || '';
  const hasDesired = Array.from(cameraSelect.options).some((option) => option.value === desired);
  cameraSelect.value = hasDesired ? desired : '';
  if (!hasDesired && selectedCameraDeviceId) {
    // Previously selected camera is no longer available.
    selectedCameraDeviceId = '';
    persistSelectedCamera();
  }
}

async function startCamera({ remote = false } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus('This browser does not support webcam access.');
    channel.send('runtime-error', { message: lastStatus });
    return;
  }
  if (remote) {
    pendingCameraStart = true;
    setStatus('Operator requested camera start. Click Start camera in this tab.');
    return;
  }
  try {
    stopCamera();
    const videoConstraints = { width: 1280, height: 720 };
    if (selectedCameraDeviceId) {
      videoConstraints.deviceId = { exact: selectedCameraDeviceId };
    } else {
      videoConstraints.facingMode = 'user';
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    // Labels are only exposed after permission is granted — refresh the list now.
    populateCameraDevices();
    const activeTrack = stream.getVideoTracks()[0];
    const activeDeviceId = activeTrack?.getSettings?.().deviceId;
    if (activeDeviceId && activeDeviceId !== selectedCameraDeviceId) {
      selectedCameraDeviceId = activeDeviceId;
      persistSelectedCamera();
      if (cameraSelect) cameraSelect.value = activeDeviceId;
    }
    activeTrack?.addEventListener('ended', () => {
      cameraState = 'offline';
      setStatus('The webcam stopped. Start it again or switch to demo mode.');
      sendRuntimeHeartbeat();
    });
    await tryEnableAudio();
    cameraState = 'live';
    mode = 'camera';
    pendingCameraStart = false;
    pendingDemoStart = false;
    game.start();
    startupPanel.classList.add('hidden');
    setStatus('Camera live. The audience can steer with the configured target color.');
    sendRuntimeHeartbeat();
  } catch (error) {
    console.error('Unable to start webcam:', error);
    cameraState = 'denied';
    setStatus('Camera access failed. Allow access in this tab or use demo mode.');
    channel.send('runtime-error', { message: lastStatus });
    sendRuntimeHeartbeat();
  }
}

async function startDemo({ remote = false } = {}) {
  if (remote && !audioReady && audio.context === null) {
    pendingDemoStart = true;
    setStatus('Operator requested demo mode. Click Use demo mode in this tab.');
    return;
  }
  stopCamera();
  await tryEnableAudio();
  mode = 'demo';
  pendingCameraStart = false;
  pendingDemoStart = false;
  game.start();
  startupPanel.classList.add('hidden');
  setStatus('Demo mode active. Use the operator crowd controls to steer the paddle.');
  sendRuntimeHeartbeat();
}

function handleCommand(command) {
  const handlers = {
    'start-camera': () => startCamera({ remote: true }),
    'start-demo': () => startDemo({ remote: true }),
    'toggle-pause': () => game.togglePause(),
    'reset-ball': () => game.resetBall(),
    'reset-board': () => game.resetBoard(),
    'reset-score': () => game.resetScore(),
  };
  if (!handlers[command]) {
    throw new Error(`Unknown command: ${command}`);
  }
  handlers[command]();
  setTimeout(sendRuntimeHeartbeat, 0);
}

const channel = createGameChannel('audience', (message) => {
  if (message.role !== 'operator') {
    return;
  }
  try {
    if (message.type === 'hello' || message.type === 'request-snapshot') {
      sendFullSnapshot(message.id);
    } else if (message.type === 'settings-update') {
      const revision = message.payload.settingsRevision;
      if (typeof revision === 'number' && revision <= settingsRevision) {
        channel.send('rejected', { requestId: message.id, message: 'Stale settings revision ignored.' });
        return;
      }
      applySettings(message.payload.settings, revision);
      channel.send('ack', { requestId: message.id, kind: 'settings', settingsRevision });
      sendRuntimeHeartbeat();
    } else if (message.type === 'command') {
      handleCommand(message.payload.command);
      channel.send('ack', { requestId: message.id, kind: 'command' });
    }
  } catch (error) {
    console.error('Audience message failed:', error);
    channel.send('rejected', { requestId: message.id, message: error.message });
  }
});

function animate(timestamp) {
  const delta = Math.min((timestamp - (lastTimestamp || timestamp)) / 1000, 0.05);
  lastTimestamp = timestamp;
  crowd.update(delta);
  const cameraSimulatedCounts = mode === 'demo' ? crowd.detectionCounts() : { left: 0, right: 0 };
  latestVision = vision.detect(activeSource(), settings, sourceReady(), cameraSimulatedCounts);
  if (game.running && !game.paused) {
    game.setPaddleControl(latestVision);
    game.update(delta, Date.now());
  }
  renderer.draw(game, crowd, settings, activeSource(), sourceReady(), latestVision, game.paddleIntent(), delta);
  renderer.drawCameraPanels(
    video, mode === 'camera' && sourceReady() && video.readyState >= 2,
    settings.appearance.mirrorWebcam,
  );
  playState.textContent = !game.running ? 'ready' : game.paused ? 'paused' : game.missResetAt ? 'next ball' : 'playing';
  const strengthLabel = game.strengthSeconds > 0 ? `strength // ${Math.ceil(game.strengthSeconds)}s` : '';
  if (powerStatus.textContent !== strengthLabel) powerStatus.textContent = strengthLabel;
  powerStatus.hidden = !strengthLabel;
  requestAnimationFrame(animate);
}

startCameraButton.addEventListener('click', () => {
  // Kick off audio enable synchronously so the AudioContext is created/
  // resumed while the click's user activation is still fresh, before
  // getUserMedia() and video.play() consume it on strict browsers.
  tryEnableAudio();
  startCamera();
});
startDemoButton.addEventListener('click', () => {
  tryEnableAudio();
  startDemo();
});
cameraSelect?.addEventListener('change', () => {
  selectedCameraDeviceId = cameraSelect.value || '';
  persistSelectedCamera();
});
if (navigator.mediaDevices?.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    populateCameraDevices();
  });
}
populateCameraDevices();
document.addEventListener('visibilitychange', () => {
  lastTimestamp = 0;
});
window.addEventListener('beforeunload', () => {
  stopCamera();
  channel.close();
});

applySettings(settings);
game.createBricks();
game.resetBall();
channel.send('audience-ready', {
  settings,
  settingsRevision,
  runtime: runtimeState(),
});
requestAnimationFrame(animate);

// setInterval heartbeat guarantees delivery even when rAF is throttled (hidden tab).
setInterval(() => {
  sendRuntimeHeartbeat();
}, 500);
