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
 *  anyvoice.js — Text-to-Speech untuk .tts
 *
 *  ENGINE 1: Google Translate TTS (translate.google.com/translate_tts) —
 *  endpoint publik resmi Google, dipanggil tanpa API key/token/login.
 *  Suara bahasa Indonesia (tl=id) apa adanya. Batas ±200 karakter/request,
 *  teks panjang dipecah per-kata lalu disambung via ffmpeg.
 *
 *  ENGINE 2: Microsoft Edge TTS (via node-edge-tts) — tanpa API key,
 *  suara neural Indonesia: id-ID-ArdiNeural (pria) & id-ID-GadisNeural
 *  (wanita). Mendukung rate/pitch via SSML.
 *
 *  ALUR: `.tts <teks>` → tampil picker single-select (5 suara) →
 *  user tap → picker dihapus → voice note dikirim sebagai PTT asli.
 * ───────────────────────────────
 */
'use strict';

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/* ── Bahasa & suara (Edge TTS neural, tanpa API key) ── */
const TTS_LANGS = [
    { code: 'id-ID', label: '🇮🇩 Indonesia', voices: [
        { id: 'ardi',  voice: 'id-ID-ArdiNeural',  label: '👨 Ardi',  desc: 'Pria' },
        { id: 'gadis', voice: 'id-ID-GadisNeural', label: '👩 Gadis', desc: 'Wanita' },
        { id: 'santai', voice: 'id-ID-ArdiNeural', rate: '-30%', label: '😌 Ardi Santai', desc: 'Pelan & kalem' },
        { id: 'ceria',  voice: 'id-ID-GadisNeural', rate: '+30%', pitch: '+10Hz', label: '😄 Gadis Ceria', desc: 'Cepat & ceria' },
    ]},
    { code: 'en-US', label: '🇺🇸 English (US)', voices: [
        { id: 'ava',    voice: 'en-US-AvaNeural',    label: '👩 Ava',    desc: 'Wanita' },
        { id: 'andrew', voice: 'en-US-AndrewNeural', label: '👨 Andrew', desc: 'Pria' },
    ]},
    { code: 'en-GB', label: '🇬🇧 English (UK)', voices: [
        { id: 'sonia', voice: 'en-GB-SoniaNeural', label: '👩 Sonia', desc: 'Wanita' },
        { id: 'ryan',  voice: 'en-GB-RyanNeural',  label: '👨 Ryan',  desc: 'Pria' },
    ]},
    { code: 'ja-JP', label: '🇯🇵 Jepang', voices: [
        { id: 'nanami', voice: 'ja-JP-NanamiNeural', label: '👩 Nanami', desc: 'Wanita' },
        { id: 'keita',  voice: 'ja-JP-KeitaNeural',  label: '👨 Keita',  desc: 'Pria' },
    ]},
    { code: 'ko-KR', label: '🇰🇷 Korea', voices: [
        { id: 'sunhi',  voice: 'ko-KR-SunHiNeural',  label: '👩 SunHi',  desc: 'Wanita' },
        { id: 'injoon', voice: 'ko-KR-InJoonNeural', label: '👨 InJoon', desc: 'Pria' },
    ]},
    { code: 'zh-CN', label: '🇨🇳 Mandarin', voices: [
        { id: 'xiaoxiao', voice: 'zh-CN-XiaoxiaoNeural', label: '👩 Xiaoxiao', desc: 'Wanita' },
        { id: 'yunxi',    voice: 'zh-CN-YunxiNeural',    label: '👨 Yunxi',    desc: 'Pria' },
    ]},
    { code: 'ar-SA', label: '🇸🇦 Arab', voices: [
        { id: 'zariyah', voice: 'ar-SA-ZariyahNeural', label: '👩 Zariyah', desc: 'Wanita' },
        { id: 'hamed',   voice: 'ar-SA-HamedNeural',   label: '👨 Hamed',   desc: 'Pria' },
    ]},
    { code: 'es-ES', label: '🇪🇸 Spanyol', voices: [
        { id: 'elvira', voice: 'es-ES-ElviraNeural', label: '👩 Elvira', desc: 'Wanita' },
        { id: 'alvaro', voice: 'es-ES-AlvaroNeural', label: '👨 Alvaro', desc: 'Pria' },
    ]},
    { code: 'fr-FR', label: '🇫🇷 Prancis', voices: [
        { id: 'denise', voice: 'fr-FR-DeniseNeural', label: '👩 Denise', desc: 'Wanita' },
        { id: 'henri',  voice: 'fr-FR-HenriNeural',  label: '👨 Henri',  desc: 'Pria' },
    ]},
    { code: 'de-DE', label: '🇩🇪 Jerman', voices: [
        { id: 'katja',   voice: 'de-DE-KatjaNeural',   label: '👩 Katja',   desc: 'Wanita' },
        { id: 'conrad',  voice: 'de-DE-ConradNeural',  label: '👨 Conrad',  desc: 'Pria' },
    ]},
    { code: 'pt-BR', label: '🇧🇷 Portugis', voices: [
        { id: 'francisca', voice: 'pt-BR-FranciscaNeural', label: '👩 Francisca', desc: 'Wanita' },
        { id: 'antonio',   voice: 'pt-BR-AntonioNeural',   label: '👨 Antonio',   desc: 'Pria' },
    ]},
    { code: 'hi-IN', label: '🇮🇳 Hindi', voices: [
        { id: 'swara',  voice: 'hi-IN-SwaraNeural',  label: '👩 Swara',  desc: 'Wanita' },
        { id: 'madhur', voice: 'hi-IN-MadhurNeural', label: '👨 Madhur', desc: 'Pria' },
    ]},
    { code: 'th-TH', label: '🇹🇭 Thai', voices: [
        { id: 'premwadee', voice: 'th-TH-PremwadeeNeural', label: '👩 Premwadee', desc: 'Wanita' },
        { id: 'niwat',     voice: 'th-TH-NiwatNeural',     label: '👨 Niwat',     desc: 'Pria' },
    ]},
    { code: 'vi-VN', label: '🇻🇳 Vietnam', voices: [
        { id: 'hoaimy',   voice: 'vi-VN-HoaiMyNeural',   label: '👩 HoaiMy',   desc: 'Wanita' },
        { id: 'namminh',  voice: 'vi-VN-NamMinhNeural',  label: '👨 NamMinh',  desc: 'Pria' },
    ]},
    { code: 'ms-MY', label: '🇲🇾 Melayu', voices: [
        { id: 'yasmin', voice: 'ms-MY-YasminNeural', label: '👩 Yasmin', desc: 'Wanita' },
        { id: 'osman',  voice: 'ms-MY-OsmanNeural',  label: '👨 Osman',  desc: 'Pria' },
    ]},
    { code: 'it-IT', label: '🇮🇹 Italia', voices: [
        { id: 'isabella', voice: 'it-IT-IsabellaNeural', label: '👩 Isabella', desc: 'Wanita' },
        { id: 'diego',    voice: 'it-IT-DiegoNeural',    label: '👨 Diego',    desc: 'Pria' },
    ]},
    { code: 'nl-NL', label: '🇳🇱 Belanda', voices: [
        { id: 'fenna',   voice: 'nl-NL-FennaNeural',   label: '👩 Fenna',   desc: 'Wanita' },
        { id: 'maarten', voice: 'nl-NL-MaartenNeural', label: '👨 Maarten', desc: 'Pria' },
    ]},
    { code: 'pl-PL', label: '🇵🇱 Polandia', voices: [
        { id: 'zofia', voice: 'pl-PL-ZofiaNeural', label: '👩 Zofia', desc: 'Wanita' },
        { id: 'marek', voice: 'pl-PL-MarekNeural', label: '👨 Marek', desc: 'Pria' },
    ]},
    { code: 'ru-RU', label: '🇷🇺 Rusia', voices: [
        { id: 'svetlana', voice: 'ru-RU-SvetlanaNeural', label: '👩 Svetlana', desc: 'Wanita' },
        { id: 'dmitry',   voice: 'ru-RU-DmitryNeural',   label: '👨 Dmitry',   desc: 'Pria' },
    ]},
    { code: 'tr-TR', label: '🇹🇷 Turki', voices: [
        { id: 'emel',  voice: 'tr-TR-EmelNeural',  label: '👩 Emel',  desc: 'Wanita' },
        { id: 'ahmet', voice: 'tr-TR-AhmetNeural', label: '👨 Ahmet', desc: 'Pria' },
    ]},
    { code: 'sv-SE', label: '🇸🇪 Swedia', voices: [
        { id: 'sofie',   voice: 'sv-SE-SofieNeural',   label: '👩 Sofie',   desc: 'Wanita' },
        { id: 'mattias', voice: 'sv-SE-MattiasNeural', label: '👨 Mattias', desc: 'Pria' },
    ]},
    { code: 'el-GR', label: '🇬🇷 Yunani', voices: [
        { id: 'athina',   voice: 'el-GR-AthinaNeural',   label: '👩 Athina',   desc: 'Wanita' },
        { id: 'nestoras', voice: 'el-GR-NestorasNeural', label: '👨 Nestoras', desc: 'Pria' },
    ]},
    { code: 'hu-HU', label: '🇭🇺 Hungaria', voices: [
        { id: 'noemi', voice: 'hu-HU-NoemiNeural', label: '👩 Noemi', desc: 'Wanita' },
        { id: 'tamas', voice: 'hu-HU-TamasNeural', label: '👨 Tamas', desc: 'Pria' },
    ]},
    { code: 'cs-CZ', label: '🇨🇿 Ceko', voices: [
        { id: 'vlasta',   voice: 'cs-CZ-VlastaNeural',   label: '👩 Vlasta',   desc: 'Wanita' },
        { id: 'antonin',  voice: 'cs-CZ-AntoninNeural',  label: '👨 Antonin',  desc: 'Pria' },
    ]},
    { code: 'ro-RO', label: '🇷🇴 Rumania', voices: [
        { id: 'alina', voice: 'ro-RO-AlinaNeural', label: '👩 Alina', desc: 'Wanita' },
        { id: 'emil',  voice: 'ro-RO-EmilNeural',  label: '👨 Emil',  desc: 'Pria' },
    ]},
    { code: 'uk-UA', label: '🇺🇦 Ukraina', voices: [
        { id: 'polina', voice: 'uk-UA-PolinaNeural', label: '👩 Polina', desc: 'Wanita' },
        { id: 'ostap',  voice: 'uk-UA-OstapNeural',  label: '👨 Ostap',  desc: 'Pria' },
    ]},
    { code: 'da-DK', label: '🇩🇰 Denmark', voices: [
        { id: 'christel', voice: 'da-DK-ChristelNeural', label: '👩 Christel', desc: 'Wanita' },
        { id: 'jeppe',    voice: 'da-DK-JeppeNeural',    label: '👨 Jeppe',    desc: 'Pria' },
    ]},
    { code: 'fi-FI', label: '🇫🇮 Finlandia', voices: [
        { id: 'noora', voice: 'fi-FI-NooraNeural', label: '👩 Noora', desc: 'Wanita' },
        { id: 'harri', voice: 'fi-FI-HarriNeural', label: '👨 Harri', desc: 'Pria' },
    ]},
    { code: 'nb-NO', label: '🇳🇴 Norwegia', voices: [
        { id: 'pernille', voice: 'nb-NO-PernilleNeural', label: '👩 Pernille', desc: 'Wanita' },
        { id: 'finn',     voice: 'nb-NO-FinnNeural',     label: '👨 Finn',     desc: 'Pria' },
    ]},
    { code: 'he-IL', label: '🇮🇱 Ibrani', voices: [
        { id: 'hila', voice: 'he-IL-HilaNeural', label: '👩 Hila', desc: 'Wanita' },
        { id: 'avri', voice: 'he-IL-AvriNeural', label: '👨 Avri', desc: 'Pria' },
    ]},
];
/* Kode pendek untuk syntax `.tts teks | kode` — alias ramah + kode locale full */
const TTS_SHORTCODES = {
    id: 'id-ID', indo: 'id-ID', indonesia: 'id-ID',
    en: 'en-US', us: 'en-US', usa: 'en-US', english: 'en-US', inggris: 'en-US',
    uk: 'en-GB', gb: 'en-GB',
    ua: 'uk-UA', ukraina: 'uk-UA',
    jp: 'ja-JP', jpn: 'ja-JP', ja: 'ja-JP', jepang: 'ja-JP', japan: 'ja-JP', japanese: 'ja-JP',
    kr: 'ko-KR', kor: 'ko-KR', ko: 'ko-KR', korea: 'ko-KR', korean: 'ko-KR',
    cn: 'zh-CN', zh: 'zh-CN', mandarin: 'zh-CN', cina: 'zh-CN', chinese: 'zh-CN',
    ar: 'ar-SA', arab: 'ar-SA', arabic: 'ar-SA',
    es: 'es-ES', spanyol: 'es-ES', spanish: 'es-ES',
    fr: 'fr-FR', prancis: 'fr-FR', french: 'fr-FR',
    de: 'de-DE', jerman: 'de-DE', german: 'de-DE',
    br: 'pt-BR', pt: 'pt-BR', portugis: 'pt-BR', portuguese: 'pt-BR', brasil: 'pt-BR',
    in: 'hi-IN', hi: 'hi-IN', hindi: 'hi-IN', india: 'hi-IN',
    th: 'th-TH', thai: 'th-TH', thailand: 'th-TH',
    vn: 'vi-VN', vi: 'vi-VN', vietnam: 'vi-VN', vietnamese: 'vi-VN',
    my: 'ms-MY', ms: 'ms-MY', melayu: 'ms-MY', malay: 'ms-MY', malaysia: 'ms-MY',
    it: 'it-IT', italia: 'it-IT', italian: 'it-IT', italy: 'it-IT',
    nl: 'nl-NL', belanda: 'nl-NL', dutch: 'nl-NL',
    pl: 'pl-PL', polandia: 'pl-PL', polish: 'pl-PL',
    ru: 'ru-RU', rusia: 'ru-RU', russian: 'ru-RU',
    tr: 'tr-TR', turki: 'tr-TR', turkish: 'tr-TR', turkey: 'tr-TR',
    se: 'sv-SE', sv: 'sv-SE', swedia: 'sv-SE', swedish: 'sv-SE', sweden: 'sv-SE',
    gr: 'el-GR', el: 'el-GR', yunani: 'el-GR', greek: 'el-GR',
    hu: 'hu-HU', hungaria: 'hu-HU', hungarian: 'hu-HU',
    cz: 'cs-CZ', cs: 'cs-CZ', ceko: 'cs-CZ', czech: 'cs-CZ',
    ro: 'ro-RO', rumania: 'ro-RO', romanian: 'ro-RO',
    dk: 'da-DK', da: 'da-DK', denmark: 'da-DK', danish: 'da-DK',
    fi: 'fi-FI', finlandia: 'fi-FI', finnish: 'fi-FI',
    no: 'nb-NO', norwegia: 'nb-NO', norwegian: 'nb-NO', nb: 'nb-NO',
    il: 'he-IL', he: 'he-IL', ibrani: 'he-IL', hebrew: 'he-IL',
};
/* Shortcode tampil di daftar: pendek & unik (en-GB→gb, uk-UA→ua karena uk dipakai Inggris) */
function ttsDisplayCode(localeCode) {
    const special = { 'en-GB': 'gb', 'uk-UA': 'ua' };
    if (special[localeCode]) return special[localeCode];
    return localeCode.split('-')[0].toLowerCase();
}
/* Tambahkan otomatis: kode locale full (en-gb, es-mx, zh-cn-liaoning, ...) → unik, anti-duplikat */
let _ttsShortcodesReady = false;
async function ensureTtsShortcodes() {
    if (_ttsShortcodesReady) return;
    _ttsShortcodesReady = true;
    try {
        const { TTS_LANGS_FULL } = await import('./tts-langs-full.js');
        for (const l of TTS_LANGS_FULL) {
            const key = l.code.toLowerCase();
            if (!TTS_SHORTCODES[key]) TTS_SHORTCODES[key] = l.code;
        }
        for (const l of TTS_LANGS) {
            const key = l.code.toLowerCase();
            if (!TTS_SHORTCODES[key]) TTS_SHORTCODES[key] = l.code;
        }
    } catch {}
}
/* Google TTS (kecepatan) — khusus Indonesia sebagai opsi cepat */
const TTS_GOOGLE_ID = [
    { id: 'g-normal', engine: 'google', speed: 1.0,  label: '🇮🇩 Normal', desc: 'Google · normal' },
    { id: 'g-slow',   engine: 'google', speed: 0.7,  label: '🐢 Lambat', desc: 'Google · 0.7x' },
    { id: 'g-fast',   engine: 'google', speed: 1.35, label: '🐇 Cepat',  desc: 'Google · 1.35x' },
];
const PFX_TTS_LANG  = '__tts_lang_';
const PFX_TTS_VOICE = '__tts_voice_';
const TTS_TTL_MS = 15 * 60 * 1000;
const pendingTtsChoices = new Map();

/* Kata Inggris umum untuk bantu deteksi bahasa Latin */
const EN_WORDS = new Set('the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take person into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us hello hi hey thanks please'.split(' '));

/** Deteksi bahasa teks → kode locale Edge TTS (hybrid: Unicode range + kata + franc) */
async function detectTtsLang(text) {
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja-JP';
    if (/[\uAC00-\uD7AF]/.test(text)) return 'ko-KR';
    if (/[\u0600-\u06FF]/.test(text)) return 'ar-SA';
    if (/[\u0E00-\u0E7F]/.test(text)) return 'th-TH';
    if (/[\u0900-\u097F]/.test(text)) return 'hi-IN';
    if (/[\u4E00-\u9FFF]/.test(text)) return 'zh-CN';
    const words = text.toLowerCase().split(/\s+/);
    const enHits = words.filter(w => EN_WORDS.has(w.replace(/[^a-z]/g, ''))).length;
    if (enHits >= 2 && words.length > 0 && enHits / words.length > 0.3) return 'en-US';
    try {
        const { franc } = await import('franc');
        const code = franc(text, { minLength: 3 });
        const map = { ind: 'id-ID', zlm: 'id-ID', msa: 'id-ID', eng: 'en-US', spa: 'es-ES', fra: 'fr-FR', deu: 'de-DE', por: 'pt-BR', vie: 'vi-VN', msa2: 'ms-MY' };
        if (code === 'msa' || code === 'zlm') {
            /* Melayu vs Indonesia: default Indonesia (user Indonesia) */
            return 'id-ID';
        }
        return map[code] || 'id-ID';
    } catch { return 'id-ID'; }
}

function getLangEntry(code) {
    const found = TTS_LANGS.find(l => l.code === code);
    if (found) return found;
    if (_ttsAllLangsCache) {
        const f2 = _ttsAllLangsCache.find(l => l.code === code);
        if (f2) return f2;
    }
    return TTS_LANGS[0];
}

/* Hilangkan bendera duplikat: tiap bendera cuma muncul sekali.
   Bahasa pertama (populer) klaim bendera negaranya, bahasa lain
   di negara yang sama pakai 🗣️ */
function dedupeTtsFlags(langs) {
    const seen = new Set();
    for (const l of langs) {
        const idx = l.label.indexOf(' ');
        const flag = idx > 0 ? l.label.slice(0, idx) : l.label;
        if (seen.has(flag)) {
            l.label = '🗣️' + l.label.slice(idx);
        } else {
            seen.add(flag);
        }
    }
    return langs;
}

/* Daftar bahasa gabungan: 30 populer di atas, sisanya alfabetis */
let _ttsAllLangsCache = null;
async function getAllTtsLangs() {
    if (_ttsAllLangsCache) return _ttsAllLangsCache;
    const { TTS_LANGS_FULL } = await import('./tts-langs-full.js');
    const popularCodes = new Set(TTS_LANGS.map(l => l.code));
    const rest = TTS_LANGS_FULL.filter(l => !popularCodes.has(l.code))
        .sort((a, b) => a.label.localeCompare(b.label));
    _ttsAllLangsCache = dedupeTtsFlags([...TTS_LANGS, ...rest]);
    return _ttsAllLangsCache;
}

function findTtsVoice(voiceId) {
    for (const l of TTS_LANGS) {
        const found = l.voices.find(v => v.id === voiceId);
        if (found) return { ...found, engine: 'edge' };
    }
    /* Cari di full list (async tidak bisa di sini — pakai cache) */
    if (_ttsAllLangsCache) {
        for (const l of _ttsAllLangsCache) {
            const found = l.voices.find(v => v.id === voiceId);
            if (found) return { ...found, engine: 'edge' };
        }
    }
    const g = TTS_GOOGLE_ID.find(x => x.id === voiceId);
    return g || null;
}

function storeTtsChoice(text, from, cmdMsg) {
    const now = Date.now();
    for (const [k, v] of pendingTtsChoices) {
        if (v.expiresAt <= now) pendingTtsChoices.delete(k);
    }
    const token = crypto.randomBytes(4).toString('hex');
    const quotedCmd = cmdMsg?.key ? {
        key: cmdMsg.key,
        message: { conversation: String(cmdMsg.text || `.tts ${text}`).trim().slice(0, 200) },
    } : null;
    pendingTtsChoices.set(token, { text, from, quotedCmd, botMsgKey: null, expiresAt: now + TTS_TTL_MS });
    return token;
}

/** Ambil ID tap dari pesan interactive response */
function extractTapId(m) {
    try {
        const msg = m.message || {};
        const ir = msg.interactiveResponseMessage || msg.buttonsResponseMessage || msg.listResponseMessage;
        if (ir?.selectedRowId) return ir.selectedRowId;
        if (ir?.selectedButtonId) return ir.selectedButtonId;
        const native = msg.interactiveResponseMessage?.nativeFlowResponseMessage;
        if (native?.paramsJson) {
            const p = JSON.parse(native.paramsJson);
            if (p.id) return p.id;
        }
    } catch (_) {}
    return String(m.text || '');
}

/**
 * Hitung waveform (buat bubble VN WhatsApp bergelombang, bukan garis progress polos).
 * Baileys sebenarnya bisa generate ini otomatis, TAPI versi `audio-decode` yang
 * terpasang (3.11.x) return objek {channelData, sampleRate} — bukan AudioBuffer
 * dengan method getChannelData() yang dipanggil kode Baileys — jadi selalu gagal
 * diam-diam dan bubble jatuh ke tampilan garis progress polos, bukan gelombang.
 * Makanya di-generate manual di sini pakai package yang sama, algoritma sama
 * persis dengan punya Baileys (64 sample, dinormalisasi, dikali 100), lalu
 * dikirim langsung lewat properti `waveform` supaya Baileys skip proses otomatisnya.
 */
async function computeWaveform(oggBuffer, logger) {
    try {
        const { default: decoder } = await import('audio-decode');
        const decoded = await decoder(oggBuffer);
        const rawData = typeof decoded.getChannelData === 'function'
            ? decoded.getChannelData(0)
            : decoded.channelData[0];

        const samples = 64;
        const blockSize = Math.floor(rawData.length / samples);
        if (!blockSize) return undefined;

        const filteredData = [];
        for (let i = 0; i < samples; i++) {
            const blockStart = blockSize * i;
            let sum = 0;
            for (let j = 0; j < blockSize; j++) sum += Math.abs(rawData[blockStart + j] || 0);
            filteredData.push(sum / blockSize);
        }
        const multiplier = Math.pow(Math.max(...filteredData) || 1, -1);
        return new Uint8Array(filteredData.map(n => Math.floor(100 * n * multiplier)));
    } catch (err) {
        if (logger) logger('[TTS] Gagal hitung waveform manual: ' + err.message);
        return undefined;
    }
}

const GTTS_URL          = 'https://translate.google.com/translate_tts';
const GTTS_CHUNK_MAXLEN = 190; // aman di bawah limit ±200 karakter/request Google
const MAX_TEXT_LEN      = 800; // aman karena teks dipecah otomatis per ±190 karakter

/** Pecah teks panjang jadi potongan ≤ maxLen, tanpa motong di tengah kata */
function splitTextChunks(text, maxLen = GTTS_CHUNK_MAXLEN) {
    const words = text.trim().split(/\s+/);
    const chunks = [];
    let cur = '';
    for (const w of words) {
        const candidate = cur ? `${cur} ${w}` : w;
        if (candidate.length > maxLen) {
            if (cur) chunks.push(cur);
            cur = w;
        } else {
            cur = candidate;
        }
    }
    if (cur) chunks.push(cur);
    return chunks;
}

/** Download 1 potongan audio dari Google Translate TTS (bahasa Indonesia) */
async function fetchGttsChunk(text) {
    const res = await axios.get(GTTS_URL, {
        params: { ie: 'UTF-8', q: text, tl: 'id', client: 'tw-ob' },
        responseType: 'arraybuffer',
        timeout: 20000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer'   : 'https://translate.google.com/',
        },
        validateStatus: () => true,
    });
    if (res.status !== 200) {
        throw new Error(`Google TTS membalas status ${res.status} (kemungkinan teks per-potongan masih terlalu panjang)`);
    }
    return Buffer.from(res.data);
}

/**
 * Generate voice note bahasa Indonesia lewat Google Translate TTS.
 * Teks dipecah jadi beberapa potongan ≤190 karakter, tiap potongan didownload
 * terpisah, lalu disambung + dikonversi ke OGG Opus dalam satu langkah ffmpeg
 * (pakai concat demuxer, supaya sambungannya mulus tanpa glitch).
 * Hasil buffer OGG/Opus ini siap dikirim langsung sebagai `ptt: true`
 * (voice note asli WhatsApp — bulat, ada gelombang, tanpa tombol download).
 */
async function generateIndoVoiceNote(text, speed = 1.0) {
    const chunks = splitTextChunks(text);
    if (!chunks.length) throw new Error('Teks kosong');

    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const chunkPaths = [];
    const listPath   = path.join(tmpDir, `gtts_list_${id}.txt`);
    const outputPath = path.join(tmpDir, `gtts_out_${id}.ogg`);

    try {
        for (let i = 0; i < chunks.length; i++) {
            const buf = await fetchGttsChunk(chunks[i]);
            const p   = path.join(tmpDir, `gtts_part_${id}_${i}.mp3`);
            fs.writeFileSync(p, buf);
            chunkPaths.push(p);
        }

        const listContent = chunkPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
        fs.writeFileSync(listPath, listContent);

        await execFileAsync('ffmpeg', [
            '-y',
            '-hide_banner',
            '-loglevel', 'error',
            '-f', 'concat',
            '-safe', '0',
            '-i', listPath,
            '-vn',
            '-ac', '1',
            '-ar', '48000',
            ...(speed && Math.abs(speed - 1.0) > 0.01 ? ['-filter:a', `atempo=${speed}`] : []),
            '-c:a', 'libopus',
            '-b:a', '48k',
            '-vbr', 'on',
            '-compression_level', '10',
            outputPath,
        ], { timeout: 60000 });

        if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 512) {
            throw new Error('Hasil konversi ffmpeg kosong/gagal');
        }

        const oggBuf = fs.readFileSync(outputPath);

        let duration = null;
        try {
            const { stdout } = await execFileAsync('ffprobe', [
                '-v', 'error', '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1', outputPath,
            ]);
            duration = Math.round(parseFloat(stdout));
        } catch { /* durasi opsional, tidak fatal kalau gagal */ }

        return { buffer: oggBuf, duration, chunkCount: chunks.length };
    } finally {
        for (const p of chunkPaths) { try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {} }
        try { if (fs.existsSync(listPath)) fs.unlinkSync(listPath); } catch {}
        try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
    }
}

/**
 * Generate voice note via Microsoft Edge TTS (node-edge-tts, tanpa API key).
 * Output mp3 → dikonversi ke OGG Opus PTT seperti jalur Google.
 */
async function generateEdgeVoiceNote(text, voiceName, opts = {}) {
    const { EdgeTTS } = await import('node-edge-tts');
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const id = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const mp3Path = path.join(tmpDir, `edge_${id}.mp3`);
    const oggPath = path.join(tmpDir, `edge_out_${id}.ogg`);

    try {
        const tts = new EdgeTTS({
            voice: voiceName,
            ...(opts.rate ? { rate: opts.rate } : {}),
            ...(opts.pitch ? { pitch: opts.pitch } : {}),
            proxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY || undefined,
        });
        await tts.ttsPromise(text.slice(0, 1000), mp3Path);

        if (!fs.existsSync(mp3Path) || fs.statSync(mp3Path).size < 512) {
            throw new Error('Edge TTS mengembalikan audio kosong');
        }

        await execFileAsync('ffmpeg', [
            '-y', '-hide_banner', '-loglevel', 'error',
            '-i', mp3Path,
            '-vn', '-ac', '1', '-ar', '48000',
            '-c:a', 'libopus', '-b:a', '48k', '-vbr', 'on', '-compression_level', '10',
            oggPath,
        ], { timeout: 60000 });

        if (!fs.existsSync(oggPath) || fs.statSync(oggPath).size < 512) {
            throw new Error('Hasil konversi ffmpeg kosong/gagal');
        }

        const oggBuf = fs.readFileSync(oggPath);

        let duration = null;
        try {
            const { stdout } = await execFileAsync('ffprobe', [
                '-v', 'error', '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1', oggPath,
            ]);
            duration = Math.round(parseFloat(stdout));
        } catch { /* durasi opsional */ }

        return { buffer: oggBuf, duration };
    } finally {
        try { if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path); } catch {}
        try { if (fs.existsSync(oggPath)) fs.unlinkSync(oggPath); } catch {}
    }
}

// ── COMMAND HANDLER UTAMA ──────────────────────────────────────────────────────

async function handleAnyvoice({ hisoka, m, query, tolak, logCommand, logError, Button }) {
    try {
        logCommand(m, hisoka, m.command || 'tts');

        const trimmed = (query || '').trim();

        /* ── `.tts` tanpa teks → tampilkan daftar bahasa populer + cara pakai ── */
        if (!trimmed) {
            const langList = TTS_LANGS.map(l => {
                return `${l.label} \`.tts teks | ${ttsDisplayCode(l.code)}\``;
            }).join('\n');
            await tolak(hisoka, m,
                `🗣️ *TTS Multi-Bahasa*\n\n` +
                `> _Contoh:_\n> _.tts halo apa kabar_\n> _.tts hello world | en_\n> _.tts こんにちは | jp_\n\n` +
                `🌍 *Bahasa tersedia:*\n${langList}`
            );
            return;
        }

        /* ── Parse syntax `.tts teks | kode` → langsung ke bahasa tsb ── */
        let textPart = trimmed;
        let forcedLang = null;
        await ensureTtsShortcodes();
        const pipeMatch = trimmed.match(/\|\s*([a-zA-Z-]+)\s*$/);
        if (pipeMatch) {
            const code = pipeMatch[1].toLowerCase();
            const mapped = TTS_SHORTCODES[code];
            if (mapped) {
                forcedLang = mapped;
                textPart = trimmed.slice(0, pipeMatch.index).trim();
            }
        }
        if (!textPart) {
            await tolak(hisoka, m, `❌ Teksnya mana?\n> _Contoh: .tts halo apa kabar | jp_`);
            return;
        }
        if (textPart.length > MAX_TEXT_LEN) {
            await tolak(hisoka, m, `❌ *Teks terlalu panjang.*\n> _Maks ${MAX_TEXT_LEN} karakter, punyamu ${textPart.length}_`);
            return;
        }
        const finalText = textPart;

        await hisoka.sendMessage(m.from, { react: { text: '🔊', key: m.key } });

        const token = storeTtsChoice(finalText, m.from, m);

        /* ── Jika bahasa di-force via `| kode` → langsung tampilkan picker suara ── */
        if (forcedLang) {
            await getAllTtsLangs().catch(() => {});
            const lang = getLangEntry(forcedLang);
            await showVoicePicker({ hisoka, m, token, lang, pending: pendingTtsChoices.get(token), tolak, logError, Button });
            return;
        }

        /* ── Tahap 1: picker bahasa single-select ── */
        const preview = finalText.length > 80 ? finalText.slice(0, 80) + '…' : finalText;
        const pickerText = `🗣️ *Pilih Bahasa TTS*\n\n> _"${preview}"_\n\nPilih bahasa dulu, lalu pilih suaranya~\n> _Tips: .tts teks | jp langsung ke Jepang_`;

        let sentBtn = null;
        if (typeof Button === 'function') {
            try {
                const allLangs = await getAllTtsLangs();
                const btn = new Button()
                    .setBody(pickerText)
                    .setFooter('🔊 TTS • WilyBot')
                    .addSelection('🌍 Pilih Bahasa');
                btn.makeSections(`Bahasa tersedia (${allLangs.length})`);
                btn.makeRow('', '🔍 Auto-detect', 'Deteksi bahasa dari teks otomatis', `${PFX_TTS_LANG}auto_${token}`);
                for (const l of allLangs) {
                    btn.makeRow('', l.label, `${l.voices.length} suara`, `${PFX_TTS_LANG}${l.code}_${token}`);
                }
                sentBtn = await btn.run(m.from, hisoka, m);
            } catch (e) {
                console.error('[TTS] Button send gagal:', e.message);
            }
        }

        const pend = pendingTtsChoices.get(token);
        if (sentBtn?.key) {
            if (pend) pend.botMsgKey = sentBtn.key;
        } else {
            /* Fallback: tanpa picker, auto-detect + suara default Indonesia */
            if (pend) pendingTtsChoices.delete(token);
            const langCode = await detectTtsLang(finalText);
            const lang = getLangEntry(langCode);
            await sendTtsVoiceNote({ hisoka, m, text: finalText, voice: { ...lang.voices[0], engine: 'edge' }, tolak, logError, quotedCmd: m });
        }
    } catch (err) {
        console.error('[TTS] Error:', err?.message);
        if (typeof logError === 'function') logError(err instanceof Error ? err : new Error(String(err?.message || err)), 'tts');
        await tolak(hisoka, m, `❌ Gagal generate suara.\n💬 ${err?.message || 'Coba lagi nanti.'}`);
        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
    }
}

/** Translate teks ke bahasa target via AI (Gemini). Return teks asli jika gagal. */
async function translateTtsText(text, targetLangCode, logger) {
    try {
        const { gemini } = await import('../ai/gemini.js');
        /* Map kode locale ke nama bahasa untuk prompt */
        const langNames = {
            'id-ID': 'Indonesian', 'en-US': 'English', 'en-GB': 'English (UK)',
            'ja-JP': 'Japanese', 'ko-KR': 'Korean', 'zh-CN': 'Chinese (Simplified)',
            'ar-SA': 'Arabic', 'es-ES': 'Spanish', 'fr-FR': 'French', 'de-DE': 'German',
            'pt-BR': 'Portuguese (Brazil)', 'hi-IN': 'Hindi', 'th-TH': 'Thai',
            'vi-VN': 'Vietnamese', 'ms-MY': 'Malay', 'it-IT': 'Italian',
            'nl-NL': 'Dutch', 'pl-PL': 'Polish', 'ru-RU': 'Russian', 'tr-TR': 'Turkish',
            'sv-SE': 'Swedish', 'el-GR': 'Greek', 'hu-HU': 'Hungarian', 'cs-CZ': 'Czech',
            'ro-RO': 'Romanian', 'uk-UA': 'Ukrainian', 'da-DK': 'Danish', 'fi-FI': 'Finnish',
            'nb-NO': 'Norwegian', 'he-IL': 'Hebrew',
        };
        const targetName = langNames[targetLangCode] || targetLangCode;
        const prompt = `Translate the following text to ${targetName}. IMPORTANT: Add natural punctuation (commas, periods — use 、。 for Japanese, ，。 for Chinese) appropriate for ${targetName}, even if the original text has no punctuation. This is for text-to-speech, so punctuation controls pauses and intonation. Reply with ONLY the translation, no explanations, no quotes:\n\n${text}`;
        const result = await gemini.ask(prompt, { model: 'gemini-2.0-flash' });
        const translated = String(result || '').trim().replace(/^["'「」『』]+|["'「」『』]+$/g, '');
        if (translated && translated.length > 0 && translated.length < text.length * 5) {
            return translated;
        }
        return text;
    } catch (err) {
        if (logger) logger('[TTS] Translate gagal: ' + err.message);
        return text;
    }
}

/** Generate + kirim voice note sesuai pilihan suara, quote command asli */
async function sendTtsVoiceNote({ hisoka, m, text, voice, tolak, logError, quotedCmd }) {
    await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } }).catch(() => {});
    try {
        /* Auto-translate: jika bahasa teks beda dengan bahasa suara, translate dulu */
        let speakText = text;
        let translatedInfo = null;
        try {
            const textLang = await detectTtsLang(text);
            const voiceLang = voice.voice ? voice.voice.split('-').slice(0, 2).join('-') : null;
            if (textLang && voiceLang && textLang !== voiceLang && voice.engine === 'edge') {
                const translated = await translateTtsText(text, voiceLang);
                if (translated !== text) {
                    speakText = translated;
                    const tLang = getLangEntry(textLang);
                    const vLang = getLangEntry(voiceLang);
                    translatedInfo = `🌐 *Auto-translate*\n> _${tLang.label} → ${vLang.label}_\n> _"${translated.length > 100 ? translated.slice(0, 100) + '…' : translated}"_`;
                }
            }
        } catch {}

        let result;
        if (voice.engine === 'edge') {
            result = await generateEdgeVoiceNote(speakText, voice.voice, { rate: voice.rate, pitch: voice.pitch });
        } else {
            result = await generateIndoVoiceNote(speakText, voice.speed || 1.0);
        }
        const waveform = await computeWaveform(result.buffer);

        await hisoka.sendMessage(m.from, {
            audio   : result.buffer,
            mimetype: 'audio/ogg; codecs=opus',
            ptt     : true,
            ...(waveform ? { waveform } : {}),
        }, { quoted: quotedCmd || m });

        if (translatedInfo) {
            await hisoka.sendMessage(m.from, { text: translatedInfo }, { quoted: quotedCmd || m }).catch(() => {});
        }

        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } }).catch(() => {});
    } catch (err) {
        console.error('[TTS] Error:', err?.message);
        if (typeof logError === 'function') logError(err instanceof Error ? err : new Error(String(err?.message || err)), 'tts');
        await tolak(hisoka, m, `❌ Gagal generate suara *${voice.label}*.\n💬 ${err?.message || 'Coba lagi nanti.'}`);
        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } }).catch(() => {});
    }
}

/** Handle tap di picker .tts — 2 tahap: bahasa → suara */
/** Tampilkan picker suara untuk bahasa tertentu (dipakai dari `| kode` & callback tahap 1) */
async function showVoicePicker({ hisoka, m, token, lang, pending, tolak, logError, Button }) {
    /* Hapus picker bahasa sebelumnya */
    if (pending?.botMsgKey) {
        try { await hisoka.sendMessage(m.from, { delete: pending.botMsgKey }); } catch (_) {}
        pending.botMsgKey = null;
    }

    const preview = pending.text.length > 60 ? pending.text.slice(0, 60) + '…' : pending.text;
    const pickerText = `🗣️ *Pilih Suara* — ${lang.label}\n\n> _"${preview}"_\n\nPilih suara, voice note langsung dikirim~`;

    let sentBtn = null;
    if (typeof Button === 'function') {
        try {
            const btn = new Button()
                .setBody(pickerText)
                .setFooter('🔊 TTS • WilyBot')
                .addSelection('🎙️ Pilih Suara');
            btn.makeSections(`Suara ${lang.label}`);
            for (const v of lang.voices) {
                btn.makeRow('', v.label, v.desc, `${PFX_TTS_VOICE}${v.id}_${token}`);
            }
            /* Opsi Google cepat untuk Indonesia */
            if (lang.code === 'id-ID') {
                for (const g of TTS_GOOGLE_ID) {
                    btn.makeRow('', g.label, g.desc, `${PFX_TTS_VOICE}${g.id}_${token}`);
                }
            }
            sentBtn = await btn.run(m.from, hisoka, m);
        } catch (e) {
            console.error('[TTS] Button suara gagal:', e.message);
        }
    }
    if (sentBtn?.key) {
        pending.botMsgKey = sentBtn.key;
    } else {
        /* Fallback: kirim suara pertama bahasa tsb */
        pendingTtsChoices.delete(token);
        await sendTtsVoiceNote({ hisoka, m, text: pending.text, voice: { ...lang.voices[0], engine: 'edge' }, tolak, logError, quotedCmd: pending.quotedCmd });
    }
}

async function handleTtsCallback({ hisoka, m, tolak, logCommand, logError, Button }) {
    const raw = extractTapId(m);
    const isLang = raw.startsWith(PFX_TTS_LANG);
    const isVoice = raw.startsWith(PFX_TTS_VOICE);
    if (!isLang && !isVoice) return false;

    const pfx = isLang ? PFX_TTS_LANG : PFX_TTS_VOICE;
    const rest = raw.slice(pfx.length);
    const sepIdx = rest.lastIndexOf('_');
    if (sepIdx < 0) return false;
    const selId = rest.slice(0, sepIdx);
    const token = rest.slice(sepIdx + 1);

    const pending = pendingTtsChoices.get(token);
    if (!pending || pending.expiresAt <= Date.now()) {
        if (pending?.botMsgKey) {
            try { await hisoka.sendMessage(m.from, { delete: pending.botMsgKey }); } catch (_) {}
        }
        pendingTtsChoices.delete(token);
        await tolak(hisoka, m, '⏳ *Pilihan sudah kedaluwarsa.*\nKirim *.tts* lagi ya~');
        return true;
    }

    /* ── Tahap 1: user pilih bahasa → tampilkan picker suara ── */
    if (isLang) {
        let langCode = selId;
        if (selId === 'auto') {
            langCode = await detectTtsLang(pending.text);
        }
        const lang = getLangEntry(langCode);
        await showVoicePicker({ hisoka, m, token, lang, pending, tolak, logError, Button });
        return true;
    }

    /* ── Tahap 2: user pilih suara → generate ── */
    /* Pastikan cache full langs terisi untuk lookup */
    await getAllTtsLangs().catch(() => {});
    const voice = findTtsVoice(selId);
    if (!voice) return false;

    if (pending.botMsgKey) {
        try { await hisoka.sendMessage(m.from, { delete: pending.botMsgKey }); } catch (_) {}
        pending.botMsgKey = null;
    }
    pendingTtsChoices.delete(token);

    if (typeof logCommand === 'function') logCommand(m, hisoka, 'tts');
    await sendTtsVoiceNote({ hisoka, m, text: pending.text, voice, tolak, logError, quotedCmd: pending.quotedCmd });
    return true;
}

export { handleAnyvoice, handleTtsCallback };
/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const command = /^(anyvoice|tts)$/i;
export const tags = ['media'];
export const help = ['anyvoice'];
export default handleAnyvoice;
