/**
 * animquote.js — Random anime quote dari Anime Quote Generator
 *
 * Sumber utama menyimpan quote di script.js, bukan API JSON.
 * Handler mengambil dan mem-parsing dataset itu dengan cache, lalu memakai
 * fallback lokal agar command tetap bisa dipakai saat situs sedang down.
 */
'use strict';

import https from 'https';

const SOURCE_URL = 'https://jiashengc.github.io/anime-quote-generator/script.js';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12_000;
const TRANSLATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const TRANSLATION_RETRY_DELAY_MS = 15 * 60 * 1000;
const ANIMQUOTE_NEXT_BUTTON_ID = '__animquote_next__';

let quoteCache = null;
let quoteCacheAt = 0;
let lastQuoteNumber = null;
const translationCache = new Map();
const activeQuoteMessages = new Map();
const activeQuoteLocks = new Set();

// Quote aman sebagai fallback. Entry eksplisit dari sumber tidak dimasukkan.
const FALLBACK_QUOTES = [
        {
                number: 6,
                sentence: 'A lie that can’t be disproven is no different from the truth.',
                character: 'Kraft Lawrence',
                anime: 'Ookami to Koushinryou',
        },
        {
                number: 15,
                sentence: 'Don’t be distracted by the what-if’s, should-have’s, and if-only’s. The one thing you choose for yourself - that is the truth of your universe.',
                character: 'Kamina',
                anime: 'Tengen Toppa Gurren Lagann',
        },
        {
                number: 25,
                sentence: 'A faint clap of thunder, clouded skies; perhaps rain comes. If so, will you stay here with me?',
                character: 'Yukari Yukino',
                anime: 'Kotonoha no Niwa',
        },
        {
                number: 38,
                sentence: 'The moment you say a word of parting, you’ve already parted. So long as you and I are both somewhere in this world, we haven’t parted.',
                character: 'Satone Shichimiya',
                anime: 'Chuunibyou Demo Koi Ga Shitai!',
        },
        {
                number: 64,
                sentence: 'Don’t believe in the you that believes in me and don’t believe in the me that believes in you. Believe in the you that believes in yourself!',
                character: 'Kamina',
                anime: 'Tengen Toppa Gurren Lagann',
        },
        {
                number: 70,
                sentence: 'If a girl chases after you, it’s likely a trap.',
                character: 'Keima Katsuragi',
                anime: 'Kami nomi zo Shiru Sekai',
        },
        {
                number: 74,
                sentence: 'The ordinary days that we live in may, in fact, be a series of miracles.',
                character: 'Koujirou Sasahara',
                anime: 'Nichijou',
        },
        {
                number: 83,
                sentence: 'Power isn’t determined by your size, but the size of your heart and dreams!',
                character: 'Monkey D. Luffy',
                anime: 'One Piece',
        },
];

// Sumber asli memiliki beberapa entry eksplisit atau berisiko untuk chat umum.
const UNSAFE_SOURCE_TEXT = /\b(?:fuck|hentai|incest|nude|porn|explicit|sexual|rape)\b/i;

function fetchText(url, redirects = 0) {
        return new Promise((resolve, reject) => {
                const request = https.get(url, {
                        headers: {
                                'User-Agent': 'WilyBot/1.0 (anime quote command)',
                                'Accept': 'text/javascript,text/plain,*/*',
                        },
                }, response => {
                        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                                response.resume();
                                if (redirects >= 3) return reject(new Error('Terlalu banyak redirect sumber quote'));
                                const nextUrl = new URL(response.headers.location, url).toString();
                                return fetchText(nextUrl, redirects + 1).then(resolve, reject);
                        }

                        if (response.statusCode !== 200) {
                                response.resume();
                                return reject(new Error(`Sumber quote HTTP ${response.statusCode}`));
                        }

                        const chunks = [];
                        let totalBytes = 0;
                        response.on('data', chunk => {
                                totalBytes += chunk.length;
                                if (totalBytes <= 2 * 1024 * 1024) chunks.push(chunk);
                        });
                        response.on('end', () => {
                                if (totalBytes > 2 * 1024 * 1024) {
                                        return reject(new Error('Sumber quote terlalu besar'));
                                }
                                resolve(Buffer.concat(chunks).toString('utf8'));
                        });
                        response.on('error', reject);
                });

                request.setTimeout(FETCH_TIMEOUT_MS, () => {
                        request.destroy(new Error('Timeout sumber quote'));
                });
                request.on('error', reject);
        });
}

function decodeJsString(value) {
        try {
                return JSON.parse(`"${value}"`);
        } catch (_) {
                return value
                        .replace(/\\"/g, '"')
                        .replace(/\\'/g, "'")
                        .replace(/\\n/g, ' ')
                        .replace(/\\\\/g, '\\');
        }
}

function cleanField(value, maxLength = 500) {
        return String(value || '')
                .replace(/[\r\n]+/g, ' ')
                .replace(/[<>]/g, '')
                .replace(/[*_~`]/g, '')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, maxLength);
}

function normalizeQuote(number, sentence, character, anime) {
        const normalized = {
                number: Number(number),
                sentence: cleanField(decodeJsString(sentence), 700),
                character: cleanField(decodeJsString(character).replace(/^\s*-\s*/, '').replace(/,\s*$/, ''), 120),
                anime: cleanField(decodeJsString(anime), 180),
        };

        const sourceText = `${normalized.sentence} ${normalized.character} ${normalized.anime}`;
        if (!normalized.number || !normalized.sentence || !normalized.character || !normalized.anime) return null;
        if (UNSAFE_SOURCE_TEXT.test(sourceText)) return null;
        return normalized;
}

function parseSourceQuotes(source) {
        const quotes = [];
        const entryPattern = /anime_quote\[\d+\]\s*=\s*\{\s*"quotenumber"\s*:\s*(\d+),\s*"quotesentence"\s*:\s*"((?:\\.|[^"\\])*)",\s*"quotecharacter"\s*:\s*"((?:\\.|[^"\\])*)",\s*"quoteanime"\s*:\s*"((?:\\.|[^"\\])*)"\s*\}/g;
        let match;

        while ((match = entryPattern.exec(source)) !== null) {
                const quote = normalizeQuote(match[1], match[2], match[3], match[4]);
                if (quote) quotes.push(quote);
        }

        return quotes;
}

async function getQuotes(logError) {
        if (quoteCache?.length && Date.now() - quoteCacheAt < CACHE_TTL_MS) return quoteCache;

        try {
                const source = await fetchText(SOURCE_URL);
                const parsed = parseSourceQuotes(source);
                if (parsed.length >= 10) {
                        quoteCache = parsed;
                        quoteCacheAt = Date.now();
                        return quoteCache;
                }
                throw new Error(`Dataset quote tidak lengkap (${parsed.length} entry valid)`);
        } catch (error) {
                if (typeof logError === 'function') {
                        logError(error instanceof Error ? error : new Error(String(error)), 'animquote:source');
                }
                return quoteCache?.length ? quoteCache : FALLBACK_QUOTES;
        }
}

async function translateToIndonesian(text) {
        const original = cleanField(text, 700);
        if (!original) return { text: original, translated: false };

        const now = Date.now();
        for (const [cachedText, cachedEntry] of translationCache) {
                const expired = cachedEntry.result.translated
                        ? now - cachedEntry.cachedAt >= TRANSLATION_CACHE_TTL_MS
                        : now >= cachedEntry.retryAfter;
                if (expired) translationCache.delete(cachedText);
        }

        const cached = translationCache.get(original);
        if (cached) return cached.result;

        try {
                const url = 'https://translate.googleapis.com/translate_a/single'
                        + '?client=gtx&sl=en&tl=id&dt=t&q='
                        + encodeURIComponent(original);
                const raw = await fetchText(url);
                const data = JSON.parse(raw);
                const translatedText = Array.isArray(data?.[0])
                        ? data[0]
                                .filter(chunk => Array.isArray(chunk) && chunk[0])
                                .map(chunk => chunk[0])
                                .join('')
                                .trim()
                        : '';
                const result = {
                        text: cleanField(translatedText || original, 700),
                        translated: Boolean(translatedText && translatedText !== original),
                };

                translationCache.set(original, {
                        result,
                        cachedAt: now,
                        retryAfter: result.translated ? 0 : now + TRANSLATION_RETRY_DELAY_MS,
                });
                return result;
        } catch (_) {
                // Terjemahan adalah peningkatan tampilan, bukan alasan command gagal.
                // Jika endpoint terkena rate limit/down, quote asli tetap dikirim.
                const result = { text: original, translated: false };
                translationCache.set(original, {
                        result,
                        cachedAt: now,
                        retryAfter: now + TRANSLATION_RETRY_DELAY_MS,
                });
                return result;
        }
}

function pickQuote(quotes) {
        if (quotes.length === 1) {
                lastQuoteNumber = quotes[0].number;
                return quotes[0];
        }

        let quote;
        do {
                quote = quotes[Math.floor(Math.random() * quotes.length)];
        } while (quote.number === lastQuoteNumber);
        lastQuoteNumber = quote.number;
        return quote;
}

function formatQuote(quote) {
        const { sentence, indonesianSentence, character, anime, number } = quote;
        const displaySentence = indonesianSentence || sentence;
        const isVeryShort = displaySentence.length <= 24;
        const isLong = displaySentence.length >= 240;
        const lines = ['🎌 *ANIMQUOTE — INDONESIA*', ''];

        // Blok kode hanya dipakai untuk punchline pendek; quote biasa tetap
        // memakai blockquote agar makna dan tanda baca tidak berubah.
        if (isVeryShort) {
                lines.push('```', displaySentence, '```');
        } else {
                lines.push(`> ${displaySentence}`);
        }

        lines.push('');
        if (isLong) {
                lines.push(
                        `1. *Character:* _${character}_`,
                        `2. *Anime:* _${anime}_`,
                        `3. *Quote ID:* \`${number}\``,
                );
        } else if (displaySentence.length <= 100) {
                lines.push(
                        `• *Character:* _${character}_`,
                        `• *Anime:* _${anime}_`,
                        `• *Quote ID:* \`${number}\``,
                );
        } else {
                lines.push(
                        `*Character:* _${character}_`,
                        `*Anime:* _${anime}_`,
                        `*Quote ID:* \`${number}\``,
                );
        }

        lines.push(
                '',
                quote.translationApplied
                        ? '_Terjemahan otomatis Bahasa Indonesia_'
                        : '_Terjemahan sedang tidak tersedia — teks asli ditampilkan_',
        );
        return lines.join('\n');
}

async function deleteActiveQuote(hisoka, jid) {
        const active = activeQuoteMessages.get(jid);
        activeQuoteMessages.delete(jid);
        if (!active?.key) return;
        await hisoka.sendMessage(jid, { delete: active.key }).catch(() => {});
}

async function sendQuoteWithButton({ hisoka, m, tolak, Button, quote }) {
        const body = formatQuote(quote);
        if (typeof Button !== 'function') {
                await tolak(hisoka, m, body);
                return null;
        }

        try {
                const button = new Button()
                        .setBody(body)
                        .setFooter('🎌 Anime Quote')
                        .addReply('🎌 Quote Lagi', ANIMQUOTE_NEXT_BUTTON_ID);
                const sent = await button.run(m.from, hisoka, m);
                return sent?.key || null;
        } catch (error) {
                console.warn('[ANIMQUOTE] Tombol gagal, fallback ke teks:', error?.message || error);
                await tolak(hisoka, m, body);
                return null;
        }
}

async function sendRandomQuote({ hisoka, m, tolak, Button, logError }) {
        await deleteActiveQuote(hisoka, m.from);
        const quotes = await getQuotes(logError);
        const quote = pickQuote(quotes);
        const translation = await translateToIndonesian(quote.sentence);
        quote.indonesianSentence = translation.text;
        quote.translationApplied = translation.translated;
        const messageKey = await sendQuoteWithButton({ hisoka, m, tolak, Button, quote });
        if (messageKey) activeQuoteMessages.set(m.from, { key: messageKey, peminta: m.sender || '' });
        return messageKey;
}

async function handleAnimquote({ hisoka, m, tolak, logCommand, logError, Button }) {
        if (activeQuoteLocks.has(m.from)) {
                await tolak(hisoka, m, '⏳ Quote sebelumnya masih diproses. Tunggu sebentar.');
                return;
        }

        activeQuoteLocks.add(m.from);
        try {
                await hisoka.sendMessage(m.from, { react: { text: '🎌', key: m.key } }).catch(() => {});
                await sendRandomQuote({ hisoka, m, tolak, Button, logError });
                await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } }).catch(() => {});
                if (typeof logCommand === 'function') logCommand(m, hisoka, 'animquote');
        } catch (error) {
                console.error('[ANIMQUOTE] Error:', error?.message || error);
                if (typeof logError === 'function') {
                        logError(error instanceof Error ? error : new Error(String(error)), 'animquote');
                }
                await tolak(hisoka, m, '❌ Gagal mengambil anime quote. Coba lagi sebentar.');
        } finally {
                activeQuoteLocks.delete(m.from);
        }
}

async function handleAnimquoteCallback({
        hisoka, m, tolak, logCommand, logError, Button, getQuotedStanzaId,
}) {
        if (String(m.text || '').trim() !== ANIMQUOTE_NEXT_BUTTON_ID) return false;

        const current = activeQuoteMessages.get(m.from);
        // GATE PEMINTA (fix 24 Nov): tombol quote berikutnya hanya boleh ditekan
        // peminta (owner yang menjalankan .animquote) — tanpa ini siapa pun di grup
        // bisa menekan dan bot merespon ke bukan-owner (bug yang sama dengan alias).
        if (current?.peminta && m.sender !== current.peminta) return false;
        const quotedId = typeof getQuotedStanzaId === 'function' ? getQuotedStanzaId(m) : null;
        if (current?.key?.id && quotedId && quotedId !== current.key.id) {
                await tolak(hisoka, m, 'ℹ️ Tombol quote ini sudah digantikan oleh quote yang lebih baru.');
                return true;
        }

        if (activeQuoteLocks.has(m.from)) {
                await tolak(hisoka, m, '⏳ Sedang mengambil quote baru. Tunggu sebentar.');
                return true;
        }

        activeQuoteLocks.add(m.from);
        try {
                await hisoka.sendMessage(m.from, { react: { text: '🔄', key: m.key } }).catch(() => {});
                await sendRandomQuote({ hisoka, m, tolak, Button, logError });
                await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } }).catch(() => {});
                if (typeof logCommand === 'function') logCommand(m, hisoka, 'animquote');
        } catch (error) {
                console.error('[ANIMQUOTE] Callback error:', error?.message || error);
                if (typeof logError === 'function') {
                        logError(error instanceof Error ? error : new Error(String(error)), 'animquote:callback');
                }
                await tolak(hisoka, m, '❌ Gagal mengambil quote baru. Coba lagi sebentar.');
        } finally {
                activeQuoteLocks.delete(m.from);
        }
        return true;
}

export { handleAnimquote, handleAnimquoteCallback, formatQuote, parseSourceQuotes, translateToIndonesian };
/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const command = /^(animquote)$/i;
export const tags = ['anime'];
export const help = ['animquote'];
export default handleAnimquote;
