import type { ActionId } from '../config/controlsLayout';
import { TUNING } from '../config/tuning';
import { capturePointer, el } from '../ui/dom';
import { dragHeight } from './passGesture';
import { toLayout } from '../ui/layout';

/** Presses waiting to be consumed by the simulation (never lost, never repeated). */
export interface ActionEdges {
  pass: boolean;
  shoot: boolean;
  dribble: boolean;
  /** CANVI (switch player). */
  switch: boolean;
  /** Height the pass had at the moment PASE was released (any device); kept until the next
   * press, so a quick release between two frames is never lost. */
  passHeight: number;
  /** The same for TIRO (F1.5a: the shot height uses the same diagonal drag). */
  shootHeight: number;
}

/**
 * Right-thumb buttons (docs/03 §3A): PASE, TIRO, REGATE. Presses register on touch-down
 * (fastest response); PASE and TIRO also report when they are held (the pass / shot leaves on
 * release; a diagonal drag picks the height). Sprint is not on a button any more: it's the outer zone of the joystick.
 * Position and size come from TUNING.buttons (editable live in the tuning panel).
 */
export class ActionButtons {
  readonly element: HTMLElement;
  readonly buttons: Record<ActionId, HTMLButtonElement>;
  private readonly pointers: Record<ActionId, Set<number>> = { pass: new Set(), shoot: new Set(), dribble: new Set(), switch: new Set() };
  /** PASE height by dragging diagonally (docs/03 §3): where the finger went down, and how far
   * it is now to the right (dx) and up (dy). */
  private readonly passStart = { x: 0, y: 0 };
  private passDx = 0;
  private passDy = 0;
  /** The same for TIRO (F1.5a). */
  private readonly shootStart = { x: 0, y: 0 };
  private shootDx = 0;
  private shootDy = 0;
  private readonly pt = { x: 0, y: 0 };

  constructor(private readonly edges: ActionEdges) {
    const make = (id: ActionId, i18n: string): HTMLButtonElement => {
      const b = el('button', { className: `touch-btn action-btn action-${id}`, i18n, attrs: { id: `btn-${id}` } });
      this.bind(id, b);
      return b;
    };
    this.buttons = {
      shoot: make('shoot', 'controls.shoot'),
      pass: make('pass', 'controls.pass'),
      dribble: make('dribble', 'controls.dribble'),
      switch: make('switch', 'controls.switch'),
    };
    this.element = el('div', { className: 'action-buttons' }, [this.buttons.pass, this.buttons.shoot, this.buttons.dribble, this.buttons.switch]);
    // Dragging the finger diagonally on PASE (it keeps tracking outside the button: pointer capture).
    const pass = this.buttons.pass;
    pass.addEventListener('pointermove', (e) => {
      if (!this.pointers.pass.has(e.pointerId)) return;
      toLayout(e.clientX, e.clientY, this.pt);
      this.passDx = this.pt.x - this.passStart.x;
      this.passDy = this.passStart.y - this.pt.y;
    });
    const shoot = this.buttons.shoot;
    shoot.addEventListener('pointermove', (e) => {
      if (!this.pointers.shoot.has(e.pointerId)) return;
      toLayout(e.clientX, e.clientY, this.pt);
      this.shootDx = this.pt.x - this.shootStart.x;
      this.shootDy = this.shootStart.y - this.pt.y;
    });
    this.applyLayout();
  }

  /** Re-read positions/sizes from TUNING.buttons. */
  applyLayout(): void {
    const t = TUNING.buttons;
    const place = (b: HTMLButtonElement, right: number, bottom: number, size: number): void => {
      b.style.right = `calc(${right}px + var(--safe-r))`;
      b.style.bottom = `${bottom}px`;
      b.style.width = b.style.height = `${size}px`;
    };
    place(this.buttons.pass, t.passRight, t.passBottom, t.passSize);
    place(this.buttons.shoot, t.shootRight, t.shootBottom, t.shootSize);
    place(this.buttons.dribble, t.dribbleRight, t.dribbleBottom, t.dribbleSize);
    place(this.buttons.switch, t.switchRight, t.switchBottom, t.switchSize);
  }

  private bind(id: ActionId, b: HTMLButtonElement): void {
    const set = this.pointers[id];
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      capturePointer(b, e.pointerId);
      if (set.size === 0) this.edges[id] = true;
      set.add(e.pointerId);
      if (id === 'pass') {
        this.edges.passHeight = 0;
        toLayout(e.clientX, e.clientY, this.passStart);
        this.passDx = this.passDy = 0;
      }
      if (id === 'shoot') {
        this.edges.shootHeight = 0;
        toLayout(e.clientX, e.clientY, this.shootStart);
        this.shootDx = this.shootDy = 0;
      }
      b.classList.add('pressed');
    });
    const up = (e: PointerEvent): void => {
      if (id === 'pass' && set.has(e.pointerId) && set.size === 1) this.edges.passHeight = this.liveHeight();
      if (id === 'shoot' && set.has(e.pointerId) && set.size === 1) this.edges.shootHeight = this.liveShootHeight();
      if (!set.delete(e.pointerId)) return;
      if (set.size === 0) b.classList.remove('pressed');
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** PASE height from the finger dragged while holding it: 0 low, 1 driven lofted (up-left), 2 lob (up-right). */
  passHeight(): number {
    return this.held('pass') ? this.liveHeight() : 0;
  }

  private liveHeight(): number {
    const i = TUNING.input;
    return dragHeight(this.passDx, this.passDy, i.passDragDistance, i.passDragAngle);
  }

  /** TIRO height from the same diagonal drag (F1.5a): 0 low, 1 high (up-right), 2 chip (up-left). */
  shootHeight(): number {
    return this.held('shoot') ? this.liveShootHeight() : 0;
  }

  private liveShootHeight(): number {
    const i = TUNING.input;
    return dragHeight(this.shootDx, this.shootDy, i.passDragDistance, i.passDragAngle);
  }

  /** Is this button being held down right now? */
  held(id: ActionId): boolean {
    return this.pointers[id].size > 0;
  }

  /** Release everything (e.g. when pausing). */
  reset(): void {
    for (const id of Object.keys(this.pointers) as ActionId[]) {
      this.pointers[id].clear();
      this.buttons[id].classList.remove('pressed');
    }
  }
}
