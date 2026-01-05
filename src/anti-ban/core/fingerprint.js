/**
 * Browser Fingerprint Rotation
 *
 * WhatsApp tracks device fingerprints. Static fingerprints link all
 * messages to one "fake device". This rotates fingerprints every 24-48 hours.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// Legacy fingerprint - used for first run to maintain session continuity
// This matches the previously hardcoded value to avoid re-authentication
const LEGACY_FINGERPRINT = ['Ubuntu', 'Chrome', '124.0.6367.91'];

// Current browser versions (update periodically)
const BROWSER_FINGERPRINTS = [
  ['Windows', 'Chrome', '131.0.6778.139'],
  ['Windows', 'Chrome', '130.0.6723.117'],
  ['Windows', 'Edge', '131.0.2903.86'],
  ['macOS', 'Chrome', '131.0.6778.139'],
  ['macOS', 'Safari', '18.2'],
  ['Linux', 'Chrome', '131.0.6778.139'],
  ['Linux', 'Firefox', '133.0'],
];

// Rotation interval: 24-48 hours (randomized)
const MIN_ROTATION_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const MAX_ROTATION_INTERVAL = 48 * 60 * 60 * 1000; // 48 hours

/**
 * Get or rotate browser fingerprint
 * Stores fingerprint in session directory, rotates every 24-48 hours
 *
 * IMPORTANT: First run uses legacy fingerprint to maintain existing session.
 * Subsequent rotations will use modern fingerprints.
 *
 * @param {string} sessionsDir - Path to sessions directory
 * @returns {string[]} Browser fingerprint array [OS, Browser, Version]
 */
export function getBrowserFingerprint(sessionsDir) {
  const fingerprintFile = join(sessionsDir, '.browser-fingerprint.json');

  try {
    if (existsSync(fingerprintFile)) {
      const stored = JSON.parse(readFileSync(fingerprintFile, 'utf-8'));
      const rotationInterval = stored.rotationInterval || MIN_ROTATION_INTERVAL;

      // Check if rotation is needed
      if (Date.now() - stored.timestamp < rotationInterval) {
        return stored.browser;
      }

      // Time to rotate - use modern fingerprints
      const newBrowser = BROWSER_FINGERPRINTS[
        Math.floor(Math.random() * BROWSER_FINGERPRINTS.length)
      ];

      const newRotationInterval = MIN_ROTATION_INTERVAL +
        Math.random() * (MAX_ROTATION_INTERVAL - MIN_ROTATION_INTERVAL);

      const data = {
        browser: newBrowser,
        timestamp: Date.now(),
        rotationInterval: newRotationInterval,
        rotationCount: (stored.rotationCount || 0) + 1,
      };

      writeFileSync(fingerprintFile, JSON.stringify(data, null, 2));
      console.log(`[Anti-Ban] Browser fingerprint rotated to: ${newBrowser.join('/')}`);
      return newBrowser;
    }
  } catch (err) {
    // File doesn't exist or is corrupted, use legacy for first run
  }

  // FIRST RUN: Use legacy fingerprint to maintain existing session
  // This prevents WhatsApp from seeing a sudden device change
  const data = {
    browser: LEGACY_FINGERPRINT,
    timestamp: Date.now(),
    rotationInterval: MIN_ROTATION_INTERVAL + Math.random() * (MAX_ROTATION_INTERVAL - MIN_ROTATION_INTERVAL),
    rotationCount: 0,
    note: 'Initial fingerprint matches legacy hardcoded value for session continuity',
  };

  try {
    writeFileSync(fingerprintFile, JSON.stringify(data, null, 2));
    console.log('[Anti-Ban] Using legacy fingerprint for session continuity. Will rotate in 24-48h.');
  } catch (err) {
    console.warn('Could not save browser fingerprint:', err.message);
  }

  return LEGACY_FINGERPRINT;
}

/**
 * Get list of available browser fingerprints
 * @returns {string[][]} Array of fingerprint arrays
 */
export function getAvailableFingerprints() {
  return [...BROWSER_FINGERPRINTS];
}

/**
 * Get the legacy fingerprint (for reference)
 * @returns {string[]}
 */
export function getLegacyFingerprint() {
  return [...LEGACY_FINGERPRINT];
}

export default {
  getBrowserFingerprint,
  getAvailableFingerprints,
  getLegacyFingerprint,
};
