/**
 * Configuration Service
 * Loads and parses application configuration from public/app-config.json
 */

const DEFAULT_CONFIG = {
    preload: {
        enabled: true,
        locus: 'chr1:25240000-25460000'
    }
};

/**
 * Loads the application configuration file
 * @returns {Promise<Object>} Configuration object with defaults applied
 */
async function loadConfig() {
    try {
        const response = await fetch('/app-config.json');
        
        if (!response.ok) {
            console.warn(`Failed to load app-config.json (${response.status}). Using default configuration.`);
            return DEFAULT_CONFIG;
        }
        
        const config = await response.json();
        
        // Validate and merge with defaults
        const mergedConfig = {
            preload: {
                enabled: config.preload?.enabled !== undefined ? config.preload.enabled : DEFAULT_CONFIG.preload.enabled,
                locus: config.preload?.locus || DEFAULT_CONFIG.preload.locus
            }
        };
        
        return mergedConfig;
    } catch (error) {
        console.warn('Error loading app-config.json:', error);
        console.warn('Using default configuration.');
        return DEFAULT_CONFIG;
    }
}

export { loadConfig };

