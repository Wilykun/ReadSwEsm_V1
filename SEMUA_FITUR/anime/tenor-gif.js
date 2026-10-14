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
        /* nama file unik per proses: cegah tabrakan saat 2 tap berurutan */
        const uniq   = crypto.randomBytes(6).toString('hex');
        const tmpIn  = path.join(os.tmpdir(), `tg_in_${uniq}.mp4`);
        const tmpOut = path.join(os.tmpdir(), `tg_out_${uniq}.mp4`);
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
            /* validasi: pastikan hasilnya mp4 valid, bukan file corrupt */
            if (!isValidMp4(out)) {
                return reject(new Error('hasil re-encode rusak, coba lagi'));
            }
            resolve(out);
        });
    });
}

/* ── Cek cepat: buffer adalah mp4 valid (punya box 'ftyp') ── */
function isValidMp4(buf) {
    return Buffer.isBuffer(buf) && buf.length > 1024 &&
        buf.slice(4, 8).toString('ascii') === 'ftyp';
}

/* ── Ekstrak frame pertama dari mp4 via ffmpeg (bersih, tanpa blur) ── */
function extractRawFrame(mp4Buf) {
    return new Promise((resolve) => {
        const uniq   = crypto.randomBytes(6).toString('hex');
        const tmpIn  = path.join(os.tmpdir(), `tg_th_in_${uniq}.mp4`);
        const tmpOut = path.join(os.tmpdir(), `tg_th_out_${uniq}.jpg`);
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

/* ── Format bytes ke KB/MB (KB dibulatkan ala Tenor: 382KB) ── */
function formatSize(bytes) {
    if (!bytes || bytes <= 0) return 'N/A';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
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

    const fmtOf = (f) => (f && f.url)
        ? { url: f.url, dims: f.dims || null, duration: f.duration || null, size: f.size || null }
        : null;

    const gifFull  = fmtOf(formats.gif || formats.mediumgif);
    const gifSmall = fmtOf(formats.tinygif || formats.nanogif);
    const mp4Full  = fmtOf(formats.mp4 || formats.tinymp4);

    if (!mp4Full) throw new Error('No MP4 URL found');

    /* Judul real ala halaman Tenor (cth: "Anime Fran GIF") */
    const slug = String(pick.itemurl || '').split('/').filter(Boolean).pop() || '';
    const prettyTitle = (pick.h1_title || pick.long_title ||
        slug.replace(/-/g, ' ').replace(/\bgif\b/i, 'GIF')).trim();

    return {
        /* ── field lama (kompatibilitas) ── */
        url        : mp4Full.url,
        previewUrl : (gifFull || {}).url || null,
        title      : prettyTitle || q,
        tags       : Array.isArray(pick.tags) ? pick.tags : [],
        query      : q,
        pos        : 0,
        created    : pick.created || (Date.now() / 1000),
        dims       : mp4Full.dims,
        duration   : mp4Full.duration,
        fileSize   : null,
        /* ── field baru: data real Tenor ── */
        id          : String(pick.id || ''),
        description : pick.content_description || '',
        itemurl     : pick.itemurl || null,
        previewMp4Url: mp4Full.url,
        formats: {
            gifsd: gifSmall || mp4Full,
            gifhd: gifFull  || mp4Full,
            mp4:   mp4Full,
        },
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

/* ── Format tanggal Unix timestamp ke WIB: 16/05/2024, 15.52.43 ── */
function formatWibDate(unixTs) {
    if (!unixTs) return 'N/A';
    try {
        const d = new Date(unixTs * 1000);
        const p = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Jakarta',
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false,
        }).formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {});
        return `${p.day}/${p.month}/${p.year}, ${p.hour}.${p.minute}.${p.second}`;
    } catch (_) {
        return 'N/A';
    }
}

/* ── Caption kaya ala halaman Tenor (bold/italic/quote/list/kode) ──
 * opts.withPicker: tampilkan daftar pilih format (untuk pesan picker)
 * opts.sentFile: { size, duration, dims } — stats file yang BENAR-BENAR
 *   dikirim (untuk pesan hasil), agar tidak campur aduk dengan stats sumber
 */
function buildTenorCaption(item, opts = {}) {
    const withPicker = opts.withPicker !== false;
    const sent = opts.sentFile || null;
    const f = item.formats || {};
    const L = [];
    L.push(`🎴 *${item.title}*`);
    if (item.description) L.push(`> _${item.description}_`);
    L.push('');
    L.push(sent ? `📦 *File Terkirim*` : `📦 *Detail File*`);
    const sz = sent?.size ?? f.gifhd?.size;
    const du = sent?.duration ?? f.gifhd?.duration;
    const dm = sent?.dims ?? f.gifhd?.dims;
    if (sz) L.push(`• *Ukuran:* \`${formatSize(sz)}\``);
    if (du) L.push(`• *Durasi:* \`${formatDuration(du)}\``);
    if (dm) L.push(`• *Dimensi:* \`${dm[0]}x${dm[1]}\``);
    L.push(`• *Diunggah:* \`${formatWibDate(item.created)}\``);
    if (item.tags?.length) {
        L.push('');
        L.push(`🏷️ *Tag:* ${item.tags.slice(0, 15).join(', ')}`);
    }
    if (withPicker) {
        L.push('');
        L.push(`👇 *Pilih format:*`);
        L.push(`1. *GIF SD* — \`${formatSize(f.gifsd?.size)}\` · ringan`);
        L.push(`2. *GIF HD* — \`${formatSize(f.gifhd?.size)}\` · kualitas penuh`);
        L.push(`3. *MP4* — \`${formatSize(f.mp4?.size)}\` · file video`);
    }
    return L.join('\n');
}

/* ── Pending pilihan format (token → data item) ── */
import crypto from 'crypto';
const pendingTenorChoices = new Map(); // token → { item, query, from, expiresAt }
const TENOR_CHOICE_TTL_MS = 15 * 60 * 1000;
const PFX_TENGIF_SD  = '__tengif_sd_';
const PFX_TENGIF_HD  = '__tengif_hd_';
const PFX_TENGIF_MP4 = '__tengif_mp4_';

function storeTenorChoice(item, query, from, cmdMsg) {
    const now = Date.now();
    for (const [k, v] of pendingTenorChoices) {
        if (v.expiresAt <= now) pendingTenorChoices.delete(k);
    }
    const token = crypto.randomBytes(4).toString('hex');
    /* simpan pesan command asli agar hasil bisa quote ke sana */
    const quotedCmd = cmdMsg?.key ? {
        key: cmdMsg.key,
        message: { conversation: String(cmdMsg.text || `.animgif ${query || ''}`).trim() },
    } : null;
    pendingTenorChoices.set(token, { item, query, from, quotedCmd, expiresAt: now + TENOR_CHOICE_TTL_MS });
    return token;
}

/* ── Ambil id tap dari berbagai bentuk pesan balasan button ── */
function extractTapId(m) {
    const t = String(m.text || '').trim();
    if (t) return t;
    try {
        const walk = (o) => {
            if (!o || typeof o !== 'object') return null;
            if (typeof o.selectedButtonId === 'string' && o.selectedButtonId) return o.selectedButtonId;
            if (o.singleSelectReply?.selectedRowId) return o.singleSelectReply.selectedRowId;
            if (o.nativeFlowResponseMessage?.paramsJson) {
                try {
                    const p = JSON.parse(o.nativeFlowResponseMessage.paramsJson);
                    if (p?.id) return p.id;
                } catch (_) {}
            }
            for (const v of Object.values(o)) {
                const r = walk(v);
                if (r) return r;
            }
            return null;
        };
        return walk(m.message) || '';
    } catch (_) {
        return '';
    }
}

/* ── Command handler .animgif ── */
async function handleAnimgif(hisoka, m, query, ctx) {
    const { Button, tolak, logCommand } = ctx;
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
        /* Query bebas (tidak ada di kategori) → cari langsung di Tenor */
        resolvedQuery = query.trim();
        usedLabel     = `🔎 ${query.trim()}`;
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
        /* ── Cari info GIF di Tenor (belum diunduh — user pilih format dulu) ── */
        const gif = await withLoadingAnim(
            editStep,
            'Mencari GIF di Tenor...',
            fetchRandomTenorGif(resolvedQuery),
            1200,
        );

        /* ── Hapus loading, tampilkan picker format single-select ── */
        await deleteLoad();

        const token      = storeTenorChoice(gif, gif.query, m.from, m);
        const pickerText = buildTenorCaption(gif, { withPicker: true });

        let sentBtn = null;
        if (typeof Button === 'function') {
            try {
                const f = gif.formats || {};
                const btn = new Button()
                    .setBody(pickerText)
                    .setFooter('🎴 Tenor • WilyBot')
                    .addSelection('🖼️ Pilih Format');
                btn.makeSections('Format tersedia');
                btn.makeRow('', '🖼️ GIF SD', `${formatSize(f.gifsd?.size)} · ringan`, `${PFX_TENGIF_SD}${token}`);
                btn.makeRow('', '🎞️ GIF HD', `${formatSize(f.gifhd?.size)} · kualitas penuh`, `${PFX_TENGIF_HD}${token}`);
                btn.makeRow('', '🎬 MP4', `${formatSize(f.mp4?.size)} · file video`, `${PFX_TENGIF_MP4}${token}`);
                sentBtn = await btn.run(m.from, hisoka, m);
            } catch (e) {
                console.error('[TenorGif] Button send gagal:', e.message);
            }
        }
        if (!sentBtn) {
            /* Fallback: kirim GIF HD langsung bila interactive gagal */
            const rawBuffer = await downloadGif(gif.previewMp4Url);
            const buffer    = await reencodeForWhatsApp(rawBuffer);
            await hisoka.sendMessage(m.from, {
                video      : buffer,
                gifPlayback: true,
                mimetype   : 'video/mp4',
                caption    : buildTenorCaption(gif, { withPicker: false }),
            }, { quoted: m });
        } else {
            const pend = pendingTenorChoices.get(token);
            if (pend) pend.botMsgKey = sentBtn.key || null;
        }

        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
        logCommand(m, hisoka, 'animgif');

    } catch (err) {
        console.error('[TenorGif]', err.message);
        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
        await editStep(`❌ *Gagal:* ${err.message}`);
    }
}

/* ── Callback tap tombol format: __tengif_sd/hd/mp4_<token> ── */
async function handleTenorGifCallback({ hisoka, m, tolak, logCommand }) {
    const raw = extractTapId(m);
    let fmt = null;
    let token = null;
    for (const [pfx, name] of [[PFX_TENGIF_SD, 'gifsd'], [PFX_TENGIF_HD, 'gifhd'], [PFX_TENGIF_MP4, 'mp4']]) {
        if (raw.startsWith(pfx)) { fmt = name; token = raw.slice(pfx.length); break; }
    }
    if (!fmt) return false;

    const pending = pendingTenorChoices.get(token);
    if (!pending || pending.expiresAt <= Date.now()) {
        /* Hapus picker basi biar chat rapi */
        if (pending?.botMsgKey) {
            try { await hisoka.sendMessage(m.from, { delete: pending.botMsgKey }); } catch (_) {}
        }
        pendingTenorChoices.delete(token);
        await tolak(hisoka, m, '⏳ *Pilihan format sudah kedaluwarsa.*\nKirim *.animgif* lagi ya~');
        return true;
    }

    /* ── Hapus pesan picker biar chat rapi ── */
    if (pending.botMsgKey) {
        try { await hisoka.sendMessage(m.from, { delete: pending.botMsgKey }); } catch (_) {}
        pending.botMsgKey = null;
    }

    const { item } = pending;
    const target = (item.formats || {})[fmt];
    if (!target?.url) {
        await tolak(hisoka, m, '❌ Format tidak tersedia untuk GIF ini.');
        return true;
    }

    await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } }).catch(() => {});
    try {
        const rawBuf = await downloadGif(target.url);
        let payload;
        if (fmt === 'mp4') {
            const detail = buildTenorCaption(item, {
                withPicker: false,
                sentFile: { size: rawBuf.length, duration: target.duration, dims: target.dims },
            });
            payload = {
                video   : rawBuf,
                mimetype: 'video/mp4',
                fileName: 'wilybot-tenor.mp4',
                caption : `🎬 *MP4 terkirim!*\n\n${detail}`,
            };
        } else {
            const buf   = await reencodeForWhatsApp(rawBuf);
            const label = fmt === 'gifsd' ? 'GIF SD' : 'GIF HD';
            const detail = buildTenorCaption(item, {
                withPicker: false,
                sentFile: { size: buf.length, duration: target.duration, dims: target.dims },
            });
            payload = {
                video      : buf,
                gifPlayback: true,
                mimetype   : 'video/mp4',
                fileName   : 'wilybot-tenor.mp4',
                caption    : `✅ *${label} terkirim!*\n\n${detail}`,
            };
        }
        /* quote ke pesan command asli user (kayak awal), bukan ke pesan tap */
        const quoted = pending.quotedCmd || undefined;
        await hisoka.sendMessage(m.from, payload, quoted ? { quoted } : {});
        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } }).catch(() => {});
        if (typeof logCommand === 'function') logCommand(m, hisoka, 'animgif ' + fmt);
    } catch (e) {
        console.error('[TenorGif] callback gagal:', e.message);
        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } }).catch(() => {});
        await tolak(hisoka, m, `❌ *Gagal:* ${e.message}`);
    }
    return true;
}

export { handleAnimgif, handleTenorGifCallback, fetchRandomTenorGif, buildTenorCaption };
/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const command = /^(animgif|animegif|gifanime)$/i;
export const tags = ['anime'];
export const help = ['animgif'];
async function runHandleAnimgif(ctx) {
    const { Button, hisoka, logCommand, m, query, tolak } = ctx;
    await handleAnimgif(hisoka, m, query, { Button, tolak, logCommand });
}
export default runHandleAnimgif;
