// color functions for Viridis, Inferno, and Cividis.

import * as THREE from 'three';

/* ---------- 1) Colormap stops (sampled from matplotlib) ---------- */
// Each entry: [position 0..1, '#rrggbb']

export const VIRIDIS_STOPS = [
  [0.000000, '#440154'],
  [0.166667, '#443983'],
  [0.333333, '#31688e'],
  [0.500000, '#21918c'],
  [0.666667, '#35b779'],
  [0.833333, '#90d743'],
  [1.000000, '#fde725'],
];

export const INFERNO_STOPS = [
  [0.000000, '#000004'],
  [0.166667, '#320a5e'],
  [0.333333, '#781c6d'],
  [0.500000, '#bc3754'],
  [0.666667, '#ed6925'],
  [0.833333, '#fbb61a'],
  [1.000000, '#fcffa4'],
];

export const CIVIDIS_STOPS = [
  [0.000000, '#00224e'],
  [0.166667, '#2a3f6d'],
  [0.333333, '#575d6d'],
  [0.500000, '#7d7c78'],
  [0.666667, '#a59c74'],
  [0.833333, '#d2c060'],
  [1.000000, '#fee838'],
];

/* ---------- 2) Helpers ---------- */

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

function hexToRgb(hex) {
  const h = hex.replace('#','');
  return [
    parseInt(h.slice(0,2), 16),
    parseInt(h.slice(2,4), 16),
    parseInt(h.slice(4,6), 16),
  ];
}

function lerp(a, b, t) { return a + (b - a) * t; }

/**
 * Interpolate a THREE.Color from a list of [t, '#rrggbb'] stops.
 * sRGB interpolation between close stops (the stops themselves come from
 * perceptually-uniform maps, so this works well while keeping code tiny).
 */
export function colorFromStops(stops, p) {
  const v = clamp01(p);
  // fast paths
  if (v <= stops[0][0]) {
    const [r,g,b] = hexToRgb(stops[0][1]);
    return new THREE.Color(r/255, g/255, b/255);
  }
  if (v >= stops[stops.length-1][0]) {
    const [r,g,b] = hexToRgb(stops[stops.length-1][1]);
    return new THREE.Color(r/255, g/255, b/255);
  }

  // find surrounding stops
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i+1];
    if (v >= t0 && v <= t1) {
      const t = (v - t0) / (t1 - t0);
      const [r0,g0,b0] = hexToRgb(c0);
      const [r1,g1,b1] = hexToRgb(c1);
      const r = lerp(r0, r1, t) / 255;
      const g = lerp(g0, g1, t) / 255;
      const b = lerp(b0, b1, t) / 255;
      return new THREE.Color(r, g, b);
    }
  }

  // fallback (shouldn't hit)
  return new THREE.Color(0,0,0);
}

/* ---------- 3) Convenience wrappers ---------- */

export function viridisColor(p)  { return colorFromStops(VIRIDIS_STOPS,  p); }
export function infernoColor(p)  { return colorFromStops(INFERNO_STOPS,  p); }
export function cividisColor(p)  { return colorFromStops(CIVIDIS_STOPS,  p); }
