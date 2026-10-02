import { TUNING } from '../config/tuning';
import type { ActionEdges } from './actionButtons';

/**
 * Keyboard (docs/03 §3 PC): WASD / arrows to skate; J = PASE, K or Space = TIRO,
 * L = REGATE (tap = dribble move, hold = sprint); Shift = sprint.
 */
export class KeyboardInput {
  private readonly down = new Set<string>();
  private lDownAt = 0;

  constructor(edges: ActionEdges, target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      if (e.code === 'KeyJ') edges.pass = true;
      if (e.code === 'KeyK' || e.code === 'Space') edges.shoot = true;
      if (e.code === 'KeyL') this.lDownAt = performance.now();
    });
    target.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      if (e.code === 'KeyL' && performance.now() - this.lDownAt <= TUNING.input.tapTime * 1000) edges.dribble = true;
    });
    target.addEventListener('blur', () => this.down.clear());
  }

  private any(...codes: string[]): boolean {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  /** Movement vector (screen right = +x, screen up = +y), unit length or zero. */
  read(out: { x: number; y: number; sprint: boolean }): void {
    let x = 0;
    let y = 0;
    if (this.any('KeyD', 'ArrowRight')) x += 1;
    if (this.any('KeyA', 'ArrowLeft')) x -= 1;
    if (this.any('KeyW', 'ArrowUp')) y += 1;
    if (this.any('KeyS', 'ArrowDown')) y -= 1;
    const len = Math.hypot(x, y);
    out.x = len > 0 ? x / len : 0;
    out.y = len > 0 ? y / len : 0;
    out.sprint = this.any('ShiftLeft', 'ShiftRight', 'KeyL');
  }
}
