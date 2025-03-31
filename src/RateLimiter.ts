/**
 * @description Simple in-memory rate limiter.
 */
export class RateLimiter {
  private requests: Map<string, { count: number; resetTime: number }> = new Map();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit = 100, windowSeconds = 60) {
    this.limit = limit;
    this.windowMs = windowSeconds * 1000;

    setInterval(() => this.cleanup(), this.windowMs);
  }

  public getLimit(): number {
    return this.limit;
  }

  public isAllowed(ip: string): boolean {
    const now = Date.now();
    const key = ip || 'unknown';

    let entry = this.requests.get(key);
    if (!entry || entry.resetTime < now) {
      entry = { count: 0, resetTime: now + this.windowMs };
      this.requests.set(key, entry);
    }

    entry.count++;
    return entry.count <= this.limit;
  }

  public getRemainingRequests(ip: string): number {
    const now = Date.now();
    const key = ip || 'unknown';

    const entry = this.requests.get(key);
    if (!entry || entry.resetTime < now) return this.limit;

    return Math.max(0, this.limit - entry.count);
  }

  public getResetTime(ip: string): number {
    const now = Date.now();
    const key = ip || 'unknown';

    const entry = this.requests.get(key);
    if (!entry || entry.resetTime < now) return Math.floor((now + this.windowMs) / 1000);

    return Math.floor(entry.resetTime / 1000);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.requests.entries()) {
      if (entry.resetTime < now) this.requests.delete(key);
    }
  }
}
