---
name: openbridge-delegator
description: Orquesta la delegación inteligente de tareas de código, pruebas unitarias y escaneo masivo hacia modelos gratuitos de OpenCode Zen (NVIDIA Nemotron 3.5 Lightning Free, Super VL Free, Gemma o DeepSeek Flash) a través de OpenBridge MCP, ahorrando el 100% de cuota de Gemini en Antigravity para tareas mecánicas.
---

# OPENBRIDGE GOVERNANCE & TASK DELEGATION SKILL

Guía de gobernanza agéntica para la delegación estratégica de tareas de código entre **Google Antigravity (Gemini 3.8)** y los modelos worker de **OpenCode Zen Free Tier** (con foco primario en **NVIDIA Nemotron 3.5 Lightning Free** y **Super VL Free**) a través del servidor MCP `openbridge`.

---

## 1. PRINCIPIOS DE ARBITRAJE DE CUOTA (CUÁNDO DELEGAR)

El objetivo central de OpenBridge es preservar la cuota de contexto y llamadas por minuto de Gemini 3.8 en Antigravity, delegando trabajo mecánico intensivo en tokens a modelos gratuitos de alta capacidad.

### Matriz de Decisión:

| Dominio Técnico | Ejecutor Óptimo | Razón Técnica |
| :--- | :--- | :--- |
| **Arquitectura de Sistemas y Triage** | 🟢 **Gemini 3.8 (Antigravity)** | Requiere visión holística, razonamiento abstracto y diseño de contratos. |
| **Descomposición Anatómica de Tareas** | 🟢 **Gemini 3.8 (Antigravity)** | Metodología `agentic-task-orchestrator`, inventario y grafo DAG. |
| **Auditoría de Seguridad y Code Review** | 🟢 **Gemini 3.8 (Antigravity)** | Auditoría adversaria de diffs antes de fusionar o commitear. |
| **Generación Masiva de Tests Unitarios** | ⚡ **Nemotron 3.5 (OpenBridge)** | Tarea repetitiva de alto consumo de tokens. Nemotron genera suites completas a coste $0. |
| **Scaffolding y Expansión de Boilerplate** | ⚡ **Nemotron 3.5 (OpenBridge)** | Creación de interfaces, DTOs, mappers, esquemas repetitivos. |
| **Documentación Exhaustiva (JSDoc / TSDoc)**| ⚡ **Nemotron 3.5 (OpenBridge)** | Inyección masiva de documentación en funciones existentes. |
| **Análisis de Logs Extensos y Stack Traces**| ⚡ **Nemotron 3.5 / Flash (OpenBridge)** | Consumo masivo de contexto sin agotar la cuota de la sesión principal. |

---

## 2. HERRAMIENTAS MCP DE OPENBRIDGE

Cuando el servidor MCP `openbridge` está registrado en `mcp_config.json`, el agente dispone de las siguientes herramientas:

1. `openbridge_list_models`:
   - Lista el catálogo de modelos gratuitos de OpenCode Zen y OpenRouter.
   - Usar para confirmar disponibilidad antes de delegar una tarea crítica.
2. `openbridge_delegate_task`:
   - **`task`** (string): Enunciado anatómico detallado.
   - **`model`** (string): Modelo objetivo (ej. `opencode/nemotron-3.5-lightning-free` para código ultrarrápido; `opencode/nemotron-3.5-super-vl-free` para tareas visuales/multimodales).
   - **`working_dir`** (string): Directorio donde operará OpenCode.
   - **`read_only`** (boolean): `true` para devolver solo el análisis/código en la respuesta sin alterar archivos en disco; `false` para que OpenCode genere archivos o parches.
   - **`timeout_seconds`** (number): Tiempo de espera (por defecto 120s).
3. `openbridge_get_diff`:
   - Inspecciona los diffs producidos en una sesión previa mediante su `session_id`.
4. `openbridge_status`:
   - Comprueba la salud del daemon local en `http://127.0.0.1:4096`.

---

## 3. PROTOCOLO ANATÓMICO DE ENCARGO A NEMOTRON 3.5

Para maximizar la fidelidad y evitar alucinaciones en el worker externo, cada prompt delegado debe seguir esta estructura:

```text
[ROL Y OBJETIVO]
Eres un worker especializado de código. Realiza la siguiente tarea concreta con precisión quirúrgica.

[CONTRATOS E INTERFACES]
- Tipos de entrada: ...
- Tipos de salida esperados: ...
- Restricciones de estilo: ...

[ENTORNO Y AISLAMIENTO]
- Stack: Node.js / TypeScript / Python
- Modo de operación: [SOLO LECTURA | ESCRITURA EN DIRECTORIO]

[ENTREGABLE ESPERADO]
Devuelve únicamente el código o suite de pruebas solicitada con comentarios breves y sin preámbulos vacíos.
```

---

## 4. COMPUERTA DE CALIDAD OBLIGATORIA (POST-DELEGACIÓN)

Nunca se da por completada una tarea delegada a OpenBridge sin aplicar la compuerta de tres capas:
1. **Inspección de Diff**: Revisar el diff o código devuelto por Nemotron antes de aceptarlo.
2. **Validación Sintáctica Nativa**:
   - En JavaScript/Node: `node --check <archivo>`
   - En TypeScript: `tsc --noEmit`
   - En Python: `python -m py_compile <archivo>`
3. **Micro-Commit en Git**:
   - Una vez verificado el código devuelto por el worker, Antigravity realiza el commit atómico en Git:
     `git commit -m "feat(worker): [descripción del módulo generado por Nemotron]"`
