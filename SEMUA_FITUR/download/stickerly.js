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
 *  stickerly.js — Download stiker dari Stickerly
 *  Fetch pack stiker via Stickerly API v4
 * ───────────────────────────────
 */
import archiver from 'archiver';
import axios from 'axios';

const API_BASE = 'https://api.sticker.ly/v4';
const HEADERS = {
  'user-agent': 'androidapp.stickerly/3.17.0 (Redmi Note 4; U; Android 29; in-ID; id;)',
  'content-type': 'application/json',
  'accept-encoding': 'gzip'
};

function extractPackId(input = '') {
  const value = String(input || '').trim();
  const match = value.match(/(?:sticker\.ly\/s\/|sticker\.ly\/pack\/|\/s\/|\/pack\/)([a-z0-9_-]{4,32})/i);
  if (match) return match[1];
  if (/^[a-z0-9_-]{4,32}$/i.test(value)) return value;
  return null;
}

function resourceUrl(prefix, fileName) {
  if (!prefix || !fileName) return null;
  if (/^https?:\/\//i.test(fileName)) return fileName;
  return `${prefix}${fileName}`;
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

class StickerLy {
  async search(query, options = {}) {
    const keyword = String(query || '').trim();
    if (!keyword) throw new Error('Query wajib diisi.');

    const { data } = await axios.post(`${API_BASE}/stickerPack/smartSearch`, {
      keyword,
      enabledKeywordSearch: true,
      filter: {
        extendSearchResult: false,
        sortBy: 'RECOMMENDED',
        languages: ['ALL'],
        minStickerCount: 5,
        searchBy: 'ALL',
        stickerType: 'ALL'
      }
    }, {
      headers: HEADERS,
      timeout: options.timeout || 20000
    });

    const packs = data?.result?.stickerPacks;
    if (!Array.isArray(packs)) return [];

    return packs.slice(0, options.limit || 10).map(pack => {
      const trayIndex = Number.isInteger(pack.trayIndex) ? pack.trayIndex : 0;
      const trayFile = pack.resourceFiles?.[trayIndex] || pack.resourceFiles?.[0] || '';
      return {
        id: pack.packId,
        name: pack.name || 'Tanpa Nama',
        author: pack.authorName || pack.user?.displayName || pack.user?.userName || 'Unknown',
        stickerCount: Array.isArray(pack.resourceFiles) ? pack.resourceFiles.length : normalizeNumber(pack.stickerCount),
        viewCount: normalizeNumber(pack.viewCount),
        exportCount: normalizeNumber(pack.exportCount),
        isPaid: !!pack.isPaid,
        isAnimated: !!(pack.isAnimated || pack.animated),
        thumbnailUrl: resourceUrl(pack.resourceUrlPrefix, trayFile),
        url: pack.shareUrl || (pack.packId ? `https://sticker.ly/s/${pack.packId}` : null)
      };
    }).filter(pack => pack.id || pack.url);
  }

  async detail(input, options = {}) {
    const packId = extractPackId(input);
    if (!packId) throw new Error('URL atau ID Stickerly tidak valid.');

    const { data } = await axios.get(`${API_BASE}/stickerPack/${packId}?needRelation=true`, {
      headers: HEADERS,
      timeout: options.timeout || 20000
    });

    const result = data?.result;
    if (!result) throw new Error('Sticker pack tidak ditemukan.');

    const stickers = Array.isArray(result.stickers) ? result.stickers : [];
    const user = result.user || {};
    const trayIndex = Number.isInteger(result.trayIndex) ? result.trayIndex : 0;
    const traySticker = stickers[trayIndex] || stickers[0] || {};

    return {
      id: result.packId || packId,
      name: result.name || 'StickerLy Pack',
      author: {
        name: user.displayName || result.authorName || user.userName || 'Unknown',
        username: user.userName || '',
        bio: user.bio || '',
        followers: normalizeNumber(user.followerCount),
        following: normalizeNumber(user.followingCount),
        isPrivate: !!user.isPrivate,
        avatar: user.profileUrl || '',
        website: user.website || result.website || '',
        url: user.shareUrl || ''
      },
      stickers: stickers.map(sticker => ({
        id: sticker.sid || '',
        fileName: sticker.fileName,
        isAnimated: !!(sticker.isAnimated || sticker.animated || result.isAnimated || result.animated),
        imageUrl: resourceUrl(result.resourceUrlPrefix, sticker.fileName),
        viewCount: normalizeNumber(sticker.viewCount)
      })).filter(sticker => sticker.fileName && sticker.imageUrl),
      stickerCount: stickers.length,
      viewCount: normalizeNumber(result.viewCount),
      exportCount: normalizeNumber(result.exportCount),
      isPaid: !!result.isPaid,
      isAnimated: !!(result.isAnimated || result.animated),
      thumbnailUrl: resourceUrl(result.resourceUrlPrefix, traySticker.fileName),
      trayIconFileName: traySticker.fileName || '',
      resourceZipUrl: resourceUrl(result.resourceUrlPrefix, result.resourceZip),
      resourceUrlPrefix: result.resourceUrlPrefix || '',
      url: result.shareUrl || `https://sticker.ly/s/${packId}`
    };
  }

  async downloadPackZipBuffer(url, options = {}) {
    if (!/^https?:\/\//i.test(String(url || ''))) throw new Error('URL ZIP pack Stickerly tidak valid.');
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: options.timeout || 30000,
      headers: {
        'user-agent': HEADERS['user-agent'],
        accept: 'application/zip,application/octet-stream,*/*'
      }
    });
    const buffer = Buffer.from(response.data);
    if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) {
      throw new Error('File ZIP pack Stickerly tidak valid.');
    }
    return buffer;
  }

  async downloadStickerBuffer(url, options = {}) {
    if (!/^https?:\/\//i.test(String(url || ''))) throw new Error('URL sticker tidak valid.');
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: options.timeout || 20000,
      headers: {
        'user-agent': HEADERS['user-agent'],
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });
    return Buffer.from(response.data);
  }
}

const stickerly = new StickerLy();

const search = (...args) => stickerly.search(...args);
const detail = (...args) => stickerly.detail(...args);
const downloadPackZipBuffer = (...args) => stickerly.downloadPackZipBuffer(...args);
const downloadStickerBuffer = (...args) => stickerly.downloadStickerBuffer(...args);
export { StickerLy, stickerly, extractPackId, search, detail, downloadPackZipBuffer, downloadStickerBuffer };
export { handleStikerpack };
// ── COMMAND HANDLER ───────────────────────────────────────────────────────────

import { generateWAMessageFromContent, proto } from '@whiskeysockets/baileys';
import crypto from 'crypto';
import https from 'https';
import { PassThrough } from 'stream';
import { getProxyAgents } from '../../src/helper/proxyAgent.js';

/**
 * Upload media pack stiker MANUAL dengan kunci enkripsi khusus sticker-pack.
 *
 * PENTING: file ZIP paket TIDAK BOLEH di-upload sebagai media "sticker" biasa
 * (prepareWAMessageMedia) — WhatsApp mendekripsi media StickerPackMessage
 * dengan HKDF info 'WhatsApp Sticker Pack Keys' dan path /mms/sticker-pack.
 * Kalau di-upload sebagai sticker biasa, dekripsi di HP gagal → semua
 * stiker tampil blank/abu-abu. Pola ini mengikuti implementasi bot yang
 * terbukti jalan (NOVA-XMD stickerlySession).
 */
function _sha256(buf) { return crypto.createHash('sha256').update(buf).digest(); }

async function uploadPackMedia(hisoka, buffer, { hkdfInfo, mediaPath, mediaKey = crypto.randomBytes(32) }) {
        const expanded  = Buffer.from(crypto.hkdfSync('sha256', mediaKey, Buffer.alloc(32), Buffer.from(hkdfInfo), 112));
        const iv        = expanded.subarray(0, 16);
        const cipherKey = expanded.subarray(16, 48);
        const macKey    = expanded.subarray(48, 80);

        const cipher    = crypto.createCipheriv('aes-256-cbc', cipherKey, iv);
        const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
        const mac       = crypto.createHmac('sha256', macKey).update(iv).update(encrypted).digest().subarray(0, 10);
        const encBuffer = Buffer.concat([encrypted, mac]);

        const fileSha256    = _sha256(buffer);
        const fileEncSha256 = _sha256(encBuffer);

        const iq = await hisoka.query({
                tag: 'iq',
                attrs: { id: hisoka.generateMessageTag?.() || String(Date.now()), to: 's.whatsapp.net', type: 'set', xmlns: 'w:m' },
                content: [{ tag: 'media_conn', attrs: {} }]
        });
        const mediaConn = iq.content?.find(v => v.tag === 'media_conn');
        if (!mediaConn) throw new Error('media_conn tidak ditemukan.');
        const auth  = mediaConn.attrs?.auth;
        const hosts = (mediaConn.content || []).filter(v => v.tag === 'host').map(v => v.attrs?.hostname).filter(Boolean);
        if (!auth || !hosts.length) throw new Error('media_conn tidak lengkap.');

        const token = encodeURIComponent(fileEncSha256.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''));
        const agent = getProxyAgents().agent;
        let lastError;
        for (const host of hosts) {
                try {
                        const json = await new Promise((resolve, reject) => {
                                const req = https.request({
                                        hostname: host, port: 443, method: 'POST',
                                        path: `${mediaPath}/${token}?auth=${encodeURIComponent(auth)}&token=${token}`,
                                        headers: { Origin: 'https://web.whatsapp.com', Referer: 'https://web.whatsapp.com/', 'Content-Type': 'application/octet-stream', 'Content-Length': encBuffer.length },
                                        agent,
                                }, (res) => {
                                        let body = '';
                                        res.on('data', c => body += c);
                                        res.on('end', () => {
                                                if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`Upload gagal ${res.statusCode}: ${body.slice(0, 120)}`));
                                                try { resolve(JSON.parse(body)); } catch { reject(new Error('Response upload bukan JSON')); }
                                        });
                                });
                                req.on('error', reject);
                                req.write(encBuffer);
                                req.end();
                        });
                        const directPath = json.direct_path ?? json.directPath;
                        if (!directPath) throw new Error('directPath upload tidak ditemukan.');
                        return { mediaKey, fileLength: buffer.length, fileSha256, fileEncSha256, directPath };
                } catch (e) { lastError = e; }
        }
        throw lastError || new Error('Semua host upload pack gagal.');
}

async function sendStickerPackCard(hisoka, jid, quoted, pack, zipBuffer, trayBuffer) {
        if (!zipBuffer?.length) throw new Error('ZIP pack kosong.');

        // Upload ZIP pack (kunci sticker-pack) + thumbnail (kunci thumbnail, mediaKey sama)
        const packUpload = await uploadPackMedia(hisoka, zipBuffer, { hkdfInfo: 'WhatsApp Sticker Pack Keys', mediaPath: '/mms/sticker-pack' });

        let thumbUpload = null;
        if (trayBuffer?.length) {
                try {
                        const sharp = (await import('sharp')).default;
                        const thumbJpeg = await sharp(trayBuffer).resize(252, 252, { fit: 'cover' }).jpeg().toBuffer();
                        thumbUpload = await uploadPackMedia(hisoka, thumbJpeg, { hkdfInfo: 'WhatsApp Sticker Pack Thumbnail Keys', mediaPath: '/mms/thumbnail-sticker-pack', mediaKey: packUpload.mediaKey });
                } catch (thumbErr) {
                        console.error('[StickerLy] Thumbnail pack upload gagal:', thumbErr.message);
                }
        }

        const stickers = pack.files.map(item => ({
                fileName: item.fileName,
                isAnimated: !!item.isAnimated,
                emojis: ['✨'],
                accessibilityLabel: '',
                isLottie: false,
                mimetype: 'image/webp'
        }));

        const stickerPackMessage = proto.Message.StickerPackMessage.fromObject({
                stickerPackId: String(pack.id || crypto.randomBytes(4).toString('hex')),
                name: String(pack.name || 'StickerLy Pack').slice(0, 128),
                publisher: String(pack.author?.name || 'StickerLy').slice(0, 128),
                stickers,
                fileLength: packUpload.fileLength,
                fileSha256: packUpload.fileSha256,
                fileEncSha256: packUpload.fileEncSha256,
                mediaKey: packUpload.mediaKey,
                directPath: packUpload.directPath,
                caption: pack.url || '',
                contextInfo: {
                        quotedMessage: quoted?.message,
                        stanzaId: quoted?.key?.id,
                        participant: quoted?.sender || quoted?.key?.participant || quoted?.key?.remoteJid
                },
                packDescription: `Stickerly pack: ${pack.url || pack.id}`,
                mediaKeyTimestamp: Math.floor(Date.now() / 1000),
                trayIconFileName: 'tray_icon.webp',
                thumbnailDirectPath: thumbUpload?.directPath,
                thumbnailSha256: thumbUpload?.fileSha256,
                thumbnailEncSha256: thumbUpload?.fileEncSha256,
                thumbnailHeight: 252,
                thumbnailWidth: 252,
                imageDataHash: thumbUpload ? thumbUpload.fileSha256.toString('base64') : undefined,
                stickerPackSize: packUpload.fileLength,
                stickerPackOrigin: proto.Message.StickerPackMessage.StickerPackOrigin.THIRD_PARTY
        });

        const msg = generateWAMessageFromContent(jid, { stickerPackMessage }, { quoted });
        await hisoka.relayMessage(msg.key.remoteJid, msg.message, { messageId: msg.key.id });
        return msg;
}

function zipFiles(files) {
        return new Promise((resolve, reject) => {

                const archive = archiver('zip', { zlib: { level: 0 } });
                const output = new PassThrough();
                const chunks = [];

                output.on('data', chunk => chunks.push(chunk));
                output.on('end', () => resolve(Buffer.concat(chunks)));
                output.on('error', reject);
                archive.on('error', reject);
                archive.pipe(output);

                for (const file of files) {
                        archive.append(file.buffer, {
                                name: file.fileName,
                                store: true
                        });
                }

                archive.finalize();
        });
}

import fs from 'fs';

/** Brand sticker dari config.json ("sticker": { pack, author }) — sama seperti .sticker/.wm */
function getStickerBrand() {
        const candidates = ['config.json', new URL('../../config.json', import.meta.url).pathname];
        for (const p of candidates) {
                try {
                        const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
                        if (cfg?.sticker?.pack && cfg?.sticker?.author) {
                                return { pack: String(cfg.sticker.pack), author: String(cfg.sticker.author) };
                        }
                } catch (_) {}
        }
        return null;
}

/** Buffer EXIF stiker WhatsApp (tag 0x5741, JSON di TIFF) — format wa-sticker-formatter */
function buildStickerExif(pack, author, id) {
        const json = Buffer.from(JSON.stringify({
                'sticker-pack-id': id || 'wily.bot',
                'sticker-pack-name': pack,
                'sticker-pack-publisher': author,
                'emojis': ['✨']
        }), 'utf8');
        const header = Buffer.alloc(22);
        header.writeUInt16LE(0x4949, 0);
        header.writeUInt16LE(0x002A, 2);
        header.writeUInt32LE(8, 4);
        header.writeUInt16LE(1, 8);
        header.writeUInt16LE(0x5741, 10);
        header.writeUInt16LE(7, 12);
        header.writeUInt32LE(json.length, 14);
        header.writeUInt32LE(22, 18);
        return Buffer.concat([header, json]);
}

/** Suntik EXIF ke WebP TANPA re-encode (animasi & kualitas utuh). Gagal → buffer asli. */
function injectStickerExif(webpBuffer, exif) {
        try {
                if (!Buffer.isBuffer(webpBuffer) || webpBuffer.length < 12) return webpBuffer;
                if (webpBuffer.toString('ascii', 0, 4) !== 'RIFF' || webpBuffer.toString('ascii', 8, 12) !== 'WEBP') return webpBuffer;
                const body = webpBuffer.subarray(12);
                const chunks = [];
                let off = 0, vp8xIdx = -1;
                while (off + 8 <= body.length) {
                        const type = body.toString('ascii', off, off + 4);
                        const size = body.readUInt32LE(off + 4);
                        const total = 8 + size + (size % 2);
                        if (off + total > body.length) return webpBuffer;
                        if (type !== 'EXIF') {
                                chunks.push({ type, data: body.subarray(off, off + total) });
                                if (type === 'VP8X') vp8xIdx = chunks.length - 1;
                        }
                        off += total;
                }
                if (off !== body.length) return webpBuffer;
                if (vp8xIdx >= 0) {
                        const c = Buffer.from(chunks[vp8xIdx].data);
                        c[8] = c[8] | 0x08;
                        chunks[vp8xIdx].data = c;
                }
                const exifChunk = Buffer.alloc(8 + exif.length + (exif.length % 2));
                exifChunk.write('EXIF', 0, 'ascii');
                exifChunk.writeUInt32LE(exif.length, 4);
                exif.copy(exifChunk, 8);
                const newBody = Buffer.concat([Buffer.from('WEBP', 'ascii'), ...chunks.map(c => c.data), exifChunk]);
                const out = Buffer.alloc(8 + newBody.length);
                out.write('RIFF', 0, 'ascii');
                out.writeUInt32LE(newBody.length, 4);
                newBody.copy(out, 8);
                return out;
        } catch (_) { return webpBuffer; }
}

/* ── Proses 1 pack detail → kirim (dipakai handler utama + pilihan reply) ── */
async function processStickerlyPack({ hisoka, m, tolak, logCommand, pack, isSatuanSend }) {
        try {
        const stickers = pack.stickers;
        /* Brand EXIF dari config.json — auto mengikuti config, fallback identitas pack asli */
        const brand = getStickerBrand();
        const exifPack   = brand?.pack   || pack.name;
        const exifAuthor = brand?.author || pack.author.name;
        const exifBuf    = buildStickerExif(exifPack, exifAuthor, `stickerly.${pack.id}`);

        if (!stickers.length) {
                await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                await tolak(hisoka, m, '❌ Sticker di pack ini kosong.');
                return;
        }

        const infoBody =
                `🧩 *STICKERLY PACK*\n\n` +
                `- 📦 *Pack:* ${pack.name}\n` +
                `- 🆔 *Kode:* \`${pack.id}\`\n` +
                `- 👤 *Kreator:* ${pack.author.name}${pack.author.username ? ` (@${pack.author.username})` : ''}\n` +
                `- 👥 *Pengikut:* ${(pack.author.followers || 0).toLocaleString('id-ID')}\n` +
                `- 🧩 *Sticker:* ${stickers.length}/${pack.stickerCount}\n` +
                `- 👁️ *Views:* ${pack.viewCount.toLocaleString('id-ID')}\n` +
                `- 📤 *Export:* ${pack.exportCount.toLocaleString('id-ID')}\n` +
                `- 🔗 ${pack.url}`;

        const loadingMsg = await tolak(hisoka, m, infoBody + `\n\n> _${isSatuanSend ? 'Mengirim sticker satuan...' : 'Mengirim sebagai 1 paket sticker...'}_`);

        /* ── Animasi loading MENYATU di pesan info yang sama (tanpa pesan baru) ── */
        const phaseRef = { text: isSatuanSend ? 'Mengirim sticker satuan...' : 'Menyiapkan sticker...' };
        const animBars = ['▱▱▱▱▱▱▱▱', '▰▱▱▱▱▱▱▱', '▰▰▱▱▱▱▱▱', '▰▰▰▱▱▱▱▱', '▰▰▰▰▱▱▱▱', '▰▰▰▰▰▱▱▱', '▰▰▰▰▰▰▱▱', '▰▰▰▰▰▰▰▱', '▰▰▰▰▰▰▰▰'];
        const animSpins = ['⏳', '⌛'];
        let animTick = 0;
        const animTimer = loadingMsg?.key ? setInterval(() => {
                animTick++;
                if (animTick > 45) { clearInterval(animTimer); return; }
                const bar = animBars[Math.min(animTick, animBars.length - 1)];
                const frame = `${animSpins[animTick % 2]} ${infoBody}\n\n[${bar}]\n> _${phaseRef.text}_`;
                hisoka.sendMessage(m.from, { text: frame, edit: loadingMsg.key }).catch(() => {});
        }, 1100) : null;
        const stopAnim = () => { if (animTimer) clearInterval(animTimer); };

        /* ── Kirim satuan (dipakai mode satuan + fallback) ── */
        const sendSatuan = async () => {
                const { Sticker, StickerTypes } = await import('wa-sticker-formatter');
                let sent = 0, failed = 0;
                for (const item of stickers) {
                        try {
                                const rawBuffer  = await downloadStickerBuffer(item.imageUrl);
                                const isWebp     = /\.webp(?:\?|$)/i.test(item.imageUrl);
                                let stickerBuffer = rawBuffer;
                                if (!item.isAnimated && !isWebp) {
                                        const sticker = new Sticker(rawBuffer, { pack: exifPack, author: exifAuthor, type: StickerTypes.FULL, categories: ['🎭'], id: `stickerly.${pack.id}`, quality: 85 });
                                        stickerBuffer = await sticker.toBuffer();
                                } else {
                                        stickerBuffer = injectStickerExif(rawBuffer, exifBuf);
                                }
                                await hisoka.sendMessage(m.from, { sticker: stickerBuffer }, { quoted: m });
                                sent++;
                                if (sent % 5 === 0) await new Promise(resolve => setTimeout(resolve, 700));
                        } catch (sendErr) { failed++; console.error('[StickerLy] Failed sticker:', sendErr.message); }
                }
                return { sent, failed };
        };

        if (!isSatuanSend) {
                /* ── DEFAULT: kirim sebagai 1 paket native ──
                   ZIP dirakit dari stiker asli + tray_icon.webp, lalu
                   di-upload dengan kunci khusus sticker-pack. */
                try {
                        const { Sticker, StickerTypes } = await import('wa-sticker-formatter');
                        const sharp = (await import('sharp')).default;

                        phaseRef.text = `Mengunduh ${stickers.length} sticker...`;
                        // Download semua stiker (paralel per batch 5)
                        const builtFiles = [];
                        for (let i = 0; i < stickers.length; i += 5) {
                                const batch = stickers.slice(i, i + 5);
                                const results = await Promise.all(batch.map(async (item, j) => {
                                        const index = i + j;
                                        const rawBuffer  = await downloadStickerBuffer(item.imageUrl);
                                        let fileName     = item.fileName || `sticker_${String(index + 1).padStart(3, '0')}.webp`;
                                        const isWebp     = /\.webp(?:\?|$)/i.test(item.imageUrl) || rawBuffer.slice(8, 12).toString() === 'WEBP';
                                        let stickerBuffer = rawBuffer;
                                        if (!item.isAnimated && !isWebp) {
                                                const sticker = new Sticker(rawBuffer, { pack: exifPack, author: exifAuthor, type: StickerTypes.FULL, categories: ['✨'], id: `stickerly.${pack.id}`, quality: 85 });
                                                stickerBuffer = await sticker.toBuffer();
                                        } else {
                                                stickerBuffer = injectStickerExif(rawBuffer, exifBuf);
                                        }
                                        // Konten akhir selalu WebP → samakan ekstensi nama file
                                        if (stickerBuffer.slice(8, 12).toString() === 'WEBP') {
                                                fileName = fileName.replace(/\.[a-z0-9]+$/i, '.webp');
                                        }
                                        return { id: item.id, fileName, isAnimated: !!item.isAnimated, buffer: stickerBuffer };
                                }));
                                builtFiles.push(...results);
                        }
                        if (!builtFiles.length) throw new Error('Tidak ada stiker berhasil diunduh.');

                        // Tray icon 252x252 dari stiker pertama
                        let trayBuffer = null;
                        try { trayBuffer = await sharp(builtFiles[0].buffer).resize(252, 252, { fit: 'cover' }).webp().toBuffer(); }
                        catch (e) { console.error('[StickerLy] Tray icon gagal:', e.message); }

                        const zipFilesArr = [...builtFiles];
                        if (trayBuffer) zipFilesArr.push({ fileName: 'tray_icon.webp', buffer: trayBuffer });
                        const zipBuffer = await zipFiles(zipFilesArr);

                        const packFiles = builtFiles.map(f => ({ id: f.id, fileName: f.fileName, isAnimated: f.isAnimated }));
                        phaseRef.text = 'Mengirim paket ke WhatsApp...';
                        await sendStickerPackCard(hisoka, m.from, m, { ...pack, files: packFiles }, zipBuffer, trayBuffer);
                        const doneText = `✅ *Paket Stickerly terkirim sebagai 1 paket!*\n\n- 📦 *Pack:* ${pack.name}\n- 🧩 *Isi:* ${builtFiles.length} sticker\n\n> _Tap kartu paketnya untuk simpan semua sticker sekaligus._`;
                        stopAnim();
                        if (loadingMsg?.key) await m.reply({ edit: loadingMsg.key, text: doneText }); else await tolak(hisoka, m, doneText);
                        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                        logCommand(m, hisoka, m.command || 'stickerly');
                        return;
                } catch (packErr) {
                        console.error('[StickerLy] Kirim paket gagal, fallback satuan:', packErr.message);
                        const { sent, failed } = await sendSatuan();
                        const doneText = `✅ *Stickerly selesai* — _mode satuan (kartu paket tidak didukung)_\n\n- Terkirim: *${sent}* sticker${failed ? `\n- Gagal: *${failed}* sticker` : ''}`;
                        stopAnim();
                        if (loadingMsg?.key) await m.reply({ edit: loadingMsg.key, text: doneText }); else await tolak(hisoka, m, doneText);
                        await hisoka.sendMessage(m.from, { react: { text: sent ? '✅' : '❌', key: m.key } });
                        logCommand(m, hisoka, m.command || 'stickerly');
                        return;
                }
        }

        /* ── Mode satuan eksplisit ── */
        const { sent, failed } = await sendSatuan();
        const doneText = failed
                ? `✅ *Stickerly selesai.*\n\n- Terkirim: *${sent}* sticker\n- Gagal: *${failed}* sticker`
                : `✅ *Stickerly selesai.* _${sent} sticker berhasil dikirim._`;
        stopAnim();
                        if (loadingMsg?.key) await m.reply({ edit: loadingMsg.key, text: doneText }); else await tolak(hisoka, m, doneText);
        await hisoka.sendMessage(m.from, { react: { text: sent ? '✅' : '❌', key: m.key } });
        logCommand(m, hisoka, m.command || 'stickerly');
        } catch (error) {
                try { stopAnim(); } catch (_) {}
                console.error('\x1b[31m[StickerLy] Error:\x1b[39m', error.message);
                await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                await tolak(hisoka, m, `❌ Gagal mengambil Stickerly: ${error.message}`);
        }
}

/**
 * Handle reply angka ke daftar pilihan .stickerly.
 * Dipanggil dari message.js sebelum dispatch plugin.
 * @returns {boolean} true jika pesan sudah diproses
 */
export async function handleStickerlyChoice({ hisoka, m, pendingStickerlyChoices, getQuotedStanzaId, tolak, logCommand, logError }) {
        if (!pendingStickerlyChoices?.has(m.sender)) return false;
        const pending = pendingStickerlyChoices.get(m.sender);
        const isReply = m.isQuoted && pending.botMsgId && getQuotedStanzaId(m) === pending.botMsgId;
        if (!isReply) return false;

        const raw = String(m.text || '').trim();

        if (pending.expiresAt <= Date.now()) {
                if (pending.timeout) clearTimeout(pending.timeout);
                pendingStickerlyChoices.delete(m.sender);
                await tolak(hisoka, m, '⏳ _Pilihan sudah kedaluwarsa._ Ketik `.stickerly <keyword>` lagi ya.');
                return true;
        }
        if (/^(batal|cancel)$/i.test(raw)) {
                if (pending.timeout) clearTimeout(pending.timeout);
                pendingStickerlyChoices.delete(m.sender);
                await tolak(hisoka, m, '✅ _Pilihan dibatalkan._');
                return true;
        }
        if (!/^\d+$/.test(raw)) return false;
        if (pending.loading) {
                await tolak(hisoka, m, '⏳ _Sedang memproses pilihan sebelumnya..._');
                return true;
        }
        const idx = parseInt(raw, 10) - 1;
        if (idx < 0 || idx >= pending.results.length) {
                await tolak(hisoka, m, `❌ Pilih angka *1–${pending.results.length}*.`);
                return true;
        }

        pending.loading = true;
        if (pending.timeout) clearTimeout(pending.timeout);
        pendingStickerlyChoices.delete(m.sender);
        const chosen = pending.results[idx];

        await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
        try {
                const pack = await detail(chosen.url || chosen.id);
                await processStickerlyPack({ hisoka, m, tolak, logCommand, pack, isSatuanSend: false });
        } catch (err) {
                console.error('[StickerLy] Choice error:', err.message);
                if (logError) logError(err, 'stickerly:choice');
                await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } }).catch(() => {});
                await tolak(hisoka, m, `❌ Gagal memproses pack: ${err.message}`);
        }
        return true;
}

async function handleStikerpack({ hisoka, m, query, tolak, logCommand, path, pendingStickerlyChoices }) {
        try {
                const input = (query || '').trim();
                const pfx   = m.prefix || '.';

                if (!input) {
                        await tolak(hisoka, m,
                                `🧩 *STICKERLY PACK*\n\n` +
                                `_Download 1 pack sticker Stickerly utuh, dikirim sebagai *1 paket*._\n\n` +
                                `*Cara Pakai:*\n` +
                                `1. ${pfx}stickerly anime\n` +
                                `2. ${pfx}stickerly https://sticker.ly/s/4XBX01\n` +
                                `3. ${pfx}stickerly search kucing\n\n` +
                                `*Mode lain:*\n` +
                                `- ${pfx}stickerly satuan anime — _kirim sticker satu-satu_\n` +
                                `- ${pfx}stickerly search anime — _lihat daftar pack dulu_`
                        );
                        logCommand(m, hisoka, m.command || 'stickerly');
                        return;
                }

                await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });

                const isSearchOnly = /^search\s+/i.test(input);
                const isSatuanSend = /^(satuan|satu|single)\s+/i.test(input);
                const cleanInput   = isSearchOnly
                        ? input.replace(/^search\s+/i, '').trim()
                        : isSatuanSend
                                ? input.replace(/^(satuan|satu|single)\s+/i, '').trim()
                                : input.replace(/^(native|card|kartu)\s+/i, '').trim();

                if (!cleanInput) {
                        await tolak(hisoka, m, `❌ Masukkan kata kunci pencarian.\n\nContoh: ${pfx}stickerly search anime`);
                        return;
                }

                if (isSearchOnly) {
                        const packs = await search(cleanInput, { limit: 8 });
                        if (!packs.length) {
                                await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                                await tolak(hisoka, m, `❌ Pack Stickerly untuk *${cleanInput}* tidak ditemukan.`);
                                return;
                        }
                        let resultText = `🔎 *HASIL STICKERLY* — _"${cleanInput}"_\n\n`;
                        packs.forEach((pack, index) => {
                                resultText += `${index + 1}. *${pack.name}*\n`;
                                resultText += `   👤 ${pack.author}\n`;
                                resultText += `   🧩 ${pack.stickerCount} sticker${pack.isAnimated ? ' · _animated_' : ''}\n`;
                                resultText += `   👁️ ${pack.viewCount.toLocaleString('id-ID')} views · 📥 ${pack.exportCount.toLocaleString('id-ID')} download\n`;
                                resultText += `   🔗 ${pack.url}\n\n`;
                        });
                        resultText += `> _Kirim pack-nya:_ \`${pfx}stickerly <link di atas>\``;
                        await tolak(hisoka, m, resultText);
                        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                        logCommand(m, hisoka, 'stickerly-search');
                        return;
                }

                /* Resolusi pack: coba sebagai ID/URL dulu; kalau detail gagal
                   (keyword pendek seperti "anime" lolos pola ID) → jalur keyword. */
                let pack = null;
                if (extractPackId(cleanInput)) {
                        try { pack = await detail(cleanInput); }
                        catch (idErr) { pack = null; }
                }
                if (!pack) {
                        const useChoice = !!pendingStickerlyChoices && !isSatuanSend;
                        const packs = await search(cleanInput, { limit: useChoice ? 30 : 1 });
                        if (!packs.length) {
                                await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                                await tolak(hisoka, m, `❌ Pack Stickerly untuk *${cleanInput}* tidak ditemukan.`);
                                return;
                        }
                        if (useChoice && packs.length > 1) {
                                /* Tampilkan daftar pilihan — user balas angka */
                                let listText = `🧩 *PILIH PACK STICKERLY* — _"${cleanInput}"_\n\n`;
                                packs.forEach((p, i) => {
                                        listText += `${i + 1}. *${p.name}*\n`;
                                        listText += `   👤 ${p.author} · 🧩 ${p.stickerCount} sticker${p.isAnimated ? ' · _animated_' : ''}\n`;
                                        listText += `   👁️ ${p.viewCount.toLocaleString('id-ID')} views · 📥 ${p.exportCount.toLocaleString('id-ID')} download\n\n`;
                                });
                                listText += `> _Balas pesan ini dengan angka pilihanmu (1–${packs.length}), atau *batal*._\n> _Berlaku 3 menit._`;
                                const listMsg = await tolak(hisoka, m, listText);
                                const key = m.sender;
                                if (pendingStickerlyChoices.get(key)?.timeout) clearTimeout(pendingStickerlyChoices.get(key).timeout);
                                const timeout = setTimeout(() => pendingStickerlyChoices.delete(key), 3 * 60 * 1000);
                                pendingStickerlyChoices.set(key, {
                                        results: packs,
                                        botMsgId: listMsg?.key?.id || null,
                                        expiresAt: Date.now() + 3 * 60 * 1000,
                                        timeout,
                                        loading: false,
                                });
                                await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                                logCommand(m, hisoka, 'stickerly-choice-list');
                                return;
                        }
                        pack = await detail(packs[0].url || packs[0].id);
                }

                await processStickerlyPack({ hisoka, m, tolak, logCommand, pack, isSatuanSend });
        } catch (error) {
                try { stopAnim(); } catch (_) {}
                console.error('\x1b[31m[StickerLy] Error:\x1b[39m', error.message);
                await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                await tolak(hisoka, m, `❌ Gagal mengambil Stickerly: ${error.message}`);
        }
}


/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const command = /^(stickerly|stikerly|stickly|stickerpack|stikerpack)$/i;
export const tags = ['download'];
export const help = ['stickerly'];
export default handleStikerpack;
