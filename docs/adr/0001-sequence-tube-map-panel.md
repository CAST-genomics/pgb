---
status: accepted
date: 2026-08-17
---

# The sequence tube map is a self-contained viewer, not a Look

The **sequence tube map** is a magnifying glass on a single **minigraph node**: PGB's 3D
graph draws a node as one collapsed summary of a stretch of sequence, and the tube map
shows what is inside it — segments at base-level resolution, with every haplotype's path
threaded through them. It is built, measured and working in
[`CAST-genomics/sequence-tube-map-spike`](https://github.com/CAST-genomics/sequence-tube-map-spike);
this ADR records how it enters PGB.

**Decision.** The viewer lands in `src/tubemap/` as a self-contained panel with **its own
WebGL scene graph, its own camera and its own render loop**. It is **not a Look**, it does
not register with `LookManager` or `SceneManager`, and it publishes and subscribes to
nothing on the event bus except a `datasetLoaded` subscription that destroys it. Its entire
input surface is one function — `open(url: string)` — and PGB builds the URL from the
clicked node.

This is written down because [`CLAUDE.md`](../../CLAUDE.md) points a reader at Looks by
default, and correctly so: *"a new visualization is a new Look or a new parameter on an
existing Look — never a hack bolted on outside the framework."* The tube map is the case
that rule does not reach, and without this document the first reviewer of the migration
would be right to ask why, and a later refactor would be right to "fix" it into a Look.

## Why the Look rule does not reach it

A Look owns the appearance of **PGB's graph** in one Three.js scene: the meshes are
`RibbonNode`s built from `dataset.node`, the camera is PGB's, the render loop is `App`'s,
and switching Looks means switching which scene that one loop draws. Every clause of the
rule assumes those shared objects. The tube map shares none of them:

| | a Look | the tube map panel |
|---|---|---|
| draws | `RibbonNode` meshes from the dataset | instanced bands parsed out of a UCSD SVG |
| scene | one of PGB's, pre-created at load | its own, created on `open(url)` |
| camera | PGB's, shared across Looks | its own `OrthographicCamera` + `MapControls` |
| render loop | `App`'s `setAnimationLoop` | its own |
| input | events on the bus, its parameter-binding interface | `open(url)`, one string |
| data | the loaded dataset | a separate HTTP fetch from a third party |

Making it a Look would mean a Look that ignores the scene it is handed, ignores the
dataset, draws geometry no other Look can share, and answers to one caller through a
function rather than through its subscriptions. That is the *form* of the framework with
none of its substance — and it would corrupt the property `CLAUDE.md` actually cares about,
that "what can this Look be driven by?" is answerable by reading `activate()`.

That reasoning is what the Looks section of [`CLAUDE.md`](../../CLAUDE.md) now states as
the rule's boundary; this ADR is where it is derived, and the rule is stated there rather
than restated here. `mountPclaiChart` is the precedent — the PCLAI chart is a whole second
visualization living beside the graph, and nobody proposed making it a Look either.

## Rejected alternatives

- **A `TubeMapLook` with its own scene.** Rejected above. It buys a registration in
  `LookManager` and pays with a Look that no Look-shaped statement is true of.
- **Embedding the tube map in PGB's scene**, as geometry beside the graph. The map is a
  14:1-to-28:1 strip zoomed to 200× in its own orthographic frame; there is no camera that
  frames both it and the 3D graph usefully, and `MapControls` cannot serve two framings.
- **A route or a separate page.** Loses the thing that makes it worth building: the
  researcher clicks a node they are already looking at and sees inside it. A page swap
  discards the 3D context that motivated the click.
- **Routing the fetch through PGB's `loadPath` / dataset ingestion.** The response is
  UCSD's SVG, not a PGB dataset; it fails in its own ways (see *the fetch ceiling* below)
  and needs its own error card. Keeping `fetchDocument.ts` as-is keeps that failure mode
  out of the dataset loader.
- **Keeping the spike's SVG surface as a fallback behind the band renderer.** Rejected in
  the spike (spike #40) and inherited here as decided; the reasoning is in
  [ADR 0002](0002-webgl-band-renderer.md).

## Accepted costs

Seven, each real, each stated here rather than left to be discovered.

### 1. The `ColorManagement` global, which isolation does not isolate

A separate scene graph isolates scenes, cameras and materials. It does **not** isolate
`THREE.ColorManagement.enabled`, which is one flag on one shared module instance. PGB sets
it `true` in `rendererFactory.js`; the viewer set it `false` at module scope, and with one
`three` in the dependency tree that is last-loader-wins **globally** — the viewer's import
can change how PGB's 3D graph is coloured.

This is the single place where the "self-contained viewer" claim is false, so it is not
merely noted, it is being removed: the module-scope assignment goes, colour space is set
per material and per texture if the render differs, and the fixture render is pixel-diffed
before and after. Never toggle it per frame — that makes correctness depend on render
order.

**Resolved 2026-08-18** ([#89](https://github.com/CAST-genomics/pgb/issues/89)). The
assignment is gone and the flag was defensive, not load-bearing: the fixture render and
PGB's own graph are both byte-identical either side of the deletion, so nothing needed
setting per material or per texture. The renderer's `outputColorSpace` stays — that one is
per instance, and the two viewers hold different answers at the same time. This cost is no
longer accepted; it is paid. `src/tubemap/__tests__/colorManagementIsUntouched.test.ts`
keeps it paid.

### 2. The 1D↔3D correspondence is weakened, and the panel occludes the graph

**Flagged explicitly, as [`CLAUDE.md`](../../CLAUDE.md) requires**, rather than quietly
implemented. Two distinct costs:

- **A third space with no link to the other two.** PGB's load-bearing UX is that a
  researcher always knows where they are in *both* the annotation track (1D) and the graph
  (3D), and that hovering either produces feedback in the other. The tube map adds a third
  representation of the *same* locus — base-level, inside one node — and ships with **no
  correspondence to either**. Hovering a segment lights nothing on the track; hovering a
  node lights nothing in the map; the strands are named `sample#haplotype#contig`, a
  3-part assembly-walk-shaped key PGB can address, and nothing addresses it. This is a
  deferred obligation, not a defect, and it was consciously scoped out in the spike. It is
  the first thing to revisit once the panel is in front of users.
- **A floating card occludes the graph it corresponds to.** The panel is a draggable,
  resizable card over the 3D view, so the node it was opened from can be behind it. A
  docked strip below the graph is the better home for a 14:1 map and is the intended next
  project; it is not this one because it means touching PGB's only resize path. Accepted
  meanwhile because the card is movable and the alternative delays everything.

### 3. UCSD is an upstream we are coupled to at the level of drawing primitives

The viewer does not display the server's SVG; it **parses drawing commands out of it** —
`d` attributes matched against one path grammar, rebuilt as six floats per band and
rasterized on the GPU. So a change to how UCSD draws is a rendering bug for us, and there
is no second surface to fall back to: a non-conforming document is refused whole and shows
an error card. [ADR 0002](0002-webgl-band-renderer.md) is that decision in full — the
argument, the measurement that bounds the risk, and the safety deliberately given up when
the fallback surface was deleted. It is inherited here as decided, and it is the one to
read before touching the parser.

Recorded here because it is what PGB is taking on rather than what the spike concluded:
the coupling is not the alternative to a pure viewer. The pure viewer does not work on
this data, which is why ADR 0002 exists at all.

### 4. The fetch ceiling cannot be gated, only waited out

Roughly 43% of the catalogued nodes cannot be fetched at all: eleven HTTP 500s and two TLS
timeouts out of 30. The 500 is an unhandled application exception on UCSD's side, it is not
load, and it is not the node — the same `minigraphnode` succeeds with a narrower window.
The "responses above ~14 MB crash" framing does **not** survive bisection: `5511+` succeeds
at 14.7 MB / 65.6 s while `5508+` fails at roughly half that. **No threshold in bytes or in
seconds separates success from failure**, and a 500 returns no body, so the size of a
failure is not knowable from the client at all.

Consequently eligibility **cannot** be gated on span or size — any threshold either blocks
nodes that work or admits nodes that crash. What PGB does instead is give up at
`PATIENCE_MS` (90 s, above the slowest measured success) and show a failure card naming the
server as the fault. This is a guardrail, not a fix; it is UCSD's defect and stays theirs.
Do not reopen it as an investigation without a reason the viewer needs one.

Two related transport facts that constrain the code: fetch **without** credentials (the
endpoint pairs a wildcard origin with `allow-credentials: true`, which browsers reject),
and error responses carry no CORS headers, so a 500 arrives as an opaque network failure.

### 5. Eligibility must be gated in PGB, because the API will not tell us

An unknown `minigraphnode` returns **200 with a plausible-looking map** in a fallback
8-colour palette and no haplotype greying — silent nonsense, never an error. A node absent
from GRCh38 has no tube map. So `tubeMapTargetForNode()` decides eligibility before the
menu item is enabled, and an ineligible node shows the item **disabled with the reason**
rather than hidden. Without that gate an ineligible node shows a map that looks correct and
is of different data, which is the worst failure available to this feature.

### 6. Strand disambiguation is unsolved, and ships unsolved

~460 haplotypes arrive encoded in 120–150 distinct colours, four in five sharing a colour
with another haplotype **exactly**. The colours are PCLAI's shipped encoding, derived for
the PCLAI chart where *position* separates the points and colour merely supports them; a
tube map has no position channel to spare. Feeler mode (hold `Shift`, the strand under the
cursor stays lit and the rest recede) answers this from about one CSS pixel per band
upward, and answers nothing at fit-to-width, where a band on `5520+` is 0.19 CSS pixels
tall and 5.7 strands share a device pixel row. The strategies and the constraints each has
to survive are in
[`notes/sequence-tube-map/disambiguating-strands.md`](../../notes/sequence-tube-map/disambiguating-strands.md);
nothing there is decided.

Colour is also shared vocabulary with the PCLAI chart and the 3D graph, so the viewer
**does not recolour**. That is a constraint on every future answer, not just a description
of today's.

### 7. The feeler's performance proof is demoted from test to record

The spike proved the appearance table under Playwright: five `verify_*.mjs` scripts, of
which `verify_highlight.mjs` measured a sweep moving the emphasis 198 times across 198 of
464 strands at a median write of 0.000 ms and a worst of 0.100 ms, with the worst sweeping
frame (9.4 ms) equal to the worst frame for the identical moves with the key released.
**Those scripts are not migrating.** PGB has no browser-driving suite for them to join, and
carrying one for a single panel is more machinery than the panel is worth.

What migrates is the 11 unit tests over the pure seams — `parseBands`, `parseSegmentBoxes`,
`bandCamera`, the rejection reasons — which are the things that can be silently wrong
without looking wrong. The performance claim becomes a dated measurement in
[`notes/sequence-tube-map/`](../../notes/sequence-tube-map/) rather than something CI
re-checks. Stated plainly: **a regression that makes the feeler slow again will not be
caught by a test.** It will be caught by looking, which is how every rendering decision in
this work was settled anyway.

## The spike after the migration

**Amended 2026-08-18, once the viewer had shipped.** This ADR was written expecting
[`CAST-genomics/sequence-tube-map-spike`](https://github.com/CAST-genomics/sequence-tube-map-spike)
to be GitHub-archived at the end of the migration, and every reference to it here and in
[ADR 0002](0002-webgl-band-renderer.md) read as a pointer into a sealed record. That is
reversed: the repo stays live, as a **research laboratory** for visualization metaphors and
affordances that make tube map data more tractable. Such work wants a standalone surface and
no obligation to be shippable, which is what a spike repo is for and what PGB's tree is not.

The consequence that matters to a reader here is that **two implementations of this viewer
now exist at once**, and this is the one that ships. So:

- The direction of travel is one-way. The laboratory explores; a metaphor that earns its
  place arrives in PGB as a change to `src/tubemap/` under this ADR's terms. A change does
  not arrive as a second implementation to reconcile, and `src/tubemap/` is never
  re-synchronised wholesale from the spike.
- Its four open questions — strand disambiguation (spike #32, #50), hollow unscored strands
  (#48), the slow-server spinner (#58) — stay there rather than being re-filed here. They are
  the laboratory's subject. Cost 6 below is the same question, and nothing about it is
  decided in either place.
- Links into the spike's notes and `CONTEXT.md` stay good, and are now links into working
  material rather than into an archive.

## Consequences

**This ADR precedes the code it governs, deliberately** — see the epic,
[#85](https://github.com/CAST-genomics/pgb/issues/85). At the time of writing `src/tubemap/`
did not exist and neither did `buildSeqTubeMapURL()` or `tubeMapTargetForNode()`; the
consequences below are what the migration is bound to, not a description of what is in the
tree. They stop being forward-looking as the epic's steps land — `src/tubemap/` with
[#88](https://github.com/CAST-genomics/pgb/issues/88), and the two functions with
[#90](https://github.com/CAST-genomics/pgb/issues/90), which put them in
`src/pangenomeURL.ts` rather than the `.js` file the issue named.

- `src/tubemap/` is a module PGB calls and does not otherwise reach into. Its seam is
  `open(url)`; widen it only deliberately.
- The panel is created once and reused — a second node calls `open(url)` again — and is
  **destroyed** on `datasetLoaded`, releasing every subscription.
- It runs its own animation loop. Do not attach it to `App`'s `setAnimationLoop`.
- `three` stays a single pinned version shared with PGB (`^0.176.0`). The dependency
  overlap that was a cost in the spike is the point here.
- The vocabulary this feature brings — **band**, **segment**, **strand**, **sequence tube
  map**, **tube map panel**, and the **minigraph node** alias for `node` — is in
  [`CONTEXT.md`](../../CONTEXT.md). Two collisions were resolved by renaming on our side:
  the map's *tracks* are **strands** because `track` already means PGB's annotation track,
  and the map's *nodes* are **segments** because `node` already means the graph vertex.
