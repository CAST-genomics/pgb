import { calculatePercentiles, normalizeDataset, calculateDistributionStats } from "./utils/stats.js"

/**
 * Service for analyzing frequency distributions across any dataset with associated ranges
 * Provides statistical analysis and adaptive scaling for heatmap visualizations
 */
class FrequencyAnalysisService {
    constructor() {
        this.globalAnalysis = new Map() // frequencyKey -> analysis results
        this.nodeAnalysis = new Map()   // nodeName -> analysis results
        this.scalingMethods = new Map() // frequencyKey -> optimal scaling method
        this.analysisResults = new Map() // frequencyType -> { keys: [...], analyses: Map<key, analysis> }
    }

    /**
     * Analyze frequency distributions for a single frequency type
     * @param {Object} nodeMetadata - Map of nodeName -> metadata containing frequencies
     * @param {string} frequencyType - Type of frequency to analyze (e.g., 'superpopulation', 'population', 'sex')
     * @param {Array} frequencyKeys - Array of keys to analyze within the frequency type
     */
    analyzeGlobalDistributions(nodeMetadata, frequencyType, frequencyKeys) {
        // console.log(`FrequencyAnalysisService: Analyzing ${frequencyType} frequency distributions...`)

        const frequencyData = new Map()
        const analyses = new Map()

        // Collect all frequency values for each key
        for (const [nodeName, metadata] of nodeMetadata) {
            const { frequency } = metadata
            if (frequency && frequency[frequencyType]) {
                for (const key of frequencyKeys) {
                    if (!frequencyData.has(key)) {
                        frequencyData.set(key, [])
                    }
                    const freq = frequency[frequencyType][key]
                    if (freq !== undefined && freq !== null) {
                        frequencyData.get(key).push(freq)
                    }
                }
            }
        }

        // Analyze each key's distribution
        for (const [key, freqValues] of frequencyData) {
            if (freqValues.length === 0) continue

            const analysis = this.analyzeDistribution(freqValues, key)
            analyses.set(key, analysis)

            // Also store in global analysis for backward compatibility
            this.globalAnalysis.set(key, analysis)

            // Determine optimal scaling method
            const optimalMethod = this.determineOptimalScaling(analysis)
            this.scalingMethods.set(key, optimalMethod)

            // console.log(`FrequencyAnalysisService: ${key} - ${freqValues.length} nodes, method: ${optimalMethod}`)
        }

        // Store results by frequency type for later use
        this.analysisResults.set(frequencyType, {
            keys: frequencyKeys,
            analyses: analyses
        })
    }

    /**
     * Analyze a single frequency distribution
     * @param {number[]} rawFrequencies - Array of frequency values
     * @param {string} frequencyKey - Frequency key name for context
     * @returns {Object} Complete statistical analysis
     */
    analyzeDistribution(rawFrequencies, frequencyKey) {

        const payload =
            {
                frequencyKey,
                rawFrequencies,
                distributionStats:calculateDistributionStats(rawFrequencies) ,
                normalizedValues:
                    {
                        percentile: normalizeDataset(rawFrequencies, 'percentile'),
                        log: normalizeDataset(rawFrequencies, 'log'),
                        sqrt: normalizeDataset(rawFrequencies, 'sqrt'),
                        quantile: normalizeDataset(rawFrequencies, 'quantile')
                    },
                dataRange:
                    {
                        min: Math.min(...rawFrequencies),
                        max: Math.max(...rawFrequencies),
                        range: Math.max(...rawFrequencies) - Math.min(...rawFrequencies)
                    },
                effectiveRange: this.calculateEffectiveRange(rawFrequencies)
            }

        return payload
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
        const { p5, p95 } = calculatePercentiles(frequencies, [5, 95])
        return { min: p5, max: p95, range: p95 - p5 }
    }

    /**
     * Get enhanced frequency value for any frequency type and key
     * @param {string} frequencyKey - Frequency key (e.g., 'AFR', 'AMR', 'male', 'female')
     * @param {string} frequencyType - Type of frequency ('superpopulation', 'population', 'sex')
     * @param {Object} nodeMetadata - Node metadata containing frequency data
     * @returns {number} Enhanced frequency value (0-1)
     */
    getEnhancedFrequency(frequencyKey, frequencyType, nodeMetadata = null) {
        const analysis = this.globalAnalysis.get(frequencyKey)
        if (!analysis) {
            console.warn(`FrequencyAnalysisService: No analysis found for ${frequencyKey}`)
            return undefined
        }

        // Get the raw frequency for this node
        const nodeFreq = this.getNodeFrequency(frequencyKey, frequencyType, nodeMetadata)
        if (nodeFreq === null) {
            return undefined
        }

        // Use the pre-computed optimal scaling method
        const scalingMethod = this.scalingMethods.get(frequencyKey)

        // Get the normalized value
        const nodeIndex = analysis.rawFrequencies.indexOf(nodeFreq)
        if (nodeIndex === -1) {
            console.warn(`FrequencyAnalysisService: Node frequency not found in analysis`)
            return undefined
        }

        return analysis.normalizedValues[scalingMethod][nodeIndex]
    }

    /**
     * Get the raw frequency for any frequency type and key
     * @param {string} frequencyKey - Frequency key (e.g., 'AFR', 'AMR', 'male', 'female')
     * @param {string} frequencyType - Type of frequency ('superpopulation', 'population', 'sex')
     * @param {Object} nodeMetadata - Node metadata containing frequency data
     * @returns {number|null} Raw frequency value
     */
    getNodeFrequency(frequencyKey, frequencyType, nodeMetadata = null) {
        if (!nodeMetadata || !nodeMetadata.frequency || !nodeMetadata.frequency[frequencyType]) {
            return null
        }

        const freq = nodeMetadata.frequency[frequencyType][frequencyKey]
        return freq !== undefined && freq !== null ? freq : null
    }

    /**
     * Get analysis results for a specific frequency key
     * @param {string} frequencyKey - Frequency key code
     * @returns {Object|null} Analysis results
     */
    getFrequencyKeyAnalysis(frequencyKey) {
        return this.globalAnalysis.get(frequencyKey) || null
    }

    /**
     * Get all available scaling methods for any frequency key
     * @param {string} frequencyKey - Frequency key code
     * @returns {string[]} Available scaling methods
     */
    getAvailableScalingMethods(frequencyKey) {
        return ['percentile', 'log', 'sqrt', 'quantile']
    }

    /**
     * Get scaling method information for display
     * @param {string} frequencyKey - Frequency key code
     * @returns {Object} Scaling method info
     */
    getScalingInfo(frequencyKey) {
        const analysis = this.globalAnalysis.get(frequencyKey)
        const method = this.scalingMethods.get(frequencyKey)

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
     * Get analysis results for a specific frequency type
     * @param {string} frequencyType - Type of frequency (e.g., 'superpopulation', 'population', 'sex')
     * @returns {Object|null} Analysis results with keys and analyses
     */
    getAnalysisResults(frequencyType) {
        return this.analysisResults.get(frequencyType) || null
    }

    /**
     * Get all available frequency types that have been analyzed
     * @returns {Array} Array of frequency type strings
     */
    getAnalyzedFrequencyTypes() {
        return Array.from(this.analysisResults.keys())
    }

    /**
     * Get keys for a specific frequency type
     * @param {string} frequencyType - Type of frequency
     * @returns {Array} Array of keys for this frequency type
     */
    getFrequencyKeys(frequencyType) {
        const results = this.analysisResults.get(frequencyType)
        return results ? results.keys : []
    }

    /**
     * Get analysis for a specific key within a frequency type
     * @param {string} frequencyType - Type of frequency
     * @param {string} key - Specific key within that type
     * @returns {Object|null} Analysis results for the specific key
     */
    getKeyAnalysis(frequencyType, key) {
        const results = this.analysisResults.get(frequencyType)
        return results ? results.analyses.get(key) : null
    }

    /**
     * Check if a frequency type has been analyzed
     * @param {string} frequencyType - Type of frequency
     * @returns {boolean} True if analyzed, false otherwise
     */
    hasAnalysis(frequencyType) {
        return this.analysisResults.has(frequencyType)
    }

    /**
     * Clear all analysis data
     */
    clear() {
        this.globalAnalysis.clear()
        this.nodeAnalysis.clear()
        this.scalingMethods.clear()
        this.analysisResults.clear()
    }
}

// Create singleton instance
const frequencyAnalysisService = new FrequencyAnalysisService()

export { frequencyAnalysisService }
