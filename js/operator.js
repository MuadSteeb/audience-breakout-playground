import { createGameChannel } from './channel.js';
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from './defaults.js';
import {
  applySetting,
  cloneSettings,
  createPresetDocument,
  getPath,
  loadPresets,
  loadSettings,
  normalizeSettings,
  parsePresetDocument,
  savePresets,
  saveSettings,
} from './settings.js';

const form = document.querySelector('#operatorForm');
const connectionDot = document.querySelector('#connectionDot');
const connectionLabel = document.querySelector('#connectionLabel');
const runtimeStatus = document.querySelector('#runtimeStatus');
const gameStateEl = document.querySelector('#gameState');
const cameraStateEl = document.querySelector('#cameraState');
const operatorScore = document.querySelector('#operatorScore');
const visionCounts = document.querySelector('#visionCounts');
const visionBias = document.querySelector('#visionBias');
const presetName = document.querySelector('#presetName');
const presetSelect = document.querySelector('#presetSelect');
const formMessage = document.querySelector('#formMessage');
const importPresetInput = document.querySelector('#importPresetInput');

let settings = loadSettings();
let presets = loadPresets();
let lastAudienceAt = 0;
let updateHandle = null;
let localRevision = 1;
let audienceRevision = 0;
let lastLocalEditAt = 0;

function setMessage(message, isError = false) {
  formMessage.textContent = message;
  formMessage.classList.toggle('error', isError);
}

function refreshOutputs() {
  document.querySelectorAll('[data-output]').forEach((label) => {
    const path = label.dataset.output;
    label.querySelector('output').textContent = String(getPath(settings, path));
  });
}

function populateForm({ skipActive = true } = {}) {
  const active = document.activeElement;
  for (const input of form.elements) {
    if (!input.name || !input.name.includes('.')) {
      continue;
    }
    if (skipActive && input === active) {
      continue;
    }
    const value = getPath(settings, input.name);
    if (input.type === 'checkbox') {
      input.checked = value;
    } else if (input.value !== String(value)) {
      input.value = value;
    }
  }
  refreshOutputs();
  syncModeAwareControls();
}

function syncModeAwareControls() {
  const proportional = settings.vision.controlMode === 'proportional';
  for (const input of form.elements) {
    if (input.name === 'vision.deadZone') {
      input.disabled = proportional;
      const label = input.closest('label');
      if (label) {
        label.classList.toggle('is-disabled', proportional);
      }
    }
  }
  const sensitivityHint = document.querySelector('#sensitivityHint');
  if (sensitivityHint) {
    sensitivityHint.textContent = proportional
      ? 'Proportional mode: sensitivity scales the paddle\u2019s target displacement.'
      : 'Edge mode: sensitivity scales how fast the paddle drives to the far wall.';
  }
}

function refreshPresets() {
  const selected = presetSelect.value;
  const names = Object.keys(presets).sort((a, b) => a.localeCompare(b));
  presetSelect.replaceChildren();
  if (!names.length) {
    presetSelect.add(new Option('No saved presets', ''));
    return;
  }
  presetSelect.add(new Option('Choose a preset', ''));
  for (const name of names) {
    presetSelect.add(new Option(name, name));
  }
  if (names.includes(selected)) {
    presetSelect.value = selected;
  }
}

function flushSettingsUpdate() {
  updateHandle = null;
  channel.send('settings-update', { settings, settingsRevision: localRevision });
}

function queueSettingsUpdate() {
  saveSettings(settings);
  lastLocalEditAt = Date.now();
  if (updateHandle !== null) {
    return;
  }
  updateHandle = setTimeout(flushSettingsUpdate, 16);
}

function replaceSettings(nextSettings, message) {
  settings = normalizeSettings(nextSettings);
  localRevision += 1;
  populateForm({ skipActive: false });
  queueSettingsUpdate();
  if (message) {
    setMessage(message);
  }
}

function updateConnection() {
  const connected = Date.now() - lastAudienceAt < 2200;
  connectionDot.classList.toggle('connected', connected);
  connectionLabel.textContent = connected ? 'Audience connected' : 'Waiting for audience';
  document.querySelectorAll('.audience-command').forEach((button) => {
    button.disabled = !connected;
  });
}

function updateRuntime(runtime) {
  lastAudienceAt = Date.now();
  updateConnection();
  if (!runtime) {
    return;
  }
  gameStateEl.textContent = !runtime.running ? 'Stopped' : runtime.paused ? 'Paused' : 'Running';
  cameraStateEl.textContent = runtime.cameraState || 'Offline';
  operatorScore.textContent = String(runtime.score ?? 0);
  visionCounts.textContent = `${runtime.vision?.left ?? 0} / ${runtime.vision?.right ?? 0}`;
  visionBias.textContent = `${Math.round((runtime.vision?.bias ?? 0) * 100)}%`;
  runtimeStatus.textContent = `Last update ${new Date().toLocaleTimeString()}`;
  if (typeof runtime.settingsRevision === 'number' && runtime.settingsRevision > audienceRevision) {
    audienceRevision = runtime.settingsRevision;
  }
}

const EDIT_LOCKOUT_MS = 750;

function shouldAcceptRemoteSettings(revision) {
  if (typeof revision !== 'number') {
    return false;
  }
  if (revision <= audienceRevision) {
    return false;
  }
  if (Date.now() - lastLocalEditAt < EDIT_LOCKOUT_MS) {
    return false;
  }
  return true;
}

const channel = createGameChannel('operator', (message) => {
  if (message.role !== 'audience') {
    return;
  }
  if (message.type === 'runtime') {
    updateRuntime(message.payload.runtime);
    return;
  }
  if (message.type === 'snapshot' || message.type === 'audience-ready') {
    const revision = message.payload.settingsRevision;
    if (message.payload.settings && shouldAcceptRemoteSettings(revision)) {
      settings = normalizeSettings(message.payload.settings);
      saveSettings(settings);
      localRevision = revision;
      audienceRevision = revision;
      populateForm();
    } else if (typeof revision === 'number' && revision > audienceRevision) {
      audienceRevision = revision;
    }
    updateRuntime(message.payload.runtime);
    return;
  }
  if (message.type === 'ack' && message.payload?.kind === 'settings') {
    audienceRevision = message.payload.settingsRevision ?? audienceRevision;
    return;
  }
  if (message.type === 'rejected' || message.type === 'runtime-error') {
    setMessage(message.payload.message || 'Audience rejected the request.', true);
  }
});

form.addEventListener('input', (event) => {
  const input = event.target;
  if (!input.name || !input.name.includes('.')) {
    return;
  }
  try {
    const value = input.type === 'checkbox'
      ? input.checked
      : input.type === 'range' || input.type === 'number'
        ? Number(input.value)
        : input.value;
    settings = applySetting(settings, input.name, value);
    localRevision += 1;
    populateForm();
    queueSettingsUpdate();
    setMessage('');
  } catch (error) {
    setMessage(error.message, true);
  }
});

document.querySelectorAll('[data-command]').forEach((button) => {
  button.addEventListener('click', () => {
    channel.send('command', { command: button.dataset.command });
  });
});

document.querySelector('#resetDefaultsButton').addEventListener('click', () => {
  replaceSettings(cloneSettings(DEFAULT_SETTINGS), 'Factory defaults restored.');
});

document.querySelector('#savePresetButton').addEventListener('click', () => {
  const name = presetName.value.trim();
  if (!name) {
    setMessage('Enter a preset name before saving.', true);
    return;
  }
  presets[name.slice(0, 80)] = normalizeSettings(settings);
  if (!savePresets(presets)) {
    setMessage('Unable to save preset locally.', true);
    return;
  }
  refreshPresets();
  presetSelect.value = name.slice(0, 80);
  setMessage(`Saved preset "${name.slice(0, 80)}".`);
});

document.querySelector('#loadPresetButton').addEventListener('click', () => {
  const selected = presetSelect.value;
  if (!selected || !presets[selected]) {
    setMessage('Choose a preset to load.', true);
    return;
  }
  replaceSettings(presets[selected], `Loaded preset "${selected}".`);
  presetName.value = selected;
});

document.querySelector('#renamePresetButton').addEventListener('click', () => {
  const selected = presetSelect.value;
  const nextName = presetName.value.trim().slice(0, 80);
  if (!selected || !presets[selected]) {
    setMessage('Choose a preset to rename.', true);
    return;
  }
  if (!nextName) {
    setMessage('Enter the new preset name.', true);
    return;
  }
  if (nextName !== selected && presets[nextName]) {
    setMessage(`A preset named "${nextName}" already exists.`, true);
    return;
  }
  presets[nextName] = presets[selected];
  if (nextName !== selected) {
    delete presets[selected];
  }
  savePresets(presets);
  refreshPresets();
  presetSelect.value = nextName;
  setMessage(`Renamed preset to "${nextName}".`);
});

document.querySelector('#deletePresetButton').addEventListener('click', () => {
  const selected = presetSelect.value;
  if (!selected || !presets[selected]) {
    setMessage('Choose a preset to delete.', true);
    return;
  }
  delete presets[selected];
  savePresets(presets);
  refreshPresets();
  presetName.value = '';
  setMessage(`Deleted preset "${selected}".`);
});

document.querySelector('#exportPresetButton').addEventListener('click', () => {
  const name = presetName.value.trim() || presetSelect.value || 'Audience Breakout preset';
  const documentData = createPresetDocument(name, settings);
  const blob = new Blob([JSON.stringify(documentData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'preset'}.json`;
  link.click();
  URL.revokeObjectURL(url);
  setMessage(`Exported schema ${SCHEMA_VERSION} preset.`);
});

importPresetInput.addEventListener('change', async () => {
  const [file] = importPresetInput.files;
  if (!file) {
    return;
  }
  try {
    const imported = parsePresetDocument(await file.text());
    presets[imported.name] = imported.settings;
    savePresets(presets);
    refreshPresets();
    presetSelect.value = imported.name;
    presetName.value = imported.name;
    replaceSettings(imported.settings, `Imported preset "${imported.name}".`);
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    importPresetInput.value = '';
  }
});

presetSelect.addEventListener('change', () => {
  if (presetSelect.value) {
    presetName.value = presetSelect.value;
  }
});

window.addEventListener('beforeunload', () => channel.close());
populateForm({ skipActive: false });
refreshPresets();
updateConnection();
channel.send('hello', { settings });
setInterval(() => {
  channel.send('request-snapshot');
  updateConnection();
}, 1500);
