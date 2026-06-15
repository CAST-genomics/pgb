# Hosting Notes — pangenome.ucsd.edu

_Findings from passive reconnaissance of the public deployment, 2026-05-21._
_All data gathered via non-intrusive DNS / HTTP / TLS lookups against the public URL._

## Summary

The published app is a **static Vite build** served from a **single Rocky Linux + Apache
2.4 VM inside the San Diego Supercomputer Center (SDSC)**. There is no CDN, no reverse
proxy, no application server, and no container orchestration. Deploying an update means
copying a `dist/` build onto that one box. The site has not been updated since its last
deploy on **2025-10-03**.

## Network & location

| Property | Value |
|---|---|
| Hostname | `pangenome.ucsd.edu` |
| IPv4 | `132.249.225.83` (single A record; no IPv6, no CNAME) |
| DNS TTL | 86400s (24h), served by UCSD nameservers |
| IP owner | `132.249.0.0/16` — NetName **SDSC**, "San Diego Supercomputer Center", La Jolla, CA |
| Reverse DNS | `pangenome.ucsd.edu` |

Traceroute confirms the box is physically inside SDSC's network: the path enters via
CENIC (California's research/education network) and passes through `medusa-mx960.sdsc.edu`
and `ffw.sdsc.edu` (an SDSC firewall) before reaching the host. Not a cloud provider.

## The server

| Property | Value |
|---|---|
| Software | `Apache/2.4.62 (Rocky Linux) OpenSSL/3.5.1` |
| Protocol | HTTP/1.1 only — **HTTP/2 not enabled** (advertised `h2` in ALPN, fell back to 1.1) |
| Methods | `Allow: HEAD,GET,POST,OPTIONS,TRACE` |
| Architecture | Plain Apache httpd serving files from disk — no proxy, CDN, or app server |

## TLS

| Property | Value |
|---|---|
| Subject | CN `pangenome.ucsd.edu`, O "University of California, San Diego" |
| Issuer | **InCommon RSA Server CA 2** (Internet2's CA — standard for `.edu` institutions) |
| Validity | **2025-10-02 → 2026-10-02** |
| Key / protocol | RSA 2048-bit, TLS 1.3 |

Appears to be a manually-issued 1-year InCommon cert, **not** auto-renewing Let's Encrypt.
Renewal before Oct 2026 is a manual task someone must own.

## What is deployed

- A **static Vite build**: a single `index.html` plus `/assets/index-<hash>.js` (~759K)
  and `/assets/index.css` (~8K). No backend.
- Every file shares `Last-Modified: 2025-10-03 20:58:10 GMT` — the **last deploy date**.
- `/assets/` has **Apache directory listing enabled** (browsable index of build artifacts).
- No `robots.txt`, no `version.json`/`release.json`.
- `.git` directory is **not** exposed (`/.git/HEAD` → 404). Good.
- Plain `http://` serves the site directly (200, not a redirect to HTTPS).

## Data sources (not hosted on this box)

The SDSC box hosts only the app shell. Pangenome JSON data is **not** served from it
(`/public/hprc-project/...` → 404). Data is fetched at runtime from external hosts baked
into the bundle:

- UCSC — `hgdownload.soe.ucsc.edu`, `genome.ucsc.edu`
- `1000genomes.s3.amazonaws.com`
- Google Drive

The "Release Information" popover fetches `https://api.github.com/repos/CAST-genomics/pgb/releases/latest`,
so the public source/releases live at GitHub **`CAST-genomics/pgb`**.

## Open questions for the hosting admin

1. **Deploy mechanism** — how does a new build reach the box (scp / rsync / CI)?
   Who has access, and what is Apache's `DocumentRoot`?
2. **Cert renewal** — who owns the InCommon cert renewal before 2026-10-02, and is it
   automated?
3. **HTTP → HTTPS** — should plain `http://` redirect to `https://` rather than serving
   directly?
4. **Hardening (minor)** — `TRACE` is enabled and `/assets/` directory listing is on;
   both are trivially disabled in Apache config if desired.
