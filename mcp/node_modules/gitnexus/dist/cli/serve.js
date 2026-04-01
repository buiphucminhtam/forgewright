import { createServer } from '../server/api.js';
export const serveCommand = async (options) => {
    const port = Number(options?.port ?? 4747);
    const host = options?.host ?? '127.0.0.1';
    await createServer(port, host);
};
