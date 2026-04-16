/**
 * Spinner - Progress indicator for long operations
 */
import pc from 'picocolors';

export interface SpinnerOptions {
  text?: string;
  color?: string;
  disabled?: boolean;
}

export class Spinner {
  private frames: string[] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private interval: NodeJS.Timeout | null = null;
  private currentFrame = 0;
  private text: string;
  private color: string;
  private disabled: boolean;
  private started = false;

  constructor(options: SpinnerOptions = {}) {
    this.text = options.text || 'Loading...';
    this.color = options.color || 'cyan';
    this.disabled = options.disabled || !process.stdout.isTTY;
  }

  start(): this {
    if (this.disabled || this.started) {
      return this;
    }

    this.started = true;
    this.interval = setInterval(() => {
      this.render();
    }, 80);

    this.render();
    return this;
  }

  private render(): void {
    const frame = this.frames[this.currentFrame];
    const coloredFrame = this.getColoredFrame(frame);
    process.stdout.write(`\r${coloredFrame} ${this.text}`);

    this.currentFrame = (this.currentFrame + 1) % this.frames.length;
  }

  private getColoredFrame(frame: string): string {
    const colors: Record<string, (text: string) => string> = {
      cyan: pc.cyan,
      magenta: pc.magenta,
      green: pc.green,
      yellow: pc.yellow,
      red: pc.red,
      blue: pc.blue,
    };

    const colorFn = colors[this.color] || colors.cyan;
    return colorFn(frame);
  }

  update(text: string): this {
    this.text = text;
    return this;
  }

  stop(message?: string): this {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    // Clear line
    process.stdout.write('\r' + '\x1B[K');

    if (message) {
      process.stdout.write(message + '\n');
    }

    this.started = false;
    return this;
  }

  success(message?: string): this {
    return this.stop(message ? pc.green('✓ ') + message : undefined);
  }

  warning(message?: string): this {
    return this.stop(message ? pc.yellow('⚠ ') + message : undefined);
  }

  error(message?: string): this {
    return this.stop(message ? pc.red('✗ ') + message : undefined);
  }
}

/**
 * Create a simple spinner
 */
export function spinner(options?: SpinnerOptions): Spinner {
  return new Spinner(options).start();
}

/**
 * Run async operation with spinner
 */
export async function withSpinner<T>(
  operation: () => Promise<T>,
  options: { text?: string; success?: string; error?: string } = {}
): Promise<T> {
  const spin = new Spinner({ text: options.text || 'Working...' });
  spin.start();

  try {
    const result = await operation();
    spin.success(options.success);
    return result;
  } catch (error) {
    spin.error(options.error || (error instanceof Error ? error.message : 'Error'));
    throw error;
  }
}
