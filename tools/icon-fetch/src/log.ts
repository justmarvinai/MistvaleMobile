/**
 * Console output. Colour only when stdout is a TTY, so CI logs stay clean.
 */

const ESC = '\u001b[';
const useColor = process.stdout.isTTY === true && process.env.NO_COLOR === undefined;

function paint(code: string, text: string): string {
  return useColor ? `${ESC}${code}m${text}${ESC}0m` : text;
}

export const log = {
  /** Section heading. */
  step(message: string): void {
    process.stdout.write(`${paint('36;1', '>')} ${paint('1', message)}\n`);
  },
  info(message: string): void {
    process.stdout.write(`  ${message}\n`);
  },
  detail(message: string): void {
    process.stdout.write(`  ${paint('2', message)}\n`);
  },
  ok(message: string): void {
    process.stdout.write(`  ${paint('32', 'ok')} ${message}\n`);
  },
  warn(message: string): void {
    process.stderr.write(`  ${paint('33', '!')} ${message}\n`);
  },
  error(message: string): void {
    process.stderr.write(`  ${paint('31', 'x')} ${message}\n`);
  },
  blank(): void {
    process.stdout.write('\n');
  },
};

/** Formats a byte count for the summary line. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  return `${(bytes / 1024).toFixed(1)} KiB`;
}
