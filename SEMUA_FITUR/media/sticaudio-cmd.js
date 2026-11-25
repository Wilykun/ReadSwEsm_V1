/**
 * sticaudio-cmd.js — Audio Sticker (Baileys Sticker Audio)
 * Sumber: https://pastebin.com/wyZ9dmzh (©iEnz) — diadaptasi ke ESM + ctx bot ini.
 *
 * Cara pakai:
 * 1. Reply pesan audio/voice note lalu .sticaudio → stiker STATIS (gambar lampiran /
 *    media/menu.jpg / placeholder) + audio nempel. HARUS statis: stiker animasi +
 *    audio TIDAK BISA diputar suaranya di HP (terbukti live 2x: video 29 dtk dan
 *    fox zoom 3 dtk sama-sama "Tidak bisa memutar suara stiker", sementara stiker
 *    statis + audio jalan). Jadi mode audio sengaja statis supaya suaranya bunyi.
 * 2. Reply VIDEO (mp4/gif/webp/mov/dll, maks 30 detik) lalu .sticaudio → video jadi
 *    STIKER ANIMASI + suara videonya nempel. Caption video + .sticaudio juga bisa.
 *    (Suara di stiker animasi juga kena batas yang sama di HP — animasinya jalan,
 *    suaranya belum tentu bisa diputar client.)
 * 3. Reply stiker animasi lalu .sticaudio → stiker animasi (tanpa suara, stiker
 *    memang tidak punya audio).
 * 4. `.sticaudio <url YouTube>` (Shorts/watch/youtu.be, maks 30 detik) → bot
 *    unduh videonya via yt-dlp lalu jadi stiker animasi + suara videonya nempel.
 *    Reply pesan yang isinya link YouTube lalu .sticaudio juga bisa.
 *
 * Watermark: stiker WebP ditulis EXIF pack+author dari config.json (sticker.pack /
 * sticker.author, sama seperti .sticker) lewat wa-sticker-formatter.
 *
 * Mekanisme: audio → Opus OGG + gambar → WebP statis 512x512 / video → WebP animasi
 * 512x512 (ffmpeg, maks 500 KB), keduanya di-upload terenkripsi ala WhatsApp
 * (HKDF + AES-256-CBC + HMAC), lalu audio disisipkan ke dalam pesan stiker lewat
 * field proto custom 134 (future-proof body). Video tanpa trek audio tetap jadi
 * stiker animasi biasa (tanpa field 134). Gambar/video diisi PENUH ke 512x512
 * (scale cover + crop tengah, tanpa bar hitam) supaya stikernya sebesar-besarnya
 * dan watermark jatuh di dalam gambar.
 * Patch proto.Message.encode dipasang sekali di modul ini (hanya aktif bila pesannya
 * membawa field mentah) — tanpa patch/restore per kirim, jadi aman dari balapan
 * bila dua .sticaudio jalan bersamaan.
 */
import { proto } from '@whiskeysockets/baileys';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec, execFile } from 'node:child_process';
import util from 'node:util';

const { randomBytes, createCipheriv, createHmac, createHash, hkdfSync } = crypto;
const execFileAsync = util.promisify(execFile);
const execAsync = util.promisify(exec);
const BOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAKS_DETIK = 30;
const MAKS_UNDUH_DETIK = 300;
const MAKS_STIKER_BYTE = 500 * 1024;
const FONT_TEBAL = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

const HKDF = {
  audio: 'WhatsApp Audio Keys',
  sticker: 'WhatsApp Image Keys'
};

// Field mentah di luar definisi proto Baileys (field 134 = future-proof body stiker audio).
const RAW = Symbol('rawFields');
let patchTerpasang = false;
function pasangPatchEncode() {
  if (patchTerpasang) return;
  patchTerpasang = true;
  const originalEncode = proto.Message.encode;
  proto.Message.encode = function (msg, w) {
    const out = originalEncode.call(this, msg, w);
    if (msg && msg[RAW]) {
      for (const [f, body] of msg[RAW]) out.uint32(f * 8 + 2).bytes(body);
    }
    return out;
  };
}
pasangPatchEncode();

const varint = (n) => {
  const o = [];
  while (n > 127) {
    o.push((n % 128) | 128);
    n = Math.floor(n / 128);
  }
  o.push(n);
  return Buffer.from(o);
};

// Field proto length-delimited: tag varint + panjang varint + isi.
const ld = (f, body) => Buffer.concat([varint(f * 8 + 2), varint(body.length), body]);

function parseWebp(b) {
  if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('WebP tidak valid');
  }
  const c = b.toString('ascii', 12, 16);
  if (c === 'VP8 ') {
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff, isAnimated: false };
  }
  if (c === 'VP8L') {
    return {
      width: 1 + (b[21] | ((b[22] & 0x3f) << 8)),
      height: 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10)),
      isAnimated: false
    };
  }
  if (c === 'VP8X') {
    return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3), isAnimated: (b[20] & 2) !== 0 };
  }
  throw new Error('Chunk WebP tidak didukung');
}

const tmpNama = (awalan, ext) => path.join(os.tmpdir(), `${awalan}_${Date.now()}_${randomBytes(4).toString('hex')}${ext ? '.' + ext : ''}`);
const hapusFile = (p) => { try { fs.unlinkSync(p); } catch {} };

async function jalanFfmpeg(args, inBuf, outExt, timeoutMs = 60000) {
  const tmpIn = tmpNama('sa_in');
  const tmpOut = tmpNama('sa_out', outExt);
  fs.writeFileSync(tmpIn, inBuf);
  try {
    await execFileAsync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args(tmpIn, tmpOut)], { timeout: timeoutMs });
    if (!fs.existsSync(tmpOut) || fs.statSync(tmpOut).size === 0) throw new Error('Output ffmpeg kosong');
    return fs.readFileSync(tmpOut);
  } finally {
    hapusFile(tmpIn);
    hapusFile(tmpOut);
  }
}

const toOpus = (input) => jalanFfmpeg(
  (masuk, keluar) => ['-i', masuk, '-vn', '-map_metadata', '-1', '-c:a', 'libopus', '-b:a', '64k', '-ar', '48000', '-ac', '1', '-f', 'ogg', keluar],
  input, 'ogg'
);

// Gambar diisi PENUH ke 512x512 (scale cover + crop tengah), bukan fit + pad —
// video Shorts 360x640 ternyata punya bar hitam di dalam frame-nya sendiri,
// jadi fit + pad bikin gambarnya kecil di tengah dan watermark jatuh di bar
// hitam (di luar gambar). Cover + crop: gambar selalu sebesar-besarnya.
const toWebp = (input) => jalanFfmpeg(
  (masuk, keluar) => ['-i', masuk, '-frames:v', '1', '-vf', 'scale=512:512:force_original_aspect_ratio=increase,crop=512:512', '-c:v', 'libwebp', '-f', 'webp', keluar],
  input, 'webp'
);

// Watermark HANYA di EXIF (metadata pack+author config.json) — TIDAK digambar di
// gambar stikernya. Teks "Bang Wily" yang sempat digambar di stiker SALAH menurut
// Wily (24 Nov 17:36): wm yang benar cuma di script/metadata, tampilnya sebagai
// "Punya • Bang Wily" di bawah stiker saat stiker diketuk — bukan tercetak di gambar.

// Watermark stiker (pack + author) dari config.json — sama seperti .sticker.
// Gagal tulis EXIF tidak boleh menggagalkan stikernya: fallback ke buffer asli.
function ambilStickerConfig(loadConfig) {
  try {
    const cfg = typeof loadConfig === 'function' ? loadConfig() : null;
    const sc = cfg?.sticker;
    if (sc?.pack || sc?.author) return { pack: sc.pack || 'WhatsApp Bot', author: sc.author || 'Wilykun' };
  } catch {}
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(BOT_DIR, 'config.json'), 'utf8'));
    const sc = cfg?.sticker || {};
    return { pack: sc.pack || 'WhatsApp Bot', author: sc.author || 'Wilykun' };
  } catch {}
  return { pack: 'WhatsApp Bot', author: 'Wilykun' };
}
async function tulisExif(stickerBuf, wm) {
  try {
    const { Exif: WSFExif } = await import('wa-sticker-formatter');
    const exif = new WSFExif({ pack: wm.pack, author: wm.author, categories: ['🎭'], id: 'com.wilykun.wabot' });
    const hasil = await exif.add(stickerBuf);
    if (hasil && hasil.length > 0) return Buffer.from(hasil);
  } catch (e) {
    console.error('[sticaudio] EXIF gagal, stiker dikirim tanpa watermark:', e?.message || e);
  }
  return stickerBuf;
}

// Placeholder 512x512 bila tidak ada gambar lampiran dan ./media/menu.jpg tidak ada:
// gradien ungu→pink terang + not musik putih + tulisan AUDIO — jelas kelihatan di
// mode gelap maupun terang. Placeholder lama kotak abu gelap #232323 nyaris tak
// terlihat di mode gelap (stikernya ada + bersuara, gambarnya seperti kotak kosong).
async function placeholderPng() {
  const tmpOut = tmpNama('sa_ph', 'png');
  const vf = fs.existsSync(FONT_TEBAL)
    ? `drawtext=fontfile=${FONT_TEBAL}:text='♪':fontsize=280:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-50,drawtext=fontfile=${FONT_TEBAL}:text='AUDIO':fontsize=56:fontcolor=white:x=(w-text_w)/2:y=h-110`
    : 'null';
  try {
    await execFileAsync('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'gradients=s=512x512:c0=7b2ff7:c1=ff2e63:x0=0:y0=0:x1=512:y1=512',
      '-vf', vf,
      '-frames:v', '1', '-c:v', 'png', tmpOut
    ], { timeout: 60000 });
    if (!fs.existsSync(tmpOut) || fs.statSync(tmpOut).size === 0) throw new Error('Placeholder kosong');
    return fs.readFileSync(tmpOut);
  } finally {
    hapusFile(tmpOut);
  }
}

// Upload media terenkripsi ala WhatsApp (pola yang sama seperti cfc-cch.js): tulis file
// terenkripsi ke tmp, upload lewat waUploadToServer, hapus tmp-nya lagi.
async function uploadMedia(hisoka, plain, kind) {
  const mediaKey = randomBytes(32);
  const k = Buffer.from(hkdfSync('sha256', mediaKey, Buffer.alloc(32), HKDF[kind], 112));
  const iv = k.subarray(0, 16);
  const cipher = createCipheriv('aes-256-cbc', k.subarray(16, 48), iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const mac = createHmac('sha256', k.subarray(48, 80)).update(iv).update(enc).digest().subarray(0, 10);
  const file = Buffer.concat([enc, mac]);
  const fileEncSha256 = createHash('sha256').update(file).digest();
  const tmp = tmpNama(`as-${kind}`, 'enc');
  fs.writeFileSync(tmp, file);
  try {
    const res = await hisoka.waUploadToServer(tmp, {
      fileEncSha256B64: fileEncSha256.toString('base64'),
      mediaType: kind,
      timeoutMs: 60000
    });
    if (!res?.directPath) throw new Error(`${kind} upload returned no directPath`);
    return {
      url: res.mediaUrl || `https://mmg.whatsapp.net${res.directPath}`,
      directPath: res.directPath,
      mediaKey,
      fileEncSha256,
      fileSha256: createHash('sha256').update(plain).digest(),
      fileLength: plain.length,
      mediaKeyTimestamp: Math.floor(Date.now() / 1000)
    };
  } finally {
    hapusFile(tmp);
  }
}

const EXT_DARI_MIME = {
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'video/x-matroska': 'mkv', 'video/3gpp': '3gp', 'video/x-msvideo': 'avi',
  'image/gif': 'gif', 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png'
};
const extDariMime = (mime) => EXT_DARI_MIME[(mime || '').toLowerCase().split(';')[0].trim()] || 'mp4';

// Cek trek audio (ffprobe) + durasi (ffprobe, fallback bila metadata pesan kosong).
async function infoVideo(tmpIn) {
  let adaAudio = false;
  let durasi = 0;
  try {
    const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', tmpIn], { timeout: 15000 });
    adaAudio = String(stdout || '').split('\n').some((s) => s.trim() === 'audio');
  } catch {}
  try {
    const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', tmpIn], { timeout: 15000 });
    durasi = parseFloat(String(stdout || '').trim()) || 0;
  } catch {}
  return { adaAudio, durasi };
}

// Video (semua format yang dikenal ffmpeg: mp4/mov/webm/mkv/gif/webp/dll) →
// stiker animasi WebP 512x512 maks 500 KB + audio Opus (bila ada trek audio).
async function prosesVideo(inputBuf, ext) {
  const tmpIn = tmpNama('sa_vid', ext);
  fs.writeFileSync(tmpIn, inputBuf);
  try {
    const { adaAudio, durasi } = await infoVideo(tmpIn);
    // Video lebih dari 30 detik TIDAK ditolak — dipotong ke 30 detik pertama
    // (stiker maks 30 detik). Penolakan dulu bikin .sticaudio error untuk video
    // 35 detik padahal .ytmp4 bisa unduh videonya.
    const dipotong = Boolean(durasi && durasi > MAKS_DETIK);
    const durasiEfektif = durasi ? Math.min(durasi, MAKS_DETIK) : 0;

    // Tangga kompresi: utamakan GERAKAN HALUS (fps) daripada resolusi. Video
    // panjang/sibuk yang dipaksa 512px jatuh ke 6 fps — gerakannya patah-patah
    // (tiap frame diam 167ms) dan kelihatan delay terhadap suara yang mengalir
    // terus (keluhan 25 Nov: mode URL tidak realtime, suara vs gerakan delay).
    // Diukur di Shorts 4r4sy5coS7s 14,88 dtk: timing suara vs gerakan sebenarnya
    // PAS (offset 0,00–0,01 dtk, durasi WebP 14,83 vs Opus 14,89) — yang rusak
    // hanya fps-nya (efektif 5,0). Tiap anak tangga: fps, skala, daftar quality.
    // Stiker pendek/sederhana tetap 512px 12fps (tangga pertama langsung muat).
    const TANGGA = [
      { fps: 12, skala: 512, quality: [80, 50, 30] },
      { fps: 12, skala: 384, quality: [50, 30] },
      { fps: 9, skala: 384, quality: [50, 30] },
      { fps: 9, skala: 320, quality: [50, 30] },
      { fps: 6, skala: 320, quality: [50, 30] }
    ];
    let stickerBuf = null;
    let fpsDipakai = 12;
    let skalaDipakai = 512;
    for (const anak of TANGGA) {
      for (const q of anak.quality) {
        const tmpOut = tmpNama('sa_vid_out', 'webp');
        try {
          await execFileAsync('ffmpeg', [
            '-y', '-hide_banner', '-loglevel', 'error', '-i', tmpIn,
            '-vf', `fps=${anak.fps},scale=${anak.skala}:${anak.skala}:force_original_aspect_ratio=increase,crop=${anak.skala}:${anak.skala},format=rgba`,
            '-c:v', 'libwebp_anim', '-lossless', '0', '-quality', String(q), '-loop', '0', '-an', '-t', String(MAKS_DETIK), tmpOut
          ], { timeout: 180000 });
          stickerBuf = fs.readFileSync(tmpOut);
        } finally {
          hapusFile(tmpOut);
        }
        if (!stickerBuf || stickerBuf.length === 0) throw new Error('Konversi video ke stiker gagal, output kosong');
        fpsDipakai = anak.fps;
        skalaDipakai = anak.skala;
        if (stickerBuf.length <= MAKS_STIKER_BYTE) break;
      }
      if (stickerBuf && stickerBuf.length <= MAKS_STIKER_BYTE) break;
    }
    // Bila semua tangga masih >500 KB, kirim yang paling kecil anyway (sama seperti dulu).

    let opusBuf = null;
    if (adaAudio) {
      const tmpAu = tmpNama('sa_vid_au', 'ogg');
      try {
        await execFileAsync('ffmpeg', [
          '-y', '-hide_banner', '-loglevel', 'error', '-i', tmpIn,
          '-vn', '-map_metadata', '-1', '-c:a', 'libopus', '-b:a', '64k', '-ar', '48000', '-ac', '1', '-f', 'ogg', '-t', String(MAKS_DETIK), tmpAu
        ], { timeout: 60000 });
        if (fs.existsSync(tmpAu) && fs.statSync(tmpAu).size > 0) opusBuf = fs.readFileSync(tmpAu);
      } finally {
        hapusFile(tmpAu);
      }
    }
    return { stickerBuf, opusBuf, durasi: durasiEfektif, dipotong, fps: fpsDipakai, skala: skalaDipakai };
  } finally {
    hapusFile(tmpIn);
  }
}

// Kirim stiker + audio nempel (field 134). Bila opusBuf kosong (video tanpa suara),
// kirim stiker animasi biasa tanpa audio. Watermark EXIF ditulis dulu ke WebP-nya.
async function kirimStikerAudio(hisoka, m, { stickerBuf, webp, opusBuf, sumberGambar, sumberAudio, wm }) {
  if (wm) stickerBuf = await tulisExif(stickerBuf, wm);
  if (!opusBuf) {
    await hisoka.sendMessage(m.from, { sticker: stickerBuf }, { quoted: m });
    return { messageId: null, adaAudio: false };
  }
  const [a, s] = await Promise.all([
    uploadMedia(hisoka, opusBuf, 'audio'),
    uploadMedia(hisoka, stickerBuf, 'sticker')
  ]);

  const mediaDomainInfo = (key) => ld(74, Buffer.concat([
    Buffer.from([0x08, 0x01]),
    ld(2, key)
  ]));

  const audioBytes = Buffer.concat([
    Buffer.from(proto.Message.AudioMessage.encode(proto.Message.AudioMessage.create({
      url: a.url,
      mimetype: 'audio/ogg; codecs=opus',
      fileSha256: a.fileSha256,
      fileEncSha256: a.fileEncSha256,
      fileLength: a.fileLength,
      mediaKey: a.mediaKey,
      directPath: a.directPath,
      mediaKeyTimestamp: a.mediaKeyTimestamp
    })).finish()),
    ld(17, mediaDomainInfo(a.mediaKey))
  ]);

  const stickerBase = Buffer.concat([
    Buffer.from(proto.Message.StickerMessage.encode(proto.Message.StickerMessage.create({
      url: s.url,
      fileSha256: s.fileSha256,
      fileEncSha256: s.fileEncSha256,
      mediaKey: s.mediaKey,
      mimetype: 'image/webp',
      height: webp.height,
      width: webp.width,
      directPath: s.directPath,
      fileLength: s.fileLength,
      mediaKeyTimestamp: s.mediaKeyTimestamp,
      isAnimated: webp.isAnimated,
      stickerSentTs: Date.now()
    })).finish()),
    ld(17, Buffer.concat([
      mediaDomainInfo(s.mediaKey),
      ld(82, varint(13001))
    ]))
  ]);

  const futureProofBody = ld(1, ld(26, Buffer.concat([stickerBase, ld(26, audioBytes)])));

  const payload = proto.Message.create({
    messageContextInfo: { messageSecret: randomBytes(32) }
  });
  payload[RAW] = [[134, futureProofBody]];

  const result = await hisoka.relayMessage(m.from, payload, {});
  const messageId = typeof result === 'string' ? result : result?.key?.id || result?.messageId || null;
  return { messageId, adaAudio: true };
}

const CARA_PAKAI = (pfx) => `*🎵 .sticaudio — Audio Sticker*\n\n*1. Dari audio:* reply pesan *audio/voice note* lalu ketik *${pfx}sticaudio* — bot bikin stiker *statis* + bersuara saat dibuka di HP. Sengaja statis: stiker animasi + audio tidak bisa diputar suaranya di HP.\n*2. Dari video:* reply *video* (mp4/gif/webp/mov/dll) lalu ketik *${pfx}sticaudio* — video otomatis jadi *stiker animasi* + suara videonya nempel. Caption video + *${pfx}sticaudio* juga bisa.\n*3. Dari stiker:* reply stiker animasi lalu *${pfx}sticaudio* → stiker animasi (tanpa suara).\n*4. Dari URL YouTube:* ketik *${pfx}sticaudio <link YouTube>* (Shorts / watch / youtu.be) — bot unduh videonya lalu jadi *stiker animasi* + suara videonya nempel. Reply pesan yang isinya link YouTube lalu *${pfx}sticaudio* juga bisa.\n\n*Gambar stiker (mode audio):*\n• Lampirkan gambar bareng perintah (kirim gambar + caption *${pfx}sticaudio*)\n• Kalau tidak ada, pakai *media/menu.jpg* bila ada\n• Kalau tidak ada juga, pakai placeholder bawaan\n• Gambar/video diisi penuh ke 512x512 (crop tengah, tanpa bar hitam) supaya stikernya sebesar-besarnya; watermark pack+author ikut config.json\n\n*Catatan:* audio/video maks ${MAKS_DETIK} detik. Video tanpa suara tetap jadi stiker animasi biasa. Fitur ini eksperimental (field proto custom 134) — stiker bersuara tampil di HP yang mendukungnya.`;

// Baca tipe + mime + durasi dari pesan (quoted maupun pesan perintah sendiri).
function infoMediaPesan(msg, getMediaTypeFromMessage) {
  const tipe = msg?.type || (typeof getMediaTypeFromMessage === 'function' ? getMediaTypeFromMessage(msg) : '') || '';
  const konten = msg?.content || msg?.msg || {};
  const mentah = msg?.message || {};
  const isi = mentah[tipe] || konten || {};
  const mime = konten.mimetype || msg?.msg?.mimetype || isi.mimetype || '';
  const detik = Number(konten.seconds || msg?.msg?.seconds || isi.seconds || 0) || 0;
  return { tipe, mime, detik };
}

async function unduhPesan(hisoka, msg, downloadMediaMessage) {
  return downloadMediaMessage(
    msg?.raw ? { ...msg, message: msg.raw } : msg,
    'buffer',
    {},
    { logger: hisoka.logger, reuploadRequest: hisoka.updateMediaMessage }
  );
}

// Cari link YouTube di teks (argumen perintah atau teks pesan yang di-reply):
// youtube.com/shorts/…, watch?v=…, embed/…, live/…, youtu.be/… (plus www/m/music).
const cariUrlYoutube = (teks) => {
  const m = String(teks || '').match(/https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?[^ \s]*?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)[\w-]{6,}[^\s]*/i);
  return m ? m[0].replace(/[)\].,;]+$/, '') : '';
};

// Unduh video YouTube via yt-dlp bot (bin/yt-dlp, selector sama seperti .ytmp4 —
// sudah diperbaiki untuk Shorts vertikal). Cek durasi dulu via --dump-json; video
// di atas 5 menit ditolak (biar tidak unduh file raksasa), video 30 detik–5 menit
// tetap jalan dan DIPOTONG ke 30 detik di prosesVideo. Unduh dicoba 2x karena
// YouTube kadang gagal sesaat (eksperimen SABR). Kembalikan { buf, durasi, judul }.
const YTDLP_BIN = path.join(BOT_DIR, 'bin', 'yt-dlp');
async function unduhYtVideo(url) {
  if (!fs.existsSync(YTDLP_BIN)) throw new Error('yt-dlp belum terpasang di bot (bin/yt-dlp tidak ada).');
  const cookie = fs.existsSync(path.join(BOT_DIR, 'cookies.txt')) ? ` --cookies "${path.join(BOT_DIR, 'cookies.txt')}"` : '';
  const flagDasar = `--no-check-certificate --extractor-args "youtube:player_client=android" --js-runtimes node --no-playlist${cookie}`;
  let metaRaw;
  try {
    metaRaw = (await execAsync(`"${YTDLP_BIN}" ${flagDasar} --dump-json "${url}"`, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 })).stdout.trim();
  } catch (e) {
    console.error('[sticaudio] dump-json gagal:', (e?.stderr || e?.message || e).toString().slice(-300));
    throw new Error('Gagal ambil info video YouTube (coba lagi nanti).');
  }
  const meta = JSON.parse(metaRaw);
  const durasi = Math.round(meta.duration || 0);
  if (!durasi) throw new Error('Durasi video YouTube tidak terbaca.');
  if (durasi > MAKS_UNDUH_DETIK) throw new Error(`Video terlalu panjang (${durasi} detik).\nMaksimal *5 menit* untuk audio sticker.`);
  const tmpId = Date.now();
  const tmpTemplate = path.join(os.tmpdir(), `sticaudio_yt_${tmpId}.%(ext)s`);
  const tmpFile = path.join(os.tmpdir(), `sticaudio_yt_${tmpId}.mp4`);
  let gagal = null;
  for (let percobaan = 1; percobaan <= 2; percobaan++) {
    try {
      await execAsync(`"${YTDLP_BIN}" ${flagDasar} -f "bestvideo[height<=360]+bestaudio/best[height<=360]/best" --merge-output-format mp4 -o "${tmpTemplate}" "${url}"`, { timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
      gagal = null;
      break;
    } catch (e) {
      gagal = e;
      console.error(`[sticaudio] unduh yt percobaan ${percobaan} gagal:`, (e?.stderr || e?.message || e).toString().slice(-300));
    }
  }
  if (gagal) throw new Error('Gagal unduh video YouTube (coba lagi nanti).');
  const buf = fs.readFileSync(tmpFile);
  try { fs.unlinkSync(tmpFile); } catch {}
  return { buf, durasi, judul: String(meta.title || '').slice(0, 60) };
}

async function handleSticAudio(ctx) {
  const { hisoka, m, tolak, logCommand, downloadMediaMessage, getMediaTypeFromMessage, pfx, loadConfig, query, txt } = ctx;
  const wm = ambilStickerConfig(loadConfig);
  try {
    const quoted = m.quoted;
    const q = quoted ? infoMediaPesan(quoted, getMediaTypeFromMessage) : { tipe: '', mime: '', detik: 0 };
    const p = infoMediaPesan(m, getMediaTypeFromMessage);
    const mimeDokumen = (x) => (x.mime || '').toLowerCase();

    const isVideoTipe = (x) => x.tipe === 'videoMessage'
      || (x.tipe === 'documentMessage' && (mimeDokumen(x).startsWith('video/') || mimeDokumen(x) === 'image/gif'))
      || x.tipe === 'stickerMessage';
    const isAudioTipe = (x) => x.tipe === 'audioMessage'
      || (x.tipe === 'documentMessage' && mimeDokumen(x).startsWith('audio/'));

    const videoQuoted = m.isQuoted && isVideoTipe(q);
    const videoPerintah = m.isMedia && isVideoTipe(p);
    const audioQuoted = m.isQuoted && isAudioTipe(q);
    // Mode URL: argumen perintah atau teks pesan yang di-reply berisi link YouTube.
    const urlYt = cariUrlYoutube(query || txt || '') || cariUrlYoutube(quoted?.text || '');

    if (!videoQuoted && !videoPerintah && !audioQuoted && !urlYt) {
      await tolak(hisoka, m, CARA_PAKAI(pfx || '.'));
      logCommand(m, hisoka, m.command || 'sticaudio');
      return;
    }

    let sumberVideo = videoQuoted ? q : (videoPerintah ? p : null);
    let videoBufUrl = null;
    let judulYt = '';
    if (urlYt) {
      await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
      const yt = await unduhYtVideo(urlYt);
      videoBufUrl = yt.buf;
      judulYt = yt.judul;
      sumberVideo = { tipe: 'videoMessage', mime: 'video/mp4', detik: yt.durasi };
    }
    if (sumberVideo && sumberVideo.detik && sumberVideo.detik > MAKS_UNDUH_DETIK) {
      await tolak(hisoka, m, `❌ Video terlalu panjang (${sumberVideo.detik} detik).\nMaksimal *5 menit* untuk audio sticker.`);
      return;
    }
    if (audioQuoted) {
      const detikAudio = q.detik;
      if (detikAudio && detikAudio > MAKS_DETIK) {
        await tolak(hisoka, m, `❌ Audio terlalu panjang (${detikAudio} detik).\nMaksimal *${MAKS_DETIK} detik* untuk audio sticker.`);
        return;
      }
    }

    await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

    // ── Jalur video: jadi stiker animasi + suara video nempel ──
    if (sumberVideo) {
      const videoBuf = videoBufUrl || (videoQuoted
        ? await unduhPesan(hisoka, quoted, downloadMediaMessage)
        : await unduhPesan(hisoka, m, downloadMediaMessage));
      if (!videoBuf || videoBuf.length === 0) {
        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
        await tolak(hisoka, m, '❌ Gagal download video yang di-reply.');
        return;
      }
      const { stickerBuf, opusBuf, durasi, dipotong, fps } = await prosesVideo(videoBuf, extDariMime(sumberVideo.mime));
      const webp = parseWebp(stickerBuf);
      const hasil = await kirimStikerAudio(hisoka, m, {
        stickerBuf, webp,
        opusBuf, wm,
        sumberGambar: 'video', sumberAudio: opusBuf ? 'video' : 'tidak ada'
      });
      await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
      const durasiTeks = durasi ? ` (${Math.round(durasi)} dtk)` : '';
      const potongTeks = dipotong ? ' — video asli lebih dari 30 dtk, dipotong ke 30 dtk' : '';
      const judulTeks = judulYt ? `\nJudul: *${judulYt}*` : '';
      await tolak(hisoka, m, `*${hasil.adaAudio ? 'Audio sticker' : 'Stiker animasi'} terkirim ✅*${judulTeks}\nStiker: *${webp.width}x${webp.height} WebP${webp.isAnimated ? ' animasi' : ''}* (${Math.round(stickerBuf.length / 1024)} KB, ${fps || 12} fps)${durasiTeks}${potongTeks}${hasil.adaAudio ? '\nAudio: *suara video* nempel di stiker' : '\n> _Video ini tidak punya suara, jadi stikernya tanpa audio._'}${hasil.messageId ? `\nID: \`${hasil.messageId}\`` : ''}\n\n> _Buka stikernya di HP — audionya ikut berbunyi bila HP mendukung audio sticker._`);
      logCommand(m, hisoka, m.command || 'sticaudio');
      return;
    }

    // ── Jalur audio: stiker STATIS + audio nempel (animasi + audio = suara tidak bisa diputar di HP) ──
    const rawAudio = await unduhPesan(hisoka, quoted, downloadMediaMessage);
    if (!rawAudio || rawAudio.length === 0) {
      await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
      await tolak(hisoka, m, '❌ Gagal download audio yang di-reply.');
      return;
    }

    // Gambar stiker: lampiran perintah dulu, lalu ./media/menu.jpg, lalu placeholder.
    let gambarBuf = null;
    let sumberGambar = 'placeholder';
    if (m.isMedia && p.tipe === 'imageMessage') {
      gambarBuf = await unduhPesan(hisoka, m, downloadMediaMessage);
      sumberGambar = 'lampiran';
    }
    if (!gambarBuf || gambarBuf.length === 0) {
      const menuJpg = path.join(BOT_DIR, 'media', 'menu.jpg');
      if (fs.existsSync(menuJpg)) {
        gambarBuf = fs.readFileSync(menuJpg);
        sumberGambar = 'media/menu.jpg';
      }
    }
    if (!gambarBuf || gambarBuf.length === 0) {
      gambarBuf = await placeholderPng();
      sumberGambar = 'placeholder';
    }

    const audioInput = Buffer.from(rawAudio);
    const opus = audioInput.subarray(0, 4).toString('ascii') === 'OggS'
      ? { buf: audioInput, mimetype: 'audio/ogg; codecs=opus' }
      : { buf: await toOpus(audioInput), mimetype: 'audio/ogg; codecs=opus' };

    const stickerBuf = await toWebp(gambarBuf);
    const webp = parseWebp(stickerBuf);

    const hasil = await kirimStikerAudio(hisoka, m, {
      stickerBuf, webp,
      opusBuf: opus.buf, wm,
      sumberGambar, sumberAudio: 'audio reply'
    });

    await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
    await tolak(hisoka, m, `*Audio sticker terkirim ✅*\nAudio: *${opus.mimetype}* (${Math.round(opus.buf.length / 1024)} KB) | Stiker: *${webp.width}x${webp.height} WebP* (${Math.round(stickerBuf.length / 1024)} KB, gambar: ${sumberGambar}, wm: ${wm.pack} / ${wm.author})${hasil.messageId ? `\nID: \`${hasil.messageId}\`` : ''}\n\n> _Buka stikernya di HP — audionya ikut berbunyi bila HP mendukung audio sticker._`);
    logCommand(m, hisoka, m.command || 'sticaudio');
  } catch (e) {
    console.error('[sticaudio] Error:', e?.message || e);
    try { await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } }); } catch {}
    await tolak(hisoka, m, `❌ Gagal buat audio sticker: ${e?.message || e}`);
  }
}

export const command = /^(sticaudio)$/i;
export const tags = ['media'];
export const help = ['sticaudio'];
export default handleSticAudio;
