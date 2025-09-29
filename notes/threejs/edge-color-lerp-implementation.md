# Gradient Edge Implementation

This document explains how to implement edges with gradient colors that smoothly transition from a start color to an end color, while maintaining an arrow shape.

## Concept

The implementation uses a custom shader material that:
1. Takes two colors (start and end)
2. Uses a gradient texture to control the transition
3. Maintains the arrow shape using an existing arrow texture
4. Blends everything together smoothly

## Shader Code

```glsl
// Vertex Shader
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

// Fragment Shader
uniform vec3 startColor;
uniform vec3 endColor;
uniform sampler2D map;
uniform sampler2D gradientMap;
varying vec2 vUv;

void main() {
    // Sample the gradient texture
    vec4 gradient = texture2D(gradientMap, vUv);
    
    // Sample the arrow texture
    vec4 arrow = texture2D(map, vUv);
    
    // Mix the colors based on the gradient
    vec3 mixedColor = mix(startColor, endColor, gradient.r);
    
    // Combine with the arrow texture
    gl_FragColor = vec4(mixedColor, arrow.a);
}
```

## Example Implementation

Here's a complete example showing how to create gradient edges:

```javascript
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

function createGradientEdge(startPoint, endPoint, startColor, endColor) {
    // Create a simple rectangle geometry for the edge
    const width = 0.1;
    const length = startPoint.distanceTo(endPoint);
    const geometry = new THREE.PlaneGeometry(length, width);
    
    // Create gradient texture (1x256 pixels, black to white)
    const gradientCanvas = document.createElement('canvas');
    gradientCanvas.width = 256;
    gradientCanvas.height = 1;
    const ctx = gradientCanvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 256, 0);
    gradient.addColorStop(0, 'black');
    gradient.addColorStop(1, 'white');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 1);
    
    const gradientTexture = new THREE.CanvasTexture(gradientCanvas);
    gradientTexture.wrapS = THREE.ClampToEdgeWrapping;
    
    // Create arrow texture (white arrow on transparent background)
    const arrowCanvas = document.createElement('canvas');
    arrowCanvas.width = 256;
    arrowCanvas.height = 64;
    const arrowCtx = arrowCanvas.getContext('2d');
    // Draw a simple arrow shape
    arrowCtx.fillStyle = 'white';
    arrowCtx.beginPath();
    arrowCtx.moveTo(0, 32);
    arrowCtx.lineTo(200, 32);
    arrowCtx.lineTo(200, 16);
    arrowCtx.lineTo(256, 32);
    arrowCtx.lineTo(200, 48);
    arrowCtx.lineTo(200, 32);
    arrowCtx.fill();
    
    const arrowTexture = new THREE.CanvasTexture(arrowCanvas);
    arrowTexture.wrapS = THREE.RepeatWrapping;
    
    // Create shader material
    const material = new THREE.ShaderMaterial({
        uniforms: {
            startColor: { value: new THREE.Color(startColor) },
            endColor: { value: new THREE.Color(endColor) },
            map: { value: arrowTexture },
            gradientMap: { value: gradientTexture }
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        side: THREE.DoubleSide
    });
    
    // Create mesh
    const mesh = new THREE.Mesh(geometry, material);
    
    // Position and rotate to point from start to end
    const midPoint = new THREE.Vector3().addVectors(startPoint, endPoint).multiplyScalar(0.5);
    mesh.position.copy(midPoint);
    
    const direction = new THREE.Vector3().subVectors(endPoint, startPoint);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(1, 0, 0),
        direction.normalize()
    );
    mesh.setRotationFromQuaternion(quaternion);
    
    return mesh;
}

// Example usage
const edges = [
    {
        start: new THREE.Vector3(-2, 0, 0),
        end: new THREE.Vector3(2, 0, 0),
        startColor: 0xff0000,  // Red
        endColor: 0x0000ff     // Blue
    },
    {
        start: new THREE.Vector3(-2, 1, 0),
        end: new THREE.Vector3(2, 1, 0),
        startColor: 0x00ff00,  // Green
        endColor: 0xff00ff     // Magenta
    }
];
```

## Key Components

1. **Gradient Texture**
   - A 1D texture (stored as 2D) that goes from black to white
   - Controls the color transition along the edge
   - Uses `ClampToEdgeWrapping` to prevent texture tiling

2. **Arrow Texture**
   - White arrow shape on transparent background
   - Uses `RepeatWrapping` to allow for texture animation
   - Maintains the arrow shape while colors transition

3. **Shader Material**
   - Takes start and end colors as uniforms
   - Uses the gradient texture to control color mixing
   - Preserves the arrow texture's alpha channel

4. **Edge Geometry**
   - Simple plane geometry oriented from start to end point
   - UV coordinates aligned for proper texture mapping
   - Width and length based on edge requirements

## Integration Notes

When integrating with the existing codebase:

1. **Texture Management**
   - Consider using the existing `textureService` for both gradient and arrow textures
   - The gradient texture could be generated once and cached

2. **Color Management**
   - Get start color from starting node
   - Get end color from ending node

3. **Geometry**
   - Adapt the geometry creation to match existing edge geometry
   - Ensure UV coordinates are properly mapped

4. **Animation**
   - The existing edge animation system can be maintained
   - The gradient will move with the arrow texture

## Performance Considerations

1. **Texture Size**
   - Keep gradient texture small (e.g., 256x1)
   - Use power-of-two dimensions

2. **Shader Complexity**
   - The shader is relatively simple and performant
   - Only two texture samples and one mix operation

3. **Memory Usage**
   - Reuse gradient texture across all edges
   - Consider texture atlasing for arrow textures

## Future Enhancements

1. **Custom Gradient Patterns**
   - Add support for different gradient patterns
   - Allow for non-linear color transitions

2. **Dynamic Color Updates**
   - Add ability to update colors in real-time
   - Support for color animations

3. **Advanced Effects**
   - Add glow or highlight effects
   - Support for multiple gradient stops 
