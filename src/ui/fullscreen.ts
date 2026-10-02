/**
 * Enter fullscreen and lock landscape. Must be called from a user gesture
 * (Chrome Android only allows orientation lock while fullscreen). Failures are
 * ignored: desktop browsers and installed PWAs may refuse and that's fine.
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
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await orientation.lock?.('landscape');
  } catch {
    /* not supported (desktop) */
  }
}
