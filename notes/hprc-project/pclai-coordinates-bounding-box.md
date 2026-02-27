# PCA Coordinates Bounding Box Analysis

## Reference PCA TSV Bounding Box

From `reference_pca.tsv`:
- **x1 (x) range:** [-1.8129293612932906, 0.7856702103116423]
- **x2 (y) range:** [-1.4238203965523002, 1.509197752913014]

## JSON pclai_coordinates Analysis

**Total coordinate pairs checked:** 5,800 (from 30 nodes with `pclai_coordinates`)

**Out of bounds summary:**
- **x values out of bounds:** 0 (all x values fall within TSV range)
- **y values out of bounds:** 78 coordinates (1.34% of total)
- **Both out of bounds:** 0

## Key Finding

**78 coordinates have y values below the TSV minimum:**
- **TSV y minimum:** -1.4238203965523002
- **JSON y minimum (outside):** -1.452
- **Difference:** -0.02818 (approximately 0.028 units below TSV minimum)

The out-of-bounds y values range from -1.452 to -1.424, all falling below the TSV bounding box minimum y value.

## Implications

When using the TSV bounding box for visualization or coordinate transformation, approximately 1.34% of the JSON coordinates will fall outside the expected range. These are all y-coordinate values that are slightly below the minimum y value from the reference PCA data.

