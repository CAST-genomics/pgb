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
  histogram. Click a route — the row or its checkbox — to show or hide that layer;
  `all` / `none` for the whole set; casing, zoom and pan.

**Two colourings, one drawing.** The `colour` control swaps between the server's shipped
PCLAI colours and **allele frequency**, which discards the palette and paints each route
one colour by its **allele count** — `CONTEXT.md` §route, where a route is an allele of
the whole window and its strand count is that allele's count. ColorBrewer YlOrRd over
log₂ of the count, because the counts run 124, 70, 44, 11, 9 … with seventy routes tied
at 1, and a linear ramp puts 108 of the 112 in the bottom tenth of the scale. The ramp
also starts at 0.30 rather than 0: its low stops are near-white, and seventy of the
routes are singletons, so an unfloored scale would erase the singleton mat entirely.

**Absent strands are isolated from the scheme, not from the picture.** A strand with no
PCLAI placement (`pclaiX="None"`, and the document has no partial state — all of
`pclaiX`, `pclaiY`, `pclaiScore` are present together or absent together, over all 40,442
bands) keeps no allele colour and recedes to `#e8e8e8` instead — 1.23∶1 against the
ground, present but not competing. `unplaced` hides them outright, and works in both
colourings — it is the only control that removes data, so the two modes always draw the
same thing.

The tag is a **class applied at load**, not the `pclaiX="None"` attribute the document
carries. An HTML document case-folds attribute names inside a stylesheet, so a rule
written `[pclaiX="None"]` is stored as `[pclaix="None"]` and never matches the SVG's
attribute — and it fails *silently*, parsing fine and simply never applying. That cost
one wholly non-functional control and, worse, let the absent strands inside coloured
routes take their route's allele colour, which is the isolation rule inverted. Class
selectors are case-sensitive; attribute selectors in this position are not.

The scale's domain is the routes that have carriers to colour. **Seven routes are
entirely unplaced**, and they hold 97 of the 99 absent strands — so the grey set and the
"absent, not divergent" routes of finding #2 below are very nearly the same set. Route 1,
70 haplotypes, is one of them. Excluding them puts route 0's 124 at the top of the ramp
and route 2's 44 at the second stop, rather than letting route 1's 70 calibrate a scale
it can never appear on. A route's allele count stays its full strand count; excluding a
route is not subtracting its strands.

The 112 route files are ~14 MB and **derived**, so they are git-ignored;
`manifest.json` and `segments.svg` are small and are kept, because the manifest *is* the
result. The script, this file
and the viewer are committed; run the command above to regenerate the rest. To open the
viewer, serve the repo root (`python3 -m http.server`) and visit this directory — it
fetches `manifest.json`, so `file://` will not do.

**Route numbers are reproducible as of 2026-08-26, and were not before.** `routes_of`
ordered by carrier count then breadth and stopped there, but 87 of the 112 routes share
both — fifteen of them are one strand over 179 segments — so those ties fell to the
insertion order of a dict built by iterating a set of id *strings*. Python randomizes
string hashing per process, so the same document numbered its routes differently on every
run: identical routes, identical members, reshuffled labels, and a 300-line diff in the
file this note calls the result. Ties now break on the sorted member ids, which are a
property of the document. Numbering that predates the fix does not survive it — routes
0–10 are unaffected, since their carrier counts are unique, and everything above 10 was
renumbered once. The three routes this file names are all inside that stable band.

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
out cleanly — which is the whole result. Showing one layer and hiding the rest is the
whole interaction, and it needs no mode.

**A route is the layer.** `route-2-solo.png` is 44 strands lifted out of 464 — one
itinerary at full strength against a ghost of the other 111.

The picture was made with a **soloing** control that has since been removed, so it can no
longer be reproduced from this viewer. Solo dimmed the other layers to a tenth rather than
hiding them, which put the route in the context of the pile it runs through; it was cut
because two overlapping visibility mechanisms in one list read as redundant, and the
audio-mixing word promised a muting it never did. The checkboxes are the one mechanism
now. If the ghost turns out to be worth having, it comes back as a property of the
*hidden* state — hidden layers drawn at a tenth rather than not at all — not as a second
control beside the first.

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
- **Depth was not evaluated as a cue.** The viewer can switch casing on, and it does
  something, but whether it reads as depth at these band widths is a perceptual question
  this experiment does not answer. A drop-shadow toggle was tried and removed: at these
  band widths it was visually weak and did no work. §04 caveat 3 — depth surviving a
  pan — is likewise untested, and is a property of live route computation, which does not
  exist.
- **One document.** Every number above describes `stm-node-5520+`. The essay's Figure 2
  bins the whole `cici` locus at PGB-**node** granularity, which is a different and coarser
  object; these are not the same 21 routes and should not be compared to them directly.
