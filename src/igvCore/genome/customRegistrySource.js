import { igvxhr } from 'igv-utils'

async function initialize(url) {

    if (!url) {
        return new Map()
    }

    let genomeList

    try {
        genomeList = await igvxhr.loadJson(url, {})
    } catch (e) {
        console.error(`customRegistrySource: failed to load custom genome configs from ${url}`)
        return new Map()
    }

    if (Array.isArray(genomeList)) {
        // already an array — use as-is
    } else if (genomeList && typeof genomeList === 'object' && genomeList.id) {
        genomeList = [genomeList]
    } else {
        console.error('customRegistrySource: response is not a valid genome config or array')
        return new Map()
    }

    const map = new Map()
    for (const config of genomeList) {
        map.set(config.id, config)
    }

    return map
}

export { initialize }
