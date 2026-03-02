import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [],
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
                assetFileNames: 'assets/[name][extname]'
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
        esbuildOptions : {
            target: "es2020"
        }
    },

    base: '', // Use relative paths to ensure the app works in preview and deploys correctly
});
