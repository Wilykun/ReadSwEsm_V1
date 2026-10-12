---
name: Native WhatsApp @semua payload
description: Baileys representation of WhatsApp group-wide mentions and how to avoid missing them.
---

Native group-wide mentions may arrive through a `groupMentionedMessage` wrapper and `contextInfo.groupMentions`, rather than a populated `mentionedJid` list. AntiTagBot deletes member `@semua` only after confirming the sender is not an owner/admin and the bot is an admin. It must reply with the accurate outcome for members, admins, owners, missing bot-admin permission, unknown status, and delete failures; never silently skip a detected tag.

**Why:** Baileys exposes dedicated group-mention message fields, and the normalized content helper may not unwrap that wrapper. The user expects ordinary members' native `@semua` messages to be removed and every detected attempt to receive a clear status reply.

**How to apply:** Inspect the wrapper and group target before deciding there is no mention. Confirm current group metadata before deleting; keep owner/admin exemptions, quote outcome replies to the source message, and retain a message-ID-scoped trace without logging ordinary group traffic.
