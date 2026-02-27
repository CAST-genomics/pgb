# Linear Graph Spine → Colored Squence Strip

```js
// --- Inputs you already have ---
// pgJson: the JSON you shared (has pgJson.node and pgJson.sequence)
// spineWalk: array of node ids in order from assessGraphFeatures(spineWalk, …)
//            NOTE: elements may end with "+" or "-" (orientation in the spine)
// viewport: { pathStartBp, pathEndBp } along the concatenated spine (0-based, half-open)
const seqDict = pgJson.sequence; // { "13000+": "ACTG...", ... }

// --- Reverse complement (when spine uses "-" orientation) ---
const RC = { A:'T', C:'G', G:'C', T:'A', a:'t', c:'g', g:'c', t:'a' };
function revComp(s) {
  let out = '';
  for (let i = s.length - 1; i >= 0; i--) {
    const ch = s[i];
    out += RC[ch] || (ch === 'N' || ch === 'n' ? ch : 'N');
  }
  return out;
}

// --- Build a lazy concatenated accessor over spine (no giant string) ---
function buildSpineAccessor(spineWalk, seqDict) {
  const chunks = []; // each: { len, get(i) -> char }
  let cum = 0;
  for (const walkKey of spineWalk) {
    const orient = walkKey.endsWith('-') ? '-' : '+';
    const storedKey = walkKey.endsWith('+') || walkKey.endsWith('-')
      ? walkKey.slice(0, -1) + '+'
      : walkKey; // sequence keys are stored as "+"

    const s = seqDict[storedKey] || '';
    const seq = orient === '+' ? s : revComp(s);

    const len = seq.length;
    const startOffset = cum;
    chunks.push({
      len,
      start: startOffset,
      end: startOffset + len,
      get: (i) => seq[i] || 'N'
    });
    cum += len;
  }
  return {
    totalLen: cum,
    charAt: (pathBp) => {
      // binary search chunk by cumulative bounds
      let lo = 0, hi = chunks.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const c = chunks[mid];
        if (pathBp < c.start) hi = mid - 1;
        else if (pathBp >= c.end) lo = mid + 1;
        else return c.get(pathBp - c.start);
      }
      return 'N';
    }
  };
}

// --- Color map (A/C/G/T/N → RGBA) ---
const COLORS = {
  A: [  0, 160,   0, 255],
  C: [  0,   0, 200, 255],
  G: [220, 140,   0, 255],
  T: [200,   0,   0, 255],
  N: [160, 160, 160, 255]
};
function colorOf(base) {
  const b = (base || 'N').toUpperCase();
  return COLORS[b] || COLORS.N;
}

// --- Renderer ---
// Draws a single horizontal strip (full canvas height). Aggregates when zoomed out.
function renderSequenceStrip(canvas, spine, viewport) {
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;

  const viewLen = Math.max(1, viewport.pathEndBp - viewport.pathStartBp);
  const bpPerPx = viewLen / W;

  const img = ctx.createImageData(W, 1); // 1-row image, then stretch vertically
  const data = img.data;

  if (bpPerPx <= 1) {
    // Zoomed in: each pixel column is one base (or some columns unused)
    for (let x = 0; x < W; x++) {
      const pathBp = Math.floor(viewport.pathStartBp + x * bpPerPx);
      const [r,g,b,a] = colorOf(spine.charAt(pathBp));
      const i = x * 4;
      data[i] = r; data[i+1] = g; data[i+2] = b; data[i+3] = a;
    }
  } else {
    // Zoomed out: one pixel column covers multiple bases — average color
    for (let x = 0; x < W; x++) {
      const bp0 = Math.floor(viewport.pathStartBp + x * bpPerPx);
      const bp1 = Math.floor(viewport.pathStartBp + (x+1) * bpPerPx);
      let r=0,g=0,b=0,cnt=0;
      for (let p = bp0; p < bp1; p++) {
        const [R,G,B] = colorOf(spine.charAt(p));
        r+=R; g+=G; b+=B; cnt++;
      }
      if (cnt === 0) { r=g=b=160; cnt=1; } // default grey
      const i = x * 4;
      data[i]   = (r / cnt) | 0;
      data[i+1] = (g / cnt) | 0;
      data[i+2] = (b / cnt) | 0;
      data[i+3] = 255;
    }
  }

  // Blit 1-row then scale to full height (fast)
  ctx.putImageData(img, 0, 0);
  ctx.drawImage(canvas, 0, 0, W, 1, 0, 0, W, H);
}
```

## How to wire it

```js
// 1) Build the spine accessor once for the current window
const spine = buildSequenceStripAccessor(spineWalk, seqDict);

// 2) Render for the current viewport (in bp along the concatenated spine)
const canvas = document.getElementById('seqStrip');
const dpr = window.devicePixelRatio || 1;
canvas.width = Math.floor(canvas.clientWidth * dpr);
canvas.height = Math.floor(48 * dpr); // track height
renderSequenceStripAccessor(canvas, spine, {pathStartBp, pathEndBp});

// 3) On pan/zoom, call renderSequenceStrip(...) again with the new viewport.
// 4) For bi-directional mapping, your cursor ↔ graph dot already speaks in path bp.
//    Just use the same path bp for both views.
```

### Notes / gotchas

* **Reverse-complement when needed.** Because the graph can traverse a node in `-` orientation (seen in your edges), use the reverse-complement of the node’s stored `…+` sequence for those segments.
* **No giant string needed.** The accessor keeps chunks separate and lets you fetch `charAt(pathBp)` without concatenating megabases.
* **Performance:**

  * Use the **1-row ImageData** trick + `drawImage` to fill height; it’s faster than setting every pixel in a tall image.
  * The simple averaging loop is fine up to tens of Mb per second; if you ever need more, switch to **sampling** (e.g., 16 samples/pixel) when `bpPerPx` is huge.
* **Fallbacks:** If a node’s sequence is missing, treat bases as `N` so the strip still renders.

This keeps your track **simple**, fast, and perfectly in sync with the spine. If you later want contig boundaries or labels on top of the strip, we can overlay those as a second canvas layer without changing any of the rendering code above.
