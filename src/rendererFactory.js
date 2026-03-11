import * as THREE from 'three'

class RendererFactory {
    static createRenderer(container) {

        const canvas = document.createElement('canvas')

        // Configure Three.js color management
        THREE.ColorManagement.enabled = true;

        const webGLRenderConfig =
            {
                antialias: true,
                alpha: true,
                powerPreference: 'high-performance',
                canvas
            }
        const renderer = new THREE.WebGLRenderer(webGLRenderConfig)
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setPixelRatio(window.devicePixelRatio)

        const { clientWidth, clientHeight } = container
        renderer.setSize(clientWidth, clientHeight)

        container.appendChild(renderer.domElement)

        return renderer
    }

    static createRenderTarget(){

    }
}

export default RendererFactory
