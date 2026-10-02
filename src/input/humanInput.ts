import type { PlayerCommand } from '../sim/commands';
import type { CommandSource } from '../game/game';
import { readGamepad } from './gamepad';
import { KeyboardInput } from './keyboard';
import { SprintButton } from './sprintButton';
import { VirtualJoystick } from './virtualJoystick';

/**
 * Merges all human devices into one abstract PlayerCommand. Screen axes map directly to
 * rink axes because the TV camera looks along +y (screen up = far side of the rink).
 */
export class HumanInput implements CommandSource {
  readonly joystick = new VirtualJoystick();
  readonly sprintButton = new SprintButton();
  private readonly keyboard = new KeyboardInput();
  private readonly tmp = { x: 0, y: 0, sprint: false };
  enabled = false;

  read(out: PlayerCommand): void {
    out.moveX = 0;
    out.moveY = 0;
    out.sprint = false;
    if (!this.enabled) return;
    const t = this.tmp;
    let sprint = this.sprintButton.held;

    this.keyboard.read(t);
    sprint ||= t.sprint;
    // Direction priority: touch joystick > keyboard > gamepad.
    if (this.joystick.active) {
      this.joystick.read(t);
    } else if (t.x === 0 && t.y === 0) {
      readGamepad(t);
      sprint ||= t.sprint;
    }
    out.moveX = t.x;
    out.moveY = t.y;
    out.sprint = sprint;
  }
}
