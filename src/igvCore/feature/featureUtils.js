import pack from "../layout/featurePacker.js"

/**
 * Assigns a row to each feature such that features do not overlap.
 *
 * @param features
 * @param maxRows
 * @param filter Function thta takes a feature and returns a boolean indicating visibility
 */
function packFeatures(features, maxRows, filter) {

    maxRows = maxRows || 1000
    if (features == null || features.length === 0) {
        return
    }
    // Segregate by chromosome
    const chrFeatureMap = {}
    const chrs = []
    for (let feature of features) {
        if(filter && !filter(feature)) {
            feature.row = undefined;
        } else {
            const chr = feature.chr
            let flist = chrFeatureMap[chr]
            if (!flist) {
                flist = []
                chrFeatureMap[chr] = flist
                chrs.push(chr)
            }
            flist.push(feature)
        }
    }

    // Loop through chrosomosomes and pack features;
    for (let chr of chrs) {
        pack(chrFeatureMap[chr], maxRows)
    }
}

export {packFeatures}
