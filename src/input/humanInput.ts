import type { PlayerCommand } from '../sim/commands';
import type { CommandSource } from '../game/game';
import { ActionButtons, type ActionEdges } from './actionButtons';
import { readGamepad } from './gamepad';
import { KeyboardInput } from './keyboard';
import { VirtualJoystick } from './virtualJoystick';

/**
 * Merges all human devices into one abstract PlayerCommand. Screen axes map directly to
 * rink axes because every camera preset looks along +y (screen up = far side of the rink).
 * Button presses are latched until the simulation consumes them on a tick.
 */
export class HumanInput implements CommandSource {
  private readonly edges: ActionEdges = { pass: false, shoot: false, dribble: false, switch: false, passHeight: 0 };
  readonly joystick = new VirtualJoystick();
  readonly buttons = new ActionButtons(this.edges);
  private readonly keyboard = new KeyboardInput(this.edges);
  private readonly tmp = { x: 0, y: 0, sprint: false, passHeld: false, passHeight: 0 };
  private _enabled = false;

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(on: boolean) {
    this._enabled = on;
    if (!on) {
      this.buttons.reset();
      this.consumeEdges();
    }
  }

  read(out: PlayerCommand): void {
    out.moveX = 0;
    out.moveY = 0;
    out.sprint = false;
    out.pass = out.shoot = out.dribble = out.passHeld = out.switchPlayer = false;
    out.passHeight = 0;
    if (!this._enabled) {
      this.consumeEdges();
      return;
    }
    const t = this.tmp;
    // Direction, speed and sprint come from ONE device: touch joystick > keyboard > gamepad
    // (gamepad buttons are always read). Sprint = joystick outer zone, Shift, or gamepad.
    this.keyboard.read(t);
    const kx = t.x;
    const ky = t.y;
    const kSprint = t.sprint;
    readGamepad(t, this.edges);
    const padPass = t.passHeld;
    const padHeight = t.passHeight;
    if (this.joystick.active) {
      this.joystick.read(t);
    } else if (kx !== 0 || ky !== 0) {
      t.x = kx;
      t.y = ky;
      t.sprint = kSprint;
    }
    out.moveX = t.x;
    out.moveY = t.y;
    out.sprint = t.sprint;
    out.pass = this.edges.pass;
    out.shoot = this.edges.shoot;
    out.dribble = this.edges.dribble;
    out.passHeld = this.buttons.held('pass') || this.keyboard.passHeld || padPass;
    // While PASE is held: the live height (slide / U / LB); once released: the height it had
    // at that moment.
    out.passHeight = out.passHeld ? Math.max(this.buttons.passHeight(), this.keyboard.passHeight, padHeight) : this.edges.passHeight;
    out.switchPlayer = this.edges.switch;
  }

  /** Called once a simulation tick has used the presses. */
  consumeEdges(): void {
    this.edges.pass = this.edges.shoot = this.edges.dribble = this.edges.switch = false;
  }
}
