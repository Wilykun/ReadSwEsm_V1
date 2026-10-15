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

/* ── Daftar suara di picker ── */
const TTS_VOICES = [
    { id: 'g-normal', engine: 'google', speed: 1.0,  label: '🇮🇩 Normal', desc: 'Google · kecepatan normal' },
    { id: 'g-slow',   engine: 'google', speed: 0.7,  label: '🐢 Lambat',  desc: 'Google · 0.7x lebih pelan' },
    { id: 'g-fast',   engine: 'google', speed: 1.35, label: '🐇 Cepat',   desc: 'Google · 1.35x lebih cepat' },
    { id: 'e-ardi',   engine: 'edge',   voice: 'id-ID-ArdiNeural',  label: '👨 Ardi',  desc: 'Edge TTS · pria Indonesia' },
    { id: 'e-gadis',  engine: 'edge',   voice: 'id-ID-GadisNeural', label: '👩 Gadis', desc: 'Edge TTS · wanita Indonesia' },
];
const PFX_TTS = '__tts_voice_';
const TTS_TTL_MS = 15 * 60 * 1000;
const pendingTtsChoices = new Map();

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
async function generateEdgeVoiceNote(text, voiceName) {
    const { EdgeTTS } = await import('node-edge-tts');
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const id = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const mp3Path = path.join(tmpDir, `edge_${id}.mp3`);
    const oggPath = path.join(tmpDir, `edge_out_${id}.ogg`);

    try {
        const tts = new EdgeTTS({
            voice: voiceName,
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

async function handleAnyvoice({ hisoka, m, query, tolak, logCommand, logError }) {
    try {
        logCommand(m, hisoka, m.command || 'tts');

        const trimmed = (query || '').trim();

        if (!trimmed) {
            await tolak(hisoka, m, `🗣️ *TTS*\n> _Contoh: .tts halo, apa kabar semuanya?_`);
            return;
        }
        if (trimmed.length > MAX_TEXT_LEN) {
            await tolak(hisoka, m, `❌ *Teks terlalu panjang.*\n> _Maks ${MAX_TEXT_LEN} karakter, punyamu ${trimmed.length}_`);
            return;
        }

        await hisoka.sendMessage(m.from, { react: { text: '🔊', key: m.key } });

        /* ── Tampilkan picker suara single-select ── */
        const preview = trimmed.length > 80 ? trimmed.slice(0, 80) + '…' : trimmed;
        const pickerText = `🗣️ *Pilih Suara TTS*\n\n> _"${preview}"_\n\nPilih suara di bawah, voice note langsung dikirim~`;

        const token = storeTtsChoice(trimmed, m.from, m);

        let sentBtn = null;
        if (typeof Button === 'function') {
            try {
                const btn = new Button()
                    .setBody(pickerText)
                    .setFooter('🔊 TTS • WilyBot')
                    .addSelection('🎙️ Pilih Suara');
                btn.makeSections('Suara tersedia');
                for (const v of TTS_VOICES) {
                    btn.makeRow('', v.label, v.desc, `${PFX_TTS}${v.id}_${token}`);
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
            /* Fallback: tanpa picker, kirim suara normal langsung */
            if (pend) pendingTtsChoices.delete(token);
            await sendTtsVoiceNote({ hisoka, m, text: trimmed, voice: TTS_VOICES[0], tolak, logError, quotedCmd: m });
        }
    } catch (err) {
        console.error('[TTS] Error:', err?.message);
        if (typeof logError === 'function') logError(err instanceof Error ? err : new Error(String(err?.message || err)), 'tts');
        await tolak(hisoka, m, `❌ Gagal generate suara.\n💬 ${err?.message || 'Coba lagi nanti.'}`);
        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
    }
}

/** Generate + kirim voice note sesuai pilihan suara, quote command asli */
async function sendTtsVoiceNote({ hisoka, m, text, voice, tolak, logError, quotedCmd }) {
    await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } }).catch(() => {});
    try {
        let result;
        if (voice.engine === 'edge') {
            result = await generateEdgeVoiceNote(text, voice.voice);
        } else {
            result = await generateIndoVoiceNote(text, voice.speed || 1.0);
        }
        const waveform = await computeWaveform(result.buffer);

        await hisoka.sendMessage(m.from, {
            audio   : result.buffer,
            mimetype: 'audio/ogg; codecs=opus',
            ptt     : true,
            ...(waveform ? { waveform } : {}),
        }, { quoted: quotedCmd || m });

        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } }).catch(() => {});
    } catch (err) {
        console.error('[TTS] Error:', err?.message);
        if (typeof logError === 'function') logError(err instanceof Error ? err : new Error(String(err?.message || err)), 'tts');
        await tolak(hisoka, m, `❌ Gagal generate suara *${voice.label}*.\n💬 ${err?.message || 'Coba lagi nanti.'}`);
        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } }).catch(() => {});
    }
}

/** Handle tap suara di picker .tts */
async function handleTtsCallback({ hisoka, m, tolak, logCommand, logError }) {
    const raw = extractTapId(m);
    if (!raw.startsWith(PFX_TTS)) return false;

    const rest = raw.slice(PFX_TTS.length);
    let voice = null, token = null;
    for (const v of TTS_VOICES) {
        const pfx = `${v.id}_`;
        if (rest.startsWith(pfx)) { voice = v; token = rest.slice(pfx.length); break; }
    }
    if (!voice || !token) return false;

    const pending = pendingTtsChoices.get(token);
    if (!pending || pending.expiresAt <= Date.now()) {
        if (pending?.botMsgKey) {
            try { await hisoka.sendMessage(m.from, { delete: pending.botMsgKey }); } catch (_) {}
        }
        pendingTtsChoices.delete(token);
        await tolak(hisoka, m, '⏳ *Pilihan suara sudah kedaluwarsa.*\nKirim *.tts* lagi ya~');
        return true;
    }

    /* Hapus pesan picker biar chat rapi */
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
