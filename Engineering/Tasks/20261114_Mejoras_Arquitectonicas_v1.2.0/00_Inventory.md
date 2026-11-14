# INVENTARIO ANATÓMICO: EVOLUCIÓN ARQUITECTÓNICA OPENBRIDGE v1.2.0

> **Fecha**: 2026-11-14  
> **Modo de Gobernanza**: Streamlined-Track (4 micro-problemas acotados de ingeniería)  
> **Responsable**: AGENT-CORE-ARCHITECT (El Arquitecto Auditor)

---

## 🎯 RESUMEN EJECUTIVO

Se implementa el paquete de 4 mejoras arquitectónicas acordadas para consolidar la madurez productiva de OpenBridge:
1. **Circuit Breaker y Enfriamiento Proactivo (P01)**: Mitigar latencia de fallos consecutivos saltando modelos en estado `COOLDOWN` (60s tras 2 fallos 429/timeout).
2. **Autenticación Local del Dashboard Web (P02)**: Proteger la consola `:4098` y sus endpoints REST mediante token `CONFIG.serverPassword` (soporte de header `Authorization`, query `?token=` y bypass opcional con flag de entorno).
3. **Almacenamiento Separado de Payloads y TTL (P03)**: Mantener `jobs.jsonl` ultraligero solo con telemetría/metadatos y guardar payloads extensos en `~/.openbridge/payloads/<jobId>.json` con purga automática TTL de 7 días.
4. **Empaquetado Canónico como Plugin Antigravity (P04)**: Generar `plugin.json` estándar con registro del servidor MCP y la skill `openbridge-delegator`.

---

## 📋 MICRO-PROBLEMAS IDENTIFICADOS

| ID | Micro-Problema | Severidad | Módulos Afectados | Estado |
| :---: | :--- | :---: | :--- | :---: |
| **P01** | **Circuit Breaker & Cooldown Proactivo**: Gestor de salud del pool gratuito en `src/client.js` para saltar modelos en 429 sin esperar fallos repetidos. | 🟢 MEJORA | `src/client.js`, `src/job-manager.js` | ✅ RESUELTO |
| **P02** | **Autenticación y Seguridad del Dashboard**: Middleware de autenticación local por token en `src/dashboard.js` con bypass configurable. | 🟢 MEJORA | `src/dashboard.js`, `src/config.js` | ✅ RESUELTO |
| **P03** | **Segregación de Payloads y TTL**: Separación de `jobs.jsonl` y `payloads/<id>.json` con limpieza periódica de payloads antiguos. | 🟢 MEJORA | `src/config.js`, `src/job-manager.js` | ✅ RESUELTO |
| **P04** | **Manifiesto de Plugin Antigravity**: Creación de `plugin.json` y estructuración formal del bundle de plugin para Antigravity. | 🟢 MEJORA | `plugin.json`, `package.json` | ✅ RESUELTO |

---

## 🔒 COMPUERTAS DE CALIDAD

1. **Linter / Comprobación Sintáctica**: `npm run check` con 0 errores en todos los módulos.
2. **Suite de Pruebas Automatizadas**:
   - `test/test-grietas-remediation.js` (5/5 PASS).
   - `test/test-auto-handoff.js` (PASS).
   - Nuevo test de regresión `test/test-v1.2.0-improvements.js` validando Circuit Breaker, Auth en Dashboard y Segregación de Payloads.
3. **Micro-commits Git**: Publicación a `origin/master` con versión `1.2.0`.
