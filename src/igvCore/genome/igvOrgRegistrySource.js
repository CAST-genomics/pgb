import { igvxhr } from 'igv-utils'

const PRIMARY_URL = 'https://igv.org/genomes/genomes3.json'
const BACKUP_URL = 'https://raw.githubusercontent.com/igvteam/igv/master/resources/genomes3.json'

async function initialize() {

    let genomeList

    try {
        genomeList = await igvxhr.loadJson(PRIMARY_URL, { timeout: 2000 })
    } catch (e) {
        try {
            genomeList = await igvxhr.loadJson(BACKUP_URL, { timeout: 10000 })
        } catch (e2) {
            console.error('igvOrgRegistrySource: failed to load genome configs from both primary and backup URLs')
            genomeList = []
        }
    }

    const map = new Map()
    for (const config of genomeList) {
        map.set(config.id, config)
    }

    return map
}

export { initialize, PRIMARY_URL, BACKUP_URL }
