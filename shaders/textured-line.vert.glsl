/*
 * Textured Line Vertex Shader
 * Forked from Three.js LineMaterial (WORLD_UNITS mode only).
 * Changes from stock LineMaterial:
 *   - Always emits vUv (not gated behind USE_DASH)
 *   - Adds vAlongLine varying: 0→1 across the entire node (not per segment)
 *     using per-instance instanceParamStart/instanceParamEnd attributes
 */

#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

uniform float linewidth;
uniform vec2 resolution;

attribute vec3 instanceStart;
attribute vec3 instanceEnd;

attribute vec3 instanceColorStart;
attribute vec3 instanceColorEnd;

// Per-instance along-line parameterization (0→1 across entire node)
attribute float instanceParamStart;
attribute float instanceParamEnd;

// Per-instance total arc length of the node (world units)
attribute float instanceNodeArcLength;

// Always available (not gated behind USE_DASH)
varying vec2 vUv;

// Along-line parameter: 0 at node start, 1 at node end
varying float vAlongLine;

// Total arc length of the node (passed to fragment for world-space border computation)
varying float vNodeArcLength;

// World-space varyings for fragment distance computation
varying vec4 worldPos;
varying vec3 worldStart;
varying vec3 worldEnd;

void trimSegment( const in vec4 start, inout vec4 end ) {
    float a = projectionMatrix[ 2 ][ 2 ];
    float b = projectionMatrix[ 3 ][ 2 ];
    float nearEstimate = - 0.5 * b / a;
    float alpha = ( nearEstimate - start.z ) / ( end.z - start.z );
    end.xyz = mix( start.xyz, end.xyz, alpha );
}

void main() {

    #ifdef USE_COLOR
        vColor.xyz = ( position.y < 0.5 ) ? instanceColorStart : instanceColorEnd;
    #endif

    // Always pass UV through
    vUv = uv;

    // Interpolate along-line parameter for this vertex
    // position.y: 0 = segment start, 1 = segment end (endcap vertices clamp naturally)
    float segT = clamp( position.y, 0.0, 1.0 );
    vAlongLine = mix( instanceParamStart, instanceParamEnd, segT );

    // Pass through arc length for procedural border calculations
    vNodeArcLength = instanceNodeArcLength;

    float aspect = resolution.x / resolution.y;

    // camera space
    vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );
    vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );

    worldStart = start.xyz;
    worldEnd = end.xyz;

    // perspective clipping
    bool perspective = ( projectionMatrix[ 2 ][ 3 ] == - 1.0 );

    if ( perspective ) {
        if ( start.z < 0.0 && end.z >= 0.0 ) {
            trimSegment( start, end );
        } else if ( end.z < 0.0 && start.z >= 0.0 ) {
            trimSegment( end, start );
        }
    }

    // clip space
    vec4 clipStart = projectionMatrix * start;
    vec4 clipEnd = projectionMatrix * end;

    // ndc space
    vec3 ndcStart = clipStart.xyz / clipStart.w;
    vec3 ndcEnd = clipEnd.xyz / clipEnd.w;

    // direction
    vec2 dir = ndcEnd.xy - ndcStart.xy;
    dir.x *= aspect;
    dir = normalize( dir );

    // WORLD_UNITS quad expansion
    vec3 worldDir = normalize( end.xyz - start.xyz );
    vec3 tmpFwd = normalize( mix( start.xyz, end.xyz, 0.5 ) );
    vec3 worldUp = normalize( cross( worldDir, tmpFwd ) );
    vec3 worldFwd = cross( worldDir, worldUp );
    worldPos = position.y < 0.5 ? start : end;

    // height offset
    float hw = linewidth * 0.5;
    worldPos.xyz += position.x < 0.0 ? hw * worldUp : - hw * worldUp;

    // cap extension
    worldPos.xyz += position.y < 0.5 ? - hw * worldDir : hw * worldDir;

    // add width to the box
    worldPos.xyz += worldFwd * hw;

    // endcaps
    if ( position.y > 1.0 || position.y < 0.0 ) {
        worldPos.xyz -= worldFwd * 2.0 * hw;
    }

    // project the worldpos
    vec4 clip = projectionMatrix * worldPos;

    // shift the depth of the projected points so the line
    // segments overlap neatly
    vec3 clipPose = ( position.y < 0.5 ) ? ndcStart : ndcEnd;
    clip.z = clipPose.z * clip.w;

    gl_Position = clip;

    vec4 mvPosition = ( position.y < 0.5 ) ? start : end;

    #include <logdepthbuf_vertex>
    #include <clipping_planes_vertex>
    #include <fog_vertex>
}
