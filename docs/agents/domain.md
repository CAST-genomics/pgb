# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the ubiquitous language, in two halves: domain (genomics) vocabulary and system (PGB architecture) vocabulary.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.
- **`notes/`** — this repo's knowledge base. See the map below.

If any of these don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This is a single-context repo:

```
/
├── CLAUDE.md
├── CONTEXT.md
├── docs/adr/
├── notes/          ← knowledge base, see below
└── src/
```

## The `notes/` knowledge base

PGB carries a large hand-written knowledge base under `notes/` — explanatory prose, design rationale, spike write-ups, and domain primers. It predates these skills and is **not** in ADR or CONTEXT form. Read from it; don't try to restructure it.

Themed directories, and when to reach for each:

| Directory | Read it when |
| --- | --- |
| `notes/pangenome/` | Any domain question — graph coordinates, projection, the spine, assemblies, oriented nodes/edges, minigraph-cactus, graph terminology |
| `notes/architecture/` | Before touching looks, scenes, widgets, the event bus, or the dataset parser. `notes/architecture/look/` is required reading for look work |
| `notes/threejs/` | Rendering specifics — raycasting, materials, depth testing / render order, ribbon meshes, color management, morph targets |
| `notes/data-format/` | Dataset shape. `dataset-anatomy.md` is the illustrated reference; `stories/` holds the widget-anchored narratives |
| `notes/genomics/` | Reference genomes, annotation formats (GFF3, BigBed), IGV integration, custom assemblies |
| `notes/hprc-project/` | HPRC and PCLAI (Point Cloud Local Ancestry Inference) specifics |
| `notes/ui/` | Color palettes, tooltips, mouse event ordering, URL/file ingestion |
| `notes/sequence-tube-map/` | The tube map panel. `dev-affordances.md` is the one to read first — the dev pages, `?url`/`?pick`, the fixtures, and the gestures none of which are discoverable from the app |
| `notes/spikes/`, `notes/artwork/` | Experimental snippets and screenshots — rarely load-bearing |

## Use the glossary's vocabulary

When your output names a domain concept (an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids — note that several PGB terms have deliberate aliases recorded there (e.g. *assembly-haplotype*, a.k.a. *coordinate key*).

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (one Look per Scene) — but worth reopening because…_

The same courtesy applies to the conventions in `CLAUDE.md`, which encode decisions with history behind them (see the note there on issue #40 / PR #41).
