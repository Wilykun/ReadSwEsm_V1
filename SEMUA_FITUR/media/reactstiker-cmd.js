/**
 * reactstiker-cmd.js — Sticker Reaction (tempel stiker ke pesan sebagai reaction)
 * Sumber mekanisme: https://pastebin.com/EN5Nzupi (nixellv2, "sticker reaction") — stiker
 * dikirim lewat relayMessage dengan messageAssociation associationType 11 dan
 * parentMessageKey = pesan target, jadi stikernya nempel di pesan itu seperti
 * reaksi, bukan terkirim sebagai pesan biasa. messageIndex adalah nomor urut
 * stiker ini di antara reaksi di pesan yang sama (mulai 0), field yang dikirim
 * client resmi supaya client tahu posisi tiap stiker dan tidak membuang reaksinya.
 * Stiker yang dikirim juga membawa ukuran aslinya (height/width) dan penanda
 * animasi (isAnimated) seperti stiker kiriman client asli, karena tanpa itu
 * client tidak bisa menampilkan reaksi di atas pesan stiker. Pengecualian:
 * kalau targetnya pesan stiker, reaksi tidak ditampilkan client sama sekali
 * (reaksi ditempelkan mengacu pada bubble pesan, dan stiker tidak punya bubble),
 * jadi stiker dikirim sebagai balasan (quoted) ke pesan itu supaya tetap kelihatan.
 *
 * Cara pakai (owner-only):
 * 1. `.reacts` saja → tampilkan info (total stiker pack realtime + cara pakai).
 * 2. Reply pesan target lalu `.reacts 1` → tempel 1 stiker ke pesan itu.
 * 3. Reply pesan target lalu `.reacts x15` → tempel 15 stiker sekaligus
 *    (angka 1-15, boleh tulis x15 atau 15 saja).
 * 4. `.reacts add` sambil reply sebuah stiker → stiker itu didaftarkan ke
 *    pack bot (field url/mediaKey/hash/directPath disimpan di data/reactstiker.json)
 *    supaya bisa dipakai ulang tanpa kirim ulang.
 * 5. `.reacts list` → lihat isi pack; `.reacts hapus <no>` → hapus satu
 *    stiker dari pack.
 * 6. Kalau pack masih kosong, bot menolak tempel dan minta daftarin stiker dulu
 *    (stiker Lottie bawaan dari paste sudah kedaluwarsa 23 Okt 2026, jadi tidak
 *    dipakai lagi — relay dengan URL mati cuma menghasilkan centang palsu).
 *    (Semua bentuk di atas bisa juga ditulis `.reactstiker`, alias panjangnya.)
 * 7. `.reacts addauto` → nyalakan/matikan auto-tambah: bila aktif, stiker apa
 *    pun yang dikirim owner langsung masuk pack tanpa `.reacts add` manual;
 *    status on/off tersimpan di config.json seksi "reacts.addAuto".
 *
 * Balasan info/ringkasan memakai format WA lengkap sesuai konteks (tebal, miring,
 * coret, kode, daftar bernomor, daftar berpoint, kutip) dan total stiker selalu
 * dibaca fresh dari pack, jadi angkanya realtime.
 *
 * Stiker dipilih acak dari pack (tanpa ulang dalam satu perintah bila pack cukup);
 * bila jumlah yang diminta melebihi isi pack, pack diulang dari awal. Antar kirim
 * diberi jeda singkat supaya tidak membanjiri socket.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACK_FILE = path.join(BOT_DIR, 'data', 'reactstiker.json');
const MAKS_JUMLAH = 15;
const JEDA_MS = 400;

// (Stiker Lottie bawaan dari paste sengaja tidak dipakai lagi: URL-nya sudah
// kedaluwarsa 23 Okt 2026 — relay dengan URL mati cuma menghasilkan centang palsu.)

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

// Nilai byte di pesan Baileys bisa berupa Buffer, jadi normalisasi ke base64 supaya
// aman disimpan di JSON dan bisa langsung dipakai lagi saat relay.
const keBase64 = (v) => {
  if (typeof v === 'string') return v;
  if (Buffer.isBuffer(v)) return v.toString('base64');
  if (v instanceof Uint8Array) return Buffer.from(v).toString('base64');
  return undefined;
};

function bacaPack() {
  try {
    const isi = JSON.parse(fs.readFileSync(PACK_FILE, 'utf8'));
    if (Array.isArray(isi?.stickers)) return isi.stickers.filter((s) => s?.mediaKey && s?.directPath);
  } catch { /* file belum ada atau rusak, anggap pack kosong */ }
  return [];
}

function simpanPack(stickers) {
  fs.mkdirSync(path.dirname(PACK_FILE), { recursive: true });
  fs.writeFileSync(PACK_FILE, JSON.stringify({ stickers }, null, 2));
}

// Acak urutan pack lalu ambil sejumlah yang diminta, mengulang dari awal bila
// jumlahnya melebihi isi pack.
function pilihStiker(pack, jumlah) {
  const acak = [...pack].sort(() => Math.random() - 0.5);
  const hasil = [];
  for (let i = 0; i < jumlah; i++) hasil.push(acak[i % acak.length]);
  return hasil;
}

// Kunci pesan target diambil dari pesan yang di-reply, dengan cadangan rakitan dari
// contextInfo bila kunci aslinya tidak terbawa. Bentuk kunci DISAMAKAN dengan kunci
// asli Baileys: pesan sendiri (fromMe) tidak membawa participant — kunci pesan
// sendiri yang ikut membawa participant tidak cocok dengan kunci asli di server,
// asosiasi jadi tidak ketemu dan stiker tidak tampil padahal relay terkirim dan
// balasan centang sudah muncul. (Itu akar bug 27 Nov: target kiriman "Anda" gagal,
// target kiriman orang lain jalan.)
function kunciTarget(m, hisoka) {
  const botId = (hisoka?.user?.id || '').split('@')[0].split(':')[0];
  const botLid = (hisoka?.user?.lid || '').split('@')[0].split(':')[0];
  const samaBot = (jid) => {
    const num = (jid || '').split('@')[0].split(':')[0];
    return !!num && (num === botId || (!!botLid && num === botLid));
  };
  const rapikan = (k) => {
    if (!k?.id) return null;
    const hasil = { remoteJid: k.remoteJid || m.from, id: k.id, fromMe: !!k.fromMe };
    if (k.participant && samaBot(k.participant)) hasil.fromMe = true;
    if (!hasil.fromMe && k.participant) hasil.participant = k.participant;
    return hasil;
  };
  if (m.quoted?.key?.id) return rapikan(m.quoted.key);
  const info = m.message?.extendedTextMessage?.contextInfo;
  if (!info?.stanzaId) return null;
  return rapikan({ remoteJid: m.from, id: info.stanzaId, fromMe: samaBot(info.participant), participant: info.participant || undefined });
}

async function tempelStiker(hisoka, m, targetKey, stiker, indeks) {
  await hisoka.relayMessage(m.from, {
    messageContextInfo: {
      messageAssociation: {
        associationType: 11,
        parentMessageKey: targetKey,
        messageIndex: indeks
      }
    },
    stickerMessage: {
      url: stiker.url,
      fileSha256: stiker.fileSha256,
      fileEncSha256: stiker.fileEncSha256,
      mediaKey: stiker.mediaKey,
      mimetype: stiker.mimetype || 'image/webp',
      directPath: stiker.directPath,
      isLottie: !!stiker.isLottie,
      isAnimated: !!stiker.isAnimated,
      height: stiker.height,
      width: stiker.width
    }
  }, {});
}

// Targetnya pesan stiker: client WhatsApp tidak menampilkan reaksi stiker di
// atas pesan stiker (reaksi ditempelkan mengacu pada bubble pesan, dan stiker
// tidak punya bubble), jadi stiker dikirim sebagai balasan (quoted) ke pesan
// itu mengikuti bentuk quoted reply Baileys — contextInfo di dalam
// stickerMessage berisi participant + stanzaId + quotedMessage berupa isi
// pesan parent tanpa contextInfo bersarang — supaya hasilnya tetap kelihatan
// tepat di bawah target, bukan hilang tanpa jejak.
async function balasStiker(hisoka, m, targetKey, stiker, tipeParent) {
  const isiParent = m.quoted?.raw || m.quoted?.message;
  const kontenParent = isiParent?.[tipeParent];
  if (!kontenParent) return false;
  const isiKutip = { ...kontenParent };
  delete isiKutip.contextInfo;
  const pengirim = targetKey.fromMe ? hisoka.user.id : (m.quoted?.key?.participant || m.quoted?.key?.remoteJid);
  await hisoka.relayMessage(m.from, {
    stickerMessage: {
      url: stiker.url,
      fileSha256: stiker.fileSha256,
      fileEncSha256: stiker.fileEncSha256,
      mediaKey: stiker.mediaKey,
      mimetype: stiker.mimetype || 'image/webp',
      directPath: stiker.directPath,
      isLottie: !!stiker.isLottie,
      isAnimated: !!stiker.isAnimated,
      height: stiker.height,
      width: stiker.width,
      contextInfo: {
        participant: pengirim,
        stanzaId: targetKey.id,
        quotedMessage: { [tipeParent]: isiKutip }
      }
    }
  }, {});
  return true;
}

// ── .reacts addauto — auto-tambah stiker kiriman owner ke pack ──
// Bila aktif, stiker apa pun yang dikirim owner (di chat mana pun, grup atau
// pribadi) langsung masuk pack tanpa perlu `.reacts add` manual, dan bot
// membalas konfirmasi (total pack + jenis stiker). Status on/off tersimpan
// realtime di config.json seksi "reacts.addAuto":
//   { "enabled": false, "sejak": <epoch ms saat diaktifkan | null bila mati> }
// Default: mati. Toggle berlaku seketika tanpa restart (config dibaca fresh
// tiap pesan), tapi perubahan kode plugin tetap butuh restart seperti biasa.
const CB_ADDAUTO_ON = '__reacts_addauto_on__';
const CB_ADDAUTO_OFF = '__reacts_addauto_off__';

// Balas teks LANGSUNG tanpa quote (pola hisoka.sendMessage yang dipakai .alias
// dan terbukti sampai; tolak/m.reply memakai quoted yang di grup kadang tidak
// sampai ke Wily). Fallback ke m.reply bila direct gagal.
async function balas(hisoka, m, teks) {
  try {
    await hisoka.sendMessage(m.from, { text: teks });
    return true;
  } catch (_) {}
  try { await m.reply(teks); return true; } catch (_) {}
  return false;
}

// Baca seksi reacts.addAuto dari config (fresh tiap panggil); isi default bila
// belum ada. Default mati supaya pack tidak terisi sendiri tanpa perintah.
function bacaAddAuto(loadConfig) {
  let cfg = {};
  try { cfg = loadConfig() || {}; } catch (_) { cfg = {}; }
  if (!cfg.reacts || typeof cfg.reacts !== 'object') cfg.reacts = {};
  if (!cfg.reacts.addAuto || typeof cfg.reacts.addAuto !== 'object') cfg.reacts.addAuto = {};
  if (typeof cfg.reacts.addAuto.enabled !== 'boolean') cfg.reacts.addAuto.enabled = false;
  if (cfg.reacts.addAuto.enabled && typeof cfg.reacts.addAuto.sejak !== 'number') cfg.reacts.addAuto.sejak = Date.now();
  if (!cfg.reacts.addAuto.enabled) cfg.reacts.addAuto.sejak = null;
  return cfg;
}

// Format epoch ms → "27 Nov 2026, 16:30 WIB"
function formatWaktuWIB(ms) {
  try {
    return new Date(ms).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).replace(/\./g, ':') + ' WIB';
  } catch (_) { return ''; }
}

// Format selisih ms → "2 jam 15 menit" / "45 detik" / "3 hari 2 jam"
function formatDurasi(ms) {
  const totalDetik = Math.max(0, Math.floor(ms / 1000));
  const hari = Math.floor(totalDetik / 86400);
  const jam = Math.floor((totalDetik % 86400) / 3600);
  const menit = Math.floor((totalDetik % 3600) / 60);
  const detik = totalDetik % 60;
  const bagian = [];
  if (hari) bagian.push(hari + ' hari');
  if (jam) bagian.push(jam + ' jam');
  if (menit) bagian.push(menit + ' menit');
  if (!bagian.length || (bagian.length < 2 && detik)) bagian.push(detik + ' detik');
  return bagian.slice(0, 2).join(' ');
}

// Teks status saat ini (dipakai menu + balasan)
function teksStatusAddAuto(aa) {
  if (!aa.enabled) return '⛔ *Nonaktif*';
  const sejak = typeof aa.sejak === 'number' ? aa.sejak : null;
  if (!sejak) return '✅ *Aktif*';
  return `✅ *Aktif*\nSejak: *${formatWaktuWIB(sejak)}*\nSudah: *${formatDurasi(Date.now() - sejak)}*`;
}

// Ambil field media stiker dari pesan stiker (dipakai add manual + auto-add);
// kembalikan null bila datanya tidak lengkap (mediaKey/directPath kosong).
function fieldStiker(sm) {
  if (!sm) return null;
  const mediaKey = keBase64(sm.mediaKey);
  const directPath = sm.directPath;
  if (!mediaKey || !directPath) return null;
  return {
    url: sm.url,
    fileSha256: keBase64(sm.fileSha256),
    fileEncSha256: keBase64(sm.fileEncSha256),
    mediaKey,
    mimetype: sm.mimetype || 'image/webp',
    directPath,
    isLottie: !!sm.isLottie,
    isAnimated: !!sm.isAnimated,
    height: sm.height,
    width: sm.width
  };
}

// Balas dengan QUOTE ke pesan stiker (biar balasan nempel di stikernya dan
// kelihatan rapi), fallback ke kirim langsung bila quote gagal.
async function balasKutip(hisoka, m, teks) {
  try { await m.reply(teks); return true; } catch (_) {}
  return balas(hisoka, m, teks);
}

// Cari stiker yang sama di pack: cocok bila mediaKey-nya sama (referensi yang
// sama persis) ATAU fileSha256-nya sama (isi file sama, upload beda — mediaKey
// baru tiap upload, jadi stiker yang sama dari kiriman berbeda tidak ketangkap
// bila hanya bandingkan mediaKey). Kembalikan nomor pack (1-based, sama seperti
// `.reacts list`) + jenis kecocokan, atau null bila tidak ada yang sama.
function cariDuplikat(pack, baru) {
  for (let i = 0; i < pack.length; i++) {
    const s = pack[i];
    if (s?.mediaKey && baru.mediaKey && s.mediaKey === baru.mediaKey) return { nomor: i + 1, jenis: 'mediaKey' };
  }
  if (baru.fileSha256) {
    for (let i = 0; i < pack.length; i++) {
      const s = pack[i];
      if (s?.fileSha256 && s.fileSha256 === baru.fileSha256) return { nomor: i + 1, jenis: 'isi' };
    }
  }
  return null;
}

// Teks pemberitahuan duplikat (dipakai add manual + auto-add): sebut nomor pack
// + jenis kecocokannya supaya jelas stiker mana yang sama.
function teksDuplikat(duplikat, totalPack, konteksAuto) {
  const jenis = duplikat.jenis === 'isi' ? ' (isinya sama, upload beda)' : '';
  const kepala = konteksAuto
    ? `ℹ️ *Stiker ini sudah ada di pack sebagai stiker #${duplikat.nomor}${jenis}.*`
    : `⚠️ *Stiker ini sudah ada di pack sebagai stiker #${duplikat.nomor}${jenis}.*`;
  const ekor = konteksAuto
    ? `\n\n> _AddAuto aktif, tapi stiker yang sama tidak ditambahkan dua kali._`
    : `\n\n> _Tidak ditambahkan dua kali._`;
  return `${kepala}\n• Total pack: *${totalPack} stiker*${ekor}`;
}

// Inti toggle: nyalakan/matikan + simpan realtime + balas
async function setAddAuto(hisoka, m, nyala, { loadConfig, saveConfig }) {
  const cfg = bacaAddAuto(loadConfig);
  const aa = cfg.reacts.addAuto;
  const pref = m.prefix || '.';
  if (nyala && aa.enabled) {
    const sejak = typeof aa.sejak === 'number' ? aa.sejak : null;
    const sejakTeks = sejak
      ? `\nSejak: *${formatWaktuWIB(sejak)}*\nSudah: *${formatDurasi(Date.now() - sejak)}*`
      : '';
    await balas(hisoka, m, `ℹ️ *AddAuto sudah aktif.*${sejakTeks}\n\n> _Stiker yang kamu kirim langsung masuk pack, tanpa_ \`${pref}reacts add\` _manual._`);
    return true;
  }
  if (!nyala && !aa.enabled) {
    await balas(hisoka, m, `ℹ️ *AddAuto sudah nonaktif.*\n\n> _Aktifkan lagi dengan_ \`${pref}reacts addauto on\` _atau_ \`${pref}reacts addauto\` _lalu pilih Aktifkan._`);
    return true;
  }
  aa.enabled = nyala;
  aa.sejak = nyala ? Date.now() : null;
  cfg.reacts.addAuto = aa;
  saveConfig(cfg);
  if (nyala) {
    await balas(hisoka, m, `✅ *AddAuto diaktifkan.*\nSejak: *${formatWaktuWIB(aa.sejak)}*\n\n> _Mulai sekarang, stiker apa pun yang kamu kirim ke bot langsung masuk pack — tidak perlu_ \`${pref}reacts add\` _lagi._`);
  } else {
    await balas(hisoka, m, `⛔ *AddAuto dinonaktifkan.*\n\n> _Stiker yang kamu kirim tidak lagi masuk pack otomatis._\n> _Daftarin manual tetap bisa lewat_ \`${pref}reacts add\` _sambil reply stiker._`);
  }
  return true;
}

// Menu single-select (tanpa argumen) — pola Button class (message.js), SAMA
// seperti menu .alias yang terbukti tampil di HP. Bila Button gagal, fallback
// teks biasa via balas().
async function tampilMenuAddAuto(hisoka, m, { loadConfig, Button }) {
  const cfg = bacaAddAuto(loadConfig);
  const pref = m.prefix || '.';
  const body =
    `🤖 *ADDAUTO .reacts* — _auto-tambah stiker ke pack_\n\n` +
    `Status: ${teksStatusAddAuto(cfg.reacts.addAuto)}\n\n` +
    `> _Bila aktif, stiker apa pun yang kamu kirim ke bot langsung masuk pack, tanpa_ \`${pref}reacts add\` _manual._\n` +
    `> _Hanya stiker dari owner yang masuk; stiker orang lain diabaikan._\n\n` +
    `Pilih di bawah ini, atau ketik \`${pref}reacts addauto on\` / \`${pref}reacts addauto off\`.`;
  let sentBtn = null;
  if (typeof Button === 'function') {
    try {
      const btn = new Button()
        .setBody(body)
        .setFooter('WilyBot • Reacts AddAuto')
        .addSelection('🤖 Pilih');
      btn.makeSections('AddAuto');
      btn.makeRow('', '✅ Aktifkan AddAuto', 'Stiker kiriman owner auto-masuk pack', CB_ADDAUTO_ON);
      btn.makeRow('', '⛔ Nonaktifkan AddAuto', 'Stiker harus didaftarin manual', CB_ADDAUTO_OFF);
      sentBtn = await btn.run(m.from, hisoka, m);
    } catch (e) {
      console.error('[reacts-addauto] Button send gagal:', e?.message || e);
      sentBtn = null;
    }
  }
  if (!sentBtn) {
    await balas(hisoka, m, body + `\n\nKetik \`${pref}reacts addauto on\` atau \`${pref}reacts addauto off\`.`);
  }
  return true;
}

// Callback tap tombol single-select .reacts addauto — dipanggil dari message.js
// (seksi callback), sebelum plugin dispatcher.
async function handleReactAddAutoCallbacks({ hisoka, m, tolak, logCommand, loadConfig, saveConfig }) {
  const txt = typeof m.text === 'string' ? m.text.trim() : '';
  if (txt !== CB_ADDAUTO_ON && txt !== CB_ADDAUTO_OFF) return false;
  if (!m.isOwner) return false;
  try {
    await setAddAuto(hisoka, m, txt === CB_ADDAUTO_ON, { loadConfig, saveConfig });
    if (typeof logCommand === 'function') logCommand(m, hisoka, 'reacts addauto ' + (txt === CB_ADDAUTO_ON ? 'on' : 'off') + ' (tombol)');
  } catch (err) {
    console.error('[reacts-addauto] Error callback:', err?.message || err);
    await balas(hisoka, m, `❌ Gagal mengatur AddAuto: _${err?.message || err}_`);
  }
  return true;
}

// Hook auto-add: dipanggil message.js untuk SETIAP pesan masuk (sebelum guard
// newsletter + sebelum dispatcher). Bila addAuto aktif dan pesannya stiker
// dari owner, stiker itu langsung masuk pack (dedup by mediaKey) dan bot
// membalas konfirmasi. Kembalikan true bila stiker ditambahkan (atau sudah
// ada), false bila tidak ada yang dilakukan (fitur mati / bukan owner /
// bukan stiker / data tidak lengkap).
async function handleReactAddAuto({ hisoka, m, loadConfig, getMediaTypeFromMessage }) {
  if (hisoka?.isMainBot === false) return false;
  let cfg = {};
  try { cfg = loadConfig() || {}; } catch (_) { return false; }
  if (!cfg.reacts?.addAuto?.enabled) return false;
  if (!m.isOwner) return false;
  const tipe = typeof getMediaTypeFromMessage === 'function' ? getMediaTypeFromMessage(m) : '';
  if (tipe !== 'stickerMessage') return false;
  const sm = m.raw?.stickerMessage || m.message?.stickerMessage || m.stickerMessage;
  const baru = fieldStiker(sm);
  if (!baru) return false;
  const pack = bacaPack();
  const duplikat = cariDuplikat(pack, baru);
  if (duplikat) {
    await balasKutip(hisoka, m, teksDuplikat(duplikat, pack.length, true));
    return true;
  }
  pack.push(baru);
  simpanPack(pack);
  await balasKutip(hisoka, m, `✅ *Stiker auto-ditambahkan ke pack.*\n• Total sekarang: *${pack.length} stiker*\n• Stiker ini: ${baru.isLottie ? 'Lottie' : (baru.isAnimated ? 'WebP animasi' : 'WebP')} — \`${(baru.mediaKey || '').slice(0, 12)}…\`\n\n> _AddAuto aktif — stiker langsung masuk pack tanpa_ \`.reacts add\` _manual._`);
  return true;
}

function teksInfo(jumlahPack, addAutoAktif) {
  const kosong = jumlahPack === 0
    ? '\n• Pack masih kosong — daftarin stiker lewat `.reacts add` sambil reply stiker.'
    : '';
  const addAutoBaris = addAutoAktif
    ? '\n• AddAuto: *Aktif* — stiker kiriman owner auto-masuk pack'
    : '\n• AddAuto: *Nonaktif* — nyalakan lewat `.reacts addauto`';
  return `*.reacts — Sticker Reaction*\nTempel stiker ke pesan sebagai _reaction_ (bukan pesan biasa).\n\n*Cara pakai:*\n1. Reply pesan target lalu \`.reacts 1\` → tempel 1 stiker\n2. Reply pesan target lalu \`.reacts x15\` → tempel 15 stiker (maks ${MAKS_JUMLAH})\n3. \`.reacts add\` → reply stiker buat daftarin ke pack\n4. \`.reacts list\` → lihat isi pack\n5. \`.reacts hapus <no>\` → hapus stiker dari pack\n6. Reply pesan *stiker* lalu \`.reacts 1\` → stiker dikirim sebagai *balasan* (WhatsApp tidak menampilkan reaksi stiker di pesan stiker)\n7. \`.reacts addauto\` → stiker kiriman owner auto-masuk pack (tanpa add manual)\n8. Stiker yang sama tidak ditambahkan dua kali — bot memberitahu nomornya di pack (referensi sama / isi sama tapi upload beda)\n\n*Pack saat ini:*\n• Total: *${jumlahPack} stiker* (realtime dari \`data/reactstiker.json\`)${kosong}${addAutoBaris}\n• Alias panjang: \`.reactstiker\` juga bisa dipakai\n\n> _Stiker dipilih acak dari pack; kalau jumlah melebihi isi pack, pack diulang dari awal._`;
}

async function handleReactStiker(ctx) {
  const { hisoka, m, query, tolak, logCommand, getMediaTypeFromMessage, loadConfig, saveConfig, Button } = ctx;
  if (!m.isOwner) return;
  const arg = (query || '').trim().toLowerCase();
  const pack = bacaPack();
  const addAutoAktif = (() => { try { return !!loadConfig?.()?.reacts?.addAuto?.enabled; } catch (_) { return false; } })();
  try {
    if (arg === 'add') {
      const q = m.quoted;
      const sm = q?.raw?.stickerMessage || q?.message?.stickerMessage || q?.stickerMessage;
      const tipe = q ? getMediaTypeFromMessage(q) : '';
      if (!q || (tipe !== 'stickerMessage' && !sm)) {
        await tolak(hisoka, m, '❌ Reply sebuah *stiker* dulu, baru `.reactstiker add`.');
        return;
      }
      const baru = fieldStiker(sm);
      if (!baru) {
        await tolak(hisoka, m, '❌ Stiker ini tidak membawa data media yang bisa disimpan (mediaKey/directPath kosong).');
        return;
      }
      const duplikat = cariDuplikat(pack, baru);
      if (duplikat) {
        await tolak(hisoka, m, teksDuplikat(duplikat, pack.length, false));
        return;
      }
      pack.push(baru);
      simpanPack(pack);
      await tolak(hisoka, m, `✅ *Stiker ditambahkan ke pack.*\n• Total sekarang: *${pack.length} stiker*\n• Stiker ini: ${baru.isLottie ? 'Lottie' : (baru.isAnimated ? 'WebP animasi' : 'WebP')} — \`${(baru.mediaKey || '').slice(0, 12)}…\`\n• Tersimpan di \`data/reactstiker.json\`\n\n> _Coba langsung: reply pesan lalu .reacts 1._`);
      logCommand(m, hisoka, m.command || 'reactstiker');
      return;
    }
    if (arg === 'list') {
      if (!pack.length) {
        await tolak(hisoka, m, `*Pack reactstiker — 0 stiker*\n• Total: *0 stiker* (realtime)\n• Stiker Lottie bawaan: *dipakai*\n• Daftarin: \`.reacts add\` sambil reply stiker\n\n> _Pack kosong, jadi tempelan pakai stiker bawaan dulu._`);
        return;
      }
      const baris = pack.map((s, i) => `${i + 1}. ${s.isLottie ? 'Lottie' : 'WebP'} — \`${(s.mediaKey || '').slice(0, 12)}…\``);
      await tolak(hisoka, m, `*Pack reactstiker — ${pack.length} stiker*\n${baris.join('\n')}\n\n• Total: *${pack.length} stiker* (realtime)\n• Stiker Lottie bawaan: ~tidak dipakai~\n• Hapus: \`.reacts hapus <no>\`\n\n> _Stiker dipilih acak setiap kali ditempel._`);
      logCommand(m, hisoka, m.command || 'reactstiker');
      return;
    }
    const hapus = arg.match(/^hapus\s+(\d+)$/);
    if (hapus) {
      const no = Number(hapus[1]);
      if (no < 1 || no > pack.length) {
        await tolak(hisoka, m, `❌ Nomor tidak ada. Pack berisi ${pack.length} stiker — cek lewat \`.reactstiker list\`.`);
        return;
      }
      pack.splice(no - 1, 1);
      simpanPack(pack);
      await tolak(hisoka, m, `✅ *Stiker #${no} dihapus.*\n• Total sekarang: *${pack.length} stiker*${pack.length === 0 ? '\n\n> _Pack kosong — bot kembali pakai stiker Lottie bawaan._' : '\n\n> _Sisa pack masih bisa dipakai buat tempel._'}`);
      logCommand(m, hisoka, m.command || 'reactstiker');
      return;
    }
    // `.reacts addauto` → toggle auto-tambah stiker kiriman owner ke pack
    // (menu / on / off); status on/off tersimpan di config.json.
    if (arg === 'addauto' || arg.startsWith('addauto ')) {
      const sub = arg.slice('addauto'.length).trim();
      if (sub === 'on') await setAddAuto(hisoka, m, true, { loadConfig, saveConfig });
      else if (sub === 'off') await setAddAuto(hisoka, m, false, { loadConfig, saveConfig });
      else if (sub === '') await tampilMenuAddAuto(hisoka, m, { loadConfig, Button });
      else await balas(hisoka, m, `❌ Argumen tidak dikenal: *${sub}*\n\nGunakan:\n• \`${m.prefix || '.'}reacts addauto\` — menu pilih aktif/nonaktif\n• \`${m.prefix || '.'}reacts addauto on\` — aktifkan\n• \`${m.prefix || '.'}reacts addauto off\` — nonaktifkan`);
      logCommand(m, hisoka, m.command || 'reactstiker');
      return;
    }
    // Tanpa argumen = tampilkan info (total pack realtime + cara pakai); argumen
    // x15 / 15 = jumlah stiker yang ditempel ke pesan target.
    if (!arg) {
      await tolak(hisoka, m, teksInfo(pack.length, addAutoAktif));
      logCommand(m, hisoka, m.command || 'reactstiker');
      return;
    }
    const cocok = arg.match(/^x?(\d+)$/);
    if (!cocok) {
      await tolak(hisoka, m, teksInfo(pack.length, addAutoAktif));
      return;
    }
    const jumlah = Math.min(Math.max(Number(cocok[1]) || 1, 1), MAKS_JUMLAH);
    const targetKey = kunciTarget(m, hisoka);
    if (!targetKey) {
      await tolak(hisoka, m, '❌ Reply pesan target dulu, baru `.reactstiker`.');
      return;
    }
    if (!pack.length) {
      await tolak(hisoka, m, '❌ Pack masih kosong — daftarin stiker dulu lewat `.reacts add` sambil reply stiker.');
      return;
    }
    const pilihan = pilihStiker(pack, jumlah);
    const isiKutip = m.quoted?.raw || m.quoted?.message;
    const tipeTarget = m.quoted?.type || (isiKutip && Object.keys(isiKutip).find((k) => k.endsWith('Message'))) || '';
    if (tipeTarget === 'stickerMessage') {
      console.log(`[reacts] balas ${pilihan.length} ke stiker ${targetKey.remoteJid} id=${targetKey.id} fromMe=${targetKey.fromMe}`);
      let terkirim = 0;
      for (let i = 0; i < pilihan.length; i++) {
        if (await balasStiker(hisoka, m, targetKey, pilihan[i], tipeTarget)) terkirim++;
        if (i < pilihan.length - 1) await tidur(JEDA_MS);
      }
      if (!terkirim) {
        await tolak(hisoka, m, '❌ Tidak bisa ambil isi pesan stiker target (pesan sudah terlalu lama / tidak ada di cache) — coba reply stiker yang baru dikirim.');
        return;
      }
      await tolak(hisoka, m, `✅ *${terkirim} stiker* dikirim sebagai balasan ke stiker itu.\n• Pack: *${pack.length} stiker*\n\n> _WhatsApp tidak menampilkan reaksi stiker di pesan stiker, jadi stiker dikirim sebagai balasan — kelihatan tepat di bawah target._`);
      logCommand(m, hisoka, m.command || 'reactstiker');
      return;
    }
    console.log(`[reacts] tempel ${pilihan.length} ke ${targetKey.remoteJid} id=${targetKey.id} fromMe=${targetKey.fromMe} participant=${targetKey.participant || '-'} tipe=${tipeTarget || '-'}`);
    for (let i = 0; i < pilihan.length; i++) {
      await tempelStiker(hisoka, m, targetKey, pilihan[i], i);
      if (i < pilihan.length - 1) await tidur(JEDA_MS);
    }
    await tolak(hisoka, m, `✅ *${pilihan.length} stiker* ditempel ke pesan itu.\n• Pack: *${pack.length} stiker*\n\n> _Cek hasilnya di HP — stikernya nempel di pesan target._`);
    logCommand(m, hisoka, m.command || 'reactstiker');
  } catch (e) {
    await tolak(hisoka, m, `❌ Gagal tempel stiker: ${e?.message || e}`);
  }
}

export { handleReactAddAuto, handleReactAddAutoCallbacks };
export const command = /^(reacts|reactstiker)$/i;
export const tags = ['media'];
export const help = ['reacts', 'reactstiker'];
export default handleReactStiker;
