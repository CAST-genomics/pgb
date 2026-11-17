# Single-hue sequential ramps for the population heatmap

What single-hue (or nearly single-hue) sequential ramps could replace or sit alongside ColorBrewer `blues` in `HeatmapLook`, and what each one costs. This extends [`frequency-color-ramps.html`](frequency-color-ramps.html). That page already covers the five ramps PGB ships, their OKLab lightness curves, how faint `blues` is near 0%, and the `0.25 + 0.75 * f` offset. This note does not repeat any of that.

Written 17 November 2026, against the `population-heatmap-color-palette` branch after `a26e195`.

---

## 1. Summary

Every candidate below keeps lightness monotonic, including under simulated deuteranopia, protanopia and tritanopia (§4, Machado 2009 model). So "is it colorblind-safe?" does not separate them. Four things do separate them in PGB:

1. **How much the light end disappears into the ivory background.**
2. **How evenly lightness falls across the range.**
3. **Whether the ramp passes through the gray that PGB already uses for edges and unselected nodes.**
4. **How dark the high end gets.** Dark shades on a light background are hard to tell apart (Liu & Heer 2018).

### Shortlist

| # | Ramp | One-line reason |
|---|---|---|
| 1 | **Crameri `devon`** | The closest like-for-like upgrade to `blues`. It is still blue-to-indigo, but its lightness is about twice as even (max 4.6 L\* off linear, against 9.6 for `blues`), low frequencies become visible sooner (17% instead of 24%), the dark end stops at L\* 14 rather than near-black, and the publisher ships its own 10 stops. |
| 2 | **cmocean `algae`** | A true single hue (20° of hue drift), perceptually uniform, and the only uniform single-hue map whose light end is already tinted (ΔE_OK 7.2 from the background). Nodes near 0% stay faintly visible without the 25% offset. |
| 3 | **cmocean `amp`** | A single-hue red (28°) that is perceptually uniform, with a slightly warm light end that is visible from 8%. Use it if a warm hue is wanted. Red's "alarm" reading is the cost. |
| 4 | **CET-L12** (`linear_blue_95_50_c20`) | The purest single hue (1°) and exactly linear in L\*. It stops at L\* 50, so no node ever goes dark. That avoids the dark-on-light discrimination problem, at the cost of about half the lightness range. It is the "quiet" option. |
| 5 | **ColorBrewer `Blues`** (status quo) | Familiar, and rated colorblind-friendly by ColorBrewer. Its measured weakness is a lightness bulge: the 0–35% range stays pale, which is the fading the HTML note describes. |

**Do not use** any of these:

* **Gray ramps** (ColorBrewer Greys, cmocean `gray`, Crameri `grayC`, CET-L01/L02). Around 42–56% they pass within about 3.5–3.8 ΔE2000 of `rubinGray`, the edge and default-node color (§2.3).
* **CET-L13/L14/L15**, which run to black and are meant for ternary images.
* **The multi-hue maps in the table** (`lapaz`, `davos`, `tokyo`, `nuuk`, `rain`, `tempo`, `dense`, `matter`, `lajolla`, `bilbao`, `turku`, `ice`). They are not single-hue.

**Which end is 0%:** map frequency 0 to the light end and 1 to the dark end (§2.4).

---

## 2. What PGB's renderer constrains

Each of these comes from the code, not the literature.

### 2.1 Background is light

The `heatmapScene` is created with `rubinColors.rubinIvory` (`src/main.js:82`), which is `#FAF9F6` (`src/utils/color/color.js:10`). That is CIELAB L\* 97.9 and OKLab L 0.98. Every ramp whose low end is near-white will fade into it.

### 2.2 Ribbons are unlit, and the color comes out exactly as specified

The ribbon fragment shader writes `gl_FragColor = vec4(diffuse, alpha)` followed by `#include <colorspace_fragment>`, with no lighting term (`shaders/ribbon.frag.glsl`). `ramp.color(t)` tags its stops as sRGB, and the renderer outputs sRGB (`src/rendererFactory.js:20`). So a node shows exactly the hex the ramp returns.

Opacity defaults to 1 (`src/ribbonMaterialFactory.js`), and `HeatmapLook` never changes it. There are therefore no shading or opacity interactions to account for today.

If lighting is ever added to ribbons, Moreland's advice for 3D surfaces applies: lighting cues are themselves changes in brightness, so the ramp should be restricted to "reasonably bright colors" ([Moreland, Color Map Advice](https://www.kennethmoreland.com/color-advice/)). That would favor a ramp like CET-L12, which never goes below L\* 50.

### 2.3 PGB's own gray is already in the scene

`Look.DEFAULT_NODE_COLOR` and `Look.DEFAULT_EDGE_COLOR` are both `rubinGray` (`#87867F`, L\* 55.8; `src/looks/look.ts:18-19`). `HeatmapLook.handleSelectionEvent` recolors only nodes, so edges stay that gray, and so does every node until a population is selected.

A gray ramp passes within ΔE2000 3.5–3.8 of that gray at mid frequencies. For scale, Liu & Heer saw accuracy collapse at CIELAB differences of about 5, which they describe as "close to the just-noticeable difference (JND) found in practical situations". The two metrics differ, but the order of magnitude is the point. So a node at about 50% would read as "uncolored". Chromatic ramps stay at least 8 ΔE2000 away from it, and the shortlist stays at least 21 away.

### 2.4 Which end maps to frequency 0

ColorBrewer defines sequential schemes as "light colors for low data values to dark colors for high data values" ([colorbrewer2.org, scheme types](https://colorbrewer2.org/learnmore/schemes_full.html)). On a light background, darker also means more contrast, and so more salience. Light-to-dark therefore puts the visual weight on the nodes a population most often carries.

The inverse, dark = 0, would make the *rarest* nodes the most prominent. That is only appropriate if the question is "what is absent from this population?" (this is a judgment, not a cited rule).

Several sources store their maps dark-to-light: Crameri v8 `devon`, `oslo` and `grayC`, cmocean `ice` and `gray`, and most of CET. The "flip" notes in §5 say which. All hex stops in this note are already ordered light-to-dark, ready for `_makeRamp`.

### 2.5 How PGB interpolates

`_makeRamp` interpolates linearly in sRGB between evenly spaced stops (`src/utils/color/color-ramps.js`). d3 instead runs a uniform B-spline through the same ColorBrewer anchors: `ramp.js` uses `interpolateRgbBasis` on the largest scheme ([d3-scale-chromatic `src/ramp.js`](https://github.com/d3/d3-scale-chromatic/blob/main/src/ramp.js); README: "interpolated using uniform B-splines").

For `Blues`, PGB's linear version and d3's `interpolateBlues` differ by at most **ΔE2000 1.06** (computed). That is negligible.

For the 256-entry maps (cmocean, Crameri, CET), resampling to 9 stops and interpolating PGB's way reproduces the full map to within ΔE2000 0.3–1.2 for every shortlisted ramp, and within 2.0 for most others. The outliers are cmocean `rain` (4.1) and CET-L13 (2.7). With 11 stops the shortlist falls to 0.2–0.8. So 9–11 stops are enough to drop into `color-ramps.js`.

---

## 3. Background from the literature

* **Lightness carries the order.** ColorBrewer: "Lightness steps dominate the look of these schemes" ([colorbrewer2.org](https://colorbrewer2.org/learnmore/schemes_full.html)). Thyng et al. (2016): sequential data "should be represented with a monotonically increasing range of lightness values … but can also have variations in hue". Kovesi (2015, abstract): "The most important factor in designing a colour map is to ensure that the magnitude of the incremental change in perceptual lightness of the colours is uniform". Kovesi also notes that "for the ability to resolve fine structures … the perceptual contrast between colours is dominated by the difference in the lightness".
* **Three families define "uniform" differently, and each scores best on its own definition** (see the table):
  * **CET:** lightness linear in CIELAB L\* (Kovesi 2015 §4.3, "Linear colour maps").
  * **cmocean:** equal steps in CAM02-UCS, built with `viscm` (Thyng et al. 2016).
  * **Crameri:** equal CIEDE2000 steps (Crameri et al. 2020, figure caption on perceptual uniformity: "For a perceptually uniform colour map, ΔE CIEDE2000 should be equal all along the colour map").
* **ColorBrewer was designed as discrete classes.** Kovesi (2015 §1) points readers to Brewer for categorical and cartographic maps rather than continuous data. Crameri et al. (2020, Box 2) note the ColorBrewer tool "does not currently offer them in a continuous type". PGB uses `Blues` continuously, which is why its lightness bulge shows (§4).
* **Single-hue costs resolution.** Liu & Heer (2018) tested `blues`, `greens`, `oranges` and `greys` against viridis and others. "Single-hue colormaps perform well for larger data spans … but exhibit issues of insufficient resolution at smaller spans". For continuous heatmaps, "multi-hue colormaps may be preferable to single-hue given their improved resolution". This is the honest trade-off of going single-hue. Viridis and cividis (Nuñez et al. 2018) are the multi-hue comparison point. `heatmap-color-notes.md` §2 already discusses them, so they are not repeated here.
* **Dark shades on a white background are hard to tell apart.** Liu & Heer (2018) found that "low luminance regions set against a white background" (greys, magma, plasma) produced "much higher error rates despite similar distance estimates from perceptual color space models". They "advise designers to avoid using these colormaps in situations with a high-luminance background". Their stimuli were 50 × 50 px patches. Whether this carries over to thin ribbons is not verified.
* **Colour-vision deficiency.** Thyng et al. (2016) give the rates: about 7% of men of Northern European descent, 4% of Asian descent and 3% of African descent have some red–green colorblindness. "reds and greens of similar lightness values can be difficult to discern." A ramp that is monotonic in lightness keeps its order regardless of hue, which is what §4's simulation checks.
* **The background is part of the encoding.** "attention has to be paid to the lightness … of the background on which the colours are displayed. Background creates contrast, in lightness and colour, to the displayed data" (Crameri et al. 2020).

---

## 4. Comparison table

Computed for this note (method below). Every map is oriented light-to-dark, so t = 0 is the light end. ColorBrewer rows are sampled exactly as PGB samples them (9-class stops with linear sRGB interpolation). The other rows use the publishers' 256-entry tables.

| Ramp | Hue range (°) | L\* light → dark | Max dev. from linear L\* | CV of ΔE2000 steps | CV of CAM02-UCS steps | Light end vs bg (ΔE_OK×100) | ≥10 from t = | Closest to edge gray (ΔE2000 @ t) | Lightness monotone under D / P / T |
|---|---|---|---|---|---|---|---|---|---|
| ColorBrewer Blues | 47 | 98 → 21 | 9.6 | 0.28 | 0.24 | 1.1 | 0.24 | 24.1 @ 0.56 | yes/yes/yes |
| ColorBrewer Greens | 10 | 98 → 24 | 11.2 | 0.21 | 0.27 | 0.9 | 0.24 | 23.6 @ 0.71 | yes/yes/yes |
| ColorBrewer Greys | 0 | 100 → 0 | 14.1 | 0.42 | 0.47 | 1.8 | 0.25 | **3.8 @ 0.56** | yes/yes/yes |
| ColorBrewer Oranges | 27 | 97 → 29 | 6.4 | 0.15 | 0.20 | 1.5 | 0.21 | 28.7 @ 0.36 | yes/yes/yes |
| ColorBrewer Purples | 22 | 99 → 18 | 9.0 | 0.37 | 0.31 | 1.0 | 0.26 | 23.9 @ 0.47 | yes/yes/yes |
| ColorBrewer Reds | 22 | 97 → 20 | 5.4 | 0.17 | 0.23 | 1.1 | 0.17 | 28.0 @ 0.38 | yes/yes/yes |
| cmocean ice | 93 | 98 → 2 | 0.9 | 0.14 | 0.00 | 2.1 | 0.10 | 22.4 @ 0.36 | yes/yes/yes |
| cmocean amp | 28 | 94 → 11 | 2.1 | 0.09 | 0.00 | 3.3 | 0.08 | 22.7 @ 0.25 | yes/yes/yes |
| cmocean tempo | 168 | 97 → 12 | 1.2 | 0.11 | 0.00 | 0.9 | 0.12 | 21.6 @ 0.31 | yes/yes/yes |
| cmocean dense | 131 | 94 → 11 | 0.3 | 0.08 | 0.00 | 3.5 | 0.08 | 25.4 @ 0.20 | yes/yes/yes |
| cmocean matter | 138 | 94 → 11 | 3.2 | 0.17 | 0.00 | 8.4 | 0.04 | 26.6 @ 0.31 | yes/yes/yes |
| cmocean rain | 230 | 94 → 12 | 1.6 | 0.11 | 0.00 | 3.4 | 0.09 | 17.2 @ 0.31 | yes/yes/yes |
| cmocean algae | 20 | 95 → 12 | 1.2 | 0.08 | 0.00 | 7.2 | 0.05 | 23.9 @ 0.52 | yes/yes/yes |
| cmocean gray | 0 | 100 → 0 | 4.2 | 0.22 | 0.00 | 1.7 | 0.12 | **3.5 @ 0.42** | yes/yes/yes |
| cmocean speed | 55 | 98 → 12 | 1.9 | 0.08 | 0.00 | 5.7 | 0.07 | 24.5 @ 0.51 | yes/yes/yes |
| cmocean turbid | 58 | 94 → 12 | 2.0 | 0.06 | 0.00 | 9.9 | 0.00 | 20.1 @ 0.47 | yes/yes/yes |
| Crameri oslo | 9 | 100 → 0 | 4.3 | 0.14 | 0.44 | 1.8 | 0.11 | 20.0 @ 0.22 | yes/yes/yes |
| Crameri devon | 33 | 100 → 14 | 4.6 | 0.16 | 0.14 | 1.8 | 0.17 | 28.0 @ 0.55 | yes/yes/yes |
| Crameri lapaz | 253 | 96 → 12 | 4.9 | 0.16 | 0.13 | 1.7 | 0.11 | 11.0 @ 0.32 | yes/yes/yes |
| Crameri davos | 194 | 100 → 6 | 9.2 | 0.13 | 0.13 | 1.7 | 0.18 | 12.5 @ 0.45 | yes/yes/yes |
| Crameri grayC | 0 | 100 → 0 | 3.5 | 0.01 | 0.41 | 1.8 | 0.11 | **3.8 @ 0.42** | yes/yes/yes |
| Crameri nuuk | 160 | 98 → 36 | 5.8 | 0.25 | 0.25 | 9.1 | 0.04 | 8.2 @ 0.58 | yes/yes/yes |
| Crameri tokyo | 186 | 97 → 7 | 8.0 | 0.01 | 0.25 | 4.1 | 0.09 | 12.6 @ 0.49 | yes/yes/yes |
| Crameri acton | 54 | 94 → 9 | 7.7 | 0.01 | 0.07 | 4.3 | 0.10 | 26.1 @ 0.65 | yes/yes/yes |
| Crameri bilbao | 81 | 100 → 13 | 7.6 | 0.01 | 0.25 | 1.8 | 0.09 | 15.9 @ 0.45 | yes/yes/yes |
| Crameri lajolla | 83 | 99 → 8 | 3.9 | 0.01 | 0.14 | 6.3 | 0.06 | 25.7 @ 0.39 | yes/yes/yes |
| Crameri turku | 86 | 93 → 0 | 11.5 | 0.11 | 0.40 | 4.6 | 0.08 | 13.3 @ 0.54 | yes/yes/yes |
| CET-L01 | 0 | 100 → 0 | 0.1 | 0.19 | 0.37 | 1.8 | 0.14 | **3.8 @ 0.44** | yes/yes/yes |
| CET-L02 | 0 | 95 → 10 | 0.1 | 0.19 | 0.13 | 2.5 | 0.11 | **3.8 @ 0.46** | yes/yes/yes |
| CET-L05 | 38 | 94 → 5 | 0.6 | 0.26 | 0.20 | 22.2 | 0.00 | 26.4 @ 0.49 | yes/yes/yes |
| CET-L06 | 120 | 95 → 5 | 0.1 | 0.21 | 0.15 | 8.3 | 0.02 | 30.2 @ 0.25 | yes/yes/yes |
| CET-L12 | 1 | 95 → 50 | 0.1 | 0.20 | 0.18 | 2.5 | 0.18 | 21.7 @ 0.74 | yes/yes/yes |
| CET-L13 | 14 | 50 → 0 | 0.0 | 0.54 | 1.12 | 44.5 | 0.00 | 31.6 @ 0.00 | yes/yes/yes |
| CET-L14 | 8 | 46 → 0 | 0.1 | 0.53 | 1.55 | 49.5 | 0.00 | 27.6 @ 0.00 | yes/yes/yes |
| CET-L15 | 17 | 44 → 0 | 0.1 | 0.65 | 1.23 | 51.8 | 0.00 | 38.7 @ 0.00 | yes/yes/yes |

**How to read the columns**

* **Hue range:** the spread of CIELCh hue angle over samples with chroma C\* > 10. Near-white and near-black samples have no meaningful hue, so they are excluded. Below about 40° reads as "one hue"; that cut-off is a judgment.
* **Max dev. from linear L\*:** how far, in L\* units, lightness bows away from a straight line between the two ends. A positive bow (ColorBrewer) means the lower-middle stays lighter than it should, so low frequencies look fainter.
* **CV of steps:** standard deviation divided by mean of the 255 successive color differences. Lower is more uniform. The three families each come out near 0 on their own metric: Crameri v8 maps on ΔE2000, cmocean on CAM02-UCS, CET on L\*. The per-step coefficients of variation for CET and the older Crameri maps are inflated by 8-bit and 3-decimal quantization of the tables, so the L\* deviation column is the cleaner comparison.
* **ΔE_OK×100 and "≥10 from t":** the same convention as `frequency-color-ramps.html` (OKLab ΔE ×100 against `#FAF9F6`, with 10 as that page's "clearly visible" threshold).
* **D / P / T:** CAM02-UCS lightness J′ stays monotonic after simulating full-severity deuteranomaly, protanomaly and tritanomaly with the Machado et al. (2009) matrices, at severity 1.0, which is equivalent to dichromacy.

**Method.** Numbers were computed with `colour-science` 0.4.7 (CIELAB D65, OKLab, CAM02-UCS, CIEDE2000, `matrix_cvd_Machado2009`). The data came from the sources in §7, downloaded 17 November 2026.

As a sanity check, the script reproduces the HTML note's figures for `blues`: ΔE_OK 1.1 at 0%, OKLab L running from 0.99 to 0.32, and "clearly visible" from 24%.

The script is not in the repo, because this task was notes-only. It lived in the session scratchpad and can be regenerated from the method above.

---

## 5. Per-ramp notes

### 5.1 Crameri `devon` — shortlist #1

* **Source:** Crameri, *Scientific colour maps* v8.0.1, Zenodo [10.5281/zenodo.8409685](https://doi.org/10.5281/zenodo.8409685); concept DOI [10.5281/zenodo.1243862](https://doi.org/10.5281/zenodo.1243862). It is in `devon/devon.txt` (256 rows, floats from 0 to 1). The publisher also ships a 10-stop discrete version, `devon/DiscretePalettes/devon10.txt`. MIT licence (v8 README §6).
* **Flip:** the v8 file runs dark to light (`#2C1A4C` to `#FFFFFF`). Reverse it.
* **What it looks like:** white, then lavender, then mid blue (`#4272bc` at about 62%), then dark indigo (`#2C1A4C`, L\* 14). It is not a single pure hue. Its hue sits between 275° and 308° wherever there is chroma, which puts it in the same family as `blues` (about 249°–287°), only shifted toward violet.
* **Uniformity:** max 4.6 L\* off linear, against 9.6 for `blues`. Visible on ivory from 17% (against 24% for `blues`). The publisher claims "Perceptually uniform … Colour-vision-deficiency (CVD) friendly … Readable in black&white prints" (v8 README cover). This computation agrees that lightness is monotonic under all three CVD simulations.
* **Background:** the light end is pure white, so it is invisible on ivory (ΔE_OK 1.8), just like `blues`. The same 0%-fade decision applies.
* **Dark end:** L\* 14, which is darker than `blues` (21). Liu & Heer's dark-on-white caveat applies mildly.
* **Stops**, publisher's `devon10`, reversed to run light to dark. Linear interpolation over them reproduces the full map to within ΔE2000 0.82:

  ```js
  ['#FFFFFF', '#E8E5FA', '#D0CCF5', '#BAB3F1', '#989BE7',
   '#6181D0', '#3669AD', '#275186', '#293467', '#2C1A4C']
  ```

### 5.2 cmocean `algae` — shortlist #2

* **Source:** cmocean, `cmocean/rgb/algae-rgb.txt` (256 rows, floats) in [matplotlib/cmocean](https://github.com/matplotlib/cmocean). MIT licence. Paper: Thyng et al. 2016.
* **Flip:** none; the file already runs light to dark.
* **Docs:** "sequential with whitish-green for low values and increasing in green with increasing value … based on matplotlib's Greens, but was recreated from scratch using the viscm tool" ([cmocean docs, `docs/source/index.rst`](https://github.com/matplotlib/cmocean/blob/main/docs/source/index.rst)).
* **Hue:** 138°–157°, a 20° range, so a true single hue. Uniform: CAM02-UCS CV 0.00, and 1.2 L\* off linear.
* **Background:** the light end `#d7f9d0` is already a pale green, ΔE_OK 7.2 from ivory, and it clears 10 by 5%. Rare nodes stay faintly visible without any offset. This is its main advantage over `blues` and `devon`.
* **Dark end:** L\* 12 (`#122414`), a very dark green that reads close to black at ribbon widths. That is unverified for thin marks.
* **Caveat:** under red–green CVD a green ramp loses its hue identity but keeps its order. J′ stays monotonic, and 94–96% of the CAM02-UCS path length is retained.
* **Stops**, resampled for this note from the source table at indices 0, 32, 64, 96, 128, 159, 191, 223 and 255. These are not published as stops. Interpolation error is ΔE2000 0.73 or less:

  ```js
  ['#d7f9d0', '#afdda2', '#84c47a', '#50ad59', '#129450',
   '#0c7849', '#185b3b', '#194029', '#122414']
  ```

### 5.3 cmocean `amp` — shortlist #3

* **Source:** cmocean, `cmocean/rgb/amp-rgb.txt`. MIT licence.
* **Flip:** none; the file runs light to dark.
* **Docs:** "sequential from whitish to dark red … the positive half of the *balance* colormap" (cmocean docs).
* **Hue:** 19°–45°, a 28° range. Uniform: CAM02-UCS CV 0.00, and 2.1 L\* off linear.
* **Background:** the light end `#f1edec` is a slightly warm off-white, ΔE_OK 3.3 from ivory, and clears 10 from 8%.
* **Dark end:** maroon `#3c0912`, L\* 11.
* **Caveats:** the red hue reads as "hot" or "alarm". `color-ramps.js` already says this about YlOrRd; it is a cultural association, not something this note sourced. PGB's palette includes a warm `rubinClay` (`#D97757`); whether a red ramp would be confused with other Looks' emphasis colors is not checked. Under simulated CVD, order is kept (J′ monotonic).
* **Stops**, resampled for this note, with interpolation error ΔE2000 1.22 or less. With 11 stops the error drops to 0.77.

  ```js
  ['#f1edec', '#e2c7bf', '#d7a291', '#cc7e64', '#c0583b',
   '#af3024', '#901029', '#650f24', '#3c0912']
  ```

### 5.4 CET-L12 (`linear_blue_95_50_c20`) — shortlist #4

* **Source:** Kovesi, CET Perceptually Uniform Colour Maps, `CETperceptual_csv_0_1.zip`, file `CET-L12.csv` ([colorcet.com/download](https://colorcet.com/download/index.html)). CC BY 4.0, with a request to cite Kovesi 2015. The gallery describes it as 'A "water depth" colour map' ([colorcet.com/gallery](https://colorcet.com/gallery.html)).
* **Name:** the alias is from holoviz `colorcet` (`'linear_blue_95_50_c20': 'CET_L12'`). The name encodes the design: lightness 95 to 50, chroma 20.
* **Flip:** none; the file runs light to dark.
* **Hue and lightness:** a single hue (265°) once chroma appears, and exactly linear in L\* (0.1 off).
* **What it gives up:** half the lightness range (L\* 95 to 50; J′ 96 to 51). The 100% end is a mid blue (`#3b7bb2`) only ΔE_OK 43 from the background, against 67 for `blues`. By Liu & Heer's finding, a shorter lightness range means fewer distinguishable steps.
* **What it gains:** no node ever goes darker than L\* 50, so the dark-on-light problem is avoided. If ribbons are ever lit, there is room left for shading (§2.2). The heatmap also stays visually quiet under any overlay. At mid-to-high frequency it is within L\* range of `rubinGray`, but its blue hue keeps it at least 21.7 ΔE2000 away.
* **Stops**, resampled for this note, with interpolation error ΔE2000 0.27 or less:

  ```js
  ['#f0f1f0', '#d8e1ee', '#c0d2eb', '#a8c4e6', '#93b5dc',
   '#82a6cf', '#7197c1', '#5a89b8', '#3b7bb2']
  ```

### 5.5 ColorBrewer `Blues` — shortlist #5 (status quo)

* **Source:** ColorBrewer 2.0, the 9-class scheme in [`colorbrewer_schemes.js`](https://colorbrewer2.org/colorbrewer_schemes.js), which is identical to d3's `schemeBlues[9]` ([d3-scale-chromatic `src/sequential-single/Blues.js`](https://github.com/d3/d3-scale-chromatic/blob/main/src/sequential-single/Blues.js)). Apache 2.0 licence ([axismaps/colorbrewer LICENCE](https://github.com/axismaps/colorbrewer/blob/master/LICENCE.txt)). PGB's `blues` matches these stops exactly.
* **Ratings:** ColorBrewer's own ratings (the `properties` field; decoded in `colorbrewer.js`, where 1 means friendly, 2 "possibly not" and 0 "not"):
  * `blind: [1]`, meaning colorblind-friendly at every class count.
  * At **9** classes, `print` and `screen` are both 0: "not print friendly" and "not LCD friendly".

  This contradicts the "print-safe" comment above `blues` in `color-ramps.js`. The rating is about telling 9 discrete classes apart, not about a continuous ramp, but the comment overstates it.
* **Lightness bulge:** lightness bows up to 9.6 L\* above linear at about 38%, so the lower-middle of the range is compressed. That is what causes the 24% "faint until" figure in the HTML note.
* **Hue:** drifts 47° (about 249° to 287°). Liu & Heer note that ColorBrewer's single-hue ramps "have subtle variations in hue, with the exception of greys" because of hand-tuning.

### 5.6 Other ColorBrewer single-hue schemes

`Greens`, `Oranges`, `Purples` and `Reds` are drop-in siblings: the same source, licence and rating (`blind: [1]`), and the same near-white light end (ΔE_OK 0.9–1.5).

* `Reds` and `Oranges` have the most linear lightness of the set (5.4 and 6.4 L\* off).
* `Oranges` stops at L\* 29, the shortest range of the set.
* `Greens` has the largest bulge of the chromatic schemes (11.2).

None improves on `devon` or the cmocean maps for continuous use. Their 9-class stops are in `colorbrewer_schemes.js` and in d3's `src/sequential-single/*.js`.

### 5.7 Other cmocean maps

* `ice` is dark to light in the file. Its hue spans 93° (cyan, then blue, then violet-navy), and it ends nearly black (L\* 2).
* `dense` (131°, blue to purple) and `tempo` (168°, pinkish-white to teal to navy) are uniform but not single-hue. The docs say `dense` is "based on matplotlib's Purples, but was recreated from scratch using the viscm tool".
* `matter`, `rain`, `speed` and `turbid` are multi-hue.
* `gray` collides with the edge gray (§2.3).

### 5.8 Other Crameri maps

* `oslo` (white to blue to black; 9° of hue, but low chroma) ends at pure black (L\* 0), which has the dark-on-light caveat. It is otherwise a reasonable blue alternative.
* `acton` (54°, lavender to pink to dark purple) is close to single-hue.
* `lapaz`, `davos`, `tokyo`, `nuuk`, `bilbao`, `lajolla` and `turku` are multi-hue (81°–253°).
* `grayC` collides with the edge gray.
* **Version warning.** Crameri v8 reversed the direction of `grayC`, `bilbao` and `lajolla`, and re-tuned `acton`, `tokyo`, `bamako` and `batlowK` ("Improved local colour contrast & vibrancy"; v8 README §5).

  The `.txt` files in the `cmcrameri` GitHub repo (`callumrollo/cmcrameri`, `cmcrameri/cmaps/`) still have the pre-v8 direction and values for those five maps. They are byte-identical to v8 for `oslo`, `devon`, `lapaz`, `davos`, `nuuk` and `turku`.

  Take stops from the Zenodo archive, and record the version.

### 5.9 Other CET linear maps

* `L01`/`L02` are grays (edge collision).
* `L05` (`linear_kgy_5_95_c69`, "along the green edge of CIELAB space") and `L06` (`linear_kbc_5_95_c73`, "Blue shades running vertically up the edge of CIELAB space") are vivid and exactly linear, and their light ends are tinted: ΔE_OK 22 for L05 (lime) and 8.3 for L06 (cyan). But both end near black (L\* 5), and L06's hue runs 120° from cyan to blue, so it is "blue family" rather than single-hue. L06 is the best choice if a saturated, high-contrast blue is wanted.
* `L13`/`L14`/`L15` (`linear_ternary_*`) run from black to a saturated red, green or blue at only L\* 44–50. Kovesi built them as "basis colours for the construction of ternary images" (2015, abstract). Unsuitable here.
* CET also publishes `CBL1`/`CBL2`, "Linear map[s] for Protanopic/Deuteranopic viewers" ([gallery](https://colorcet.com/gallery.html)). They are multi-hue and not analyzed here.

### 5.10 Not single-hue, comparison only

* matplotlib's "Perceptually Uniform Sequential" set: `viridis`, `plasma`, `inferno`, `magma`, `cividis`.
* Moreland's recommended 2D maps: Viridis, Plasma, Black Body, Inferno, Kindlmann. His page has no single-hue map.

Matplotlib's own sequential single-hue set is exactly the six ColorBrewer schemes (`Greys`, `Purples`, `Blues`, `Greens`, `Oranges`, `Reds`; [matplotlib, *Choosing Colormaps*](https://matplotlib.org/stable/users/explain/colors/colormaps.html)). It adds nothing beyond §5.5–5.6.

---

## 6. Could not verify from a primary source

* **How ColorBrewer rated its schemes.** Harrower & Brewer (2003) is paywalled and was not read; only the ratings themselves (from the site's data file) and the site's scheme-type text were checked.
* **Crameri's per-map CVD and B&W claims** are the publisher's own. This note re-checked only lightness monotonicity under the Machado simulation, not Crameri's diagnostics.
* **"Frequencies clump near 0 and 1"** comes from `heatmap-color-notes.md` §3. It was not checked against dataset values here, and it matters for how much each end's legibility counts.
* **Liu & Heer at ribbon width.** Their dark-on-white and low-span findings used 50 × 50 px patches on white, not pixel-wide ribbons on ivory. The authors themselves flag this as a limitation. Kovesi (2015, abstract) notes CIELAB is "only designed to be perceptually uniform at very low spatial frequencies", which suggests thin ribbons will show *less* difference than the ΔE numbers predict. That is an inference, not tested.
* **The Machado simulation** is a model, not an observer study.
* **Hue connotations** (red = alarm, green = "good") are cultural and not sourced. So is any clash between a red ramp and PGB's other emphasis colors.
* **The "Below about 40° reads as one hue" cut-off** in §4 is a judgment.

---

## 7. References

Primary sources consulted for this note:

1. Harrower, M. & Brewer, C. A. (2003). ColorBrewer.org: An Online Tool for Selecting Colour Schemes for Maps. *The Cartographic Journal* 40(1), 27–37. [doi:10.1179/000870403235002042](https://doi.org/10.1179/000870403235002042). Citation verified via Crossref; text not read.
2. ColorBrewer 2.0 — [colorbrewer2.org](https://colorbrewer2.org): scheme data `colorbrewer_schemes.js`, rating decoding in `colorbrewer.js`, [scheme types](https://colorbrewer2.org/learnmore/schemes_full.html). Licence: Apache 2.0 ([axismaps/colorbrewer](https://github.com/axismaps/colorbrewer)).
3. d3-scale-chromatic — [github.com/d3/d3-scale-chromatic](https://github.com/d3/d3-scale-chromatic): `src/sequential-single/*.js`, `src/ramp.js`, README. d3-interpolate `src/basis.js`.
4. Thyng, K. M., Greene, C. A., Hetland, R. D., Zimmerle, H. M. & DiMarco, S. F. (2016). True colors of oceanography: Guidelines for effective and accurate colormap selection. *Oceanography* 29(3), 9–13. [doi:10.5670/oceanog.2016.66](https://doi.org/10.5670/oceanog.2016.66).
5. cmocean — [github.com/matplotlib/cmocean](https://github.com/matplotlib/cmocean): `cmocean/rgb/*-rgb.txt`, `docs/source/index.rst`. MIT licence.
6. Crameri, F., Shephard, G. E. & Heron, P. J. (2020). The misuse of colour in science communication. *Nature Communications* 11, 5444. [doi:10.1038/s41467-020-19160-7](https://doi.org/10.1038/s41467-020-19160-7).
7. Crameri, F. (2018/2023). Scientific colour maps, v8.0.1. Zenodo. [doi:10.5281/zenodo.8409685](https://doi.org/10.5281/zenodo.8409685) (concept DOI [10.5281/zenodo.1243862](https://doi.org/10.5281/zenodo.1243862)). Per-map `.txt` and `DiscretePalettes/`, `+README_ScientificColourMaps.pdf` (version history, licence). MIT licence.
8. Crameri, F. (2018). Geodynamic diagnostics, scientific visualisation and StagLab 3.0. *Geosci. Model Dev.* 11, 2541–2562. [doi:10.5194/gmd-11-2541-2018](https://doi.org/10.5194/gmd-11-2541-2018). Cited by the Crameri README; not read.
9. Kovesi, P. (2015). Good Colour Maps: How to Design Them. [arXiv:1509.03700](https://arxiv.org/abs/1509.03700).
10. Kovesi, P. CET Perceptually Uniform Colour Maps — [colorcet.com](https://colorcet.com): gallery, `CETperceptual_csv_0_1.zip`. CC BY 4.0. Name aliases from [holoviz/colorcet `colorcet/__init__.py`](https://github.com/holoviz/colorcet).
11. Liu, Y. & Heer, J. (2018). Somewhere Over the Rainbow: An Empirical Assessment of Quantitative Colormaps. *Proc. CHI 2018*, 1–12. [doi:10.1145/3173574.3174172](https://doi.org/10.1145/3173574.3174172). PDF: [idl.cs.washington.edu](https://idl.cs.washington.edu/files/2018-QuantitativeColor-CHI.pdf).
12. matplotlib, *Choosing Colormaps in Matplotlib* — source `galleries/users_explain/colors/colormaps.py` in [matplotlib/matplotlib](https://github.com/matplotlib/matplotlib).
13. Moreland, K. *Color Map Advice for Scientific Visualization* — [kennethmoreland.com/color-advice](https://www.kennethmoreland.com/color-advice/).
14. Machado, G. M., Oliveira, M. M. & Fernandes, L. A. F. (2009). A Physiologically-based Model for Simulation of Color Vision Deficiency. *IEEE TVCG* 15(6), 1291–1298. [doi:10.1109/TVCG.2009.113](https://doi.org/10.1109/TVCG.2009.113). Used via `colour-science`.
15. Nuñez, J. R., Anderton, C. R. & Renslow, R. S. (2018). Optimizing colormaps with consideration for color vision deficiency to enable accurate interpretation of scientific data. *PLOS ONE* 13(7), e0199239. [doi:10.1371/journal.pone.0199239](https://doi.org/10.1371/journal.pone.0199239). Cividis; comparison only.

PGB code read: `src/utils/color/color-ramps.js`, `src/looks/heatmapLook.ts`, `src/looks/look.ts`, `src/main.js`, `src/utils/color/color.js`, `src/ribbonMaterialFactory.js`, `shaders/ribbon.frag.glsl`, `src/rendererFactory.js`. Existing notes: `notes/ui/color/frequency-color-ramps.html`, `notes/ui/color/heatmap-color-notes.md`.
