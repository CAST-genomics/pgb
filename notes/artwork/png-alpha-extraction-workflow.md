# PNG Alpha Extraction Workflow

How to split a translucent RGBA PNG (e.g. `public/images/pca-chart-background.png`) into a separate opaque RGB image and a grayscale alpha image, and how to recombine them in Photoshop.

Worked example: `public/images/pca-chart-background.png` — 576×576, 8-bit RGBA, mean alpha ≈ 0.38, straight (unassociated) alpha.

## 1. Inspect the file

```sh
magick identify -format "channels: %[channels], mean alpha: %[fx:mean.a]\n" pca-chart-background.png
# channels: srgba 4.0, mean alpha: 0.376471
```

Confirms RGBA and gives an at-a-glance sense of how transparent the image is.

## 2. Extract the alpha channel as a grayscale image

```sh
magick pca-chart-background.png -alpha extract pca-chart-background.alpha.png
```

White = fully opaque, black = fully transparent, gray = partial.

## 3. Extract the RGB with no alpha (straight-alpha assumption)

```sh
magick pca-chart-background.png -alpha off pca-chart-background.rgb.png
```

`-alpha off` discards the alpha channel without touching RGB. For a PNG with **straight** alpha (the spec-conformant case, and what every mainstream tool writes), the stored RGB *is* the original artwork — no math needed. This is the faithful recovery for our file.

## 4. Alternative: extract assuming premultiplied alpha

If a file actually used premultiplied alpha, the recovery requires dividing RGB by alpha:

```sh
magick pca-chart-background.png -channel RGB -fx "a==0 ? 0 : u/a" +channel -alpha off pca-chart-background.unpremultiplied-rgb.png
```

Tell which assumption is right by eye: if the un-premultiplied version looks washed out / blown out, the file was straight alpha and `.rgb.png` is correct. If `.rgb.png` looks too dark and haloed at low-alpha edges, the file was premultiplied and the un-premultiplied version is correct. For `pca-chart-background.png`, straight alpha (`.rgb.png`) was the faithful recovery.

## 5. Why Photoshop doesn't show an "Alpha 1" channel for an RGBA PNG

Photoshop imports a PNG's alpha as **layer transparency**, not as a named alpha channel. The Channels panel only lists R/G/B (plus composite). To see the alpha as a channel:

1. ⌘-click Layer 1's thumbnail in the Layers panel → loads transparency as selection.
2. A warning may appear: *"No pixels are more than 50% selected. The selection edges will not be visible."* Click OK — the selection is still active, just with no marching ants (expected when alpha is mostly partial, as here).
3. Switch to the **Channels** tab → click **Save selection as channel** (square-with-circle icon at the panel bottom).
4. An **Alpha 1** channel appears showing the alpha as grayscale.

Easier alternative: open `pca-chart-background.alpha.png` directly — it *is* the alpha as grayscale.

## 6. Reconstruct the translucent RGBA from RGB + alpha in Photoshop

1. Open `pca-chart-background.rgb.png`. If it opens as a locked Background, double-click it in the Layers panel to convert to a normal layer.
2. Open `pca-chart-background.alpha.png` in a separate document → **Select → All** (⌘A) → **Edit → Copy** (⌘C).
3. Back in the RGB document, with the layer selected, click **Add Layer Mask** at the bottom of the Layers panel (rectangle with a circle inside). A white mask thumbnail appears.
4. **Option/Alt-click the mask thumbnail** to view the mask on canvas.
5. **Edit → Paste** (⌘V) — the grayscale alpha fills the mask.
6. **Option/Alt-click the layer thumbnail** to return to normal view. The image is now translucent.
7. ⌘D to deselect. **File → Save As → PNG** to write RGBA.

A Photoshop layer mask *is* the alpha channel for that layer; mask grayscale values map 1:1 to per-pixel opacity, which matches PNG's storage.

## 7. Verify the round-trip

```sh
magick identify -format "%[channels] %[fx:mean.a]\n" pca-chart-background.roundtrip.png
```

Mean alpha should match the original (~0.38). If it doesn't, the mask got applied to the wrong target or the layer was flattened against a matte before saving.

## File map (all in `public/images/`)

| File | What it is |
| --- | --- |
| `pca-chart-background.png` | Original RGBA, translucent |
| `pca-chart-background.alpha.png` | Alpha channel as grayscale |
| `pca-chart-background.rgb.png` | RGB only, straight-alpha recovery (faithful) |
| `pca-chart-background.unpremultiplied-rgb.png` | RGB only, premultiplied-alpha recovery (kept for comparison) |

## Tooling

- `magick` (ImageMagick 7) via Homebrew: `brew install imagemagick`
