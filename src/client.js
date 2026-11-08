import { CONFIG, getBaseUrl, getAuthHeader } from './config.js';
import { getActivePassword, ensureServerRunning } from './server-manager.js';

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
      // Parse model string if provider is included e.g. "opencode/nemotron-3.5-lightning-free"
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

  async waitForCompletion(sessionID, timeoutMs = 120000) {
    const startTime = Date.now();
    let pollInterval = 1000;

    while (Date.now() - startTime < timeoutMs) {
      await new Promise((r) => setTimeout(r, pollInterval));

      const rawMessages = await this.getSessionMessages(sessionID);
      const messages = Array.isArray(rawMessages) ? rawMessages : (rawMessages.data || []);

      // Check if session reached completion
      const idleMsg = messages.find((m) => m.type === 'idle');
      const assistantMsgs = messages.filter((m) => m.type === 'assistant');

      const isFinished = idleMsg && (idleMsg.outcome === 'succeeded' || idleMsg.outcome === 'failed');
      const hasCompletedAssistant = assistantMsgs.some((m) => m.finish === 'stop' || m.time?.completed);

      if (isFinished || (idleMsg && hasCompletedAssistant)) {
        // Collect assistant text content and metrics
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
          cost: 0, // OpenCode Zen free tier
          diffs,
          durationMs: Date.now() - startTime
        };
      }
    }

    // Timeout exceeded
    await this.interruptSession(sessionID);
    throw new Error(`OpenCode session ${sessionID} timed out after ${timeoutMs}ms`);
  }
}

export const client = new OpenCodeClient();
