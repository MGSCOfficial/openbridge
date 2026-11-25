# OpenBridge MCP (v2.1.0)

> **⚠️ AVISO DE ESTADO: PROYECTO EN FASE BETA Y DESARROLLO ACTIVO**  
> OpenBridge se encuentra en evolución continua. Es un puente agnóstico para conectar clientes MCP con OpenCode.

**OpenBridge** es un puente ligero y descentralizado bajo el protocolo **Model Context Protocol (MCP)** que conecta clientes agénticos (como **Google Antigravity / Gemini**) con **cualquier modelo o proveedor configurado en OpenCode** (`opencode`, `openrouter`, `anthropic`, `openai`, `google`, `ollama`, etc.), sin atarse a modelos específicos ni imponer flujos propietarios.

---

## 🎯 Arquitectura de Puente Puro

```
 ┌──────────────────────────────────────────────────────────────┐
 │                CLIENTE MCP (Google Antigravity)              │
 └──────────────────────────────┬───────────────────────────────┘
                                │ JSON-RPC (MCP sobre stdio)
 ┌──────────────────────────────▼───────────────────────────────┐
 │                     OPENBRIDGE MCP (v2.0)                    │
 │  • Ejecución síncrona (auto-handoff 120s) y asíncrona        │
 │  • Continuidad multi-turno via session_id                    │
 │  • Lectura de sesiones, mensajes y diffs                     │
 │  • Persistencia JSONL + payloads segregados                  │
 └──────────────────────────────┬───────────────────────────────┘
                                │ REST + SSE (127.0.0.1:4096)
 ┌──────────────────────────────▼───────────────────────────────┐
 │                    OPENCODE LOCAL DAEMON                     │
 │   Cualquier proveedor y modelo configurado en tu instancia   │
 └──────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Herramientas MCP Expuestas (11)

| Herramienta | Categoría | Descripción |
| :--- | :---: | :--- |
| `openbridge_list_models` | **Catálogo** | Descubre modelos disponibles en cualquier proveedor configurado en OpenCode (`provider`, `free_only`, `search`). |
| `openbridge_delegate_task` | **Síncrono** | Envía un prompt a cualquier modelo (o continúa una sesión con `session_id`) con auto-handoff preventivo a los 120s. |
| `openbridge_start_task` | **Asíncrono** | Lanza una tarea en background retornando un `jobId` inmediato para paralelizar peticiones. |
| `openbridge_check_task` | **Consulta** | Consulta estado, resultado, tokens, coste reportado y diffs de un `jobId`. |
| `openbridge_cancel_task` | **Control** | Interrumpe de forma limpia una tarea en ejecución. |
| `openbridge_list_active_tasks` | **Control** | Lista jobs recientes registrados en OpenBridge. |
| `openbridge_list_sessions` | **Sesiones** | Lista sesiones recientes directamente desde OpenCode. |
| `openbridge_get_messages` | **Sesiones** | Lee el historial de mensajes, errores de proveedor y bloques de texto/razonamiento de cualquier `session_id`. |
| `openbridge_get_diff` | **Auditoría** | Extrae diffs de archivos modificados durante una sesión de OpenCode. |
| `openbridge_usage_stats` | **Consumo** | Consulta tokens gastados por modelo, presupuestos de Console/Go y mensajes `429` recientes con su hora de renovación. |
| `openbridge_status` | **Diagnóstico** | Verifica salud del daemon OpenCode, transporte SSE, configuración y modelos observados. |

---

## 🧠 Skill Incluida (`/skills`)

- **`openbridge-delegator`**: Guía agnóstica de uso del puente MCP (`skills/openbridge-delegator/SKILL.md`).

> Las herramientas complementarias específicas de modelos concretos o paneles visuales viven fuera de este repositorio para mantener OpenBridge enfocado únicamente en su rol de puente.

---

## 📋 Requisitos Previos

1. **Node.js**: Versión `>= 18.0.0`.
2. **OpenCode CLI** instalado y con los proveedores/claves que desees usar configurados en OpenCode:
   ```bash
   npm install -g @opencode/cli
   ```
3. **Cliente MCP** (Google Antigravity u otro cliente compatible con MCP stdio).

---

## 🚀 Instalación y Configuración

### 1. Clonar el repositorio
```bash
git clone https://github.com/MGSCOfficial/openbridge.git
cd openbridge
npm install
```

### 2. Configurar en Google Antigravity (`mcp_config.json`)
```json
{
  "mcpServers": {
    "openbridge": {
      "command": "node",
      "args": [
        "<RUTA_ABSOLUTA>/openbridge/src/index.js"
      ]
    }
  }
}
```

### 3. Variables de entorno opcionales

| Variable | Default | Efecto |
| :--- | :--- | :--- |
| `OPENCODE_PORT` | `4096` | Puerto local del daemon OpenCode |
| `OPENCODE_HOST` | `127.0.0.1` | Host del daemon OpenCode |
| `OPENCODE_DEFAULT_MODEL` | *(ninguno)* | Modelo por defecto (`provider/model`) si se omite al delegar; sin valor, OpenCode usa su modelo activo |
| `OPENBRIDGE_FALLBACK_MODELS` | *(vacío)* | Lista separada por comas de modelos de respaldo ante errores `429`/`5xx` |
| `OPENBRIDGE_CIRCUIT_BREAKER_MS` | `60000` | Enfriamiento para modelos con 2 fallos recuperables consecutivos |
| `OPENCODE_SERVER_PASSWORD` | token en `~/.openbridge/token` | Credencial explícita del daemon OpenCode |
| `OPENBRIDGE_DATA_DIR` | `~/.openbridge` | Directorio para `token`, `jobs.jsonl` y `payloads/` |
| `OPENBRIDGE_ALLOW_LEGACY` | `0` | Puente temporal de migración para token legacy (`1` para activar) |
| `OPENBRIDGE_ALLOW_NESTED` | `0` | Permite delegación anidada desde workers (`1` para habilitar) |
| `OPENBRIDGE_MAX_DEPTH` | `2` | Tope de profundidad cuando `OPENBRIDGE_ALLOW_NESTED=1` |
| `OPENBRIDGE_JOBS_RETENTION` | `200` | Máximo de jobs retenidos en `jobs.jsonl` |
| `OPENBRIDGE_PAYLOAD_TTL_DAYS` | `7` | Días de retención para archivos en `payloads/` |

---

## 🧪 Verificación y Suite de Pruebas

```bash
# Comprobación sintáctica + suite completa en sandbox aislado
npm test

# Pruebas individuales contra un daemon OpenCode activo
npm run test:p01
npm run test:p02
npm run test:latency
npm run test:swarm
```

---

## 👤 Autoría y Créditos

* **Desarrollo y Arquitectura**: **MGSC** ([@MGSCOfficial](https://github.com/MGSCOfficial))
* **Licencia**: Código abierto bajo la licencia [MIT](LICENSE).
