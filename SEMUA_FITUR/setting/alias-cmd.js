/**
 * alias-cmd.js — Toggle fitur Alias Command ("Maksudmu...?") on/off.
 *
 * Perintah:
 *   .alias        → menu single-select (Aktifkan / Nonaktifkan) + status saat ini
 *   .alias on     → aktifkan saran typo; bila sudah aktif, bot sebutkan sudah
 *                   aktif sejak kapan + sudah berapa lama (realtime dari config)
 *   .alias off    → nonaktifkan saran typo
 *
 * Status tersimpan realtime di config.json seksi "alias":
 *   { "enabled": true, "sejak": <epoch ms saat diaktifkan | null bila mati> }
 * Blok alias di message.js membaca seksi ini tiap pesan (loadConfig fresh),
 * jadi perubahan berlaku seketika tanpa restart. Default: aktif.
 */
'use strict';

const CB_ON = '__alias_on__';
const CB_OFF = '__alias_off__';

// ── Balas teks: kirim LANGSUNG tanpa quote (pola hisoka.sendMessage yang
//    dipakai .s / aturbrowser dan terbukti sampai). tolak/m.reply memakai
//    quoted + ephemeralExpiration; di grup ini balasan itu tidak sampai ke
//    Wily (handler jalan, config tersimpan, logCommand jalan, tapi pesan
//    tidak tampil — 24 Nov 18:36). Fallback ke m.reply bila direct gagal.
async function balas(hisoka, m, teks) {
  try {
    await hisoka.sendMessage(m.from, { text: teks });
    return true;
  } catch (_) {}
  try { await m.reply(teks); return true; } catch (_) {}
  return false;
}

// ── Baca seksi alias dari config (fresh tiap panggil); isi default bila belum ada ──
function bacaAlias(loadConfig) {
  let cfg = {};
  try { cfg = loadConfig() || {}; } catch (_) { cfg = {}; }
  if (!cfg.alias || typeof cfg.alias !== 'object') cfg.alias = {};
  if (typeof cfg.alias.enabled !== 'boolean') cfg.alias.enabled = true;
  if (cfg.alias.enabled && typeof cfg.alias.sejak !== 'number') cfg.alias.sejak = Date.now();
  if (!cfg.alias.enabled) cfg.alias.sejak = null;
  return cfg;
}

// ── Format epoch ms → "24 Nov 2026, 18:30 WIB" ──
function formatWaktuWIB(ms) {
  try {
    return new Date(ms).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).replace(/\./g, ':') + ' WIB';
  } catch (_) { return ''; }
}

// ── Format selisih ms → "2 jam 15 menit" / "45 detik" / "3 hari 2 jam" ──
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

// ── Teks status saat ini (dipakai menu + balasan) ──
function teksStatus(alias) {
  if (!alias.enabled) return '⛔ *Nonaktif*';
  const sejak = typeof alias.sejak === 'number' ? alias.sejak : null;
  if (!sejak) return '✅ *Aktif*';
  return `✅ *Aktif*\nSejak: *${formatWaktuWIB(sejak)}*\nSudah: *${formatDurasi(Date.now() - sejak)}*`;
}

// ── Inti toggle: nyalakan/matikan + simpan realtime + balas ──
async function setAlias(hisoka, m, nyala, { loadConfig, saveConfig }) {
  const cfg = bacaAlias(loadConfig);
  const alias = cfg.alias;
  const pref = m.prefix || '.';
  if (nyala && alias.enabled) {
    const sejak = typeof alias.sejak === 'number' ? alias.sejak : null;
    const sejakTeks = sejak
      ? `\nSejak: *${formatWaktuWIB(sejak)}*\nSudah: *${formatDurasi(Date.now() - sejak)}*`
      : '';
    await balas(hisoka, m, `ℹ️ *Fitur Alias sudah aktif.*${sejakTeks}\n\n> _Saran typo tetap tampil saat kamu salah ketik command._`);
    return true;
  }
  if (!nyala && !alias.enabled) {
    await balas(hisoka, m, `ℹ️ *Fitur Alias sudah nonaktif.*\n\n> _Aktifkan lagi dengan_ \`${pref}alias on\` _atau_ \`${pref}alias\` _lalu pilih Aktifkan._`);
    return true;
  }
  alias.enabled = nyala;
  alias.sejak = nyala ? Date.now() : null;
  cfg.alias = alias;
  saveConfig(cfg);
  if (nyala) {
    await balas(hisoka, m, `✅ *Fitur Alias diaktifkan.*\nSejak: *${formatWaktuWIB(alias.sejak)}*\n\n> _Salah ketik command akan menampilkan saran "Maksudmu...?" lagi._`);
  } else {
    await balas(hisoka, m, `⛔ *Fitur Alias dinonaktifkan.*\n\n> _Salah ketik command tidak lagi dibalas saran._\n> _Aktifkan lagi dengan_ \`${pref}alias on\` _atau_ \`${pref}alias\` _lalu pilih Aktifkan._`);
  }
  return true;
}

// ── Menu single-select (tanpa argumen) ──
// Pola Button class (message.js) — SAMA seperti picker .animgif/.tts/.animquote
// yang terbukti tampil. sendConfirmWithButtons (interactive-msg.js) TIDAK
// dipakai lagi: list-nya tidak muncul di HP Wily (relay tanpa additionalNodes
// biz/native_flow). Bila Button gagal, fallback teks biasa via balas().
async function tampilMenu(hisoka, m, { loadConfig, Button }) {
  const cfg = bacaAlias(loadConfig);
  const pref = m.prefix || '.';
  const body =
    `🔍 *FITUR ALIAS* — _"Maksudmu...?"_\n\n` +
    `Status: ${teksStatus(cfg.alias)}\n\n` +
    `> _Bila aktif, salah ketik command menampilkan daftar saran mirip (tidak auto-jalan)._\n` +
    `> _Bila nonaktif, salah ketik command diabaikan diam-diam._\n\n` +
    `Pilih di bawah ini, atau ketik \`${pref}alias on\` / \`${pref}alias off\`.`;
  let sentBtn = null;
  if (typeof Button === 'function') {
    try {
      const btn = new Button()
        .setBody(body)
        .setFooter('WilyBot • Alias Command')
        .addSelection('🔍 Pilih');
      btn.makeSections('Alias');
      btn.makeRow('', '✅ Aktifkan Alias', 'Tampilkan saran saat salah ketik', CB_ON);
      btn.makeRow('', '⛔ Nonaktifkan Alias', 'Abaikan salah ketik diam-diam', CB_OFF);
      sentBtn = await btn.run(m.from, hisoka, m);
    } catch (e) {
      console.error('[Alias] Button send gagal:', e?.message || e);
      sentBtn = null;
    }
  }
  if (!sentBtn) {
    await balas(hisoka, m, body + `\n\nKetik \`${pref}alias on\` atau \`${pref}alias off\`.`);
  }
  return true;
}

async function handleAlias({ hisoka, m, query, tolak, logCommand, loadConfig, saveConfig, Button }) {
  if (!m.isOwner) return;
  const arg = (query || '').trim().toLowerCase();
  try {
    if (arg === 'on') await setAlias(hisoka, m, true, { loadConfig, saveConfig });
    else if (arg === 'off') await setAlias(hisoka, m, false, { loadConfig, saveConfig });
    else if (arg === '') await tampilMenu(hisoka, m, { loadConfig, Button });
    else await balas(hisoka, m, `❌ Argumen tidak dikenal: *${arg}*\n\nGunakan:\n• \`${m.prefix || '.'}alias\` — menu pilih aktif/nonaktif\n• \`${m.prefix || '.'}alias on\` — aktifkan\n• \`${m.prefix || '.'}alias off\` — nonaktifkan`);
    if (typeof logCommand === 'function') logCommand(m, hisoka, 'alias ' + (arg || 'menu'));
  } catch (err) {
    console.error('[Alias] Error:', err?.message || err);
    await balas(hisoka, m, `❌ Gagal mengatur fitur Alias: _${err?.message || err}_`);
  }
}

// ── Callback tap tombol single-select .alias (__alias_on__ / __alias_off__) ──
// Dipanggil dari message.js (seksi callback), sebelum plugin dispatcher.
async function handleAliasCallbacks({ hisoka, m, tolak, logCommand, loadConfig, saveConfig }) {
  const txt = typeof m.text === 'string' ? m.text.trim() : '';
  if (txt !== CB_ON && txt !== CB_OFF) return false;
  if (!m.isOwner) return false;
  try {
    await setAlias(hisoka, m, txt === CB_ON, { loadConfig, saveConfig });
    if (typeof logCommand === 'function') logCommand(m, hisoka, 'alias ' + (txt === CB_ON ? 'on' : 'off') + ' (tombol)');
  } catch (err) {
    console.error('[Alias] Error callback:', err?.message || err);
    await balas(hisoka, m, `❌ Gagal mengatur fitur Alias: _${err?.message || err}_`);
  }
  return true;
}

export { handleAlias, handleAliasCallbacks };
export const command = /^(alias)$/i;
export const tags = ['setting'];
export const help = ['alias'];
export default handleAlias;
