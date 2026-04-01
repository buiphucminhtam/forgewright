import type { Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js';
import { type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
export type StdioFraming = 'content-length' | 'newline';
export declare class CompatibleStdioServerTransport implements Transport {
    private readonly _stdin;
    private readonly _stdout;
    private _readBuffer;
    private _started;
    private _framing;
    onmessage?: (message: JSONRPCMessage) => void;
    onerror?: (error: Error) => void;
    onclose?: () => void;
    constructor(_stdin?: NodeJS.ReadableStream, _stdout?: NodeJS.WritableStream);
    private readonly _ondata;
    private readonly _onerror;
    start(): Promise<void>;
    private detectFraming;
    private discardBufferedInput;
    private readContentLengthMessage;
    private readNewlineMessage;
    private readMessage;
    private processReadBuffer;
    close(): Promise<void>;
    send(message: JSONRPCMessage, _options?: TransportSendOptions): Promise<void>;
}
