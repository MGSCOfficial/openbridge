---
name: openbridge-delegator
description: Orquesta la delegación inteligente de tareas de código, pruebas unitarias y escaneo masivo hacia modelos gratuitos de OpenCode Zen (NVIDIA Nemotron 3.5 Lightning Free, Super VL Free, Gemma o DeepSeek Flash) a través de OpenBridge MCP, ahorrando el 100% de cuota de Gemini en Antigravity para tareas mecánicas.
---

# OPENBRIDGE GOVERNANCE & TASK DELEGATION SKILL (v1.1)

> 🔗 **Repositorio Oficial en GitHub**: [https://github.com/MGSCOfficial/openbridge](https://github.com/MGSCOfficial/openbridge)  
> 👤 **Autor y Mantenedor**: MGSCO ([@MGSCOfficial](https://github.com/MGSCOfficial))

Guía de gobernanza agéntica para la orquestación y delegación estratégica de tareas de código entre **Google Antigravity (Gemini 3.8)** y los modelos worker de **OpenCode Zen Free Tier** (con foco en **NVIDIA Nemotron 3.5 Lightning Free**, **Super VL Free** y **DeepSeek V4.1 Flash**) a través del servidor MCP `openbridge`.

---

## 1. PRINCIPIOS DE ARBITRAJE DE CUOTA (CUÁNDO DELEGAR)

El objetivo central de OpenBridge es preservar la cuota de contexto y llamadas por minuto de Gemini 3.8 en Antigravity, delegando trabajo mecánico intensivo en tokens a modelos gratuitos de alta capacidad.

### Matriz de Decisión:

| Dominio Técnico | Ejecutor Óptimo | Razón Técnica |
| :--- | :--- | :--- |
| **Arquitectura de Sistemas y Triage** | 🟢 **Gemini 3.8 (Antigravity)** | Requiere visión holística, razonamiento abstracto y diseño de contratos. |
| **Descomposición Anatómica de Tareas** | 🟢 **Gemini 3.8 (Antigravity)** | Metodología `agentic-task-orchestrator`, inventario y grafo DAG. |
| **Auditoría de Seguridad y Code Review** | 🟢 **Gemini 3.8 (Antigravity)** | Auditoría adversaria de diffs antes de fusionar o commitear. |
| **Generación Masiva de Tests Unitarios** | ⚡ **Nemotron 3.5 Lightning** | Tarea repetitiva de alto consumo de tokens. Genera suites completas a coste $0. |
| **Análisis de UI / Diagramas / Frontend** | ⚡ **Nemotron 3.5 Super VL** | Razonamiento multimodal avanzado para maquetas y capturas visuales. |
| **Scaffolding y Expansión de Boilerplate** | ⚡ **DeepSeek V4.1 Flash / Nemotron** | Creación rápida de interfaces, DTOs, mappers y esquemas repetitivos. |
| **Barrido de Logs y Diagnóstico de Errores**| ⚡ **Flash / Nemotron (OpenBridge)** | Consumo masivo de contexto sin agotar la cuota de la sesión principal. |

---

## 2. HERRAMIENTAS MCP DE OPENBRIDGE v1.1

### A. Modo Asíncrono No Bloqueante (Enjambres Multiagente / Swarm)
Para disparar múltiples modelos en paralelo sin congelar el turno de Antigravity:

1. **`openbridge_start_task`**:
   - Dispara una tarea en background y retorna de inmediato (`<50ms`) con un `task_id` (ej. `job_bfa16c0a`).
   - Parámetros: `task` (string), `model` (opcional), `working_dir` (opcional), `read_only` (boolean), `timeout_seconds` (número).
2. **`openbridge_check_task`**:
   - Consulta el estado del `task_id`. Retorna `status: 'RUNNING'` con el tiempo transcurrido o `status: 'COMPLETED'` con el resultado, métricas de tokens y diffs generados.
3. **`openbridge_cancel_task`**:
   - Interrumpe de forma limpia una tarea en vuelo si ya no es necesaria.
4. **`openbridge_list_active_tasks`**:
   - Visualiza el tablero de control de todos los workers activos.

### B. Modo Síncrono Directo
5. **`openbridge_delegate_task`**:
   - Ejecución bloqueante con latencia mínima impulsada por Server-Sent Events (SSE) en tiempo real. Ideal para consultas puntuales donde Antigravity necesita el resultado en el mismo turno.

### C. Utilidades de Entorno
6. **`openbridge_list_models`**: Catálogo de 22 modelos gratuitos (filtrables por proveedor o búsqueda).
7. **`openbridge_get_diff`**: Inspección aislada de parches Git producidos en una sesión.
8. **`openbridge_status`**: Salud del daemon local y bus de eventos SSE.

---

## 3. PROTOCOLO DE ENJAMBRE MULTIAGENTE (*PARALLEL SWARM*)

Cuando Antigravity necesite procesar varios problemas independientes a la vez:

1. **Disparo Simultáneo en Turno Único**:
   ```javascript
   // Ejemplo: Disparo de 3 tareas concurrentes a 3 modelos distintos
   openbridge_start_task({ task: "Generar tests de ordenamiento", model: "opencode/nemotron-3.5-lightning-free" });
   openbridge_start_task({ task: "Generar types e interfaces en TS", model: "opencode/deepseek-v4.1-flash-free" });
   openbridge_start_task({ task: "Auditar contraste y UI accesible", model: "opencode/nemotron-3.5-super-vl-free" });
   ```
2. **Recolección No Invasiva**:
   Antigravity continúa su labor de análisis y, al cabo de unos segundos, invoca `openbridge_check_task` para cada `task_id`.
3. **Compuerta de Calidad y Fusión**:
   Se aplican las pruebas nativas (`node --check`, linters o suite de tests del proyecto) y se consolida con micro-commit en Git.
