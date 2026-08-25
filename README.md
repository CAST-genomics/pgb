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

Two things worth knowing before relying on these pages. The default fixture is a 5.6:1 strip,
and a class of framing bug cannot fail against it — open the tall
`stm-chr8-78771162-78771252.svg` before believing anything about fitting or the navigator. And
a load failure is classified rather than generic: `unreachable`, `slow`, `absent`, `undrawable`
and `internal` mean different things, and the API's error responses carry no CORS headers, so a
genuine server error reaches the browser as `unreachable`.

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
