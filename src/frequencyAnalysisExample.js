/**
 * Example usage of the simplified FrequencyAnalysisService
 * Shows how to analyze different types of frequency data with focused, single-purpose calls
 */

import { frequencyAnalysisService } from './frequencyAnalysisService.js'

/**
 * Example: Analyze superpopulation frequencies
 */
export function analyzeSuperpopulations(nodeMetadata) {
    console.log('Analyzing superpopulation frequencies...')
    frequencyAnalysisService.analyzeGlobalDistributions(nodeMetadata, 'superpopulation', ['AMR', 'AFR', 'EAS', 'SAS', 'N/A'])
}

/**
 * Example: Analyze sex frequencies
 */
export function analyzeSexFrequencies(nodeMetadata) {
    console.log('Analyzing sex frequencies...')
    frequencyAnalysisService.analyzeGlobalDistributions(nodeMetadata, 'sex', ['male', 'female'])
}

/**
 * Example: Analyze population frequencies
 */
export function analyzePopulationFrequencies(nodeMetadata) {
    console.log('Analyzing population frequencies...')
    frequencyAnalysisService.analyzeGlobalDistributions(nodeMetadata, 'population', ['CLM', 'ACB', 'GWD', 'ESN', 'CHS', 'PUR', 'PEL', 'MSL', 'KHV', 'PJL', 'YRI', 'ASW', 'MKK'])
}

/**
 * Example: Analyze custom frequency types
 */
export function analyzeCustomFrequencies(nodeMetadata) {
    console.log('Analyzing custom frequency types...')
    frequencyAnalysisService.analyzeGlobalDistributions(nodeMetadata, 'disease', ['diabetes', 'hypertension', 'cancer'])
    frequencyAnalysisService.analyzeGlobalDistributions(nodeMetadata, 'region', ['north', 'south', 'east', 'west'])
    frequencyAnalysisService.analyzeGlobalDistributions(nodeMetadata, 'ageGroup', ['young', 'middle', 'old'])
}

/**
 * Example: Get enhanced frequencies for different types
 */
export function getEnhancedFrequencies(nodeName, nodeMetadata) {
    // Superpopulation frequencies
    const enhancedAFR = frequencyAnalysisService.getEnhancedFrequencyGeneric('AFR', 'superpopulation', nodeMetadata)
    const enhancedAMR = frequencyAnalysisService.getEnhancedFrequencyGeneric('AMR', 'superpopulation', nodeMetadata)
    
    // Sex frequencies
    const enhancedMale = frequencyAnalysisService.getEnhancedFrequencyGeneric('male', 'sex', nodeMetadata)
    const enhancedFemale = frequencyAnalysisService.getEnhancedFrequencyGeneric('female', 'sex', nodeMetadata)
    
    // Population frequencies
    const enhancedACB = frequencyAnalysisService.getEnhancedFrequencyGeneric('ACB', 'population', nodeMetadata)
    const enhancedGWD = frequencyAnalysisService.getEnhancedFrequencyGeneric('GWD', 'population', nodeMetadata)
    
    // Custom frequency types
    const enhancedDisease = frequencyAnalysisService.getEnhancedFrequencyGeneric('diabetes', 'disease', nodeMetadata)
    
    return {
        superpopulations: { AFR: enhancedAFR, AMR: enhancedAMR },
        sex: { male: enhancedMale, female: enhancedFemale },
        populations: { ACB: enhancedACB, GWD: enhancedGWD },
        custom: { diabetes: enhancedDisease }
    }
}

/**
 * Example: Complete analysis workflow with retained results
 */
export function performCompleteAnalysis(nodeMetadata) {
    console.log('Performing complete frequency analysis...')
    
    // Analyze each frequency type separately
    frequencyAnalysisService.analyzeGlobalDistributions(nodeMetadata, 'superpopulation', ['AMR', 'AFR', 'EAS', 'SAS', 'N/A'])
    frequencyAnalysisService.analyzeGlobalDistributions(nodeMetadata, 'sex', ['male', 'female'])
    frequencyAnalysisService.analyzeGlobalDistributions(nodeMetadata, 'population', ['CLM', 'ACB', 'GWD', 'ESN', 'CHS', 'PUR', 'PEL', 'MSL', 'KHV', 'PJL', 'YRI', 'ASW', 'MKK'])
    
    // Now we can retrieve the retained analyses
    const analyzedTypes = frequencyAnalysisService.getAnalyzedFrequencyTypes()
    console.log('Analyzed frequency types:', analyzedTypes)
    
    // Get specific analysis results
    const superpopResults = frequencyAnalysisService.getAnalysisResults('superpopulation')
    const sexResults = frequencyAnalysisService.getAnalysisResults('sex')
    const populationResults = frequencyAnalysisService.getAnalysisResults('population')
    
    console.log('Superpopulation keys:', frequencyAnalysisService.getFrequencyKeys('superpopulation'))
    console.log('Sex keys:', frequencyAnalysisService.getFrequencyKeys('sex'))
    console.log('Population keys:', frequencyAnalysisService.getFrequencyKeys('population'))
    
    // Get specific key analyses
    const afrAnalysis = frequencyAnalysisService.getKeyAnalysis('superpopulation', 'AFR')
    const maleAnalysis = frequencyAnalysisService.getKeyAnalysis('sex', 'male')
    const acbAnalysis = frequencyAnalysisService.getKeyAnalysis('population', 'ACB')
    
    return {
        analyzedTypes,
        superpopulations: superpopResults,
        sex: sexResults,
        populations: populationResults,
        specificAnalyses: {
            AFR: afrAnalysis,
            male: maleAnalysis,
            ACB: acbAnalysis
        }
    }
}

/**
 * Example: Check if analyses exist before using them
 */
export function useRetainedAnalyses() {
    // Check if superpopulation analysis exists
    if (frequencyAnalysisService.hasAnalysis('superpopulation')) {
        console.log('Superpopulation analysis available')
        const keys = frequencyAnalysisService.getFrequencyKeys('superpopulation')
        console.log('Available superpopulation keys:', keys)
        
        // Get analysis for each key
        keys.forEach(key => {
            const analysis = frequencyAnalysisService.getKeyAnalysis('superpopulation', key)
            console.log(`${key} analysis:`, analysis?.distributionStats)
        })
    } else {
        console.log('No superpopulation analysis found')
    }
}
