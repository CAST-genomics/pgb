const appConfig = {
    // customAssemblyRegistryURL: '/custom-assemblies/custom-assemblies-12-s3-cors-enabled-bigGenePred-s3.json',
    customAssemblyRegistryURL: '/custom-assemblies/custom-assemblies-460-ucsc-fasta-ucsd-bigbed.json',

    preload: {
        enabled: false,
        locus: 'chr1:25240000-25460000'
    },

    diagnostic: {
        // Paint each node's bp extent on the annotation track with a
        // deterministic color. Used to visually verify that node↔track
        // registration and intra-node arc-length mapping are correct.
        bpBandOverlay: false
    }
}

export default appConfig
