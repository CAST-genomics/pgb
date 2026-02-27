# PCLAI Coordinate vs Assembly Section Discrepancy Table

**Data File:** /Users/turner/PanGenomeProject/pgb/public/hprc-project/hello-hprc.json
**Total Nodes:** 30

| Node | Total Assembly Keys | Total PCLAI Keys | Total Keys (Union) | Keys in Both (Intersection) | Assembly keys NOT in PCLAI | PCLAI keys NOT in Assembly |
|------|---------------------|------------------|--------------------|----------------------------|----------------------------|----------------------------|
| 5504+ | 464 | 200 | 464 | 200 | 264 |  |
| 5505+ | 464 | 200 | 464 | 200 | 264 |  |
| 5506+ | 463 | 200 | 463 | 200 | 263 |  |
| 5507+ | 464 | 200 | 464 | 200 | 264 |  |
| 5508+ | 378 | 200 | 422 | 156 | 222 | 44 |
| 5509+ | 378 | 200 | 422 | 156 | 222 | 44 |
| 5510+ | 377 | 200 | 421 | 156 | 221 | 44 |
| 5511+ | 378 | 200 | 422 | 156 | 222 | 44 |
| 5512+ | 373 | 200 | 420 | 153 | 220 | 47 |
| 5513+ | 378 | 200 | 422 | 156 | 222 | 44 |
| 5514+ | 378 | 200 | 422 | 156 | 222 | 44 |
| 5515+ | 378 | 200 | 422 | 156 | 222 | 44 |
| 5516+ | 378 | 200 | 422 | 156 | 222 | 44 |
| 5517+ | 367 | 200 | 414 | 153 | 214 | 47 |
| 5518+ | 369 | 200 | 416 | 153 | 216 | 47 |
| 5519+ | 367 | 200 | 416 | 151 | 216 | 49 |
| 5520+ | 369 | 200 | 416 | 153 | 216 | 47 |
| 5521+ | 369 | 200 | 416 | 153 | 216 | 47 |
| 5522+ | 455 | 200 | 458 | 197 | 258 | 3 |
| 5523+ | 464 | 200 | 464 | 200 | 264 |  |
| 5524+ | 455 | 200 | 458 | 197 | 258 | 3 |
| 5525+ | 464 | 200 | 464 | 200 | 264 |  |
| 5526+ | 462 | 200 | 462 | 200 | 262 |  |
| 5527+ | 464 | 200 | 464 | 200 | 264 |  |
| 5528+ | 463 | 200 | 463 | 200 | 263 |  |
| 5529+ | 464 | 200 | 464 | 200 | 264 |  |
| 5530+ | 268 | 0 | 268 | 0 | 268 |  |
| 5531+ | 464 | 200 | 464 | 200 | 264 |  |
| 5532+ | 464 | 200 | 464 | 200 | 264 |  |
| 5533+ | 464 | 200 | 464 | 200 | 264 |  |

## Summary

- **Total nodes:** 30
- **Total assembly keys (across all nodes):** 12443
- **Total PCLAI keys (across all nodes):** 5800
- **Total unique keys (union across all nodes):** 13085
- **Total keys in both (intersection across all nodes):** 5158
- **Nodes with assembly keys NOT in PCLAI:** 30
- **Nodes with PCLAI keys NOT in assembly:** 16
- **Total assembly keys NOT in PCLAI:** 7285
- **Total PCLAI keys NOT in assembly:** 642

---

## Discussion: Node 5508+ as an Illustrative Example

### Interpreting Node 5508+

Node 5508+ provides an excellent example of the relationship between assembly keys and PCLAI coordinate keys. Let's break down what the numbers tell us:

**Total Assembly Keys: 378**
- This node appears in 378 different assembly/haplotype combinations. These represent all the assemblies where this specific node sequence is found in that assembly's path through the pangenome graph.

**Total PCLAI Keys: 200**
- There are 200 valid PCLAI coordinate entries for this node. This represents a standardized set of samples (likely all samples in the dataset) for which PCA coordinates have been computed.

**Total Keys (Union): 422**
- When we combine both sets, we get 422 unique assembly/haplotype combinations. This tells us that the two sets are not identical—there's both overlap and unique entries in each.

**Keys in Both (Intersection): 156**
- 156 combinations appear in both sets. This means:
  - The node appears in 156 assemblies that are part of the standardized PCLAI set
  - Those 156 assemblies have both assembly path information AND PCLAI coordinate data
  - This represents 78% of the PCLAI keys (156/200) and 41% of the assembly keys (156/378)

**Assembly keys NOT in PCLAI: 222**
- 222 assembly combinations where the node appears but no PCLAI coordinate exists. These likely include:
  - Reference assemblies (GRCh38#0, CHM13#0) that may not be part of the standardized PCLAI sample set
  - Other assemblies not included in the ~200 sample standardized set
  - This represents 59% of the assembly keys (222/378)

**PCLAI keys NOT in Assembly: 44**
- 44 PCLAI coordinate entries for assemblies where the node does NOT appear. This is the key finding that challenges the original assumption. These represent:
  - Samples in the standardized PCLAI set where this node sequence is absent
  - This represents 22% of the PCLAI keys (44/200)

### The Incorrect Assumption

**Original Assumption (Incorrect):**
- PCLAI keys would always be a subset of assembly keys
- Assembly keys represent the "single source of truth" for where a node appears
- PCLAI coordinate keys would be derived from or filtered by the assembly set
- Any PCLAI coordinate entry would correspond to an assembly where the node appears

**What We Discovered (Correct):**
- PCLAI keys are NOT always a subset of assembly keys
- PCLAI coordinates represent a standardized set of ~200 samples, regardless of whether the node appears in those assemblies
- Assembly sections list only those assemblies where the node actually appears
- 16 out of 30 nodes (53%) have PCLAI keys that don't exist in their assembly sections
- Node 5508+ has 44 PCLAI keys (22% of its PCLAI set) that don't exist in its assembly section

### The Actual Relationship

The relationship between these two sets is more nuanced than initially assumed:

1. **PCLAI Coordinates** = A standardized, fixed set of ~200 samples for which PCA coordinates have been computed. This set appears to be consistent across nodes (with some variation for invalid entries).

2. **Assembly Sections** = A dynamic set that varies per node, listing only those assembly/haplotype combinations where the node actually appears in that assembly's path through the pangenome graph.

3. **The Overlap** = The intersection represents assemblies where:
   - The node appears in that assembly's path (assembly section)
   - AND that assembly is part of the standardized PCLAI set (PCLAI coordinates exist)

### Implications for Visualization and Rendering

This discovery has important implications for how nodes should be visualized and rendered:

- **When using PCLAI coordinates:** You cannot assume that a PCLAI coordinate entry means the node appears in that assembly. Always verify against the assembly section.

- **When filtering by assembly:** If you want to show only assemblies where a node appears, use the assembly section as the filter, not the PCLAI keys.

- **When displaying PCLAI coordinates:** The PCLAI coordinates may represent population-level PCA positions even when the node doesn't appear in that specific assembly's path.

- **Data consistency:** The presence of PCLAI keys without corresponding assembly entries suggests that PCLAI coordinates may be computed at a different granularity (e.g., region-level or sample-level) rather than strictly node-level.

Node 5508+ exemplifies this pattern: it appears in 378 assemblies but has PCLAI coordinates for 200 standardized samples, with only 156 overlapping. The 44 PCLAI keys without assembly entries demonstrate that PCLAI coordinates can exist independently of whether the node appears in that assembly's path.