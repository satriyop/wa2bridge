/**
 * Profile Viewer
 *
 * Occasionally views contact profile pictures.
 * Normal human behavior that bots typically skip.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { humanDelay } from '../core/timing.js';

/**
 * Simulates profile viewing behavior
 */
export class ProfileViewer {
  constructor(options = {}) {
    this.socket = null;
    this.viewProbability = options.viewProbability || 0.1; // 10% chance per new contact
    this.viewedProfiles = new Set();
    this.sessionsDir = options.sessionsDir;

    this.loadState();
  }

  setSocket(socket) {
    this.socket = socket;
  }

  /**
   * Maybe view a contact's profile picture
   */
  async maybeViewProfile(jid) {
    if (!this.socket) return;

    // Skip if already viewed recently
    if (this.viewedProfiles.has(jid)) return;

    // Random chance to view
    if (Math.random() > this.viewProbability) return;

    try {
      // Delay before viewing (natural behavior)
      const viewDelay = humanDelay(2000, 0.5);
      await new Promise(resolve => setTimeout(resolve, viewDelay));

      // Fetch profile picture URL
      await this.socket.profilePictureUrl(jid, 'image');

      this.viewedProfiles.add(jid);
      this.saveState();
    } catch (err) {
      // Profile might be private, that's OK
    }
  }

  /**
   * View profile of a specific contact (forced)
   */
  async viewProfile(jid) {
    if (!this.socket) return null;

    try {
      const url = await this.socket.profilePictureUrl(jid, 'image');
      this.viewedProfiles.add(jid);
      return url;
    } catch (err) {
      return null;
    }
  }

  getStats() {
    return {
      viewedCount: this.viewedProfiles.size,
    };
  }

  loadState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.profile-viewer-state.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        if (data.date === new Date().toDateString()) {
          this.viewedProfiles = new Set(data.viewedProfiles || []);
        }
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.profile-viewer-state.json');
    try {
      writeFileSync(stateFile, JSON.stringify({
        date: new Date().toDateString(),
        viewedProfiles: [...this.viewedProfiles],
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

export default ProfileViewer;
