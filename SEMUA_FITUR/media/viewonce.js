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
 *  viewonce.js — View once handler (REWRITE ESM, 17 Nov 2026)
 *  Perintah .rvo untuk buka ulang & simpan pesan view once
 *  Murni ESM (export/import) — tidak ada require/module.exports.
 *
 *  Cara kerja (urutan sumber media):
 *  1. Cache disk voCache (pesan view-once yang sempat disimpan bot saat masuk)
 *  2. Media asli dari m.quoted (pesan asli lengkap, hidup 60 detik di cache pesan)
 *  3. Salinan quote — hanya bila masih bawa kunci unduh (url/directPath/thumbnail)
 *  4. Re-upload: minta pengirim upload ulang bila ada mediaKey (batas 60 detik)
 *  5. Bila tidak ada kunci apa pun (placeholder): error jujur, bukan error Baileys
 * ───────────────────────────────
 */
'use strict';

// Semua pembungkus view-once yang dikenal (V2Lid defensif — belum ada di Baileys rc14).
const PEMBUNGKUS_VO = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'viewOnceMessageV2Lid'];
const TIPE_MEDIA = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];

// Kupas ephemeral + semua pembungkus view-once sampai ke isi media.
// Kembalikan { mediaMessage, mediaType, isViewOnce } atau null bila tidak ada media.
function cariMedia(pesan) {
        if (!pesan || typeof pesan !== 'object') return null;
        let isi = pesan;
        let ketemuVo = false;
        if (isi.ephemeralMessage?.message) isi = isi.ephemeralMessage.message;
        let berubah = true;
        while (berubah) {
                berubah = false;
                for (const bungkus of PEMBUNGKUS_VO) {
                        if (isi[bungkus]?.message) {
                                isi = isi[bungkus].message;
                                ketemuVo = true;
                                berubah = true;
                                break;
                        }
                }
        }
        for (const tipe of TIPE_MEDIA) {
                if (isi[tipe]) {
                        return {
                                mediaMessage: isi[tipe],
                                mediaType: tipe,
                                isViewOnce: ketemuVo ||
                                        isi[tipe].viewOnce === true ||
                                        PEMBUNGKUS_VO.some((b) => !!pesan[b] || !!pesan.ephemeralMessage?.message?.[b])
                        };
                }
        }
        return null;
}

// Media bisa diunduh bila bawa salah satu kunci ini.
function kunciUnduh(media) {
        return !!(media?.url || media?.directPath || media?.thumbnailDirectPath);
}

// Download media view-once dengan fallback re-upload: Baileys hanya mencoba re-upload
// otomatis untuk error 410/404, sementara salinan quote yang kehilangan url/directPath
// gagal dengan 400 — jadi bila download pertama gagal, minta pengirim upload ulang medianya.
async function unduhMediaVo(hisoka, dlMsg, downloadMediaMessage) {
        try {
                return await downloadMediaMessage(dlMsg, 'buffer', {}, { logger: hisoka.logger, reuploadRequest: hisoka.updateMediaMessage });
        } catch (ePertama) {
                try {
                        if (typeof hisoka.updateMediaMessage !== 'function') throw ePertama;
                        const batasWaktu = new Promise((_, tolak) => setTimeout(() => tolak(new Error('reupload timeout')), 60000));
                        await Promise.race([hisoka.updateMediaMessage(dlMsg), batasWaktu]);
                        return await downloadMediaMessage(dlMsg, 'buffer', {}, { logger: hisoka.logger, reuploadRequest: hisoka.updateMediaMessage });
                } catch {
                        throw ePertama;
                }
        }
}

// Bangun pesan download dari kandidat media (pakai key pesan asli bila ada).
function bangunDlMsg(m, mediaPakai, contextInfo, quotedParticipant, quotedStanzaId, isJidGroup) {
        const isi = {};
        isi[mediaPakai.mediaType] = mediaPakai.mediaMessage;
        if (m.quoted?.key) return { ...m.quoted, message: isi };
        return {
                key: {
                        remoteJid: m.from, fromMe: quotedParticipant ? false : (contextInfo?.fromMe ?? false), id: quotedStanzaId,
                        ...(isJidGroup(m.from) && quotedParticipant ? { participant: quotedParticipant } : {})
                },
                message: isi
        };
}

async function handleVo({ hisoka, m, query, tolak, logCommand, quoted, downloadMediaMessage, isJidGroup, hasViewOnceCache, getViewOnceCache }) {
        try {
                if (!m.isQuoted) {
                        if (query) return;
                        await tolak(hisoka, m, `*📱 Cara Penggunaan View Once*

*Command:* .rvo / .viewonce / .vo
*Action:* Reply pesan view once yang ingin dibuka

*Format yang Didukung:*
• 🖼️ Gambar View Once
• 🎥 Video View Once
• 🎵 Audio View Once
• 📄 Dokumen View Once
• 🏷️ Sticker View Once

*Contoh Penggunaan:*
1. Reply pesan view once
2. Ketik: .rvo
3. Media akan dikirim ulang tanpa view once`);
                        logCommand(m, hisoka, m.command || 'rvo');
                        return;
                }

                const quotedMsg = m.content?.contextInfo?.quotedMessage;
                if (!quotedMsg) { await tolak(hisoka, m, 'Tidak ada pesan yang di-reply.'); return; }

                const mediaInfo = cariMedia(quotedMsg);
                if (!mediaInfo) { await tolak(hisoka, m, 'Media tidak ditemukan dalam pesan yang di-reply.'); return; }

                const contextInfo       = m.content?.contextInfo;
                const quotedParticipant = contextInfo?.participant;
                const quotedStanzaId    = contextInfo?.stanzaId;

                // Media asli lengkap dari pesan asli (m.quoted) — salinan quote WhatsApp
                // untuk view-once TIDAK membawa url/directPath, jadi jangan download dari situ.
                const asli = m.quoted?.message ? cariMedia(m.quoted.message) : null;

                // Diagnosa live: kunci media apa saja yang ada di pesan asli vs salinan quote.
                // Yang dicatat hanya nama kunci + boolean — tidak ada nilai media / URL.
                const kunciAtas = m.quoted?.message ? Object.keys(m.quoted.message) : [];
                console.log(`[RVO-DIAG] stanza:${quotedStanzaId} | cacheVo:${!!(quotedStanzaId && hasViewOnceCache(quotedStanzaId))} | quoted:${!!m.quoted?.key} quotedKeys:${kunciAtas.join(',')} | asliTipe:${asli?.mediaType || '-'} asliUrl:${!!asli?.mediaMessage?.url} asliPath:${!!asli?.mediaMessage?.directPath} asliThumb:${!!asli?.mediaMessage?.thumbnailDirectPath} asliKey:${!!asli?.mediaMessage?.mediaKey} | stripTipe:${mediaInfo.mediaType} stripUrl:${!!mediaInfo.mediaMessage?.url} stripPath:${!!mediaInfo.mediaMessage?.directPath} stripThumb:${!!mediaInfo.mediaMessage?.thumbnailDirectPath} stripKey:${!!mediaInfo.mediaMessage?.mediaKey}`);

                await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

                let buffer = null, cachedMeta = null;
                if (quotedStanzaId && hasViewOnceCache(quotedStanzaId)) {
                        const cached = getViewOnceCache(quotedStanzaId);
                        if (cached) { buffer = cached.buffer; cachedMeta = cached.meta; }
                }

                if (!buffer) {
                        // Pilih media terbaik yang masih punya kunci unduh: asli dulu, baru salinan.
                        let mediaPakai = null;
                        if (asli && kunciUnduh(asli.mediaMessage)) mediaPakai = asli;
                        else if (kunciUnduh(mediaInfo.mediaMessage)) mediaPakai = mediaInfo;

                        if (mediaPakai) {
                                const dlMsg = bangunDlMsg(m, mediaPakai, contextInfo, quotedParticipant, quotedStanzaId, isJidGroup);
                                buffer = await unduhMediaVo(hisoka, dlMsg, downloadMediaMessage);
                        } else {
                                // Tidak ada kunci unduh di mana pun — coba re-upload langsung
                                // bila ada mediaKey di pesan asli atau salinan.
                                const berkunci = (asli?.mediaMessage?.mediaKey && asli) || (mediaInfo.mediaMessage?.mediaKey && mediaInfo) || null;
                                if (berkunci && typeof hisoka.updateMediaMessage === 'function') {
                                        const dlMsg = bangunDlMsg(m, berkunci, contextInfo, quotedParticipant, quotedStanzaId, isJidGroup);
                                        try {
                                                const batasWaktu = new Promise((_, tolak) => setTimeout(() => tolak(new Error('reupload timeout')), 60000));
                                                await Promise.race([hisoka.updateMediaMessage(dlMsg), batasWaktu]);
                                                buffer = await downloadMediaMessage(dlMsg, 'buffer', {}, { logger: hisoka.logger, reuploadRequest: hisoka.updateMediaMessage });
                                        } catch { buffer = null; }
                                }
                        }

                        if (!buffer) {
                                // Tidak ada kunci apa pun: bot tidak menyimpan media untuk pesan
                                // ini — masuk saat bot offline, atau WhatsApp hanya mengirim
                                // placeholder (tanpa media) ke perangkat tertaut bot.
                                if (!asli?.mediaMessage?.mediaKey && !mediaInfo.mediaMessage?.mediaKey) {
                                        throw new Error('BOT_TANPA_MEDIA');
                                }
                                throw new Error('No valid media URL or directPath present in message');
                        }
                }

                const jakartaTime = new Date().toLocaleString('id-ID', {
                        timeZone: 'Asia/Jakarta', weekday: 'long', year: 'numeric', month: 'long',
                        day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
                });
                const caption    = cachedMeta?.caption || mediaInfo.mediaMessage.caption || '';
                const senderName = cachedMeta?.senderName || m.quoted?.pushName || m.pushName || 'Unknown';
                const voLabel    = mediaInfo.isViewOnce ? 'View Once' : 'Media';

                const formatCaption = (type, originalCaption = '') =>
                        `╭═══『 *📱 ${voLabel.toUpperCase()} MEDIA* 』═══╮\n│\n│ *🎯 Type:* ${type}\n│ *⏰ Waktu:* ${jakartaTime} WIB\n│ *💬 Caption:* ${originalCaption || 'No caption'}\n│ *📱 Sender:* ${senderName}\n│ *✅ Status:* Berhasil dibuka\n│\n╰═════════════════════╯\n\n_📱 ${voLabel} berhasil dibuka!_`;

                let sendOptions = {};
                switch (mediaInfo.mediaType) {
                        case 'imageMessage':    sendOptions = { image: buffer, caption: formatCaption('🖼️ Image', caption) }; break;
                        case 'videoMessage':    sendOptions = { video: buffer, caption: formatCaption('🎥 Video', caption) }; break;
                        case 'audioMessage':    sendOptions = { audio: buffer, mimetype: cachedMeta?.mimetype || mediaInfo.mediaMessage.mimetype || 'audio/ogg; codecs=opus', ptt: cachedMeta?.ptt || mediaInfo.mediaMessage.ptt || false }; break;
                        case 'documentMessage': sendOptions = { document: buffer, caption: formatCaption('📄 Document', caption), mimetype: cachedMeta?.mimetype || mediaInfo.mediaMessage.mimetype || 'application/octet-stream', fileName: cachedMeta?.fileName || mediaInfo.mediaMessage.fileName || 'ViewOnce_Document' }; break;
                        case 'stickerMessage':  sendOptions = { sticker: buffer }; break;
                        default: throw new Error(`Unsupported media type: ${mediaInfo.mediaType}`);
                }

                await hisoka.sendMessage(m.from, sendOptions, { quoted: m });

                await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                logCommand(m, hisoka, m.command || 'rvo');
        } catch (error) {
                console.error('\x1b[31m[RVO] Error:\x1b[39m', error.message);
                await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                if (error.message === 'BOT_TANPA_MEDIA') {
                        await tolak(hisoka, m, `Media view once ini tidak bisa dibuka: bot tidak menyimpan medianya untuk pesan ini.

Kemungkinan penyebabnya: pesan masuk saat bot offline, atau WhatsApp hanya mengirim placeholder (tanpa media) ke perangkat tertaut bot (saat ini perangkat web). Solusi: balas view once BARU selagi bot online. Bila masih gagal, perangkat harus Android — tapi _.aturbrowser v11_ saat ini ditolak WhatsApp, jadi belum ada jalan Android yang jalan.`);
                } else {
                        await tolak(hisoka, m, `Gagal membuka view once: ${error.message}`);
                }
        }
}

export { handleVo };
/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const command = /^(rvo|viewonce|vo)$/i;
export const tags = ['media'];
export const help = ['rvo'];
export default handleVo;
