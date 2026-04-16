/**
 * Logger utility with debug mode support
 */
import pc from 'picocolors';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  quiet: boolean;
  debug: boolean;
  useColors: boolean;
}

export class Logger {
  private quiet: boolean;
  private debug: boolean;
  private useColors: boolean;

  constructor(options: LoggerOptions) {
    this.quiet = options.quiet;
    this.debug = options.debug;
    this.useColors = options.useColors;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.debug) {
      this.log('debug', message, ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log('error', message, ...args);
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (this.quiet && level !== 'error') {
      return;
    }

    const timestamp = this.useColors ? pc.dim(new Date().toISOString()) : new Date().toISOString();
    const prefix = this.getPrefix(level);
    const formattedMessage = this.format(message, ...args);

    const output = `${timestamp} ${prefix} ${formattedMessage}`;

    if (level === 'error') {
      process.stderr.write(output + '\n');
    } else {
      process.stdout.write(output + '\n');
    }
  }

  private getPrefix(level: LogLevel): string {
    if (!this.useColors) {
      return `[${level.toUpperCase()}]`;
    }

    const prefixes: Record<LogLevel, string> = {
      debug: pc.gray('[DEBUG]'),
      info: pc.blue('[INFO]'),
      warn: pc.yellow('[WARN]'),
      error: pc.red('[ERROR]'),
    };

    return prefixes[level];
  }

  private format(message: string, ...args: unknown[]): string {
    if (args.length === 0) {
      return message;
    }

    try {
      return args.length === 1
        ? `${message} ${JSON.stringify(args[0])}`
        : `${message} ${args.map((a) => JSON.stringify(a)).join(' ')}`;
    } catch {
      return `${message} ${args.join(' ')}`;
    }
  }
}

/**
 * Create a logger instance
 */
export function createLogger(options: Partial<LoggerOptions> = {}): Logger {
  return new Logger({
    quiet: options.quiet ?? false,
    debug: options.debug ?? false,
    useColors: options.useColors ?? true,
  });
}
