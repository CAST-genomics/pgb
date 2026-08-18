export class Draggable {
  /**
   * `options.handle` restricts the grab to one descendant — pass it for any element that
   * is also CSS-`resize`able. The browser paints the resize grip inside the element's own
   * box, so a press on it arrives as `event.target === element`, which is the same thing a
   * press on the card's surface looks like; without a handle this class claims that press
   * and `preventDefault()`s it, and the grip drags the card instead of resizing it.
   *
   * Optional, and off by default, because the five widgets that predate it are grabbed by
   * their whole surface and none of them resizes.
   *
   * @param {HTMLElement} element
   * @param {{ handle?: HTMLElement | null }} [options]
   */
  constructor(element, { handle = null } = {}) {
    this.element = element;
    this.handle = handle;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.initialX = 0;
    this.initialY = 0;

    // Bind methods to preserve 'this' context
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);

    // Add event listeners
    this.element.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  onMouseDown(event) {
    if (!this.isGrab(event.target)) {
      return;
    }

    this.isDragging = true;
    this.startX = event.clientX;
    this.startY = event.clientY;

    // Get the current position, accounting for margins
    const rect = this.element.getBoundingClientRect();
    const style = window.getComputedStyle(this.element);
    const marginLeft = parseInt(style.marginLeft);
    const marginTop = parseInt(style.marginTop);

    this.initialX = rect.left - marginLeft;
    this.initialY = rect.top - marginTop;

    // Prevent text selection during drag
    event.preventDefault();
  }

  /**
   * What counts as taking hold of the element: the handle if there is one, else the
   * element's own surface or a header inside it.
   */
  isGrab(target) {
    if (this.handle) {
      return this.handle.contains(target);
    }
    return target === this.element || Boolean(target.closest('.card-header'));
  }

  onMouseMove(event) {
    if (!this.isDragging) return;

    const deltaX = event.clientX - this.startX;
    const deltaY = event.clientY - this.startY;

    this.element.style.left = `${this.initialX + deltaX}px`;
    this.element.style.top = `${this.initialY + deltaY}px`;
  }

  onMouseUp() {
    this.isDragging = false;
  }

  destroy() {
    // Clean up event listeners
    this.element.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
  }
} 