# HPRC Local Ancestry Visualization Project

## Overview

The Human Pangenome Reference Consortium (HPRC) has requested our assistance in visualizing their local ancestry output for one of the companion papers accompanying their second release. This visualization will be featured in an upcoming publication.

## Timeline

The HPRC plans to submit their second release paper along with companion papers to journals **early next year**. Our deliverable should be ready to support that submission timeline.

## Data Source

The processed local ancestry data is available via the following API endpoint:

```
https://3.145.184.140:8443/json?chrom=chr1&start=25240000&end=25460000&graphtype=minigraph&version=v2&debug_small_graphs=false&minnodelen=5&nodeseglen=20&edgelen=5&nodelenpermb=1000
```

## Reference Materials

The HPRC has shared a slide deck illustrating the proposed visualization approach and the base PCLAI graph we aim to replicate in the browser:

**[HPRC Local Ancestry Visualization Slide](https://docs.google.com/presentation/d/18gTZZyhzu7ueq9BshX9m8rv2vlOBCGBnTpi4ghMM0Hc/edit?slide=id.g39d02a8c716_0_56#slide=id.g39d02a8c716_0_56)**

## Visualization Requirements

### Core Concept

Each hg38 node in the data includes an associated set of local ancestry PCLAI coordinates, stored under the field `pclai_coordinates`. Each coordinate pair comes with an RGB color code for display.

### UI Components

1. **Base PCLAI Graph Panel**: A reference PCLAI graph containing existing reference data points should be displayed somewhere on screen. The coordinates for this base graph will be provided separately.

2. **Local Ancestry Widget (New)**: A new interactive widget that responds to user hover events on graph nodes. When the user hovers over a node, the corresponding PCLAI coordinates should be enlarged or highlighted within the PCLAI space.

## Pending Items

| Item | Status |
|------|--------|
| Base PCLAI graph coordinates | Awaiting delivery |
| Reference slide from HPRC | ✅ Received |

## Development Approach

We will begin with a **standalone demo** implementation before merging any changes into the main browser codebase. This allows for isolated testing and iteration.

## Confidentiality Notice

**The HPRC has requested that all data remain private until publication.** The legacy API link is being used intentionally to maintain data security. Please do not share the endpoint or any derived visualizations publicly.


