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

See `notes/architecture/look/`.

### Bidirectional 1:1 mapping is load-bearing UX

The user must always know where they are in **both** spaces at once — the 1D annotation track and the 3D graph. Mouse on the track → dot moves on the graph. Hover a node in 3D → feedback appears on the track. The two views are companions, not parallels. Letting a user get lost between representations is a failure mode, not an aesthetic preference.

- When touching the annotation track, hover behavior, raycast feedback, or any 1D ↔ 3D interaction, ask: does this preserve the bidirectional mapping? If a change weakens the link — jumps off the visible path, drops feedback silently, decouples the coordinate systems — **flag it explicitly rather than just implementing it**.
- Where-am-I visuals (dots, ticks, emphasis) are first-class, not decoration.
- When the visible node set changes (Assembly Walk vs Subgraph, future modes), the mapping target set changes to match.
- Coordinate math backing this mapping must be rigorous about reference coordinates. Synthetic/cumulative bp axes that drift from `metadata.start/end` are a recurring bug source (issue #69, PR #71).

Relevant code: `src/annotationTrackController.ts`, `src/annotationCoordinateIndex.ts`, `src/assemblyTrackModel.ts`.

### New files in TypeScript

Every new file is `.ts`. Existing `.js` files stay as-is unless the task specifically calls for conversion — when editing a `.js` file in place, leave it `.js`. This supports the gradual migration described in `notes/architecture/typescript-strategic-adoption.md`: TypeScript at contract boundaries first.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `CAST-genomics/pgb`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, using their default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root, plus the `notes/` knowledge base. See `docs/agents/domain.md`.
