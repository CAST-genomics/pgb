# PGB (Pangenome Browser)
[![Netlify Status](https://api.netlify.com/api/v1/badges/8de8a9e9-655d-4571-bf43-a735a78b840c/deploy-status)](https://app.netlify.com/projects/pgb-site/deploys)

A web-based 3D visualization tool for exploring pangenome data.

## Overview

This project provides an interactive 3D visualization interface for exploring pangenome data. It allows users to load and visualize genomic data from various sources, with support for both large and small data files.

## Features

- Interactive 2D visualization
- Support for loading genomic data from URLs
- Pre-configured data file options for quick access

## Prerequisites

- Node.js (latest LTS version recommended)
- npm or yarn package manager

## Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd pgb
```

2. Install dependencies:
```bash
npm install
```

## Usage

### Development

To start the development server:
```bash
npm run dev
```

This will start the Vite development server, typically at `http://localhost:5173`

### Building for Production

To create a production build:
```bash
npm run build
```

### Preview Production Build

To preview the production build locally:
```bash
npm run preview
```

### Tube map dev pages

Three pages mount the sequence tube map viewer on its own, so it can be worked on **without
loading a dataset, without the API being up, and without clicking through the 3D graph**. They
are served by the dev server only — `vite.config.js` declares no build inputs, so the build
takes Vite's default of `index.html` alone and these are absent from `dist/`.

```bash
npm run dev     # then open any of the three
```

| Page | Mounts | Look at |
| --- | --- | --- |
| [`/dev/tubemap.html`](http://localhost:5173/dev/tubemap.html) | the viewer alone | parsing, pan/zoom, the feeler, the navigator, segment boxes |
| [`/dev/tubemap-panel.html`](http://localhost:5173/dev/tubemap-panel.html) | the whole card | drag, resize grip, fullscreen, reframe-on-resize |
| [`/dev/tubemap-app.html`](http://localhost:5173/dev/tubemap-app.html) | the same card, under `index.html`'s cascade | anything that is a *box*: layout under Bootstrap's reset |

Each page loads a committed fixture by default and offers a text field for a different
document, so a URL can be pasted in live rather than reloading. A live API URL works there too.

| Parameter | Page | Effect |
| --- | --- | --- |
| `?url=` | all three | open this document instead of the default fixture |
| `?pick` | all three | mount the pick readout — strands under the cursor, and what asking cost |
| `?floor=` | `tubemap.html` | the feeler's thickness floor in css px; `0` switches it off |
| `?samples=` | `tubemap.html` | how finely the pick pass samples the cursor's pixel |

**Percent-encode an API URL before putting it in `?url=`.** It carries its own `?` and `&`, so
pasted raw the browser reads those as the *dev page's* query string and the viewer receives only
`…/seqtubemap?chrom=chr7` — the range and node silently stripped. The API answers that with 200
and a valid map of a different region in a blue fallback palette, so the mistake looks like a
rendering bug rather than a bad address. A blue map with an empty PCLAI inset always means the
request lost parameters; the real ancestry palette is teal, orange and magenta.

```bash
# encode it
python3 -c "import urllib.parse,sys; print('http://localhost:5173/dev/tubemap.html?url=' + urllib.parse.quote(sys.argv[1], safe=''))" 'https://pangenome-api.ucsd.edu:8000/seqtubemap?chrom=chr7&start=55067258&end=55068164&version=v2&minigraphnode=119565'
```

Simpler for testing by hand: open the page bare and paste the raw URL into its text field, which
takes the whole string verbatim.

```bash
open 'http://localhost:5173/dev/tubemap.html'
open 'http://localhost:5173/dev/tubemap.html?pick'
open 'http://localhost:5173/dev/tubemap.html?url=/src/tubemap/__tests__/fixtures/stm-chr8-78771162-78771252.svg'
open 'http://localhost:5173/dev/tubemap-app.html?pick'    # the same, under Bootstrap
```

### Asking for the band payload rather than the document

`/seqtubemap` serves one picture in two encodings: the SVG document, and — with
`&format=bands` — the same picture as the numbers themselves, an eighth to a tenth of the size.
The app asks for the payload and nothing else (`TUBE_MAP_ENCODING` in
`src/tubemap/tubeMapEncoding.ts`). The dev pages cannot: they open whatever they are handed, so
they read the encoding back out of the URL — **a `format=bands` query or a `.bands` path is a
payload; anything else is a document.** Nothing else changes, on either page.

So the two encodings are one parameter apart, and pasting one over the other in the text field
is a click:

```bash
# live, the payload — what the app itself requests
python3 -c "import urllib.parse,sys; print('http://localhost:5173/dev/tubemap-panel.html?url=' + urllib.parse.quote(sys.argv[1], safe=''))" \
  'https://pangenome-api.ucsd.edu:8000/seqtubemap?chrom=chr1&start=25331646&end=25335796&version=v2&pathnumoption=normal&nodewidthoption=compressed&minigraphnode=5520&format=bands'

# committed fixtures, no server needed — one region, both encodings
open 'http://localhost:5173/dev/tubemap-panel.html?url=/src/tubemap/__tests__/fixtures/stm-chr8-10079054-10080461.bands'
open 'http://localhost:5173/dev/tubemap-panel.html?url=/src/tubemap/__tests__/fixtures/stm-chr8-10079054-10080461.paired.svg.gz'
```

Those last two are the A/B worth having: **the same render, read two ways**, and they draw the
same map — 91 segment boxes and "166 of 463 haplotypes inverted" either way. Open the `.gz` path
as it is; the dev server sends `content-encoding: gzip` and the browser decompresses it before
the viewer sees a byte.

**Nothing on screen says which arrived, and that is the point** — both readers produce the same
`ParsedMap` and the same segment boxes (ADR [`0005`](docs/adr/0005-reading-the-band-payload.md)).
To confirm which one you got, read the response in DevTools' Network panel: the payload is
`application/octet-stream` and starts with a `uint32` length and a JSON header; the document is
`image/svg+xml`. On node `5520+` that is 1.4 MB against 14.2 MB, and 3.9 s against 7.2 s.

Two traps. **Drop the `.gz` and the request still returns 200** — Vite answers an unknown path
with `index.html`, so `…paired.svg` hands the viewer 5 KB of HTML and you get a parse failure
where you expected a missing file. And the five plain `.svg` fixtures are **older renders** than
the `.bands` beside them, with different band counts and viewBoxes: they are the document
reader's corpus, not an oracle for the payload. `src/tubemap/__tests__/fixture.ts` says which is
which.

Two things worth knowing before relying on these pages. The default fixture is a 5.6:1 strip,
and a class of framing bug cannot fail against it — open the tall
`stm-chr8-78771162-78771252.svg` before believing anything about fitting or the navigator. And
a load failure is classified rather than generic: `unreachable`, `slow`, `absent`, `undrawable`
and `internal` mean different things, and which one you get depends on whether the error
response carries CORS headers — a 502 measured on 2026-09-02 did, and arrived as a readable
status rather than as `unreachable`.

Full reference — every affordance, every gesture, and the reasoning behind each:
[`notes/sequence-tube-map/dev-affordances.md`](notes/sequence-tube-map/dev-affordances.md).

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `P` | Export the PCLAI chart as an SVG, capturing its current visual state. Use this to save a chart while hovering a graph node — moving the cursor to the print menu would otherwise cancel the hover. Ignored while typing in an input field, and when modifier keys are held (so `Cmd+P` still triggers the browser print dialog). |

## Project Structure

- `src/` - Source code directory
- `public/` - Static assets
- `index.html` - Main HTML file
- `dev/` - Dev-only pages, served by the dev server and excluded from the build
- `vite.config.js` - Vite configuration
- `package.json` - Project dependencies and scripts

## Technologies Used

- [Vite](https://vitejs.dev/) - Next Generation Frontend Tooling
- [Three.js](https://threejs.org/) - JavaScript 3D library
- [Bootstrap](https://getbootstrap.com/) - CSS framework
- [Sass](https://sass-lang.com/) - CSS preprocessor

## License

[MIT](LICENSE) © The Regents of the University of California

## Contributing

[Add contribution guidelines here] 
