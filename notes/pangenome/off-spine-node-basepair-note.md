Yes—that’s exactly how I’m treating **pills**.

* **What a pill is:** a detour anchored between two **adjacent spine nodes** `(L,R)`. On the reference, that span has **zero length**, so
  `spanStart = bpEnd(L)`, `spanEnd = bpStart(R)`, and `refLenBp = 0`. Hence `bpStart === bpEnd` for the event’s anchor position.

* **But the detour has sequence/length:** the off-spine node(s) on each alternative path carry real sequence and length. In the output:

  * For each path, `altLenBp` = **sum of interior node lengths** (the insertion length relative to the reference at that junction).
  * If there’s just one off-spine node, its `lengthBp` is the insertion length.
  * If there are multiple alternative paths between the same anchors (parallel bundle), you’ll see multiple candidate insertion lengths; the event also reports `stats.minAltLenBp / maxAltLenBp`.

* **Coordinates we expose:**

  * Anchors: `anchors.leftBpStart/leftBpEnd/rightBpStart/rightBpEnd` (true spine coordinates).
  * Path nodes: `nodesDetailed[].refBpStart/refBpEnd` are **projections** onto the anchor bp (for pills they’ll all map to the same bp), and `altStartBp/altEndBp` give cumulative positions **along the inserted sequence** for rendering widths/labels.

* **Where sequence comes from:** use the node sequences in your JSON (e.g., `node.seq` or whatever field you have). The insertion sequence for a path is simply the concatenation of the **interior** nodes’ sequences (respecting orientation if your ids’ `+/-` indicate strand; reverse-complement on `-` if applicable).

Quick sketch to reconstruct the inserted sequence for one pill path:

```js
function insertionSequenceForPath(graph, pathNodes) {
  let s = '';
  for (let i = 1; i < pathNodes.length - 1; i++) {
    const id = pathNodes[i];
    const n = graph.nodes.get(id);
    if (!n) continue;
    let seg = n.seq || ''; // or n.sequence, depending on your JSON
    // if your ids encode strand (e.g., "2912-" vs "2912+"), reverse-complement when '-'
    if (id.endsWith('-')) seg = reverseComplement(seg); // implement if needed
    s += seg;
  }
  return s;
}
```

So: **pill = zero-bp reference span with one or more nonzero-length alternative sequences.** Your rendering can put the pill apex exactly at `spanStart`/`spanEnd` and scale its width/height using `altLenBp` (or the detailed per-node `altStartBp/altEndBp`).
