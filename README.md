# OpenBridge MCP (v1.1.0-beta)

> **⚠️ AVISO DE ESTADO: PROYECTO EN FASE BETA Y DESARROLLO ACTIVO**  
> Este ecosistema se encuentra actualmente en **fase experimental de pruebas**. Este software se distribuye con fines de investigación, desarrollo y automatización de flujos agénticos avanzados. No representa un producto final cerrado.

Puente agéntico de alto rendimiento bajo el protocolo **Model Context Protocol (MCP)** que conecta entornos de trabajo agénticos (como **Google Antigravity**) con clústeres locales y satélites de **OpenCode Zen / Free Tier**.

Permite orquestar, disparar enjambres multi-modelo concurrentes y delegar tareas de código mecánicas a modelos con costo de inferencia **$0.00** (**NVIDIA Nemotron 3.5 Super VL**, **Nemotron 3.5 Lightning** y **DeepSeek V4.1 Flash**), preservando el 100% de la cuota de razonamiento de modelos principales como Gemini.

En otras Palabras es un MCP que permite que Google Antigravity Controle y coordine los modelos de inteligencia artificial que tengas disponibles en OpenCode

---

## 🎯 Arquitectura del Ecosistema

```
 ┌──────────────────────────────────────────────────────────────┐
 │                      GOOGLE ANTIGRAVITY                      │
 │        (Agente Director / Orquestador de Alto Nivel)        │
 └──────────────────────────────┬───────────────────────────────┘
                                │ JSON-RPC (MCP sobre stdio)
 ┌──────────────────────────────▼───────────────────────────────┐
 │                      OPENBRIDGE MCP                          │
 │  ┌────────────────────────────────────────────────────────┐  │
 │  │ 8 Herramientas MCP:                                    │  │
 │  │ • openbridge_start_task      • openbridge_check_task   │  │
 │  │ • openbridge_delegate_task   • openbridge_cancel_task  │  │
 │  │ • openbridge_list_models     • openbridge_get_diff     │  │
 │  │ • openbridge_list_active     • openbridge_status       │  │
 │  └───────────────────────────┬────────────────────────────┘  │
 │                              │ REST + Server-Sent Events     │
 └──────────────────────────────┼───────────────────────────────┘
                                │ http://127.0.0.1:4096
 ┌──────────────────────────────▼───────────────────────────────┐
 │                   OPENCODE ZEN LOCAL DAEMON                  │
 │       (Motor de Ejecución Satélite / Clúster Gratuito)       │
 └──────────────┬───────────────────────────────┬───────────────┘
                │                               │
 ┌──────────────▼──────────────┐ ┌──────────────▼──────────────┐
 │   NVIDIA Nemotron 3.5       │ │   DeepSeek V4.1 Flash       │
 │   • Super VL Free (Visión)  │ │   • Algoritmos / Math       │
 │   • Lightning Free (Rápido) │ │   • Tests Unitarios         │
 └─────────────────────────────┘ └─────────────────────────────┘
```

---

## 🛠️ Herramientas MCP Expuestas

| Herramienta | Modo | Descripción |
| :--- | :---: | :--- |
| `openbridge_start_task` | **Asíncrono** | Dispara un worker en background de inmediato (<50ms) retornando un `task_id` sin bloquear la conversación del agente principal. Permite enjambres en paralelo. |
| `openbridge_check_task` | **Consulta** | Comprueba el estado de un job asíncrono previo (`RUNNING`, `COMPLETED`, `FAILED`) y recolecta tokens, duración y respuesta. |
| `openbridge_cancel_task` | **Control** | Interrumpe y aborta de forma limpia una tarea asíncrona en ejecución. |
| `openbridge_list_active_tasks`| **Monitoreo** | Lista todas las tareas activas o recientes en la cola de enjambres de OpenBridge. |
| `openbridge_delegate_task` | **Síncrono** | Delega una tarea de programación esperando la respuesta vía SSE de latencia cero, con soporte de sandboxing efímero ligero. |
| `openbridge_list_models` | **Catálogo** | Lista los modelos disponibles a través de OpenCode Zen y OpenRouter con filtros de gratuidad (`free_only: true`). |
| `openbridge_get_diff` | **Auditoría** | Extrae parches unificados de Git de los archivos creados o modificados durante una sesión satélite. |
| `openbridge_status` | **Diagnóstico** | Health-check del daemon local de OpenCode, transporte SSE y conectividad de red. |

---

## 🧠 Skills Agénticas Incluidas (`/skills`)

El repositorio incluye 3 habilidades agénticas listas para instalar en `.agents/skills/`:

1. **`openbridge-delegator`**: Define cuándo y cómo Antigravity debe transferir tareas repetitivas a modelos satélites, evaluando complejidad, impacto en cuota y tipo de código.
2. **`model-task-matcher`**: Matriz de enrutamiento técnico que selecciona el modelo óptimo según el problema (ej. *Nemotron* para UI/Full-stack, *DeepSeek* para cálculo/tests unitarios).
3. **`worker-core`**: Protocolo interno para workers satélites que previene atajos (*reward hacking*), impone validación sintáctica estricta y formatea reportes de entrega.

> *Nota sobre la interfaz gráfica de telemetría*: La herramienta visual/dashboard en tiempo real se mantiene **fuera del core del repositorio** al encontrarse actualmente en rediseño e investigación interna.

---

## 📋 Requisitos Previos

1. **Node.js**: Versión `>= 18.0.0` (Probado en Node.js v24 LTS en Windows, Linux y macOS).
2. **OpenCode CLI**: Motor satélite local instalado globalmente:
   ```bash
   npm install -g @opencode/cli
   ```
3. **Daemon de OpenCode Activo**: El daemon debe estar corriendo o configurado para auto-arranque en el puerto `4096`:
   ```bash
   opencode serve --port 4096 --password openbridge_local_token_2026
   ```
4. **Google Antigravity** (o cualquier cliente compatible con MCP).

---

## 🚀 Instalación y Configuración

### 1. Clonar el repositorio
```bash
git clone https://github.com/MGSCOfficial/openbridge.git
cd openbridge
npm install
```

### 2. Configurar en Google Antigravity
Agrega la siguiente entrada en la configuración de servidores MCP de Antigravity (generalmente en `mcp_settings.json` o la configuración del plugin):

```json
{
  "mcpServers": {
    "openbridge": {
      "command": "node",
      "args": [
        "<RUTA_ABSOLUTA>/openbridge/src/index.js"
      ],
      "env": {
        "OPENCODE_PORT": "4096",
        "OPENCODE_HOST": "127.0.0.1",
        "OPENCODE_SERVER_PASSWORD": "openbridge_local_token_2026",
        "OPENCODE_DEFAULT_MODEL": "opencode/nemotron-3.5-super-vl-free"
      }
    }
  }
}
```

---

## 🧪 Verificación y Suite de Pruebas

OpenBridge cuenta con una suite de pruebas de caja negra y estrés:

```bash
# 1. Comprobación de integridad sintáctica
npm run check

# 2. Validación de conectividad y streaming SSE de baja latencia
npm run test:latency

# 3. Prueba de enjambre paralelo concurrente (3 modelos simultáneos a $0)
npm run test:swarm
```

---

## 👤 Autoría y Créditos

* **Desarrollo y Arquitectura**: **MGSCO** ([@MGSCOfficial](https://github.com/MGSCOfficial))
* **Licencia**: Código abierto bajo la licencia [MIT](LICENSE).
