/*
 * Procedural Line Fragment Shader
 * Shares vertex shader with TexturedLineMaterial (WORLD_UNITS mode).
 *
 * Draws a procedural outline (rectangular border) using the parameterization
 * directly — no texture sampling. Border width is consistent in world space
 * on all four sides regardless of node length.
 *
 * Requires:
 *   - borderWidth uniform: border thickness as fraction of line width (cross-line)
 *   - nodeArcLength attribute (per-instance): total arc length of the node,
 *     used to compute consistent world-space border at start/end edges
 */

uniform vec3 diffuse;
uniform float opacity;
uniform float linewidth;
uniform float alphaTest;

// Border width as fraction of line width (0.1 = 10% of line width on each side)
uniform float borderWidth;

// Border width for start/end edges in world units (zoom-independent)
uniform float endBorderWorldSize;

varying vec4 worldPos;
varying vec3 worldStart;
varying vec3 worldEnd;
varying vec2 vUv;
varying float vAlongLine;
varying float vNodeArcLength;

#include <common>
#include <color_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

vec2 closestLineToLine(vec3 p1, vec3 p2, vec3 p3, vec3 p4) {

    float mua;
    float mub;

    vec3 p13 = p1 - p3;
    vec3 p43 = p4 - p3;
    vec3 p21 = p2 - p1;

    float d1343 = dot( p13, p43 );
    float d4321 = dot( p43, p21 );
    float d1321 = dot( p13, p21 );
    float d4343 = dot( p43, p43 );
    float d2121 = dot( p21, p21 );

    float denom = d2121 * d4343 - d4321 * d4321;
    float numer = d1343 * d4321 - d1321 * d4343;

    mua = numer / denom;
    mua = clamp( mua, 0.0, 1.0 );
    mub = ( d1343 + d4321 * ( mua ) ) / d4343;
    mub = clamp( mub, 0.0, 1.0 );

    return vec2( mua, mub );

}

void main() {

    #include <clipping_planes_fragment>

    // --- World-units distance computation (from stock LineMaterial) ---
    vec3 rayEnd = normalize( worldPos.xyz ) * 1e5;
    vec3 lineDir = worldEnd - worldStart;
    vec2 params = closestLineToLine( worldStart, worldEnd, vec3( 0.0, 0.0, 0.0 ), rayEnd );

    vec3 p1 = worldStart + lineDir * params.x;
    vec3 p2 = rayEnd * params.y;
    vec3 delta = p1 - p2;
    float len = length( delta );

    // norm: 0 at line center, 0.5 at line edge
    float norm = len / linewidth;

    // Discard fragments outside the line quad
    if ( norm > 0.5 ) {
        discard;
    }

    // --- Procedural outline ---
    // Cross-line: 0 (left edge) to 1 (right edge)
    float across = vUv.x * 0.5 + 0.5;

    // Along-line: 0 (node start) to 1 (node end)
    float along = vAlongLine;

    // Cross-line border: borderWidth is a fraction of the line width
    float crossBorder = borderWidth;

    // Along-line border: fixed world-space size, converted to parameter space.
    // endBorderWorldSize is a constant in world units (not affected by zoom).
    // Dividing by nodeArcLength converts it to the 0→1 parameter range.
    float alongBorder = vNodeArcLength > 0.0 ? endBorderWorldSize / vNodeArcLength : 0.0;

    bool nearTop    = across < crossBorder;
    bool nearBottom = across > (1.0 - crossBorder);
    bool nearStart  = along < alongBorder;
    bool nearEnd    = along > (1.0 - alongBorder);

    if ( !nearTop && !nearBottom && !nearStart && !nearEnd ) {
        discard;
    }

    float alpha = opacity;

    if ( alpha < alphaTest ) {
        discard;
    }

    #include <logdepthbuf_fragment>

    gl_FragColor = vec4( diffuse, alpha );

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
    #include <premultiplied_alpha_fragment>
}
