import { CONFIG, getBaseUrl, getAuthHeader } from './config.js';
import { getActivePassword, ensureServerRunning } from './server-manager.js';
import { eventStream } from './event-stream.js';

const MODEL_HEALTH = new Map();
const COOLDOWN_DURATION_MS = parseInt(process.env.OPENBRIDGE_CIRCUIT_BREAKER_MS || '60000', 10);
const MAX_FAILURES_BEFORE_COOLDOWN = 2;

/**
 * Normaliza identificadores de modelo con y sin prefijo de proveedor
 * (ej. "provider/model-id" <-> "model-id") para que los éxitos y fallos
 * reportados por OpenCode actualicen la misma entrada en MODEL_HEALTH.
 */
function resolveHealthKeys(model, customChain = CONFIG.fallbackModels) {
  if (!model) return [];
  const keys = new Set([model]);
  const slashIdx = model.indexOf('/');
  if (slashIdx > 0) {
    keys.add(model.slice(slashIdx + 1));
  } else {
    for (const candidate of [...(customChain || []), ...MODEL_HEALTH.keys()]) {
      if (candidate.endsWith('/' + model)) {
        keys.add(candidate);
      }
    }
  }
  return Array.from(keys);
}

export function recordModelFailure(model, isRecoverable = true, customChain = CONFIG.fallbackModels) {
  if (!model || !isRecoverable) return;
  const keys = resolveHealthKeys(model, customChain);
  let cooledDown = false;
  let lastCooldownUntil = 0;
  for (const key of keys) {
    const health = MODEL_HEALTH.get(key) || { consecutiveFailures: 0, cooldownUntil: 0 };
    health.consecutiveFailures += 1;
    if (health.consecutiveFailures >= MAX_FAILURES_BEFORE_COOLDOWN) {
      health.cooldownUntil = Date.now() + COOLDOWN_DURATION_MS;
      cooledDown = true;
      lastCooldownUntil = health.cooldownUntil;
    }
    MODEL_HEALTH.set(key, health);
  }
  if (cooledDown) {
    console.warn(
      `[Circuit Breaker] Modelo ${model} en enfriamiento hasta ${new Date(lastCooldownUntil).toISOString()} tras ${MAX_FAILURES_BEFORE_COOLDOWN} fallos.`
    );
  }
}

export function recordModelSuccess(model, customChain = CONFIG.fallbackModels) {
  if (!model) return;
  for (const key of resolveHealthKeys(model, customChain)) {
    const health = MODEL_HEALTH.get(key);
    if (health) {
      health.consecutiveFailures = 0;
      health.cooldownUntil = 0;
    }
  }
}

export function isModelInCooldown(model) {
  if (!model) return false;
  const health = MODEL_HEALTH.get(model);
  if (!health || !health.cooldownUntil) return false;
  if (Date.now() >= health.cooldownUntil) {
    health.cooldownUntil = 0;
    health.consecutiveFailures = 0;
    return false;
  }
  return true;
}

export function clearModelHealth() {
  MODEL_HEALTH.clear();
}

/**
 * Resuelve el siguiente modelo únicamente si existe una lista explícita de respaldo
 * (parámetro `fallback_models` o `OPENBRIDGE_FALLBACK_MODELS`). Sin lista, retorna null.
 */
export function getNextFallbackModel(currentModel, customChain = CONFIG.fallbackModels) {
  const chain = Array.isArray(customChain) && customChain.length > 0 ? customChain : CONFIG.fallbackModels;
  if (!chain || chain.length === 0) return null;

  const idx = currentModel ? chain.indexOf(currentModel) : -1;
  const candidates =
    idx !== -1 ? chain.slice(idx + 1) : chain.filter((m) => m !== currentModel);

  if (candidates.length === 0) return null;

  for (const candidate of candidates) {
    if (!isModelInCooldown(candidate)) {
      return candidate;
    }
  }

  return candidates[0] || null;
}

export function getModelHealthMap() {
  const result = {};
  for (const [model, health] of MODEL_HEALTH.entries()) {
    result[model] = {
      consecutiveFailures: health.consecutiveFailures,
      inCooldown: isModelInCooldown(model),
      cooldownRemainingMs: Math.max(0, health.cooldownUntil - Date.now())
    };
  }
  return result;
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

    if (provider && provider !== 'all') {
      const targetProvider = provider.toLowerCase();
      models = models.filter((m) => m.providerID && m.providerID.toLowerCase() === targetProvider);
    }

    if (freeOnly) {
      models = models.filter(
        (m) =>
          (m.cost && m.cost.input === 0 && m.cost.output === 0) ||
          Boolean(m.id && m.id.toLowerCase().includes('free'))
      );
    }

    if (search) {
      const q = search.toLowerCase();
      models = models.filter(
        (m) =>
          (m.id && m.id.toLowerCase().includes(q)) ||
          (m.name && m.name.toLowerCase().includes(q)) ||
          (m.providerID && m.providerID.toLowerCase().includes(q))
      );
    }

    return models.map((m) => {
      const isFree =
        (m.cost && m.cost.input === 0 && m.cost.output === 0) ||
        Boolean(m.id && m.id.toLowerCase().includes('free'));
      return {
        id: m.id,
        fullId: m.providerID ? `${m.providerID}/${m.id}` : m.id,
        providerID: m.providerID || null,
        name: m.name || m.id,
        isFree,
        contextWindow: m.contextWindow || null,
        cost: m.cost || null
      };
    });
  }

  async createSession(options = {}) {
    const { title = 'openbridge-task', model = CONFIG.defaultModel, directory = null } = options;
    const body = { title };

    if (directory) {
      body.location = { directory };
    }

    if (model) {
      const slashIdx = model.indexOf('/');
      if (slashIdx > 0) {
        body.model = {
          providerID: model.slice(0, slashIdx),
          id: model.slice(slashIdx + 1)
        };
      } else {
        body.model = { id: model };
      }
    }

    const session = await this.request('/api/session', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    return session.id || session;
  }

  async listSessions(limit = 20) {
    const raw = await this.request('/api/session');
    const sessions = Array.isArray(raw) ? raw : (raw.data || []);

    return sessions
      .slice()
      .sort((a, b) => (b.time?.updated || b.time?.created || 0) - (a.time?.updated || a.time?.created || 0))
      .slice(0, limit)
      .map((s) => {
        const isBusy = Boolean(s.time?.busy && (!s.time.idle || s.time.busy > s.time.idle));
        return {
          id: s.id,
          title: s.title || s.id,
          model: s.model ? (s.model.providerID ? `${s.model.providerID}/${s.model.id}` : s.model.id) : null,
          status: isBusy ? 'busy' : 'idle',
          tokens: s.tokens || null,
          createdAt: s.time?.created ? new Date(s.time.created).toISOString() : null,
          updatedAt: s.time?.updated ? new Date(s.time.updated).toISOString() : null
        };
      });
  }

  async sendPrompt(sessionID, text) {
    return this.request(`/api/session/${sessionID}/prompt`, {
      method: 'POST',
      body: JSON.stringify({ text })
    });
  }

  async getSessionMessages(sessionID) {
    return this.request(`/api/session/${sessionID}/message`);
  }

  async readSessionMessages(sessionID, options = {}) {
    const { limit = 50, includeReasoning = false } = options;
    const [session, rawMessages] = await Promise.all([
      this.request(`/api/session/${sessionID}`),
      this.getSessionMessages(sessionID)
    ]);
    const messages = Array.isArray(rawMessages) ? rawMessages : (rawMessages.data || []);

    const formatted = [];
    for (const m of messages) {
      if (m.type === 'idle') continue;
      let text = '';
      let reasoning = '';
      const tools = [];

      if (typeof m.content === 'string') {
        text = m.content;
      } else if (m.payload?.text) {
        text = m.payload.text;
      } else if (Array.isArray(m.content)) {
        for (const block of m.content) {
          if (block.type === 'text' && block.text) {
            text += (text ? '\n\n' : '') + block.text;
          } else if (block.type === 'reasoning' && block.text) {
            reasoning += (reasoning ? '\n\n' : '') + block.text;
          } else if (block.type === 'tool') {
            tools.push({ name: block.name, status: block.state?.status || null });
          }
        }
      }

      if (!text && !reasoning && tools.length === 0) continue;

      const entry = {
        id: m.id,
        type: m.type || m.role || 'unknown',
        model: m.model ? (m.model.providerID ? `${m.model.providerID}/${m.model.id}` : m.model.id) : null,
        createdAt: m.time?.created ? new Date(m.time.created).toISOString() : null,
        text
      };
      if (includeReasoning && reasoning) entry.reasoning = reasoning;
      if (tools.length > 0) entry.tools = tools;
      if (m.tokens) entry.tokens = m.tokens;
      formatted.push(entry);
    }

    return {
      sessionID,
      title: session?.title || sessionID,
      model: session?.model
        ? (session.model.providerID ? `${session.model.providerID}/${session.model.id}` : session.model.id)
        : null,
      totalMessages: formatted.length,
      messages: formatted.slice(-limit)
    };
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
   * Resuelve la finalización de la sesión basándose en Dual-Track (SSE + polling).
   * Cuando `afterTimestamp > 0` (sesiones multi-turno continuadas), espera a que
   * el nuevo turno quede idle y extrae únicamente los mensajes de respuesta de ese turno.
   */
  async waitForCompletion(sessionID, timeoutMs = 600000, afterTimestamp = 0) {
    const startTime = Date.now();

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

    const pollPromise = (async () => {
      let interval = 500;
      while (Date.now() - startTime < timeoutMs) {
        await new Promise((r) => setTimeout(r, interval));
        if (interval < 2000) interval += 250;

        try {
          const session = await this.request(`/api/session/${sessionID}`);
          const isIdle = Boolean(session.time?.idle && (!session.time.busy || session.time.idle >= session.time.busy));
          const isFreshTurn = !afterTimestamp || (session.time?.idle && session.time.idle >= afterTimestamp);
          if (isIdle && isFreshTurn) {
            return { source: 'poll', session };
          }
        } catch {
          // Error transitorio tolerado
        }
      }
      throw new Error(`Timeout de espera tras ${timeoutMs}ms para sesión ${sessionID}`);
    })();

    await Promise.race([ssePromise, pollPromise]);

    const rawMessages = await this.getSessionMessages(sessionID);
    const messages = Array.isArray(rawMessages) ? rawMessages : (rawMessages.data || []);

    let scopedMessages = messages;
    if (afterTimestamp > 0) {
      const byTime = messages.filter((m) => (m.time?.created || 0) >= afterTimestamp);
      if (byTime.length > 0) {
        scopedMessages = byTime;
      } else {
        const lastUserIdx = messages.map((m) => m.type).lastIndexOf('user');
        if (lastUserIdx !== -1) {
          scopedMessages = messages.slice(lastUserIdx + 1);
        }
      }
    }

    const assistantMsgs = scopedMessages.filter((m) => m.type === 'assistant');
    const idleMsg = [...scopedMessages].reverse().find((m) => m.type === 'idle');

    let fullText = '';
    const totalTokens = { input: 0, output: 0, reasoning: 0 };
    let totalCost = 0;
    let hasReportedCost = false;
    let modelUsed = null;

    for (const msg of assistantMsgs) {
      if (msg.model) modelUsed = msg.model;
      if (typeof msg.cost === 'number') {
        totalCost += msg.cost;
        hasReportedCost = true;
      }
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
      cost: hasReportedCost ? totalCost : null,
      diffs,
      durationMs: Date.now() - startTime
    };
  }
}

export const client = new OpenCodeClient();
