# PanGenome API Update — CiCi Slack, March 17 2026

## Status

The API URL for the PCA demo has been updated. The endpoint is not yet live on the main browser — a check with HPRC is still pending before that push.

**Updated endpoint:**
```
https://3.145.184.140:8443/json?chrom=chr1&start=25240000&end=25460000&graphtype=minig[…]alse&minnodelen=5&nodeseglen=20&edgelen=5&nodelenpermb=1000
```

---

## Schema Changes

### 1. Assembly + PCLAI Merged; Duplicated Assemblies Split Out

`pclai_information` and `assembly` have been merged and reorganized into two separate lists per node:

- **`non_duplicated_assembly`** — assemblies that map to exactly one region; always have a single item in `metadata`.
- **`duplicated_assembly`** — assemblies that map to the same region more than once (see §2 below); have multiple items in `metadata`.

Each assembly entry now looks like this:

```json
{
  "assembly_name": "HG00597",
  "haplotype": "1",
  "metadata": [
    {
      "sequence_id": "CM085766.1",
      "path_strand": "+",
      "node_strand": ">",
      "start": 25491473,
      "end": 25527367,
      "pclai": [
        {
          "coordinates": [0.695, 0.907],
          "RGB": [255, 114, 53],
          "start": 25491473,
          "end": 25527367,
          "percentage": 1
        }
      ],
      "take": "yes"
    }
  ]
}
```

---

### 2. New `duplicated_assembly_list` Entry per Node

Some assemblies map to the same node twice, across more than one region. A new top-level entry, **`duplicated_assembly_list`**, captures these cases.

**Visualization rule:** Only render coordinates where `"take": "yes"`. This field marks the coordinate determined to be the accurate (true) mapping. If the coordinate is drawn from the duplicated list, flag it visually to signal noisy mapping in that region.

**Background context:** Duplicated assembly coordinates appear to cluster in specific chromosomal regions, likely due to repetitiveness. Outside those regions, `duplicated_assembly_list` is expected to be empty.

All data is retained in the JSON to allow for future adjustment.

---

### 3. PCLAI Now Window-Based

`pclai` is now a list of windows rather than a single entry. A node may be split into multiple PCLAI windows (typically fewer than 3). Each window includes:

| Field | Description |
|---|---|
| `coordinates` | PCA coordinates for this window |
| `RGB` | RGB color value |
| `start` / `end` | Locus range of this window (always within the parent node's range) |
| `percentage` | Fraction of the node covered by this window |

**Example:**

```json
"pclai": [
  {
    "coordinates": [0.695, 0.907],
    "RGB": [255, 115, 49],
    "start": 77130490,
    "end": 77171140,
    "percentage": 0.916035694970254
  },
  {
    "coordinates": [0.695, 0.907],
    "RGB": [255, 115, 48],
    "start": 77171177,
    "end": 77174866,
    "percentage": 0.0831305210023436
  }
]
```

---

### 4. New Top-Level `assembly` Entry

A new `assembly` entry sits at the top level of the response, parallel to `node` and `edge`. It records the queried region for every assembly in the response:

```json
"assembly": {
  "HG00408:1": {
    "sequence_id": "JBHDVK010000066.1",
    "region": "54442245-54914751"
  },
  "HG00597:1": {
    "sequence_id": "JBHDUU010000005.1",
    "region": "55001276-55473699"
  }
}
```
