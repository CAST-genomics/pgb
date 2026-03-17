# Many Axes, One Graph

**A practical guide to coordinate systems in pangenome graphs**

This note explains why a pangenome graph does **not** live in a single universal coordinate system, what coordinate systems *do* exist, and how to move between them when you render or analyze graphs.

---

## 1) The three coordinate systems you actually have

### A) Node-local coordinates

Every node that carries sequence has its own intrinsic 1-D axis: `[0 … lengthBp)`.

* Always exists if you know the node’s length.
* Independent of any genome or assembly.
* Useful for per-node labels, base-level highlighting, and computing alt-path lengths.

### B) Path / assembly coordinates

Pick a **walk** (e.g., `GRCh38#0#chr1`, `CHM13#0#chr1`, or a sample contig). Now each node that appears in that walk gets true offsets along that walk’s axis:

* `bpStart(node)` and `bpEnd(node)` are cumulative over **that** walk.
* A node may appear **0×** (no coords on that walk), **1×** (one interval), or **>1×** (repeats/duplications → multiple intervals).
* Different walks assign **different** coordinates to the *same* node because upstream content differs.

### C) Spine (linearized view) coordinates

Your linear view’s x-axis is whichever assembly walk you designate as the **spine**.

* Nodes on the spine use their **true** `bpStart/bpEnd` from that spine walk.
* Nodes **off** the spine have no inherent x-position on that axis; to draw them, you need a **projection** (see §4).

---

## 2) Why a single global axis doesn’t exist

* **Rearrangements** (inversions, translocations, cycles) can’t be embedded on one line without tearing.
* **Paralogy / repeats** put identical sequence at multiple genomic sites; a single “mile-marker” would have to clone it.
* **Insertions absent from a given reference** have no place on that reference’s axis.

The graph is the **atlas**; each assembly is a **map projection** of that atlas.

---

## 3) What the core structures mean for coordinates

* **Spine (chosen assembly):** a simple path you draw as the x-axis. Adjacent spine nodes abut (`bpEnd(prev) = bpStart(next)`), so the axis has no gaps.
* **Events relative to the spine:** off-spine sequence that connects back to the spine within the current window.

  * **Pill:** adjacent anchors; insertion w\.r.t. the spine (0-bp span).
  * **Bubble / Parallel bundle:** non-adjacent anchors; one or more alternative routes between two spine positions.
  * **Braid:** overlapping / nested event spans (intervals interact in spine space).
  * **Dangling:** leaves the spine but doesn’t rejoin inside the window.

These types are defined by interval relations **on the spine**, not by the graph’s drawing.

---

## 4) Projection: giving off-spine paths x-positions

**Projection** is a deterministic, monotone mapping that places the interior of an off-spine path into the spine’s anchor span `[spanStart, spanEnd]`:

1. Anchor ends exactly at the spine: `L → spanStart`, `R → spanEnd`.
2. Distribute interior nodes **proportionally to their bp lengths** along that span.
3. For **pills**, `spanStart == spanEnd`, so all interior nodes map to the same bp (the glyph size comes from the alt length).
4. If a sampled path touches intermediate **spine** nodes (option enabled), those segments use their **true** spine intervals; only the off-spine stretches are projected.

Projection is for **rendering**, not for calling biological coordinates.

---

## 5) “Keyed” vs. “non-keyed” off-spine nodes

When a user chooses an assembly key (e.g., `CHM13#0#chr1`):

* **On-spine (keyed):** on the chosen simple path; use true bp.
* **Off-spine (keyed):** the node lists the key but isn’t on the chosen simple path (alternate leg, other keyed component, or outside the window).

  * If it touches the spine inside the window, it appears as an **event** with projected positions.
  * Otherwise it’s context (`offSpine[]`)—no x-position on this spine.
* **Off-spine (non-keyed):** not part of the selected assembly; draw as faint background.

Treat these differently in the UI (strong / medium / faint) so users understand what belongs to the current assembly story.

---

## 6) Common gotchas & how to avoid them

* **“Why isn’t every node with this key on the walk?”**
  A single simple path can’t cover both legs of a parallel segment or a cycle. If you need to highlight *everything*, show the **keyed induced subgraph** (cover-all mode) in addition to the spine path.

* **“Why do bp offsets change when I change the spine?”**
  Because each spine is a different axis (different upstream content). The same node can have multiple, equally valid offsets—**one per assembly** that contains it.

* **“Can I get bp for an off-spine node without an event?”**
  Not on the spine axis. You can show **node-local** `[0,len)` or switch the spine to that node’s assembly.

---

## 7) Practical API pattern (what to show in tooltips)

Prefer true coordinates on the current spine; otherwise fall back to projected (when inside an event); otherwise show node-local:

```js
// Pseudocode around your PangenomeService
const onSpine = svc.getBpExtent(nodeId); // true bp on current spine
if (onSpine) show(bpStartEnd=onSpine, system="spine");
else if (currentEvent) {
  const proj = svc.getProjectedBpInEvent(nodeId, currentEvent);
  if (proj) show(bpStartEnd=proj, system="projected");
  else show(bpStartEnd={0, len(nodeId)}, system="node-local");
} else {
  show(bpStartEnd={0, len(nodeId)}, system="node-local");
}
```

Always tag the **system** with any bp you present: `"spine" | "assembly" | "projected" | "node-local"`.

---

## 8) Mental model you can keep

Think **rail network**:

* The **graph** is tracks + switches (topology).
* Each **railroad** (assembly) has its own **mileposts** along the routes it runs.
* A siding (off-spine node) has length you can walk (node-local), but it has no milepost on a different company’s mainline unless you define how it ties in—exactly what **projection inside an event** does for rendering.

---

## 9) What the literature calls these ideas

* Local variation motifs: **bubbles, superbubbles**; generalized to **snarls / ultrabubbles** via **cactus-graph** decompositions. These are the formal “sites” your UI calls pills/bubbles/braids. ([PMC][1])
* The **variation-graph / vg** ecosystem treats the graph as the reference; each **path** provides its own coordinate axis (what we call “assembly coordinates”). ([Nature][2], [PubMed][3])
* **GFA** is the common format for sequence graphs; it encodes segments (nodes), orientation, and links—your node `+/-` semantics come from here. ([GitHub][4], [gfa-spec.github.io][5])
* Visualization patterns (e.g., **Sequence Tube Maps**) motivate path-centric rendering and arc-style detours—close to our linearized view with projection. ([Oxford Academic][6], [PubMed][7])
* Tools like **BubbleGun** enumerate bubbles/superbubbles and compare to vg snarls; useful background if you later align our “events” to formal site definitions. ([Oxford Academic][8], [PubMed][9])

---

## Further reading

* **Superbubbles, Ultrabubbles, and Cacti** — formalizes snarls/ultrabubbles and the cactus decomposition used to define nested sites. ([PMC][1], [PubMed][10])
* **Variation Graph Toolkit (vg)** — treating the graph itself as a reference; paths as coordinate systems; improves mapping over linear references. ([Nature][2], [PubMed][3])
* **GFA specification (GFA1/GFA2)** — orientation, links, and path lines; the lingua franca for assembly/variation graphs. ([GitHub][4], [gfa-spec.github.io][11])
* **Sequence Tube Maps** — path-centric visualization ideas for graph genomes. ([Oxford Academic][6], [PubMed][7])
* **BubbleGun** — enumerating bubbles/superbubbles (and bubble chains); connects site detection to practical tools. ([Oxford Academic][8], [bioRxiv][12])

*Tip:* keep your app explicit about **which coordinate system** a number belongs to, and projection becomes an intuitive, reliable bridge between off-spine alternatives and the current spine axis.

[1]: https://pmc.ncbi.nlm.nih.gov/articles/PMC6067107/?utm_source=chatgpt.com "Superbubbles, Ultrabubbles, and Cacti - PMC"
[2]: https://www.nature.com/articles/nbt.4227?utm_source=chatgpt.com "Variation graph toolkit improves read mapping by ..."
[3]: https://pubmed.ncbi.nlm.nih.gov/30125266/?utm_source=chatgpt.com "Variation graph toolkit improves read mapping by ..."
[4]: https://github.com/GFA-spec/GFA-spec?utm_source=chatgpt.com "Graphical Fragment Assembly (GFA) Format Specification"
[5]: https://gfa-spec.github.io/GFA-spec/GFA1.html?utm_source=chatgpt.com "Graphical Fragment Assembly (GFA) Format Specification"
[6]: https://academic.oup.com/bioinformatics/article/35/24/5318/5542397?utm_source=chatgpt.com "Sequence tube maps: making graph genomes intuitive to ..."
[7]: https://pubmed.ncbi.nlm.nih.gov/31368484/?utm_source=chatgpt.com "Sequence tube maps: making graph genomes intuitive to ..."
[8]: https://academic.oup.com/bioinformatics/article/38/17/4217/6633304?utm_source=chatgpt.com "enumerating bubbles and superbubbles in genome graphs ..."
[9]: https://pubmed.ncbi.nlm.nih.gov/35799353/?utm_source=chatgpt.com "enumerating bubbles and superbubbles in genome graphs"
[10]: https://pubmed.ncbi.nlm.nih.gov/29461862/?utm_source=chatgpt.com "Superbubbles, Ultrabubbles, and Cacti"
[11]: https://gfa-spec.github.io/GFA-spec/GFA2.html?utm_source=chatgpt.com "Graphical Fragment Assembly (GFA) 2.0 Format Specification"
[12]: https://www.biorxiv.org/content/10.1101/2021.03.23.436631v1.full.pdf?utm_source=chatgpt.com "Enumerating Bubbles and Superbubbles in Genome Graphs"
