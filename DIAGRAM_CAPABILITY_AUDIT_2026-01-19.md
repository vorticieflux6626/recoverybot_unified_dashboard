# Diagram Generation Capability Audit & Integration Plan

> **Date**: 2026-01-19 | **Auditor**: Claude Code (Opus 4.5) | **Scope**: Full Ecosystem
> **Status**: ✅ **IMPLEMENTED** (Phase 50 Complete)

---

## Implementation Status

| Phase | Status | Details |
|-------|--------|---------|
| **Phase 1: Intent Detection** | ✅ Complete | 40+ patterns in QueryAnalyzer, DiagramIntent model |
| **Phase 2: Service Methods** | ✅ Complete | DocumentGraphService: get_circuit_diagram, get_harness_diagram, get_pinout_diagram |
| **Phase 3: Orchestrator** | ✅ Complete | PHASE 12.12 with user-requested + auto-generation |
| **Phase 4: Model Updates** | ✅ Complete | DiagramType/DiagramFormat enums, extended TroubleshootingDiagram |
| **Phase 5: Android** | ✅ Complete | SVG support, WireColorLegend, PinAssignmentTable |
| **Audit Fixes** | ✅ Complete | Instructions.diagram_capability, COP1/COP2 pattern priority |

### Files Modified

**memOS Server:**
- `agentic/models.py` - DiagramType, DiagramFormat, DiagramIntent models
- `agentic/analyzer.py` - DIAGRAM_INTENT_PATTERNS (40+ patterns), detect_diagram_intent()
- `agentic/orchestrator_universal.py` - PHASE 12.12, _detect_diagram_opportunity(), feature flags
- `agentic/prompt_config.py` - Instructions.diagram_capability field
- `core/document_graph_service.py` - get_circuit_diagram(), get_harness_diagram(), get_pinout_diagram()
- `config/prompts.yaml` - diagram_capability instruction, diagram_classification prompt

**Android Client:**
- `AgenticSearchModels.kt` - DiagramType/DiagramFormat enums, extended TroubleshootingDiagram
- `MermaidDiagram.kt` - SVG wrapping support, type-based icons
- `DiagramMetadata.kt` - WireColorLegend(), PinAssignmentTable(), parseWireColor()
- `TroubleshootingDiagramCard.kt` - Wire/pin metadata integration

### Bug Fixes Applied (2026-01-19)

1. **Instructions.diagram_capability not loaded**: Added `diagram_capability: str = ""` to Instructions dataclass
2. **COP1 pinout detected as HARNESS**: Removed "pinout" from COP harness patterns; now correctly routes to PINOUT type
3. **Encoder 17-pin pattern**: Added `17[- ]?pin\s+(?:encoder\s+)?pinout` pattern for better subtype detection

### Test Results

All pattern detection tests pass:
- COP1 pinout → PINOUT/COP1 ✅
- COP1 harness → HARNESS/COP1 ✅
- encoder 17-pin pinout → PINOUT/ENCODER_17PIN ✅
- servo drive circuit → CIRCUIT/SERVO_DRIVE ✅
- TBOP13 pinout → PINOUT/TBOP13 ✅

---

## Executive Summary

The Recovery Bot ecosystem has **significant existing diagram generation capabilities** that are underutilized. PDF_Extraction_Tools contains production-ready renderers for circuit diagrams, wiring harnesses, and troubleshooting flowcharts. memOS has a working integration pipeline for flowcharts, and the Android client can display HTML/Mermaid diagrams via WebView.

**Key Finding**: ~~The infrastructure exists but is not exposed to users for on-demand diagram generation.~~ **RESOLVED**: Phase 50 implementation now enables user-requested diagrams for electrical schematics, wiring harnesses, and pinout diagrams.

---

## Current State Assessment

### What Already Exists

| Component | Location | Capability | Status |
|-----------|----------|------------|--------|
| **Circuit Renderer** | PDF_Extraction_Tools | SVG circuit diagrams with 15+ component types | ✅ Production-ready |
| **Harness Renderer** | PDF_Extraction_Tools | Wiring harness diagrams with color coding | ✅ Production-ready |
| **Flowchart Generator** | PDF_Extraction_Tools | Mermaid.js troubleshooting flowcharts (33+ error codes) | ✅ Production-ready |
| **Diagram API** | PDF_Extraction_Tools | REST endpoints for all diagram types | ✅ Implemented |
| **Electrical Models** | PDF_Extraction_Tools | 80+ node/edge types for electrical architecture | ✅ Complete |
| **Connector Database** | PDF_Extraction_Tools | 23 FANUC connectors with full pinouts | ✅ Complete |
| **memOS Integration** | memOS | DocumentGraphService fetches diagrams | ✅ Working |
| **SSE Events** | memOS | DIAGRAM_GENERATING, DIAGRAM_GENERATED | ✅ Implemented |
| **Android WebView** | Android | MermaidDiagram, fullscreen viewer | ✅ Working |

### What's Missing (RESOLVED)

| Gap | Impact | Priority | Status |
|-----|--------|----------|--------|
| User request detection for diagrams | Users can't ask "show me a wiring diagram" | **P0** | ✅ Implemented |
| Circuit/harness diagram integration in memOS | Only flowcharts are fetched | **P0** | ✅ Implemented |
| Intent classification for diagram types | System doesn't know what diagram to generate | **P1** | ✅ Implemented |
| Custom diagram generation from query context | Can't synthesize diagrams from discussion | **P1** | ✅ Implemented |
| Interactive diagram annotations | Static viewing only | **P2** | 🔲 Future |
| PCB layout visualization | No board-level diagrams | **P2** | 🔲 Future |

---

## Existing API Endpoints (PDF_Extraction_Tools - Port 8002)

### Circuit Diagrams
```
GET  /api/v1/diagrams/circuits/types              # List: POWER_DISTRIBUTION, SERVO_DRIVE, ENCODER_INTERFACE, SAFETY_CIRCUIT, FSSB_COMMUNICATION
POST /api/v1/diagrams/circuits/generate           # Generate from type + theme
GET  /api/v1/diagrams/circuits/{type}             # Quick generation
POST /api/v1/diagrams/circuits/custom             # Custom from JSON spec
```

### Wiring Harnesses
```
GET  /api/v1/diagrams/harnesses/types             # List: ENCODER_17PIN, MOTOR_POWER, SAFETY_ESTOP, OPERATOR_PANEL, FSSB_FIBER
POST /api/v1/diagrams/harnesses/generate          # Generate from type + theme
GET  /api/v1/diagrams/harnesses/{type}            # Quick generation
POST /api/v1/diagrams/harnesses/custom            # Custom from JSON spec
```

### Troubleshooting Flowcharts
```
GET  /api/v1/diagrams/supported-errors            # List 33+ error codes
POST /api/v1/diagrams/troubleshooting-flowchart   # Generate for error code
GET  /api/v1/diagrams/html/{error_code}           # HTML-wrapped for WebView
```

---

## Electrical Data Models Available

### Component Types (for diagrams)
- Power: power_supply, transformer, circuit_breaker, contactor, fuse, disconnect
- Servo: servo_amplifier, motor_winding, encoder_interface
- I/O: io_module, connector, terminal_block
- PCB: pcb_board, pin, net, ic, trace
- Safety: e_stop, safety_relay, safety_contactor
- Network: fssb_interface, fiber_optic

### Connector Database (23 types)
- **Encoder**: ENCODER_17PIN, JF1/JF2/JF3 (15-pin pulsecoder)
- **Motor**: MOTOR_POWER_4PIN (MS3102A-18-10S)
- **Operator Panel**: COP1 (20-pin), COP2 (10-pin)
- **Safety**: TBOP13 (E-stop), TBOP14 (STO), TBOP20 (DCS)
- **Communication**: CD38A/CD38B (RJ45), JD5A (RS-232)
- **FSSB**: COP10A/COP10B (fiber optic)
- **Power**: TB_AC_INPUT (3-phase), TB_DC_BUS (310V DC)

### Wire Specifications
- AWG 10-26 with current ratings
- 15 IEC/NFPA color codes
- Shielded cable support
- Differential pair routing

---

## Integration Plan

### Phase 1: User Intent Detection (P0)

**Goal**: Enable users to request diagrams naturally

**New Intent Patterns** (add to QueryAnalyzer):
```python
DIAGRAM_INTENT_PATTERNS = {
    "circuit_diagram": [
        r"show.*circuit.*diagram",
        r"draw.*schematic",
        r"electrical.*schematic",
        r"wiring.*schematic",
        r"circuit.*for\s+(SRVO|servo|power|encoder)",
    ],
    "harness_diagram": [
        r"show.*wiring.*harness",
        r"cable.*diagram",
        r"connector.*pinout",
        r"harness.*for\s+(encoder|motor|safety|operator)",
        r"wire.*routing",
    ],
    "pinout_diagram": [
        r"show.*pinout",
        r"connector.*pins",
        r"pin.*assignment",
        r"which.*pins?.*connect",
    ],
    "flowchart": [
        r"troubleshoot.*flowchart",
        r"diagnostic.*steps",
        r"how.*to.*fix\s+(SRVO|MOTN|SYST|HOST)",
    ]
}
```

**Implementation Files**:
- `memOS/server/agentic/analyzer.py` - Add diagram intent detection
- `memOS/server/agentic/models.py` - Add DiagramRequest model

### Phase 2: Diagram Fetching Service (P0)

**Goal**: Extend DocumentGraphService to fetch all diagram types

**New Methods** (add to `document_graph_service.py`):
```python
async def get_circuit_diagram(
    self,
    circuit_type: str,  # POWER_DISTRIBUTION, SERVO_DRIVE, etc.
    theme: str = "dark"
) -> Optional[Dict[str, Any]]:
    """Fetch circuit diagram SVG from PDF Tools API"""

async def get_harness_diagram(
    self,
    harness_type: str,  # ENCODER_17PIN, MOTOR_POWER, etc.
    theme: str = "dark"
) -> Optional[Dict[str, Any]]:
    """Fetch wiring harness diagram SVG from PDF Tools API"""

async def get_pinout_diagram(
    self,
    connector_type: str,  # COP1, ENCODER_17PIN, etc.
) -> Optional[Dict[str, Any]]:
    """Fetch connector pinout diagram"""

async def detect_diagram_opportunity(
    self,
    query: str,
    context: str
) -> List[DiagramSuggestion]:
    """Detect when a diagram would be helpful based on query/context"""
```

### Phase 3: Orchestrator Integration (P0)

**Goal**: Automatically generate diagrams when relevant

**New Phase in Orchestrator** (`orchestrator_universal.py`):
```python
# PHASE 4.7: Diagram Generation
async def _phase_diagram_generation(self):
    """Generate relevant diagrams based on query context"""

    # 1. Check if user explicitly requested diagram
    if self.query_analysis.diagram_intent:
        diagram = await self._generate_requested_diagram()

    # 2. Check if context warrants automatic diagram
    elif self.feature_config.auto_generate_diagrams:
        suggestions = await self.doc_graph.detect_diagram_opportunity(
            self.original_query,
            self.synthesis_result
        )
        if suggestions:
            diagram = await self._generate_suggested_diagram(suggestions[0])

    # 3. Emit diagram if generated
    if diagram:
        await self.emit_event(diagram_generated(diagram))
        self.response.diagrams.append(diagram)
```

**Feature Flags** (add to FeatureConfig):
```python
# Diagram generation
enable_circuit_diagrams: bool = False      # ENHANCED+
enable_harness_diagrams: bool = False      # ENHANCED+
enable_pinout_diagrams: bool = False       # ENHANCED+
auto_generate_diagrams: bool = False       # RESEARCH+
```

**Preset Updates**:
| Preset | circuit | harness | pinout | auto |
|--------|---------|---------|--------|------|
| MINIMAL | false | false | false | false |
| BALANCED | false | false | false | false |
| ENHANCED | true | true | true | false |
| RESEARCH | true | true | true | true |
| FULL | true | true | true | true |

### Phase 4: Response Model Updates (P1)

**Extended Diagram Types**:
```python
class DiagramType(str, Enum):
    FLOWCHART = "flowchart"
    CIRCUIT = "circuit"
    HARNESS = "harness"
    PINOUT = "pinout"
    BLOCK = "block"

class DiagramFormat(str, Enum):
    HTML = "html"       # Mermaid.js wrapped
    SVG = "svg"         # Raw SVG
    MERMAID = "mermaid" # Mermaid syntax

class TroubleshootingDiagram(BaseModel):
    type: DiagramType
    format: DiagramFormat
    content: str

    # Common metadata
    title: Optional[str]
    description: Optional[str]

    # Type-specific metadata
    error_code: Optional[str]           # flowchart
    circuit_type: Optional[str]         # circuit
    harness_type: Optional[str]         # harness
    connector_type: Optional[str]       # pinout

    # Component info
    parts_needed: List[str] = []
    tools_needed: List[str] = []
    components_affected: List[str] = []

    # For harness/pinout
    wire_colors: Dict[str, str] = {}    # signal -> color
    pin_assignments: Dict[str, str] = {} # pin -> signal
```

### Phase 5: Android Enhancements (P1)

**SVG Rendering Support**:
- Current WebView can already display SVG embedded in HTML
- Add dedicated SVG display mode for cleaner rendering
- Add component highlighting on tap (JavaScript bridge)

**New Components Needed**:
```kotlin
// For interactive pinouts
@Composable
fun PinoutDiagram(
    diagram: TroubleshootingDiagram,
    onPinTap: (String) -> Unit,
    colors: AppColors
)

// For circuit zoom/pan
@Composable
fun CircuitSchematic(
    diagram: TroubleshootingDiagram,
    zoomLevel: Float,
    colors: AppColors
)
```

### Phase 6: Automatic Diagram Triggers (P1)

**When to Auto-Generate Diagrams**:

| Trigger | Diagram Type | Condition |
|---------|--------------|-----------|
| Servo error code | Circuit + Flowchart | SRVO-0XX detected |
| Motor discussion | Harness | "motor", "winding", "phase" |
| Encoder issue | Pinout | "encoder", "feedback", "pulse" |
| Wiring question | Harness | "wire", "connect", "cable" |
| Safety discussion | Circuit | "e-stop", "safety", "TBOP" |
| FSSB issue | Circuit | "FSSB", "fiber", "COP10" |

**Detection Logic**:
```python
def detect_diagram_opportunity(query: str, context: str) -> List[DiagramSuggestion]:
    suggestions = []

    # Circuit diagrams
    if re.search(r'servo.*amplifier|power.*supply|SRVO-\d{3}', query, re.I):
        suggestions.append(DiagramSuggestion(
            type=DiagramType.CIRCUIT,
            subtype="SERVO_DRIVE",
            confidence=0.8,
            reason="Servo amplifier discussion detected"
        ))

    # Harness diagrams
    if re.search(r'encoder.*cable|17.*pin|feedback.*wiring', query, re.I):
        suggestions.append(DiagramSuggestion(
            type=DiagramType.HARNESS,
            subtype="ENCODER_17PIN",
            confidence=0.9,
            reason="Encoder cable discussion detected"
        ))

    return sorted(suggestions, key=lambda x: x.confidence, reverse=True)
```

---

## Prompt Engineering for Diagram Requests

### Add to Synthesizer Prompt (`prompts.yaml`):
```yaml
diagram_instructions: |
  DIAGRAM GENERATION CAPABILITIES:

  When the user asks about electrical/wiring topics, you can generate:

  1. **Circuit Diagrams**: Power distribution, servo drives, encoder interfaces,
     safety circuits, FSSB communication

  2. **Wiring Harness Diagrams**: Encoder cables (17-pin), motor power,
     safety E-stop, operator panel, FSSB fiber

  3. **Pinout Diagrams**: COP1/COP2 operator panels, encoder connectors,
     safety terminal blocks (TBOP13/14/20), communication ports

  4. **Troubleshooting Flowcharts**: SRVO, MOTN, SYST, HOST error codes

  When discussing wiring, connections, or troubleshooting, mention that
  a diagram is available and will be displayed below the response.

  If the user explicitly requests a diagram, confirm what will be generated.
```

### Add to QueryAnalyzer Prompt:
```yaml
diagram_classification: |
  Classify if the user is requesting a diagram:

  DIAGRAM_REQUEST_TYPES:
  - circuit: Electrical schematic, power distribution, servo drive circuit
  - harness: Wiring harness, cable routing, wire colors
  - pinout: Connector pinout, pin assignments, terminal layout
  - flowchart: Troubleshooting steps, diagnostic procedure
  - none: No diagram requested

  Extract:
  - diagram_type: One of the above
  - diagram_subtype: Specific variant (e.g., "SERVO_DRIVE", "ENCODER_17PIN")
  - confidence: 0.0-1.0
```

---

## Test Cases

### User-Requested Diagrams
```
Q: "Show me the wiring harness for a FANUC encoder"
Expected: ENCODER_17PIN harness diagram with wire colors

Q: "What's the pinout for COP1?"
Expected: COP1 20-pin connector pinout diagram

Q: "Draw the servo drive circuit"
Expected: SERVO_DRIVE circuit schematic

Q: "How do I troubleshoot SRVO-062?"
Expected: Flowchart + parts/tools metadata
```

### Auto-Generated Diagrams
```
Q: "My encoder feedback is noisy on axis 2"
Expected: Discussion + ENCODER_17PIN harness suggestion

Q: "The servo amplifier keeps faulting"
Expected: Troubleshooting + SERVO_DRIVE circuit

Q: "How do I wire the emergency stop?"
Expected: Safety discussion + SAFETY_CIRCUIT diagram
```

---

## Implementation Timeline

### Week 1: Core Integration (P0) - ✅ COMPLETE
- [x] Add diagram intent detection to QueryAnalyzer (40+ patterns)
- [x] Extend DocumentGraphService with circuit/harness methods
- [x] Add PHASE 12.12 to orchestrator (replaces Phase 4.7)
- [x] Update FeatureConfig and presets (ENHANCED/RESEARCH/FULL)
- [x] Test with explicit diagram requests (13/13 patterns pass)

### Week 2: Auto-Generation (P1) - ✅ COMPLETE
- [x] Implement _detect_diagram_opportunity() in orchestrator
- [x] Add diagram suggestions based on synthesis context
- [x] Update prompts.yaml with diagram_capability instruction
- [x] Test auto-generation triggers

### Week 3: Android & Polish (P1-P2) - ✅ COMPLETE
- [x] Add SVG display mode to MermaidDiagram.kt (wrapSvgInHtml)
- [x] Add WireColorLegend for harness diagrams (15 IEC/NFPA colors)
- [x] Add PinAssignmentTable for pinout diagrams (natural sorting)
- [x] Add diagram type indicators in UI (icons per DiagramType)

### Week 4: Documentation & Rollout - ✅ COMPLETE
- [x] Update CLAUDE.md files (Key Design Decisions table)
- [x] Test coverage (pattern detection verified)
- [x] Feature flag validation (4 flags per preset)
- [x] Git commits pushed to memOS and Android repos

---

## File Changes Summary

| File | Changes |
|------|---------|
| `memOS/server/agentic/analyzer.py` | Add diagram intent detection |
| `memOS/server/agentic/models.py` | Add DiagramType, DiagramFormat, update TroubleshootingDiagram |
| `memOS/server/core/document_graph_service.py` | Add get_circuit_diagram(), get_harness_diagram(), get_pinout_diagram() |
| `memOS/server/agentic/orchestrator_universal.py` | Add PHASE 4.7, feature flags, auto-generation |
| `memOS/server/config/prompts.yaml` | Add diagram_instructions, diagram_classification |
| `memOS/server/agentic/events.py` | Add CIRCUIT_DIAGRAM_GENERATED, HARNESS_DIAGRAM_GENERATED |
| `Android/.../AgenticSearchModels.kt` | Update TroubleshootingDiagram with new types |
| `Android/.../MermaidDiagram.kt` | Add SVG display mode |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Diagram request detection accuracy | >90% |
| Auto-generation relevance | >80% user acceptance |
| Diagram render time | <500ms |
| User satisfaction with diagrams | 4.5/5 rating |

---

## Appendix: Available Diagram Templates

### Circuit Types
1. `POWER_DISTRIBUTION` - 24V power supply distribution
2. `SERVO_DRIVE` - Servo amplifier and motor circuit
3. `ENCODER_INTERFACE` - Encoder to servo amp connection
4. `SAFETY_CIRCUIT` - Dual-channel E-stop with PNOZ
5. `FSSB_COMMUNICATION` - Fiber optic servo bus

### Harness Types
1. `ENCODER_17PIN` - 17-pin encoder cable (13 wires)
2. `MOTOR_POWER` - Motor phases U/V/W + PE (4 wires)
3. `SAFETY_ESTOP` - Dual-channel E-stop (5 wires)
4. `OPERATOR_PANEL` - COP1 operator panel (12 wires)
5. `FSSB_FIBER` - Fiber optic cable (2 fibers)

### Connector Pinouts (23 total)
- COP1, COP2, TBOP13, TBOP14, TBOP20
- ENCODER_17PIN, JF1, JF2, JF3
- MOTOR_POWER_4PIN, COP10A, COP10B
- CD38A, CD38B, JD5A
- TB_AC_INPUT, TB_DC_BUS, CX5X

### Error Codes with Flowcharts (33+)
- SRVO: 001, 002, 006, 023, 030, 062, 063, 065, etc.
- MOTN: 017, 023
- SYST: 001
- HOST: 005

---

*Generated by Claude Code ecosystem audit on 2026-01-19*
