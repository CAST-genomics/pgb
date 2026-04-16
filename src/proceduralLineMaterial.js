import * as THREE from 'three'
import vertexShader from '../shaders/textured-line.vert.glsl?raw'
import fragmentShader from '../shaders/procedural-line.frag.glsl?raw'

/**
 * A custom ShaderMaterial for Line2 with procedural visual styles.
 *
 * Drop-in replacement for LineMaterial in WORLD_UNITS mode.
 *
 * The rendering model:
 *   - Shape is defined procedurally in the fragment shader (no textures)
 *   - Material diffuse color provides all coloring
 *   - Border width is consistent in world space on all four sides
 *
 * Currently supports: rectangular outline (border on all four edges).
 *
 * Usage:
 *   const material = new ProceduralLineMaterial({
 *       color: 0xff0000,
 *       linewidth: 16,
 *       borderWidth: 0.15
 *   })
 */
class ProceduralLineMaterial extends THREE.ShaderMaterial {

    constructor(parameters = {}) {

        const { color, linewidth, borderWidth, opacity, alphaTest, endBorderWorldSize, ...rest } = parameters

        const diffuseColor = color !== undefined ? new THREE.Color(color) : new THREE.Color(1, 1, 1)

        super({
            type: 'ProceduralLineMaterial',

            uniforms: {

                // Stock LineMaterial uniforms (WORLD_UNITS subset)
                diffuse:    { value: diffuseColor },
                opacity:    { value: opacity !== undefined ? opacity : 1.0 },
                linewidth:  { value: linewidth !== undefined ? linewidth : 1.0 },
                resolution: { value: new THREE.Vector2(1, 1) },

                // Alpha test threshold
                alphaTest: { value: alphaTest !== undefined ? alphaTest : 0.1 },

                // Border width as fraction of line width (0.15 = 15% on each side)
                borderWidth: { value: borderWidth !== undefined ? borderWidth : 0.15 },

                // Border width for start/end edges in fixed world units
                endBorderWorldSize: { value: endBorderWorldSize !== undefined ? endBorderWorldSize : 0.1 },
            },

            vertexShader,
            fragmentShader,

            transparent: true,
            depthWrite: true,
            clipping: true,

            defines: {
                'WORLD_UNITS': '',
            },

            ...rest
        })

        this.isProceduralLineMaterial = true
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

    // --- Procedural properties ---

    get borderWidth() {
        return this.uniforms.borderWidth.value
    }

    set borderWidth(value) {
        this.uniforms.borderWidth.value = value
    }

    get endBorderWorldSize() {
        return this.uniforms.endBorderWorldSize.value
    }

    set endBorderWorldSize(value) {
        this.uniforms.endBorderWorldSize.value = value
    }
}

export default ProceduralLineMaterial
