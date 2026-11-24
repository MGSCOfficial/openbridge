# INVENTARIO ANATÓMICO: DESCENTRALIZACIÓN OPENBRIDGE v2.0.0 (PUENTE MCP PURO)

> **Fecha**: 2026-11-24  
> **Call-sign**: `AGENT-BRIDGE-ARCHITECT` (El Arquitecto Auditor)  
> **Gobernanza**: Streamlined-Track (aprobado por usuario)  
> **Objetivo**: Convertir OpenBridge en un puente MCP descentralizado y agnóstico entre clientes MCP (Gemini / Antigravity) y cualquier proveedor/modelo disponible en OpenCode, removiendo herramientas y acoplamientos complementarios a modelos específicos retirados.

---

## MICRO-PROBLEMAS IDENTIFICADOS

| ID | Micro-Problema | Alcance / Archivos | Estado |
| :---: | :--- | :--- | :---: |
| **P01** | **Purga de Componentes Complementarios y Acoplados**: Eliminar Dashboard Web (`src/dashboard.js`, `src/standalone-dashboard.js`, `abrir_dashboard.bat`, `test/test-dashboard-and-sse.js`), skills/fichas de modelos acoplados (`skills/model-task-matcher`, `skills/worker-core`, `models/`, `docs/free_models_*.md`, `docs/research_*.md`, `docs/master_interconnection_architecture.md`) y config de dashboard en `index.js`/`config.js`. | `src/dashboard.js`, `src/standalone-dashboard.js`, `src/index.js`, `src/config.js`, `abrir_dashboard.bat`, `skills/`, `models/`, `docs/`, `test/` | `RESOLVED` |
| **P02** | **Descentralización de Cliente, Configuración y Gestor de Trabajos**: Eliminar `FREE_FALLBACK_CHAIN` hardcoded y `defaultModel` hardcoded a Nemotron; parseo genérico `providerID/modelID` para cualquier proveedor OpenCode; fallback opcional únicamente vía `OPENBRIDGE_FALLBACK_MODELS` o parámetro `fallback_models`; circuit breaker dinámico sin tabla fija; filtro `free_only=false` y `provider` libre; eliminar métricas ficticias de cuota/coste. | `src/config.js`, `src/client.js`, `src/job-manager.js`, `src/server-manager.js` | `RESOLVED` |
| **P03** | **Capacidades de Puente Puro (Multi-turno y Lectura de Sesiones)**: Añadir `session_id` opcional en `openbridge_delegate_task` y `openbridge_start_task` para continuar sesiones existentes; añadir herramientas puras de puente (`openbridge_list_sessions`, `openbridge_get_messages`) y limpiar descripciones de las tools existentes. | `src/client.js`, `src/job-manager.js`, `src/tools.js` | `RESOLVED` |
| **P04** | **Alineación de Skill, Manifiesto, Tests y Documentación v2.0.0**: Reescribir `skills/openbridge-delegator/SKILL.md`, `README.md`, `package.json`, `plugin.json`, `openbridge-mcp-config.json` y actualizar la suite automatizada en sandbox aislado. | `skills/openbridge-delegator/SKILL.md`, `README.md`, `package.json`, `plugin.json`, `test/*.js` | `RESOLVED` |
