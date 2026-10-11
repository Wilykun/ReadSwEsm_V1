---
name: Hermes 9Router configuration
description: Non-secret settings for connecting Hermes Agent to this Replit 9Router instance.
---

Hermes should use a custom OpenAI-compatible provider at `https://ddd13086-1ed8-45ff-8b57-bc7c10175dbf-00-2j29tv6b8ugxa.pike.replit.dev/v1`, with the API key referenced through the `OPENAI_API_KEY` environment variable and a real model ID selected from 9Router. Never preserve the key value in chat, workspace files, or memory. This 9Router setup may also require an `x-api-key` request header; verify the Hermes provider's extra-header configuration before treating a successful model setup as confirmed.

**Why:** The user supplied Hermes' manual config and asked that it be remembered, but the API key was exposed in chat and must be rotated rather than reused.

**How to apply:** Keep only the endpoint and environment-variable reference in Hermes config. Rotate the exposed key, update `OPENAI_API_KEY` in Replit Secrets, and test the request without logging the key.
