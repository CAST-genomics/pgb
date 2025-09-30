import * as THREE from 'three'

// 5 fixed colors (blue → white → red)
export const DIVERGING_5 = [
    new THREE.Color('#2F76B7'), // 0%
    new THREE.Color('#ADD0E6'), // 25%

    // new THREE.Color('#F6F6F6'), // 50% (neutral midpoint)
    // Note: dat - darken midpoint for legibility
    new THREE.Color('#cccccc'), // 50% (neutral midpoint)

    new THREE.Color('#F5B39B'), // 75%
    new THREE.Color('#C23B34')  // 100%
];

function frequencyToColorDiscrete(frequency) {
    const v = Math.min(1, Math.max(0, frequency)); // clamp to [0,1]
    if (v <= 0.125) return DIVERGING_5[0];
    if (v <= 0.375) return DIVERGING_5[1];
    if (v <= 0.625) return DIVERGING_5[2];
    if (v <= 0.875) return DIVERGING_5[3];
    return DIVERGING_5[4];
}

// ---------- small OKLab helpers ----------
function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c) {
    return c <= 0.0031308
        ? (c * 12.92) * 255
        : (1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255;
}

function rgbToOklab(r, g, b) {
    const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
    const l = 0.4122214708*R + 0.5363325363*G + 0.0514459929*B;
    const m = 0.2119034982*R + 0.6806995451*G + 0.1073969566*B;
    const s = 0.0883024619*R + 0.2817188376*G + 0.6299787005*B;
    const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
    return {
        L: 0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_,
        a: 1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_,
        b: 0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_
    };
}

function oklabToRgb(L, a, b) {
    const l_ = Math.pow(L + 0.3963377774*a + 0.2158037573*b, 3);
    const m_ = Math.pow(L - 0.1055613458*a - 0.0638541728*b, 3);
    const s_ = Math.pow(L - 0.0894841775*a - 1.2914855480*b, 3);
    const R = + 4.0767416621*l_ - 3.3077115913*m_ + 0.2309699292*s_;
    const G = - 1.2684380046*l_ + 2.6097574011*m_ - 0.3413193965*s_;
    const B = - 0.0041960863*l_ - 0.7034186147*m_ + 1.7076147010*s_;
    const r = Math.min(255, Math.max(0, linearToSrgb(R)));
    const g = Math.min(255, Math.max(0, linearToSrgb(G)));
    const b2 = Math.min(255, Math.max(0, linearToSrgb(B)));
    return [r / 255, g / 255, b2 / 255]; // normalize to [0,1] for THREE.Color
}

function lerp(a, b, t) { return a + (b - a) * t; }

// ---------- endpoints ----------
const BLUE = [47, 118, 183];   // #2F76B7 (low)

// const MID  = [246, 246, 246];  // #F6F6F6 (midpoint)
// Note: dat - darken midpoint for legibility
const MID  = [204, 204, 204];  // #cccccc (midpoint)

const RED  = [194, 59, 52];    // #C23B34 (high)

const BLUE_LAB = rgbToOklab(...BLUE);
const MID_LAB  = rgbToOklab(...MID);
const RED_LAB  = rgbToOklab(...RED);

function frequencyToColorContinuous(frequency) {

    if (0 === frequency) {
        console.log(`frequencyToColorContinuous(${ frequency })`)
    }
    const v = Math.min(1, Math.max(0, frequency));
    let L, a, b;
    if (v <= 0.5) {
        const t = v / 0.5;
        L = lerp(BLUE_LAB.L, MID_LAB.L, t);
        a = lerp(BLUE_LAB.a, MID_LAB.a, t);
        b = lerp(BLUE_LAB.b, MID_LAB.b, t);
    } else {
        const t = (v - 0.5) / 0.5;
        L = lerp(MID_LAB.L, RED_LAB.L, t);
        a = lerp(MID_LAB.a, RED_LAB.a, t);
        b = lerp(MID_LAB.b, RED_LAB.b, t);
    }
    const [r, g, b2] = oklabToRgb(L, a, b);
    return new THREE.Color(r, g, b2);
}

// Example:
// const color = freqToColorContinuous(edge.frequency); // THREE.Color

export { frequencyToColorDiscrete, frequencyToColorContinuous }
