// Step 0: import hsluv (either via ES modules or CommonJS)
import {Hsluv} from "hsluv";
import * as THREE from 'three'

const colorConverter = new Hsluv()

/**
 * Generate N perceptually distinct, vibrant colors using HSLuv.
 * @param {number} count - the number of colors to generate.
 * @param {number} [S=90] - saturation percentage (0–100). Using ~90 for vividness.
 * @param {number} [L=65] - lightness percentage (0–100). ~65 for strong contrast on white.
 * @returns {Array<{r: number, g: number, b: number}>} - each r,g,b ∈ [0,1].
 */
function getPerceptuallyDistinctColors(count, S = 90, L = 65) {
  const colors = [];
  for (let i = 0; i < count; i++) {
    // Evenly space H around 360°
    const H = (360 * i) / count;


    // Convert [H, S, L] to [r, g, b] in 0–255
    colorConverter.hsluv_h = H;
    colorConverter.hsluv_s = S;
    colorConverter.hsluv_l = L;
    colorConverter.hsluvToRgb();

    // HSLuv outputs sRGB values — tag them so Three.js converts to linear working space
    colors.push(new THREE.Color().setRGB(colorConverter.rgb_r, colorConverter.rgb_g, colorConverter.rgb_b, THREE.SRGBColorSpace))
  }

  return colors;
}

export { getPerceptuallyDistinctColors }
