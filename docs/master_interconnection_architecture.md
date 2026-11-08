# ARQUITECTURA MAESTRA DE INTERCONEXIÓN: PLANIFICADOR, ZEN, OPENBRIDGE Y ENJAMBRES

**Identificador de Diseño:** `MASTER-ARCHITECTURE-V1`  
**Estado:** Certificado para Implementación Gradual  
**Ecosistema:** Antigravity (Gemini 3.8) ➔ Mediador OpenBridge ➔ OpenCode Zen Workers

---

## 1. Diagrama de Flujo y Topología de Componentes

```mermaid
sequenceDiagram
    autonumber
    participant U as Usuario / Operador
    participant O as Anatomical Task Planner (Orchestrator)
    participant Z as Antigravity Zen (Pizarra Maestra)
    participant B as OpenBridge Mediator (MCP)
    participant W as Workers Externos (Nemotron / DeepSeek)
    participant G as Git & Quality Gates

    U->>O: Solicita tarea compleja
    O->>O: Triage y Descomposición Anatómica (00_Inventory.md)
    O->>Z: Registra objetivo e invariantes (zen board)
    
    rect rgb(240, 248, 255)
        Note over O,B: Fase de Despacho de Micro-Problemas Mecánicos
        O->>B: openbridge_start_task(P01, model="nemotron-3.5-lightning", sandbox=true)
        B->>Z: Crea pizarra satélite efímera (.zen/workers/job_01.md)
        B-->>O: Retorna job_01 en <50ms (No Bloqueante)
    end

    rect rgb(245, 255, 250)
        Note over B,W: Ejecución en Enjambre a Coste $0
        B->>W: Ejecuta prompt en OpenCode con Micro-Skill aislada
        W-->>B: Respuesta vía SSE + Parches de código
    end

    rect rgb(255, 250, 245)
        Note over O,G: Consolidación y Certificación de Calidad
        O->>B: openbridge_check_task(job_01)
        B-->>O: Entrega código y diffs generados
        O->>G: Validación nativa (node --check / tests)
        G-->>O: PASS (0 errores)
        O->>Z: Consolida hito en Pizarra Maestra (zen.py complete-task)
        O->>B: Destruye sandbox y pizarra satélite
        O->>G: Micro-commit atómico: feat(P01): [titulo]
    end

    O->>U: Reporte consolidado único de progreso
```

---

## 2. Los 4 Pilares del Desacoplamiento

### Pilar 1: Independencia Absoluta de Antigravity Zen
* `antigravity-zen` no importa módulos de OpenBridge ni depende de OpenCode.
* La carpeta `.zen/workers/` es puramente opcional: si el desarrollador no usa OpenBridge, Zen se comporta exactamente como hoy (una Pizarra Maestra única para un solo agente).

### Pilar 2: Especialización de Anatomical Task Planner
* Deja de llamarse "orquestador de agentes" y se enfoca al 100% en:
  - Detección de casos de borde y contratos de tipos en `00_Inventory.md`.
  - Construcción del grafo DAG en `Execution_Workflow.md`.
  - Aplicación de compuertas de calidad sin comprobadores Python inventados.

### Pilar 3: Aislamiento Cognitivo de Workers (Micro-Skills)
* Las skills extensas de Antigravity (que superan los 2.000 tokens) se mantienen exclusivamente en la ventana de Gemini 3.8.
* A los workers en OpenCode solo se les inyectan **Micro-Skills Quirúrgicas** (<150 tokens) creadas en `.agents/skills/workers/`:
  - `worker-test-runner.md`
  - `worker-dto-scaffolder.md`
  - `worker-ui-checker.md`

### Pilar 4: Arbitraje Dinámico por Perfil de Carga
* OpenBridge no delega a ciegas a un solo modelo:
  - Si la tarea contiene `tests` o `algoritmo` ➔ Asigna **`nemotron-3.5-lightning-free`**.
  - Si la tarea contiene `ui`, `css` o `pantalla` ➔ Asigna **`nemotron-3.5-super-vl-free`**.
  - Si la tarea contiene `boilerplate` o `interfaces` ➔ Asigna **`deepseek-v4.1-flash-free`**.
  - Si la tarea es de `alta complejidad lógica` ➔ Asigna **`nemotron-3-ultra-550b:free`**.
