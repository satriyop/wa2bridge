/**
 * Pure utility functions for WhatsApp client operations.
 * These functions have no side effects and don't depend on client state.
 *
 * @module whatsapp-utilities
 */

import { DisconnectReason } from '@whiskeysockets/baileys';

/**
 * Normalize a phone number to WhatsApp JID format.
 *
 * Handles various input formats:
 * - International format: +6281234567890
 * - Local Indonesian: 081234567890
 * - Already normalized: 6281234567890
 *
 * @param {string} phone - Phone number in any format
 * @returns {string} WhatsApp JID (e.g., "6281234567890@s.whatsapp.net")
 *
 * @example
 * normalizeJid('+6281234567890') // "6281234567890@s.whatsapp.net"
 * normalizeJid('081234567890')   // "6281234567890@s.whatsapp.net"
 */
export function normalizeJid(phone) {
  // Remove all non-numeric characters
  let normalized = phone.replace(/\D/g, '');

  // Handle Indonesian numbers starting with 0
  if (normalized.startsWith('0')) {
    normalized = '62' + normalized.slice(1);
  }

  // Remove leading + if present (already handled by \D regex, but defensive)
  if (normalized.startsWith('+')) {
    normalized = normalized.slice(1);
  }

  return `${normalized}@s.whatsapp.net`;
}

/**
 * Get human-readable name for Baileys disconnect reason code.
 *
 * @param {number} statusCode - Baileys DisconnectReason code
 * @returns {string} Human-readable reason description
 *
 * @example
 * getDisconnectReasonName(DisconnectReason.loggedOut) // "Logged Out"
 * getDisconnectReasonName(999) // "Unknown (999)"
 */
export function getDisconnectReasonName(statusCode) {
  const reasons = {
    [DisconnectReason.badSession]: 'Bad Session',
    [DisconnectReason.connectionClosed]: 'Connection Closed',
    [DisconnectReason.connectionLost]: 'Connection Lost',
    [DisconnectReason.connectionReplaced]: 'Connection Replaced',
    [DisconnectReason.loggedOut]: 'Logged Out',
    [DisconnectReason.restartRequired]: 'Restart Required',
    [DisconnectReason.timedOut]: 'Timed Out',
  };
  return reasons[statusCode] || `Unknown (${statusCode})`;
}

/**
 * Check if a JID represents a group chat.
 *
 * @param {string} jid - WhatsApp JID
 * @returns {boolean} True if group JID
 *
 * @example
 * isGroupJid('1234567890@s.whatsapp.net') // false
 * isGroupJid('1234567890@g.us')           // true
 */
export function isGroupJid(jid) {
  return jid.endsWith('@g.us');
}

/**
 * Extract phone number from JID.
 *
 * @param {string} jid - WhatsApp JID
 * @returns {string} Phone number without domain
 *
 * @example
 * extractPhoneFromJid('6281234567890@s.whatsapp.net') // "6281234567890"
 */
export function extractPhoneFromJid(jid) {
  return jid.replace(/@s\.whatsapp\.net$|@g\.us$/, '');
}
