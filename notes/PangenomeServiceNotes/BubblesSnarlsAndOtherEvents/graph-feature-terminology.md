# Terminology cheatsheet (quick)

* **Spine:** the GRCh38 walk you highlighted.
* **Detour / loop / bubble:** any alternative path that leaves the spine at a **left anchor** *L* and rejoins at a **right anchor** *R*. In the code that becomes one **loop event** with:

  * `leftId=L`, `rightId=R`
  * `spanStart = bpEnd(L)`, `spanEnd = bpStart(R)` (reference span replaced)
  * `refLenBp = spanEnd − spanStart`
  * `altLenBp` = bp along the detour path
  * (layout only) `apex`, `lane`, `bezier`
* **Pill:** a detour with `spanStart≈spanEnd` (anchored insertion at one place).
* **Chord:** an extra edge *inside* a bubble that creates triangles/diamonds.
* **Superbubble / block:** a **biconnected component** that touches the spine at two or more places; contains multiple detours between the same anchors or nested/overlapping detours.

---

# What A, B, C, D are

## A — simple bubble (single detour between consecutive anchors)

* **Look:** small branch leaving the spine and rejoining a little downstream.
* **Type:** one **loop event** with anchors *(L,R)* that are likely adjacent on the spine.
* **Length class:** data-driven via `altLenBp` vs `refLenBp` (insertion-like above, deletion-like below; neutral if \~equal).
* **Linearized draw:** a single arc spanning `[spanStart, spanEnd]`.

## B — micro-bubble cluster (run of simple bubbles)

* **Look:** two or more tiny side branches in a short stretch.
* **Type:** a **cluster of independent loop events**, each with its own *(L,R)*. In interval terms they’re **overlapping siblings** (their `[spanStart, spanEnd]` intervals overlap but don’t contain each other).
* **Linearized draw:** multiple short arcs in adjacent lanes over the same region (“ladder” effect).

## C — **superbubble** with nesting (loops on top of loops)

* **Look:** a large rounded block with several ways through it; branches sit on top of other branches.
* **Type (structurally):** a **biconnected block touching the spine twice** (at *L* and *R*). Inside it there are:

  * **parallel detours** (several distinct paths from *L* to *R* → multiple loop events sharing the same anchors),
  * plus **nested detours** where one detour’s interval is fully **contained** in another’s.
* **Terminology in our pipeline:**

  * Parent **superbubble event**: the block spanning *(L,R)*.
  * Child **loop events**: each distinct detour inside the block.
    Intervals form a **hierarchy**: parent (the widest loop) contains child loops (narrower intervals).
* **Linearized draw:**

  * Outer loop for the parent *(L,R)* span (largest arc).
  * Inner loops for contained detours stacked in additional lanes (no overlap by interval packing).
  * If chords exist inside (triangles), they just add **more child loops** sharing the same anchors.

## D — **braided / chorded detour** (branch sitting on a branch)

* **Look:** a side lobe attached to another side branch—“branch on branch.”
* **Type:** typically a **chord inside a bubble** or two **partially overlapping loops**:

  * Two loop events with spans `[L1,R1]` and `[L2,R2]` where the intervals **overlap but neither contains the other**, or
  * The same anchors *(L,R)* but with an extra **internal chord** creating a triangle.
* **Linearized draw:** two arcs whose x-spans overlap; they land on distinct **lanes** (siblings), not parent/child.
  If the anchors are the same *(L,R)*, you’ll see **parallel arcs** between the same x-positions (one per internal path).

---

# How this maps to the functions you have

* `createAssemblyWalk(...)` (with `mode:"auto"`) gives you the **spine** (GRCh38 walk) and ignores all chords.
* `linearize(...)` produces **loop events** by finding any detour between spine anchors *(L,R)* that is **not** the spine step.
  You can **group** those loops afterward:

  1. Build intervals from each loop: `I = [spanStart, spanEnd)`.
  2. **Containment** ⇒ **nested** (child inside parent) → C-style stacks.
  3. **Overlap without containment** ⇒ **siblings** / **braids** → D-style side-by-side arcs.
  4. **Same anchors (L,R)** ⇒ **parallel detours** (multiple arcs with identical x-span).

Small practical tip: put a tiny tolerance ε when comparing intervals so rounding doesn’t misclassify siblings vs nested.

---

# Optional UI cues (makes C and D obvious)

* **Badge counts on parent loops:** “3 paths L→R” when multiple parallel detours exist.
* **Nest guides:** faint vertical tick marks at `spanStart`/`spanEnd` of the parent; children snap inside.
* **Hover breakdown:** for any *(L,R)* show `refLenBp`, `min/median/max altLenBp`, **#paths**, and whether any **inversion-like** detours occur (if/when you track orientation).

If you’d like, I can add a tiny `groupLoopsByInterval(loops)` helper that returns `{ parents, children, siblings }` so C and D drop out automatically during rendering.
