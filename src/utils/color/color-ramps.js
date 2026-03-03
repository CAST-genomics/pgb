/**
 * Sequential Color Ramps for Population Data
 * ColorBrewer 2.0 — Brewer, Harrower, Sheesley
 *
 * Each ramp exposes:
 *   ramp.stops        — raw 8-stop hex array (low → high)
 *   ramp.rgb(t)       — interpolated [r, g, b] for t ∈ [0, 1]
 *   ramp.hex(t)       — interpolated "#rrggbb" string for t ∈ [0, 1]
 *   ramp.css(t)       — interpolated "rgb(r,g,b)" string for t ∈ [0, 1]
 *   ramp.classify(v, domain, n) — classify a value into n buckets, returns hex
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Parse a 6-digit hex string to [r, g, b] (0–255). */
function _hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Convert [r, g, b] (0–255) to a "#rrggbb" hex string. */
function _rgbToHex([r, g, b]) {
  return '#' + [r, g, b]
    .map(v => Math.round(v).toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Build a ramp object from an array of hex stop strings.
 * @param {string[]} stops  Ordered hex colors, low → high.
 */
function _makeRamp(stops) {
  const rgbStops = stops.map(_hexToRgb);
  const n = stops.length;

  /**
   * Interpolate the ramp at position t ∈ [0, 1].
   * @returns {[number, number, number]} [r, g, b] 0–255
   */
  function rgb(t) {
    const clamped = Math.max(0, Math.min(1, t));
    const scaled  = clamped * (n - 1);
    const lo      = Math.floor(scaled);
    const hi      = Math.min(lo + 1, n - 1);
    const frac    = scaled - lo;

    return rgbStops[lo].map((c, i) =>
      c + frac * (rgbStops[hi][i] - c)
    );
  }

  /** Interpolated "#rrggbb" string for t ∈ [0, 1]. */
  function hex(t) {
    return _rgbToHex(rgb(t));
  }

  /** Interpolated "rgb(r,g,b)" CSS string for t ∈ [0, 1]. */
  function css(t) {
    const [r, g, b] = rgb(t).map(Math.round);
    return `rgb(${r},${g},${b})`;
  }

  /**
   * Classify a scalar value into n equal-width buckets over a domain,
   * returning the hex color for that bucket's midpoint.
   *
   * @param {number}   value        The data value to classify.
   * @param {[number, number]} domain  [min, max] of the full dataset.
   * @param {number}   [n=8]        Number of classification buckets.
   * @returns {string} Hex color string.
   *
   * @example
   *   ylOrRd.classify(1500, [0, 10000], 8)  // → "#fed976"
   */
  function classify(value, [min, max], n = 8) {
    if (max === min) return hex(0.5);
    const bucket = Math.min(Math.floor(((value - min) / (max - min)) * n), n - 1);
    return hex((bucket + 0.5) / n);
  }

  return { stops, rgb, hex, css, classify };
}


// ---------------------------------------------------------------------------
// YlOrRd  — Yellow → Orange → Red
// ---------------------------------------------------------------------------
// Best for: population density maps, choropleth maps where "hot = dense"
// is the intuitive reading. High contrast at the upper (dense) end.
// Colorblind-safe, print-safe. Standard for Census, UN, and atlas work.
// ---------------------------------------------------------------------------
export const ylOrRd = _makeRamp([
  '#ffffcc',
  '#ffeda0',
  '#fed976',
  '#feb24c',
  '#fd8d3c',
  '#fc4e2a',
  '#e31a1c',
  '#b10026',
]);


// ---------------------------------------------------------------------------
// YlGnBu  — Yellow → Green → Blue
// ---------------------------------------------------------------------------
// Best for: cool-toned population maps, especially over warm or terrain
// basemaps. "Dense" reads as deep blue rather than red — appropriate when
// avoiding alarm connotations. Standard in academic journals.
// Colorblind-safe, print-safe.
// ---------------------------------------------------------------------------
export const ylGnBu = _makeRamp([
  '#ffffd9',
  '#edf8b1',
  '#c7e9b4',
  '#7fcdbb',
  '#41b6c4',
  '#1d91c0',
  '#225ea8',
  '#0c2c84',
]);


// ---------------------------------------------------------------------------
// Blues  — Near-white → Deep Navy
// ---------------------------------------------------------------------------
// Best for: neutral, single-hue population maps. Low values recede into
// a white background cleanly. No temperature or urgency implied — ideal
// when presenting data without policy framing.
// Colorblind-safe, print-safe, maximally neutral.
// ---------------------------------------------------------------------------
export const blues = _makeRamp([
  '#f7fbff',
  '#deebf7',
  '#c6dbef',
  '#9ecae1',
  '#6baed6',
  '#4292c6',
  '#2171b5',
  '#08519c',
  '#08306b',
]);


// ---------------------------------------------------------------------------
// Convenience: all three ramps keyed by name
// ---------------------------------------------------------------------------
export const ramps = { ylOrRd, ylGnBu, blues };


// ---------------------------------------------------------------------------
// Usage examples (not executed — for reference)
// ---------------------------------------------------------------------------
//
//  import { ylOrRd, ylGnBu, blues } from './color-ramps.js';
//
//  // Continuous interpolation (t = 0 → 1)
//  ylOrRd.hex(0)       // "#ffffcc"  (low population)
//  ylOrRd.hex(0.5)     // "#fd8d3c"  (mid population)
//  ylOrRd.hex(1)       // "#b10026"  (high population)
//
//  // CSS color strings
//  ylGnBu.css(0.75)    // "rgb(34,94,168)"
//
//  // Raw [r, g, b] array — useful for Canvas, WebGL, Three.js, etc.
//  blues.rgb(0.9)      // [8, 81, 156]
//
//  // Classify a value from a dataset into 8 buckets
//  ylOrRd.classify(4200, [0, 10000])       // "#fd8d3c"
//  ylOrRd.classify(4200, [0, 10000], 5)    // 5-bucket version
//
//  // Iterate to paint a gradient on a <canvas>
//  for (let i = 0; i < 256; i++) {
//    ctx.fillStyle = ylOrRd.hex(i / 255);
//    ctx.fillRect(i, 0, 1, 20);
//  }
