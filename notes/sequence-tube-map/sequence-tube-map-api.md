# Sequence Tube Map — Integration Notes

How the browser requests a tube-map view, and what comes back. Two parts: the API call and
its parameters, then the structure of the SVG the call returns.

**Source:** Cici Bu (xbu@ucsd.edu), Slack DM, 7 August 2026 (11:07 and 11:11 EDT).
**Status:** Kickoff reference. The feature is not yet implemented — nothing here has been
verified against a live call from our code.

Related: [`../hprc-project/hprc-project-overview.md`](../hprc-project/hprc-project-overview.md).
This visualization operates on the same minigraph/PCLAI data — the track attributes below
carry PCLAI coordinates, and the example region falls inside the HPRC `chr1` window.

---

## 1. Request

### Endpoint

```
https://pangenome-api.ucsd.edu:8000/seqtubemap
  ?chrom=chr1
  &start=25331046
  &end=25331646
  &version=v2
  &pathnumoption=normal
  &nodewidthoption=compressed
  &minigraphnode=5519
```

### Parameters

| Name | Value | Meaning |
|---|---|---|
| `chrom` | `chr5`, `chrX` | Chromosome. |
| `start` | `25331046` | Start coordinate. |
| `end` | `25331646` | End coordinate. |
| `version` | `v1` \| `v2` | Pangenome release version. |
| `pathnumoption` | `normal` \| `compressed` | Number of paths drawn. `normal` shows each path separately; `compressed` collapses identical paths into one. **Fixed at `normal`.** |
| `nodewidthoption` | `normal` \| `compressed` | Width of sequence nodes. `normal` scales linearly with base pairs; `compressed` scales with log₂ of base pairs. **Fixed at `compressed`.** |
| `minigraphnode` | `5519` | Minigraph node ID for the requested region. |

### Notes

- **Where the values come from.** `minigraphnode` is the ID of the minigraph node the user
  clicked. `chrom`, `start` and `end` are that node's GRCh38 coordinates.
- **Nodes outside GRCh38 have no view.** A node absent from GRCh38 gets no sequence tube map
  visualization — don't offer the interaction for it.
- **The two option parameters are display settings.** They stay at `pathnumoption=normal` and
  `nodewidthoption=compressed` for now, but send them explicitly rather than relying on server
  defaults.

---

## 2. Response

The call returns an SVG file of the tube-map visualization. Its general structure:

```svg
<g class="track">
  <rect x="0" y="5540" width="68" height="15"
        style="fill: rgb(0, 229, 188); fill-opacity: 1;"
        trackID="368"
        trackName="NA21309#2#CM092097.1"
        class="track368"
        color="rgb(0, 229, 188)"
        pclaiX="-1.585"
        pclaiY="0.12"
        pclaiScore="0.91">
    <title></title>
  </rect>
  <path d="M 67 20 C 887.7 20 887.7 65 1239.4 65 V 80 C 885.6 80 885.6 35 67 35 Z"
        style="fill: rgb(222, 162, 255); fill-opacity: 1;"
        trackID="0"
        trackName="CHM13#0#chr1"
        class="track0"
        color="rgb(222, 162, 255)"
        pclaiX="0.438"
        pclaiY="-1.395"
        pclaiScore="0.87">
    <title></title>
  </path>
</g>

<g class="node">
  <path id="79337767"
        d="M 11 20 Q 11 11 20 11 L 67 11 Q 76 11 76 20 L 76 5555 Q 76 5564 67 5564 L 20 5564 Q 11 5564 11 5555 L 11 20"
        sequence="ACGTACGTACGT..."
        style="fill: rgb(255, 255, 255); fill-opacity: 0.4; stroke: rgb(0, 0, 0); stroke-width: 2px;">
    <title></title>
  </path>
</g>
```

### Two groups

- **`<g class="track">`** — the colorful lines running from node to node. Drawn as `<rect>`
  for straight runs and `<path>` for the curved connectors.
- **`<g class="node">`** — the semi-transparent boxes spanning multiple tracks. Each
  represents one node.

### Metadata

Metadata for each node and track is stored as custom attributes on the `<path>` or `<rect>`
element — read it off the element the user hits, no side-channel lookup needed.

| Attribute | On | Carries |
|---|---|---|
| `trackID` | track | Numeric track identifier, mirrored in the `track<n>` class. |
| `trackName` | track | Sample path name, e.g. `NA21309#2#CM092097.1`. |
| `color` | track | The track's assigned color, matching its `fill`. |
| `pclaiX`, `pclaiY` | track | PCLAI coordinates for the track. |
| `pclaiScore` | track | PCLAI score for the track. |
| `id` | node | Node identifier, e.g. `79337767`. |
| `sequence` | node | The node's base sequence. |

- **The `<title>` elements arrive empty.** Tooltip text is ours to fill in from the attributes
  above.

---

## Provenance and confidence

Compiled from two Slack messages sent by Cici Bu on 7 August 2026, 11:07 and 11:11 EDT.

- **Stated by the source:** the endpoint, the parameter list and their meanings, the fixed
  values for `pathnumoption` and `nodewidthoption`, the GRCh38 constraint, and the two-group
  SVG structure.
- **Inferred from the example SVG, not confirmed:** the attribute descriptions in the metadata
  table. Confirm these against a real response before depending on them — in particular
  whether `pclaiX`/`pclaiY`/`pclaiScore` are present on every track.

A sample response for `chr1:25331046-25331646` exists as `stm-chr1-25331046-25331646.svg`
(3.5 MB), currently outside the repo in `~/PanGenomeProject/sequence-tube-map-notes/`. Not yet
checked in — decide whether the size is worth it before moving it here.
