# Locus Input: Gene Names, URLs, and Local Files

## Overview

The PGB application supports multiple input types in a single input field, providing a flexible and intuitive way to load pangenome data. Users can enter genomic loci, gene names, URLs, or local file paths - the application automatically detects and processes the appropriate input type.

## Supported Input Types

### 1. Genomic Locus
**Format**: `chrX:start-end` (e.g., `chr1:25240000-25460000`)

- Parses chromosome, start, and end positions
- Automatically converts to pangenome API URL
- Supports comma-separated numbers (e.g., `chr1:25,240,000-25,460,000`)

**Example**: `chr8:30,000-50,000`

### 2. Gene Names
**Format**: Any gene symbol (e.g., `BRCA2`, `EGFR`)

- Searches via IGV web service (`igv.org/genomes/locus.php`)
- Converts gene name to genomic coordinates
- Uses the default genome (hg38) for search
- Case-insensitive matching

**Example**: `BRCA2` → automatically resolves to chromosome coordinates

### 3. URLs
**Format**: Full HTTP/HTTPS URLs (e.g., `https://example.com/data.json`)

- Supports any JSON endpoint
- Uses `fetch()` API for loading
- Handles network errors gracefully

**Example**: `https://pangenome-api.ucsd.edu:8000/json?chrom=chr1&start=25240000&end=25460000&graphtype=minigraph&version=v1`

### 4. Local Files
**Format**: File paths relative to the `public/` directory

Files must be placed in the `public/` directory at the project root. Vite serves these files at the root URL, so the `/public/` prefix is automatically stripped.

**Supported formats**:
- **Bare filename**: `daz1.json` → normalized to `/daz1.json`
- **Root path**: `/daz1.json` or `/hprc-project/hello-hprc.json`
- **With public prefix**: `/public/daz1.json` → normalized to `/daz1.json`
- **Relative path**: `./public/daz1.json` → normalized to `/daz1.json`
- **Subdirectory**: `hprc-project/hello-hprc.json` → normalized to `/hprc-project/hello-hprc.json`

**Examples**:
- `daz1.json` (simplest - just the filename)
- `/public/hprc-project/hello-hprc.json` (with public prefix)
- `/hprc-project/hello-hprc.json` (root path)
- `il7-chr8-78675042-78805463-minigraph-cactus-v1.json` (bare filename)

## Input Processing Order

The application processes input in this priority order:

1. **URL Detection**: If input starts with `http://` or `https://`, treat as URL
2. **Local File Detection**: If input contains `.json` and matches file path patterns, treat as local file
3. **Locus Parsing**: If input matches `chrX:start-end` pattern, parse as locus
4. **Gene Search**: Otherwise, treat as gene name and search via IGV service

## Implementation Details

### File Location: `src/locusInput.js`

#### Key Methods:

**`isUrl(value)`**
- Detects HTTP/HTTPS URLs using regex pattern: `/^https?:\/\/.+/i`

**`isLocalFile(value)`**
- Detects local file paths by checking for:
  - Paths starting with `/` or `./` ending in `.json`
  - Any string containing `.json` without `://` (to distinguish from URLs)
  - Bare filenames ending in `.json`

**`normalizeLocalFilePath(value)`**
- Strips `/public/` prefix if present (Vite serves files from `public/` at root)
- Normalizes bare filenames by prepending `/`
- Handles various path formats consistently

**`processLocusInput(value)`**
- Parses locus strings using regex: `/^(chr[0-9XY]+):([0-9,]+)-([0-9,]+)$/i`
- Validates start < end
- Returns `{chr, startBP, endBP}` object

**`searchFeatures()`** (from `src/igvCore/search.js`)
- Searches gene names via IGV web service
- Returns `{chr, start, end, name}` object

### File Location: `src/utils/utils.js`

**`loadPath(url)`**
- Uses `fetch()` API to load JSON data
- Handles both absolute URLs and relative paths
- Works seamlessly with Vite's file serving

## File Placement

### Local Files Location
Place JSON files in the `public/` directory at the project root:

```
public/
  ├── daz1.json
  ├── myc-v1.json
  ├── hprc-project/
  │   └── hello-hprc.json
  └── il7-chr8-78675042-78805463-minigraph-cactus-v1.json
```

### Vite File Serving
- Files in `public/` are served at the root URL
- `public/daz1.json` → accessible at `/daz1.json`
- `public/hprc-project/hello-hprc.json` → accessible at `/hprc-project/hello-hprc.json`
- The `/public/` prefix is automatically stripped by Vite

## Usage Examples

### Example 1: Genomic Locus
```
Input: chr1:25240000-25460000
Result: Converts to pangenome API URL with specified coordinates
```

### Example 2: Gene Name
```
Input: BRCA2
Result: Searches IGV service → finds coordinates → converts to pangenome API URL
```

### Example 3: Remote URL
```
Input: https://example.com/pangenome-data.json
Result: Fetches JSON directly from URL
```

### Example 4: Local File (Bare Filename)
```
Input: daz1.json
Result: Normalized to /daz1.json → loads from public/daz1.json
```

### Example 5: Local File (With Path)
```
Input: /public/hprc-project/hello-hprc.json
Result: Normalized to /hprc-project/hello-hprc.json → loads from public/hprc-project/hello-hprc.json
```

## Error Handling

- **Invalid URLs**: Handled by `loadPath()` function, shows error in console
- **Invalid loci**: Shows error message: "Invalid base pair position format" or "Start position must be less than end position"
- **Invalid gene names**: Shows error: "Invalid input format. Please enter a locus (e.g., chr1:25240000-25460000), gene name, URL, or local file..."
- **File not found**: Network error from `fetch()`, handled gracefully

## Benefits

1. **Flexibility**: Multiple ways to load data (locus, gene, URL, local file)
2. **Simplicity**: Single input field handles all input types
3. **Intuitive**: Automatic detection - users don't need to specify input type
4. **Developer-friendly**: Easy to test with local files during development
5. **Production-ready**: Supports remote URLs for production deployments

## Technical Notes

- Gene name search uses the IGV web service at `igv.org/genomes/locus.php`
- Local file detection is flexible and handles various path formats
- Path normalization ensures compatibility with Vite's file serving
- All input types ultimately call `sceneManager.handleSearch()` with a URL or path
- The `loadPath()` function in `utils.js` handles the actual file/URL loading

## Future Enhancements

Potential improvements:
1. File upload dialog for selecting local files
2. Input history/autocomplete for recently used inputs
3. Validation feedback before attempting to load
4. Support for additional file formats beyond JSON
5. Drag-and-drop file support

