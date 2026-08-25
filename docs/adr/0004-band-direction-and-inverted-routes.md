---
status: accepted
date: 2026-08-25
measured: 2026-08-25
---

# Band geometry is normalized; direction is carried as meaning, and a route is inverted or it is not

A **band** in the server's document may run right-to-left. ADR
[`0002`](0002-webgl-band-renderer.md)'s grammar gate refuses any document containing one, so
until now such a document produced an error card and nothing else.

**Decision.** Geometry is **normalized** — every band is stored with a positive width, exactly
as it is today — and the direction it was drawn in is carried **beside** the geometry as a
separate datum rather than as the sign of a float. Three terms carry it, and the split between
them is the decision:

- **band direction** is *document-relative* — which way a band runs against the document's
  x-axis, `rightward` or `leftward`. This is what the parser reads, and it is always defined.
- **reference direction** is the band direction GRCh38 itself takes in that document. It is
  derived per document, not stored, and a document without a GRCh38 strand simply does not
  have one.
- **inverted** describes a **route** whose band direction opposes the reference direction. It
  is the only one of the three that means anything biological, and it is the only one a
  researcher ever sees.

**Route identity becomes `(segments, direction)`.** A forward traversal and an inverted
traversal of the same segments are two routes, not one.

## What was measured

`chr8:10079054-10080461`, minigraph node `136685` — the document that produced the refusal:

| | |
|---|---|
| connector paths | 5948 |
| running right-to-left | 3771 (63.4%) |
| strands | 463 |
| strands entirely forward | 166 |
| strands entirely backward | 297 |
| **strands mixing both** | **0** |
| `GRCh38#0#chr8` | **leftward** |
| `CHM13#0#chr8#0` | rightward |

Every other grammar rule passes on these bands — thickness 15, both control points sharing an
abscissa, the return edge offset by exactly `THICKNESS`. They are well-formed bands that run
the other way. Only the `x1 > x0` assertion rejects them.

That no strand changes direction mid-traversal, and that the locus is chr8p23.1, together say
this is an inversion polymorphism rather than a malformed document. Four other documents were
censused as controls — the two committed fixtures, the two large survey documents — and all
four have **zero** right-to-left paths, which is why nothing caught this earlier.

## Why the direction is stored document-relative and read GRCh38-relative

The finding that forces the split is that **GRCh38 runs leftward here**, with the 297, while
CHM13 runs rightward with the 166. The document's x-axis is the server's layout order and is
not oriented along any reference. So:

- Storing *inverted* directly would require the parser to decide what is inverted relative to
  what, at parse time, from a reference strand that may be absent — and would bake a
  biological judgment into a number read off a path.
- Storing *leftward* is a fact about the picture. It is true whether or not GRCh38 is present,
  and it cannot be wrong.

The interpretation then happens where the reference is known. This degrades honestly: a
document with no GRCh38 strand still parses, still draws, and only loses the ability to say
which side is inverted. GRCh38 was present in all five documents examined, and that is
deliberately **not** relied upon.

## Considered and rejected

- **Signed width.** Carry `x1 - x0` with its sign and let the renderer handle it. Rejected:
  it puts semantics in a geometry float, so every downstream consumer — the pick pass, the
  segment overlay, the navigator — inherits a distinction that has nothing to do with
  rasterization, and the two `u` fractions normalized against that width go negative with it.
- **Direction as a strand property.** Tempting: 463 strands, 0 mixed. Rejected because it is
  the same mistake that caused this bug, one level up. "Every band runs left to right" was a
  surveyed regularity across 17 documents that got written down as a requirement; "no strand
  mixes direction" is a surveyed regularity across one. Direction is observed per band, where
  it is measurable, and aggregated upward at read time.
- **Route as a fully ordered traversal.** Direction would fall out of the order for free.
  Rejected: full ordering makes every layout reshuffle a new route, which is the instability
  the set formulation was chosen to avoid, and it would break the depth-cue argument's
  requirement that route identity be invariant over the window.
- **Refusing a mixed-direction strand.** Rejected for the same reason as the original gate:
  refusing biology the survey happened not to contain. A mixed strand is representable and is
  *reported* where direction is reported, but nothing asserts against it.

## Consequences

**This amends ADR [`0002`](0002-webgl-band-renderer.md).** Its gate refuses right-to-left
bands, and that refusal is withdrawn — the `x1 > x0` assertion goes, and the remaining grammar
assertions stay exactly as they are. The gate's *policy* is untouched: a document that does not
match the drawing grammar is still refused whole, and partial rendering is still never offered.
What changes is that direction was never part of the drawing grammar. It is biology, and the
gate should be silent about biology. The error message naming the rule states something false
and goes with it.

**The depth-cue argument survives.** `scripts/split_routes_svg.py` and
[`depth-cue-for-route-disambiguation.html`](../../notes/sequence-tube-map/depth-cue-for-route-disambiguation.html)
rest on route identity being invariant over the window, so that one scalar `z` per route is
well-defined. `(segments, direction)` is exactly as invariant as `segments`.

**No published route count changes.** The script keys routes by `frozenset(segments)`;
adding direction to the key alters nothing in a document where every strand runs one way, and
all four committed documents do. `stm-node-5520`'s 464 strands over 274 segments in 112 routes
stand unchanged, as does the six-locus survey.

**What a researcher sees** is a route-level fact — an allele count, in the vocabulary the
route entry already establishes — plus the direction of an individual haplotype in the text
surfaces that already exist. Colour cannot carry it: RGB is the document's PCLAI value and
shared vocabulary with the 3D graph and the PCLAI chart. Alpha cannot: it is the feeler's. And
at fit a band is 0.19 css px tall, so no per-band glyph is legible where the map is densest.
A mark in the map itself is left as a separate decision, to be settled by a sweep and a
measurement the way the thickness floor and the pick sample count were.
