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
 *  play-cmd.js — Play command handler
 *  Perintah .play untuk putar dan download audio/video dari YouTube
 * ───────────────────────────────
 */
/**
 * ═══════════════════════════════════════════════════════════════
 *  Play Command Handler (.play / .playvid)
 *  Cari & download audio (.play) atau video (.playvid) dari
 *  YouTube — tampilkan thumbnail, judul, durasi, dan kirim
 *  file media langsung ke chat WhatsApp.
 * ═══════════════════════════════════════════════════════════════
 */
'use strict';

import path from 'path';
import fs from 'fs';
import { exec, spawn } from 'child_process';

/**
 * Download via yt-dlp (spawn) dengan callback progress % realtime.
 * onProgress(pct|null, fase): pct = 0-100 saat download, null saat fase tanpa % (merge).
 */
function ytdlpDownload(bin, args, timeoutMs, parseYtdlpError, onProgress) {
        return new Promise((resolve, reject) => {
                const proc = spawn(bin, args, { timeout: timeoutMs });
                let stderr = '';
                let lastPct = -1, lastEdit = 0, inMerger = false;
                const pushChunk = (txt) => {
                        const s = String(txt);
                        // Fase merge ffmpeg: tidak ada %, tampilkan status merge
                        if (/\[Merger\]/.test(s) && !inMerger) {
                                inMerger = true;
                                try { onProgress(null, 'merge'); } catch (_) {}
                        }
                        const mm = s.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
                        if (!mm) return;
                        inMerger = false;
                        const pct = parseFloat(mm[1]);
                        const now = Date.now();
                        if (pct - lastPct >= 3 && now - lastEdit > 2000) {
                                lastPct = pct; lastEdit = now;
                                try { onProgress(pct, 'download'); } catch (_) {}
                        }
                };
                proc.stdout.on('data', pushChunk);
                proc.stderr.on('data', (d) => { stderr += d.toString(); pushChunk(d.toString()); });
                proc.on('close', (code) => {
                        if (code === 0) resolve();
                        else reject(new Error(parseYtdlpError(stderr, `yt-dlp exit ${code}`)));
                });
                proc.on('error', (e) => reject(new Error(parseYtdlpError('', e.message))));
        });
}

/**
 * Handle pending play choice (user tap 1 tombol download).
 * 1 tombol → hapus pesan tombol → kirim 2 file: video MP4 (thumbnail + caption
 * lengkap) + audio sebagai voice note (waveform sesuai suara).
 * Dipanggil dari message.js sebelum switch-case.
 * @returns {boolean} true jika pesan sudah diproses (return langsung)
 */
async function handlePlayChoice({
        hisoka, m,
        pendingPlayChoices,
        ensureYtdlp, parseYtdlpError,
        tolak, logCommand,
}) {
        if (!pendingPlayChoices.has(m.sender)) return false;

        const choice = (m.text || '').trim();
        if (choice !== '1') return false;

        const pending = pendingPlayChoices.get(m.sender);

        if (!pending.downloading) pending.downloading = new Set();
        if (pending.downloading.has(choice)) {
                await m.reply(`⏳ Sedang mengunduh *Video + Voice Note*... harap tunggu.`);
                return true;
        }

        pending.downloading.add(choice);

        if (pending.timeout) {
                clearTimeout(pending.timeout);
                pending.timeout = null;
        }

        // Jalankan async tanpa await supaya pesan lain bisa langsung diproses
        (async () => {
                const tmpId = Date.now();
                const tmpVideo = path.join(process.cwd(), 'tmp', `play_${tmpId}v.mp4`);
                const tmpTemplateV = path.join(process.cwd(), 'tmp', `play_${tmpId}v.%(ext)s`);
                const tmpMp3 = path.join(process.cwd(), 'tmp', `play_${tmpId}a.mp3`);
                const tmpTemplateA = path.join(process.cwd(), 'tmp', `play_${tmpId}a.%(ext)s`);
                const tmpThumbYt = path.join(process.cwd(), 'tmp', `play_${tmpId}v.jpg`);
                const tmpThumbFf = path.join(process.cwd(), 'tmp', `play_${tmpId}t.jpg`);
                const YT_BASE = ['--no-check-certificate', '--extractor-args', 'youtube:player_client=android', '--js-runtimes', 'node', '--no-playlist'];
                let loadingMsg = null;
                const updLoading = (teks) => { if (loadingMsg) m.reply({ edit: loadingMsg.key, text: teks }).catch(() => {}); };
                // Heartbeat: bila tidak ada progress >8 dtk, tampilkan animasi titik agar tak terlihat stuck
                let _hbTimer = null, _hbDots = 0;
                const _hbStop = () => { if (_hbTimer) { clearInterval(_hbTimer); _hbTimer = null; } };
                const _hbStart = (label) => {
                        _hbStop(); _hbDots = 0;
                        _hbTimer = setInterval(() => {
                                _hbDots = (_hbDots + 1) % 4;
                                updLoading(`${label}${'.'.repeat(_hbDots)}`);
                        }, 2000);
                };
                try {
                        // ── Hapus pesan tombol sebelumnya (rapih) ──
                        if (pending.botKey) {
                                try { await hisoka.sendMessage(m.from, { delete: pending.botKey }); } catch (_) {}
                        }
                        await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
                        loadingMsg = await tolak(hisoka, m, `⏳ *_Mengunduh..._*`);

                        if (pending.seconds > 300) {
                                await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                                await m.reply({ edit: loadingMsg.key, text: `❌ Durasi terlalu panjang untuk video!\n~${pending.duration}~ > \`5:00\` maksimal.\n\n_Coba lagu yang lebih pendek._` });
                                return;
                        }

                        const ytdlpBin = await ensureYtdlp(hisoka, m);

                        // ── 1. Download VIDEO MP4 (360p) + thumbnail resmi YT + progress % ──
                        _hbStart(`⏳ *_Mengunduh video..._*\n📌 *${pending.title}*`);
                        await ytdlpDownload(ytdlpBin, [...YT_BASE,
                                '-f', 'bestvideo[height<=360]+bestaudio/best[height<=360]',
                                '--merge-output-format', 'mp4',
                                '--postprocessor-args', 'ffmpeg:-c:v libx264 -c:a aac -movflags +faststart -preset fast -crf 28',
                                '--write-thumbnail', '--convert-thumbnails', 'jpg',
                                '-o', tmpTemplateV, pending.url,
                        ], 240000, parseYtdlpError, (pct, fase) => {
                                _hbStop();
                                if (fase === 'merge') _hbStart(`🔄 *_Menggabungkan video + audio..._*\n📌 *${pending.title}*`);
                                else updLoading(`⏳ *_Mengunduh video..._* \`${Math.floor(pct)}%\`\n📌 *${pending.title}*`);
                        });
                        _hbStop();

                        // ── 2. Download AUDIO → convert ke voice note ──
                        _hbStart(`⏳ *_Mengunduh audio..._*\n📌 *${pending.title}*`);
                        await ytdlpDownload(ytdlpBin, [...YT_BASE,
                                '-x', '--audio-format', 'mp3', '--audio-quality', '5',
                                '-o', tmpTemplateA, pending.url,
                        ], 120000, parseYtdlpError, (pct, fase) => {
                                _hbStop();
                                updLoading(`⏳ *_Mengunduh audio..._* \`${Math.floor(pct)}%\`\n📌 *${pending.title}*`);
                        });
                        _hbStop();

                        updLoading(`🎵 *_Mengonversi ke voice note..._*`);
                        const { toVoiceNote, generateWaveform } = await import('../media/audioconvert.js');
                        const vnBuf = await toVoiceNote(fs.readFileSync(tmpMp3), 'audio/mpeg');
                        const waveform = await generateWaveform(vnBuf, 'audio/ogg; codecs=opus').catch(() => null);

                        // ── 3. Thumbnail: prioritas thumbnail resmi YouTube, fallback frame ffmpeg ──
                        updLoading(`🖼️ *_Menyiapkan thumbnail..._*`);
                        let thumbB64 = null;
                        const ambilThumb = (p) => {
                                try {
                                        const b = fs.readFileSync(p);
                                        if (b.length > 1000 && b.length < 500000) return b.toString('base64');
                                } catch (_) {}
                                return null;
                        };
                        thumbB64 = ambilThumb(tmpThumbYt);
                        if (!thumbB64) {
                                try {
                                        await new Promise((res, rej) => {
                                                exec(`ffmpeg -y -hide_banner -loglevel error -ss 1 -i "${tmpVideo}" -vframes 1 -s 320x180 "${tmpThumbFf}"`, { timeout: 30000 }, (e) => e ? rej(e) : res());
                                        });
                                        thumbB64 = ambilThumb(tmpThumbFf);
                                } catch (_) {}
                        }

                        // ── 4. Kirim VIDEO + caption lengkap ──
                        updLoading(`📤 *_Mengirim video + voice note..._*`);
                        const videoBuffer = fs.readFileSync(tmpVideo);
                        const caption = `🎬 *${pending.title}*\n⏱️ Durasi: \`${pending.duration}\`\n✅ Status: _berhasil diunduh_`;
                        await hisoka.sendMessage(m.from, {
                                video: videoBuffer,
                                mimetype: 'video/mp4',
                                caption,
                                ...(thumbB64 ? { jpegThumbnail: thumbB64 } : {}),
                        }, { quoted: m });

                        // ── 5. Kirim AUDIO sebagai voice note + waveform ──
                        await hisoka.sendMessage(m.from, {
                                audio: vnBuf,
                                mimetype: 'audio/ogg; codecs=opus',
                                ptt: true,
                                ...(waveform ? { waveform } : {}),
                        }, { quoted: m });

                        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                        await m.reply({ edit: loadingMsg.key, text: `✅ *Berhasil dikirim!*\n📌 *${pending.title}*\n\n1. 🎬 Video MP4 (360p)\n2. 🎤 Voice Note` });

                        logCommand(m, hisoka, 'play');
                } catch (error) {
                        _hbStop();
                        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                        if (loadingMsg) await m.reply({ edit: loadingMsg.key, text: `❌ Gagal mengunduh:\n\`${String(error.message || error).substring(0, 200)}\`` }).catch(() => {});
                        else await tolak(hisoka, m, `❌ Gagal mengunduh: ${error.message?.substring(0, 200)}`);
                } finally {
                        _hbStop();
                        try { fs.unlinkSync(tmpVideo); } catch (_) {}
                        try { fs.unlinkSync(tmpMp3); } catch (_) {}
                        try { fs.unlinkSync(tmpThumbYt); } catch (_) {}
                        try { fs.unlinkSync(tmpThumbFf); } catch (_) {}
                        if (pendingPlayChoices.has(m.sender)) {
                                const p = pendingPlayChoices.get(m.sender);
                                if (p.downloading) p.downloading.delete(choice);
                                if (!p.downloading || p.downloading.size === 0) {
                                        if (p.timeout) clearTimeout(p.timeout);
                                        p.timeout = setTimeout(() => {
                                                pendingPlayChoices.delete(m.sender);
                                        }, 2 * 60 * 1000);
                                }
                        }
                }
        })();

        return true;
}

export { handlePlayChoice };