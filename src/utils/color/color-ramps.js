import * as THREE from 'three'

/**
 * Sequential Color Ramps for Population Data
 * ylOrRd, ylGnBu, blues — ColorBrewer 2.0 (Brewer, Harrower, Sheesley)
 * devon                 — Crameri, Scientific colour maps v8.0.1
 * algae, amp            — cmocean (Thyng et al. 2016)
 * cetL12                — Kovesi, CET perceptually uniform colour maps
 * The single-hue candidates are compared in
 * notes/ui/color/single-hue-ramp-candidates.html.
 *
 * Each ramp exposes:
 *   ramp.stops        — raw hex stop array (low → high)
 *   ramp.rgb(t)       — interpolated [r, g, b] for t ∈ [0, 1]
 *   ramp.hex(t)       — interpolated "#rrggbb" string for t ∈ [0, 1]
 *   ramp.css(t)       — interpolated "rgb(r,g,b)" string for t ∈ [0, 1]
 *   ramp.color(t)     — interpolated THREE.Color for t ∈ [0, 1] (sRGB in, linear stored)
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
   * Interpolated THREE.Color for t ∈ [0, 1].
   * Stops are sRGB — tag them so Three.js converts to linear working space.
   * @returns {THREE.Color}
   */
  function color(t) {
    const [r, g, b] = rgb(t);
    return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
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

  return { stops, rgb, hex, css, color, classify };
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
// Devon  — White → Lavender → Blue → Dark Indigo
// ---------------------------------------------------------------------------
// Best for: staying in the blue family with lightness that falls about
// twice as evenly as Blues, so low frequencies show sooner. Leans violet.
// Low end is white, so values near 0 still recede into a light background.
// Source: Crameri, Scientific colour maps v8.0.1 (doi:10.5281/zenodo.8409685),
// publisher's 10-stop devon10 palette, reversed to run light → dark. MIT.
// ---------------------------------------------------------------------------
export const devon = _makeRamp([
  '#ffffff',
  '#e8e5fa',
  '#d0ccf5',
  '#bab3f1',
  '#989be7',
  '#6181d0',
  '#3669ad',
  '#275186',
  '#293467',
  '#2c1a4c',
]);


// ---------------------------------------------------------------------------
// Algae  — Pale Green → Dark Green
// ---------------------------------------------------------------------------
// Best for: a true single hue that is perceptually uniform. The low end is
// already a pale green, so values near 0 stay faintly visible on a light
// background without offsetting t. Dark end may read close to black.
// Source: cmocean algae-rgb.txt (github.com/matplotlib/cmocean), 9 evenly
// spaced samples of the 256-entry table. MIT.
// ---------------------------------------------------------------------------
export const algae = _makeRamp([
  '#d7f9d0',
  '#afdda2',
  '#84c47a',
  '#50ad59',
  '#129450',
  '#0c7849',
  '#185b3b',
  '#194029',
  '#122414',
]);


// ---------------------------------------------------------------------------
// Amp  — Warm Off-white → Red → Maroon
// ---------------------------------------------------------------------------
// Best for: a warm single hue that is perceptually uniform. Low values are
// visible early on a light background. Red implies heat or alarm.
// Source: cmocean amp-rgb.txt (github.com/matplotlib/cmocean), 9 evenly
// spaced samples of the 256-entry table. MIT.
// ---------------------------------------------------------------------------
export const amp = _makeRamp([
  '#f1edec',
  '#e2c7bf',
  '#d7a291',
  '#cc7e64',
  '#c0583b',
  '#af3024',
  '#901029',
  '#650f24',
  '#3c0912',
]);


// ---------------------------------------------------------------------------
// CET-L12  — Near-white → Mid Blue
// ---------------------------------------------------------------------------
// Best for: a quiet, purely single-hue map with exactly linear lightness
// that never goes dark (stops at L* 50). Leaves headroom if ribbons are
// ever lit; gives up about half the lightness range of the others.
// Source: Kovesi, CET Perceptually Uniform Colour Maps, CET-L12.csv
// (linear_blue_95_50_c20), 9 evenly spaced samples. CC BY 4.0 — cite
// Kovesi (2015), arXiv:1509.03700.
// ---------------------------------------------------------------------------
export const cetL12 = _makeRamp([
  '#f0f1f0',
  '#d8e1ee',
  '#c0d2eb',
  '#a8c4e6',
  '#93b5dc',
  '#82a6cf',
  '#7197c1',
  '#5a89b8',
  '#3b7bb2',
]);


// ---------------------------------------------------------------------------
// Convenience: all ramps keyed by name
// ---------------------------------------------------------------------------
export const ramps = { ylOrRd, ylGnBu, blues, devon, algae, amp, cetL12 };


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
//  // THREE.Color (linear working space) — drop-in for materials / uniforms
//  blues.color(0.5)    // THREE.Color, displays as "#6baed6"
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
