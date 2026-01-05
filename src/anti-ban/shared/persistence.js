/**
 * Base class for persistent state management
 *
 * Provides common load/save functionality for classes that need to persist
 * state to the sessions directory. Eliminates ~580 lines of duplicated code.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Base class providing JSON file persistence
 *
 * @example
 * class MyClass extends PersistenceBase {
 *   constructor(options = {}) {
 *     super(options.sessionsDir, '.my-state.json');
 *     this.myState = 0;
 *     this.loadState();
 *   }
 *
 *   getStateData() {
 *     return { myState: this.myState };
 *   }
 *
 *   restoreState(data) {
 *     this.myState = data.myState || 0;
 *   }
 * }
 */
export class PersistenceBase {
  /**
   * @param {string|undefined} sessionsDir - Path to sessions directory
   * @param {string} filename - State file name (e.g., '.my-state.json')
   */
  constructor(sessionsDir, filename) {
    this.sessionsDir = sessionsDir;
    this.stateFilename = filename;
  }

  /**
   * Get the full path to the state file
   * @returns {string|null}
   */
  getStateFilePath() {
    if (!this.sessionsDir) return null;
    return join(this.sessionsDir, this.stateFilename);
  }

  /**
   * Load state from file. Override restoreState() to handle the data.
   * @returns {boolean} True if state was loaded successfully
   */
  loadState() {
    const filePath = this.getStateFilePath();
    if (!filePath) return false;

    try {
      if (existsSync(filePath)) {
        const data = JSON.parse(readFileSync(filePath, 'utf-8'));
        this.restoreState(data);
        return true;
      }
    } catch (err) {
      // Silently ignore errors - start fresh
    }
    return false;
  }

  /**
   * Save state to file. Override getStateData() to provide the data.
   * @returns {boolean} True if state was saved successfully
   */
  saveState() {
    const filePath = this.getStateFilePath();
    if (!filePath) return false;

    try {
      const data = {
        ...this.getStateData(),
        lastSaved: Date.now(),
      };
      writeFileSync(filePath, JSON.stringify(data, null, 2));
      return true;
    } catch (err) {
      // Silently ignore save errors
      return false;
    }
  }

  /**
   * Override this method to return data to be persisted
   * @returns {Object}
   */
  getStateData() {
    return {};
  }

  /**
   * Override this method to restore state from loaded data
   * @param {Object} data - Previously saved state
   */
  restoreState(data) {
    // Override in subclass
  }

  /**
   * Check if state file exists
   * @returns {boolean}
   */
  hasPersistedState() {
    const filePath = this.getStateFilePath();
    return filePath ? existsSync(filePath) : false;
  }

  /**
   * Delete the state file
   * @returns {boolean}
   */
  clearState() {
    const filePath = this.getStateFilePath();
    if (!filePath) return false;

    try {
      if (existsSync(filePath)) {
        const { unlinkSync } = require('fs');
        unlinkSync(filePath);
        return true;
      }
    } catch (err) {
      // Ignore
    }
    return false;
  }
}

/**
 * Mixin for date-scoped persistence (resets daily)
 *
 * Use this for stats that should reset each day (e.g., daily message counts)
 */
export class DailyPersistenceBase extends PersistenceBase {
  /**
   * Load state only if from today
   */
  loadState() {
    const filePath = this.getStateFilePath();
    if (!filePath) return false;

    try {
      if (existsSync(filePath)) {
        const data = JSON.parse(readFileSync(filePath, 'utf-8'));
        const today = new Date().toDateString();

        if (data.date === today) {
          this.restoreState(data);
          return true;
        }
        // Data is from a different day - don't restore
      }
    } catch (err) {
      // Silently ignore
    }
    return false;
  }

  /**
   * Save state with today's date
   */
  saveState() {
    const filePath = this.getStateFilePath();
    if (!filePath) return false;

    try {
      const data = {
        date: new Date().toDateString(),
        ...this.getStateData(),
        lastSaved: Date.now(),
      };
      writeFileSync(filePath, JSON.stringify(data, null, 2));
      return true;
    } catch (err) {
      return false;
    }
  }
}

export default PersistenceBase;
