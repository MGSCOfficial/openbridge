import http from 'node:http';
import { EventEmitter } from 'node:events';
import { CONFIG, getAuthHeader } from './config.js';
import { getActivePassword, ensureServerRunning } from './server-manager.js';

class OpenCodeEventStream extends EventEmitter {
  constructor() {
    super();
    this.connected = false;
    this.req = null;
    this.reconnectTimeout = null;
    this.buffer = '';
  }

  async start() {
    if (this.connected || this.req) return;
    await ensureServerRunning();

    const options = {
      hostname: CONFIG.hostname,
      port: CONFIG.port,
      path: '/api/event?types=session.idle&types=session.execution.succeeded&types=session.execution.failed&types=session.status',
      method: 'GET',
      headers: {
        Authorization: getAuthHeader(getActivePassword()),
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      }
    };

    this.req = http.request(options, (res) => {
      if (res.statusCode !== 200) {
        this.connected = false;
        this.req = null;
        this.scheduleReconnect();
        return;
      }

      this.connected = true;
      this.buffer = '';
      this.emit('connected');

      res.on('data', (chunk) => {
        this.buffer += chunk.toString();
        this.processBuffer();
      });

      res.on('end', () => {
        this.connected = false;
        this.req = null;
        this.scheduleReconnect();
      });
    });

    this.req.on('error', () => {
      this.connected = false;
      this.req = null;
      this.scheduleReconnect();
    });

    this.req.end();
  }

  scheduleReconnect() {
    if (this.reconnectTimeout) return;
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.start().catch(() => {});
    }, 2000);
  }

  processBuffer() {
    const lines = this.buffer.split(/\r?\n\r?\n/);
    this.buffer = lines.pop() || '';

    for (const block of lines) {
      if (!block.trim()) continue;
      let eventType = 'message';
      let dataStr = '';

      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataStr += (dataStr ? '\n' : '') + line.slice(5).trim();
        }
      }

      if (dataStr) {
        try {
          const parsed = JSON.parse(dataStr);
          this.emit('event', { type: eventType, data: parsed });
          if (parsed.sessionID || parsed.id) {
            const sid = parsed.sessionID || parsed.id;
            this.emit(`session:${sid}`, { type: eventType, data: parsed });
          }
        } catch {
          // ignore malformed event payload
        }
      }
    }
  }

  waitForSessionEvent(sessionID, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout esperando evento de finalizacion para sesion ${sessionID} (${timeoutMs}ms)`));
      }, timeoutMs);

      const handler = (evt) => {
        const type = evt.type || '';
        const outcome = evt.data?.outcome;

        if (type.includes('succeeded') || outcome === 'succeeded' || type.includes('idle')) {
          cleanup();
          resolve(evt.data);
        } else if (type.includes('failed') || outcome === 'failed') {
          cleanup();
          reject(new Error(`Sesion ${sessionID} fallo con evento: ${JSON.stringify(evt.data)}`));
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.off(`session:${sessionID}`, handler);
      };

      this.on(`session:${sessionID}`, handler);
    });
  }

  stop() {
    if (this.req) {
      this.req.destroy();
      this.req = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.connected = false;
  }
}

export const eventStream = new OpenCodeEventStream();
