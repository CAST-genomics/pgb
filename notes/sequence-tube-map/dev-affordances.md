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

## 1. The three dev pages

Vite's dev server serves every HTML file under the project root, while the build starts from
its declared inputs, and `vite.config.js` declares none — so it takes Vite's default of
`index.html` alone. **All three pages exist under `npm run dev` and are absent from `dist/`.**

```bash
npm run dev     # http://localhost:5173
```

| Page | Mounts | Look at |
|---|---|---|
| `/dev/tubemap.html` | the viewer alone, `mountTubeMapSurface` | parsing, pan/zoom, the feeler, the navigator, segment boxes |
| `/dev/tubemap-panel.html` | the whole card, `mountTubeMapPanel` | drag, resize grip, fullscreen, reframe-on-resize |
| `/dev/tubemap-app.html` | the same card, under `index.html`'s cascade | anything that is a *box*: layout under Bootstrap's reset |

The first two are separate because the card and the surface are different things to look at.
Entry points: `src/devTubeMapRoute.ts`, `src/devTubeMapPanelRoute.ts` — both are *hosts*,
which is why they sit outside `src/tubemap/`.

The third shares the panel's entry point and differs from `/dev/tubemap-panel.html` in its
`<link>` tags and nothing else: it adds the two Bootstrap stylesheets `index.html` loads.
That is deliberate to the point of being the whole design — a divergence in the page chrome
would make the difference between the two say something about the page rather than about the
cascade, which is why what they share lives in `dev/devPage.css`. See §6.

### Query parameters

| Parameter | Page | Effect |
|---|---|---|
| `?url=` | all three | open this document instead of the default fixture |
| `?pick` | all three | mount the pick readout (§3) |
| `?floor=` | `tubemap.html` only | the feeler's thickness floor in css px; `0` switches it off (§3.1) |
| `?samples=` | `tubemap.html` only | how finely the pick pass samples the cursor's pixel; `1` is the pre-#120 target (§3.2) |

All three pages also fill a text field with the URL, so you can paste one in live rather than
reloading. On the two panel pages the field feeds an **Open** button; on the viewer page it is
a form you submit.

```bash
open 'http://localhost:5173/dev/tubemap.html'
open 'http://localhost:5173/dev/tubemap.html?pick'
open 'http://localhost:5173/dev/tubemap.html?url=/src/tubemap/__tests__/fixtures/stm-chr8-78771162-78771252.svg'
open 'http://localhost:5173/dev/tubemap-panel.html?pick'
open 'http://localhost:5173/dev/tubemap-app.html?pick'    # the same, under Bootstrap
```

A live API URL works in either field. `buildSeqTubeMapURL()` in `src/pangenomeURL.ts` is what
composes one; the origin is `https://pangenome-api.ucsd.edu:8000`.

#### An API URL must be percent-encoded to survive `?url=`

An API URL carries its own `?` and `&`, and `?url=` is itself a query parameter, so pasting one
in raw puts two `?` in one address. The browser treats the first as the start of *this page's*
query string and every `&` after it as a separator, so `URLSearchParams` takes the inner URL's
parameters as the dev page's own and the viewer is handed a truncated document:

```
http://localhost:5173/dev/tubemap.html?url=https://pangenome-api.ucsd.edu:8000/seqtubemap?chrom=chr7&start=55067258&end=55068164&version=v2&minigraphnode=119565

  url             = https://pangenome-api.ucsd.edu:8000/seqtubemap?chrom=chr7   ← all the viewer gets
  start           = 55067258      ← parsed as the dev page's, and ignored
  end             = 55068164
  version         = v2
  minigraphnode   = 119565
```

**Nothing reports this.** The request that goes out is `/seqtubemap?chrom=chr7` — chromosome
only, no range and no node — and the API answers it with **200 and 1.7 MB of valid tube map**
for a different region, in its default ColorBrewer *Blues* ramp with `pclaiX="None"` on every
track. It is §8's silent-fallback trap reached by a dropped parameter rather than a wrong one,
and it looks like a rendering bug rather than a malformed address.

**A blue map is the tell.** The viewer never picks colours — `strandAppearance.ts` takes each
strand's RGB from the document and never writes it again — so the palette on screen is the one
the API sent. A PCLAI document is pastel teal, orange and magenta; blues with an empty PCLAI
inset is the API's fallback, which means the request did not carry what you thought it did.

Encode the inner URL:

```bash
python3 -c "import urllib.parse,sys; print('http://localhost:5173/dev/tubemap.html?url=' + urllib.parse.quote(sys.argv[1], safe=''))" \
  'https://pangenome-api.ucsd.edu:8000/seqtubemap?chrom=chr7&start=55067258&end=55068164&version=v2&pathnumoption=normal&nodewidthoption=compressed&minigraphnode=119565'
```

Or avoid the collision entirely — open the page bare and paste the raw URL into its **text
field**, which takes the whole string verbatim because there is no query string for it to
collide with. That is the better habit for testing by hand; `?url=` earns its keep when a run
has to be reproducible or scripted.

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

`?pick` mounts a small readout in the surface's top-left corner. It reports the strands under
the cursor, what asking cost, and what the feeler's appearance-table write cost:

```
strand 224 251 253 87 159 360 · 3.50 ms · worst 37.90 ms · focus 159 · table 0.000 ms, worst 0.000 ms
```

**The first field is a set, in the order the strands are stacked on screen** (pgb #120) — at
fit on `5520+` it is six or seven ids, and it collapses to one as you magnify. `focus` is the
single strand the feeler has lit out of that set, which is the one nearest the cursor.

In a document containing an inversion the lit strand's direction follows it in parentheses —
`focus 158 (inverted)` (pgb #132) — which is how the reading beside a name in the label can be
checked against a strand id by hand. There is no parenthesis in the other four documents:
they have no inversion, so nothing is said about direction anywhere.

Hold `Shift` and all three panels answer with that set at once: the map lights the one strand,
the label lists the names with a colour swatch each, and the PCLAI inset marks every placed
member of the set while the rest of the cloud greys out.
`scripts/verify_pick_set_cloud.mjs` checks that the label and the cloud never report different
counts, and
[`measurements/2026-08-21-the-pick-set-in-the-cloud.md`](./measurements/2026-08-21-the-pick-set-in-the-cloud.md)
records why each of them is drawn the way it is.

Two things it does that nothing else does:

- It makes a pick happen on a **plain hover**. Without it, a pick only runs under the feeler.
- It states the cost rather than asserting it — which is how the pick answer was checked
  against the document by hand (spike #38) and how the highlight cost was established
  (spike #39).

The `table` figures stay at zero until you hold `Shift`; nothing writes the appearance table
without the feeler. The first pick is dramatically slower than the rest (~38 ms against a
~3.5 ms steady state) because the pick structures are cold — `worst` is sticky, so it will
keep showing that first number for the life of the page.

The flag is honoured on all three pages. The panel has no `pickReadout` of its own — its
options are about the *card* — but it takes a `mountSurface` injection seam, and
`devTubeMapPanelRoute.ts` supplies one, so the readout reaches the surface inside the card
without the panel growing an option:

```ts
mountTubeMapPanel({ mountSurface: c => mountTubeMapSurface(c, { pickReadout: true }) })
```

`?floor=` and `?samples=` are **not** passed down that seam, and the asymmetry is the point:
`?pick` is there because `verify_segment_boxes.mjs` drives it on `/dev/tubemap-app.html`
(§6) to reach the strand under a segment box. The other two belong to scripts that photograph
the canvas and have no reason to move.

Implementation: `BandSurfaceOptions.pickReadout` in `src/tubemap/bandSurface.ts`.

### 3.1 `?floor=` — the feeler's thickness floor

The strand under the feeler is drawn at a minimum thickness of `FLOOR_CSS_PX` css pixels so
that it can be found at fit, where a band is 0.19 px tall (pgb #112). `?floor=` overrides that
number and `?floor=0` switches it off, which is how the shipped value was chosen — by looking
at a sweep of candidates rather than by argument:

```bash
open 'http://localhost:5173/dev/tubemap.html?pick&floor=0'    # the control: no floor
open 'http://localhost:5173/dev/tubemap.html?pick&floor=3'
```

The hint line in the corner names the floor the page was opened with, so a screenshot says
which arm of the sweep it is. The floor is carried as a byte in 1/32 px steps, so it saturates
at 7.97 css px — four times the tallest value anyone has wanted to look at, but `?floor=20`
will draw 7.97 and the hint will still say 20. `scripts/verify_floor.mjs` drives the whole sweep and takes the
photographs; the verdict and the rejected values are in
[`measurements/2026-08-20-a-thickness-floor-at-fit.md`](./measurements/2026-08-20-a-thickness-floor-at-fit.md).

Implementation: `BandSurfaceOptions.strandFloorCssPx`, and `FLOOR_CSS_PX` in
`src/tubemap/strandAppearance.ts`.

### 3.2 `?samples=` — how finely the pick reads the cursor's pixel

The pick pass frames one css pixel of map and photographs it into a `1 x PICK_SAMPLES` column,
so it can answer with *every* strand in that pixel rather than whichever was drawn last
(pgb #120). `?samples=` overrides the count, and `?samples=1` is the single-texel target the
pass used before #120 — the control arm:

```bash
open 'http://localhost:5173/dev/tubemap.html?pick&samples=1'     # the control: one answer
open 'http://localhost:5173/dev/tubemap.html?pick&samples=128'
```

**The window does not change with it — only the resolution.** Every value frames the same one
css pixel; a higher one divides it into more sample cells. `uPad` is sized to the cell rather
than to the pixel, which is what keeps a strand outside the cursor's pixel from ever being
reported, and it follows this parameter automatically.

The hint line names the sample count the page was opened with. `scripts/verify_pick_set.mjs`
drives the whole sweep, checks that the set collapses to one as the view magnifies, and takes
the photographs; the verdict and the rejected values are in
[`measurements/2026-08-21-how-finely-to-sample-a-pick.md`](./measurements/2026-08-21-how-finely-to-sample-a-pick.md).

Implementation: `BandSurfaceOptions.pickSamples`, and `PICK_SAMPLES` in
`src/tubemap/bandPicker.ts`.

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
- **The strand it is on is drawn at a floor of 2 css px** where the band would otherwise be
  thinner than that, which is the only reason one strand can be found at fit. Above the floor
  it does nothing. `?floor=` (§3.1) is how to see it with the floor off.
- A `feeler` badge fades in while it is active. If you see the badge, the mode is on.

Two things are easy to miss because they look like decoration:

- **Segment boxes** are real `<div>`s over the canvas, not geometry, and the one under the
  cursor shows a tooltip naming it (`src/tubemap/segmentOverlay.ts`).
- **The navigator** — the thumbnail bottom-left — is interactive. Click or drag inside it to
  move the view. A wheel over it is deliberately swallowed rather than zooming the map it is
  a picture of.

---

## 5. Panel affordances

On `/dev/tubemap-panel.html` and `/dev/tubemap-app.html`, the card carries more than it
looks like:

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

## 6. `/dev/tubemap-app.html` — the cascade the app ships

The other two pages load PGB's own stylesheet and nothing else. `index.html` loads Bootstrap
5, whose reset is `*,::after,::before{box-sizing:border-box}`, so until this page existed the
viewer was only ever *looked at* — and every `scripts/verify_*.mjs` only ever driven — in a
cascade the app does not have. Any assumption Bootstrap overrides was invisible to every check
we run: `box-sizing`, `line-height`, `font`, heading and list margins, `button` styling.

It cost once. #123 gave the PCLAI cloud breathing room as a transparent border outside
`.stm-pclai-plot`'s content box; under the reset that pad eats **inward**, collapsing the
coordinate frame to `size - 2 * PLOT_PAD` while `plotCloud` still projects over `size`, so the
cloud overhung and the widget's `overflow: hidden` shaved the bottom-right lobes. At the 900 px
cap the extreme dot's ink sat 15.95 px outside the plot's border box. #123 was verified by
pixel sampling — in the one environment where the bug cannot occur. #125 fixed it with
`box-sizing: content-box`, and #126 built this page so the class of bug is checkable.

```bash
node scripts/verify_pclai_pad.mjs   # from the repo root, with `npm run dev` already up
```

That script is the seam the unit test in `pclaiPlotBoxSizing.test.ts` explicitly is not: the
test guards one CSS declaration, because jsdom computes no layout. This one drives the page,
drags the grip to the cap, and measures every dot's rect against the plot's border box. It is
headless, unlike the rest of `scripts/verify_*.mjs` — layout is the same in software as on a
GPU — and it refuses to report anything unless an unstyled `div` on the page really is
`border-box`, so the harness cannot quietly stop being the thing it exists to be.

`verify_segment_boxes.mjs` drives this page too (#128), and for the reason the page exists:
its subject genuinely *is* DOM layout — 767 segment boxes' widths, a visibility threshold in
css pixels, computed `cursor` and `background-color` — so it is the one script whose answers
Bootstrap's reset can move, and it now asks them where the reset is in force. It opens with
the same refusal `verify_pclai_pad.mjs` does, so it cannot report `ok` from a page that has
stopped carrying the cascade, and with a check that the card left the map a strip to be
measured in.

```bash
node scripts/verify_segment_boxes.mjs   # headed, with `npm run dev` already up
```

What had kept it on the bare page was geometry, not subject: `innerWidth` and a cursor parked
at 700, 450 are the map's own middle only while the canvas fills the viewport, and inside the
card they are the host's middle. Every coordinate is now taken from `canvas.stm-canvas`'s own
box, the way `verify_pclai_pad.mjs` and `verify_pick_set_cloud.mjs` already took theirs, and
the viewport is widened to 1800 × 1000 rather than the card fullscreened — the card is
`HOST_AREA_FRACTION` of the host by area, the 200× clamp checks want a real strip, and the
screenshots are worth more with the chrome in them.

The other seven `verify_*.mjs` still drive `/dev/tubemap.html`, and each says in its own
header why. The short version: they measure the canvas — a readback, a raster, a cost — and a
stylesheet does not reach inside one.

### The three latent cases, looked at

#126 left three classes flagged as *possibly* fragile — `.stm-pclai-dot`, `.stm-pclai-inset`
and `.stm-strand-label` declare no `box-sizing`, while `.stm-segment` and `.stm-navigator-rect`
do — and said they were worth a look once there was a harness to look with. Looked at on this
page, 2026-08-21, and **all three are inert rather than fragile**:

| Class | Under the reset | Why it cannot bite |
|---|---|---|
| `.stm-pclai-dot` | `border-box` | JS writes its width, but it has no border and no padding, so both box models give the same box. The ring is a `box-shadow`, which is outside the box either way. |
| `.stm-pclai-inset` | `border-box`, 1 px border | `width: auto` — the widget is sized by its flex content. Measured 154 px outer against a 152 px content box. |
| `.stm-strand-label` | `border-box`, 1 px border + padding | `width: auto`, and `strandLabel.ts` writes only `left`/`top`. Never a specified width for the border to be subtracted from. |

`box-sizing` can only bite where a width is *specified*, and the only two specified widths in
this widget are the plot's — which now states `content-box` — and the dot's, which has nothing
to subtract. **No second live bug, and no pre-emptive edits made.** The rule this leaves is the
one worth carrying: a class that starts combining a JS-written width with a border has to state
its own `box-sizing`, and this script is where that shows up.

Two things not proposed, then or now: dropping Bootstrap, or scoping it away from the panel.
Both are far larger than the problem, and neither is needed once the viewer is verified where
it actually runs.

---

## 7. Failure states you can produce on purpose

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

## 8. The real way in, and its gate

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

## 9. What deliberately does not exist

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
