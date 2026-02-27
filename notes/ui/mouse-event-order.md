# Mouse Event Order: mousedown vs click

## Question
Which event fires first: 'click' or 'mousedown'?

## Answer
The `mousedown` event fires first, then `click` fires later.

## Event Sequence
Here's the typical sequence of mouse events:

1. **`mousedown`** - Fires when the mouse button is pressed down
2. **`mousemove`** - Fires whenever the mouse moves (regardless of button state)
3. **`mouseup`** - Fires when the mouse button is released
4. **`click`** - Fires after `mouseup` if the mouse didn't move significantly between `mousedown` and `mouseup`

## Application in RayCastService
In our RayCastService implementation, this sequence is perfect for detecting pan vs click operations:

1. `onMouseDown` fires first and records the initial position
2. `onMouseMove` fires whenever the mouse moves (but we only process it when the button is down)
3. `onClick` fires last, and we check if movement was detected during the mouse-down phase

## Why This Works
This sequence is ideal for our use case because:
- We can set up our tracking state in `mousedown`
- We can detect movement during the mouse-down phase in `mousemove`
- We can make our decision in `click` based on whether movement occurred

The browser automatically determines if it should fire a `click` event based on whether the mouse moved significantly between `mousedown` and `mouseup`. If it moved too much, no `click` event is fired. But in our case, we want to be more precise about what constitutes "significant movement" for our specific use case.

## Implementation Details
```javascript
onMouseDown(event) {
    this.mouseDownPosition = { x: event.clientX, y: event.clientY };
    this.hasMouseMoved = false;
    this.isMouseDown = true;
}

onMouseMove(event) {
    // Only track movement when mouse button is down
    if (!this.isMouseDown) return;
    
    const deltaX = Math.abs(event.clientX - this.mouseDownPosition.x);
    const deltaY = Math.abs(event.clientY - this.mouseDownPosition.y);
    
    if (deltaX > this.mouseMovementThreshold || deltaY > this.mouseMovementThreshold) {
        this.hasMouseMoved = true;
    }
}

onClick(event) {
    // Check if mouse moved during mouse-down (indicating pan/zoom)
    if (this.hasMouseMoved) {
        return; // Skip processing click if mouse moved
    }
    
    // Process the click
    for (const callback of this.clickCallbacks) {
        callback(this.currentIntersection);
    }
}
```

## Key Insight
The key insight is that we only need to detect mouse movement during the mouse-down phase to distinguish between:
- **Simple clicks**: Mouse down and up without significant movement
- **Pan operations**: Mouse movement during the mouse-down phase 

## Important Detail
**`mousemove` fires for ALL mouse movement**, not just when the mouse button is down. In our implementation, we specifically check the button state:

```javascript
onMouseMove(event) {
    // Only track movement when mouse button is down
    if (!this.isMouseDown) return;
    
    // ... rest of the logic
}
```

So `mousemove` events are always firing, but we only process them when `this.isMouseDown` is true. 