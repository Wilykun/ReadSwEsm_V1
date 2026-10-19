// A read-only entry is complete once it is read: reacted=false is expected,
// not pending work. Keep startup and live retry selection on this same rule.
export function isSwEntryPending(entry, reactionEnabled = true) {
  if (!entry || entry.deleted) return false;
  if (!entry.read) return true;
  // Retry reaksi kalau mode Read+Reaction aktif dan belum reacted.
  // reactionExpected tidak lagi jadi syarat mutlak — retry di event.js
  // akan coba resolve PN ulang untuk entry yang dulu gagal resolve.
  // Entry yang memang mode Read Only saat tracking (reactionExpected === false
  // dan tidak ada sender LID) tetap dianggap selesai.
  if (!reactionEnabled || entry.reacted) return false;
  if (entry.reactionExpected === true) return true;
  /* Entry lama/gagal-resolve: pending kalau ada sender yang bisa dicoba resolve */
  return !!entry.sender;
}