/**
 * cookies-cmd.js — Terima cookies.txt via WhatsApp (owner only)
 *
 * Masalah: YouTube hard-block IP datacenter (Replit/panel) → .play gagal
 * "Sign in to confirm you're not a bot" walau sudah 3x fallback otomatis.
 * Satu-satunya fix yang pasti: cookies dari akun YouTube yang login.
 *
 * Cara pakai (one-time setup):
 * 1. Install extension "Get cookies.txt LOCALLY" di Chrome
 * 2. Buka youtube.com (pastikan sudah login akun Google)
 * 3. Klik extension → Export → download cookies.txt
 * 4. Kirim file cookies.txt ke bot via WhatsApp (DM, bukan grup)
 * 5. Bot otomatis simpan & pakai untuk semua download yt-dlp
 *
 * Keamanan: hanya owner yang bisa kirim; file tidak di-push ke GitHub (.gitignore).
 */
'use strict';

import fs from 'fs';
import path from 'path';

/**
 * Handle dokumen cookies.txt dari owner.
 * @returns {boolean} true jika pesan sudah diproses
 */
export async function handleCookiesDocument({ hisoka, m, tolak, downloadMediaMessage, isOwner }) {
    // Hanya dokumen
    const msgType = m.type || '';
    if (msgType !== 'documentMessage' && !m.message?.documentMessage) return false;

    const doc = m.message?.documentMessage;
    if (!doc) return false;

    const fileName = String(doc.fileName || '').toLowerCase();
    if (fileName !== 'cookies.txt') return false;

    // Hanya owner
    if (typeof isOwner === 'function' && !isOwner(m.sender)) {
        await tolak(hisoka, m, `❌ *Hanya owner yang bisa kirim cookies.txt.*`);
        return true;
    }

    try {
        await tolak(hisoka, m, `⏳ *_Menyimpan cookies..._*`);

        const buffer = await downloadMediaMessage(m, 'buffer', {}, {
            logger: undefined,
            reuploadRequest: hisoka.updateMediaMessage,
        });

        if (!buffer || buffer.length < 100) {
            await tolak(hisoka, m, `❌ *File cookies.txt tidak valid* (terlalu kecil). Pastikan export dari extension "Get cookies.txt LOCALLY" saat sudah login youtube.com.`);
            return true;
        }

        // Validasi format Netscape (header # Netscape HTTP Cookie File)
        const head = buffer.slice(0, 200).toString('utf8');
        if (!head.includes('Netscape') && !head.includes('.youtube.com')) {
            await tolak(hisoka, m, `❌ *Format tidak dikenali.* Pastikan file dari extension "Get cookies.txt LOCALLY", bukan file lain.`);
            return true;
        }

        const dest = path.join(process.cwd(), 'cookies.txt');
        fs.writeFileSync(dest, buffer);

        await tolak(hisoka, m, `✅ *Cookies tersimpan!*\n\n.play/.ytmp3/.ytmp4 sekarang pakai akun YouTube-mu — harusnya tembus walau IP server di-block.\n\n_File tidak di-push ke GitHub (aman)._`);
        console.log(`[Cookies] cookies.txt diterima dari ${m.sender}, tersimpan (${buffer.length} bytes)`);
        return true;
    } catch (e) {
        console.error('[Cookies] Gagal simpan:', e.message);
        await tolak(hisoka, m, `❌ *Gagal menyimpan cookies:* ${e.message}`);
        return true;
    }
}

/**
 * Instruksi .setcookies
 */
export function cookiesInstructions() {
    return `🍪 *Cara Buka Blokir YouTube (.play error "Sign in to confirm")*\n\n` +
        `IP server (Replit/panel) di-block YouTube. Fix satu kali:\n\n` +
        `1. Install extension Chrome: *Get cookies.txt LOCALLY*\n` +
        `2. Buka *youtube.com* (pastikan sudah login)\n` +
        `3. Klik extension → *Export* → download cookies.txt\n` +
        `4. *Kirim file cookies.txt ke bot* via chat ini\n` +
        `5. Selesai — bot otomatis pakai untuk semua download\n\n` +
        `_Hanya owner. File aman, tidak di-push ke GitHub._`;
}
