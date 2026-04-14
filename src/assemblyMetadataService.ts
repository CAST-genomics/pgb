import { getSuperpopulationName, getPopulationName, findSuperpopulationForPopulation } from './utils/populationUtils.js';
import {frequencyAnalysisService} from "./frequencyAnalysisService.js"
import eventBus from "./utils/eventBus.ts"

/**
 * AssemblyMetadataService - Manages and provides access to assembly metadata
 * for genomic nodes, including demographic breakdowns and percentage calculations.
 * Implemented as a singleton to ensure single instance across the application.
 */
class AssemblyMetadataService {

    private static instance: AssemblyMetadataService

    metadata!: Map<string, any>
    totalAssemblies!: number
    selectedPopulation!: string | null
    private popSelectUnsub!: (() => void) | null
    private popDeselectUnsub!: (() => void) | null

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

    handleSelectionEvent(data: { acronym: string }, eventType: string): void {
        const { acronym } = data
        this.selectedPopulation = acronym;
    }

    /**
     * Load assembly metadata from a parsed DatasetModel.
     *
     * Dataset-wide totalAssemblies is read from dataset.index. This service
     * still walks nodes to build the per-node metadata lookup used by
     * tooltip/breakdown renderers.
     */
    loadMetadata(dataset: any): void {
        this.metadata.clear();
        this.totalAssemblies = dataset.index.assemblyTotals.totalAssemblies;

        for (const [nodeId, node] of dataset.nodes) {
            if (node.assemblyMetadata) {
                this.metadata.set(nodeId, {
                    count: node.assemblyMetadata.count || {},
                    frequency: node.assemblyMetadata.frequency || {},
                });
            }
        }

        console.log(`AssemblyMetadataService: Loaded metadata for ${this.metadata.size} nodes`);
    }

    /**
     * Get superpopulation frequencies for a given node
     */
    getSuperPopulationFrequencies(nodeId: string): Record<string, number> | null {
        const nodeData = this.metadata.get(nodeId);
        if (!nodeData?.frequency?.superpopulation) {
            return null;
        }

        return { ...nodeData.frequency.superpopulation };
    }

    /**
     * Get population frequencies for a given node
     */
    getPopulationFrequencies(nodeId: string): Record<string, number> | null {
        const nodeData = this.metadata.get(nodeId);
        if (!nodeData?.frequency?.population) {
            return null;
        }

        return { ...nodeData.frequency.population };
    }

    /**
     * Generate HTML snippet showing demographic breakdown for a node
     * Simple presentation of frequency values as percentages with hierarchical organization
     */
    getDemographicBreakdownHTML(nodeId: string): string {
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

        const superpopGroups: Record<string, Record<string, number>> = {};
        for (const [population, frequency] of Object.entries(popFrequencies)) {
            const superpop = findSuperpopulationForPopulation(population);
            if (superpop) {
                if (!superpopGroups[superpop]) {
                    superpopGroups[superpop] = {};
                }
                superpopGroups[superpop][population] = frequency as number;
            }
        }

        const sortedSuperPops = Object.entries(superPopFrequencies).sort(([, a]: [string, any], [, b]: [string, any]) => b - a)
        for (const [superPop, superPopFrequency] of sortedSuperPops) {

            if ('N/A' === superPop){
                continue
            }

            html += `<div class="superpopulation-section">`;
            html += `<h5 class="superpopulation-title"><span class="title-text">${getSuperpopulationName(superPop)}</span><span class="title-percentage">${ AssemblyMetadataService.formatNumber(superPopFrequency as number) }</span></h5>`;

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
     */
    getPopulationTooltip(nodeId: string): string {

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

            html += `<div class="population-item"><span class="population-name" ${emphasisStyle}>${getPopulationName(acronym)}</span><span class="population-count" ${emphasisStyle}>${count}</span><span class="population-percentage" ${emphasisStyle}>${ AssemblyMetadataService.formatNumber(frequency as number) }</span></div>`;
        }

        html += '</div>';

        return html;
    }

    /**
     * Get the singleton instance
     */
    static getInstance(): AssemblyMetadataService {
        if (!AssemblyMetadataService.instance) {
            AssemblyMetadataService.instance = new AssemblyMetadataService();
        }
        return AssemblyMetadataService.instance;
    }

    static formatNumber(frequency: number): string {

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
