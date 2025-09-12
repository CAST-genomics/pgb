/**
 * PangenomeResource - Singleton service for managing assembly metadata files
 *
 * This service loads, organizes, and hosts the files in public/assembly_metadata.
 * Key organizational structure:
 * - grouped vs non-grouped metadata
 * - v1 vs v2 versions
 */
class PangenomeResource {
    constructor() {
        if (PangenomeResource.instance) {
            return PangenomeResource.instance;
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

        PangenomeResource.instance = this;
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
            console.log('PangenomeResource initialized successfully');
        } catch (error) {
            console.error('Failed to initialize PangenomeResource:', error);
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
            console.warn('PangenomeResource not initialized. Call initialize() first.');
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
     * Calculate percentage representation of superpopulations for a given list of assemblies
     * @param {string[]} assemblyNames - Array of assembly names to analyze
     * @param {string} version - 'v1' or 'v2'
     * @returns {Object} Object with superpopulation percentages and counts
     */
    getSuperpopulationRepresentation(assemblyNames, version = 'v2') {
        if (!this.isInitialized) {
            console.warn('PangenomeResource not initialized. Call initialize() first.');
            return null;
        }

        const metadata = this.getMetadata(version, 'nonGrouped');
        if (!metadata) {
            return null;
        }

        // Count assemblies by superpopulation
        const superpopulationCounts = {};
        const totalAssemblies = assemblyNames.length;

        if (totalAssemblies === 0) {
            return {
                percentages: {},
                counts: {},
                totalAssemblies: 0,
                summary: 'No assemblies provided'
            };
        }

        // Initialize counts for all superpopulations
        const allSuperpopulations = this.getSuperpopulations(version);
        allSuperpopulations.forEach(sp => {
            superpopulationCounts[sp] = 0;
        });

        // Count assemblies in the provided list
        let validAssemblies = 0;
        assemblyNames.forEach(assemblyName => {
            const assemblyDetails = metadata[assemblyName];
            if (assemblyDetails && assemblyDetails.superpopulation) {
                const superpopulation = assemblyDetails.superpopulation;
                if (superpopulationCounts.hasOwnProperty(superpopulation)) {
                    superpopulationCounts[superpopulation]++;
                    validAssemblies++;
                }
            }
        });

        // Calculate percentages
        const percentages = {};
        const counts = {};

        Object.keys(superpopulationCounts).forEach(superpopulation => {
            const count = superpopulationCounts[superpopulation];
            counts[superpopulation] = count;
            percentages[superpopulation] = validAssemblies > 0 ? (count / validAssemblies) * 100 : 0;
        });

        return {
            percentages,
            counts,
            totalAssemblies,
            validAssemblies,
            invalidAssemblies: totalAssemblies - validAssemblies,
            summary: `${validAssemblies} valid assemblies analyzed (${totalAssemblies - validAssemblies} invalid/not found)`
        };
    }

    /**
     * Calculate what percentage of total superpopulation diversity is represented by a node
     * @param {string[]} assemblyNames - Array of assembly names associated with the node
     * @param {string} version - 'v1' or 'v2'
     * @returns {number} Percentage (0-100) of total superpopulation diversity represented
     */
    getNodeSuperpopulationDiversityPercentage(assemblyNames, version = 'v2') {
        if (!this.isInitialized) {
            console.warn('PangenomeResource not initialized. Call initialize() first.');
            return 0;
        }

        const metadata = this.getMetadata(version, 'nonGrouped');
        if (!metadata) {
            return 0;
        }

        // Get all superpopulations in the entire dataset
        const allSuperpopulations = this.getSuperpopulations(version);
        const totalSuperpopulations = allSuperpopulations.length;

        if (totalSuperpopulations === 0) {
            return 0;
        }

        // Get unique superpopulations represented by this node's assemblies
        const nodeSuperpopulations = new Set();

        assemblyNames.forEach(assemblyName => {
            const assemblyDetails = metadata[assemblyName];
            if (assemblyDetails && assemblyDetails.superpopulation) {
                nodeSuperpopulations.add(assemblyDetails.superpopulation);
            }
        });

        // Calculate percentage of total superpopulation diversity
        const representedSuperpopulations = nodeSuperpopulations.size;
        const percentage = representedSuperpopulations / totalSuperpopulations
        console.log(`Node Superpopulation Diversity. ${ representedSuperpopulations } / ${ totalSuperpopulations } = ${ percentage }`)

        return percentage
    }

    /**
     * Generate HTML snippet showing superpopulations and populations for a list of assemblies
     * @param {string[]} assemblyNames - Array of assembly names to analyze
     * @param {string} version - 'v1' or 'v2'
     * @returns {string} HTML snippet with superpopulation and population breakdown
     */
    getAncestryBreakdownHTML(assemblyNames, version = 'v2') {
        if (!this.isInitialized) {
            console.warn('PangenomeResource not initialized. Call initialize() first.');
            return '<div>Service not initialized</div>';
        }

        const metadata = this.getMetadata(version, 'nonGrouped');
        if (!metadata) {
            return '<div>Metadata not available</div>';
        }

        // Group assemblies by superpopulation and population
        const ancestryGroups = {};
        
        assemblyNames.forEach(assemblyName => {
            const assemblyDetails = metadata[assemblyName];
            if (assemblyDetails && assemblyDetails.superpopulation && assemblyDetails.population) {
                const superpop = assemblyDetails.superpopulation;
                const population = assemblyDetails.population;
                
                if (!ancestryGroups[superpop]) {
                    ancestryGroups[superpop] = {};
                }
                if (!ancestryGroups[superpop][population]) {
                    ancestryGroups[superpop][population] = [];
                }
                ancestryGroups[superpop][population].push(assemblyName);
            }
        });

        // Generate HTML
        let html = '<div class="ancestry-breakdown">';
        
        if (Object.keys(ancestryGroups).length === 0) {
            html += '<div>No ancestry data available for these assemblies</div>';
        } else {
            // Sort superpopulations for consistent display
            const sortedSuperpops = Object.keys(ancestryGroups).sort();
            
            sortedSuperpops.forEach(superpop => {
                html += `<div class="superpopulation-section">`;
                html += `<h4 class="superpopulation-title">${superpop}</h4>`;
                
                const populations = ancestryGroups[superpop];
                const sortedPopulations = Object.keys(populations).sort();
                
                html += '<ul class="population-list">';
                sortedPopulations.forEach(population => {
                    const assemblies = populations[population];
                    html += `<li class="population-item">`;
                    html += `<span class="population-name">${population}</span> `;
                    html += `<span class="assembly-count">(${assemblies.length} assemblies)</span>`;
                    html += '</li>';
                });
                html += '</ul>';
                html += '</div>';
            });
        }
        
        html += '</div>';
        return html;
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
const pangenomeResource = new PangenomeResource();
export default pangenomeResource;
