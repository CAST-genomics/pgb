import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// The version the *bundle* was built from. Baked in at build time so the running app can
// state its own identity — see `src/utils/utils.js` `buildVersion`. Read from disk rather
// than imported so the config stays plain ESM with no JSON-module assertion.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
    plugins: [],
    define: {
        __APP_VERSION__: JSON.stringify(version),
    },
    resolve: {
        alias: {
            'igv-utils': new URL('./node_modules/igv-utils/src/index.js', import.meta.url).pathname,
        },
    },
    build: {
        target: 'es2020',
        assetsDir: 'assets', // Organizes assets in a specific folder in the build output
        rollupOptions: {
            output: {
                // Content-hashed, including the CSS. An unhashed `index.css` survives in
                // browser caches across deploys under the old name and silently pairs old
                // styles with a new bundle — the same stale-cache failure the JS hash
                // exists to prevent.
                assetFileNames: 'assets/[name]-[hash][extname]'
            }
        }
    },
    css: {
        preprocessorOptions: {
            scss: {
                api: 'modern-compiler', // or "modern", "legacy"
                importers: [
                    // ...
                ],
            },
        },
    },
    optimizeDeps: {
        rolldownOptions: {
            transform: {
                target: "es2020"
            }
        }
    },

    base: '', // Use relative paths to ensure the app works in preview and deploys correctly

    test: {
        environment: 'node',
    },
});
