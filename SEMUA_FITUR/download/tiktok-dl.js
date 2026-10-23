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
 *  tiktok-dl.js — Downloader TikTok (.tt)
 *  Download video TikTok tanpa watermark via API tikwm
 *  (pengganti @tobyg74/tiktok-api-dl yang di-block Replit)
 * ───────────────────────────────
 */
'use strict';

import { tiktokDl } from '../../src/helper/tiktokApi.js';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { buildVideoFramesAnalysisPrompt } from '../../src/helper/aiPrompt.js';

// ── Gemini API RESMI (API key dari config.json → "geminiApiKey") ─────────────
// Sama seperti .fb/.ig: caption + analisis frame video prioritas API resmi
// (config dibaca segar tiap panggilan). Tanpa key → rantai lama (gemini.ask).
function getGeminiApiKey() {
    if (process.env.GEMINI_API_KEY?.trim()) return process.env.GEMINI_API_KEY.trim();
    try {
        const cfg = JSON.parse(fs.readFileSync(new URL('../../config.json', import.meta.url), 'utf8'));
        const k = String(cfg?.geminiApiKey || '').trim();
        return k.length >= 20 ? k : '';
    } catch { return ''; }
}

async function geminiOfficial(parts, model = 'gemini-2.5-flash') {
    const key = getGeminiApiKey();
    if (!key) return '';
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ role: 'user', parts }] }),
        signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`Gemini API HTTP ${res.status}`);
    const j = await res.json();
    return (j?.candidates?.[0]?.content?.parts || []).map(p => p?.text || '').join('').trim();
}

// ── Analisis FRAME VIDEO via API resmi (unduh maks 45MB → 5 frame ffmpeg) ────
const runFile = (bin, args, timeoutMs = 60000) => new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
        (err, stdout) => err ? reject(err) : resolve(stdout || ''));
});

async function analyzeTtVideoFrames(videoUrl, promptText) {
    if (!getGeminiApiKey() || !videoUrl) return '';
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttframes-'));
    try {
        const videoPath = path.join(dir, 'video.mp4');
        const r = await fetch(videoUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0', 'Referer': 'https://www.tiktok.com/' },
            signal: AbortSignal.timeout(45000),
        });
        if (!r.ok) return '';
        const clen = Number(r.headers.get('content-length') || 0);
        if (clen > 45 * 1024 * 1024) return '';
        const buf = Buffer.from(await r.arrayBuffer());
        if (!buf.length || buf.length > 45 * 1024 * 1024) return '';
        fs.writeFileSync(videoPath, buf);
        const durOut = await runFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', videoPath], 15000);
        const duration = parseFloat(durOut) || 0;
        if (!duration || duration < 2) return '';
        const parts = [{ text: promptText }];
        let got = 0;
        for (const [i, frac] of [0.08, 0.3, 0.52, 0.74, 0.92].entries()) {
            const out = path.join(dir, `f${i}.jpg`);
            try {
                await runFile('ffmpeg', ['-v', 'error', '-ss', (duration * frac).toFixed(1), '-i', videoPath, '-frames:v', '1', '-q:v', '4', '-vf', 'scale=720:-2', out], 20000);
                const fb = fs.readFileSync(out);
                if (fb.length > 1000) { parts.push({ inline_data: { mime_type: 'image/jpeg', data: fb.toString('base64') } }); got++; }
            } catch (_) {}
        }
        if (got < 2) return '';
        const text = await geminiOfficial(parts);
        if (text) console.log(`[TT] Vision: analisis ${got} frame video via Gemini API resmi (config)`);
        return text || '';
    } catch (_) { return ''; }
    finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
}

/**
 * Handler untuk command .tt
 * @param {object} hisoka - bot socket
 * @param {object} m       - pesan
 * @param {string} query   - URL TikTok
 * @param {object} ctx     - { gemini, tolak, logCommand, buildVideoDownloadCaptionPrompt }
 */
async function handleTiktokDl(hisoka, m, query, ctx) {
    const { gemini, tolak, logCommand, buildVideoDownloadCaptionPrompt } = ctx;

    if (!query) {
        await tolak(hisoka, m, '❌ Masukkan link TikTok!\n\nContoh: .tt https://vt.tiktok.com/xxx\nAtau: .tt https://www.tiktok.com/@user/video/xxx');
        logCommand(m, hisoka, m.command || 'tiktok');
        return;
    }

    const ttUrl = query.trim();
    if (!ttUrl.includes('tiktok.com') && !ttUrl.includes('tiktok')) {
        await tolak(hisoka, m, '❌ Link tidak valid! Pastikan link dari TikTok.');
        return;
    }

    const loadingMsg = await tolak(hisoka, m, '⏳ Sedang mengunduh dari TikTok...');

    let result = null;
    let lastError = null;

    try {
        result = await tiktokDl(ttUrl);
        console.log('[TikTok] Success via tikwm API');
    } catch (e) {
        lastError = e;
    }

    if (!result || result.status !== 'success') {
        await m.reply({ edit: loadingMsg.key, text: '❌ Gagal mengunduh. Video mungkin privat atau link tidak valid.' });
        return;
    }

    const data = result.result;
    const author = data.author || {};
    const stats = data.statistics || data.stats || {};
    const desc = data.description || data.desc || '';

    const formatNum = (num) => {
        if (!num || num === 0) return null;
        const n = parseInt(num) || 0;
        if (isNaN(n) || n === 0) return null;
        return n.toLocaleString('id-ID');
    };

    const playCount    = formatNum(stats.playCount    || stats.play_count || stats.views   || data.playCount);
    const likeCount    = formatNum(stats.likeCount    || stats.like_count || stats.likes   || stats.diggCount || data.likeCount);
    const commentCount = formatNum(stats.commentCount || stats.comment_count || stats.comments || data.commentCount);
    const shareCount   = formatNum(stats.shareCount   || stats.share_count  || stats.shares   || data.shareCount);

    let infoText = `╭═══ *TIKTOK DOWNLOADER* ═══╮\n`;
    infoText += `│ 👤 @${author.nickname || author.username || author.unique_id || data.author?.nickname || 'Unknown'}\n`;
    if (playCount)    infoText += `│ 👁️ ${playCount} views\n`;
    if (likeCount)    infoText += `│ ❤️ ${likeCount} likes\n`;
    if (commentCount) infoText += `│ 💬 ${commentCount} comments\n`;
    if (shareCount)   infoText += `│ 🔄 ${shareCount} shares\n`;
    if (desc) {
        const shortDesc = desc.length > 300 ? desc.substring(0, 300) + '...' : desc;
        infoText += `│\n│ 📝 ${shortDesc}\n`;
    }
    infoText += `╰════════════════════════╯`;

    await m.reply({ edit: loadingMsg.key, text: '✅ Berhasil! Mengirim media...' });

    const pickUrl = (val) => {
        if (!val) return null;
        if (typeof val === 'string') return val;
        if (Array.isArray(val)) return val[0] || null;
        return null;
    };

    let videoUrl = null;

    videoUrl = pickUrl(data.videoHD) || pickUrl(data.videoSD) || pickUrl(data.videoWatermark);

    if (!videoUrl && data.video) {
        if (typeof data.video === 'string') {
            videoUrl = data.video;
        } else if (Array.isArray(data.video)) {
            videoUrl = data.video[0];
        } else {
            videoUrl = pickUrl(data.video.playAddr)
                || pickUrl(data.video.downloadAddr)
                || pickUrl(data.video.noWatermark);
        }
    }

    // Analisis 5 frame video via API resmi → bahan caption paling akurat.
    let ttVisualDesc = '';
    if (videoUrl) {
        try { ttVisualDesc = await analyzeTtVideoFrames(videoUrl, buildVideoFramesAnalysisPrompt('TikTok')); }
        catch (_) {}
    }

    const ttCaptionPrompt = buildVideoDownloadCaptionPrompt({
        platform: 'TikTok',
        title: desc || '',
        author: author.nickname || author.username || author.unique_id || 'Unknown',
        views: playCount || '',
        likes: likeCount || '',
        comments: commentCount || '',
        description: desc || '',
        visualDescription: ttVisualDesc,
    });

    // Caption: prioritas API resmi (key di config.json); fallback jalur lama.
    let aiCaptionTT = null;
    if (getGeminiApiKey()) {
        try {
            aiCaptionTT = await geminiOfficial([{ text: ttCaptionPrompt }]);
            if (aiCaptionTT) console.log('[TT] Caption: Gemini API resmi (config)');
        } catch (e) {
            console.warn('[TT] Caption API resmi gagal, coba jalur lama:', e?.message || e);
        }
    }
    if (!aiCaptionTT) aiCaptionTT = await gemini.ask(ttCaptionPrompt).catch(() => null);
    const finalCaptionTT = aiCaptionTT?.trim() || infoText;

    if (videoUrl) {
        try {
            await hisoka.sendMessage(m.from, {
                video: { url: videoUrl },
                caption: finalCaptionTT
            }, { quoted: m });
        } catch (videoErr) {
            console.log('[TikTok] Video send failed:', videoErr.message);
            await tolak(hisoka, m, '⚠️ Gagal mengirim video. Coba lagi nanti.');
        }
    }

    if (!videoUrl) {
        const images = data.images || data.image || [];
        if (images.length > 0) {
            await tolak(hisoka, m, `📸 Slide TikTok ditemukan (${images.length} gambar)`);
            for (let i = 0; i < Math.min(images.length, 10); i++) {
                const imgUrl = pickUrl(images[i]) || images[i];
                if (!imgUrl) continue;
                try {
                    await hisoka.sendMessage(m.from, {
                        image: { url: imgUrl },
                        caption: i === 0 ? finalCaptionTT : `📷 ${i + 1}/${images.length}`
                    }, { quoted: m });
                } catch (imgErr) {
                    console.log('[TikTok] Image send failed:', imgErr.message);
                }
            }
        } else {
            await tolak(hisoka, m, '❌ Media tidak ditemukan dalam video ini.');
        }
    }

    logCommand(m, hisoka, 'tiktok');
}

export { handleTiktokDl };
/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const command = /^(tt)$/i;
export const tags = ['download'];
export const help = ['tt'];
async function runHandleTiktokDl(ctx) {
    const { buildVideoDownloadCaptionPrompt, gemini, hisoka, logCommand, m, query, tolak } = ctx;
    try {
                                            await handleTiktokDl(hisoka, m, query, { gemini, tolak, logCommand, buildVideoDownloadCaptionPrompt });
                                    } catch (error) {
                                            console.error('\x1b[31m[TikTok] Error:\x1b[39m', error.message);
                                            await tolak(hisoka, m, `❌ Error: ${error.message}`);
                                    }
}
export default runHandleTiktokDl;
