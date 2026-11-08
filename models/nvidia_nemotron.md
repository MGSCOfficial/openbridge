# Ficha de Identidad Técnica: Familia NVIDIA Nemotron 3 y 3.5

## 1. Metadatos de Identificación y Enrutamiento
- **Familia**: NVIDIA Nemotron 3 & 3.5 (NVIDIA NeMo / Megatron-LM, abril-octubre 2026 - arXiv:2610.38095).
- **Licencia**: OpenMDW-1.1 / NVIDIA Open Model License (Uso comercial permitido).
- **Corte de Conocimiento**: Mayo de 2026 (datos de código hasta septiembre 2025).
- **Slugs en OpenRouter**:
  - `nvidia/nemotron-3-ultra-550b-a55b` ($0.50 entrada / $2.20 salida; ventana pago 262K).
  - `nvidia/nemotron-3-ultra-550b-a55b:free` ($0.00 / $0.00; ventana 1M tokens; límite ~10-20 req/min).
  - `nvidia/nemotron-3.5-super-vl` ($0.06 entrada / $0.35 salida; ventana pago 1.05M).
  - `nvidia/nemotron-3.5-super-vl:free` ($0.00 / $0.00; ventana 1M tokens; 79-85 tok/s).
  - `nvidia/nemotron-3.5-lightning` ($0.025 entrada / $0.12 salida; hasta 493 tok/s en Fireworks).
  - `nvidia/nemotron-3.5-lightning:free` ($0.00 / $0.00; ventana 1M tokens; 78-87 tok/s).
  - `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` ($0.00 / $0.00; 256K tokens; audio/video/visión nativos).
- **Proveedores Confiables en OpenRouter**:
  - `CoreWeave` (277 tok/s en Super VL, 173-203 tok/s en Lightning).
  - `Fireworks` (283-493 tok/s en Lightning).
  - `Baseten` (115-119 tok/s en Ultra).
  - `DeepInfra` (95 tok/s en Ultra, 175 tok/s en Super VL).
  - *Excluir*: `darkbloom` (tasa de error 8.59% en salidas estructuradas).

---

## 2. Anatomía de Parámetros y Arquitectura Comparada

| Modelo | Parámetros Totales | Parámetros Activos | Capas y Topología Híbrida | Dimensión ($d_{model}$) | Modalidades |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Nemotron 3 Ultra 550B** | **550B** | **55B** | 108 capas: Mamba-2 + GQA + LatentMoE (512 exp, Top-22 + 1 comp) | 8.192 ($l=2048$) | Texto (1M tokens) |
| **Nemotron 3.5 Super VL** | **120.6B** | **12.7B** | 88 capas: Mamba-2 + GQA + LatentMoE (512 exp, Top-22 + 1 comp) | 4.096 ($l=1024$) | Texto + Imagen + Video (1M tokens) |
| **Nemotron 3.5 Lightning** | **30B** | **3B** | 52 capas: 23 Mamba-2 + 23 MoE estándar (128 exp, Top-6 + 1 comp) + 6 GQA | 2.688 | Texto (1M tokens) |
| **Nemotron 3 Nano Omni** | **31B** | **~3B-3.5B** | 52 capas: 23 Mamba-2 + 23 MoE + 6 GQA + C-RADIOv4-H + Parakeet-TDT | 2.688 | Texto + Imagen + Video + Audio (256K) |

- **Innovaciones de Hardware**:
  - *LatentMoE*: Proyección de compresión latente $d/l = 4x$ que reduce drásticamente el tráfico de comunicación inter-GPU (*all-to-all*).
  - *Mamba-2 + GQA*: El estado interno de Mamba-2 mantiene dimensión constante, liberando la memoria de KV Cache en prompts largos.
  - *Aceleración Especulativa*: Drafters integrados (MTP heads nativos) y externos (`LiLiCorr` 1.13B para Super VL; `DSpark`/`DFlash` para Lightning).
  - *NVFP4 Nativo*: Formato E2M1 con escalas FP8 E4M3 por 16 canales; retiene el >99.2% de la precisión BF16 con 2.43x de ganancia en throughput.

---

## 3. Matriz de Capacidades y Benchmarks

- **Nemotron 3.5 Super VL (El Constructor Principal)**:
  - *SWE-bench Pro (OpenCode)*: **51.78%** (Supera a Ultra @ 49.66% gracias a 67B tokens de mid-training agéntico SWE).
  - *Terminal-Bench 2.1*: **60.67%** (vs 54.78% de Ultra en corrida simple; sube a 71.9% con auto-verificación).
  - *BrowseComp (OpenCode)*: **72.35%** (vs 61.06% de Ultra).
  - *GPQA Diamond*: **89.52%** (vs 86.99% de Ultra).
  - *Visión Documental / OS*: CharXiv-RQ 80.82%, MathVision 78.16%, MMLongBench-Doc hasta 100 páginas 62.82%, OSWorld 52.14%.
- **Nemotron 3 Ultra 550B (El Gran Arquitecto)**:
  - *RULER (1M de tokens)*: **94.7%** (vs 81.0% de Super VL).
  - *IFBench (Instrucciones estrictas)*: **82.94%** (vs 70.86% de Super VL).
  - *SWE-bench Verified*: **73.93%** (vs ~61.8% de Super VL).
  - *LiveCodeBench v6*: **89.21%**; IOI 2025: **95.0%**; PinchBench: **90.0%**.
- **Nemotron 3.5 Lightning (El Ejecutor de Alta Velocidad)**:
  - *Throughput*: P50 de **283 tok/s** (hasta 493 tok/s en Fireworks).
  - *PinchBench*: **85.37%**; *RULER 1M*: **91.52%**; *SWE-bench Verified*: 52.20%.
  - Reduce el costo en 58% y el tiempo en 33% al delegarle tareas rutinarias de ejecución de tests y comandos de terminal.
- **Nemotron 3 Nano Omni (El Perceptor Omnimodal)**:
  - *VoiceBench (Audio)*: **89.4%**; *DailyOmni (Video+Audio)*: **74.50%**; *Video-MME*: **72.2%**.
  - Compresión Conv3D (2x) + muestreo EVS (50% pruning) entregan 9.2x mayor eficiencia en video.

---

## 4. Modos de Fallo Documentados y Mitigaciones Obligatorias

1. **Fallo Scratchpad-Only y Respuestas con `content: ""`**:
   - *Fallo*: Los cuatro modelos usan el parser `--reasoning-parser nemotron_v3` (`<think>...</think>`). En OpenCode pueden devolver todo el texto en el razonamiento y cerrar con `content: ""`.
   - *Mitigación Obligatoria*: Inyectar `"chat_template_kwargs": { "force_nonempty_content": true }` en el cuerpo del modelo en `opencode.jsonc`.
2. **Conflicto de Thinking con Salidas Estructuradas / Tool Choice**:
   - *Fallo*: En vLLM, combinar `enable_thinking: true` con `response_format` (JSON Schema) o `tool_choice: "required"` puede devolver JSON malformado con HTTP 200 o texto plano con `finish_reason: "stop"`.
   - *Mitigación*: En llamadas estructuradas forzadas, usar variantes con `enable_thinking: false` (`#strict-no-think` o `#fast-exec`).
3. **Verbosidad en Nemotron 3.5 Super VL**:
   - *Fallo*: Genera hasta 170M tokens en razonamiento, agotando `max_tokens` antes de invocar la herramienta (`finish_reason: "length"`).
   - *Mitigación*: Fijar `limit.output: 32768` y configurar `reasoning.effort: "medium"` (`#code`).
4. **Nano Omni: Restricción English-Only e Incompatibilidad de `read`**:
   - *Fallo*: Nano Omni solo está validado en inglés. La herramienta `read` de OpenCode rechaza `.mp4`, `.wav` y `.mp3`.
   - *Mitigación*: Traducir el prompt al inglés antes de invocarlo; usar el script puente `omni_media_query.py` para codificar audio/video a Base64.
5. **Rate Limits en Endpoints `:free`**:
   - *Fallo*: Cuotas de 10-20 req/min provocan HTTP 429 en bucles rápidos de herramientas.
   - *Mitigación*: Agrupar lecturas en lote con la herramienta `execute` (Code Mode) o usar endpoints de pago de Lightning ($0.025/$0.12).

---

## 5. El Patrón Switchyard: Asignación de Roles en el Ecosistema

```
                     ┌────────────────────────────────────────────────────────┐
                     │              ANTIGRAVITY / GEMINI                      │
                     │          (Orquestación y Toma de Decisiones)           │
                     └──────────────────────────┬─────────────────────────────┘
                                                │
                                                ▼
                     ┌────────────────────────────────────────────────────────┐
                     │          NEMOTRON 3 ULTRA 550B (#architect)            │
                     │      Planificación profunda y auditoría (1M tokens)     │
                     └──────────────────────────┬─────────────────────────────┘
                                                │
                                                ▼
                     ┌────────────────────────────────────────────────────────┐
                     │        NEMOTRON 3.5 SUPER VL 120B (#super-builder)     │
                     │      Constructor SWE de código, interfaces y PDFs      │
                     └─────────────┬───────────────────────────┬──────────────┘
                                   │                           │
                                   ▼                           ▼
        ┌──────────────────────────────────────┐   ┌──────────────────────────┐
        │ NEMOTRON 3.5 LIGHTNING (#fast-exec)  │   │ NEMOTRON 3 NANO OMNI     │
        │ Subagente ejecutor: tests, terminal, │   │ Percepción de audio/video│
        │ búsquedas paralelas a 400+ tok/s     │   │ y OCR denso en inglés    │
        └──────────────────────────────────────┘   └──────────────────────────┘
```
