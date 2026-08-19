/**
 * pangenomeURL.js — request URL construction for the pangenome API.
 *
 * Kept free of DOM and app imports so it can be unit-tested in the default
 * node environment; locusInput.js is the only consumer.
 */

const pangenomeURLTemplate = `http://pangenome-api.ucsd.edu:8000/json?chrom=_CHR_&start=_START_&end=_END_&graphtype=minigraph&version=v2&debug_small_graphs=false&minnodelen=5&nodeseglen=20&edgelen=5&nodelenpermb=1000`

/**
 * Build a pangenome API request URL.
 *
 * `linear` and `assembly` are appended only for linear layout. Force layout
 * omits both rather than sending `linear=false`, so the URL is byte-identical
 * to what the app has always requested.
 *
 * @param {Object} [layout] - { mode: 'linear' | 'force', spineAssembly: string | null }
 */
export function buildPangenomeURL(chr, startBP, endBP, version, layout) {
    const path = pangenomeURLTemplate
        .replace('_CHR_', chr)
        .replace('_START_', startBP)
        .replace('_END_', endBP)
        .replace('_VERSION_', version);

    if (layout?.mode === 'linear' && layout.spineAssembly) {
        //bp_scaled_spine defaults to true, can change should this become a toggle at some point
        return `${path}&linear=true&assembly=${encodeURIComponent(layout.spineAssembly)}&bp_scaled_spine=true`;
    }

    return path;
}
