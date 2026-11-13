# INVENTARIO ANATÓMICO: REMEDIACIÓN DE GRIETAS ARQUITECTÓNICAS EN OPENBRIDGE

> **Fecha**: 2026-11-13  
> **Origen del Hallazgo**: Auditoría externa de DeepSeek V4.1 Flash Free  
> **Modo de Gobernanza**: Streamlined-Track (4 problemas acotados de ingeniería)  
> **Responsable**: AGENT-CORE-ARCHITECT (El Arquitecto Auditor)

---

## 🎯 RESUMEN EJECUTIVO

DeepSeek V4.1 Flash Free identificó con precisión quirúrgica 4 vulnerabilidades y debilidades arquitectónicas en el núcleo de OpenBridge:
1. **Jobs Volátiles (Sin Persistencia)**: `jobManager` mantiene los jobs en un `Map` en RAM. Si el servidor MCP muere o se reinicia, se pierde el historial y el estado de las tareas en vuelo.
2. **Código Muerto y Fallback Desconectado**: `FREE_FALLBACK_CHAIN` en `client.js` y `src/tools.js` están huérfanos. Si un modelo gratuito satélite falla (o sufre HTTP 429 como Gemma), el job colapsa en `FAILED` sin conmutar al siguiente modelo disponible de la cadena.
3. **Secreto Hardcodeado en Texto Plano**: Contraseña por defecto `openbridge_local_token_2026` estática en `config.js:40`.
4. **Riesgo de Recursión Desbocada (Fork Bomb)**: Sin control de profundidad (`call_depth`). Si OpenBridge se registra dentro de OpenCode, un worker podría auto-delegar indefinidamente.

---

## 📋 MICRO-PROBLEMAS IDENTIFICADOS

| ID | Micro-Problema | Severidad | Módulos Afectados | Estado |
| :---: | :--- | :---: | :--- | :---: |
| **P01** | **Persistencia Determinista de Jobs en Disco**: Implementar storage atómico JSONL en `.openbridge/jobs.jsonl` para que `jobManager` recupere tareas tras reinicio. | 🔴 ALTA | `src/job-manager.js`, `src/config.js` | ✅ RESUELTO |
| **P02** | **Cableado de `FREE_FALLBACK_CHAIN` y Limpieza de Código Muerto**: Conectar fallback automático ante errores 429/timeout y eliminar o consolidar `src/tools.js`. | 🔴 ALTA | `src/client.js`, `src/job-manager.js`, `src/index.js`, `src/tools.js` | ✅ RESUELTO |
| **P03** | **Gestión Segura y Dinámica de Tokens de Autenticación**: Reemplazar token hardcodeado por generación criptográfica por máquina/instalación (`~/.openbridge/token`). | 🟡 MEDIA | `src/config.js`, `src/server-manager.js` | ✅ RESUELTO |
| **P04** | **Guardián de Recursión Agéntica (Depth Guard)**: Introducir cabecera/metadato `openbridge_depth` con tope determinista (`MAX_DEPTH = 2`) para evitar bucles infinitos. | 🟡 MEDIA | `src/client.js`, `src/job-manager.js`, `src/index.js` | ✅ RESUELTO |

---

## 🔒 COMPUERTAS DE CALIDAD (QUALITY GATES)

1. **Linter / Comprobación Sintáctica**: `npm run check` con 0 errores en todos los módulos modificados.
2. **Suite de Pruebas Automatizadas**:
   - `test/test-p01.js` (Daemon y Auth): PASS.
   - `test/test-p02.js` (Herramientas y MCP): PASS.
   - Nuevo test unitario de regresión para cada micro-problema (persistencia, fallback, token y recursión).
3. **Micro-commits Atómicos Git**:
   - `feat(P01): persistent job storage with atomic JSONL recovery`
   - `feat(P02): wired fallback chain for free models & dead code pruning`
   - `feat(P03): secure dynamic token generation in user home directory`
   - `feat(P04): recursion depth limiter to prevent worker fork bombs`
