# OpenBridge (v1.1)

**OpenBridge** es un puente agéntico de doble capa (Servidor MCP + Skill de Gobernanza) para **Google Antigravity** que permite orquestar y delegar tareas de código concurrentes a modelos gratuitos de **OpenCode Zen / Free Tier** (con foco en **NVIDIA Nemotron 3.5 Lightning Free**, **Super VL Free** y **DeepSeek V4.1 Flash**) a través de su API REST local (`opencode serve`) y bus de eventos SSE.

---

## Novedades de la Versión 1.1

* ⚡ **Streaming en Tiempo Real vía SSE**: Conexión reactiva a `/api/event` que elimina el sondeo HTTP y captura respuestas con latencia mínima (0s de retardo artificial).
* 🚀 **Enjambres Multiagente Asíncronos (*Job Queue*)**:
  - `openbridge_start_task`: Disparo en background no bloqueante (<50ms).
  - `openbridge_check_task`: Consulta de estado y recolección de resultados.
  - `openbridge_cancel_task`: Interrupción controlada de workers.
  - `openbridge_list_active_tasks`: Visualización de tareas en vuelo.
* 🛡️ **Sandbox Efímero Ligero**: Aislamiento temporal de carpetas para evitar escaneos pesados de repositorios en modo `read_only`.
* 🤖 **Soporte Multi-Modelo Concurrente Verificado**: Capacidad demostrada para correr 3 modelos simultáneos (`Nemotron 3.5 Lightning`, `Nemotron 3.5 Super VL`, `DeepSeek V4.1 Flash`) en paralelo a coste $0 y con 0% de impacto en la cuota de Gemini.

---

## Herramientas MCP Disponibles

1. `openbridge_start_task` (Asíncrona no bloqueante para enjambres)
2. `openbridge_check_task` (Consulta de resultados por `task_id`)
3. `openbridge_cancel_task` (Interrupción de tareas)
4. `openbridge_list_active_tasks` (Tablero de workers)
5. `openbridge_delegate_task` (Síncrona directa con SSE)
6. `openbridge_list_models` (Catálogo de 22 modelos gratuitos)
7. `openbridge_get_diff` (Inspección de parches de código)
8. `openbridge_status` (Diagnóstico del daemon)

---

## Verificación de la Suite

```powershell
# Comprobación sintáctica nativa
npm.cmd run check

# Prueba de latencia SSE
npm.cmd run test:latency

# Prueba de enjambre multiagente en paralelo (3 modelos)
npm.cmd run test:swarm
```
