---
name: openbridge-delegator
description: Puente MCP descentralizado para conectar Antigravity/Gemini con cualquier modelo o proveedor configurado en OpenCode, con ejecución síncrona/asíncrona, sesiones multi-turno y lectura de historial.
---

# OPENBRIDGE MCP BRIDGE GUIDE (v2.0)

> 🔗 **Repositorio Oficial**: [https://github.com/MGSCOfficial/openbridge](https://github.com/MGSCOfficial/openbridge)  
> 👤 **Autor**: MGSCO ([@MGSCOfficial](https://github.com/MGSCOfficial))

OpenBridge es un **puente agnóstico bajo Model Context Protocol (MCP)** entre cualquier cliente MCP (como Google Antigravity / Gemini) y cualquier inteligencia artificial expuesta por el daemon local de **OpenCode** (sin importar el proveedor: `opencode`, `openrouter`, `anthropic`, `openai`, `google`, `ollama`, etc.).

---

## 1. DESCUBRIMIENTO DESCENTRALIZADO DE MODELOS

Nunca asumas modelos fijos ni nombres de proveedores hardcodeados; consulta en tiempo real qué tiene disponible tu instancia de OpenCode:

1. Llama a `openbridge_list_models({ provider: "all", free_only: false })` (o filtra por `provider`, `search` o `free_only: true`).
2. Usa el campo `fullId` retornado (formato `provider/model`, ej. `opencode/deepseek-v4.1-flash-free` o `openrouter/...`) en `model`.
3. Si omites `model`, OpenCode utilizará su modelo activo por defecto (o `OPENCODE_DEFAULT_MODEL` si está definido).

---

## 2. HERRAMIENTAS DEL PUENTE (11 TOOLS)

### Ejecución y Enjambres
- **`openbridge_delegate_task`**: Ejecución síncrona con Auto-Handoff preventivo a los `120s` (si tarda más, pasa a segundo plano retornando `jobId`). Soporta `agent`, `variant`, `session_id` para continuar conversaciones multi-turno y `fallback_models` opcional.
- **`openbridge_start_task`**: Disparo asíncrono inmediato (`<50ms`) que retorna un `jobId` para paralelizar múltiples tareas sin bloquear el turno (soporta `agent`, `variant`, `session_id`).
- **`openbridge_check_task`**: Consulta estado (`RUNNING`, `COMPLETED`, `FAILED`), resultado, tokens, coste reportado y diffs de un `jobId`.
- **`openbridge_cancel_task`**: Interrumpe limpiamente una tarea (`task_id`) o cualquier sesión activa de OpenCode (`session_id`).
- **`openbridge_list_active_tasks`**: Lista jobs registrados localmente en OpenBridge.

### Sesiones Multi-Turno, Auditoría y Entorno
- **`openbridge_list_sessions`**: Lista sesiones recientes directamente desde OpenCode.
- **`openbridge_get_messages`**: Lee el historial de mensajes, herramientas y tokens de cualquier `session_id` de OpenCode (útil para auditar o retomar contexto).
- **`openbridge_get_diff`**: Extrae parches Git / archivos modificados de una sesión.
- **`openbridge_list_models`**: Descubre modelos en cualquier proveedor de OpenCode.
- **`openbridge_usage_stats`**: Consulta tokens gastados por modelo, límites de OpenCode Console/Go (si existen) y mensajes `429` recientes con su hora de renovación.
- **`openbridge_status`**: Verifica conectividad con el daemon, bus SSE y salud de modelos observados.

---

## 3. FLUJO RECOMENDADO

1. **Descubrir**: `openbridge_list_models()` para ver modelos activos en OpenCode.
2. **Delegar o Continuar**:
   - Turno nuevo: `openbridge_delegate_task({ task: "...", model: "<provider/model>", read_only: true })`
   - Continuar conversación: `openbridge_delegate_task({ task: "...", session_id: "<ses_id>" })`
3. **Auditar antes de integrar**: Inspecciona con `openbridge_get_diff` / `openbridge_get_messages` y valida en tu entorno antes de fusionar cambios.
