# Sequence Tube Map — Integration Punch List

**Status:** Not started. Nine steps, none landed. Tick items here as they land, and update
this line when the work is done.
**Date:** 2026-08-17
**Decisions:** `docs/adr/0001-sequence-tube-map-panel.md` once #87 lands — that ADR, not
this note, is the normative record. This is a working checklist and licenses nothing.
**Background:** [sequence-tube-map-api.md](./sequence-tube-map-api.md)

Epic: [`CAST-genomics/pgb#85`](https://github.com/CAST-genomics/pgb/issues/85)
Base branch: `main`. Each item is one PR, landed incrementally.

**Every PR body needs `Closes #<n>` on its own line.**

Nothing is user-reachable until step 8. Step 4 adds the dev route, so steps 5–7 are
testable without clicking through the 3D graph.

---

## Order and dependencies

```
1 ─┐
2 ─┼─► 4 ─► 5 ─┐
3 ─┘           ├─► 7 ─┐
      2 ─► 6 ──┴──────┴─► 8 ─► 9 (archive)
```

Two orderings are load-bearing and not just tidy:

- **3 before 4** — rename while the spike's Playwright suite still exists to prove it.
  After step 4 that safety net is gone for good.
- **6 before 7/8** — the URL builder and the eligibility gate exist before anything calls
  them, so the menu is never wired to a function that can lie.

---

## 1. ADR and vocabulary — [#87](https://github.com/CAST-genomics/pgb/issues/87)

**Do this first, not the types PR.** `CLAUDE.md` points a reader at Looks by default, so
the answer to "why isn't this a Look?" should be in the repo before a reviewer has to ask.

- [ ] Create `docs/adr/0001-sequence-tube-map-panel.md` (creates `docs/adr/`, which is
      declared normative but has no files yet)
- [ ] One-line pointer in `CLAUDE.md`'s Looks section
- [ ] `CONTEXT.md`: add `band`, `segment`, `sequence tube map`, `strand`, `tube map panel`
- [ ] `CONTEXT.md`: append the **minigraph node** alias + oriented-id/bare-id paragraph to
      the existing `node` entry
- [ ] Migrate `docs/adr/0001-webgl-band-renderer.md` and `docs/DISAMBIGUATING-TRACKS.md`
      from the spike, updated for `strand`

Drafts are ready: `adr-0001-sequence-tube-map-panel.md` and `context-additions.md`.

> The ADR must carry the **explicit 1D↔3D correspondence flag** — `CLAUDE.md` requires any
> change that weakens the correspondence to be flagged rather than quietly implemented, and
> this adds a third space with no link to the other two.

## 2. `@types/three` — [#86](https://github.com/CAST-genomics/pgb/issues/86)

- [ ] Add `@types/three@^0.176.0`, delete the one-line `src/types/three.d.ts` shim
- [ ] Fix fallout in `src/app.ts`, `src/ribbonNode.ts`, `src/looks/*.ts`
- [ ] `npm run typecheck` clean, no new `any` or `@ts-expect-error`

> Separate PR so the migration stays reviewable. Without it, the incoming camera and
> frustum math arrives untyped — the fiddliest code in the whole migration.

## 3. Rename `track` → `strand` — [spike#60](https://github.com/CAST-genomics/sequence-tube-map-spike/issues/60)

**In the spike repo, not pgb.**

- [ ] Rename throughout `trackAppearance.ts`, `parseBands.ts`, tests, docs
- [ ] Leave `g.track` alone — that's UCSD's SVG class, with a comment saying so
- [ ] `npm test` passes
- [ ] All five `verify_*.mjs` Playwright scripts pass
- [ ] `grep -rn '\btrack\b' src/` returns only upstream-SVG references

> `track` already means PGB's **annotation track**, which is unrelated. Do it here, with
> the browser suite still available, because it isn't migrating.

## 4. Copy the viewer in — [#88](https://github.com/CAST-genomics/pgb/issues/88)

- [ ] Copy modules to `pgb/src/tubemap/` — **excluding** `main.ts`, `frameMeter.ts`,
      `nodeCatalog.ts` (harness scaffolding)
- [ ] Keep `fetchDocument.ts` as-is; do **not** route through `loadPath`
- [ ] Copy all 11 tests; add `// @vitest-environment jsdom` to the 7 that touch `document`
- [ ] Copy `stm-chr1-25331046-25331646.svg` (3.5 MB) as the test corpus — not the 14 MB ones
- [ ] Add the dev-only `?url=` route
- [ ] Do **not** migrate the Playwright `verify_*.mjs` scripts
- [ ] `npm test` + `npm run typecheck` clean; dev route renders fixture and a live URL

> Fetch without credentials — the endpoint pairs a wildcard origin with
> `allow-credentials: true`, which browsers reject. Error responses carry no CORS headers,
> so a 500 arrives as an opaque network failure.

## 5. Kill the `ColorManagement` global — [#89](https://github.com/CAST-genomics/pgb/issues/89)

- [ ] Delete the module-scope `ColorManagement.enabled = false`
- [ ] Pixel-diff the fixture render before/after — zero difference means done
- [ ] If it differs: set colour space **per material and per texture** instead
- [ ] Confirm PGB's 3D graph is visually unchanged

> This is the one thing an isolated scene graph does **not** isolate. PGB sets the flag
> `true` in `rendererFactory.js`, the viewer set it `false` at module scope, and one shared
> `three` means last-loader-wins globally. Never toggle it per frame — that makes
> correctness depend on render ordering.

## 6. URL builder + eligibility — [#90](https://github.com/CAST-genomics/pgb/issues/90)

- [ ] `buildSeqTubeMapURL({chrom, start, end, minigraphnode})` in `src/pangenomeURL.js`
- [ ] `tubeMapTargetForNode(node)` → target or `null`
- [ ] Strip orientation: PGB keys `"5519+"`, the API's `minigraphnode` takes `5519`
- [ ] Tests against `cici.json`, including **all 15 ineligible nodes returning `null`**
- [ ] Spot-check the derived interval against the known-good URL for node 5504

> Parameter gotchas: `pathnumoption` is load-bearing but only its *presence* matters (drop
> it and 369 strands become 46; any value works). `version=v2` and
> `nodewidthoption=compressed` are already server defaults, but an *unrecognised* value for
> either returns 500.
>
> The gate is not optional: the API answers an unknown node with **200 and a
> plausible-looking map** in a fallback 8-colour palette. Without it, an ineligible node
> shows a map that looks correct and is of different data.

## 7. `mountTubeMapPanel` — [#91](https://github.com/CAST-genomics/pgb/issues/91)

Model on `src/widgets/mountPclaiChart.js`.

- [ ] Self-created card DOM + `Draggable` header
- [ ] **Resize grip / CSS `resize`** — the requirement, not a nicety
- [ ] Fullscreen button (Fullscreen API); check for transformed/`contain`-ed ancestors
- [ ] Header: `5519 · chr1:25,331,046-25,331,646` via existing `formatLocus`/`formatLength`
- [ ] One panel, reused — a second node calls `open(url)`
- [ ] No navbar button
- [ ] Subscribe to `datasetLoaded` → **destroy**; release every unsubscribe
- [ ] Own render loop — do **not** attach to `App`'s `setAnimationLoop`
- [ ] `src/styles/_tubeMapPanel.scss`, imported by `app.scss`
- [ ] Verify: drag, resize and fullscreen all reframe the map correctly
- [ ] Verify: a locus change destroys it with no listener left behind

> Why resize matters: the camera is framed in device pixels, so fit-to-width is recomputed
> from the viewport on every resize along with the `[fit, 200×fit]` clamp. A fixed-size
> container makes that machinery inert.
>
> Accepted cost: a floating card occludes the graph it's meant to correspond to. A docked
> strip below the graph is the better home for a 14:1 map and is the intended **next**
> project — it means touching PGB's only resize path.

## 8. Context-menu item — [#92](https://github.com/CAST-genomics/pgb/issues/92)

- [ ] Third `<li data-action="sequence-tube-map">` in `src/contextMenuService.js`
- [ ] Branch in `handleContextMenuAction`
- [ ] Right-click only — leave left-click unclaimed
- [ ] Ineligible nodes: item **disabled with the reason**, not hidden
- [ ] Verify: eligible node opens; ineligible shows disabled + reason; second node reuses

**First point at which the feature is user-reachable.**

## 9. Archive the spike repo

- [ ] README → pointer to `pgb/src/tubemap/` and `pgb/docs/adr/0001`
- [ ] Re-file spike #50, #48, #32, #58 on pgb under #85; close there with links
- [ ] Leave spike #23 open-and-archived (UCSD's ~14 MB ceiling — theirs, not ours)
- [ ] Leave behind as the lab notebook: `SPEC.md`, `docs/RENDERING.md`, all 17 notes, the
      PNGs, the two 14 MB fixtures, and `CONTEXT.md` (its live constraints moved into the
      ADR; its reversal history and measurements are the record)
- [ ] GitHub-archive the repo

---

## Carried forward, not blocking

Re-filed on pgb at step 9. These are the surviving design questions, not spike bookkeeping:

- **spike #32** — strands with near-identical colours can't be told apart, at any zoom.
  The through-line: ~460 haplotypes in 120–150 distinct colours, four in five sharing one
  exactly, because the colours are PCLAI's shipped encoding for a chart where *position*
  does the separating.
- **spike #50** — a haplotype list beside the map, selecting strands by name
- **spike #48** — unscored strands should render hollow, not grey
- **spike #58** — a slow server should time out with a warning, not an indefinite spinner
