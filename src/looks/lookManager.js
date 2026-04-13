import Look from './look.js';

/**
 * Central registry for all Looks across multiple scenes in the MRT system.
 * Each scene has exactly one Look, identified by scene name.
 */
class LookManager {
    constructor() {
        // Map of scene names to their associated Looks
        this.looks = new Map();
    }

    /**
     * Register a Look for a specific scene
     * @param {string} sceneName - The name of the scene
     * @param {Look} look - The Look instance for this scene
     */
    setLook(sceneName, look) {
        if (!(look instanceof Look)) {
            throw new Error('Look must be an instance of Look class');
        }

        // Dispose of existing look if it exists
        if (this.looks.has(sceneName)) {
            this.looks.get(sceneName).dispose();
        }

        this.looks.set(sceneName, look);
    }

    /**
     * Activate a look for a specific scene and deactivate others
     * @param {string} sceneName - The name of the scene to activate
     * @param {THREE.Scene} activeScene - The scene instance becoming active
     */
    activateLook(sceneName, activeScene) {
        // Deactivate all other looks
        this.looks.forEach((look, name) => {
            if (name !== sceneName) {
                look.deactivate();
            }
        });

        // Activate the specified look
        const look = this.looks.get(sceneName);
        if (look) {
            look.activate(activeScene);
        }
    }

    /**
     * Get the Look for a specific scene
     * @param {string} sceneName - The name of the scene
     * @returns {Look|null} The Look instance or null if not found
     */
    getLook(sceneName) {
        return this.looks.get(sceneName) || null;
    }

    /**
     * Check if a scene has a Look registered
     * @param {string} sceneName - The name of the scene
     * @returns {boolean} True if the scene has a Look
     */
    hasLook(sceneName) {
        return this.looks.has(sceneName);
    }

    clearAllMaterialCaches(){
        for (const [ key, look ] of this.looks) {
            console.log(`LookManage - ${ look.constructor.name } dispose.  material cache pre ${ look.materialCache.size }`)
            look.materialCache.clear()
            console.log(`LookManage - ${ look.constructor.name } dispose.  material cache post ${ look.materialCache.size }`)

        }
    }

    /**
     * Dispose of all Looks and clear the registry
     */
    dispose() {

        for (const [ key, look ] of this.looks) {
            look.dispose();
        }
        this.looks.clear();
    }
}

export default LookManager;

