/**
 * Yield control to the event loop so spinners/progress can render.
 * Call periodically in hot loops to prevent UI freezes.
 */
export declare const yieldToEventLoop: () => Promise<void>;
