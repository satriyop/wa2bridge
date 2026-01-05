/**
 * LRU Map
 *
 * Map with automatic size limits using LRU (Least Recently Used) eviction.
 * When the map reaches maxSize, the oldest entry is automatically removed.
 * Drop-in replacement for native Map.
 */

/**
 * Map with LRU eviction policy.
 *
 * @example
 * ```javascript
 * const cache = new LRUMap(100); // Max 100 entries
 * cache.set('key1', 'value1');
 * cache.get('key1'); // Moves to "most recently used"
 * // When 101st entry is added, oldest is evicted
 * ```
 */
export class LRUMap {
  /**
   * @param {number} [maxSize=1000] - Maximum entries before eviction
   */
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.map = new Map();
  }

  /**
   * Set key-value pair, auto-evicting oldest if at capacity
   * @param {*} key - Key
   * @param {*} value - Value
   * @returns {LRUMap} this (for chaining)
   */
  set(key, value) {
    // If key exists, delete first to update position
    if (this.map.has(key)) {
      this.map.delete(key);
    }

    // Add new entry at end (most recent)
    this.map.set(key, value);

    // Evict oldest if over capacity
    if (this.map.size > this.maxSize) {
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }

    return this;
  }

  /**
   * Get value and mark as recently used
   * @param {*} key - Key to get
   * @returns {*} Value or undefined
   */
  get(key) {
    if (!this.map.has(key)) {
      return undefined;
    }

    // Move to end (most recently used)
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);

    return value;
  }

  /**
   * Check if key exists (without updating LRU position)
   * @param {*} key - Key to check
   * @returns {boolean}
   */
  has(key) {
    return this.map.has(key);
  }

  /**
   * Delete key
   * @param {*} key - Key to delete
   * @returns {boolean} True if key existed
   */
  delete(key) {
    return this.map.delete(key);
  }

  /**
   * Clear all entries
   */
  clear() {
    this.map.clear();
  }

  /**
   * Get current size
   * @returns {number}
   */
  get size() {
    return this.map.size;
  }

  /**
   * Get all keys iterator
   * @returns {IterableIterator}
   */
  keys() {
    return this.map.keys();
  }

  /**
   * Get all values iterator
   * @returns {IterableIterator}
   */
  values() {
    return this.map.values();
  }

  /**
   * Get all entries iterator
   * @returns {IterableIterator}
   */
  entries() {
    return this.map.entries();
  }

  /**
   * Iterator support (for...of)
   * @returns {IterableIterator}
   */
  [Symbol.iterator]() {
    return this.map[Symbol.iterator]();
  }

  /**
   * forEach support
   * @param {Function} callback - Callback function
   * @param {*} [thisArg] - Value to use as this
   */
  forEach(callback, thisArg) {
    this.map.forEach(callback, thisArg);
  }

  /**
   * Peek at value without updating LRU position
   * @param {*} key - Key to peek
   * @returns {*} Value or undefined
   */
  peek(key) {
    return this.map.get(key);
  }

  /**
   * Get the oldest key (next to be evicted)
   * @returns {*} Oldest key or undefined if empty
   */
  getOldestKey() {
    if (this.map.size === 0) return undefined;
    return this.map.keys().next().value;
  }

  /**
   * Get the newest key (most recently used)
   * @returns {*} Newest key or undefined if empty
   */
  getNewestKey() {
    if (this.map.size === 0) return undefined;
    let lastKey;
    for (const key of this.map.keys()) {
      lastKey = key;
    }
    return lastKey;
  }
}

export default LRUMap;
