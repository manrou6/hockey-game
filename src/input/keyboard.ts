import type { ActionEdges } from './actionButtons';

/** Two presses of U within this time (ms) = lob. */
const DOUBLE_TAP_MS = 350;

/**
 * Keyboard (docs/03 §3 PC): WASD / arrows = skate at the normal top speed (keys are not
 * analog), Shift = sprint; J = PASE (hold = more power), U held = driven lofted pass, U twice
 * (held) or Shift+U = lob; K or Space = TIRO, L = REGATE, Q = CANVI (switch player).
 */
export class KeyboardInput {
  private readonly down = new Set<string>();
  private lastUAt = -Infinity;
  private uDouble = false;

  constructor(edges: ActionEdges, target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      if (e.code === 'KeyJ') {
        edges.pass = true;
        edges.passHeight = 0;
      }
      if (e.code === 'KeyK' || e.code === 'Space') edges.shoot = true;
      if (e.code === 'KeyL') edges.dribble = true;
      if (e.code === 'KeyQ') edges.switch = true;
      if (e.code === 'KeyU') {
        this.uDouble = e.timeStamp - this.lastUAt <= DOUBLE_TAP_MS;
        this.lastUAt = e.timeStamp;
      }
    });
    target.addEventListener('keyup', (e) => {
      // The pass height is taken at the moment J is released (U may be let go right after).
      if (e.code === 'KeyJ') edges.passHeight = this.passHeight;
      this.down.delete(e.code);
    });
    target.addEventListener('blur', () => this.down.clear());
  }

  /** Pass height from U: held = driven lofted (1); held after a double tap, or with Shift = lob (2). */
  get passHeight(): number {
    if (!this.down.has('KeyU')) return 0;
    return this.uDouble || this.any('ShiftLeft', 'ShiftRight') ? 2 : 1;
  }

  /** J (PASE) held down. */
  get passHeld(): boolean {
    return this.down.has('KeyJ');
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
