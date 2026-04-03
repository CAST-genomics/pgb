uniform vec3 startColor;
uniform vec3 endColor;
uniform sampler2D map;
uniform sampler2D gradientMap;
uniform float opacity;
varying vec2 vUv;

void main() {
    // Sample the gradient texture
    vec4 gradient = texture2D(gradientMap, vUv);

    // Sample the arrow texture
    vec4 arrow = texture2D(map, vUv);

    // Mix the colors based on the gradient
    vec3 mixedColor = mix(startColor, endColor, gradient.r);

    // Combine with the arrow texture
    gl_FragColor = vec4(mixedColor, arrow.a * opacity);
}