# Add PCA Widget Button

## Overview
Add a third "PCA" button to the left widget panel that behaves identically to the Assembly button. The PCA widget will be a copy of the Assembly widget with renamed class and file, but internal methods can keep their current naming for now.

## Files to Modify

### 1. Create New File: `src/widgets/pcaWidget.js`
- Copy entire contents from `src/widgets/assemblyWidget.js`
- Rename class from `AssemblyWidget` to `PCAWidget`
- Keep all internal method names and references as-is (e.g., `onAssemblySelectorClick`, `assemblyWidgetContainer`, etc.)
- Update class name references in static properties (e.g., `AssemblyWidget.ASSEMBLY_SPINE_FEATURES_EMPHASIS` → `PCAWidget.ASSEMBLY_SPINE_FEATURES_EMPHASIS`)

### 2. Update `index.html`
- Add new HTML container for PCA widget card after the population widget card (around line 86)
- Use ID `pgb-pca-card` and class `pca-widget__card card position-absolute`
- Copy structure from `pgb-gear-card` (lines 48-74) but:
  - Change card title to "PCA"
  - Change search input ID to `pca-search` 
  - Change search placeholder to "Search assemblies..." (or appropriate text)
  - Keep same structure with card-header, card-body, list-group, and card-footer with switch

### 3. Update `src/widgets/widgetService.js`
- Add `pcaWidget` parameter to constructor (line 4)
- Store `this.pcaWidget = pcaWidget` (line 8)
- Add `this.pcaButton = null` property (line 12)
- In `createButtons()` method (line 18):
  - Create PCA button after population button (around line 37)
  - Set className to `widget-service__button`
  - Set textContent to `'PCA'`
  - Add click event listener: `this.onPCAButtonClick.bind(this)`
- Add new method `onPCAButtonClick(event)`:
  - Hide and reset both `assemblyWidget` and `populationWidget`
  - Toggle PCA widget visibility (same pattern as `onAssemblyButtonClick`)
  - Set active scene: `app.setActiveScene('nodeEmphasisScene', true)`
  - Call `setActiveButton(this.pcaButton)` or `setActiveButton(null)` for toggle
- Update `onAssemblyButtonClick()` (line 41):
  - Add `this.pcaWidget.hideCard()` and `this.pcaWidget.reset()` when switching to assembly
- Update `onPopulationButtonClick()` (line 62):
  - Add `this.pcaWidget.hideCard()` and `this.pcaWidget.reset()` when switching to population
- Update `reset()` method (line 109):
  - Add `this.pcaWidget.hideCard()` and `this.pcaWidget.reset()` calls
- Update `destroy()` method (line 123):
  - Add cleanup for PCA button event listener

### 4. Update `src/main.js`
- Add import: `import PCAWidget from './widgets/pcaWidget.js'` (after line 6)
- Instantiate PCA widget (after line 61):
  ```javascript
  const pcaWidget = new PCAWidget(document.getElementById('pgb-pca-card'), genomicService, geometryManager);
  ```
- Update WidgetService instantiation (line 62):
  - Add `pcaWidget` as third parameter: `new WidgetService(..., assemblyWidget, populationOnlyWidget, pcaWidget)`

## Implementation Notes

- The PCA widget will reuse the same HTML structure and styling as the assembly widget
- Button behavior (hover, click, toggle) will match the assembly button exactly
- No changes needed to CSS files initially - can reuse `assembly-widget__card` styles or create new `pca-widget__card` styles later if needed
- Internal method names in PCAWidget can remain assembly-focused for now (as per user request)
- The widget will be draggable and have the same search/filter functionality as assembly widget

## Testing Checklist

- PCA button appears in left panel below Population button
- Clicking PCA button shows PCA widget card
- Clicking PCA button again hides the card
- Clicking Assembly or Population hides PCA widget
- Hover effects work on PCA button
- Active state styling applies when PCA widget is shown
- PCA widget is draggable
- Search functionality works in PCA widget
- Switch toggle works in PCA widget footer

## Implementation Status

✅ **Completed** - All tasks have been implemented:
- ✅ Created `src/widgets/pcaWidget.js` 
- ✅ Added PCA widget card HTML container to `index.html`
- ✅ Updated `WidgetService` with PCA button and handlers
- ✅ Updated `main.js` to import, instantiate, and pass PCA widget
