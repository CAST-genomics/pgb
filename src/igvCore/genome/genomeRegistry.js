import { initialize as initIgvOrg } from './igvOrgRegistrySource.js'
import { initialize as initCustom } from './customRegistrySource.js'
import { genomeIDAliases } from './genomeIDAliases.js'

let registry = undefined
let initialized = false
let customRegistryURL = undefined

function setCustomRegistryURL(url) {
    customRegistryURL = url
}

async function initializeGenomeRegistry() {

    if (initialized) {
        return
    }

    const [igvOrgMap, customMap] = await Promise.all([
        initIgvOrg(),
        initCustom(customRegistryURL),
    ])

    // Merge: custom wins on ID collision
    registry = new Map([...igvOrgMap, ...customMap])

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
    customRegistryURL = undefined
}

export { initializeGenomeRegistry, getGenomeConfig, isInitialized, resetRegistry, setCustomRegistryURL }
