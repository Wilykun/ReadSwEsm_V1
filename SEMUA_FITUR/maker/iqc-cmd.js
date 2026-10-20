/**
 * ───────────────────────────────
 *  Base Script : Bang Dika Ardnt
 *  Recode By   : Bang Wilykun
 *  WhatsApp    : 6289688206739
 *  Telegram    : @Wilykun1994
 * ───────────────────────────────
 *
 *  iqc-cmd.js — iPhone Quoted Chat
 *  Pakai library iqc-canvas (Hann Universe) — generator IQC asli.
 *  Ketik .iqc <teks> → langsung jadi gambar screenshot ala iPhone.
 *
 *  Alur:
 *  .iqc <teks>   → generate dari teks
 *  .iqc          → teks quote acak
 *  reply + .iqc  → generate dari pesan yang di-reply
 * ───────────────────────────────
 */
'use strict';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { generateIQC } = require('iqc-canvas');

/* ═══ Daftar quote acak (dipakai kalau .iqc tanpa teks) ═══ */
const IQC_QUOTES = [
    'Jika hari ini belum berhasil, bukan berarti impianmu telah berakhir',
    'Tetap semangat, proses tidak pernah mengkhianati hasil',
    'Jangan menyerah, hal baik butuh waktu',
    'Kegagalan adalah guru terbaik',
    'Mulai saja dulu, sempurnakan sambil jalan',
    'Hari ini lelah, besok bangga',
    'Fokus pada tujuan, bukan pada rintangan',
    'Sedikit demi sedikit, lama-lama menjadi bukit',
    'Percaya pada prosesmu sendiri',
    'Tidak ada yang instan, semua butuh perjuangan',
];

function nowHM() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + '.' + String(d.getMinutes()).padStart(2, '0');
}

/* ═══ Handler utama ═══ */

async function handleIqc({ hisoka, m, query, tolak, logCommand, logError, getQuotedMediaBuffer, downloadMediaBuffer, iqcLastMsg }) {
    try {
        logCommand(m, hisoka, m.command || 'iqc');

        /* ── Sumber pesan: argumen → reply → pesan terakhir di chat → acak ── */
        let text = String(query || '').trim();
        let quotedMedia = null; // injected m dari pesan sumber (buat download sticker)

        if (!text && m.isQuoted && m.quoted) {
            text = String(m.quoted?.text || m.quoted?.caption || m.quoted?.body || '').trim();
            quotedMedia = m.quoted;
        }
        if (!text && !quotedMedia?.type?.includes('sticker')) {
            // Coba pesan terakhir di chat ini
            const last = (iqcLastMsg instanceof Map) ? iqcLastMsg.get(m.from) : null;
            if (last) {
                const lt = String(last.type || '');
                if (lt.includes('sticker')) {
                    quotedMedia = last;
                } else {
                    const ltext = String(last.text || last.caption || '').trim();
                    if (ltext) text = ltext;
                }
            }
        }
        if (!text && !quotedMedia) {
            text = IQC_QUOTES[Math.floor(Math.random() * IQC_QUOTES.length)];
        }

        /* ── Sticker: download dari pesan sumber (reply / pesan terakhir) ── */
        let stickerPath = null;
        try {
            const qtype = String(quotedMedia?.type || '');
            if (quotedMedia && qtype.includes('sticker')) {
                let buf = null;
                // Reply → pakai getQuotedMediaBuffer; pesan terakhir → downloadMediaBuffer langsung
                if (quotedMedia === m.quoted && typeof getQuotedMediaBuffer === 'function') {
                    buf = await getQuotedMediaBuffer(hisoka, m);
                } else if (typeof downloadMediaBuffer === 'function') {
                    buf = await downloadMediaBuffer(hisoka, quotedMedia);
                }
                if (buf && buf.length > 0) {
                    const fs = await import('fs');
                    const os = await import('os');
                    const path = await import('path');
                    stickerPath = path.join(os.tmpdir(), `iqc-sticker-${Date.now()}.webp`);
                    fs.writeFileSync(stickerPath, buf);
                    // Sticker mode: teks tetap diisi (jadi fallback / tidak dipakai lib saat sticker ada)
                    if (!text) text = ' ';
                }
            }
        } catch (e) {
            console.error('[IQC] Sticker download gagal:', e?.message);
        }

        await hisoka.sendMessage(m.from, { react: { text: '📱', key: m.key } });

        const options = stickerPath ? { sticker: stickerPath } : {};
        const result = await generateIQC(text.slice(0, 400), nowHM(), options);

        // Bersihkan file temp sticker
        if (stickerPath) {
            try { (await import('fs')).unlinkSync(stickerPath); } catch (_) {}
        }

        if (!result?.success || !result.image) {
            throw new Error('generateIQC gagal');
        }

        await hisoka.sendMessage(m.from, {
            image: result.image,
            caption: `📱 *IQC*`,
            mimetype: 'image/png',
        }, { quoted: m });
        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });

    } catch (err) {
        console.error('[IQC] Error:', err?.message);
        if (typeof logError === 'function') logError(err instanceof Error ? err : new Error(String(err?.message || err)), 'iqc');
        try { await tolak(hisoka, m, '❌ *IQC gagal.* Coba lagi.'); } catch (_) {}
    }
}

export { handleIqc };

export const plugins = [
    { command: /^(iqc)$/i, tags: ['maker'], help: ['iqc'], handler: 'handleIqc' },
];
