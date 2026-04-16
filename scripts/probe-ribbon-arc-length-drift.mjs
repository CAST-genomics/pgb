#!/usr/bin/env node
// One-off numerical probe: does RibbonLine's native-t getPoint drift from
// arc-length parameterization enough to visibly mis-register annotation-track
// hover markers on the 3D graph?
//
// Background: AnnotationCoordinateIndex still imports ParametricLine (whose
// getPoint is arc-length parameterized via userData.arcLengthTable), but the
// actual meshes in the scene are now RibbonLine (whose getPoint delegates to
// THREE.CatmullRomCurve3.getPoint(t), which is NOT arc-length parameterized).
//
// This script builds the same CatmullRomCurve3 that Look/GeometryFactory build,
// constructs an arc-length table the way ParametricLine does (cumulative segment
// lengths across a dense sampling), and compares positions at u=0.25, 0.5, 0.75.

import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const datasetPath = process.argv[2] ?? resolve(__dirname, '../public/datasets/macrod2.json');

const raw = JSON.parse(readFileSync(datasetPath, 'utf8'));
const nodes = raw.node;
const entries = Object.entries(nodes);

// Compute bbox centroid the way GeometryFactory does so coordinates match
let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
for (const [, n] of entries) {
    for (const { x, y } of n.ogdf_coordinates ?? []) {
        if (x < xMin) xMin = x; if (x > xMax) xMax = x;
        if (y < yMin) yMin = y; if (y > yMax) yMax = y;
    }
}
const cx = (xMin + xMax) / 2;
const cy = (yMin + yMax) / 2;

// Build arc-length table the way ParametricLine does (dense linear resampling
// of the spline, then segment lengths + prefix sum)
function buildArcLengthTable(spline, segments = 256) {
    const pts = [];
    for (let i = 0; i <= segments; i++) {
        pts.push(spline.getPoint(i / segments));
    }
    const segLen = new Float64Array(segments);
    const cum = new Float64Array(segments + 1);
    for (let i = 0; i < segments; i++) {
        segLen[i] = pts[i].distanceTo(pts[i + 1]);
        cum[i + 1] = cum[i] + segLen[i];
    }
    return { pts, segLen, cum, total: cum[segments] };
}

// Arc-length-parameterized getPoint: given u in [0,1], find the position at
// arc-length s = u * total. This is what ParametricLine.getPoint does (via
// its instanceStart/instanceEnd buffer attributes instead of resampled pts).
function arcLengthPoint(arc, u) {
    const s = u * arc.total;
    if (s >= arc.total) return arc.pts[arc.pts.length - 1].clone();
    // binary search cum[]
    let lo = 0, hi = arc.cum.length - 1;
    while (lo + 1 < hi) {
        const mid = (lo + hi) >> 1;
        (arc.cum[mid] <= s) ? (lo = mid) : (hi = mid);
    }
    const L = arc.segLen[lo];
    const frac = L > 0 ? (s - arc.cum[lo]) / L : 0;
    return arc.pts[lo].clone().lerp(arc.pts[lo + 1], frac);
}

const results = [];
let skipped2pt = 0;

for (const [nodeName, node] of entries) {
    const coords = node.ogdf_coordinates ?? [];
    if (coords.length < 3) { skipped2pt++; continue; } // 2-pt splines are linear, no drift
    const vec3 = coords.map(({ x, y }) => new THREE.Vector3(x - cx, y - cy, 0));
    const spline = new THREE.CatmullRomCurve3(vec3);
    const arc = buildArcLengthTable(spline, 512);

    const drifts = [];
    for (const u of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        const pNative = spline.getPoint(u);        // RibbonLine.getPoint(u)
        const pArc    = arcLengthPoint(arc, u);    // ParametricLine.getPoint(u)
        drifts.push({ u, dist: pNative.distanceTo(pArc) });
    }
    const maxDrift = Math.max(...drifts.map(d => d.dist));
    results.push({
        nodeName,
        bp: node.length,
        nPts: coords.length,
        arcLength: arc.total,
        drifts,
        maxDrift,
        maxDriftFrac: maxDrift / arc.total,
    });
}

// Aggregate
results.sort((a, b) => b.maxDriftFrac - a.maxDriftFrac);

console.log(`Dataset: ${datasetPath}`);
console.log(`Total nodes: ${entries.length}`);
console.log(`Skipped (2-pt linear, drift=0): ${skipped2pt}`);
console.log(`Probed (3+ control pts): ${results.length}`);
console.log();

if (results.length === 0) { console.log('No curvy nodes in this dataset.'); process.exit(0); }

const fracs = results.map(r => r.maxDriftFrac);
const worldDists = results.map(r => r.maxDrift);
const mean = arr => arr.reduce((a,b)=>a+b,0)/arr.length;
const max = arr => Math.max(...arr);
const pct = (arr, p) => { const s=[...arr].sort((a,b)=>a-b); return s[Math.floor(p*(s.length-1))]; };

console.log('Drift as fraction of node arc length:');
console.log(`  mean: ${(mean(fracs)*100).toFixed(3)}%`);
console.log(`  p50:  ${(pct(fracs,0.5)*100).toFixed(3)}%`);
console.log(`  p90:  ${(pct(fracs,0.9)*100).toFixed(3)}%`);
console.log(`  max:  ${(max(fracs)*100).toFixed(3)}%`);
console.log();
console.log('Drift in world units (same units as ogdf_coordinates):');
console.log(`  mean: ${mean(worldDists).toFixed(3)}`);
console.log(`  p50:  ${pct(worldDists,0.5).toFixed(3)}`);
console.log(`  p90:  ${pct(worldDists,0.9).toFixed(3)}`);
console.log(`  max:  ${max(worldDists).toFixed(3)}`);
console.log();
console.log('Worst 10 nodes:');
console.log('  nodeName       bp       pts  arcLen    maxDrift  frac     per-u drifts');
for (const r of results.slice(0, 10)) {
    const perU = r.drifts.map(d => `${d.u}:${d.dist.toFixed(2)}`).join(' ');
    console.log(`  ${r.nodeName.padEnd(14)} ${String(r.bp).padStart(7)} ${String(r.nPts).padStart(3)}   ${r.arcLength.toFixed(1).padStart(7)}  ${r.maxDrift.toFixed(3).padStart(8)}  ${(r.maxDriftFrac*100).toFixed(2)}%  ${perU}`);
}
