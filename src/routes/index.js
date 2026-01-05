/**
 * Route Module Index
 *
 * Exports all route factories for modular API organization.
 *
 * @module routes
 */

export { createWebhookRoutes } from './webhooks.js';
export { createAutomationRoutes } from './automation.js';
export { createSecurityRoutes } from './security.js';
export { createAnalyticsRoutes, createScoringRoutes, createSentimentRoutes } from './analytics.js';
export { createRecoveryRoutes } from './recovery.js';
export { createAntiBanRoutes } from './anti-ban.js';
export { createCoreRoutes } from './core.js';
