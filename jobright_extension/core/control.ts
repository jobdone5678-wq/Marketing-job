export class Cancelled extends Error {
  constructor(message = 'Filling was cancelled') {
    super(message);
    this.name = 'Cancelled';
  }
}

let cancelled = false;
let statusCallback: ((current: string) => void) | null = null;

export function isCancelled(): boolean {
  return cancelled;
}

export function cancel(): void {
  cancelled = true;
}

export function checkCancel(): void {
  if (cancelled) {
    throw new Cancelled();
  }
}

export function status(msg: string): void {
  if (statusCallback) {
    statusCallback(msg);
  }
}

export function begin(cb?: (current: string) => void): void {
  cancelled = false;
  statusCallback = cb ?? null;
}

export function end(): void {
  cancelled = false;
  statusCallback = null;
}

if (typeof document !== 'undefined') {
  document.addEventListener('CancelAutoFill', () => {
    cancel();
  });
}

