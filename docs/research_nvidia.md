# Investigación Profunda: Familia NVIDIA Nemotron 3 y 3.5
*Fuente original: Documento de investigación Gemini compartido por el usuario (octubre-noviembre 2026).*

## 1. Arquitectura y Modelos de la Familia
- **Nemotron 3 Ultra 550B-A55B (`nvidia/nemotron-3-ultra-550b-a55b`)**:
  - Parámetros: 550B totales / 55B activos por token.
  - Topología: Híbrida 108 capas (Mamba-2 + GQA Attention + LatentMoE 512 expertos, Top-22 activos + 1 compartido).
  - Dimensión: `d_model = 8192`, compresión latente $d/l = 4x$ ($l=2048$).
  - Ventana de Contexto: 1.000.000 tokens (1M).
  - Rol Óptimo: Arquitecto general, síntesis de contexto masivo, auditorías complejas multi-archivo.

- **Nemotron 3.5 Super VL 120B-A12B (`nvidia/nemotron-3.5-super-vl`)**:
  - Parámetros: 120.6B totales / 12.7B activos por token.
  - Topología: Híbrida 88 capas (Mamba-2 + LatentMoE 512 exp, Top-22 + 1 comp + GQA Attention).
  - Codificador Visual: C-RADIO nativo + proyector VL. Sin audio.
  - Rendimiento SWE: Supera a Ultra en SWE-bench Pro bajo OpenCode (51.78% vs 49.66%) y Terminal-Bench 2.1 (60.67% vs 54.78%) gracias a 67B tokens de mid-training agéntico.
  - Throughput: Hasta 277 tok/s en CoreWeave.
  - Rol Óptimo: Constructor principal de software, inspección visual de interfaces, diagramas y PDFs.

- **Nemotron 3.5 Lightning 30B-A3B (`nvidia/nemotron-3.5-lightning`)**:
  - Parámetros: 30B totales / 3B activos por token.
  - Topología: 52 capas (23 Mamba-2, 23 MoE estándar de 128 exp Top-6 + 1 comp, 6 GQA).
  - Throughput: P50 de 283 tok/s (picos de 493 tok/s).
  - Rol Óptimo: Subagente ejecutor de alta velocidad, ejecución de tests en terminal, exploración de repositorio, validación de herramientas.

- **Nemotron 3 Nano Omni 30B-A3B (`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`)**:
  - Parámetros: 30B totales / 3B activos por token.
  - Multimodalidad 4D: C-RADIOv4-H (visión) + Parakeet-TDT (audio nativo) + Conv3D/EVS (video).
  - Idioma: **English only** oficialmente validado.
  - Rol Óptimo: Percepción omnimodal de grabaciones de audio/video, OCR denso, grounding de GUI.

## 2. Limitaciones Operativas y Modos de Fallo
1. **Fallo Scratchpad-Only y Content Vacío**: El modelo vuelca el razonamiento dentro de `<think>` pero devuelve `content: ""` en el turno. Solución obligatoria: `"chat_template_kwargs": { "force_nonempty_content": true }`.
2. **Conflicto Thinking vs Structured Output**: En endpoints con thinking activo, forzar esquemas gramaticales o `tool_choice: "required"` puede devolver JSON malformado o texto plano. En llamadas estrictas, usar variantes sin thinking (`enable_thinking: false`).
3. **Verbosidad de Razonamiento en Super VL**: Puede agotar `max_tokens` antes de emitir la llamada de herramienta. Exige fijar `reasoning.effort: "medium"` o `low`.
4. **Rate Limits en Endpoints `:free`**: Límites de 10-20 req/min en los servidores gratuitos de OpenRouter / NVIDIA. Solución: agrupar llamadas en lote (Code Mode) o usar endpoints de pago cuando se requiera JSON Schema forzado.
