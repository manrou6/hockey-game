import { el } from '../ui/dom';

/** Right-hand hold button. In F0 it only sprints; in F1 it becomes REGATE (tap) / sprint (hold). */
export class SprintButton {
  readonly element: HTMLButtonElement;
  private readonly pointers = new Set<number>();

  constructor() {
    this.element = el('button', { className: 'touch-btn btn-sprint', i18n: 'controls.sprint', attrs: { id: 'btn-sprint' } });
    const release = (e: PointerEvent): void => {
      this.pointers.delete(e.pointerId);
      this.element.classList.toggle('pressed', this.pointers.size > 0);
    };
    this.element.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.element.setPointerCapture(e.pointerId);
      this.pointers.add(e.pointerId);
      this.element.classList.add('pressed');
    });
    this.element.addEventListener('pointerup', release);
    this.element.addEventListener('pointercancel', release);
    this.element.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get held(): boolean {
    return this.pointers.size > 0;
  }
}
