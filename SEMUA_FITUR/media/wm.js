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
        return type === 'imageMessage' || type === 'videoMessage' || type === 'stickerMessage';
}

/* ── Video/GIF → webp animasi (disamakan dengan .sticker) ── */
async function convertVideoToWmWebp(mediaBuffer, { exec, util, path, fs }) {
        const os = await import('os');
        const execAsync = util.promisify(exec);
        const tmpDir = os.default.tmpdir();
        const uniqR  = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const tmpIn  = path.join(tmpDir, `wm_in_${uniqR}.mp4`);
        const tmpOut = path.join(tmpDir, `wm_out_${uniqR}.webp`);
        try {
                fs.writeFileSync(tmpIn, mediaBuffer);
                const MAX_STICKER_BYTES = 500 * 1024;
                let quality = 80;
                let fps = 15;
                let webpBuf;

                while (true) {
                        await execAsync(
                                `ffmpeg -y -i "${tmpIn}" ` +
                                `-vf "fps=${fps},scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba" ` +
                                `-vcodec libwebp_anim -lossless 0 -quality ${quality} -loop 0 -an "${tmpOut}"`,
                                { timeout: 60000 }
                        );
                        webpBuf = fs.readFileSync(tmpOut);
                        if (webpBuf.length <= MAX_STICKER_BYTES) break;
                        if (quality > 30) {
                                quality -= 15;
                        } else if (fps > 8) {
                                fps -= 3;
                                quality = 50;
                        } else {
                                break;
                        }
                }
                return webpBuf;
        } finally {
                try { fs.unlinkSync(tmpIn); } catch {}
                try { fs.unlinkSync(tmpOut); } catch {}
        }
}

async function handleWmCommand({ hisoka, m, query, tolak, logCommand, loadConfig, downloadMediaBuffer, getQuotedMediaBuffer, getMediaTypeFromMessage, exec, util, path, fs }) {
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
                                `│ • Kirim gambar/video + caption:\n` +
                                `│   _${pfxWm}wm NamaPack|NamaAuthor_\n` +
                                `│ • Reply gambar/video/sticker + ketik:\n` +
                                `│   _${pfxWm}wm NamaPack|NamaAuthor_\n` +
                                `│   _(video max 10 dtk jadi sticker animasi)_\n` +
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

                let mediaBuffer;
                let mediaType;
                let videoDuration = 0;

                if (canUseWmCurrent) {
                        mediaBuffer = await downloadMediaBuffer(hisoka, m);
                        mediaType = wmCurrentType;
                        if (wmCurrentType === 'videoMessage') {
                                videoDuration = m.message?.videoMessage?.seconds ||
                                        m.content?.seconds || 0;
                        }
                } else {
                        mediaBuffer = await getQuotedMediaBuffer(hisoka, m);
                        mediaType = wmQuotedType;
                        if (wmQuotedType === 'videoMessage') {
                                videoDuration = m.quoted?.message?.videoMessage?.seconds ||
                                        m.quoted?.content?.seconds || 0;
                        }
                }

                if (!mediaBuffer || mediaBuffer.length === 0) {
                        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                        await tolak(hisoka, m, '❌ Gagal download media, coba lagi');
                        return;
                }

                if (mediaType === 'videoMessage' && videoDuration > 10) {
                        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                        await tolak(hisoka, m, `❌ Video terlalu panjang! (${videoDuration} detik)\nMaksimal *10 detik* untuk sticker animasi.`);
                        return;
                }

                let stickerBuffer;
                if (mediaType === 'videoMessage') {
                        const webpBuf = await convertVideoToWmWebp(mediaBuffer, { exec, util, path, fs });
                        const { Exif: WSFExif } = await import('wa-sticker-formatter');
                        const exif = new WSFExif({
                                pack: packName,
                                author: authorName,
                                categories: ['🎭'],
                                id: 'com.wilykun.wm',
                        });
                        stickerBuffer = await exif.add(webpBuf);
                } else {
                        stickerBuffer = await makeWmSticker(mediaBuffer, { packName, authorName });
                }

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
