# Remediación v1.1.0-beta.2 — Cierre de la auditoría DeepSeek

**Fecha:** 2026-11-13
**Base:** `d95c279` (remediación P01–P04 de Gemini)
**Autor del parche:** `AGENT-WORKER-DEEPSEEK` (OpenCode)
**Alcance:** cerrar los defectos que la remediación anterior dejó a medias, no reescribir la arquitectura.

---

## 1. Defectos corregidos

### D1 (crítico) · El fallback producía un falso éxito silencioso

`startJob` asignaba `sessionID` **antes** de `sendPrompt`. Si la sesión se creaba pero el envío fallaba con 429, la condición `while (!sessionID)` ya era falsa y el bucle salía sin reintentar. El job quedaba `COMPLETED` sobre una sesión vacía, reportando el modelo de fallback.

**Fix (`src/job-manager.js`):** `sessionID` se fija solo tras `sendPrompt` exitoso; la sesión descartada se interrumpe; el fallback se evalúa sobre el error real de create **o** send.

Verificación dinámica (mock de `createSession` OK + `sendPrompt` 429):

```text
antes:  { creates: 1, sends: ["ses_1"],    jobSession: "ses_1", status: "COMPLETED" }
después:{ creates: 2, sends: ["ses_1","ses_2"], jobSession: "ses_2", status: "COMPLETED" }
```

### D2 (alto) · La recuperación reenviaba un prompt truncado

`job.task` se persiste truncado a 100 caracteres. La recuperación post-reinicio llamaba a `_trackJobBackground` sin `promptText`, y un fallback en runtime reenviaba `job.task`.

**Fix:** el job persiste `promptText` íntegro (nuevo campo, `task` queda como preview de UI). La recuperación pasa `job.promptText` y un `sandboxDir` solo si aún existe.

### D3 (alto) · `recoverPendingJobs` declaraba COMPLETED sin resultado

Si la sesión estaba idle pero `waitForCompletion` fallaba, el job se marcaba `COMPLETED` sin `result`, `outcome` ni `tokens`.

**Fix:** se lanza `[RECOVERY_INCOMPLETE]` y el job queda `FAILED`. Un job sin evidencia nunca es éxito.

Verificación dinámica:

```text
{ "status": "FAILED", "error": "... [RECOVERY_INCOMPLETE] ...", "conclusion": "OK: no hay falso COMPLETED" }
```

### D4 (alto) · El token legacy seguía activo

`config.js` genera un token dinámico en `~/.openbridge/token`, pero `server-manager.js` seguía probando y adoptando el literal `openbridge_local_token_2026`.

**Fix:** el literal queda como constante única y su uso exige `OPENBRIDGE_ALLOW_LEGACY=1`. Si el daemon rechaza el token configurado, se emite un warning accionable en lugar de adoptar el secreto viejo en silencio.

Verificación en runtime contra el daemon actual (que aún usa el token legacy):

```text
default (gate OFF):  adoptedLegacy = false, warning = "Auth required"
bridge  (gate ON):   adoptedLegacy = true
```

### D5 (medio) · La recursión era advisory y spoofable

`call_depth` es un parámetro declarado por el cliente. La comprobación `>= maxDepth` se podía eludir pasando `0` en cada nivel.

**Fix:** **default-deny**. Con `OPENBRIDGE_ALLOW_NESTED != 1`, cualquier `call_depth > 0` se rechaza con `[NESTED_DELEGATION_DISABLED]`. Los jobs raíz (Antigravity, `call_depth = 0`) no se ven afectados. El techo `maxDepth` sigue vigente cuando el nesting se habilita explícitamente.

> Limitación honesta: sigue siendo un valor declarado. La única garantía real es no exponer las tools de OpenBridge a los workers. Esta capa convierte el default en seguro, no en certificado.

### D6 (bajo) · Crecimiento sin límite de `jobs.jsonl`

**Fix:** retención configurable (`OPENBRIDGE_JOBS_RETENTION`, por defecto 200). Nunca elimina jobs `RUNNING`.

---

## 2. Variables de entorno

| Variable | Default | Efecto |
| :--- | :--- | :--- |
| `OPENBRIDGE_ALLOW_LEGACY` | `0` | Acepta el token legacy hardcodeado (solo migración) |
| `OPENBRIDGE_ALLOW_NESTED` | `0` | Permite delegación desde un worker |
| `OPENBRIDGE_MAX_DEPTH` | `2` | Techo de profundidad cuando el nesting está habilitado |
| `OPENBRIDGE_JOBS_RETENTION` | `200` | Máximo de jobs persistidos |
| `OPENBRIDGE_DATA_DIR` | `~/.openbridge` | Directorio de `token` y `jobs.jsonl` |
| `OPENCODE_SERVER_PASSWORD` | token de `~/.openbridge/token` | Credencial del daemon (tiene prioridad) |

---

## 3. Migración pendiente (acción del operador)

El daemon actual (PID 8600) sigue autenticando con el token legacy, por eso la configuración MCP incluye temporalmente `OPENBRIDGE_ALLOW_LEGACY=1`. Para retirar el puente:

1. Leer el token dinámico: `Get-Content ~/.openbridge/token`.
2. Reiniciar el daemon con ese token:
   `opencode serve --port 4096 --password <token>`
3. Eliminar `OPENBRIDGE_ALLOW_LEGACY` de `~/.gemini/antigravity/mcp_config.json`.
4. Reiniciar el MCP de OpenBridge en Antigravity.

Mientras el paso 2 no ocurra, el token efectivo sigue siendo el legacy. El código ya no lo usa sin permiso explícito.

---

## 4. Verificación ejecutada

| Comprobación | Resultado |
| :--- | :--- |
| `npm run check` (8 archivos) | exit 0 |
| `npm run test:remediation` (5 pruebas, dataDir aislado) | 5/5, exit 0 |
| Fallback con 429 en `sendPrompt` | reenvía a `ses_2`, exit 0 |
| Recuperación idle sin resultado | `FAILED / RECOVERY_INCOMPLETE` |
| Auth gate default vs bridge | no adopta legacy / adopta legacy |
| Persistencia entre procesos | job recuperado con `promptText` íntegro |

La suite ahora usa `OPENBRIDGE_DATA_DIR` aislado: ya no contamina `~/.openbridge/jobs.jsonl`.

---

## 5. Residuales conocidos

1. **`call_depth` no es certificable** — ver D5.
2. **Dashboard sin auth** — bindea `127.0.0.1` (`dashboard.js:1616`), pero cualquier proceso local puede leer resultados.
3. **`jobs.jsonl` sin cifrar** — contiene previews y resultados. Es un directorio de usuario, no un almacén seguro.
4. **Jobs falsos de la suite anterior** — `job_test_persist_*` siguen en `~/.openbridge/jobs.jsonl`. Se eliminan al reiniciar el MCP, porque el proceso vivo los tiene en memoria y los reescribiría.
