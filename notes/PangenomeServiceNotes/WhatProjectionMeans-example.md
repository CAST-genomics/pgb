1. **Genomic projection (surjection to the spine)**
   In code, we first map an off-spine structure to **spine base-pair coordinates** by finding where its path **leaves** and **rejoins** the chosen assembly walk. That yields spine anchors **x** and **y** in **bp units along the spine**. No sequences or lengths are changed; we’re just assigning the off-spine thing a *home interval* on the spine axis.

2. **Visual projection (placement on screen)**
   Then the renderer maps spine bp → screen **x** and gives the off-spine feature some **y** offset (stacking lane). Here you *may* “distort” the drawn x-span to match the **spine span** `(y − x)` even if the off-spine DNA has a different length. That’s a conscious visualization choice, not a change to the biology.

### What must stay true

* **Node lengths are never altered.** Off-spine segment has a real length `altBpLength`.
* The spine interval it maps to has length `(y − x)`.
* We keep both and (optionally) report `deltaLen = altBpLength − (y − x)`.

### How to draw it honestly (recommended UI pattern)

* **Projection lane (default):** draw width = `(y − x)` (so everything aligns to the spine).
* **True-length lane (optional toggle):** draw width = `altBpLength` (a “rubber-ruler” view).
* Always show both numbers in tooltips/inspector: *“spine span 1,700 bp; alt length 2,200 bp; Δ = +500.”*

### Tiny example

Spine cumulative bp:
A:\[0–1000), B:\[1000–1800), C:\[1800–3000)
Side path leaves at **A:200** → **x = 200**, rejoins at **C:100** → **y = 1800+100 = 1900**.

* **Spine span** = 1,700 bp.
* **Alt path length** (sum of its nodes) might be 2,200 bp → **Δ = +500**.
* **On screen:**

  * Projection lane draws width for this event as 1,700 bp (aligned under A→C).
  * True-length lane draws 2,200 bp (longer), anchored at the same left spine anchor.

So: you’re right that we’re “moving” off-spine things in **x-y screen space** to sit under their spine anchors—and yes, we are free to compress/stretch their *drawn* width for alignment. But under the hood we **never change genomic lengths**; we compute a bp-accurate mapping to the spine first, and the renderer’s distortion is an explicit visualization mode, not a data mutation.
