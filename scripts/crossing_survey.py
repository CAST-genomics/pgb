#!/usr/bin/env python3
"""
Where do strands cross, and does the document say which one is on top?

Strategy B in `docs/DISAMBIGUATING-STRANDS.md` rests on the claim that a crossing is a
depth relation the renderer throws away. This script tests that claim against the tube map
SVGs themselves rather than against PGB's datasets: it finds every crossing by geometry,
asks how visible each one is, and asks what the document's paint order actually asserts
about them.

    python3 scripts/crossing_survey.py public/*.pretty.svg

Reported per document:

  paint order   how many contiguous same-strand runs the drawables fall into. One run per
                strand would mean paint order is a per-strand z-order; anything more means
                it is not.
  crossings     pairs of strands whose vertical order swaps, found by walking a fine column
                grid and counting adjacent transpositions. Split by whether the two strands
                are the same colour, indistinguishable (<= 8/255 on every channel), or
                plainly different.
  overlap       how often a band shares its 15-unit row with another band, split by whether
                the band is running flat or climbing. This is where interpenetration is,
                and averaging over the whole map hides it.
  sheets        runs of vertically adjacent strands whose colours fall in one 24/255 bucket
                — the slabs the eye reads as one material.
  order decay   agreement between the vertical ordering at two columns as a function of how
                far apart they are, 1.0 identical and 0.0 unrelated. Says over what window
                a fixed z assignment would be honest.
  layout        agreement between vertical position and pclaiX / pclaiY / pclaiScore. Near
                zero means the y axis carries no signal and reordering costs nothing.

Everything here is geometry over one document. Nothing is read from PGB.
"""

import random
import re
import statistics as st
import sys
from collections import Counter, defaultdict

NUMBER = r'(-?\d+(?:\.\d+)?(?:e-?\d+)?)'
RECT = re.compile(r'<rect x="%s" y="%s" width="%s" height="%s"' % ((NUMBER,) * 4))
PATH = re.compile(r'<path d="M %s %s C %s %s %s %s %s %s V %s' % ((NUMBER,) * 9))

COLUMNS = 4000
SHEET_BUCKET = 24        # channel width below which two colours read as one material
INDISTINGUISHABLE = 8    # channel difference at or below which two strands look identical
THICKNESS = 15


def read(path):
    """Bands as (strandId, x0, x1, yStart, yEnd) in document order, plus per-strand metadata."""
    text = open(path).read()
    end = text.find('<g class="node"')
    track = text[:end] if -1 != end else text

    bands = []
    meta = {}

    for element in re.finditer(r'<(?:rect|path)\b[^>]*?trackID="(\d+)"[^>]*?>', track):
        tag = element.group(0)
        strand = int(element.group(1))

        rect = RECT.match(tag)

        if rect:
            x0, y0, width, _ = (float(v) for v in rect.groups())
            bands.append((strand, x0, x0 + width, y0, y0))
        else:
            path_match = PATH.match(tag)

            if not path_match:
                continue

            v = [float(value) for value in path_match.groups()]
            bands.append((strand, v[0], v[6], v[1], v[7]))

        if strand not in meta:
            meta[strand] = dict(re.findall(r'(\w+)="([^"]*)"', tag))

    return bands, meta


def columns(bands):
    """Vertical position of every strand present, at each of COLUMNS evenly spaced slices."""
    x0 = min(band[1] for band in bands)
    x1 = max(band[2] for band in bands)
    span = x1 - x0
    slices = [dict() for _ in range(COLUMNS)]
    climbing = [dict() for _ in range(COLUMNS)]

    for strand, bx0, bx1, y0, y1 in bands:
        first = max(0, int((bx0 - x0) / span * COLUMNS) - 1)
        last = min(COLUMNS - 1, int((bx1 - x0) / span * COLUMNS) + 1)

        for index in range(first, last + 1):
            x = x0 + span * (index + 0.5) / COLUMNS

            if bx0 <= x <= bx1:
                t = 0.0 if bx1 == bx0 else (x - bx0) / (bx1 - bx0)
                slices[index][strand] = y0 + (y1 - y0) * t
                climbing[index][strand] = abs(y1 - y0) > THICKNESS

    return slices, climbing


def rgb_of(attributes):
    colour = attributes.get('color')
    return tuple(int(v) for v in re.findall(r'\d+', colour)) if colour else None


def distance(a, b):
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]), abs(a[2] - b[2]))


def paint_order(bands):
    runs = 1

    for i in range(1, len(bands)):
        if bands[i][0] != bands[i - 1][0]:
            runs += 1

    return runs


def crossings(slices, colours):
    """Every adjacent transposition between consecutive slices is one crossing event."""
    events = Counter()
    previous = None

    for slice_ in slices:
        order = [strand for strand, _ in sorted(slice_.items(), key=lambda item: item[1])]
        position = {strand: i for i, strand in enumerate(order)}

        if previous is not None:
            for i in range(len(order) - 1):
                above, below = order[i], order[i + 1]

                if above in previous and below in previous and previous[above] > previous[below]:
                    events[(min(above, below), max(above, below))] += 1

        previous = position

    total = sum(events.values())
    identical = 0
    close = 0

    for (a, b), count in events.items():
        if a in colours and b in colours:
            if colours[a] == colours[b]:
                identical += count
            if distance(colours[a], colours[b]) <= INDISTINGUISHABLE:
                close += count

    return total, len(events), identical, close


def overlap(slices, climbing):
    """How often a band shares its row, split by whether it is climbing or running flat."""
    counts = {True: [0, 0], False: [0, 0]}

    for index, slice_ in enumerate(slices):
        rows = defaultdict(list)

        for strand, y in slice_.items():
            rows[round(y / THICKNESS)].append(strand)

        for members in rows.values():
            for strand in members:
                bucket = counts[climbing[index][strand]]
                bucket[0] += 1
                bucket[1] += 1 if 1 < len(members) else 0

    return counts


def sheets(slices, colours):
    """Runs of vertically adjacent strands whose colours fall in one SHEET_BUCKET cell."""
    family = {
        strand: tuple(channel // SHEET_BUCKET for channel in colour)
        for strand, colour in colours.items()
    }
    thickest = []
    substantial = []

    for slice_ in slices:
        order = [strand for strand, _ in sorted(slice_.items(), key=lambda item: item[1])]
        blocks = []
        run = 1

        for i in range(1, len(order)):
            if family.get(order[i]) == family.get(order[i - 1]):
                run += 1
            else:
                blocks.append(run)
                run = 1

        blocks.append(run)
        thickest.append(max(blocks))
        substantial.append(sum(1 for block in blocks if 10 <= block))

    return len(set(family.values())), thickest, substantial


def agreement(a, b, draws=3000):
    """Kendall tau over shared strands: 1.0 the same ordering, 0.0 unrelated."""
    shared = list(set(a) & set(b))

    if 10 > len(shared):
        return None

    concordant = discordant = 0

    for _ in range(draws):
        i, j = random.sample(shared, 2)
        sign = (a[i] - a[j]) * (b[i] - b[j])

        if 0 < sign:
            concordant += 1
        elif 0 > sign:
            discordant += 1

    return (concordant - discordant) / max(1, concordant + discordant)


def numeric(attributes, key):
    try:
        return float(attributes.get(key))
    except (TypeError, ValueError):
        return None


def survey(path):
    bands, meta = read(path)
    colours = {strand: rgb_of(a) for strand, a in meta.items() if rgb_of(a)}
    slices, climbing = columns(bands)
    strands = len({band[0] for band in bands})

    print(f'\n{path}')
    print(f'  {len(bands)} bands, {strands} strands, {len(set(colours.values()))} distinct colours')

    runs = paint_order(bands)
    print(f'  paint order: {runs} contiguous same-strand runs '
          f'({len(bands) / runs:.1f} bands each) — {"is" if runs == strands else "is not"} a per-strand z-order')

    total, pairs, identical, close = crossings(slices, colours)
    print(f'  crossings: {total} events among {pairs} distinct strand pairs')
    print(f'    same colour exactly:                {identical:6d}  {100 * identical / total:4.0f}%')
    print(f'    indistinguishable (<={INDISTINGUISHABLE}/255):        {close:6d}  {100 * close / total:4.0f}%')
    print(f'    plainly different colour:           {total - close:6d}  {100 * (total - close) / total:4.0f}%')

    counts = overlap(slices, climbing)
    for is_climbing, label in ((False, 'flat    '), (True, 'climbing')):
        seen, shared = counts[is_climbing]
        print(f'  {label} bands sharing their row: {100 * shared / max(seen, 1):5.1f}%')

    families, thickest, substantial = sheets(slices, colours)
    print(f'  sheets: {len(set(colours.values()))} colours collapse to {families} families at {SHEET_BUCKET}/255')
    print(f'    thickest sheet in a slice: median {st.median(thickest):.0f} strands, max {max(thickest)}')
    print(f'    sheets >=10 strands thick, per slice: median {st.median(substantial):.0f}, max {max(substantial)}')

    print('  vertical order agreement by separation:')
    for gap in (COLUMNS // 400, COLUMNS // 100, COLUMNS // 25, COLUMNS // 6, COLUMNS // 2, COLUMNS - 1):
        step = max(1, (COLUMNS - gap) // 30)
        values = [
            value for value in
            (agreement(slices[i], slices[i + gap]) for i in range(0, COLUMNS - gap, step))
            if value is not None
        ]
        print(f'    {100 * gap / COLUMNS:5.1f}% of the strip: {st.median(values):.3f}')

    for key in ('pclaiX', 'pclaiY', 'pclaiScore'):
        values = {s: numeric(a, key) for s, a in meta.items() if numeric(a, key) is not None}
        taus = []

        for i in range(0, COLUMNS, COLUMNS // 20):
            present = {s: y for s, y in slices[i].items() if s in values}
            taus.append(agreement(present, {s: values[s] for s in present}) or 0.0)

        print(f'  vertical position vs {key}: {st.median(taus):+.3f}')


if __name__ == '__main__':
    random.seed(7)

    if 2 > len(sys.argv):
        print(__doc__)
        sys.exit(1)

    for argument in sys.argv[1:]:
        survey(argument)
