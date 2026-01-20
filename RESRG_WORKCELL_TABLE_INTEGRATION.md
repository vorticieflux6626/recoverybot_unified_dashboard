# RESRG Workcell Layout Table Integration Request

**Date:** 2026-01-12
**Requested By:** PDF_Extraction_Tools / IMM Architecture Module
**Priority:** Medium

## Data Source Location

```
/home/sparkone/sdd/PDF_Extraction_Tools/config/resrg/workcell_layout.json
```

**Original Source:** `/home/sparkone/Documents/RAG_documents/Molding_Layout.json`

## Purpose

This JSON file contains the complete RESRG plastic injection molding facility equipment inventory. It needs to be editable via a table interface so that:
1. Maintenance can update equipment changes (robot swaps, press replacements)
2. Unknown values can be filled in as documentation is found
3. New workcells can be added
4. Equipment status can be tracked

## Data Schema

```json
{
  "metadata": {
    "title": "Industrial Workcell Equipment Inventory",
    "description": "...",
    "component_descriptions": {
      "degate_robot_controller_model": "Controller for degating robot",
      "press_robot_controller_model": "Controller for press robot",
      "degate_robot_model": "Robot that removes runners",
      "press_robot_model": "Robot that interacts with press",
      "press_model": "Injection molding press model",
      "press_hmi_model": "HMI system for press control"
    },
    "last_updated": "2025-05-20",
    "version": "1.0"
  },
  "workcells": [
    {
      "workcell_id": 1,
      "degate_robot_controller_model": "R-30iB Plus",
      "press_robot_controller_model": "R-30iB",
      "degate_robot_model": "M-20iA",
      "press_robot_model": "R-2000iC 165F",
      "press_model": "Van Dorn 2200",
      "press_hmi_model": "Pathfinder 5000"
    }
    // ... 28 workcells total
  ],
  "equipment_categories": {
    "robot_controllers": ["R-30iA", "R-30iB", "R-30iB Plus", "R-J3", "R-J3i", "R-J3iB", "R-J3iC"],
    "robot_models": ["M-16i", "M-16iB", "M-20iA", "M-20iD", "M-710iC", "R-2000iA", "R-2000iB", "R-2000iC"],
    "press_manufacturers": ["Cincinatti-Milacron", "Krauss-Maffei", "Van Dorn"],
    "hmi_models": ["Camac 486 C", "Krauss-Maffei", "MC5", "Milacron", "Pathfinder", "Pathfinder 5000", "VDU"]
  }
}
```

## Table Editor Requirements

### Workcells Table
| Column | Type | Editable | Dropdown Source |
|--------|------|----------|-----------------|
| workcell_id | integer | No (primary key) | - |
| degate_robot_controller_model | string | Yes | `equipment_categories.robot_controllers` |
| press_robot_controller_model | string | Yes | `equipment_categories.robot_controllers` |
| degate_robot_model | string | Yes | `equipment_categories.robot_models` |
| press_robot_model | string | Yes | `equipment_categories.robot_models` |
| press_model | string | Yes | Free text (varied formats) |
| press_hmi_model | string | Yes | `equipment_categories.hmi_models` |

### Special Values
- `"Unknown"` - Data not yet documented
- `"Uninstalled"` - Equipment position exists but hardware removed
- `"(Non-functional)"` suffix - Equipment present but not working
- `"(uninstalled)"` suffix - Equipment removed from position

### Validation Rules
1. `workcell_id` must be unique positive integer
2. Robot controllers should match FANUC naming: `R-30iA`, `R-30iB`, `R-J3iB`, etc.
3. Robot models should match FANUC naming: `M-16iB`, `M-20iA`, `R-2000iC`, etc.
4. Press models have varied formats by manufacturer (no strict validation)

### Equipment Categories Table (Secondary)
Allow editing of the `equipment_categories` arrays to add new equipment types as they're acquired.

## Consumers of This Data

1. **PDF_Extraction_Tools IMM Architecture Module**
   - `scripts/import_resrg_workcells.py` - Builds workcell entity graphs
   - `pdf_extractor/graph/workcell_architecture/` - Workcell graph module

2. **memOS Integration**
   - Workcell context for technical queries
   - Equipment-specific troubleshooting routing

## API Integration (Future)

When table edits are saved, the unified_dashboard should:
1. Update the JSON file at the source path
2. Optionally trigger a webhook to rebuild workcell graphs:
   ```
   POST http://localhost:8002/api/v1/workcell/rebuild
   ```

## Current Statistics

- **Total Workcells:** 28
- **IMM Brands:** Van Dorn (9), Cincinnati-Milacron (11), Krauss-Maffei (7), Unknown (1)
- **Robot Controllers:** R-30iA (12), R-30iB (15), R-30iB Plus (7), R-J3 variants (9)
- **HMI Systems:** Pathfinder 5000 (9), Camac 486 C (5), VDU (4), MC5 (1), KM native (6), Unknown (8)

## Contact

For questions about data structure or integration:
- PDF_Extraction_Tools module documentation: `/home/sparkone/sdd/PDF_Extraction_Tools/CLAUDE.md`
- Implementation plan: `/home/sparkone/.claude/plans/linear-crunching-rabin.md`
