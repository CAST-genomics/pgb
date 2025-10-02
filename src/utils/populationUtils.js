/**
 * Pangenome utility functions and lookup tables
 */

/**
 * Static lookup table for ancestry superpopulation acronyms to human-readable names
 * Built from comprehensive assembly metadata analysis
 */
export const SUPERPOPULATION_NAMES = new Map([
    ['AMR', 'Ad Mixed American'],
    ['AFR', 'African'],
    ['EAS', 'East Asian'],
    ['SAS', 'South Asian'],
    ['EUR', 'European'],
    ['N/A', 'Not Available']
]);

/**
 * Static lookup table for ancestry population acronyms to human-readable names
 * Built from comprehensive assembly metadata analysis
 */
export const POPULATION_NAMES = new Map([
    // Ad Mixed American populations
    ['CLM', 'Colombian in Medellin, Colombia'],
    ['PUR', 'Puerto Rican in Puerto Rico'],
    ['PEL', 'Peruvian in Lima, Peru'],
    ['MXL', 'Mexican Ancestry in Los Angeles, CA'],

    // African populations
    ['ACB', 'African Caribbean in Barbados'],
    ['GWD', 'Gambian in Western Division Mandinka'],
    ['ESN', 'Esan in Nigeria'],
    ['MSL', 'Mende in Sierra Leone'],
    ['YRI', 'Yoruba in Ibadan, Nigeria'],
    ['ASW', 'African Ancestry in Southwest USA'],
    ['MKK', 'Maasai in Kinyawa, Kenya'],
    ['LWK', 'Luhya in Webuye, Kenya'],
    ['ASL', 'African Americans living in St. Louis, MO'],

    // East Asian populations
    ['CHS', 'Han Chinese South, China'],
    ['CHB', 'Han Chinese in Beijing, China'],
    ['KHV', 'Kinh in Ho Chi Minh City, Vietnam'],
    ['JPT', 'Japanese in Tokyo, Japan'],
    ['CDX', 'Chinese Dai in Xishuangbanna'],

    // South Asian populations
    ['PJL', 'Punjabi in Lahore, Pakistan'],
    ['BEB', 'Bengali in Bangladesh'],
    ['STU', 'Sri Lankan Tamil in the UK'],
    ['ITU', 'Indian Telugu in the UK'],
    ['GIH', 'Gujarati Indians in Houston, TX'],

    // European populations
    ['FIN', 'Finnish in Finland'],
    ['GBR', 'British from England and Scotland'],
    ['IBS', 'Iberian Populations in Spain'],
    ['TSI', 'Toscani in Italia'],

    // Not Available
    ['N/A', 'Not Available']
]);
/**
 * Get human-readable name for a superpopulation acronym
 * @param {string} acronym - The superpopulation acronym (e.g., 'AMR', 'AFR')
 * @returns {string} Human-readable name or the original acronym if not found
 */
export function getSuperpopulationName(acronym) {
    const name = SUPERPOPULATION_NAMES.get(acronym);
    if (!name) {
        console.warn(`PopulationUtils: Superpopulation acronym '${acronym}' not found in SUPERPOPULATION_NAMES table`);
        return acronym;
    }
    return name;
}

/**
 * Get human-readable name for a population acronym
 * @param {string} acronym - The population acronym (e.g., 'CLM', 'YRI')
 * @returns {string} Human-readable name or the original acronym if not found
 */
export function getPopulationName(acronym) {
    const name = POPULATION_NAMES.get(acronym);
    if (!name) {
        console.warn(`PopulationUtils: Population acronym '${acronym}' not found in POPULATION_NAMES table`);
        return acronym;
    }
    return name;
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
    const result = {};

    // Build the mapping dynamically from the current data
    for (const [populationAcronym] of POPULATION_NAMES) {
        const superpop = findSuperpopulationForPopulation(populationAcronym);
        if (superpop) {
            if (!result[superpop]) {
                result[superpop] = [];
            }
            result[superpop].push({
                acronym: populationAcronym,
                name: getPopulationName(populationAcronym)
            });
        }
    }

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
 * Get hierarchical population structure for the PopulationWidget based on actual data
 * @param {Object} jsonData - The JSON data containing assembly metadata
 * @param {boolean} ignoreNA - Whether to ignore N/A populations
 * @returns {Array} Array of superpopulation objects with their populations from the actual dataset
 */
export function getHierarchicalPopulationStructureFromData(jsonData, ignoreNA = true) {
    // Extract actual populations and superpopulations from the dataset
    const actualPopulations = new Set();
    const actualSuperpopulations = new Set();

    // Collect from node assembly_metadata counts
    for (const [nodeId, nodeData] of Object.entries(jsonData.node)) {
        if (nodeData.assembly_metadata?.count) {
            const { superpopulation, population } = nodeData.assembly_metadata.count;

            if (superpopulation) {
                Object.keys(superpopulation).forEach(acronym => actualSuperpopulations.add(acronym));
            }

            if (population) {
                Object.keys(population).forEach(acronym => actualPopulations.add(acronym));
            }
        }
    }

    // Build hierarchical structure from actual data
    const populationsBySuperpop = {};

    for (const populationAcronym of actualPopulations) {
        const superpop = findSuperpopulationForPopulation(populationAcronym);
        if (superpop && actualSuperpopulations.has(superpop)) {
            if (!populationsBySuperpop[superpop]) {
                populationsBySuperpop[superpop] = [];
            }
            populationsBySuperpop[superpop].push({
                acronym: populationAcronym,
                name: getPopulationName(populationAcronym)
            });
        }
    }

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
        'CLM': 'AMR', 'PUR': 'AMR', 'PEL': 'AMR', 'MXL': 'AMR',
        // African populations
        'ACB': 'AFR', 'GWD': 'AFR', 'ESN': 'AFR', 'MSL': 'AFR',
        'YRI': 'AFR', 'ASW': 'AFR', 'MKK': 'AFR', 'LWK': 'AFR', 'ASL': 'AFR',
        // East Asian populations
        'CHS': 'EAS', 'CHB': 'EAS', 'KHV': 'EAS', 'JPT': 'EAS', 'CDX': 'EAS',
        // South Asian populations
        'PJL': 'SAS', 'BEB': 'SAS', 'STU': 'SAS', 'ITU': 'SAS', 'GIH': 'SAS',
        // European populations
        'FIN': 'EUR', 'GBR': 'EUR', 'IBS': 'EUR', 'TSI': 'EUR',
        // Not Available
        'N/A': 'N/A'
    };

    return populationToSuperpop[population] || null;
}
