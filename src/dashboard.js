import http from 'node:http';
import { CONFIG } from './config.js';
import { client } from './client.js';
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
  <title>OpenBridge Telemetry Engine — Deep Model Monitor</title>
  <style>
    :root {
      --bg: #070a13;
      --card-bg: #0f172a;
      --card-border: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --green: #10b981;
      --amber: #f59e0b;
      --red: #ef4444;
      --purple: #a855f7;
      --pink: #ec4899;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 1.25rem;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 0.85rem;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .brand h1 {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .badge-live {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.2rem 0.6rem;
      border-radius: 9999px;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-live.online {
      background: rgba(16, 185, 129, 0.15);
      color: var(--green);
      border: 1px solid rgba(16, 185, 129, 0.3);
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
      50% { opacity: 0.4; transform: scale(0.8); }
    }
    /* Grid de Métricas Principales */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 0.75rem;
    }
    .metric-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.6rem;
      padding: 0.85rem;
    }
    .metric-title {
      font-size: 0.7rem;
      text-transform: uppercase;
      color: var(--text-muted);
      letter-spacing: 0.05em;
      margin-bottom: 0.35rem;
    }
    .metric-value {
      font-size: 1.45rem;
      font-weight: 700;
    }
    .metric-sub {
      font-size: 0.72rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
      display: flex;
      gap: 0.5rem;
    }
    /* Barra de Modelos */
    .model-summary-bar {
      background: #0b1120;
      border: 1px solid var(--card-border);
      border-radius: 0.5rem;
      padding: 0.6rem 1rem;
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem;
      font-size: 0.78rem;
      align-items: center;
    }
    .model-summary-item {
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .dot.nemotron { background: var(--green); box-shadow: 0 0 6px var(--green); }
    .dot.deepseek { background: var(--accent); box-shadow: 0 0 6px var(--accent); }
    .dot.gemma { background: var(--purple); box-shadow: 0 0 6px var(--purple); }
    /* Grid Principal */
    .main-grid {
      display: grid;
      grid-template-columns: 380px 1fr;
      gap: 1rem;
      flex: 1;
    }
    @media (max-width: 1024px) {
      .main-grid { grid-template-columns: 1fr; }
    }
    .panel {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.6rem;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .panel-header {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--card-border);
      font-weight: 600;
      font-size: 0.85rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #0c1322;
    }
    .panel-body {
      padding: 0.75rem;
      overflow-y: auto;
      flex: 1;
      max-height: calc(100vh - 280px);
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .task-card {
      background: #131d31;
      border: 1px solid #24324c;
      border-radius: 0.5rem;
      padding: 0.75rem;
      cursor: pointer;
      transition: all 0.15s ease;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .task-card:hover {
      border-color: var(--accent);
      background: #17233b;
    }
    .task-card.active {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px var(--accent);
      background: #192742;
    }
    .task-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .task-title {
      font-family: monospace;
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--accent);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 220px;
    }
    .model-badge {
      font-size: 0.68rem;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      font-weight: 700;
      text-transform: uppercase;
      background: #090e1a;
      border: 1px solid #334155;
    }
    .model-badge.nemotron { color: var(--green); border-color: rgba(16, 185, 129, 0.4); }
    .model-badge.deepseek { color: var(--accent); border-color: rgba(56, 189, 248, 0.4); }
    .model-badge.gemma { color: var(--purple); border-color: rgba(168, 85, 247, 0.4); }
    .task-metrics-row {
      display: flex;
      gap: 0.6rem;
      font-size: 0.72rem;
      color: var(--text-muted);
    }
    .status-pill {
      font-size: 0.68rem;
      font-weight: 700;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
    }
    .status-pill.running { background: rgba(245, 158, 11, 0.2); color: var(--amber); }
    .status-pill.completed { background: rgba(16, 185, 129, 0.2); color: var(--green); }
    .status-pill.failed { background: rgba(239, 68, 68, 0.2); color: var(--red); }
    /* Pestañas de Detalle */
    .tabs-header {
      display: flex;
      border-bottom: 1px solid var(--card-border);
      background: #090e1a;
    }
    .tab-btn {
      padding: 0.6rem 1rem;
      font-size: 0.78rem;
      font-weight: 600;
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.15s ease;
    }
    .tab-btn:hover { color: var(--text); }
    .tab-btn.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
      background: rgba(56, 189, 248, 0.05);
    }
    .tab-content {
      padding: 1rem;
      overflow-y: auto;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    /* Tarjeta de Contexto y Telemetría Técnica (Estilo Imagen 2) */
    .context-matrix {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      background: #090e1a;
      border: 1px solid var(--card-border);
      border-radius: 0.5rem;
      padding: 1rem;
    }
    .ctx-item {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }
    .ctx-label {
      font-size: 0.7rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .ctx-val {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text);
    }
    .ctx-val.highlight { color: var(--accent); }
    .ctx-val.green { color: var(--green); }
    /* Lista de Mensajes en Bruto */
    .raw-messages-list {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .raw-msg-item {
      font-family: monospace;
      font-size: 0.75rem;
      background: #090e1a;
      border: 1px solid var(--card-border);
      border-radius: 0.35rem;
      padding: 0.5rem 0.75rem;
      display: flex;
      justify-content: space-between;
      color: #cbd5e1;
    }
    .raw-msg-item .role { font-weight: 700; color: var(--accent); }
    /* Visores de Texto */
    .text-box {
      background: #040711;
      border: 1px solid var(--card-border);
      border-radius: 0.4rem;
      padding: 1rem;
      font-family: monospace;
      font-size: 0.8rem;
      line-height: 1.45;
      white-space: pre-wrap;
      overflow-x: auto;
      color: #e2e8f0;
      flex: 1;
    }
    .diff-line.add { color: #4ade80; background: rgba(74, 222, 128, 0.08); display: block; }
    .diff-line.del { color: #f87171; background: rgba(248, 113, 113, 0.08); display: block; }
    .diff-line.info { color: #64748b; display: block; }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="pulse" style="color: var(--green);"></div>
      <h1>OpenBridge Telemetry Engine</h1>
      <span class="badge-live online"><span class="pulse"></span> OPENCODE ONLINE (PORT 4096)</span>
    </div>
    <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; gap: 1rem;" id="header-right">
      <span>Auto-Sync: <strong style="color: var(--green);">2s Reactivo</strong></span>
      <span id="sse-indicator" style="color: var(--green);">SSE: Conectado</span>
    </div>
  </header>

  <!-- Métricas Principales -->
  <div class="metrics-grid">
    <div class="metric-card">
      <div class="metric-title">Tokens Totales</div>
      <div class="metric-value" id="stat-total-tokens">0</div>
      <div class="metric-sub">
        <span>In: <strong id="stat-sub-in">0</strong></span>
        <span>Out: <strong id="stat-sub-out">0</strong></span>
        <span>CoT: <strong id="stat-sub-cot" style="color: var(--accent);">0</strong></span>
      </div>
    </div>
    <div class="metric-card">
      <div class="metric-title">Tareas Satélite</div>
      <div class="metric-value" id="stat-total-tasks">0</div>
      <div class="metric-sub">
        <span>Completadas: <strong id="stat-sub-done" style="color: var(--green);">0</strong></span>
        <span>Activas: <strong id="stat-sub-active" style="color: var(--amber);">0</strong></span>
      </div>
    </div>
    <div class="metric-card">
      <div class="metric-title">Costo Satélite Acumulado</div>
      <div class="metric-value" style="color: var(--green);">0,00 US$</div>
      <div class="metric-sub">100% Cuota Antigravity Ahorrada</div>
    </div>
    <div class="metric-card">
      <div class="metric-title">Tiempo Total de Cómputo</div>
      <div class="metric-value" id="stat-total-time">0s</div>
      <div class="metric-sub">Tiempo Satélites Desviado</div>
    </div>
  </div>

  <!-- Resumen por Modelo -->
  <div class="model-summary-bar" id="model-summary-bar">
    <span style="font-weight: 700; color: var(--text-muted);">DESGLOSE POR MODELO:</span>
    <div class="model-summary-item"><span class="dot nemotron"></span> <span>Nemotron 3.5: <strong id="tokens-nemotron">0</strong> tok</span></div>
    <div class="model-summary-item"><span class="dot deepseek"></span> <span>DeepSeek V4.1: <strong id="tokens-deepseek">0</strong> tok</span></div>
    <div class="model-summary-item"><span class="dot gemma"></span> <span>Gemma 4: <strong id="tokens-gemma">0</strong> tok</span></div>
  </div>

  <!-- Layout Principal -->
  <div class="main-grid">
    <!-- Lista de Tareas -->
    <div class="panel">
      <div class="panel-header">
        <span>Sesiones de OpenCode (<span id="task-count-badge">0</span>)</span>
        <button onclick="refreshData()" style="background: transparent; border: 1px solid #334155; color: #94a3b8; font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: 4px; cursor: pointer;">Sincronizar</button>
      </div>
      <div class="panel-body" id="sessions-list">
        <div style="text-align: center; color: var(--text-muted); padding: 2rem;">Cargando sesiones desde OpenCode...</div>
      </div>
    </div>

    <!-- Panel de Detalle Técnico Profundo -->
    <div class="panel">
      <div class="tabs-header">
        <button class="tab-btn active" onclick="switchTab('context')">Contexto & Telemetría</button>
        <button class="tab-btn" onclick="switchTab('reasoning')">Pensamiento CoT (Reasoning)</button>
        <button class="tab-btn" onclick="switchTab('output')">Respuesta Completa</button>
        <button class="tab-btn" onclick="switchTab('diff')">Diff de Archivos</button>
      </div>

      <!-- Tab 1: Contexto y Métricas Detalladas (Estilo Imagen 2) -->
      <div class="tab-content" id="tab-context">
        <div class="context-matrix" id="context-matrix-content">
          <div style="color: var(--text-muted); font-size: 0.85rem;">Selecciona una sesión en la columna izquierda para ver su telemetría anatómica.</div>
        </div>

        <div style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-top: 0.5rem;">Mensajes en Bruto Registrados</div>
        <div class="raw-messages-list" id="raw-messages-container"></div>
      </div>

      <!-- Tab 2: Pensamiento CoT -->
      <div class="tab-content" id="tab-reasoning" style="display: none;">
        <div style="font-size: 0.75rem; color: var(--accent); font-weight: 600;">Cadena de Razonamiento Interno (Chain-of-Thought) generada por el satélite antes del código:</div>
        <div class="text-box" id="reasoning-box">Sin razonamiento disponible.</div>
      </div>

      <!-- Tab 3: Respuesta Completa -->
      <div class="tab-content" id="tab-output" style="display: none;">
        <div class="text-box" id="output-box">Selecciona una sesión.</div>
      </div>

      <!-- Tab 4: Diff de Archivos -->
      <div class="tab-content" id="tab-diff" style="display: none;">
        <div class="text-box" id="diff-box">Sin modificaciones en archivos registradas para esta sesión.</div>
      </div>
    </div>
  </div>

  <script>
    let activeSessions = [];
    let selectedSessionId = null;
    let selectedDetail = null;
    let currentTab = 'context';

    function switchTab(tabName) {
      currentTab = tabName;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');

      const targetBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick').includes(tabName));
      if (targetBtn) targetBtn.classList.add('active');

      const targetContent = document.getElementById('tab-' + tabName);
      if (targetContent) targetContent.style.display = 'flex';
    }

    function formatNumber(num) {
      return (num || 0).toLocaleString();
    }

    function getModelBadgeClass(modelName) {
      const m = (modelName || '').toLowerCase();
      if (m.includes('nemotron')) return 'nemotron';
      if (m.includes('deepseek')) return 'deepseek';
      if (m.includes('gemma')) return 'gemma';
      return 'nemotron';
    }

    async function refreshData() {
      try {
        const res = await fetch('/api/sessions');
        const data = await res.json();
        activeSessions = data.sessions || [];

        // Actualizar Métricas Top
        document.getElementById('stat-total-tokens').textContent = formatNumber(data.totals.tokensTotal);
        document.getElementById('stat-sub-in').textContent = formatNumber(data.totals.tokensInput);
        document.getElementById('stat-sub-out').textContent = formatNumber(data.totals.tokensOutput);
        document.getElementById('stat-sub-cot').textContent = formatNumber(data.totals.tokensReasoning);

        document.getElementById('stat-total-tasks').textContent = activeSessions.length;
        document.getElementById('stat-sub-done').textContent = activeSessions.filter(s => s.status === 'COMPLETED').length;
        document.getElementById('stat-sub-active').textContent = activeSessions.filter(s => s.status === 'RUNNING').length;
        document.getElementById('stat-total-time').textContent = data.totals.durationSeconds + 's';
        document.getElementById('task-count-badge').textContent = activeSessions.length;

        // Desglose por Modelo
        document.getElementById('tokens-nemotron').textContent = formatNumber(data.modelBreakdown['nemotron-3.5-super-vl-free'] || data.modelBreakdown['nemotron'] || 0);
        document.getElementById('tokens-deepseek').textContent = formatNumber(data.modelBreakdown['deepseek-v4.1-flash-free'] || data.modelBreakdown['deepseek'] || 0);
        document.getElementById('tokens-gemma').textContent = formatNumber(data.modelBreakdown['gemma-4'] || data.modelBreakdown['gemma'] || 0);

        renderSessionsList();

        if (activeSessions.length > 0 && !selectedSessionId) {
          selectSession(activeSessions[0].id);
        } else if (selectedSessionId) {
          loadSessionDetail(selectedSessionId, false);
        }
      } catch (err) {
        console.error('Error refreshing sessions:', err);
      }
    }

    function renderSessionsList() {
      const container = document.getElementById('sessions-list');
      if (activeSessions.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">No se encontraron sesiones en OpenCode.</div>';
        return;
      }

      container.innerHTML = activeSessions.map(s => {
        const isSel = s.id === selectedSessionId ? 'active' : '';
        const badgeCls = getModelBadgeClass(s.modelName);
        const statusCls = s.status === 'RUNNING' ? 'running' : (s.outcome === 'failed' ? 'failed' : 'completed');
        const dur = s.durationSeconds ? s.durationSeconds + 's' : '0s';

        return \`
          <div class="task-card \${isSel}" onclick="selectSession('\${s.id}')">
            <div class="task-top">
              <span class="task-title" title="\${s.title || s.id}">\${s.title || s.id}</span>
              <span class="model-badge \${badgeCls}">\${s.modelShortName}</span>
            </div>
            <div class="task-metrics-row">
              <span class="status-pill \${statusCls}">\${s.status}</span>
              <span>Tokens: <strong>\${formatNumber(s.tokens.total)}</strong></span>
              <span>Duración: \${dur}</span>
            </div>
          </div>
        \`;
      }).join('');
    }

    async function selectSession(sessionId) {
      selectedSessionId = sessionId;
      renderSessionsList();
      await loadSessionDetail(sessionId, true);
    }

    async function loadSessionDetail(sessionId, resetTab) {
      try {
        const res = await fetch('/api/session-detail?id=' + encodeURIComponent(sessionId));
        const detail = await res.json();
        selectedDetail = detail;

        // Renderizar Matriz de Contexto Anatómica (Idéntica a la Imagen 2)
        const s = detail.session;
        const matrixContainer = document.getElementById('context-matrix-content');
        matrixContainer.innerHTML = \`
          <div class="ctx-item">
            <span class="ctx-label">Sesión</span>
            <span class="ctx-val highlight">\${s.title || s.id}</span>
          </div>
          <div class="ctx-item">
            <span class="ctx-label">Proveedor</span>
            <span class="ctx-val">\${s.providerID || 'OpenCode'}</span>
          </div>
          <div class="ctx-item">
            <span class="ctx-label">Modelo</span>
            <span class="ctx-val highlight">\${detail.modelName || s.model?.id || 'Nemotron 3.5'}</span>
          </div>
          <div class="ctx-item">
            <span class="ctx-label">Límite de Contexto</span>
            <span class="ctx-val">1.048.576</span>
          </div>
          <div class="ctx-item">
            <span class="ctx-label">Uso de Ventana</span>
            <span class="ctx-val">\${Math.max(1, Math.round(((s.tokens?.input || 0) / 1048576) * 100))}%</span>
          </div>
          <div class="ctx-item">
            <span class="ctx-label">Tokens Totales</span>
            <span class="ctx-val">\${formatNumber(detail.tokensTotal)}</span>
          </div>
          <div class="ctx-item">
            <span class="ctx-label">Tokens de Entrada</span>
            <span class="ctx-val">\${formatNumber(s.tokens?.input || 0)}</span>
          </div>
          <div class="ctx-item">
            <span class="ctx-label">Tokens de Salida</span>
            <span class="ctx-val">\${formatNumber(s.tokens?.output || 0)}</span>
          </div>
          <div class="ctx-item">
            <span class="ctx-label">Tokens de Razonamiento (CoT)</span>
            <span class="ctx-val highlight">\${formatNumber(s.tokens?.reasoning || 0)}</span>
          </div>
          <div class="ctx-item">
            <span class="ctx-label">Tokens de Caché (Lectura/Escritura)</span>
            <span class="ctx-val">\${s.tokens?.cache?.read || 0} / \${s.tokens?.cache?.write || 0}</span>
          </div>
          <div class="ctx-item">
            <span class="ctx-label">Mensajes Registrados</span>
            <span class="ctx-val">\${detail.messagesCount || 0}</span>
          </div>
          <div class="ctx-item">
            <span class="ctx-label">Costo Total</span>
            <span class="ctx-val green">0,00 US$</span>
          </div>
          <div class="ctx-item">
            <span class="ctx-label">Sesión Creada</span>
            <span class="ctx-val">\${new Date(s.time?.created || Date.now()).toLocaleTimeString()}</span>
          </div>
          <div class="ctx-item">
            <span class="ctx-label">Última Actividad</span>
            <span class="ctx-val">\${new Date(s.time?.updated || s.time?.idle || Date.now()).toLocaleTimeString()}</span>
          </div>
        \`;

        // Renderizar Mensajes en Bruto
        const rawContainer = document.getElementById('raw-messages-container');
        if (detail.rawMessages && detail.rawMessages.length > 0) {
          rawContainer.innerHTML = detail.rawMessages.map(m => {
            return \`
              <div class="raw-msg-item">
                <span><span class="role">\${m.type}</span> • \${m.id}</span>
                <span style="color: var(--text-muted);">\${m.time || ''}</span>
              </div>
            \`;
          }).join('');
        } else {
          rawContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.75rem;">Sin mensajes en bruto.</div>';
        }

        // Renderizar Pestaña CoT
        document.getElementById('reasoning-box').textContent = detail.reasoningText || 'Este turno no requirió bloque de razonamiento CoT independiente o ya fue consolidado.';

        // Renderizar Pestaña Output
        document.getElementById('output-box').textContent = detail.outputText || 'Esperando respuesta del modelo...';

        // Renderizar Pestaña Diff
        const diffBox = document.getElementById('diff-box');
        if (detail.diffs && detail.diffs.length > 0) {
          const diffHtml = detail.diffs.map(d => {
            const lines = (d.diff || '').split('\\n').map(l => {
              if (l.startsWith('+')) return \`<span class="diff-line add">\${escapeHtml(l)}</span>\`;
              if (l.startsWith('-')) return \`<span class="diff-line del">\${escapeHtml(l)}</span>\`;
              return \`<span class="diff-line info">\${escapeHtml(l)}</span>\`;
            }).join('');
            return \`--- \${d.file || 'archivo'} ---\\n\${lines}\`;
          }).join('\\n\\n');
          diffBox.innerHTML = diffHtml;
        } else {
          diffBox.textContent = 'Sin modificaciones en archivos en disco (Modo de lectura pura o código en texto).';
        }

      } catch (err) {
        console.error('Error loading session detail:', err);
      }
    }

    function escapeHtml(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Inicializar
    refreshData();
    setInterval(refreshData, 2000); // Polling cada 2s para cero desfase

    // SSE Stream
    try {
      const es = new EventSource('/api/events');
      es.onmessage = () => { refreshData(); };
    } catch {}
  </script>
</body>
</html>`;
}

export function broadcastDashboardEvent(eventType, payload) {
  if (sseClients.size === 0) return;
  const dataStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const msg = `event: ${eventType}\ndata: ${dataStr}\n\n`;
  for (const c of sseClients) {
    try { c.write(msg); } catch { sseClients.delete(c); }
  }
}

export function startDashboardServer(port = 4098) {
  if (serverInstance) return;

  serverInstance = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(renderDashboardHtml());
      return;
    }

    if (url.pathname === '/api/status') {
      const jobs = jobManager.listJobs({ limit: 50 });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ status: 'ONLINE', connectedClients: sseClients.size, jobs: jobs.jobs || [] }));
      return;
    }

    // 1. Endpoint REST: Todas las Sesiones sincronizadas directamente desde OpenCode
    if (url.pathname === '/api/sessions') {
      try {
        const rawSessions = await client.request('/api/session');
        const list = Array.isArray(rawSessions) ? rawSessions : (rawSessions.data || []);

        let tokensTotal = 0;
        let tokensInput = 0;
        let tokensOutput = 0;
        let tokensReasoning = 0;
        let totalDuration = 0;
        const modelBreakdown = {};

        const formatted = list.map(s => {
          const inp = s.tokens?.input || 0;
          const out = s.tokens?.output || 0;
          const rsn = s.tokens?.reasoning || 0;
          const tot = inp + out + rsn;

          tokensTotal += tot;
          tokensInput += inp;
          tokensOutput += out;
          tokensReasoning += rsn;

          const modelId = s.model?.id || 'nemotron-3.5-super-vl-free';
          modelBreakdown[modelId] = (modelBreakdown[modelId] || 0) + tot;

          let dur = 0;
          if (s.time?.created && s.time?.idle) {
            dur = Math.max(1, Math.round((s.time.idle - s.time.created) / 1000));
          } else if (s.time?.created && s.time?.busy) {
            dur = Math.max(1, Math.round((Date.now() - s.time.created) / 1000));
          }
          totalDuration += dur;

          const isRunning = s.time?.busy && (!s.time.idle || s.time.busy > s.time.idle);

          let shortName = 'Nemotron';
          if (modelId.includes('deepseek')) shortName = 'DeepSeek';
          else if (modelId.includes('gemma')) shortName = 'Gemma';

          return {
            id: s.id,
            title: s.title || s.id,
            modelName: modelId,
            modelShortName: shortName,
            status: isRunning ? 'RUNNING' : 'COMPLETED',
            outcome: s.outcome || 'succeeded',
            durationSeconds: dur,
            tokens: {
              input: inp,
              output: out,
              reasoning: rsn,
              total: tot
            },
            time: s.time
          };
        }).reverse(); // Más recientes primero

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          sessions: formatted,
          totals: {
            tokensTotal,
            tokensInput,
            tokensOutput,
            tokensReasoning,
            durationSeconds: totalDuration
          },
          modelBreakdown
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message, sessions: [] }));
      }
      return;
    }

    // 2. Endpoint REST: Detalle Anatómico y Mensajes de una Sesión Específica
    if (url.pathname === '/api/session-detail') {
      const sessionId = url.searchParams.get('id');
      if (!sessionId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Falta parametro id' }));
        return;
      }

      try {
        const session = await client.request(`/api/session/${sessionId}`);
        let messages = [];
        try {
          const rawMsgs = await client.request(`/api/session/${sessionId}/message`);
          messages = Array.isArray(rawMsgs) ? rawMsgs : (rawMsgs.data || []);
        } catch {}

        let diffs = [];
        try {
          diffs = await client.request(`/api/session/${sessionId}/diff`);
        } catch {}

        let reasoningText = '';
        let outputText = '';
        const rawMessages = [];

        for (const m of messages) {
          rawMessages.push({
            id: m.id,
            type: m.type,
            time: m.time?.created ? new Date(m.time.created).toLocaleTimeString() : ''
          });

          if (Array.isArray(m.content)) {
            for (const b of m.content) {
              if (b.type === 'reasoning' && b.text) {
                reasoningText += (reasoningText ? '\n\n' : '') + b.text;
              } else if (b.type === 'text' && b.text) {
                outputText += (outputText ? '\n\n' : '') + b.text;
              }
            }
          }
        }

        const inp = session.tokens?.input || 0;
        const out = session.tokens?.output || 0;
        const rsn = session.tokens?.reasoning || 0;

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          session,
          modelName: session.model?.id || 'nemotron-3.5-super-vl-free',
          tokensTotal: inp + out + rsn,
          messagesCount: messages.length,
          rawMessages,
          reasoningText,
          outputText,
          diffs: Array.isArray(diffs) ? diffs : []
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // 3. Endpoint SSE para Push Reactivo
    if (url.pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write('\n');
      sseClients.add(res);

      req.on('close', () => { sseClients.delete(res); });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  serverInstance.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[OpenBridge Dashboard]: El puerto ${port} está en uso.`);
    } else {
      console.error('[OpenBridge Dashboard Error]:', err.message);
    }
  });

  serverInstance.listen(port, '127.0.0.1', () => {
    console.log(`[OpenBridge Deep Telemetry]: Servidor activo en http://127.0.0.1:${port}`);
  });

  pingInterval = setInterval(() => {
    broadcastDashboardEvent('ping', { time: Date.now() });
  }, 15000);

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
