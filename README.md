# OpenBridge MCP (v1.1.0-beta)

> **⚠️ AVISO DE ESTADO: PROYECTO EN FASE BETA Y DESARROLLO ACTIVO**  
> Este ecosistema se encuentra actualmente en **fase experimental de pruebas**. Este software se distribuye con fines de investigación, desarrollo y automatización de flujos agénticos avanzados. No representa un producto final cerrado.

Puente agéntico de alto rendimiento bajo el protocolo **Model Context Protocol (MCP)** que conecta entornos de trabajo agénticos (como **Google Antigravity**) con clústeres locales y satélites de **OpenCode Zen**.

Permite orquestar, disparar enjambres multi-modelo concurrentes y delegar tareas de código mecánicas a modelos como **NVIDIA Nemotron 3.5 Super VL**, **Nemotron 3.5 Lightning** y **DeepSeek V4.1 Flash**, rindiendo así la cuota de razonamiento de modelos principales como Gemini o involucrando a este.

En otras Palabras es un MCP que permite que Google Antigravity Controle y coordine los modelos de inteligencia artificial que tengas disponibles en OpenCode

Las Pruebas hechas hasta el momento han sido con los modelos gratuitos DeepSeek V4.1 Flash y NVIDIA Nemotron usando como proveedor a OpenCode y OpenRouter mediante Clave API

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

## 🔗 Ecosistema y Habilidades Complementarias Recomendadas

Para maximizar la potencia, orden y estabilidad de **OpenBridge**, se recomienda integrarlo junto a las siguientes habilidades del ecosistema:

1. **[Antigravity Zen](https://github.com/MGSCOfficial/antigravity-zen)** 🧘:
   * **Higiene Cognitiva y Pizarra Dinámica**: Mientras OpenBridge delega el trabajo pesado a los modelos satélites, Antigravity Zen mantiene limpia la ventana de contexto del agente principal, previniendo la degradación de contexto (*Context Rot*) y los bucles de error mediante su motor de pizarra en disco (`.zen/blackboard.md`).

2. **[Deep Problem Orchestrator](https://github.com/MGSCOfficial/deep-problem-orchestrator)** 🏛️:
   * **Descomposición Quirúrgica y Motor ATLAS**: Proporciona el marco de gobernanza Tri-Track para descomponer sistemas complejos en micro-problemas anatómicos (`00_Inventory.md`), trazando dependencias y validando contratos antes de disparar tareas mecánicas en OpenBridge.

---

## 📋 Requisitos Previos

1. **Node.js**: Versión `>= 18.0.0` (Probado en Node.js v24 LTS en Windows).
2. **OpenCode CLI**: Motor satélite local instalado globalmente:
   ```bash
   npm install -g @opencode/cli
   ```
3. **Daemon de OpenCode Activo**: El daemon debe estar corriendo o configurado para auto-arranque en el puerto `4096`:
   ```bash
   opencode serve --port 4096 --password "$(cat ~/.openbridge/token)"
   ```
   El token lo genera OpenBridge en `~/.openbridge/token` (ver [Variables de entorno](#3-variables-de-entorno)).
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
        "OPENCODE_DEFAULT_MODEL": "opencode/nemotron-3.5-super-vl-free"
      }
    }
  }
}
```

> **No hardcodees la contraseña del daemon.** OpenBridge genera un token
> criptográfico en `~/.openbridge/token` en el primer arranque. Si necesitas
> fijar uno explícito, exporta `OPENCODE_SERVER_PASSWORD` en el entorno (tiene
> prioridad sobre el archivo). El antiguo literal `openbridge_local_token_2026`
> ya **no** se usa: solo se acepta si activas `OPENBRIDGE_ALLOW_LEGACY=1` como
> puente de migración, y el proceso lo reporta con un warning.

### 3. Variables de entorno

| Variable | Default | Efecto |
| :--- | :--- | :--- |
| `OPENCODE_SERVER_PASSWORD` | token de `~/.openbridge/token` | Credencial del daemon (prioridad máxima) |
| `OPENBRIDGE_DATA_DIR` | `~/.openbridge` | Directorio de `token` y `jobs.jsonl` |
| `OPENBRIDGE_ALLOW_LEGACY` | `0` | Acepta el token legacy hardcodeado. **Solo migración**: elimínalo tras rotar el daemon |
| `OPENBRIDGE_ALLOW_NESTED` | `0` | Permite que un worker delegue a su vez. Desactivado por seguridad |
| `OPENBRIDGE_MAX_DEPTH` | `2` | Techo de profundidad cuando el nesting está habilitado |
| `OPENBRIDGE_JOBS_RETENTION` | `200` | Máximo de jobs persistidos en `jobs.jsonl` |

### 4. Rotar el token del daemon

```bash
# 1. Leer el token generado
cat ~/.openbridge/token

# 2. Reiniciar OpenCode con ese token
opencode serve --port 4096 --password "$(cat ~/.openbridge/token)"

# 3. Eliminar OPENBRIDGE_ALLOW_LEGACY del entorno del MCP y reiniciarlo
```

Mientras el daemon siga autenticando con el token viejo, el secreto efectivo es
el viejo, aunque el código ya no lo adopte sin permiso explícito.

---

## 🧪 Verificación y Suite de Pruebas

OpenBridge cuenta con una suite de pruebas de caja negra y estrés:

```bash
# 1. Comprobación de integridad sintáctica
npm run check

# 2. Suite de remediación (persistencia, fallback, recursión, token) — 5 pruebas
npm run test:remediation

# 3. Validación de conectividad y streaming SSE de baja latencia
npm run test:latency

# 4. Prueba de enjambre paralelo concurrente (3 modelos simultáneos a $0)
npm run test:swarm
```

La suite de remediación usa un `OPENBRIDGE_DATA_DIR` temporal: no escribe en
`~/.openbridge`, así que no contamina el historial de producción.

---

## 👤 Autoría y Créditos

* **Desarrollo y Arquitectura**: **MGSC** ([@MGSCOfficial](https://github.com/MGSCOfficial))
* **Licencia**: Código abierto bajo la licencia [MIT](LICENSE).
