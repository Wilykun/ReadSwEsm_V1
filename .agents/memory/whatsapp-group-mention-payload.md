---
name: Native WhatsApp @semua payload
description: Baileys representation of WhatsApp group-wide mentions and how to avoid missing them.
---

Native group-wide mentions may arrive through a `groupMentionedMessage` wrapper and `contextInfo.groupMentions`, rather than a populated `mentionedJid` list. AntiTagBot must detect and delete native `@semua`/mass mentions from non-admin members when the bot is a group admin, while exempting owners and group admins. Explicit group targets must match the current chat; only count regular mass mentions that match actual participants.

**Why:** Baileys exposes dedicated group-mention message fields, and the normalized content helper may not unwrap that wrapper. The user expects ordinary members' native `@semua` messages to be removed, not only direct mentions of the bot.

**How to apply:** Inspect the wrapper and group target before deciding there is no mention. Keep the bot-admin permission check and owner/admin exemptions, and retain a message-ID-scoped trace for suspected group-wide mentions without logging ordinary group traffic.
