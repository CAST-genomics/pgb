import * as THREE from 'three';

function prettyPrint(number) {

    if (typeof number !== "number") {
        console.error(`${ number } must be a number`)
        return
    }

    const integerPart = Math.trunc(number)
    return integerPart.toLocaleString()
}

/**
 * Loads data from a URL and returns the JSON response
 * @param {string} url - The URL to fetch data from
 * @returns {Promise<Object>} A promise that resolves with the JSON data
 */
async function loadPath(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const json = await response.json();
        console.log(`Successfully loaded data from ${url}`);

        return json;
    } catch (error) {
        console.error(`Error loading ${url}:`, error);
        throw error;
    }
}

/**
 * Create a function that returns unique random elements from `arr`,
 * up to `total` times (without replacement).
 * @param {Array} arr
 * @param {number} total - number of retrievals (must be < arr.length)
 * @returns {() => any | undefined} next() -> next unique random value, or undefined when exhausted
 */
function createRandomAccessor(arr, total) {
    if (!Array.isArray(arr)) throw new TypeError("arr must be an array");
    if (!Number.isInteger(total) || total < 0 || total >= arr.length) {
        throw new RangeError("total must be an integer in [0, arr.length)");
    }

    const n = arr.length;
    // Indices 0..n-1; we’ll only shuffle the first `total` positions
    const order = Array.from({ length: n }, (_, i) => i);

    // Partial Fisher–Yates: ensures a uniform random subset of size `total`
    for (let i = 0; i < total; i++) {
        const r = i + Math.floor(Math.random() * (n - i));
        [order[i], order[r]] = [order[r], order[i]];
    }

    let i = 0;
    return function next() {
        if (i >= total) return undefined; // exhausted
        return arr[order[i++]];
    };
}

function* uniqueRandomGenerator(arr, total) {
    const next = createRandomAccessor(arr, total);
    for (let i = 0; i < total; i++) yield next();
}

/**
 * Converts a pixel distance to world distance based on camera and container
 * @param {THREE.Camera} camera - The camera to use for projection
 * @param {number} pixelDistance - The pixel distance to convert
 * @param {HTMLElement} container - The container element to get width from
 * @returns {number} The world distance
 */
function getWorldDistanceFromPixelDistance(camera, pixelDistance, container) {
    // points in NDC space
    const ndc0 = new THREE.Vector3(0, 0, 0.5)

    const { width } = container.getBoundingClientRect()
    const ndc1 = new THREE.Vector3(pixelDistance / width * 2, 0, 0.5)

    // NDC -> World
    const world0 = ndc0.unproject(camera).clone()
    const world1 = ndc1.unproject(camera).clone()

    // Delta in world space === updated raycast threshold
    const worldDistance = world0.distanceTo(world1);

    // console.log(`getWorldDistanceFromPixelDistance. pixel ${ pixelDistance } world ${ worldDistance.toFixed(3) }`)

    return worldDistance
}

export { prettyPrint, loadPath, uniqueRandomGenerator, getWorldDistanceFromPixelDistance }
