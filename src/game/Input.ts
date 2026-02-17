import { Direction, SWIPE_THRESHOLD } from '../utils/constants';

type SwipeCallback = (direction: Direction) => void;

export class Input {
  private canvas: HTMLCanvasElement;
  private onSwipe: SwipeCallback;
  private touchStartX = 0;
  private touchStartY = 0;
  private mouseDown = false;
  private enabled = true;

  constructor(canvas: HTMLCanvasElement, onSwipe: SwipeCallback) {
    this.canvas = canvas;
    this.onSwipe = onSwipe;
    this.bindEvents();
  }

  private bindEvents() {
    // Touch
    this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    this.canvas.addEventListener('touchend', this.handleTouchEnd, { passive: true });

    // Mouse
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    this.canvas.addEventListener('mouseup', this.handleMouseUp);

    // Klavye
    window.addEventListener('keydown', this.handleKeyDown);
  }

  private handleTouchStart = (e: TouchEvent) => {
    if (!this.enabled) return;
    const touch = e.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
  };

  private handleTouchEnd = (e: TouchEvent) => {
    if (!this.enabled) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - this.touchStartX;
    const dy = touch.clientY - this.touchStartY;
    this.processSwipe(dx, dy);
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (!this.enabled) return;
    this.mouseDown = true;
    this.touchStartX = e.clientX;
    this.touchStartY = e.clientY;
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (!this.enabled) return;
    if (!this.mouseDown) return;
    this.mouseDown = false;
    const dx = e.clientX - this.touchStartX;
    const dy = e.clientY - this.touchStartY;
    this.processSwipe(dx, dy);
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    switch (e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        e.preventDefault();
        this.onSwipe('UP');
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault();
        this.onSwipe('DOWN');
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault();
        this.onSwipe('LEFT');
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault();
        this.onSwipe('RIGHT');
        break;
    }
  };

  private processSwipe(dx: number, dy: number) {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (Math.max(absDx, absDy) < SWIPE_THRESHOLD) return;

    if (absDx > absDy) {
      this.onSwipe(dx > 0 ? 'RIGHT' : 'LEFT');
    } else {
      this.onSwipe(dy > 0 ? 'DOWN' : 'UP');
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  destroy() {
    this.canvas.removeEventListener('touchstart', this.handleTouchStart);
    this.canvas.removeEventListener('touchend', this.handleTouchEnd);
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    this.canvas.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('keydown', this.handleKeyDown);
  }
}
