# Route layers — one SVG per route, node `5520+`

**Status:** an experiment run on 2026-08-22 to see whether the depth-cueing proposal in
[`../depth-cue-for-route-disambiguation.html`](../depth-cue-for-route-disambiguation.html)
survives contact with a real document. Nothing here ships, and nothing here is normative
(see [`CLAUDE.md`](../../../CLAUDE.md) § Where documentation goes). It answers one
question — *can routes be separated into layers at all* — and turns up two things the
essay assumes that this window does not support.

The essay's own status line said "nothing built; no route computation in the viewer yet".
There still is none in the viewer. This is upstream of that: routes computed offline, and
each one written out as an independent drawable so the stacking can be looked at before
anything is built to produce it live.

**Companion essay:** [`../route-layers.html`](../route-layers.html) — what the app is for,
the vocabulary, the check, and what the split found. This file is the operating notes.

## What was made

    python3 scripts/split_routes_svg.py \
        src/tubemap/__tests__/fixtures/stm-node-5520-chr1-25331646-25335796.svg \
        --output notes/sequence-tube-map/route-layers

**One route, one file, one layer.**

- `routes/route-NNN.svg` — **112 files**, one per route, ordered most-carried first. Each
  carries the source document's `viewBox` verbatim and nothing but its own bands, so any
  subset stacks back up in register with no transform.
- `segments.svg` — the segment-box layer, as chrome to draw the routes against.
- `manifest.json` — per route: strands, segments, Jaccard to consensus, member strand ids.
- `index.html` — a stacking viewer: 112 layers, one per route, listed as a popularity
  histogram. Click a route to solo it against the dimmed rest; toggle any layer; casing,
  shadow, zoom and pan.

The 112 route files are ~14 MB and **derived**, so they are git-ignored;
`manifest.json` and `segments.svg` are small and are kept, because the manifest *is* the
result. The script, this file
and the viewer are committed; run the command above to regenerate the rest. To open the
viewer, serve the repo root (`python3 -m http.server`) and visit this directory — it
fetches `manifest.json`, so `file://` will not do.

## Why this document

`stm-node-5520` is the document the thickness-floor and pick-set measurements were made
against, so its behaviour at fit is already characterised. It is also the hard case: 464
strands, 274 segments, and a picture 108,982 units wide by 7,785 tall, which at fit puts a
15-unit band under a pixel.

## Segment membership had to come from the drawing, and is checked twice

`strand_grouping_survey.py` reads PGB's datasets rather than the SVGs "so node membership
is read, not inferred from geometry". That option does not exist here. This document *is*
one PGB **node** — minigraph `5520+` — resolved by the server into 274 **segments** that
PGB's dataset has no names for. Route identity at this scale can only come out of the
drawing.

The two words are [`CONTEXT.md`](../../../CONTEXT.md)'s and are not interchangeable: a
**node** is the graph vertex PGB draws in 3D, a **segment** is one stretch of genomic
sequence inside it, carried by every strand that crosses it. The server's SVG spells a
segment "node" too, which is the collision the rename exists to prevent — every set this file calls a route is a set of *segments*, and the one
node involved is `5520+` itself. Likewise the SVG's `trackID` names what PGB calls a
**strand**; *track* appears only where code quotes the server's document.

So it comes out of the drawing and is then checked against the drawing, the way
`parseSegmentBoxes.ts` checks a box's corners — every quantity read twice by independent
routes, and the two readings must agree:

| reading | source |
| --- | --- |
| carriers of segment *n* | the box's height: `15·carriers + 18`, one lane per haplotype plus a 9-unit corner at each end |
| carriers of segment *n* | each strand's top edge reconstructed (rects verbatim, beziers flattened) and sampled at the box's horizontal midpoint |

**They agree on 274 of 274 boxes.** Any disagreement refuses the document rather than
producing routes, because a dropped band is a haplotype silently filed under the wrong
route, and the rare routes — the ones the depth cue exists to bring forward — are where
one dropped band does the most damage. Band elements are conserved exactly through the
split: 40,442 in the source, 40,442 across the 112 route files, 464 distinct strands, none duplicated.

An early attempt that read only the rects matched 176 of 274. The misses were all 18-unit
boxes — the 1 bp variants — where the band is drawn as a bezier and never as a rect. That
is the failure the box-height check exists to catch, and it caught it.

## What the split shows

**It layers.** 112 route files stack back into the original picture, and any subset lifts
out cleanly — which is the whole result. Soloing a route recedes the other 111 rather than
brightening the one, which is spike story 30 applied at route granularity rather than to a
single strand.

**A route is the layer.** `route-2-solo.png` is 44 strands lifted out of 464 — one
itinerary, drawn at full strength while the other 111 routes recede.

## The wrong turn: strata

The first version of this bundled the 112 routes into five depth **strata** by carrier
count, following §03 of the essay — readers resolve five to seven shadow layers, so a
hundred and twelve planes is not a thing anyone can see, and the routes have to be
quantised before depth can be applied.

That reasoning is sound *for a depth cue* and it was wrong *here*. This experiment exists
to look at routes as separable objects, and bundling ninety-six of them onto one shelf put
them back into exactly the undifferentiated mat the split was made to break up. The
binning also could not have worked at this locus whatever the rule: **70 of the 112 routes
are carried by a single strand**, so any grouping by popularity must place all seventy on
one shelf. The bottom stratum could never have held fewer than seventy routes.

Strata are removed. When a depth cue is actually built, quantising is its problem to solve
and should be solved against a rendered picture, not baked into the file layout upstream
of it. The layers are one to one with the routes, and any grouping is a decision made
later, by whatever is doing the drawing.

## Two things the essay assumes that this window does not support

### 1 · Cardinality and divergence are not correlated here

§01 ranks *divergence from consensus* first and *route cardinality* second, and justifies
the second as "broadly correlated with divergence" — cheap, and close enough. Over these
112 routes it is not:

    spearman(cardinality, divergence from consensus) = +0.104,  p = 0.27

That is no relationship. The two orderings the essay treats as near-substitutes produce
materially different depth stacks on this document, so the choice between them is not the
cheap one §01 makes it out to be, and cardinality is not a stand-in for divergence that
happens to be free. Whether this holds at other loci is unmeasured — one window.

### 2 · Jaccard-to-consensus conflates *different* with *absent*

Five routes carrying 95 haplotypes — 20% of the window — sit at `J < 0.3`. None of them
is a divergent path. All five traverse between 5 and 12 of the 274 segments, against the
consensus route's 179: these are haplotypes that barely cross the window at all, and the
largest of them, route 1, carries **70 haplotypes**, more than any route but the
consensus.

Ordering depth by divergence brings that route to the very front and reads it as the most
unusual path in the picture. It is not an unusual path; it is an absent one. And the
opacity channel is already spent on exactly this distinction (§02: "spent — grey / absent
placement"), so depth would be asserting *unusual* over strands the map is simultaneously
greying as *not placed*, which is the same channel collision §01 refuses ancestry cluster
for.

This is a gap in the essay's §01, not a defect in the ranking: whichever ordering is
chosen, divergence has to be measured over the segments a haplotype could have traversed
rather than over the window's full segment set, or absence masquerades as divergence.

## What was not done

- **Nothing rendered in the viewer.** These are offline SVGs; `src/tubemap/` is untouched.
- **Depth was not evaluated as a cue.** The viewer can switch casing and a drop shadow on,
  and both do something, but whether they read as depth at these band widths is a
  perceptual question this experiment does not answer. §04 caveat 3 — depth surviving a
  pan — is likewise untested, and is a property of live route computation, which does not
  exist.
- **One document.** Every number above describes `stm-node-5520+`. The essay's Figure 2
  bins the whole `cici` locus at PGB-**node** granularity, which is a different and coarser
  object; these are not the same 21 routes and should not be compared to them directly.
