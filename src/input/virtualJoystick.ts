import { TUNING } from '../config/tuning';
import { capturePointer } from '../ui/dom';
import { layoutWidth, toLayout } from '../ui/layout';
import { mapStick, type MappedStick } from './stickMapping';

/**
 * Floating virtual joystick (docs/03 §3A): appears where the left thumb touches (left part
 * of the screen). Analog: further from the centre = faster; the outer zone (from the
 * sprint ring) = sprint. The ring is drawn and the knob changes colour while sprinting.
 */
export class VirtualJoystick {
  readonly element: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly ring: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private dx = 0;
  private dy = 0;
  private readonly pt = { x: 0, y: 0 };
  private readonly mapped: MappedStick = { x: 0, y: 0, sprint: false };

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'touch-layer';
    this.element.id = 'touch-layer';
    this.base = document.createElement('div');
    this.base.className = 'joy-base joy-idle';
    this.ring = document.createElement('div');
    this.ring.className = 'joy-sprint-ring';
    this.knob = document.createElement('div');
    this.knob.className = 'joy-knob';
    this.base.append(this.ring, this.knob);
    this.element.append(this.base);

    this.element.addEventListener('pointerdown', (e) => this.onDown(e));
    this.element.addEventListener('pointermove', (e) => this.onMove(e));
    this.element.addEventListener('pointerup', (e) => this.onUp(e));
    this.element.addEventListener('pointercancel', (e) => this.onUp(e));
    this.element.addEventListener('contextmenu', (e) => e.preventDefault());
    this.updateGeometry();
  }

  get active(): boolean {
    return this.pointerId !== null;
  }

  /** True while the thumb is in the sprint zone. */
  get sprinting(): boolean {
    return this.mapped.sprint;
  }

  /** Max knob travel (× radius): beyond the ring edge when the sprint threshold is > 100%. */
  private maxTravel(): number {
    return Math.max(1, TUNING.input.sprintThreshold + 0.1);
  }

  /** Base and sprint-ring sizes follow the tuning values (live). */
  updateGeometry(): void {
    const r = TUNING.input.joystickRadiusPx;
    this.base.style.width = this.base.style.height = `${r * 2}px`;
    this.base.style.margin = `${-r}px 0 0 ${-r}px`;
    const ringR = r * TUNING.input.sprintThreshold;
    this.ring.style.width = this.ring.style.height = `${ringR * 2}px`;
    this.ring.style.margin = `${-ringR}px 0 0 ${-ringR}px`;
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
    this.mapped.sprint = false;
    this.updateGeometry();
    this.base.classList.remove('joy-idle');
    this.base.style.left = `${this.originX}px`;
    this.base.style.top = `${this.originY}px`;
    this.updateKnob();
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const max = TUNING.input.joystickRadiusPx * this.maxTravel();
    toLayout(e.clientX, e.clientY, this.pt);
    let dx = this.pt.x - this.originX;
    let dy = this.pt.y - this.originY;
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
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
    this.mapped.sprint = false;
    this.base.classList.add('joy-idle');
    this.base.style.left = '';
    this.base.style.top = '';
    this.updateKnob();
  }

  private updateKnob(): void {
    this.knob.style.transform = `translate(${this.dx}px, ${this.dy}px)`;
    this.remap();
  }

  private remap(): void {
    const i = TUNING.input;
    const r = i.joystickRadiusPx;
    mapStick(this.dx / r, -this.dy / r, this.mapped.sprint, {
      deadZone: i.joystickDeadZone,
      curve: i.joystickCurve,
      threshold: i.sprintThreshold,
      hysteresis: i.sprintHysteresis,
    }, this.mapped);
    this.base.classList.toggle('sprinting', this.mapped.sprint);
  }

  /** Movement (screen right = +x, screen up = +y): magnitude = fraction of normal top speed. */
  read(out: { x: number; y: number; sprint: boolean }): void {
    this.remap(); // tuning may have changed since the last move
    out.x = this.mapped.x;
    out.y = this.mapped.y;
    out.sprint = this.mapped.sprint;
  }
}
