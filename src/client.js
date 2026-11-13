import { CONFIG, getBaseUrl, getAuthHeader } from './config.js';
import { getActivePassword, ensureServerRunning } from './server-manager.js';
import { eventStream } from './event-stream.js';

export const FREE_FALLBACK_CHAIN = [
  'opencode/nemotron-3.5-lightning-free',
  'opencode/nemotron-3.5-super-vl-free',
  'opencode/deepseek-v4.1-flash-free',
  'opencode/glm-5.3-flash-free'
];

export function getNextFallbackModel(currentModel) {
  const idx = FREE_FALLBACK_CHAIN.indexOf(currentModel);
  if (idx !== -1 && idx + 1 < FREE_FALLBACK_CHAIN.length) {
    return FREE_FALLBACK_CHAIN[idx + 1];
  }
  return null;
}

export function isRecoverableModelError(err) {
  if (!err) return false;
  const msg = (typeof err === 'string' ? err : (err.message || '')).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('ratelimit') ||
    msg.includes('too many requests') ||
    msg.includes('quota') ||
    msg.includes('overloaded') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('504') ||
    msg.includes('resource exhausted') ||
    msg.includes('temporarily unavailable')
  );
}

class OpenCodeClient {
  constructor() {
    this.baseUrl = getBaseUrl();
  }

  getHeaders() {
    return {
      Authorization: getAuthHeader(getActivePassword()),
      'Content-Type': 'application/json'
    };
  }

  async request(path, options = {}) {
    await ensureServerRunning();
    const url = `${this.baseUrl}${path}`;
    const headers = {
      ...this.getHeaders(),
      ...(options.headers || {})
    };

    const res = await fetch(url, {
      ...options,
      headers
    });

    if (!res.ok) {
      let errorBody = '';
      try {
        errorBody = await res.text();
      } catch {
        errorBody = res.statusText;
      }
      throw new Error(`OpenCode API error [${res.status} ${options.method || 'GET'} ${path}]: ${errorBody}`);
    }

    const json = await res.json();
    return json.data !== undefined ? json.data : json;
  }

  async listModels(options = {}) {
    const { provider = 'all', freeOnly = false, search = '' } = options;
    const rawModels = await this.request('/api/model');

    let models = Array.isArray(rawModels) ? rawModels : [];

    if (provider !== 'all') {
      models = models.filter((m) => m.providerID === provider);
    }

    if (freeOnly) {
      models = models.filter((m) => 
        (m.id && m.id.toLowerCase().includes('free')) ||
        (m.cost && m.cost.input === 0 && m.cost.output === 0)
      );
    }

    if (search) {
      const q = search.toLowerCase();
      models = models.filter((m) => 
        (m.id && m.id.toLowerCase().includes(q)) ||
        (m.name && m.name.toLowerCase().includes(q))
      );
    }

    return models.map((m) => ({
      id: m.id,
      providerID: m.providerID,
      name: m.name || m.id,
      isFree: m.id.toLowerCase().includes('free') || m.providerID === 'opencode',
      contextWindow: m.contextWindow || null
    }));
  }

  async createSession(options = {}) {
    const { title = 'openbridge-task', model = CONFIG.defaultModel, directory = null } = options;
    const body = {
      title
    };

    if (directory) {
      body.location = { directory };
    }

    if (model) {
      if (model.startsWith('openrouter/')) {
        body.model = {
          providerID: 'openrouter',
          id: model.slice('openrouter/'.length)
        };
      } else {
        const parts = model.split('/');
        if (parts.length === 2) {
          body.model = {
            providerID: parts[0],
            id: parts[1]
          };
        } else {
          body.model = {
            providerID: 'opencode',
            id: model
          };
        }
      }
    }

    const session = await this.request('/api/session', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    return session.id || session;
  }

  async sendPrompt(sessionID, text) {
    const res = await this.request(`/api/session/${sessionID}/prompt`, {
      method: 'POST',
      body: JSON.stringify({ text })
    });
    return res;
  }

  async getSessionMessages(sessionID) {
    return this.request(`/api/session/${sessionID}/message`);
  }

  async getSessionDiff(sessionID) {
    try {
      return await this.request(`/api/session/${sessionID}/diff`);
    } catch {
      return [];
    }
  }

  async interruptSession(sessionID) {
    try {
      return await this.request(`/api/session/${sessionID}/interrupt`, { method: 'POST' });
    } catch {
      return null;
    }
  }

  /**
   * Resuelve la finalización de la sesión basándose en una estrategia Dual-Track:
   * 1. Reactivo instantáneo vía SSE (eventStream) con latencia <50ms.
   * 2. Sondeo determinista de respaldo (session.time.idle >= session.time.busy).
   */
  async waitForCompletion(sessionID, timeoutMs = 600000) {
    const startTime = Date.now();

    // Vía 1: Reactiva mediante SSE
    const ssePromise = new Promise((resolve) => {
      const handler = (evt) => {
        const type = evt?.type || '';
        if (type.includes('idle') || type.includes('succeeded') || evt?.data?.outcome) {
          eventStream.off(`session:${sessionID}`, handler);
          resolve({ source: 'sse', data: evt });
        }
      };
      eventStream.on(`session:${sessionID}`, handler);
      setTimeout(() => eventStream.off(`session:${sessionID}`, handler), timeoutMs);
    });

    // Vía 2: Sondeo determinista de respaldo
    const pollPromise = (async () => {
      let interval = 500;
      while (Date.now() - startTime < timeoutMs) {
        await new Promise((r) => setTimeout(r, interval));
        if (interval < 2000) interval += 250;

        try {
          const session = await this.request(`/api/session/${sessionID}`);
          if (session.time?.idle && (!session.time.busy || session.time.idle >= session.time.busy)) {
            return { source: 'poll', session };
          }
        } catch {
          // Error transitorio tolerado
        }
      }
      throw new Error(`Timeout de espera tras ${timeoutMs}ms para sesión ${sessionID}`);
    })();

    // El primero que certifique la finalización libera el flujo
    await Promise.race([ssePromise, pollPromise]);

    // Recolectar mensajes finales y diffs una sola vez al completarse
    const rawMessages = await this.getSessionMessages(sessionID);
    const messages = Array.isArray(rawMessages) ? rawMessages : (rawMessages.data || []);
    const assistantMsgs = messages.filter((m) => m.type === 'assistant');
    const idleMsg = messages.find((m) => m.type === 'idle');

    let fullText = '';
    let totalTokens = { input: 0, output: 0, reasoning: 0 };
    let modelUsed = null;

    for (const msg of assistantMsgs) {
      if (msg.model) modelUsed = msg.model;
      if (msg.tokens) {
        totalTokens.input += msg.tokens.input || 0;
        totalTokens.output += msg.tokens.output || 0;
        totalTokens.reasoning += msg.tokens.reasoning || 0;
      }
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            fullText += (fullText ? '\n\n' : '') + block.text;
          }
        }
      }
    }

    const diffs = await this.getSessionDiff(sessionID);

    return {
      sessionID,
      outcome: idleMsg?.outcome || 'succeeded',
      status: 'completed',
      model: modelUsed,
      text: fullText,
      tokens: totalTokens,
      cost: 0,
      diffs,
      durationMs: Date.now() - startTime
    };
  }
}

export const client = new OpenCodeClient();
