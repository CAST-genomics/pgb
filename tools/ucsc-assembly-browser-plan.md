# UCSC Assembly Hub Browser — Design Plan

A plan for a simple, approachable web page to present the UCSC Genome Browser assembly hub list (49,925 assemblies) using Edward Tufte's information display principles and Dieter Rams' design philosophy.

---

## Design Philosophy

### Edward Tufte — Information Display

| Principle | Application |
|-----------|-------------|
| **Data-ink ratio** | Maximize information density; remove decorative elements. Every pixel should earn its place. |
| **Small multiples** | Group assemblies by clade in repeated, consistent frames for easy comparison across categories. |
| **Hierarchical labeling** | Clear typographic hierarchy: clade → common name → scientific name → accession. |
| **Avoid chartjunk** | No gradients, 3D effects, or ornamental borders. |
| **Dense but legible** | Use compact tables with generous whitespace between logical groups. |
| **Show the data** | Let the data speak; minimize explanatory text. Use inline sparklines or counts where they add meaning. |

### Dieter Rams — Design

| Principle | Application |
|-----------|-------------|
| **Good design is as little design as possible** | Minimal chrome. No unnecessary UI elements. |
| **Honest and unobtrusive** | The interface does not compete with the content. |
| **Understandable** | Clear affordances: search box looks like a search box; filters are obvious. |
| **Long-lasting** | Timeless typography (serif for body, clean sans for UI). Neutral palette. |
| **Every detail considered** | Consistent spacing, alignment, and interaction feedback. |

---

## Information Architecture

### Current Problem

The source file is a flat, tab-separated list with seven columns. It is:
- Hard to scan
- Not grouped by biological relevance
- Difficult to find specific organisms
- Overwhelming at 49,925 rows

### Proposed Organization

1. **Primary grouping: Clade**
   - birds, fish, fungi, invertebrate, mammals, plants, primates, vertebrate, viral, archaea, bacteria
   - Legacy assemblies (suffix `(L)`) grouped separately or clearly distinguished

2. **Secondary grouping within clade: Common name / scientific name**
   - Alphabetical or by relevance (e.g., human first in mammals)

3. **Per-row information (priority order)**
   - Common name (primary identifier for most users)
   - Scientific name
   - Assembly name
   - Accession (link to UCSC Genome Browser)
   - Taxon ID (secondary, collapsible or on hover)

---

## Search & Filter

### Search

- **Single search box** at top, full-width
- **Live filtering** as user types (no submit button)
- **Search scope**: common name, scientific name, assembly name, accession
- **Fuzzy or substring match** for flexibility (e.g., "mouse" → house mouse, etc.)
- **Result count** displayed inline: "Showing 127 of 49,925"

### Filters

- **Clade filter**: Checkboxes or compact pills for each clade
- **Legacy toggle**: Include/exclude legacy assemblies
- **Optional**: Taxon ID range or exact match for power users

### Interaction

- Filters and search work together (AND logic)
- Clear/reset control to return to full list
- URL hash or query params for shareable filtered views (stretch goal)

---

## Layout & Typography

### Layout

- **Single-column** layout; no sidebar
- **Sticky header**: search + filters remain visible on scroll
- **Clade sections** as collapsible blocks (expand/collapse all)
- **Table within each section**: compact, alternating row background for scanability

### Typography (Tufte-inspired)

- **Body**: Serif (e.g., ETBembo, Charter, or Georgia) — readable at small sizes
- **UI elements**: Sans-serif (e.g., system-ui or a clean grotesque)
- **Hierarchy**: Size and weight, not color, for emphasis
- **Monospace** for accessions and assembly names (technical identifiers)

### Color

- **Neutral base**: Off-white background (#fafafa), dark gray text (#1a1a1a)
- **Accent**: Single accent color for links and active states (muted blue or black)
- **Legacy indicator**: Subtle gray or italic for legacy assemblies
- **No colored backgrounds** except light gray for alternating rows

---

## Technical Approach

### Data Source

- **Fetch on load**: `fetch('https://hgdownload.soe.ucsc.edu/hubs/UCSC_GI.assemblyHubList.txt')`
- **Parse**: Split by newlines; skip `#` lines; split rows by tab
- **Client-side only**: No backend required; single HTML file or HTML + JS

### File Structure

```
tools/
  ucsc-assembly-browser.html    # Single-file app: HTML, CSS, JS
```

Optional: separate `ucsc-assembly-browser.js` and `ucsc-assembly-browser.css` if the file grows large.

### Implementation Phases

1. **Phase 1 — Core**
   - Fetch and parse data
   - Render grouped by clade
   - Basic search (substring match)
   - Minimal styling

2. **Phase 2 — Polish**
   - Clade filters
   - Legacy toggle
   - Collapsible sections
   - Refined typography and spacing

3. **Phase 3 — Enhancements**
   - Loading state and error handling
   - Keyboard navigation
   - Shareable URLs for filters
   - Export filtered results (CSV)

### Performance

- **Virtualization**: For 50k rows, consider virtual scrolling (e.g., only render visible rows) if initial render is slow
- **Debounce search**: 150–300 ms delay on input to avoid excessive re-renders
- **Lazy expand**: Render clade sections only when expanded, or limit initial render to first N per clade with "show more"

---

## Wireframe (ASCII)

```
┌─────────────────────────────────────────────────────────────────┐
│  UCSC Assembly Hub Browser                    [last updated]    │
├─────────────────────────────────────────────────────────────────┤
│  [ Search common name, scientific name, accession...        ]    │
│  Clade: [mammals] [primates] [plants] ...  [ ] Include legacy   │
│  Showing 2,341 of 49,925                                       │
├─────────────────────────────────────────────────────────────────┤
│  ▼ mammals (1,247)                                              │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Common name      Scientific name    Assembly    Accession  │ │
│  │ house mouse      Mus musculus       GRCm39      GCA_000... │ │
│  │ cattle           Bos taurus         ARS-UCD1.2  GCA_000... │ │
│  │ ...                                                         │ │
│  └───────────────────────────────────────────────────────────┘ │
│  ▶ primates (89)                                                │
│  ▶ plants (412)                                                 │
│  ...                                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Success Criteria

- [ ] User can find a specific organism in &lt; 10 seconds
- [ ] Page loads and displays data in &lt; 5 seconds
- [ ] No visual clutter; every element has a purpose
- [ ] Works without JavaScript for basic display (progressive enhancement)
- [ ] Accessible: keyboard navigable, screen-reader friendly

---

## References

- Tufte, E. *The Visual Display of Quantitative Information*
- Rams, D. *Ten principles for good design*
- Source: https://hgdownload.soe.ucsc.edu/hubs/UCSC_GI.assemblyHubList.txt
