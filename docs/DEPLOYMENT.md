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

**Delete the old files before unpacking the new ones. Do not unzip over the top of the
existing installation.**

PGB's JavaScript filenames contain a content hash — `assets/index-DSDOJ5fl.js`. Every
release produces a new filename. If you unzip over an existing install, the *old* files are
not removed, and the site ends up serving several versions at once:

```
assets/index-BjTEuFA2.js    ← October 2025
assets/index-CGrgtStC.js    ← May 2026
assets/index-CQQeYjFN.js    ← June 2026
assets/index-DSDOJ5fl.js    ← the version you just installed
```

Any browser that still has an older `index.html` cached will keep requesting the older
JavaScript file — and because that file is still sitting there, the server happily returns
it. The visitor sees a months-old version of the application with no error and no
indication anything is wrong. This has already happened once and cost several days of
confusion.

### Procedure

Assuming the site lives at `/var/www/pangenome` — substitute your actual document root.

```sh
# 1. Keep a rollback copy of the current install.
sudo mv /var/www/pangenome /var/www/pangenome.backup-$(date +%Y%m%d)

# 2. Unpack the new zip into a fresh directory.
mkdir -p /tmp/pgb-new && cd /tmp/pgb-new
unzip ~/pgb-vX.Y.Z.zip          # this creates a "dist" directory

# 3. Put it in place.
sudo mv /tmp/pgb-new/dist /var/www/pangenome
sudo chown -R apache:apache /var/www/pangenome    # or www-data:www-data on Debian/Ubuntu
sudo chmod -R a+rX /var/www/pangenome
```

No `systemctl restart` is needed. Apache picks up static files immediately.

Once it looks right, remove the backup directory at your convenience. Keeping it *next to*
the live directory is fine; do not leave it *inside* the live one.

### Apache configuration (one time only)

The zip contains a `.htaccess` file at the top level of `dist/`. It sets the caching rules
the application needs. **It only takes effect if overrides are enabled for that directory.**
Please confirm the site's `<Directory>` block contains `AllowOverride All` (or at minimum
`AllowOverride FileInfo Options Indexes`), and that `mod_headers` is enabled:

```sh
httpd -M | grep headers          # should print "headers_module (shared)"
```

If you would rather not enable `.htaccess` overrides, that is completely fine — just paste
the equivalent directives directly into the site's configuration instead:

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

- **`Options -Indexes`** turns off directory listing. `https://pangenome.ucsd.edu/assets/`
  is currently browsable by anyone.
- **Please do not enable transparent compression for `.bb`, `.bbi`, `.fai`, or `.tbi`
  files.** The application reads those by HTTP byte range, and compressing them in flight
  breaks the range arithmetic. The supplied config compresses only text formats.

### How to verify the deployment worked

Two checks, both quick.

**1. From your own machine, confirm no old bundles remain:**

```sh
ls /var/www/pangenome/assets/
```

There should be exactly one `index-*.js` and one `index-*.css`. If there are several, the
old install was not cleared — go back and do step 1.

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
cd dist && zip -r ../pgb-vX.Y.Z.zip . -x '.DS_Store' -x '**/.DS_Store'
```

Note the zip is made from *inside* `dist`, so it unpacks as a directory of files. The
procedure above assumes a top-level `dist/` in the archive — if you zip `dist` itself
(`zip -r pgb.zip dist`), keep it that way, but be consistent, and say which you did.

`find dist -name .DS_Store -delete` before zipping if the exclusions miss any.

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
