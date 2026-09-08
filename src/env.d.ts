/**
 * Build-time constants injected by Vite's `define` (see `vite.config.js`).
 *
 * `__APP_VERSION__` is `package.json`'s `version` frozen into the bundle. It is read
 * through `buildVersion()` in `src/utils/utils.js` rather than directly, so the one place
 * that has to cope with it being absent — a bundle built by some other tool — is there.
 */
declare const __APP_VERSION__: string
