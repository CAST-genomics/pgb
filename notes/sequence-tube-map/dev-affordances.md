# Sequence Tube Map — Dev Affordances

**Date:** 2026-08-20
**Decisions:** [`docs/adr/0001-sequence-tube-map-panel.md`](../../docs/adr/0001-sequence-tube-map-panel.md)
and [`0002`](../../docs/adr/0002-webgl-band-renderer.md) are the normative records. This note
describes what exists and licenses nothing.

> **Where the issue numbers point.** Most of this was built in
> [`CAST-genomics/sequence-tube-map-spike`](https://github.com/CAST-genomics/sequence-tube-map-spike)
> before any of it reached PGB, so the numbers below split two ways and are marked
> accordingly:
>
> - **`spike #NN`** — an issue in the spike repo, where the work was actually done:
>   [#23](https://github.com/CAST-genomics/sequence-tube-map-spike/issues/23) (the API's
>   size ceiling, still open),
>   [#38](https://github.com/CAST-genomics/sequence-tube-map-spike/issues/38) (picking) and
>   [#39](https://github.com/CAST-genomics/sequence-tube-map-spike/issues/39) (the feeler).
> - **`pgb #NN`** — this repo, for work done after the migration:
>   [#99](https://github.com/CAST-genomics/pgb/pull/99) (the context menu, and the three
>   tall-document defects in §2).
>
> Worth marking rather than leaving to context: all three spike numbers *also* resolve
> against PGB's tracker, to unrelated merged PRs. A bare `#38` here would silently read as
> "Remove event bus self-consumption from widgets" — a plausible wrong answer rather than a
> dead link. Same convention as [ADR `0002`](../../docs/adr/0002-webgl-band-renderer.md),
> which reads bare `#NN` in the migrated text as spike issues.

Everything here is reachable without loading a dataset, without the API being up, and without
clicking through the 3D graph. None of it is discoverable from the running app — that is the
point of writing it down.

---

## 1. The two dev pages

Vite's dev server serves every HTML file under the project root, while the build starts from
its declared inputs, and `vite.config.js` declares none — so it takes Vite's default of
`index.html` alone. **Both pages exist under `npm run dev` and are absent from `dist/`.**

```bash
npm run dev     # http://localhost:5173
```

| Page | Mounts | Look at |
|---|---|---|
| `/dev/tubemap.html` | the viewer alone, `mountTubeMapSurface` | parsing, pan/zoom, the feeler, the navigator, segment boxes |
| `/dev/tubemap-panel.html` | the whole card, `mountTubeMapPanel` | drag, resize grip, fullscreen, reframe-on-resize |

They are two pages rather than one because the card and the surface are different things to
look at. Entry points: `src/devTubeMapRoute.ts`, `src/devTubeMapPanelRoute.ts` — both are
*hosts*, which is why they sit outside `src/tubemap/`.

### Query parameters

| Parameter | Page | Effect |
|---|---|---|
| `?url=` | both | open this document instead of the default fixture |
| `?pick` | `tubemap.html` only | mount the pick readout (§3) |

Both pages also fill a text field with the URL, so you can paste one in live rather than
reloading. On the panel page the field feeds an **Open** button; on the viewer page it is a
form you submit.

```bash
open 'http://localhost:5173/dev/tubemap.html'
open 'http://localhost:5173/dev/tubemap.html?pick'
open 'http://localhost:5173/dev/tubemap.html?url=/src/tubemap/__tests__/fixtures/stm-chr8-78771162-78771252.svg'
open 'http://localhost:5173/dev/tubemap-panel.html?pick'   # ← no effect, see §3
```

A live API URL works in either field. `buildSeqTubeMapURL()` in `src/pangenomeURL.ts` is what
composes one; the origin is `https://pangenome-api.ucsd.edu:8000`.

The panel page additionally parses `chrom/start/end/minigraphnode` out of whatever URL you
give it to build the card *header*, falling back to the fixture target for a bare fixture
path. The header is always written from the target, never from the URL.

---

## 2. The default document, and the second one

Two documents are committed, and they are the entire test corpus. They live under `src/`
rather than `public/` because `public/` is copied into `dist/` verbatim — a fixture parked
there would add 3.5 MB to every deploy for the sake of a page that is not in the build.
Vite's dev server serves them at their on-disk path anyway.

| Fixture | Shape | Why it exists |
|---|---|---|
| `stm-chr1-25331046-25331646.svg` | 35562 × 6325 — a **5.6:1 strip** | node 5519; the default on both pages, and where every parser test starts |
| `stm-chr8-78771162-78771252.svg` | 4717 × 7115 — **taller than wide** | node 141457; the shape the strip cannot catch |

The tall one is worth knowing about. Three defects fixed in pgb #99 were all the assumption
that every tube map is a strip — the navigator's height had no ceiling, `fitZoom` fitted the
width rather than the map — and **none of them could fail against the default fixture**. If you
touch framing, fitting, or the navigator's sizing, open the tall one before you believe
anything. Rationale in full: `src/tubemap/__tests__/fixture.ts`.

---

## 3. `?pick` — reading the pick pass out loud

`?pick` mounts a small readout in the surface's top-left corner. It reports the strand under
the cursor, what asking cost, and what the feeler's appearance-table write cost:

```
strand 201 · 3.50 ms · worst 37.90 ms · focus — · table 0.000 ms, worst 0.000 ms
```

Two things it does that nothing else does:

- It makes a pick happen on a **plain hover**. Without it, a pick only runs under the feeler.
- It states the cost rather than asserting it — which is how the pick answer was checked
  against the document by hand (spike #38) and how the highlight cost was established
  (spike #39).

The `table` figures stay at zero until you hold `Shift`; nothing writes the appearance table
without the feeler. The first pick is dramatically slower than the rest (~38 ms against a
~3.5 ms steady state) because the pick structures are cold — `worst` is sticky, so it will
keep showing that first number for the life of the page.

The flag is honoured **only on `/dev/tubemap.html`**. The panel route calls
`mountTubeMapPanel()` bare, and the panel has no `pickReadout` of its own to pass down — but
it does take a `mountSurface` injection seam, so a dev route that wanted the readout inside
the card could supply one without the panel growing an option:

```ts
mountTubeMapPanel({ mountSurface: c => mountTubeMapSurface(c, { pickReadout: true }) })
```

Implementation: `BandSurfaceOptions.pickReadout` in `src/tubemap/bandSurface.ts`.

---

## 4. Surface gestures

The on-screen hint is the whole list, but it is 11 px grey text in a corner:

- **drag** pans
- **swipe or wheel** zooms
- **hold `Shift`** to feel strands

The feeler is the one with rules worth knowing (`src/tubemap/feelerKey.ts`):

- It is **held, not toggled**, and it is claimed **only while the pointer is over the
  surface** — `Shift` over the 3D graph, or as half of a screen-capture shortcut, must not
  arm it and put its badge on screen.
- Key-up ends it **from anywhere**, deliberately. So does the window losing focus: a
  `Shift`-held window that goes to the background never reports the key coming up, and
  without that guard the map stays receded and unpannable with nothing saying why.
- **Pan and zoom yield to it; segment hit-testing does not.** A segment hovered under `Shift`
  shows its tooltip exactly as it does without the key. Holding the key *is* the act of
  isolating a strand, and a map that moved under a sweep would slide the strand out from
  under the cursor mid-gesture.
- A `feeler` badge fades in while it is active. If you see the badge, the mode is on.

Two things are easy to miss because they look like decoration:

- **Segment boxes** are real `<div>`s over the canvas, not geometry, and the one under the
  cursor shows a tooltip naming it (`src/tubemap/segmentOverlay.ts`).
- **The navigator** — the thumbnail bottom-left — is interactive. Click or drag inside it to
  move the view. A wheel over it is deliberately swallowed rather than zooming the map it is
  a picture of.

---

## 5. Panel affordances

On `/dev/tubemap-panel.html`, the card carries more than it looks like:

- **Drag by the header only.** The card carries `resize: both` and the browser paints that
  grip inside the card's own box, so a drag handle on the whole card would claim the grip's
  mousedown and the corner would drag the card instead of sizing it.
- **Resize grip** at the bottom-right corner. The map reframes on every resize — that is the
  behaviour the page exists to let you *look at* rather than assert.
- **Fullscreen button**, and the card is what goes fullscreen, not the body: the header is
  the only thing saying which node the map is of.
- **`Esc` leaves fullscreen**, as does the UA's own control and another element taking
  fullscreen away. All exits converge on one path that restores the four inline geometry
  properties the card had before.
- **Closing from fullscreen** leaves fullscreen first. Hiding a card that is the fullscreen
  element does not end fullscreen — the document stays in it with nothing painted.

---

## 6. Failure states you can produce on purpose

Point `?url=` at something that isn't there and you get a classified error in place of the
map, with the URL on a line of its own. The five kinds (`src/tubemap/loadFailure.ts`):

| Kind | Means | Where to look |
|---|---|---|
| `unreachable` | the bytes never arrived | network, URL, server |
| `slow` | accepted, unfinished inside `PATIENCE_MS` (90 s) | nowhere — this is the known server defect (spike #23) |
| `absent` | bytes arrived and are not a tube map | nothing is broken; there is no map for what you asked |
| `undrawable` | parsed, refused off the band grammar | ADR `0002`'s gate |
| `internal` | a bug here | here |

`slow` is kept apart from `unreachable` on purpose: nothing is wrong with the network, the
URL or the browser, and "could not be fetched" sends people to look at all three. The API's
error responses carry **no CORS headers**, so a genuine 500 reaches the browser as an opaque
network failure rather than a status — it will read as `unreachable`.

---

## 7. The real way in, and its gate

In the shipped app the viewer is reached by **right-clicking a node** in the 3D graph and
choosing **Sequence Tube Map** (`src/tubeMapMenuCommand.ts`). Right-click only; left-click
stays unclaimed.

An ineligible node gets the item **disabled with the reason shown**, never hidden — fifteen
of the forty-five nodes in `public/datasets/api-v3/cici.json` have no GRCh38 placement, and an
item that vanishes for a third of the graph is indistinguishable from a mis-click.

The gate is not optional and cannot move to the server: **the API answers an unknown
`minigraphnode` with 200 and a plausible-looking map of different data** — fallback palette,
no haplotype greying, no error. There is no way to detect that at request time.

---

## 8. What deliberately does not exist

The spike's harness had two more affordances, and they did not come across:

- **A node picker** driven by a catalogue of every eligible minigraph node. Its replacement
  is `tubeMapTargetForNode` on real dataset nodes.
- **`?fps`**, an FPS meter. It answered a question the spike closed.

`src/tubemap/__tests__/harnessIsGone.test.ts` **fails the build** if `main.ts`,
`frameMeter.ts` or `nodeCatalog.ts` reappear under `src/tubemap/`, or if anything imports
one. All three were ways of deciding *which* URL to open — a decision belonging to the host,
and the viewer's entire input surface is `open(url)`. A copy reappearing inside `src/tubemap/`
would be the viewer quietly growing a second input surface.

`?pick` is not an exception to that rule and never was: it does not decide a URL. It reads
the pass that has already run.
