import { CHANNEL_NAME, FALLBACK_MESSAGE_KEY } from './defaults.js';

function createId(cryptoApi) {
  return cryptoApi?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createGameChannel(role, onMessage, environment = globalThis) {
  const {
    BroadcastChannel: BroadcastChannelApi,
    crypto: cryptoApi,
    localStorage: storage,
  } = environment;
  const sourceId = createId(cryptoApi);
  let broadcastChannel = null;
  if (BroadcastChannelApi) {
    try {
      broadcastChannel = new BroadcastChannelApi(CHANNEL_NAME);
    } catch (error) {
      console.warn('BroadcastChannel unavailable; using storage events instead.', error);
    }
  }

  const receive = (message) => {
    if (!message || message.sourceId === sourceId || !message.type) {
      return;
    }
    onMessage(message);
  };

  if (broadcastChannel) {
    broadcastChannel.addEventListener('message', (event) => receive(event.data));
  }

  const storageListener = (event) => {
    if (event.key !== FALLBACK_MESSAGE_KEY || !event.newValue) {
      return;
    }
    try {
      receive(JSON.parse(event.newValue));
    } catch (error) {
      console.error('Unable to read fallback channel message:', error);
    }
  };
  environment.addEventListener?.('storage', storageListener);

  const send = (type, payload = {}) => {
    const message = {
      id: createId(cryptoApi),
      sourceId,
      role,
      type,
      payload,
      sentAt: Date.now(),
    };
    if (broadcastChannel) {
      broadcastChannel.postMessage(message);
    } else if (storage) {
      try {
        storage.setItem(FALLBACK_MESSAGE_KEY, JSON.stringify(message));
      } catch (error) {
        console.error('Unable to send fallback channel message:', error);
      }
    }
    return message.id;
  };

  const close = () => {
    broadcastChannel?.close();
    environment.removeEventListener?.('storage', storageListener);
  };

  return { sourceId, send, close };
}
