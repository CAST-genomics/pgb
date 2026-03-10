/*
 * Textured Line Fragment Shader
 * Forked from Three.js LineMaterial (WORLD_UNITS mode only).
 *
 * Alpha-matte approach:
 *   - The texture's alpha channel is the holdout matte (shape mask)
 *   - The diffuse uniform provides all color
 *   - final pixel = vec4(diffuse, texture.a * opacity)
 *   - Fragments with alpha below alphaTest are discarded
 */

uniform vec3 diffuse;
uniform float opacity;
uniform float linewidth;
uniform sampler2D lineTexture;
uniform float alphaTest;

varying vec4 worldPos;
varying vec3 worldStart;
varying vec3 worldEnd;
varying vec2 vUv;
varying float vAlongLine;

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

    // --- Texture UV computation ---
    // Cross-line: vUv.x is -1 (left) to 1 (right) from the base quad
    float texAcross = vUv.x * 0.5 + 0.5;

    // Along-line: 0→1 across the entire node (from instanceParamStart/End)
    float texAlong = vAlongLine;

    // Sample the alpha matte
    // texAlong = along the line (maps to canvas X)
    // texAcross = across the width (maps to canvas Y)
    float matteAlpha = texture2D( lineTexture, vec2( texAlong, texAcross ) ).a;

    // Final alpha: matte × material opacity
    float finalAlpha = matteAlpha * opacity;

    // Alpha test — discard transparent fragments
    if ( finalAlpha < alphaTest ) {
        discard;
    }

    #include <logdepthbuf_fragment>

    // Color comes entirely from diffuse; shape comes entirely from texture alpha
    gl_FragColor = vec4( diffuse, finalAlpha );

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
    #include <premultiplied_alpha_fragment>
}
