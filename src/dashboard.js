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
  <title>OpenBridge Telemetry Console — Deep Model Monitor</title>
  <style>
    :root {
      --bg: #0b0f17;
      --surface: #111827;
      --surface-subtle: #162032;
      --border: #1f293d;
      --border-focus: #38bdf8;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --accent: #38bdf8;
      --green: #10b981;
      --amber: #f59e0b;
      --red: #ef4444;
      --purple: #a855f7;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      font-size: 13px;
      line-height: 1.5;
    }
    /* Barra Superior */
    header {
      background: #0d131f;
      border-bottom: 1px solid var(--border);
      padding: 0.75rem 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .logo {
      font-weight: 700;
      font-size: 0.95rem;
      letter-spacing: -0.01em;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.7rem;
      font-weight: 600;
      background: rgba(16, 185, 129, 0.1);
      color: var(--green);
      border: 1px solid rgba(16, 185, 129, 0.25);
    }
    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 1rem;
      color: var(--text-muted);
      font-size: 0.75rem;
    }
    /* Contenedor Principal */
    main {
      padding: 1.25rem 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      flex: 1;
    }
    /* KPIs Limpios */
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.75rem;
    }
    @media (max-width: 900px) { .kpi-row { grid-template-columns: repeat(2, 1fr); } }
    .kpi-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      padding: 0.85rem 1rem;
    }
    .kpi-label {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-dim);
      font-weight: 600;
      margin-bottom: 0.35rem;
    }
    .kpi-value {
      font-size: 1.4rem;
      font-weight: 700;
      color: #fff;
      font-feature-settings: "tnum";
    }
    .kpi-sub {
      font-size: 0.72rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
      display: flex;
      gap: 0.5rem;
    }
    /* Barra de Distribución por Modelo */
    .model-bar-panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      padding: 0.75rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .model-bar-header {
      display: flex;
      justify-content: space-between;
      font-size: 0.72rem;
      color: var(--text-dim);
      font-weight: 600;
      text-transform: uppercase;
    }
    .model-pills-row {
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem;
      font-size: 0.75rem;
    }
    .model-pill {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .pill-circle {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .pill-circle.nemotron { background: var(--green); }
    .pill-circle.deepseek { background: var(--accent); }
    .pill-circle.gemma { background: var(--purple); }
    /* Workspace Dividido */
    .workspace-grid {
      display: grid;
      grid-template-columns: 360px 1fr;
      gap: 1rem;
      flex: 1;
    }
    @media (max-width: 1000px) { .workspace-grid { grid-template-columns: 1fr; } }
    /* Columna de Tareas */
    .sidebar-panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .sidebar-header {
      padding: 0.6rem 0.85rem;
      background: #0d131f;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .filter-btn-group {
      display: flex;
      gap: 0.25rem;
      background: var(--bg);
      padding: 0.15rem;
      border-radius: 4px;
      border: 1px solid var(--border);
    }
    .filter-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 0.68rem;
      padding: 0.2rem 0.5rem;
      border-radius: 3px;
      cursor: pointer;
      font-weight: 600;
    }
    .filter-btn.active {
      background: #1e293d;
      color: #fff;
    }
    .tasks-list {
      padding: 0.5rem;
      overflow-y: auto;
      max-height: calc(100vh - 290px);
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      flex: 1;
    }
    .task-item {
      background: #141c2c;
      border: 1px solid var(--border);
      border-radius: 0.4rem;
      padding: 0.65rem 0.75rem;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
    }
    .task-item:hover {
      border-color: #334155;
      background: #182236;
    }
    .task-item.active {
      border-color: var(--accent);
      background: #19263e;
    }
    .item-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .item-title {
      font-family: monospace;
      font-size: 0.78rem;
      font-weight: 700;
      color: #e2e8f0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 220px;
    }
    .item-model-badge {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 0.1rem 0.35rem;
      border-radius: 3px;
      text-transform: uppercase;
      background: #0b0f17;
      border: 1px solid #334155;
    }
    .item-model-badge.nemotron { color: var(--green); border-color: rgba(16, 185, 129, 0.3); }
    .item-model-badge.deepseek { color: var(--accent); border-color: rgba(56, 189, 248, 0.3); }
    .item-model-badge.gemma { color: var(--purple); border-color: rgba(168, 85, 247, 0.3); }
    .item-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.7rem;
      color: var(--text-dim);
    }
    .status-tag {
      font-weight: 700;
      font-size: 0.65rem;
    }
    .status-tag.completed { color: var(--green); }
    .status-tag.running { color: var(--amber); }
    .status-tag.failed { color: var(--red); }
    /* Panel de Detalle Principal */
    .detail-panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .tabs-bar {
      display: flex;
      background: #0d131f;
      border-bottom: 1px solid var(--border);
    }
    .tab-item {
      padding: 0.65rem 1.1rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
      background: transparent;
      border: none;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.15s ease;
    }
    .tab-item:hover { color: #fff; }
    .tab-item.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
      background: rgba(56, 189, 248, 0.04);
    }
    .tab-body {
      padding: 1.25rem;
      overflow-y: auto;
      flex: 1;
      max-height: calc(100vh - 290px);
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    /* Tabla Técnica Limpia (Exacta a OpenCode Imagen 2) */
    .tech-table-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.5rem 1.5rem;
      background: #0e1523;
      border: 1px solid var(--border);
      border-radius: 0.4rem;
      padding: 1rem;
    }
    .tech-row {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      padding: 0.35rem 0;
      font-size: 0.75rem;
    }
    .tech-key { color: var(--text-dim); }
    .tech-val { font-weight: 600; color: #e2e8f0; font-family: monospace; }
    .tech-val.highlight { color: var(--accent); }
    .tech-val.green { color: var(--green); }
    /* Lista de Mensajes en Bruto */
    .raw-msgs-box {
      border: 1px solid var(--border);
      border-radius: 0.4rem;
      overflow: hidden;
      font-family: monospace;
      font-size: 0.72rem;
    }
    .raw-msg-row {
      display: flex;
      justify-content: space-between;
      padding: 0.4rem 0.75rem;
      background: #0e1523;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    }
    .raw-msg-row:last-child { border-bottom: none; }
    /* Bloques de Texto / CoT */
    .code-view {
      background: #080c14;
      border: 1px solid var(--border);
      border-radius: 0.4rem;
      padding: 1rem;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.78rem;
      line-height: 1.5;
      color: #cbd5e1;
      white-space: pre-wrap;
      overflow-x: auto;
      flex: 1;
    }
  </style>
</head>
<body>
  <header>
    <div class="header-left">
      <div class="logo">
        <span style="color: var(--accent);">⬡</span> OpenBridge Console
      </div>
      <span class="status-badge">
        <span class="status-dot"></span> OPENCODE ENGINE ONLINE (PORT 4096)
      </span>
    </div>
    <div class="header-right">
      <span>Auto-Sincronización: <strong>2s</strong></span>
      <span style="color: var(--green);">● Live REST + SSE</span>
    </div>
  </header>

  <main>
    <!-- KPIs -->
    <div class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-label">Tokens Totales</div>
        <div class="kpi-value" id="kpi-tokens-total">0</div>
        <div class="kpi-sub">
          <span>In: <strong id="kpi-tokens-in">0</strong></span>
          <span>Out: <strong id="kpi-tokens-out">0</strong></span>
          <span>CoT: <strong id="kpi-tokens-cot" style="color: var(--accent);">0</strong></span>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Sesiones Registradas</div>
        <div class="kpi-value" id="kpi-tasks-total">0</div>
        <div class="kpi-sub">
          <span>Completadas: <strong id="kpi-tasks-done" style="color: var(--green);">0</strong></span>
          <span>En curso: <strong id="kpi-tasks-active" style="color: var(--amber);">0</strong></span>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Costo Total Satélite</div>
        <div class="kpi-value" style="color: var(--green);">0,00 US$</div>
        <div class="kpi-sub">100% Cuota Antigravity Libre</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Tiempo Total de Cómputo</div>
        <div class="kpi-value" id="kpi-total-time">0s</div>
        <div class="kpi-sub">Tiempo Satélites Desviado</div>
      </div>
    </div>

    <!-- Distribución de Tokens por Familia de Modelo -->
    <div class="model-bar-panel">
      <div class="model-bar-header">
        <span>Consumo por Familia de Modelo</span>
        <span id="model-total-label">0 tokens acumulados</span>
      </div>
      <div class="model-pills-row">
        <div class="model-pill">
          <span class="pill-circle nemotron"></span>
          <span>Nemotron (NVIDIA): <strong id="model-nemotron-tok">0</strong> tok (<span id="model-nemotron-pct">0%</span>)</span>
        </div>
        <div class="model-pill">
          <span class="pill-circle deepseek"></span>
          <span>DeepSeek Flash: <strong id="model-deepseek-tok">0</strong> tok (<span id="model-deepseek-pct">0%</span>)</span>
        </div>
        <div class="model-pill">
          <span class="pill-circle gemma"></span>
          <span>Gemma (Google / OpenRouter): <strong id="model-gemma-tok">0</strong> tok (<span id="model-gemma-pct">0%</span>)</span>
        </div>
      </div>
    </div>

    <!-- Workspace Master-Detail -->
    <div class="workspace-grid">
      <!-- Columna Izquierda: Historial -->
      <div class="sidebar-panel">
        <div class="sidebar-header">
          <span style="font-weight: 700; font-size: 0.75rem;">Historial (<span id="filter-count">0</span>)</span>
          <div class="filter-btn-group">
            <button class="filter-btn active" onclick="setFilter('real')">Generación</button>
            <button class="filter-btn" onclick="setFilter('all')">Todos</button>
            <button class="filter-btn" onclick="setFilter('running')">En Curso</button>
          </div>
        </div>
        <div class="tasks-list" id="tasks-list">
          <div style="padding: 1.5rem; text-align: center; color: var(--text-dim);">Cargando sesiones...</div>
        </div>
      </div>

      <!-- Columna Derecha: Detalle Técnico Anatómico -->
      <div class="detail-panel">
        <div class="tabs-bar">
          <button class="tab-item active" onclick="setTab('context')">Contexto & Ficha Técnica</button>
          <button class="tab-item" onclick="setTab('reasoning')">Razonamiento CoT (Pensamiento)</button>
          <button class="tab-item" onclick="setTab('output')">Respuesta Generada</button>
          <button class="tab-item" onclick="setTab('diff')">Diff de Archivos</button>
        </div>

        <!-- Tab 1: Ficha Técnica (Exacta a Imagen 2) -->
        <div class="tab-body" id="tab-context">
          <div class="tech-table-grid" id="tech-matrix">
            <div style="color: var(--text-dim); grid-column: 1 / -1;">Selecciona una sesión de la columna izquierda.</div>
          </div>
          <div style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: var(--text-dim);">Mensajes en Bruto Registrados</div>
          <div class="raw-msgs-box" id="raw-msgs-box"></div>
        </div>

        <!-- Tab 2: CoT -->
        <div class="tab-body" id="tab-reasoning" style="display: none;">
          <div style="font-size: 0.72rem; color: var(--accent); font-weight: 600;">Pensamiento interno paso a paso extraído del modelo:</div>
          <div class="code-view" id="box-reasoning">Sin razonamiento disponible para esta sesión.</div>
        </div>

        <!-- Tab 3: Output -->
        <div class="tab-body" id="tab-output" style="display: none;">
          <div class="code-view" id="box-output">Selecciona una sesión.</div>
        </div>

        <!-- Tab 4: Diff -->
        <div class="tab-body" id="tab-diff" style="display: none;">
          <div class="code-view" id="box-diff">Sin modificaciones de archivos registradas.</div>
        </div>
      </div>
    </div>
  </main>

  <script>
    let allSessions = [];
    let selectedId = null;
    let activeFilter = 'real'; // 'real', 'all', 'running'
    let activeTab = 'context';

    function setFilter(f) {
      activeFilter = f;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
      renderList();
    }

    function setTab(t) {
      activeTab = t;
      document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-body').forEach(c => c.style.display = 'none');
      event.target.classList.add('active');
      document.getElementById('tab-' + t).style.display = 'flex';
    }

    function formatNumber(n) {
      return (n || 0).toLocaleString();
    }

    function getFamily(modelStr) {
      const m = (modelStr || '').toLowerCase();
      if (m.includes('nemotron')) return 'nemotron';
      if (m.includes('deepseek')) return 'deepseek';
      if (m.includes('gemma')) return 'gemma';
      return 'nemotron';
    }

    async function loadSessions() {
      try {
        const res = await fetch('/api/sessions');
        const data = await res.json();
        allSessions = data.sessions || [];

        // KPIs
        document.getElementById('kpi-tokens-total').textContent = formatNumber(data.totals.tokensTotal);
        document.getElementById('kpi-tokens-in').textContent = formatNumber(data.totals.tokensInput);
        document.getElementById('kpi-tokens-out').textContent = formatNumber(data.totals.tokensOutput);
        document.getElementById('kpi-tokens-cot').textContent = formatNumber(data.totals.tokensReasoning);

        document.getElementById('kpi-tasks-total').textContent = allSessions.length;
        document.getElementById('kpi-tasks-done').textContent = allSessions.filter(s => s.status === 'COMPLETED').length;
        document.getElementById('kpi-tasks-active').textContent = allSessions.filter(s => s.status === 'RUNNING').length;
        document.getElementById('kpi-total-time').textContent = data.totals.durationSeconds + 's';

        // Desglose por Familia
        let nemoTok = 0, deepTok = 0, gemmaTok = 0;
        for (const [k, v] of Object.entries(data.modelBreakdown)) {
          const fam = getFamily(k);
          if (fam === 'nemotron') nemoTok += v;
          else if (fam === 'deepseek') deepTok += v;
          else if (fam === 'gemma') gemmaTok += v;
        }
        const total = nemoTok + deepTok + gemmaTok || 1;
        document.getElementById('model-total-label').textContent = formatNumber(data.totals.tokensTotal) + ' tokens acumulados';
        document.getElementById('model-nemotron-tok').textContent = formatNumber(nemoTok);
        document.getElementById('model-nemotron-pct').textContent = Math.round((nemoTok / total) * 100) + '%';
        document.getElementById('model-deepseek-tok').textContent = formatNumber(deepTok);
        document.getElementById('model-deepseek-pct').textContent = Math.round((deepTok / total) * 100) + '%';
        document.getElementById('model-gemma-tok').textContent = formatNumber(gemmaTok);
        document.getElementById('model-gemma-pct').textContent = Math.round((gemmaTok / total) * 100) + '%';

        renderList();

        if (allSessions.length > 0 && !selectedId) {
          const first = getFilteredSessions()[0];
          if (first) selectSession(first.id);
        } else if (selectedId) {
          loadDetail(selectedId);
        }
      } catch (err) {
        console.error('Error fetching sessions:', err);
      }
    }

    function getFilteredSessions() {
      if (activeFilter === 'running') {
        return allSessions.filter(s => s.status === 'RUNNING');
      }
      if (activeFilter === 'real') {
        // Tareas con salida sustancial (> 50 tokens) para omitir pings de 4-12 tokens
        return allSessions.filter(s => (s.tokens.output > 50 || s.tokens.reasoning > 50 || s.status === 'RUNNING'));
      }
      return allSessions;
    }

    function renderList() {
      const container = document.getElementById('tasks-list');
      const filtered = getFilteredSessions();
      document.getElementById('filter-count').textContent = filtered.length;

      if (filtered.length === 0) {
        container.innerHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--text-dim);">No hay sesiones para este filtro.</div>';
        return;
      }

      container.innerHTML = filtered.map(s => {
        const isSel = s.id === selectedId ? 'active' : '';
        const fam = getFamily(s.modelName);
        const stCls = s.status === 'RUNNING' ? 'running' : (s.outcome === 'failed' ? 'failed' : 'completed');
        const stText = s.status === 'RUNNING' ? 'EN CURSO' : (s.outcome === 'failed' ? 'FALLIDA' : 'COMPLETADA');
        const dur = s.durationSeconds ? s.durationSeconds + 's' : '0s';

        return \`
          <div class="task-item \${isSel}" onclick="selectSession('\${s.id}')">
            <div class="item-top">
              <span class="item-title" title="\${s.title || s.id}">\${s.title || s.id}</span>
              <span class="item-model-badge \${fam}">\${s.modelShortName}</span>
            </div>
            <div class="item-meta">
              <span class="status-tag \${stCls}">● \${stText} (\${dur})</span>
              <span>Tokens: <strong>\${formatNumber(s.tokens.total)}</strong></span>
            </div>
          </div>
        \`;
      }).join('');
    }

    async function selectSession(id) {
      selectedId = id;
      renderList();
      await loadDetail(id);
    }

    async function loadDetail(id) {
      try {
        const res = await fetch('/api/session-detail?id=' + encodeURIComponent(id));
        const data = await res.json();
        const s = data.session;

        // Ficha Técnica (Exacta a Imagen 2)
        const matrix = document.getElementById('tech-matrix');
        matrix.innerHTML = \`
          <div class="tech-row"><span class="tech-key">Sesión</span><span class="tech-val highlight">\${s.title || s.id}</span></div>
          <div class="tech-row"><span class="tech-key">Mensajes</span><span class="tech-val">\${data.messagesCount}</span></div>
          <div class="tech-row"><span class="tech-key">Proveedor</span><span class="tech-val">\${s.providerID || 'OpenCode'}</span></div>
          <div class="tech-row"><span class="tech-key">Modelo</span><span class="tech-val highlight">\${data.modelName}</span></div>
          <div class="tech-row"><span class="tech-key">Límite de Contexto</span><span class="tech-val">1.048.576</span></div>
          <div class="tech-row"><span class="tech-key">Tokens Totales</span><span class="tech-val">\${formatNumber(data.tokensTotal)}</span></div>
          <div class="tech-row"><span class="tech-key">Uso de Ventana</span><span class="tech-val">\${Math.max(1, Math.round(((s.tokens?.input || 0) / 1048576) * 100))}%</span></div>
          <div class="tech-row"><span class="tech-key">Tokens de Entrada</span><span class="tech-val">\${formatNumber(s.tokens?.input || 0)}</span></div>
          <div class="tech-row"><span class="tech-key">Tokens de Salida</span><span class="tech-val">\${formatNumber(s.tokens?.output || 0)}</span></div>
          <div class="tech-row"><span class="tech-key">Tokens de Razonamiento</span><span class="tech-val highlight">\${formatNumber(s.tokens?.reasoning || 0)}</span></div>
          <div class="tech-row"><span class="tech-key">Tokens de Caché (R/W)</span><span class="tech-val">\${s.tokens?.cache?.read || 0} / \${s.tokens?.cache?.write || 0}</span></div>
          <div class="tech-row"><span class="tech-key">Costo Total</span><span class="tech-val green">0,00 US$</span></div>
          <div class="tech-row"><span class="tech-key">Sesión Creada</span><span class="tech-val">\${new Date(s.time?.created || Date.now()).toLocaleTimeString()}</span></div>
          <div class="tech-row"><span class="tech-key">Última Actividad</span><span class="tech-val">\${new Date(s.time?.updated || s.time?.idle || Date.now()).toLocaleTimeString()}</span></div>
        \`;

        // Mensajes en Bruto
        const rawBox = document.getElementById('raw-msgs-box');
        if (data.rawMessages && data.rawMessages.length > 0) {
          rawBox.innerHTML = data.rawMessages.map(m => {
            return \`
              <div class="raw-msg-row">
                <span><strong>\${m.type}</strong> • \${m.id}</span>
                <span style="color: var(--text-dim);">\${m.time}</span>
              </div>
            \`;
          }).join('');
        } else {
          rawBox.innerHTML = '<div style="padding: 0.5rem; color: var(--text-dim);">Sin mensajes.</div>';
        }

        // Bloques CoT y Output
        document.getElementById('box-reasoning').textContent = data.reasoningText || 'Esta sesión no generó cadena de razonamiento CoT independiente o ya fue consolidada en texto.';
        document.getElementById('box-output').textContent = data.outputText || 'Sin texto generado.';

        // Diff
        const diffBox = document.getElementById('box-diff');
        if (data.diffs && data.diffs.length > 0) {
          diffBox.textContent = data.diffs.map(d => \`--- \${d.file} ---\\n\${d.diff}\`).join('\\n\\n');
        } else {
          diffBox.textContent = 'Sin modificaciones en disco (Modo de lectura pura o consulta algorítmica).';
        }
      } catch (err) {
        console.error('Error loading detail:', err);
      }
    }

    loadSessions();
    setInterval(loadSessions, 2000);
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
          if (modelId.toLowerCase().includes('deepseek')) shortName = 'DeepSeek';
          else if (modelId.toLowerCase().includes('gemma')) shortName = 'Gemma';

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
        }).reverse();

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

    if (url.pathname === '/api/session-detail') {
      const sessionId = url.searchParams.get('id');
      if (!sessionId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Falta id' }));
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
      console.warn(`[OpenBridge Dashboard]: Puerto ${port} ocupado.`);
    } else {
      console.error('[OpenBridge Dashboard Error]:', err.message);
    }
  });

  serverInstance.listen(port, '127.0.0.1', () => {
    console.log(`[OpenBridge Console]: Servidor activo en http://127.0.0.1:${port}`);
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
