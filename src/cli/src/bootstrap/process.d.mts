export interface BootstrapProcessOptions {
  timeout?: number;
  maximum?: number;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}
export function runBootstrapProcess(
  command: string,
  args: string[],
  options?: BootstrapProcessOptions,
): Promise<{ status: number | null; stdout: string; stderr: string }>;
