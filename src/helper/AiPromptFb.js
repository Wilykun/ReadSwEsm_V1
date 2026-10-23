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
 *  AiPromptFb.js — Prompt builder AI untuk Facebook
 *  Analisis URL FB, extract metadata via Gemini
 * ───────────────────────────────
 */
'use strict';

/**
 * ═══════════════════════════════════════════════════
 *  AI PROMPT — FACEBOOK DOWNLOADER (AiPromptFb.js)
 *  File khusus prompt AI untuk fitur .fb
 *
 *  Fungsi:
 *    1. buildFbVisionPrompt()       → prompt analisis visual thumbnail/cover
 *    2. buildFbCaptionPrompt(data)  → prompt generate caption WA lengkap
 *    3. buildFbFallbackCaption(d)   → fallback caption kalau AI gagal
 *    4. parseFbMetaHtml(html)       → ekstrak metadata dari HTML FB
 *    5. formatFbCount(n)            → format angka → "17K", "1.2M"
 * ═══════════════════════════════════════════════════
 */

/**
 * Format angka views/likes jadi readable: 17247 → "17,2K" | 1200000 → "1,2M"
 */
export function formatFbCount(n) {
    const num = Number(n);
    if (!num || isNaN(num)) return '';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace('.0', '') + 'M';
    if (num >= 1_000)     return (num / 1_000).toFixed(1).replace('.0', '') + 'K';
    return num.toLocaleString('id-ID');
}

/**
 * Decode HTML entities helper
 */
function decodeHtml(s = '') {
    return s
        .replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>').replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&[a-z]+;/g, '');
}

/**
 * Ekstrak metadata dari HTML Facebook (og: tags).
 * Return: { pageTitle, description, views, quality, mediaType, hashtags }
 */
export function parseFbMetaHtml(html = '') {
    const ogTitle   = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/)?.[1] || '';
    const ogDesc    = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/)?.[1] || '';
    const ogType    = html.match(/<meta[^>]+property="og:type"[^>]+content="([^"]+)"/)?.[1] || '';
    const ogVideo   = html.match(/<meta[^>]+property="og:video[^"]*"[^>]+content="([^"]+)"/)?.[1] || '';

    const title     = decodeHtml(ogTitle).trim();
    const desc      = decodeHtml(ogDesc).trim();

    // ── Parse engagement stats dari og:title ─────────────────────────────────
    // Format FB: "90 rb tayangan · 7 rb tanggapan | [konten] | [username]"
    // Bahasa Inggris: "90K views · 7K reactions | [content] | [username]"
    let views     = '';
    let likes     = '';
    let pageTitle = '';

    // Normalise spasi di angka: "90 rb" → "90rb"
    const normCount = (s) => s.replace(/(\d)\s+(rb|jt|ribu|juta)/gi, '$1$2').trim();

    const titleParts = title.split(/\s*\|\s*/);
    const statsPart  = titleParts[0] || '';

    // Pattern views: "90 rb tayangan", "90K views", "1,2M ditonton"
    const viewsM = statsPart.match(/([\d.,]+\s*(?:rb|jt|ribu|juta|K|M)?)\s+(?:tayangan|views|ditonton)/i);
    // Pattern likes/reactions: "7 rb tanggapan", "7K reactions", "5 rb suka", "7K likes"
    const likeM  = statsPart.match(/([\d.,]+\s*(?:rb|jt|ribu|juta|K|M)?)\s+(?:tanggapan|reaksi|reaction|suka|like)/i);

    if (viewsM) views = normCount(viewsM[1]);
    if (likeM)  likes = normCount(likeM[1]);

    const hasStats = !!(viewsM || likeM);

    if (hasStats && titleParts.length >= 2) {
        // username = bagian terakhir setelah | terakhir
        pageTitle = titleParts[titleParts.length - 1].trim();
    } else {
        // Fallback: ambil nama dari title dengan strip pattern lama
        pageTitle = title
            .replace(/\s*\|\s*facebook/gi, '')
            .replace(/^facebook video[:.]?\s*/gi, '')
            .replace(/^watch\s+/gi, '')
            .replace(/'s video$/gi, '')
            .trim();
    }

    // Buang pageTitle yang cuma ID angka FB (mis. "17093569669950008" atau "Video 1709...")
    const isIdTitle = /^\d+$/.test(pageTitle) || /^(video|reel|story)\s+\d{5,}$/i.test(pageTitle);
    if (isIdTitle) pageTitle = '';

    // Views fallback: coba dari description kalau og:title tidak ada stats
    if (!views) {
        const viewsRaw = desc.match(/([\d.,]+[KkMm]?)\s*(?:views|tayangan|ditonton)/i)?.[1] || '';
        views = viewsRaw.toUpperCase();
    }

    // Tipe media: video, reel, story
    const mediaType = ogType.includes('video') ? 'video'
        : html.includes('/reel/') || html.includes('reel') ? 'reel'
        : html.includes('/stories/') || html.includes('story') ? 'story'
        : 'video';

    // Hashtags dari description
    const hashtags = (desc.match(/#\w+/g) || []).slice(0, 5);

    return { pageTitle, description: desc, views, likes, mediaType, hashtags, hasVideo: !!ogVideo };
}

/**
 * Prompt untuk Gemini Vision — analisis thumbnail/cover Facebook video.
 * Dipanggil dengan gemini.askWithImage(prompt, buffer, mimeType)
 * Model otomatis pakai DEFAULT_MODEL (gemini-3.1-pro-preview) + fallback chain.
 */
export function buildFbVisionPrompt() {
    return `Kamu adalah AI spesialis analisis konten visual Facebook.

Analisis gambar ini dengan teliti dan jawab 4 hal berikut (jawab langsung tanpa label/heading):

1. *Aksi utama*: Apa yang sedang terjadi atau ditampilkan? (spesifik, akurat)
2. *Subjek*: Siapa atau apa yang ada di sini? (orang, hewan, objek — sebut spesifik. Contoh: "pria berseragam polisi", "anjing golden retriever", "anak kecil berteriak")
3. *Setting*: Di mana latarnya? (dalam ruangan, outdoor, jalanan, warung, alam, dll)
4. *Vibe/nuansa*: Apa suasananya? (lucu, mengharukan, menegangkan, informatif, viral, absurd, dll)

Aturan WAJIB:
- Bahasa Indonesia, akurat berdasarkan yang BENAR-BENAR terlihat
- Jangan mengarang, jangan tebak-tebakan
- Jika ada hewan → sebut nama jenisnya secara spesifik
- Jika ada makanan → sebut nama makanannya
- Jika ada teks di gambar/thumbnail → sebut isinya
- Maksimal 3-4 kalimat total, ringkas dan to the point
- Jangan tulis "Berdasarkan gambar..." atau label apapun
- Jangan bilang kamu AI`;
}

/**
 * Prompt generate caption WhatsApp untuk FB — pakai formatting WA: *bold* _italic_ \`code\` > quote
 *
 * @param {object} d
 * @param {string} d.pageTitle     - Nama page/user FB
 * @param {string} d.description   - Deskripsi/caption asli dari FB
 * @param {string} d.views         - Views formatted ("90rb")
 * @param {string} d.likes         - Like/reaction count realtime ("7rb")
 * @param {string} d.quality       - Kualitas video ("HD" | "SD")
 * @param {string[]} d.hashtags    - Array hashtag ["#viral", "#lucu"]
 * @param {string} d.mediaType     - "video" | "reel" | "story"
 * @param {string} d.visualDesc    - Hasil analisis visual dari Gemini Vision
 */
export function buildFbCaptionPrompt({
    pageTitle = '',
    description = '',
    views = '',
    likes = '',
    quality = '',
    hashtags = [],
    mediaType = 'video',
    visualDesc = '',
} = {}) {
    const isReel  = mediaType === 'reel';
    const isStory = mediaType === 'story';
    const emoji   = isReel ? '🎬' : isStory ? '📖' : '▶️';
    const typeLabel = isReel ? 'Reel Facebook' : isStory ? 'Story Facebook' : 'Video Facebook';

    // Build stats string untuk disertakan di data konten
    const statsArr = [];
    if (views) statsArr.push(`${views} tayangan`);
    if (likes) statsArr.push(`${likes} like`);
    const statsLine = statsArr.length ? statsArr.join(' · ') : '';

    const parts = [];
    if (pageTitle)   parts.push(`Nama page/user: ${pageTitle}`);
    if (statsLine)   parts.push(`Engagement: ${statsLine}`);
    if (description) parts.push(`Caption asli: "${description.substring(0, 300)}"`);
    if (hashtags.length) parts.push(`Hashtag: ${hashtags.join(' ')}`);

    const metaBlock  = parts.map(p => `- ${p}`).join('\n');
    const visualBlock = visualDesc
        ? `\nAnalisis Visual (PRIORITAS UTAMA — dari AI Vision):\n"${visualDesc.substring(0, 600)}"`
        : '';
    const contentBasis = visualDesc
        ? 'Deskripsikan isi konten berdasarkan Analisis Visual yang diberikan.'
        : 'Analisis visual tidak tersedia. Gunakan hanya caption asli dan metadata. Jika tidak cukup informasi, jangan tebak adegan video; buat caption netral.';

    return `Kamu adalah Wily, asisten bot WhatsApp yang cerdas, natural, dan sedikit bercanda.
Tugasmu: buat caption WhatsApp untuk ${typeLabel} yang baru diunduh.

DATA KONTEN:
${metaBlock}${visualBlock}
Panduan isi: ${contentBasis}

═══════════════════════════════
PANDUAN FORMATTING WhatsApp — PAKAI SESUAI KONTEKS KONTEN, BUKAN ASAL TEMPEL:
═══════════════════════════════

*teks tebal* → nama page/user, judul konten, kata kunci utama yang paling penting
_teks miring_ → nuansa/suasana, kata sifat penekanan emosi, deskripsi visual yang kuat
~teks coret~ → kontras/ironi (mis. "katanya diet ~sambil makan gorengan~"), mitos yang dibantah, atau efek humor
\`teks monospace\` → nama karakter, nama game/produk/brand/aplikasi, istilah teknis, nama tempat spesifik
> teks kutip → stats engagement (views/likes/komentar), kutipan dari konten, fakta menarik
1. daftar bernomor → konten tips/langkah/urutan (tutorial, resep, cara melakukan sesuatu)
• daftar berpoint → beberapa detail sejajar tanpa urutan

ATURAN PENGGUNAAN FORMATTING:
- JANGAN pakai semua simbol sekaligus — pilih yang paling relevan dengan isi konten
- Konten lucu/viral: bold + italic + mungkin coret untuk efek humor
- Konten tutorial/tips: bold judul + numbered list untuk langkah-langkah
- Konten game/anime: bold + monospace untuk nama karakter/game
- Konten berita/info: bold + quote untuk fakta/data penting
- Konten story/vlog: bold + italic untuk nuansa, quote untuk momen spesifik
- ~coret~ HANYA kalau ada kontras/ironi/humor nyata dalam konten — JANGAN dipaksakan

FORMAT CAPTION:
Baris 1  : ${emoji} *[Nama Page/User]* — bold, nama sumber
Baris 2-4: ${visualDesc ? 'Deskripsi isi konten berdasarkan Analisis Visual, pakai formatting sesuai konten' : 'Deskripsi singkat hanya dari metadata yang tersedia; jangan menebak isi visual'}
           (1-2 kalimat biasa, atau list bernomor/berpoint kalau konten memang tips/langkah)
Baris 5  : (opsional) Komentar/reaksi singkat santai yang nyambung dengan isi konten
Baris 6+ : > [stats engagement] — WAJIB tampilkan dalam format quote jika ada datanya:
           Contoh: > 👁️ 90rb tayangan  •  👍 7rb like
           (hanya tampilkan stats yang memang ada datanya, jangan karang)

ATURAN KETAT:
1. Jika Analisis Visual tersedia, deskripsi harus berdasar padanya; jika tidak, jangan mengarang adegan yang tidak ada di metadata
2. Bahasa Indonesia santai, tidak kaku, terasa seperti kawan ngirim video
3. DILARANG mengarang fakta di luar data yang diberikan
4. DILARANG sertakan URL atau link
5. DILARANG bilang kamu AI
6. DILARANG menambahkan kalimat pembuka seperti "Oke siap", "Ini dia", "Tentu!" dll — langsung caption saja
7. Maksimal 8 baris total

Caption (langsung, tanpa kalimat pembuka):`;
}

/**
 * Fallback caption sederhana jika AI total gagal.
 */
export function buildFbFallbackCaption({
    pageTitle = '',
    description = '',
    views = '',
    likes = '',
    quality = '',
    mediaType = 'video',
} = {}) {
    const emoji     = mediaType === 'reel' ? '🎬' : mediaType === 'story' ? '📖' : '▶️';
    const typeLabel = mediaType === 'reel' ? 'Reel' : mediaType === 'story' ? 'Story' : 'Video';
    const name      = pageTitle ? `*${pageTitle}*` : `*Facebook ${typeLabel}*`;

    let text = `${emoji} ${name}\n`;

    if (description) {
        const desc = description.trim();
        // Kalau ada baris multipel (tips/langkah), jadikan numbered list
        const lines = desc.split(/\n+/).map(l => l.trim()).filter(Boolean);
        if (lines.length >= 3) {
            text += lines.slice(0, 4).map((l, i) => `${i + 1}. ${l}`).join('\n') + '\n';
        } else {
            const short = desc.substring(0, 150);
            text += `_${short}${desc.length > 150 ? '...' : ''}_\n`;
        }
    }

    // Stats realtime: views + likes dari og:title FB
    const stats = [];
    if (views)   stats.push(`👁️ ${views} tayangan`);
    if (likes)   stats.push(`👍 ${likes} like`);
    if (quality) stats.push(`🎥 ${quality}`);
    if (stats.length) text += `> ${stats.join('  •  ')}`;

    return text.trim();
}

// ─── Prompt analisis FRAME VIDEO (multi-frame, API resmi) ────────────────────
export function buildFbVideoFramesPrompt() {
    return `Kamu adalah AI spesialis analisis konten video Facebook.

Berikut 5 frame yang diambil berurutan dari satu video (awal sampai akhir). Analisis sebagai SATU kesatuan video dan jawab 4 hal berikut (jawab langsung tanpa label/heading):

1. *Aksi utama*: Apa yang sedang terjadi atau ditampilkan sepanjang video? (spesifik, akurat)
2. *Subjek*: Siapa atau apa yang ada di sini? (orang, hewan, objek, aplikasi/situs — sebut spesifik)
3. *Setting*: Di mana latarnya? (rekaman layar HP/komputer, dalam ruangan, outdoor, dll)
4. *Vibe/nuansa*: Apa suasananya? (lucu, mengharukan, menegangkan, informatif, tutorial, viral, absurd, dll)

Aturan WAJIB:
- Bahasa Indonesia, akurat berdasarkan yang BENAR-BENAR terlihat di frame
- Jangan mengarang, jangan tebak-tebakan di luar frame
- Jika ada teks/tulisan di frame → sebut isinya
- Jika ada nama aplikasi/situs/brand yang terlihat → sebut namanya
- Maksimal 4-5 kalimat total, ringkas dan to the point
- Jangan tulis "Berdasarkan frame..." atau label apapun
- Jangan bilang kamu AI`;
}
