/**
 * Analog stick → movement command (docs/03 §3). Travel r (0 centre, 1 edge of the ring,
 * can exceed 1 when dragging beyond it): dead zone → nothing; dead zone..threshold →
 * speed 0..normal max along a response curve; ≥ threshold → sprint. Hysteresis keeps
 * the sprint from flickering at the border.
 */
export interface StickMappingParams {
  deadZone: number;
  curve: number;
  threshold: number;
  hysteresis: number;
}

export interface MappedStick {
  x: number;
  y: number;
  sprint: boolean;
}

export function mapStick(rawX: number, rawY: number, wasSprinting: boolean, p: StickMappingParams, out: MappedStick): void {
  const r = Math.hypot(rawX, rawY);
  if (r <= p.deadZone || r === 0) {
    out.x = 0;
    out.y = 0;
    out.sprint = false;
    return;
  }
  const exit = Math.max(p.deadZone, p.threshold - p.hysteresis);
  out.sprint = wasSprinting ? r >= exit : r >= p.threshold;
  const span = Math.max(1e-6, p.threshold - p.deadZone);
  const lin = Math.min(1, (Math.min(r, p.threshold) - p.deadZone) / span);
  const mag = out.sprint ? 1 : Math.pow(lin, Math.max(0.1, p.curve));
  out.x = (rawX / r) * mag;
  out.y = (rawY / r) * mag;
}
