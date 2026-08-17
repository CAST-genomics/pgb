// Color utility functions will be added here
import * as THREE from 'three'

const rubinColors = {
    rubinGray:      new THREE.Color('#87867F'),
    rubinSlate:     new THREE.Color('#1F1E1D'),
    rubinDarkGray:  new THREE.Color('#5E5D59'),
    rubinIvoryMed:  new THREE.Color('#F0EEE6'),
    rubinIvoryDark: new THREE.Color('#E8E6DC'),
    rubinIvory:     new THREE.Color('#FAF9F6'),
    rubinRiso:      new THREE.Color('#5E7EDF'),
    rubinCyan:      new THREE.Color('#44A6E4'),
    rubinClay:      new THREE.Color('#D97757'),
    rubinBeige:     new THREE.Color('#E8E6DC')
};

/**
 * Rubin colors as hex strings lookup table
 * A collection of hex color strings from Rick Rubin's palette
 */
const rubinColorsHexStrings = new Map([
    ['rubinGray', '#87867F'],
    ['rubinSlate', '#1F1E1D'],
    ['rubinDarkGray', '#5E5D59'],
    ['rubinIvoryMed', '#F0EEE6'],
    ['rubinIvoryDark', '#E8E6DC'],
    ['rubinIvory', '#FAF9F6'],
    ['rubinRiso', '#5E7EDF'],
    ['rubinCyan', '#44A6E4'],
    ['rubinClay', '#D97757'],
    ['rubinBeige', '#E8E6DC']
]);

// example usage:
// material.color.copy(rubinColors.rubinClay);

/**
 * Apple Crayon color palette
 * A collection of 25 colors used in Apple's classic Mac OS
 */
const appleCrayonColors = new Map([
    ['licorice',    new THREE.Color('#000000')],
    ['lead',        new THREE.Color('#1E1E1E')],
    ['tungsten',    new THREE.Color('#3A3A3A')],
    ['iron',        new THREE.Color('#545453')],
    ['steel',       new THREE.Color('#6E6E6E')],
    ['tin',         new THREE.Color('#878687')],
    ['nickel',      new THREE.Color('#888787')],
    ['aluminum',    new THREE.Color('#A09FA0')],
    ['magnesium',   new THREE.Color('#B8B8B8')],
    ['silver',      new THREE.Color('#D0D0D0')],
    ['mercury',     new THREE.Color('#E8E8E8')],
    ['snow',        new THREE.Color('#FFFFFF')],
    ['cayenne',     new THREE.Color('#891100')],
    ['mocha',       new THREE.Color('#894800')],
    ['asparagus',   new THREE.Color('#888501')],
    ['fern',        new THREE.Color('#458401')],
    ['clover',      new THREE.Color('#028401')],
    ['moss',        new THREE.Color('#018448')],
    ['teal',        new THREE.Color('#008688')],
    ['ocean',       new THREE.Color('#004A88')],
    ['midnight',    new THREE.Color('#001888')],
    ['eggplant',    new THREE.Color('#491A88')],
    ['plum',        new THREE.Color('#891E88')],
    ['maroon',      new THREE.Color('#891648')],
    ['maraschino',  new THREE.Color('#FF2101')],
    ['tangerine',   new THREE.Color('#FF8802')],
    ['lemon',       new THREE.Color('#FFFA03')],
    ['lime',        new THREE.Color('#83F902')],
    ['spring',      new THREE.Color('#05F802')],
    ['sea foam',    new THREE.Color('#03F987')],
    ['turquoise',   new THREE.Color('#00FDFF')],
    ['aqua',        new THREE.Color('#008CFF')],
    ['blueberry',   new THREE.Color('#002EFF')],
    ['grape',       new THREE.Color('#8931FF')],
    ['magenta',     new THREE.Color('#FF39FF')],
    ['strawberry',  new THREE.Color('#FF2987')],
    ['salmon',      new THREE.Color('#FF726E')],
    ['cantaloupe',  new THREE.Color('#FFCE6E')],
    ['banana',      new THREE.Color('#FFFB6D')],
    ['honeydew',    new THREE.Color('#CEFA6E')],
    ['flora',       new THREE.Color('#68F96E')],
    ['spindrift',   new THREE.Color('#68FBD0')],
    ['ice',         new THREE.Color('#68FDFF')],
    ['sky',         new THREE.Color('#6ACFFF')],
    ['orchid',      new THREE.Color('#6E76FF')],
    ['lavender',    new THREE.Color('#D278FF')],
    ['bubblegum',   new THREE.Color('#FF7AFF')],
    ['carnation',   new THREE.Color('#FF7FD3')]
]);

/**
 * Apple Crayon color palette - hex strings only
 * A collection of 48 hex color strings used in Apple's classic Mac OS
 */
const appleCrayonColorsHexStrings = new Map()
    .set('licorice', '#000000')
    .set('lead', '#1E1E1E')
    .set('tungsten', '#3A3A3A')
    .set('iron', '#545453')
    .set('steel', '#6E6E6E')
    .set('tin', '#878687')
    .set('nickel', '#888787')
    .set('aluminum', '#A09FA0')
    .set('magnesium', '#B8B8B8')
    .set('silver', '#D0D0D0')
    .set('mercury', '#E8E8E8')
    .set('snow', '#FFFFFF')
    .set('cayenne', '#891100')
    .set('mocha', '#894800')
    .set('asparagus', '#888501')
    .set('fern', '#458401')
    .set('clover', '#028401')
    .set('moss', '#018448')
    .set('teal', '#008688')
    .set('ocean', '#004A88')
    .set('midnight', '#001888')
    .set('eggplant', '#491A88')
    .set('plum', '#891E88')
    .set('maroon', '#891648')
    .set('maraschino', '#FF2101')
    .set('tangerine', '#FF8802')
    .set('lemon', '#FFFA03')
    .set('lime', '#83F902')
    .set('spring', '#05F802')
    .set('sea foam', '#03F987')
    .set('turquoise', '#00FDFF')
    .set('aqua', '#008CFF')
    .set('blueberry', '#002EFF')
    .set('grape', '#8931FF')
    .set('magenta', '#FF39FF')
    .set('strawberry', '#FF2987')
    .set('salmon', '#FF726E')
    .set('cantaloupe', '#FFCE6E')
    .set('banana', '#FFFB6D')
    .set('honeydew', '#CEFA6E')
    .set('flora', '#68F96E')
    .set('spindrift', '#68FBD0')
    .set('ice', '#68FDFF')
    .set('sky', '#6ACFFF')
    .set('orchid', '#6E76FF')
    .set('lavender', '#D278FF')
    .set('bubblegum', '#FF7AFF')
    .set('carnation', '#FF7FD3');

// Predefined color categories
const colorCategories = {
    vibrant: [
        'maraschino',
        'tangerine',
        'lemon',
        'lime',
        'spring',
        'sea foam',
        'turquoise',
        'aqua',
        'blueberry',
        'grape',
        'magenta',
        'strawberry',
        'carnation'
    ],
    grays: [
        'licorice',
        'lead',
        'tungsten',
        'iron',
        'steel',
        'tin',
        'nickel',
        'aluminum',
        'magnesium',
        'silver',
        'mercury',
        'snow'
    ],
    pastels: [
        'snow',
        'salmon',
        'cantaloupe',
        'banana',
        'honeydew',
        'flora',
        'spindrift',
        'ice',
        'sky',
        'orchid',
        'lavender',
        'bubblegum',
        'carnation'
    ],
    earth: [
        'cayenne',
        'mocha',
        'asparagus',
        'fern',
        'clover',
        'moss',
        'teal',
        'ocean',
        'midnight',
        'eggplant',
        'plum',
        'maroon'
    ]
};

// Color complements mapping
const colorComplements = new Map([
    // Vibrant colors
    ['maraschino', 'turquoise'],
    ['tangerine', 'blueberry'],
    ['lemon', 'grape'],
    ['lime', 'magenta'],
    ['spring', 'strawberry'],
    ['sea foam', 'carnation'],
    ['turquoise', 'maraschino'],
    ['aqua', 'strawberry'],
    ['blueberry', 'tangerine'],
    ['grape', 'lemon'],
    ['magenta', 'lime'],
    ['strawberry', 'spring'],
    ['carnation', 'sea foam'],

    // Pastels
    ['salmon', 'sky'],
    ['cantaloupe', 'orchid'],
    ['banana', 'lavender'],
    ['honeydew', 'bubblegum'],
    ['flora', 'ice'],
    ['spindrift', 'carnation'],
    ['ice', 'flora'],
    ['sky', 'salmon'],
    ['orchid', 'cantaloupe'],
    ['lavender', 'banana'],
    ['bubblegum', 'honeydew'],

    // Earth tones
    ['cayenne', 'teal'],
    ['mocha', 'ocean'],
    ['asparagus', 'midnight'],
    ['fern', 'eggplant'],
    ['clover', 'plum'],
    ['moss', 'maroon'],
    ['teal', 'cayenne'],
    ['ocean', 'mocha'],
    ['midnight', 'asparagus'],
    ['eggplant', 'fern'],
    ['plum', 'clover'],
    ['maroon', 'moss'],

    // Grays - complement with vibrant colors
    ['licorice', 'lemon'],
    ['lead', 'tangerine'],
    ['tungsten', 'maraschino'],
    ['iron', 'spring'],
    ['steel', 'sea foam'],
    ['tin', 'turquoise'],
    ['nickel', 'aqua'],
    ['aluminum', 'blueberry'],
    ['magnesium', 'grape'],
    ['silver', 'magenta'],
    ['mercury', 'strawberry'],
    ['snow', 'carnation']
]);

/**
 * Returns a random color from the Apple Crayon palette
 * @param {boolean} includeSnow - Whether to include white (snow) color, default false
 * @returns {THREE.Color} A THREE.Color object
 */
function getRandomAppleCrayonColor(includeSnow = false) {
    let colors = Array.from(appleCrayonColors.entries());
    if (!includeSnow) {
        colors = colors.filter(([name]) => name !== 'snow');
    }
    const [_, color] = colors[Math.floor(Math.random() * colors.length)];
    return color.clone();
}

/**
 * Returns a random vibrant color from the Apple Crayon palette
 * Excludes grays and pastels
 * @param {boolean} includeSnow - Whether to include white (snow) color, default false (not applicable for vibrant colors)
 * @returns {THREE.Color} A THREE.Color object
 */
function getRandomVibrantAppleCrayonColor(includeSnow = false) {
    const colorName = colorCategories.vibrant[Math.floor(Math.random() * colorCategories.vibrant.length)];
    return getAppleCrayonColorByName(colorName);
}

/**
 * Returns a random pastel color from the Apple Crayon palette
 * @param {boolean} includeSnow - Whether to include white (snow) color, default false
 * @returns {THREE.Color} A THREE.Color object
 */
function getRandomPastelAppleCrayonColor(includeSnow = false) {
    let pastelColors = colorCategories.pastels;
    if (!includeSnow) {
        pastelColors = pastelColors.filter(name => name !== 'snow');
    }
    const colorName = pastelColors[Math.floor(Math.random() * pastelColors.length)];
    return getAppleCrayonColorByName(colorName);
}

/**
 * Returns a random gray from the Apple Crayon palette
 * @param {boolean} includeSnow - Whether to include white (snow) color, default false
 * @returns {THREE.Color} A THREE.Color object
 */
function getRandomGrayAppleCrayonColor(includeSnow = false) {
    let grayColors = colorCategories.grays;
    if (!includeSnow) {
        grayColors = grayColors.filter(name => name !== 'snow');
    }
    const colorName = grayColors[Math.floor(Math.random() * grayColors.length)];
    return getAppleCrayonColorByName(colorName);
}

/**
 * Returns a color from the Apple Crayon palette by name
 * @param {string} name - The name of the color
 * @param isHexString - Return the hex string form instead of a THREE.Color
 * @returns {THREE.Color|string|undefined} The color, or undefined if not found
 */
function getAppleCrayonColorByName(name, isHexString = false) {
    if (isHexString) {
        return appleCrayonColorsHexStrings.get(name)
    }
    const color = appleCrayonColors.get(name);
    return color ? color.clone() : undefined;
}

/**
 * Returns the hex string for an Apple Crayon palette color. Unlike
 * getAppleCrayonColorByName, the return type is a plain string, so callers
 * assigning to CSS/canvas color properties need no narrowing.
 * @param {string} name - The name of the color
 * @returns {string} The hex string
 * @throws If the palette has no color by that name
 */
function getAppleCrayonColorHexStringByName(name) {
    const hexString = appleCrayonColorsHexStrings.get(name)
    if (undefined === hexString) {
        throw new Error(`No Apple Crayon color named ${ name }`)
    }
    return hexString
}

// Color Palette drived from Rick Rubin's palette
// used for "The Way of Code" https://www.thewayofcode.com/

/**
 * Returns the complementary color for a given THREE.Color object
 * @param {THREE.Color} threeJSColor - The color to find the complement for
 * @returns {THREE.Color} The complementary color
 */
function getComplementaryThreeJSColor(threeJSColor) {
    // Create a new color object to avoid modifying the input
    const color = threeJSColor.clone();

    // Get HSL values
    const hsl = {};
    color.getHSL(hsl);

    // Shift hue by 180 degrees (0.5 in normalized HSL)
    hsl.h = (hsl.h + 0.5) % 1.0;

    // Create and return new color with complementary hue
    const complementaryColor = new THREE.Color();
    complementaryColor.setHSL(hsl.h, hsl.s, hsl.l);

    return complementaryColor;
}

export {
    appleCrayonColors,
    appleCrayonColorsHexStrings,
    rubinColors,
    rubinColorsHexStrings,
    getComplementaryThreeJSColor,
    getRandomAppleCrayonColor,
    getRandomVibrantAppleCrayonColor,
    getRandomPastelAppleCrayonColor,
    getRandomGrayAppleCrayonColor,
    getAppleCrayonColorByName,
    getAppleCrayonColorHexStringByName,
    colorComplements
};
