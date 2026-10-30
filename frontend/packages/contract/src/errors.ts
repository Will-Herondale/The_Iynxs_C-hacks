export class NetworkError extends Error {
  readonly retryable = true as const;
  constructor(message = 'Network unavailable') {
    super(message);
    this.name = 'NetworkError';
  }
}

export class ServerError extends Error {
  readonly retryable = true as const;
  constructor(
    readonly status: number,
    message = `Server error ${status}`,
  ) {
    super(message);
    this.name = 'ServerError';
  }
}

export class TimeoutError extends Error {
  readonly retryable = true as const;
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class NotImplementedError extends Error {
  readonly retryable = false as const;
  constructor(message = 'Not implemented') {
    super(message);
    this.name = 'NotImplementedError';
  }
}

export type ApiError = NetworkError | ServerError | TimeoutError | NotImplementedError;

export function isRetryable(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { retryable?: unknown }).retryable === true;
}
