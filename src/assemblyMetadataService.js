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
                this.metadata.set(nodeId, {
                    count: nodeData.assembly_metadata.count || {},
                    frequency: nodeData.assembly_metadata.frequency || {},
                    totalAssemblies: this.calculateTotalAssemblies(nodeData.assembly_metadata.count)
                });
                this.totalAssemblies += this.calculateTotalAssemblies(nodeData.assembly_metadata.count);
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
     * Similar to PangenomeResource.getAncestryBreakdownHTML but works with node-based metadata
     * @param {string} nodeId - The node identifier
     * @returns {string} HTML snippet with demographic breakdown
     */
    getDemographicBreakdownHTML(nodeId) {
        const nodeData = this.metadata.get(nodeId);
        if (!nodeData) {
            return '<div>No metadata available for this node</div>';
        }

        const superpopCounts = nodeData.count.superpopulation || {};
        const popCounts = nodeData.count.population || {};
        const totalAssemblies = nodeData.totalAssemblies;

        if (totalAssemblies === 0) {
            return '<div>No assembly data available for this node</div>';
        }

        let html = '<div class="demographic-breakdown">';

        // Group populations by superpopulation
        const superpopGroups = {};
        for (const [population, count] of Object.entries(popCounts)) {
            // Find which superpopulation this population belongs to
            const superpop = this.findSuperpopulationForPopulation(population, superpopCounts);
            if (superpop) {
                if (!superpopGroups[superpop]) {
                    superpopGroups[superpop] = {};
                }
                superpopGroups[superpop][population] = count;
            }
        }

        if (Object.keys(superpopGroups).length === 0) {
            html += '<div>No demographic data available for this node</div>';
        } else {
            // Sort superpopulations for consistent display
            const superPopulations = Object.keys(superpopGroups).sort();

            superPopulations.forEach(superpopulation => {
                const superpopCount = superpopCounts[superpopulation] || 0;
                const superpopPercentage = ((superpopCount / totalAssemblies) * 100).toFixed(1);
                
                html += `<div class="superpopulation-section">`;
                html += `<h4 class="superpopulation-title">${this.getSuperpopulationDisplayName(superpopulation)} (${superpopPercentage}%)</h4>`;

                const populations = superpopGroups[superpopulation];
                const sortedPopulations = Object.keys(populations).sort();

                html += '<ul class="population-list">';
                sortedPopulations.forEach(population => {
                    const count = populations[population];
                    const percentage = ((count / totalAssemblies) * 100).toFixed(1);
                    html += `<li class="population-item">`;
                    html += `<span class="population-name">${this.getPopulationDisplayName(population)}</span> `;
                    html += `<span class="population-percentage">(${percentage}%)</span> `;
                    
                    const str = count === 1 ? 'assembly' : 'assemblies';
                    html += `<span class="assembly-count">(${count} ${str})</span>`;

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
     * Find which superpopulation a population belongs to based on the data structure
     * @param {string} population - The population code
     * @param {Object} superpopCounts - The superpopulation counts
     * @returns {string|null} The superpopulation code or null if not found
     */
    findSuperpopulationForPopulation(population, superpopCounts) {
        // This is a simplified mapping - in a real implementation, you might want
        // to maintain a more sophisticated mapping or use the original metadata structure
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

    /**
     * Get display name for superpopulation
     * @param {string} superpopulation - The superpopulation code
     * @returns {string} Human-readable name
     */
    getSuperpopulationDisplayName(superpopulation) {
        const names = {
            'AMR': 'Ad Mixed American',
            'AFR': 'African',
            'EAS': 'East Asian', 
            'SAS': 'South Asian',
            'N/A': 'Not Available'
        };
        return names[superpopulation] || superpopulation;
    }

    /**
     * Get display name for population
     * @param {string} population - The population code
     * @returns {string} Human-readable name
     */
    getPopulationDisplayName(population) {
        const names = {
            // Ad Mixed American populations
            'CLM': 'Colombian',
            'PUR': 'Puerto Rican', 
            'PEL': 'Peruvian',
            // African populations
            'ACB': 'African Caribbean Barbadian',
            'GWD': 'Gambian in Western Division',
            'ESN': 'Esan in Nigeria',
            'MSL': 'Mende in Sierra Leone',
            'YRI': 'Yoruba in Ibadan, Nigeria',
            'ASW': 'African Ancestry in Southwest US',
            'MKK': 'Maasai in Kinyawa, Kenya',
            // East Asian populations
            'CHS': 'Han Chinese South',
            'KHV': 'Kinh in Ho Chi Minh City, Vietnam',
            // South Asian populations
            'PJL': 'Punjabi in Lahore, Pakistan',
            // Not Available
            'N/A': 'Not Available'
        };
        return names[population] || population;
    }
}

// Create and export the singleton instance
const assemblyMetadataService = new AssemblyMetadataService();

export { AssemblyMetadataService, assemblyMetadataService };
