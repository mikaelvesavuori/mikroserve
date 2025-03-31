import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { RateLimiter } from '../../src/RateLimiter.js';

describe('RateLimiter', () => {
  // Keep track of limiter instance for tests
  let limiter: RateLimiter;

  beforeEach(() => {
    // Use vi.useFakeTimers() to control time in our tests
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Clean up any created instance
    vi.restoreAllMocks();
    vi.clearAllTimers();
  });

  describe('Initialization', () => {
    test('should initialize with default values', () => {
      limiter = new RateLimiter();
      expect(limiter.getLimit()).toBe(100);
    });

    test('should initialize with custom values', () => {
      limiter = new RateLimiter(50, 30);
      expect(limiter.getLimit()).toBe(50);
    });

    test('should set up cleanup interval', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      limiter = new RateLimiter(100, 60);

      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60000);
    });
  });

  describe('Rate Limiting', () => {
    test('should allow requests under the limit', () => {
      limiter = new RateLimiter(5, 60);
      const ip = '192.168.1.1';

      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed(ip)).toBe(true);
      }
    });

    test('should block requests over the limit', () => {
      limiter = new RateLimiter(5, 60);
      const ip = '192.168.1.1';

      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed(ip)).toBe(true);
      }

      // This should exceed the limit
      expect(limiter.isAllowed(ip)).toBe(false);
    });

    test('should track different IPs separately', () => {
      limiter = new RateLimiter(3, 60);
      const ip1 = '192.168.1.1';
      const ip2 = '192.168.1.2';

      // Use up limit for first IP
      for (let i = 0; i < 3; i++) {
        expect(limiter.isAllowed(ip1)).toBe(true);
      }
      expect(limiter.isAllowed(ip1)).toBe(false);
      expect(limiter.getRemainingRequests(ip1)).toBe(0);

      // Second IP should still be allowed
      for (let i = 0; i < 3; i++) {
        expect(limiter.isAllowed(ip2)).toBe(true);
      }
      expect(limiter.isAllowed(ip2)).toBe(false);
      expect(limiter.getRemainingRequests(ip2)).toBe(0);
    });

    test('should handle undefined or empty IPs', () => {
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
    test('should reset after time window expires', () => {
      limiter = new RateLimiter(5, 60);
      const ip = '192.168.1.1';

      // Use up the limit
      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed(ip)).toBe(true);
      }
      expect(limiter.isAllowed(ip)).toBe(false);

      // Advance time past the window
      vi.advanceTimersByTime(61 * 1000);

      // Should be allowed again
      expect(limiter.isAllowed(ip)).toBe(true);
    });

    test('should respect custom time windows', () => {
      limiter = new RateLimiter(5, 30);
      const ip = '192.168.1.1';

      // Use up the limit
      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed(ip)).toBe(true);
      }
      expect(limiter.isAllowed(ip)).toBe(false);

      // Advance time by 20 seconds (still within window)
      vi.advanceTimersByTime(20 * 1000);
      expect(limiter.isAllowed(ip)).toBe(false);

      // Advance time to just past the window
      vi.advanceTimersByTime(11 * 1000);
      expect(limiter.isAllowed(ip)).toBe(true);
    });
  });

  describe('Cleanup', () => {
    test('should clean up expired entries', () => {
      limiter = new RateLimiter(5, 60);
      const ip1 = '192.168.1.1';
      const ip2 = '192.168.1.2';

      // Create entries for two IPs
      limiter.isAllowed(ip1);
      limiter.isAllowed(ip2);

      // Mock the private requests Map to spy on its methods
      const deleteSpyMap = new Map();
      const deleteSpy = vi.spyOn(deleteSpyMap, 'delete');
      // @ts-ignore - accessing private property for testing
      limiter.requests = deleteSpyMap;

      // Set entries that look like they would in the actual implementation
      const now = Date.now();
      deleteSpyMap.set(ip1, { count: 1, resetTime: now - 1000 }); // expired
      deleteSpyMap.set(ip2, { count: 1, resetTime: now + 50000 }); // not expired

      // Trigger cleanup manually
      // @ts-ignore - calling private method for testing
      limiter.cleanup();

      expect(deleteSpy).toHaveBeenCalledTimes(1);
      expect(deleteSpy).toHaveBeenCalledWith(ip1);
    });

    test('should automatically clean up expired entries', () => {
      // Create a limiter with a short window for testing
      limiter = new RateLimiter(5, 5); // 5 second window
      const ip = '192.168.1.1';

      // Make some requests
      limiter.isAllowed(ip);
      limiter.isAllowed(ip);

      // Spy on the cleanup method
      // @ts-ignore - accessing private method for testing
      const cleanupSpy = vi.spyOn(limiter, 'cleanup');

      // Advance time to trigger cleanup
      vi.advanceTimersByTime(5 * 1000);

      expect(cleanupSpy).toHaveBeenCalled();
    });
  });

  describe('Remaining Requests', () => {
    test('should report correct remaining requests', () => {
      limiter = new RateLimiter(5, 60);
      const ip = '192.168.1.1';

      expect(limiter.getRemainingRequests(ip)).toBe(5);

      limiter.isAllowed(ip); // use 1 request
      expect(limiter.getRemainingRequests(ip)).toBe(4);

      limiter.isAllowed(ip); // use another request
      expect(limiter.getRemainingRequests(ip)).toBe(3);

      // Use remaining requests
      limiter.isAllowed(ip);
      limiter.isAllowed(ip);
      limiter.isAllowed(ip);

      expect(limiter.getRemainingRequests(ip)).toBe(0);
    });

    test('should reset remaining requests after window expires', () => {
      limiter = new RateLimiter(5, 60);
      const ip = '192.168.1.1';

      limiter.isAllowed(ip);
      limiter.isAllowed(ip);
      expect(limiter.getRemainingRequests(ip)).toBe(3);

      // Advance time past the window
      vi.advanceTimersByTime(61 * 1000);

      expect(limiter.getRemainingRequests(ip)).toBe(5);
    });

    test('should return full limit for new IPs', () => {
      limiter = new RateLimiter(5, 60);
      expect(limiter.getRemainingRequests('new-ip')).toBe(5);
    });
  });

  describe('Reset Time', () => {
    test('should report correct reset time', () => {
      limiter = new RateLimiter(5, 60);
      const ip = '192.168.1.1';

      // Set a fixed timestamp for testing
      const now = 1609459200000; // 2021-01-01T00:00:00.000Z
      vi.setSystemTime(now);

      limiter.isAllowed(ip); // This creates the entry and sets the reset time

      // The reset time should be the current time + window in seconds
      const expectedResetTime = Math.floor((now + 60000) / 1000);
      expect(limiter.getResetTime(ip)).toBe(expectedResetTime);
    });

    test('should return future reset time for new IPs', () => {
      limiter = new RateLimiter(5, 60);

      // Set a fixed timestamp for testing
      const now = 1609459200000; // 2021-01-01T00:00:00.000Z
      vi.setSystemTime(now);

      const expectedResetTime = Math.floor((now + 60000) / 1000);
      expect(limiter.getResetTime('new-ip')).toBe(expectedResetTime);
    });

    test('should update reset time after window expires', () => {
      limiter = new RateLimiter(5, 60);
      const ip = '192.168.1.1';

      // Set a fixed timestamp for testing
      const now = 1609459200000; // 2021-01-01T00:00:00.000Z
      vi.setSystemTime(now);

      limiter.isAllowed(ip); // This creates the entry and sets the reset time
      const initialResetTime = limiter.getResetTime(ip);

      // Advance time past the window
      vi.advanceTimersByTime(61 * 1000);
      const newNow = now + 61000;

      // The next request should create a new window with a new reset time
      limiter.isAllowed(ip);
      const newResetTime = limiter.getResetTime(ip);

      expect(newResetTime).not.toBe(initialResetTime);
      expect(newResetTime).toBe(Math.floor((newNow + 60000) / 1000));
    });

    test('should calculate approximate reset time correctly', () => {
      // From the second test file, using real-world timing
      vi.useRealTimers(); // Temporarily use real timers for this test

      limiter = new RateLimiter(5, 10);
      const ip = '192.168.1.5';

      limiter.isAllowed(ip);

      const resetTime = limiter.getResetTime(ip);
      const approximateExpectedTime = Math.floor((Date.now() + 10000) / 1000);

      expect(resetTime).toBeGreaterThanOrEqual(approximateExpectedTime - 2);
      expect(resetTime).toBeLessThanOrEqual(approximateExpectedTime + 2);

      vi.useFakeTimers(); // Switch back to fake timers for other tests
    });
  });

  describe('Edge Cases', () => {
    test('should handle high traffic scenarios', () => {
      // Fixed test to properly use up the limit for each IP
      limiter = new RateLimiter(10, 1);
      const ips = Array.from({ length: 100 }, (_, i) => `192.168.1.${i}`);

      // Make 10 requests for each IP to exhaust their limits
      for (const ip of ips) {
        for (let i = 0; i < 10; i++) {
          limiter.isAllowed(ip);
        }
      }

      // Check that limits are properly enforced
      for (const ip of ips) {
        expect(limiter.getRemainingRequests(ip)).toBe(0);
        expect(limiter.isAllowed(ip)).toBe(false);
      }
    });

    test('should handle very short time windows', () => {
      limiter = new RateLimiter(5, 1); // 1 second window
      const ip = '192.168.1.1';

      // Use up some requests
      limiter.isAllowed(ip);
      limiter.isAllowed(ip);
      expect(limiter.getRemainingRequests(ip)).toBe(3);

      // Advance time by just over a second
      vi.advanceTimersByTime(1001);

      expect(limiter.getRemainingRequests(ip)).toBe(5);
    });

    test('should handle very large time windows', () => {
      const oneDay = 24 * 60 * 60;
      limiter = new RateLimiter(5, oneDay); // 1 day window
      const ip = '192.168.1.1';

      // Use up some requests
      limiter.isAllowed(ip);
      limiter.isAllowed(ip);

      // Verify we have 3 remaining requests
      expect(limiter.getRemainingRequests(ip)).toBe(3);

      // Advance time by just over one day
      vi.advanceTimersByTime(oneDay * 1000 + 1000);

      // Here's the key: The RateLimiter implementation checks if entry.resetTime < now
      // but doesn't actually modify the map until a new request comes in or cleanup runs

      // After time window expires, getRemainingRequests should check expiry and return the full limit
      expect(limiter.getRemainingRequests(ip)).toBe(5);

      // Making a new request after expiry should create a fresh entry
      expect(limiter.isAllowed(ip)).toBe(true);

      // And we should have limit-1 remaining requests
      expect(limiter.getRemainingRequests(ip)).toBe(4);
    });

    test('should allow requests again after real window expiry', async () => {
      vi.useRealTimers(); // Use real timers for this test

      const rateLimiter = new RateLimiter(10, 0.1); // 100ms window
      const ip = '192.168.1.6';

      for (let i = 0; i < 10; i++) {
        rateLimiter.isAllowed(ip);
      }

      expect(rateLimiter.isAllowed(ip)).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(rateLimiter.isAllowed(ip)).toBe(true);

      vi.useFakeTimers(); // Switch back to fake timers
    });

    test('should handle high traffic from multiple IPs without hitting limits', () => {
      limiter = new RateLimiter(10, 60);

      // Make one request from many different IPs
      for (let i = 0; i < 100; i++) {
        expect(limiter.isAllowed(`192.168.${i}.1`)).toBe(true);
        expect(limiter.getRemainingRequests(`192.168.${i}.1`)).toBe(9);
      }
    });
  });
});
