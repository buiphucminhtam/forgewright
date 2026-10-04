/** Preserve a cached page and its input handlers, release only on final leave. */
export function bindPageLifecycle(target: EventTarget, pause: () => void, dispose: () => void, signal: AbortSignal): void {
  target.addEventListener('pagehide', event => {
    if ((event as PageTransitionEvent).persisted) pause();
    else dispose();
  }, {signal});
}
