# Análisis Técnico e Integración: Familia DeepSeek-V4.1-Flash (1017)
*Fuente original: Documento de investigación Gemini compartido por el usuario (septiembre-noviembre 2026).*

## 1. Arquitectura y Parámetros
- **Identificador Canónico**: `deepseek/deepseek-v4.1-flash-1017` (versión del 17 de octubre de 2026 con RL self-feedback).
- **Arquitectura**: Codificador-Decodificador Causal Asimétrico (CED, 40 capas: 20 codificador + 20 decodificador).
- **Desglose de Parámetros**:
  - Parámetros Totales: 763B (552B backbone MoE + 196B Engram disperso + Vision DeepSeek-ViT).
  - Parámetros Activos: Asimétrico (8B en prefill / 16B en decode).
  - Topología de Expertos: DeepSeekMoE con 1 experto compartido y 384 expertos enrutados (top-6 activos).
- **Compresión de KV Cache a 890 Bytes/Token**:
  - CSA2 puro en 38 capas (Full, Reindex, Reuse) + SWA en primeras 2 capas.
  - Cuantización FP4 nativa de KV Cache (E2M1 con escala E4M3 por 16 canales).
  - SWA Bounded Replay (reduce 8x la huella persistente en SSD).
- **Ventana de Contexto**: 1.048.576 tokens (1M tokens). Salida máx 384K.

## 2. Capacidades y Benchmarks
- **DeepSWE v1.1**: 77.0% (supera a Claude Opus 5 @ 74.0% y GPT-5.6 Sol @ 73.0%).
- **Terminal-Bench 2.1**: 90.6%.
- **Terminal-Bench 4.0**: 42.3% (salto clave del checkpoint 1017 sobre el 31.2% de septiembre).
- **Automation-Bench**: 60.5% (frente a 50.3% de Opus 5).
- **Visión Agéntica**: 92.5% en BabyVision con herramientas; 83.0% en Chartography.

## 3. Limitaciones Críticas y Reglas de Operación
1. **Modo Thinking y Temperatura**: Ignora la temperatura (siempre fijar `temperature: 1.0`, `top_p: 0.95-1.0`). El determinismo se controla modulando `reasoning.effort` (`low`, `medium`, `high`).
2. **Sin Plantilla Jinja / Rechazo de `response_format`**: El motor rechaza esquemas gramaticales forzados (`tool_choice=required` o JSON schema forzado). Requiere incluir la palabra literal `"json"` y ejemplos en el prompt, validando con scripts deterministas (`jq`, Python).
3. **Rechazo de Bloques PDF**: No soporta `application/pdf` directo. Requiere rasterizar a PNG (~1344x1344 para su 3x3 pixel-unshuffle).
4. **Abismo de Compactación al 80-90%**: Al pasar del 80% (800K tokens), truncar el inicio destruye el prefix cache y genera una relectura en frío de 5-6 minutos. Solución: compactar preventivamente a los 200K-400K tokens.
5. **Verbosidad de Salida**: Debe obligarse a directivas imperativas de ejecución y directiva Anti-Verbosidad (Modo Lean).
