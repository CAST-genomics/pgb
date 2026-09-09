# Deploying PGB

PGB ships as a zip of static files. There is no build step, no runtime, no database on the
server — Apache serving a directory is the whole deployment.

This document has two audiences. The **first section is written to be sent, verbatim, to
whoever administers the web server**; it assumes nothing about PGB. The rest is for us.

---

## For the server administrator

Hello — this is the deployment procedure for PGB (the Pangenome Browser). It is a static
site: HTML, JavaScript, CSS, and data files. Nothing needs to be installed or restarted.

### The one thing that matters

**The zip is the entire site. Replace the served directory with it — do not merge, do not
unzip on top, do not preserve anything from the previous install.**

There is nothing in an existing PGB installation worth keeping. No uploaded content, no
generated files, no local state. Every file the site needs is in the archive. If a file is
present on the server and absent from the zip, it is stale by definition and must go.

That is not a stylistic preference. PGB's JavaScript filenames contain a content hash —
`assets/index-DSDOJ5fl.js` — so every release produces a *new* filename, and `unzip` has no
reason to remove the old one. Unpacking over an existing install therefore accumulates
versions rather than replacing them:

```
assets/index-BjTEuFA2.js    ← October 2025
assets/index-CGrgtStC.js    ← May 2026
assets/index-CQQeYjFN.js    ← June 2026
assets/index-DSDOJ5fl.js    ← the version you just installed
```

`index.html` is the only file that names which bundle to load, and it is *not* hashed — it
has the same name in every release. A browser holding a cached `index.html` from June asks
for June's bundle, that file is still sitting on disk, and the server returns it with a
`200`. The visitor gets a three-month-old application with no error, no fallback, and no
indication whatsoever that anything is wrong.

Delete the old files and that request returns `404` instead: the page fails loudly and
visibly, which is enormously preferable to failing silently. This has already happened once
at pangenome.ucsd.edu and cost days of confusion.

### Procedure

Assuming the site lives at `/var/www/pangenome` — substitute your actual document root.

```sh
# 1. Move the entire current install out of the way. Not "clean it up" — move all of it.
#    This is the rollback copy; keep it outside the document root, never inside it.
sudo mv /var/www/pangenome /var/www/pangenome.backup-$(date +%Y%m%d)

# 2. Unpack the zip somewhere clean. It contains a single "dist" directory.
rm -rf /tmp/pgb-new && mkdir -p /tmp/pgb-new && cd /tmp/pgb-new
unzip ~/pgb-vX.Y.Z.zip

# 3. That directory, exactly as unpacked, becomes the site.
sudo mv /tmp/pgb-new/dist /var/www/pangenome
sudo chown -R apache:apache /var/www/pangenome    # or www-data:www-data on Debian/Ubuntu
sudo chmod -R a+rX /var/www/pangenome
```

Step 1 is what makes this a replacement rather than a merge. Copying the new files *into*
the existing directory — `cp -r`, `rsync` without `--delete`, unzipping in place — all
reproduce the exact failure this procedure exists to prevent.

No `systemctl restart` is needed; Apache picks up static files immediately.

Delete the backup directory once the checks below pass. Keeping it *beside* the live
directory is fine; it must never end up *inside* it, or it becomes stale content served
under a live URL.

### Apache configuration (one time only)

The zip contains a `.htaccess` file at the top level of `dist/`. It sets the caching rules
the application needs. **It only takes effect if overrides are enabled for that directory.**
Please confirm the site's `<Directory>` block contains `AllowOverride FileInfo` (or
`AllowOverride All`), and that `mod_headers` is enabled:

```sh
httpd -M | grep headers          # should print "headers_module (shared)"
```

Every directive in the file is in Apache's `FileInfo` override class, so it cannot break
anything: with a narrower `AllowOverride` it is ignored and the site simply loses the
caching rules. There is no setting under which it causes an error.

If you would rather not enable `.htaccess` overrides at all, that is completely fine — just
paste the equivalent directives directly into the site's configuration instead:

```apache
<Directory /var/www/pangenome>
    Options -Indexes
    AllowOverride None

    <IfModule mod_headers.c>
        # index.html names the current JavaScript bundle and is the only unhashed,
        # changing file. It must be revalidated on every load, or browsers will keep
        # using an old copy and load an old version of the application.
        <FilesMatch "^index\.html$">
            Header set Cache-Control "no-cache, must-revalidate"
        </FilesMatch>

        # Everything in assets/ has a content hash in its filename, so its contents
        # never change. Safe to cache forever.
        <FilesMatch "-[A-Za-z0-9_-]{8,}\.(js|css|png|jpg|jpeg|svg|woff2?)$">
            Header set Cache-Control "public, max-age=31536000, immutable"
        </FilesMatch>

        # Data files change between releases but are not hashed.
        <FilesMatch "\.(json|tsv)$">
            Header set Cache-Control "public, max-age=3600, must-revalidate"
        </FilesMatch>
    </IfModule>
</Directory>
```

Two notes on this:

- **`Options -Indexes`** turns off directory listing, and appears only here rather than in
  the shipped `.htaccess`. `https://pangenome.ucsd.edu/assets/` is currently browsable by
  anyone, which is worth closing — but `Options` is a different override class from the
  caching directives, so a `.htaccess` carrying it returns a 500 for the whole directory
  wherever that class is not granted. It is a request to make in the server config, never
  a rule to ship in the archive.
- **Please do not enable transparent compression for `.bb`, `.bbi`, `.fai`, or `.tbi`
  files.** The application reads those by HTTP byte range, and compressing them in flight
  breaks the range arithmetic. The supplied config compresses only text formats.

### How to verify the deployment worked

Two checks, both quick.

**1. From your own machine, confirm the directory holds the new release and nothing else:**

```sh
ls /var/www/pangenome/assets/
```

Exactly two files: one `index-*.js` and one `index-*.css`. Any additional `index-*.js` is a
leftover from a previous release, which means the install was merged rather than replaced —
go back to step 1 and start over. Do not simply delete the extras; a directory that
accumulated bundles may have accumulated other stale files too, and the point is to be
certain rather than to tidy.

**2. From a browser, confirm the running version.** Open the site, click the ⓘ button in
the top-right of the navigation bar. It reports:

```
Running build: 2.8.0
Latest release: v2.8.0
```

**`Running build`** is read from inside the JavaScript that is actually executing, so it is
the true answer. If it disagrees with `Latest release`, the popover will say so explicitly.
Use a private/incognito window for this check so your own browser cache cannot mislead you.

That is everything. Thank you.

---

## For us

### Building the zip

```sh
npm ci
npm run build
find dist -name .DS_Store -delete
zip -r pgb-vX.Y.Z.zip dist
```

`dist` itself goes in, so the archive has a single top-level `dist/` directory — which is
what the administrator's procedure above unpacks and moves into place. Keep it that way:
an archive that explodes into loose files in the current directory is a different and much
worse accident on a live document root.

Confirm before sending:

```sh
unzip -l pgb-vX.Y.Z.zip | grep -cE 'dist/assets/index-.*\.(js|css)$'   # expect 2
```

### Why the version reporting works the way it does

`initializeInfoButton` in `src/main.js` shows two numbers, and the distinction is the whole
point:

- **`Running build`** — `buildVersion()`, which returns `__APP_VERSION__`, a Vite `define`
  that freezes `package.json`'s version into the bundle at build time. It travels *inside*
  the JavaScript, so a browser executing a stale bundle reports that stale bundle's
  version.
- **`Latest release`** — `fetchLatestRelease()`, a call to the GitHub releases API. This is
  a property of the repository, not of the deployment.

Before this was fixed the popover showed *only* the GitHub number, labelled "Current
Release". That made every deployment of every age report the newest tag, which is precisely
backwards from what the button is for. If you ever find yourself tempted to simplify these back into
one number, the number to keep is `Running build`.

### Diagnosing a "the hosted site is missing a feature" report

In order, and each one is cheap:

1. **Ask for the ⓘ popover's `Running build` line.** If it is behind, that is the answer.
2. **`curl -s https://<host>/ | grep 'index-'`** — which bundle does the served
   `index.html` name?
3. **`curl -sI https://<host>/assets/index-<hash>.js`** and compare its `md5` to the local
   `dist/`. Identical bytes means the server is correct and the problem is client-side
   cache.
4. **`curl -s https://<host>/assets/`** — if directory listing is still on, stale bundles
   are visible directly.
5. **Load the site in a fresh Playwright browser.** No cache, no extensions. If the feature
   is present there, it is deployed and the reporter needs a cache-bypassing reload.
