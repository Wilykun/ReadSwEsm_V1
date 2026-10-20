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
 *  hentaidad.js — Scraper HentaiDad (18+)
 *  Tampilkan Latest Releases / Search dari hentaidad.com,
 *  user reply nomor → bot kirim konfirmasi (thumbnail + info + 2 tombol)
 *  → user tap Lanjutkan → bot kirim semua gambar 1 album
 *
 *  Alur:
 *  .hentaidad [q] → [loading] → [edit: list] → reply nomor
 *                → [edit: mengambil data] → kirim 1 pesan konfirmasi
 *                  (thumbnail + jumlah gambar akurat + tombol Lanjutkan/Tidak)
 *                → tap Lanjutkan → [edit: download progress] → album
 *                                → [edit: kartu hasil]
 *                → tap Tidak    → [edit: dibatalkan]
 * ───────────────────────────────
 */
'use strict';

import axios from 'axios';
import * as cheerio from 'cheerio';
import sharp from 'sharp';
import PDFDocument from 'pdfkit';
import { translate } from 'google-translate-api-x';

const BASE    = 'https://hentaidad.com';
const HEADERS = {
    'User-Agent'      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept'          : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language' : 'en-US,en;q=0.9',
    'Referer'         : 'https://hentaidad.com/',
};

// ── Helpers fetch & scrape ──────────────────────────────────────────────────────

async function fetchHtml(url) {
    const res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
    return res.data;
}

// ── TRANSLATE KE BAHASA INDONESIA (google-translate-api-x, gratis, no API key) ──

async function translateToIndo(text) {
    if (!text) return '';
    try {
        const res = await translate(text, { to: 'id', from: 'en' });
        return res.text || text;
    } catch (e) {
        console.warn('[Hentaidad] Translate gagal, pakai teks asli:', e?.message);
        return text; // fallback ke bahasa Inggris
    }
}

function cleanTitle(raw) {
    return raw
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/\s+Hentai\s*$/i, '')
        .trim();
}

/** Scrape kartu dari halaman listing — ambil juga thumbnail src */
async function _scrapeCards(url, fallbackLabel) {
    const html  = await fetchHtml(url);
    const $     = cheerio.load(html);
    const items = [];
    
    // Coba selector berbeda untuk tangkap hasil search
    let selector = 'article.post-card, a.archive-card-link';
    let elements = $(selector);
    
    // Filter dan ambil elemen gambar yang punya alt text
    elements.each((i, el) => {
        const $el    = $(el);
        const href   = $el.attr('href') || '';
        const imgEl  = $el.find('img').first();
        const alt    = $el.find('h2.archive-card-title').text() || imgEl.attr('alt') || $el.text() || '';
        const thumb  = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-lazy-src') || '';
        
        // Ambil metadata
        const $meta  = $el.find('.archive-card-meta');
        const date   = $meta.find('time').text().trim() || '';
        const views  = $meta.find('span').text().trim() || '';
        
        if (!href || !alt.trim()) return;
        
        const title = cleanTitle(alt) || `${fallbackLabel} ${items.length + 1}`;
        items.push({
            no    : items.length + 1,
            title,
            href  : href.startsWith('http') ? href : BASE + href,
            thumb : thumb.startsWith('http') ? thumb : (thumb ? BASE + thumb : ''),
            date,
            views,
        });
    });
    
    return items;
}

async function scrapeLatestReleases() {
    return _scrapeCards(BASE + '/', 'Gallery');
}

async function scrapeSearch(query) {
    return _scrapeCards(`${BASE}/search?q=${encodeURIComponent(query)}`, 'Result');
}

/** Scrape halaman galeri — return title + daftar URL gambar + metadata lengkap */
async function scrapeGallery(href) {
    const url  = href.startsWith('http') ? href : BASE + href;
    const html = await fetchHtml(url);
    const $    = cheerio.load(html);

    const title  = $('h1').first().text().trim() || 'Untitled Gallery';
    const $meta  = $('.post-meta');
    const date   = $meta.find('time').text().trim() || '';
    const spans  = $meta.find('span').map((_, el) => $(el).text().trim()).get();
    const views  = spans[0] || '';
    const countStr = spans[1] || '';
    const rating   = spans[2] || '18+';

    // Ambil description + auto translate Indonesia
    const rawDesc = $('.post-description, .post-content > p').first().text().trim() || '';
    const cleanDesc = rawDesc.replace(/^Description/i, '').slice(0, 300).replace(/\n+/g, ' ').trim();
    const description = cleanDesc ? await translateToIndo(cleanDesc) : '';

    // Ambil tags + translate ke Indonesia
    const tags = [];
    $('.post-tags a, .tag').each((_, el) => {
        const tag = $(el).text().trim();
        if (tag && tag.length < 50 && !tag.match(/^(Gallery|Uncensored|Ai Generated|Hentai|Malth)$/i)) {
            tags.push(tag);
        }
    });
    const tagsEn = tags.slice(0, 5);
    const tagsId = tagsEn.length > 0 ? await translateToIndo(tagsEn.join(', ')) : '';
    const relatedTags = tagsId.split(',').map(t => t.trim()).filter(Boolean);

    const images = [];
    const seen   = new Set();
    const addSrc = (src) => {
        if (!src) return;
        if (src.includes('-thumb.webp') || src.includes('/thumbnails/')) return;
        if (!seen.has(src)) {
            seen.add(src);
            images.push(src.startsWith('http') ? src : BASE + src);
        }
    };

    $('.gallery-item img, .post-gallery img').each((_, el) => {
        addSrc($(el).attr('src') || $(el).attr('data-src') || '');
    });
    if (!images.length) {
        $('img[src*="/content/images/"], img[data-src*="/content/images/"], img[src*="/uploads/galleries/"]').each((_, el) => {
            addSrc($(el).attr('src') || $(el).attr('data-src') || '');
        });
    }
    return { title, images, date, views, countStr, rating, description, relatedTags };
}

async function downloadImage(url, referer) {
    const res = await axios.get(url, {
        responseType : 'arraybuffer',
        timeout      : 25000,
        headers      : { ...HEADERS, Referer: referer || BASE + '/', Accept: 'image/webp,image/avif,image/*,*/*' },
    });
    const raw = Buffer.from(res.data);
    try { return await sharp(raw).jpeg({ quality: 88 }).toBuffer(); } catch { return raw; }
}

/** Download thumbnail untuk dikirim sebagai gambar konfirmasi */
async function downloadThumb(url) {
    if (!url) return null;
    /* Retry 2x kalau gagal */
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const res = await axios.get(url, {
                responseType : 'arraybuffer',
                timeout      : 15000,
                headers      : { ...HEADERS, Accept: 'image/webp,image/avif,image/*,*/*' },
            });
            const raw = Buffer.from(res.data);
            // Resize jadi thumbnail 480px wide agar ringan
            try {
                return await sharp(raw).resize({ width: 480, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
            } catch { return raw; }
        } catch (e) {
            console.error(`[HENTAIDAD] downloadThumb attempt ${attempt} gagal:`, e?.message?.slice(0, 80));
            if (attempt === 2) return null;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    return null;
}

// ── Format helpers ──────────────────────────────────────────────────────────────

function fmtBytes(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return Math.round(bytes / 1024) + ' KB';
}

function fmtDur(ms) {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s} detik`;
    const m = Math.floor(s / 60), r = s % 60;
    return r > 0 ? `${m} mnt ${r} dtk` : `${m} menit`;
}

function fullTitle(raw, fallback = 'Untitled Gallery') {
    const title = String(raw ?? '').replace(/\s+/g, ' ').trim();
    return title || fallback;
}

// ── Teks-teks UI ────────────────────────────────────────────────────────────────

function txtLoading(isSearch, query) {
    return isSearch
        ? `🔞 *HENTAIDAD*\n\n🔎 *Mencari:* _${query}_\n> _Harap tunggu sebentar..._`
        : `🔞 *HENTAIDAD*\n\n🔄 _Mengambil latest releases..._\n> _Harap tunggu sebentar..._`;
}

function txtList(items, query) {
    const isSearch   = query && query.length > 0;
    const qShort     = query || '';
    const headerLine = isSearch
        ? `🔎 *Hasil untuk:* _"${qShort}"_\n_${items.length} galeri ditemukan_`
        : `📋 *Latest Releases* — _${items.length} galeri_`;

    let text = `🔞 *HENTAIDAD*\n\n${headerLine}\n\n`;
    for (const it of items) {
        const judul = fullTitle(it.title, `Gallery ${it.no}`);
        const date  = it.date ? `📅 ${it.date}` : '';
        const views = it.views ? `👁️ ${it.views}` : '';
        const meta  = date || views ? ` (${[date, views].filter(Boolean).join(' • ')})` : '';
        text += `${it.no}. _${judul}_${meta}\n`;
    }
    text += `\n> 💬 *Reply* pesan ini dengan *nomor* pilihan\n`;
    text += isSearch
        ? `> _Cari lagi:_ \`.hentaidad [judul]\``
        : `> _Cari judul:_ \`.hentaidad [judul]\``;
    return text;
}

function txtNotFound(query) {
    return (
        `🔞 *HENTAIDAD*\n\n` +
        `🚫 *Tidak Ditemukan*\n` +
        `_Tidak ada galeri yang cocok untuk:_\n` +
        `> _"${query}"_\n\n` +
        `💡 *Saran pencarian:*\n` +
        `- Coba kata kunci _lebih pendek_\n` +
        `- Gunakan _nama karakter_ / _judul asli_\n` +
        `- Coba _bahasa Inggris_ (misal: \`re zero\`)\n\n` +
        `> Ketik \`.hentaidad\` untuk melihat _latest_`
    );
}

function txtDipilih(chosen, headerPilih) {
    const judul = fullTitle(chosen.title, `Gallery ${chosen.no}`);
    return (
        `🔞 *HENTAIDAD*\n\n` +
        `${headerPilih}\n\n` +
        `✅ *Dipilih #${chosen.no}:*\n` +
        `_${judul}_\n\n` +
        `⏳ _Mengambil data galeri..._\n` +
        `> _Harap tunggu sebentar_`
    );
}

/** Teks caption untuk pesan konfirmasi (thumbnail + reply 1/2/3) */
function txtConfirmCaption(chosen, galleryData, headerPilih) {
    const judul = fullTitle(galleryData.title, fullTitle(chosen.title, `Gallery ${chosen.no}`));
    const date  = galleryData.date   ? `- 📅 *Tanggal:* \`${galleryData.date}\`\n` : '';
    const views = galleryData.views  ? `- 👁️ *Views:* \`${galleryData.views}\`\n`  : '';
    const count = galleryData.countStr ? `- 📸 *Jumlah:* \`${galleryData.countStr}\`\n` : `- 📸 *Jumlah:* \`${galleryData.images.length}\`\n`;
    const rate  = galleryData.rating ? `- 🔞 *Rating:* \`${galleryData.rating}\`\n` : '';
    
    let descLine = '';
    if (galleryData.description && galleryData.description.length > 20) {
        descLine = `\n📝 *Description:*\n_${galleryData.description}_\n`;
    }
    
    let tagsLine = '';
    if (galleryData.relatedTags && galleryData.relatedTags.length > 0) {
        tagsLine = `\n🏷️ *Related Tags:*\n_${galleryData.relatedTags.join(', ')}_\n`;
    }

    return (
        `🔞 *HENTAIDAD — Konfirmasi*\n\n` +
        `${headerPilih}\n\n` +
        `📌 *${judul}*\n` +
        date + views + count + rate +
        descLine + tagsLine +
        `\n❓ _Pilih format pengiriman:_\n\n` +
        `> *Reply pesan ini:*\n` +
        `> *1* — 🖼️ Gambar _(album foto)_\n` +
        `> *2* — 📄 PDF _(1 file PDF)_\n` +
        `> *3* — ❌ Tidak jadi`
    );
}

function deliveryModeLabel(mode) {
    return mode === 'pdf'
        ? '`2` — 📄 PDF _(1 file PDF)_'
        : '`1` — 🖼️ Gambar _(album foto)_';
}

function txtModeHistory(previousModes, currentMode) {
    if (!Array.isArray(previousModes) || previousModes.length === 0) return '';
    const previous = previousModes.map(deliveryModeLabel).join(', ');
    return (
        `🔁 *Pilihan format diperbarui*\n` +
        `> ↩️ *Sebelumnya kamu pilih:* ${previous}\n` +
        `> ➡️ *Sekarang kamu pilih:* ${deliveryModeLabel(currentMode)}\n\n`
    );
}

function txtModeSwitchNotice(previousModes, currentMode) {
    return (
        `🔞 *HENTAIDAD*\n\n` +
        txtModeHistory(previousModes, currentMode) +
        `⏳ _Menyiapkan pengiriman ${currentMode === 'pdf' ? 'PDF' : 'album gambar'}..._`
    );
}

function txtDownload(
    chosen, headerPilih, doneNow, totalImg, batchIdx, totalBatch,
    mode = 'image', previousModes = []
) {
    const judul = fullTitle(chosen.title, `Gallery ${chosen.no}`);
    const modeLabel = mode === 'pdf' ? '📄 PDF' : '🖼️ Gambar / album';
    const batchInfo = totalBatch > 1
        ? `\n> _Batch_ \`${batchIdx}/${totalBatch}\` _— sabar ya_`
        : `\n> _Sabar ya, lagi diproses_`;
    return (
        `🔞 *HENTAIDAD*\n\n` +
        `${headerPilih}\n\n` +
        `✅ *Dipilih #${chosen.no}:*\n` +
        `_${judul}_\n\n` +
        txtModeHistory(previousModes, mode) +
        `🎛️ *Format:* ${modeLabel}\n` +
        `⬇️ *Mendownload* \`${doneNow}/${totalImg} gambar\`...` +
        batchInfo
    );
}

function txtSending(chosen, headerPilih, total, previousModes = []) {
    const judul = fullTitle(chosen.title, `Gallery ${chosen.no}`);
    return (
        `🔞 *HENTAIDAD*\n\n` +
        `${headerPilih}\n\n` +
        `✅ *Dipilih #${chosen.no}:*\n` +
        `_${judul}_\n\n` +
        txtModeHistory(previousModes, 'image') +
        `📤 *Mengirim* \`${total} gambar\` _dalam 1 album..._\n` +
        `> _Sebentar lagi_`
    );
}

function txtSendingPdf(chosen, headerPilih, total, previousModes = []) {
    const judul = fullTitle(chosen.title, `Gallery ${chosen.no}`);
    return (
        `🔞 *HENTAIDAD*\n\n` +
        `${headerPilih}\n\n` +
        `✅ *Dipilih #${chosen.no}:*\n` +
        `_${judul}_\n\n` +
        txtModeHistory(previousModes, 'pdf') +
        `📄 *Membuat PDF* dari \`${total} gambar\`...\n` +
        `> _Sebentar lagi_`
    );
}

function txtFinalCard({ title, berhasil, total, totalBytes, elapsedMs, failed, isSearch, query, mode }) {
    const judul     = fullTitle(title);
    const qShort    = query || '';
    const hintLine  = isSearch
        ? `\n> 🔎 _Cari lagi:_ \`.hentaidad ${qShort}\`\n` +
          `> 📋 _Atau_ \`.hentaidad\` _untuk latest_`
        : `\n> 🔎 _Cari judul:_ \`.hentaidad [judul]\`\n` +
          `> 📋 _Atau_ \`.hentaidad\` _untuk latest_`;
    const isPdf     = mode === 'pdf';
    const label     = isPdf ? 'Halaman' : 'Gambar';
    const satuan    = isPdf ? 'hal' : 'foto';

    /* Baris berhasil/gagal selalu tampil biar jelas */
    const hasilLine = failed > 0
        ? `- ✅ *Berhasil:* \`${berhasil} ${satuan}\`\n- ❌ *Gagal:* \`${failed} ${satuan}\`\n- 📊 *Total:* \`${total} ${satuan}\`\n`
        : `- ✅ *Berhasil:* \`${berhasil} ${satuan}\`\n`;

    return (
        `🔞 *HENTAIDAD*\n\n` +
        `📌 *${judul}*\n\n` +
        hasilLine +
        `- 📦 *Ukuran:* \`${fmtBytes(totalBytes)}\`\n` +
        `- ⏱️ *Waktu:* \`${fmtDur(elapsedMs)}\`\n` +
        (isPdf ? `\n✅ *Selesai — PDF terkirim*` : `\n✅ *Selesai — album terkirim*`) +
        hintLine
    );
}

function txtError(msg) {
    return `🔞 *HENTAIDAD*\n\n❌ *Gagal memproses*\n💬 _${msg || 'Coba lagi nanti.'}_`;
}

function txtBatalkan(chosen, headerPilih) {
    const judul = fullTitle(chosen.title, `Gallery ${chosen.no}`);
    return (
        `🔞 *HENTAIDAD*\n\n` +
        `${headerPilih}\n\n` +
        `🚫 *Dibatalkan*\n` +
        `_#${chosen.no}: ${judul}_\n\n` +
        `> _Ketik_ \`.hentaidad\` _untuk memulai lagi_`
    );
}

function txtAlreadySent(chosen, headerPilih, mode) {
    const judul = fullTitle(chosen.title, `Gallery ${chosen.no}`);
    const modeLabel = mode === 'pdf' ? '📄 PDF' : '🖼️ Gambar / album';
    return (
        `🔞 *HENTAIDAD*\n\n` +
        `${headerPilih}\n\n` +
        `📌 *${judul}*\n` +
        `☑️ *${modeLabel} sudah terkirim sebelumnya*\n\n` +
        `> _Reply pesan konfirmasi dengan format lain jika diperlukan_`
    );
}

function parseDeliveryMode(rawText) {
    const raw = String(rawText || '').trim().toLowerCase();
    // Jangan menerima alias satu huruf. Pesan bebas seperti "p" atau "g"
    // terlalu mudah terkirim tanpa sengaja dan bukan konfirmasi eksplisit.
    if (['1', 'gambar', 'image', 'images', 'album'].includes(raw)) return 'image';
    if (['2', 'pdf', 'dokumen', 'document'].includes(raw)) return 'pdf';
    if (['3', 'tidak', 'no', 'batal', 'cancel', 'gak', 'ga'].includes(raw)) return 'cancel';
    if (['ya', 'yes', 'lanjut', 'lanjutkan', 'oke', 'ok'].includes(raw)) return 'image';
    return null;
}

// ── Internal: edit pesan by key, silent fail ────────────────────────────────────
async function _editKey(hisoka, m, sentKey, text) {
    try {
        if (sentKey) {
            await hisoka.sendMessage(m.from, { text, edit: sentKey });
            return true;
        } else {
            await hisoka.sendMessage(m.from, { text }, { quoted: m });
            return true;
        }
    } catch (editErr) {
        // Beberapa client WhatsApp tidak langsung menampilkan edit message.
        // Kirim pesan baru agar hasil tetap terlihat di semua client.
        try {
            await hisoka.sendMessage(m.from, { text }, { quoted: m });
            return true;
        } catch (fallbackErr) {
            console.error('[HENTAIDAD] Edit dan fallback kirim gagal:', fallbackErr?.message || editErr?.message);
        }
    }
    return false;
}

async function _sendFinalCard(hisoka, m, sentKey, text) {
    if (sentKey) {
        const edited = await _editKey(hisoka, m, sentKey, text);
        if (edited) return true;
    }

    try {
        await hisoka.sendMessage(m.from, { text }, { quoted: m });
        return true;
    } catch (err) {
        console.error('[HENTAIDAD] Gagal kirim kartu hasil, coba edit:', err?.message);
        return await _editKey(hisoka, m, sentKey, text);
    }
}

// ── Kirim pesan konfirmasi: thumbnail + teks (reply 1 = ya, 2 = tidak) ──────────
async function _sendConfirmMsg(hisoka, m, captionText, thumbBuf) {
    // Kirim sebagai gambar + caption jika ada thumbnail, fallback plain text
    try {
        if (thumbBuf) {
            const sent = await hisoka.sendMessage(m.from, {
                image  : thumbBuf,
                caption: captionText,
            }, { quoted: m });
            return { sent, mode: 'image' };
        }
    } catch (e) {
        console.error('[HENTAIDAD] Gagal kirim thumbnail, fallback text:', e?.message);
    }

    // Fallback: plain text
    try {
        const sent = await hisoka.sendMessage(m.from, { text: captionText }, { quoted: m });
        return { sent, mode: 'text' };
    } catch (e) {
        console.error('[HENTAIDAD] _sendConfirmMsg gagal total:', e?.message);
    }

    return { sent: null, mode: 'failed' };
}

// ── Generate PDF dari array Buffer gambar ────────────────────────────────────────
async function _generatePdf(imageBuffers, title) {
    // Konversi semua gambar ke JPEG dulu agar PDFKit bisa embed
    const jpegBufs = await Promise.all(imageBuffers.map(async (buf) => {
        try { return await sharp(buf).jpeg({ quality: 88 }).toBuffer(); }
        catch { return buf; }
    }));

    return new Promise((resolve, reject) => {
        const doc    = new PDFDocument({ autoFirstPage: false, margin: 0, compress: true });
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end',  () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        jpegBufs.forEach((jpegBuf) => {
            try {
                // Baca dimensi gambar pakai sharp untuk ukuran page yang tepat
                doc.addPage({ size: 'A4', margin: 0 });
                const pw = 595.28, ph = 841.89;
                doc.image(jpegBuf, 0, 0, { width: pw, height: ph, cover: [pw, ph] });
            } catch (e) {
                doc.addPage({ size: 'A4', margin: 0 });
                doc.fontSize(12).fillColor('#333').text('[Gagal memuat gambar]', 10, 10);
            }
        });

        doc.end();
    });
}

// ── Download + kirim album atau PDF (reusable dari confirm handler) ─────────────
async function _doDownloadAndSend({
    hisoka, m,
    chosen, galleryData, headerPilih,
    sentKey, isSearch, query,
    logError,
    mode, // 'image' | 'pdf'
    previousModes = [],
    resultKey = null,
}) {
    const editMain = (text) => _editKey(hisoka, m, sentKey, text);
    const { title, images } = galleryData;
    const deliveryMode = mode === 'pdf' ? 'pdf' : 'image';
    const isPdf = deliveryMode === 'pdf';

    const totalImg   = images.length;
    const CONCUR     = 8;
    const totalBatch = Math.ceil(totalImg / CONCUR);
    const startTime  = Date.now();
    const allItems   = [];
    let   failed     = 0;

    await editMain(txtDownload(
        chosen, headerPilih, 0, totalImg, 0, totalBatch, deliveryMode, previousModes
    ));

    for (let i = 0; i < images.length; i += CONCUR) {
        const batchIdx = Math.floor(i / CONCUR) + 1;
        const chunk    = images.slice(i, i + CONCUR);
        const results  = await Promise.allSettled(
            chunk.map(url => downloadImage(url, chosen.href))
        );
        for (const r of results) {
            if (r.status === 'fulfilled') allItems.push(r.value);
            else { failed++; console.error('[HENTAIDAD] Gagal download:', r.reason?.message); }
        }
        const doneNow = Math.min(i + CONCUR, totalImg);
        await editMain(txtDownload(
            chosen, headerPilih, doneNow, totalImg, batchIdx, totalBatch, deliveryMode, previousModes
        ));
    }

    if (!allItems.length) {
        await editMain(
            `🔞 *HENTAIDAD*\n\n${headerPilih}\n\n` +
            `✅ *Dipilih #${chosen.no}:* _${fullTitle(chosen.title, `Gallery ${chosen.no}`)}_\n\n` +
            `❌ *Semua gambar gagal didownload*\n` +
            `> _Coba lagi nanti_`
        );
        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
        return false;
    }

    const total      = allItems.length;
    const totalBytes = allItems.reduce((acc, buf) => acc + buf.length, 0);

    if (isPdf) {
        // ── MODE PDF ────────────────────────────────────────────────────────────
        await editMain(txtSendingPdf(chosen, headerPilih, total, previousModes));

        const pdfBuf = await _generatePdf(allItems, title);
        const pdfBytes = pdfBuf.length;

        // Sanitasi nama file
        const safeName = title
            .replace(/[^\w\s,!'\-]/g, '')
            .replace(/\s+/g, '_')
            .trim()
            .slice(0, 60) || 'hentaidad_gallery';

        await hisoka.sendMessage(m.from, {
            document : pdfBuf,
            mimetype : 'application/pdf',
            fileName : `${safeName}.pdf`,
            caption  : `📄 *${fullTitle(title)}*\n📸 ${total} halaman`,
        }, { quoted: m });

        const elapsedMs = Date.now() - startTime;
        await _sendFinalCard(hisoka, m, resultKey || sentKey, txtFinalCard({
            title, berhasil: total, total: totalImg,
            totalBytes: pdfBytes, elapsedMs, failed,
            isSearch, query, mode: 'pdf',
        }));
        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });

    } else {
        // ── MODE GAMBAR (album) ─────────────────────────────────────────────────
        await editMain(txtSending(chosen, headerPilih, total, previousModes));

        try {
            const parentMsg = await hisoka.sendMessage(
                m.from,
                { album: { expectedImageCount: total, expectedVideoCount: 0 } },
                { quoted: m }
            );
            await Promise.allSettled(
                allItems.map(buf =>
                    hisoka.sendMessage(m.from, { image: buf, albumParentKey: parentMsg.key })
                )
            );
        } catch (albumErr) {
            console.error('[HENTAIDAD] Album API error:', albumErr?.message);
            for (let i = 0; i < allItems.length; i++) {
                try {
                    await hisoka.sendMessage(m.from, { image: allItems[i] },
                        { quoted: i === 0 ? m : undefined });
                } catch (_) {}
            }
        }

        const elapsedMs = Date.now() - startTime;
        await _sendFinalCard(hisoka, m, resultKey || sentKey, txtFinalCard({
            title, berhasil: total, total: totalImg,
            totalBytes, elapsedMs, failed,
            isSearch, query, mode: 'image',
        }));
        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
    }

    return true;
}

// ── COMMAND HANDLER UTAMA ──────────────────────────────────────────────────────

async function handleHentaidad({ hisoka, m, query, tolak, logCommand, logError, pendingHentaidadChoices }) {
    try {
        logCommand(m, hisoka, m.command || 'hentaidad');

        const q = String(query || '').trim();
        const isSearch = q.length > 0;

        await hisoka.sendMessage(m.from, { react: { text: '🔍', key: m.key } });

        let sentMsg = null;
        try {
            sentMsg = await hisoka.sendMessage(m.from, { text: txtLoading(isSearch, query) }, { quoted: m });
        } catch (_) {}

        const items = isSearch
            ? await scrapeSearch(query)
            : await scrapeLatestReleases();

        const editMain = async (text) => {
            try {
                if (sentMsg?.key) {
                    await hisoka.sendMessage(m.from, { text, edit: sentMsg.key });
                } else {
                    sentMsg = await hisoka.sendMessage(m.from, { text }, { quoted: m });
                }
            } catch (_) {}
        };

        if (!items.length) {
            if (isSearch) {
                await editMain(txtNotFound(query));
            } else {
                await editMain(`🔞 *HENTAIDAD*\n\n❌ _Gagal mengambil data. Coba lagi nanti._`);
            }
            await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
            return;
        }

        await editMain(txtList(items, isSearch ? query : null));

        const TTL     = 3 * 60 * 1000;
        const timeout = setTimeout(() => pendingHentaidadChoices.delete(m.sender), TTL);

        pendingHentaidadChoices.set(m.sender, {
            results   : items,
            botMsgId  : sentMsg?.key?.id || null,
            sentKey   : sentMsg?.key     || null,
            isSearch,
            query     : isSearch ? query : null,
            expiresAt : Date.now() + TTL,
            loading   : false,
            timeout,
        });

        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });

    } catch (err) {
        console.error('[HENTAIDAD] Error:', err?.message);
        if (typeof logError === 'function')
            logError(err instanceof Error ? err : new Error(String(err?.message || err)), 'hentaidad');
        try { await tolak(hisoka, m, txtError(err?.message)); } catch (_) {}
    }
}

// ── CHOICE HANDLER — user reply nomor → tampilkan konfirmasi ───────────────────

async function handleHentaidadChoice({
    hisoka, m,
    pendingHentaidadChoices,
    pendingHentaidadConfirm,
    getQuotedStanzaId,
    tolak, logCommand, logError,
}) {
    if (!pendingHentaidadChoices.has(m.sender)) return false;

    const pending   = pendingHentaidadChoices.get(m.sender);
    const rawChoice = String(m.text || '').trim();
    const isReply   = m.isQuoted && pending.botMsgId && getQuotedStanzaId(m) === pending.botMsgId;
    const isNumber  = /^\d+$/.test(rawChoice);

    if (!isReply || !isNumber) return false;

    // ── Expired ───────────────────────────────────────────────────────────────
    if (pending.expiresAt <= Date.now()) {
        pendingHentaidadChoices.delete(m.sender);
        await _editKey(hisoka, m, pending.sentKey,
            `🔞 *HENTAIDAD*\n\n⏳ *Menu sudah kedaluwarsa*\n> _Ketik_ \`.hentaidad\` _lagi untuk mulai_`
        );
        return true;
    }

    // ── Sedang loading ────────────────────────────────────────────────────────
    if (pending.loading) {
        try { await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } }); } catch (_) {}
        return true;
    }

    const idx = parseInt(rawChoice) - 1;
    if (idx < 0 || idx >= pending.results.length) {
        await _editKey(hisoka, m, pending.sentKey,
            txtList(pending.results, pending.isSearch ? pending.query : null) +
            `\n\n❌ _Nomor tidak valid. Pilih angka_ *1*–*${pending.results.length}*`
        );
        return true;
    }

    // ── Kunci loading ─────────────────────────────────────────────────────────
    pending.loading = true;
    if (pending.timeout) clearTimeout(pending.timeout);
    pendingHentaidadChoices.delete(m.sender);

    const chosen      = pending.results[idx];
    const headerPilih = pending.isSearch
        ? `🔎 *Hasil:* _"${pending.query || ''}"_`
        : `📋 *Latest Releases*`;

    const editMain = (text) => _editKey(hisoka, m, pending.sentKey, text);

    try {
        await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

        // ── Edit list → "mengambil data galeri" ──────────────────────────────
        await editMain(txtDipilih(chosen, headerPilih));

        // ── Scrape galeri untuk jumlah gambar yang AKURAT + download thumb ──
        const [galleryData, thumbBuf] = await Promise.allSettled([
            scrapeGallery(chosen.href),
            downloadThumb(chosen.thumb),
        ]).then(results => [
            results[0].status === 'fulfilled' ? results[0].value : { title: chosen.title, images: [] },
            results[1].status === 'fulfilled' ? results[1].value : null,
        ]);

        const imageCount  = galleryData.images.length;
        const galleryTitle = galleryData.title || chosen.title;

        if (imageCount === 0) {
            await editMain(
                `🔞 *HENTAIDAD*\n\n${headerPilih}\n\n` +
                `✅ *Dipilih #${chosen.no}:* _${fullTitle(chosen.title, `Gallery ${chosen.no}`)}_\n\n` +
                `❌ *Tidak ada gambar ditemukan*\n` +
                `> _Galeri ini mungkin kosong atau belum tersedia_`
            );
            await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
            return true;
        }

        // ── Edit list → "menunggu konfirmasi" ─────────────────────────────────
        await editMain(
            `🔞 *HENTAIDAD*\n\n${headerPilih}\n\n` +
            `✅ *Dipilih #${chosen.no}:*\n` +
            `_${fullTitle(galleryTitle, fullTitle(chosen.title, `Gallery ${chosen.no}`))}_\n\n` +
            `❓ _Menunggu konfirmasi..._`
        );

        // ── Kirim pesan konfirmasi: thumbnail + info + 2 tombol ───────────────
        const captionText = txtConfirmCaption(chosen, galleryData, headerPilih);
        const { sent: confirmSent } = await _sendConfirmMsg(hisoka, m, captionText, thumbBuf);

        // ── Simpan ke pendingHentaidadConfirm ─────────────────────────────────
        const CONFIRM_TTL     = 5 * 60 * 1000; // 5 menit untuk konfirmasi
        const confirmTimeout  = setTimeout(() => {
            if (pendingHentaidadConfirm.has(m.sender)) {
                pendingHentaidadConfirm.delete(m.sender);
                editMain(
                    `🔞 *HENTAIDAD*\n\n${headerPilih}\n\n` +
                    `⏳ *Konfirmasi kedaluwarsa*\n` +
                    `> _Ketik_ \`.hentaidad\` _lagi untuk mulai_`
                ).catch(() => {});
            }
        }, CONFIRM_TTL);

        pendingHentaidadConfirm.set(m.sender, {
            chosen,
            galleryData,
            headerPilih,
            sentKey       : pending.sentKey,       // key pesan list (untuk edit progress)
            confirmMsgId  : confirmSent?.key?.id || null,
            isSearch      : pending.isSearch,
            query         : pending.query,
            expiresAt     : Date.now() + CONFIRM_TTL,
            loading       : false,
            timeout       : confirmTimeout,
        });

        await hisoka.sendMessage(m.from, { react: { text: '📋', key: m.key } });

    } catch (err) {
        console.error('[HENTAIDAD] Choice error:', err?.message);
        if (typeof logError === 'function')
            logError(err instanceof Error ? err : new Error(String(err?.message || err)), 'hentaidad-choice');
        await editMain(txtError(err?.message));
        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
    }

    return true;
}

// ── CONFIRM HANDLER — user tap Lanjutkan / Tidak ────────────────────────────────

/**
 * Panggil di message handler sebelum handleHentaidadChoice.
 * Deteksi: m.text adalah salah satu ID konfirmasi atau teks "lanjutkan"/"tidak"
 * DAN m.sender ada di pendingHentaidadConfirm.
 *
 * Nilai yang diterima dari:
 *   - old buttons API : m.text = 'hentaidad_yes' / 'hentaidad_no'
 *   - nativeFlow list : m.text = 'hentaidad_yes' / 'hentaidad_no'
 *   - fallback text   : m.text = 'lanjutkan' / 'tidak' / 'ya' / 'batal'
 */
async function handleHentaidadConfirm({
    hisoka, m,
    pendingHentaidadConfirm,
    getQuotedStanzaId,
    logError,
}) {
    if (!pendingHentaidadConfirm.has(m.sender)) return false;

    const raw  = String(m.text || '').trim().toLowerCase();

    // Nilai konfirmasi yang dikenali:
    // 1 = gambar (album), 2 = PDF, 3 = tidak jadi.
    const mode = parseDeliveryMode(raw);
    const isNo = mode === 'cancel';

    if (!mode) return false;

    const confirm = pendingHentaidadConfirm.get(m.sender);
    if (!confirm.sentModes) confirm.sentModes = new Set();

    // Jika ada confirmMsgId, pastikan user reply ke pesan konfirmasi yang benar
    if (confirm?.confirmMsgId && m.isQuoted) {
        const quotedId = typeof getQuotedStanzaId === 'function' ? getQuotedStanzaId(m) : null;
        if (quotedId && quotedId !== confirm.confirmMsgId) return false;
    }

    // ── Expired ───────────────────────────────────────────────────────────────
    if (confirm.expiresAt <= Date.now()) {
        pendingHentaidadConfirm.delete(m.sender);
        await _editKey(hisoka, m, confirm.sentKey,
            `🔞 *HENTAIDAD*\n\n⏳ *Konfirmasi kedaluwarsa*\n> _Ketik_ \`.hentaidad\` _lagi untuk mulai_`
        );
        return true;
    }

    // ── Sedang diproses ───────────────────────────────────────────────────────
    if (confirm.loading) {
        try { await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } }); } catch (_) {}
        return true;
    }

    const { chosen, galleryData, headerPilih, sentKey, isSearch, query } = confirm;
    const editMain = (text) => _editKey(hisoka, m, sentKey, text);

    // ── TIDAK: batalkan ───────────────────────────────────────────────────────
    if (isNo) {
        if (confirm.timeout) clearTimeout(confirm.timeout);
        pendingHentaidadConfirm.delete(m.sender);
        try { await hisoka.sendMessage(m.from, { react: { text: '🚫', key: m.key } }); } catch (_) {}
        await editMain(txtBatalkan(chosen, headerPilih));
        return true;
    }

    if (confirm.sentModes.has(mode)) {
        try {
            await hisoka.sendMessage(
                m.from,
                { text: txtAlreadySent(chosen, headerPilih, mode) },
                { quoted: m }
            );
            await hisoka.sendMessage(m.from, { react: { text: '☑️', key: m.key } });
        } catch (_) {}
        return true;
    }

    // ── Kunci proses, tetapi pertahankan pending agar format lain bisa dipilih ──
    confirm.loading = true;

    // ── YA (gambar atau PDF): download + kirim ───────────────────────────────
    try {
        const previousModes = [...confirm.sentModes];
        let resultKey = null;
        if (previousModes.length > 0) {
            const switchSent = await hisoka.sendMessage(
                m.from,
                { text: txtModeSwitchNotice(previousModes, mode) },
                { quoted: m }
            );
            resultKey = switchSent?.key || null;
        }

        await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

        const delivered = await _doDownloadAndSend({
            hisoka, m,
            chosen, galleryData, headerPilih,
            sentKey, isSearch, query,
            logError,
            mode,
            previousModes,
            resultKey,
        });
        if (delivered) confirm.sentModes.add(mode);

    } catch (err) {
        console.error('[HENTAIDAD] Confirm error:', err?.message);
        if (typeof logError === 'function')
            logError(err instanceof Error ? err : new Error(String(err?.message || err)), 'hentaidad-confirm');
        await editMain(txtError(err?.message));
        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
    } finally {
        confirm.loading = false;
    }

    return true;
}

export { handleHentaidad, handleHentaidadChoice, handleHentaidadConfirm };
/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const plugins = [
    { command: /^(hentaidad)$/i, tags: ['anime'], help: ['hentaidad'], handler: 'handleHentaidad' },
    { command: /^(hdad)$/i, tags: ['anime'], help: ['hdad'], handler: 'handleHentaidad' },
];
