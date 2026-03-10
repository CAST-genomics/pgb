uniform float halfWidth;  // world-space half-width, updated per frame

attribute vec2 normal2d;  // precomputed perpendicular direction (unit length)
attribute float uParam;   // 0->1 along arc length
attribute float side;     // +1 or -1

varying vec2 vUv;         // UV for texture sampling

void main() {
    vec3 pos = position;
    pos.x += normal2d.x * side * halfWidth;
    pos.y += normal2d.y * side * halfWidth;

    // u runs along node (0->1), v runs across width (0->1)
    vUv = vec2(uParam, side * 0.5 + 0.5);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
