---
name: Main and jadibot menu isolation
description: Keep the main-bot menu separate from the user-jadibot menu and its command count.
---

When changing `.menu`, keep the main-bot command count and builder independent from the user-jadibot menu. The main bot uses its runtime plugin command registry; the jadibot route uses its own menu builder and count.

**Why:** The user explicitly asked that changes to the main-bot menu not conflict with the user-jadibot menu.

**How to apply:** Preserve the `isMainBot` branch boundary and test both routes after menu count or rendering changes.
