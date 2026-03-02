import {IGVColor} from 'igv-utils'

class DecodeError {
    constructor(message) {
        this.message = message
    }
}

class UCSCBedFeature {

    constructor(properties) {
        Object.assign(this, properties)
    }

    getAttributeValue(attributeName) {
        if (this.hasOwnProperty(attributeName)) {
            return this[attributeName]
        } else if (this.attributes) {
            return this.attributes[attributeName]
        }
    }
}

/**
 * Decode a UCSC "genePredExt" record.  refGene files are in this format.
 *
 * @param tokens
 * @param header
 * @returns {*}
 */
function decodeGenePredExt(tokens, header) {

    var shift = header.shift === undefined ? 0 : 1

    if (tokens.length <= 11 + shift) return undefined

    const cdStart = parseInt(tokens[5 + shift])
    const cdEnd = parseInt(tokens[6 + shift])
    const feature = {
        name: tokens[11 + shift],
        chr: tokens[1 + shift],
        strand: tokens[2 + shift],
        start: parseInt(tokens[3 + shift]),
        end: parseInt(tokens[4 + shift]),
        cdStart: cdStart,
        cdEnd: cdEnd,
        id: tokens[0 + shift]
    }

    const exons = decodeExons(
        parseInt(tokens[7 + shift]),
        tokens[8 + shift],
        tokens[9 + shift],
        tokens[14 + shift])
    findUTRs(exons, cdStart, cdEnd)

    feature.exons = exons

    return feature
}

function decodeExons(exonCount, startsString, endsString, frameOffsetsString) {

    const exonStarts = startsString.replace(/,$/, '').split(',')
    const exonEnds = endsString.replace(/,$/, '').split(',')
    const frameOffsets = frameOffsetsString ? frameOffsetsString.replace(/,$/, '').split(',') : undefined
    const exons = []
    for (let i = 0; i < exonCount; i++) {
        const start = parseInt(exonStarts[i])
        const end = parseInt(exonEnds[i])
        const exon = {start, end}
        if (frameOffsets) {
            const fo = parseInt(frameOffsets[i])
            if (fo != -1) exon.readingFrame = fo
        }
        exons.push(exon)
    }
    return exons

}

function findUTRs(exons, cdStart, cdEnd) {

    for (let exon of exons) {
        const end = exon.end
        const start = exon.start
        if (end < cdStart || start > cdEnd) {
            exon.utr = true
        } else {
            if (cdStart >= start && cdStart <= end) {
                exon.cdStart = cdStart
            }
            if (cdEnd >= start && cdEnd <= end) {
                exon.cdEnd = cdEnd
            }
        }
    }

}

export { decodeGenePredExt, decodeExons, findUTRs, UCSCBedFeature, DecodeError }
