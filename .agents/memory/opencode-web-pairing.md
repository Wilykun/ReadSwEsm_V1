---
name: OpenCode remote web pairing
description: OpenCode web UI requires browser pairing with its backend; this is separate from provider configuration.
---

The OpenCode “Connect to a server” page is the expected unauthenticated UI. A 401 before pairing is normal and does not indicate a bad model provider. In Replit, use the managed OpenCode service itself, bound to `0.0.0.0` on port 5000, and create a one-time link with `opencode pair --url https://<public-host>`. The `pair` subcommand does not accept the global `--server` option; configure the managed service to match the public web workflow first. Pairing links expire after five minutes.

**Why:** OpenCode v2 serves the web UI and protects browser sessions separately from the model provider configuration. A separate foreground `opencode serve` instance can differ from the shared service used by `opencode pair`.

**How to apply:** Set the managed service hostname to `0.0.0.0` and its port to 5000, start it, then run `opencode pair --url` with the public Replit address including its external port. Paste the generated link into the browser. Do not change `opencode.json` to address an unauthenticated pairing page.
