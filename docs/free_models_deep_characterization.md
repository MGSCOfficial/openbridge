# CARACTERIZACIÓN TÉCNICA PROFUNDA: CATÁLOGO DE MODELOS GRATUITOS PARA OPENBRIDGE

**Fecha de Evaluación:** 2026-11-08  
**Auditor:** `AGENT-SYSTEM-ARCHITECT`  
**Alcance:** 22 Modelos Gratuitos (11 OpenCode Zen Native + 11 OpenRouter Free)

---

## 1. Principio Fundamental de Selección

> [!NOTE]
> Ningún modelo de IA es universalmente superior o deficiente de forma abstracta. Su idoneidad depende del **perfil de la tarea**, la **arquitectura de pesos** (densa vs. Mixture-of-Experts), la **tolerancia a latencia** del operador y la **sensibilidad al formateo**. Un modelo excelente para generar 100 pruebas unitarias deterministas puede ser pésimo para auditar una arquitectura o resumir texto poético, y viceversa.

---

## 2. Bloque 1: Modelos Nativos de OpenCode Zen (Coste \$0 / Directos)

Estos modelos son servidos directamente a través de la infraestructura de OpenCode Zen sin intermediación de saldos de OpenRouter.

### 1. `opencode/nemotron-3.5-lightning-free` (NVIDIA)
* **Arquitectura:** Mixture-of-Experts Híbrido (30B parámetros totales, ~3B activados por token).
* **Ventana de Contexto:** 32.768 tokens (óptima hasta 16k tokens para retención máxima).
* **Perfil de Latencia:** Ultrarrápido (<8 segundos para 1.000 tokens de salida).
* **Fortalezas Técnicas:**
  - Excepcional en deducción lógica determinista y razonamiento matemático (utiliza tokens de razonamiento internos `reasoning: ~150-250`).
  - Generación de pruebas unitarias sintácticamente perfectas en Node.js, Python, TypeScript, Go y Rust.
  - Cero tendencia a la charlatanería (*anti-slop* natural): devuelve el código exacto solicitado.
* **Limitaciones y Modos de Fallo:**
  - Si se le proporciona un contexto saturado (>20k tokens con archivos irrelevantes), sufre de omisión de casos de borde (*needle-in-a-haystack decay*).
  - No es adecuado para redacción de prosa larga o análisis conceptual de diseño de producto.
* **Contextos de Proyecto Óptimos:**
  - Suites de pruebas unitarias (Jest, Vitest, Pytest).
  - Algoritmos matemáticos, ordenamiento, criptografía y parsing.
  - Scripts de migración de base de datos y utilidades CLI.

### 2. `opencode/nemotron-3.5-super-vl-free` (NVIDIA Multimodal)
* **Arquitectura:** Visión-Lenguaje Multimodal alineada con razonamiento espacial.
* **Ventana de Contexto:** 32.768 tokens.
* **Perfil de Latencia:** Medio (~8-12 segundos).
* **Fortalezas Técnicas:**
  - Comprensión nativa de capturas de pantalla, diagramas de arquitectura (SVG/PNG/Mermaid) y wireframes.
  - Detección precisa de incoherencias en diseño CSS, contraste de color (WCAG) y desbordamientos (*overflow*).
* **Limitaciones y Modos de Fallo:**
  - En tareas puramente textuales de cálculo puro, es ligeramente más lento que la variante Lightning.
* **Contextos de Proyecto Óptimos:**
  - Proyectos frontend (React, Tailwind, Vue, Next.js).
  - Auditoría de accesibilidad visual y maquetación responsiva.
  - Interpretación de diagramas de arquitectura para convertirlos en código.

### 3. `opencode/deepseek-v4.1-flash-free` (DeepSeek)
* **Arquitectura:** Mixture-of-Experts Flash de alto rendimiento.
* **Ventana de Contexto:** 64.000 tokens.
* **Perfil de Latencia:** Rápido (~15-18 segundos en cargas masivas).
* **Fortalezas Técnicas:**
  - Capacidad masiva de absorción y generación de boilerplate exhaustivo sin truncamiento.
  - Conoce las versiones más recientes de librerías y frameworks populares.
  - Extraordinario en la definición de esquemas de tipos (TypeScript interfaces, Zod schemas, Pydantic models).
* **Limitaciones y Modos de Fallo:**
  - Propenso a omitir comentarios si el prompt no le exige explícitamente preservarlos.
  - A veces asume supuestos de arquitectura backend estándar (Express/Prisma) si no se le delimita el stack.
* **Contextos de Proyecto Óptimos:**
  - Monorepos grandes, capas de DTOs, mappers de API, traducciones OpenAPI ➔ TypeScript.

### 4. `opencode/glm-5.3-flash-free` (Zhipu AI)
* **Arquitectura:** General Language Model optimizado para inferencia concurrente.
* **Ventana de Contexto:** 32.768 tokens.
* **Perfil de Latencia:** Medio-Rápido (~10-14 segundos).
* **Fortalezas Técnicas:**
  - Excelente seguimiento de instrucciones negativas y reglas de formato rígidas (JSON estricto, YAML sin escapes).
  - Fuerte soporte multilingüe nativo.
* **Limitaciones:** Menos agresivo en refactorizaciones de código profundo que Nemotron.
* **Contextos Óptimos:** Transformación y sanitización de datos, configuración de CI/CD, linters y i18n.

### 5. `opencode/mimo-v2.6-flash-free` (Xiaomi MiMo)
* **Arquitectura:** Modelo ultracompacto para micro-inferencias.
* **Fortalezas:** Latencia de arranque casi instantánea (<3s).
* **Limitaciones:** Ventana efectiva reducida; no apto para código multi-archivo.
* **Contextos Óptimos:** Expresiones regulares, parseo de URLs, saneamiento de strings y validaciones binarias.

### 6. `opencode/iceman-free` (OpenCode Base)
* **Fortalezas:** Integración profunda con herramientas del sistema de ficheros de OpenCode.
* **Contextos Óptimos:** Tareas operativas de terminal y comandos de workspace.

### 7. Otros Modelos Nativos (`flint-40b-free`, `beam-free`, `inkling-2-small-free`, `crouton-alpha-free`, `big-pickle`)
* **Rol:** Modelos experimentales y de reserva. Útiles como nodos de contingencia secundaria en la cadena de fallback si Nemotron o DeepSeek experimentan mantenimiento temporal.

---

## 3. Bloque 2: Modelos Gratuitos de OpenRouter (`:free`)

Modelos de acceso comunitario alojados en la red OpenRouter bajo el sufijo `:free`.

### 8. `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free`
* **Arquitectura:** MoE Gigante de 550 mil millones de parámetros (55B activados).
* **Ventana de Contexto:** 128.000 tokens.
* **Perfil de Latencia:** Alta (25–45 segundos por consulta; sujeto a colas de espera comunitarias).
* **Fortalezas Técnicas:**
  - Razonamiento abstracto de nivel frontera (comparable a GPT-4o, Claude 3.5 Sonnet y o1).
  - Capacidad superior para detectar condiciones de carrera (*race conditions*), fallos sutiles de concurrencia y vulnerabilidades de seguridad criptográfica.
* **Limitaciones y Riesgos:**
  - **Disponibilidad y Rate Limits**: Al ser gratuito sobre un modelo de 550B, sufre de límites de peticiones por minuto (RPM reducidos) y puede devolver HTTP 429 durante picos de tráfico mundial.
* **Contextos Óptimos:**
  - Debugging forense de bugs que ningún modelo pequeño logra desentrañar.
  - Auditoría de contratos de seguridad y arquitectura de sistemas distribuidos.

### 9. `openrouter/google/gemma-4-31b-it:free` y `gemma-4-26b-a4b-it:free`
* **Arquitectura:** Google Gemma 4 Dense (31B) / MoE (26B).
* **Ventana de Contexto:** 32.768 tokens.
* **Fortalezas Técnicas:**
  - Cumplimiento estricto y riguroso de invariantes y contratos formales.
  - Respeta las restricciones negativas con una precisión casi matemática.
* **Limitaciones:** Mayor costo computacional por token que los modelos MoE ligeros.
* **Contextos Óptimos:** Validación de tipos, compilación sintáctica, generación de JSON Schemas.

### 10. `openrouter/cohere/north-mini-code:free`
* **Arquitectura:** Especializada exclusivamente en tokenización de código.
* **Fortalezas:** Autocompletado quirúrgico y patches de diffs concisos.
* **Contextos Óptimos:** Refactorización de bloques individuales de menos de 100 líneas.

### 11. `openrouter/liquid/lfm-2.5-2.6b:free` y `lfm-3-1.7b:free`
* **Arquitectura:** Redes Neuronales Líquidas (LNN) no basadas en Transformers estándar.
* **Fortalezas:** Eficiencia extrema en streaming secuencial.
* **Contextos Óptimos:** Micro-evaluaciones lógicas y comprobaciones de estado.

---

## 4. Matriz de Enrutamiento Inteligente por Tipo de Proyecto

| Perfil de Tarea | 1ª Elección (Primaria) | 2ª Elección (Fallback) | Justificación Técnica |
| :--- | :--- | :--- | :--- |
| **Pruebas Unitarias Exhaustivas** | `nemotron-3.5-lightning-free` | `deepseek-v4.1-flash-free` | Deducción matemática pura, cero comentarios innecesarios, aserciones rigurosas. |
| **Interfaces Web y Accesibilidad** | `nemotron-3.5-super-vl-free` | `gemma-4-31b-it:free` | Comprensión espacial de layouts, contraste WCAG y diseño responsivo. |
| **Scaffolding Masivo y DTOs** | `deepseek-v4.1-flash-free` | `nemotron-3.5-lightning-free` | Alta ventana y resistencia a la fatiga en generación de volumen de código. |
| **Causa Raíz de Bugs Complejos** | `nemotron-3-ultra-550b:free` | `nemotron-3.5-lightning-free` | Profundidad de abstracción para identificar condiciones de carrera no evidentes. |
| **Validación de Invariantes y Esquemas** | `gemma-4-31b-it:free` | `glm-5.3-flash-free` | Adhesión estricta a contratos de datos sin alucinación de propiedades. |
| **Sanitización de Strings / Regex** | `mimo-v2.6-flash-free` | `lfm-2.5-2.6b:free` | Mínima latencia de arranque (<3s) para operaciones atómicas. |
