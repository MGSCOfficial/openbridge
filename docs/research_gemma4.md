# Investigación Profunda: Familia Gemma 4 (31B Dense y 26B-A4B MoE)
*Fuente original: Documento de investigación Gemini compartido por el usuario (julio-noviembre 2026).*

## 1. Arquitectura y Especificaciones
- **Gemma 4 31B (`google/gemma-4-31b-it`)**:
  - Parámetros Totales: 30.7B densos (60 capas).
  - Parámetros Activos: 30.7B (100% de la red activa por token).
  - Embeddings: 1.410M.
  - Mecanismo de Atención: Híbrido 5:1 (5 capas de Sliding Window Attention de 1.024 tokens por 1 capa Global).
  - Unificación KV en capas globales: `values = keys`, ahorrando hasta un 37.5% de VRAM en la caché KV.
  - Proportional RoPE (p-RoPE con $p=0.25$, base frequency 1M en globales, 10k en locales).
  - MTP Drafter Head: 500M parámetros (4 capas, dim 1024) para speculative decoding nativo.
  - Visión: ViT 550M parámetros (congelado en pre-entrenamiento), presupuesto dinámico de tokens (70, 140, 280, 560, 1120).
  - Cuantización: QAT nativo en Q4_0 (19.2 GB) y w4a16-ct.

- **Gemma 4 26B-A4B (`google/gemma-4-26b-a4b-it`)**:
  - Parámetros Totales: 25.2B MoE (30 capas).
  - Parámetros Activos por Token: 3.8B ("Active 4B", ~15% de los pesos).
  - Topología de Expertos: 128 expertos enrutados (top-8 activos) + 1 experto compartido siempre activo + rama densa GeGLU paralela para prevenir colapso de representación.
  - Embeddings: 740M.
  - MTP Drafter Head: 430M parámetros.
  - Ventana de Contexto: 256K tokens (262.144 exactos), salida máx 32.768 tokens.
  - Velocidad: 2.0x - 2.5x más rápido que el 31B en inferencia cruda; 1/3 del coste en OpenRouter ($0.031 - $0.04/M entrada).

## 2. Capacidades y Benchmarks Críticos
- **Programación & Algoritmos**:
  - LiveCodeBench v6: 80.0% (31B) vs 77.1% (26B-A4B).
  - Codeforces ELO: 2150 (31B Candidate Master) vs 1718 (26B-A4B).
  - HumanEval+: 92.7% (31B) vs 95.1% (26B-A4B en ejecuciones locales).
  - Go Compiler Test: 14/15 en programas básicos.
- **Contexto Largo (32K - 128K)**:
  - RULER (32K): 96.8% (31B) vs 97.3% (26B-A4B).
  - RULER (128K): 96.4% (31B) vs 89.8% (26B-A4B - caída de 7.5 pts).
  - MRCR v2 (8 agujas @ 128K): 66.4% (31B) vs 44.1% (26B-A4B - brecha masiva de +22.3 pts).
  - GraphWalks (<128K): 82.3% (31B) vs 72.6% (26B-A4B).
- **Herramientas & Agentes**:
  - Tau2-bench: 76.9% (31B) vs 68.2% (26B-A4B).
  - Terminal-Bench Hard: 36.4% (31B con thinking) vs 13.6% (26B-A4B).

## 3. Limitaciones Operativas y Modos de Fallo
1. **DSL Nativo vs JSON**: Usa `<|tool_call>call:nombre{clave:<|"|>valor<|"|>}<tool_call|>`. Requiere parsers actualizados en proxies o Jinja.
2. **Issue #21850 en OpenCode**: Alucinación del parámetro `oldString` en la herramienta `edit` estándar. Solución: usar edición basada en números de línea (`line-edit`).
3. **Lazy Tool Chaining / Paradas Abruptas**: Tiende a anunciar "Voy a leer X" y cerrar turno sin disparar la herramienta. Regla obligatoria: *NO ANNOUNCE-AND-STOP*.
4. **Detail Flipping en 26B-A4B**: Pasados los 32K-64K tokens, el modelo MoE tiende a invertir roles/sujetos o ignorar contexto disperso. Debe acotarse a sub-tareas <48K tokens.
5. **Corte de Conocimiento**: Enero de 2025. Desconoce librerías/SDKs posteriores a esa fecha sin grounding explícito.
