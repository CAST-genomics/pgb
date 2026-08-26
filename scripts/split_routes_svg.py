#!/usr/bin/env python3
"""Split one sequence tube map document into one SVG per route.

`depth-cue-for-route-disambiguation.html` argues that the route is the only object in
this picture that can carry a globally consistent depth order: a ribbon's vertical
position is reordered at every branch by the layout, but a route is a set of segments,
invariant over the window, so one scalar `z` per route is well-defined. That argument
has never been looked at. This script makes it lookable.

**Route identity is `(segments, direction)` as of 2026-08-25** — ADR `0004`. A route is
still a *set* of segments rather than an ordered traversal, for exactly the invariance
reason above, but the band direction those segments were walked in is part of the key: a
route and its inverted twin cross the same segments and are not the same assertion. This
script still keys on the set alone. It produces identical output on every document
committed here — all four have zero right-to-left bands — and must be given the second
half of the key before it is run on a document containing an inversion.

**One route, one file.** The server's document is taken apart along route boundaries and
each route written as its own SVG — same viewBox, transparent everywhere it is not
drawing — so the family stacks back up in any order, with any per-layer treatment, and
any one of them can be lifted out on its own.

Nothing here bins or groups routes. An earlier version bundled them into five depth
"strata" borrowed from the essay's §03, which put ninety-six of the hundred and twelve
routes on one shelf and hid exactly the thing the split exists to show. A route is the
object; the layer is the object; they are one to one.

    python3 scripts/split_routes_svg.py \
        src/tubemap/__tests__/fixtures/stm-node-5520-chr1-25331646-25335796.svg \
        --output notes/sequence-tube-map/route-layers

## Node membership is read, not inferred

`strand_grouping_survey.py` reads PGB's own datasets rather than the tube map SVGs
"so node membership is read, not inferred from geometry". That option is not available
here: the document for minigraph node `5520+` resolves that one PGB **node** into 274
**segments**, and PGB's dataset knows none of them. Membership has to come out of the
drawing.

`CONTEXT.md` is the authority on those two words and they are not interchangeable. A
**node** is the graph vertex PGB draws in 3D — here, exactly one, `5520+`. A **segment**
is one of the sequence boxes found inside it, which the server's SVG also spells "node"
(`<g class="node">`, `<path id=...>`) and which PGB renames precisely so the two scales
stay distinct. Everything this script groups is a set of *segments*. Likewise the SVG's
`trackID` names what PGB calls a **strand**; `track` survives below only inside the
patterns that quote the server's document.

So it is taken from the drawing and then *checked against the drawing*, in the manner
`parseSegmentBoxes.ts` checks a box's corners: every quantity is read twice by
independent routes and the two readings have to agree.

  - A segment box's height is `15·carriers + 18` — one 15-unit lane per haplotype that
    traverses the segment, plus the 9-unit corner radius at each end. So the box states
    own carrier count, in a number nothing else in this script touches.
  - Independently, each strand's top edge is reconstructed — rects verbatim, beziers
    flattened — and sampled at the box's horizontal midpoint. A strand whose lane at that
    x lies inside the box's lane range traverses the segment.

The two counts must agree for **every** box or the document is refused. On
`stm-node-5520` they agree 274 of 274. That is the whole warrant for the routes below;
without it this would be geometry guessing, which is exactly what the survey warned off.

## Refusal

Anything the grammar cannot read refuses the whole document, following
`parseSegmentBoxes.ts`. A silently dropped band is a haplotype quietly assigned to the
wrong route, and the rare routes — the ones the depth cue exists to bring forward — are
where a single dropped band does the most damage.
"""

from __future__ import annotations

import argparse
import collections
import json
import re
from pathlib import Path

# --- the document grammar, as much of it as splitting needs -------------------

NUM = r'-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?'
# The server spells a segment "node"; this quotes its document, so it keeps that spelling.
SEGMENT_LAYER = '<g class="node"'

BAND = re.compile(r'<(rect|path)\b[^>]*?trackID="(\d+)"[^>]*?>(?:</\1>|<title>.*?</title></\1>)?')
RECT = re.compile(r'x="(' + NUM + r')"\s+y="(' + NUM + r')"\s+width="(' + NUM + r')"')
PATH_D = re.compile(r'\bd="([^"]+)"')
BOX = re.compile(r'<path id="(\d+)" d="([^"]+)"')
SVG_OPEN = re.compile(r'<svg\b[^>]*>')
VIEWBOX = re.compile(r'viewBox="([^"]+)"')
TOKEN = re.compile(r'([MCLVHZ])|(' + NUM + r')')

LANE = 15.0          # one haplotype's band thickness, in document units
RADIUS = 9.0         # a segment box's corner radius; the box overhangs the lanes by this
FLATTEN = 32         # samples per cubic; a band is 15 units thick, so this is far finer
SLACK = 0.6          # lane-containment tolerance, well under a lane and over any rounding


class NonConformingDocument(ValueError):
    """The document is not shaped the way this script needs it to be."""


# --- geometry ----------------------------------------------------------------

def flatten_cubic(p0, p1, p2, p3, n=FLATTEN):
    """A cubic bezier as a polyline, excluding its start point."""
    out = []
    for k in range(1, n + 1):
        u = k / n
        v = 1 - u
        out.append((v**3 * p0[0] + 3*v*v*u * p1[0] + 3*v*u*u * p2[0] + u**3 * p3[0],
                    v**3 * p0[1] + 3*v*v*u * p1[1] + 3*v*u*u * p2[1] + u**3 * p3[1]))
    return out


def top_edge(d: str) -> list[list[tuple[float, float]]]:
    """A band path's top edge, as polylines left to right.

    A band is drawn as a closed ribbon: the top edge rightwards, `V` down one lane, the
    bottom edge back leftwards, `Z`. Only the top edge carries the lane, so collection
    stops at the first `V` of each subpath and resumes at the next `M`.
    """
    tokens = [a or b for a, b in TOKEN.findall(d)]
    polylines, poly, cursor, collecting = [], [], None, False
    i = 0
    while i < len(tokens):
        command = tokens[i]
        if command == 'M':
            if poly:
                polylines.append(poly)
            cursor = (float(tokens[i+1]), float(tokens[i+2]))
            poly, collecting, i = [cursor], True, i + 3
        elif command == 'L':
            cursor = (float(tokens[i+1]), float(tokens[i+2]))
            if collecting:
                poly.append(cursor)
            i += 3
        elif command == 'C':
            c1 = (float(tokens[i+1]), float(tokens[i+2]))
            c2 = (float(tokens[i+3]), float(tokens[i+4]))
            end = (float(tokens[i+5]), float(tokens[i+6]))
            if collecting:
                poly += flatten_cubic(cursor, c1, c2, end)
            cursor, i = end, i + 7
        elif command == 'V':
            cursor, collecting, i = (cursor[0], float(tokens[i+1])), False, i + 2
        elif command == 'H':
            cursor, collecting, i = (float(tokens[i+1]), cursor[1]), False, i + 2
        elif command == 'Z':
            if poly:
                polylines.append(poly)
            poly, collecting, i = [], False, i + 1
        else:
            raise NonConformingDocument(f"unhandled path command {command!r}")
    if poly:
        polylines.append(poly)
    return polylines


def lane_at(polylines, x):
    """The strand's lane top at `x`, or None where the strand is not drawn."""
    best = None
    for poly in polylines:
        if x < poly[0][0] - 1e-9 or x > poly[-1][0] + 1e-9:
            continue
        for a, b in zip(poly, poly[1:]):
            if a[0] - 1e-9 <= x <= b[0] + 1e-9:
                y = a[1] if b[0] == a[0] else a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])
                best = y if best is None else min(best, y)
    return best


# --- reading the document ----------------------------------------------------

def read(path: Path):
    """-> (svg open tag, viewBox, {strand: [raw markup]}, {strand: polylines}, {segment: box})"""
    text = path.read_text()
    split = text.find(SEGMENT_LAYER)
    if split < 0:
        raise NonConformingDocument(f"no {SEGMENT_LAYER!r} layer; not a tube map document")
    bands, segment_layer = text[:split], text[split:]

    opening = SVG_OPEN.search(bands)
    viewbox = VIEWBOX.search(opening.group(0) if opening else '')
    if opening is None or viewbox is None:
        raise NonConformingDocument("no <svg> element with a viewBox")

    markup = collections.defaultdict(list)
    edges = collections.defaultdict(list)
    for match in BAND.finditer(bands):
        tag, strand, element = match.group(1), match.group(2), match.group(0)
        markup[strand].append(element)
        if tag == 'rect':
            r = RECT.search(element)
            if r is None:
                raise NonConformingDocument(f"band rect without x/y/width: {element[:120]}")
            x, y, w = float(r.group(1)), float(r.group(2)), float(r.group(3))
            edges[strand].append([(x, y), (x + w, y)])
        else:
            d = PATH_D.search(element)
            if d is None:
                raise NonConformingDocument(f"band path without d: {element[:120]}")
            edges[strand] += top_edge(d.group(1))
    if not markup:
        raise NonConformingDocument("no banded elements carrying a trackID")

    boxes = {}
    for match in BOX.finditer(segment_layer):
        numbers = [float(t) for t in re.findall(NUM, match.group(2))]
        xs, ys = numbers[0::2], numbers[1::2]
        boxes[match.group(1)] = (min(xs), max(xs), min(ys), max(ys))
    if not boxes:
        raise NonConformingDocument("no segment boxes in the segment layer")

    for polylines in edges.values():
        polylines.sort(key=lambda p: p[0][0])
    return opening.group(0), viewbox.group(1), markup, edges, boxes


def carriers_of(boxes, edges):
    """{segment: {strand}}, cross-checked against every box's own implied carrier count."""
    carriers = {}
    disagreements = []
    for segment, (x0, x1, y0, y1) in boxes.items():
        midpoint = (x0 + x1) / 2
        low, high = y0 + RADIUS, y1 - RADIUS
        found = set()
        for strand, polylines in edges.items():
            lane = lane_at(polylines, midpoint)
            if lane is not None and lane >= low - SLACK and lane + LANE <= high + SLACK:
                found.add(strand)
        implied = round((y1 - y0 - 2 * RADIUS) / LANE)
        if implied != len(found):
            disagreements.append((segment, implied, len(found)))
        carriers[segment] = found
    if disagreements:
        shown = ', '.join(f"{n}: box says {i}, geometry says {g}" for n, i, g in disagreements[:6])
        raise NonConformingDocument(
            f"{len(disagreements)} of {len(boxes)} segment boxes disagree with the bands "
            f"drawn inside them ({shown}). Membership is not readable from this document.")
    return carriers


# --- routes ------------------------------------------------------------------

def routes_of(carriers, edges):
    """Routes, most-carried first: [(segment frozenset, [strand], jaccard to consensus)]."""
    traversed = collections.defaultdict(set)
    for segment, strands in carriers.items():
        for strand in strands:
            traversed[strand].add(segment)
    for strand in edges:
        traversed.setdefault(strand, set())

    grouped = collections.defaultdict(list)
    for strand, segments in traversed.items():
        grouped[frozenset(segments)].append(strand)
    # Carrier count, then breadth, then the member ids. That third key is what makes
    # the numbering reproducible: 87 of this document's 112 routes share both of the
    # first two -- fifteen of them are one strand over 179 segments -- and a sort that
    # stopped there would leave those ties to the insertion order of `grouped`, which
    # traces back to iterating a set of id *strings* in `carriers_of`. Python randomizes
    # string hashing per process, so the same document numbered its routes differently
    # on every run, and a route number is the identity everything here cites: the file
    # name, the viewer's list, this repo's prose. The member ids are a fixed property of
    # the document, so ties now break the same way forever.
    ordered = sorted(grouped.items(),
                     key=lambda kv: (-len(kv[1]), -len(kv[0]), sorted(map(int, kv[1]))))

    consensus = ordered[0][0]
    out = []
    for segments, strands in ordered:
        union = len(segments | consensus)
        out.append((segments, sorted(strands, key=int),
                    len(segments & consensus) / union if union else 1.0))
    return out


# --- writing -----------------------------------------------------------------

def write_layer(path, opening, elements, note):
    path.write_text(
        f"{opening}\n<!-- {note} -->\n<g class=\"track\">"
        + ''.join(elements)
        + "</g>\n</svg>\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("document", type=Path, help="a sequence tube map SVG")
    parser.add_argument("--output", type=Path, required=True, help="directory to write into")
    args = parser.parse_args()

    opening, viewbox, markup, edges, boxes = read(args.document)
    carriers = carriers_of(boxes, edges)
    routes = routes_of(carriers, edges)

    out = args.output
    (out / "routes").mkdir(parents=True, exist_ok=True)

    manifest = {
        "generatedBy": "scripts/split_routes_svg.py",
        "document": str(args.document),
        "viewBox": viewbox,
        "strands": len(markup),
        "segments": len(boxes),
        "routes": [],
    }

    # Biggest first, so route 0 is the commonest itinerary. Stacked in this order the
    # commonest sits at the back and the rarest in front; reverse it and you get the
    # opposite. Nothing here decides that — the order is just the file order.
    for index, (segments, strands, jaccard) in enumerate(routes):
        name = f"route-{index:03d}.svg"
        write_layer(out / "routes" / name, opening,
                    [e for s in strands for e in markup[s]],
                    f"route {index} of {len(routes)} | {len(strands)} strands | "
                    f"{len(segments)} segments | jaccard to consensus {jaccard:.3f}")
        manifest["routes"].append({
            "route": index, "file": f"routes/{name}", "strands": len(strands),
            "segments": len(segments), "jaccardToConsensus": round(jaccard, 4),
            "members": strands,
        })

    document = args.document.read_text()
    (out / "segments.svg").write_text(f"{opening}\n{document[document.find(SEGMENT_LAYER):]}")
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

    print(f"{len(markup)} strands, {len(boxes)} segments, "
          f"{len(routes)} routes -> {len(routes)} layers in {out}")


if __name__ == "__main__":
    main()
