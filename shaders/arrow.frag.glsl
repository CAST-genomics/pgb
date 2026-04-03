uniform vec3 color;
uniform sampler2D map;
uniform float opacity;
varying vec2 vUv;

void main() {
    vec4 arrow = texture2D(map, vUv);
    gl_FragColor = vec4(color, arrow.a * opacity);

    #include <colorspace_fragment>
}
