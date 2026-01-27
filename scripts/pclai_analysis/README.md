# PCLAI Coordinate Analysis Scripts

This folder contains scripts for analyzing the relationship between PCLAI coordinates and assembly sections in the pangenome JSON data.

## Scripts

### `generate_simple_discrepancy_table.py`
**Current/main script** - Generates a concise table showing per-node discrepancies between assembly keys and PCLAI coordinate keys.

**Output:** `pclai_assembly_discrepancy_report.md` (in project root)

**Columns:**
- Total Assembly Keys
- Total PCLAI Keys
- Total Keys (Union)
- Keys in Both (Intersection)
- Assembly keys NOT in PCLAI
- PCLAI keys NOT in Assembly

**Usage:**
```bash
python3 generate_simple_discrepancy_table.py
```

### `validate_pclai_coordinates.py`
Validates that all PCLAI coordinate entries have valid coordinates and RGB values.

**Checks:**
- Coordinates array has exactly 2 numeric values
- RGB array has exactly 3 numeric values
- RGB values are in range [0-255]

**Usage:**
```bash
python3 validate_pclai_coordinates.py
```

### `analyze_pclai_subset_valid_only.py`
Analyzes whether valid PCLAI coordinate keys are a subset of assembly/haplotype combinations.

**Usage:**
```bash
python3 analyze_pclai_subset_valid_only.py
```

### `analyze_pclai_subset.py`
Initial analysis script (includes invalid entries) - checks if PCLAI keys are a subset of assembly combinations.

**Usage:**
```bash
python3 analyze_pclai_subset.py
```

### `examine_node_example.py`
Examines a specific node (5508+) in detail to understand the relationship between PCLAI and assembly sections.

**Usage:**
```bash
python3 examine_node_example.py
```

### `generate_discrepancy_report.py`
Generates a detailed report with exhaustive lists (original version - very long).

**Usage:**
```bash
python3 generate_discrepancy_report.py
```

### `generate_discrepancy_report_concise.py`
Generates a concise report with counts and patterns instead of exhaustive lists.

**Usage:**
```bash
python3 generate_discrepancy_report_concise.py
```

## Data File

All scripts reference:
- **Input:** `/Users/turner/PanGenomeProject/pgb/public/hprc-project/hello-hprc.json`
- **Output:** Reports are written to the project root directory

## Key Format

- **Assembly keys:** Created from `assembly_name#haplotype` (e.g., `HG00097#1`)
- **PCLAI keys:** Explicit in the dataset as keys in the `pclai_coordinates` object

## Notes

- Only valid PCLAI coordinate entries are considered (non-empty arrays with proper structure)
- Node 5530+ has 200 invalid PCLAI entries (all empty arrays)
- Most nodes have 200 valid PCLAI keys (standardized sample set)
- Assembly keys vary per node based on where the node appears
