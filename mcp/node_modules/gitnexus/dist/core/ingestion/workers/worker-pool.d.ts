export interface WorkerPool {
    /**
     * Dispatch items across workers. Items are split into chunks (one per worker),
     * each worker processes its chunk via sub-batches to limit peak memory,
     * and results are concatenated back in order.
     */
    dispatch<TInput, TResult>(items: TInput[], onProgress?: (filesProcessed: number) => void): Promise<TResult[]>;
    /** Terminate all workers. Must be called when done. */
    terminate(): Promise<void>;
    /** Number of workers in the pool */
    readonly size: number;
}
/**
 * Create a pool of worker threads.
 */
export declare const createWorkerPool: (workerUrl: URL, poolSize?: number) => WorkerPool;
