---
name: model-task-matcher
description: Use when determining which AI model, variant, provider order, and prompt rules to assign to a specific task or project within OpenCode Zen and OpenBridge.
---

# MODEL-TASK-MATCHER: ENRUTAMIENTO DETERMINISTA DE MODELOS DE IA

Sistema inteligente para analizar la naturaleza de una tarea de desarrollo y seleccionar con precisión el modelo de IA gratuito o de bajo costo más adecuado en el ecosistema OpenCode Zen / OpenRouter, evitando el desperdicio de tokens y fallos de ejecución.

---

## 1. PRINCIPIO DE CERO SOBRECARGA COGNITIVA

En lugar de mantener especificaciones enciclopédicas de decenas de modelos en la memoria de trabajo activa, esta habilidad opera bajo **carga diferida y lectura bajo demanda**:
1. Evalúa la tarea activa según 5 dimensiones clave.
2. Consulta la ficha de identidad correspondiente en el registro `models/*.md`.
3. Devuelve la asignación canónica de modelo, variante de esfuerzo y reglas obligatorias de prompt.

---

## 2. LAS 5 DIMENSIONES DE EVALUACIÓN TÉCNICA

Ante cualquier tarea delegable a OpenCode o a modelos externos, evalúa:

1. **Tipo de Carga (Workload Archetype)**:
   - `swe_heavy`: Edición de código multi-archivo, refactorización profunda, resolución de tickets complejos, pruebas de regresión.
   - `algorithmic_logic`: Implementación de algoritmos puros, resolución de restricciones matemáticas, lógica concurrente crítica.
   - `fast_exploration`: Inspección de directorios (`glob`/`grep`), lectura inicial rápida, tareas de mantenimiento (títulos, resúmenes).
   - `massive_architecture`: Síntesis de repositorios masivos (>100K tokens), auditorías de seguridad, diseño de sistemas.
   - `visual_frontend`: Análisis de capturas de pantalla de UI, extracción de diagramas, documentos PDF técnicos.
   - `terminal_execution`: Corridas continuas de suites de tests, comandos git, validación determinista de herramientas en bucle.
   - `omnimodal_perception`: Procesamiento de grabaciones de pantalla con audio (.mp4, .wav), OCR denso, computer-use en GUI.

2. **Profundidad de Contexto (Context Window)**:
   - `micro` (<16K tokens): Tareas aisladas de función o archivo único.
   - `medium` (16K - 64K tokens): Módulos acotados con dependencias directas.
   - `massive` (64K - 1M tokens): Repositorios enteros o trazas de ejecución extensas.

3. **Requisito de Formato Estructurado**:
   - `json_schema`: ¿Exige payload JSON estricto o llamadas nativas a herramientas forzadas?
   - `plain_code`: ¿Produce código fuente puro o diffs unificados?

4. **Presupuesto y Tolerancia de Latencia**:
   - `free_zero_cost`: Obligatorio costo \$0 (usar endpoints `:free`).
   - `throughput_priority`: Prioridad en velocidad de generación (>200 tok/s).
   - `precision_priority`: Prioridad en exactitud lógica sin importar latencia.

5. **Riesgo y Necesidad de Verificación**:
   - `verified_loop`: Exige ejecución de tests unitarios antes de reportar éxito.

---

## 3. TABLA CANÓNICA DE SELECCIÓN DE MODELOS

| Arquetipo de Tarea | Modelo Asignado | Slug OpenRouter | Variante / Opciones Clave | Salvaguardas Mandatorias |
| :--- | :--- | :--- | :--- | :--- |
| **`swe_heavy`** | DeepSeek-V4.1-Flash (1017) | `deepseek/deepseek-v4.1-flash-1017` | `effort: "medium"`, `temp: 1.0` | Directiva *Lean Mode* (máx 5 líneas). Validar JSON con `jq`. |
| **`algorithmic_logic`** | Gemma 4 31B Dense | `google/gemma-4-31b-it` | `effort: "medium"` | Usar edición por líneas (`line-edit`). Prohibido anunciar y parar. |
| **`fast_exploration`** | Gemma 4 26B-A4B MoE | `google/gemma-4-26b-a4b-it` | `effort: "low"`, `limit.context: 49152` | Limitar a <48K tokens para evitar *detail flipping*. |
| **`massive_architecture`**| Nemotron 3 Ultra 550B | `nvidia/nemotron-3-ultra-550b-a55b` | `#architect`, `temp: 1.0` | `"force_nonempty_content": true`. Estilo Codex explícito. |
| **`visual_frontend`** | Nemotron 3.5 Super VL | `nvidia/nemotron-3.5-super-vl` | `#vision`, `temp: 0.6` | Muestreo visual a 0.6. Redirigir audio si existe. |
| **`terminal_execution`**| Nemotron 3.5 Lightning | `nvidia/nemotron-3.5-lightning` | `#fast-exec`, `temp: 0.2` | Agrupar lecturas en lote (Code Mode) para evitar rate limits. |
| **`omnimodal_perception`**| Nemotron 3 Nano Omni | `nvidia/nemotron-3-nano-omni-30b-a3b:free` | `#omni-think` | Prompt **obligatoriamente en inglés**. Usar script `omni_media_query.py`. |

---

## 4. PROTOCOLO DE EJECUCIÓN

1. **Invocar Script de Coincidencia**:
   ```bash
   python scripts/match_model.py --workload <arquetipo> --context <tokens> [--free]
   ```
2. **Inspeccionar Ficha de Identidad**:
   Leer `openbridge/models/<familia>.md` si se requieren detalles específicos de configuración o parámetros del proveedor.
3. **Generar la Invocación en OpenBridge**:
   Delegar la tarea pasando el modelo y las instrucciones de mitigación requeridas.
