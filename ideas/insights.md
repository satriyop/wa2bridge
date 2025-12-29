insights.md

  ★ Insight ─────────────────────────────────────
  Baileys Quote/Reply Feature: When replying to a message in WhatsApp, Baileys needs the original message's key (ID + JID). If the message doesn't exist in the local store, Baileys throws an error. Our fix catches this and sends without the quote - better UX than failing entirely.
  ─────────────────────────────────────────────────

    ★ Insight ─────────────────────────────────────
  WhatsApp Session Persistence: Baileys stores sessions in the sessions/ folder. When the app logged out earlier (intentionally or due to errors), the credentials were invalidated. This is a security feature of WhatsApp - each logout invalidates the session keys, requiring a fresh QR scan.
  ─────────────────────────────────────────────────

   ★ Insight ─────────────────────────────────────
  wa:webhook vs wa:simulate:
  - wa:webhook tests the full HTTP flow (like the bridge does) - good for integration testing
  - wa:simulate bypasses HTTP and directly dispatches the job - faster, good for testing processing logic
  - Use --process flag with wa:webhook to auto-run queue jobs immediately
  ─────────────────────────────────────────────────
  