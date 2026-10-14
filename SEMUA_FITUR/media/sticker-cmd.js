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
 *  sticker-cmd.js — Sticker command handler
 *  Perintah .sticker untuk buat stiker dari gambar, video, atau GIF
 * ───────────────────────────────
 */
'use strict';

async function handleSticker({ hisoka, m, query, tolak, logCommand, loadConfig, saveConfig, getMediaTypeFromMessage, downloadMediaBuffer, getQuotedMediaBuffer, unwrapMessagePayload, exec, util, path, fs }) {
        try {
                const os = await import('os');
                const execAsync = util.promisify(exec);
                const config = loadConfig();
                const stickerConfig = config.sticker || { pack: 'WhatsApp Bot', author: 'Wilykun' };

                const args = query ? query.split(' ') : [];

                if (args[0] === 'author' || args[0] === 'pack') {
                        const type = args[0];
                        let value = args.slice(1).join(' ').trim();
                        if (!value) {
                                await tolak(hisoka, m, `❌ Masukkan nama ${type}!\n\nContoh: .s ${type} ${type === 'author' ? 'Wily' : 'Bot Pack'}`);
                                return;
                        }
                        if (value.length > 50) value = value.substring(0, 50);
                        const freshConfig = loadConfig();
                        if (!freshConfig.sticker) freshConfig.sticker = { pack: 'WhatsApp Bot', author: 'Wilykun' };
                        freshConfig.sticker[type] = value;
                        saveConfig(freshConfig);
                        await tolak(hisoka, m, `✅ Sticker ${type} berhasil diubah menjadi: *${value}*`);
                        logCommand(m, hisoka, m.command || 'sticker');
                        return;
                }

                const stickerCurrentType = getMediaTypeFromMessage(m);
                const stickerQuotedType = m.isQuoted ? getMediaTypeFromMessage(m.quoted) : '';
                const canUseCurrentMedia = m.isMedia && (stickerCurrentType === 'imageMessage' || stickerCurrentType === 'videoMessage');
                const canUseQuotedMedia = m.isQuoted && (stickerQuotedType === 'imageMessage' || stickerQuotedType === 'videoMessage');

                if (!canUseCurrentMedia && !canUseQuotedMedia) {
                        if (query) return;
                        const freshConfig = loadConfig();
                        const sc = freshConfig.sticker || { pack: 'WhatsApp Bot', author: 'Wilykun' };
                        const pfxS = m.prefix || '.';
                        let text = `╭═══『 🎭 *STICKER MAKER* 』═══╮\n│\n`;
                        text += `│ 📦 *Pack   :* ${sc.pack}\n`;
                        text += `│ ✍️ *Author :* ${sc.author}\n`;
                        text += `│\n`;
                        text += `│ 📋 *Cara Pakai:*\n`;
                        text += `│ • Kirim/reply 🖼️ *gambar* + ${pfxS}s\n`;
                        text += `│ • Kirim/reply 🎥 *video* + ${pfxS}s\n`;
                        text += `│   _(video otomatis jadi animated sticker)_\n`;
                        text += `│\n`;
                        text += `│ ⚙️ *Pengaturan:*\n`;
                        text += `│ • ${pfxS}s author <nama>\n`;
                        text += `│ • ${pfxS}s pack <nama>\n`;
                        text += `│\n`;
                        text += `│ 🏷️ *Alias:* ${pfxS}s · ${pfxS}stiker · ${pfxS}sticker\n`;
                        text += `╰══════════════════════╯`;
                        await tolak(hisoka, m, text);
                        logCommand(m, hisoka, m.command || 'sticker');
                        return;
                }

                await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

                let mediaBuffer;
                let mediaType;
                let videoDuration = 0;

                if (canUseCurrentMedia) {
                        mediaBuffer = await downloadMediaBuffer(hisoka, m);
                        mediaType = stickerCurrentType;
                        if (stickerCurrentType === 'videoMessage') {
                                videoDuration = m.message?.videoMessage?.seconds ||
                                        m.content?.seconds ||
                                        unwrapMessagePayload(m)?.videoMessage?.seconds ||
                                        0;
                        }
                } else if (canUseQuotedMedia) {
                        mediaBuffer = await getQuotedMediaBuffer(hisoka, m);
                        mediaType = stickerQuotedType;
                        if (stickerQuotedType === 'videoMessage') {
                                videoDuration = m.quoted?.message?.videoMessage?.seconds ||
                                        m.quoted?.content?.seconds ||
                                        m.quoted?.raw?.videoMessage?.seconds ||
                                        unwrapMessagePayload(m.quoted)?.videoMessage?.seconds ||
                                        0;
                        }
                } else {
                        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                        await tolak(hisoka, m, '❌ Reply/kirim *gambar* atau *video* untuk membuat sticker!');
                        return;
                }

                if (mediaType === 'videoMessage' && videoDuration > 10) {
                        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                        await tolak(hisoka, m, `❌ Video terlalu panjang! (${videoDuration} detik)\nMaksimal *10 detik* untuk sticker animasi.`);
                        return;
                }

                if (!mediaBuffer || mediaBuffer.length === 0) {
                        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                        await tolak(hisoka, m, '❌ Gagal download media, coba lagi');
                        return;
                }

                const freshConfig = loadConfig();
                const freshSC = freshConfig.sticker || { pack: 'WhatsApp Bot', author: 'Wilykun' };

                let stickerBuffer;

                if (mediaType === 'videoMessage') {
                        const tmpDir = os.default.tmpdir();
                        const uniqR  = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                        const tmpIn  = path.join(tmpDir, `stk_in_${uniqR}.mp4`);
                        const tmpOut = path.join(tmpDir, `stk_out_${uniqR}.webp`);
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

                                stickerBuffer = webpBuf;
                        } finally {
                                try { fs.unlinkSync(tmpIn); } catch {}
                                try { fs.unlinkSync(tmpOut); } catch {}
                        }
                        /* video/GIF: tulis EXIF pack+author dari config (seperti jalur gambar) */
                        const { Exif: WSFExif } = await import('wa-sticker-formatter');
                        const exif = new WSFExif({
                                pack: freshSC.pack,
                                author: freshSC.author,
                                categories: ['🎭'],
                                id: 'com.wilykun.wabot',
                        });
                        stickerBuffer = await exif.add(stickerBuffer);
                } else {
                        const { Sticker, StickerTypes } = await import('wa-sticker-formatter');
                        const sticker = new Sticker(mediaBuffer, {
                                pack: freshSC.pack,
                                author: freshSC.author,
                                type: StickerTypes.FULL,
                                categories: ['🎭'],
                                id: 'com.wilykun.wabot',
                                quality: 90
                        });
                        stickerBuffer = await sticker.toBuffer();
                }

                if (!stickerBuffer || stickerBuffer.length === 0) {
                        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                        await tolak(hisoka, m, '❌ Gagal membuat sticker');
                        return;
                }

                await hisoka.sendMessage(m.from, { sticker: stickerBuffer }, { quoted: m });
                await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                logCommand(m, hisoka, m.command || 'sticker');
        } catch (error) {
                console.error('\x1b[31m[Sticker] Error:\x1b[39m', error.message);
                await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                await tolak(hisoka, m, `❌ Gagal buat sticker: ${error.message}`);
        }
}

export { handleSticker };
/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const command = /^(stiker|sticker|s)$/i;
export const tags = ['media'];
export const help = ['stiker'];
export default handleSticker;
