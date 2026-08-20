# PGB — Pan Genome Browser

A web-based visualization tool for pangenome graphs. Three.js for 3D rendering; Vite for the build.

## Conventions

### Looks are the heart of the app

The Look system is the central architectural investment. A **Look** owns a complete visual appearance — materials, colors, emphasis states, tooltips, per-frame animation — for one scene. Concrete looks live in `src/looks/` (`NodeEmphasisLook`, `HeatmapLook`).

The model is Rob Cook's shade trees: appearance authorship belongs in a small, self-contained unit that is *allowed to grow rich*, in exchange for the rest of the pipeline staying simple. Complexity is managed by offloading it into the look library, not by wrapping the library in coordinators.

- A new visualization is a **new Look or a new parameter on an existing Look** — never a hack bolted on outside the framework. Collaborators request new visualization modes regularly; the Look system is how we absorb them.
- Looks are allowed to be big. Deepen them (Ousterhout: small interface, rich implementation) rather than decomposing into coordinator + state machine + adapter layers. Growth *inside* a Look is fine; growth in the negotiation *between* Looks and the rest of the app is the smell.
- **Reject refactors that pull appearance logic out of Looks** into generic coordinators, reducers, or command pipelines. This is why the hexagonal-core proposal in issue #40 was rejected in favor of the deepening work that shipped as PR #41. Turning Looks into thin material factories driven by a scene graph destroys the flexibility the architecture exists to provide.
- Looks own visual semantics; widgets are free event producers. Widgets may invent their own events and payload shapes. The constraint is each Look's internal coherence, *not* symmetry between widgets.
- A Look's subscribed events are its parameter-binding interface — analogous to the uniforms a RenderMan shader declares. "What can this Look be driven by?" should be answerable by reading the Look's `activate()` body, not by tracing a command bus.
- **The rule's boundary:** Looks own the appearance of *the pangenome graph*. A viewer with its own scene graph drawing different data from a different source is a panel, not a Look — the **tube map panel** is the one such case, decided in [`docs/adr/0001-sequence-tube-map-panel.md`](docs/adr/0001-sequence-tube-map-panel.md). Do not "fix" it into a Look.

Long form: `notes/architecture/code-architecture-improvements.md` §Guiding philosophy (the shade-tree lineage and its refactoring consequences), `notes/architecture/look/look-system-architecture.md` (components and lifecycle), `notes/architecture/look/creating-a-new-look.md` §0 (new Look vs. extend an existing one).

### Bidirectional 1:1 mapping is load-bearing UX

The user must always know where they are in **both** spaces at once — the 1D annotation track and the 3D graph. Mouse on the track → dot moves on the graph. Hover a node in 3D → feedback appears on the track. The two views are companions, not parallels. Letting a user get lost between representations is a failure mode, not an aesthetic preference.

- When touching the annotation track, hover behavior, raycast feedback, or any 1D ↔ 3D interaction, ask: does this preserve the bidirectional mapping? If a change weakens the link — jumps off the visible path, drops feedback silently, decouples the coordinate systems — **flag it explicitly rather than just implementing it**.
- Where-am-I visuals (dots, ticks, emphasis) are first-class, not decoration.
- When the visible node set changes (Assembly Walk vs Subgraph, future modes), the mapping target set changes to match.
- Coordinate math backing this mapping must be rigorous about reference coordinates. Synthetic/cumulative bp axes that drift from `metadata.start/end` are a recurring bug source (issue #69, PR #71).

Relevant code: `src/annotationTrackController.ts`, `src/annotationCoordinateIndex.ts`, `src/assemblyTrackModel.ts`.

### New files in TypeScript

Every new file is `.ts`. Existing `.js` files stay as-is unless the task specifically calls for conversion — when editing a `.js` file in place, leave it `.js`.

The migration principle is **TypeScript at contract boundaries** — where one part of the system hands data to another under an implicit agreement about shape and meaning. Convert those first; wholesale conversion is not a goal. Long form, including the remaining priority targets: `notes/architecture/typescript-strategic-adoption.md`.

## Where documentation goes

Two tiers, split by authority rather than topic.

**Normative — binding.** This file, `CONTEXT.md`, and `docs/adr/`. Small, always read. Rules, vocabulary, and decisions live here. An agent must follow them and must flag explicitly when its output contradicts one rather than silently overriding.

**Descriptive — advisory.** The `notes/` tree. Large, read on demand by topic. Explanatory prose, design rationale, spike write-ups, domain primers, API references. Consult it freely; never treat it as permission or prohibition. A note describes how something works — it does not license a change.

Consequences for writing:

- **New rules, conventions, and domain vocabulary go in this file** (or `CONTEXT.md` / an ADR), not into a new note. The vocabulary is largely stable; the main source of genuinely new terms is incoming integration work such as `notes/sequence-tube-map/`.
- **State each rule once.** Notes cite the normative source rather than restating it, so revising a rule can't leave a stale copy behind. Notes keep the long-form reasoning the rule is too short to carry.
- **Don't reorganize `notes/`.** It predates this structure and works as-is. `docs/agents/domain.md` maps it for agents.
- Notes making claims about *pending* work carry a `**Status:**` line and are updated when the work lands — see `notes/architecture/technical-debt-14-apr-2026.md`. Reference and primer notes don't need one.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `CAST-genomics/pgb`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, using their default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root, plus the `notes/` knowledge base. See `docs/agents/domain.md`.

### Releases

A release is a git tag, a GitHub release page, and a matching `version` in `package.json`. See `docs/agents/release-process.md`.
