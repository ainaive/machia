export class HttpError extends Error {
  readonly status: 400 | 401 | 403 | 404 | 409 | 500;

  constructor(status: 400 | 401 | 403 | 404 | 409 | 500, message: string) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

export function isBusyError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("already running");
}
