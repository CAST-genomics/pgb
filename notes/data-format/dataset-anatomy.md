# Dataset Anatomy — the PGB dataset format, illustrated

This is a working reference for *what a PGB dataset is*. When we discuss "the dataset" in conversation, this is the thing we are referring to.

A dataset is one JSON file describing a **pangenome graph** for a single locus.
Concretely it answers: *for this stretch of the genome, what are the alternative
paths through it, which assemblies take which path, and where does each piece sit
in 3D layout space?* Everything else — population counts, PCLAI coordinates,
sequence — hangs off that backbone.

The file looks enormous (`il7.json` is 3.9 MB) but it is almost entirely
**repetition**. There are only ~5 distinct shapes; they just recur thousands of
times. This document collapses each repeated shape down to one representative,
keeps real values from `public/datasets/api-v3/il7.json`, and annotates the
parts that actually vary. So it is simultaneously the **spec** and the **worked
example**.

The example file throughout is **`il7.json`** — the IL7 gene locus on chr8,
12 graph nodes, 466 assemblies. Numbers in `«…»` and `×N` comments are its real
counts.

---

## Notation legend

The skeleton below is JSON with a few collapse-markers. It is *not* valid JSON —
it is JSON-with-comments, deliberately.

| Marker | Meaning |
|---|---|
| `"{id}"` | A **dynamic key** — the object is used as a map/dictionary, not a fixed record. The key itself carries data (a node id, an assembly id). |
| `… ×466` | The array/map has 466 entries; only one representative is shown. |
| `«map»` | An object whose keys are data, not field names (see `"{id}"`). |
| `{ … }` | A nested block shown elsewhere or collapsed for brevity. |
| `// comment` | Annotation. The conversational half of this document. |

---

## The illustrated skeleton

```jsonc
{
  // ── Locus header ───────────────────────────────────────────────
  // Two coordinate strings, shape: ASM#HAP#chrom:start-end
  "queried_locus": "GRCh38#0#chr8:78675042-78805463",  // what the caller asked for
  "actual_locus":  "GRCh38#0#chr8:78657129-78876423",  // what the graph actually
                                                       // spans — usually WIDER,
                                                       // because the graph is
                                                       // extended to clean
                                                       // boundary nodes.
  // (api-v3 splits these two. Older PGB files had a single `locus`.)

  // ── node ───────────────────────────────────────────────────────
  // The graph's vertices. A «map» keyed by oriented node id.
  "node": {                                  // «map» — 12 nodes in il7
    "{id}": {                                // key e.g. "141452+"
                                             //   digits = node id
                                             //   trailing +/- = orientation
                                             //   (il7 is all "+"; "-" is legal)
      "name": "141452+",                     // == the map key, repeated
      "length": 12328,                       // node length in base pairs

      // -- assembly: who walks through this node ------------------
      // One entry per assembly-haplotype that traverses this node.
      // THIS is the array that varies wildly: 2 .. 466 entries.
      // A node every assembly shares → 466; a rare allele → 2.
      "assembly": [                          // … ×466 (range 2..466)
        {
          "assembly_name": "HG00408",        // sample id
          "haplotype": "1",                  // "1" | "2" (string)

          // metadata: where this assembly's path enters/exits the
          // node, plus PCLAI. An array — length 1 everywhere in il7,
          // but the array shape allows >1 (an assembly visiting the
          // node more than once).
          "metadata": [                      // … ×1
            {
              "sequence_id": "CM085957.1",   // contig/accession in that assembly
              "path_strand": "+",            // strand of the assembly's path
              "node_strand": ">",            // node orientation as walked ( > | < )
              "start": 78567196,             // node span in assembly coords
              "end":   78579527,

              // PCLAI in GRCh38 coordinates.
              // EITHER a 4-key block (shown) OR {} when this metadata
              // has no GRCh38 mapping (80 of 3420 in il7 — Issue #77).
              "pclai_hg38": {
                "pclai_coord_system": "GRCh38",
                "coordinates": [0.724, 0.0],   // ×2 → [x, y] in PCLAI space
                "RGB": [255, 0, 0],            // ×3 → display color 0..255
                "confidence_score": "998"      // STRING. numeric-ish, OR the
                                               // literal "impainted" (imputed).
              },
              // PCLAI in assembly's own coordinates. Same 4-key shape,
              // or {} (46 of 3420 in il7).
              "pclai_asm": {
                "pclai_coord_system": "assembly",
                "coordinates": [0.724, 0.0],
                "RGB": [255, 0, 0],
                "confidence_score": "998"
              },

              "take": "yes"                  // inclusion flag. "yes" everywhere
                                             // in il7; presumably "no" exists.
            }
          ]
        }
        // … 465 more assembly entries …
      ],

      // duplicated_assembly: same shape as `assembly` above.
      // Empty in every il7 node — assemblies that traverse the node
      // more than once would land here.
      "duplicated_assembly": [],

      // -- assembly_metadata: aggregate population stats ----------
      // Two parallel trees with identical key structure:
      //   count     → integers (how many)
      //   frequency → 0..1     (what fraction; int 0/1 or float)
      // Each tree is bucketed three ways.
      "assembly_metadata": {
        "count": {
          "sex":             { "female": 232, "male": 232 },          // ×2
          "superpopulation": { "AFR": 140, "EAS": 100, "…": 0 },      // ×6
          "population":      { "ACB": 24,  "CHS": 22,  "…": 0 }       // ×28
        },
        "frequency": {
          "sex":             { "female": 1, "male": 1 },              // ×2
          "superpopulation": { "AFR": 1, "EAS": 1, "…": 0 },          // ×6
          "population":      { "ACB": 1, "CHS": 1, "…": 0 }           // ×28
        }
      },

      "default_range": "GRCh38#0#chr8:78657129-78669457",
                                             // shape: ASM#HAP#SEQ:start-end
                                             // a representative genomic range
                                             // for the node.

      // ogdf_coordinates: the node's 2D layout polyline from OGDF.
      // Most nodes have 2 points (a segment); longer/branching nodes
      // have more (il7: 2, 6, or 7).
      "ogdf_coordinates": [ { "x": 334, "y": 963 } ]   // … ×2 (range 2..7)
    }
    // … 11 more nodes …
  },

  // ── edge ───────────────────────────────────────────────────────
  // The graph's connectivity. A flat array of directed node→node links.
  "edge": [                                  // … ×16
    { "starting_node": "141452+", "ending_node": "141453+" }
  ],

  // ── sequence ───────────────────────────────────────────────────
  // «map» node id → the node's DNA string. Keyset is identical to
  // `node`'s keyset. Split out so the graph can be loaded without
  // hauling megabytes of bases.
  "sequence": {                              // «map» — 12 entries
    "{id}": "AAAACCATGAAGAAGTGCCAAGAT…"      // ACGT string, length == node.length
  },

  // ── assembly ───────────────────────────────────────────────────
  // «map» of every assembly-haplotype in the dataset → where it sits.
  // Key is a 2-PART id: ASM#HAP  (note: per-node `assembly` entries
  // keep assembly_name + haplotype as separate fields, and
  // `default_range` uses a 3-PART id with the sequence_id — see
  // project_assembly_key_shapes memory.)
  "assembly": {                              // «map» — 466 entries
    "{ASM#HAP}": {                           // key e.g. "HG00408#1"
      "sequence_id": "CM085957.1",
      "region": "78567196-78786401"          // start-end in that assembly
    }
  }
}
```

---

## Field reference (the rigorous half)

Path notation: `[]` = array element, `{}` = dynamic map key.

| Path | Type | Cardinality | Notes |
|---|---|---|---|
| `queried_locus` | string | 1 | `ASM#HAP#chrom:start-end` |
| `actual_locus` | string | 1 | Same shape; ≥ queried span |
| `node` | map | 1 | Keyed by oriented node id |
| `node.{}` | string key | N nodes (il7: 12) | `<digits><+/->` |
| `node.{}.name` | string | 1 | Equals the key |
| `node.{}.length` | int | 1 | Base pairs |
| `node.{}.assembly` | array | 1 | **0..466 elements** — the high-variance field |
| `…assembly[].assembly_name` | string | 1 | Sample id, e.g. `HG00408` |
| `…assembly[].haplotype` | string | 1 | `"1"` or `"2"` |
| `…assembly[].metadata` | array | 1 | il7: always length 1; shape allows >1 |
| `…metadata[].sequence_id` | string | 1 | Contig/accession |
| `…metadata[].path_strand` | string | 1 | `+` / `-` |
| `…metadata[].node_strand` | string | 1 | `>` / `<` |
| `…metadata[].start` / `.end` | int | 1 | Node span in assembly coords |
| `…metadata[].pclai_hg38` | object | 1 | 4-key block **or `{}`** |
| `…metadata[].pclai_asm` | object | 1 | 4-key block **or `{}`** |
| `…pclai_*.pclai_coord_system` | string | 1 | `"GRCh38"` / `"assembly"` |
| `…pclai_*.coordinates` | number[] | 2 | `[x, y]`; may be negative |
| `…pclai_*.RGB` | int[] | 3 | 0..255 |
| `…pclai_*.confidence_score` | **string** | 1 | Numeric-ish, or `"impainted"` |
| `…metadata[].take` | string | 1 | `"yes"` (only value seen) |
| `node.{}.duplicated_assembly` | array | 1 | Same shape as `assembly`; empty in il7 |
| `node.{}.assembly_metadata` | object | 1 | `count` + `frequency` subtrees |
| `…assembly_metadata.count.*` | int | sex 2 / superpop 6 / pop 28 | Counts |
| `…assembly_metadata.frequency.*` | number | sex 2 / superpop 6 / pop 28 | 0..1 |
| `node.{}.default_range` | string | 1 | `ASM#HAP#SEQ:start-end` |
| `node.{}.ogdf_coordinates` | object[] | 2..7 | `{x:int, y:int}` polyline |
| `edge` | array | 1 | N edges (il7: 16) |
| `edge[].starting_node` / `.ending_node` | string | 1 | Node ids |
| `sequence` | map | 1 | Keyset == `node` keyset |
| `sequence.{}` | string | N nodes | ACGT, length == `node.length` |
| `assembly` | map | 1 | Keyed by `ASM#HAP` (2-part) |
| `assembly.{}.sequence_id` | string | 1 | Contig/accession |
| `assembly.{}.region` | string | 1 | `start-end` |

---

## Callouts — things the skeleton hides

These are the spots where assumptions break. Worth keeping in mind whenever we
write code against a dataset.

1. **`pclai_hg38` / `pclai_asm` are sometimes `{}`.** In il7, 80 of 3420
   metadata blocks have an empty `pclai_hg38`, and 46 have an empty `pclai_asm`.
   An empty block means *no PCLAI mapping in that coordinate system* — typically
   a node that exists only in non-reference assemblies. Code must check for the
   4 keys before reading `coordinates`/`RGB`. This is the heart of Issue #77
   (see `project_pclai_absence_system_mismatch` memory).

2. **`confidence_score` is a string, not a number.** Values look numeric
   (`"998"`, `"429"`) but ship as strings — and one of them isn't numeric at
   all: `"impainted"` marks an imputed value. Never `parseFloat` it blindly.

3. **`frequency` values are `1`/`0` (ints) or floats.** A node present in every
   member of a bucket serializes as integer `1`, not `1.0`. Treat the whole
   subtree as `number` in `[0, 1]`.

4. **`metadata` and `duplicated_assembly` are arrays for a reason.** Both are
   length-1 and length-0 respectively in il7, so it's tempting to treat
   `metadata` as a single object. Don't — the array shape exists for assemblies
   that visit a node more than once.

5. **Three different assembly-key shapes coexist.** Top-level `assembly` map →
   2-part `ASM#HAP`. Per-node `assembly[]` → `assembly_name` + `haplotype` as
   separate fields. `default_range` / `*_locus` → 3-part `ASM#HAP#SEQ`. See the
   `project_assembly_key_shapes` memory for the bridge.

6. **`node` length varies; `assembly[]` length varies far more.** The per-node
   `assembly` array is the single biggest driver of file size and the only field
   with a wide cardinality range (2..466). A "core" node is taken by everyone; a
   rare-variant node by a handful.
