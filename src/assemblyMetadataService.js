import { getSuperpopulationName, getPopulationName, findSuperpopulationForPopulation } from './utils/populationUtils.js';
import {frequencyAnalysisService} from "./frequencyAnalysisService.js"
import eventBus from "./utils/eventBus.js"

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
        this.selectedPopulation = null;

        this.popSelectUnsub = eventBus.subscribe('population:selected', data => {
            this.handleSelectionEvent(data, 'population');
        })

        this.popDeselectUnsub = eventBus.subscribe('population:deselected', data => {
            this.selectedPopulation = null;
        });

        AssemblyMetadataService.instance = this;
    }

    handleSelectionEvent(data, eventType) {
        const { acronym } = data
        this.selectedPopulation = acronym;
    }

    /**
     * Load assembly metadata from JSON data
     * @param {Object} jsonData - The JSON data containing node information
     */
    loadMetadata(jsonData) {
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

            const superPopGroup = superpopGroups[superPop]
            if (undefined === superPopGroup) {
                console.warn(`DANGER - No SuperPopulation Group for ${ superPop }`)
            }

            const sortedPopulations = Object.entries(superPopGroup).sort(([, a], [, b]) => b - a)
            for (const [population, popFrequency] of sortedPopulations) {
                html += `<li class="population-item"><span class="item-text">${getPopulationName(population)}</span><span class="item-percentage">${ AssemblyMetadataService.formatNumber(popFrequency) }</span></li>`;
            }
            html += '</ul>';

            html += '</div>';
        }

        html += '</div>'

        return html;
    }

    /**
     * Generate HTML snippet showing population breakdown for a node
     * Simple presentation of population frequency values as percentages
     * @param {string} nodeId - The node identifier
     * @returns {string} HTML snippet with population breakdown
     */
    getPopulationTooltip(nodeId) {

        let html = '<div class="population-tooltip">'

        const { frequency, count } = this.metadata.get(nodeId)

        const populationCounts = Object.entries(count.population)
        const populationFrequencies = Object.entries(frequency.population)

        for (let i = 0; i < populationFrequencies.length; i++ ) {

            const [ acronym, frequency ] = populationFrequencies[ i ];
            const  [_, count ] = populationCounts[ i ];

            if ('N/A' === acronym) {
                continue;
            }

            const emphasisStyle = acronym === this.selectedPopulation ? 'style="font-size: 0.9rem; font-weight: bold;"' : '';

            html += `<div class="population-item"><span class="population-name" ${emphasisStyle}>${getPopulationName(acronym)}</span><span class="population-count" ${emphasisStyle}>${count}</span><span class="population-percentage" ${emphasisStyle}>${ AssemblyMetadataService.formatNumber(frequency) }</span></div>`;
        }

        html += '</div>';

        return html;
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
