import { AppError } from "./errors";
export class ByteBudget {
  used = 0;
  constructor(public readonly limit: number) {}
  get remaining() { return Math.max(0, this.limit - this.used); }
  consume = (bytes: number) => {
    if (bytes > this.remaining) { this.used = this.limit; throw new AppError("SCAN_LIMIT", "解析で受け取れるデータ量の上限に達しました。", 413); }
    this.used += bytes;
  };
}
