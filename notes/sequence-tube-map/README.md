# Sequence tube map — the research record

**Status:** the spike repo's research apparatus was migrated here on **2026-08-20**. The
code had already migrated on 2026-08-17 (`src/tubemap/`); this is everything else — the
measurements, the surveys, the essays and the captured documents they were run against.

This **reverses** the decision recorded in
[`integration-punch-list.md`](integration-punch-list.md) §9, which on 2026-08-18 un-archived
the spike and kept it live as "a research laboratory… work that wants a standalone surface
and no obligation to be shippable." That was a reasonable call and it stopped being one: the
research and the implementation kept needing each other, and two repos meant two places to
look, two vocabularies drifting apart, and measurements cited in PGB's ADRs living somewhere
a PGB reader could not open.
[`CAST-genomics/sequence-tube-map-spike`](https://github.com/CAST-genomics/sequence-tube-map-spike)
stays as the git history of how the viewer was built. Nothing new goes there.

## What is normative, and what is not

Everything in this directory is **descriptive** — the advisory tier described in
[`CLAUDE.md`](../../CLAUDE.md). It explains, it records what was measured, and it licenses
nothing. Where a file here and a normative file disagree, the normative file wins:

- Rules and conventions — [`CLAUDE.md`](../../CLAUDE.md)
- Vocabulary — [`CONTEXT.md`](../../CONTEXT.md)
- Decisions — [`docs/adr/`](../../docs/adr), specifically
  [0001](../../docs/adr/0001-sequence-tube-map-panel.md) (the panel is not a Look),
  [0002](../../docs/adr/0002-webgl-band-renderer.md) (the viewer draws the server's geometry
  with WebGL) and [0003](../../docs/adr/0003-passive-pclai-inset.md) (the PCLAI inset is a
  passive position report).

Two files need that said about them twice, because they carry the spike's own normative
tiers and those are **superseded**, not inherited:

- **[`spike-context.md`](spike-context.md)** — the spike's `CONTEXT.md`. PGB's `CONTEXT.md`
  is the vocabulary; where the two disagree, PGB's is right. Kept because it defines terms
  PGB's does not, and because it is the reasoning behind several that came across.
- **[`spike-spec.md`](spike-spec.md)** — the spike's `SPEC.md`, a numbered list of user
  stories. Stories 29–31 are cited across the ADRs and the strategy documents; story 30
  (*recede the others rather than brighten the one*) is the rule ADR 0003 and pgb#112 test
  rather than obey. It specifies the spike's harness, not PGB's viewer.
- **[`spike-readme.md`](spike-readme.md)** — how to run the spike's own dev page.

## What is here

### Strategy and rendering

- **[`disambiguating-strands.md`](disambiguating-strands.md)** — the live document. Why 464
  strands cannot be told apart, four strategies for fixing it, six numbered constraints any
  strategy has to survive, and the survey that established the coordinate does not
  individuate a haplotype. The source of most of ADR 0003.
- **[`rendering.md`](rendering.md)** — what the renderer corrects and what it leaves alone,
  including the `uPad` doctrine the thickness floor (pgb#112) extends.

### Essays

Long-form arguments, each self-contained HTML:

- **[`table-lens-concepts-for-strand-disambiguation.html`](table-lens-concepts-for-strand-disambiguation.html)**
  — the Table Lens proposal that led to the PCLAI inset. **§03.3 is wrong** and the
  correction has not been written into it: it argues the resolution limit is a budget a
  scatter plot can buy by zooming, and ADR 0003 measures that it is not, at any size a panel
  can be.
- **[`routes-not-ribbons.html`](routes-not-ribbons.html)** — grouping strands by the nodes
  they traverse.
- **[`tracing-strand-463.html`](tracing-strand-463.html)** — following one haplotype.
- **[`a-band-is-arithmetic.html`](a-band-is-arithmetic.html)** — the band as a drawable.

### `measurements/`

The dated notes, each recording something that was run rather than argued, plus the
screenshots they refer to — including `highlight-5520-*.png`, the feeler-mode photographs at
fit that pgb#112's thickness floor has to beat.

### `data/`

JSON output from the survey scripts: the node table, the node survey, and the failure probe.

## The apparatus, which is not here

Two things live outside this directory because they are executable:

- **`scripts/verify_*.mjs`** — five headed Playwright harnesses driving the real GPU:
  highlight, pick, pointer binding, refusal, segment boxes. Retargeted at
  `dev/tubemap.html` on migration. Headed on purpose — headless chromium falls back to
  SwiftShader, where a readback is software rasterization and the numbers say nothing.
- **`scripts/*.py`** — the surveys behind the numbers quoted throughout these documents:
  `strand_grouping_survey.py`, `pclai_color_collisions.py`, `crossing_survey.py`,
  `build_node_table.py`, `survey_nodes.py`, `probe_failures.py`.

The wide documents they run against — `stm-node-5514-*.svg` and `stm-node-5520-*.svg`, 14 MB
each — are in `src/tubemap/__tests__/fixtures/` beside the small ones. They are not read by
the unit tests. `fixture.ts` explains why they are under `src/` and not `public/`.
