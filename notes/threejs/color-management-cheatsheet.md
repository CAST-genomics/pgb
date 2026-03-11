# Three.js Color Management Cheat Sheet

**Context:** PGB uses `ColorManagement.enabled = true` and `renderer.outputColorSpace = SRGBColorSpace`. This means Three.js works internally in **linear** color space and converts to sRGB on output. All color creation must account for this.

## The Rule

Tell Three.js what color space your input is in. If you don't, numeric RGB is assumed **linear** — which is almost never what you have.

## Safe Patterns

### Hex strings — always sRGB, handled automatically
```js
new THREE.Color('#6e6e6e')        // ✓ interpreted as sRGB, stored as linear
new THREE.Color(0xff2101)         // ✓ same — integer hex treated as sRGB
```

### Numeric RGB from data, ramps, or conversion libraries — tag as sRGB
```js
// RGB values from JSON, color ramps, HSLuv, OKLab→sRGB, etc.
new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace)
```

### HSL — handled automatically
```js
const c = new THREE.Color()
c.setHSL(h, s, l)                // ✓ Three.js handles the conversion
```

### Cloning — preserves color space
```js
existingColor.clone()             // ✓ linear stays linear
```

### Interpolation — works in linear (physically correct)
```js
colorA.lerp(colorB, t)           // ✓ lerp in linear space avoids banding
```

## Trap: `new THREE.Color(r, g, b)` with sRGB values

This is the most common mistake. The constructor's three-number form assumes **linear** RGB:

```js
// WRONG — sRGB values treated as linear, renders too dark/bright
new THREE.Color(r / 255, g / 255, b / 255)

// RIGHT — explicitly tag as sRGB
new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace)
```

### Where this comes up in PGB
- Data file RGB (pclaiCoordinateService)
- Color ramp LUTs (viridis, inferno, cividis)
- Perceptual color space conversions (OKLab→sRGB, HSLuv→sRGB)

## Custom ShaderMaterial Requirements

Built-in materials (MeshBasicMaterial, LineMaterial, etc.) handle color management automatically. `ShaderMaterial` does **not** — you must do two things:

### 1. Output encoding in fragment shader
Add this as the last line before the closing brace:
```glsl
gl_FragColor = vec4(diffuse, alpha);

#include <colorspace_fragment>    // converts linear → sRGB for display
```
Without this, colors render too dark.

### 2. Uniform colors are already linear
When you set `material.uniforms.diffuse.value` to a `THREE.Color`, it's already in linear space (Three.js converted it on creation). The fragment shader outputs linear, and `<colorspace_fragment>` encodes to sRGB. The pipeline is:

```
sRGB input → THREE.Color (stores linear) → uniform → fragment shader → <colorspace_fragment> → sRGB framebuffer
```

## Quick Reference: What Space Am I In?

| Where | Space | Notes |
|-------|-------|-------|
| Hex string / CSS color | sRGB | `new THREE.Color('#abc')` converts automatically |
| `THREE.Color` internal `.r .g .b` | Linear | Don't read these and treat as sRGB |
| `color.getHexString()` | sRGB | Converts back for you |
| `color.getStyle()` | sRGB | Returns CSS `rgb(...)` string |
| Shader uniforms | Linear | Same as THREE.Color internals |
| `gl_FragColor` before encoding | Linear | Must add `<colorspace_fragment>` |
| Canvas 2D / CSS | sRGB | Use `getHexString()` or `getStyle()` |

## Renderer Setup (rendererFactory.js)

```js
THREE.ColorManagement.enabled = true
renderer.outputColorSpace = THREE.SRGBColorSpace
```

These two lines activate the pipeline. Without them, Three.js treats everything as linear-in/linear-out and none of the above matters (but colors won't be correct either).
