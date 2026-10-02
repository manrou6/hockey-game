type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void> };

/**
 * Enter fullscreen and lock to the landscape side the phone is held in right now, so the
 * screen never flips 180° in the middle of a match (a plain 'landscape' lock lets Android
 * switch between both sides). Must be called from a user gesture: Chrome Android only
 * allows orientation lock while fullscreen (or in the installed app). Failures are ignored.
 */
export async function enterFullscreenLandscape(): Promise<void> {
  const doc = document.documentElement;
  try {
    if (!document.fullscreenElement && doc.requestFullscreen) {
      await doc.requestFullscreen({ navigationUI: 'hide' });
    }
  } catch {
    /* not allowed here */
  }
  try {
    const orientation = screen.orientation as LockableOrientation;
    // In portrait the app is drawn rotated 90° clockwise (see layout.ts), i.e. it is read
    // with the phone turned to landscape-primary.
    const side = orientation.type === 'landscape-secondary' ? 'landscape-secondary' : 'landscape-primary';
    await orientation.lock?.(side);
  } catch {
    /* not supported (desktop) */
  }
}

export function isFullscreen(): boolean {
  return Boolean(document.fullscreenElement);
}
