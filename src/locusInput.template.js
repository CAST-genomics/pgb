// Element IDs as constants to prevent typos and enable reuse
export const ELEMENT_IDS = {
    INPUT: 'pgb-locus-input',
    GO_BUTTON: 'pgb-locus-go-button',
    ERROR: 'pgb-locus-error',
    VERSION_DROPDOWN: 'pgb-locus-version-dropdown'
};

export const template = `
    <div class="pgb-locus-input">
        <div class="input-group">
            <select class="pgb-locus-input__dropdown form-select" 
                    id="${ELEMENT_IDS.VERSION_DROPDOWN}"
                    aria-label="Version">
                <option value="v1">Version 1</option>
                <option value="v2">Version 2</option>
            </select>
            <input type="text" 
                   class="pgb-locus-input__control form-control" 
                   id="${ELEMENT_IDS.INPUT}"
                   placeholder="Enter locus, gene name, URL, or local file (e.g., chr8:30,000-50,000, daz1.json)"
                   aria-label="Genomic locus, gene name, or URL">
            <button class="pgb-locus-input__button btn btn-outline-secondary" 
                    type="button" 
                    id="${ELEMENT_IDS.GO_BUTTON}">Go</button>
        </div>
        <div class="invalid-feedback" id="${ELEMENT_IDS.ERROR}"></div>
    </div>
`;
