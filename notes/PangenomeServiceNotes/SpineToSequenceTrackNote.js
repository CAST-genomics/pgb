/*
    Usage:

// 1) Build the spine accessor once for the current window
const sequenceStripAccessor = buildSequenceStripAccessor(spineWalk, sequences);

// 2) Render for the current viewport (in bp along the concatenated spine)
const canvas = document.getElementById('seqStrip');
const dpr = window.devicePixelRatio || 1;
canvas.width  = Math.floor(canvas.clientWidth * dpr);
canvas.height = Math.floor(48 * dpr); // track height
renderSequenceStripAccessor(canvas, sequenceStripAccessor, viewport)

// 3) On pan/zoom, call renderSequenceStrip(...) again with the new viewport.
// 4) For bi-directional mapping, your cursor ↔ graph dot already speaks in path bp.
//    Just use the same path bp for both views.

 */

// --- Inputs you already have ---
// pgJson: the JSON you shared (has pgJson.node and pgJson.sequence)
// spineWalk: array of node ids in order from assessGraphFeatures(spineWalk, …)
//            NOTE: elements may end with "+" or "-" (orientation in the spine)
// viewport: { pathStartBp, pathEndBp } along the concatenated spine (0-based, half-open)
const seqDict = pgJson.sequence; // { "13000+": "ACTG...", ... }

// --- Reverse complement (when spine uses "-" orientation) ---
const RC = { A:'T', C:'G', G:'C', T:'A', a:'t', c:'g', g:'c', t:'a' };
function reverseComplement(s) {
    let out = '';
    for (let i = s.length - 1; i >= 0; i--) {
        const ch = s[i];
        out += RC[ch] || (ch === 'N' || ch === 'n' ? ch : 'N');
    }
    return out;
}

// --- Build a lazy concatenated accessor over spine (no giant string) ---
function buildSequenceStripAccessor(spineWalk, sequences) {

    const chunks = []

    let accumulator = 0;
    for (const walkKey of spineWalk) {

        // sequence keys are stored as "+"
        const storedKey = walkKey.endsWith('+') || walkKey.endsWith('-') ? walkKey.slice(0, -1) + '+' : walkKey;

        const rawSequenceString = sequences[storedKey] || '';

        const orientation = walkKey.endsWith('-') ? '-' : '+';
        const sequenceString = orientation === '+' ? rawSequenceString : reverseComplement(rawSequenceString);

        const len = sequenceString.length;
        const startOffset = accumulator;

        chunks.push({ len, start: startOffset, end: startOffset + len, get: i => sequenceString[i] || 'N' });

        accumulator += len;
    }

    const charAt = pathBp => {

        let lo = 0
        let hi = chunks.length - 1

        // binary search chunk by cumulative bounds
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const chunk = chunks[mid];
            if (pathBp < chunk.start) hi = mid - 1;
            else if (pathBp >= chunk.end) lo = mid + 1;
            else return chunk.get(pathBp - chunk.start);
        }
        return 'N';
    }

    return { totalLen: accumulator, charAt }
}

const COLORS = {
    A: [  0, 160,   0, 255],
    C: [  0,   0, 200, 255],
    G: [220, 140,   0, 255],
    T: [200,   0,   0, 255],
    N: [160, 160, 160, 255]
};

function colorOfBase(base) {
    const b = (base || 'N').toUpperCase();
    return COLORS[b] || COLORS.N;
}

// --- Renderer ---
// Draws a single horizontal strip (full canvas height). Aggregates when zoomed out.
function renderSequenceStripAccessor(canvas, sequenceStripAccessor, viewport) {

    const ctx = canvas.getContext('2d', { willReadFrequently: false })
    const { width, height } = canvas;

    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;

    const bpLength = Math.max(1, viewport.pathEndBp - viewport.pathStartBp);
    const bpPerPixel = bpLength / width;

    const imageData = ctx.createImageData(width, 1); // 1-row image, then stretch vertically
    const data = imageData.data;

    if (bpPerPixel <= 1) {
        // Zoomed in: each pixel column is one base (or some columns unused)
        for (let x = 0; x < width; x++) {
            const bp = Math.floor(viewport.pathStartBp + x * bpPerPixel);
            const [r,g,b,a] = colorOfBase(sequenceStripAccessor.charAt(bp))
            const i = x * 4;

            data[i  ] = r;
            data[i+1] = g;
            data[i+2] = b;
            data[i+3] = a;
        }
    } else {
        // Zoomed out: one pixel column covers multiple bases — average color
        for (let x = 0; x < width; x++) {

            const bpStart = Math.floor(viewport.pathStartBp + x * bpPerPixel);
            const bpEnd = Math.floor(viewport.pathStartBp + (x+1) * bpPerPixel);

            let r=0
            let g=0
            let b=0
            let cnt=0;

            for (let bp = bpStart; bp < bpEnd; bp++) {

                const [R,G,B] = colorOfBase(sequenceStripAccessor.charAt(bp));
                r+=R;
                g+=G;
                b+=B;

                cnt++;
            }

            if (cnt === 0) {
                r=g=b=160;
                cnt=1;
            } // default grey

            const i = x * 4;

            data[i  ] = (r / cnt) | 0;
            data[i+1] = (g / cnt) | 0;
            data[i+2] = (b / cnt) | 0;
            data[i+3] = 255;
        }
    }

    // Blit 1-row then scale to full height (fast)
    ctx.putImageData(imageData, 0, 0);

    ctx.drawImage(canvas, 0, 0, width, 1, 0, 0, width, height);
}
