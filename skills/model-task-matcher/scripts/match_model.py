#!/usr/bin/env python3
"""
match_model.py - Evaluador determinista de modelos para model-task-matcher.
Determina el modelo óptimo en base al arquetipo de tarea, ventana de contexto y restricciones.
"""

import argparse
import json
import sys

MODEL_REGISTRY = {
    "swe_heavy": {
        "model": "deepseek/deepseek-v4.1-flash-1017",
        "name": "DeepSeek-V4.1-Flash (1017)",
        "variant": "balanced",
        "reasoning_effort": "medium",
        "temperature": 1.0,
        "top_p": 0.95,
        "max_context": 1048576,
        "identity_card": "openbridge/models/deepseek_v4_1.md",
        "mitigations": [
            "Activar directiva Lean Mode (máximo 5 líneas de texto de respuesta visible).",
            "Fijar temperatura en 1.0 y controlar determinismo exclusivamente vía reasoning.effort.",
            "Para salidas JSON, no usar response_format estricto; incluir la palabra literal 'json' y validar con jq o Python.",
            "Rasterizar cualquier documento PDF a PNG (~1344x1344) antes de invocar la ruta visual.",
            "Compactar preventivamente a los 200K-400K tokens para blindar el 97% de acierto de caché de prefijo."
        ]
    },
    "algorithmic_logic": {
        "model": "google/gemma-4-31b-it",
        "name": "Google Gemma 4 31B Dense",
        "variant": "standard",
        "reasoning_effort": "medium",
        "temperature": 1.0,
        "top_p": 0.95,
        "max_context": 262144,
        "identity_card": "openbridge/models/gemma_4.md",
        "mitigations": [
            "Prohibir la herramienta edit estándar por subcadenas (Issue #21850). Exigir edición por números de línea.",
            "Regla estricta NO ANNOUNCE-AND-STOP: emitir tool_call inmediatamente en el mismo turno tras el razonamiento.",
            "Filtrar proveedores en OpenRouter priorizando SambaNova, ModelRun, DeepInfra y NextBit; excluir Crusoe, Chutes, Modal.",
            "Inyectar grounding obligatorio si se emplean APIs o paquetes posteriores a enero de 2025."
        ]
    },
    "fast_exploration": {
        "model": "google/gemma-4-26b-a4b-it",
        "name": "Google Gemma 4 26B-A4B MoE",
        "variant": "fast-explore",
        "reasoning_effort": "low",
        "temperature": 0.2,
        "top_p": 0.95,
        "max_context": 49152,
        "identity_card": "openbridge/models/gemma_4.md",
        "mitigations": [
            "Acotar la sesión a un límite estricto de context: 49152 para prevenir detail flipping.",
            "Activar auto-compaction con prune: true para descartar outputs extensos de herramientas sin resumir.",
            "Usar exclusivamente para lectura, glob, grep, y síntesis de solo lectura."
        ]
    },
    "massive_architecture": {
        "model": "nvidia/nemotron-3-ultra-550b-a55b",
        "name": "NVIDIA Nemotron 3 Ultra (550B-A55B)",
        "variant": "architect",
        "reasoning_effort": "high",
        "temperature": 1.0,
        "top_p": 0.95,
        "max_context": 1000000,
        "identity_card": "openbridge/models/nvidia_nemotron.md",
        "mitigations": [
            "Obligatorio: inyectar 'chat_template_kwargs': {'force_nonempty_content': true} para evitar cierres scratchpad-only.",
            "Instrucciones de formato estilo Codex explícito con invariantes y contratos definidos.",
            "Exigir explícitamente plan de tests unitarios antes de pasar a construcción.",
            "Delegar exploración exploratoria de consola al subagente lightning-worker."
        ]
    },
    "visual_frontend": {
        "model": "nvidia/nemotron-3.5-super-vl",
        "name": "NVIDIA Nemotron 3.5 Super VL (120B-A12B)",
        "variant": "vision",
        "reasoning_effort": "medium",
        "temperature": 0.6,
        "top_p": 0.95,
        "max_context": 1000000,
        "identity_card": "openbridge/models/nvidia_nemotron.md",
        "mitigations": [
            "Utilizar régimen de muestreo visual (temperature: 0.6, top_p: 0.95).",
            "Inyectar 'chat_template_kwargs': {'force_nonempty_content': true}.",
            "Fijar limit.output en 32768 para que el razonamiento no devuelva finish_reason: 'length' con contenido vacío.",
            "Si la entrada contiene audio (.wav/.mp3), redirigir a omni-perceptor (Super VL carece de codificador acústico)."
        ]
    },
    "terminal_execution": {
        "model": "nvidia/nemotron-3.5-lightning",
        "name": "NVIDIA Nemotron 3.5 Lightning (30B-A3B)",
        "variant": "fast-exec",
        "reasoning_effort": "none",
        "temperature": 0.2,
        "top_p": 0.95,
        "max_context": 1000000,
        "identity_card": "openbridge/models/nvidia_nemotron.md",
        "mitigations": [
            "Agrupar lecturas y validaciones en lote con execute (Code Mode) para evitar límites de tasa (429) en endpoints gratuitos.",
            "Inyectar 'force_nonempty_content': true.",
            "Desactivar thinking para máxima velocidad de respuesta (280-490 tok/s)."
        ]
    },
    "omnimodal_perception": {
        "model": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
        "name": "NVIDIA Nemotron 3 Nano Omni (30B-A3B)",
        "variant": "omni-think",
        "reasoning_effort": "high",
        "temperature": 0.6,
        "top_p": 0.95,
        "max_context": 256000,
        "identity_card": "openbridge/models/nvidia_nemotron.md",
        "mitigations": [
            "PROMPT OBLIGATORIO EN INGLÉS (English only). Traducir requerimientos al inglés antes de la invocación.",
            "Para audio (.wav/.mp3) y video (.mp4), invocar mediante el script auxiliar omni_media_query.py en Base64.",
            "Apoyarse en etiquetas de texto de diagramas para compensar limitaciones de orientación espacial de C-RADIOv4-H."
        ]
    }
}

def match_model(workload: str, context: int = 16000, force_free: bool = False):
    config = MODEL_REGISTRY.get(workload)
    if not config:
        config = MODEL_REGISTRY["swe_heavy"]
    
    res = dict(config)
    if force_free and not res["model"].endswith(":free"):
        # Mapear a endpoint :free si existe
        if "deepseek" in res["model"]:
            # DeepSeek no tiene slug :free en OpenRouter, pero en OpenCode Zen nativo es gratuito
            res["notes"] = "Servido gratuitamente a través de OpenCode Zen local."
        elif "gemma" in res["model"]:
            res["model"] = f"{res['model']}:free"
        elif "nemotron" in res["model"]:
            res["model"] = f"{res['model']}:free"
            
    return res

def main():
    parser = argparse.ArgumentParser(description="Model Task Matcher")
    parser.add_argument("--workload", choices=list(MODEL_REGISTRY.keys()), default="swe_heavy")
    parser.add_argument("--context", type=int, default=16000)
    parser.add_argument("--free", action="store_true", help="Force $0 free tier endpoints")
    args = parser.parse_args()

    result = match_model(args.workload, args.context, args.free)
    print(json.dumps(result, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
