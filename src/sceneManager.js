import * as THREE from 'three'

class SceneManager {
    constructor() {
        this.scenes = new Map()
        this.activeSceneName = null
    }

    /**
     * Create a new scene with the given name and background color
     * @param {string} sceneName - Unique identifier for the scene
     * @param {THREE.Color} backgroundColor - Background color for the scene
     * @returns {THREE.Scene} The created scene
     */
    createScene(sceneName, backgroundColor = new THREE.Color(0xffffff)) {
        if (this.scenes.has(sceneName)) {
            console.warn(`Scene '${sceneName}' already exists. Overwriting.`)
            this.disposeScene(sceneName)
        }

        const scene = new THREE.Scene()
        scene.name = sceneName
        scene.background = backgroundColor

        this.scenes.set(sceneName, scene)

        // Set as active if this is the first scene
        if (this.activeSceneName === null) {
            this.activeSceneName = sceneName
        }

        return scene
    }

    /**
     * Get a scene by name
     * @param {string} sceneName - Name of the scene to retrieve
     * @returns {THREE.Scene|null} The scene or null if not found
     */
    getScene(sceneName) {
        return this.scenes.get(sceneName) || null
    }

    /**
     * Get the currently active scene
     * @returns {THREE.Scene|null} The active scene or null if none
     */
    getActiveScene() {
        return this.activeSceneName ? this.scenes.get(this.activeSceneName) : null
    }

    /**
     * Get the name of the currently active scene
     * @returns {string|null} The active scene name or null if none
     */
    getActiveSceneName() {
        return this.activeSceneName
    }

    /**
     * Set the active scene
     * @param {string} sceneName - Name of the scene to activate
     * @returns {boolean} True if successful, false if scene doesn't exist
     */
    setActiveScene(sceneName) {
        if (!this.scenes.has(sceneName)) {
            console.error(`Scene '${sceneName}' not found`)
            return false
        }

        this.activeSceneName = sceneName
        return true
    }

    /**
     * Get all scene names
     * @returns {string[]} Array of scene names
     */
    getSceneNames() {
        return Array.from(this.scenes.keys())
    }

    /**
     * Check if a scene exists
     * @param {string} sceneName - Name of the scene to check
     * @returns {boolean} True if scene exists
     */
    hasScene(sceneName) {
        return this.scenes.has(sceneName)
    }

    addToAllScenes(items) {

        for (const scene of this.scenes.values()) {
            for (const item of items) {
                scene.add(item)
            }
        }

    }

    /**
     * Dispose of a specific scene and all its resources
     * @param {string} sceneName - Name of the scene to dispose
     */
    disposeScene(sceneName) {
        const scene = this.scenes.get(sceneName)
        if (!scene) {
            console.warn(`Scene '${sceneName}' not found for disposal`)
            return
        }

        // Dispose of all objects in the scene
        this.disposeSceneObjects(scene)

        // Remove from map
        this.scenes.delete(sceneName)

        // Update active scene if this was the active one
        if (this.activeSceneName === sceneName) {
            this.activeSceneName = this.scenes.size > 0 ?
                Array.from(this.scenes.keys())[0] : null
        }
    }

    /**
     * Dispose of all scenes and resources
     */
    disposeAll() {
        const sceneNames = Array.from(this.scenes.keys())
        for (const sceneName of sceneNames) {
            this.disposeScene(sceneName)
        }
        this.activeSceneName = null
    }

    /**
     * Clear all objects from a scene without disposing the scene itself
     * @param {string} sceneName - Name of the scene to clear
     */
    clearScene(sceneName) {
        const scene = this.scenes.get(sceneName)
        if (!scene) {
            console.warn(`Scene '${sceneName}' not found for clearing`)
            return
        }

        this.disposeSceneObjects(scene)
    }

    /**
     * Clear all objects from all scenes
     */
    clearAllScenes() {
        for (const scene of this.scenes.values()) {
            this.disposeSceneObjects(scene)
        }
    }

    /**
     * Dispose of all objects in a scene (geometries, materials, textures)
     * @param {THREE.Scene} scene - The scene to dispose objects from
     */
    disposeSceneObjects(scene) {
        scene.traverse((object) => {
            // Dispose of geometries
            if (object.geometry) {
                object.geometry.dispose()
            }

            // Dispose of materials
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => this.disposeMaterial(material))
                } else {
                    this.disposeMaterial(object.material)
                }
            }

            // Dispose of textures
            if (object.userData && object.userData.textures) {
                object.userData.textures.forEach(texture => {
                    if (texture && texture.dispose) {
                        texture.dispose()
                    }
                })
            }
        })

        // Clear the scene
        while (scene.children.length > 0) {
            scene.remove(scene.children[0])
        }
    }

    /**
     * Dispose of a material and its associated resources
     * @param {THREE.Material} material - The material to dispose
     */
    disposeMaterial(material) {
        if (!material) return

        // Dispose of material textures
        if (material.map) material.map.dispose()
        if (material.lightMap) material.lightMap.dispose()
        if (material.bumpMap) material.bumpMap.dispose()
        if (material.normalMap) material.normalMap.dispose()
        if (material.specularMap) material.specularMap.dispose()
        if (material.envMap) material.envMap.dispose()
        if (material.alphaMap) material.alphaMap.dispose()
        if (material.aoMap) material.aoMap.dispose()
        if (material.displacementMap) material.displacementMap.dispose()
        if (material.emissiveMap) material.emissiveMap.dispose()
        if (material.gradientMap) material.gradientMap.dispose()

        // Dispose of the material itself
        material.dispose()
    }

    /**
     * Get scene statistics (useful for debugging)
     * @param {string} sceneName - Name of the scene to get stats for
     * @returns {Object} Statistics about the scene
     */
    getSceneStats(sceneName) {
        const scene = this.scenes.get(sceneName)
        if (!scene) return null

        let geometryCount = 0
        let materialCount = 0
        let textureCount = 0
        let objectCount = 0

        scene.traverse((object) => {
            objectCount++
            if (object.geometry) geometryCount++
            if (object.material) {
                if (Array.isArray(object.material)) {
                    materialCount += object.material.length
                } else {
                    materialCount++
                }
            }
        })

        return {
            objectCount,
            geometryCount,
            materialCount,
            textureCount
        }
    }
}

export default SceneManager
