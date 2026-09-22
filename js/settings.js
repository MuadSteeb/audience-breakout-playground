import {
  DEFAULT_SETTINGS,
  PRESETS_STORAGE_KEY,
  SCHEMA_VERSION,
  SETTINGS_STORAGE_KEY,
} from './defaults.js';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const RULES = {
  'appearance.title': { type: 'string', maxLength: 80 },
  'appearance.eyebrow': { type: 'string', maxLength: 80 },
  'appearance.message': { type: 'string', maxLength: 160 },
  'appearance.showScore': { type: 'boolean' },
  'appearance.showMessage': { type: 'boolean' },
  'appearance.showWebcam': { type: 'boolean' },
  'appearance.mirrorWebcam': { type: 'boolean' },
  'appearance.showCrowd': { type: 'boolean' },
  'appearance.showBricks': { type: 'boolean' },
  'appearance.showPaddle': { type: 'boolean' },
  'appearance.showBall': { type: 'boolean' },
  'appearance.showDiagnostics': { type: 'boolean' },
  'appearance.showLightOverlay': { type: 'boolean' },
  'appearance.ballColor': { type: 'color' },
  'appearance.paddleColor': { type: 'color' },
  'appearance.stageColor': { type: 'color' },
  'appearance.textColor': { type: 'color' },
  'appearance.brickLowColor': { type: 'color' },
  'appearance.brickHighColor': { type: 'color' },
  'appearance.webcamOpacity': { type: 'number', min: 0, max: 1 },
  'audio.muted': { type: 'boolean' },
  'audio.volume': { type: 'number', min: 0, max: 1 },
  'physics.ballSpeed': { type: 'number', min: 60, max: 600 },
  'physics.speedUp': { type: 'number', min: 1, max: 1.15 },
  'physics.timeScale': { type: 'number', min: 0.1, max: 2 },
  'physics.ballSize': { type: 'number', min: 8, max: 60 },
  'physics.paddleSpeed': { type: 'number', min: 60, max: 1400 },
  'physics.paddleWidth': { type: 'number', min: 60, max: 360 },
  'physics.paddleHeight': { type: 'number', min: 8, max: 48 },
  'vision.targetColor': { type: 'color' },
  'vision.tolerance': { type: 'number', min: 10, max: 255 },
  'vision.minimumStrength': { type: 'number', min: 0, max: 255 },
  'vision.deadZone': { type: 'number', min: 0, max: 0.8 },
  'vision.sensitivity': { type: 'number', min: 0.1, max: 4 },
  'vision.sampleStride': { type: 'integer', min: 1, max: 12 },
  'vision.perspectiveGain': { type: 'number', min: 0, max: 4 },
  'vision.sideBias': { type: 'integer', min: -200, max: 200 },
  'vision.controlMode': { type: 'enum', values: ['edge', 'proportional'] },
  'crowd.enabled': { type: 'boolean' },
  'crowd.leftCount': { type: 'integer', min: 0, max: 300 },
  'crowd.rightCount': { type: 'integer', min: 0, max: 300 },
  'crowd.color': { type: 'color' },
  'crowd.blockSize': { type: 'number', min: 2, max: 24 },
  'crowd.minimumOpacity': { type: 'number', min: 0.05, max: 1 },
  'crowd.maximumOpacity': { type: 'number', min: 0.05, max: 1 },
  'crowd.jitter': { type: 'number', min: 0, max: 40 },
  'manualControl.enabled': { type: 'boolean' },
  'manualControl.position': { type: 'number', min: 0, max: 100 },
};

export function cloneSettings(settings = DEFAULT_SETTINGS) {
  return JSON.parse(JSON.stringify(settings));
}

export function getPath(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object);
}

export function setPath(object, path, value) {
  const keys = path.split('.');
  const finalKey = keys.pop();
  const target = keys.reduce((current, key) => current[key], object);
  target[finalKey] = value;
}

function normalizeValue(value, rule, fallback) {
  if (rule.type === 'boolean') {
    return typeof value === 'boolean' ? value : fallback;
  }

  if (rule.type === 'string') {
    return typeof value === 'string' ? value.slice(0, rule.maxLength) : fallback;
  }

  if (rule.type === 'color') {
    return typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : fallback;
  }

  if (rule.type === 'enum') {
    return typeof value === 'string' && rule.values.includes(value) ? value : fallback;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  const clamped = Math.min(Math.max(numericValue, rule.min), rule.max);
  return rule.type === 'integer' ? Math.round(clamped) : clamped;
}

function migrateSettings(candidate) {
  if (!candidate || !Number.isInteger(candidate.schemaVersion) || candidate.schemaVersion >= 2) {
    return candidate;
  }
  const migrated = cloneSettings(candidate);
  // Upgrade the old built-in look without replacing customized colors or control settings.
  const oldDefaults = {
    'appearance.title': 'Breakout Vision',
    'appearance.eyebrow': 'Computer vision demo',
    'appearance.showWebcam': true,
    'appearance.ballColor': '#f6fff8',
    'appearance.paddleColor': '#d2ff6c',
    'appearance.stageColor': '#0a120e',
    'appearance.textColor': '#f0f6fc',
    'appearance.brickLowColor': '#20112d',
    'appearance.brickHighColor': '#b392ff',
    'appearance.webcamOpacity': 0.3,
    'physics.ballSize': 24,
    'physics.paddleWidth': 168,
    'physics.paddleHeight': 18,
  };
  for (const [path, previous] of Object.entries(oldDefaults)) {
    if (getPath(migrated, path) === previous) {
      setPath(migrated, path, getPath(DEFAULT_SETTINGS, path));
    }
  }
  return migrated;
}

export function normalizeSettings(candidate) {
  const source = migrateSettings(candidate);
  const settings = cloneSettings();
  for (const [path, rule] of Object.entries(RULES)) {
    setPath(settings, path, normalizeValue(getPath(source, path), rule, getPath(settings, path)));
  }
  settings.schemaVersion = SCHEMA_VERSION;
  if (settings.crowd.minimumOpacity > settings.crowd.maximumOpacity) {
    [settings.crowd.minimumOpacity, settings.crowd.maximumOpacity] = [
      settings.crowd.maximumOpacity,
      settings.crowd.minimumOpacity,
    ];
  }
  return settings;
}

export function applySetting(settings, path, value) {
  const rule = RULES[path];
  if (!rule) {
    throw new Error(`Unknown setting: ${path}`);
  }
  const next = cloneSettings(settings);
  setPath(next, path, normalizeValue(value, rule, getPath(next, path)));
  return normalizeSettings(next);
}

export function isKnownSetting(path) {
  return Object.hasOwn(RULES, path);
}

export function loadSettings(storage = globalThis.localStorage) {
  try {
    const stored = storage?.getItem(SETTINGS_STORAGE_KEY);
    return stored ? normalizeSettings(JSON.parse(stored)) : cloneSettings();
  } catch (error) {
    console.error('Unable to load settings:', error);
    return cloneSettings();
  }
}

export function saveSettings(settings, storage = globalThis.localStorage) {
  try {
    storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
    return true;
  } catch (error) {
    console.error('Unable to save settings:', error);
    return false;
  }
}

export function loadPresets(storage = globalThis.localStorage) {
  try {
    const stored = JSON.parse(storage?.getItem(PRESETS_STORAGE_KEY) || '{}');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(stored)
        .filter(([name]) => typeof name === 'string' && name.trim())
        .map(([name, settings]) => [name.slice(0, 80), normalizeSettings(settings)]),
    );
  } catch (error) {
    console.error('Unable to load presets:', error);
    return {};
  }
}

export function savePresets(presets, storage = globalThis.localStorage) {
  try {
    storage?.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
    return true;
  } catch (error) {
    console.error('Unable to save presets:', error);
    return false;
  }
}

export function parsePresetDocument(text) {
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }
  if (!document || typeof document.schemaVersion !== 'number' || document.schemaVersion > SCHEMA_VERSION || !document.settings) {
    throw new Error(`Preset must use schema version ${SCHEMA_VERSION} or older.`);
  }
  return {
    name: typeof document.name === 'string' ? document.name.slice(0, 80) : 'Imported preset',
    settings: normalizeSettings(document.settings),
  };
}

export function createPresetDocument(name, settings) {
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    settings: normalizeSettings(settings),
  };
}
