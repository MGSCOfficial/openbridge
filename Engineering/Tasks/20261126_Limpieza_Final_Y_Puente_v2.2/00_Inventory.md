# INVENTARIO ANATÓMICO: LIMPIEZA DE LASTRES Y PUENTE v2.2.0

> **Fecha**: 2026-11-26  
> **Call-sign**: `AGENT-BRIDGE-ARCHITECT` (El Arquitecto Auditor)  
> **Gobernanza**: Streamlined-Track (aprobado por usuario: "Perfecto, hagamos todo")

---

## MICRO-PROBLEMAS IDENTIFICADOS

| ID | Micro-Problema | Alcance / Archivos | Estado |
| :---: | :--- | :--- | :---: |
| **P01** | **Eliminación de Lastres Históricos y Sync de Skill Global**: Retirar `LEGACY_PASSWORD` y `OPENBRIDGE_ALLOW_LEGACY` de `src/server-manager.js`; hacer portable `openbridge-mcp-config.json` sin rutas personales `C:/Users/MGSCO/...`; sincronizar `~/.agents/skills/openbridge-delegator/SKILL.md` (conservando `model-task-matcher` y `worker-core` globales porque `deepseek-worker` y `agentic-team-orchestrator` los referencian). | `src/server-manager.js`, `openbridge-mcp-config.json`, `README.md`, `~/.agents/skills/openbridge-delegator/SKILL.md` | `RESOLVED` |
| **P02** | **Corrección de Cabos Sueltos de Runtime**: Evitar duplicación de `promptText` largo en `jobs.jsonl` segregándolo a `payloads/<id>.json`; preservar `providerError` real en `recoverPendingJobs()` en vez de ocultarlo tras `[RECOVERY_INCOMPLETE]`; corregir falso `HANDOFF_TO_ASYNC` cuando `timeout_seconds <= 120` en `openbridge_delegate_task`. | `src/job-manager.js`, `src/tools.js` | `RESOLVED` |
| **P03** | **Capacidades Extra de Puente Puro (`agent`, `variant`, cancelación por `session_id`)**: Soportar `agent` y `variant` en `createSession` / `delegate_task` / `start_task` conforme al esquema OpenAPI (`Model.Ref` y `Agent.ID`), y permitir interrumpir cualquier `session_id` directa en `openbridge_cancel_task`. | `src/client.js`, `src/job-manager.js`, `src/tools.js` | `RESOLVED` |
| **P04** | **Alineación v2.2.0, Docs y Pruebas**: Bump a `2.2.0` (`package.json`, `plugin.json`, `src/index.js`, `README.md`), actualizar `test-grietas-remediation.js` y añadir regresiones en `test-v2-bridge.js`. | `package.json`, `plugin.json`, `src/index.js`, `README.md`, `test/*.js` | `RESOLVED` |
