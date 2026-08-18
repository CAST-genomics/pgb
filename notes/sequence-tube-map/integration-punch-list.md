# Sequence Tube Map — Integration Punch List

**Status:** In progress. Steps 1–4 landed 2026-08-17 and step 5 on 2026-08-18; four remain.
Tick items here as they land, and update this line when the work is done.
**Date:** 2026-08-17
**Decisions:** `docs/adr/0001-sequence-tube-map-panel.md` — that ADR, not
this note, is the normative record. This is a working checklist and licenses nothing.
**Upstream:** the API's shape now lives in `buildSeqTubeMapURL()`, `parseBands.ts` and
`parseSegmentBoxes.ts`, and the upstream contact is recorded in the ADR. The prose
description that preceded them (`sequence-tube-map-api.md`) was retired as superseded.

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

- [x] Create `docs/adr/0001-sequence-tube-map-panel.md` (creates `docs/adr/`, which is
      declared normative but has no files yet)
- [x] One-line pointer in `CLAUDE.md`'s Looks section
- [x] `CONTEXT.md`: add `band`, `segment`, `sequence tube map`, `strand`, `tube map panel`
- [x] `CONTEXT.md`: append the **minigraph node** alias + oriented-id/bare-id paragraph to
      the existing `node` entry
- [x] Migrate the spike's `docs/adr/0001-webgl-band-renderer.md` — renumbered
      `docs/adr/0002-webgl-band-renderer.md`, since `0001` is the panel decision — and
      `docs/DISAMBIGUATING-STRANDS.md` as
      `notes/sequence-tube-map/disambiguating-strands.md`, which is a note rather than an
      ADR because it decides nothing

> The ADR must carry the **explicit 1D↔3D correspondence flag** — `CLAUDE.md` requires any
> change that weakens the correspondence to be flagged rather than quietly implemented, and
> this adds a third space with no link to the other two.

## 2. `@types/three` — [#86](https://github.com/CAST-genomics/pgb/issues/86)

- [x] Add `@types/three@^0.176.0`, delete the one-line `src/types/three.d.ts` shim
- [x] Fix fallout in `src/app.ts`, `src/ribbonNode.ts`, `src/looks/*.ts`
- [x] `npm run typecheck` clean, no new `any` or `@ts-expect-error`

> Separate PR so the migration stays reviewable. Without it, the incoming camera and
> frustum math arrives untyped — the fiddliest code in the whole migration.

## 3. Rename `track` → `strand` — [spike#60](https://github.com/CAST-genomics/sequence-tube-map-spike/issues/60)

**In the spike repo, not pgb.**

- [x] Rename throughout `trackAppearance.ts`, `parseBands.ts`, tests, docs
- [x] Leave `g.track` alone — that's UCSD's SVG class, with a comment saying so
- [x] `npm test` passes
- [x] All five `verify_*.mjs` Playwright scripts pass
- [x] `grep -rn '\btrack\b' src/` returns only upstream-SVG references

> `track` already means PGB's **annotation track**, which is unrelated. Do it here, with
> the browser suite still available, because it isn't migrating.

## 4. Copy the viewer in — [#88](https://github.com/CAST-genomics/pgb/issues/88)

- [x] Copy modules to `pgb/src/tubemap/` — **excluding** `main.ts`, `frameMeter.ts`,
      `nodeCatalog.ts` (harness scaffolding)
- [x] Keep `fetchDocument.ts` as-is; do **not** route through `loadPath`
- [x] Copy all 11 tests — **no jsdom pragma proved necessary**, see below
- [x] Copy `stm-chr1-25331046-25331646.svg` (3.5 MB) as the test corpus — not the 14 MB ones
- [x] Add the dev-only `?url=` route — `dev/tubemap.html` + `src/devTubeMapRoute.ts`
- [x] Do **not** migrate the Playwright `verify_*.mjs` scripts
- [x] `npm test` + `npm run typecheck` clean; dev route renders fixture and a live URL

> Fetch without credentials — the endpoint pairs a wildcard origin with
> `allow-credentials: true`, which browsers reject. Error responses carry no CORS headers,
> so a 500 arrives as an opaque network failure.

Four things came out other than as written, all decided during the copy:

- **No test needed jsdom.** The estimate of seven counted the word *document* where the
  modules use it for the SVG they parse. The parsers are regex kernels over a string;
  `surfacePointer` and `segmentOverlay` name DOM types but the functions under test are
  arithmetic. All 11 files pass under the suite's `node` environment, so the suite still
  covers pure kernels only and this migration did not open a new category.
- **`spikeIsGone.test.ts` became `harnessIsGone.test.ts`.** The original asserted the spike
  repo's throwaway `spike/` directory was gone — a statement about that repo's history, and
  vacuous here. Repointed at the boundary this repo does have: none of the three excluded
  harness modules is present under `src/tubemap/`, and nothing imports one. Same count.
- **The fixture lives in `src/tubemap/__tests__/fixtures/`, not `public/`.** Vite copies
  `public/` into `dist/` verbatim, so parking test data there adds 3.5 MB to every deploy
  for a page that is not in the build. Under `src/` the tests read it off disk and the dev
  server serves it at the same path; `dist/` never sees it.
- **`tsconfig.json` gained `"types": ["node"]` and `@types/node`**, for the fixture reads.
  The tests' five `replaceAll` calls became global-regex `replace` instead of widening
  `lib` to ES2021 — a copy should not move the repo's language floor.

## 5. Kill the `ColorManagement` global — [#89](https://github.com/CAST-genomics/pgb/issues/89)

- [x] Delete the module-scope `ColorManagement.enabled = false`
- [x] Pixel-diff the fixture render before/after — zero difference means done
- [x] If it differs: set colour space **per material and per texture** instead — it did not
      differ, so nothing per material or per texture was needed
- [x] Confirm PGB's 3D graph is visually unchanged

Landed 2026-08-18. Both renders — the fixture at `/dev/tubemap.html` and PGB's own graph on
`/datasets/api-v3/cici.json` — are byte-identical either side of the deletion, screenshotted
through Playwright at device scale. So the flag was defensive rather than load-bearing, as
the ADR expected: the bands are a `RawShaderMaterial`, which three appends no conversion to,
over a `DataTexture` left at `NoColorSpace`, and the only `Color` values in the path are the
white and black it clears to. `outputColorSpace` stays — it is set per renderer, not
globally. `colorManagementIsUntouched.test.ts` guards against the assignment coming back,
whether under `src/tubemap/` or through a module the viewer imports.

> This is the one thing an isolated scene graph does **not** isolate. PGB sets the flag
> `true` in `rendererFactory.js`, the viewer set it `false` at module scope, and one shared
> `three` means last-loader-wins globally. Never toggle it per frame — that makes
> correctness depend on render ordering.

## 6. URL builder + eligibility — [#90](https://github.com/CAST-genomics/pgb/issues/90)

- [x] `buildSeqTubeMapURL({chrom, start, end, minigraphnode})` — in `src/pangenomeURL.ts`,
      not `.js`: the file did not exist, and a new file is TypeScript (`CLAUDE.md`). The
      `/json` template the issue expected to find beside it is still inline in
      `src/locusInput.js`; moving it is a separate change and was left alone.
- [x] `tubeMapTargetForNode(node)` → target or `null`
- [x] Strip orientation: PGB keys `"5519+"`, the API's `minigraphnode` takes `5519`
- [x] Tests against `cici.json`, including **all 15 ineligible nodes returning `null`**
- [x] Spot-check the derived interval against the known-good URL for node 5504

Landed 2026-08-18. The interval comes from the node's `GRCh38` assembly entry, falling back
to `default_range` when there is none; a test holds the two to agreement on all 30 eligible
nodes of `cici.json`, and the gate is checked to catch exactly the 15 ineligible ones.

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
