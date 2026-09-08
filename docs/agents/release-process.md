# Release process

PGB ships as a tagged GitHub release. There is no npm publish and no automated deploy in
this repo — a release is a **git tag**, a **release page**, a **version in `package.json`**
that agrees with both, and the **`release` branch** moved forward to that same commit.

Releases so far: `v2.5.0`, `v2.6.0`, `v2.7.0`. The tag is the version with a leading `v`.

The tag and the release page are the record; the `release` branch is the thing that
actually ships. See [The `release` branch](#the-release-branch).

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

## The `release` branch

`release` is the branch the hosting facility gets. Shipping is manual — the tree is
archived into a tarball and handed over out of band — so nothing in this repo reads the
branch automatically. Its job is to be an unambiguous answer to "what is running out
there?", separate from `main`, which moves continuously.

Three properties define it:

- **`release` only ever points at a commit that is already on `main` and already tagged.**
  Nothing is authored on `release`. It is a bookmark, not a line of development.
- **It moves by fast-forward.** `git merge --ff-only main` is the whole operation. Because
  the branch has no commits of its own, this always succeeds — and if it ever fails, that
  is the signal that someone committed directly to `release`, which is the one thing this
  arrangement forbids. Resolve that before shipping; do not reach for a merge commit to
  paper over it.
- **The tag comes along for free.** Fast-forwarding to the tagged commit makes `vX.Y.Z`
  reachable from `release`, so `git describe` on a checkout of the branch names the
  release. This is why the merge happens *after* the tag exists rather than before.

Blessing the branch is a deliberate, separate act from tagging. A tag says "this commit
builds and is what we called `v2.8.0`". Moving `release` says "and this is the one we are
handing to the hosting facility." Usually the same commit, on the same afternoon — but
keeping them as two steps leaves room to tag a release and hold off shipping it.

`release` lagged `main` by a wide margin before this procedure was written; its last
movement was `#81` in June 2026, and it does not contain `v2.7.0`. No catch-up work is
needed — the first fast-forward under this procedure brings it current in one step.

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

8. **Bless the release branch.** This is what the hosting facility receives.

   ```sh
   git checkout release
   git pull --ff-only origin release
   git merge --ff-only main
   git push origin release
   git checkout main
   ```

   `--ff-only` on both the pull and the merge is deliberate: it refuses rather than
   inventing a merge commit. If either one is rejected, stop and read [The `release`
   branch](#the-release-branch) — something has been committed to `release` directly, and
   the shipped tree has diverged from the tagged one.

   Confirm the branch landed where you meant it to:

   ```sh
   git rev-parse release vX.Y.Z^{commit}   # expect two identical hashes
   ```

9. **Build the zip and send it, with the deployment instructions.** Done from `release`,
   not from `main`. [`docs/DEPLOYMENT.md`](../DEPLOYMENT.md) has the build command and — in
   its first section, written to be forwarded verbatim — the procedure the server
   administrator follows.

   Send that section every time, not just the first. Its load-bearing instruction is
   *clear the old directory before unpacking*: the bundle filenames are content-hashed, so
   unzipping over an existing install leaves every previous release in place, and a browser
   holding a stale `index.html` will keep loading one of them. That failure is silent — the
   site works, it is simply an old version of it.

To correct notes after publishing: `gh release edit vX.Y.Z --notes-file <path>`. Do **not**
move or re-point a tag that has a published release; cut a patch release instead. The same
applies to `release`: to un-ship something, move it forward to a new tagged commit, never
backward or sideways.

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
