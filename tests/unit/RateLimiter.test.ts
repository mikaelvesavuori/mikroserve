import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { RateLimiter } from '../../src/RateLimiter.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
  });

  describe('Initialization', () => {
    test('It should initialize with default values', () => {
      limiter = new RateLimiter();
      expect(limiter.getLimit()).toBe(100);
    });

    test('It should initialize with custom values', () => {
      limiter = new RateLimiter(50, 30);
      expect(limiter.getLimit()).toBe(50);
    });

    test('It should set up cleanup interval', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      limiter = new RateLimiter(100, 60);

      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60000);
    });
  });

  describe('Rate Limiting', () => {
    test('It should allow requests under the limit', () => {
      limiter = new RateLimiter(5, 60);
      const ip = '192.168.1.1';

      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed(ip)).toBe(true);
      }
    });

    test('It should block requests over the limit', () => {
      limiter = new RateLimiter(5, 60);
      const ip = '192.168.1.1';

      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed(ip)).toBe(true);
      }

      expect(limiter.isAllowed(ip)).toBe(false);
    });

    test('It should track different IPs separately', () => {
      limiter = new RateLimiter(3, 60);
      const ip1 = '192.168.1.1';
      const ip2 = '192.168.1.2';

      for (let i = 0; i < 3; i++) {
        expect(limiter.isAllowed(ip1)).toBe(true);
      }
      expect(limiter.isAllowed(ip1)).toBe(false);
      expect(limiter.getRemainingRequests(ip1)).toBe(0);

      for (let i = 0; i < 3; i++) {
        expect(limiter.isAllowed(ip2)).toBe(true);
      }
      expect(limiter.isAllowed(ip2)).toBe(false);
      expect(limiter.getRemainingRequests(ip2)).toBe(0);
    });

    test('It should handle undefined or empty IPs', () => {
      limiter = new RateLimiter(3, 60);

      for (let i = 0; i < 3; i++) {
        expect(limiter.isAllowed('')).toBe(true);
      }
      expect(limiter.isAllowed('')).toBe(false);
      expect(limiter.getRemainingRequests('')).toBe(0);

      limiter = new RateLimiter(3, 60);
      for (let i = 0; i < 3; i++) {
        expect(limiter.isAllowed(undefined as unknown as string)).toBe(true);
      }
      expect(limiter.isAllowed(undefined as unknown as string)).toBe(false);
      expect(limiter.getRemainingRequests(undefined as unknown as string)).toBe(0);
    });
  });

  describe('Time Window', () => {
    test('It should reset after time window expires', () => {
      limiter = new RateLimiter(5, 60);
      const ip = '192.168.1.1';

      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed(ip)).toBe(true);
      }
      expect(limiter.isAllowed(ip)).toBe(false);

      vi.advanceTimersByTime(61 * 1000);

      expect(limiter.isAllowed(ip)).toBe(true);
    });

    test('It should respect custom time windows', () => {
      limiter = new RateLimiter(5, 30);
      const ip = '192.168.1.1';

      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed(ip)).toBe(true);
      }
      expect(limiter.isAllowed(ip)).toBe(false);

      vi.advanceTimersByTime(20 * 1000);
      expect(limiter.isAllowed(ip)).toBe(false);

      vi.advanceTimersByTime(11 * 1000);
      expect(limiter.isAllowed(ip)).toBe(true);
    });
  });

  describe('Cleanup', () => {
    test('It should clean up expired entries', () => {
      limiter = new RateLimiter(5, 60);
      const ip1 = '192.168.1.1';
      const ip2 = '192.168.1.2';

      limiter.isAllowed(ip1);
      limiter.isAllowed(ip2);

      const deleteSpyMap = new Map();
      const deleteSpy = vi.spyOn(deleteSpyMap, 'delete');
      // @ts-ignore - accessing private property for testing
      limiter.requests = deleteSpyMap;

      const now = Date.now();
      deleteSpyMap.set(ip1, { count: 1, resetTime: now - 1000 }); // expired
      deleteSpyMap.set(ip2, { count: 1, resetTime: now + 50000 }); // not expired

      // @ts-ignore - calling private method for testing
      limiter.cleanup();

      expect(deleteSpy).toHaveBeenCalledTimes(1);
      expect(deleteSpy).toHaveBeenCalledWith(ip1);
    });

    test('It should automatically clean up expired entries', () => {
      limiter = new RateLimiter(5, 5); // 5 second window
      const ip = '192.168.1.1';

      limiter.isAllowed(ip);
      limiter.isAllowed(ip);

      // @ts-ignore - accessing private method for testing
      const cleanupSpy = vi.spyOn(limiter, 'cleanup');

      vi.advanceTimersByTime(5 * 1000);

      expect(cleanupSpy).toHaveBeenCalled();
    });
  });

  describe('Remaining Requests', () => {
    test('It should report correct remaining requests', () => {
      limiter = new RateLimiter(5, 60);
      const ip = '192.168.1.1';

      expect(limiter.getRemainingRequests(ip)).toBe(5);

      limiter.isAllowed(ip);
      expect(limiter.getRemainingRequests(ip)).toBe(4);

      limiter.isAllowed(ip);
      expect(limiter.getRemainingRequests(ip)).toBe(3);

      limiter.isAllowed(ip);
      limiter.isAllowed(ip);
      limiter.isAllowed(ip);

      expect(limiter.getRemainingRequests(ip)).toBe(0);
    });

    test('It should reset remaining requests after window expires', () => {
      limiter = new RateLimiter(5, 60);
      const ip = '192.168.1.1';

      limiter.isAllowed(ip);
      limiter.isAllowed(ip);
      expect(limiter.getRemainingRequests(ip)).toBe(3);

      vi.advanceTimersByTime(61 * 1000);

      expect(limiter.getRemainingRequests(ip)).toBe(5);
    });

    test('It should return full limit for new IPs', () => {
      limiter = new RateLimiter(5, 60);
      expect(limiter.getRemainingRequests('new-ip')).toBe(5);
    });
  });

  describe('Reset Time', () => {
    test('It should report correct reset time', () => {
      limiter = new RateLimiter(5, 60);
      const ip = '192.168.1.1';

      const now = 1609459200000; // 2021-01-01T00:00:00.000Z
      vi.setSystemTime(now);

      limiter.isAllowed(ip);

      const expectedResetTime = Math.floor((now + 60000) / 1000);
      expect(limiter.getResetTime(ip)).toBe(expectedResetTime);
    });

    test('It should return future reset time for new IPs', () => {
      limiter = new RateLimiter(5, 60);

      const now = 1609459200000; // 2021-01-01T00:00:00.000Z
      vi.setSystemTime(now);

      const expectedResetTime = Math.floor((now + 60000) / 1000);
      expect(limiter.getResetTime('new-ip')).toBe(expectedResetTime);
    });

    test('It should update reset time after window expires', () => {
      limiter = new RateLimiter(5, 60);
      const ip = '192.168.1.1';

      const now = 1609459200000; // 2021-01-01T00:00:00.000Z
      vi.setSystemTime(now);

      limiter.isAllowed(ip); // This creates the entry and sets the reset time
      const initialResetTime = limiter.getResetTime(ip);

      vi.advanceTimersByTime(61 * 1000);
      const newNow = now + 61000;

      limiter.isAllowed(ip);
      const newResetTime = limiter.getResetTime(ip);

      expect(newResetTime).not.toBe(initialResetTime);
      expect(newResetTime).toBe(Math.floor((newNow + 60000) / 1000));
    });

    test('It should calculate approximate reset time correctly', () => {
      vi.useRealTimers();

      limiter = new RateLimiter(5, 10);
      const ip = '192.168.1.5';

      limiter.isAllowed(ip);

      const resetTime = limiter.getResetTime(ip);
      const approximateExpectedTime = Math.floor((Date.now() + 10000) / 1000);

      expect(resetTime).toBeGreaterThanOrEqual(approximateExpectedTime - 2);
      expect(resetTime).toBeLessThanOrEqual(approximateExpectedTime + 2);

      vi.useFakeTimers();
    });
  });

  describe('Edge Cases', () => {
    test('It should handle high traffic scenarios', () => {
      limiter = new RateLimiter(10, 1);
      const ips = Array.from({ length: 100 }, (_, i) => `192.168.1.${i}`);

      for (const ip of ips) {
        for (let i = 0; i < 10; i++) {
          limiter.isAllowed(ip);
        }
      }

      for (const ip of ips) {
        expect(limiter.getRemainingRequests(ip)).toBe(0);
        expect(limiter.isAllowed(ip)).toBe(false);
      }
    });

    test('It should handle very short time windows', () => {
      limiter = new RateLimiter(5, 1); // 1 second window
      const ip = '192.168.1.1';

      limiter.isAllowed(ip);
      limiter.isAllowed(ip);
      expect(limiter.getRemainingRequests(ip)).toBe(3);

      vi.advanceTimersByTime(1001);

      expect(limiter.getRemainingRequests(ip)).toBe(5);
    });

    test('It should handle very large time windows', () => {
      const oneDay = 24 * 60 * 60;
      limiter = new RateLimiter(5, oneDay); // 1 day window
      const ip = '192.168.1.1';

      limiter.isAllowed(ip);
      limiter.isAllowed(ip);

      expect(limiter.getRemainingRequests(ip)).toBe(3);

      vi.advanceTimersByTime(oneDay * 1000 + 1000);

      expect(limiter.getRemainingRequests(ip)).toBe(5);

      expect(limiter.isAllowed(ip)).toBe(true);

      expect(limiter.getRemainingRequests(ip)).toBe(4);
    });

    test('It should allow requests again after real window expiry', async () => {
      vi.useRealTimers(); // Use real timers for this test

      const rateLimiter = new RateLimiter(10, 0.1); // 100ms window
      const ip = '192.168.1.6';

      for (let i = 0; i < 10; i++) {
        rateLimiter.isAllowed(ip);
      }

      expect(rateLimiter.isAllowed(ip)).toBe(false);

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(rateLimiter.isAllowed(ip)).toBe(true);

      vi.useFakeTimers(); // Switch back to fake timers
    });

    test('It should handle high traffic from multiple IPs without hitting limits', () => {
      limiter = new RateLimiter(10, 60);

      for (let i = 0; i < 100; i++) {
        expect(limiter.isAllowed(`192.168.${i}.1`)).toBe(true);
        expect(limiter.getRemainingRequests(`192.168.${i}.1`)).toBe(9);
      }
    });
  });
});
