import { getSuperpopulationName, getPopulationName } from './utils/pangenomeUtils.js';

/**
 * AssemblyMetadataService - Manages and provides access to assembly metadata
 * for genomic nodes, including demographic breakdowns and percentage calculations.
 * Implemented as a singleton to ensure single instance across the application.
 */
class AssemblyMetadataService {
    constructor() {
        if (AssemblyMetadataService.instance) {
            return AssemblyMetadataService.instance;
        }

        this.metadata = new Map(); // nodeId -> metadata object
        this.totalAssemblies = 0; // Total count across all nodes
        
        AssemblyMetadataService.instance = this;
    }

    /**
     * Get the singleton instance
     * @returns {AssemblyMetadataService} The singleton instance
     */
    static getInstance() {
        if (!AssemblyMetadataService.instance) {
            AssemblyMetadataService.instance = new AssemblyMetadataService();
        }
        return AssemblyMetadataService.instance;
    }

    /**
     * Load assembly metadata from JSON data
     * @param {Object} jsonData - The JSON data containing node information
     */
    loadMetadata(jsonData) {
        if (!jsonData?.node) {
            console.warn('AssemblyMetadataService: No node data found in JSON');
            return;
        }

        this.metadata.clear();
        this.totalAssemblies = 0;

        for (const [nodeId, nodeData] of Object.entries(jsonData.node)) {
            if (nodeData.assembly_metadata) {
                const nodeTotalAssemblies = this.calculateTotalAssemblies(nodeData.assembly_metadata.count);
                
                this.metadata.set(nodeId, {
                    count: nodeData.assembly_metadata.count || {},
                    frequency: nodeData.assembly_metadata.frequency || {},
                    totalAssemblies: nodeTotalAssemblies
                });
                
                this.totalAssemblies += nodeTotalAssemblies;
            }
        }

        console.log(`AssemblyMetadataService: Loaded metadata for ${this.metadata.size} nodes`);
    }

    /**
     * Calculate total assemblies from count data
     * @param {Object} countData - The count object from metadata
     * @returns {number} Total count of assemblies
     */
    calculateTotalAssemblies(countData) {
        if (!countData?.sex) return 0;
        
        // Sum up all sex counts (should be the same as any other category)
        return Object.values(countData.sex).reduce((sum, count) => sum + count, 0);
    }

    /**
     * Get complete metadata for a specific node
     * @param {string} nodeId - The node identifier
     * @returns {Object|null} Complete metadata object or null if not found
     */
    getNodeMetadata(nodeId) {
        return this.metadata.get(nodeId) || null;
    }

    /**
     * Get percentage breakdown for superpopulations for a given node
     * @param {string} nodeId - The node identifier
     * @returns {Object|null} Object with superpopulation percentages or null if not found
     */
    getSuperPopulationPercentages(nodeId) {
        const nodeData = this.metadata.get(nodeId);
        if (!nodeData?.count?.superpopulation) {
            return null;
        }

        const totalAssemblies = nodeData.totalAssemblies;
        if (totalAssemblies === 0) {
            return {};
        }

        const percentages = {};
        for (const [superpop, count] of Object.entries(nodeData.count.superpopulation)) {
            percentages[superpop] = (count / totalAssemblies) * 100;
        }

        return percentages;
    }

    /**
     * Get percentage breakdown for populations for a given node
     * @param {string} nodeId - The node identifier
     * @returns {Object|null} Object with population percentages or null if not found
     */
    getPopulationPercentages(nodeId) {
        const nodeData = this.metadata.get(nodeId);
        if (!nodeData?.count?.population) {
            return null;
        }

        const totalAssemblies = nodeData.totalAssemblies;
        if (totalAssemblies === 0) {
            return {};
        }

        const percentages = {};
        for (const [population, count] of Object.entries(nodeData.count.population)) {
            percentages[population] = (count / totalAssemblies) * 100;
        }

        return percentages;
    }

    /**
     * Get superpopulation frequencies for a given node
     * @param {string} nodeId - The node identifier
     * @returns {Object|null} Object with superpopulation frequencies or null if not found
     */
    getSuperPopulationFrequencies(nodeId) {
        const nodeData = this.metadata.get(nodeId);
        if (!nodeData?.frequency?.superpopulation) {
            return null;
        }

        return { ...nodeData.frequency.superpopulation };
    }

    /**
     * Get population frequencies for a given node
     * @param {string} nodeId - The node identifier
     * @returns {Object|null} Object with population frequencies or null if not found
     */
    getPopulationFrequencies(nodeId) {
        const nodeData = this.metadata.get(nodeId);
        if (!nodeData?.frequency?.population) {
            return null;
        }

        return { ...nodeData.frequency.population };
    }

    /**
     * Get both superpopulation and population percentages for a node
     * @param {string} nodeId - The node identifier
     * @returns {Object|null} Object with both percentage breakdowns or null if not found
     */
    getDemographicPercentages(nodeId) {
        const superpopPercentages = this.getSuperPopulationPercentages(nodeId);
        const popPercentages = this.getPopulationPercentages(nodeId);

        if (!superpopPercentages && !popPercentages) {
            return null;
        }

        return {
            superpopulation: superpopPercentages,
            population: popPercentages,
            totalAssemblies: this.metadata.get(nodeId)?.totalAssemblies || 0
        };
    }

    /**
     * Get raw counts for superpopulations for a given node
     * @param {string} nodeId - The node identifier
     * @returns {Object|null} Object with superpopulation counts or null if not found
     */
    getSuperPopulationCounts(nodeId) {
        const nodeData = this.metadata.get(nodeId);
        return nodeData?.count?.superpopulation || null;
    }

    /**
     * Get raw counts for populations for a given node
     * @param {string} nodeId - The node identifier
     * @returns {Object|null} Object with population counts or null if not found
     */
    getPopulationCounts(nodeId) {
        const nodeData = this.metadata.get(nodeId);
        return nodeData?.count?.population || null;
    }

    /**
     * Get all nodes that have assembly metadata
     * @returns {Array<string>} Array of node IDs with metadata
     */
    getAllNodesWithMetadata() {
        return Array.from(this.metadata.keys());
    }

    /**
     * Get summary statistics across all nodes
     * @returns {Object} Summary statistics
     */
    getMetadataSummary() {
        const nodesWithMetadata = this.getAllNodesWithMetadata();
        const totalNodes = nodesWithMetadata.length;
        
        if (totalNodes === 0) {
            return {
                totalNodes: 0,
                totalAssemblies: 0,
                averageAssembliesPerNode: 0
            };
        }

        const totalAssemblies = nodesWithMetadata.reduce((sum, nodeId) => {
            return sum + (this.metadata.get(nodeId)?.totalAssemblies || 0);
        }, 0);

        return {
            totalNodes,
            totalAssemblies,
            averageAssembliesPerNode: totalAssemblies / totalNodes
        };
    }

    /**
     * Filter nodes based on demographic criteria
     * @param {Object} criteria - Filter criteria
     * @param {string} criteria.superpopulation - Minimum percentage threshold for superpopulation
     * @param {string} criteria.population - Minimum percentage threshold for population
     * @param {number} criteria.minPercentage - Minimum percentage threshold
     * @returns {Array<Object>} Array of filtered nodes with their percentages
     */
    filterNodesByDemographics(criteria = {}) {
        const results = [];
        const minPercentage = criteria.minPercentage || 0;

        for (const nodeId of this.getAllNodesWithMetadata()) {
            const percentages = this.getDemographicPercentages(nodeId);
            if (!percentages) continue;

            let matches = true;

            // Check superpopulation criteria
            if (criteria.superpopulation && percentages.superpopulation) {
                const superpopPercentage = percentages.superpopulation[criteria.superpopulation] || 0;
                if (superpopPercentage < minPercentage) {
                    matches = false;
                }
            }

            // Check population criteria
            if (criteria.population && percentages.population) {
                const popPercentage = percentages.population[criteria.population] || 0;
                if (popPercentage < minPercentage) {
                    matches = false;
                }
            }

            if (matches) {
                results.push({
                    nodeId,
                    ...percentages
                });
            }
        }

        return results;
    }

    /**
     * Get the most common superpopulation for a node
     * @param {string} nodeId - The node identifier
     * @returns {Object|null} Object with the most common superpopulation and its percentage
     */
    getMostCommonSuperPopulation(nodeId) {
        const percentages = this.getSuperPopulationPercentages(nodeId);
        if (!percentages) return null;

        let maxPercentage = 0;
        let mostCommon = null;

        for (const [superpop, percentage] of Object.entries(percentages)) {
            if (percentage > maxPercentage) {
                maxPercentage = percentage;
                mostCommon = superpop;
            }
        }

        return {
            superpopulation: mostCommon,
            percentage: maxPercentage
        };
    }

    /**
     * Get the most common population for a node
     * @param {string} nodeId - The node identifier
     * @returns {Object|null} Object with the most common population and its percentage
     */
    getMostCommonPopulation(nodeId) {
        const percentages = this.getPopulationPercentages(nodeId);
        if (!percentages) return null;

        let maxPercentage = 0;
        let mostCommon = null;

        for (const [population, percentage] of Object.entries(percentages)) {
            if (percentage > maxPercentage) {
                maxPercentage = percentage;
                mostCommon = population;
            }
        }

        return {
            population: mostCommon,
            percentage: maxPercentage
        };
    }

    /**
     * Generate HTML snippet showing demographic breakdown for a node
     * Simple presentation of frequency values as percentages with hierarchical organization
     * @param {string} nodeId - The node identifier
     * @returns {string} HTML snippet with demographic breakdown
     */
    getDemographicBreakdownHTML(nodeId) {
        const nodeData = this.metadata.get(nodeId);
        if (!nodeData) {
            return '<div>No metadata available for this node</div>';
        }

        const superpopFrequencies = nodeData.frequency.superpopulation || {};
        const popFrequencies = nodeData.frequency.population || {};

        if (Object.keys(superpopFrequencies).length === 0) {
            return '<div>No demographic data available for this node</div>';
        }

        let html = '<div class="demographic-breakdown">';

        // Group populations by superpopulation
        const superpopGroups = {};
        for (const [population, frequency] of Object.entries(popFrequencies)) {
            const superpop = this.findSuperpopulationForPopulation(population);
            if (superpop) {
                if (!superpopGroups[superpop]) {
                    superpopGroups[superpop] = {};
                }
                superpopGroups[superpop][population] = frequency;
            }
        }

        // Display hierarchical structure
        for (const [superpop, frequency] of Object.entries(superpopFrequencies)) {
            const percentage = (frequency * 100).toFixed(1);
            
            // Skip superpopulations with 0% frequency
            if (frequency === 0 || frequency === null || frequency === undefined || isNaN(frequency)) {
                continue;
            }
            
            html += `<div class="superpopulation-section">`;
            html += `<h4 class="superpopulation-title">${getSuperpopulationName(superpop)} ${percentage}%</h4>`;

            // Show constituent populations if they exist
            if (superpopGroups[superpop] && Object.keys(superpopGroups[superpop]).length > 0) {
                html += '<ul class="population-list">';
                for (const [population, popFrequency] of Object.entries(superpopGroups[superpop])) {
                    const popPercentage = (popFrequency * 100).toFixed(1);
                    html += `<li class="population-item">${getPopulationName(population)}: ${popPercentage}%</li>`;
                }
                html += '</ul>';
            }
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    /**
     * Find which superpopulation a population belongs to
     * @param {string} population - The population code
     * @returns {string|null} The superpopulation code or null if not found
     */
    findSuperpopulationForPopulation(population) {
        const populationToSuperpop = {
            // Ad Mixed American populations
            'CLM': 'AMR', 'PUR': 'AMR', 'PEL': 'AMR',
            // African populations  
            'ACB': 'AFR', 'GWD': 'AFR', 'ESN': 'AFR', 'MSL': 'AFR', 
            'YRI': 'AFR', 'ASW': 'AFR', 'MKK': 'AFR',
            // East Asian populations
            'CHS': 'EAS', 'KHV': 'EAS',
            // South Asian populations
            'PJL': 'SAS',
            // Not Available
            'N/A': 'N/A'
        };

        return populationToSuperpop[population] || null;
    }

}

// Create and export the singleton instance
const assemblyMetadataService = new AssemblyMetadataService();

export { AssemblyMetadataService, assemblyMetadataService };
