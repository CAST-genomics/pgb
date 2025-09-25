import { calculatePercentiles, normalizeDataset, calculateDistributionStats } from "./utils/stats.js"
import {getAllSuperpopulationNames} from "./utils/pangenomeUtils.js"

/**
 * Service for analyzing frequency distributions across genomic nodes
 * Provides statistical analysis and adaptive scaling for heatmap visualizations
 */
class FrequencyAnalysisService {
    constructor() {
        this.globalAnalysis = new Map() // superpopulation -> analysis results
        this.nodeAnalysis = new Map()   // nodeName -> analysis results
        this.scalingMethods = new Map() // superpopulation -> optimal scaling method
    }

    /**
     * Analyze frequency distributions for all superpopulations across all nodes
     * @param {Object} nodeMetadata - Map of nodeName -> metadata containing frequencies
     */
    analyzeGlobalDistributions(nodeMetadata) {
        console.log('FrequencyAnalysisService: Analyzing global frequency distributions...')

        // Initialize analysis for each superpopulation
        const superpopulationAcronyms = getAllSuperpopulationNames().map(({ acronym }) => acronym)
        const frequencyData = new Map()

        // Collect all frequency values for each superpopulation
        for (const [nodeName, metadata] of nodeMetadata) {
            const { frequency } = metadata
            if (frequency && frequency.superpopulation) {
                for (const superpop of superpopulationAcronyms) {
                    if (!frequencyData.has(superpop)) {
                        frequencyData.set(superpop, [])
                    }
                    const freq = frequency.superpopulation[superpop]
                    if (freq !== undefined && freq !== null) {
                        frequencyData.get(superpop).push(freq)
                    }
                }
            }
        }

        // Analyze each superpopulation's distribution
        for (const [superpop, frequencies] of frequencyData) {
            if (frequencies.length === 0) continue

            const analysis = this.analyzeDistribution(frequencies, superpop)
            this.globalAnalysis.set(superpop, analysis)

            // Determine optimal scaling method
            const optimalMethod = this.determineOptimalScaling(analysis)
            this.scalingMethods.set(superpop, optimalMethod)

            console.log(`FrequencyAnalysisService: ${superpop} - ${frequencies.length} nodes, method: ${optimalMethod}`)
        }
    }

    /**
     * Analyze a single frequency distribution
     * @param {number[]} frequencies - Array of frequency values
     * @param {string} superpopulation - Superpopulation name for context
     * @returns {Object} Complete statistical analysis
     */
    analyzeDistribution(frequencies, superpopulation) {
        const distributionStats = calculateDistributionStats(frequencies)

        // Calculate normalized values using different methods
        const normalizedPercentile = normalizeDataset(frequencies, 'percentile')
        const normalizedLog = normalizeDataset(frequencies, 'log')
        const normalizedSqrt = normalizeDataset(frequencies, 'sqrt')
        const normalizedQuantile = normalizeDataset(frequencies, 'quantile')

        return {
            superpopulation,
            rawFrequencies: frequencies,
            distributionStats,
            normalizedValues: {
                percentile: normalizedPercentile,
                log: normalizedLog,
                sqrt: normalizedSqrt,
                quantile: normalizedQuantile
            },
            dataRange: {
                min: Math.min(...frequencies),
                max: Math.max(...frequencies),
                range: Math.max(...frequencies) - Math.min(...frequencies)
            },
            effectiveRange: this.calculateEffectiveRange(frequencies)
        }
    }

    /**
     * Determine the optimal scaling method based on distribution characteristics
     * @param {Object} analysis - Statistical analysis results
     * @returns {string} Optimal scaling method
     */
    determineOptimalScaling(analysis) {
        const { distributionStats, dataRange } = analysis
        const { basic, shape } = distributionStats

        // If data is highly clustered (small range), use percentile scaling
        if (dataRange.range < 0.3) {
            return 'percentile'
        }

        // If highly skewed, use log transformation
        if (Math.abs(shape.skewness) > 1.5) {
            return 'log'
        }

        // If moderately skewed, use square root
        if (Math.abs(shape.skewness) > 0.5) {
            return 'sqrt'
        }

        // If normally distributed with good range, use quantile
        if (dataRange.range > 0.5) {
            return 'quantile'
        }

        // Default to percentile for safety
        return 'percentile'
    }

    /**
     * Calculate the effective range (excluding extreme outliers)
     * @param {number[]} frequencies - Array of frequency values
     * @returns {Object} Effective min, max, and range
     */
    calculateEffectiveRange(frequencies) {
        const percentiles = calculatePercentiles(frequencies, [5, 95])
        return {
            min: percentiles.p5,
            max: percentiles.p95,
            range: percentiles.p95 - percentiles.p5
        }
    }

    /**
     * Get enhanced frequency value for a specific node and superpopulation
     * @param {string} nodeName - Node identifier
     * @param {string} superpopulation - Superpopulation code
     * @param {string} method - Scaling method ('auto', 'percentile', 'log', 'sqrt', 'quantile')
     * @param {Object} nodeMetadata - Node metadata containing frequency data
     * @returns {number} Enhanced frequency value (0-1)
     */
    getEnhancedFrequency(nodeName, superpopulation, method = 'auto', nodeMetadata = null) {
        const analysis = this.globalAnalysis.get(superpopulation)
        if (!analysis) {
            console.warn(`FrequencyAnalysisService: No analysis found for ${superpopulation}`)
            return 0
        }

        // Get the raw frequency for this node
        const nodeFreq = this.getNodeFrequency(nodeName, superpopulation, nodeMetadata)
        if (nodeFreq === null) return 0

        // Determine scaling method
        const scalingMethod = method === 'auto'
            ? this.scalingMethods.get(superpopulation)
            : method

        // Get the normalized value
        const nodeIndex = analysis.rawFrequencies.indexOf(nodeFreq)
        if (nodeIndex === -1) {
            console.warn(`FrequencyAnalysisService: Node frequency not found in analysis for ${nodeName}`)
            return 0
        }

        return analysis.normalizedValues[scalingMethod][nodeIndex]
    }

    /**
     * Get the raw frequency for a specific node and superpopulation
     * @param {string} nodeName - Node identifier
     * @param {string} superpopulation - Superpopulation code
     * @param {Object} nodeMetadata - Node metadata containing frequency data
     * @returns {number|null} Raw frequency value
     */
    getNodeFrequency(nodeName, superpopulation, nodeMetadata = null) {
        if (!nodeMetadata || !nodeMetadata.frequency || !nodeMetadata.frequency.superpopulation) {
            return null
        }

        const freq = nodeMetadata.frequency.superpopulation[superpopulation]
        return freq !== undefined && freq !== null ? freq : null
    }

    /**
     * Get analysis results for a specific superpopulation
     * @param {string} superpopulation - Superpopulation code
     * @returns {Object|null} Analysis results
     */
    getSuperpopulationAnalysis(superpopulation) {
        return this.globalAnalysis.get(superpopulation) || null
    }

    /**
     * Get all available scaling methods for a superpopulation
     * @param {string} superpopulation - Superpopulation code
     * @returns {string[]} Available scaling methods
     */
    getAvailableScalingMethods(superpopulation) {
        return ['percentile', 'log', 'sqrt', 'quantile']
    }

    /**
     * Get scaling method information for display
     * @param {string} superpopulation - Superpopulation code
     * @returns {Object} Scaling method info
     */
    getScalingInfo(superpopulation) {
        const analysis = this.globalAnalysis.get(superpopulation)
        const method = this.scalingMethods.get(superpopulation)

        if (!analysis) return null

        return {
            method,
            dataRange: analysis.dataRange,
            effectiveRange: analysis.effectiveRange,
            distributionStats: analysis.distributionStats,
            nodeCount: analysis.rawFrequencies.length
        }
    }

    /**
     * Clear all analysis data
     */
    clear() {
        this.globalAnalysis.clear()
        this.nodeAnalysis.clear()
        this.scalingMethods.clear()
    }
}

// Create singleton instance
const frequencyAnalysisService = new FrequencyAnalysisService()

export { frequencyAnalysisService }
