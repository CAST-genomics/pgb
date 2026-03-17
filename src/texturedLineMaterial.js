import * as THREE from 'three'
import vertexShader from '../shaders/textured-line.vert.glsl?raw'
import fragmentShader from '../shaders/textured-line.frag.glsl?raw'

/**
 * A custom ShaderMaterial for Line2/ParametricLine that supports alpha-matte textures.
 *
 * Drop-in replacement for LineMaterial in WORLD_UNITS mode.
 *
 * The rendering model:
 *   - Texture alpha channel = holdout matte (defines the shape)
 *   - Material diffuse color = tint (provides all coloring)
 *   - final pixel = vec4(diffuse, texture.alpha * opacity)
 *
 * A solid white texture (alpha=1 everywhere) replicates stock LineMaterial behavior.
 * An outline texture (alpha=1 at edges, alpha=0 in center) produces hollow lines.
 * Any pattern painted onto the canvas alpha channel becomes the line's visual style.
 *
 * Usage:
 *   const texture = createOutlineTexture()
 *
 *   const material = new TexturedLineMaterial({
 *       color: 0xff0000,
 *       linewidth: 16,
 *       lineTexture: texture
 *   })
 */
class TexturedLineMaterial extends THREE.ShaderMaterial {

    constructor(parameters = {}) {

        const { color, linewidth, lineTexture, opacity, alphaTest, ...rest } = parameters

        const diffuseColor = color !== undefined ? new THREE.Color(color) : new THREE.Color(1, 1, 1)

        super({
            type: 'TexturedLineMaterial',

            uniforms: {

                // Stock LineMaterial uniforms (WORLD_UNITS subset)
                diffuse:    { value: diffuseColor },
                opacity:    { value: opacity !== undefined ? opacity : 1.0 },
                linewidth:  { value: linewidth !== undefined ? linewidth : 1.0 },
                resolution: { value: new THREE.Vector2(1, 1) },

                // Alpha-matte texture
                lineTexture: { value: lineTexture || null },

                // Alpha test threshold — fragments with alpha below this are discarded.
                // This avoids depth/sorting issues that come with transparency.
                alphaTest: { value: alphaTest !== undefined ? alphaTest : 0.1 },
            },

            vertexShader,
            fragmentShader,

            // Transparency support
            transparent: true,
            depthWrite: true,

            clipping: true,

            // WORLD_UNITS define — matches LineMaterial's worldUnits: true
            defines: {
                'WORLD_UNITS': '',
            },

            ...rest
        })

        this.isTexturedLineMaterial = true
    }

    // --- Property accessors matching LineMaterial's API ---

    get color() {
        return this.uniforms.diffuse.value
    }

    set color(value) {
        this.uniforms.diffuse.value = value
    }

    get linewidth() {
        return this.uniforms.linewidth.value
    }

    set linewidth(value) {
        if (!this.uniforms.linewidth) return
        this.uniforms.linewidth.value = value
    }

    get resolution() {
        return this.uniforms.resolution.value
    }

    set resolution(value) {
        this.uniforms.resolution.value.copy(value)
    }

    get opacity() {
        return this.uniforms.opacity.value
    }

    set opacity(value) {
        if (!this.uniforms) return
        this.uniforms.opacity.value = value
    }

    // --- Texture property ---

    get lineTexture() {
        return this.uniforms.lineTexture.value
    }

    set lineTexture(value) {
        this.uniforms.lineTexture.value = value
    }
}

export default TexturedLineMaterial
