import type { ActionEdges } from './actionButtons';

/**
 * Keyboard (docs/03 §3 PC): WASD / arrows = skate at the normal top speed (keys are not
 * analog), Shift = sprint; J = PASE, K or Space = TIRO, L = REGATE.
 */
export class KeyboardInput {
  private readonly down = new Set<string>();

  constructor(edges: ActionEdges, target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      if (e.code === 'KeyJ') edges.pass = true;
      if (e.code === 'KeyK' || e.code === 'Space') edges.shoot = true;
      if (e.code === 'KeyL') edges.dribble = true;
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
  }

  private any(...codes: string[]): boolean {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  /** Movement (screen right = +x, screen up = +y), unit length = normal top speed, or zero. */
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
    out.sprint = len > 0 && this.any('ShiftLeft', 'ShiftRight');
  }
}
