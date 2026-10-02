import { TUNING } from '../config/tuning';
import { capturePointer } from '../ui/dom';
import { layoutWidth, toLayout } from '../ui/layout';

/**
 * Floating virtual joystick (docs/03 §3A): appears where the left thumb touches (left part
 * of the screen) and follows the drag. Output is analog in [0, 1] magnitude.
 */
export class VirtualJoystick {
  readonly element: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private dx = 0;
  private dy = 0;
  private readonly pt = { x: 0, y: 0 };

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'touch-layer';
    this.element.id = 'touch-layer';
    this.base = document.createElement('div');
    this.base.className = 'joy-base joy-idle';
    this.knob = document.createElement('div');
    this.knob.className = 'joy-knob';
    this.base.append(this.knob);
    this.element.append(this.base);

    this.element.addEventListener('pointerdown', (e) => this.onDown(e));
    this.element.addEventListener('pointermove', (e) => this.onMove(e));
    this.element.addEventListener('pointerup', (e) => this.onUp(e));
    this.element.addEventListener('pointercancel', (e) => this.onUp(e));
    this.element.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get active(): boolean {
    return this.pointerId !== null;
  }

  private onDown(e: PointerEvent): void {
    if (this.pointerId !== null) return;
    toLayout(e.clientX, e.clientY, this.pt);
    if (this.pt.x > layoutWidth() * TUNING.input.joystickZone) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    capturePointer(this.element, e.pointerId);
    this.originX = this.pt.x;
    this.originY = this.pt.y;
    this.dx = 0;
    this.dy = 0;
    this.base.classList.remove('joy-idle');
    this.base.style.left = `${this.originX}px`;
    this.base.style.top = `${this.originY}px`;
    this.updateKnob();
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const r = TUNING.input.joystickRadiusPx;
    toLayout(e.clientX, e.clientY, this.pt);
    let dx = this.pt.x - this.originX;
    let dy = this.pt.y - this.originY;
    const len = Math.hypot(dx, dy);
    if (len > r) {
      dx = (dx / len) * r;
      dy = (dy / len) * r;
    }
    this.dx = dx;
    this.dy = dy;
    this.updateKnob();
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.dx = 0;
    this.dy = 0;
    this.base.classList.add('joy-idle');
    this.base.style.left = '';
    this.base.style.top = '';
    this.updateKnob();
  }

  private updateKnob(): void {
    this.knob.style.transform = `translate(${this.dx}px, ${this.dy}px)`;
  }

  /** Movement vector (screen right = +x, screen up = +y), magnitude 0..1. */
  read(out: { x: number; y: number }): void {
    const r = TUNING.input.joystickRadiusPx;
    out.x = this.dx / r;
    out.y = -this.dy / r;
  }
}
