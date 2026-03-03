import { igvxhr } from 'igv-utils'
import { genomeIDAliases } from './genomeIDAliases.js'

const PRIMARY_URL = 'https://igv.org/genomes/genomes3.json'
const BACKUP_URL = 'https://raw.githubusercontent.com/igvteam/igv/master/resources/genomes3.json'

let registry = undefined
let initialized = false

async function initializeGenomeRegistry() {

    if (initialized) {
        return
    }

    let genomeList

    try {
        genomeList = await igvxhr.loadJson(PRIMARY_URL, { timeout: 2000 })
    } catch (e) {
        try {
            genomeList = await igvxhr.loadJson(BACKUP_URL, { timeout: 10000 })
        } catch (e2) {
            console.error('GenomeRegistry: failed to load genome configs from both primary and backup URLs')
            genomeList = []
        }
    }

    registry = new Map()
    for (const config of genomeList) {
        registry.set(config.id, config)
    }

    initialized = true
}

function getGenomeConfig(id) {

    if (!initialized) {
        throw new Error('GenomeRegistry has not been initialized')
    }

    return registry.get(id) || registry.get(genomeIDAliases.get(id)) || undefined
}

function isInitialized() {
    return initialized
}

function resetRegistry() {
    registry = undefined
    initialized = false
}

export { initializeGenomeRegistry, getGenomeConfig, isInitialized, resetRegistry }
