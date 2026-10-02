/** Keyboard state: WASD / arrows to skate, Shift or L (future REGATE hold) to sprint. */
export class KeyboardInput {
  private readonly down = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
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
