/**
 * Status Viewer
 *
 * Simulates viewing WhatsApp statuses/stories.
 * Bots never view statuses - humans do regularly.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { humanDelay } from '../core/timing.js';
import { TimerRegistry } from '../../utils/timer-registry.js';

/**
 * Simulates status viewing behavior
 */
export class StatusViewer {
  constructor(options = {}) {
    this.socket = null;
    this.sessionsDir = options.sessionsDir;

    // Viewing schedule
    this.viewInterval = options.viewInterval || 2 * 60 * 60 * 1000; // Check every 2 hours
    this.viewProbability = options.viewProbability || 0.6; // 60% chance to view when checking

    // Track viewed statuses
    this.viewedStatuses = new Set();
    this.lastViewTime = 0;

    // Timer management
    this.timers = new TimerRegistry('StatusViewer');

    this.loadState();
  }

  setSocket(socket) {
    this.socket = socket;
  }

  /**
   * Start automatic status viewing
   */
  startViewing() {
    if (this.timers.hasActiveTimers()) return;

    // Main viewing interval
    this.timers.setInterval(() => {
      this.maybeViewStatuses();
    }, this.viewInterval);

    // Initial view after random delay (now tracked!)
    const initialDelay = humanDelay(5 * 60 * 1000, 0.5); // 5 min ± 50%
    this.timers.setTimeout(() => this.maybeViewStatuses(), initialDelay);
  }

  stopViewing() {
    this.timers.clearAll();
  }

  /**
   * Maybe view some statuses
   */
  async maybeViewStatuses() {
    if (!this.socket || Math.random() > this.viewProbability) return;

    try {
      // Get status list (this is a simplified version)
      // In real implementation, you'd fetch actual statuses
      console.log('[StatusViewer] Simulating status viewing behavior');
      this.lastViewTime = Date.now();
      this.saveState();
    } catch (err) {
      // Ignore errors
    }
  }

  /**
   * View a specific contact's status
   */
  async viewContactStatus(jid) {
    if (!this.socket) return;

    try {
      // Mark status as read with realistic delay
      const viewDelay = humanDelay(2000, 0.5);
      await new Promise(resolve => setTimeout(resolve, viewDelay));

      // In Baileys, viewing status is implicit when fetching
      // This is a placeholder for the actual implementation
      this.viewedStatuses.add(jid);
    } catch (err) {
      // Ignore
    }
  }

  getStatus() {
    return {
      lastViewTime: this.lastViewTime,
      viewedCount: this.viewedStatuses.size,
      isActive: this.timers.hasActiveTimers(),
    };
  }

  loadState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.status-viewer-state.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        this.lastViewTime = data.lastViewTime || 0;
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.status-viewer-state.json');
    try {
      writeFileSync(stateFile, JSON.stringify({
        lastViewTime: this.lastViewTime,
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

export default StatusViewer;
