/**
 * PangenomeResourceService - Singleton service for managing assembly metadata files
 * 
 * This service loads, organizes, and hosts the files in public/assembly_metadata.
 * Key organizational structure:
 * - grouped vs non-grouped metadata
 * - v1 vs v2 versions
 */
class PangenomeResourceService {
    constructor() {
        if (PangenomeResourceService.instance) {
            return PangenomeResourceService.instance;
        }

        this.metadataCache = new Map();
        this.isInitialized = false;
        this.basePath = '/assembly_metadata/';
        
        // File structure mapping
        this.fileMap = {
            v1: {
                grouped: 'hprc_assembly_metadata_grouped_v1.0.json',
                nonGrouped: 'hprc_assembly_metadata_v1.0.json'
            },
            v2: {
                grouped: 'hprc_assembly_metadata_grouped_v2.0.json',
                nonGrouped: 'hprc_assembly_metadata_v2.0.json'
            }
        };

        PangenomeResourceService.instance = this;
    }

    /**
     * Initialize the service by loading all metadata files
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            const loadPromises = [];
            
            // Load all versions and types
            for (const version of ['v1', 'v2']) {
                for (const type of ['grouped', 'nonGrouped']) {
                    const fileName = this.fileMap[version][type];
                    const cacheKey = `${version}_${type}`;
                    
                    loadPromises.push(
                        this.loadMetadataFile(fileName, cacheKey)
                    );
                }
            }

            await Promise.all(loadPromises);
            this.isInitialized = true;
            console.log('PangenomeResourceService initialized successfully');
        } catch (error) {
            console.error('Failed to initialize PangenomeResourceService:', error);
            throw error;
        }
    }

    /**
     * Load a single metadata file
     * @param {string} fileName - The filename to load
     * @param {string} cacheKey - The key to store in cache
     * @returns {Promise<void>}
     */
    async loadMetadataFile(fileName, cacheKey) {
        try {
            const response = await fetch(`${this.basePath}${fileName}`);
            if (!response.ok) {
                throw new Error(`Failed to load ${fileName}: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.metadataCache.set(cacheKey, data);
            console.log(`Loaded ${fileName} successfully`);
        } catch (error) {
            console.error(`Error loading ${fileName}:`, error);
            throw error;
        }
    }

    /**
     * Get metadata by version and type
     * @param {string} version - 'v1' or 'v2'
     * @param {string} type - 'grouped' or 'nonGrouped'
     * @returns {Object|null} The metadata object or null if not found
     */
    getMetadata(version, type) {
        if (!this.isInitialized) {
            console.warn('PangenomeResourceService not initialized. Call initialize() first.');
            return null;
        }

        const cacheKey = `${version}_${type}`;
        return this.metadataCache.get(cacheKey) || null;
    }

    /**
     * Get all available versions
     * @returns {string[]} Array of available versions
     */
    getAvailableVersions() {
        return ['v1', 'v2'];
    }

    /**
     * Get all available types
     * @returns {string[]} Array of available types
     */
    getAvailableTypes() {
        return ['grouped', 'nonGrouped'];
    }

    /**
     * Get assembly list from non-grouped metadata
     * @param {string} version - 'v1' or 'v2'
     * @returns {string[]} Array of assembly names
     */
    getAssemblyList(version = 'v2') {
        const metadata = this.getMetadata(version, 'nonGrouped');
        if (!metadata) {
            return [];
        }
        return Object.keys(metadata);
    }

    /**
     * Get assembly details by name
     * @param {string} assemblyName - The assembly name to look up
     * @param {string} version - 'v1' or 'v2'
     * @returns {Object|null} Assembly details or null if not found
     */
    getAssemblyDetails(assemblyName, version = 'v2') {
        const metadata = this.getMetadata(version, 'nonGrouped');
        if (!metadata) {
            return null;
        }
        return metadata[assemblyName] || null;
    }

    /**
     * Get grouped metadata structure
     * @param {string} version - 'v1' or 'v2'
     * @returns {Object|null} Grouped metadata or null if not found
     */
    getGroupedMetadata(version = 'v2') {
        return this.getMetadata(version, 'grouped');
    }

    /**
     * Get assemblies by population group
     * @param {string} superpopulation - e.g., 'AMR', 'AFR', 'EUR', 'EAS', 'SAS'
     * @param {string} population - e.g., 'CLM', 'PUR', 'PEL', etc.
     * @param {string} version - 'v1' or 'v2'
     * @returns {string[]} Array of assembly names in the group
     */
    getAssembliesByPopulation(superpopulation, population, version = 'v2') {
        const groupedMetadata = this.getGroupedMetadata(version);
        if (!groupedMetadata || !groupedMetadata.ancestry) {
            return [];
        }

        const ancestry = groupedMetadata.ancestry;
        if (ancestry[superpopulation] && ancestry[superpopulation][population]) {
            return ancestry[superpopulation][population];
        }

        return [];
    }

    /**
     * Get all superpopulations
     * @param {string} version - 'v1' or 'v2'
     * @returns {string[]} Array of superpopulation names
     */
    getSuperpopulations(version = 'v2') {
        const groupedMetadata = this.getGroupedMetadata(version);
        if (!groupedMetadata || !groupedMetadata.ancestry) {
            return [];
        }
        return Object.keys(groupedMetadata.ancestry);
    }

    /**
     * Get populations for a given superpopulation
     * @param {string} superpopulation - The superpopulation name
     * @param {string} version - 'v1' or 'v2'
     * @returns {string[]} Array of population names
     */
    getPopulations(superpopulation, version = 'v2') {
        const groupedMetadata = this.getGroupedMetadata(version);
        if (!groupedMetadata || !groupedMetadata.ancestry || !groupedMetadata.ancestry[superpopulation]) {
            return [];
        }
        return Object.keys(groupedMetadata.ancestry[superpopulation]);
    }

    /**
     * Check if service is initialized
     * @returns {boolean} True if initialized
     */
    isReady() {
        return this.isInitialized;
    }

    /**
     * Clear the cache (useful for testing or reloading)
     */
    clearCache() {
        this.metadataCache.clear();
        this.isInitialized = false;
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        return {
            isInitialized: this.isInitialized,
            cacheSize: this.metadataCache.size,
            cachedKeys: Array.from(this.metadataCache.keys())
        };
    }
}

// Create and export singleton instance
const pangenomeResourceService = new PangenomeResourceService();
export default pangenomeResourceService;
