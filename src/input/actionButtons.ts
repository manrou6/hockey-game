import { DEFAULT_BUTTON_LAYOUT, type ActionId } from '../config/controlsLayout';
import { TUNING } from '../config/tuning';
import { capturePointer, el } from '../ui/dom';

/** Presses waiting to be consumed by the simulation (never lost, never repeated). */
export interface ActionEdges {
  pass: boolean;
  shoot: boolean;
  dribble: boolean;
}

/**
 * Right-thumb buttons (docs/03 §3A): PASE, TIRO, REGATE. PASE/TIRO fire on touch-down
 * (fastest response). REGATE: a short tap = dribble move, holding it = sprint.
 */
export class ActionButtons {
  readonly element: HTMLElement;
  readonly buttons: Record<ActionId, HTMLButtonElement>;
  private readonly pointers: Record<ActionId, Set<number>> = { pass: new Set(), shoot: new Set(), dribble: new Set() };
  private dribbleDownAt = 0;

  constructor(private readonly edges: ActionEdges) {
    const make = (id: ActionId, i18n: string): HTMLButtonElement => {
      const p = DEFAULT_BUTTON_LAYOUT[id];
      const b = el('button', { className: `touch-btn action-btn action-${id}`, i18n, attrs: { id: `btn-${id}` } });
      b.style.right = `calc(${p.right}px + var(--safe-r))`;
      b.style.bottom = `${p.bottom}px`;
      b.style.width = b.style.height = `${p.size}px`;
      this.bind(id, b);
      return b;
    };
    this.buttons = {
      shoot: make('shoot', 'controls.shoot'),
      pass: make('pass', 'controls.pass'),
      dribble: make('dribble', 'controls.dribble'),
    };
    this.element = el('div', { className: 'action-buttons' }, [this.buttons.pass, this.buttons.shoot, this.buttons.dribble]);
  }

  private bind(id: ActionId, b: HTMLButtonElement): void {
    const set = this.pointers[id];
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      capturePointer(b, e.pointerId);
      if (set.size === 0) {
        if (id === 'pass') this.edges.pass = true;
        else if (id === 'shoot') this.edges.shoot = true;
        else this.dribbleDownAt = performance.now();
      }
      set.add(e.pointerId);
      b.classList.add('pressed');
    });
    const up = (e: PointerEvent, cancelled: boolean): void => {
      if (!set.delete(e.pointerId)) return;
      if (set.size === 0) {
        b.classList.remove('pressed');
        if (id === 'dribble' && !cancelled && performance.now() - this.dribbleDownAt <= TUNING.input.tapTime * 1000) this.edges.dribble = true;
      }
    };
    b.addEventListener('pointerup', (e) => up(e, false));
    b.addEventListener('pointercancel', (e) => up(e, true));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** REGATE held → sprint. */
  get sprintHeld(): boolean {
    return this.pointers.dribble.size > 0;
  }

  /** Release everything (e.g. when pausing). */
  reset(): void {
    for (const id of Object.keys(this.pointers) as ActionId[]) {
      this.pointers[id].clear();
      this.buttons[id].classList.remove('pressed');
    }
  }
}
