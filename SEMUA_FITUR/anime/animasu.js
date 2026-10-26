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
 *  animasu.js — Scraper Animasu
 *  Cari anime subtitle Indonesia dari animasu.love
 * ───────────────────────────────
 */
/**
 * ═══════════════════════════════════════════════════════════════
 *  Animasu Scraper & Monitor
 *  Cari anime Sub Indo dari animasu.love, pantau update episode
 *  terbaru secara berkala, dan kirim notifikasi otomatis ke
 *  grup WhatsApp yang sudah terdaftar.
 * ═══════════════════════════════════════════════════════════════
 */
'use strict';

/**
 * ─────────────────────────────────────────────────────
 *  FITUR   : Animasu Sub Indo Realtime
 *  Fungsi  : Pantau episode Sub Indo terbaru dari
 *            animasu.love via WP REST API.
 *            Kirim notifikasi ke grup WA saat ada
 *            episode baru yang sudah di-sub Indo.
 *  Sumber  : animasu.love WP REST API + HTML scraping
 * ─────────────────────────────────────────────────────
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';

const FILE_DATA   = path.join(process.cwd(), 'data', 'animasu', 'state.json');
const FILE_LOG    = path.join(process.cwd(), 'data', 'animasu', 'log.json');
fs.mkdirSync(path.join(process.cwd(), 'data', 'animasu'), { recursive: true });
const FILE_CONFIG = path.join(process.cwd(), 'config.json');
const BASE_URL    = 'https://animasu.love';
const API_POSTS   = `${BASE_URL}/wp-json/wp/v2/posts`;
const HEADERS     = { 'User-Agent': 'Mozilla/5.0 (compatible; WilyBot/1.0)' };

// Buffer waktu (ms) yang ditambahkan ke lastCheckTime saat menghitung batas usia post
// Mencegah post yang terbit tepat di batas window terlewat akibat latensi jaringan
const BUFFER_MS = 3 * 60 * 1000; // 3 menit
// Berapa lama (ms) post gagal-fetch akan dicoba ulang sebelum diabaikan permanen
const RETRY_TTL_MS = 30 * 60 * 1000; // 30 menit
// Jangkauan awal (ms) saat belum ada lastCheckTime (misal: bot baru start)
const INIT_WINDOW_MS = 30 * 60 * 1000; // 30 menit

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

// ── BACA / SIMPAN LOG PENGIRIMAN ─────────────────────────────────────────────

function bacaLog() {
    try {
        if (fs.existsSync(FILE_LOG)) return JSON.parse(fs.readFileSync(FILE_LOG, 'utf-8'));
    } catch (_) {}
    return { terkirim: [] };
}

function simpanLog(log) {
    try { fs.writeFileSync(FILE_LOG, JSON.stringify(log, null, 2), 'utf-8'); } catch (_) {}
}

// ── BACA / SIMPAN CONFIG ──────────────────────────────────────────────────────

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
    const groups = cfg?.animasu?.groups || {};
    return Object.entries(groups)
        .filter(([, v]) => v?.enabled === true)
        .map(([jid]) => jid);
}

function setGroupEnabled(jid, enabled) {
    const cfg = bacaConfig();
    if (!cfg.animasu)        cfg.animasu        = { groups: {} };
    if (!cfg.animasu.groups) cfg.animasu.groups = {};
    cfg.animasu.groups[jid] = { enabled, diubahPada: Date.now() };
    simpanConfig(cfg);
}

// ── HTML HELPER ───────────────────────────────────────────────────────────────

function stripHtml(str) {
    return (str || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#8217;/g, "\u2019")
        .replace(/&#8216;/g, "\u2018")
        .replace(/&#8220;/g, '\u201C')
        .replace(/&#8221;/g, '\u201D')
        .replace(/&#x1F525;/gi, '🔥')
        .replace(/&#x2714;/gi, '✔️')
        .replace(/&#x2713;/gi, '✓')
        .replace(/&#x([0-9a-f]+);/gi, (s, hex) => {
            try { return String.fromCodePoint(parseInt(hex, 16)); } catch (_) { return ''; }
        })
        .replace(/&#[0-9]+;/g, s => {
            try { return String.fromCodePoint(parseInt(s.slice(2, -1))); } catch (_) { return ''; }
        })
        .replace(/\s+/g, ' ')
        .trim();
}

// ── PARSE HALAMAN DETAIL ANIME ─────────────────────────────────────────────────

function parseDetailPage(html, animeUrl) {
    const judulMatch = html.match(/<h1[^>]*itemprop="headline"[^>]*>([\s\S]*?)<\/h1>/i);
    const judul = judulMatch
        ? stripHtml(judulMatch[1]).replace(/\s*Sub\s*Indo\s*$/i, '').trim()
        : '';

    const alterMatch = html.match(/<span class="alter">([\s\S]*?)<\/span>/i);
    const judulAlt = alterMatch ? stripHtml(alterMatch[1]) : '';

    const coverMatch = html.match(/<div class="thumb"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i);
    // JANGAN rewrite Photon (i*.wp.com) ke animasu.love (bug yang sama dengan
    // cover kartu): host animasu.love diblokir Cloudflare sehingga Baileys gagal
    // fetch gambar. Pakai URL cover asli apa adanya.
    const cover = coverMatch ? coverMatch[1].split('?')[0] : '';

    const speMatch = html.match(/<div class="spe">([\s\S]*?)<\/div>/i);
    const speHtml  = speMatch ? speMatch[1] : '';

    function ambilField(label) {
        const re = new RegExp(`<b>${label}:<\\/b>\\s*([\\s\\S]*?)(?=<\\/span>|<span\\b)`, 'i');
        const m  = speHtml.match(re);
        return m ? stripHtml(m[1]) : '';
    }

    const genre  = ambilField('Genre').replace(/\s*,\s*/g, ', ');
    const status = ambilField('Status').replace(/🔥|✔️|⏳/g, '').trim();
    const rilis  = ambilField('Rilis');
    const jenis  = ambilField('Jenis');
    const durasi = ambilField('Durasi');
    const studio = ambilField('Studio');
    const musim  = ambilField('Musim');

    const ratingMatch = html.match(/<strong>Rating\s+([0-9.]+)<\/strong>/i);
    const rating = ratingMatch ? ratingMatch[1] : '';

    // Field tambahan blok info lengkap (terbukti ada di halaman detail).
    const karakter = ambilField('Karakter').replace(/,\s*$/, '').trim();
    const disimpanMatch = html.match(/Disimpan oleh\s+(\d+)\s+orang/i);
    const disimpan = disimpanMatch ? disimpanMatch[1] : '';
    // Markup asli: <b>Diupdate:</b> <time itemprop="dateModified" ...>Oktober 26, 2026</time>
    // (alasan gagal yang sama: </b> + tag <time> di antara label dan nilai).
    const diupdateMatch = html.match(/Diupdate:\s*(?:<[^>]+>|\s+)*([^<]{3,40})/i);
    const diupdate = diupdateMatch ? diupdateMatch[1].trim() : '';
    let diposting = '';
    // Markup asli: <b>Diposting:</b> <i itemprop="name">Animasu</i> — nilai
    // terbungkus tag, jadi grup pemakan harus selang-seling tag & whitespace
    // (pola lama gagal karena berhenti di tag pembuka nilai).
    const dipostingMatch = html.match(/Diposting:\s*(?:<[^>]+>|\s+)*([^<]{1,30})/i);
    if (dipostingMatch) {
        diposting = dipostingMatch[1].replace(/\s*Diupdate:.*$/i, '').trim();
        if (/Diupdate/i.test(diposting)) diposting = '';
    }

    const sinopsisMatch = html.match(/<span class="desc"[^>]*>([\s\S]*?)<\/span>\s*<\/div>/i);
    const sinopsis = sinopsisMatch
        ? stripHtml(sinopsisMatch[1]).replace(/\s{2,}/g, ' ').trim()
        : '';

    const epMatch    = html.match(/<span class="lchx"><a href="([^"]+)">Episode\s+(\d+)<\/a><\/span>/i);
    const latestEpUrl = epMatch ? epMatch[1] : '';
    const latestEpNum = epMatch ? parseInt(epMatch[2]) : 0;

    const allEps = [...html.matchAll(/<span class="lchx"><a href="[^"]+">Episode\s+(\d+)<\/a><\/span>/gi)];
    const totalEp = allEps.length;

    const totalSeriRaw = ambilField('Episode');
    const totalSeriMatch = totalSeriRaw.match(/(\d+)/);
    const totalSeri = totalSeriMatch ? parseInt(totalSeriMatch[1]) : 0;

    const trailerMatch = html.match(/bixbox trailer[\s\S]*?<iframe[^>]+src="https:\/\/www\.youtube\.com\/embed\/([^"?/]+)/i);
    const trailerUrl   = trailerMatch ? `https://www.youtube.com/watch?v=${trailerMatch[1]}` : '';

    const batchDownload = parseBatchDownload(html);

    return {
        judul, judulAlt, cover, genre, status, rilis, jenis,
        durasi, studio, musim, rating, sinopsis,
        latestEpNum, latestEpUrl, totalEp, totalSeri, trailerUrl,
        batchDownload,
        karakter, disimpan, diupdate, diposting,
        url: animeUrl,
    };
}

function parseBatchDownload(html) {
    const batchTitleM = html.match(/<div class="sorattlx"[^>]*>\s*<h3>([\s\S]*?Download\s+Batch[\s\S]*?)<\/h3>/i);
    if (!batchTitleM) return null;

    const title = stripHtml(batchTitleM[1]).trim();
    const startIdx = batchTitleM.index;
    const afterBatch = html.slice(startIdx);

    let section = afterBatch;
    const nextSoraddlxIdx = afterBatch.indexOf('<div class="soraddlx', 20);
    if (nextSoraddlxIdx !== -1) section = afterBatch.slice(0, nextSoraddlxIdx);

    const resolutions = [];
    const urlDivRe = /<div class="soraurlx">([\s\S]*?)<\/div>/gi;
    let m;
    while ((m = urlDivRe.exec(section)) !== null) {
        const inner = m[1];
        const resM  = inner.match(/<strong>([\s\S]*?)<\/strong>/i);
        if (!resM) continue;
        const res   = stripHtml(resM[1]).trim();
        const links = [];
        const linkRe = /<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        let lm;
        while ((lm = linkRe.exec(inner)) !== null) {
            const href  = lm[1].trim();
            const label = stripHtml(lm[2]).trim();
            if (href && label && href !== '#') links.push({ label, url: href });
        }
        if (links.length) resolutions.push({ res, links });
    }

    if (!resolutions.length) return null;
    return { title, resolutions };
}

// ── FETCH ─────────────────────────────────────────────────────────────────────

async function fetchDenganRetry(fn, maxRetry = 3, delayMs = 3000) {
    let lastErr;
    for (let i = 0; i < maxRetry; i++) {
        try {
            return await fn();
        } catch (e) {
            lastErr = e;
            if (i < maxRetry - 1) await new Promise(r => setTimeout(r, delayMs));
        }
    }
    throw lastErr;
}

// ── BYPASS CLOUDFLARE VIA JINA READER ─────────────────────────────────────────
// Pola dari SEMUA_FITUR/anime/alqanime.js: alqanime.net juga diblokir Cloudflare,
// solusinya fetch lewat r.jina.ai TANPA UA browser (Jina memblokir request dengan
// UA browser spesifik → 403). Jina format html mengembalikan HTML asli situs,
// sehingga parser yang sudah ada jalan tanpa perubahan.
// Perilaku fetchHtml: direct sekali dulu (tanpa retry — 403 Cloudflare tidak akan
// berubah kalau di-retry) → kalau gagal / halaman blokir → fallback Jina (retry
// 2x untuk error transien ala alqanime). Kalau Jina pun mengembalikan halaman
// blokir — terbukti untuk path /anime/* dan /wp-json/*, Cloudflare situs ini
// blokir per-path — lempar error CLOUDFLARE_BLOCKED yang jelas, bukan HTML
// blokir yang diparse jadi caption kosong.

const JINA_BASE = 'https://r.jina.ai/';
const JINA_HEADERS = {
    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
    'X-Return-Format': 'html',
};

function isCloudflareBlockPage(html) {
    return typeof html === 'string' && (
        html.includes('Attention Required! | Cloudflare') ||
        html.includes('id="cf-wrapper"')
    );
}

function cfBlockedError() {
    const e = new Error('Halaman Animasu ini diblokir Cloudflare (bahkan via jalur bypass Jina) — detail anime tidak bisa diambil saat ini.');
    e.code = 'CLOUDFLARE_BLOCKED';
    return e;
}

async function fetchHtmlViaJina(url) {
    let lastErr;
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const r = await axios.get(JINA_BASE + url, { headers: JINA_HEADERS, timeout: 90000 });
            const html = typeof r.data === 'string' ? r.data : '';
            if (isCloudflareBlockPage(html)) throw cfBlockedError();
            return html;
        } catch (e) {
            if (e.code === 'CLOUDFLARE_BLOCKED') throw e; // blokir definitif, jangan retry
            lastErr = e;
            if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
        }
    }
    throw lastErr;
}

async function fetchHtml(url) {
    try {
        const r = await axios.get(url, { headers: HEADERS, timeout: 30000 });
        const html = r.data;
        if (isCloudflareBlockPage(html)) throw new Error('CF_BLOCK_PAGE');
        return html;
    } catch (_) {
        // Direct gagal (403 / halaman blokir / error jaringan).
        // Halaman detail: Jina SELALU diblokir (terbukti berkali-kali, plus Jina
        // ikut rate-limit) → langsung translate.goog, tanpa buang request ke Jina.
        // Homepage & lainnya: Jina (TG tidak boleh karena TG menulis ulang URL
        // gambar cover sehingga Baileys gagal fetch).
        if (url.startsWith(BASE_URL + '/anime/')) {
            return fetchHtmlViaTranslateGoog(url);
        }
        return fetchHtmlViaJina(url);
    }
}

// Halaman detail via proxy Google Translate (animasu-love.translate.goog).
// Terbukti: parser asli jalan di HTML-nya tanpa ubahan, sinopsis Indonesia asli.
// 429 Google di-retry (terbukti sementara). Kalau TG mengembalikan halaman blokir
// Cloudflare (Google ikut diblokir), lempar CLOUDFLARE_BLOCKED.
async function fetchHtmlViaTranslateGoog(url) {
    const tgUrl = `https://animasu-love.translate.goog${url.slice(BASE_URL.length)}?_x_tr_sl=auto&_x_tr_tl=id&_x_tr_hl=id`;
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const r = await axios.get(tgUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept-Language': 'id-ID,id;q=0.9',
                },
                timeout: 90000, maxRedirects: 5, validateStatus: null,
            });
            const html = typeof r.data === 'string' ? r.data : '';
            if (r.status === 429) throw new Error('TG_429');
            if (isCloudflareBlockPage(html)) throw cfBlockedError();
            if (r.status !== 200 || !html) throw new Error('TranslateGoog gagal: ' + r.status);
            return html;
        } catch (e) {
            if (e.code === 'CLOUDFLARE_BLOCKED') throw e;
            lastErr = e;
            if (attempt < 3) await new Promise(r => setTimeout(r, 10000));
        }
    }
    throw lastErr;
}

// Kembalikan URL yang ditulis ulang translate.goog ke aslinya.
// Format Google: titik jadi '-', '-' asli jadi '--' (mis. i2-wp-com → i2.wp.com).
// Plus: buang parameter _x_tr_* (bekas proxy) & decode &amp; supaya link bersih.
function kembalikanUrlTranslate(url) {
    const m = (url || '').match(/^https?:\/\/([a-z0-9-]+)\.translate\.goog(\/.*)?$/i);
    if (!m) return url;
    const host = m[1].replace(/--/g, '__DASH__').replace(/-/g, '.').replace(/__DASH__/g, '-');
    let rest = (m[2] || '/').replace(/&amp;/g, '&');
    const q = rest.indexOf('?');
    if (q !== -1) {
        const bersih = rest.slice(q + 1).split('&').filter(p => p && !p.startsWith('_x_tr_')).join('&');
        rest = bersih ? rest.slice(0, q) + '?' + bersih : rest.slice(0, q);
    }
    return 'https://' + host + rest;
}

async function fetchRecentPosts(count = 20) {
    const url = `${API_POSTS}?per_page=${count}&_embed=wp%3Aterm&_fields=id,date,date_gmt,slug,title,link`;
    return fetchDenganRetry(async () => {
        const r = await axios.get(url, { headers: HEADERS, timeout: 30000 });
        return r.data;
    });
}

// Ambil URL anime yang benar dari halaman episode (fallback saat slug 404)
async function fetchAnimeUrlFromEpisodePage(postLink) {
    try {
        const html = await axios.get(postLink, { headers: HEADERS, timeout: 20000 }).then(r => r.data);
        const baseEscaped = BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = 'href="(' + baseEscaped + '\\/anime\\/[^"]+)"';
        const m = html.match(new RegExp(pattern));
        return m ? m[1].replace(/\/$/, '') + '/' : null;
    } catch (_) {
        return null;
    }
}

// ── HOMEPAGE: SEDANG TAYANG & BARU DITAMBAH/DIPERBARUI (REALTIME PER-SEKSI) ────
//
// Web Animasu punya 2 widget terpisah di homepage:
//   1. "Sedang Tayang"           → anime ongoing yang baru rilis episode
//   2. "Baru Ditambah & Diperbarui" → anime yang baru ditambahkan ke web ATAU
//                                     datanya baru diupdate (termasuk yang sudah selesai)
// Dua-duanya dipantau TERPISAH biar notifnya sesuai kategori aslinya di web,
// tidak dicampur jadi satu jenis notif generik.

const URL_HOMEPAGE = `${BASE_URL}/`;

function ambilSlugDariUrlAnime(url) {
    const m = (url || '').match(/\/anime\/([^/]+)\/?/);
    return m ? m[1] : '';
}

// Ambil 1 blok kartu anime (bsx) dari potongan HTML tertentu (section homepage)
function parseAnimeCards(sectionHtml) {
    const re = /<div class="bsx">\s*<a href="([^"]+)"[^>]*title="([^"]*)"[^>]*>[\s\S]*?<div class="typez[^"]*">([^<]*)<\/div>[\s\S]*?<span class="epx">([^<]*)<\/span>\s*<span class="sb[^"]*">([\s\S]*?)<\/span>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<div class="tt">\s*([\s\S]*?)<\/div>\s*<\/a>/g;
    const out = [];
    let m;
    while ((m = re.exec(sectionHtml)) !== null) {
        const url = m[1];
        // Status kadang berisi <img> emoji (alt="🔥") bukan teks polos — ambil
        // alt-nya dulu supaya label status tidak hilang saat stripHtml.
        const statusRaw = (m[5] || '').replace(/<img[^>]+alt="([^"]*)"[^>]*>/gi, '$1');
        out.push({
            url,
            slug         : ambilSlugDariUrlAnime(url),
            jenis        : (m[3] || '').trim(),
            episodeLabel : stripHtml(m[4]),
            statusLabel  : stripHtml(statusRaw),
            // JANGAN rewrite Photon (i*.wp.com) ke animasu.love: host animasu.love
            // diblokir Cloudflare dari host bot sehingga Baileys gagal fetch gambar
            // ("Failed to fetch stream") saat kirim preview/notif. Photon justru
            // lolos (200) — pakai URL cover asli dari HTML apa adanya.
            cover        : (m[6] || '').split('?')[0],
            judul        : stripHtml(m[7]),
        });
    }
    return out;
}

// Ambil & pisahkan HTML homepage jadi 2 section: "Sedang Tayang" & "Baru Ditambah & Diperbarui"
async function fetchHomepageSections() {
    const html = await fetchHtml(URL_HOMEPAGE);
    const idxTayang    = html.indexOf('Sedang Tayang');
    const idxTerupdate = html.indexOf('id="terupdate"');
    if (idxTayang === -1 || idxTerupdate === -1 || idxTerupdate <= idxTayang) {
        throw new Error('Struktur homepage Animasu berubah — section tidak ditemukan');
    }
    return {
        sectionTayang : html.slice(idxTayang, idxTerupdate),
        sectionUpdate : html.slice(idxTerupdate),
    };
}

// Cek perubahan pada widget "Sedang Tayang" — trigger saat episode baru
// (label episode berubah) atau anime baru pertama kali muncul di widget ini.
async function cariPerubahanSedangTayang() {
    const { sectionTayang } = await fetchHomepageSections();
    const daftar = parseAnimeCards(sectionTayang).filter(a => a.slug);

    const data = bacaData();
    const stateLama = data.tayangState || {};
    const belumPernahInit = !data.tayangState; // baru pertama kali → jangan spam semua sebagai "baru"

    const stateBaru = {};
    const perubahan = [];

    for (const a of daftar) {
        stateBaru[a.slug] = a.episodeLabel;
        if (belumPernahInit) continue; // seed baseline dulu, tidak dikirim
        const labelLama = stateLama[a.slug];
        if (labelLama === undefined) {
            perubahan.push({ ...a, tipe: 'baru_tayang' });
        } else if (labelLama !== a.episodeLabel) {
            perubahan.push({ ...a, tipe: 'episode_baru', labelLama });
        }
    }

    data.tayangState = stateBaru;
    simpanData(data);
    return perubahan;
}

// Cek perubahan pada widget "Baru Ditambah & Diperbarui" — trigger saat ada
// anime baru pertama kali muncul (baru ditambah) atau label-nya berubah (diperbarui).
async function cariPerubahanBaruDiperbarui() {
    const { sectionUpdate } = await fetchHomepageSections();
    const daftar = parseAnimeCards(sectionUpdate).filter(a => a.slug);

    const data = bacaData();
    const stateLama = data.updateState || {};
    const belumPernahInit = !data.updateState;

    const stateBaru = {};
    const perubahan = [];

    for (const a of daftar) {
        const labelGabungan = `${a.episodeLabel} | ${a.statusLabel}`;
        stateBaru[a.slug] = labelGabungan;
        if (belumPernahInit) continue;
        const labelLama = stateLama[a.slug];
        if (labelLama === undefined) {
            perubahan.push({ ...a, tipe: 'baru_ditambah' });
        } else if (labelLama !== labelGabungan) {
            perubahan.push({ ...a, tipe: 'diperbarui', labelLama });
        }
    }

    data.updateState = stateBaru;
    simpanData(data);
    return perubahan;
}

// ── ENRICHMENT: GENRE + SINOPSIS VIA KITSU (TANPA KEY) ───────────────────────
// Halaman detail Animasu diblokir Cloudflare (bahkan via Jina), jadi genre &
// sinopsis tidak bisa diambil dari Animasu. Kitsu (kitsu.io/api/edge/anime)
// lolos dari host ini dan mengembalikan genre + sinopsis dari judul kartu.
// Dipanggil HANYA saat preview diminta atau saat monitor mendeteksi perubahan
// (bukan tiap tick) — dan TIDAK PERNAH melempar: gagal/tidak cocok → item
// dikembalikan apa adanya sehingga caption tetap terkirim tanpa enrichment.
const kitsuCache = new Map(); // slug animasu -> { genre, sinopsis }

function normalisasiJudulAnime(teks) {
    return (teks || '').toLowerCase().replace(/\[[^\]]*\]/g, ' ')
        .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchKitsuMeta(judul) {
    try {
        const r = await axios.get('https://kitsu.io/api/edge/anime', {
            params: { 'filter[text]': judul, 'page[limit]': 5, include: 'categories' },
            headers: { Accept: 'application/vnd.api+json' },
            timeout: 15000,
        });
        const hasil = r.data?.data || [];
        if (!hasil.length) return null;
        const kategori = {};
        for (const inc of (r.data?.included || [])) {
            if (inc.type === 'categories') kategori[inc.id] = inc.attributes?.title;
        }
        // Kandidat judul: judul kartu tanpa [...] + isi [...] (mis. "Link Click: Bridon Arc").
        const kurung = (judul.match(/\[([^\]]+)\]/) || [])[1] || '';
        const kandidat = [normalisasiJudulAnime(judul), normalisasiJudulAnime(kurung)].filter(Boolean);
        let pilih = null;
        for (const a of hasil) {
            const at = a.attributes || {};
            const nama = [normalisasiJudulAnime(at.canonicalTitle), normalisasiJudulAnime(at.titles?.en)].filter(Boolean);
            if (kandidat.some(k => nama.includes(k))) { pilih = a; break; }
        }
        if (!pilih) return null; // tidak ada yang cocok persis — jangan tebak
        const at = pilih.attributes || {};
        const genre = (pilih.relationships?.categories?.data || [])
            .map(c => kategori[c.id]).filter(Boolean).slice(0, 6).join(', ');
        const sinopsis = (at.synopsis || '').replace(/\s+/g, ' ').trim();
        return { id: pilih.id, genre, sinopsis };
    } catch (_) {
        return null;
    }
}

// Lanjutan/versi lain via relasi Kitsu (halaman Animasu tidak punya seksi sekuel
// yang bisa diparse). Hasil: null = tak diketahui (baris disembunyikan),
// false = terbukti tidak ada, string = judul lanjutan, true = ada (judul tak ter-resolve).
// Tidak pernah throw. Cache per judul.
const kitsuLanjutanCache = new Map();
async function fetchKitsuLanjutan(judul) {
    try {
        if (!judul) return null;
        if (kitsuLanjutanCache.has(judul)) return kitsuLanjutanCache.get(judul);
        const meta = await fetchKitsuMeta(judul);
        if (!meta?.id) { kitsuLanjutanCache.set(judul, null); return null; }
        const r = await axios.get('https://kitsu.io/api/edge/media-relationships', {
            params: { 'filter[source_id]': meta.id, 'page[limit]': 20, include: 'destination' },
            headers: { Accept: 'application/vnd.api+json' },
            timeout: 15000, validateStatus: null,
        });
        const rels = r.data?.data || [];
        const tujuan = {};
        for (const inc of (r.data?.included || [])) {
            if (inc.type === 'anime') tujuan[inc.id] = inc.attributes?.canonicalTitle;
        }
        const sekuel = rels.filter(x => /sequel|prequel/i.test(x.attributes?.role || ''));
        let hasil = false;
        if (sekuel.length) {
            const nama = sekuel.map(x => tujuan[x.relationships?.destination?.data?.id]).filter(Boolean);
            hasil = nama.length ? nama.join(', ') : true;
        }
        kitsuLanjutanCache.set(judul, hasil);
        return hasil;
    } catch (_) {
        return null;
    }
}

async function perkayasItemDenganKitsu(item) {
    try {
        if (!item?.judul) return item;
        if (kitsuCache.has(item.slug)) {
            const meta = kitsuCache.get(item.slug);
            return { ...item, genre: meta.genre, sinopsis: meta.sinopsis };
        }
        const meta = await fetchKitsuMeta(item.judul);
        if (!meta) return item;
        kitsuCache.set(item.slug, meta);
        return { ...item, genre: meta.genre, sinopsis: meta.sinopsis };
    } catch (_) {
        return item;
    }
}

// ── BLOK INFO LENGKAP (DETAIL VIA TRANSLATE.GOOG) ─────────────────────────────
// Detail lengkap diambil lewat fetchHtml (direct → Jina → translate.goog).
// URL yang ditulis ulang translate.goog dikembalikan ke aslinya (trailer,
// episode terbaru, cover) supaya link yang dikirim bisa diklik user.
const FILE_DETAIL_CACHE = path.join(process.cwd(), 'data', 'animasu', 'detail-cache.json');
const detailCache = new Map(); // slug -> detail (memori proses; hemat request TG)

// Cache file SELALU dibaca fresh dari disk (tidak di-memoize): seed dari luar
// (skrip seed / proses lain) langsung terlihat tanpa restart bot. File kecil
// (<200 entri), dan baca hanya terjadi saat live gagal — jadi murah.
function muatCacheFileDetail() {
    try {
        if (fs.existsSync(FILE_DETAIL_CACHE)) {
            return new Map(Object.entries(JSON.parse(fs.readFileSync(FILE_DETAIL_CACHE, 'utf-8')) || {}));
        }
    } catch (_) {}
    return new Map();
}

function simpanCacheFileDetail(slug, entri) {
    try {
        const fc = muatCacheFileDetail();
        fc.set(slug, entri);
        if (fc.size > 200) {
            const urut = [...fc.entries()].sort((a, b) => (a[1].fetchedAt || '').localeCompare(b[1].fetchedAt || ''));
            for (const [k] of urut.slice(0, fc.size - 200)) fc.delete(k);
        }
        fs.writeFileSync(FILE_DETAIL_CACHE, JSON.stringify(Object.fromEntries(fc), null, 2), 'utf-8');
    } catch (_) {}
}

// Detail lengkap: live dulu (direct → translate.goog), gagal → cache file.
// Cache file BERTAHAN melewati reboot host (yang tiap jam menghapus cache memori),
// jadi blok lengkap (rating, disimpan, dll) tetap tampil walau TG sedang 429/blokir.
// Data cache selalu kalah dari live: tiap sukses live, cache ditimpa yang baru.
// Mengembalikan null bila live gagal DAN tidak ada cache (pemanggil jatuh ke Kitsu).
async function fetchDetailLengkap(slug, judulUntukLanjutan) {
    if (detailCache.has(slug)) return detailCache.get(slug);
    try {
        const animeUrl = `${BASE_URL}/anime/${slug}/`;
        const html = await fetchHtml(animeUrl);
        const detail = parseDetailPage(html, animeUrl);
        for (const k of ['trailerUrl', 'latestEpUrl', 'cover']) {
            if (detail[k] && detail[k].includes('.translate.goog')) {
                detail[k] = kembalikanUrlTranslate(detail[k]);
            }
        }
        if (detail.judul || detail.sinopsis || detail.genre) {
            try { detail.lanjutan = await fetchKitsuLanjutan(detail.judul || judulUntukLanjutan); } catch (_) { detail.lanjutan = null; }
            detailCache.set(slug, detail);
            simpanCacheFileDetail(slug, { detail, fetchedAt: new Date().toISOString() });
            return detail;
        }
    } catch (_) {}
    // Live gagal/kosong → cache file (bisa agak basi, tapi lengkap — jauh lebih
    // baik daripada fallback Kitsu yang tidak punya rating/disimpan/studio/dll).
    // File dibaca fresh (bukan memoize) agar seed dari luar langsung terpakai.
    try {
        const entri = muatCacheFileDetail().get(slug);
        if (entri?.detail) {
            detailCache.set(slug, entri.detail);
            return entri.detail;
        }
    } catch (_) {}
    return null;
}

// Caption blok lengkap SATU PESAN (sinopsis di dalam caption, bukan pesan
// terpisah — keputusan Wily 16:00). Caption gambar WA mentok 1024 karakter,
// jadi bila total melewati 1000 karakter, sinopsis dipotong di batas kata
// (lihat sesuaikanPanjangCaption) — bukan potong tetap seperti dulu.
function buatCaptionDetailLengkap(item, detail) {
    const waktu = new Date().toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta', weekday: 'long', day: '2-digit', month: 'long',
        year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const headerMap = {
        baru_tayang: '🔥 *ANIME BARU TAYANG!*',
        episode_baru: '🔥 *SEDANG TAYANG - EPISODE BARU!*',
        baru_ditambah: '🆕 *ANIME BARU DITAMBAHKAN!*',
        diperbarui: '🔄 *ANIME DIPERBARUI!*',
    };
    const header = headerMap[item.tipe] || '🔥 *ANIME UPDATE!*';
    let episodeLabel = item.episodeLabel || '';
    const epM = episodeLabel.match(/^Episode (\d+)$/);
    if (epM && detail.totalEp) episodeLabel = `Episode ${epM[1]}/${detail.totalEp}`;
    const isUpdate = item.tipe === 'baru_ditambah' || item.tipe === 'diperbarui';
    const lanjutanText = detail.lanjutan === false ? 'Belum ada'
        : (typeof detail.lanjutan === 'string' ? detail.lanjutan
        : (detail.lanjutan === true ? 'Ada' : ''));
    const info = buatBarisInfo([
        // Parser sengaja membuang emoji status; contoh resmi Wily menulis
        // "Sedang Tayang 🔥", jadi kembalikan 🔥 untuk status itu saja.
        ['Status', detail.status === 'Sedang Tayang' ? 'Sedang Tayang 🔥' : detail.status],
        ['Rilis', detail.rilis],
        ['Jenis', detail.jenis],
        ['Durasi', detail.durasi],
        ['Studio', detail.studio],
        ['Rating', detail.rating],
        ['Disimpan', detail.disimpan ? `${detail.disimpan} orang` : ''],
        ['Diposting', detail.diposting],
        ['Diupdate', detail.diupdate],
        ['Karakter', detail.karakter],
        ['Lanjutan', lanjutanText],
    ]);
    return (
        `${header}\n` +
        `\n` +
        `📅 _${waktu} WIB_\n` +
        `\n` +
        `🎌 *${detail.judul || item.judul}*\n` +
        `📺 *${episodeLabel}*${isUpdate && item.statusLabel ? ` · ${item.statusLabel}` : ''}\n` +
        (detail.genre ? `🎭 *Genre:* ${detail.genre}\n` : '') +
        (item.labelLama ? `↪️ _Sebelumnya: ${item.labelLama}_\n` : '') +
        (info ? `\n📋 *Info Anime*\n${info}\n` : '') +
        (detail.sinopsis ? `\n📖 *Sinopsis:*\n${detail.sinopsis.split('\n').map(b => `> ${b}`).join('\n')}\n` : '') +
        (detail.trailerUrl ? `▶️ *Trailer:* ${detail.trailerUrl}\n` : '') +
        (detail.latestEpUrl ? `🎬 *Episode Terbaru:* ${detail.latestEpUrl}\n` : '') +
        `\n🔗 ${item.url}`
    );
}

// SATU PESAN, bukan pisah-pisah (keputusan Wily 16:00 — pesan sinopsis terpisah
// terasa "makin aneh"). Caption gambar WA mentok 1024 karakter, jadi sinopsis
// HANYA dipotong bila total caption melewati 1000 karakter (margin aman), dan
// potongnya di batas kata (potongSinopsis) — bukan potong tetap 250 seperti dulu.
// Untuk data yang sedang tampil (Kitsu: 213 & 616 char) tidak ada yang dipotong.
function sesuaikanPanjangCaption(caption, sinopsis, buatUlang) {
    if (!sinopsis || caption.length <= 1000) return caption;
    const budget = Math.max(20, 1000 - (caption.length - sinopsis.length));
    return buatUlang(potongSinopsis(sinopsis, budget));
}

// Satu pintu pesan lengkap untuk preview & monitor, dengan fallback berlapis:
//  1. Detail lengkap (translate.goog, sinopsis Indonesia)
//  2. Kitsu (genre + sinopsis Inggris)
//  3. Kartu saja (tanpa sinopsis)
// TIDAK PERNAH melempar: semua kegagalan jatuh ke lapisan berikut.
async function buatPesanLengkap(item) {
    try {
        const detail = await fetchDetailLengkap(item.slug, item.judul);
        if (detail && (detail.judul || detail.sinopsis || detail.genre)) {
            const caption = sesuaikanPanjangCaption(
                buatCaptionDetailLengkap(item, detail),
                detail.sinopsis,
                s => buatCaptionDetailLengkap(item, { ...detail, sinopsis: s }),
            );
            return { caption, urlGambar: item.cover || null };
        }
    } catch (_) {}
    const kaya = await perkayasItemDenganKitsu(item);
    const isUpdate = item.tipe === 'baru_ditambah' || item.tipe === 'diperbarui';
    const bangun = k => isUpdate ? buatCaptionBaruUpdate(k) : buatCaptionTayang(k);
    const caption = sesuaikanPanjangCaption(
        bangun(kaya),
        kaya.sinopsis,
        s => bangun({ ...kaya, sinopsis: s }),
    );
    return { caption, urlGambar: item.cover || null };
}

// ── CAPTION: SEDANG TAYANG & BARU DITAMBAH/DIPERBARUI ─────────────────────────

function buatCaptionTayang(item) {
    const waktu = new Date().toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta', weekday: 'long', day: '2-digit', month: 'long',
        year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const judul = item.tipe === 'baru_tayang' ? '🔥 *ANIME BARU TAYANG!*' : '🔥 *SEDANG TAYANG - EPISODE BARU!*';
    return (
        `${judul}\n` +
        `\n` +
        `📅 _${waktu} WIB_\n` +
        `\n` +
        `🎌 *${item.judul}*\n` +
        `📺 *${item.episodeLabel}*\n` +
        (item.genre ? `🎭 *Genre:* ${item.genre}\n` : '') +
        (item.labelLama ? `↪️ _Sebelumnya: ${item.labelLama}_\n` : '') +
        (item.sinopsis ? `\n📖 *Sinopsis (EN):*\n${item.sinopsis.split('\n').map(b => `> ${b}`).join('\n')}\n` : '') +
        `\n🔗 ${item.url}`
    );
}

function buatCaptionBaruUpdate(item) {
    const waktu = new Date().toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta', weekday: 'long', day: '2-digit', month: 'long',
        year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const judul = item.tipe === 'baru_ditambah' ? '🆕 *ANIME BARU DITAMBAHKAN!*' : '🔄 *ANIME DIPERBARUI!*';
    return (
        `${judul}\n` +
        `\n` +
        `📅 _${waktu} WIB_\n` +
        `\n` +
        `🎌 *${item.judul}*\n` +
        `📺 *${item.episodeLabel}* · ${item.statusLabel}\n` +
        (item.genre ? `🎭 *Genre:* ${item.genre}\n` : '') +
        (item.labelLama ? `↪️ _Sebelumnya: ${item.labelLama}_\n` : '') +
        (item.sinopsis ? `\n📖 *Sinopsis (EN):*\n${item.sinopsis.split('\n').map(b => `> ${b}`).join('\n')}\n` : '') +
        `\n🔗 ${item.url}`
    );
}

// Preview cepat (tanpa dedup/state) buat perintah .animasu test — ambil item
// teratas dari tiap widget apa adanya, cuma buat cek format & konektivitas.
async function previewSedangTayang() {
    const { sectionTayang } = await fetchHomepageSections();
    const daftar = parseAnimeCards(sectionTayang).filter(a => a.slug);
    if (!daftar.length) throw new Error('Widget "Sedang Tayang" kosong/tidak terbaca');
    return buatPesanLengkap({ ...daftar[0], tipe: 'episode_baru' });
}

async function previewBaruUpdate() {
    const { sectionUpdate } = await fetchHomepageSections();
    const daftar = parseAnimeCards(sectionUpdate).filter(a => a.slug);
    if (!daftar.length) throw new Error('Widget "Baru Ditambah & Diperbarui" kosong/tidak terbaca');
    return buatPesanLengkap({ ...daftar[0], tipe: 'diperbarui' });
}

// Preview SATU update terbaru (dipakai `.animasu test` sejak 17:52 — keputusan
// Wily: cukup 1 kali, bukan 2 preview). Kartu homepage TIDAK membawa timestamp
// (terverifikasi: tidak ada <time>/datetime/class date di 10+10 kartu), jadi
// "terbaru" lintas widget tidak bisa dibandingkan dari kartu — yang dipakai:
// kartu teratas "Sedang Tayang" (feed rilis episode terbaru); bila Tayang
// kosong, kartu teratas "Baru Ditambah & Diperbarui".
async function previewUpdateTerbaru() {
    const { sectionTayang, sectionUpdate } = await fetchHomepageSections();
    const tayang = parseAnimeCards(sectionTayang).filter(a => a.slug);
    if (tayang.length) return buatPesanLengkap({ ...tayang[0], tipe: 'episode_baru' });
    const upd = parseAnimeCards(sectionUpdate).filter(a => a.slug);
    if (upd.length) return buatPesanLengkap({ ...upd[0], tipe: 'diperbarui' });
    throw new Error('Widget Animasu kosong/tidak terbaca');
}

// ── PARSE SLUG & EPISODE DARI POST ────────────────────────────────────────────

function animeSlugDariPost(post) {
    try {
        const cats = post._embedded?.['wp:term']?.[0] || [];
        if (cats.length > 0 && cats[0].slug) return cats[0].slug;
    } catch (_) {}
    return (post.slug || '')
        .replace(/^nonton-/, '')
        .replace(/-episode-\d+.*$/, '');
}

function nomorEpisodeDariPost(post) {
    const m = (post.title?.rendered || '').match(/Episode\s+(\d+)/i);
    return m ? parseInt(m[1]) : 0;
}

// ── DEDUP ─────────────────────────────────────────────────────────────────────

function sudahDikirim(id) {
    const data = bacaData();
    return (data.idTerkirim || []).includes(String(id));
}

function tandaiSudahKirim(id) {
    const data = bacaData();
    if (!data.idTerkirim) data.idTerkirim = [];
    if (!data.idTerkirim.includes(String(id))) {
        data.idTerkirim.unshift(String(id));
        if (data.idTerkirim.length > 300) data.idTerkirim = data.idTerkirim.slice(0, 300);
        simpanData(data);
    }
}

// Tandai sudah dikirim DAN catat ke log pengiriman
function tandaiDanLog(item, grupList) {
    tandaiSudahKirim(item.postId);

    try {
        const log = bacaLog();
        if (!Array.isArray(log.terkirim)) log.terkirim = [];

        // Hindari duplikat di log
        const sudahAda = log.terkirim.some(e => String(e.postId) === String(item.postId));
        if (!sudahAda) {
            log.terkirim.unshift({
                postId     : String(item.postId),
                judul      : item.judul || item.animeSlug || '-',
                epNum      : item.epNum || 0,
                animeSlug  : item.animeSlug || '',
                waktuPost  : item.postDate || null,
                waktuKirim : new Date().toISOString(),
                grupCount  : grupList.length,
                grupList   : grupList,
                cover      : item.cover || null,
                url        : item.url || null,
            });
            if (log.terkirim.length > 300) log.terkirim = log.terkirim.slice(0, 300);
            simpanLog(log);
        }
    } catch (e) {
        console.warn('[Animasu] Gagal simpan log:', e?.message);
    }
}

// Ambil log pengiriman terbaru (untuk command)
function getRecentLog(jumlah = 20) {
    const log = bacaLog();
    return (log.terkirim || []).slice(0, jumlah);
}

// ── CARI EPISODE BARU (REALTIME FIXED) ────────────────────────────────────────
//
// Perubahan dari versi sebelumnya:
// 1. Menggunakan lastCheckTime (disimpan di animasu.json) sebagai batas usia post,
//    bukan fixed 8 menit. Sehingga tidak ada post yang terlewat meski bot restart.
// 2. idGagal: post yang gagal fetch detail disimpan dan dicoba ulang check berikutnya
//    selama maks RETRY_TTL_MS (30 menit) sebelum diabaikan permanen.
// 3. Fetch 20 post (dari 15) untuk jangkauan lebih luas.

async function cariEpisodeBaru() {
    const now  = Date.now();
    const data = bacaData();

    // ── Hitung batas waktu ─────────────────────────────────────────────────────
    // Pakai lastCheckTime - BUFFER_MS sebagai batas bawah
    // Jika belum ada (bot baru start), pakai INIT_WINDOW_MS ke belakang
    const lastCheck = data.lastCheckTime || (now - INIT_WINDOW_MS);
    const batas     = lastCheck - BUFFER_MS;

    // Simpan waktu check sekarang SEBELUM proses (agar check berikutnya punya referensi)
    data.lastCheckTime = now;
    if (!data.idTerkirim) data.idTerkirim = [];
    if (!data.idGagal)    data.idGagal    = [];
    simpanData(data);

    const baru    = [];
    const idGagalBaru = [];

    // ── Retry post yang sebelumnya gagal fetch detail ─────────────────────────
    for (const gagal of data.idGagal) {
        if (sudahDikirim(gagal.id)) continue;

        const usiaGagal = now - new Date(gagal.pertamaGagal).getTime();
        if (usiaGagal > RETRY_TTL_MS) {
            // Sudah terlalu lama → abaikan permanen
            console.log(`[Animasu] ⏭️ Retry timeout: post ${gagal.id} "${gagal.slug}" diabaikan`);
            tandaiSudahKirim(gagal.id);
            continue;
        }

        try {
            let animeUrl = `${BASE_URL}/anime/${gagal.slug}/`;
            let html;
            try {
                html = await fetchHtml(animeUrl);
            } catch (e404) {
                // Fallback: cari URL anime dari halaman episode
                if (gagal.postLink) {
                    const realUrl = await fetchAnimeUrlFromEpisodePage(gagal.postLink);
                    if (realUrl && realUrl !== animeUrl) {
                        console.log(`[Animasu] 🔄 Fallback URL: ${realUrl}`);
                        animeUrl = realUrl;
                        html = await fetchHtml(animeUrl);
                    } else throw e404;
                } else throw e404;
            }
            const detail = parseDetailPage(html, animeUrl);
            console.log(`[Animasu] 🔄 Retry berhasil: "${gagal.slug}" ep ${gagal.epNum}`);
            baru.push({
                postId    : gagal.id,
                postDate  : gagal.postDate,
                epNum     : gagal.epNum,
                animeSlug : gagal.slug,
                ...detail,
            });
        } catch (e) {
            console.warn(`[Animasu] 🔄 Retry masih gagal "${gagal.slug}":`, e?.message);
            idGagalBaru.push(gagal); // masukkan lagi ke antrian retry
        }
    }

    // ── Fetch & proses post terbaru dari API ──────────────────────────────────
    let posts = [];
    try {
        posts = await fetchRecentPosts(20);
    } catch (e) {
        console.error('[Animasu] ❌ Gagal fetch API posts:', e?.message);
    }

    for (const post of posts) {
        if (sudahDikirim(post.id)) continue;

        // Waktu publikasi post (UTC)
        const waktuPost = post.date_gmt
            ? new Date(post.date_gmt + 'Z').getTime()
            : new Date(post.date).getTime() - 7 * 3600 * 1000;

        if (waktuPost < batas) {
            // Post terlalu lama (sebelum check terakhir) — tandai tanpa kirim
            const usiaMenit = Math.round((now - waktuPost) / 60000);
            console.log(`[Animasu] ⏭️ Lewati lama: post ${post.id} "${post.slug}" (${usiaMenit}m lalu)`);
            tandaiSudahKirim(post.id);
            continue;
        }

        const animeSlug = animeSlugDariPost(post);
        const epNum     = nomorEpisodeDariPost(post);
        if (!animeSlug) {
            console.warn(`[Animasu] ⚠️ Slug kosong untuk post ${post.id}, dilewati`);
            tandaiSudahKirim(post.id);
            continue;
        }

        try {
            let animeUrl = `${BASE_URL}/anime/${animeSlug}/`;
            let html;
            try {
                html = await fetchHtml(animeUrl);
            } catch (e404) {
                // Fallback: cari URL anime yang benar dari halaman episode
                if (post.link) {
                    const realUrl = await fetchAnimeUrlFromEpisodePage(post.link);
                    if (realUrl && realUrl !== animeUrl) {
                        console.log(`[Animasu] 🔍 Fallback URL ditemukan: ${realUrl}`);
                        animeUrl = realUrl;
                        html = await fetchHtml(animeUrl);
                    } else throw e404;
                } else throw e404;
            }
            const detail = parseDetailPage(html, animeUrl);
            baru.push({
                postId    : post.id,
                postDate  : post.date,
                epNum,
                animeSlug,
                ...detail,
            });
        } catch (e) {
            console.warn(`[Animasu] ❌ Gagal fetch detail "${animeSlug}":`, e?.message);
            // Masukkan ke antrian retry — JANGAN langsung tandai sudahDikirim
            idGagalBaru.push({
                id          : String(post.id),
                slug        : animeSlug,
                epNum,
                postDate    : post.date,
                postLink    : post.link || null,
                pertamaGagal: new Date().toISOString(),
            });
        }
    }

    // Simpan antrian retry terbaru
    const dataFinal = bacaData();
    dataFinal.idGagal = idGagalBaru;
    simpanData(dataFinal);

    return baru;
}

// ── SIMULASI (TEST) ───────────────────────────────────────────────────────────

async function simulasi(slugOverride = null) {
    let animeSlug, epNum, postId, postDate, postLink, kartu = null;

    if (slugOverride) {
        animeSlug = slugOverride;
        epNum     = 0;
        postId    = 'sim-' + Date.now();
        postDate  = new Date().toISOString();
        postLink  = null;
    } else {
        // WP REST API diblokir Cloudflare (403) — sumber diganti ke widget
        // homepage "Sedang Tayang" (Jina, terbukti lolos): kartu teratas = anime
        // terbaru yang sedang tayang, padanan post terbaru dari API.
        const { sectionTayang } = await fetchHomepageSections();
        const daftar = parseAnimeCards(sectionTayang).filter(a => a.slug);
        if (!daftar.length) throw new Error('Tidak ada anime Sedang Tayang dari Animasu');
        const card = daftar[0];
        animeSlug  = card.slug;
        epNum      = parseInt((card.episodeLabel || '').match(/\d+/)?.[0] || '0', 10) || 0;
        postId     = 'sim-' + Date.now();
        postDate   = new Date().toISOString();
        postLink   = card.url;
        kartu      = { judul: card.judul, cover: card.cover, status: card.statusLabel, jenis: card.jenis };
    }

    let animeUrl = `${BASE_URL}/anime/${animeSlug}/`;
    let html = null;
    try {
        html = await fetchHtml(animeUrl);
    } catch (e404) {
        if (postLink) {
            try {
                const realUrl = await fetchAnimeUrlFromEpisodePage(postLink);
                if (realUrl && realUrl !== animeUrl) {
                    animeUrl = realUrl;
                    html = await fetchHtml(animeUrl);
                }
            } catch (_) { /* jatuh ke fallback kartu */ }
        }
    }
    if (html) {
        const detail = parseDetailPage(html, animeUrl);
        const data = { postId, postDate, epNum, animeSlug, ...detail };
        return { caption: buatCaption(data), urlGambar: data.cover || null, batchDownload: detail.batchDownload || null };
    }
    // Detail tak bisa diambil (translate.goog tertutup) — JANGAN gagal total
    // seperti dulu ("Gagal fetch Animasu" di test grup): pakai data kartu +
    // enrichment Kitsu, rantai yang sama dengan preview. Tidak pernah throw.
    let item = { slug: animeSlug, judul: kartu?.judul || animeSlug, url: animeUrl, cover: kartu?.cover || null };
    try { item = await perkayasItemDenganKitsu(item); } catch (_) {}
    const data = {
        postId, postDate, epNum, animeSlug,
        judul: item.judul, genre: item.genre || '', sinopsis: item.sinopsis || '',
        cover: item.cover || null, url: animeUrl,
        status: kartu?.status || '', jenis: kartu?.jenis || '',
    };
    return { caption: buatCaption(data), urlGambar: data.cover || null, batchDownload: null };
}

// ── FORMAT CAPTION ────────────────────────────────────────────────────────────


function buatBarisInfo(items) {
    const valid = items.filter(([, val]) => val !== null && val !== undefined && val !== '' && val !== '-');
    return valid.map(([label, val]) => {
        const bersih = String(label).replace(/\*/g, '').replace(/\s+/g, ' ').trim();
        return `• *${bersih}:* ${val}`;
    }).join('\n');
}

function potongSinopsis(teks, maks = 350) {
    if (!teks || teks.length <= maks) return teks || '-';
    const potong    = teks.slice(0, maks);
    const lastSpace = potong.lastIndexOf(' ');
    return (lastSpace > 0 ? potong.slice(0, lastSpace) : potong) + '...';
}

function buatCaption(data) {
    const {
        judul, judulAlt, epNum, latestEpNum, latestEpUrl, totalEp, totalSeri,
        genre, status, rilis, jenis, durasi, studio, musim, rating,
        sinopsis, trailerUrl, url, batchDownload,
    } = data;

    const ep  = epNum || latestEpNum || '?';
    const sinopsisBlock = potongSinopsis(sinopsis).split('\n').map(b => `> ${b}`).join('\n');

    const sekarang   = new Date();
    const opsiHari   = { timeZone: 'Asia/Jakarta', weekday: 'long' };
    const opsiTgl    = { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'long', year: 'numeric' };
    const opsiJam    = { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false };
    const namaHari   = sekarang.toLocaleDateString('id-ID', opsiHari);
    const tglLengkap = sekarang.toLocaleDateString('id-ID', opsiTgl);
    const jamMenit   = sekarang.toLocaleTimeString('id-ID', opsiJam).replace('.', ':');
    const headerWaktu = `${namaHari}, ${tglLengkap} · ${jamMenit} WIB`;

    const sedangTayang = (status || '').toLowerCase().includes('tayang') &&
                         !(status || '').toLowerCase().includes('selesai');

    const epHeader = totalSeri ? `${ep}/${totalSeri}` : String(ep);

    let epInfo = null;
    if (totalSeri) {
        epInfo = sedangTayang
            ? `${ep}/${totalSeri}  _(${totalEp} tersedia)_`
            : `${ep}/${totalSeri}`;
    } else if (totalEp) {
        epInfo = sedangTayang ? `${totalEp} ep tersedia` : `${totalEp} ep`;
    }

    const seksi1 = buatBarisInfo([
        ['🗂️ *Jenis*   ', jenis  || null],
        ['⏱️ *Durasi*  ', durasi || null],
        ['📦 *Episode* ', epInfo],
        ['🗓️ *Rilis*   ', rilis  || null],
        ['🌸 *Musim*   ', musim  || null],
        ['📡 *Status*  ', status || null],
        ['🏢 *Studio*  ', studio || null],
    ]);

    const seksi2 = buatBarisInfo([
        ['⭐ *Rating*  ', rating ? `${rating}/10` : null],
        ['🎭 *Genre*   ', genre  ? `_${genre}_`  : null],
    ]);

    let batchBlok = '';
    if (batchDownload?.resolutions?.length) {
        batchBlok += `\n`;
        batchBlok += `📦 *BATCH TERSEDIA!*\n`;
        batchBlok += `\n`;
        for (const r of batchDownload.resolutions) {
            const mirrors = r.links.map(l => l.label).join(' · ');
            batchBlok += `• \`${r.res}\` ${mirrors}\n`;
        }
        const firstLink = batchDownload.resolutions[0]?.links[0];
        if (firstLink) {
            batchBlok += `• 🔗 Download: ${firstLink.url}\n`;
        }
    }

    return (
        `🟢 *SUB INDO SUDAH TAYANG!*\n` +
        `\n` +
        `📅 _${headerWaktu}_\n` +
        `\n` +
        `🎌 *${judul}*\n` +
        `${judulAlt ? `_${judulAlt}_\n` : ''}` +
        `\n📺 *Episode ${epHeader}*\n` +
        `\n📖 *Sinopsis*\n` +
        `${sinopsisBlock}\n\n` +
        `\n` +
        `📋 *Info Anime*\n` +
        `\n` +
        `${seksi1}\n` +
        `\n` +
        `${seksi2}\n` +
        `\n` +
        `${trailerUrl ? `🎬 *PV*     : ${trailerUrl}\n` : ''}` +
        `▶️ *Tonton*  : ${latestEpUrl || url}\n` +
        `🔗 *Anime*   : ${url}` +
        batchBlok
    );
}

function ambilUrlGambar(data) {
    return data?.cover || null;
}

// ── STATUS: DAFTAR ANIME SEDANG TAYANG + SISA EPISODE ────────────────────────

async function getAiringStatus(jumlahPost = 40) {
    // WP REST API diblokir Cloudflare (403) untuk host bot — sumber diganti ke
    // 2 widget homepage (Jina, terbukti lolos). Detail per anime tetap diambil
    // lewat fetchHtml (translate.goog), tapi GAGAL detail TIDAK LAGI
    // menghilangkan anime dari daftar: data kartu (judul, episode, status,
    // link) tetap tampil, hanya total/sisa episode yang jadi tak diketahui.
    const { sectionTayang, sectionUpdate } = await fetchHomepageSections();
    const map = new Map();
    for (const a of [...parseAnimeCards(sectionTayang), ...parseAnimeCards(sectionUpdate)]) {
        if (!a.slug) continue;
        const epNum = parseInt((a.episodeLabel || '').match(/\d+/)?.[0] || '0', 10) || 0;
        if (!map.has(a.slug) || epNum > map.get(a.slug).epNum) {
            map.set(a.slug, { slug: a.slug, epNum, judul: a.judul, url: a.url, statusLabel: a.statusLabel });
        }
    }

    const slugList = [...map.values()].slice(0, jumlahPost);

    const BATCH = 6;
    const results = [];
    for (let i = 0; i < slugList.length; i += BATCH) {
        const chunk   = slugList.slice(i, i + BATCH);
        const enriched = await Promise.all(
            chunk.map(async ({ slug, epNum, judul, url, statusLabel }) => {
                const animeUrl = `${BASE_URL}/anime/${slug}/`;
                let detail = null;
                try {
                    const html = await fetchHtml(animeUrl);
                    detail = parseDetailPage(html, animeUrl);
                } catch (_) { /* kartu tetap dipakai */ }
                const totalSeri = detail?.totalSeri || 0;
                const sisaEp = (totalSeri && epNum) ? Math.max(0, totalSeri - epNum) : null;
                return {
                    judul         : detail?.judul || judul || slug,
                    musim         : detail?.musim || '-',
                    status        : detail?.status || statusLabel || '-',
                    epTerbaru     : epNum || detail?.latestEpNum || 0,
                    totalSeri,
                    sisaEp,
                    url           : animeUrl,
                    latestEpUrl   : detail?.latestEpUrl || animeUrl,
                    genre         : detail?.genre || '',
                    batchDownload : detail?.batchDownload || null,
                    postDate      : null,
                };
            })
        );
        results.push(...enriched);
        if (i + BATCH < slugList.length) await new Promise(r => setTimeout(r, 500));
    }

    results.sort((a, b) => {
        if (a.sisaEp === null && b.sisaEp === null) return 0;
        if (a.sisaEp === null) return 1;
        if (b.sisaEp === null) return -1;
        return b.sisaEp - a.sisaEp;
    });

    return results;
}

// ── EXPORT ────────────────────────────────────────────────────────────────────

export { getEnabledGroups, setGroupEnabled, cariEpisodeBaru, buatCaption, ambilUrlGambar, tandaiSudahKirim, tandaiDanLog, getRecentLog, simulasi, getAiringStatus, cariPerubahanSedangTayang, cariPerubahanBaruDiperbarui, buatCaptionTayang, buatCaptionBaruUpdate, previewSedangTayang, previewBaruUpdate, previewUpdateTerbaru, perkayasItemDenganKitsu, buatPesanLengkap, fetchKitsuLanjutan, fetchDetailLengkap };
export { handleAnimasu };
// ── COMMAND HANDLER ───────────────────────────────────────────────────────────

async function handleAnimasu({ hisoka, m, query, tolak, logCommand, sendConfirmWithButtons, fs, path, loadConfig }) {
        if (!m.isOwner) { await tolak(hisoka, m, '❌ Hanya owner yang bisa gunakan perintah ini.'); return; }
        if (!m.isGroup) { await tolak(hisoka, m, '❌ Perintah ini hanya untuk grup.'); return; }

        const cfgPathAM = path.join(process.cwd(), 'config.json');
        const sub = (query || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const pfx = m.prefix || '.';

        const cfgAM = loadConfig();
        if (!cfgAM.animasu)        cfgAM.animasu        = { groups: {} };
        if (!cfgAM.animasu.groups) cfgAM.animasu.groups = {};

        if (!sub || sub === 'help') {
                const aktif = cfgAM.animasu.groups[m.from]?.enabled === true;
                await tolak(hisoka, m,
                        `📺 *ANIMASU SUB INDO*\n\n` +
                        `Status di grup ini: ${aktif ? '✅ *Aktif*' : '❌ *Nonaktif*'}\n\n` +
                        `*Perintah:*\n` +
                        `1. \`${pfx}animasu on\` — _aktifkan_\n` +
                        `2. \`${pfx}animasu off\` — _nonaktifkan_\n` +
                        `3. \`${pfx}animasu test\` — _preview notif ke sini_\n` +
                        `4. \`${pfx}animasu test grup\` — _kirim ke semua grup aktif_\n` +
                        `5. \`${pfx}animasu status\` — _lihat semua grup_\n\n` +
                        `> 💡 Bot memantau *2 widget* di _animasu.love_ secara terpisah & *realtime:*\n` +
                        `• 🔥 *Sedang Tayang* — episode baru rilis\n` +
                        `• 🆕🔄 *Baru Ditambah & Diperbarui* — anime baru masuk atau datanya diupdate`
                );
                return;
        }

        if (sub === 'on') {
                const sebelumnyaAM = cfgAM.animasu.groups[m.from]?.enabled === true;
                cfgAM.animasu.groups[m.from] = { enabled: true, diubahPada: Date.now() };
                fs.writeFileSync(cfgPathAM, JSON.stringify(cfgAM, null, 2));
                await sendConfirmWithButtons(hisoka, m,
                        `📺 *ANIMASU SUB INDO*\n\n` +
                        `Status sebelumnya: ${sebelumnyaAM ? '✅ *ON*' : '~❌ OFF~'}\n` +
                        `Status sekarang: ✅ *ON*\n\n` +
                        (sebelumnyaAM
                                ? `ℹ️ _Fitur ini sebelumnya sudah aktif, tidak ada perubahan._\n`
                                : `✅ *Fitur berhasil diaktifkan!*\n_Bot akan kirim notif otomatis saat episode Sub Indo baru tersedia._\n`) +
                        `\nKetik \`${pfx}animasu off\` untuk menonaktifkan.`
                        [{ text: '➕ Aktifkan Semua Grup', id: '__addallgrp__animasu' }]
                );
                await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                logCommand(m, hisoka, 'animasu-on');
                return;
        }

        if (sub === 'off') {
                const sebelumnyaAM = cfgAM.animasu.groups[m.from]?.enabled === true;
                cfgAM.animasu.groups[m.from] = { enabled: false, diubahPada: Date.now() };
                fs.writeFileSync(cfgPathAM, JSON.stringify(cfgAM, null, 2));
                await tolak(hisoka, m,
                        `📺 *ANIMASU SUB INDO*\n\n` +
                        `Status sebelumnya: ${sebelumnyaAM ? '~✅ ON~' : '❌ *OFF*'}\n` +
                        `Status sekarang: ❌ *OFF*\n\n` +
                        (sebelumnyaAM
                                ? `❌ *Fitur berhasil dinonaktifkan.*\n_Bot tidak akan kirim notif lagi di grup ini._\n`
                                : `ℹ️ _Fitur ini sebelumnya sudah nonaktif, tidak ada perubahan._\n`) +
                        `\nKetik \`${pfx}animasu on\` untuk mengaktifkan kembali.`
                );
                await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                logCommand(m, hisoka, 'animasu-off');
                return;
        }

        if (sub === 'status') {
                // DEFINISI (keputusan Wily 17:56 + 19:05): status = DAFTAR GRUP
                // saja, RAPIH & REALTIME — jumlah gc, on/off, urutan rapih
                // (aktif dulu, lalu nama), plus per grup: jumlah anggota,
                // jumlah admin, dan apakah bot admin di grup itu. Data anggota/
                // admin diambil LIVE dari groupMetadata tiap status dipanggil
                // (bukan dari simpanan); yang tersimpan di config.json hanya
                // { enabled, diubahPada } per grup, ditulis JSON rapih.
                await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
                try {
                        const grupTerdaftar = cfgAM.animasu.groups || {};
                        const jidsGrup = Object.keys(grupTerdaftar);
                        const aktifCount = jidsGrup.filter(x => grupTerdaftar[x]?.enabled === true).length;
                        const botId = String(hisoka.user?.id || '').split(':')[0].split('@')[0];
                        const entri = [];
                        for (const jid of jidsGrup) {
                                const aktif = grupTerdaftar[jid]?.enabled === true;
                                let nama = jid, isJid = true, stats = null;
                                try {
                                        const meta = await hisoka.groupMetadata(jid);
                                        if (meta?.subject) { nama = meta.subject; isJid = false; }
                                        const parts = meta?.participants || [];
                                        const jmlAdmin = parts.filter(p => p.admin != null).length;
                                        const saya = parts.find(p => String(p.id || '').split(':')[0].split('@')[0] === botId);
                                        const botAdmin = !botId ? null : (saya ? (saya.admin != null) : null);
                                        stats = { anggota: parts.length, admin: jmlAdmin, botAdmin };
                                } catch (_) { /* metadata gagal -> nama JID, tanpa stats */ }
                                entri.push({ jid, nama, isJid, aktif, stats });
                        }
                        // Urutan rapih: aktif dulu, lalu nama (JID mentah di
                        // belakang tiap tier).
                        entri.sort((a, b) => (b.aktif - a.aktif) || (a.isJid - b.isJid) || String(a.nama).localeCompare(String(b.nama)));
                        let txt = `📺 *STATUS ANIMASU*\n\n`;
                        if (!entri.length) {
                                txt += `👥 Grup terdaftar: _belum ada_\n`;
                                txt += `> _Ketik_ \`${pfx}animasu on\` _di grup tujuan dulu._\n`;
                        } else {
                                txt += `👥 *${entri.length} grup* · ✅ *${aktifCount} aktif* · ❌ *${entri.length - aktifCount} nonaktif*\n\n`;
                                for (let gi = 0; gi < entri.length; gi++) {
                                        const e = entri[gi];
                                        txt += `• ${e.nama} — ${e.aktif ? '✅ Aktif' : '❌ Nonaktif'}\n`;
                                        if (e.stats) {
                                                const ba = e.stats.botAdmin === true ? '✅' : (e.stats.botAdmin === false ? '❌' : '❓');
                                                txt += `  👥 ${e.stats.anggota} anggota · 👑 ${e.stats.admin} admin · 🤖 Bot admin: ${ba}\n`;
                                        } else {
                                                txt += `  👥 _data grup tidak tersedia_\n`;
                                        }
                                        // Garis simple pemisah antar grup (bukan kotak) — biar rapih,
                                        // tidak di grup terakhir.
                                        if (gi < entri.length - 1) txt += `────────────────────────\n`;
                                }
                        }
                        await tolak(hisoka, m, txt);
                        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                        await tolak(hisoka, m, `❌ *Gagal ambil status.*\n_${err?.message || err}_`);
                }
                return;
        }

        if (sub === 'test grup') {
                await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
                try {
                        const daftarGrup = getEnabledGroups();
                        if (!daftarGrup.length) {
                                await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                                await tolak(hisoka, m, `❌ *Belum ada grup yang mengaktifkan Animasu.*\n_Ketik_ \`${pfx}animasu on\` _di grup tujuan dulu._`);
                                return;
                        }
                        const hasil = await simulasi();
                        let berhasil = 0, gagal = 0;
                        for (const jid of daftarGrup) {
                                try {
                                        if (hasil.urlGambar) {
                                                await hisoka.sendMessage(jid, { image: { url: hasil.urlGambar }, caption: hasil.caption });
                                        } else {
                                                await hisoka.sendMessage(jid, { text: hasil.caption });
                                        }
                                        berhasil++;
                                        await new Promise(r => setTimeout(r, 1500));
                                } catch (e) {
                                        gagal++;
                                        console.error(`[Animasu] Gagal kirim test ke ${jid}:`, e?.message);
                                }
                        }
                        await hisoka.sendMessage(m.from, {
                                text: `✅ *Test Animasu selesai!*\n\n` +
                                      `📤 Terkirim ke: *${berhasil}/${daftarGrup.length} grup*` +
                                      (gagal ? `\n❌ ~Gagal:~ _${gagal} grup tidak terkirim_` : ''),
                        }, { quoted: m });
                        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                        logCommand(m, hisoka, 'animasu-test-grup');
                } catch (err) {
                        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                        await tolak(hisoka, m, `❌ *Gagal fetch Animasu.*\n_${err?.message || err}_`);
                }
                return;
        }

        if (sub === 'test') {
                // SATU preview saja (keputusan Wily 17:52): update terbaru
                // realtime — kartu teratas "Sedang Tayang"; bila kosong, kartu
                // teratas "Baru Ditambah & Diperbarui" (lihat previewUpdateTerbaru).
                await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
                try {
                        const hasil = await previewUpdateTerbaru();
                        if (hasil.urlGambar) {
                                await hisoka.sendMessage(m.from, { image: { url: hasil.urlGambar }, caption: hasil.caption }, { quoted: m });
                        } else {
                                await tolak(hisoka, m, hasil.caption);
                        }
                        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                        logCommand(m, hisoka, 'animasu-test');
                } catch (err) {
                        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                        await tolak(hisoka, m, `❌ *Gagal fetch Animasu.*\n_${err?.message || err}_`);
                }
                return;
        }

        await tolak(hisoka, m, `❌ *Sub-perintah tidak dikenal.*\n_Ketik_ \`${pfx}animasu\` _untuk bantuan._`);
}


/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const command = /^(animasu)$/i;
export const tags = ['anime'];
export const help = ['animasu'];
export default handleAnimasu;
