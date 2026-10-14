/**
 * ───────────────────────────────
 *  Base Script : Bang Dika Ardnt
 *  Recode By   : Bang Wilykun
 *  WhatsApp    : 6289688206739
 *  Telegram    : @Wilykun1994
 * ───────────────────────────────
 *  Script ini khusus donasi/VIP
 *  Support dari kalian bikin saya
 *  makin semangat update fitur,
 *  fix bug, dan rawat script ini.
 *
 *  Dilarang menjual ulang script ini
 *  Tanpa izin resmi dari developer.
 *  Jika ketahuan = NO UPDATE / NO FIX
 *
 *  Hargai karya, gunakan dengan bijak.
 *  Terima kasih sudah support.
 * ───────────────────────────────
 *
 *  wm.js — Buat stiker custom metadata (.wm/.swm)
 *  Set pack name & author stiker tanpa overlay visual
 * ───────────────────────────────
 */
'use strict';

async function makeWmSticker(imageBuffer, { packName = 'Wily Bot', authorName = 'Wilykun' } = {}) {
        const { Sticker, StickerTypes } = await import('wa-sticker-formatter');
        const sticker = new Sticker(imageBuffer, {
                pack: packName,
                author: authorName,
                type: StickerTypes.FULL,
                categories: ['🎭'],
                id: 'com.wilykun.wm',
                quality: 90
        });
        return await sticker.toBuffer();
}

function isWmSupportedMedia(type) {
        return type === 'imageMessage' || type === 'stickerMessage';
}

async function handleWmCommand({ hisoka, m, query, tolak, logCommand, loadConfig, downloadMediaBuffer, getQuotedMediaBuffer, getMediaTypeFromMessage }) {
        try {
                const pfxWm = m.prefix || '.';
                const wmCurrentType = getMediaTypeFromMessage(m);
                const wmQuotedType  = m.isQuoted ? getMediaTypeFromMessage(m.quoted) : '';
                const canUseWmCurrent = m.isMedia && isWmSupportedMedia(wmCurrentType);
                const canUseWmQuoted  = m.isQuoted && isWmSupportedMedia(wmQuotedType);

                if (!canUseWmCurrent && !canUseWmQuoted) {
                        const helpText =
                                `╭═══『 🎭 *WM STICKER* 』═══╮\n` +
                                `│\n` +
                                `│ Buat sticker dengan *Pack* dan\n` +
                                `│ *Author* nama kustom!\n` +
                                `│\n` +
                                `│ 📋 *Cara Pakai:*\n` +
                                `│ • Kirim gambar + caption:\n` +
                                `│   _${pfxWm}wm NamaPack|NamaAuthor_\n` +
                                `│ • Reply gambar/sticker + ketik:\n` +
                                `│   _${pfxWm}wm NamaPack|NamaAuthor_\n` +
                                `│ • Tanpa argumen = auto-detect\n` +
                                `│   _dari config (${pfxWm}s pack/author)_\n` +
                                `│\n` +
                                `│ 📝 *Contoh:*\n` +
                                `│   ${pfxWm}wm Bang|Wily\n` +
                                `│   ${pfxWm}wm Wilybot|Owner\n` +
                                `│\n` +
                                `│ ℹ️ Sticker juga bisa diproses\n` +
                                `│    dengan cara di-reply!\n` +
                                `│\n` +
                                `│ ℹ️ Pisahkan Pack & Author\n` +
                                `│    dengan tanda *|*\n` +
                                `│\n` +
                                `│ 🏷️ Alias: ${pfxWm}wm · ${pfxWm}swm\n` +
                                `╰═══════════════════════════╯`;
                        await tolak(hisoka, m, helpText);
                        logCommand(m, hisoka, m.command || 'wm');
                        return;
                }

                /* ── Pack & Author: auto-detect dari config bila tidak diisi ── */
                const wmCfg = (typeof loadConfig === 'function' ? loadConfig() : {}).sticker || {};
                const rawQuery = (query || '').trim();
                let packName   = wmCfg.pack   || 'Wily Bot';
                let authorName = wmCfg.author || 'Bang Wily';

                if (rawQuery) {
                        const parts   = rawQuery.split('|');
                        const qPack   = (parts[0] || '').trim();
                        const qAuthor = (parts[1] || '').trim();
                        if (!qPack && !qAuthor) {
                                await tolak(hisoka, m, `❌ Format salah!\n\nContoh: *${pfxWm}wm Bang|Wily*`);
                                return;
                        }
                        if (qPack)   packName   = qPack;
                        if (qAuthor) authorName = qAuthor;
                }

                await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

                let imgBuffer;
                if (canUseWmCurrent) {
                        imgBuffer = await downloadMediaBuffer(hisoka, m);
                } else {
                        imgBuffer = await getQuotedMediaBuffer(hisoka, m);
                }

                if (!imgBuffer || imgBuffer.length === 0) {
                        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                        await tolak(hisoka, m, '❌ Gagal download gambar, coba lagi');
                        return;
                }

                const stickerBuffer = await makeWmSticker(imgBuffer, { packName, authorName });

                if (!stickerBuffer || stickerBuffer.length === 0) {
                        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                        await tolak(hisoka, m, '❌ Gagal buat sticker');
                        return;
                }

                await hisoka.sendMessage(m.from, { sticker: stickerBuffer }, { quoted: m });
                await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                logCommand(m, hisoka, m.command || 'wm');
        } catch (error) {
                console.error('\x1b[31m[WM] Error:\x1b[39m', error.message);
                await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                await tolak(hisoka, m, `❌ Gagal buat sticker WM: ${error.message}`);
        }
}

export { makeWmSticker, handleWmCommand };
/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const command = /^(wm|swm)$/i;
export const tags = ['media'];
export const help = ['wm'];
export default handleWmCommand;
