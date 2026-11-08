# Ficha de Identidad Técnica: Google Gemma 4 (31B Dense & 26B-A4B MoE)

## 1. Metadatos de Identificación y Enrutamiento
- **Familia**: Google Gemma 4 (Google DeepMind, julio 2026 / arXiv:2607.02770).
- **Licencia**: Apache 2.0 (Pesos Abiertos).
- **Corte de Conocimiento**: Enero de 2025.
- **Slugs en OpenRouter**:
  - `google/gemma-4-31b-it` (Equilibrado / Pago: $0.10 entrada / $0.34 salida por 1M).
  - `google/gemma-4-31b-it:nitro` (Prioridad de throughput: ModelRun, SambaNova >150 tok/s).
  - `google/gemma-4-31b-it:free` (Endpoint gratuito vía Google AI Studio).
  - `google/gemma-4-26b-a4b-it` (Equilibrado / Pago: $0.031 entrada / $0.093 salida por 1M).
  - `google/gemma-4-26b-a4b-it:free` (Endpoint gratuito vía Google AI Studio).
- **Proveedores Confiables en OpenRouter (AutoExacto)**:
  - Para 31B: `deepinfra` (fp8/fp4), `sambanova`, `modelrun`, `nextbit`, `siliconflow`, `coreweave`.
  - Para 26B-A4B: `nextbit`, `makora`, `prime-intellect`, `deepinfra`, `io-net`.
  - *Proveedores a Excluir (caída >30% en herramientas)*: `crusoe`, `chutes`, `modal`, `venice`, `friendli`, `novita`.

---

## 2. Anatomía de Parámetros y Arquitectura

| Parámetro / Dimensión | Gemma 4 31B (`gemma-4-31b-it`) | Gemma 4 26B A4B (`gemma-4-26b-a4b-it`) |
| :--- | :--- | :--- |
| **Tipo de Arquitectura** | Transformer Denso (Dense) | Mixture-of-Experts (MoE) |
| **Parámetros Totales** | **30.7B** (30.700 millones) | **25.2B** (25.200 millones) |
| **Parámetros Activos / Token** | **30.7B** (100% de la red) | **3.8B** (~15% de la red; "Active 4B") |
| **Capas (Depth)** | 60 capas | 30 capas |
| **Topología FFN / Expertos** | Bloque GeGLU denso por capa | 128 expertos (Top-8 activos) + 1 experto compartido + rama densa GeGLU paralela |
| **Ventana de Contexto** | 256K (262.144 tokens) | 256K (262.144 tokens) |
| **Salida Máxima** | 32.768 tokens | 32.768 tokens |
| **Mecanismo de Atención** | Híbrido 5:1 (5 SWA de 1.024 tokens por 1 capa Global) | Híbrido 5:1 (5 SWA por 1 Global) |
| **Optimización de Caché KV** | Unificación $Values = Keys$ en capas globales (-37.5% memoria KV) + p-RoPE ($p=0.25$) | Unificación $Values = Keys$ + p-RoPE ($p=0.25$) |
| **Codificador Visual** | ViT ~550M congelado (presupuesto: 70, 140, 280, 560, 1120 tokens/img) | ViT ~550M congelado |
| **Audio** | No soportado (0 parámetros) | No soportado (0 parámetros) |
| **Decodificación Especulativa** | MTP Head nativo de 500M (4 capas, dim 1024) | MTP Head nativo de 430M (4 capas, dim 1024) |
| **Cuantización Nativa** | QAT nativo en Q4_0 (19.2 GB) y w4a16-ct | QAT nativo en Q4_0 (16.2 GB total / 2.8 GB activos) |

---

## 3. Matriz de Capacidades y Benchmarks

- **Programación Algorítmica y Precisión**:
  - *LiveCodeBench v6*: 80.0% (31B) vs 77.1% (26B-A4B).
  - *Codeforces ELO*: 2150 (31B Candidate Master) vs 1718 (26B-A4B).
  - *HumanEval+*: 92.7% (31B) vs 95.1% (26B-A4B en entornos locales).
  - *Go Exam Compilación*: 14/15 en programas básicos.
- **Contexto Largo y Recuperación Multivariable**:
  - *RULER (32K)*: 96.8% (31B) vs 97.3% (26B-A4B).
  - *RULER (128K)*: 96.4% (31B) vs 89.8% (26B-A4B).
  - *MRCR v2 (8 agujas @ 128K)*: 66.4% (31B) vs 44.1% (26B-A4B - brecha crítica de +22.3 pts).
  - *GraphWalks (<128K)*: 82.3% (31B) vs 72.6% (26B-A4B).
- **Uso Agéntico de Herramientas**:
  - *Tau2-bench*: 76.9% (31B) vs 68.2% (26B-A4B).
  - *Terminal-Bench Hard*: 36.4% (31B con thinking) vs 13.6% (26B-A4B).

---

## 4. Modos de Fallo Documentados y Mitigaciones Obligatorias

1. **Protocolo Nativo DSL (`<|tool_call>`) vs OpenAI JSON**:
   - *Fallo*: Generación de sintaxis híbrida `call:fn{{"a":1}}` o cierre prematuro de turnos si el proxy no mapea el DSL nativo de Gemma 4.
   - *Mitigación*: Filtrar proveedores en OpenRouter con parsers actualizados; configurar `stream: false` en llamadas críticas con escapes complejos.
2. **Issue #21850 de OpenCode (Bucle de `oldString`)**:
   - *Fallo*: Gemma 4 alucina diferencias mínimas en `oldString` al usar la herramienta `edit` estándar, entrando en bucle de 10+ reintentos idénticos.
   - *Mitigación*: Prohibir `edit` estándar por coincidencia de subcadenas. Reemplazar por edición basada en números de línea (`line-edit`).
3. **Parada Abrupta ("Lazy Tool Chaining")**:
   - *Fallo*: El modelo anuncia al usuario "Voy a leer X" y emite `<turn|>` sin disparar la herramienta.
   - *Mitigación*: Regla estricta *NO ANNOUNCE-AND-STOP*. Emitir el `tool_call` en el mismo turno inmediatamente tras el razonamiento.
4. **Detail Flipping en 26B-A4B tras 32K-64K Tokens**:
   - *Fallo*: El modelo MoE de 30 capas invierte roles (sujeto/objeto) o ignora restricciones previas si el historial supera los 48K tokens.
   - *Mitigación*: Acotar tareas de 26B-A4B a <48K tokens. Sobrescribir `limit.context: 49152` y activar auto-compaction con `prune: true`.
5. **Corte de Conocimiento en Enero de 2025**:
   - *Mitigación*: Inyectar Grounding documental obligatorio (`post-2025-api-grounding`) antes de usar APIs modernas (2025-2026).

---

## 5. Asignación Óptima de Roles en el Ecosistema

- **Gemma 4 31B Dense**:
  - **Rol**: `build-specialist` y `deep-reviewer`.
  - **Tareas Óptimas**: Edición de código multi-archivo, depuración de concurrencia, razonamiento en grafos de dependencias (>64K tokens), validación de contratos complejos.
- **Gemma 4 26B-A4B MoE**:
  - **Rol**: `plan-explorer` y `fast-navigator`.
  - **Tareas Óptimas**: Exploración inicial de repositorios (`glob`/`grep`), análisis arquitectónico de solo lectura (<48K tokens), tareas de mantenimiento (title, summary, compactación).
