# Production readiness
- [x] Correct widget routing, agent selection, voice routing, and embedded picker visibility.
- [x] Bind conversation tokens to the authenticated visitor and selected agent; validate attachments.
- [x] Repair existing compilation errors and verify tests and browser behavior.
- [x] Review security scan results: 29 critical and 8 warnings, predominantly imported legacy Supabase functions; none dismissed.
- [ ] Remediate legacy service findings and verify deployed protection (requires external Supabase deployment access; old services must not be silently deleted or redeployed).
- [ ] Enable visitor chat and verify all ten live Foundry agents (anonymous sign-in is disabled in external Supabase; administrator access required for synchronization).
- [ ] Connect chatbot.alazab.com (custom domain requires a paid Lovable plan; connect card dismissed).