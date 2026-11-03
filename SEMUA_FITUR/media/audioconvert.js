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
 *  audioconvert.js — Konversi format audio
 *  MP3/M4A/OGG/OPUS/MP4 via ffmpeg, .tomp3/.tovn command
 * ───────────────────────────────
 */
/**
 * ═══════════════════════════════════════════════════════════════
 *  Audio Format Converter
 *  Perintah .tomp3 dan .tovn untuk konversi audio/video ke
 *  format MP3 atau voice note (OGG OPUS) menggunakan ffmpeg —
 *  mendukung input dari pesan reply maupun URL langsung.
 * ═══════════════════════════════════════════════════════════════
 */
'use strict';

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

function ensureTmpDir() {
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    return tmpDir;
}

function cleanupFiles(...files) {
    for (const f of files) {
        try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
}

const _AUDIO_EXT_MAP = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/ogg': 'ogg',
    'audio/ogg; codecs=opus': 'ogg',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/webm': 'webm',
    'audio/aac': 'aac',
    'audio/flac': 'flac',
};

/**
 * Convert audio buffer → WhatsApp Voice Note (OGG Opus, PTT)
 * @param {Buffer} inputBuffer - buffer audio apapun (mp3, m4a, ogg, wav, dll)
 * @param {string} inputMime  - mimetype aslinya, untuk tentukan ekstensi input
 * @returns {Promise<Buffer>} - buffer OGG Opus siap dikirim sebagai PTT
 */
async function toVoiceNote(inputBuffer, inputMime = 'audio/mpeg') {
    const tmpDir = ensureTmpDir();
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const ext = _AUDIO_EXT_MAP[inputMime?.toLowerCase().trim()] || 'mp3';

    const inputPath  = path.join(tmpDir, `ac_in_${id}.${ext}`);
    const outputPath = path.join(tmpDir, `ac_out_${id}.ogg`);

    fs.writeFileSync(inputPath, inputBuffer);

    try {
        await execFileAsync('ffmpeg', [
            '-y',
            '-hide_banner',
            '-loglevel', 'error',
            '-i', inputPath,
            '-vn',
            '-ac', '1',
            '-ar', '48000',
            '-c:a', 'libopus',
            '-b:a', '48k',
            '-vbr', 'on',
            '-compression_level', '10',
            outputPath
        ], { timeout: 60000 });

        if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 512) {
            throw new Error('Konversi ke voice note gagal, output kosong.');
        }

        return fs.readFileSync(outputPath);
    } finally {
        cleanupFiles(inputPath, outputPath);
    }
}

/**
 * Generate waveform data dari audio buffer — 64 titik amplitudo PEAK akurat.
 * Pakai ffmpeg decode ke raw PCM mono 8kHz s16le, lalu ambil nilai peak
 * (absolut maksimum) tiap segmen — sesuai visual "gelombang" asli seperti
 * DAW & WhatsApp (bukan RMS yang bikin visual flat).
 * Hasil: Buffer 64 byte, nilai 0–100, siap pakai sebagai `waveform` di Baileys.
 *
 * @param {Buffer} inputBuffer  - buffer audio (OGG Opus, MP3, dll)
 * @param {string} inputMime    - mimetype untuk tentukan ekstensi temp file
 * @param {number} [points=64] - jumlah titik waveform (default 64, sesuai WA)
 * @returns {Promise<Buffer>}   - Buffer berisi `points` byte (0–100)
 */
async function generateWaveform(inputBuffer, inputMime = 'audio/ogg; codecs=opus', points = 64) {
    const tmpDir = ensureTmpDir();
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const ext = _AUDIO_EXT_MAP[inputMime?.toLowerCase().trim()] || 'ogg';

    const inputPath = path.join(tmpDir, `wf_in_${id}.${ext}`);
    const rawPath   = path.join(tmpDir, `wf_raw_${id}.s16le`);

    fs.writeFileSync(inputPath, inputBuffer);

    try {
        // Decode ke raw PCM mono 8kHz s16le — cukup untuk waveform, cepat
        await execFileAsync('ffmpeg', [
            '-y',
            '-hide_banner',
            '-loglevel', 'error',
            '-i', inputPath,
            '-ac', '1',
            '-ar', '8000',
            '-f', 's16le',
            rawPath
        ], { timeout: 30000 });

        if (!fs.existsSync(rawPath) || fs.statSync(rawPath).size < 2) {
            return Buffer.alloc(points, 0);
        }

        const raw = fs.readFileSync(rawPath);
        const totalSamples = raw.length / 2; // s16le = 2 byte/sample

        if (totalSamples === 0) return Buffer.alloc(points, 0);

        const waveform = Buffer.alloc(points);
        const chunkSize = Math.max(1, Math.floor(totalSamples / points));

        // Hitung PEAK tiap chunk → nilai 0–100 (fix 2 Nov: RMS bikin visual
        // flat/tidak akurat; peak sesuai "gelombang" asli seperti DAW/WhatsApp)
        let globalMax = 1; // cegah div/0
        const peakValues = new Float32Array(points);

        for (let i = 0; i < points; i++) {
            const startByte = i * chunkSize * 2;
            const endByte   = Math.min(startByte + chunkSize * 2, raw.length);
            let peak = 0;
            for (let j = startByte; j < endByte - 1; j += 2) {
                const sample = Math.abs(raw.readInt16LE(j));
                if (sample > peak) peak = sample;
            }
            peakValues[i] = peak;
            if (peak > globalMax) globalMax = peak;
        }

        // Normalisasi ke 0–100 relatif terhadap peak audio ini
        for (let i = 0; i < points; i++) {
            waveform[i] = Math.min(100, Math.round((peakValues[i] / globalMax) * 100));
        }

        return waveform;
    } catch (_) {
        return Buffer.alloc(points, 0);
    } finally {
        cleanupFiles(inputPath, rawPath);
    }
}

/**
 * Convert audio buffer → MP3
 * @param {Buffer} inputBuffer - buffer audio apapun (ogg opus VN, m4a, wav, dll)
 * @param {string} inputMime  - mimetype aslinya
 * @returns {Promise<Buffer>} - buffer MP3
 */
async function toMP3(inputBuffer, inputMime = 'audio/ogg; codecs=opus') {
    const tmpDir = ensureTmpDir();
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const ext = _AUDIO_EXT_MAP[inputMime?.toLowerCase().trim()] || 'ogg';

    const inputPath  = path.join(tmpDir, `ac_in_${id}.${ext}`);
    const outputPath = path.join(tmpDir, `ac_out_${id}.mp3`);

    fs.writeFileSync(inputPath, inputBuffer);

    try {
        await execFileAsync('ffmpeg', [
            '-y',
            '-hide_banner',
            '-loglevel', 'error',
            '-i', inputPath,
            '-vn',
            '-ac', '2',
            '-ar', '44100',
            '-c:a', 'libmp3lame',
            '-q:a', '4',
            outputPath
        ], { timeout: 60000 });

        if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 512) {
            throw new Error('Konversi ke MP3 gagal, output kosong.');
        }

        return fs.readFileSync(outputPath);
    } finally {
        cleanupFiles(inputPath, outputPath);
    }
}

export { toVoiceNote, toMP3, generateWaveform };
export { handleTovn, handleTomp3 };
// ── HANDLER: tovn ─────────────────────────────────────────────────────────────

async function handleTovn({ hisoka, m, tolak, logCommand, downloadMediaMessage, pfx }) {
        try {
                const audioTypes = ['audioMessage', 'documentMessage'];
                const quoted = m.quoted;
                const isAudio = m.isQuoted && audioTypes.includes(quoted?.type);
                if (!isAudio) {
                        await tolak(hisoka, m, `❌ Reply pesan audio/MP3 untuk dijadikan voice note!\n\nContoh: reply file MP3 lalu ketik *${pfx || '.'}tovn*`);
                        logCommand(m, hisoka, m.command || 'tovn');
                        return;
                }

                const quotedMime = quoted?.content?.mimetype || quoted?.msg?.mimetype || '';
                const isAlreadyVN = quotedMime.includes('ogg') && quoted?.msg?.ptt;
                if (isAlreadyVN) {
                        await tolak(hisoka, m, '❌ File ini sudah berupa voice note!');
                        return;
                }

                await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

                const audioBuffer = await downloadMediaMessage(
                        { ...m.quoted, message: m.quoted.raw },
                        'buffer',
                        {},
                        { logger: hisoka.logger, reuploadRequest: hisoka.updateMediaMessage }
                );

                if (!audioBuffer || audioBuffer.length === 0) {
                        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                        await tolak(hisoka, m, '❌ Gagal download audio.');
                        return;
                }

                const vnBuffer = await toVoiceNote(audioBuffer, quotedMime || 'audio/mpeg');

                // Generate waveform real sesuai isi audio → gelombang di WA ikut suaranya
                let waveformBuf;
                try {
                        waveformBuf = await generateWaveform(vnBuffer, 'audio/ogg; codecs=opus', 64);
                } catch (_) {
                        waveformBuf = undefined;
                }

                await hisoka.sendMessage(m.from, {
                        audio: vnBuffer,
                        mimetype: 'audio/ogg; codecs=opus',
                        ptt: true,
                        ...(waveformBuf ? { waveform: waveformBuf } : {}),
                }, { quoted: m });

                await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                logCommand(m, hisoka, m.command || 'tovn');
        } catch (error) {
                console.error('\x1b[31m[ToVN] Error:\x1b[39m', error.message);
                await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                await tolak(hisoka, m, `❌ Gagal konversi ke VN: ${error.message}`);
        }
}

// ── HANDLER: tomp3 ────────────────────────────────────────────────────────────

async function handleTomp3({ hisoka, m, tolak, logCommand, downloadMediaMessage, pfx }) {
        try {
                const audioTypes = ['audioMessage', 'documentMessage'];
                const quoted = m.quoted;
                const isAudio = m.isQuoted && audioTypes.includes(quoted?.type);
                if (!isAudio) {
                        await tolak(hisoka, m, `❌ Reply voice note atau audio untuk dijadikan MP3!\n\nContoh: reply voice note lalu ketik *${pfx || '.'}tomp3*`);
                        logCommand(m, hisoka, m.command || 'tomp3');
                        return;
                }

                const quotedMime = quoted?.content?.mimetype || quoted?.msg?.mimetype || '';
                const isMP3 = quotedMime.includes('mpeg') || quotedMime.includes('mp3');
                if (isMP3 && !quoted?.msg?.ptt) {
                        await tolak(hisoka, m, '❌ File ini sudah berupa MP3!');
                        return;
                }

                await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

                const audioBuffer = await downloadMediaMessage(
                        { ...m.quoted, message: m.quoted.raw },
                        'buffer',
                        {},
                        { logger: hisoka.logger, reuploadRequest: hisoka.updateMediaMessage }
                );

                if (!audioBuffer || audioBuffer.length === 0) {
                        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                        await tolak(hisoka, m, '❌ Gagal download audio.');
                        return;
                }

                const mp3Buffer = await toMP3(audioBuffer, quotedMime || 'audio/ogg; codecs=opus');

                await hisoka.sendMessage(m.from, {
                        audio: mp3Buffer,
                        mimetype: 'audio/mpeg',
                        ptt: false
                }, { quoted: m });

                await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                logCommand(m, hisoka, m.command || 'tomp3');
        } catch (error) {
                console.error('\x1b[31m[ToMP3] Error:\x1b[39m', error.message);
                await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                await tolak(hisoka, m, `❌ Gagal konversi ke MP3: ${error.message}`);
        }
}


/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const plugins = [
    { command: /^(tovn)$/i, tags: ['media'], help: ['tovn'], handler: 'runHandleTovn' },
    { command: /^(tomp3)$/i, tags: ['media'], help: ['tomp3'], handler: 'runHandleTomp3' },
];
async function runHandleTovn(ctx) {
    const { downloadMediaMessage, hisoka, logCommand, m, tolak } = ctx;
    const pfx = m.prefix || '.';
                                    await handleTovn({ hisoka, m, tolak, logCommand, downloadMediaMessage, pfx });
}
export { runHandleTovn };
async function runHandleTomp3(ctx) {
    const { downloadMediaMessage, hisoka, logCommand, m, tolak } = ctx;
    const pfx = m.prefix || '.';
                                    await handleTomp3({ hisoka, m, tolak, logCommand, downloadMediaMessage, pfx });
}
export { runHandleTomp3 };
