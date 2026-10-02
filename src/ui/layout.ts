/**
 * The app container (#app) is always laid out in landscape; in portrait CSS rotates it
 * 90° clockwise. Pointer events report viewport coordinates, so touch input must be
 * converted into the container's own (landscape) coordinates.
 */
const PORTRAIT = window.matchMedia('(orientation: portrait)');

function app(): HTMLElement {
  return document.getElementById('app') ?? document.body;
}

export function isRotated(): boolean {
  return PORTRAIT.matches;
}

/** Landscape layout size of the app container (CSS px, before rotation). */
export function layoutWidth(): number {
  return app().clientWidth;
}

/** Convert viewport (clientX, clientY) into app-container coordinates. Writes into `out`. */
export function toLayout(clientX: number, clientY: number, out: { x: number; y: number }): void {
  const r = app().getBoundingClientRect();
  if (!isRotated()) {
    out.x = clientX - r.left;
    out.y = clientY - r.top;
    return;
  }
  // rotate(90deg) about the top-left corner, placed at the right edge of the viewport:
  // layout (x, y) → viewport (right - y, top + x).
  out.x = clientY - r.top;
  out.y = r.right - clientX;
}
