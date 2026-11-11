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
 *  alqanime-monitor.js — Monitor anime baru AlqAnime
 *  Cek update berkala, kirim notif ke grup yang terdaftar
 * ───────────────────────────────
 */
/**
 * ═══════════════════════════════════════════════════════════════
 *  AlqAnime New-Episode Monitor
 *  Cek update episode baru secara berkala dari AlqAnime —
 *  kirim notifikasi otomatis ke semua grup yang sudah
 *  mendaftar fitur anime-notify.
 * ═══════════════════════════════════════════════════════════════
 */
'use strict';

import { getHomepageData, getDetailAlqanime, handleAlq } from './alqanime.js';
/**
 * ─────────────────────────────────────────────────────
 *  FITUR   : Alqanime.net Realtime Monitor
 *  Fungsi  : Pantau rilisan episode Sub Indo terbaru
 *            dari alqanime.net (via r.jina.ai bypass CF).
 *            Thumbnail diambil dari MyAnimeList (MAL)
 *            via Jikan API — kualitas jernih & HD.
 *  Sumber  : alqanime.js + Jikan (api.jikan.moe)
 * ─────────────────────────────────────────────────────
 */

import axios from 'axios';
import path from 'path';
import fs from 'fs';

const DIR_DATA    = path.join(process.cwd(), 'data', 'alqanimenotif');
const FILE_DATA   = path.join(DIR_DATA, 'state.json');
const FILE_LOG    = path.join(DIR_DATA, 'log.json');
const FILE_CONFIG = path.join(process.cwd(), 'config.json');
fs.mkdirSync(DIR_DATA, { recursive: true });

// Buffer waktu (ms) yang ditambahkan ke lastCheckTime saat menghitung batas usia post
// Mencegah post yang terbit tepat di batas window terlewat akibat latensi jaringan
const BUFFER_MS     = 3 * 60 * 1000;   // 3 menit
// Berapa lama (ms) post gagal-fetch akan dicoba ulang sebelum diabaikan permanen
const RETRY_TTL_MS  = 30 * 60 * 1000;  // 30 menit
// Jangkauan awal (ms) saat belum ada lastCheckTime (misal: bot baru start)
const INIT_WINDOW_MS = 30 * 60 * 1000; // 30 menit

const JINA_BASE = 'https://r.jina.ai';
// Catatan: jangan tambahkan User-Agent Chrome/Safari ke HEADERS Jina.
// Jina (r.jina.ai) memblokir request dengan UA browser spesifik → 403.
const HEADERS   = {
    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
    'X-Return-Format': 'markdown',
};

// ── BACA / SIMPAN DATA ────────────────────────────────────────────────────────

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
    const groups = cfg?.alqanimenotif?.groups || {};
    return Object.entries(groups)
        .filter(([, v]) => v?.enabled === true)
        .map(([jid]) => jid);
}

function setGroupEnabled(jid, enabled) {
    const cfg = bacaConfig();
    if (!cfg.alqanimenotif)        cfg.alqanimenotif        = { groups: {} };
    if (!cfg.alqanimenotif.groups) cfg.alqanimenotif.groups = {};
    cfg.alqanimenotif.groups[jid] = { enabled, diubahPada: Date.now() };
    simpanConfig(cfg);
}

// ── HELPER: PARSE JUDUL & NOMOR EPISODE ───────────────────────────────────────

function parseJudulEp(titleRaw) {
    const epM   = (titleRaw || '').match(/Episode\s+\(?(\d+)\)?/i);
    const epNum = epM ? parseInt(epM[1]) : 0;
    const judul = (titleRaw || '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')   // H1 kadang berupa link markdown: [Judul](url) → Judul
        // NOTE: kurung buka menggantung (tanda judul terpotong) SENGAJA tidak di-strip di sini —
        // itu sinyal untuk judulTerpotong()/ambilDetailLengkap. Pembersihan tampilan ada di bersihkanInline().
        .replace(/\s*Episode\s+\(?\d+\)?\s*/gi, '')
        .replace(/\s*Sub\s*Indo\s*Uncensored\s*/gi, '')
        .replace(/\s*Sub\s*Indo\s*/gi, '')
        .replace(/\s*Uncensored\s*$/gi, '')
        .replace(/\s*-\s*Alqanime\s*$/gi, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\s{2,}/g, ' ')
        .trim();
    return { judul, epNum };
}

// ── Deteksi judul terpotong ─────────────────────────────────────────────────
// Jina reader kadang memotong markdown TEPAT di tengah baris H1, misal:
//   "# [Kanojo no Tomodachi Uncen"  → kurung buka menggantung.
// Fetch seperti ini "sukses" (tanpa error) sehingga retry error-based TIDAK kepicu.
// Solusi: validasi kelengkapan → retry fetch → fallback ke judul card homepage.
function judulTerpotong(t) {
    const s = String(t || '').trim();
    if (!s) return true;
    if (/\[[^\]]*$/.test(s)) return true;   // kurung buka menggantung di akhir
    return false;
}

// Ambil detail dengan validasi kelengkapan + retry bila data terpotong.
// Kembalikan { detail, judul, epNum } — judul fallback ke card homepage bila tetap terpotong.
async function ambilDetailLengkap(url, cardJudul, cardEpNum, maksRetry = 2) {
    let detail   = await getDetailAlqanime(url);
    let parsed   = parseJudulEp(detail.title || '');
    let judulFix = parsed.judul;
    let epFix    = parsed.epNum;

    for (let r = 0; r < maksRetry && judulTerpotong(judulFix); r++) {
        console.warn(`[AlqanimeNotif] ⚠️ Judul terpotong ("${judulFix}"), retry fetch ${r + 1}/${maksRetry}...`);
        await new Promise(res => setTimeout(res, 1500));
        try {
            const d2 = await getDetailAlqanime(url);
            const p2 = parseJudulEp(d2.title || '');
            if (!judulTerpotong(p2.judul)) {
                detail = d2; parsed = p2; judulFix = p2.judul; epFix = p2.epNum;
                console.log(`[AlqanimeNotif] ✅ Retry judul OK: "${judulFix}"`);
                break;
            }
        } catch (e) {
            console.warn('[AlqanimeNotif] ⚠️ Retry judul gagal:', e?.message);
        }
    }

    // Fallback terakhir: judul dari card homepage (lengkap dari daftar rilisan)
    if (judulTerpotong(judulFix) && cardJudul && !judulTerpotong(cardJudul)) {
        console.log(`[AlqanimeNotif] ↩️ Pakai judul card: "${cardJudul}"`);
        judulFix = cardJudul;
        epFix    = epFix || cardEpNum;
    }
    return { detail, judul: judulFix, epNum: epFix };
}

function buatId(url, epNum) {
    const slug = (url || '').replace(/^https?:\/\/alqanime\.net\//, '').replace(/\/+$/, '');
    return `${slug}::${epNum}`;
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
        const sudahAda = log.terkirim.some(e => String(e.id) === String(item.id));
        if (!sudahAda) {
            log.terkirim.unshift({
                id         : String(item.id),
                judul      : item.judul || '-',
                epNum      : item.epNum || 0,
                waktuKirim : new Date().toISOString(),
                grupCount  : grupList.length,
                grupList,
                thumbnail  : item.thumbnail || null,
                url        : item.url || null,
            });
            if (log.terkirim.length > 300) log.terkirim = log.terkirim.slice(0, 300);
            simpanLog(log);
        }
    } catch (e) {
        console.warn('[AlqanimeNotif] Gagal simpan log:', e?.message);
    }
}

function getRecentLog(jumlah = 20) {
    return (bacaLog().terkirim || []).slice(0, jumlah);
}

// ── CARI EPISODE BARU ─────────────────────────────────────────────────────────
//
// Menggunakan lastCheckTime (disimpan di state.json) sebagai penanda kapan terakhir
// kali cek dilakukan — sama seperti animasu.js. Sehingga tidak ada episode yang
// terlewat meski bot restart. idGagal dicoba ulang tiap siklus selama maks
// RETRY_TTL_MS (30 menit) sebelum diabaikan permanen.

async function cariEpisodeBaru() {

    const now  = Date.now();
    const data = bacaData();

    const isFirstRun = !data.lastCheckTime;

    data.lastCheckTime = now;
    if (!data.idTerkirim) data.idTerkirim = [];
    if (!data.idGagal)    data.idGagal    = [];
    simpanData(data);

    const baru        = [];
    const idGagalBaru = [];

    // ── Fetch homepage 1x — dapat semua section sekaligus ─────────────────────
    let homeData = { lagiHangat: [], rilisanTerbaru: [], semua: [] };
    try {
        homeData = await getHomepageData();
    } catch (e) {
        console.error('[AlqanimeNotif] ❌ Gagal fetch homepage:', e?.message);
    }

    const cards = homeData.semua;

    // ── Cek perubahan "Lagi Hangat" (sync, baca/tulis state.json) ─────────────
    const perubahanHangat = cariPerubahanHangat(homeData.lagiHangat);

    // ── Retry gagal sebelumnya ─────────────────────────────────────────────────
    for (const gagal of (data.idGagal || [])) {
        if (sudahDikirim(gagal.id)) continue;

        const usiaGagal = now - new Date(gagal.pertamaGagal).getTime();
        if (usiaGagal > RETRY_TTL_MS) {
            // Daripada hilang diam-diam: kirim notif minimal dari data card homepage
            // (judul + link; tanpa info/download). "Work sebagian" > 0%.
            console.log(`[AlqanimeNotif] ⏰ Retry timeout — kirim notif minimal: "${gagal.judul}" ep ${gagal.epNum}`);
            baru.push({
                id       : gagal.id,
                url      : gagal.url,
                judul    : gagal.judul,
                epNum    : gagal.epNum,
                thumbnail: gagal.thumbnail,
                title    : gagal.judul,
                info     : {},
                genres   : [],
                sinopsis : '',
                episodes : [],
            });
            tandaiSudahKirim(gagal.id);
            continue;
        }

        try {
            const { detail, judul: judulFix, epNum: epFix } =
                await ambilDetailLengkap(gagal.url, gagal.judul, gagal.epNum);
            const item   = {
                id       : gagal.id,
                url      : gagal.url,
                judul    : judulFix,
                epNum    : epFix,
                thumbnail: detail.thumbnail || gagal.thumbnail,
                ...detail,
            };
            console.log(`[AlqanimeNotif] 🔄 Retry berhasil: "${gagal.judul}" ep ${gagal.epNum}`);
            baru.push(item);
        } catch (e) {
            console.warn(`[AlqanimeNotif] 🔄 Retry masih gagal "${gagal.judul}":`, e?.message);
            idGagalBaru.push(gagal);
        }
    }

    // ── Pertama kali bot jalan — tandai semua sebagai seen, jangan kirim ──────
    if (isFirstRun) {
        console.log(`[AlqanimeNotif] 🚀 First run — tandai ${cards.length} card sebagai seen`);
        const df = bacaData();
        for (const card of cards) {
            const { epNum } = parseJudulEp(card.title || '');
            const id = buatId(card.url, epNum);
            if (!df.idTerkirim.includes(String(id))) df.idTerkirim.unshift(String(id));
        }
        df.idGagal = idGagalBaru;
        simpanData(df);
        return { episodes: [], perubahanHangat: [], lagiHangat: homeData.lagiHangat };
    }

    // ── Run normal ─────────────────────────────────────────────────────────────
    for (const card of cards) {
        const { judul, epNum } = parseJudulEp(card.title || '');
        const id = buatId(card.url, epNum);
        if (sudahDikirim(id)) continue;

        try {
            const { detail, judul: judulFix, epNum: epFix } =
                await ambilDetailLengkap(card.url, judul, epNum);
            const baseItem = {
                id,
                url      : card.url,
                judul    : judulFix,
                epNum    : epFix,
                thumbnail: detail.thumbnail || card.thumbnail,
                ...detail,
            };
            baru.push(baseItem);
        } catch (e) {
            console.warn(`[AlqanimeNotif] ❌ Gagal fetch detail "${judul}" ep ${epNum}:`, e?.message);
            idGagalBaru.push({
                id,
                url         : card.url,
                judul,
                epNum,
                thumbnail   : card.thumbnail,
                pertamaGagal: new Date().toISOString(),
            });
        }
    }

    const dataFinal = bacaData();
    dataFinal.idGagal = idGagalBaru;
    simpanData(dataFinal);

    return { episodes: baru, perubahanHangat, lagiHangat: homeData.lagiHangat };
}

// ── SIMULASI ──────────────────────────────────────────────────────────────────

async function simulasi() {

    const homeData = await getHomepageData();
    const cards    = homeData.rilisanTerbaru.length ? homeData.rilisanTerbaru : homeData.semua;
    if (!cards.length) throw new Error('Tidak ada rilisan terbaru dari alqanime.net');

    const sections = { lagiHangat: homeData.lagiHangat, rilisanTerbaru: homeData.rilisanTerbaru };

    const card   = cards[0];
    const { judul, epNum } = parseJudulEp(card.title || '');
    const id     = buatId(card.url, epNum);
    const detail = await getDetailAlqanime(card.url);
    const { judul: judulD, epNum: epD } = parseJudulEp(detail.title || '');

    const baseItem = {
        id,
        url      : card.url,
        judul    : judulD || judul,
        epNum    : epD || epNum,
        thumbnail: detail.thumbnail || card.thumbnail,
        ...detail,
        sections,
    };

    const caption   = buatCaptionGabung(baseItem);
    const urlGambar = baseItem.thumbnail || null;
    return { caption, urlGambar, alqThumbnail: baseItem.thumbnail };
}

// ── FORMAT CAPTION ────────────────────────────────────────────────────────────

const SEP  = '━━━━━━━━━━━━━━━━━━';
const SEP2 = '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄';

 function bersihkanInline(teks) {
     let t = String(teks ?? '')
         .replace(/[*_~`]/g, '')
         .replace(/\s{2,}/g, ' ')
         .trim();
     // Hapus kurung buka yang menggantung (judul terpotong)
     t = t.replace(/^\[([^\]]*)$/, '$1').trim();
     return t;
 }

 function formatMono(teks) {
     const value = bersihkanInline(teks);
     return value ? `\`${value}\`` : '';
 }

 function buatDaftarInfo(items) {
     const valid = items
         .map(([emoji, label, value, formatter]) => ({
             emoji,
             label,
             value: bersihkanInline(value),
             formatter,
         }))
         .filter(item => item.value && item.value !== '-');

     return valid.map((item, index) => {
         const value = item.formatter ? item.formatter(item.value) : item.value;
         return `${index + 1}. ${item.emoji} *${item.label}:* ${value}`;
     }).join('\n');
 }

 function buatDaftarDownload(episodes, tipe) {
     if (!episodes.length) return '';

     const epTerbaru = episodes[0];
     const resolusiList = Object.entries(epTerbaru.links || {});
     if (!resolusiList.length) return '';

     const label = tipe === 'batch'
         ? '📥 *DOWNLOAD BATCH*'
         : tipe === 'movie'
         ? '📥 *DOWNLOAD MOVIE*'
         : `📥 *DOWNLOAD EP ${bersihkanInline(epTerbaru.episode || '?')}*`;

     const rows = resolusiList.map(([res, hosts], index) => {
         const hostStr = hosts
             .slice(0, 3)
             .map(host => `[${bersihkanInline(host.host || 'Link')}](${host.url})`)
             .join('  ');
         return `${index + 1}. ${formatMono(res.toUpperCase())} → ${hostStr}`;
     });

     return [SEP, label, SEP2, ...rows].join('\n');
 }

 function potongSinopsis(teks, maks = 9999) {
     const t = bersihkanInline(teks);
    if (t.length <= maks) return t;
    return t.slice(0, maks).trimEnd() + '…';
}

function buatBarisInfo(items) {
    const valid = items.filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== '-');
    return valid.map(([label, val], i) => {
        const prefix = i === valid.length - 1 ? '╰' : '├';
        return `${prefix} ${label} : ${val}`;
    }).join('\n');
}

// ── Deteksi tipe rilisan: batch / episode / movie ─────────────────────────────
//
// titleRaw  = detail.title (judul asli dari halaman, sebelum dibersihkan)
// episodes  = array download dari parseDownloadLinks (index 0 = terbaru)
// epNum     = nomor episode dari parse judul card (fallback)
//
function deteksiTipeEp(titleRaw, episodes, epNum) {
    const title = titleRaw || '';

    // ── Deteksi BD / Bluray ──────────────────────────────────────────────────
    const isBD = /\bBD\b|\bBlu[-\s]?ray\b/i.test(title);

    // ── Batch? ───────────────────────────────────────────────────────────────
    if (/batch/i.test(title)) {
        let startNum = 1, endNum = null;

        // Coba parse range lengkap: "Batch (Episode 01 – 12)" atau "Batch (01 – 12)"
        const fullRange = title.match(/Batch\s*\(\s*(?:Episode\s+)?(\d+)\s*[–\-]\s*(\d+)\s*\)/i);
        if (fullRange) {
            startNum = parseInt(fullRange[1]);
            endNum   = parseInt(fullRange[2]);
        } else {
            // Parse "(– 12)" — hanya ada end
            const endOnly = title.match(/Batch\s*\(\s*[–\-]\s*(\d+)\s*\)/i);
            if (endOnly) {
                startNum = 1;
                endNum   = parseInt(endOnly[1]);
            } else if (episodes && episodes.length > 0) {
                // Fallback ke episodes array (newest=index 0, oldest=last)
                const newestM = String(episodes[0].episode || '').match(/(\d+)/);
                const oldestM = String(episodes[episodes.length - 1].episode || '').match(/(\d+)/);
                if (oldestM) startNum = parseInt(oldestM[1]);
                if (newestM) endNum   = parseInt(newestM[1]);
            }
        }

        const startStr    = String(startNum).padStart(2, '0');
        const endStr      = endNum ? String(endNum).padStart(2, '0') : null;
        const batchTotal  = (endNum && endNum >= startNum) ? (endNum - startNum + 1) : null;
        const epHeader    = endStr ? `Batch ${startStr}-${endStr}` : 'Batch';

        return { tipe: 'batch', epHeader, isBD, batchTotal, batchStart: startNum, batchEnd: endNum };
    }

    // ── Episode single ───────────────────────────────────────────────────────
    // Prioritas: label asli dari download list (bisa ada "[END]"), lalu epNum
    const epDariList = (episodes && episodes.length)
        ? (() => {
            const m = String(episodes[0].episode || '').match(/(\d+)/);
            return m ? parseInt(m[1]) : 0;
        })()
        : 0;

    const epFinal = epDariList || epNum || 0;
    if (epFinal) {
        // Pakai label asli supaya "[END]" ikut tampil
        const epLabel = (episodes && episodes.length && episodes[0].episode)
            ? episodes[0].episode
            : String(epFinal).padStart(2, '0');
        return { tipe: 'episode', epHeader: `Episode ${epLabel}`, isBD: false };
    }

    // ── Movie / OVA / tanpa episode ──────────────────────────────────────────
    // Cek apakah ada kata OVA/Movie di judul untuk label lebih spesifik
    const isOVA   = /\bOVA\b/i.test(title);
    const isMovie = /\bmovie\b|\bfilm\b/i.test(title);
    const movieLabel = isOVA ? 'OVA' : isMovie ? 'Movie' : 'Movie / OVA';
    return { tipe: 'movie', epHeader: movieLabel, isBD };
}

function buatLabelRilisan(item = {}) {
    const title = String(item.title || item.judul || '');
    const infoType = String(item.info?.Tipe || '').trim();
    const typeText = `${infoType} ${title}`;

    if (Number(item.epNum) > 0) return `Ep ${item.epNum}`;
    if (/\bOVA\b/i.test(typeText)) return 'OVA';
    if (/\bOAD\b/i.test(typeText)) return 'OAD';
    if (/\bONA\b/i.test(typeText)) return 'ONA';
    if (/\b(?:TV\s*)?Special\b/i.test(typeText)) return 'Special';
    if (/\bmovie\b|\bfilm\b/i.test(typeText)) return 'Movie';
    return infoType || 'Special';
}

// ── Caption GAMBAR — pendek, muat di batas 1024 karakter WhatsApp ────────────
function buatCaption(data) {
    const {
        judul, epNum,
        info = {}, genres = [], url,
    } = data;

    const sekarang    = new Date();
    const opsiHari    = { timeZone: 'Asia/Jakarta', weekday: 'long' };
    const opsiTgl     = { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'long', year: 'numeric' };
    const opsiJam     = { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false };
    const namaHari    = sekarang.toLocaleDateString('id-ID', opsiHari);
    const tglLengkap  = sekarang.toLocaleDateString('id-ID', opsiTgl);
    const jamMenit    = sekarang.toLocaleTimeString('id-ID', opsiJam).replace('.', ':');
    const headerWaktu = `${namaHari}, ${tglLengkap} · ${jamMenit} WIB`;

    const ep        = epNum || '?';
    const totalSeri = info.Episode ? parseInt(info.Episode) || 0 : 0;
    const epHeader  = totalSeri ? `${ep}/${totalSeri}` : String(ep);
    const genreStr  = genres.length ? genres.slice(0, 4).join(', ') : null;
    const judulAlt  = info.judulAlt ? `_${info.judulAlt}_\n` : '';

    const infoBlok = buatBarisInfo([
        ['🗂️ *Tipe*    ', info.Tipe    || null],
        ['⏱️ *Durasi*  ', info.Durasi  || null],
        ['📡 *Status*  ', info.Status  || null],
        ['🏢 *Studio*  ', info.Studio  || null],
        ['⭐ *Score*   ', info.Score ? `${info.Score}/10` : null],
        ['🎭 *Genre*   ', genreStr],
    ]);

    return (
        `🔴 *RILISAN BARU!*\n` +
        `${SEP}\n` +
        `📅 _${headerWaktu}_\n` +
        `${SEP}\n\n` +
        `🎌 *${judul}*\n` +
        (judulAlt ? judulAlt : '') +
        `\n📺 *Episode ${epHeader}*\n\n` +
        `${SEP}\n` +
        `${infoBlok}\n` +
        `${SEP}\n` +
        `▶️ *Tonton* : ${url}`
    );
}

// ── Caption LANJUTAN — sinopsis penuh + info lengkap + download ───────────────
function buatCaptionLanjutan(data) {
    const {
        judul, epNum, title,
        info = {}, sinopsis, episodes = [], url,
    } = data;

    const { epHeader } = deteksiTipeEp(title || judul, episodes, epNum);

    const sinopsisBlock = potongSinopsis(sinopsis)
        .split('\n').map(b => `> ${b}`).join('\n');

    const seksi1 = buatBarisInfo([
        ['🗓️ *Dirilis*  ', info.Dirilis  || null],
        ['🌸 *Musim*    ', info.Musim    || null],
        ['🗣️ *Subtitle* ', info.Subtitle || null],
        ['✏️ *Credit*   ', info.Credit   || null],
        ['👥 *Casts*    ', info.Casts    || null],
    ]);

    const seksi2 = buatBarisInfo([
        ['📤 *Oleh*       ', info['Diposting oleh']  || null],
        ['🗓️ *Diposting*  ', info['Diposting pada']  || null],
        ['🔄 *Diperbarui* ', info['Diperbarui pada'] || null],
    ]);

    let dlBlok = '';
    if (episodes.length) {
        const epTerbaru    = episodes[0];
        const resolusiList = Object.entries(epTerbaru.links || {}).slice(0, 4);
        if (resolusiList.length) {
            dlBlok += `\n${SEP}\n`;
            dlBlok += `📥 *DOWNLOAD EP ${epTerbaru.episode}*\n`;
            dlBlok += `${SEP2}\n`;
            for (const [res, hosts] of resolusiList) {
                const hostStr = hosts.slice(0, 3).map(h => `[${h.host}](${h.url})`).join('  ');
                dlBlok += `├ ${res.toUpperCase()} → ${hostStr}\n`;
            }
            dlBlok = dlBlok.trimEnd();
        }
    }

    return (
        `📖 *Sinopsis — ${judul}${epHeader ? ` · ${epHeader}` : ''}*\n` +
        `${SEP}\n` +
        `${sinopsisBlock}\n` +
        (seksi1 ? `\n${SEP}\n📋 *Info Lanjutan*\n${SEP2}\n${seksi1}\n` : '') +
        (seksi2 ? `${SEP2}\n${seksi2}\n` : '') +
        dlBlok
    );
}

// ── Deteksi status ongoing/tamat dari info.Status ────────────────────────────
function deteksiStatusSeri(statusRaw) {
    const s = (statusRaw || '').toLowerCase();
    if (/ongoing|berlangsung|airing|tayang/i.test(s))  return 'ongoing';
    if (/completed|complete|tamat|selesai|finished/i.test(s)) return 'tamat';
    return 'unknown';
}

// ── Caption GABUNGAN — gambar + sinopsis + download dalam 1 pesan ─────────────
function buatCaptionGabung(data) {
    const {
        judul, epNum, title,
        info = {}, genres = [], sinopsis, episodes = [], url,
    } = data;

    const sekarang   = new Date();
    const opsiHari   = { timeZone: 'Asia/Jakarta', weekday: 'long' };
    const opsiTgl    = { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'long', year: 'numeric' };
    const opsiJam    = { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false };
    const namaHari   = sekarang.toLocaleDateString('id-ID', opsiHari);
    const tglLengkap = sekarang.toLocaleDateString('id-ID', opsiTgl);
    const jamMenit   = sekarang.toLocaleTimeString('id-ID', opsiJam).replace('.', ':');
    const headerWaktu = `${namaHari}, ${tglLengkap} · ${jamMenit} WIB`;

    const { tipe, epHeader, isBD, batchTotal } = deteksiTipeEp(title || judul, episodes, epNum);
    const statusSeri = deteksiStatusSeri(info.Status);
    const totalSeri  = info.Episode ? parseInt(info.Episode) || 0 : 0;
    const genreStr   = genres.length ? genres.join(', ') : null;

    // ── Header utama — beda tiap tipe ────────────────────────────────────────
    let headerUtama, badgeTipe, badgeStatus;

    if (tipe === 'batch') {
        headerUtama = `📦 *BATCH RELEASE!*`;
        badgeTipe   = `📦 *Batch* ${isBD ? '| 💿 BD/Bluray' : ''}`.trim();
        badgeStatus = `⚫ *Tamat/Complete*`;
    } else if (tipe === 'movie') {
        const isOVA = /\bOVA\b/i.test(title || judul);
        headerUtama = isOVA ? `🎞️ *OVA BARU!*` : `🎬 *MOVIE BARU!*`;
        badgeTipe   = isOVA ? `🎞️ *OVA*` : `🎬 *Movie*`;
        badgeStatus = `⚫ *Tamat/Complete*`;
    } else {
        // Episode ongoing
        headerUtama = `🔴 *EPISODE BARU!*`;
        badgeTipe   = null;
        badgeStatus = statusSeri === 'tamat'
            ? `⚫ *Tamat* _(ep terakhir)_`
            : statusSeri === 'ongoing'
            ? `🟢 *Ongoing* _(masih tayang)_`
            : null;
    }

    // Judul alt — plain text di bawah judul utama
    const judulAlt = info.judulAlt ? `_${bersihkanInline(info.judulAlt)}_\n` : '';

    // Sinopsis
    const sinopsisText = potongSinopsis(sinopsis);
    const sinopsisBlok = sinopsisText
        ? sinopsisText.split('\n').map(b => b.trim() ? `> ${b}` : '').join('\n')
        : '';

    // Info batch: jumlah episode
    const batchIsiStr = (tipe === 'batch' && batchTotal) ? `${batchTotal} Episode` : null;
    const formatStr   = isBD ? 'BD / Bluray' : null;

    // ── Info Grup 1: metadata utama ──
    const seksi1 = buatDaftarInfo([
        ['🗂️', 'Tipe', info.Tipe, formatMono],
        ['📦', 'Episode', tipe === 'batch'
            ? (batchIsiStr || (totalSeri ? String(totalSeri) : null))
            : tipe === 'movie'
            ? null
            : (totalSeri ? `${epNum || '?'}/${totalSeri}` : null), formatMono],
        ['💿', 'Format', formatStr, formatMono],
        ['🗓️', 'Dirilis', info.Dirilis],
        ['🌸', 'Musim', info.Musim],
        ['📡', 'Status', info.Status],
        ['🏢', 'Studio', info.Studio],
        ['🗣️', 'Subtitle', info.Subtitle],
        ['✏️', 'Credit', info.Credit],
    ]);

    // ── Info Grup 2: score, genre, casts ──
    const seksi2 = buatDaftarInfo([
        ['⭐', 'Score', info.Score ? `${info.Score}/10` : null, formatMono],
        ['🎭', 'Genre', genreStr],
        ['👥', 'Casts', info.Casts],
    ]);

    // ── Info Grup 3: info posting ──
    const seksi3 = buatDaftarInfo([
        ['📤', 'Oleh', info['Diposting oleh']],
        ['🗓️', 'Diposting', info['Diposting pada']],
        ['🔄', 'Diperbarui', info['Diperbarui pada']],
    ]);

    const infoAnime = [
        seksi1 ? `${SEP2}\n${seksi1}` : '',
        seksi2 ? `\n${SEP2}\n${seksi2}` : '',
        seksi3 ? `\n${SEP2}\n${seksi3}` : '',
    ].filter(Boolean).join('');

    // ── Download ──
    const dlBlok = buatDaftarDownload(episodes, tipe);

    // ── Rakitan caption ──
    const baris = [
        headerUtama,
        `${SEP}`,
        `📅 _${headerWaktu}_`,
        `${SEP}`,
        `🎌 *${bersihkanInline(judul)}*`,
        judulAlt ? judulAlt.trimEnd() : null,
        ``,
        badgeTipe,
        badgeStatus || null,
        `📺 *${epHeader || 'Episode ?'}*`,
        ``,
        sinopsisBlok ? `📖 *Sinopsis*\n${sinopsisBlok}` : null,
        ``,
        `${SEP}`,
        infoAnime ? `📋 *Info Anime*\n${infoAnime}` : null,
        `${SEP}`,
        `▶️ *Tonton:* ${url}`,
        dlBlok ? dlBlok : null,
    ];

    return baris.filter(b => b !== null).join('\n');
}

// ── Monitor perubahan "Lagi Hangat Saat Ini" ─────────────────────────────────
//
// Dibandingkan dengan state tersimpan di state.json (key: lastHangat).
// Kembalikan array item yang BARU MASUK ke hot list.
// Kalau first run (belum ada lastHangat) → simpan dulu, return [].

function cariPerubahanHangat(lagiHangat) {
    if (!Array.isArray(lagiHangat) || !lagiHangat.length) return [];

    const data = bacaData();

    // Normalisasi: pakai URL sebagai key unik
    const idBaru  = lagiHangat.map(a => a.url || a.title || '').filter(Boolean);
    const idLama  = Array.isArray(data.lastHangat) ? data.lastHangat : null;

    // Simpan state terbaru
    data.lastHangat = idBaru;
    simpanData(data);

    // First run → simpan saja, jangan notif
    if (!idLama) return [];

    const setLama = new Set(idLama);
    const masukBaru = lagiHangat.filter(a => {
        const key = a.url || a.title || '';
        return key && !setLama.has(key);
    });

    return masukBaru;
}

// ── Format caption notif "Lagi Hangat" ───────────────────────────────────────

function buatCaptionHangat(newEntries, allHangat) {
    const sekarang   = new Date();
    const opsiHari   = { timeZone: 'Asia/Jakarta', weekday: 'long' };
    const opsiTgl    = { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'long', year: 'numeric' };
    const opsiJam    = { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false };
    const namaHari   = sekarang.toLocaleDateString('id-ID', opsiHari);
    const tglLengkap = sekarang.toLocaleDateString('id-ID', opsiTgl);
    const jamMenit   = sekarang.toLocaleTimeString('id-ID', opsiJam).replace('.', ':');
    const headerWaktu = `${namaHari}, ${tglLengkap} · ${jamMenit} WIB`;

    let txt = `🔥 *LAGI HANGAT!*\n`;
    txt += `${SEP}\n`;
    txt += `📅 _${headerWaktu}_\n`;
    txt += `${SEP}\n\n`;

    if (newEntries.length) {
        txt += `✨ *Baru Masuk Hot List:*\n`;
        newEntries.slice(0, 5).forEach((a, i) => {
            const scoreStr = a.score ? ` ⭐${a.score}` : '';
            txt += `${i + 1}. *${bersihkanInline(a.title)}*${scoreStr}\n`;
        });
        txt += `\n`;
    }

    txt += `${SEP}\n`;
    txt += `🔥 *Semua Lagi Hangat Saat Ini:*\n`;
    txt += `${SEP2}\n`;
    allHangat.slice(0, 10).forEach((a, i) => {
        const scoreStr = a.score ? ` ⭐${a.score}` : '';
        txt += `${i + 1}. *${bersihkanInline(a.title)}*${scoreStr}\n`;
    });
    txt += `${SEP}\n`;
    txt += `🌐 ${formatMono('alqanime.net')}`;

    return txt.trim();
}

function ambilUrlGambar(data) {
    return data?.thumbnail || null;
}

// ── IMAGE DOWNLOAD + PROXY ────────────────────────────────────────────────────

// Cache strategi per domain: 'direct' | 'proxy'
// Kalau domain sudah diketahui blokir direct fetch → langsung skip ke proxy
// Reset otomatis tiap 6 jam supaya tidak stuck selamanya
const _domainStrategy = {};   // { 'alqanime.net': { mode: 'proxy', since: timestamp } }
const STRATEGY_TTL_MS = 6 * 60 * 60 * 1000; // 6 jam

function _getStrategy(domain) {
    const entry = _domainStrategy[domain];
    if (!entry) return 'direct';
    if (Date.now() - entry.since > STRATEGY_TTL_MS) {
        delete _domainStrategy[domain]; // expired — coba direct lagi
        return 'direct';
    }
    return entry.mode;
}

function _setStrategy(domain, mode) {
    _domainStrategy[domain] = { mode, since: Date.now() };
}

// Buat proxy URL via wsrv.nl (image CDN proxy, bypass hotlink/IP block)
function buatProxyUrl(url) {
    if (!url) return null;
    return `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=jpg&q=90`;
}

// Download gambar ke buffer.
// Kalau direct sudah diketahui gagal → skip langsung, return null → caller pakai buatProxyUrl()
async function downloadImageBuffer(url) {
    if (!url) return null;

    let domain;
    try { domain = new URL(url).hostname; } catch (_) { return null; }

    if (_getStrategy(domain) === 'proxy') {
        return null; // sudah diketahui gagal — langsung skip
    }

    // Coba direct dengan Referer domain sendiri
    try {
        const r = await axios.get(url, {
            headers: {
                ...HEADERS,
                Accept  : 'image/webp,image/apng,image/*,*/*;q=0.8',
                Referer : `https://${domain}/`,
                Origin  : `https://${domain}`,
            },
            responseType: 'arraybuffer',
            timeout     : 12000,
        });
        if (r.data && r.data.byteLength > 1000) {
            _setStrategy(domain, 'direct'); // konfirmasi direct berhasil
            return Buffer.from(r.data);
        }
    } catch (_) {
        _setStrategy(domain, 'proxy'); // catat: domain ini blokir direct
    }

    return null;
}

// ── EXPORT ────────────────────────────────────────────────────────────────────

export { getEnabledGroups, setGroupEnabled, cariEpisodeBaru, cariPerubahanHangat, buatCaption, buatCaptionLanjutan, buatCaptionGabung, buatLabelRilisan, buatCaptionHangat, ambilUrlGambar, tandaiSudahKirim, tandaiDanLog, getRecentLog, simulasi, downloadImageBuffer, buatProxyUrl, parseJudulEp, judulTerpotong, ambilDetailLengkap };
export { handleAlqanimeNotif, handleAlqNotifReply, handleAlqanimeNotifCallbacks };
// ── COMMAND HANDLER ───────────────────────────────────────────────────────────

async function handleAlqanimeNotif({ hisoka, m, query, tolak, logCommand, sendConfirmWithButtons, fs, path, loadConfig, pendingAlqNotifChoices, Button }) {
        if (!m.isOwner) { await tolak(hisoka, m, '❌ Hanya owner yang bisa gunakan perintah ini.'); return; }

        const cfgPathALQ = path.join(process.cwd(), 'config.json');
        const sub = (query || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const pfx = m.prefix || '.';

        const cfgALQ = loadConfig();
        if (!cfgALQ.alqanimenotif)        cfgALQ.alqanimenotif        = { groups: {} };
        if (!cfgALQ.alqanimenotif.groups) cfgALQ.alqanimenotif.groups = {};

        // ── Help / Menu ──────────────────────────────────────────────────────────
        if (!sub || sub === 'help') {
                if (m.isGroup) {
                        // Di grup → tampilkan button menu kontekstual (seperti nekopoinotif)
                        const gcEntry  = cfgALQ.alqanimenotif.groups[m.from];
                        const isReg    = gcEntry !== undefined;
                        const isActive = gcEntry?.enabled === true;

                        if (isActive) {
                                const _bodyAktif =
                                        `╭─「 🔴 *ALQANIME NOTIF* 」\n│\n` +
                                        `│ Status grup ini : ✅ *AKTIF*\n│\n` +
                                        `│ Fitur ini sudah aktif di grup ini.\n` +
                                        `│ Notif anime dari alqanime.net akan\n` +
                                        `│ otomatis masuk ke sini.\n│\n` +
                                        `│ Ketik *${pfx}alqanimenotif off* untuk matikan.\n│\n` +
                                        `╰──────────────────────`;
                                try {
                                        await new Button()
                                                .setBody(_bodyAktif)
                                                .setFooter('🔴 Alqanime Notif')
                                                .addReply('❌ Nonaktifkan di GC ini', '__alqnotif_off__')
                                                .addReply('📋 Lihat GC Aktif',       '__alqnotif_list__')
                                                .run(m.from, hisoka, m);
                                } catch (_) { await tolak(hisoka, m, _bodyAktif); }
                        } else if (isReg) {
                                const _bodyReg =
                                        `╭─「 🔴 *ALQANIME NOTIF* 」\n│\n` +
                                        `│ Status grup ini : ❌ *BELUM AKTIF*\n│\n` +
                                        `│ ⚠️ ID grup ini sudah ada di daftar,\n` +
                                        `│    tapi fitur belum diaktifkan.\n│\n` +
                                        `│ Aktifkan notif alqanime di GC ini?\n│\n` +
                                        `╰──────────────────────`;
                                try {
                                        await new Button()
                                                .setBody(_bodyReg)
                                                .setFooter('🔴 Alqanime Notif')
                                                .addReply('✅ Ya, Aktifkan',    '__alqnotif_on__')
                                                .addReply('❌ Tidak, Batal',    '__alqnotif_cancel__')
                                                .addReply('📋 Lihat GC Aktif', '__alqnotif_list__')
                                                .run(m.from, hisoka, m);
                                } catch (_) { await tolak(hisoka, m, _bodyReg + `\n\n✅ Ketik *${pfx}alqanimenotif on* untuk aktifkan.`); }
                        } else {
                                const _bodyBaru =
                                        `╭─「 🔴 *ALQANIME NOTIF* 」\n│\n` +
                                        `│ Status grup ini : ➕ *BELUM TERDAFTAR*\n│\n` +
                                        `│ Fitur ini belum aktif di grup ini.\n│\n` +
                                        `│ Aktifkan notif alqanime di GC ini?\n│\n` +
                                        `╰──────────────────────`;
                                try {
                                        await new Button()
                                                .setBody(_bodyBaru)
                                                .setFooter('🔴 Alqanime Notif')
                                                .addReply('✅ Ya, Aktifkan',    '__alqnotif_on__')
                                                .addReply('❌ Tidak, Batal',    '__alqnotif_cancel__')
                                                .addReply('📋 Lihat GC Aktif', '__alqnotif_list__')
                                                .run(m.from, hisoka, m);
                                } catch (_) { await tolak(hisoka, m, _bodyBaru + `\n\n✅ Ketik *${pfx}alqanimenotif on* untuk aktifkan.`); }
                        }
                        logCommand(m, hisoka, 'alqanimenotif-menu');
                        return;
                }

                // Private chat → tampilkan help teks biasa
                await tolak(hisoka, m,
                        `╭─「 🔴 *ALQANIME NOTIF* 」\n` +
                        `│\n` +
                        `│ *Perintah (jalankan di GC):*\n` +
                        `│ • ${pfx}alqanimenotif — menu aktifkan/nonaktifkan\n` +
                        `│ • ${pfx}alqanimenotif on — aktifkan GC ini\n` +
                        `│ • ${pfx}alqanimenotif off — nonaktifkan GC ini\n` +
                        `│ • ${pfx}alqanimenotif status — list semua GC\n` +
                        `│   ↳ Reply status: *add 1,2* — aktifkan\n` +
                        `│   ↳ Reply status: *del 1,2* — nonaktifkan\n` +
                        `│ • ${pfx}alqanimenotif test — test ke sini\n` +
                        `│ • ${pfx}alqanimenotif test grup — test ke semua GC aktif\n` +
                        `│\n` +
                        `│ 💡 Bot kirim notif otomatis saat:\n` +
                        `│    📦 Batch baru · 🔴 Episode baru\n` +
                        `│    🔥 Hot list berubah\n` +
                        `│ ⏱️ Realtime · cek tiap 1 menit\n` +
                        `╰──────────────────────`
                );
                return;
        }

        // ── ON (grup saat ini) ────────────────────────────────────────────────────
        if (sub === 'on') {
                if (!m.isGroup) { await tolak(hisoka, m, '❌ Perintah ini hanya untuk grup.'); return; }
                const sebelumnya = cfgALQ.alqanimenotif.groups[m.from]?.enabled === true;
                cfgALQ.alqanimenotif.groups[m.from] = { enabled: true, diubahPada: Date.now() };
                fs.writeFileSync(cfgPathALQ, JSON.stringify(cfgALQ, null, 2));
                await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                const _bodyOn =
                        `╭─「 🔴 *ALQANIME NOTIF* 」\n│\n` +
                        `│ Status sebelumnya : ${sebelumnya ? '✅ ON' : '❌ OFF'}\n` +
                        `│ Status sekarang   : ✅ *ON*\n│\n` +
                        (sebelumnya
                                ? `│ ℹ️ Sudah aktif sebelumnya.\n`
                                : `│ ✅ Berhasil diaktifkan!\n│    Notif otomatis akan masuk ke GC ini.\n`) +
                        `│\n╰──────────────────────`;
                try {
                        const _btnOn = new Button()
                                .setBody(_bodyOn)
                                .setFooter('🔴 Alqanime Notif')
                                .addReply('❌ Nonaktifkan GC Ini',  '__alqnotif_off__')
                                .addReply('📋 Lihat GC Aktif',      '__alqnotif_list__');
                        await _alqRunBtn(hisoka, m, _btnOn, _bodyOn, tolak);
                } catch (_) { await tolak(hisoka, m, _bodyOn); }
                logCommand(m, hisoka, 'alqanimenotif-on');
                return;
        }

        // ── OFF (grup saat ini) ───────────────────────────────────────────────────
        if (sub === 'off') {
                if (!m.isGroup) { await tolak(hisoka, m, '❌ Perintah ini hanya untuk grup.'); return; }
                const sebelumnya = cfgALQ.alqanimenotif.groups[m.from]?.enabled === true;
                cfgALQ.alqanimenotif.groups[m.from] = { enabled: false, diubahPada: Date.now() };
                fs.writeFileSync(cfgPathALQ, JSON.stringify(cfgALQ, null, 2));
                await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                const _bodyOff =
                        `╭─「 🔴 *ALQANIME NOTIF* 」\n│\n` +
                        `│ Status sebelumnya : ${sebelumnya ? '✅ ON' : '❌ OFF'}\n` +
                        `│ Status sekarang   : ❌ *OFF*\n│\n` +
                        (sebelumnya
                                ? `│ ❌ Berhasil dinonaktifkan.\n`
                                : `│ ℹ️ Sudah nonaktif sebelumnya.\n`) +
                        `│\n╰──────────────────────`;
                try {
                        const _btnOff = new Button()
                                .setBody(_bodyOff)
                                .setFooter('🔴 Alqanime Notif')
                                .addReply('✅ Aktifkan GC Ini', '__alqnotif_on__')
                                .addReply('📋 Lihat GC Aktif', '__alqnotif_list__');
                        await _alqRunBtn(hisoka, m, _btnOff, _bodyOff, tolak);
                } catch (_) { await tolak(hisoka, m, _bodyOff); }
                logCommand(m, hisoka, 'alqanimenotif-off');
                return;
        }

        // ── STATUS — list semua GC bot dengan nomor urut ──────────────────────────
        if (sub === 'status') {
                await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
                try {
                        // Ambil semua GC yang bot ikuti
                        const allGroupsRaw = await hisoka.groupFetchAllParticipating();
                        const allGroups    = Object.values(allGroupsRaw || {})
                                .sort((a, b) => (a.subject || '').localeCompare(b.subject || 'id'));

                        const cfgSt = loadConfig();
                        const registered = cfgSt?.alqanimenotif?.groups || {};

                        const totalAktif = Object.values(registered).filter(v => v?.enabled === true).length;
                        const totalNon   = Object.values(registered).filter(v => v?.enabled === false).length;

                        let txt = `╭─「 📋 *STATUS ALQANIME NOTIF* 」\n│\n`;
                        txt += `│ Total GC bot   : *${allGroups.length} grup*\n`;
                        txt += `│ Terdaftar aktif: *${totalAktif} grup*\n`;
                        if (totalNon) txt += `│ Nonaktif       : *${totalNon} grup*\n`;
                        txt += `│\n`;
                        txt += `│ Ket: ✅ Aktif  ❌ Nonaktif  ➕ Belum daftar\n`;
                        txt += `│━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

                        // Urutkan: ✅ Aktif → ❌ Nonaktif → ➕ Belum daftar
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

                        // Sisipkan pemisah antar kelompok
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

                        txt += `│\n`;
                        txt += `│ 📌 *Reply pesan ini:*\n`;
                        txt += `│ • *add 1,2,3* — aktifkan GC nomor tsb\n`;
                        txt += `│ • *del 2,4* — nonaktifkan GC nomor tsb\n`;
                        txt += `│ ⏳ Menu berlaku *5 menit*\n`;
                        txt += `╰──────────────────────`;

                        const statusMsg = await hisoka.sendMessage(m.from, { text: txt }, { quoted: m });
                        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });

                        // Simpan pending untuk reply handler
                        if (pendingAlqNotifChoices) {
                                const choiceKey = `${m.from}::${m.sender || m.key?.participant || ''}`;
                                const old = pendingAlqNotifChoices.get(choiceKey);
                                if (old?.timeout) clearTimeout(old.timeout);
                                const t = setTimeout(() => pendingAlqNotifChoices.delete(choiceKey), 5 * 60 * 1000);
                                pendingAlqNotifChoices.set(choiceKey, {
                                        gcList,
                                        botMsgId : statusMsg?.key?.id || '',
                                        expiresAt: Date.now() + 5 * 60 * 1000,
                                        timeout  : t,
                                });
                        }

                        logCommand(m, hisoka, 'alqanimenotif-status');
                } catch (err) {
                        console.error('[AlqanimeNotif] status error:', err?.message);
                        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                        await tolak(hisoka, m, `❌ Gagal ambil list grup: ${err?.message || err}`);
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
                                await tolak(hisoka, m, `❌ Belum ada GC aktif.\nKetik *${pfx}alqanimenotif on* di GC tujuan dulu, atau\ngunakan *${pfx}alqanimenotif status* → reply *add 1,2*.`);
                                return;
                        }
                        const hasil = await simulasi();
                        const imgBufTest   = hasil.urlGambar ? await downloadImageBuffer(hasil.urlGambar) : null;
                        const proxyUrlTest = hasil.urlGambar ? buatProxyUrl(hasil.urlGambar) : null;
                        let berhasil = 0, gagal = 0;
                        for (const jid of daftarGrup) {
                                try {
                                        if (imgBufTest) {
                                                await hisoka.sendMessage(jid, { image: imgBufTest, mimetype: 'image/jpeg', caption: hasil.caption });
                                        } else if (proxyUrlTest) {
                                                await hisoka.sendMessage(jid, { image: { url: proxyUrlTest }, caption: hasil.caption });
                                        } else {
                                                await hisoka.sendMessage(jid, { text: hasil.caption });
                                        }
                                        berhasil++;
                                        await new Promise(r => setTimeout(r, 1500));
                                } catch (e) {
                                        gagal++;
                                        console.error(`[AlqanimeNotif] Gagal kirim test ke ${jid}:`, e?.message);
                                }
                        }
                        await hisoka.sendMessage(m.from, {
                                text: `✅ *Test Alqanime Notif selesai!*\n\n` +
                                      `📤 Terkirim ke: *${berhasil}/${daftarGrup.length} grup*` +
                                      (gagal ? `\n❌ Gagal: ${gagal} grup` : ''),
                        }, { quoted: m });
                        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                        logCommand(m, hisoka, 'alqanimenotif-test-grup');
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
                        const hasil = await simulasi();
                        if (hasil.urlGambar) {
                                const imgBuf = await downloadImageBuffer(hasil.urlGambar);
                                const imgUrl = imgBuf ? null : buatProxyUrl(hasil.urlGambar);
                                if (imgBuf) {
                                        await hisoka.sendMessage(m.from, { image: imgBuf, mimetype: 'image/jpeg', caption: hasil.caption }, { quoted: m });
                                } else {
                                        await hisoka.sendMessage(m.from, { image: { url: imgUrl }, caption: hasil.caption }, { quoted: m });
                                }
                        } else {
                                await tolak(hisoka, m, hasil.caption);
                        }
                        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                        logCommand(m, hisoka, 'alqanimenotif-test');
                } catch (err) {
                        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                        await tolak(hisoka, m, `❌ Gagal: ${err?.message || err}`);
                }
                return;
        }

        await tolak(hisoka, m, `❌ Sub-perintah tidak dikenal.\nKetik *${pfx}alqanimenotif* untuk bantuan.`);
}

// ── BUTTON HELPERS ────────────────────────────────────────────────────────────
// Track key pesan button terakhir bot per grup (untuk auto-delete saat tap berikutnya)
const _alqPrevBtnKey = new Map();

// Hapus pesan button bot sebelumnya + pesan tap user → tidak spam di chat
async function _alqAutoClean(hisoka, m) {
        const prev = _alqPrevBtnKey.get(m.from);
        if (prev) {
                try { await hisoka.sendMessage(m.from, { delete: prev }); } catch (_) {}
                _alqPrevBtnKey.delete(m.from);
        }
        if (m.key) {
                try { await hisoka.sendMessage(m.from, { delete: m.key }); } catch (_) {}
        }
}

// Kirim button, simpan key-nya untuk auto-delete berikutnya
async function _alqRunBtn(hisoka, m, btn, fallbackBody, tolakFn) {
        try {
                const sent = await btn.run(m.from, hisoka, m);
                if (sent?.key) _alqPrevBtnKey.set(m.from, sent.key);
        } catch (_) {
                await tolakFn(hisoka, m, fallbackBody);
        }
}

// ── BUTTON CALLBACK HANDLER ───────────────────────────────────────────────────
// Tangani tap button quick_reply dari menu .alqanimenotif di grup:
//   __alqnotif_on__           → aktifkan GC ini
//   __alqnotif_off__          → nonaktifkan GC ini
//   __alqnotif_cancel__       → batalkan
//   __alqnotif_list__         → tampilkan list semua GC aktif
//   __addallgrp__alqanimenotif → aktifkan semua GC
//   __delallgrp__alqanimenotif → nonaktifkan semua GC
async function handleAlqanimeNotifCallbacks({ hisoka, m, tolak, logCommand, Button, loadConfig, fs: fsMod, path: pathMod }) {
        if (!m.isOwner) return false;
        const txt = typeof m.text === 'string' ? m.text.trim() : '';
        const _VALID_CBS = [
                '__alqnotif_on__', '__alqnotif_off__', '__alqnotif_cancel__', '__alqnotif_list__',
                '__addallgrp__alqanimenotif', '__delallgrp__alqanimenotif',
        ];
        if (!_VALID_CBS.includes(txt)) return false;

        // Auto-delete pesan button bot sebelumnya + pesan tap user → tidak spam
        await _alqAutoClean(hisoka, m);

        const pfx     = m.prefix || '.';
        const cfgPath = pathMod.join(process.cwd(), 'config.json');

        // ── BATALKAN ─────────────────────────────────────────────────────────────
        if (txt === '__alqnotif_cancel__') {
                await hisoka.sendMessage(m.from, { react: { text: '👋', key: m.key } });
                await tolak(hisoka, m, `ℹ️ Dibatalkan. Fitur alqanime notif tidak diaktifkan di grup ini.`);
                return true;
        }

        // ── LIST GC AKTIF ─────────────────────────────────────────────────────────
        if (txt === '__alqnotif_list__') {
                await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
                try {
                        const cfg    = loadConfig();
                        const groups = cfg?.alqanimenotif?.groups || {};
                        const totalReg = Object.keys(groups).length;

                        const aktifJids = Object.entries(groups)
                                .filter(([, v]) => v?.enabled === true).map(([jid]) => jid);
                        const nonJids   = Object.entries(groups)
                                .filter(([, v]) => v?.enabled === false).map(([jid]) => jid);

                        // ── Kosong: belum ada GC terdaftar ───────────────────────────────
                        if (!totalReg) {
                                await hisoka.sendMessage(m.from, { react: { text: '📋', key: m.key } });
                                const _bodyKosong =
                                        `🔴 *Alqanime Notif — Daftar GC*\n` +
                                        `━━━━━━━━━━━━━━━━━━\n\n` +
                                        `> _Belum ada GC yang terdaftar._\n\n` +
                                        `• Masuk ke GC tujuan\n` +
                                        `• Ketik *${pfx}alqanimenotif* lalu pilih\n` +
                                        `  tombol *✅ Ya, Aktifkan*`;
                                const _btnKosong = new Button().setBody(_bodyKosong).setFooter('🔴 Alqanime Notif')
                                        .addReply('🔄 Refresh', '__alqnotif_list__');
                                await _alqRunBtn(hisoka, m, _btnKosong, _bodyKosong, tolak);
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
                        let out = `🔴 *Alqanime Notif — Daftar GC*\n`;
                        out += `━━━━━━━━━━━━━━━━━━\n\n`;
                        out += `• *Total terdaftar :* ${totalReg} GC\n`;
                        out += `• *Aktif           :* *${aktifJids.length} GC*\n`;
                        if (nonJids.length) out += `• *Nonaktif        :* ~${nonJids.length} GC~\n`;
                        out += `\n`;

                        if (aktifJids.length) {
                                out += `✅ *GC Aktif* _(notif berjalan)_\n`;
                                out += `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n`;
                                aktifJids.forEach((jid, i) => { out += `${i + 1}. *${getNama(jid)}*\n`; });
                                out += `\n`;
                        }
                        if (nonJids.length) {
                                out += `❌ *GC Nonaktif* _(notif dimatikan)_\n`;
                                out += `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n`;
                                nonJids.forEach((jid, i) => { out += `${i + 1}. ~${getNama(jid)}~\n`; });
                                out += `\n`;
                        }
                        out += `> _Diperbarui otomatis setiap tap Refresh._`;

                        // ── Button kontekstual ────────────────────────────────────────────
                        const gcEntry    = groups[m.from];
                        const gcAktif    = gcEntry?.enabled === true;
                        const gcNonAktif = gcEntry?.enabled === false;
                        const gcBelum    = !gcEntry;

                        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });

                        const _btnList = new Button().setBody(out).setFooter('🔴 Alqanime Notif');
                        if (gcAktif)                   _btnList.addReply('❌ Nonaktifkan GC Ini',  '__alqnotif_off__');
                        if (gcNonAktif || gcBelum)     _btnList.addReply('✅ Aktifkan GC Ini',     '__alqnotif_on__');
                        const _adaYgNonaktif = nonJids.length > 0 || gcBelum || gcNonAktif;
                        const _semuaAktif    = aktifJids.length > 0 && !_adaYgNonaktif;
                        if (_adaYgNonaktif)  _btnList.addReply('➕ Aktifkan Semua GC', '__addallgrp__alqanimenotif');
                        else if (_semuaAktif) _btnList.addReply('❌ Matikan Semua GC', '__delallgrp__alqanimenotif');
                        _btnList.addReply('🔄 Refresh', '__alqnotif_list__');

                        await _alqRunBtn(hisoka, m, _btnList, out, tolak);
                        logCommand(m, hisoka, 'alqanimenotif-list-btn');
                } catch (e) {
                        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                        await tolak(hisoka, m, `❌ Gagal ambil list GC: ${e.message}`);
                }
                return true;
        }

        // ── AKTIFKAN SEMUA GRUP ───────────────────────────────────────────────────
        if (txt === '__addallgrp__alqanimenotif') {
                await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
                try {
                        const allGroupsRaw = await hisoka.groupFetchAllParticipating();
                        const allJids      = Object.keys(allGroupsRaw || {});
                        if (!allJids.length) {
                                await tolak(hisoka, m, '❌ Bot tidak ada di grup manapun.');
                                return true;
                        }
                        const cfg = loadConfig();
                        if (!cfg.alqanimenotif)        cfg.alqanimenotif        = { groups: {} };
                        if (!cfg.alqanimenotif.groups) cfg.alqanimenotif.groups = {};
                        for (const jid of allJids)
                                cfg.alqanimenotif.groups[jid] = { enabled: true, diubahPada: Date.now() };
                        fsMod.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
                        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                        const _body =
                                `╭─「 🔴 *ALQANIME NOTIF* 」\n│\n` +
                                `│ ✅ *${allJids.length} grup berhasil diaktifkan!*\n│\n` +
                                `│ Notif anime alqanime.net akan masuk\n` +
                                `│ ke semua GC yang ada bot.\n│\n` +
                                `╰──────────────────────`;
                        const _btnAdd = new Button().setBody(_body).setFooter('🔴 Alqanime Notif')
                                .addReply('❌ Matikan Semua GC', '__delallgrp__alqanimenotif')
                                .addReply('📋 Lihat GC Aktif',   '__alqnotif_list__');
                        await _alqRunBtn(hisoka, m, _btnAdd, _body, tolak);
                        logCommand(m, hisoka, 'alqanimenotif-addallgrp');
                } catch (e) {
                        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                        await tolak(hisoka, m, `❌ Gagal: ${e.message}`);
                }
                return true;
        }

        // ── NONAKTIFKAN SEMUA GRUP ────────────────────────────────────────────────
        if (txt === '__delallgrp__alqanimenotif') {
                await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
                try {
                        const allGroupsRaw = await hisoka.groupFetchAllParticipating();
                        const allJids      = Object.keys(allGroupsRaw || {});
                        const cfg = loadConfig();
                        if (!cfg.alqanimenotif)        cfg.alqanimenotif        = { groups: {} };
                        if (!cfg.alqanimenotif.groups) cfg.alqanimenotif.groups = {};
                        for (const jid of allJids)
                                cfg.alqanimenotif.groups[jid] = { enabled: false, diubahPada: Date.now() };
                        fsMod.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
                        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                        const _body =
                                `╭─「 🔴 *ALQANIME NOTIF* 」\n│\n` +
                                `│ ❌ *${allJids.length} grup dinonaktifkan.*\n│\n` +
                                `│ Notif tidak akan masuk ke GC manapun.\n│\n` +
                                `│ Ketik *${pfx}alqanimenotif on* di GC yang\n` +
                                `│ ingin diaktifkan kembali.\n│\n` +
                                `╰──────────────────────`;
                        const _btnDel = new Button().setBody(_body).setFooter('🔴 Alqanime Notif')
                                .addReply('➕ Aktifkan Semua GC', '__addallgrp__alqanimenotif')
                                .addReply('📋 Lihat GC Aktif',    '__alqnotif_list__');
                        await _alqRunBtn(hisoka, m, _btnDel, _body, tolak);
                        logCommand(m, hisoka, 'alqanimenotif-delallgrp');
                } catch (e) {
                        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                        await tolak(hisoka, m, `❌ Gagal: ${e.message}`);
                }
                return true;
        }

        // ── AKTIFKAN / NONAKTIFKAN GC INI ─────────────────────────────────────────
        if (!m.isGroup) {
                await tolak(hisoka, m, '❌ Hanya bisa digunakan di dalam grup.');
                return true;
        }
        const enabled = txt === '__alqnotif_on__';
        try {
                const cfg = loadConfig();
                if (!cfg.alqanimenotif)        cfg.alqanimenotif        = { groups: {} };
                if (!cfg.alqanimenotif.groups) cfg.alqanimenotif.groups = {};
                cfg.alqanimenotif.groups[m.from] = { enabled, diubahPada: Date.now() };
                fsMod.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
                await hisoka.sendMessage(m.from, { react: { text: enabled ? '✅' : '❌', key: m.key } });

                if (enabled) {
                        const _body =
                                `╭─「 🔴 *ALQANIME NOTIF* 」\n│\n` +
                                `│ Status : ✅ *BERHASIL DIAKTIFKAN!*\n│\n` +
                                `│ Notif anime dari alqanime.net akan\n` +
                                `│ otomatis masuk ke grup ini. 🔴\n│\n` +
                                `╰──────────────────────`;
                        const _btnOn = new Button().setBody(_body).setFooter('🔴 Alqanime Notif')
                                .addReply('❌ Nonaktifkan GC Ini', '__alqnotif_off__')
                                .addReply('📋 Lihat GC Aktif',     '__alqnotif_list__');
                        await _alqRunBtn(hisoka, m, _btnOn, _body, tolak);
                } else {
                        const _body =
                                `╭─「 🔴 *ALQANIME NOTIF* 」\n│\n` +
                                `│ Status : ❌ *DINONAKTIFKAN*\n│\n` +
                                `│ Notif alqanime tidak akan masuk ke\n` +
                                `│ grup ini lagi.\n│\n` +
                                `╰──────────────────────`;
                        const _btnOff = new Button().setBody(_body).setFooter('🔴 Alqanime Notif')
                                .addReply('✅ Aktifkan GC Ini', '__alqnotif_on__')
                                .addReply('📋 Lihat GC Aktif', '__alqnotif_list__');
                        await _alqRunBtn(hisoka, m, _btnOff, _body, tolak);
                }
                logCommand(m, hisoka, enabled ? 'alqanimenotif-on-btn' : 'alqanimenotif-off-btn');
        } catch (e) {
                await tolak(hisoka, m, `❌ Gagal: ${e.message}`);
        }
        return true;
}

// ── REPLY HANDLER — proses reply ke pesan status (add/del) ───────────────────

async function handleAlqNotifReply({ hisoka, m, pendingAlqNotifChoices, getQuotedStanzaId, tolak, logCommand, loadConfig, fs, path }) {
        if (!pendingAlqNotifChoices || !pendingAlqNotifChoices.size) return false;
        if (!m.isOwner) return false;

        const quotedId   = getQuotedStanzaId(m);
        if (!quotedId) return false;

        const choiceKey  = `${m.from}::${m.sender || m.key?.participant || ''}`;
        const pending    = pendingAlqNotifChoices.get(choiceKey);
        if (!pending || pending.botMsgId !== quotedId) return false;
        if (Date.now() > pending.expiresAt) {
                pendingAlqNotifChoices.delete(choiceKey);
                return false;
        }

        const teks = (m.body || m.text || '').trim().toLowerCase();
        // Format: "add 1,2,3" atau "del 2,4"
        const match = teks.match(/^(add|del)\s+([\d,\s]+)$/i);
        if (!match) return false;

        const aksi    = match[1].toLowerCase(); // 'add' | 'del'
        const nomorStr = match[2];
        const nomor   = [...new Set(
                nomorStr.split(/[,\s]+/).map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n >= 1)
        )];

        if (!nomor.length) return false;

        const { gcList } = pending;
        const dipilih    = nomor.map(n => gcList[n - 1]).filter(Boolean);
        if (!dipilih.length) {
                await tolak(hisoka, m, `❌ Nomor tidak valid. Pilih antara 1–${gcList.length}.`);
                return true;
        }

        const cfgPath = path.join(process.cwd(), 'config.json');
        const cfg     = loadConfig();
        if (!cfg.alqanimenotif)        cfg.alqanimenotif        = { groups: {} };
        if (!cfg.alqanimenotif.groups) cfg.alqanimenotif.groups = {};

        const namaList = [];
        for (const { jid, nama } of dipilih) {
                cfg.alqanimenotif.groups[jid] = { enabled: aksi === 'add', diubahPada: Date.now() };
                namaList.push(nama);
        }
        fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

        const ikon   = aksi === 'add' ? '✅' : '❌';
        const action = aksi === 'add' ? 'Diaktifkan' : 'Dinonaktifkan';

        let txt = `${ikon} *${action} (${dipilih.length} GC):*\n`;
        namaList.forEach((n, i) => { txt += `${i + 1}. ${n}\n`; });
        txt += `\n💡 Ketik *alqanimenotif status* untuk cek ulang.`;

        await hisoka.sendMessage(m.from, { react: { text: ikon, key: m.key } });
        await tolak(hisoka, m, txt);
        logCommand(m, hisoka, `alqanimenotif-${aksi}`);

        // Hapus pending setelah diproses
        clearTimeout(pending.timeout);
        pendingAlqNotifChoices.delete(choiceKey);

        return true;
}


/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const plugins = [
    { command: /^(alqanime|alq)$/i, tags: ['anime'], help: ['alqanime'], handler: 'runHandleAlqanimeNotif' },
    { command: /^(alqanimenotif)$/i, tags: ['anime'], help: ['alqanimenotif'], handler: 'handleAlqanimeNotif' },
];
async function runHandleAlqanimeNotif(ctx) {
    const { Button, fs, getJadibotChoiceKey, getQuotedStanzaId, hisoka, loadConfig, logCommand, logError, m, path, pendingAlqDlChoices, pendingAlqNotifChoices, query, sendConfirmWithButtons, tolak } = ctx;
    const _alqSub = (query || '').trim().toLowerCase();
                                    if (['on', 'off', 'status', 'test', 'help', 'test grup', 'add', 'del'].includes(_alqSub) || /^(add|del)\s/.test(_alqSub)) {
                                            await handleAlqanimeNotif({ hisoka, m, query, tolak, logCommand, sendConfirmWithButtons, fs, path, loadConfig, pendingAlqNotifChoices, getQuotedStanzaId, Button });
                                    } else {
                                            await handleAlq({ hisoka, m, query, tolak, logCommand, logError, path, pendingAlqDlChoices, getJadibotChoiceKey });
                                    }
}
export { runHandleAlqanimeNotif };
