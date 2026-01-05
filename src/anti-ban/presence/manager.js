/**
 * Presence Manager
 *
 * Manages online/offline presence to simulate human behavior.
 * Humans don't stay online 24/7.
 */

import { PersistenceBase } from '../shared/persistence.js';
import { humanDelay } from '../core/timing.js';
import { TimerRegistry } from '../../utils/timer-registry.js';

/**
 * Simulates human presence patterns with active hours
 */
export class PresenceManager extends PersistenceBase {
  constructor(options = {}) {
    super(options.sessionsDir, '.presence-state.json');

    this.socket = null;
    this.isOnline = false;
    this.lastPresenceChange = Date.now();

    // Active hours (24-hour format)
    this.activeHoursStart = options.activeHoursStart ?? 7;  // 7 AM
    this.activeHoursEnd = options.activeHoursEnd ?? 23;     // 11 PM

    // Presence timing (in milliseconds)
    this.minOnlineDuration = options.minOnlineDuration || 5 * 60 * 1000;     // 5 min minimum online
    this.maxOnlineDuration = options.maxOnlineDuration || 45 * 60 * 1000;    // 45 min max online
    this.minOfflineDuration = options.minOfflineDuration || 2 * 60 * 1000;   // 2 min minimum offline
    this.maxOfflineDuration = options.maxOfflineDuration || 15 * 60 * 1000;  // 15 min max offline

    // Timer management (prevents leaks on disconnect)
    this.timers = new TimerRegistry('PresenceManager');

    this.loadState();
  }

  /**
   * Initialize with socket connection
   */
  setSocket(socket) {
    this.socket = socket;
  }

  /**
   * Check if current time is within active hours
   */
  isWithinActiveHours() {
    const hour = new Date().getHours();
    if (this.activeHoursStart < this.activeHoursEnd) {
      return hour >= this.activeHoursStart && hour < this.activeHoursEnd;
    }
    // Handle overnight active hours (e.g., 22 to 6)
    return hour >= this.activeHoursStart || hour < this.activeHoursEnd;
  }

  /**
   * Get a human-like duration for online/offline periods
   */
  getRandomDuration(min, max) {
    return Math.floor(min + Math.random() * (max - min));
  }

  /**
   * Go online with presence update
   */
  async goOnline() {
    if (!this.socket || this.isOnline) return;

    try {
      await this.socket.sendPresenceUpdate('available');
      this.isOnline = true;
      this.lastPresenceChange = Date.now();
      console.log('[Presence] Now ONLINE');
      this.saveState();
    } catch (err) {
      console.warn('[Presence] Failed to go online:', err.message);
    }
  }

  /**
   * Go offline with presence update
   */
  async goOffline() {
    if (!this.socket || !this.isOnline) return;

    try {
      await this.socket.sendPresenceUpdate('unavailable');
      this.isOnline = false;
      this.lastPresenceChange = Date.now();
      console.log('[Presence] Now OFFLINE');
      this.saveState();
    } catch (err) {
      console.warn('[Presence] Failed to go offline:', err.message);
    }
  }

  /**
   * Start automatic presence cycling
   */
  startPresenceCycle() {
    // Clear any existing timers
    this.timers.clearAll();

    const cycle = async () => {
      const withinActiveHours = this.isWithinActiveHours();

      if (!withinActiveHours) {
        // Outside active hours - stay offline
        if (this.isOnline) {
          await this.goOffline();
        }
        // Check again in 30 minutes
        this.timers.setTimeout(cycle, 30 * 60 * 1000);
        return;
      }

      // Within active hours - cycle between online/offline
      if (this.isOnline) {
        // Currently online, schedule going offline
        const onlineDuration = this.getRandomDuration(
          this.minOnlineDuration,
          this.maxOnlineDuration
        );

        this.timers.setTimeout(async () => {
          await this.goOffline();
          cycle();
        }, onlineDuration);

      } else {
        // Currently offline, schedule going online
        const offlineDuration = this.getRandomDuration(
          this.minOfflineDuration,
          this.maxOfflineDuration
        );

        this.timers.setTimeout(async () => {
          await this.goOnline();
          cycle();
        }, offlineDuration);
      }
    };

    // Start the cycle
    cycle();
  }

  /**
   * Stop presence cycling
   */
  stopPresenceCycle() {
    this.timers.clearAll();
  }

  /**
   * Temporarily go online for sending a message (auto-returns to cycle)
   */
  async temporaryOnline() {
    const wasOffline = !this.isOnline;

    if (wasOffline) {
      await this.goOnline();
    }

    return {
      wasOffline,
      restore: async () => {
        if (wasOffline) {
          // Stay online for a bit after sending, then go offline
          const stayOnline = humanDelay(30000, 0.5); // 30 seconds ± 50%
          this.timers.setTimeout(() => this.goOffline(), stayOnline);
        }
      }
    };
  }

  getStatus() {
    return {
      isOnline: this.isOnline,
      withinActiveHours: this.isWithinActiveHours(),
      activeHours: `${this.activeHoursStart}:00 - ${this.activeHoursEnd}:00`,
      lastChange: this.lastPresenceChange,
      timeSinceChange: Date.now() - this.lastPresenceChange,
    };
  }

  // PersistenceBase overrides
  getStateData() {
    return {
      isOnline: this.isOnline,
      lastPresenceChange: this.lastPresenceChange,
    };
  }

  restoreState(data) {
    this.isOnline = data.isOnline || false;
    this.lastPresenceChange = data.lastPresenceChange || Date.now();
  }
}

export default PresenceManager;
