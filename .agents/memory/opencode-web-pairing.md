---
name: OpenCode remote web pairing
description: OpenCode web UI requires browser pairing with its backend; this is separate from provider configuration.
---

The OpenCode “Connect to a server” page is the expected unauthenticated UI. A 401 before pairing is normal and does not indicate a bad model provider. For a Replit-hosted server, bind OpenCode to `0.0.0.0` on the webview port, then create a one-time link against that same server with `opencode --server http://127.0.0.1:5000 pair --url https://<public-host>`. Pairing links expire after five minutes.

**Why:** OpenCode v2 serves the web UI and protects browser sessions separately from the model provider configuration.

**How to apply:** Verify the OpenCode server and provider endpoints are running, then pair the browser with the server. Do not change `opencode.json` to address an unauthenticated pairing page.
