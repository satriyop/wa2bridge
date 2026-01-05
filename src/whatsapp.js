/**
 * WhatsApp Client - Re-export for Backward Compatibility
 *
 * This file re-exports the WhatsAppClient from the new modular structure.
 * All imports from './whatsapp.js' will continue to work unchanged.
 *
 * @see src/whatsapp/WhatsAppClient.js for the implementation
 */

export { WhatsAppClient, WhatsAppClient as default } from './whatsapp/index.js';
