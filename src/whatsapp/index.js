/**
 * WhatsApp Module - Barrel Exports
 *
 * This module provides a modular WhatsApp client with anti-ban protection.
 * The WhatsAppClient facade is the primary public API.
 */

// Main facade
export { WhatsAppClient } from './WhatsAppClient.js';
export { default } from './WhatsAppClient.js';

// Internal modules (for advanced usage or testing)
export { AntiBanOrchestrator } from './AntiBanOrchestrator.js';
export { ConnectionManager } from './ConnectionManager.js';
export { MessageHandler } from './MessageHandler.js';
export { StatusAggregator } from './StatusAggregator.js';
