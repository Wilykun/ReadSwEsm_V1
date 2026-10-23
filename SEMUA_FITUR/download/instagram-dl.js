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
 *  instagram-dl.js — Downloader Instagram (.ig)
 *  Download post, reels, dan story Instagram
 * ───────────────────────────────
 */
'use strict';

import axios from 'axios';
import * as cheerio from 'cheerio';
import FormData from 'form-data';
import snapInstagram from 'cakkatrok-instagram-downloader';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { buildIgVideoFramesPrompt } from '../../src/helper/AiPromptIg.js';

// ── Gemini API RESMI (API key dari config.json → "geminiApiKey") ─────────────
// Sama seperti .fb: vision + caption prioritas API resmi (config dibaca segar
// tiap panggilan → ganti key langsung berlaku). Tanpa key → rantai lama.
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

async function analyzeIgVideoFrames(videoUrl, promptText) {
    if (!getGeminiApiKey() || !videoUrl) return '';
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'igframes-'));
    try {
        const videoPath = path.join(dir, 'video.mp4');
        const r = await fetch(videoUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0', 'Referer': 'https://www.instagram.com/' },
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
        if (text) console.log(`[IG] Vision: analisis ${got} frame video via Gemini API resmi (config)`);
        return text || '';
    } catch (_) { return ''; }
    finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
}

/**
 * Handler untuk command .ig
 * @param {object} hisoka - bot socket
 * @param {object} m       - pesan
 * @param {string} query   - URL Instagram
 * @param {object} ctx     - { gemini, tolak, logCommand, exec, util,
 *                            buildIgVisionPrompt, buildIgCaptionPrompt,
 *                            buildIgFallbackCaption, parseIgMetaHtml, formatIgCount }
 */

// ── Primary scraper: alwayscodex savefrom API ─────────────────────────────────
async function fetchAlwayscodex(url) {
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

        // Normalisasi ke format igData.info[]
        return {
            media_type: 'reel',
            title: json.data[0]?.title || '',
            thumbnail: json.data[0]?.thumbnail || null,
            info: json.data
                .filter(item => item.url && !item.is_audio)
                .map(item => ({
                    url: item.url,
                    media_format: item.format === 'mp4' ? 'video' : 'image',
                    quality: item.quality || '',
                    title: item.title || '',
                })),
        };
    } catch {
        return null;
    }
}

// ── Fallback scraper: cakkatrok → SnapVideo ───────────────────────────────────
// Paket ini sudah diuji dengan reel target dan mengembalikan URL CDN video.
async function fetchCakkatrok(url) {
    const result = await snapInstagram.media(url);
    const info = (result?.media || [])
        .filter(item => item?.url)
        .map(item => ({
            url: item.url,
            media_format: item.type === 'photo' ? 'image' : 'video',
            title: item.text || '',
        }));
    if (!info.length) throw new Error('SnapVideo tidak mengembalikan media');
    return {
        media_type: info[0].media_format === 'image' ? 'photo' : 'reel',
        info,
    };
}

// ── Fallback scraper 1: vdraw.ai ──────────────────────────────────────────────
async function fetchVdraw(url) {
    const res = await fetch('https://vdraw.ai/api/v1/instagram/ins-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, type: 'video' }),
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.code === 100000 && json.data) return json.data;
    throw new Error('No data from vdraw');
}

// ── Fallback scraper 2: archive.lick.eu.org ───────────────────────────────────
async function fetchArchive(url) {
    const res = await fetch(
        `https://archive.lick.eu.org/api/download/instagram?url=${encodeURIComponent(url)}`,
        { signal: AbortSignal.timeout(12000) }
    );
    const json = await res.json();
    if (!json?.status || !json?.result) return null;
    const r = json.result;
    return {
        media_type: r.isVideo ? 'reel' : 'photo',
        info: (r.url || []).map(u => ({
            url: typeof u === 'object' ? (u.url || u.src) : u,
            media_format: r.isVideo ? 'video' : 'image',
        })),
        _archiveMeta: r,
    };
}

// ── Fallback scraper 3: Savevid (reels, posts, dan stories) ───────────────────
// Savevid mengembalikan HTML pada ajaxSearch, jadi jangan menganggap response
// selalu berupa JSON. Beberapa versi endpoint juga memblokir request tanpa
// User-Agent browser.
async function fetchSavevid(url) {
    const browserHeaders = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
    };

    const verifyForm = new FormData();
    verifyForm.append('url', url);
    const verify = await axios.post('https://savevid.net/api/userverify', verifyForm, {
        headers: { ...verifyForm.getHeaders(), ...browserHeaders },
        timeout: 15000,
    });
    const token = verify.data?.token;
    if (!token) throw new Error('Savevid token tidak tersedia');

    const searchForm = new FormData();
    searchForm.append('q', url);
    searchForm.append('t', 'media');
    searchForm.append('lang', 'en');
    searchForm.append('v', 'v2');
    searchForm.append('cftoken', token);
    const response = await axios.post('https://v3.savevid.net/api/ajaxSearch', searchForm, {
        headers: { ...searchForm.getHeaders(), ...browserHeaders },
        timeout: 20000,
    });

    const html = typeof response.data === 'string'
        ? response.data
        : response.data?.data || response.data?.html || '';
    const $ = cheerio.load(html);
    const info = [];
    $('ul.download-box > li, .download-items, .download-items__thumb').each((_, node) => {
        const link = $(node).find('a[href]').filter((__, a) => {
            const href = $(a).attr('href') || '';
            return !/thumbnail|thumb/i.test($(a).attr('class') || '') &&
                /^https?:\/\//i.test(href);
        }).first().attr('href');
        if (link) info.push({ url: link, media_format: /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(link) ? 'image' : 'video' });
    });

    // Fallback untuk perubahan markup Savevid: ambil semua href media langsung.
    if (!info.length) {
        $('a[href]').each((_, a) => {
            const href = $(a).attr('href') || '';
            if (/^https?:\/\//i.test(href) && /\.(?:mp4|m3u8|jpe?g|png|webp)(?:\?|$)/i.test(href)) {
                info.push({ url: href, media_format: /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(href) ? 'image' : 'video' });
            }
        });
    }

    const unique = [...new Map(info.map(item => [item.url, item])).values()];
    if (!unique.length) throw new Error('Savevid tidak mengembalikan media');
    return { media_type: unique[0].media_format === 'image' ? 'photo' : 'reel', info: unique };
}

async function handleInstagramDl(hisoka, m, query, ctx) {
    const {
        gemini, tolak, logCommand, exec, util,
        buildIgVisionPrompt, buildIgCaptionPrompt,
        buildIgFallbackCaption, parseIgMetaHtml, formatIgCount,
    } = ctx;

    if (!query) {
        await tolak(hisoka, m, '❌ Masukkan link Instagram!\n\nContoh: .ig https://www.instagram.com/reel/xxx');
        logCommand(m, hisoka, m.command || 'instagram');
        return;
    }

    const igRaw = query.trim();
    if (!igRaw.includes('instagram.com')) {
        await tolak(hisoka, m, '❌ Link tidak valid! Pastikan link dari Instagram.');
        return;
    }

    let igUrl = igRaw;
    try {
        const parsed = new URL(igRaw);
        igUrl = parsed.origin + parsed.pathname.replace(/\/$/, '') + '/';
    } catch (_) {}

    const loadingMsg = await tolak(hisoka, m, '⏳ Sedang mengunduh dari Instagram...');

    // ── Fetch semua sumber secara paralel ────────────────────────────────────
    const [alwayscodexResult, cakkatrokResult, vdrawResult, archiveResult, savevidResult, metaHtmlResult] = await Promise.allSettled([
        fetchAlwayscodex(igUrl),
        fetchCakkatrok(igUrl),
        fetchVdraw(igUrl),
        fetchArchive(igUrl),
        fetchSavevid(igUrl),
        fetch(igUrl, {
            signal: AbortSignal.timeout(10000),
            headers: {
                'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
            },
        }).then(r => r.text()).catch(() => ''),
    ]);

    // ── Prioritas: alwayscodex → vdraw → archive ─────────────────────────────
    let igData = null;
    let archiveMeta = {};

    const acData = alwayscodexResult.status === 'fulfilled' ? alwayscodexResult.value : null;
    if (acData?.info?.length) {
        igData = acData;
        console.log('[IG] ✅ Scraper: alwayscodex');
    }

    if (!igData) {
        const cakkatrokData = cakkatrokResult.status === 'fulfilled' ? cakkatrokResult.value : null;
        if (cakkatrokData?.info?.length) {
            igData = cakkatrokData;
            console.log('[IG] ✅ Scraper: cakkatrok/SnapVideo (fallback)');
        }
    }

    if (!igData) {
        const vd = vdrawResult.status === 'fulfilled' ? vdrawResult.value : null;
        if (vd?.info?.length) {
            igData = vd;
            console.log('[IG] ✅ Scraper: vdraw (fallback)');
        }
    }

    const archiveData = archiveResult.status === 'fulfilled' ? archiveResult.value : null;
    if (!igData && archiveData?.info?.length) {
        igData = archiveData;
        console.log('[IG] ✅ Scraper: archive (fallback)');
    }
    if (!igData) {
        const savevidData = savevidResult.status === 'fulfilled' ? savevidResult.value : null;
        if (savevidData?.info?.length) {
            igData = savevidData;
            console.log('[IG] ✅ Scraper: savevid (fallback)');
        }
    }
    if (archiveData?._archiveMeta) archiveMeta = archiveData._archiveMeta;

    const metaHtml = metaHtmlResult.status === 'fulfilled' ? metaHtmlResult.value : '';

    if (!igData?.info?.length) {
        await m.reply({ edit: loadingMsg.key, text: '❌ Gagal mengunduh. Pastikan link benar dan akun tidak private, lalu coba lagi.' });
        return;
    }

    const mediaItems = igData.info;
    const mediaType  = igData.media_type || 'reel';

    // ── Metadata caption ──────────────────────────────────────────────────────
    const parsedMeta  = parseIgMetaHtml(metaHtml);
    const fullName    = parsedMeta.fullName || '';
    const username    = archiveMeta.username || parsedMeta.username || '';
    const caption     = archiveMeta.caption  || parsedMeta.caption  || '';
    const hashtags    = parsedMeta.hashtags  || [];
    const likesNum    = archiveMeta.like    || 0;
    const commentsNum = archiveMeta.comment || 0;
    const likesStr    = parsedMeta.likes   || (likesNum    ? formatIgCount(likesNum)    : '');
    const commentsStr = commentsNum ? formatIgCount(commentsNum) : (parsedMeta.comments || '');

    await m.reply({ edit: loadingMsg.key, text: '✅ Berhasil! Mengirim media...' });

    // ── Thumbnail untuk Gemini vision ─────────────────────────────────────────
    let igThumbUrl = igData.thumbnail
        || igData.cover_url || igData.thumbnail_url || igData.cover || igData.thumb || null;

    if (!igThumbUrl && Array.isArray(mediaItems) && mediaItems[0]) {
        const first = mediaItems[0];
        igThumbUrl = first.cover || first.cover_url || first.thumbnail_url || first.thumbnail || null;
    }
    if (!igThumbUrl && Array.isArray(mediaItems)) {
        const firstPhoto = mediaItems.find(it => it.media_format === 'image' || it.media_format === 'photo');
        if (firstPhoto) igThumbUrl = firstPhoto.url || firstPhoto.src;
    }

    let igVisualDesc = '';
    // Prioritas tertinggi: analisis 5 FRAME VIDEO via API resmi (paling akurat).
    const igFirstVideoItem = Array.isArray(mediaItems) ? mediaItems.find(it => it && typeof it === 'object' && (it.media_format === 'video' || /\.(mp4|mov|webm)(\?|$)/i.test(String(it.url || it.src || '')))) : null;
    const igFirstVideoUrl = igFirstVideoItem ? (igFirstVideoItem.url || igFirstVideoItem.src) : null;
    if (igFirstVideoUrl) {
        try { igVisualDesc = await analyzeIgVideoFrames(igFirstVideoUrl, buildIgVideoFramesPrompt()); }
        catch (_) {}
    }
    if (!igVisualDesc && igThumbUrl) {
        try {
            const { default: axiosLib } = await import('axios');
            const thumbRes = await axiosLib.get(igThumbUrl, {
                responseType: 'arraybuffer',
                timeout: 12000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36' },
            });
            const thumbBuf = Buffer.from(thumbRes.data);
            if (thumbBuf.length > 500) {
                const mimeThumb = thumbRes.headers['content-type']?.split(';')[0] || 'image/jpeg';
                // Prioritas: API resmi (key di config.json); fallback jalur lama.
                if (getGeminiApiKey()) {
                    try {
                        igVisualDesc = await geminiOfficial([
                            { inline_data: { mime_type: mimeThumb, data: thumbBuf.toString('base64') } },
                            { text: buildIgVisionPrompt() },
                        ]);
                        if (igVisualDesc) console.log('[IG] Vision: Gemini API resmi (config)');
                    } catch (e) {
                        console.warn('[IG] Vision API resmi gagal, coba jalur lama:', e?.message || e);
                    }
                }
                if (!igVisualDesc) {
                    igVisualDesc = await gemini.askWithImage(buildIgVisionPrompt(), thumbBuf, mimeThumb);
                }
            }
        } catch (_) {}
    }

    // ── AI caption ────────────────────────────────────────────────────────────
    let finalCaptionIG = buildIgFallbackCaption({
        fullName, username,
        likes: likesStr, comments: commentsStr,
        mediaType, caption,
    });

    try {
        const captionPrompt = buildIgCaptionPrompt({
            fullName, username, caption, hashtags,
            likes: likesStr, comments: commentsStr,
            mediaType, visualDesc: igVisualDesc,
        });
        // Prioritas: API resmi (key di config.json); fallback jalur lama.
        let aiCaptionIG = '';
        if (getGeminiApiKey()) {
            try {
                aiCaptionIG = await geminiOfficial([{ text: captionPrompt }]);
                if (aiCaptionIG) console.log('[IG] Caption: Gemini API resmi (config)');
            } catch (e) {
                console.warn('[IG] Caption API resmi gagal, coba jalur lama:', e?.message || e);
            }
        }
        if (!aiCaptionIG) aiCaptionIG = await gemini.ask(captionPrompt);
        if (aiCaptionIG?.trim()) finalCaptionIG = aiCaptionIG.trim();
    } catch (_) {}

    // ── Kirim media ───────────────────────────────────────────────────────────
    let firstVideoUrl = null;

    for (let i = 0; i < mediaItems.length; i++) {
        const item = mediaItems[i];
        const mediaUrl = typeof item === 'object' ? (item.url || item.src) : item;
        const isFirstMedia = i === 0;

        let itemIsVideo = mediaType === 'video' || mediaType === 'reel';
        if (item.media_format) {
            itemIsVideo = item.media_format === 'video';
        } else {
            const urlStr = String(mediaUrl).toLowerCase().split('?')[0];
            if (urlStr.endsWith('.mp4') || urlStr.endsWith('.mov') || urlStr.endsWith('.webm')) itemIsVideo = true;
            else if (urlStr.endsWith('.jpg') || urlStr.endsWith('.jpeg') || urlStr.endsWith('.png') || urlStr.endsWith('.webp')) itemIsVideo = false;
        }

        if (itemIsVideo && !firstVideoUrl) firstVideoUrl = mediaUrl;

        try {
            if (itemIsVideo) {
                await hisoka.sendMessage(m.from, {
                    video  : { url: mediaUrl },
                    caption: isFirstMedia ? finalCaptionIG : '',
                }, { quoted: m });
            } else {
                await hisoka.sendMessage(m.from, {
                    image  : { url: mediaUrl },
                    caption: isFirstMedia ? finalCaptionIG : '',
                }, { quoted: m });
            }
        } catch (sendErr) {
            console.error(`[IG] Failed to send media ${i + 1}:`, sendErr.message);
        }
    }

    // ── Kirim audio (ekstrak dari video via ffmpeg) ───────────────────────────
    if (firstVideoUrl) {
        try {
            const execAsync = util.promisify(exec);
            const tmpAudio = `/tmp/ig_audio_${Date.now()}.mp3`;
            await execAsync(`ffmpeg -i "${firstVideoUrl}" -vn -acodec libmp3lame -q:a 4 "${tmpAudio}" -y`, { timeout: 60000 });
            const { readFile, unlink } = await import('fs/promises');
            const audioBuf = await readFile(tmpAudio);
            await hisoka.sendMessage(m.from, {
                audio: audioBuf,
                mimetype: 'audio/mpeg',
                ptt: false,
            }, { quoted: m });
            unlink(tmpAudio).catch(() => {});
        } catch (audioErr) {
            console.error('[IG] Gagal ekstrak audio:', audioErr.message);
        }
    }

    logCommand(m, hisoka, 'instagram');
}

export { handleInstagramDl };
/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const command = /^(ig)$/i;
export const tags = ['download'];
export const help = ['ig'];
async function runHandleInstagramDl(ctx) {
    const { buildIgCaptionPrompt, buildIgFallbackCaption, buildIgVisionPrompt, exec, formatIgCount, gemini, hisoka, logCommand, m, parseIgMetaHtml, query, tolak, util } = ctx;
    try {
                                            await handleInstagramDl(hisoka, m, query, { gemini, tolak, logCommand, exec, util, buildIgVisionPrompt, buildIgCaptionPrompt, buildIgFallbackCaption, parseIgMetaHtml, formatIgCount });
                                    } catch (error) {
                                            console.error('\x1b[31m[Instagram] Error:\x1b[39m', error.message);
                                            await tolak(hisoka, m, `❌ Error: ${error.message}`);
                                    }
}
export default runHandleInstagramDl;
