import { GFFFeature } from './gffFeature.js'
import { parseAttributeString } from './parseAttributeString.js'

/**
 * Decode a single GFF3 line (already split into tokens) into a GFFFeature.
 * Returns undefined for comment lines or lines with < 9 columns.
 *
 * GFF3 coordinates are 1-based, inclusive.  We convert start to 0-based.
 */
function decodeGFF3(tokens) {

    if (tokens.length < 9) return undefined
    if (tokens[0].startsWith('#')) return undefined

    const chr = tokens[0]
    const source = tokens[1]
    const type = tokens[2]
    const start = parseInt(tokens[3]) - 1  // Convert to 0-based
    const end = parseInt(tokens[4])
    const score = tokens[5] === '.' ? undefined : parseFloat(tokens[5])
    const strand = tokens[6]
    const phase = tokens[7]
    const attributeString = tokens[8]

    const attrs = parseAttributeString(attributeString, '=')
    const attrMap = new Map(attrs)

    const id = attrMap.get('ID')
    const name = attrMap.get('Name')
    const parent = attrMap.get('Parent')

    return new GFFFeature({
        chr,
        source,
        type,
        start,
        end,
        score,
        strand,
        phase,
        attributeString,
        delim: '=',
        id,
        name,
        parent,
    })
}

export { decodeGFF3 }
