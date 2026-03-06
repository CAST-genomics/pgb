function initialize(genomes) {

    if (!genomes) {
        return new Map()
    }

    let genomeList

    if (Array.isArray(genomes)) {
        genomeList = genomes
    } else if (genomes && typeof genomes === 'object' && genomes.id) {
        genomeList = [genomes]
    } else {
        console.error('customRegistrySource: expected an array of genome configs or a single genome config')
        return new Map()
    }

    const map = new Map()
    for (const config of genomeList) {
        map.set(config.id, config)
    }

    return map
}

export { initialize }
