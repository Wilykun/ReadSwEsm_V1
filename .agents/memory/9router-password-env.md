---
name: 9Router initial password
description: How the dashboard authentication fallback behaves when INITIAL_PASSWORD is set in Replit.
---

If no dashboard password has been saved, 9Router accepts `INITIAL_PASSWORD`, falling back to `123456` only when the environment variable is absent. A saved dashboard password takes precedence over the environment fallback. Remote access intentionally rejects the default password.

**Why:** Users can mistake a correctly applied custom secret for a failed login when they continue trying the documented default.

**How to apply:** Set `INITIAL_PASSWORD` through Replit Secrets, restart the 9Router process so it receives the updated environment, and tell the user to enter the value they set without exposing it in chat.
