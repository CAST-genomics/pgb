import { BGZip, igvxhr } from 'igv-utils'
import { buildOptions } from '../util/igvUtils.js'
import { parseTabixIndex } from './tabixIndex.js'

const TABIX_MAGIC = 21578324

async function loadIndex(indexURL, config) {

    let arrayBuffer = await igvxhr.loadArrayBuffer(indexURL, buildOptions(config))
    let dv = new DataView(arrayBuffer)

    // Tabix indexes are bgzipped — check for gzip magic number and inflate
    if (dv.getUint8(0) === 0x1f && dv.getUint8(1) === 0x8b) {
        const inflate = BGZip.unbgzf(arrayBuffer)
        arrayBuffer = inflate.buffer
        dv = new DataView(arrayBuffer)
    }

    const magic = dv.getInt32(0, true)
    if (magic === TABIX_MAGIC) {
        return parseTabixIndex(arrayBuffer)
    } else {
        throw Error(`Unrecognized index type: ${indexURL}`)
    }
}

export { loadIndex }
