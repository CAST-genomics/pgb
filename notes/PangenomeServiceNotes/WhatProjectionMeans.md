# What “projection” actually means

* pick an **anchor path** (the spine = one assembly walk).
* build a **cumulative bp axis** on that path using true node lengths (respecting step orientation).
* for any off-spine structure, find where its walk **leaves** the spine (x) and **rejoins** it (y) and attach it to the interval `[x, y]` on that spine axis. keep its **own length** separately.

# event object: minimal fields that make the UI honest

* `type`: "bubble" | "detour" | "tail" | "crossover" | "insertion" | "deletion" | "complex"
* `anchors`:

  * `left: { nodeId, nodeLen, stepOrientation, nodeOffset }`
  * `right: { nodeId, nodeLen, stepOrientation, nodeOffset }`  *(omit/right=null for tails)*
* `spineStartBp = x`, `spineEndBp = y`, `spineSpanBp = max(0, y - x)`
* `altBpLength` (sum of alt nodes along the branch)
* `deltaBp = altBpLength - spineSpanBp`
* `branchNodes`: `[ {nodeId, orientation, len}, ... ]`  *(or a path/key if you have one)*
* `ambiguity`: `{ multiMapped: boolean, candidates: [ {x,y,score}, ... ] }`
* `notes/flags`: `{ backJoin: (y < x), cyclic: bool, repeats: bool }`

# invariants to unit-test (cheap & lifesaving)

1. **Spine monotonicity**
   For the chosen assembly: cumulative bp strictly increases by each step’s true length.
2. **Identity on the spine**
   Projecting a locus that’s already on the spine returns itself (`y==x` for points; spans line up).
3. **Length bookkeeping**

   * `deltaBp == 0` ⇒ equal-length substitution
   * `y==x && altBpLength>0` ⇒ insertion at x
   * `y>x && altBpLength==0` ⇒ deletion of `[x,y]`
4. **Orientation correctness**
   Mapping `(nodeId, offset)` to spine bp uses `offset` for forward, `(L - offset)` for reverse—never change **L**.
5. **Ambiguity discipline**
   If a branch can anchor to multiple `(x,y)`, you either:

   * emit all candidates with scores, or
   * choose one and mark `ambiguity.multiMapped=true` (never silently collapse).

# edge cases worth labeling (so users don’t get confused)

* **Back-join (`y < x`)**: local inversion/crossover; render as “return left” ribbon and set a flag.
* **Zero-span but long alt**: classic insertion; consider a special glyph.
* **Shared-node detours**: a side walk that reuses spine nodes—deduplicate by *path step*, not nodeId.
* **Cycles in the side branch**: keep `altBpLength` (it’s still a sum), but mark `cyclic=true`.
* **Repeats**: many candidate anchors; show an “ambiguity heat” tint and expose all options in the inspector.

# UI pattern (keeps trust high)

* **Projection lane (default):** draw width = `spineSpanBp`.
* **True-length lane (toggle):** draw width = `altBpLength`.
* Tooltip/inspector always shows: `spine span`, `alt length`, `Δ`, plus anchor details.

If you want, I can turn this into a tiny “event schema + invariants” test file for your repo so every dataset you load gets these checks for free.
