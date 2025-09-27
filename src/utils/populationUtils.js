/**
 * Pangenome utility functions and lookup tables
 */

/**
 * Lookup table for ancestry superpopulation acronyms to human-readable names
 */
export const SUPERPOPULATION_NAMES = new Map([
    ['AMR', 'Ad Mixed American'],
    ['AFR', 'African'],
    ['EAS', 'East Asian'],
    ['SAS', 'South Asian'],
    ['N/A', 'Not Available']
]);

/**
 * Lookup table for ancestry population acronyms to human-readable names
 */
export const POPULATION_NAMES = new Map([
    // Ad Mixed American populations
    ['CLM', 'Colombian'],
    ['PUR', 'Puerto Rican'],
    ['PEL', 'Peruvian'],

    // African populations
    ['ACB', 'African Caribbean Barbadian'],
    ['GWD', 'Gambian in Western Division'],
    ['ESN', 'Esan in Nigeria'],
    ['MSL', 'Mende in Sierra Leone'],
    ['YRI', 'Yoruba in Ibadan, Nigeria'],
    ['ASW', 'African Ancestry in Southwest US'],
    ['MKK', 'Maasai in Kinyawa, Kenya'],

    // East Asian populations
    ['CHS', 'Han Chinese South'],
    ['KHV', 'Kinh in Ho Chi Minh City, Vietnam'],

    // South Asian populations
    ['PJL', 'Punjabi in Lahore, Pakistan'],

    // Not Available
    ['N/A', 'Not Available']
]);

/**
 * Get human-readable name for a superpopulation acronym
 * @param {string} acronym - The superpopulation acronym (e.g., 'AMR', 'AFR')
 * @returns {string} Human-readable name or the original acronym if not found
 */
export function getSuperpopulationName(acronym) {
    return SUPERPOPULATION_NAMES.get(acronym) || acronym;
}

/**
 * Get human-readable name for a population acronym
 * @param {string} acronym - The population acronym (e.g., 'CLM', 'YRI')
 * @returns {string} Human-readable name or the original acronym if not found
 */
export function getPopulationName(acronym) {
    return POPULATION_NAMES.get(acronym) || acronym;
}

/**
 * Get all superpopulation names as an array of objects with acronym and name
 * @returns {Array} Array of objects with {acronym, name} properties
 */
export function getAllSuperpopulationNames(ignoreNA = true) {
    const list = Array.from(SUPERPOPULATION_NAMES.entries()).map(([acronym, name]) => ({ acronym, name }))
    return true === ignoreNA ? list.filter(item => 'N/A' !== item.acronym) : list
}

/**
 * Get all population names as an array of objects with acronym and name
 * @returns {Array} Array of objects with {acronym, name} properties
 */
export function getAllPopulationNames(ignoreNA = true) {
    const list = Array.from(POPULATION_NAMES.entries()).map(([acronym, name]) => ({ acronym, name }))
    return true === ignoreNA ? list.filter(item => 'N/A' !== item.acronym) : list
}

/**
 * Get populations grouped by superpopulation
 * @returns {Object} Object with superpopulation acronyms as keys and arrays of population objects as values
 */
export function getPopulationsBySuperpopulation() {
    const populationsBySuperpop = {
        'AMR': ['CLM', 'PUR', 'PEL'],
        'AFR': ['ACB', 'GWD', 'ESN', 'MSL', 'YRI', 'ASW', 'MKK'],
        'EAS': ['CHS', 'KHV'],
        'SAS': ['PJL'],
        'N/A': ['N/A']
    };

    const result = {};
    Object.entries(populationsBySuperpop).forEach(([superpop, populations]) => {
        result[superpop] = populations.map(pop => ({
            acronym: pop,
            name: getPopulationName(pop)
        }));
    });

    return result;
}

/**
 * Get hierarchical population structure for the PopulationWidget
 * @returns {Array} Array of superpopulation objects with their populations
 */
export function getHierarchicalPopulationStructure(ignoreNA = true) {
    const populationsBySuperpop = getPopulationsBySuperpopulation();
    const result = [];
    
    Object.entries(populationsBySuperpop).forEach(([superpopAcronym, populations]) => {
        if (ignoreNA && superpopAcronym === 'N/A') {
            return;
        }
        
        result.push({
            type: 'superpopulation',
            acronym: superpopAcronym,
            name: getSuperpopulationName(superpopAcronym),
            populations: populations
        });
    });
    
    return result;
}

/**
 * Find which superpopulation a population belongs to
 * @param {string} population - The population code
 * @returns {string|null} The superpopulation code or null if not found
 */
export function findSuperpopulationForPopulation(population) {
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
