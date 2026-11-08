# OpenBridge

**OpenBridge** es un puente agéntico de doble capa (Servidor MCP + Skill de Gobernanza) para **Google Antigravity** que permite orquestar y delegar tareas de código concurrentes a modelos gratuitos de **OpenCode Zen / Free Tier** (con foco en **NVIDIA Nemotron 3.5 Lightning Free** y **Super VL Free**) a través de su API REST local (`opencode serve`).

---

## Características Principales

* ⚡ **Ahorro de Cuota del 100%**: Descarga tareas mecánicas de alto volumen de tokens (tests, boilerplate, escaneo) a modelos gratuitos a coste $0.
* 🤖 **NVIDIA Nemotron 3.5 Out-of-the-Box**: Conexión directa a `opencode/nemotron-3.5-lightning-free` y `opencode/nemotron-3.5-super-vl-free` sin necesidad de API keys o saldo en OpenRouter.
* 🔌 **Protocolo MCP Estándar**: Expone herramientas nativas (`openbridge_delegate_task`, `openbridge_list_models`, `openbridge_get_diff`, `openbridge_status`) compatibles con cualquier cliente MCP.
* 🧠 **Skill de Gobernanza Antigravity**: Política de arbitraje cognitivo en `.agents/skills/openbridge-delegator/SKILL.md` que define cuándo retener tareas en Gemini 3.8 y cuándo derivar a Nemotron.
* 🛡️ **Aislamiento y Auditoría de Diffs**: Modo de solo lectura o escritura acotada con recuperación de diffs unificados antes de commitear.

---

## Estructura del Proyecto

```text
openbridge/
├── package.json               # Configuración Node.js y dependencias (@modelcontextprotocol/sdk, zod)
├── openbridge-mcp-config.json # Registro de MCP para Antigravity
├── skills/
│   └── openbridge-delegator/  # Skill de gobernanza y arbitraje
│       └── SKILL.md
├── src/
│   ├── config.js              # Variables de entorno y rutas seguras en Windows
│   ├── server-manager.js      # Verificación y auto-spawn del daemon OpenCode
│   ├── client.js              # Cliente HTTP REST para la API de OpenCode
│   ├── tools.js               # Definición y esquemas Zod de herramientas
│   └── index.js               # Servidor MCP stdio
└── test/
    ├── test-p01.js            # Smoke test del daemon y autenticación
    └── test-p02.js            # Smoke test de delegación a Nemotron 3.5
```

---

## Verificación de Pruebas

```powershell
# Comprobación sintáctica nativa
npm.cmd run check

# Prueba de humo del Daemon
npm.cmd run test:p01

# Prueba de humo de delegación real a Nemotron 3.5
npm.cmd run test:p02
```
