# Release process

PGB ships as a tagged GitHub release. There is no npm publish and no deploy step in this
repo — a release is a **git tag**, a **release page**, and a **version in `package.json`**
that agrees with both.

Releases so far: `v2.5.0`, `v2.6.0`, `v2.7.0`. The tag is the version with a leading `v`.

## Where the version lives

`package.json`'s `version` field is the single source of truth for "what version is this
app". Two things about it are specific to this repo and worth knowing before you touch it:

- **`"private": true`** — the package is never published to npm. Nothing outside this repo
  reads the version, so bumping it is a bookkeeping act, not a release trigger. It matters
  because it is what a reader checks to answer "which release is this working tree?".
- **`package-lock.json` is gitignored** (`.gitignore:10`). `npm version` rewrites the
  lockfile's copy of the version too, but that change is invisible to git. Only
  `package.json` appears in the commit. This is fine — just don't go looking for the
  lockfile in `git status`.

`version` was `0.0.0` from the start of the project through the `v2.7.0` tag; the field was
adopted after that release and set to `2.7.0` retroactively. So `v2.7.0`'s tagged commit
still reads `0.0.0`. From `v2.8.0` onward the bump commit precedes the tag, per the
sequence below.

## Choosing the number

Semantic versioning, read against PGB's own surfaces rather than a public API:

| Bump | When | Example |
|---|---|---|
| **major** (`3.0.0`) | A dataset format is dropped, or a change breaks how existing users drive the app | dropping v1/v2 dataset support would have been one, had it not shipped inside `v2.6.0` |
| **minor** (`2.8.0`) | New capability, additive | the tube map panel (`v2.7.0`), Assembly Walk mode (`v2.6.0`) |
| **patch** (`2.7.1`) | Fixes only, no new capability | a raycast regression fix |

A large feature is still a **minor** bump if it takes nothing away. The tube map panel was a
whole new viewer and went out as `2.7.0`, because no dataset, Look, or event-bus contract
changed under it. Reach for major only when something a user relies on stops working.

## The sequence

Run from a clean `main` that is in sync with `origin`.

1. **Confirm the working tree is clean and pushed.** `npm version` refuses to run on a dirty
   tree, and a tag on an unpushed commit points at nothing anyone else can fetch.

   ```sh
   git status --short          # expect no output
   git log origin/main..HEAD   # expect no output
   ```

2. **Check the build and tests pass.** The tag is a promise that this commit works.

   ```sh
   npm run typecheck && npm test && npm run build
   ```

3. **Bump the version.** `npm version <major|minor|patch>` edits `package.json`, commits it,
   and creates the annotated tag — all three in one step, with the tag named `vX.Y.Z` to
   match the existing convention.

   ```sh
   npm version minor -m "v%s"   # %s is replaced with the new version
   ```

   Pass `--no-git-tag-version` if you want the file edited without the commit and tag — the
   escape hatch used when the version is being corrected rather than released.

4. **Push the commit and the tag.** Tags are not pushed by `git push` alone.

   ```sh
   git push origin main
   git push origin vX.Y.Z
   ```

5. **Write the release notes**, following the shape below, into a file. Keep it out of the
   repo — the release page is where it lives.

6. **Publish the release page.**

   ```sh
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <path> --latest
   ```

7. **Verify.** `gh release list` — the new tag should read `Latest`.

To correct notes after publishing: `gh release edit vX.Y.Z --notes-file <path>`. Do **not**
move or re-point a tag that has a published release; cut a patch release instead.

## What the notes say

Gather the material first — the release page is the only place the arc of a release is
written down, so it is worth more than a commit dump.

```sh
git log --oneline vPREV..HEAD
gh pr list --state merged --limit 40 --json number,title,mergedAt \
  -q '.[] | "#\(.number)\t\(.mergedAt)\t\(.title)"'
gh issue list --state all --limit 40 --json number,title,state \
  -q '.[] | "#\(.number)\t[\(.state)]\t\(.title)"'
```

Structure, as established by `v2.6.0` and `v2.7.0`:

- **A `## What's New` heading**, then one `###` section per theme — not per PR. The headline
  feature leads, with a short prose paragraph saying what a researcher can now do; the rest
  are bulleted.
- **Every bullet cites its issue and PR numbers** (`(#90, #97)`). This is how a reader gets
  from the release page to the reasoning.
- **Link the ADRs** any major feature rests on. The release page is most people's entry
  point to `docs/adr/`.
- **A `## Known limitations` section** listing the open issues a user will actually hit.
  Naming them is more useful than letting them be discovered.
- **A `**Full Changelog**` line**: `https://github.com/CAST-genomics/pgb/compare/vPREV...vNEW`.

When work was developed in a companion repo — as the tube map was in
[`sequence-tube-map-spike`](https://github.com/CAST-genomics/sequence-tube-map-spike) —
cite that repo's issue numbers too, marked as such (`spike #42`), and say where they live.
Open questions still being worked out there belong under *Known limitations*.
