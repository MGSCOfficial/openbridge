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
  <title>OpenBridge Telemetry Console — Studio Command Center</title>
  <style>
    /* ==========================================================================
       OPENBRIDGE STUDIO COMMAND CENTER — LINEAR / RAYCAST ERGONOMIC THEME
       ========================================================================== */
    :root {
      --bg-root: #06080d;
      --bg-rail: #0a0d14;
      --bg-stream: #0d121c;
      --bg-inspector: #080c14;
      --bg-card: #121824;
      --bg-card-hover: #172030;
      --bg-card-active: #192438;
      --bg-inset: #05070b;
      --bg-pill: rgba(255, 255, 255, 0.05);

      --border-subtle: rgba(255, 255, 255, 0.05);
      --border-default: rgba(255, 255, 255, 0.09);
      --border-active: #38bdf8;
      --border-strong: rgba(255, 255, 255, 0.18);

      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --text-tertiary: #64748b;
      --text-muted: #475569;

      --accent: #38bdf8;
      --accent-glow: rgba(56, 189, 248, 0.25);
      --emerald: #10b981;
      --emerald-glow: rgba(16, 185, 129, 0.25);
      --amber: #f59e0b;
      --amber-glow: rgba(245, 158, 11, 0.25);
      --rose: #f43f5e;
      --violet: #a78bfa;

      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", "Helvetica Neue", sans-serif;
      --font-mono: ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      --ease: cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* Reset & Viewport Lock */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html, body {
      height: 100vh;
      width: 100vw;
      overflow: hidden;
      background: var(--bg-root);
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 13px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
    }

    /* Scrollbars Elegantes y Casi Invisibles */
    ::-webkit-scrollbar {
      width: 5px;
      height: 5px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.12);
      border-radius: 9999px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.25);
    }
    * {
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.12) transparent;
    }

    /* Estructura Principal: Flex Columna (HUD Superior + Workspace 3 Zonas) */
    .app-shell {
      display: flex;
      flex-direction: column;
      height: 100vh;
      width: 100vw;
    }

    /* ==========================================================================
       1. AMBIENT TOP HUD & COMMAND BAR (Reemplaza las 4 cajas cuadradas)
       ========================================================================== */
    .top-hud {
      height: 50px;
      background: var(--bg-rail);
      border-bottom: 1px solid var(--border-default);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 1.25rem;
      gap: 1rem;
      flex-shrink: 0;
      z-index: 100;
    }

    .hud-brand {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      font-weight: 700;
      font-size: 0.9rem;
      letter-spacing: -0.02em;
      color: #fff;
      white-space: nowrap;
    }

    .hud-brand-symbol {
      color: var(--accent);
      font-size: 1.15rem;
      filter: drop-shadow(0 0 6px var(--accent-glow));
    }

    .engine-active-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.25);
      color: var(--emerald);
      padding: 0.18rem 0.55rem;
      border-radius: 9999px;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--emerald);
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6);
      animation: pulse 2s infinite var(--ease);
    }
    @keyframes pulse {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6); }
      70% { transform: scale(1); box-shadow: 0 0 0 5px rgba(16, 185, 129, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }

    /* Ambient KPI Ribbon: Métricas inline compactas sin cajas cuadradas */
    .hud-telemetry-ribbon {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .hud-telemetry-ribbon::-webkit-scrollbar { display: none; }

    .telemetry-chip {
      background: var(--bg-pill);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 0.28rem 0.65rem;
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      font-size: 0.72rem;
      white-space: nowrap;
      transition: all 0.15s var(--ease);
    }
    .telemetry-chip:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: var(--border-default);
    }
    .telemetry-chip-label {
      color: var(--text-tertiary);
      font-weight: 600;
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .telemetry-chip-val {
      color: #fff;
      font-weight: 700;
      font-family: var(--font-mono);
      font-feature-settings: "tnum";
    }
    .telemetry-chip-val.green { color: var(--emerald); }
    .telemetry-chip-val.cyan { color: var(--accent); }

    .hud-actions {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      flex-shrink: 0;
    }

    .btn-hud {
      background: var(--bg-card);
      border: 1px solid var(--border-default);
      color: var(--text-secondary);
      padding: 0.28rem 0.65rem;
      border-radius: 6px;
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.15s var(--ease);
    }
    .btn-hud:hover {
      background: var(--bg-card-hover);
      border-color: var(--border-strong);
      color: #fff;
    }

    /* ==========================================================================
       2. WORKSPACE GRID — 3 ERGONOMIC ZONES
       ========================================================================== */
    .workspace-stage {
      display: grid;
      grid-template-columns: 260px 380px 1fr;
      flex: 1;
      height: calc(100vh - 50px);
      overflow: hidden;
    }

    @media (max-width: 1200px) {
      .workspace-stage { grid-template-columns: 240px 320px 1fr; }
    }
    @media (max-width: 960px) {
      .workspace-stage { grid-template-columns: 320px 1fr; }
      .zone-rail { display: none; }
    }

    /* ==========================================================================
       ZONE 1: ACTIVITY & NAVIGATION RAIL (LEFT)
       ========================================================================== */
    .zone-rail {
      background: var(--bg-rail);
      border-right: 1px solid var(--border-default);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 1rem 0.85rem;
      overflow-y: auto;
      gap: 1.25rem;
    }

    .rail-section {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .rail-heading {
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-tertiary);
      padding: 0 0.4rem;
      margin-bottom: 0.2rem;
    }

    .rail-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.45rem 0.65rem;
      border-radius: 6px;
      color: var(--text-secondary);
      cursor: pointer;
      font-weight: 500;
      font-size: 0.75rem;
      transition: all 0.15s var(--ease);
      border: 1px solid transparent;
      user-select: none;
    }
    .rail-item:hover {
      background: var(--bg-pill);
      color: var(--text-primary);
    }
    .rail-item.active {
      background: rgba(56, 189, 248, 0.08);
      border-color: rgba(56, 189, 248, 0.2);
      color: var(--accent);
      font-weight: 600;
    }

    .rail-item-content {
      display: flex;
      align-items: center;
      gap: 0.55rem;
    }

    .rail-badge {
      font-size: 0.65rem;
      font-family: var(--font-mono);
      background: var(--bg-card);
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      color: var(--text-tertiary);
    }
    .rail-item.active .rail-badge {
      color: var(--accent);
      background: rgba(56, 189, 248, 0.15);
    }

    /* Model Share Mini-Cards */
    .model-share-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 0.6rem 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .model-share-header {
      display: flex;
      justify-content: space-between;
      font-size: 0.7rem;
      font-weight: 600;
    }
    .share-meter {
      height: 4px;
      background: var(--bg-inset);
      border-radius: 9999px;
      overflow: hidden;
    }
    .share-fill {
      height: 100%;
      border-radius: 9999px;
      transition: width 0.4s var(--ease);
    }
    .share-fill.nemotron { background: var(--emerald); }
    .share-fill.deepseek { background: var(--accent); }
    .share-fill.gemma { background: var(--violet); }

    .rail-footer-card {
      background: var(--bg-inset);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 0.65rem;
      font-size: 0.68rem;
      color: var(--text-tertiary);
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    /* ==========================================================================
       ZONE 2: MASTER SESSION STREAM (CENTER)
       ========================================================================== */
    .zone-stream {
      background: var(--bg-stream);
      border-right: 1px solid var(--border-default);
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .stream-toolbar {
      padding: 0.75rem 0.85rem;
      background: var(--bg-rail);
      border-bottom: 1px solid var(--border-default);
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .stream-search-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }

    .stream-search-input {
      width: 100%;
      background: var(--bg-inset);
      border: 1px solid var(--border-default);
      border-radius: 6px;
      padding: 0.45rem 0.65rem 0.45rem 1.85rem;
      color: var(--text-primary);
      font-size: 0.75rem;
      font-family: var(--font-sans);
      outline: none;
      transition: all 0.15s var(--ease);
    }
    .stream-search-input:focus {
      border-color: var(--accent);
      background: #0a101a;
      box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.1);
    }
    .stream-search-input::placeholder { color: var(--text-tertiary); }

    .stream-search-icon {
      position: absolute;
      left: 0.6rem;
      color: var(--text-tertiary);
      font-size: 0.75rem;
      pointer-events: none;
    }

    .stream-count-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.68rem;
      color: var(--text-tertiary);
      font-weight: 600;
      padding: 0 0.2rem;
    }

    .stream-list {
      flex: 1;
      overflow-y: auto;
      padding: 0.6rem;
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
    }

    .stream-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 0.75rem 0.85rem;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      transition: all 0.18s var(--ease);
      position: relative;
    }
    .stream-card:hover {
      background: var(--bg-card-hover);
      border-color: var(--border-strong);
      transform: translateY(-1px);
    }
    .stream-card.active {
      background: var(--bg-card-active);
      border-color: var(--border-active);
      box-shadow: inset 3px 0 0 var(--accent), 0 4px 12px rgba(0, 0, 0, 0.25);
    }

    .card-row-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
    }

    .card-session-title {
      font-family: var(--font-mono);
      font-size: 0.78rem;
      font-weight: 700;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 230px;
    }

    .model-pill-badge {
      font-size: 0.62rem;
      font-weight: 700;
      padding: 0.12rem 0.4rem;
      border-radius: 4px;
      text-transform: uppercase;
      font-family: var(--font-mono);
      letter-spacing: 0.04em;
    }
    .model-pill-badge.nemotron {
      color: var(--emerald);
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.25);
    }
    .model-pill-badge.deepseek {
      color: var(--accent);
      background: rgba(56, 189, 248, 0.1);
      border: 1px solid rgba(56, 189, 248, 0.25);
    }
    .model-pill-badge.gemma {
      color: var(--violet);
      background: rgba(167, 139, 250, 0.1);
      border: 1px solid rgba(167, 139, 250, 0.25);
    }

    .card-row-bottom {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.7rem;
      color: var(--text-tertiary);
    }

    .status-pip {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-weight: 600;
    }
    .status-pip.completed { color: var(--emerald); }
    .status-pip.running { color: var(--amber); }
    .status-pip.failed { color: var(--rose); }

    .card-token-pill {
      font-family: var(--font-mono);
      font-weight: 600;
      color: var(--text-secondary);
    }

    /* ==========================================================================
       ZONE 3: DEEP TELEMETRY & CODE STUDIO (RIGHT - EXPANSIVE)
       ========================================================================== */
    .zone-inspector {
      background: var(--bg-inspector);
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    /* Inspector Header: Breadcrumbs & Actions */
    .inspector-header {
      background: var(--bg-rail);
      border-bottom: 1px solid var(--border-default);
      padding: 0.75rem 1.25rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      flex-shrink: 0;
    }

    .session-breadcrumbs {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8rem;
    }
    .crumb-root { color: var(--text-tertiary); }
    .crumb-divider { color: var(--text-muted); font-size: 0.7rem; }
    .crumb-active {
      font-family: var(--font-mono);
      font-weight: 700;
      color: #fff;
    }

    .inspector-actions-bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    /* Context Horizon Gauge: medidor de ventana ultra nítido */
    .context-horizon-strip {
      background: var(--bg-rail);
      border-bottom: 1px solid var(--border-subtle);
      padding: 0.55rem 1.25rem;
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-shrink: 0;
    }

    .horizon-bar-track {
      flex: 1;
      height: 4px;
      background: var(--bg-inset);
      border-radius: 9999px;
      overflow: hidden;
    }
    .horizon-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--emerald), var(--accent));
      width: 1%;
      border-radius: 9999px;
      transition: width 0.3s var(--ease);
    }

    .horizon-label {
      font-family: var(--font-mono);
      font-size: 0.7rem;
      color: var(--text-tertiary);
      white-space: nowrap;
    }

    /* Tabs Segmentados Estilo Linear */
    .inspector-tabs-nav {
      background: var(--bg-rail);
      border-bottom: 1px solid var(--border-default);
      padding: 0 1.25rem;
      display: flex;
      gap: 0.3rem;
      flex-shrink: 0;
      overflow-x: auto;
    }

    .tab-nav-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.65rem 0.95rem;
      cursor: pointer;
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      transition: all 0.15s var(--ease);
      white-space: nowrap;
    }
    .tab-nav-btn:hover { color: #fff; }
    .tab-nav-btn.active {
      color: var(--accent);
    }
    .tab-nav-btn.active::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--accent);
      border-radius: 2px 2px 0 0;
      box-shadow: 0 0 8px var(--accent-glow);
    }

    /* Área de Contenido del Inspector */
    .inspector-view-area {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    /* Ficha Técnica: High-Density Property Spec Inspector */
    .property-deck {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
    }
    @media (max-width: 1100px) {
      .property-deck { grid-template-columns: 1fr; }
    }

    .prop-card {
      background: var(--bg-card);
      border: 1px solid var(--border-default);
      border-radius: 8px;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }

    .prop-card-title {
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-tertiary);
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .prop-list {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .prop-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.3rem 0;
      border-bottom: 1px solid var(--border-subtle);
      font-size: 0.75rem;
    }
    .prop-row:last-child { border-bottom: none; }

    .prop-label {
      color: var(--text-tertiary);
      font-weight: 500;
    }
    .prop-value {
      font-family: var(--font-mono);
      font-weight: 600;
      color: #fff;
      font-feature-settings: "tnum";
    }
    .prop-value.cyan { color: var(--accent); }
    .prop-value.emerald { color: var(--emerald); }

    /* Timeline de Mensajes Crudos */
    .msg-timeline {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      background: var(--bg-card);
      border: 1px solid var(--border-default);
      border-radius: 8px;
      padding: 1rem;
    }

    .timeline-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.5rem 0.75rem;
      background: var(--bg-inset);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      font-family: var(--font-mono);
      font-size: 0.72rem;
    }

    .role-badge {
      font-size: 0.62rem;
      font-weight: 700;
      padding: 0.12rem 0.4rem;
      border-radius: 4px;
      text-transform: uppercase;
      margin-right: 0.5rem;
    }
    .role-badge.user { background: rgba(56, 189, 248, 0.15); color: var(--accent); }
    .role-badge.assistant { background: rgba(16, 185, 129, 0.15); color: var(--emerald); }
    .role-badge.idle { background: rgba(148, 163, 184, 0.12); color: var(--text-tertiary); }
    .role-badge.system { background: rgba(167, 139, 250, 0.15); color: var(--violet); }

    /* Visor de Código / Terminal CoT / Diff */
    .editor-container {
      background: var(--bg-inset);
      border: 1px solid var(--border-default);
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      flex: 1;
      min-height: 480px;
    }

    .editor-top-bar {
      background: #090e17;
      border-bottom: 1px solid var(--border-subtle);
      padding: 0.5rem 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.72rem;
      color: var(--text-tertiary);
    }

    .editor-content {
      padding: 1.25rem;
      font-family: var(--font-mono);
      font-size: 0.8rem;
      line-height: 1.65;
      color: #e2e8f0;
      white-space: pre-wrap;
      overflow: auto;
      flex: 1;
    }

    .diff-add { color: #34d399; background: rgba(16, 185, 129, 0.08); display: block; }
    .diff-del { color: #f87171; background: rgba(244, 63, 94, 0.08); display: block; }
    .diff-info { color: #38bdf8; font-weight: 700; display: block; }

    /* Empty States */
    .empty-placeholder {
      padding: 4rem 2rem;
      text-align: center;
      color: var(--text-tertiary);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
    }
    .empty-icon {
      font-size: 2.2rem;
      opacity: 0.35;
    }
  </style>
</head>
<body>
  <div class="app-shell">
    <!-- ====================================================================
         TOP AMBIENT HUD & TELEMETRY RIBBON
         ==================================================================== -->
    <header class="top-hud">
      <div class="hud-brand">
        <span class="hud-brand-symbol">⬡</span>
        <span>OpenBridge Telemetry</span>
        <span class="engine-active-pill">
          <span class="pulse-dot"></span> Online :4096
        </span>
      </div>

      <!-- Métricas Integradas en Línea (Sin cajas cuadradas que estorben) -->
      <div class="hud-telemetry-ribbon">
        <div class="telemetry-chip" title="Tokens procesados en todos los satélites locales">
          <span class="telemetry-chip-label">Tokens:</span>
          <span class="telemetry-chip-val cyan" id="hud-tok-total">0</span>
          <span style="color: var(--text-muted); font-size: 0.65rem;">(In: <span id="hud-tok-in">0</span> • Out: <span id="hud-tok-out">0</span> • CoT: <span id="hud-tok-cot">0</span>)</span>
        </div>
        <div class="telemetry-chip" title="Sesiones registradas en el clúster OpenCode">
          <span class="telemetry-chip-label">Sesiones:</span>
          <span class="telemetry-chip-val" id="hud-ses-total">0</span>
        </div>
        <div class="telemetry-chip" title="Costo satélite facturado">
          <span class="telemetry-chip-label">Costo:</span>
          <span class="telemetry-chip-val green">0,00 US$</span>
          <span style="color: var(--emerald); font-size: 0.65rem;">(100% Cuota Libre)</span>
        </div>
        <div class="telemetry-chip" title="Tiempo total de cómputo offloaded">
          <span class="telemetry-chip-label">Cómputo:</span>
          <span class="telemetry-chip-val" id="hud-comp-time">0s</span>
        </div>
      </div>

      <div class="hud-actions">
        <button class="btn-hud" onclick="loadSessions()">
          <span>↻</span> Sincronizar
        </button>
        <button class="btn-hud" onclick="exportTelemetryJson()">
          <span>↓</span> Exportar
        </button>
      </div>
    </header>

    <!-- ====================================================================
         MAIN WORKSPACE: 3 ERGONOMIC ZONES
         ==================================================================== -->
    <main class="workspace-stage">
      <!-- ------------------------------------------------------------------
           ZONE 1: ACTIVITY & NAVIGATION RAIL (LEFT)
           ------------------------------------------------------------------ -->
      <aside class="zone-rail">
        <div style="display: flex; flex-direction: column; gap: 1.25rem;">
          <div class="rail-section">
            <div class="rail-heading">Vistas de Filtrado</div>
            <div class="rail-item active" id="rail-filter-real" onclick="setRailFilter('real')">
              <div class="rail-item-content">
                <span>⭐</span> <span>Tareas de Código</span>
              </div>
              <span class="rail-badge" id="rail-count-real">0</span>
            </div>
            <div class="rail-item" id="rail-filter-all" onclick="setRailFilter('all')">
              <div class="rail-item-content">
                <span>📋</span> <span>Todo el Historial</span>
              </div>
              <span class="rail-badge" id="rail-count-all">0</span>
            </div>
            <div class="rail-item" id="rail-filter-running" onclick="setRailFilter('running')">
              <div class="rail-item-content">
                <span>⚡</span> <span>En Ejecución</span>
              </div>
              <span class="rail-badge" id="rail-count-running">0</span>
            </div>
          </div>

          <div class="rail-section">
            <div class="rail-heading">Distribución por Satélite</div>
            <div class="model-share-card">
              <div class="model-share-header">
                <span style="color: var(--emerald);">🟢 Nemotron 3.5</span>
                <span id="rail-pct-nemo" style="font-family: var(--font-mono);">0%</span>
              </div>
              <div class="share-meter">
                <div class="share-fill nemotron" id="rail-bar-nemo" style="width: 0%;"></div>
              </div>
              <div style="font-size: 0.65rem; color: var(--text-tertiary); font-family: var(--font-mono);">
                <span id="rail-tok-nemo">0</span> tokens
              </div>
            </div>

            <div class="model-share-card">
              <div class="model-share-header">
                <span style="color: var(--accent);">🔵 DeepSeek Flash</span>
                <span id="rail-pct-deep" style="font-family: var(--font-mono);">0%</span>
              </div>
              <div class="share-meter">
                <div class="share-fill deepseek" id="rail-bar-deep" style="width: 0%;"></div>
              </div>
              <div style="font-size: 0.65rem; color: var(--text-tertiary); font-family: var(--font-mono);">
                <span id="rail-tok-deep">0</span> tokens
              </div>
            </div>

            <div class="model-share-card">
              <div class="model-share-header">
                <span style="color: var(--violet);">🟣 Gemma 4 (Satélite)</span>
                <span id="rail-pct-gemma" style="font-family: var(--font-mono);">0%</span>
              </div>
              <div class="share-meter">
                <div class="share-fill gemma" id="rail-bar-gemma" style="width: 0%;"></div>
              </div>
              <div style="font-size: 0.65rem; color: var(--text-tertiary); font-family: var(--font-mono);">
                <span id="rail-tok-gemma">0</span> tokens (429 rate limit)
              </div>
            </div>
          </div>
        </div>

        <div class="rail-footer-card">
          <div style="font-weight: 700; color: var(--text-secondary);">OpenCode Native Hub</div>
          <div>SSE Transport: <strong style="color: var(--emerald);">Activo</strong></div>
          <div>Puerto: <span style="font-family: var(--font-mono);">127.0.0.1:4096</span></div>
        </div>
      </aside>

      <!-- ------------------------------------------------------------------
           ZONE 2: MASTER SESSION STREAM (CENTER)
           ------------------------------------------------------------------ -->
      <section class="zone-stream">
        <div class="stream-toolbar">
          <div class="stream-search-wrap">
            <span class="stream-search-icon">🔍</span>
            <input type="text" class="stream-search-input" id="search-input" placeholder="Buscar sesión, modelo o hash..." oninput="handleSearch(this.value)">
          </div>
          <div class="stream-count-row">
            <span>SESIONES DISPONIBLES</span>
            <span id="stream-count-label" style="font-family: var(--font-mono);">0 mostradas</span>
          </div>
        </div>

        <div class="stream-list" id="stream-list">
          <div class="empty-placeholder">
            <div class="empty-icon">⏳</div>
            <div>Cargando flujo de sesiones...</div>
          </div>
        </div>
      </section>

      <!-- ------------------------------------------------------------------
           ZONE 3: DEEP TELEMETRY & CODE STUDIO (RIGHT)
           ------------------------------------------------------------------ -->
      <section class="zone-inspector">
        <!-- Inspector Top Bar -->
        <div class="inspector-header">
          <div class="session-breadcrumbs">
            <span class="crumb-root">Sesión</span>
            <span class="crumb-divider">/</span>
            <span class="crumb-active" id="active-session-title">Selecciona una sesión</span>
          </div>
          <div class="inspector-actions-bar">
            <button class="btn-hud" onclick="copyActiveSessionId()">
              <span>📋</span> Copiar ID
            </button>
            <button class="btn-hud" onclick="copyCurrentTabContent()">
              <span>💾</span> Copiar Vista
            </button>
          </div>
        </div>

        <!-- Context Horizon Meter -->
        <div class="context-horizon-strip">
          <div class="horizon-bar-track">
            <div class="horizon-bar-fill" id="horizon-fill" style="width: 1%;"></div>
          </div>
          <div class="horizon-label" id="horizon-label">0 / 1.048.576 tokens (0%)</div>
        </div>

        <!-- Segmented Tab Navigation -->
        <nav class="inspector-tabs-nav">
          <button class="tab-nav-btn active" onclick="switchInspectorTab('spec')">
            <span>📋</span> Ficha Técnica & Auditoría
          </button>
          <button class="tab-nav-btn" onclick="switchInspectorTab('cot')">
            <span>🧠</span> Pensamiento CoT
          </button>
          <button class="tab-nav-btn" onclick="switchInspectorTab('solution')">
            <span>💬</span> Código & Respuesta
          </button>
          <button class="tab-nav-btn" onclick="switchInspectorTab('diff')">
            <span>📝</span> Diff de Archivos
          </button>
          <button class="tab-nav-btn" onclick="switchInspectorTab('raw')">
            <span>⚡</span> REST Raw Payload
          </button>
        </nav>

        <!-- Inspector Content Body -->
        <div class="inspector-view-area">
          <!-- VIEW 1: SPEC & AUDIT -->
          <div id="view-spec" style="display: flex; flex-direction: column; gap: 1.25rem;">
            <div class="property-deck">
              <!-- Card 1: Metadatos -->
              <div class="prop-card">
                <div class="prop-card-title">
                  <span>⚙️</span> Metadatos del Trabajo
                </div>
                <div class="prop-list">
                  <div class="prop-row"><span class="prop-label">ID de Sesión</span><span class="prop-value cyan" id="spec-id">-</span></div>
                  <div class="prop-row"><span class="prop-label">Proveedor</span><span class="prop-value" id="spec-provider">-</span></div>
                  <div class="prop-row"><span class="prop-label">Modelo Activo</span><span class="prop-value cyan" id="spec-model">-</span></div>
                  <div class="prop-row"><span class="prop-label">Mensajes Registrados</span><span class="prop-value" id="spec-msgs">-</span></div>
                  <div class="prop-row"><span class="prop-label">Duración de Ejecución</span><span class="prop-value" id="spec-duration">-</span></div>
                  <div class="prop-row"><span class="prop-label">Hora de Creación</span><span class="prop-value" id="spec-time">-</span></div>
                </div>
              </div>

              <!-- Card 2: Telemetría de Tokens -->
              <div class="prop-card">
                <div class="prop-card-title">
                  <span>⚡</span> Telemetría de Tokens y Cuota
                </div>
                <div class="prop-list">
                  <div class="prop-row"><span class="prop-label">Tokens Totales</span><span class="prop-value" id="spec-tok-total">-</span></div>
                  <div class="prop-row"><span class="prop-label">Tokens de Entrada</span><span class="prop-value" id="spec-tok-in">-</span></div>
                  <div class="prop-row"><span class="prop-label">Tokens de Salida</span><span class="prop-value" id="spec-tok-out">-</span></div>
                  <div class="prop-row"><span class="prop-label">Tokens de Razonamiento</span><span class="prop-value cyan" id="spec-tok-cot">-</span></div>
                  <div class="prop-row"><span class="prop-label">Caché Lectura / Escritura</span><span class="prop-value" id="spec-tok-cache">-</span></div>
                  <div class="prop-row"><span class="prop-label">Costo Satélite Facturado</span><span class="prop-value emerald">0,00 US$</span></div>
                </div>
              </div>
            </div>

            <!-- Card 3: Historial de Mensajes -->
            <div class="msg-timeline">
              <div class="prop-card-title" style="margin-bottom: 0.25rem;">
                <span>📜</span> Registro Cronológico de Eventos (OpenCode Message Bus)
              </div>
              <div id="timeline-container">
                <div style="color: var(--text-tertiary); text-align: center; padding: 1rem;">Selecciona una sesión.</div>
              </div>
            </div>
          </div>

          <!-- VIEW 2: PENSAMIENTO COT -->
          <div id="view-cot" style="display: none; height: 100%;">
            <div class="editor-container">
              <div class="editor-top-bar">
                <span id="cot-bar-label">Cadena de Razonamiento CoT</span>
                <span>Runtime Interno</span>
              </div>
              <div class="editor-content" id="editor-cot">Sin razonamiento CoT independiente.</div>
            </div>
          </div>

          <!-- VIEW 3: CÓDIGO & RESPUESTA -->
          <div id="view-solution" style="display: none; height: 100%;">
            <div class="editor-container">
              <div class="editor-top-bar">
                <span id="solution-bar-label">Respuesta del Modelo</span>
                <span>Buffer de Salida</span>
              </div>
              <div class="editor-content" id="editor-solution">Selecciona una sesión.</div>
            </div>
          </div>

          <!-- VIEW 4: DIFF DE ARCHIVOS -->
          <div id="view-diff" style="display: none; height: 100%;">
            <div class="editor-container">
              <div class="editor-top-bar">
                <span>Diff Unificado de Archivos Modificados</span>
                <span>Git Patch Viewer</span>
              </div>
              <div class="editor-content" id="editor-diff">Sin cambios en disco.</div>
              <pre id="editor-diff-raw" style="display: none;"></pre>
            </div>
          </div>

          <!-- VIEW 5: REST RAW PAYLOAD -->
          <div id="view-raw" style="display: none; height: 100%;">
            <div class="editor-container">
              <div class="editor-top-bar">
                <span>Payload JSON Nativo (/api/session/{id})</span>
                <span>OpenCode REST</span>
              </div>
              <div class="editor-content" id="editor-raw">{}</div>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>

  <!-- SCRIPT DE REACTIVIDAD SPA -->
  <script>
    let allSessions = [];
    let selectedId = null;
    let activeRailFilter = 'real';
    let searchQuery = '';
    let currentInspectorTab = 'spec';
    let currentDetail = null;

    function formatNumber(n) {
      return (n || 0).toLocaleString('es-ES');
    }

    function formatCompact(n) {
      if (!n) return '0';
      if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
      return n.toString();
    }

    function formatTime(s) {
      if (!s) return '0s';
      if (s < 60) return s + 's';
      const m = Math.floor(s / 60);
      const rem = s % 60;
      return m + 'm ' + (rem > 0 ? rem + 's' : '');
    }

    function getFamily(modelStr) {
      const m = (modelStr || '').toLowerCase();
      if (m.includes('nemotron')) return 'nemotron';
      if (m.includes('deepseek')) return 'deepseek';
      if (m.includes('gemma')) return 'gemma';
      return 'nemotron';
    }

    function setRailFilter(f) {
      activeRailFilter = f;
      document.querySelectorAll('.rail-item').forEach(el => el.classList.remove('active'));
      const activeEl = document.getElementById('rail-filter-' + f);
      if (activeEl) activeEl.classList.add('active');
      renderStream();
    }

    function handleSearch(q) {
      searchQuery = (q || '').trim().toLowerCase();
      renderStream();
    }

    function switchInspectorTab(tabKey) {
      currentInspectorTab = tabKey;
      document.querySelectorAll('.tab-nav-btn').forEach(btn => btn.classList.remove('active'));
      ['spec', 'cot', 'solution', 'diff', 'raw'].forEach(k => {
        const v = document.getElementById('view-' + k);
        if (v) v.style.display = 'none';
      });

      if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
      }

      const activeView = document.getElementById('view-' + tabKey);
      if (activeView) activeView.style.display = (tabKey === 'spec' ? 'flex' : 'block');
    }

    function copyActiveSessionId() {
      if (selectedId) {
        navigator.clipboard.writeText(selectedId);
        alert('ID de sesión copiado: ' + selectedId);
      }
    }

    function copyCurrentTabContent() {
      let text = '';
      if (currentInspectorTab === 'cot') text = document.getElementById('editor-cot').textContent;
      else if (currentInspectorTab === 'solution') text = document.getElementById('editor-solution').textContent;
      else if (currentInspectorTab === 'diff') text = document.getElementById('editor-diff-raw').textContent;
      else if (currentInspectorTab === 'raw') text = document.getElementById('editor-raw').textContent;
      else text = JSON.stringify(currentDetail, null, 2);

      navigator.clipboard.writeText(text || '');
      alert('Contenido copiado al portapapeles');
    }

    function exportTelemetryJson() {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allSessions, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", "openbridge_telemetry_" + Date.now() + ".json");
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    }

    function getFilteredSessions() {
      return allSessions.filter(s => {
        if (activeRailFilter === 'running' && s.status !== 'RUNNING') return false;
        if (activeRailFilter === 'real') {
          const isReal = (s.tokens.output > 50 || s.tokens.reasoning > 50 || s.status === 'RUNNING');
          if (!isReal) return false;
        }

        if (searchQuery) {
          const matchTitle = (s.title || '').toLowerCase().includes(searchQuery);
          const matchId = (s.id || '').toLowerCase().includes(searchQuery);
          const matchModel = (s.modelName || '').toLowerCase().includes(searchQuery);
          if (!matchTitle && !matchId && !matchModel) return false;
        }

        return true;
      });
    }

    async function loadSessions() {
      try {
        const res = await fetch('/api/sessions');
        const data = await res.json();
        allSessions = data.sessions || [];

        // HUD Inline Telemetry
        document.getElementById('hud-tok-total').textContent = formatCompact(data.totals.tokensTotal);
        document.getElementById('hud-tok-in').textContent = formatCompact(data.totals.tokensInput);
        document.getElementById('hud-tok-out').textContent = formatCompact(data.totals.tokensOutput);
        document.getElementById('hud-tok-cot').textContent = formatCompact(data.totals.tokensReasoning);
        document.getElementById('hud-ses-total').textContent = allSessions.length;
        document.getElementById('hud-comp-time').textContent = formatTime(data.totals.durationSeconds);

        // Conteo en filtros de rail
        const realCount = allSessions.filter(s => (s.tokens.output > 50 || s.tokens.reasoning > 50 || s.status === 'RUNNING')).length;
        const runCount = allSessions.filter(s => s.status === 'RUNNING').length;
        document.getElementById('rail-count-real').textContent = realCount;
        document.getElementById('rail-count-all').textContent = allSessions.length;
        document.getElementById('rail-count-running').textContent = runCount;

        // Desglose por Satélite en Rail
        let nemoTok = 0, deepTok = 0, gemmaTok = 0;
        for (const [k, v] of Object.entries(data.modelBreakdown || {})) {
          const fam = getFamily(k);
          if (fam === 'nemotron') nemoTok += v;
          else if (fam === 'deepseek') deepTok += v;
          else if (fam === 'gemma') gemmaTok += v;
        }
        const total = nemoTok + deepTok + gemmaTok || 1;
        const pNemo = Math.round((nemoTok / total) * 100);
        const pDeep = Math.round((deepTok / total) * 100);
        const pGemma = Math.round((gemmaTok / total) * 100);

        document.getElementById('rail-pct-nemo').textContent = pNemo + '%';
        document.getElementById('rail-bar-nemo').style.width = pNemo + '%';
        document.getElementById('rail-tok-nemo').textContent = formatCompact(nemoTok);

        document.getElementById('rail-pct-deep').textContent = pDeep + '%';
        document.getElementById('rail-bar-deep').style.width = pDeep + '%';
        document.getElementById('rail-tok-deep').textContent = formatCompact(deepTok);

        document.getElementById('rail-pct-gemma').textContent = pGemma + '%';
        document.getElementById('rail-bar-gemma').style.width = pGemma + '%';
        document.getElementById('rail-tok-gemma').textContent = formatCompact(gemmaTok);

        renderStream();

        if (allSessions.length > 0 && !selectedId) {
          const first = getFilteredSessions()[0];
          if (first) selectSession(first.id);
        } else if (selectedId) {
          loadSessionDetail(selectedId);
        }
      } catch (err) {
        console.error('Error cargando sesiones:', err);
      }
    }

    function renderStream() {
      const container = document.getElementById('stream-list');
      const filtered = getFilteredSessions();
      document.getElementById('stream-count-label').textContent = filtered.length + ' mostradas';

      if (filtered.length === 0) {
        container.innerHTML = \`
          <div class="empty-placeholder">
            <div class="empty-icon">🔍</div>
            <div>No hay sesiones que coincidan con los criterios.</div>
          </div>\`;
        return;
      }

      container.innerHTML = filtered.map(s => {
        const isSel = s.id === selectedId ? 'active' : '';
        const fam = getFamily(s.modelName);
        const isRunning = s.status === 'RUNNING';
        const stCls = isRunning ? 'running' : (s.outcome === 'failed' ? 'failed' : 'completed');
        const stText = isRunning ? 'EN CURSO' : (s.outcome === 'failed' ? 'FALLIDA' : 'COMPLETADA');
        const durText = formatTime(s.durationSeconds);

        return \`
          <div class="stream-card \${isSel}" onclick="selectSession('\${s.id}')">
            <div class="card-row-top">
              <span class="card-session-title" title="\${s.title || s.id}">\${s.title || s.id}</span>
              <span class="model-pill-badge \${fam}">\${s.modelShortName}</span>
            </div>
            <div class="card-row-bottom">
              <span class="status-pip \${stCls}">● \${stText} (\${durText})</span>
              <span class="card-token-pill">\${formatCompact(s.tokens.total)} tok</span>
            </div>
          </div>
        \`;
      }).join('');
    }

    async function selectSession(id) {
      selectedId = id;
      renderStream();
      await loadSessionDetail(id);
    }

    async function loadSessionDetail(id) {
      try {
        const res = await fetch('/api/session-detail?id=' + encodeURIComponent(id));
        const data = await res.json();
        currentDetail = data;
        const s = data.session;

        // Breadcrumb
        document.getElementById('active-session-title').textContent = s.title || s.id;

        // Horizon Meter
        const inTok = s.tokens?.input || 0;
        const maxContext = 1048576;
        const pctUsed = Math.max(1, Math.min(100, Math.round((inTok / maxContext) * 100)));
        document.getElementById('horizon-fill').style.width = pctUsed + '%';
        document.getElementById('horizon-label').textContent = \`\${formatNumber(inTok)} / \${formatNumber(maxContext)} tokens (\${pctUsed}%) • \${formatNumber(maxContext - inTok)} disponibles\`;

        // Spec Deck
        document.getElementById('spec-id').textContent = s.title || s.id;
        document.getElementById('spec-provider').textContent = s.providerID || 'OpenCode';
        document.getElementById('spec-model').textContent = data.modelName;
        document.getElementById('spec-msgs').textContent = data.messagesCount;
        document.getElementById('spec-duration').textContent = formatTime(s.time?.idle && s.time?.created ? Math.round((s.time.idle - s.time.created) / 1000) : 0);
        document.getElementById('spec-time').textContent = new Date(s.time?.created || Date.now()).toLocaleTimeString();

        document.getElementById('spec-tok-total').textContent = formatNumber(data.tokensTotal);
        document.getElementById('spec-tok-in').textContent = formatNumber(inTok);
        document.getElementById('spec-tok-out').textContent = formatNumber(s.tokens?.output || 0);
        document.getElementById('spec-tok-cot').textContent = formatNumber(s.tokens?.reasoning || 0);
        document.getElementById('spec-tok-cache').textContent = \`\${s.tokens?.cache?.read || 0} / \${s.tokens?.cache?.write || 0}\`;

        // Message Timeline
        const tl = document.getElementById('timeline-container');
        if (data.rawMessages && data.rawMessages.length > 0) {
          tl.innerHTML = data.rawMessages.map(m => {
            const r = (m.type || 'msg').toLowerCase();
            return \`
              <div class="timeline-item">
                <div>
                  <span class="role-badge \${r}">\${r}</span>
                  <span style="color: #e2e8f0;">\${m.id}</span>
                </div>
                <span style="color: var(--text-tertiary);">\${m.time}</span>
              </div>
            \`;
          }).join('');
        } else {
          tl.innerHTML = '<div style="color: var(--text-tertiary); text-align: center; padding: 1rem;">Sin mensajes.</div>';
        }

        // View CoT
        document.getElementById('cot-bar-label').textContent = \`Pensamiento CoT (\${formatNumber(s.tokens?.reasoning || 0)} tokens)\`;
        document.getElementById('editor-cot').textContent = data.reasoningText || 'Esta sesión no generó razonamiento CoT independiente o ya fue consolidado.';

        // View Solution
        document.getElementById('solution-bar-label').textContent = \`Respuesta Generada (\${formatNumber(s.tokens?.output || 0)} tokens)\`;
        document.getElementById('editor-solution').textContent = data.outputText || 'Sin texto generado.';

        // View Diff
        const diffBox = document.getElementById('editor-diff');
        const diffRaw = document.getElementById('editor-diff-raw');
        if (data.diffs && data.diffs.length > 0) {
          const diffHtml = data.diffs.map(d => {
            const lines = (d.diff || '').split('\\n').map(l => {
              if (l.startsWith('+')) return \`<span class="diff-add">\${escapeHtml(l)}</span>\`;
              if (l.startsWith('-')) return \`<span class="diff-del">\${escapeHtml(l)}</span>\`;
              if (l.startsWith('@')) return \`<span class="diff-info">\${escapeHtml(l)}</span>\`;
              return escapeHtml(l);
            }).join('');
            return \`<div style="margin-bottom: 1.5rem;"><div style="font-weight: 700; color: var(--accent); margin-bottom: 0.5rem;">📄 \${escapeHtml(d.file)}</div>\${lines}</div>\`;
          }).join('');

          diffBox.innerHTML = diffHtml;
          diffRaw.textContent = data.diffs.map(d => \`--- \${d.file} ---\\n\${d.diff}\`).join('\\n\\n');
        } else {
          diffBox.innerHTML = '<div class="empty-placeholder"><div class="empty-icon">📄</div><div>Sin modificaciones en disco (Modo sólo lectura o memoria puramente algorítmica).</div></div>';
          diffRaw.textContent = '';
        }

        // View Raw
        document.getElementById('editor-raw').textContent = JSON.stringify(data, null, 2);

      } catch (err) {
        console.error('Error cargando detalle:', err);
      }
    }

    function escapeHtml(str) {
      return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
      process.stderr.write(`[OpenBridge Dashboard]: Puerto ${port} ocupado.\n`);
    } else {
      process.stderr.write(`[OpenBridge Dashboard Error]: ${err.message}\n`);
    }
  });

  serverInstance.listen(port, '127.0.0.1', () => {
    process.stderr.write(`[OpenBridge Console]: Servidor activo en http://127.0.0.1:${port}\n`);
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
