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
 *  tenor-gif.js — Scraper & handler GIF anime dari Tenor
 *  Command: .animgif [list | kategori | query bebas]
 *  Scrape random GIF anime dari tenor.com via API v1
 * ───────────────────────────────
 */
'use strict';

import axios from 'axios';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';

/* ── Re-encode mp4 ke format yang kompatibel WhatsApp GIF ── */
function reencodeForWhatsApp(inputBuf) {
    return new Promise((resolve, reject) => {
        const tmpIn  = path.join(os.tmpdir(), `tg_in_${Date.now()}.mp4`);
        const tmpOut = path.join(os.tmpdir(), `tg_out_${Date.now()}.mp4`);
        fs.writeFileSync(tmpIn, inputBuf);

        /*
         * Flag ffmpeg untuk WhatsApp GIF playback (mobile-compatible):
         * -profile:v baseline -level 3.0 → H.264 Baseline, WAJIB untuk WA mobile
         * -vf scale + fps=15             → dimensi genap + fps dibatasi agar kecil
         * -pix_fmt yuv420p               → pixel format universal WA
         * -an                            → hapus audio
         * -movflags +faststart           → stream langsung tanpa download penuh
         */
        execFile('ffmpeg', [
            '-y',
            '-i', tmpIn,
            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=15',
            '-c:v', 'libx264',
            '-profile:v', 'baseline',
            '-level', '3.0',
            '-pix_fmt', 'yuv420p',
            '-an',
            '-movflags', '+faststart',
            '-preset', 'fast',
            '-crf', '28',
            tmpOut,
        ], { timeout: 60000 }, (err) => {
            try { fs.unlinkSync(tmpIn); } catch (_) {}
            if (err) {
                try { fs.unlinkSync(tmpOut); } catch (_) {}
                return reject(new Error('ffmpeg gagal: ' + err.message));
            }
            const out = fs.readFileSync(tmpOut);
            try { fs.unlinkSync(tmpOut); } catch (_) {}
            resolve(out);
        });
    });
}

/* ── Ekstrak frame pertama dari mp4 via ffmpeg (bersih, tanpa blur) ── */
function extractRawFrame(mp4Buf) {
    return new Promise((resolve) => {
        const ts     = Date.now();
        const tmpIn  = path.join(os.tmpdir(), `tg_th_in_${ts}.mp4`);
        const tmpOut = path.join(os.tmpdir(), `tg_th_out_${ts}.jpg`);
        try { fs.writeFileSync(tmpIn, mp4Buf); } catch (_) { return resolve(null); }

        execFile('ffmpeg', [
            '-y',
            '-i', tmpIn,
            '-vframes', '1',
            '-vf', 'scale=320:-1',
            '-q:v', '3',
            tmpOut,
        ], { timeout: 15000 }, (err) => {
            try { fs.unlinkSync(tmpIn); } catch (_) {}
            if (err) {
                try { fs.unlinkSync(tmpOut); } catch (_) {}
                return resolve(null);
            }
            try {
                const buf = fs.readFileSync(tmpOut);
                fs.unlinkSync(tmpOut);
                resolve(buf);
            } catch (_) { resolve(null); }
        });
    });
}

/* ── Blur frame pakai sharp → hasilnya buram sebelum download di WA ── */
async function extractBlurredThumbnail(mp4Buf) {
    const frame = await extractRawFrame(mp4Buf);
    if (!frame) return null;
    try {
        /* sigma 25 = buram kuat, masih kelihatan "ada gambar" tapi tidak jelas */
        return await sharp(frame)
            .blur(25)
            .jpeg({ quality: 70 })
            .toBuffer();
    } catch (_) {
        return frame; /* fallback: kirim thumbnail asli kalau sharp gagal */
    }
}

/* ── Tenor Web Scraper (no API key needed) ── */
const TENOR_SEARCH_BASE = 'https://tenor.com/search';
const MAX_FETCH_COUNT   = 50;

/* ── Kategori preset (keyword → query Tenor) ── */
const PRESET_CATEGORIES = {
    dance    : { emoji: '💃', label: 'Dance',    query: 'anime girl dance'       },
    blush    : { emoji: '😳', label: 'Blush',    query: 'anime girl blush'       },
    cry      : { emoji: '😢', label: 'Cry',      query: 'anime girl cry'         },
    laugh    : { emoji: '😂', label: 'Laugh',    query: 'anime girl laugh'       },
    shy      : { emoji: '🙈', label: 'Shy',      query: 'anime girl shy'         },
    happy    : { emoji: '😊', label: 'Happy',    query: 'anime girl happy'       },
    angry    : { emoji: '😤', label: 'Angry',    query: 'anime girl angry'       },
    cute     : { emoji: '🌸', label: 'Cute',     query: 'anime girl cute'        },
    wave     : { emoji: '👋', label: 'Wave',     query: 'anime girl waving'      },
    smile    : { emoji: '😄', label: 'Smile',    query: 'anime girl smile'       },
    sleep    : { emoji: '😴', label: 'Sleep',    query: 'anime girl sleeping'    },
    eat      : { emoji: '🍜', label: 'Eat',      query: 'anime girl eating'      },
    run      : { emoji: '🏃', label: 'Run',      query: 'anime girl running'     },
    fight    : { emoji: '⚔️', label: 'Fight',    query: 'anime girl fight'       },
    think    : { emoji: '🤔', label: 'Think',    query: 'anime girl thinking'    },
    kawaii   : { emoji: '✨', label: 'Kawaii',   query: 'anime kawaii'           },
    reaction : { emoji: '🎭', label: 'Reaction', query: 'anime girl reaction'    },
    surprise : { emoji: '😱', label: 'Surprise', query: 'anime girl surprised'   },
    hug      : { emoji: '🤗', label: 'Hug',      query: 'anime girl hug'        },
    wave2    : { emoji: '🌊', label: 'Wink',     query: 'anime girl wink'        },
};

/* ── Default kalau tidak ada query ── */
const DEFAULT_QUERIES = Object.values(PRESET_CATEGORIES).map(c => c.query);

/* ── Format bytes ke KB/MB ── */
function formatSize(bytes) {
    if (!bytes || bytes <= 0) return 'N/A';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

/* ── Format durasi detik ── */
function formatDuration(secs) {
    if (!secs || secs <= 0) return 'N/A';
    return parseFloat(secs).toFixed(3) + ' sec';
}

/* ── Format tanggal dari Unix timestamp ── */
function formatDate(unixTs) {
    if (!unixTs) return 'N/A';
    const d = new Date(unixTs * 1000);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
}

/* ── Spinner sederhana untuk animasi loading ── */
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Jalankan animasi loading sambil menunggu promise selesai.
 * Edit pesan berputar setiap intervalMs, berhenti otomatis saat promise resolve/reject.
 */
async function withLoadingAnim(editFn, label, promise, intervalMs = 1200) {
    let i = 0;
    let done = false;

    const loop = (async () => {
        while (!done) {
            const sp = SPINNER[i % SPINNER.length];
            await editFn(`${sp} _${label}_`).catch(() => {});
            i++;
            await new Promise(r => setTimeout(r, intervalMs));
        }
    })();

    try {
        const result = await promise;
        done = true;
        await loop.catch(() => {});
        return result;
    } catch (err) {
        done = true;
        await loop.catch(() => {});
        throw err;
    }
}

/* ── Ambil random GIF dari Tenor via web scrape (no API key) ── */
import * as cheerio from 'cheerio';

/* ── Ambil random GIF dari Tenor via store-cache parse ── */
async function fetchRandomTenorGif(query) {
    const q = (query || DEFAULT_QUERIES[Math.floor(Math.random() * DEFAULT_QUERIES.length)]).trim();
    const searchUrl = `https://tenor.com/id/search/${encodeURIComponent(q)}-gifs`;

    const res = await axios.get(searchUrl, {
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36' },
    });

    const $ = cheerio.load(res.data);
    const cacheText = $('#store-cache').html();
    if (!cacheText) throw new Error('Tenor store-cache not found');

    const json = JSON.parse(cacheText);
    const searchObj = json.universal?.search || {};
    let items = [];
    for (const k of Object.keys(searchObj)) {
        if (searchObj[k]?.results) {
            items = searchObj[k].results;
            break;
        }
    }
    if (!items.length) items = Object.values(json.gifs?.byId || {});
    if (!items.length) throw new Error('No items in Tenor cache');

    const pick = items[Math.floor(Math.random() * items.length)];
    const formats = pick.media_formats || {};
    
    const mp4 = formats.mp4 || formats.tinymp4 || formats.nanomp4 || {};
    const gif = formats.gif || formats.tinygif || {};

    if (!mp4.url) throw new Error('No MP4 URL found');

    return {
        url        : mp4.url,
        previewUrl : gif.url || null,
        title      : pick.title || q,
        tags       : [],
        query      : q,
        pos        : 0,
        created    : Date.now() / 1000,
        dims       : mp4.dims || null,
        duration   : mp4.duration || null,
        fileSize   : null,
    };
}

/* ── Download buffer ── */
async function downloadGif(url) {
    const res = await axios.get(url, {
        responseType : 'arraybuffer',
        timeout      : 30000,
        headers      : {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        },
    });
    return Buffer.from(res.data);
}

/* ── Teks list kategori ── */
function buildListText(pfx) {
    const cmd  = `${pfx}animgif`;
    const rows = Object.entries(PRESET_CATEGORIES)
        .map(([key, c]) => `│ ${c.emoji} *${key}* — ${c.label}`)
        .join('\n');

    return [
        `╭══『 🎴 *ANIMGIF KATEGORI* 』══╮`,
        rows,
        `│`,
        `├── *Cara Pakai:*`,
        `│ • ${cmd} dance`,
        `│ • ${cmd} blush`,
        `│ • ${cmd} ← tanpa keyword = random`,
        `╰══════════════════════════╯`,
    ].join('\n');
}

/* ── Command handler .animgif ── */
async function handleAnimgif(hisoka, m, query, ctx) {
    const { tolak, logCommand } = ctx;
    const pfx = m.prefix || '.';

    /* ── Subcommand: list ── */
    const qLower = (query || '').trim().toLowerCase();
    if (qLower === 'list' || qLower === 'kategori' || qLower === 'help') {
        await tolak(hisoka, m, buildListText(pfx));
        logCommand(m, hisoka, 'animgif list');
        return;
    }

    /* ── Resolve query: hanya dari preset, kalau tidak ada tampilkan pesan ramah ── */
    let resolvedQuery = null;
    let usedLabel     = null;

    if (qLower && PRESET_CATEGORIES[qLower]) {
        /* Keyword ada di daftar kategori */
        resolvedQuery = PRESET_CATEGORIES[qLower].query;
        usedLabel     = `${PRESET_CATEGORIES[qLower].emoji} ${PRESET_CATEGORIES[qLower].label}`;
    } else if (qLower) {
        /* Keyword diketik tapi tidak ada di kategori → tampilkan pesan ramah, tidak jadi search */
        const keys = Object.keys(PRESET_CATEGORIES).join(', ');
        await tolak(hisoka, m, [
            `❌ *"${query.trim()}"* belum ada di daftar kategori.`,
            ``,
            `📋 Silakan lihat daftar lengkap dengan:`,
            `› *${pfx}animgif list*`,
            ``,
            `_Contoh yang benar: ${pfx}animgif dance_`,
        ].join('\n'));
        return;
    }
    /* Jika tidak ada query sama sekali → resolvedQuery = null = random */

    await hisoka.sendMessage(m.from, { react: { text: '🎴', key: m.key } });
    const loadMsg = await tolak(hisoka, m, '⠋ _Mengambil GIF anime..._');

    const editStep = async (text) => {
        try { await m.reply({ edit: loadMsg.key, text }); } catch (_) {}
    };

    /* Hapus loading message dari chat (biar tidak duplikat dengan caption GIF) */
    const deleteLoad = async () => {
        try { await hisoka.sendMessage(m.from, { delete: loadMsg.key }); } catch (_) {}
    };

    try {
        /* ── Tahap 1: cari GIF — spinner edit loadMsg ── */
        const gif = await withLoadingAnim(
            editStep,
            'Mencari GIF di Tenor...',
            fetchRandomTenorGif(resolvedQuery),
            1200,
        );

        /* ── Tahap 2: unduh buffer — spinner edit loadMsg ── */
        const rawBuffer = await withLoadingAnim(
            editStep,
            'Mengunduh GIF...',
            downloadGif(gif.url),
            1000,
        );

        /* ── Tahap 3: re-encode ke H.264 Baseline ── spinner edit loadMsg ── */
        const buffer = await withLoadingAnim(
            editStep,
            'Memproses GIF...',
            reencodeForWhatsApp(rawBuffer),
            1000,
        );

        /* ── Hapus loading message, kirim sebagai MP4 video tanpa caption ── */
        await deleteLoad();

        const sendPayload = {
            video      : buffer,
            gifPlayback: true,
            mimetype   : 'video/mp4',
        };

        await hisoka.sendMessage(m.from, sendPayload, { quoted: m });
        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
        logCommand(m, hisoka, 'animgif');

    } catch (err) {
        console.error('[TenorGif]', err.message);
        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
        await editStep(`❌ *Gagal:* ${err.message}`);
    }
}

export { handleAnimgif, fetchRandomTenorGif };
/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const command = /^(animgif|animegif|gifanime)$/i;
export const tags = ['anime'];
export const help = ['animgif'];
async function runHandleAnimgif(ctx) {
    const { hisoka, logCommand, m, query, tolak } = ctx;
    await handleAnimgif(hisoka, m, query, { tolak, logCommand });
}
export default runHandleAnimgif;
