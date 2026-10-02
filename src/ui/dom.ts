/** Tiny DOM helper: create an element with classes, attributes and children. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; i18n?: string; attrs?: Record<string, string> } = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.i18n) node.dataset.i18n = props.i18n;
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) node.setAttribute(k, v);
  for (const c of children) node.append(c);
  return node;
}

/** Capture a pointer on an element; ignores the error thrown if the pointer is already gone. */
export function capturePointer(target: Element, pointerId: number): void {
  try {
    target.setPointerCapture(pointerId);
  } catch {
    /* pointer already released or synthetic: capture is only a nicety */
  }
}
