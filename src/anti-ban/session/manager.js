/**
 * Session Manager
 *
 * Manages session backup and recovery.
 * Helps avoid re-scanning QR code after restarts.
 */

import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Manages session backups
 */
export class SessionManager {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.backupDir = options.backupDir || join(this.sessionsDir, '..', 'session-backups');
    this.maxBackups = options.maxBackups || 5;
    this.autoBackupInterval = options.autoBackupInterval || 60 * 60 * 1000; // 1 hour

    this.backupTimer = null;
    this.lastBackupTime = 0;

    // Ensure backup directory exists
    this.ensureBackupDir();
  }

  ensureBackupDir() {
    try {
      if (!existsSync(this.backupDir)) {
        const { mkdirSync } = require('fs');
        mkdirSync(this.backupDir, { recursive: true });
      }
    } catch (err) {
      console.error('Failed to create backup directory:', err.message);
    }
  }

  /**
   * Start automatic backups
   */
  startAutoBackup() {
    if (this.backupTimer) return;

    this.backupTimer = setInterval(() => {
      this.createBackup();
    }, this.autoBackupInterval);

    // Initial backup after 5 minutes
    setTimeout(() => this.createBackup(), 5 * 60 * 1000);
  }

  stopAutoBackup() {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
    }
  }

  /**
   * Create a backup of current session
   */
  createBackup() {
    if (!existsSync(this.sessionsDir)) {
      return { success: false, reason: 'sessions_dir_not_found' };
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = join(this.backupDir, `backup-${timestamp}`);

      // Copy session files
      const { cpSync } = require('fs');
      cpSync(this.sessionsDir, backupPath, { recursive: true });

      this.lastBackupTime = Date.now();

      // Cleanup old backups
      this.cleanupOldBackups();

      return { success: true, path: backupPath, timestamp };
    } catch (err) {
      return { success: false, reason: err.message };
    }
  }

  /**
   * Restore from a backup
   */
  restoreBackup(backupName) {
    const backupPath = join(this.backupDir, backupName);

    if (!existsSync(backupPath)) {
      return { success: false, reason: 'backup_not_found' };
    }

    try {
      const { cpSync, rmSync } = require('fs');

      // Remove current session
      if (existsSync(this.sessionsDir)) {
        rmSync(this.sessionsDir, { recursive: true });
      }

      // Copy backup to sessions
      cpSync(backupPath, this.sessionsDir, { recursive: true });

      return { success: true, restored: backupName };
    } catch (err) {
      return { success: false, reason: err.message };
    }
  }

  /**
   * List available backups
   */
  listBackups() {
    try {
      if (!existsSync(this.backupDir)) return [];

      const { readdirSync, statSync } = require('fs');
      const backups = readdirSync(this.backupDir)
        .filter(name => name.startsWith('backup-'))
        .map(name => {
          const path = join(this.backupDir, name);
          const stats = statSync(path);
          return {
            name,
            createdAt: stats.mtime,
            size: this.getDirSize(path),
          };
        })
        .sort((a, b) => b.createdAt - a.createdAt);

      return backups;
    } catch (err) {
      return [];
    }
  }

  /**
   * Get directory size
   */
  getDirSize(dirPath) {
    try {
      const { readdirSync, statSync } = require('fs');
      let size = 0;
      const files = readdirSync(dirPath);
      for (const file of files) {
        const filePath = join(dirPath, file);
        const stats = statSync(filePath);
        if (stats.isDirectory()) {
          size += this.getDirSize(filePath);
        } else {
          size += stats.size;
        }
      }
      return size;
    } catch (err) {
      return 0;
    }
  }

  /**
   * Remove old backups beyond maxBackups
   */
  cleanupOldBackups() {
    const backups = this.listBackups();
    if (backups.length <= this.maxBackups) return;

    const toDelete = backups.slice(this.maxBackups);
    const { rmSync } = require('fs');

    for (const backup of toDelete) {
      try {
        rmSync(join(this.backupDir, backup.name), { recursive: true });
      } catch (err) {}
    }
  }

  getStatus() {
    return {
      lastBackupTime: this.lastBackupTime,
      autoBackupActive: this.backupTimer !== null,
      backupCount: this.listBackups().length,
      backupDir: this.backupDir,
    };
  }

  /**
   * Get backup info (alias for getStatus with additional details)
   */
  getBackupInfo() {
    const backups = this.listBackups();
    return {
      lastBackupTime: this.lastBackupTime,
      autoBackupActive: this.backupTimer !== null,
      backupCount: backups.length,
      maxBackups: this.maxBackups,
      latestBackup: backups[0] || null,
    };
  }
}

export default SessionManager;
