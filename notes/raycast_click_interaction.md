
# 🎯 RayCast-Based Click Interaction in Three.js

This document outlines a clean architecture for implementing **DOM-style click interaction** in a Three.js application using a `RayCastService` class. It supports:

- ✅ Click to select a mesh
- ✅ Click away to deselect
- ✅ Continuous hover detection in the animation loop

---

## 🧰 Architecture Overview

You will maintain:

- A `RayCastService` that encapsulates raycasting logic.
- A global `selectedObject` to track selection state.
- Separate handling for:
  - Hover (inside `animate()` loop)
  - Click (inside `pointerdown` listener)

---

## 🛠️ RayCastService Class

```js
class RayCastService {
  constructor(scene, domElement) {
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.scene = scene;
    this.domElement = domElement;
    this.clickables = [];
  }

  update(mouse, camera) {
    this.raycaster.setFromCamera(mouse, camera);
    this.hoverIntersections = this.raycaster.intersectObjects(this.clickables, true);
  }

  getClickIntersection(event, camera) {
    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, camera);
    const intersects = this.raycaster.intersectObjects(this.clickables, true);
    return intersects[0] || null;
  }

  addClickable(object) {
    this.clickables.push(object);
  }

  removeClickable(object) {
    const index = this.clickables.indexOf(object);
    if (index !== -1) this.clickables.splice(index, 1);
  }
}
```

---

## 🔁 In Your Animation Loop

Continue checking for hover:

```js
raycastService.update(mouse, camera);
```

---

## 🖱️ In Your Click Handler

Attach to `pointerdown` on the canvas:

```js
renderer.domElement.addEventListener("pointerdown", (event) => {
  const hit = raycastService.getClickIntersection(event, camera);

  if (hit) {
    if (hit.object !== selectedObject) {
      deselectObject(selectedObject);
      selectedObject = hit.object;
      selectObject(selectedObject);
    }
  } else {
    deselectObject(selectedObject);
    selectedObject = null;
  }
});
```

---

## 🧼 Selection Utility Functions

```js
function selectObject(obj) {
  if (!obj) return;
  obj.userData.originalColor = obj.material.color.getHex();
  obj.material.color.setHex(0xffff00); // Yellow highlight
}

function deselectObject(obj) {
  if (!obj || obj.userData.originalColor === undefined) return;
  obj.material.color.setHex(obj.userData.originalColor);
  delete obj.userData.originalColor;
}
```

---

## 💡 Notes

- Use `pointerdown` instead of `click` for better touch/mouse compatibility.
- Separate real-time `hover` vs `click` to avoid logic collisions.
- Maintain a flat array of `clickables` for performance.
- Works well with any Three.js `Mesh`.

---
