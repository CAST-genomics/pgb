---
status: accepted
date: 2026-09-01
measured: 2026-09-01
---

# The band payload is read by a second parser into the same `ParsedMap`, and the document parser stays

ADR [`0002`](0002-webgl-band-renderer.md) accepted one large cost to ship the band renderer:
this viewer parses `d` attributes against a path grammar and rebuilds the picture from
inferred numbers, which couples us to an upstream *at the level of drawing primitives*. Its
2026-08-27 amendment said that cost was being retired at the source, and that **"the parser
changes at their increment C, when the binary format lands."**

It has landed —
[PangenomeAPI#24](https://github.com/CAST-genomics/PangenomeAPI/issues/24), specified in
[`docs/band-format.md`](https://github.com/CAST-genomics/PangenomeAPI/blob/main/docs/band-format.md).
This ADR records how this viewer reads it, and it exists because five of the decisions are
ones a reader of the code would otherwise assume the opposite of.

**Decision.** A second parser, `parseBandPayload.ts`, reads the payload into the **same
`ParsedMap`** the document parser produces. `parseBands.ts` stays. The format is chosen by an
explicit flag, never by a fallback. Direction is derived here rather than carried on the wire.
The whole-payload refusal survives, on four named conditions rather than on a grammar.

## What was measured

The five regions this repo already commits documents for, both encodings out of one render
(`perf/band-payload-sizes.mjs`, in the API repo):

| region | bands | SVG | band payload | ratio |
| --- | ---: | ---: | ---: | ---: |
| chr8:78,771,162-78,771,252 | 592 | 0.13 MB | 0.07 MB | 1.9× |
| chr1:25,331,046-25,331,646 | 8,089 | 2.25 MB | 0.28 MB | 8.1× |
| chr8:10,079,054-10,080,461 | 13,246 | 3.61 MB | 0.43 MB | 8.4× |
| chr1:25,301,271-25,309,238 (`5514+`) | 35,020 | 9.97 MB | 1.25 MB | 8.0× |
| chr1:25,331,646-25,335,796 (`5520+`) | 44,795 | 12.58 MB | 1.40 MB | 9.0× |

The regex pass is **deleted rather than shrunk**: the body's geometry column is a
`Float32Array` view over the bytes that arrived, which is the instance buffer.

## The five decisions

### 1. The same `ParsedMap`, so nothing downstream learns the encoding changed

`ParsedMap` was designed around a GPU instance buffer — six floats per band in document
order, parallel typed arrays, per-strand tables indexed by id — and the payload *is* one.
The shape was right before the format existed, so the new parser targets it exactly and
`bandSurface`, `bandPicker`, `strandAppearance`, `inversion`, `pclaiInset`, `strandLabel` and
`navigator` are untouched.

The alternative — a shape that suits the payload better — buys nothing this viewer wants and
spends a migration through 1,468 lines of `bandSurface.ts`. Anything the payload makes newly
*available* is a later decision, not this one.

### 2. Two parsers, because the server we talk to cannot speak this yet

The live server follows `release`; the band format is on `main`, roughly 60 commits ahead. A
viewer that could only read bands could not talk to the deployed server at all.

So `parseBands.ts` stays until the format is deployed **and** settled, and deleting it is a
separate decision taken later. This also keeps the SVG as the oracle the payload is checked
against, which is why
[their ADR 0001](https://github.com/CAST-genomics/PangenomeAPI/blob/main/docs/adr/0001-additive-band-format.md)
made the format additive rather than replacing the route.

### 3. A flag, never a fallback

The obvious design — request bands, fall back to the document on failure — is a trap on this
API specifically. `fetchDocument.ts` records the measurement: its failures arrive at
**33–100 s with no CORS headers**, indistinguishable in the browser from a network error,
against a `PATIENCE_MS` of 90 s. A fallback would therefore spend up to ninety seconds before
the second request began, on exactly the large nodes this whole effort exists for.

The viewer never probes, never retries, and never learns what the server supports. It is
told, by a flag, which defaults to the document until the format is deployed.

### 4. Direction is derived here, and the wire does not carry it

ADR [`0004`](0004-band-direction-and-inverted-routes.md) makes **band direction** this
viewer's reading of the picture — document-relative, always defined, carrying no biological
claim. Putting it on the wire would make the server the authority on it, which is a different
decision than the one 0004 took.

It is derivable without help: `kinds[i] == rect` → `FLAT`; otherwise `sign(x1 - x0)` gives
`LEFTWARD` or `RIGHTWARD`. That is exactly what the regex derives today, because the payload
preserves the order the layout drew the band in.

**The payload does not normalize and this parser must.** `ParsedMap` promises that `width` is
positive and `x0` is the left end; the payload's `x0` is simply the end drawn first, which
for a leftward band is the right one. This is live in production data rather than an
inversion-only case: chr8:10,079,054-10,080,461 draws **2,334 leftward curves** against 4,370
rightward and 6,542 flat.

### 5. The refusal survives, on four conditions rather than on a grammar

ADR `0002`'s whole-document refusal rests on the grammar covering every drawable — which is
what caught the chr7 fractional-colour failure. With numbers there is no grammar left to
violate, and the temptation is to conclude there is nothing left to refuse.

What survives: a `format` or `version` this build does not know; a non-empty `reversals`
(their [#52](https://github.com/CAST-genomics/PangenomeAPI/issues/52), which this viewer still
cannot draw); a strand table over 65,536 rows, which a `Uint16` cannot address; a body length
disagreeing with the header. The refusal was never about SVG — it was about not drawing half
a picture — and the failure card is identical whichever encoding failed, because from where
the researcher sits the encoding is not their business.

The error type is renamed with it: a payload that fails a version check is not a
non-conforming *document*.

## Two smaller things, recorded so they are not rediscovered

**The strand id is a row index**, not a `trackID`. The payload's `Uint16` indexes the
header's `strands` array; the two coincide today — ids are dense `0..n-1`, one row per strand
— and each row carries its own `id`. The parser indexes by row and asserts
`row === strands[row].id`, so the day a recolouring gives one strand two rows it fails loudly
rather than mixing two strands' colours.

**`pclaiScore` is an opaque string**, as it already is here: usually an integer spelled as
text (`"993"`), and spelled `"impainted"` on strands that *are* placed. Their spec said
`0.98` when this was written and
[has been corrected](https://github.com/CAST-genomics/PangenomeAPI/pull/67) — the first thing
that spec was used for was writing this parser against it, and it caught an error on the
first pass.

## Considered and rejected

**One parser, replacing `parseBands.ts`.** Cannot talk to the deployed server, and throws
away the oracle at the moment it is most useful. Revisit once the format is deployed and
settled; that is a decision with a date on it, not a permanent no.

**A capability probe or a fallback at fetch.** Rejected on the 90-second measurement above.
The cost lands precisely on the nodes that motivated the work.

**Direction as a byte on the wire.** Contradicts ADR `0004`'s split, and is unnecessary: the
drawn order already carries it.

**Reading the segment boxes' outline strings on the band route.**
[PangenomeAPI#66](https://github.com/CAST-genomics/PangenomeAPI/issues/66) replaces the
outline with the five numbers it encodes, which deletes this repo's outline grammar, its nine
tolerance-checked redundancy relations and its two spellings of one rectangle. Writing a
parser for a string that is about to stop being sent is work with a known expiry date.

## Consequences

- **ADR `0002`'s largest accepted cost is discharged**, not merely amended. Once this parser
  is the one that runs, this viewer no longer infers geometry from drawing commands.
- **Two parsers must not drift about where the origin is.** Both derive the frame from the
  same four viewBox numbers through one shared function; the extraction is
  [#144](https://github.com/CAST-genomics/pgb/issues/144) and lands before the parser does.
- **Float32 is the wire's one lossy step.** The layout computes in doubles and a coordinate
  arrives rounded — `138.71428571428573` becomes `138.7142791748047`. This costs nothing
  here: the instance buffer is float32, so the rounding would happen on this side anyway.
- **`reversal` and `band payload` enter the vocabulary**, and `reversal` is *not* **inverted
  haplotype**: it is the drawn shape a strand doubling back makes, of which a corner and a
  vertical connector are the parts. Two words a letter apart for different things, in a repo
  where both are live. `CONTEXT.md` is shared with the API repo and the entries land in both.
