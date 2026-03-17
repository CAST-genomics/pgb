import * as THREE from 'three'

/**
 * Factory for creating alpha-matte CanvasTexture instances.
 *
 * Each plugin function paints ONLY the alpha channel of a canvas.
 * The canvas is used as a holdout matte — white (alpha=1) areas are visible,
 * transparent (alpha=0) areas are cut away. The material's diffuse color
 * provides all coloring.
 *
 * Convention: paint in white (#ffffff) for visible regions.
 * The canvas background is transparent by default (alpha=0 = invisible).
 *
 * Texture orientation when mapped onto the line:
 *   - Canvas X axis → along the line (segment start to end)
 *   - Canvas Y axis → across the line width (left edge to right edge)
 */

/**
 * Solid fill — alpha=1 everywhere.
 * Replicates stock LineMaterial: fully solid colored line.
 */
function createSolidTexture(width = 64, height = 64) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)

    return _makeTexture(canvas)
}

/**
 * Outline — a rectangular border (all four edges).
 * Produces a hollow line with sharp corners.
 *
 * @param {number} [borderWeight=0.15] — stroke width as fraction of canvas height
 * @param {number} [padding=0.05] — inset from canvas edges as fraction of canvas dimensions
 * @param {number} [width=256]
 * @param {number} [height=64]
 */
function createOutlineTexture(borderWeight = 0.15, padding = 0.05, width = 256, height = 64) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')

    const strokeWidth = Math.max(1, Math.round(height * borderWeight))
    const px = Math.round(width * padding)
    const py = Math.round(height * padding)

    const half = strokeWidth / 2
    const x = px + half
    const y = py + half
    const w = width - 2 * (px + half)
    const h = height - 2 * (py + half)

    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = strokeWidth
    ctx.strokeRect(x, y, w, h)

    return _makeTexture(canvas)
}

/**
 * Dashed — alpha=1 in dash segments, alpha=0 in gaps.
 * Produces a dashed line pattern.
 *
 * @param {number} [dashRatio=0.6] — fraction of each repeat that is visible
 *   (0.5 = equal dash and gap, 0.8 = long dashes short gaps)
 * @param {number} [repeats=4] — number of dash cycles across the texture
 * @param {number} [width=256]
 * @param {number} [height=64]
 */
function createDashedTexture(dashRatio = 0.8, repeats = 4, width = 256, height = 64) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    const cycleWidth = width / repeats
    const dashWidth = cycleWidth * dashRatio

    ctx.fillStyle = '#ffffff'

    for (let i = 0; i < repeats; i++) {
        const x = i * cycleWidth
        ctx.fillRect(x, 0, dashWidth, height)
    }

    return _makeTexture(canvas)
}

/**
 * Dotted — alpha=1 in circular dots, alpha=0 elsewhere.
 * Produces a dotted line pattern.
 *
 * @param {number} [dotRadius=0.35] — radius as fraction of cell height (0.5 = touches edges)
 * @param {number} [repeats=6] — number of dots across the texture
 * @param {number} [width=256]
 * @param {number} [height=64]
 */
function createDottedTexture(dotRadius = 0.35, repeats = 6, width = 256, height = 64) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    const cellWidth = width / repeats
    const radius = (height / 2) * dotRadius

    ctx.fillStyle = '#ffffff'

    for (let i = 0; i < repeats; i++) {
        const cx = (i + 0.5) * cellWidth
        const cy = height / 2

        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        ctx.fill()
    }

    return _makeTexture(canvas)
}

// --- Internal helper ---

function _makeTexture(canvas) {
    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    texture.needsUpdate = true
    return texture
}

// --- Singleton textures (shared across all materials using the same style) ---

let _solidTexture = null

function getSolidTexture() {
    if (!_solidTexture) {
        _solidTexture = createSolidTexture()
    }
    return _solidTexture
}

let _outlineTexture = null

function getOutlineTexture() {
    if (!_outlineTexture) {
        _outlineTexture = createOutlineTexture(0.2, 0, 256, 64)
    }
    return _outlineTexture
}

let _dashedTexture = null

function getDashedTexture() {
    if (!_dashedTexture) {
        _dashedTexture = createDashedTexture()
    }
    return _dashedTexture
}

export {
    createSolidTexture,
    createOutlineTexture,
    createDashedTexture,
    createDottedTexture,
    getSolidTexture,
    getOutlineTexture,
    getDashedTexture
}
