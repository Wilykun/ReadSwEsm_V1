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
 *  hdvid.js — Enhance kualitas gambar HD via AI
 *  Upscale gambar lewat alwayscodex ai-enhance
 *  Support: reply gambar / kirim gambar + caption .hd
 * ───────────────────────────────
 */
'use strict';

import util from 'util';
import crypto from 'crypto';
import sharp from 'sharp';
import { hdr as upscaleWithILoveIMG } from '../ai/iloveimg.js';

// ── Enhance gambar via iLoveIMG ────────────────────────────────────────────
async function enhanceImageBuffer(buffer, mimeType = 'image/jpeg') {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error('Buffer gambar kosong atau tidak valid');
    }

    const inputMeta = await sharp(buffer).metadata();
    if (!inputMeta.width || !inputMeta.height) {
        throw new Error(`Format gambar tidak didukung: ${inputMeta.format || mimeType}`);
    }

    let lastError;
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            // iLoveIMG menerima input langsung, jadi tidak perlu upload ke image host.
            const enhanced = await upscaleWithILoveIMG(buffer, 4);
            if (!Buffer.isBuffer(enhanced) || enhanced.length === 0) {
                throw new Error('iLoveIMG mengembalikan gambar kosong');
            }

            const outputMeta = await sharp(enhanced).metadata();
            if (!outputMeta.width || !outputMeta.height) {
                throw new Error('Hasil iLoveIMG bukan file gambar yang valid');
            }

            console.log(
                `[HD] ✅ iLoveIMG upscale OK (${inputMeta.format || mimeType} ` +
                `${inputMeta.width}x${inputMeta.height} → ${outputMeta.width}x${outputMeta.height})`
            );
            return enhanced;
        } catch (error) {
            lastError = error;
            const status = Number(error?.response?.status);
            const retryable = !status || status === 408 || status === 425 ||
                status === 429 || status >= 500;
            if (attempt >= 2 || !retryable) break;
            console.warn(`[HD] iLoveIMG percobaan ${attempt} gagal; mencoba ulang:`, error.message);
            await new Promise(resolve => setTimeout(resolve, 800));
        }
    }

    const code = lastError?.cause?.code || lastError?.code;
    const detail = `${lastError?.message || 'unknown error'}${code ? ` (${code})` : ''}`;
    throw new Error(`iLoveIMG upscale gagal: ${detail}`);
}

// ── Parse quality level dari query ─────────────────────────────────────────
// Contoh input: '1k', '2k', '3k', '4x', 'max'
// Semua level punya width tetap — konsisten & predictable
function parseQuality(query) {
    if (!query) return null;
    const q = query.trim().toLowerCase().split(/\s+/)[0];
    const map = {
        '1k' : { label: '1K',  width: 1024 },
        '2k' : { label: '2K',  width: 2048 },
        '3k' : { label: '3K',  width: 3072 },
        '4x' : { label: '4X',  width: 4096 },
        'max': { label: 'MAX', width: 4096 }, // FIX Bug 3: max = 4096px, bukan null (hasil random)
    };
    return map[q] ?? null;
}

// ── Resize lokal via Sharp; tidak mengunggah ulang gambar ke host publik ───
async function resizeImageBuffer(buffer, targetWidth) {
    const width = Math.max(1, Math.round(Number(targetWidth) || 0));
    if (!width) throw new Error('Lebar resize tidak valid');

    return sharp(buffer)
        .resize({
            width,
            fit: 'inside',
            withoutEnlargement: false,
            kernel: 'lanczos3',
        })
        .jpeg({ quality: 95 })
        .toBuffer();
}

// ── Video enhancer (tetap pakai unblurimage.ai) ────────────────────────────
async function hdvideo(buffer) {
    const baseApi       = 'https://api.unblurimage.ai';
    const productSerial = crypto.randomUUID().replace(/-/g, '');
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    async function jsonFetch(url, options = {}) {
        const res  = await fetch(url, options);
        const text = await res.text();
        let json;
        try { json = text ? JSON.parse(text) : null; } catch { return { __httpError: true, status: res.status, raw: text }; }
        if (!res.ok) return { __httpError: true, status: res.status, raw: json };
        return json;
    }

    const uploadForm = new FormData();
    uploadForm.set('video_file_name', `cli-${Date.now()}.mp4`);
    const uploadResp = await jsonFetch(`${baseApi}/api/upscaler/v1/ai-video-enhancer/upload-video`, { method: 'POST', body: uploadForm });
    if (uploadResp.__httpError || uploadResp.code !== 100000) throw new Error('Upload video gagal');

    const { url: uploadUrl, object_name } = uploadResp.result || {};
    if (!uploadUrl || !object_name) throw new Error('Upload invalid');

    const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body: buffer });
    if (!putRes.ok) throw new Error('PUT video gagal');

    const cdnUrl  = `https://cdn.unblurimage.ai/${object_name}`;
    const jobForm = new FormData();
    jobForm.set('original_video_file', cdnUrl);
    jobForm.set('resolution', '2k');
    jobForm.set('is_preview', 'false');

    const createJobResp = await jsonFetch(`${baseApi}/api/upscaler/v2/ai-video-enhancer/create-job`, {
        method: 'POST', body: jobForm,
        headers: { 'product-serial': productSerial, authorization: '' },
    });
    if (createJobResp.__httpError || createJobResp.code !== 100000) throw new Error('Create job gagal');
    const { job_id } = createJobResp.result || {};
    if (!job_id) throw new Error('Job tidak valid');

    const startTime = Date.now();
    let attempt = 0;
    let result;
    while (true) {
        attempt++;
        const jobResp = await jsonFetch(`${baseApi}/api/upscaler/v2/ai-video-enhancer/get-job/${job_id}`, {
            method: 'GET',
            headers: { 'product-serial': productSerial, authorization: '' },
        });
        if (jobResp.__httpError) throw new Error('Get job gagal');
        if (jobResp.code === 100000) {
            result = jobResp.result || {};
            if (result.output_url) break;
        }
        if (Date.now() - startTime > 600000) throw new Error('Timeout proses video (10 menit)');
        await sleep(attempt === 1 ? 20000 : 10000);
    }
    return result.output_url;
}

export { hdvideo, enhanceImageBuffer };
export { handleHdvideo };
// ── COMMAND HANDLER ───────────────────────────────────────────────────────────

async function handleHdvideo({ hisoka, m, query, tolak, logCommand, fs, path, quoted, downloadMediaMessage }) {
    try {
        const isMediaMsg    = m.isMedia && (m.type === 'imageMessage' || m.type === 'videoMessage' || m.type === 'stickerMessage');
        const isQuotedMedia = m.isQuoted && quoted && quoted.isMedia &&
            (quoted.type === 'imageMessage' || quoted.type === 'videoMessage' || quoted.type === 'stickerMessage');

        // ── Tidak ada media: tampilkan panduan ─────────────────────────────
        if (!isMediaMsg && !isQuotedMedia) {
            await tolak(hisoka, m,
                `🖼️ *HD Enhancer — Gambar*\n\n` +
                `Tingkatkan kualitas gambar jadi lebih tajam & jernih via AI.\n\n` +
                `*Cara pakai:*\n` +
                `• Kirim gambar + caption *.hd* → AI enhance (default)\n` +
                `• Atau reply gambar dengan *.hd*\n\n` +
                `*Pilihan resolusi (khusus gambar):*\n` +
                `• *.hd 1k* → AI enhance + resize ~1024px\n` +
                `• *.hd 2k* → AI enhance + resize ~2048px\n` +
                `• *.hd 3k* → AI enhance + resize ~3072px\n` +
                `• *.hd 4x* → AI enhance + resize ~4096px\n` +
                `• *.hd max* → AI enhance tanpa resize (full output)\n\n` +
                `*Untuk video:*\n` +
                `• Ketik *.hdvid* / *.vidhd* / *.hdvideo*`
            );
            logCommand(m, hisoka, m.command || 'hd');
            return;
        }

        // ── Download media ─────────────────────────────────────────────────
        let mediaBuffer, mediaType;
        if (isMediaMsg) {
            mediaBuffer = await m.downloadMedia();
            mediaType   = m.type;
        } else {
            mediaBuffer = await downloadMediaMessage(
                { ...m.quoted, message: m.quoted.raw }, 'buffer', {},
                { logger: hisoka.logger, reuploadRequest: hisoka.updateMediaMessage }
            );
            mediaType = quoted.type;
        }

        if (!mediaBuffer || mediaBuffer.length === 0) {
            await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
            await tolak(hisoka, m, '❌ Gagal download media. Coba kirim ulang!');
            return;
        }

        const isVideo = mediaType === 'videoMessage';
        await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

        // ── VIDEO ──────────────────────────────────────────────────────────
        if (isVideo) {
            await tolak(hisoka, m, `⏳ Sedang memproses video ke HD...\nProses ini bisa memakan waktu beberapa menit.`);
            const resultUrl = await hdvideo(mediaBuffer);
            const videoFetch = await fetch(resultUrl);
            if (!videoFetch.ok) throw new Error('Gagal download hasil video HD');
            let videoBuffer = Buffer.from(await videoFetch.arrayBuffer());

            // Watermark timestamp

            const execAsync = util.promisify((await import('child_process')).default.exec);
            const now       = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
            const hariList  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
            const bulanList = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
            const txtLine1  = `${hariList[now.getDay()]}, ${now.getDate()} ${bulanList[now.getMonth()]} ${now.getFullYear()}`;
            const txtLine2  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')} WIB`;
            const fontBold  = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
            const tmpIn     = `/tmp/hdvid_in_${Date.now()}.mp4`;
            const tmpOut    = `/tmp/hdvid_out_${Date.now()}.mp4`;
            fs.writeFileSync(tmpIn, videoBuffer);
            const vf = [
                `drawbox=x=iw-325:y=ih-82:w=315:h=72:color=black@0.55:t=fill`,
                `drawbox=x=iw-325:y=ih-82:w=315:h=72:color=white@0.85:t=2`,
                `drawbox=x=iw-320:y=ih-50:w=305:h=1:color=white@0.5:t=fill`,
                `drawtext=fontfile='${fontBold}':text='${txtLine1}':fontsize=15:fontcolor=white:x=W-320:y=H-75:shadowcolor=black@0.9:shadowx=1:shadowy=1`,
                `drawtext=fontfile='${fontBold}':text='${txtLine2}':fontsize=18:fontcolor=cyan:x=W-320:y=H-46:shadowcolor=black@0.9:shadowx=1:shadowy=1`,
            ].join(',');
            try {
                await execAsync(`ffmpeg -y -i "${tmpIn}" -vf "${vf}" -c:v libx264 -profile:v baseline -level 3.1 -preset fast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "${tmpOut}"`, { timeout: 120000 });
                videoBuffer = fs.readFileSync(tmpOut);
            } finally {
                try { fs.unlinkSync(tmpIn); } catch (_) {}
                try { fs.unlinkSync(tmpOut); } catch (_) {}
            }
            await hisoka.sendMessage(m.from, { video: videoBuffer, mimetype: 'video/mp4', caption: '✅ Video berhasil diproses ke HD!' }, { quoted: m });
            await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });

        // ── GAMBAR (iLoveIMG AI upscale + optional local resize) ───────────────
        } else {
            // Parse quality level dari query: 1k / 2k / 3k / 4x / max
            const qual = parseQuality(query);
            const qualLabel = qual ? qual.label : 'AI';

            const loadMsg = await tolak(hisoka, m,
                `⏳ Mengunggah & enhance gambar${qual ? ` ke kualitas *${qualLabel}*` : ''}...\nMohon tunggu sebentar.`
            );

            let imgBuffer;
            try {
                const mimeType = mediaType === 'stickerMessage' ? 'image/webp' : 'image/jpeg';
                imgBuffer = await enhanceImageBuffer(mediaBuffer, mimeType);
                console.log('[HD] ✅ Enhance OK, size:', imgBuffer.length);
            } catch (enhErr) {
                console.error('[HD] enhance failed:', enhErr.message);
                throw new Error(`Gagal enhance gambar: ${enhErr.message}`);
            }

            if (!imgBuffer || imgBuffer.length === 0) throw new Error('Hasil gambar kosong');

            // ── Resize ke quality target (semua level termasuk max punya width) ──
            let finalBuffer = imgBuffer;
            if (qual) {
                await m.reply({ edit: loadMsg.key, text: `⏳ Menyesuaikan resolusi ke ${qualLabel} (~${qual.width}px)...` }).catch(() => {});
                try {
                    finalBuffer = await resizeImageBuffer(imgBuffer, qual.width);
                    console.log('[HD] ✅ Resize Sharp OK, size:', finalBuffer.length);
                } catch (resizeErr) {
                    console.warn('[HD] resize gagal, pakai hasil AI langsung:', resizeErr.message);
                    finalBuffer = imgBuffer; // fallback ke AI hasil tanpa resize
                }
            }

            // ── Caption sesuai quality ─────────────────────────────────────
            const captionInfo = qual
                ? `📐 Resolusi: *${qualLabel}* (~${qual.width}px)`
                : `📐 Resolusi: *AI Enhanced*`;

            await m.reply({ edit: loadMsg.key, text: '✅ Selesai!' }).catch(() => {});
            await hisoka.sendMessage(m.from, {
                image   : finalBuffer,
                caption : `✅ *Gambar berhasil dienhance!*\n${captionInfo}\n🔗 _Powered by iLoveIMG_`,
                mimetype: 'image/jpeg',
            }, { quoted: m });
            await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
        }

        logCommand(m, hisoka, 'hd');

    } catch (error) {
        console.error('\x1b[31m[HD] Error:\x1b[39m', error.message);
        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
        await tolak(hisoka, m, `❌ Gagal memproses: ${error.message}`);
    }
}


/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const command = /^(hd|remini|hdr|hdvid|vidhd|hdvideo)$/i;
export const tags = ['download'];
export const help = ['hd'];
export default handleHdvideo;
