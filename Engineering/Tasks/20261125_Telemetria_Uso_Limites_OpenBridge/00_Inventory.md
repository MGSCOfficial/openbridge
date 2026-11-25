# INVENTARIO ANATÓMICO: TELEMETRÍA DE TOKENS, LÍMITES Y MENSAJES DE OPENCODE (v2.1.0)

> **Fecha**: 2026-11-25  
> **Call-sign**: `AGENT-BRIDGE-ARCHITECT` (El Arquitecto Auditor)  
> **Gobernanza**: Streamlined-Track  
> **Objetivo**: Exponer en OpenBridge el consumo exacto de tokens por modelo, los límites reportados por OpenCode (`/api/experimental/usage/limits`) y los mensajes de error/cuota con hora de renovación (`retryAfterMs` -> `resetsAt`), corrigiendo la ocultación silenciosa de fallos `429 provider.free-limit`.

---

## MICRO-PROBLEMAS IDENTIFICADOS

| ID | Micro-Problema | Contratos / Archivos | Estado |
| :---: | :--- | :--- | :---: |
| **P01** | **Propagación de Errores y Hora de Renovación de OpenCode**: Corregir `waitForCompletion`, `event-stream.js`, `job-manager.js` y `readSessionMessages` para extraer `error.type`, `error.message`, `error.status`, `response.body` y calcular `resetsAt` local/ISO a partir de `retryAfterMs`, evitando falsos `COMPLETED` con texto vacío. | `src/client.js`, `src/event-stream.js`, `src/job-manager.js` | `RESOLVED` |
| **P02** | **Herramienta MCP `openbridge_usage_stats`**: Consultar `/api/experimental/session/stats` (tokens gastados por modelo/rango), `/api/experimental/usage/limits` (cuotas oficiales Console/Go o `null` transparente en free tier) y bloqueos `429` activos/recientes con tiempo restante hasta renovación. | `src/client.js`, `src/tools.js` | `RESOLVED` |
| **P03** | **Alineación v2.1.0, Docs, Skill y Tests**: Actualizar `package.json`, `plugin.json`, `src/index.js`, `README.md`, `skills/openbridge-delegator/SKILL.md`, `test/test-grietas-remediation.js` y `test/test-v2-bridge.js`. | `package.json`, `plugin.json`, `src/index.js`, `README.md`, `skills/...`, `test/...` | `RESOLVED` |
