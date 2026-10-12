---
name: Native WhatsApp @semua payload
description: Baileys representation of WhatsApp group-wide mentions and how to avoid missing them.
---

Native group-wide mentions may arrive through a `groupMentionedMessage` wrapper and `contextInfo.groupMentions`, rather than a populated `mentionedJid` list. A handler that exits early when `mentionedJid` is empty can silently miss `@semua`.

**Why:** Baileys exposes dedicated group-mention message fields, and the normalized content helper may not unwrap that wrapper.

**How to apply:** Inspect the wrapper and group target before deciding there is no mention; retain a message-ID-scoped debug trace for suspected group-wide mentions without logging ordinary group traffic.
