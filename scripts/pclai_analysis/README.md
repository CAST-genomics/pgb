# PCLAI Coordinate Analysis Scripts

This folder contains the script for analyzing the relationship between PCLAI coordinates and assembly sections in the pangenome JSON data.

## Script

### `pclai_assembly_discrepancy_report.py`
Generates a concise table showing per-node discrepancies between assembly keys and PCLAI coordinate keys.

**Output:** `pclai_assembly_discrepancy_report.md` (in project root)

**Table Columns:**
- Node ID
- Total Assembly Keys
- Total PCLAI Keys
- Total Keys (Union)
- Keys in Both (Intersection)
- Assembly keys NOT in PCLAI
- PCLAI keys NOT in Assembly

**Usage:**
```bash
python3 pclai_assembly_discrepancy_report.py
```

## Data File

**Input:** `/Users/turner/PanGenomeProject/pgb/public/hprc-project/hello-hprc.json`

**Output:** Reports are written to the project root directory

## Key Format

- **Assembly keys:** Created from `assembly_name#haplotype` (e.g., `HG00097#1`)
- **PCLAI keys:** Explicit in the dataset as keys in the `pclai_coordinates` object

## Notes

- Only valid PCLAI coordinate entries are considered (non-empty arrays with proper structure)
- Node 5530+ has 200 invalid PCLAI entries (all empty arrays)
- Most nodes have 200 valid PCLAI keys (standardized sample set)
- Assembly keys vary per node based on where the node appears
- PCLAI keys are NOT always a subset of assembly keys - some PCLAI keys exist for assemblies where the node doesn't appear
