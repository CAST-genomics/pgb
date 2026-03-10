uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D alphaMap;
uniform float useAlphaMap;

varying vec2 vUv;

void main() {
    float alpha = opacity;

    if (useAlphaMap > 0.5) {
        alpha *= texture2D(alphaMap, vUv).a;
    }

    if (alpha < 0.01) discard;

    gl_FragColor = vec4(diffuse, alpha);
}
