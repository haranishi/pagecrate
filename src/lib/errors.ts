export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
    this.name = "AppError";
  }
}
export function publicError(error: unknown): AppError {
  return error instanceof AppError ? error : new AppError("FETCH_FAILED", "取得できませんでした。公開ページか確認して、時間をおいて再試行してください。", 502);
}

/** Text that could name a URL, a host or an address. Such a sentence is never shown or written, whatever produced it. */
const LOOKS_LIKE_LOCATION = /:\/\/|@|[a-z0-9-]+\.[a-z]{2,}|\d+\.\d+\.\d+|\[[0-9a-f:]+\]/i;
export function locationFreeMessage(message: string): string | undefined {
  return LOOKS_LIKE_LOCATION.test(message) ? undefined : message;
}
