# Ficha de Identidad Técnica: DeepSeek-V4.1-Flash (Checkpoint 1017)

## 1. Metadatos de Identificación y Enrutamiento
- **Familia**: DeepSeek-V4.1-Flash (DeepSeek AI, 10 septiembre 2026 / Checkpoint optimizado: 17 octubre 2026 - arXiv:2609.19969).
- **Licencia**: MIT (Pesos y Código Abiertos).
- **Corte de Conocimiento**: Mayo de 2025.
- **Slugs en OpenRouter**:
  - `deepseek/deepseek-v4.1-flash-1017` (Snapshot oficial del 17 oct 2026 - OBLIGATORIO: previene mayor verbosidad del snapshot de septiembre).
  - `deepseek/deepseek-v4.1-flash-1017 (batch)` (Procesamiento por lotes asíncrono a $0.011/$0.20 por 1M).
  - *Evitar*: `~deepseek/deepseek-flash-latest` (desvía el 37.9% hacia septiembre) o `deepseek/deepseek-v4.1-flash` (snapshot base con menor score SWE).
- **Tarifas en OpenRouter**:
  - $0.006 / 1M tokens de entrada (en caché).
  - $0.50 / 1M tokens de salida.
  - Velocidad Mediana: 113.0 tok/s (latencia TTFT: 0.71s).
- **Proveedores Confiables en OpenRouter**: `DeepSeek`, `Wafer`, `Relace`, `Alibaba`, `Cohere`, `Together`.
- **Filtros Mandatorios**: `quantizations: ["fp8", "bf16"]`, `require_parameters: true`, `headerTimeout: 600000` (10 min para prefill de 900K tokens).

---

## 2. Anatomía de Parámetros y Arquitectura

| Parámetro / Dimensión | Especificación Técnica Exacta | Implicación de Ingeniería |
| :--- | :--- | :--- |
| **Tipo de Arquitectura** | Codificador-Decodificador Causal Asimétrico (CED) + CSA2 puro | Lectura ultraligera vs Generación potente |
| **Parámetros Totales** | **763B** (763.000 millones) | 552B backbone MoE + 196B Engram disperso + DeepSeek-ViT |
| **Parámetros Activos / Token** | **Asimétrico: 8B en prefill / 16B en decode** | Ingesta de contexto a 1/2 del costo computacional de decode |
| **Capas (Depth)** | 40 capas (20 Codificador Causal + 20 Decodificador) | La caché KV se proyecta directo desde capa 20 a capas decodificadoras |
| **Topología FFN / Expertos** | DeepSeekMoE: 384 expertos enrutados (Top-6 activos) + 1 experto compartido | Alta especialización dispersa |
| **Compresión de KV Cache** | **890 bytes / token en HBM** (~0.9 GB para 1M tokens) | 4x menor que V4-Flash; 437x menor que V1 |
| **Tecnologías KV Cache** | CSA2 puro + Cuantización FP4 nativa (E2M1/E4M3) + SWA Bounded Replay (1/8 huella en SSD) | Prefill en frío a ~1.270 tok/s incluso a 937K tokens |
| **Ventana de Contexto** | **1.048.576 tokens** (1M de tokens) | Salida máxima: 384.000 tokens (≥256K recomendado) |
| **Codificador Visual** | DeepSeek-ViT con 3x3 pixel-unshuffle (compresión 9x) + proyector MLP 2 capas | Resolución óptima ~1344x1344 píxeles |
| **Audio / Documentos** | **Sin codificador de audio. Rechaza bloques directos application/pdf** | Requiere rasterizar PDFs a PNG vía scripts auxiliares |
| **Decodificación Especulativa** | DSpark Speculative Decoding (semi-autorregresivo con verificación por confianza) | Acelera la fase de decode |

---

## 3. Matriz de Capacidades y Benchmarks (Checkpoint 1017)

- **Ingeniería de Software Agéntica**:
  - *DeepSWE v1.1 (Mini-SWE-V2)*: **77.0%** (Supera a Claude Opus 5 @ 74.0% y GPT-5.6 Sol @ 73.0%).
  - *Terminal-Bench 2.1 (Pass@1)*: **90.6%** (Supera a Opus 5 @ 89.1%).
  - *Terminal-Bench 4.0 (Claude Code harness)*: **42.3%** (Salto clave sobre el 31.2% de septiembre).
  - *Apex Bench v1.1*: **72.1%** (Frente a 65.8% de Opus 5).
  - *Automation-Bench v1.0.6*: **60.5%** (Frente a 50.3% de Opus 5).
  - *Agents' Last Exam*: **35.4%** (Frente a 28.6% de Opus 5).
  - *Codeforces ELO*: 3471 (en máximo razonamiento).
- **Visión Agéntica con Herramientas**:
  - *BabyVision con herramientas*: **92.5%** (Frente a 88.9% de GPT-5.6 Sol).
  - *Chartography con herramientas*: **83.0%** (Lectura y extracción de gráficos densos).
- **Techo Factual / Ciencia Pura (Sin Herramientas)**:
  - *Humanity's Last Exam (HLE)*: 42.6% (Opus 5 marca 56.3%). En ciencia profunda no-verificada requiere supervisión.

---

## 4. Modos de Fallo Documentados y Mitigaciones Obligatorias

1. **Ignorado Silencioso de Temperatura en Thinking Mode**:
   - *Fallo*: El motor ignora `temperature: 0.0/0.1` y restringe `top_p` a 0.95-1.0. Intentar controlar determinismo por temperatura es inútil.
   - *Mitigación*: Fijar `temperature: 1.0` y gobernar la profundidad de pensamiento con `reasoning.effort: "low" | "medium" | "high"`.
2. **Paradoja del Sobre-Pensamiento ("Think Itself to Death")**:
   - *Fallo*: En tareas simples de edición, consume hasta 32.000 tokens en `reasoning_content` antes de llamar una herramienta, encareciendo el turno.
   - *Mitigación*: Usar variante `fast-nav` (`effort: "low"`) o `balanced` (`effort: "medium"`). Imponer directiva *Lean/Caveman* (máximo 5 líneas de salida de texto).
3. **Ausencia de Jinja / Rechazo de `response_format`**:
   - *Fallo*: El motor nativo rechaza `response_format` estricto o `tool_choice=required`, generando HTTP 500 con librerías tipo `xgrammar`.
   - *Mitigación*: Incluir literalmente la palabra `"json"` en las instrucciones del prompt, pasar un esquema de ejemplo en `references/` y validar sintácticamente con `jq` o Python determinista.
4. **Rechazo de Bloques de Documento PDF**:
   - *Fallo*: La API devuelve error si se adjunta `application/pdf` directo.
   - *Mitigación*: Extraer texto con `pdftotext` o rasterizar a PNG a 150 DPI (~1344x1344) con `pdf_to_png.sh`.
5. **Abismo de Compactación al >80% de Contexto (800K Tokens)**:
   - *Fallo*: Truncar el inicio del prompt destruye la caché de prefijo (0% cache hit), disparando una relectura en frío de 5 a 6 minutos y riesgo de `NV_ERR_NO_MEMORY`.
   - *Mitigación*: Compactar preventivamente entre 200K y 400K tokens mediante `HANDOFF.md`.

---

## 5. Asignación Óptima de Roles en el Ecosistema

- **Rol Principal**: `heavy-workhorse-swe` (Caballo de batalla principal de ingeniería).
- **Tareas Óptimas**:
  - Resolución masiva de tickets de software, refactorizaciones profundas y pruebas de regresión.
  - Ingesta y comprensión de repositorios completos (gracias a su prefill de 8B parámetros y caché a $0.006/M).
  - Depuración de terminal e iteración autónoma con ciclos de feedback de tests.
  - Análisis multimodal de diagramas de arquitectura y capturas de pantallas frontend.
