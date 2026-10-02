import type { ActionId } from '../config/controlsLayout';
import { TUNING } from '../config/tuning';
import { capturePointer, el } from '../ui/dom';

/** Presses waiting to be consumed by the simulation (never lost, never repeated). */
export interface ActionEdges {
  pass: boolean;
  shoot: boolean;
  dribble: boolean;
}

/**
 * Right-thumb buttons (docs/03 §3A): PASE, TIRO, REGATE. All fire on touch-down (fastest
 * response). Sprint is not on a button any more: it's the outer zone of the joystick.
 * Position and size come from TUNING.buttons (editable live in the tuning panel).
 */
export class ActionButtons {
  readonly element: HTMLElement;
  readonly buttons: Record<ActionId, HTMLButtonElement>;
  private readonly pointers: Record<ActionId, Set<number>> = { pass: new Set(), shoot: new Set(), dribble: new Set() };

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
    };
    this.element = el('div', { className: 'action-buttons' }, [this.buttons.pass, this.buttons.shoot, this.buttons.dribble]);
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
  }

  private bind(id: ActionId, b: HTMLButtonElement): void {
    const set = this.pointers[id];
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      capturePointer(b, e.pointerId);
      if (set.size === 0) this.edges[id] = true;
      set.add(e.pointerId);
      b.classList.add('pressed');
    });
    const up = (e: PointerEvent): void => {
      if (!set.delete(e.pointerId)) return;
      if (set.size === 0) b.classList.remove('pressed');
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Release everything (e.g. when pausing). */
  reset(): void {
    for (const id of Object.keys(this.pointers) as ActionId[]) {
      this.pointers[id].clear();
      this.buttons[id].classList.remove('pressed');
    }
  }
}
