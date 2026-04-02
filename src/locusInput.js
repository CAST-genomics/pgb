import { template, ELEMENT_IDS } from './locusInput.template.js';
import { prettyPrint } from './utils/utils.js';
import {searchFeatures} from "./igvCore/search/geneSearch.js"
import {defaultGenome} from "./main.js"

// Regular expressions for parsing genomic loci and URLs
const LOCUS_PATTERN = { REGION: /^(chr[0-9XY]+):([0-9,]+)-([0-9,]+)$/i };
const URL_PATTERN = /^https?:\/\/.+/i;
// Pattern to detect local file paths (relative paths starting with / or ./ or containing .json)
const LOCAL_FILE_PATTERN = /^(\/|\.\/).*\.json$/i;

const default_domain = 'pangenome-api.ucsd.edu:8000';
const hprc_domain = '3.145.184.140:8443';
const current_domain = hprc_domain;

const pangenomeURLTemplate = `https://${current_domain}/json?chrom=_CHR_&start=_START_&end=_END_&graphtype=minigraph&version=_VERSION_&api=v2&pca=assembly&debug_small_graphs=false&minnodelen=5&nodeseglen=20&edgelen=5&nodelenpermb=1000`

class LocusInput {
    constructor(container, sceneManager) {
        this.container = container;
        this.sceneManager = sceneManager;
        this.version = 'v2';
        this.render();
        this.setupEventListeners();
    }

    getUrlParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }

    render() {
        this.container.innerHTML = template;
        this.inputElement = this.container.querySelector(`#${ELEMENT_IDS.INPUT}`);
        this.goButton = this.container.querySelector(`#${ELEMENT_IDS.GO_BUTTON}`);
        this.errorDiv = this.container.querySelector(`#${ELEMENT_IDS.ERROR}`);
        this.versionDropdown = this.container.querySelector(`#${ELEMENT_IDS.VERSION_DROPDOWN}`);
        this.versionDropdown.value = this.version;
    }

    setupEventListeners() {
        const handleLocusUpdate = async () => {
            const candidateInput = this.inputElement.value.trim()

            // First check if it's a URL
            if (this.isUrl(candidateInput)) {
                await this.ingestUrl(candidateInput);
                return;
            }

            // Then check if it's a local file path
            if (this.isLocalFile(candidateInput)) {
                const normalizedPath = this.normalizeLocalFilePath(candidateInput);
                await this.ingestUrl(normalizedPath);
                return;
            }

            // Then check if it's a locus
            const locus = this.processLocusInput(candidateInput);
            if (locus) {
                await this.ingestLocus(locus.chr, locus.startBP, locus.endBP);
            } else {
                // Finally try gene name search
                const result = await searchFeatures({ genome: defaultGenome }, candidateInput)
                if (result) {
                    const { chr, start, end, name } = result
                    await this.ingestLocus(chr, start, end);
                } else {
                    this.showError(`Invalid input format. Please enter a locus (e.g., chr1:25240000-25460000), gene name, URL, or local file (e.g., daz1.json or /public/daz1.json). Files should be placed in the public/ directory.`);
                }
            }
        };

        this.inputElement.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleLocusUpdate();
            }
        });

        this.goButton.addEventListener('click', handleLocusUpdate);

        // Add event listener for version dropdown
        this.versionDropdown.addEventListener('change', (e) => {
            this.version = e.target.value;
            console.log('Version changed to:', this.version);
        });
    }

    isUrl(value) {
        return URL_PATTERN.test(value);
    }

    isLocalFile(value) {
        // Check if it's a relative path starting with / or ./ and ends with .json
        // Also allow paths without leading slash if they contain .json (for files in public/)
        // Or bare filenames ending in .json (e.g., "daz1.json")
        return LOCAL_FILE_PATTERN.test(value) ||
               (value.includes('.json') && !value.includes('://')) ||
               /^[^\/\\]+\.json$/i.test(value); // Bare filename like "daz1.json"
    }

    normalizeLocalFilePath(value) {
        // Vite serves files from public/ at the root, so strip /public/ if present
        // e.g., "/public/hprc-project/hello-hprc.json" -> "/hprc-project/hello-hprc.json"
        if (value.startsWith('/public/')) {
            value = value.replace(/^\/public/, '');
        } else if (value.startsWith('./public/')) {
            value = value.replace(/^\.\/public/, '');
        } else if (value.startsWith('public/')) {
            value = '/' + value.replace(/^public/, '');
        }

        // If it's a bare filename (no path separators), prepend / to make it work with Vite's public directory
        // Files in public/ are served at the root, so "daz1.json" should become "/daz1.json"
        if (/^[^\/\\]+\.json$/i.test(value)) {
            return '/' + value;
        }
        // If it doesn't start with / or ./, prepend / for consistency
        if (!value.startsWith('/') && !value.startsWith('./')) {
            return '/' + value;
        }
        return value;
    }

    processLocusInput(value) {
        // Reset error state
        this.inputElement.classList.remove('is-invalid');
        this.errorDiv.style.display = 'none';

        if (!value) {
            this.showError('Please enter a genomic locus, gene name, or URL');
            return null;
        }

        // TODO: Implement gene name search
        // TODO: Use defaultGenome declared in main.js
        // let { chr, start, end, name } = await searchFeatures({ genome }, 'brca2')

        const result = value.match(LOCUS_PATTERN.REGION);
        if (result) {
            let [_, chr, startBP, endBP] = result;
            startBP = LocusInput.parsePosition(startBP);
            endBP = LocusInput.parsePosition(endBP);

            if (startBP === null || endBP === null) {
                this.showError(`Invalid base pair position format ${value}`);
                return null;
            }

            if (startBP >= endBP) {
                this.showError(`Start position must be less than end position ${value}`);
                return null;
            }

            return { chr, startBP, endBP };
        } else {
            // this.showError(`Invalid locus format value: ${value}`);
            return null;
        }
    }

    showError(message) {
        console.error(message)
        this.inputElement.classList.add('is-invalid');
        this.errorDiv.textContent = message;
        this.errorDiv.style.display = 'block';
    }

    async ingestLocus(chr, startBP, endBP) {
        const path = pangenomeURLTemplate
        .replace('_CHR_', chr)
        .replace('_START_', startBP)
        .replace('_END_', endBP)
        .replace('_VERSION_', this.version);
        console.log('path:', path);
        await this.sceneManager.handleSearch(path);
    }

    normalizeDropboxUrl(url) {
        // Dropbox shared links with dl=0 return HTML preview pages, not raw files
        // We need to change dl=0 to dl=1 to get the direct download
        if (url.includes('dropbox.com') && url.includes('dl=0')) {
            // Replace dl=0 with dl=1 (handles both &dl=0 and ?dl=0 cases)
            return url.replace('dl=0', 'dl=1');
        }
        return url;
    }

    async ingestUrl(url) {
        // Reset error state
        this.inputElement.classList.remove('is-invalid');
        this.errorDiv.style.display = 'none';

        // Normalize Dropbox URLs to use direct download
        const normalizedUrl = this.normalizeDropboxUrl(url);

        try {
            await this.sceneManager.handleSearch(normalizedUrl);
        } catch (error) {
            // Display error in the locus input widget
            this.showError(`Failed to load URL: ${error.message}`);
            throw error; // Re-throw so app.showError can also display it
        }
    }

    static parsePosition(pos) {
        try {
            // Remove commas and convert to number
            return parseInt(pos.replace(/,/g, ''), 10);
        } catch {
            console.error(`Error parsing position: ${pos}`);
            return null;
        }
    }

    static parseLocusString(locusString) {
        const match = locusString.match(LOCUS_PATTERN.REGION);
        if (match) {
            return { chr: match[1], startBP: LocusInput.parsePosition(match[2]), endBP: LocusInput.parsePosition(match[3]) };
        }
        return null;
    }

    static prettyPrintLocus(locus) {
        const { chr, startBP, endBP } = locus;
        return `${chr}:${prettyPrint(startBP)}-${prettyPrint(endBP)}`;
    }

    /**
     * Initialize the locus input from URL parameters and/or configuration.
     * This handles the initial loading of locus data when the app starts.
     * @param {Object} config - Application configuration object
     */
    async initializeFromConfig(config) {
        // Check for URL parameter first (highest priority)
        const urlParameter = this.getUrlParameter('locus');
        let locus = null;

        if (urlParameter) {
            // URL parameter takes precedence over config
            this.inputElement.value = urlParameter;
            locus = this.processLocusInput(this.inputElement.value);
            if (locus) {
                await this.ingestLocus(locus.chr, locus.startBP, locus.endBP);
            } else {
                // If it's not a valid locus, try treating it as a URL or local file
                if (this.isUrl(urlParameter)) {
                    await this.ingestUrl(urlParameter);
                } else if (this.isLocalFile(urlParameter)) {
                    const normalizedPath = this.normalizeLocalFilePath(urlParameter);
                    await this.ingestUrl(normalizedPath);
                } else {
                    this.showError(`Invalid locus url parameter: ${urlParameter}`);
                }
            }
        } else if (config?.preload?.enabled) {
            // Use config preload if enabled and no URL parameter
            this.inputElement.value = config.preload.locus;
            locus = this.processLocusInput(this.inputElement.value);
            if (locus) {
                await this.ingestLocus(locus.chr, locus.startBP, locus.endBP);
            } else {
                // If config locus is invalid, try treating it as a URL or local file
                if (this.isUrl(config.preload.locus)) {
                    await this.ingestUrl(config.preload.locus);
                } else if (this.isLocalFile(config.preload.locus)) {
                    const normalizedPath = this.normalizeLocalFilePath(config.preload.locus);
                    await this.ingestUrl(normalizedPath);
                } else {
                    this.showError(`Invalid preload locus in configuration: ${config.preload.locus}`);
                }
            }
        }
        // If config.preload.enabled is false and no URL parameter, skip preloading (blank screen)
    }

}

export default LocusInput;
