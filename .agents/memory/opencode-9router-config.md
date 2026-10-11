---
name: OpenCode 9Router configuration
description: OpenCode in this Replit workspace reads its provider config from the workspace XDG directory and needs 9Router's x-api-key header.
---

OpenCode must use the Replit secret chosen for the router (currently `OPENAI_API_KEY`) through the workspace `.config/opencode/opencode.json`, with both the OpenAI-compatible API key and `x-api-key` header configured. The background OpenCode service needs a restart after the secret becomes available.

**Why:** `XDG_CONFIG_HOME` points to the workspace `.config`, so the home-directory config is ignored; 9Router accepted the key through `x-api-key`, while the already-running OpenCode service lacked the refreshed environment.

**How to apply:** Keep the key out of source control and reference the Replit secret. After changing the secret or provider config, reload/restart the OpenCode service, then test `9router/kntl`.

The v2 provider guide and the published `https://opencode.ai/config.json` schema can expose different config shapes (`providers`/`package`/`settings` versus `provider`/`npm`/`options`). The installed v2.0.26 CLI successfully loads the singular schema form in this workspace.

**Why:** Following the newer docs shape without checking the installed CLI could silently leave the configured model unavailable.

**How to apply:** Check the installed CLI version and published schema, then verify the configured ID appears in `opencode models` before changing provider syntax.