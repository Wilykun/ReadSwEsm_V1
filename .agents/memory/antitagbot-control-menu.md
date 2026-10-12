---
name: AntiTagBot control menu
description: Keep the AntiTagBot single-select status accurate and tidy after each owner selection.
---

The AntiTagBot single-select must show the persisted ON/OFF state, including when the owner chooses the state that is already active. On a selection, remove only the quoted bot-authored AntiTagBot menu after verifying it belongs to this chat and contains the AntiTag on/off actions; then send the refreshed status menu. Non-owner commands must receive an explicit denial rather than returning silently.

**Why:** The user wants the old menu cleared for a cleaner group chat and the active state to remain visible and accurate.

**How to apply:** Keep status tied to saved configuration, validate quoted menu identity before deletion, and preserve the single-select as the success and already-active response.
