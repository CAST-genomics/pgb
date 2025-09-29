import { getSuperpopulationName, getPopulationName, findSuperpopulationForPopulation } from './utils/populationUtils.js';
import {frequencyAnalysisService} from "./frequencyAnalysisService.js"

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
     * Generate HTML snippet showing demographic breakdown for a node
     * Simple presentation of frequency values as percentages with hierarchical organization
     * @param {string} nodeId - The node identifier
     * @returns {string} HTML snippet with demographic breakdown
     */
    getDemographicBreakdownHTML(nodeId) {
        const nodeMetadata = this.metadata.get(nodeId);
        if (!nodeMetadata) {
            return '<div>No metadata available for this node</div>';
        }

        // const superPopFrequencies = frequencyAnalysisService.getEnhancedFrequenciesForType('superpopulation', nodeMetadata)
        // const popFrequencies = frequencyAnalysisService.getEnhancedFrequenciesForType('population', nodeMetadata)

        const superPopFrequencies = nodeMetadata.frequency.superpopulation || {};
        const popFrequencies = nodeMetadata.frequency.population || {};


        if (Object.keys(superPopFrequencies).length === 0) {
            return '<div>No demographic data available for this node</div>';
        }

        let html = '<div class="demographic-breakdown">';

        const superpopGroups = {};
        for (const [population, frequency] of Object.entries(popFrequencies)) {
            const superpop = findSuperpopulationForPopulation(population);
            if (superpop) {
                if (!superpopGroups[superpop]) {
                    superpopGroups[superpop] = {};
                }
                superpopGroups[superpop][population] = frequency;
            }
        }

        const sortedSuperPops = Object.entries(superPopFrequencies).sort(([, a], [, b]) => b - a)
        for (const [superPop, superPopFrequency] of sortedSuperPops) {

            if ('N/A' === superPop){
                continue
            }

            html += `<div class="superpopulation-section">`;
            html += `<h5 class="superpopulation-title"><span class="title-text">${getSuperpopulationName(superPop)}</span><span class="title-percentage">${ AssemblyMetadataService.formatNumber(superPopFrequency) }</span></h5>`;

            html += '<ul class="population-list">';

            const sortedPopulations = Object.entries(superpopGroups[superPop]).sort(([, a], [, b]) => b - a)
            for (const [population, popFrequency] of sortedPopulations) {
                html += `<li class="population-item"><span class="item-text">${getPopulationName(population)}</span><span class="item-percentage">${ AssemblyMetadataService.formatNumber(popFrequency) }</span></li>`;
            }
            html += '</ul>';

            html += '</div>';
        }

        html += '</div>'

        return html;
    }

    static formatNumber(frequency) {

        if (0 === frequency) {
            return 'none'
        }

        if (frequency < 0.1){
            return '< 0.1%'
        }

        let percent = 100 * frequency

        let str = percent.toFixed(1)
        str = str.endsWith('.0') ? str.slice(0, -2) : str;

        return `${str}%`
    }

}

// Create and export the singleton instance
const assemblyMetadataService = new AssemblyMetadataService();

export { AssemblyMetadataService, assemblyMetadataService };
