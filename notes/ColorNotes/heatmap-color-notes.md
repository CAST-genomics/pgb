# Color Palette Decision for Pangenome Graph Visualization

## Overview

This document explains the rationale behind the chosen color palette for frequency encoding in the pangenome graph visualization. The goal is to maximize clarity, accessibility, and data fidelity in line with Edward Tufte’s principles: *above all else, show the data*.

---

## 1. Sequential vs. Diverging Palettes

### Sequential Palettes

* Designed for data that vary monotonically in one direction (e.g., counts, intensities).
* Colors progress smoothly from light → dark or cool → warm.
* Excellent for showing *“more vs. less”* without emphasizing any midpoint.

### Diverging Palettes

* Designed for data with a **meaningful midpoint** (e.g., 0%, 50%, 100% or −1, 0, +1).
* Colors diverge symmetrically from the midpoint, highlighting differences both above and below.
* Useful for bimodal or polarized distributions where both ends of the scale are important.

---

## 2. Well-Known Sequential Palettes: Viridis, Inferno, Cividis

These colormaps were developed by Nathaniel Smith and Stefan van der Walt for matplotlib and are now widely adopted across scientific visualization. They have several advantages:

* **Perceptually uniform**: Equal steps in data correspond to equal steps in perceived color.
* **Colorblind-friendly**: Work across common forms of color vision deficiency.
* **Printer-friendly**: Convert reasonably well to grayscale.

### Viridis

* Dark purple/blue → green → yellow.
* Smooth, balanced, and one of the most widely used scientific colormaps.

### Inferno

* Dark purple → orange → yellow-white.
* Very high contrast, excellent for small features and faint signals.

### Cividis

* Dark blue → yellow, optimized specifically for accessibility (colorblind safety).
* Slightly less vivid than Viridis, but more universally interpretable.

**Limitation for this project**: These are **sequential palettes**. They are best when values progress in one direction. They are not ideal for bimodal distributions, as mid-range values become visually ambiguous.

---

## 3. Data Characteristics in This Project

* The pangenome graph visualization encodes **frequency of an attribute**.
* Frequency values tend to **clump at the extremes** (near 0 and 1).
* The midpoint (≈ 0.5) is not noise — it is meaningful as a “balanced” frequency.
* Using a sequential palette like Viridis makes the visualization appear **binary** (all low vs. all high) and downplays the middle range.

---

## 4. Chosen Palette: Custom 5-Step Diverging (Blue → White → Red)

### Design

* **0% (low)**: Strong blue (`#2F76B7`)
* **25%**: Light blue (`#ADD0E6`)
* **50% (midpoint)**: Neutral light gray (`#F6F6F6`)
* **75%**: Light red/orange (`#F5B39B`)
* **100% (high)**: Strong red (`#C23B34`)

### Rationale

* **Diverging scheme** clearly distinguishes *low vs. high* values.
* **Neutral midpoint** (white/gray) provides balance and ensures that values near 50% are visually distinct.
* **Symmetry** around the midpoint emphasizes the bimodal structure of the data.
* **Accessibility**: Chosen colors retain contrast under common forms of color vision deficiency.

---

## 5. Alternatives Considered

* **Viridis / Inferno / Cividis**: Excellent for sequential data, but unsuitable here due to the bimodal distribution. These would have caused the graph to look artificially binary.
* **Classic red–blue diverging maps**: Widely used but often rely on oversaturated colors, which can mislead perception. Our adaptation uses more restrained hues and a neutral midpoint for readability.

---

## 6. Implementation

Two versions were implemented for flexibility:

1. **Discrete 5-step palette** (categorical bins at 0%, 25%, 50%, 75%, 100%)

   * Simple, intuitive, and stable across zoom levels.
   * Useful when exact frequency precision is less important than broad grouping.

2. **Continuous palette with perceptual interpolation (OKLab space)**

   * Provides smooth gradations between bins.
   * Ensures equal perceptual steps across the scale.
   * Best when subtle frequency differences need to be visible.

---

## 7. Conclusion

* **Chosen solution**: Diverging Blue → White → Red palette, implemented in both discrete and continuous forms.
* **Why**: It emphasizes both extremes and preserves the significance of the midpoint, matching the bimodal distribution of frequency data.
* **Why not Viridis/Inferno/Cividis**: They are sequential palettes optimized for monotonic data, and would have exaggerated the binary look of the graph while suppressing the important midpoint.

In short:

> The palette decision balances aesthetics, perceptual accuracy, and faithfulness to the underlying data distribution. It ensures that the visualization communicates structure rather than distorting it.

---

Would you like me to also add **side-by-side swatches** (Viridis vs. Diverging) in this Markdown so the contrast in suitability is visually obvious to your readers?
