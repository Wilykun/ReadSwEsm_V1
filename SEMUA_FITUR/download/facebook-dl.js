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
 *  facebook-dl.js — Downloader Facebook (.fb)
 *  Download video/reels Facebook tanpa login
 * ───────────────────────────────
 */
'use strict';

// Caption .fb memakai wrapper yang mencoba Ish Chat (gpt-oss-120b) lebih dulu,
// lalu model Gemini jika provider utama gagal. Gemini ESM dari ctx tetap dipakai untuk vision.
import { gemini as captionAi } from '../ai/gemini.js';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { buildFbVideoFramesPrompt } from '../../src/helper/AiPromptFb.js';

// ── Gemini API RESMI (API key dari config.json → "geminiApiKey") ─────────────
// Dipakai untuk vision + caption .fb agar full AI & akurat (bukan scraper
// token yang auth-nya mati berkala). config.json dibaca SEGAR tiap panggilan
// → ganti key di config langsung berlaku tanpa restart. Tanpa key valid,
// alur jatuh ke rantai lama (askWithImage / Ish Chat / fallback caption).
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

// ── Analisis FRAME VIDEO via API resmi ───────────────────────────────────────
// Unduh video (maks 45MB) → ekstrak 5 frame (ffmpeg) → kirim multi-image ke
// Gemini. Jauh lebih akurat daripada analisis thumbnail saja. Gagal di titik
// mana pun → '' (pemanggil jatuh ke analisis thumbnail).
const runFile = (bin, args, timeoutMs = 60000) => new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
        (err, stdout) => err ? reject(err) : resolve(stdout || ''));
});

async function analyzeFbVideoFrames(videoUrl, promptText) {
    if (!getGeminiApiKey() || !videoUrl) return '';
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbframes-'));
    try {
        const videoPath = path.join(dir, 'video.mp4');
        const r = await fetch(videoUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0', 'Referer': 'https://www.facebook.com/' },
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
        if (text) console.log(`[FB] Vision: analisis ${got} frame video via Gemini API resmi (config)`);
        return text || '';
    } catch (_) { return ''; }
    finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
}

/**
 * Handler untuk command .fb / .facebook / .fbdl
 * @param {object} hisoka - bot socket
 * @param {object} m       - pesan
 * @param {string} query   - URL Facebook
 * @param {object} ctx     - { gemini, tolak, logCommand,
 *                            buildFbVisionPrompt, buildFbCaptionPrompt,
 *                            buildFbFallbackCaption, parseFbMetaHtml, formatFbCount }
 */

// ── Primary scraper: alwayscodex savefrom API ─────────────────────────────────
async function fetchAlwayscodexFb(url) {
    try {
        const res = await fetch('https://api.alwayscodex.my.id/api/downloader/savefrom', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, type: 'vidio' }),
            signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) return null;
        const json = await res.json();
        if (!json?.status || !Array.isArray(json?.data) || json.data.length === 0) return null;

        // Ambil video (bukan audio), urutkan kualitas tertinggi dulu
        const videos = json.data
            .filter(item => item.url && !item.is_audio)
            .sort((a, b) => {
                const qa = parseInt(a.quality) || 0;
                const qb = parseInt(b.quality) || 0;
                return qb - qa; // descending: 720 > 360 > 4
            });

        if (!videos.length) return null;

        const best = videos[0];
        return {
            url      : best.url,
            quality  : best.quality === '720' ? 'HD' : best.quality === '480' ? 'SD' : best.quality || 'SD',
            isHD     : parseInt(best.quality) >= 480,
            isVideo  : true,
            title    : best.title || '',
            thumbnail: best.thumbnail || null,
            _source  : 'alwayscodex',
        };
    } catch (e) {
        console.log('[FB] alwayscodex failed:', e.message);
        return null;
    }
}

// ── Fallback 1: archive.lick.eu.org ──────────────────────────────────────────
async function fetchArchiveFb(url) {
    try {
        const apiUrl = `https://archive.lick.eu.org/api/download/facebook?url=${encodeURIComponent(url)}`;
        const res = await fetch(apiUrl, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data?.status || !data?.result?.media?.length) return null;

        // API mengembalikan URL sebagai string pada beberapa respons, bukan selalu object.
        const mediaList = data.result.media
            .map(item => typeof item === 'string' ? { url: item } : item)
            .filter(item => typeof item?.url === 'string' && item.url.startsWith('https://'));
        if (!mediaList.length) return null;

        const hdMedia = mediaList.find(item => {
            const quality = String(item.quality || '').toLowerCase();
            return quality.includes('hd') || quality.includes('high') || Number.parseInt(quality, 10) >= 480;
        });
        const best = hdMedia || mediaList[0];

        return {
            url      : best.url,
            quality  : hdMedia ? 'HD' : best.quality || 'SD',
            isHD     : !!hdMedia,
            isVideo  : true,
            title    : data.result.metadata?.title || '',
            thumbnail: data.result.metadata?.thumbnail || data.result.metadata?.image || data.result.thumbnail || null,
            _source  : 'archive',
        };
    } catch (e) {
        console.log('[FB] archive fallback failed:', e.message);
        return null;
    }
}

// ── Fallback 2: Chrome UA page scraping ──────────────────────────────────────
async function fetchChromeUAFb(url) {
    try {
        const axios = (await import('axios')).default;
        const { data: pageData } = await axios.get(url, {
            maxRedirects: 10,
            headers: {
                'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept'         : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'sec-fetch-dest' : 'document',
                'sec-fetch-mode' : 'navigate',
                'sec-fetch-site' : 'none',
            },
            timeout: 20000,
        });
        const cleaned = pageData.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        const hdMatch  = cleaned.match(/"browser_native_hd_url":"([^"]+)"/) || cleaned.match(/"playable_url_quality_hd":"([^"]+)"/);
        const sdMatch  = cleaned.match(/"browser_native_sd_url":"([^"]+)"/) || cleaned.match(/"playable_url":"([^"]+)"/);
        const hdUrl    = hdMatch ? hdMatch[1].replace(/\\/g, '') : null;
        const sdUrl    = sdMatch ? sdMatch[1].replace(/\\/g, '') : null;
        const videoUrl = hdUrl || sdUrl;
        if (!videoUrl || !videoUrl.startsWith('https://')) return null;
        return {
            url    : videoUrl,
            quality: hdUrl ? 'HD' : 'SD',
            isHD   : !!hdUrl,
            isVideo: true,
            _source: 'chrome_ua',
        };
    } catch (e) {
        console.log('[FB] chrome UA fallback failed:', e.message);
        return null;
    }
}

async function handleFacebookDl(hisoka, m, query, ctx) {
    const {
        gemini, tolak, logCommand,
        buildFbVisionPrompt, buildFbCaptionPrompt,
        buildFbFallbackCaption, parseFbMetaHtml, formatFbCount,
    } = ctx;

    if (!query) {
        await tolak(hisoka, m,
            '❌ Masukkan link Facebook!\n\nContoh:\n' +
            '.fb https://www.facebook.com/watch?v=xxx\n' +
            '.fb https://fb.watch/xxx\n' +
            '.fb https://www.facebook.com/reel/xxx\n' +
            '.fb https://www.facebook.com/stories/xxx'
        );
        logCommand(m, hisoka, m.command || 'facebook');
        return;
    }

    const fbUrl = query.trim();
    if (!fbUrl.includes('facebook.com') && !fbUrl.includes('fb.watch') && !fbUrl.includes('fb.com')) {
        await tolak(hisoka, m, '❌ Link tidak valid! Pastikan link dari Facebook.');
        return;
    }

    const loadingMsg = await tolak(hisoka, m, '⏳ Sedang mengunduh dari Facebook...');

    const isStory = fbUrl.includes('/stories/') || fbUrl.includes('story.php') || fbUrl.includes('/story/');
    const isReel  = fbUrl.includes('/reel/');

    // ── Fetch semua sumber paralel ────────────────────────────────────────────
    const [acResult, archiveResult, metaHtmlResult] = await Promise.allSettled([
        fetchAlwayscodexFb(fbUrl),
        fetchArchiveFb(fbUrl),
        // Fetch meta HTML untuk og: tags (caption)
        (async () => {
            const axios = (await import('axios')).default;
            const { data } = await axios.get(fbUrl, {
                maxRedirects: 10,
                headers: {
                    'User-Agent'     : 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
                },
                timeout: 15000,
            });
            return data;
        })(),
    ]);

    // ── Prioritas: alwayscodex → archive → chrome UA ──────────────────────────
    let mediaData = null;

    const acData = acResult.status === 'fulfilled' ? acResult.value : null;
    if (acData?.url) {
        mediaData = acData;
        console.log('[FB] ✅ Scraper: alwayscodex');
    }

    if (!mediaData) {
        const archiveData = archiveResult.status === 'fulfilled' ? archiveResult.value : null;
        if (archiveData?.url) {
            mediaData = archiveData;
            console.log('[FB] ✅ Scraper: archive (fallback)');
        }
    }

    if (!mediaData) {
        // Chrome UA: jalan sequential (butuh network call baru, tidak bisa di-paralel awal)
        mediaData = await fetchChromeUAFb(fbUrl);
        if (mediaData) console.log('[FB] ✅ Scraper: chrome_ua (fallback)');
    }

    const metaHtml = metaHtmlResult.status === 'fulfilled' ? metaHtmlResult.value || '' : '';

    if (!mediaData?.url) {
        await m.reply({ edit: loadingMsg.key, text: '❌ Gagal mengunduh. Video/story mungkin private, perlu login, atau link tidak valid.' });
        return;
    }

    // ── Parse metadata ─────────────────────────────────────────────────────────
    const parsedMeta  = parseFbMetaHtml(metaHtml);
    // Filter title berupa ID angka atau judul generik dari API → pakai metadata Facebook.
    const rawApiTitle = mediaData.title || '';
    const isApiTitleId = /^\d+$/.test(rawApiTitle.trim()) || /^(video|reel|story)\s+\d{5,}$/i.test(rawApiTitle.trim());
    const isGenericApiTitle = /^facebook(?:\s+video)?(?:\.\.\.|…)?$/i.test(rawApiTitle.trim());
    const pageTitle   = (!isApiTitleId && !isGenericApiTitle && rawApiTitle) ? rawApiTitle : (parsedMeta.pageTitle || '');
    const mediaType   = isStory ? 'story' : isReel ? 'reel' : parsedMeta.mediaType || 'video';
    const views       = parsedMeta.views || '';
    const likes       = parsedMeta.likes  || '';
    const quality     = mediaData.quality || '';
    const hashtags    = parsedMeta.hashtags || [];
    const description = parsedMeta.description || '';

    await m.reply({ edit: loadingMsg.key, text: '✅ Berhasil! Menganalisis konten...' });

    // ── Gemini vision ─────────────────────────────────────────────────────────
    // Prioritas tertinggi: analisis 5 FRAME VIDEO via API resmi (paling akurat —
    // membaca isi videonya, bukan cuma sampul). Gagal → analisis thumbnail.
    let fbVisualDesc = '';
    if (mediaData.isVideo !== false && mediaData.url) {
        try { fbVisualDesc = await analyzeFbVideoFrames(mediaData.url, buildFbVideoFramesPrompt()); }
        catch (_) {}
    }
    const thumbUrl = mediaData.thumbnail || null;
    if (!fbVisualDesc && thumbUrl) {
        try {
            const { default: axiosLib } = await import('axios');
            const thumbRes = await axiosLib.get(thumbUrl, {
                responseType: 'arraybuffer',
                timeout      : 12000,
                headers      : { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36' },
            });
            const thumbBuf = Buffer.from(thumbRes.data);
            if (thumbBuf.length > 500) {
                const mimeThumb = thumbRes.headers['content-type']?.split(';')[0] || 'image/jpeg';
                // Prioritas 1: API resmi (key di config.json) — analisis beneran.
                if (getGeminiApiKey()) {
                    try {
                        fbVisualDesc = await geminiOfficial([
                            { inline_data: { mime_type: mimeThumb, data: thumbBuf.toString('base64') } },
                            { text: buildFbVisionPrompt() },
                        ]);
                        if (fbVisualDesc) console.log('[FB] Vision: Gemini API resmi (config)');
                    } catch (e) {
                        console.warn('[FB] Vision API resmi gagal, coba jalur lama:', e?.message || e);
                    }
                }
                // Prioritas 2: jalur lama (scraper ctx) bila API resmi tak ada/gagal.
                if (!fbVisualDesc && gemini?.askWithImage) {
                    try {
                        fbVisualDesc = await gemini.askWithImage(buildFbVisionPrompt(), thumbBuf, mimeThumb);
                    } catch (_) {}
                }
            }
        } catch (_) {}
    }

    // ── AI caption ─────────────────────────────────────────────────────────────
    let finalCaption = buildFbFallbackCaption({ pageTitle, description, views, likes, quality, mediaType });
    const captionPrompt = buildFbCaptionPrompt({
        pageTitle, description, views, likes, quality, hashtags, mediaType,
        visualDesc: fbVisualDesc,
    });

    // Prioritas 1: API resmi (key di config.json) — caption full AI.
    let captionDone = false;
    if (getGeminiApiKey()) {
        try {
            const aiCaption = await geminiOfficial([{ text: captionPrompt }]);
            if (aiCaption) {
                finalCaption = aiCaption;
                captionDone = true;
                console.log('[FB] Caption: Gemini API resmi (config)');
            }
        } catch (e) {
            console.warn('[FB] Caption API resmi gagal, fallback rantai lama:', e?.message || e);
        }
    }

    // Prioritas 2: rantai lama (Ish Chat / Gemini scraper).
    if (!captionDone && captionAi?.ask) {
        try {
            const aiCaption = await captionAi.ask(captionPrompt);
            if (aiCaption?.trim()) finalCaption = aiCaption.trim();
        } catch (e) {
            console.warn('[FB] Caption AI gagal; memakai caption fallback:', e?.message || e);
        }
    }

    // ── Kirim video ────────────────────────────────────────────────────────────
    if (mediaData.isVideo !== false) {
        await hisoka.sendMessage(m.from, {
            video  : { url: mediaData.url },
            caption: finalCaption,
        }, { quoted: m });
    } else {
        await hisoka.sendMessage(m.from, {
            image  : { url: mediaData.url },
            caption: finalCaption,
        }, { quoted: m });
    }

    logCommand(m, hisoka, 'facebook');
}

export { handleFacebookDl };
/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const command = /^(fb|facebook|fbdl)$/i;
export const tags = ['download'];
export const help = ['fb'];
async function runHandleFacebookDl(ctx) {
    const { buildFbCaptionPrompt, buildFbFallbackCaption, buildFbVisionPrompt, formatFbCount, gemini, hisoka, logCommand, m, parseFbMetaHtml, query, tolak } = ctx;
    try {
                                            await handleFacebookDl(hisoka, m, query, { gemini, tolak, logCommand, buildFbVisionPrompt, buildFbCaptionPrompt, buildFbFallbackCaption, parseFbMetaHtml, formatFbCount });
                                    } catch (error) {
                                            console.error('\x1b[31m[Facebook] Error:\x1b[39m', error.message);
                                            await tolak(hisoka, m, `❌ Error: ${error.message}`);
                                    }
}
export default runHandleFacebookDl;
