import http from 'node:http';
import { CONFIG } from './config.js';
import { checkServerAuth } from './server-manager.js';
import { eventStream } from './event-stream.js';
import { jobManager } from './job-manager.js';

let serverInstance = null;
const sseClients = new Set();
let pingInterval = null;

function renderDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenBridge Telemetry Dashboard</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --card-border: #1f2937;
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --accent: #38bdf8;
      --green: #10b981;
      --amber: #f59e0b;
      --red: #ef4444;
      --purple: #a855f7;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text-main);
      padding: 1.5rem;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 1rem;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .brand h1 {
      font-size: 1.35rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .badge-live {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.25rem 0.6rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-live.online {
      background: rgba(16, 185, 129, 0.15);
      color: var(--green);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .badge-live.offline {
      background: rgba(239, 68, 68, 0.15);
      color: var(--red);
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .pulse {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 8px currentColor;
      animation: pulseAnim 2s infinite ease-in-out;
    }
    @keyframes pulseAnim {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
    }
    .metric-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.75rem;
      padding: 1rem;
    }
    .metric-title {
      font-size: 0.75rem;
      text-transform: uppercase;
      color: var(--text-muted);
      letter-spacing: 0.05em;
      margin-bottom: 0.4rem;
    }
    .metric-value {
      font-size: 1.6rem;
      font-weight: 700;
      color: var(--text-main);
    }
    .main-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      flex: 1;
    }
    @media (max-width: 960px) {
      .main-grid { grid-template-columns: 1fr; }
    }
    .panel {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.75rem;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .panel-header {
      padding: 0.85rem 1.25rem;
      border-bottom: 1px solid var(--card-border);
      font-weight: 600;
      font-size: 0.95rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .panel-body {
      padding: 1rem;
      overflow-y: auto;
      flex: 1;
      max-height: 520px;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .task-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 0.5rem;
      padding: 0.85rem;
      cursor: pointer;
      transition: all 0.15s ease;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .task-card:hover {
      border-color: var(--accent);
      transform: translateY(-1px);
    }
    .task-card.active {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px var(--accent);
    }
    .task-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .task-id {
      font-family: monospace;
      font-size: 0.85rem;
      color: var(--accent);
      font-weight: 600;
    }
    .model-badge {
      font-size: 0.7rem;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      font-weight: 600;
      text-transform: uppercase;
      background: #0f172a;
      border: 1px solid #334155;
      color: #94a3b8;
    }
    .model-badge.deepseek { color: var(--accent); border-color: rgba(56, 189, 248, 0.4); }
    .model-badge.nemotron { color: var(--green); border-color: rgba(16, 185, 129, 0.4); }
    .model-badge.gemma { color: var(--purple); border-color: rgba(168, 85, 247, 0.4); }
    .task-desc {
      font-size: 0.82rem;
      color: #cbd5e1;
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .task-bottom {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.2rem;
    }
    .status-pill {
      font-size: 0.7rem;
      font-weight: 600;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
    }
    .status-pill.running { background: rgba(245, 158, 11, 0.2); color: var(--amber); }
    .status-pill.completed { background: rgba(16, 185, 129, 0.2); color: var(--green); }
    .status-pill.failed { background: rgba(239, 68, 68, 0.2); color: var(--red); }
    .diff-viewer {
      background: #030712;
      font-family: monospace;
      font-size: 0.8rem;
      padding: 0.85rem;
      border-radius: 0.4rem;
      overflow-x: auto;
      white-space: pre;
      line-height: 1.4;
      flex: 1;
    }
    .diff-line.add { color: #4ade80; background: rgba(74, 222, 128, 0.1); display: block; }
    .diff-line.del { color: #f87171; background: rgba(248, 113, 113, 0.1); display: block; }
    .diff-line.info { color: #94a3b8; display: block; }
    .empty-state {
      text-align: center;
      color: var(--text-muted);
      padding: 3rem 1rem;
      font-size: 0.9rem;
    }
    .event-log {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      font-family: monospace;
      font-size: 0.75rem;
    }
    .event-item {
      padding: 0.35rem 0.5rem;
      border-radius: 4px;
      background: #0f172a;
      border-left: 2px solid var(--accent);
      color: #94a3b8;
      display: flex;
      gap: 0.5rem;
    }
    .event-time { color: #64748b; }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="pulse" id="global-pulse"></div>
      <h1>OpenBridge Telemetry</h1>
      <span class="badge-live online" id="server-status">
        <span class="pulse"></span> ONLINE
      </span>
    </div>
    <div style="font-size: 0.8rem; color: var(--text-muted);" id="sse-clients-indicator">
      SSE: Conectado
    </div>
  </header>

  <div class="metrics-grid">
    <div class="metric-card">
      <div class="metric-title">Tareas Totales</div>
      <div class="metric-value" id="stat-total-tasks">0</div>
    </div>
    <div class="metric-card">
      <div class="metric-title">En Ejecución</div>
      <div class="metric-value" id="stat-running-tasks" style="color: var(--amber);">0</div>
    </div>
    <div class="metric-card">
      <div class="metric-title">Tokens Procesados</div>
      <div class="metric-value" id="stat-tokens">0</div>
    </div>
    <div class="metric-card">
      <div class="metric-title">Tiempo Satélite</div>
      <div class="metric-value" id="stat-time">0s</div>
    </div>
  </div>

  <div class="main-grid">
    <div class="panel">
      <div class="panel-header">
        <span>Cola de Tareas en Vivo</span>
        <span style="font-size: 0.75rem; color: var(--text-muted);" id="task-count-sub">0 registradas</span>
      </div>
      <div class="panel-body" id="tasks-container">
        <div class="empty-state">No hay tareas activas en este momento.</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <span id="detail-title">Visor de Diff & Salida</span>
        <span id="detail-meta" style="font-size: 0.75rem; color: var(--text-muted);">Selecciona una tarea</span>
      </div>
      <div class="panel-body">
        <div class="diff-viewer" id="diff-content">Esperando actividad de modelos...</div>
        <div style="font-size: 0.8rem; font-weight: 600; margin-top: 0.5rem;">Eventos Recientes de OpenCode</div>
        <div class="event-log" id="events-log-container"></div>
      </div>
    </div>
  </div>

  <script>
    const tasksMap = new Map();
    let selectedTaskId = null;
    let totalTokensAccum = 0;
    let totalTimeAccum = 0;

    function formatModelBadge(modelStr) {
      const m = (modelStr || '').toLowerCase();
      let cls = 'deepseek';
      let label = 'DeepSeek';
      if (m.includes('nemotron')) { cls = 'nemotron'; label = 'Nemotron'; }
      else if (m.includes('gemma')) { cls = 'gemma'; label = 'Gemma'; }
      else if (m.includes('glm')) { cls = 'deepseek'; label = 'GLM'; }
      return \`<span class="model-badge \${cls}">\${label}</span>\`;
    }

    function renderTasks() {
      const container = document.getElementById('tasks-container');
      const tasks = Array.from(tasksMap.values()).reverse();
      
      document.getElementById('stat-total-tasks').textContent = tasks.length;
      document.getElementById('task-count-sub').textContent = \`\${tasks.length} registradas\`;
      const runningCount = tasks.filter(t => t.status === 'RUNNING').length;
      document.getElementById('stat-running-tasks').textContent = runningCount;

      if (tasks.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay tareas activas en este momento.</div>';
        return;
      }

      container.innerHTML = tasks.map(t => {
        const isSel = t.jobId === selectedTaskId ? 'active' : '';
        const dur = t.status === 'RUNNING' 
          ? Math.max(1, Math.round((Date.now() - t.startedAt) / 1000)) + 's (en vivo)'
          : (t.durationSeconds || 0) + 's';
        const stCls = (t.status || 'running').toLowerCase();
        return \`
          <div class="task-card \${isSel}" onclick="selectTask('\${t.jobId}')">
            <div class="task-top">
              <span class="task-id">\${t.jobId}</span>
              \${formatModelBadge(t.model || t.modelUsed)}
            </div>
            <div class="task-desc">\${t.task || 'Sin descripción'}</div>
            <div class="task-bottom">
              <span class="status-pill \${stCls}">\${t.status}</span>
              <span>\${dur}</span>
            </div>
          </div>
        \`;
      }).join('');
    }

    function selectTask(jobId) {
      selectedTaskId = jobId;
      renderTasks();
      const task = tasksMap.get(jobId);
      if (!task) return;

      document.getElementById('detail-title').textContent = \`Detalle: \${task.jobId}\`;
      document.getElementById('detail-meta').textContent = \`Modelo: \${task.modelUsed || task.model}\`;

      const diffElem = document.getElementById('diff-content');
      if (task.diffs && task.diffs.length > 0) {
        const formatted = task.diffs.map(d => {
          const header = \`--- \${d.file || 'archivo'} ---\\n\`;
          const lines = (d.diff || '').split('\\n').map(l => {
            if (l.startsWith('+')) return \`<span class="diff-line add">\${escapeHtml(l)}</span>\`;
            if (l.startsWith('-')) return \`<span class="diff-line del">\${escapeHtml(l)}</span>\`;
            return \`<span class="diff-line info">\${escapeHtml(l)}</span>\`;
          }).join('');
          return header + lines;
        }).join('\\n\\n');
        diffElem.innerHTML = formatted;
      } else if (task.result) {
        diffElem.textContent = task.result.slice(0, 3000) + (task.result.length > 3000 ? '\\n... [contenido truncado en visor]' : '');
      } else {
        diffElem.textContent = 'Tarea en ejecución: esperando código o diff generado por el modelo satélite...';
      }
    }

    function escapeHtml(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function addEventLog(type, text) {
      const logContainer = document.getElementById('events-log-container');
      const d = new Date();
      const timeStr = d.toTimeString().split(' ')[0];
      const item = document.createElement('div');
      item.className = 'event-item';
      item.innerHTML = \`<span class="event-time">\${timeStr}</span> <strong>[\${type}]</strong> <span>\${escapeHtml(text)}</span>\`;
      logContainer.prepend(item);
      while (logContainer.children.length > 15) {
        logContainer.removeChild(logContainer.lastChild);
      }
    }

    // Server-Sent Events Listener
    function initSSE() {
      const evtSource = new EventSource('/api/events');

      evtSource.onopen = () => {
        document.getElementById('sse-clients-indicator').textContent = 'SSE: Conectado en Vivo';
        document.getElementById('sse-clients-indicator').style.color = 'var(--green)';
      };

      evtSource.addEventListener('init', (e) => {
        const data = JSON.parse(e.data);
        if (data.jobs) {
          data.jobs.forEach(j => {
            tasksMap.set(j.jobId, j);
            if (j.tokens) {
              totalTokensAccum += (j.tokens.input || 0) + (j.tokens.output || 0) + (j.tokens.reasoning || 0);
            }
            if (j.durationSeconds) totalTimeAccum += j.durationSeconds;
          });
          document.getElementById('stat-tokens').textContent = totalTokensAccum.toLocaleString();
          document.getElementById('stat-time').textContent = totalTimeAccum + 's';
          renderTasks();
          if (tasksMap.size > 0 && !selectedTaskId) {
            selectTask(Array.from(tasksMap.keys())[tasksMap.size - 1]);
          }
        }
      });

      evtSource.addEventListener('task_started', (e) => {
        const job = JSON.parse(e.data);
        tasksMap.set(job.jobId, job);
        renderTasks();
        addEventLog('INICIO', \`Tarea \${job.jobId} enviada a \${job.model}\`);
      });

      evtSource.addEventListener('task_completed', (e) => {
        const job = JSON.parse(e.data);
        tasksMap.set(job.jobId, job);
        if (job.tokens) {
          totalTokensAccum += (job.tokens.input || 0) + (job.tokens.output || 0) + (job.tokens.reasoning || 0);
          document.getElementById('stat-tokens').textContent = totalTokensAccum.toLocaleString();
        }
        if (job.durationSeconds) {
          totalTimeAccum += job.durationSeconds;
          document.getElementById('stat-time').textContent = totalTimeAccum + 's';
        }
        renderTasks();
        if (selectedTaskId === job.jobId) selectTask(job.jobId);
        addEventLog('EXITO', \`Tarea \${job.jobId} completada en \${job.durationSeconds}s\`);
      });

      evtSource.addEventListener('task_failed', (e) => {
        const job = JSON.parse(e.data);
        tasksMap.set(job.jobId, job);
        renderTasks();
        if (selectedTaskId === job.jobId) selectTask(job.jobId);
        addEventLog('FALLO', \`Tarea \${job.jobId} falló: \${job.error || 'error'}\`);
      });

      evtSource.addEventListener('opencode_event', (e) => {
        const evt = JSON.parse(e.data);
        addEventLog('ENGINE', \`\${evt.type} (\${evt.data?.sessionID?.slice(0,8) || 'global'})\`);
      });

      evtSource.onerror = () => {
        document.getElementById('sse-clients-indicator').textContent = 'SSE: Reconectando...';
        document.getElementById('sse-clients-indicator').style.color = 'var(--amber)';
      };
    }

    initSSE();
    setInterval(() => {
      const running = Array.from(tasksMap.values()).some(t => t.status === 'RUNNING');
      if (running) renderTasks();
    }, 1000);
  </script>
</body>
</html>`;
}

export function broadcastDashboardEvent(eventType, payload) {
  if (sseClients.size === 0) return;
  const dataStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const msg = `event: ${eventType}\ndata: ${dataStr}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(msg);
    } catch {
      sseClients.delete(client);
    }
  }
}

export function startDashboardServer(port = 4098) {
  if (serverInstance) return;

  serverInstance = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache'
      });
      res.end(renderDashboardHtml());
      return;
    }

    if (url.pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write('\n');
      sseClients.add(res);

      // Enviar snapshot inicial
      const allJobs = jobManager.listJobs({ limit: 50 });
      const initPayload = {
        jobs: allJobs.jobs || [],
        timestamp: Date.now()
      };
      res.write(`event: init\ndata: ${JSON.stringify(initPayload)}\n\n`);

      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

    if (url.pathname === '/api/status') {
      const jobs = jobManager.listJobs({ limit: 50 });
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({
        status: 'ONLINE',
        connectedClients: sseClients.size,
        jobs: jobs.jobs || []
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  serverInstance.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[OpenBridge Dashboard]: El puerto ${port} está en uso. Intentando puerto alternativo ${port + 1}...`);
      startDashboardServer(port + 1);
    } else {
      console.error('[OpenBridge Dashboard Error]:', err.message);
    }
  });

  serverInstance.listen(port, '127.0.0.1', () => {
    console.log(`[OpenBridge Dashboard]: Servidor de telemetría activo en http://127.0.0.1:${port}`);
  });

  // Heartbeat ping para mantener vivos los proxies y EventSource
  pingInterval = setInterval(() => {
    broadcastDashboardEvent('ping', { time: Date.now() });
  }, 15000);

  // Escuchar eventos de tareas en JobManager
  jobManager.on('task_started', (job) => {
    broadcastDashboardEvent('task_started', job);
  });
  jobManager.on('task_completed', (job) => {
    broadcastDashboardEvent('task_completed', job);
  });
  jobManager.on('task_failed', (job) => {
    broadcastDashboardEvent('task_failed', job);
  });

  // Escuchar eventos globales de OpenCode para telemetría
  eventStream.on('event', (evt) => {
    broadcastDashboardEvent('opencode_event', evt);
  });
}

export function stopDashboardServer() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  for (const client of sseClients) {
    try { client.end(); } catch {}
  }
  sseClients.clear();
  if (serverInstance) {
    try { serverInstance.close(); } catch {}
    serverInstance = null;
  }
}
