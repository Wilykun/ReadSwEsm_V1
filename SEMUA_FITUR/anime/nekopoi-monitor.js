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
 *  nekopoi-monitor.js — Monitor NekoPoi.care
 *  Cek update realtime dari 3 kategori:
 *  Hentai · 2D Animation · 3D Hentai
 *  Kirim notif otomatis ke grup yang terdaftar.
 * ───────────────────────────────
 */
'use strict';

import { getCategoryPosts, getDetailNekopoi } from './nekopoi.js';
import axios from 'axios';
import crypto from 'node:crypto';
import path from 'path';
import fs from 'fs';

const DIR_DATA    = path.join(process.cwd(), 'data', 'nekopoinotif');
const FILE_DATA   = path.join(DIR_DATA, 'state.json');
const FILE_LOG    = path.join(DIR_DATA, 'log.json');
const FILE_CONFIG = path.join(process.cwd(), 'config.json');
fs.mkdirSync(DIR_DATA, { recursive: true });

// Berapa lama (ms) post gagal-fetch dicoba ulang sebelum diabaikan
const RETRY_TTL_MS   = 30 * 60 * 1000;  // 30 menit
// Jangkauan awal saat belum ada lastCheckTime
const INIT_WINDOW_MS = 30 * 60 * 1000;  // 30 menit

const SEP  = '━━━━━━━━━━━━━━━━━━';
const SEP2 = '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
};

// ── BACA / SIMPAN ─────────────────────────────────────────────────────────────

function bacaData() {
    try {
        if (fs.existsSync(FILE_DATA)) return JSON.parse(fs.readFileSync(FILE_DATA, 'utf-8'));
    } catch (_) {}
    return { idTerkirim: [], idGagal: [], lastCheckTime: null };
}

function simpanData(data) {
    try { fs.writeFileSync(FILE_DATA, JSON.stringify(data, null, 2), 'utf-8'); } catch (_) {}
}

function bacaLog() {
    try {
        if (fs.existsSync(FILE_LOG)) return JSON.parse(fs.readFileSync(FILE_LOG, 'utf-8'));
    } catch (_) {}
    return { terkirim: [] };
}

function simpanLog(log) {
    try { fs.writeFileSync(FILE_LOG, JSON.stringify(log, null, 2), 'utf-8'); } catch (_) {}
}

function bacaConfig() {
    try {
        if (fs.existsSync(FILE_CONFIG)) return JSON.parse(fs.readFileSync(FILE_CONFIG, 'utf-8'));
    } catch (_) {}
    return {};
}

function simpanConfig(cfg) {
    try { fs.writeFileSync(FILE_CONFIG, JSON.stringify(cfg, null, 2), 'utf-8'); } catch (_) {}
}

// ── PENGATURAN GRUP ───────────────────────────────────────────────────────────

function getEnabledGroups() {
    const cfg    = bacaConfig();
    const groups = cfg?.nekopoinotif?.groups || {};
    return Object.entries(groups)
        .filter(([, v]) => v?.enabled === true)
        .map(([jid]) => jid);
}

function setGroupEnabled(jid, enabled) {
    const cfg = bacaConfig();
    if (!cfg.nekopoinotif)        cfg.nekopoinotif        = { groups: {}, categories: ['hentai', '2d-animation', '3d-hentai'] };
    if (!cfg.nekopoinotif.groups) cfg.nekopoinotif.groups = {};
    cfg.nekopoinotif.groups[jid] = { enabled, diubahPada: Date.now() };
    simpanConfig(cfg);
}

function getActiveCategories() {
    const cfg = bacaConfig();
    return cfg?.nekopoinotif?.categories || ['hentai', '2d-animation', '3d-hentai'];
}

// ── DEDUP ─────────────────────────────────────────────────────────────────────

function sudahDikirim(id) {
    return (bacaData().idTerkirim || []).includes(String(id));
}

function tandaiSudahKirim(id) {
    const data = bacaData();
    if (!data.idTerkirim) data.idTerkirim = [];
    if (!data.idTerkirim.includes(String(id))) {
        data.idTerkirim.unshift(String(id));
        if (data.idTerkirim.length > 500) data.idTerkirim = data.idTerkirim.slice(0, 500);
        simpanData(data);
    }
}

function tandaiDanLog(item, grupList) {
    tandaiSudahKirim(item.id);
    try {
        const log = bacaLog();
        if (!Array.isArray(log.terkirim)) log.terkirim = [];
        if (!log.terkirim.some(e => String(e.id) === String(item.id))) {
            log.terkirim.unshift({
                id        : String(item.id),
                title     : item.title || '-',
                kategori  : item.kategori || 'hentai',
                waktuKirim: new Date().toISOString(),
                grupCount : grupList.length,
                thumbnail : item.thumbnail || null,
                url       : item.url || null,
            });
            if (log.terkirim.length > 300) log.terkirim = log.terkirim.slice(0, 300);
            simpanLog(log);
        }
    } catch (e) {
        console.warn('[NekopoinNotif] Gagal simpan log:', e?.message);
    }
}

function getRecentLog(jumlah = 20) {
    return (bacaLog().terkirim || []).slice(0, jumlah);
}

// ── BUAT ID UNIK ──────────────────────────────────────────────────────────────

function buatId(url) {
    return (url || '').replace(/^https?:\/\/nekopoi\.care\//, '').replace(/\/+$/, '');
}

// ── CARI KONTEN BARU ──────────────────────────────────────────────────────────

async function cariKontenBaru() {

    const now        = Date.now();
    const data       = bacaData();
    const isFirstRun = !data.lastCheckTime;

    data.lastCheckTime = now;
    if (!data.idTerkirim) data.idTerkirim = [];
    if (!data.idGagal)    data.idGagal    = [];
    simpanData(data);

    const kategoriAktif = getActiveCategories();
    const semuaPost     = [];
    const seenUrl       = new Set();

    // ── Fetch semua kategori aktif secara paralel ──────────────────────────────
    const fetchResults = await Promise.allSettled(
        kategoriAktif.map(async (slug) => {
            try {
                const posts = await getCategoryPosts(slug);
                return posts;
            } catch (e) {
                console.error(`[NekopoinNotif] ❌ Gagal fetch kategori ${slug}:`, e?.message);
                return [];
            }
        })
    );

    for (const result of fetchResults) {
        if (result.status !== 'fulfilled') continue;
        for (const post of (result.value || [])) {
            if (!post.url || seenUrl.has(post.url)) continue;
            seenUrl.add(post.url);
            semuaPost.push(post);
        }
    }

    // ── First run — tandai semua sebagai seen ─────────────────────────────────
    if (isFirstRun) {
        console.log(`[NekopoinNotif] 🚀 First run — tandai ${semuaPost.length} post sebagai seen`);
        const df = bacaData();
        for (const post of semuaPost) {
            const id = buatId(post.url);
            if (!df.idTerkirim.includes(String(id))) df.idTerkirim.unshift(String(id));
        }
        simpanData(df);
        return [];
    }

    // ── Retry gagal sebelumnya ────────────────────────────────────────────────
    const baru        = [];
    const idGagalBaru = [];

    for (const gagal of (data.idGagal || [])) {
        if (sudahDikirim(gagal.id)) continue;
        const usiaGagal = now - new Date(gagal.pertamaGagal || now).getTime();
        if (usiaGagal > RETRY_TTL_MS) {
            console.log(`[NekopoinNotif] ⏭️ Retry timeout: "${gagal.title}" diabaikan`);
            tandaiSudahKirim(gagal.id);
            continue;
        }
        try {
            const detail = await getDetailNekopoi(gagal.url);
            baru.push({
                ...detail,
                id      : gagal.id,
                url     : gagal.url,
                title   : detail.title || gagal.title,
                kategori: detail.kategori || gagal.kategori || 'hentai',
            });
            console.log(`[NekopoinNotif] 🔄 Retry berhasil: "${gagal.title}"`);
        } catch (e) {
            console.warn(`[NekopoinNotif] 🔄 Retry masih gagal "${gagal.title}":`, e?.message);
            idGagalBaru.push(gagal);
        }
    }

    // ── Cek post baru ─────────────────────────────────────────────────────────
    for (const post of semuaPost) {
        const id = buatId(post.url);
        if (sudahDikirim(id)) continue;

        try {
            const detail = await getDetailNekopoi(post.url);
            baru.push({
                ...detail,
                id,
                url     : post.url,
                title   : detail.title || post.title,
                kategori: detail.kategori || post.kategori || 'hentai',
            });
        } catch (e) {
            console.warn(`[NekopoinNotif] ❌ Gagal fetch detail "${post.title}":`, e?.message);
            idGagalBaru.push({
                id,
                url         : post.url,
                title       : post.title,
                kategori    : post.kategori || 'hentai',
                pertamaGagal: new Date().toISOString(),
            });
        }
    }

    const dataFinal = bacaData();
    dataFinal.idGagal = idGagalBaru;
    simpanData(dataFinal);

    return baru;
}

// ── SIMULASI ──────────────────────────────────────────────────────────────────
// slug: 'hentai' | '2d-animation' | '3d-hentai' (default: 'hentai')
async function simulasi(slug) {

    const katSlug = slug || 'hentai';
    const posts   = await getCategoryPosts(katSlug);
    if (!posts.length) throw new Error(`Tidak ada post dari nekopoi.care/category/${katSlug}/`);

    const post   = posts[0];
    const id     = buatId(post.url);
    const detail = await getDetailNekopoi(post.url);

    const item      = { ...detail, id, url: post.url, title: detail.title || post.title, kategori: detail.kategori || katSlug };
    const caption   = buatCaption(item);
    const urlGambar = item.thumbnail || null;
    return { caption, urlGambar, item };
}

// ── FORMAT CAPTION ────────────────────────────────────────────────────────────

const KATEGORI_INFO = {
    'hentai'      : { emoji: '🎌', label: 'Hentai',       header: '🎌 *HENTAI BARU — NEKOPOI!*' },
    '2d-animation': { emoji: '🎥', label: '2D Animation',  header: '🎥 *2D ANIMATION BARU — NEKOPOI!*' },
    '3d-hentai'   : { emoji: '🧊', label: '3D Hentai',     header: '🧊 *3D HENTAI BARU — NEKOPOI!*' },
};

function getKatInfo(kategori) {
    return KATEGORI_INFO[kategori] || KATEGORI_INFO['hentai'];
}

function waktuSekarang() {
    const sekarang   = new Date();
    const opsiHari   = { timeZone: 'Asia/Jakarta', weekday: 'long' };
    const opsiTgl    = { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'long', year: 'numeric' };
    const opsiJam    = { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false };
    const namaHari   = sekarang.toLocaleDateString('id-ID', opsiHari);
    const tglLengkap = sekarang.toLocaleDateString('id-ID', opsiTgl);
    const jamMenit   = sekarang.toLocaleTimeString('id-ID', opsiJam).replace('.', ':');
    return `${namaHari}, ${tglLengkap} · ${jamMenit} WIB`;
}

function potongTeks(teks, maks = 400) {
    const t = (teks || '').trim();
    if (!t || t === '-') return '-';
    if (t.length <= maks) return t;
    return t.slice(0, maks).trimEnd() + '…';
}

// Format angka pakai titik ribuan (1234 → 1.234) — tidak bergantung locale
function formatAngka(n) {
    const num = parseInt(String(n).replace(/\D/g, ''), 10);
    if (isNaN(num)) return String(n);
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function buatCaption(data) {
    const {
        title, kategori, tanggal, sinopsis,
        genre, producers, durasi, ukuran, status,
        episode, tayang, judulJp, url,
        viewCount = '',
        downloads = [],
        originalTitle = '', parody = '',
        anime = '',
    } = data;

    const katInfo     = getKatInfo(kategori);
    const headerWaktu = waktuSekarang();

    // ── Sinopsis (> quote) ────────────────────────────────────────────────────
    // Untuk konten 2D/3D tanpa sinopsis → pakai Original Title + Parody
    let sinOpsi = sinopsis || '';
    if (!sinOpsi) {
        const bagian = [];
        if (originalTitle && originalTitle !== '-') bagian.push(`Original: *${originalTitle}*`);
        if (parody && parody !== '-')               bagian.push(`Parody: *${parody}*`);
        sinOpsi = bagian.join('\n') || '';
    }
    // Sinopsis tampil PENUH (bukan cap 350 — itu yang bikin "kepotong").
    // Caption nekopoi dikirim sebagai teks (limit aman 4000); bila total
    // caption > 4000, yang dipotong hanya sinopsisnya (lihat return di bawah).
    // PERHATIAN: bila suatu saat thumbnail hidup lagi dan caption dikirim
    // bersama gambar, limit caption gambar = 1024 — jalur kirim harus memotong
    // caption atau kirim teks, jangan andalkan budget 4000 ini.
    const buatBlokSinopsis = (teks) => teks
        ? teks.split('\n').map(b => b.trim() ? `> ${b}` : '').filter(Boolean).join('\n')
        : null;
    const sinopsisBlok = sinOpsi ? buatBlokSinopsis(sinOpsi) : null;

    // ── Info items (├ ╰ tree, label *bold*, nilai _italic_) ──────────────────
    const infoItems = [
        ['🗂️ *Kategori*', katInfo.label],
        ['🇯🇵 *Judul JP*', judulJp                                           || null],
        ['🎬 *Anime*',     (!judulJp && anime && anime !== title) ? anime     : null],
        ['🏢 *Produser*',  producers                                           || null],
        ['📡 *Status*',    status                                              || null],
        ['📺 *Episode*',   episode                                             || null],
        ['🗓️ *Tayang*',    tayang                                              || null],
        ['⏱️ *Durasi*',    durasi                                              || null],
        ['🎭 *Genre*',     genre                                               || null],
        ['💾 *Ukuran*',    ukuran                                              || null],
        // View count realtime dari scraper (berapa kali halaman dilihat)
        ['👁️ *Dilihat*',  viewCount ? `${formatAngka(viewCount)} kali`        : null],
    ].filter(([, v]) => v && v !== '' && v !== '-');

    const infoBlok = infoItems.map(([label, val], i) => {
        const prefix = i === infoItems.length - 1 ? '╰' : '├';
        return `${prefix} ${label} : _${val}_`;
    }).join('\n');

    // ── Download (daftar bernomor, resolusi `monospace`) ──────────────────────
    let dlBlok = '';
    if (downloads && downloads.length) {
        dlBlok  = `${SEP}\n`;
        dlBlok += `📥 *DOWNLOAD*\n`;
        dlBlok += `${SEP2}\n`;
        downloads.forEach((dl, i) => {
            const hostStr = dl.links
                .slice(0, 4)
                .map(h => `[${h.host}](${h.url})`)
                .join(' · ');
            // Tandai host tersembunyi dengan ~strikethrough~
            const sisanya = dl.links.length > 4
                ? ` ~+${dl.links.length - 4} lainnya~`
                : '';
            dlBlok += `${i + 1}. \`${dl.resolusi}\` → ${hostStr}${sisanya}\n`;
        });
        dlBlok = dlBlok.trimEnd();
    }

    // ── Streaming (daftar berpoint •) ─────────────────────────────────────────
    const streamBlok = url
        ? `${SEP}\n` +
          `▶️ *STREAMING*\n` +
          `${SEP2}\n` +
          `• [▶ Server 1](${url}#nk-stream-1)\n` +
          `• [▶ Server 2](${url}#nk-stream-2)\n` +
          `• [▶ Server 3](${url}#nk-stream-3)`
        : null;

    // ── Susun baris ───────────────────────────────────────────────────────────
    const baris = [
        // [1] Header + waktu (paling penting di atas)
        katInfo.header,
        SEP,
        `📅 _${headerWaktu}_`,                          // _italic_ timestamp
        SEP,
        ``,
        // [2] Judul *bold*
        `*${title || '-'}*`,
        tanggal ? `_🗓 Rilis: ${tanggal}_` : null,      // _italic_ tanggal posting
        ``,
        // [3] Sinopsis (> kutip)
        sinopsisBlok ? `📖 *Sinopsis*` : null,
        sinopsisBlok || null,
        sinopsisBlok ? `` : null,
        // [4] Info
        SEP,
        `📋 *INFO*`,
        SEP2,
        infoBlok || '-',
        // [5] Download (bernomor + `monospace` + ~strikethrough~)
        dlBlok ? `\n${dlBlok}` : null,
        // [6] Streaming (berpoint)
        streamBlok ? `\n${streamBlok}` : null,
        // [7] Post & Source
        `\n${SEP}`,
        `🔗 *Post*   : ${url}`,
        `🌐 *Source* : nekopoi.care`,
    ];

    const captionPenuh = baris.filter(b => b !== null && b !== undefined).join('\n');
    if (captionPenuh.length <= 4000) return captionPenuh;
    // Total > 4000: potong HANYA sinopsis agar muat; blok info/download/
    // streaming/link tidak diutak-atik.
    const nonSinopsis = captionPenuh.length - (sinopsisBlok ? sinopsisBlok.length : 0);
    const budget = Math.max(0, 4000 - nonSinopsis - 1);
    let barisAkhir = baris;
    if (budget > 0 && sinopsisBlok) {
        const pendek = buatBlokSinopsis(potongTeks(sinOpsi, budget));
        barisAkhir = baris.map(b => b === sinopsisBlok ? pendek : b);
    } else {
        barisAkhir = baris.filter(b => b !== sinopsisBlok && b !== '📖 *Sinopsis*');
    }
    return barisAkhir.filter(b => b !== null && b !== undefined).join('\n');
}

// ── IMAGE HELPER ──────────────────────────────────────────────────────────────

// Cache strategi per domain: 'direct' | 'proxy'
const _domainStrategy  = {};
const STRATEGY_TTL_MS  = 6 * 60 * 60 * 1000; // 6 jam

function _getStrategy(domain) {
    const entry = _domainStrategy[domain];
    if (!entry) return 'direct';
    if (Date.now() - entry.since > STRATEGY_TTL_MS) { delete _domainStrategy[domain]; return 'direct'; }
    return entry.mode;
}

function _setStrategy(domain, mode) {
    _domainStrategy[domain] = { mode, since: Date.now() };
}

// Photon = CDN-nya animasu (i*.wp.com): mem-proxy file dari origin lewat
// infra Automattic yang tidak diblokir CF. Terbukti 27 Okt 2026 via oracle
// Jina: Jina membaca gambar Photon (fresh, tanpa warning cache) → Photon
// berhasil ambil file dari origin nekopoi.care. Bot sendiri sudah terbukti
// bisa ambil dari Photon (thumbnail .animasu test) — jadi rangkaiannya
// bot → Photon → origin jalan tanpa proxy berbayar & tanpa browser.
function buatPhotonUrl(url) {
    if (typeof url === 'string' && url.startsWith('https://nekopoi.care/')) {
        return 'https://i0.wp.com/' + url.slice('https://'.length);
    }
    return null;
}

function buatProxyUrl(url) {
    if (!url) return null;
    // Untuk nekopoi.care: Photon (bukan wsrv yang policy-block, bukan
    // translate yang diveto user). Bila Photon gagal di jalur kirim, try/catch
    // di tiap situs kirim jatuh ke caption teks.
    const photon = buatPhotonUrl(url);
    if (photon) return photon;
    return `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=jpg&q=85`;
}

// ── Cache thumbnail lokal ───────────────────────────────────────────────────
// Diisi dari LUAR bot (via browser Muse — satu-satunya jalur yang lolos CF
// untuk byte gambar; direct CF 403, semua proxy mati, Jina hanya kembalikan
// deskripsi teks). downloadImageBuffer mengecek disk DULU sebelum direct,
// jadi item yang thumbnailnya sudah di-seed terkirim sebagai gambar;
// yang belum di-seed tetap terkirim sebagai teks (fallback di jalur kirim).
const THUMB_CACHE_DIR = path.join(process.cwd(), 'data', 'nekopoi', 'thumbs');
function thumbCachePath(url) {
    const hash = crypto.createHash('sha256').update(url).digest('hex');
    const ext = (url.match(/\.(jpe?g|png|webp)(?:[?#]|$)/i) || [])[1] || 'jpg';
    return path.join(THUMB_CACHE_DIR, `${hash}.${ext.toLowerCase()}`);
}

async function downloadImageBuffer(url) {
    if (!url) return null;
    // 1) Cache disk (seed) — tanpa jaringan, tanpa kartu baru.
    //    Dicek SEBELUM strategi domain, agar seed tetap dipakai walau strategi
    //    domain sudah 'proxy' akibat CF 403 sebelumnya.
    try {
        const p = thumbCachePath(url);
        if (fs.existsSync(p)) {
            const buf = fs.readFileSync(p);
            if (buf && buf.length > 1000) return buf;
        }
    } catch (_) { /* lanjut ke Photon */ }
    let domain;
    try { domain = new URL(url).hostname; } catch (_) { return null; }

    // 2) Photon (CDN-nya animasu) untuk URL nekopoi.care — dicek magic byte
    //    (JPEG/PNG/WebP) agar halaman blokir tidak lolos sebagai "gambar".
    //    Fail-soft: gagal → lanjut ke direct, lalu null → caption teks.
    const photonUrl = buatPhotonUrl(url);
    if (photonUrl) {
        try {
            const pr = await axios.get(photonUrl, {
                headers: { ...HEADERS },
                responseType: 'arraybuffer',
                timeout: 15000,
            });
            if (pr.data && pr.data.byteLength > 1000) {
                const b = Buffer.from(pr.data);
                const isJpeg = b[0] === 0xFF && b[1] === 0xD8;
                const isPng = b[0] === 0x89 && b[1] === 0x50;
                const isWebp = b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45;
                if (isJpeg || isPng || isWebp) {
                    _setStrategy(domain, 'direct');
                    return b;
                }
            }
        } catch (_) { /* lanjut ke direct */ }
    }

    if (_getStrategy(domain) === 'proxy') return null;

    try {
        const r = await axios.get(url, {
            headers: {
                ...HEADERS,
                Referer: `https://${domain}/`,
                Origin : `https://${domain}`,
            },
            responseType: 'arraybuffer',
            timeout     : 12000,
        });
        if (r.data && r.data.byteLength > 1000) {
            _setStrategy(domain, 'direct');
            return Buffer.from(r.data);
        }
    } catch (_) {
        _setStrategy(domain, 'proxy');
    }
    return null;
}

// ── EXPORT ────────────────────────────────────────────────────────────────────

export { getEnabledGroups, setGroupEnabled, getActiveCategories, cariKontenBaru, buatCaption, tandaiSudahKirim, tandaiDanLog, getRecentLog, simulasi, downloadImageBuffer, buatProxyUrl, buatPhotonUrl, thumbCachePath };
export { handleNekopoinotif, handleNekpoiNotifReply, handleNekopoinotifCallbacks };
// ── COMMAND HANDLER ───────────────────────────────────────────────────────────

async function handleNekopoinotif({ hisoka, m, query, tolak, logCommand, Button, fs: fsMod, path: pathMod, loadConfig, pendingNekpoiNotifChoices }) {
    if (!m.isOwner) { await tolak(hisoka, m, '❌ Hanya owner yang bisa gunakan perintah ini.'); return; }

    const cfgPath = pathMod.join(process.cwd(), 'config.json');
    const sub     = (query || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const pfx     = m.prefix || '.';
    const cfg     = loadConfig();

    if (!cfg.nekopoinotif)           cfg.nekopoinotif           = { groups: {}, categories: ['hentai', '2d-animation', '3d-hentai'] };
    if (!cfg.nekopoinotif.groups)    cfg.nekopoinotif.groups    = {};
    if (!cfg.nekopoinotif.categories) cfg.nekopoinotif.categories = ['hentai', '2d-animation', '3d-hentai'];

    // ── NO SUBCOMMAND di grup → button status & aktifkan/nonaktifkan ─────────
    if (!sub || sub === 'help') {
        if (m.isGroup) {
            const gcEntry   = cfg.nekopoinotif.groups[m.from];
            const isReg     = gcEntry !== undefined;
            const isActive  = gcEntry?.enabled === true;

            if (isActive) {
                // Sudah aktif → tawarkan nonaktifkan + lihat list
                const _bodyAktif =
                    `╭─「 🎌 *NEKOPOI NOTIF* 」\n│\n` +
                    `│ Status grup ini : ✅ *AKTIF*\n│\n` +
                    `│ Fitur ini sudah aktif di grup ini.\n` +
                    `│ Notif anime dari nekopoi.care akan\n` +
                    `│ otomatis masuk ke sini.\n│\n` +
                    `│ Ketik *${pfx}nekopoinotif off* untuk matikan.\n│\n` +
                    `╰──────────────────────`;
                try {
                    await new Button()
                        .setBody(_bodyAktif)
                        .setFooter('🎌 Nekopoi Notif')
                        .addReply('❌ Nonaktifkan di GC ini', '__nknotif_off__')
                        .addReply('📋 Lihat GC Aktif',       '__nknotif_list__')
                        .run(m.from, hisoka, m);
                } catch (_) { await tolak(hisoka, m, _bodyAktif); }
            } else if (isReg) {
                // ID ada tapi belum aktif → tawarkan aktifkan + lihat list
                const _bodyReg =
                    `╭─「 🎌 *NEKOPOI NOTIF* 」\n│\n` +
                    `│ Status grup ini : ❌ *BELUM AKTIF*\n│\n` +
                    `│ ⚠️ ID grup ini sudah ada di daftar,\n` +
                    `│    tapi fitur belum diaktifkan.\n│\n` +
                    `│ Aktifkan notif nekopoi di GC ini?\n│\n` +
                    `╰──────────────────────`;
                try {
                    await new Button()
                        .setBody(_bodyReg)
                        .setFooter('🎌 Nekopoi Notif')
                        .addReply('✅ Ya, Aktifkan',    '__nknotif_on__')
                        .addReply('❌ Tidak, Batal',    '__nknotif_cancel__')
                        .addReply('📋 Lihat GC Aktif', '__nknotif_list__')
                        .run(m.from, hisoka, m);
                } catch (_) { await tolak(hisoka, m, _bodyReg + `\n\n✅ Ketik *${pfx}nekopoinotif on* untuk aktifkan.`); }
            } else {
                // Belum terdaftar sama sekali
                const _bodyBaru =
                    `╭─「 🎌 *NEKOPOI NOTIF* 」\n│\n` +
                    `│ Status grup ini : ➕ *BELUM TERDAFTAR*\n│\n` +
                    `│ Fitur ini belum aktif di grup ini.\n│\n` +
                    `│ Aktifkan notif nekopoi di GC ini?\n│\n` +
                    `╰──────────────────────`;
                try {
                    await new Button()
                        .setBody(_bodyBaru)
                        .setFooter('🎌 Nekopoi Notif')
                        .addReply('✅ Ya, Aktifkan',    '__nknotif_on__')
                        .addReply('❌ Tidak, Batal',    '__nknotif_cancel__')
                        .addReply('📋 Lihat GC Aktif', '__nknotif_list__')
                        .run(m.from, hisoka, m);
                } catch (_) { await tolak(hisoka, m, _bodyBaru + `\n\n✅ Ketik *${pfx}nekopoinotif on* untuk aktifkan.`); }
            }
            logCommand(m, hisoka, 'nekopoinotif-menu');
            return;
        }

        // Private chat → tampilkan help biasa
        const katAktif = (cfg.nekopoinotif.categories || []).join(', ') || 'semua';
        await tolak(hisoka, m,
            `╭─「 🎌 *NEKOPOI NOTIF* 」\n` +
            `│\n` +
            `│ Kategori aktif   : _${katAktif}_\n│\n` +
            `│ *Perintah (jalankan di GC):*\n` +
            `│ • ${pfx}nekopoinotif — menu aktifkan/nonaktifkan\n` +
            `│ • ${pfx}nekopoinotif on — aktifkan GC ini\n` +
            `│ • ${pfx}nekopoinotif off — nonaktifkan GC ini\n` +
            `│ • ${pfx}nekopoinotif status — list semua GC\n` +
            `│   ↳ Reply status: *add 1,2* — aktifkan\n` +
            `│   ↳ Reply status: *del 1,2* — nonaktifkan\n` +
            `│ • ${pfx}nekopoinotif test — test ke sini\n` +
            `│ • ${pfx}nekopoinotif test grup — test ke semua GC aktif\n` +
            `│ • ${pfx}nekopoinotif kategori — lihat/atur kategori\n` +
            `│\n` +
            `│ 💡 Bot kirim notif otomatis saat:\n` +
            `│    🎌 Hentai · 🎥 2D Animation · 🧊 3D Hentai\n` +
            `│ ⏱️ Realtime · cek tiap 2 menit\n` +
            `╰──────────────────────`
        );
        return;
    }

    // ── ON ────────────────────────────────────────────────────────────────────
    if (sub === 'on') {
        if (!m.isGroup) { await tolak(hisoka, m, '❌ Perintah ini hanya untuk grup.'); return; }
        const sebelumnya = cfg.nekopoinotif.groups[m.from]?.enabled === true;
        cfg.nekopoinotif.groups[m.from] = { enabled: true, diubahPada: Date.now() };
        fsMod.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
        const katAktifOn = cfg.nekopoinotif.categories || ['hentai', '2d-animation', '3d-hentai'];
        const _bodyOn =
            `╭─「 🎌 *NEKOPOI NOTIF* 」\n│\n` +
            `│ Status sebelumnya : ${sebelumnya ? '✅ ON' : '❌ OFF'}\n` +
            `│ Status sekarang   : ✅ *ON*\n│\n` +
            (sebelumnya
                ? `│ ℹ️ Sudah aktif sebelumnya.\n`
                : `│ ✅ Berhasil diaktifkan!\n│    Notif otomatis akan masuk ke GC ini.\n`) +
            `│\n│ Kategori : ${_katInfoLine(katAktifOn)}\n│\n` +
            `╰──────────────────────`;
        const _btn = new Button().setBody(_bodyOn).setFooter('🎌 Nekopoi Notif');
        _tambahBtnOnOff(_btn, true);
        await _runBtn(hisoka, m, _btn, _bodyOn, tolak);
        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
        logCommand(m, hisoka, 'nekopoinotif-on');
        return;
    }

    // ── OFF ───────────────────────────────────────────────────────────────────
    if (sub === 'off') {
        if (!m.isGroup) { await tolak(hisoka, m, '❌ Perintah ini hanya untuk grup.'); return; }
        const sebelumnya = cfg.nekopoinotif.groups[m.from]?.enabled === true;
        cfg.nekopoinotif.groups[m.from] = { enabled: false, diubahPada: Date.now() };
        fsMod.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
        const katAktifOff = cfg.nekopoinotif.categories || ['hentai', '2d-animation', '3d-hentai'];
        const _bodyOff =
            `╭─「 🎌 *NEKOPOI NOTIF* 」\n│\n` +
            `│ Status sebelumnya : ${sebelumnya ? '✅ ON' : '❌ OFF'}\n` +
            `│ Status sekarang   : ❌ *OFF*\n│\n` +
            (sebelumnya ? `│ ❌ Berhasil dinonaktifkan.\n` : `│ ℹ️ Sudah nonaktif sebelumnya.\n`) +
            `│\n│ Kategori : ${_katInfoLine(katAktifOff)}\n│\n` +
            `╰──────────────────────`;
        const _btnOff = new Button().setBody(_bodyOff).setFooter('🎌 Nekopoi Notif');
        _tambahBtnOnOff(_btnOff, false);
        await _runBtn(hisoka, m, _btnOff, _bodyOff, tolak);
        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
        logCommand(m, hisoka, 'nekopoinotif-off');
        return;
    }

    // ── KATEGORI ─────────────────────────────────────────────────────────────
    if (sub === 'kategori' || sub.startsWith('kategori ')) {
        const arg = sub.replace(/^kategori\s*/, '').trim();
        if (!arg) {
            const katAktif = (cfg.nekopoinotif.categories || []);
            await tolak(hisoka, m,
                `╭─「 🎌 *NEKOPOI KATEGORI* 」\n│\n` +
                `│ Aktif: *${katAktif.join(', ') || 'tidak ada'}*\n│\n` +
                `│ Tersedia:\n` +
                `│ • hentai\n` +
                `│ • 2d-animation\n` +
                `│ • 3d-hentai\n│\n` +
                `│ Contoh:\n` +
                `│ *${pfx}nekopoinotif kategori hentai 2d-animation*\n` +
                `│ → set kategori yang dimonitor\n` +
                `╰──────────────────────`
            );
            return;
        }
        const valid    = ['hentai', '2d-animation', '3d-hentai'];
        const dipilih  = arg.split(/[\s,]+/).map(s => s.trim()).filter(s => valid.includes(s));
        if (!dipilih.length) {
            await tolak(hisoka, m, `❌ Kategori tidak valid.\nPilih dari: ${valid.join(', ')}`);
            return;
        }
        cfg.nekopoinotif.categories = dipilih;
        fsMod.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
        await tolak(hisoka, m,
            `✅ Kategori diperbarui!\nAktif: *${dipilih.join(', ')}*`
        );
        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
        logCommand(m, hisoka, 'nekopoinotif-kategori');
        return;
    }

    // ── STATUS ────────────────────────────────────────────────────────────────
    if (sub === 'status') {
        await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
        try {
            const allGroupsRaw = await hisoka.groupFetchAllParticipating();
            const allGroups    = Object.values(allGroupsRaw || {})
                .sort((a, b) => (a.subject || '').localeCompare(b.subject || '', 'id'));

            const cfgSt     = loadConfig();
            const registered = cfgSt?.nekopoinotif?.groups || {};
            const totalAktif = Object.values(registered).filter(v => v?.enabled === true).length;
            const totalNon   = Object.values(registered).filter(v => v?.enabled === false).length;

            let txt = `╭─「 📋 *STATUS NEKOPOI NOTIF* 」\n│\n`;
            txt += `│ Total GC bot   : *${allGroups.length} grup*\n`;
            txt += `│ Terdaftar aktif: *${totalAktif} grup*\n`;
            if (totalNon) txt += `│ Nonaktif       : *${totalNon} grup*\n`;
            txt += `│\n│ Ket: ✅ Aktif  ❌ Nonaktif  ➕ Belum daftar\n`;
            txt += `│━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

            const _urutan = (g) => {
                const reg = registered[g.id];
                if (reg?.enabled === true)  return 0;
                if (reg?.enabled === false) return 1;
                return 2;
            };
            allGroups.sort((a, b) => {
                const uA = _urutan(a), uB = _urutan(b);
                if (uA !== uB) return uA - uB;
                return (a.subject || '').localeCompare(b.subject || '', 'id');
            });

            const gcList = allGroups.map((g, i) => {
                const jid  = g.id;
                const nama = (g.subject || 'Tanpa Nama').slice(0, 28);
                const reg  = registered[jid];
                const ikon = reg?.enabled === true ? '✅' : reg ? '❌' : '➕';
                return { no: i + 1, jid, nama, ikon };
            });

            let lastIkon = '';
            gcList.forEach(({ no, nama, ikon }) => {
                if (ikon !== lastIkon) {
                    const label = ikon === '✅' ? 'Aktif' : ikon === '❌' ? 'Nonaktif' : 'Belum daftar';
                    txt += `│ ┄ ${label} ┄\n`;
                    lastIkon = ikon;
                }
                const noStr = String(no).padStart(2, ' ');
                txt += `│ ${noStr}. ${ikon} ${nama}\n`;
            });

            txt += `│\n│ 📌 *Reply pesan ini:*\n`;
            txt += `│ • *add 1,2,3* — aktifkan GC nomor tsb\n`;
            txt += `│ • *del 2,4* — nonaktifkan GC nomor tsb\n`;
            txt += `│ ⏳ Menu berlaku *5 menit*\n╰──────────────────────`;

            const statusMsg = await hisoka.sendMessage(m.from, { text: txt }, { quoted: m });
            await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });

            if (pendingNekpoiNotifChoices) {
                const choiceKey = `${m.from}::${m.sender || m.key?.participant || ''}`;
                const old = pendingNekpoiNotifChoices.get(choiceKey);
                if (old?.timeout) clearTimeout(old.timeout);
                const t = setTimeout(() => pendingNekpoiNotifChoices.delete(choiceKey), 5 * 60 * 1000);
                pendingNekpoiNotifChoices.set(choiceKey, {
                    gcList,
                    botMsgId : statusMsg?.key?.id || '',
                    expiresAt: Date.now() + 5 * 60 * 1000,
                    timeout  : t,
                });
            }
            logCommand(m, hisoka, 'nekopoinotif-status');
        } catch (err) {
            console.error('[NekopoinNotif] status error:', err?.message);
            await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
            await tolak(hisoka, m, `❌ Gagal ambil list grup: ${err?.message || err}`);
        }
        return;
    }

    // ── TEST per kategori (test hentai / test 2d / test 3d) ──────────────────
    if (/^test\s+(hentai|2d|3d|2d-animation|3d-hentai)$/.test(sub)) {
        const katArg = sub.split(/\s+/)[1];
        const katSlug = katArg === '2d' ? '2d-animation' : katArg === '3d' ? '3d-hentai' : 'hentai';
        await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
        try {
            const hasil = await simulasi(katSlug);
            const imgBuf = hasil.urlGambar ? await downloadImageBuffer(hasil.urlGambar) : null;
            const proxyUrl = hasil.urlGambar ? buatProxyUrl(hasil.urlGambar) : null;
            if (imgBuf) {
                await hisoka.sendMessage(m.from, { image: imgBuf, mimetype: 'image/jpeg', caption: hasil.caption }, { quoted: m });
            } else if (proxyUrl) {
                try {
                    await hisoka.sendMessage(m.from, { image: { url: proxyUrl }, caption: hasil.caption }, { quoted: m });
                } catch (_) {
                    // Proxy gambar mati → caption teks tetap terkirim, bukan "Gagal".
                    await tolak(hisoka, m, hasil.caption);
                }
            } else {
                await tolak(hisoka, m, hasil.caption);
            }
            await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
            logCommand(m, hisoka, `nekopoinotif-test-${katSlug}`);
        } catch (err) {
            await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
            await tolak(hisoka, m, `❌ Gagal: ${err?.message || err}`);
        }
        return;
    }

    // ── TEST GRUP ─────────────────────────────────────────────────────────────
    if (sub === 'test grup') {
        await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
        try {
            const daftarGrup = getEnabledGroups();
            if (!daftarGrup.length) {
                await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                await tolak(hisoka, m, `❌ Belum ada GC aktif.\nKetik *${pfx}nekopoinotif on* di GC tujuan.`);
                return;
            }
            const hasil = await simulasi();
            let berhasil = 0, gagal = 0;
            for (const jid of daftarGrup) {
                try {
                    const imgBuf    = hasil.urlGambar ? await downloadImageBuffer(hasil.urlGambar) : null;
                    const proxyUrl  = hasil.urlGambar ? buatProxyUrl(hasil.urlGambar) : null;
                    if (imgBuf) {
                        await hisoka.sendMessage(jid, { image: imgBuf, mimetype: 'image/jpeg', caption: hasil.caption });
                    } else if (proxyUrl) {
                        try {
                            await hisoka.sendMessage(jid, { image: { url: proxyUrl }, caption: hasil.caption });
                        } catch (_) {
                            // Proxy gambar mati → caption teks tetap terkirim,
                            // grup ini dihitung berhasil, bukan gagal.
                            await hisoka.sendMessage(jid, { text: hasil.caption });
                        }
                    } else {
                        await hisoka.sendMessage(jid, { text: hasil.caption });
                    }
                    berhasil++;
                    await new Promise(r => setTimeout(r, 1500));
                } catch (e) {
                    gagal++;
                    console.error(`[NekopoinNotif] Gagal kirim test ke ${jid}:`, e?.message);
                }
            }
            await hisoka.sendMessage(m.from, {
                text: `✅ *Test NekoPoi Notif selesai!*\n\n📤 Terkirim ke: *${berhasil}/${daftarGrup.length} grup*` +
                      (gagal ? `\n❌ Gagal: ${gagal} grup` : ''),
            }, { quoted: m });
            await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
            logCommand(m, hisoka, 'nekopoinotif-test-grup');
        } catch (err) {
            await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
            await tolak(hisoka, m, `❌ Gagal: ${err?.message || err}`);
        }
        return;
    }

    // ── TEST ke sini ──────────────────────────────────────────────────────────
    if (sub === 'test') {
        await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
        try {
            const hasil  = await simulasi();
            const imgBuf = hasil.urlGambar ? await downloadImageBuffer(hasil.urlGambar) : null;
            const proxyUrl = hasil.urlGambar ? buatProxyUrl(hasil.urlGambar) : null;
            if (imgBuf) {
                await hisoka.sendMessage(m.from, { image: imgBuf, mimetype: 'image/jpeg', caption: hasil.caption }, { quoted: m });
            } else if (proxyUrl) {
                try {
                    await hisoka.sendMessage(m.from, { image: { url: proxyUrl }, caption: hasil.caption }, { quoted: m });
                } catch (_) {
                    // Proxy gambar mati → caption teks tetap terkirim, bukan "Gagal".
                    await tolak(hisoka, m, hasil.caption);
                }
            } else {
                await tolak(hisoka, m, hasil.caption);
            }
            await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
            logCommand(m, hisoka, 'nekopoinotif-test');
        } catch (err) {
            await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
            await tolak(hisoka, m, `❌ Gagal: ${err?.message || err}`);
        }
        return;
    }

    await tolak(hisoka, m, `❌ Sub-perintah tidak dikenal.\nKetik *${pfx}nekopoinotif* untuk bantuan.`);
}

// ── REPLY HANDLER ─────────────────────────────────────────────────────────────

async function handleNekpoiNotifReply({ hisoka, m, pendingNekpoiNotifChoices, getQuotedStanzaId, tolak, logCommand, loadConfig, fs: fsMod, path: pathMod }) {
    if (!pendingNekpoiNotifChoices || !pendingNekpoiNotifChoices.size) return false;
    if (!m.isOwner) return false;

    const quotedId  = getQuotedStanzaId(m);
    if (!quotedId) return false;

    const choiceKey = `${m.from}::${m.sender || m.key?.participant || ''}`;
    const pending   = pendingNekpoiNotifChoices.get(choiceKey);
    if (!pending || pending.botMsgId !== quotedId) return false;
    if (Date.now() > pending.expiresAt) {
        pendingNekpoiNotifChoices.delete(choiceKey);
        return false;
    }

    const teks  = (m.body || m.text || '').trim().toLowerCase();
    const match = teks.match(/^(add|del)\s+([\d,\s]+)$/i);
    if (!match) return false;

    const aksi    = match[1].toLowerCase();
    const nomor   = [...new Set(
        match[2].split(/[,\s]+/).map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n >= 1)
    )];
    if (!nomor.length) return false;

    const { gcList } = pending;
    const dipilih    = nomor.map(n => gcList[n - 1]).filter(Boolean);
    if (!dipilih.length) {
        await tolak(hisoka, m, `❌ Nomor tidak valid. Pilih antara 1–${gcList.length}.`);
        return true;
    }

    const cfgPath = pathMod.join(process.cwd(), 'config.json');
    const cfg     = loadConfig();
    if (!cfg.nekopoinotif)        cfg.nekopoinotif        = { groups: {}, categories: ['hentai', '2d-animation', '3d-hentai'] };
    if (!cfg.nekopoinotif.groups) cfg.nekopoinotif.groups = {};

    const namaList = [];
    for (const { jid, nama } of dipilih) {
        cfg.nekopoinotif.groups[jid] = { enabled: aksi === 'add', diubahPada: Date.now() };
        namaList.push(nama);
    }
    fsMod.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

    const ikon   = aksi === 'add' ? '✅' : '❌';
    const action = aksi === 'add' ? 'Diaktifkan' : 'Dinonaktifkan';

    let txt = `${ikon} *${action} (${dipilih.length} GC):*\n`;
    namaList.forEach((n, i) => { txt += `${i + 1}. ${n}\n`; });
    txt += `\n💡 Ketik *nekopoinotif status* untuk cek ulang.`;

    await hisoka.sendMessage(m.from, { react: { text: ikon, key: m.key } });
    await tolak(hisoka, m, txt);
    logCommand(m, hisoka, `nekopoinotif-${aksi}`);

    clearTimeout(pending.timeout);
    pendingNekpoiNotifChoices.delete(choiceKey);
    return true;
}

// ── HELPER: BUTTON KATEGORI ───────────────────────────────────────────────────
const _KAT_META = {
    'hentai'      : { id: '__nknotif_kat_hentai__', emoji: '🎌', nama: 'Hentai'    },
    '2d-animation': { id: '__nknotif_kat_2d__',     emoji: '🎥', nama: '2D Anim'   },
    '3d-hentai'   : { id: '__nknotif_kat_3d__',     emoji: '🧊', nama: '3D Hentai' },
};
// Tambah 3 button toggle kategori + tombol Kembali (dipakai di layar kategori)
function _tambahBtnKat(btn, katAktif) {
    for (const [slug, meta] of Object.entries(_KAT_META)) {
        const aktif = katAktif.includes(slug);
        btn.addReply(`${aktif ? '✅' : '❌'} ${meta.emoji} ${meta.nama}`, meta.id);
    }
    btn.addReply('🔙 Kembali', '__nknotif_back__');
}
// Tambah button toggle + Edit Kategori + Lihat GC (dipakai di layar ON/OFF)
function _tambahBtnOnOff(btn, isActive) {
    if (isActive) {
        btn.addReply('❌ Matikan GC Ini',  '__nknotif_off__');
    } else {
        btn.addReply('✅ Aktifkan GC Ini', '__nknotif_on__');
    }
    btn.addReply('✏️ Edit Kategori',   '__nknotif_kat_menu__');
    btn.addReply('📋 Lihat GC Aktif', '__nknotif_list__');
}
function _katInfoLine(katAktif) {
    const aktifStr = katAktif.map(s => (_KAT_META[s]?.emoji || '') + ' ' + (_KAT_META[s]?.nama || s)).join(', ') || 'tidak ada';
    return `_${aktifStr}_`;
}

// ── AUTO-CLEAN & SEND HELPER ──────────────────────────────────────────────────
// Track key pesan button terakhir bot per grup (untuk auto-delete saat tap berikutnya)
const _prevBtnKey = new Map();

// Hapus pesan button bot sebelumnya + pesan tap user → tidak spam di chat
async function _autoClean(hisoka, m) {
    // Hapus pesan bot sebelumnya yang ada button
    const prev = _prevBtnKey.get(m.from);
    if (prev) {
        try { await hisoka.sendMessage(m.from, { delete: prev }); } catch (_) {}
        _prevBtnKey.delete(m.from);
    }
    // Hapus pesan tap button user (m.key)
    if (m.key) {
        try { await hisoka.sendMessage(m.from, { delete: m.key }); } catch (_) {}
    }
}

// Kirim button, simpan key-nya untuk auto-delete berikutnya
async function _runBtn(hisoka, m, btn, fallbackBody, tolakFn) {
    try {
        const sent = await btn.run(m.from, hisoka, m);
        if (sent?.key) _prevBtnKey.set(m.from, sent.key);
    } catch (_) {
        await tolakFn(hisoka, m, fallbackBody);
    }
}

// ── BUTTON CALLBACK HANDLER ───────────────────────────────────────────────────
// Tangani tap button quick_reply dari menu .nekopoinotif di grup:
//   __nknotif_on__          → aktifkan GC ini
//   __nknotif_off__         → nonaktifkan GC ini
//   __nknotif_cancel__      → batalkan
//   __nknotif_list__        → tampilkan list semua GC aktif
//   __nknotif_kat_hentai__  → toggle kategori hentai
//   __nknotif_kat_2d__      → toggle kategori 2d-animation
//   __nknotif_kat_3d__      → toggle kategori 3d-hentai
async function handleNekopoinotifCallbacks({ hisoka, m, tolak, logCommand, Button, loadConfig, fs: fsMod, path: pathMod }) {
    if (!m.isOwner) return false;
    const txt = typeof m.text === 'string' ? m.text.trim() : '';
    const _VALID_CBS = [
        '__nknotif_on__', '__nknotif_off__', '__nknotif_cancel__', '__nknotif_list__',
        '__addallgrp__nekopoinotif', '__delallgrp__nekopoinotif',
        '__nknotif_kat_menu__', '__nknotif_back__',
        '__nknotif_kat_hentai__', '__nknotif_kat_2d__', '__nknotif_kat_3d__',
    ];
    if (!_VALID_CBS.includes(txt)) return false;

    // Auto-delete pesan button bot sebelumnya + pesan tap user → tidak spam
    await _autoClean(hisoka, m);

    const pfx     = m.prefix || '.';
    const cfgPath = pathMod.join(process.cwd(), 'config.json');

    // ── BATALKAN ─────────────────────────────────────────────────────────────
    if (txt === '__nknotif_cancel__') {
        await hisoka.sendMessage(m.from, { react: { text: '👋', key: m.key } });
        await tolak(hisoka, m, `ℹ️ Dibatalkan. Fitur nekopoi notif tidak diaktifkan di grup ini.`);
        return true;
    }

    // ── LIST GC AKTIF ─────────────────────────────────────────────────────────
    if (txt === '__nknotif_list__') {
        await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
        try {
            const pfxL   = m.prefix || '.';
            const cfg    = loadConfig();
            const groups = cfg?.nekopoinotif?.groups || {};
            const totalReg = Object.keys(groups).length;

            const aktifJids = Object.entries(groups)
                .filter(([, v]) => v?.enabled === true).map(([jid]) => jid);
            const nonJids   = Object.entries(groups)
                .filter(([, v]) => v?.enabled === false).map(([jid]) => jid);

            // ── Kosong: belum ada GC terdaftar ───────────────────────────────
            if (!totalReg) {
                await hisoka.sendMessage(m.from, { react: { text: '📋', key: m.key } });
                const _bodyKosong =
                    `🎌 *Nekopoi Notif — Daftar GC*\n` +
                    `━━━━━━━━━━━━━━━━━━\n\n` +
                    `> _Belum ada GC yang terdaftar._\n\n` +
                    `• Masuk ke GC tujuan\n` +
                    `• Ketik *${pfxL}nekopoinotif* lalu pilih\n` +
                    `  tombol *✅ Ya, Aktifkan*`;
                const _btnKosong = new Button().setBody(_bodyKosong).setFooter('🎌 Nekopoi Notif').addReply('🔄 Refresh', '__nknotif_list__');
                await _runBtn(hisoka, m, _btnKosong, _bodyKosong, tolak);
                return true;
            }

            // ── Ambil nama grup dari WA ───────────────────────────────────────
            let allGroupsMap = {};
            try {
                const raw = await hisoka.groupFetchAllParticipating();
                for (const [jid, meta] of Object.entries(raw || {})) {
                    allGroupsMap[jid] = (meta.subject || '').trim().slice(0, 28) || jid.split('@')[0];
                }
            } catch (_) {}
            const getNama = (jid) => allGroupsMap[jid] || jid.split('@')[0];

            // ── Susun pesan ───────────────────────────────────────────────────
            const katAktif = (cfg?.nekopoinotif?.categories || []).join(', ') || 'semua';

            let out = `🎌 *Nekopoi Notif — Daftar GC*\n`;
            out += `━━━━━━━━━━━━━━━━━━\n\n`;

            // Ringkasan (bullet)
            out += `• *Total terdaftar :* ${totalReg} GC\n`;
            out += `• *Aktif           :* *${aktifJids.length} GC*\n`;
            if (nonJids.length) out += `• *Nonaktif        :* ~${nonJids.length} GC~\n`;
            out += `• *Kategori        :* _${katAktif}_\n\n`;

            // List GC Aktif (bernomor)
            if (aktifJids.length) {
                out += `✅ *GC Aktif* _(notif berjalan)_\n`;
                out += `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n`;
                aktifJids.forEach((jid, i) => {
                    out += `${i + 1}. *${getNama(jid)}*\n`;
                });
                out += `\n`;
            }

            // List GC Nonaktif (bernomor, coret)
            if (nonJids.length) {
                out += `❌ *GC Nonaktif* _(notif dimatikan)_\n`;
                out += `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n`;
                nonJids.forEach((jid, i) => {
                    out += `${i + 1}. ~${getNama(jid)}~\n`;
                });
                out += `\n`;
            }

            // Catatan
            out += `> _Diperbarui otomatis setiap tap Refresh._`;

            // ── Tentukan button kontekstual ───────────────────────────────────
            // Cek status GC tempat pesan ini dikirim
            const gcEntry   = groups[m.from];
            const gcAktif   = gcEntry?.enabled === true;
            const gcNonaktif = gcEntry?.enabled === false;
            const gcBelum   = !gcEntry;

            await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });

            const _btnList = new Button()
                .setBody(out)
                .setFooter('🎌 Nekopoi Notif');

            // Button 1: aksi untuk GC ini (kontekstual)
            if (gcAktif)         _btnList.addReply('❌ Nonaktifkan GC Ini',  '__nknotif_off__');
            if (gcNonaktif || gcBelum) _btnList.addReply('✅ Aktifkan GC Ini', '__nknotif_on__');

            // Button 2: kontekstual — Aktifkan Semua ↔ Matikan Semua
            const _adaYgNonaktif = nonJids.length > 0 || gcBelum || gcNonaktif;
            const _semuaAktif    = aktifJids.length > 0 && !_adaYgNonaktif;
            if (_adaYgNonaktif)
                _btnList.addReply('➕ Aktifkan Semua GC', '__addallgrp__nekopoinotif');
            else if (_semuaAktif)
                _btnList.addReply('❌ Matikan Semua GC',  '__delallgrp__nekopoinotif');

            // Button 3: refresh selalu ada
            _btnList.addReply('🔄 Refresh', '__nknotif_list__');

            await _runBtn(hisoka, m, _btnList, out, tolak);

            logCommand(m, hisoka, 'nekopoinotif-list-btn');
        } catch (e) {
            await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
            await tolak(hisoka, m, `❌ Gagal ambil list GC: ${e.message}`);
        }
        return true;
    }

    // ── AKTIFKAN SEMUA GRUP ───────────────────────────────────────────────────
    if (txt === '__addallgrp__nekopoinotif') {
        await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
        try {
            const allGroupsRaw = await hisoka.groupFetchAllParticipating();
            const allJids      = Object.keys(allGroupsRaw || {});
            if (!allJids.length) {
                await tolak(hisoka, m, '❌ Bot tidak ada di grup manapun.');
                return true;
            }
            const cfg = loadConfig();
            if (!cfg.nekopoinotif)        cfg.nekopoinotif        = { groups: {}, categories: ['hentai', '2d-animation', '3d-hentai'] };
            if (!cfg.nekopoinotif.groups) cfg.nekopoinotif.groups = {};
            for (const jid of allJids)
                cfg.nekopoinotif.groups[jid] = { enabled: true, diubahPada: Date.now() };
            fsMod.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
            await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
            const _body =
                `╭─「 🎌 *NEKOPOI NOTIF* 」\n│\n` +
                `│ ✅ *${allJids.length} grup berhasil diaktifkan!*\n│\n` +
                `│ Notif anime nekopoi.care akan masuk\n` +
                `│ ke semua GC yang ada bot.\n│\n` +
                `╰──────────────────────`;
            const _btnAdd = new Button().setBody(_body).setFooter('🎌 Nekopoi Notif')
                .addReply('❌ Matikan Semua GC', '__delallgrp__nekopoinotif')
                .addReply('📋 Lihat GC Aktif',   '__nknotif_list__');
            await _runBtn(hisoka, m, _btnAdd, _body, tolak);
            logCommand(m, hisoka, 'nekopoinotif-addallgrp');
        } catch (e) {
            await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
            await tolak(hisoka, m, `❌ Gagal: ${e.message}`);
        }
        return true;
    }

    // ── NONAKTIFKAN SEMUA GRUP ────────────────────────────────────────────────
    if (txt === '__delallgrp__nekopoinotif') {
        await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
        try {
            const allGroupsRaw = await hisoka.groupFetchAllParticipating();
            const allJids      = Object.keys(allGroupsRaw || {});
            const cfg = loadConfig();
            if (!cfg.nekopoinotif)        cfg.nekopoinotif        = { groups: {}, categories: ['hentai', '2d-animation', '3d-hentai'] };
            if (!cfg.nekopoinotif.groups) cfg.nekopoinotif.groups = {};
            for (const jid of allJids)
                cfg.nekopoinotif.groups[jid] = { enabled: false, diubahPada: Date.now() };
            fsMod.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
            await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
            const _body =
                `╭─「 🎌 *NEKOPOI NOTIF* 」\n│\n` +
                `│ ❌ *${allJids.length} grup dinonaktifkan.*\n│\n` +
                `│ Notif tidak akan masuk ke GC manapun.\n│\n` +
                `│ Ketik *${pfx}nekopoinotif on* di GC yang\n` +
                `│ ingin diaktifkan kembali.\n│\n` +
                `╰──────────────────────`;
            const _btnDel = new Button().setBody(_body).setFooter('🎌 Nekopoi Notif')
                .addReply('➕ Aktifkan Semua GC', '__addallgrp__nekopoinotif')
                .addReply('📋 Lihat GC Aktif',    '__nknotif_list__');
            await _runBtn(hisoka, m, _btnDel, _body, tolak);
            logCommand(m, hisoka, 'nekopoinotif-delallgrp');
        } catch (e) {
            await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
            await tolak(hisoka, m, `❌ Gagal: ${e.message}`);
        }
        return true;
    }

    // ── KEMBALI ke layar ON/OFF ───────────────────────────────────────────────
    if (txt === '__nknotif_back__') {
        try {
            const cfg      = loadConfig();
            const gcEntry  = cfg?.nekopoinotif?.groups?.[m.from];
            const isActive = gcEntry?.enabled === true;
            const katAktif = cfg?.nekopoinotif?.categories || ['hentai', '2d-animation', '3d-hentai'];
            await hisoka.sendMessage(m.from, { react: { text: '🔙', key: m.key } });
            const _bodyBack =
                `╭─「 🎌 *NEKOPOI NOTIF* 」\n│\n` +
                `│ Status  : ${isActive ? '✅ *AKTIF*' : '❌ *NONAKTIF*'}\n│\n` +
                `│ Kategori: ${_katInfoLine(katAktif)}\n│\n` +
                `╰──────────────────────`;
            const _btn = new Button().setBody(_bodyBack).setFooter('🎌 Nekopoi Notif');
            _tambahBtnOnOff(_btn, isActive);
            await _runBtn(hisoka, m, _btn, _bodyBack, tolak);
            logCommand(m, hisoka, 'nekopoinotif-back');
        } catch (e) {
            await tolak(hisoka, m, `❌ Gagal: ${e.message}`);
        }
        return true;
    }

    // ── MENU KATEGORI ─────────────────────────────────────────────────────────
    if (txt === '__nknotif_kat_menu__') {
        try {
            const cfg      = loadConfig();
            const katAktif = cfg?.nekopoinotif?.categories || ['hentai', '2d-animation', '3d-hentai'];
            await hisoka.sendMessage(m.from, { react: { text: '✏️', key: m.key } });
            const _bodyMenu =
                `╭─「 🎌 *NEKOPOI NOTIF — KATEGORI* 」\n│\n` +
                `│ Kategori aktif :\n│ ${_katInfoLine(katAktif)}\n│\n` +
                `│ Tap tombol untuk aktifkan / matikan\n│ masing-masing kategori.\n│\n` +
                `╰──────────────────────`;
            const _btn = new Button().setBody(_bodyMenu).setFooter('🎌 Nekopoi Notif');
            _tambahBtnKat(_btn, katAktif);
            await _runBtn(hisoka, m, _btn, _bodyMenu, tolak);
            logCommand(m, hisoka, 'nekopoinotif-kat-menu');
        } catch (e) {
            await tolak(hisoka, m, `❌ Gagal: ${e.message}`);
        }
        return true;
    }

    // ── TOGGLE KATEGORI ───────────────────────────────────────────────────────
    const _katSlugMap = {
        '__nknotif_kat_hentai__': 'hentai',
        '__nknotif_kat_2d__'    : '2d-animation',
        '__nknotif_kat_3d__'    : '3d-hentai',
    };
    if (txt in _katSlugMap) {
        const slug = _katSlugMap[txt];
        try {
            const cfg = loadConfig();
            if (!cfg.nekopoinotif)              cfg.nekopoinotif              = { groups: {}, categories: ['hentai', '2d-animation', '3d-hentai'] };
            if (!cfg.nekopoinotif.categories)   cfg.nekopoinotif.categories   = ['hentai', '2d-animation', '3d-hentai'];
            const katAktif = [...cfg.nekopoinotif.categories];
            const idx = katAktif.indexOf(slug);
            const diaktifkan = idx === -1;
            if (diaktifkan) katAktif.push(slug);
            else            katAktif.splice(idx, 1);
            // Urutan baku: hentai → 2d-animation → 3d-hentai
            const URUTAN_KAT = ['hentai', '2d-animation', '3d-hentai'];
            cfg.nekopoinotif.categories = URUTAN_KAT.filter(s => katAktif.includes(s));
            fsMod.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

            const meta = _KAT_META[slug];
            const aktifStr = cfg.nekopoinotif.categories
                .map(s => _KAT_META[s]?.emoji + ' ' + (_KAT_META[s]?.nama || s)).join(', ') || 'tidak ada';
            await hisoka.sendMessage(m.from, { react: { text: diaktifkan ? '✅' : '❌', key: m.key } });

            const _bodyKat =
                `╭─「 🎌 *NEKOPOI NOTIF — KATEGORI* 」\n│\n` +
                `│ ${meta.emoji} *${meta.nama}* : ${diaktifkan ? '✅ Diaktifkan' : '❌ Dinonaktifkan'}\n│\n` +
                `│ Kategori aktif :\n│ _${aktifStr || 'tidak ada'}_\n│\n` +
                `│ Tap tombol untuk toggle kategori lainnya.\n│\n` +
                `╰──────────────────────`;
            const _btnKat = new Button().setBody(_bodyKat).setFooter('🎌 Nekopoi Notif');
            _tambahBtnKat(_btnKat, cfg.nekopoinotif.categories);
            await _runBtn(hisoka, m, _btnKat, _bodyKat, tolak);
            logCommand(m, hisoka, `nekopoinotif-kat-${slug}-${diaktifkan ? 'on' : 'off'}`);
        } catch (e) {
            await tolak(hisoka, m, `❌ Gagal toggle kategori: ${e.message}`);
        }
        return true;
    }

    if (!m.isGroup) {
        await tolak(hisoka, m, '❌ Hanya bisa digunakan di dalam grup.');
        return true;
    }

    const enabled = txt === '__nknotif_on__';
    try {
        const cfg = loadConfig();
        if (!cfg.nekopoinotif)        cfg.nekopoinotif        = { groups: {}, categories: ['hentai', '2d-animation', '3d-hentai'] };
        if (!cfg.nekopoinotif.groups) cfg.nekopoinotif.groups = {};
        cfg.nekopoinotif.groups[m.from] = { enabled, diubahPada: Date.now() };
        fsMod.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
        await hisoka.sendMessage(m.from, { react: { text: enabled ? '✅' : '❌', key: m.key } });

        if (enabled) {
            const katAktif = loadConfig()?.nekopoinotif?.categories || ['hentai', '2d-animation', '3d-hentai'];
            const _body =
                `╭─「 🎌 *NEKOPOI NOTIF* 」\n│\n` +
                `│ Status : ✅ *BERHASIL DIAKTIFKAN!*\n│\n` +
                `│ Notif anime dari nekopoi.care akan\n` +
                `│ otomatis masuk ke grup ini. 🎌\n│\n` +
                `│ Kategori : ${_katInfoLine(katAktif)}\n│\n` +
                `╰──────────────────────`;
            const _btnOn = new Button().setBody(_body).setFooter('🎌 Nekopoi Notif');
            _tambahBtnOnOff(_btnOn, true);
            await _runBtn(hisoka, m, _btnOn, _body, tolak);
        } else {
            const katAktif = loadConfig()?.nekopoinotif?.categories || ['hentai', '2d-animation', '3d-hentai'];
            const _bodyOff =
                `╭─「 🎌 *NEKOPOI NOTIF* 」\n│\n` +
                `│ Status : ❌ *DINONAKTIFKAN*\n│\n` +
                `│ Notif nekopoi tidak akan masuk ke\n` +
                `│ grup ini lagi.\n│\n` +
                `│ Kategori : ${_katInfoLine(katAktif)}\n│\n` +
                `╰──────────────────────`;
            const _btnOff = new Button().setBody(_bodyOff).setFooter('🎌 Nekopoi Notif');
            _tambahBtnOnOff(_btnOff, false);
            await _runBtn(hisoka, m, _btnOff, _bodyOff, tolak);
        }
        logCommand(m, hisoka, enabled ? 'nekopoinotif-on-btn' : 'nekopoinotif-off-btn');
    } catch (e) {
        await tolak(hisoka, m, `❌ Gagal: ${e.message}`);
    }
    return true;
}


/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const command = /^(nekopoinotif)$/i;
export const tags = ['anime'];
export const help = ['nekopoinotif'];
export default handleNekopoinotif;
