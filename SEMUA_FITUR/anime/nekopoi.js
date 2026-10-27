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
 *  nekopoi.js — Scraper NekoPoi.care
 *  Scrape konten terbaru dari nekopoi.care per kategori:
 *  Hentai, 2D Animation, 3D Hentai
 *
 *  FIX (27 Okt 2026): direct fetch diblokir Cloudflare dari IP datacenter
 *  (403, halaman blokir CF, REST + HTML) — fetchHtml kini fallback ke
 *  r.jina.ai (terbukti 200 dari host ini), dan parser listing diperluas ke
 *  markup nk-search-item (kategori kini dirender tanpa class entry-title).
 *  Sebelumnya memakai:
 *  - WordPress REST API untuk listing kategori (lebih cepat & stabil)
 *  - Direct HTML fetch untuk detail post
 * ───────────────────────────────
 */
'use strict';

import axios from 'axios';

const BASE = 'https://nekopoi.care';

const HEADERS_HTML = {
    'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept'         : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
    'Referer'        : 'https://nekopoi.care/',
    'Cache-Control'  : 'no-cache',
};

const HEADERS_JSON = {
    'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept'         : 'application/json, */*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
    'Referer'        : 'https://nekopoi.care/',
};

// Cache category ID supaya tidak fetch ulang tiap kali
const _catIdCache = {};

// Kategori yang didukung
const KATEGORI_MAP = {
    'hentai'       : { label: '🎌 Hentai',        slug: 'hentai',        emoji: '🎌' },
    '2d-animation' : { label: '🎥 2D Animation',   slug: '2d-animation',  emoji: '🎥' },
    '3d-hentai'    : { label: '🧊 3D Hentai',      slug: '3d-hentai',     emoji: '🧊' },
};

// ── HELPER ────────────────────────────────────────────────────────────────────

function stripHtml(str) {
    return (str || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
        .replace(/&[a-z]+;/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

// ── FETCH LANGSUNG ────────────────────────────────────────────────────────────

const JINA_BASE = 'https://r.jina.ai/';
const JINA_HEADERS = {
    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
    'X-Return-Format': 'html',
};

function isCfBlockPage(html) {
    return typeof html === 'string' && (
        html.includes('Attention Required! | Cloudflare') ||
        html.includes('id="cf-wrapper"')
    );
}

async function fetchHtmlViaJina(url) {
    const r = await axios.get(JINA_BASE + url, {
        headers: JINA_HEADERS,
        timeout: 45000,
        validateStatus: null,
    });
    const html = typeof r.data === 'string' ? r.data : '';
    if (r.status !== 200 || !html) throw new Error(`Jina gagal: ${r.status}`);
    if (isCfBlockPage(html)) throw new Error('Halaman diblokir Cloudflare (bahkan via Jina)');
    return html;
}

async function fetchHtml(url) {
    try {
        const res = await axios.get(url, {
            headers: HEADERS_HTML,
            timeout: 30000,
        });
        const html = res.data || '';
        if (isCfBlockPage(html)) return fetchHtmlViaJina(url);
        return html;
    } catch (_) {
        // Direct gagal (403 CF / error jaringan) -> Jina. Jina mengembalikan
        // URL asli (tidak ditulis ulang seperti translate.goog), jadi parser
        // dan link download tidak perlu normalisasi.
        return fetchHtmlViaJina(url);
    }
}

async function fetchJson(url) {
    const res = await axios.get(url, {
        headers: HEADERS_JSON,
        timeout: 30000,
    });
    return res.data;
}

// ── DETEKSI KATEGORI ───────────────────────────────────────────────────────────

function deteksiKategori(url) {
    const u = (url || '').toLowerCase();
    if (/\/l2d-|l2d-sub-indo|-l2d-|\/category\/2d-animation/.test(u)) return '2d-animation';
    if (/\/3d-|-3d-|\/category\/3d-hentai/.test(u)) return '3d-hentai';
    return 'hentai';
}

// ── LISTING KATEGORI via WordPress REST API ───────────────────────────────────

async function getCategoryId(slug) {
    if (_catIdCache[slug]) return _catIdCache[slug];
    const data = await fetchJson(`${BASE}/wp-json/wp/v2/categories?slug=${encodeURIComponent(slug)}&_fields=id,slug`);
    if (Array.isArray(data) && data.length) {
        _catIdCache[slug] = data[0].id;
        return data[0].id;
    }
    return null;
}

async function getCategoryPosts(slug) {
    // Coba WP REST API dulu (lebih cepat, JSON bersih)
    try {
        const catId = await getCategoryId(slug);
        if (catId) {
            const posts = await fetchJson(
                `${BASE}/wp-json/wp/v2/posts?categories=${catId}&per_page=12&_fields=id,title,link,date`
            );
            if (Array.isArray(posts) && posts.length) {
                return posts.map(p => ({
                    title   : stripHtml(p.title?.rendered || ''),
                    url     : (p.link || '').replace(/\/+$/, ''),
                    kategori: deteksiKategori(p.link || '') || slug,
                    tanggal : p.date ? p.date.split('T')[0] : '',
                })).filter(p => p.url);
            }
        }
    } catch (e) {
        console.warn(`[Nekopoi] REST API gagal untuk "${slug}": ${e?.message} — fallback ke HTML`);
    }

    // Fallback: parse HTML listing langsung
    const html = await fetchHtml(`${BASE}/category/${slug}/`);
    return parseCategoryListingHTML(html, slug);
}

function parseCategoryListingHTML(html, defaultKategori) {
    const results = [];
    const seen    = new Set();

    // WordPress: <h2 class="entry-title"><a href="URL">Title</a></h2>
    // atau <h3 class="entry-title"><a href="URL">Title</a></h2>
    const regex = /<h[23][^>]*>\s*<a[^>]+href="(https?:\/\/nekopoi\.care\/[^"]+)"[^>]*>([\s\S]+?)<\/a>/gi;
    let m;
    while ((m = regex.exec(html)) !== null) {
        const url = m[1].trim().replace(/\/+$/, '');
        if (seen.has(url)) continue;
        if (/\/(category|genre|hentai-list|jav-list|jadwal|privacy-policy|2257|random|tag|author|page)/.test(url)) continue;
        if (url === BASE || url === BASE + '/') continue;
        seen.add(url);

        const title    = stripHtml(m[2]).trim();
        const kategori = deteksiKategori(url) || defaultKategori || 'hentai';
        results.push({ title, url, kategori });
    }

    // Strategi 2: markup baru nk-search-item (kategori kini dirender sebagai
    // daftar ala hasil-pencarian, tanpa class entry-title sama sekali).
    // <li><a href="URL" class="nk-search-item"><div class="nk-search-thumb"
    // ...></div><div class="nk-search-info"><h2>JUDUL</h2>...</div></a></li>
    const re2 = /<a[^>]+href="(https?:\/\/nekopoi\.care\/[^"]+)"[^>]*class="[^"]*nk-search-item[^"]*"[^>]*>([\s\S]+?)<\/a>/gi;
    let m2;
    while ((m2 = re2.exec(html)) !== null) {
        const url = m2[1].trim().replace(/\/+$/, '');
        if (seen.has(url)) continue;
        if (/\/(category|genre|hentai-list|jav-list|jadwal|privacy-policy|2257|random|tag|author|page)/.test(url)) continue;
        if (url === BASE || url === BASE + '/') continue;
        seen.add(url);
        const h2 = m2[2].match(/<h2[^>]*>([\s\S]+?)<\/h2>/i);
        const title = stripHtml(h2 ? h2[1] : m2[2]).trim();
        if (!title) continue;
        const kategori = deteksiKategori(url) || defaultKategori || 'hentai';
        results.push({ title, url, kategori });
    }
    return results;
}

// ── DETAIL POST via HTML langsung ──────────────────────────────────────────────

function parseDetailPostHTML(html, url) {
    // ── Thumbnail ──────────────────────────────────────────────────────────────
    let thumbnail = null;
    const thumbRegex = /(?:src|data-src)="(https?:\/\/nekopoi\.care\/wp-content\/uploads\/[^"]+\.(?:jpg|jpeg|png|webp))"/gi;
    let tm;
    while ((tm = thumbRegex.exec(html)) !== null) {
        if (/logo|icon|app\.png|histats|gravatar/i.test(tm[1])) continue;
        thumbnail = tm[1];
        break;
    }

    // ── Judul ─────────────────────────────────────────────────────────────────
    const titleM = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]+?)<\/h1>/i)
                || html.match(/<h1[^>]*>([\s\S]+?)<\/h1>/i);
    const rawTitle = titleM ? stripHtml(titleM[1]) : '';
    const title = rawTitle.replace(/\s*\d[\d.]*\s*kali\s*$/i, '').trim();

    // ── View count ────────────────────────────────────────────────────────────
    let viewCount = '';
    const vcM = (rawTitle || html).match(/(\d[\d.]*)\s*kali/i);
    if (vcM) viewCount = vcM[1].replace(/\./g, '');

    // ── Tanggal posting ───────────────────────────────────────────────────────
    // Prioritas 1: format hari Indonesia "Senin, 3 Agustus 2026"
    // Prioritas 2: atribut datetime="YYYY-MM-DD" di tag <time>
    const dateIndo = html.match(/((?:Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu),\s+\d+\s+\w+\s+\d{4})/i);
    const dateAttr = html.match(/<time[^>]+datetime="(\d{4}-\d{2}-\d{2})[^"]*"/i);
    const tanggal  = dateIndo
        ? dateIndo[1].trim()
        : dateAttr
            ? dateAttr[1]
            : '';

    // ── Ambil entry-content ────────────────────────────────────────────────────
    const contentM = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]+?)(?=<\/div>\s*(?:<div[^>]*class="[^"]*(?:sharedaddy|post-tags|related|navigation)|<footer))/i);
    const content  = contentM ? contentM[1] : html;

    // Helper: ambil nilai field dari <strong>Nama Field:</strong> value
    function getField(fieldName) {
        const r = new RegExp(
            `<strong>\\s*${fieldName}\\s*:?\\s*<\\/strong>\\s*:?\\s*((?:(?!<strong>)[\\s\\S])*?)(?=<(?:br|p|li|strong|h[1-6]|\/p|\/li|\/div))`,
            'i'
        );
        const fm = content.match(r);
        if (!fm) return '';
        return stripHtml(fm[1]).replace(/^[:\s]+/, '').trim();
    }

    // ── Field-field detail ─────────────────────────────────────────────────────
    const sinopsisM = content.match(/<strong>Sinopsis\s*:?<\/strong>\s*:?\s*([\s\S]+?)(?=<strong>|<p>\s*<strong>|<\/p>|$)/i);
    const sinopsis  = sinopsisM ? stripHtml(sinopsisM[1]).trim() : '';

    const genreM    = content.match(/<strong>Genre\s*:?<\/strong>\s*:?\s*([\s\S]+?)(?=<br|<p>|<strong>|<\/p>|$)/i);
    const genreRaw  = genreM ? genreM[1] : '';
    const genre     = genreRaw
        ? [...genreRaw.matchAll(/href="[^"]*">([^<]+)<\/a>/g)].map(x => x[1]).join(', ')
          || stripHtml(genreRaw).trim()
        : '';

    const originalTitle = getField('Original Title');
    const parody        = getField('Parody');
    const anime         = getField('Anime');
    const judulJp       = getField('Judul Jepang');
    const producers     = getField('(?:Producers?|Studio)');
    const durasi        = getField('Duration');
    const ukuranRaw     = getField('Size');
    const ukuran        = ukuranRaw.replace(/\*\*/g, '').trim();
    const status        = getField('Status');
    const episode       = getField('Episode');
    const tayang        = getField('Tayang');

    // ── Fallback markup baru (Blogger, Okt 2026) ─────────────────────────────
    // Field kini di <p class="separator"><b>Nama : </b>nilai (bukan <strong>).
    // Tooltip post LAIN memakai <b>Genre</b>: di LUAR <p class="separator"> —
    // jadi hanya paragraf separator yang dipindai, tooltip tak pernah tertangkap
    // (terverifikasi di sampel: 6 paragraf separator, tepat 1 berisi Genre).
    const sepParas = [...html.matchAll(/<p[^>]*class="[^"]*separator[^"]*"[^>]*>([\s\S]+?)<\/p>/gi)].map(mm => mm[1]);
    function getFieldBaru(fieldName) {
        const re = new RegExp(`<b[^>]*>\\s*${fieldName}\\s*:?[\\s\\S]*?<\\/b>\\s*:?\\s*`, 'i');
        for (const para of sepParas) {
            const mm = para.match(re);
            if (mm) {
                const val = stripHtml(para.slice(mm.index + mm[0].length)).replace(/^[:\s]+/, '').trim();
                if (val) return val;
            }
        }
        return '';
    }

    // Sinopsis fallback: (1) paragraf <p> substansial terakhir sebelum blok
    // Genre (isi penuh), (2) meta/og description (terpotong ~170 char).
    let sinopsisFinal = sinopsis;
    if (!sinopsisFinal) {
        const genreIdx = html.search(/<b[^>]*>\s*Genre\s*:\s*<\/b>/i);
        if (genreIdx > 0) {
            const paras = [...html.slice(0, genreIdx).matchAll(/<p[^>]*>([\s\S]+?)<\/p>/gi)]
                .map(mm => stripHtml(mm[1]).replace(/^Sinopsis\s*:\s*/i, '').trim())
                .filter(t => t.length > 80 && !/^(Genre|Anime|Producers?|Produser|Duration|Durasi|Size|Status|Episode|Tayang|Catatan)\b/i.test(t));
            if (paras.length) sinopsisFinal = paras[paras.length - 1];
        }
    }
    if (!sinopsisFinal) {
        const md = html.match(/<meta[^>]+(?:name="description"|property="og:description")[^>]+content="([^"]*)"/i);
        if (md) sinopsisFinal = md[1].replace(/^Sinopsis\s*:\s*/i, '').trim();
    }

    const genreFinal     = genre     || getFieldBaru('Genre');
    const animeFinal     = anime     || getFieldBaru('Anime');
    const judulJpFinal   = judulJp   || getFieldBaru('Judul Jepang');
    const producersFinal = producers || getFieldBaru('(?:Producers?|Studio)');
    const durasiFinal    = durasi    || getFieldBaru('Duration') || getFieldBaru('Durasi');
    const ukuranFinal    = (ukuran   || getFieldBaru('Size')).replace(/\*\*/g, '').trim();
    const statusFinal    = status    || getFieldBaru('Status');
    const episodeFinal   = episode   || getFieldBaru('Episode');
    const tayangFinal    = tayang    || getFieldBaru('Tayang');
    const originalFinal  = originalTitle || getFieldBaru('Original Title');
    const parodyFinal    = parody    || getFieldBaru('Parody');

    // ── Download links ────────────────────────────────────────────────────────
    const downloads = parseDownloadLinksHTML(content);

    // ── Kategori dari URL ─────────────────────────────────────────────────────
    const kategori = deteksiKategori(url);

    return {
        title, thumbnail, tanggal, sinopsis: sinopsisFinal, genre: genreFinal,
        originalTitle: originalFinal, parody: parodyFinal,
        anime: animeFinal, judulJp: judulJpFinal,
        producers: producersFinal, durasi: durasiFinal, ukuran: ukuranFinal, status: statusFinal, episode: episodeFinal, tayang: tayangFinal,
        kategori, url, downloads, viewCount,
    };
}

// ── Parse download links dari HTML ────────────────────────────────────────────
function parseDownloadLinksHTML(content) {
    const downloads = [];

    // ── Strategi 1: nk-download-row (struktur resmi nekopoi.care) ─────────────
    // Format: <div class="nk-download-row">
    //           <div class="nk-download-name">Judul [1080p]</div>
    //           <div class="nk-download-links"><b>LINK</b><p><a href="...">Host</a></p></div>
    //         </div>
    const rowRe = /<div[^>]*class="nk-download-row"[^>]*>([\s\S]*?)(?=<div[^>]*class="nk-download-row"|<div[^>]*class="nk-(?:ad|related|section)|$)/gi;
    let rm;
    while ((rm = rowRe.exec(content)) !== null) {
        const block = rm[1];

        // Resolusi dari nk-download-name: "[4K]", "[1080p]", dll
        const nameM = block.match(/<div[^>]*class="nk-download-name"[^>]*>[\s\S]*?\[(4K|1080p|720p|480p|360p)\]/i);
        if (!nameM) continue;
        const resolusi = nameM[1];

        // Link dari nk-download-links — skip semua URL nekopoi.care
        const linksBlockM = block.match(/<div[^>]*class="nk-download-links"[^>]*>([\s\S]*)/i);
        if (!linksBlockM) continue;

        const links = [];
        const aRe   = /href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
        let am;
        while ((am = aRe.exec(linksBlockM[1])) !== null) {
            const dlUrl = am[1].trim();
            if (/nekopoi\.care/.test(dlUrl)) continue;
            const host = am[2].replace(/\s*\[ouo(?:\.io)?\]/gi, '').trim();
            if (!host) continue;
            links.push({ host, url: dlUrl });
        }
        if (links.length) downloads.push({ resolusi, links });
    }

    // ── Strategi 2: fallback — blok [Resolusi] + LINK (format lama / WP REST) ─
    const unduhM = content.match(/<(?:h[23]|strong|b)[^>]*>(?:Unduh|Download)[^<]*<\/(?:h[23]|strong|b)>([\s\S]+?)(?=<(?:h[23])[^>]*>(?!(?:Unduh|Download))|$)/i);
    const section = unduhM ? unduhM[1] : content;
    if (!downloads.length) {

        const blockRegex = /\[(4K|1080p|720p|480p|360p)\][\s\S]{0,400}?<(?:strong|b)>LINK<\/(?:strong|b)>([\s\S]{0,2000}?)(?=\[(4K|1080p|720p|480p|360p)\]|$)/gi;
        let bm;
        while ((bm = blockRegex.exec(section)) !== null) {
            const resolusi = bm[1];
            const links    = [];
            const aRe2     = /href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
            let lm;
            while ((lm = aRe2.exec(bm[2])) !== null) {
                const dlUrl = lm[1].trim();
                if (/nekopoi\.care/.test(dlUrl)) continue;
                const host = lm[2].replace(/\s*\[ouo(?:\.io)?\]/gi, '').trim();
                if (!host) continue;
                links.push({ host, url: dlUrl });
            }
            if (links.length) downloads.push({ resolusi, links });
        }
    }

    // Fallback: cari resolusi + link tanpa markup blok
    if (!downloads.length) {
        const fallbackRe = /\b(4K|1080p|720p|480p|360p)\b[\s\S]{0,200}?href="(https?:\/\/[^"]+)"/gi;
        const seen = new Set();
        let fm;
        while ((fm = fallbackRe.exec(section)) !== null) {
            const resolusi = fm[1];
            const linkUrl  = fm[2];
            const key      = resolusi + '|' + linkUrl;
            if (seen.has(key)) continue;
            seen.add(key);
            const existing = downloads.find(d => d.resolusi === resolusi);
            if (existing) {
                existing.links.push({ host: new URL(linkUrl).hostname.replace('www.', ''), url: linkUrl });
            } else {
                downloads.push({ resolusi, links: [{ host: new URL(linkUrl).hostname.replace('www.', ''), url: linkUrl }] });
            }
        }
    }

    // Urutkan: 4K → 1080p → 720p → 480p → 360p
    const URUTAN = ['4K', '1080p', '720p', '480p', '360p'];
    downloads.sort((a, b) => {
        const ia = URUTAN.indexOf(a.resolusi);
        const ib = URUTAN.indexOf(b.resolusi);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    return downloads;
}

// ── Homepage: episode terbaru ─────────────────────────────────────────────────

async function getHomepageData() {
    // Coba WP REST API
    try {
        const posts = await fetchJson(
            `${BASE}/wp-json/wp/v2/posts?per_page=10&_fields=id,title,link,date`
        );
        if (Array.isArray(posts) && posts.length) {
            const episodeTerbaru = posts.map(p => ({
                title   : stripHtml(p.title?.rendered || ''),
                url     : (p.link || '').replace(/\/+$/, ''),
                tanggal : p.date ? p.date.split('T')[0] : '',
                kategori: deteksiKategori(p.link || ''),
            })).filter(p => p.url);
            return { episodeTerbaru };
        }
    } catch (e) {
        console.warn('[Nekopoi] getHomepageData REST API gagal:', e?.message);
    }

    // Fallback: HTML
    try {
        const html = await fetchHtml(`${BASE}/`);
        const episodeTerbaru = parseCategoryListingHTML(html, 'hentai');
        return { episodeTerbaru };
    } catch (e) {
        console.warn('[Nekopoi] getHomepageData HTML gagal:', e?.message);
        return { episodeTerbaru: [] };
    }
}

// ── Detail post ────────────────────────────────────────────────────────────────

async function getDetailNekopoi(url) {
    const html = await fetchHtml(url);
    return parseDetailPostHTML(html, url);
}

// ── EXPORT ────────────────────────────────────────────────────────────────────

export { KATEGORI_MAP, deteksiKategori, getHomepageData, getCategoryPosts, getDetailNekopoi };