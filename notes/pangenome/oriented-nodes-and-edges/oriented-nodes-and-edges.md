# Oriented Nodes & Edges — the “when do I reverse-complement?” guide

This note is a practical reference for building **ordered, oriented walks** and stitching the **correct base string** from your IL7 locus graph.

---

## 1) Plain-English vocabulary

* **assembly\_name** — which genome (the *book*): e.g., GRCh38, CHM13, HG002.
* **haplotype** — which copy (the *volume*): usually `1` or `2`.
* **sequence\_id** — the source contig/scaffold name inside that genome (the *chapter*): e.g., `chr8` or something like `JAHKSE010000019.1`.

For safe, non-chimeric paths, key things by the triplet
`(assembly_name, haplotype, sequence_id)`.

---

## 2) Nodes, ends, and orientation

Each node has two physical ends: **left** and **right**. Your data names nodes in *oriented* form, like `85854+` or `85854-`.

* **`X+`** means: you traverse node **X** from **left → right** (use the stored sequence “as-is”).
* **`X-`** means: you traverse node **X** from **right → left** (use the **reverse-complement**).

> **Rule of thumb:** The `+` or `-` on the **node you traverse** decides whether you reverse-complement.

---

## 3) Edge attachment logic (head/tail ends)

Edges in your JSON list **oriented node names** at both ends:

* If a node appears as **starting\_node** (the *tail*):

  * `X+` → the edge **leaves the right** end of X
  * `X-` → the edge **leaves the left** end of X
* If a node appears as **ending\_node** (the *head*):

  * `Y+` → the edge **arrives at the left** end of Y
  * `Y-` → the edge **arrives at the right** end of Y

Cheat sheet:

| Oriented node on… | Attachment end |
| ----------------- | -------------- |
| tail: `X+`        | right end of X |
| tail: `X-`        | left end of X  |
| head: `Y+`        | left end of Y  |
| head: `Y-`        | right end of Y |

This tells you **which side you’re entering** the next node on. It does **not** change how the node is stored; it only determines the orientation you must use when you **traverse** it in your walk.

---

## 4) When do I reverse-complement?

* Traverse **`Y+`** → append Y’s stored sequence (left→right).
* Traverse **`Y-`** → append **reverse-complement** of Y’s stored sequence (right→left).

How the edge sign points you there:

* If the edge’s head is **`Y+`**, you arrived at Y’s **left** end → to pass through Y, use **`Y+`** (no reverse-complement).
* If the edge’s head is **`Y-`**, you arrived at Y’s **right** end → to pass through Y, use **`Y-`** (reverse-complement).

> **Key takeaway:** The *sign on the node in your walk* (`+`/`-`) is what controls sequence direction. The head’s sign is your hint which oriented node you’ll traverse next.

---

## 5) Tiny worked example

Let the stored (plus-strand) sequence for node **Y** be `AGTC`.

* Edge: `... → (ending_node: "Y+")`
  You enter Y’s **left** end → traverse **`Y+`** → append `AGTC`.
* Edge: `... → (ending_node: "Y-")`
  You enter Y’s **right** end → traverse **`Y-`** → append reverse-complement of `AGTC` = `GACT`.

Another example of attachments:

* `{"starting_node":"85853+","ending_node":"85854+"}`
  Tail leaves **right** of 85853; head arrives **left** of 85854. Next step uses **`85854+`** (no reverse-complement).
* `{"starting_node":"85854-","ending_node":"264051+"}`
  Tail leaves **left** of 85854; head arrives **left** of 264051. Next step uses **`264051+`** (no reverse-complement).

---

## 6) Building an ordered, oriented walk

1. **Pick the key** you’re walking (e.g., `assembly_name/haplotype/sequence_id`).
2. **Filter** to nodes & edges where *both endpoints* carry that key.
3. **Start** at a node with indegree = 0 (within the filtered subgraph), or any remaining node if none exists.
4. **Step forward** along an outgoing edge:

   * The edge’s **ending\_node** gives you the next oriented node (e.g., `Y+` or `Y-`).
   * Append that oriented node to your walk.
5. **Repeat** until you can’t continue; if there are disjoint chains, you’ll collect multiple walks.

---

## 7) Stitching the sequence from a walk

Assume `sequences` stores the **plus** sequence for each node ID (e.g., key `"85854+"` or `"85854"`; adapt as needed):

```js
function revComp(dna) {
  const comp = { A:'T', T:'A', C:'G', G:'C', a:'t', t:'a', c:'g', g:'c' };
  let out = '';
  for (let i = dna.length - 1; i >= 0; i--) out += comp[dna[i]] ?? dna[i];
  return out;
}

function concatSequence(walk, sequences) {
  let seq = '';
  for (const step of walk) {
    // step.name like "85854+"; step.id like "85854"; step.orient is "+" or "-"
    const plusSeq = sequences[`${step.id}+`] ?? sequences[step.id];
    seq += (step.orient === '+') ? plusSeq : revComp(plusSeq);
  }
  return seq;
}
```

---

## 8) Sanity checks (highly recommended)

* **End matching:** For each consecutive pair of steps, confirm that the chosen edge’s tail end and head end are compatible (right→left, left→right, left→left, etc., as allowed by your graph).
* **No chimeras:** Don’t mix haplotypes or different `sequence_id`s in one walk unless you intend to.
* **Orientation consistency:** The node sign in your walk must match the edge by which you enter it.
* **Bubbles:** In a bubble, an assembly uses only one branch; ensure your filter by assembly key removes the other branch.

---

## 9) Common pitfalls

* **Concatenating by file order** instead of following edges.
* **Ignoring `-` orientation,** which silently flips bases.
* **Merging haplotypes** (e.g., HG002 hap1 + hap2) by filtering only on `assembly_name`.
* **Crossing `sequence_id` boundaries** without noticing (often indicates separate contigs).

---

### Quick reference (at a glance)

* Traverse `X+` → append stored sequence.
* Traverse `X-` → append reverse-complement.
* Tail `X+` leaves **right**; tail `X-` leaves **left**.
* Head `Y+` arrives **left**; head `Y-` arrives **right**.
* The **node sign in your walk** determines whether you reverse-complement.
