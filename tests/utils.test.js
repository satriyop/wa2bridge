/**
 * Utility Tests
 *
 * Tests for TimerRegistry and LRUMap utilities.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TimerRegistry } from '../src/utils/timer-registry.js';
import { LRUMap } from '../src/utils/lru-map.js';

// =============================================================================
// TIMER REGISTRY TESTS
// =============================================================================

describe('TimerRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new TimerRegistry('TestComponent');
    vi.useFakeTimers();
  });

  afterEach(() => {
    registry.clearAll();
    vi.useRealTimers();
  });

  describe('setTimeout', () => {
    it('should execute callback after delay', () => {
      const callback = vi.fn();
      registry.setTimeout(callback, 1000);

      expect(callback).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledOnce();
    });

    it('should pass arguments to callback', () => {
      const callback = vi.fn();
      registry.setTimeout(callback, 100, 'arg1', 'arg2');

      vi.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should auto-remove from tracking after execution', () => {
      registry.setTimeout(() => {}, 100);
      expect(registry.size).toBe(1);

      vi.advanceTimersByTime(100);
      expect(registry.size).toBe(0);
    });

    it('should return unique IDs', () => {
      const id1 = registry.setTimeout(() => {}, 100);
      const id2 = registry.setTimeout(() => {}, 100);

      expect(id1).not.toBe(id2);
    });
  });

  describe('setInterval', () => {
    it('should execute callback repeatedly', () => {
      const callback = vi.fn();
      registry.setInterval(callback, 100);

      vi.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('should stay in tracking until cleared', () => {
      registry.setInterval(() => {}, 100);
      expect(registry.size).toBe(1);

      vi.advanceTimersByTime(500);
      expect(registry.size).toBe(1); // Still tracked
    });
  });

  describe('clearTimeout', () => {
    it('should prevent callback execution', () => {
      const callback = vi.fn();
      const id = registry.setTimeout(callback, 100);

      registry.clearTimeout(id);
      vi.advanceTimersByTime(200);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should return true when timer found', () => {
      const id = registry.setTimeout(() => {}, 100);
      expect(registry.clearTimeout(id)).toBe(true);
    });

    it('should return false for invalid ID', () => {
      expect(registry.clearTimeout(999)).toBe(false);
    });
  });

  describe('clearInterval', () => {
    it('should stop interval execution', () => {
      const callback = vi.fn();
      const id = registry.setInterval(callback, 100);

      vi.advanceTimersByTime(250);
      expect(callback).toHaveBeenCalledTimes(2);

      registry.clearInterval(id);
      vi.advanceTimersByTime(200);
      expect(callback).toHaveBeenCalledTimes(2); // No more calls
    });

    it('should return true when interval found', () => {
      const id = registry.setInterval(() => {}, 100);
      expect(registry.clearInterval(id)).toBe(true);
    });
  });

  describe('clearAll', () => {
    it('should clear all timers', () => {
      registry.setTimeout(() => {}, 100);
      registry.setTimeout(() => {}, 200);
      registry.setInterval(() => {}, 50);

      expect(registry.size).toBe(3);

      const count = registry.clearAll();

      expect(count).toBe(3);
      expect(registry.size).toBe(0);
    });

    it('should prevent all callbacks from executing', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      registry.setTimeout(callback1, 100);
      registry.setTimeout(callback2, 200);
      registry.setInterval(callback3, 50);

      registry.clearAll();
      vi.advanceTimersByTime(500);

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
      expect(callback3).not.toHaveBeenCalled();
    });
  });

  describe('getActiveTimers', () => {
    it('should return timer info', () => {
      registry.setTimeout(() => {}, 100);
      registry.setInterval(() => {}, 200);

      const timers = registry.getActiveTimers();

      expect(timers).toHaveLength(2);
      expect(timers[0]).toHaveProperty('id');
      expect(timers[0]).toHaveProperty('type');
      expect(timers[0]).toHaveProperty('delay');
      expect(timers[0]).toHaveProperty('age');
    });
  });

  describe('hasActiveTimers', () => {
    it('should return false when empty', () => {
      expect(registry.hasActiveTimers()).toBe(false);
    });

    it('should return true when timers exist', () => {
      registry.setTimeout(() => {}, 100);
      expect(registry.hasActiveTimers()).toBe(true);
    });
  });
});

// =============================================================================
// LRU MAP TESTS
// =============================================================================

describe('LRUMap', () => {
  describe('basic operations', () => {
    it('should set and get values', () => {
      const map = new LRUMap();
      map.set('key1', 'value1');

      expect(map.get('key1')).toBe('value1');
    });

    it('should return undefined for missing keys', () => {
      const map = new LRUMap();
      expect(map.get('nonexistent')).toBeUndefined();
    });

    it('should check key existence with has()', () => {
      const map = new LRUMap();
      map.set('key1', 'value1');

      expect(map.has('key1')).toBe(true);
      expect(map.has('key2')).toBe(false);
    });

    it('should delete keys', () => {
      const map = new LRUMap();
      map.set('key1', 'value1');

      expect(map.delete('key1')).toBe(true);
      expect(map.has('key1')).toBe(false);
    });

    it('should clear all entries', () => {
      const map = new LRUMap();
      map.set('key1', 'value1');
      map.set('key2', 'value2');

      map.clear();
      expect(map.size).toBe(0);
    });

    it('should track size', () => {
      const map = new LRUMap();
      expect(map.size).toBe(0);

      map.set('key1', 'value1');
      expect(map.size).toBe(1);

      map.set('key2', 'value2');
      expect(map.size).toBe(2);
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entry when at capacity', () => {
      const map = new LRUMap(3);
      map.set('a', 1);
      map.set('b', 2);
      map.set('c', 3);

      expect(map.size).toBe(3);
      expect(map.has('a')).toBe(true);

      map.set('d', 4); // Should evict 'a'

      expect(map.size).toBe(3);
      expect(map.has('a')).toBe(false);
      expect(map.has('d')).toBe(true);
    });

    it('should update LRU position on get()', () => {
      const map = new LRUMap(3);
      map.set('a', 1);
      map.set('b', 2);
      map.set('c', 3);

      map.get('a'); // Move 'a' to most recent

      map.set('d', 4); // Should evict 'b' (now oldest)

      expect(map.has('a')).toBe(true); // 'a' was accessed, not evicted
      expect(map.has('b')).toBe(false); // 'b' evicted
    });

    it('should update LRU position on set() of existing key', () => {
      const map = new LRUMap(3);
      map.set('a', 1);
      map.set('b', 2);
      map.set('c', 3);

      map.set('a', 10); // Update 'a', moves to most recent

      map.set('d', 4); // Should evict 'b' (now oldest)

      expect(map.get('a')).toBe(10);
      expect(map.has('b')).toBe(false);
    });

    it('should not update LRU position on has()', () => {
      const map = new LRUMap(3);
      map.set('a', 1);
      map.set('b', 2);
      map.set('c', 3);

      map.has('a'); // Check without moving

      map.set('d', 4); // Should still evict 'a'

      expect(map.has('a')).toBe(false);
    });
  });

  describe('iteration', () => {
    it('should iterate with for...of', () => {
      const map = new LRUMap();
      map.set('a', 1);
      map.set('b', 2);

      const entries = [];
      for (const [key, value] of map) {
        entries.push([key, value]);
      }

      expect(entries).toEqual([['a', 1], ['b', 2]]);
    });

    it('should support forEach', () => {
      const map = new LRUMap();
      map.set('a', 1);
      map.set('b', 2);

      const keys = [];
      map.forEach((value, key) => keys.push(key));

      expect(keys).toEqual(['a', 'b']);
    });

    it('should iterate keys', () => {
      const map = new LRUMap();
      map.set('a', 1);
      map.set('b', 2);

      expect([...map.keys()]).toEqual(['a', 'b']);
    });

    it('should iterate values', () => {
      const map = new LRUMap();
      map.set('a', 1);
      map.set('b', 2);

      expect([...map.values()]).toEqual([1, 2]);
    });
  });

  describe('utility methods', () => {
    it('should peek without updating LRU', () => {
      const map = new LRUMap(3);
      map.set('a', 1);
      map.set('b', 2);
      map.set('c', 3);

      expect(map.peek('a')).toBe(1);

      map.set('d', 4); // Should evict 'a' (peek doesn't update LRU)

      expect(map.has('a')).toBe(false);
    });

    it('should get oldest key', () => {
      const map = new LRUMap();
      map.set('a', 1);
      map.set('b', 2);
      map.set('c', 3);

      expect(map.getOldestKey()).toBe('a');
    });

    it('should get newest key', () => {
      const map = new LRUMap();
      map.set('a', 1);
      map.set('b', 2);
      map.set('c', 3);

      expect(map.getNewestKey()).toBe('c');
    });

    it('should return undefined for oldest/newest on empty map', () => {
      const map = new LRUMap();
      expect(map.getOldestKey()).toBeUndefined();
      expect(map.getNewestKey()).toBeUndefined();
    });
  });

  describe('chaining', () => {
    it('should support method chaining on set()', () => {
      const map = new LRUMap();

      map.set('a', 1).set('b', 2).set('c', 3);

      expect(map.size).toBe(3);
    });
  });
});
