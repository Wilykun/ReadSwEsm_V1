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
 *  jadibot.js — Manajemen sesi jadibot
 *  Spawn/stop bot sekunder per user, routing command
 * ───────────────────────────────
 */
'use strict'

import {
  default as makeWASocket,
  fetchLatestBaileysVersion,
  DisconnectReason,
  jidNormalizedUser,
  jidDecode,
  isJidGroup,
  getContentType,
  downloadMediaMessage,
  delay,
  Browsers,
  generateWAMessageFromContent
} from '@whiskeysockets/baileys';

import fs from 'fs'
import path from 'path'
import pino from 'pino'
import QRCode from 'qrcode'
import { execFile } from 'child_process'
import { getRandomEmoji, getStatusEmojis } from '../helper/emoji.js' // masih dipakai di bot utama via hotReload, jangan hapus
import {
  updateSwStatsAt,
  pruneSwStatsAt,
  extractSwNumber,
  storyDebounce,
  maskNumber,
  logStoryView,
  logStoryRetrySummary,
  getMediaTypeEmoji,
  getStoryCountToday,
  createSwTracker,
  initJadibotCekswConfig,
  lookupSwMsgOwner,
} from './swtrack.js'
import { injectClient } from '../helper/inject.js'
import { useSingleFileAuthState } from './authState.js'
import JSONDB from '../db/json.js'
import { cleanStaleSessionFiles } from './cleaner.js'
import { logError } from '../db/errorLog.js'
import { getJadibotAnticall, getJadibotAnticallvid, getJadibotNumber, getJadibotReadsw, getJadibotAutoOnline, getJadibotEmojis, getJadibotRandomEmoji, getJadibotAutoTyping, getJadibotAutoRecording, getJadibotReadchat, getJadibotEmojiMode, getJadibotAntidel } from './jadibotSettings.js'
import { getHandler } from './hotReload.js'
import { kvGet, kvSet } from '../db/datadb.js'

/* ================= LOGGER ================= */
const silentLogger = pino({ level: 'silent' })

/* ─── HELPER: dapatkan socket bot utama yang aktif/terbaru ─── */
// mainBotSock bisa stale (socket lama) setelah bot utama reconnect.
// global.hisokaClient selalu diupdate ke socket terbaru di index.js.
// Fungsi ini memastikan kita selalu pakai socket bot utama yang masih hidup.
function getActiveMainSock(fallback = null) {
  return global.hisokaClient || fallback || null
}

/* ================= ANTIDEL MEDIA PRE-CACHE ================= */
const _ANTIDEL_MEDIA_TYPES = new Set(['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'])
const _ANTIDEL_MAX_BYTES   = 15 * 1024 * 1024 // 15 MB — skip video besar
const _ANTIDEL_TTL_MS      = 90 * 1000        // 90 detik (lebih lama dari cacheMsg 60s)

async function preDownloadMediaForAntidel(msg, sock) {
  try {
    if (!msg?.key?.id || !sock?.mediaCacheAntidel) return
    if (sock.mediaCacheAntidel.has(msg.key.id)) return

    let targetMsg = msg.message
    if (!targetMsg) return
    if (targetMsg.ephemeralMessage?.message) targetMsg = targetMsg.ephemeralMessage.message

    const type = getContentType(targetMsg)
    if (!_ANTIDEL_MEDIA_TYPES.has(type)) return

    const content = targetMsg[type]
    if (!content?.mimetype) return

    const buffer = await downloadMediaMessage(
      { ...msg, message: targetMsg },
      'buffer',
      {},
      { reuploadRequest: sock.updateMediaMessage }
    )
    if (!buffer || buffer.length === 0 || buffer.length > _ANTIDEL_MAX_BYTES) return

    const msgId = msg.key.id
    sock.mediaCacheAntidel.set(msgId, buffer)
    setTimeout(() => sock.mediaCacheAntidel?.delete(msgId), _ANTIDEL_TTL_MS)
  } catch (_) {}
}

/* ================= KONSTANTA ================= */
const PAIRING_TIMEOUT_MS = 3 * 60 * 1000 // 3 menit
const DEFAULT_JADIBOT_DURATION_MS = 24 * 60 * 60 * 1000
const MAX_TIMER_MS = 2147483647
const JADIBOT_DATA_PATH = path.join(process.cwd(), 'data_jadibot', 'realtime.json')
const PENDING_EXPIRE_NOTIFS_PATH = path.join(process.cwd(), 'data_jadibot', 'pending_expire_notifs.json')
fs.mkdirSync(path.join(process.cwd(), 'data_jadibot'), { recursive: true })
const JADIBOT_EXPIRY_WARNING_THRESHOLDS = [
  { ms: 10 * 60 * 1000, label: '10 menit' },
  { ms: 5 * 60 * 1000, label: '5 menit' },
  { ms: 60 * 1000, label: '1 menit' },
  { ms: 30 * 1000, label: '30 detik' }
]

/* ================= BAILEYS VERSION CACHE ================= */
// Fetch sekali saja — reconnect berikutnya pakai cache, tidak request internet lagi
let _cachedBaileysVersion = null
async function getJadibotVersion() {
  if (_cachedBaileysVersion) return _cachedBaileysVersion
  try {
    const result = await fetchLatestBaileysVersion()
    _cachedBaileysVersion = result
    return result
  } catch {
    // Fallback ke versi stabil jika fetch gagal
    return { version: [2, 3000, 1015901307], isLatest: false }
  }
}

/* ================= STATE ================= */
const jadibotMap = new Map()
const jadibotClearSesiMap = new Map()    // number → clearCacheInPlace fn
const jadibotSesiReportMap = new Map()   // number → getSizeReport fn
const jadibotConnectedAt = new Map()
const startingSocketMap = new Map()
const pairingRequested = new Set()
const pairingTimeoutNotified = new Set() // guard idempotensi: cegah notif pairing-timeout ganda
const stoppingJadibot = new Set()
const expiringJadibot = new Set()
const reconnectingJadibot = new Set()
// In-memory flag — sengaja TIDAK disimpan ke file agar reset tiap bot restart.
// Tujuannya cuma cegah spam notif reconnect dalam SATU sesi, bukan lintas restart.
const reconnectNotifiedSet = new Set()
const activeOrStartingJadibot = new Set()
const pairingTimeout = new Map()
const pendingJadibotChoices = new Map()
const expiryTimers = new Map()
const expiryWarningTimers = new Map()
// Per-jadibot in-memory dedup Set — setiap nomor punya Set sendiri
const jadibotSwSets = new Map()
// Per-jadibot SwTracker — data tersimpan di folder khusus per-nomor jadibot
const jadibotTrackers = new Map()
// Per-jadibot periodic SessionCleaner interval — bersihkan session/sender-key lama saat session jalan lama
const jadibotCleanerTimers = new Map()
// Per-jadibot autoonline interval — isolated per jadibot, tidak mempengaruhi bot utama/jadibot lain
const autoOnlineIntervalMap = new Map()
const swPruneIntervalMap = new Map()

function claimPairingTimeoutNotification(number) {
  if (pairingTimeoutNotified.has(number)) return false
  pairingTimeoutNotified.add(number)
  setTimeout(() => pairingTimeoutNotified.delete(number), 10000)
  return true
}

// sendPresenceUpdate() mengembalikan Promise. Socket dapat tertutup setelah
// pengecekan sock.user tetapi sebelum pengiriman selesai, jadi try/catch saja
// tidak cukup untuk menangkap rejection "Connection Closed".
function safeSendPresenceUpdate(sock, presence, jid = undefined) {
  try {
    if (!sock?.sendPresenceUpdate) return
    const result = jid === undefined
      ? sock.sendPresenceUpdate(presence)
      : sock.sendPresenceUpdate(presence, jid)
    if (result && typeof result.catch === 'function') result.catch(() => {})
  } catch {}
}

/* ─── PER-JADIBOT AUTOONLINE ─── */
export function startJadibotAutoOnline(sock, jadibotNum) {
  // Bersihkan interval lama dulu (reconnect / setting berubah)
  if (autoOnlineIntervalMap.has(jadibotNum)) {
    clearInterval(autoOnlineIntervalMap.get(jadibotNum))
    autoOnlineIntervalMap.delete(jadibotNum)
  }
  const aoSettings = getJadibotAutoOnline(jadibotNum)
  const intervalMs = Math.max(10000, (aoSettings.intervalSeconds || 30) * 1000)
  // Flag stealth per-socket — dibaca event.js & interactive-msg.js
  sock.__stealthMode = !aoSettings.enabled
  if (aoSettings.enabled) {
    // Mode ON: kirim available berkala → kontak lihat online realtime
    if (sock?.user) sock.updateOnlinePrivacy('all').catch(() => {})
    if (sock?.user) safeSendPresenceUpdate(sock, 'available')
    const iv = setInterval(() => {
      if (sock?.user) safeSendPresenceUpdate(sock, 'available')
    }, intervalMs)
    autoOnlineIntervalMap.set(jadibotNum, iv)
  } else {
    // Mode STEALTH (off):
    // Set privacy online → match_last_seen agar perangkat tertautan jadibot juga tidak
    // terlihat online. Terisolasi per-socket jadibot, tidak mempengaruhi bot utama/jadibot lain.
    // Kirim unavailable berkala setiap 5 detik untuk lawan keepalive WA (25s)
    // — tanpa ini bot flash online ~3-5 detik tiap 25s lalu offline terus-menerus
    if (sock?.user) sock.updateOnlinePrivacy('match_last_seen').catch(() => {})
    if (sock?.user) safeSendPresenceUpdate(sock, 'unavailable')
    const iv = setInterval(() => {
      // Skip saat typing/recording aktif — jangan potong delay
      if (sock.__typingActive > 0) return;
      if (sock?.user) safeSendPresenceUpdate(sock, 'unavailable')
    }, 5000)
    autoOnlineIntervalMap.set(jadibotNum, iv)
  }
}

export function stopJadibotAutoOnline(jadibotNum) {
  if (autoOnlineIntervalMap.has(jadibotNum)) {
    clearInterval(autoOnlineIntervalMap.get(jadibotNum))
    autoOnlineIntervalMap.delete(jadibotNum)
  }
}

/* ─── PER-JADIBOT SW PRUNE (auto tiap 6 jam) ─── */
const _SW_PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 jam

function startJadibotSwPrune(jadibotNum) {
  // Bersihkan interval lama dulu (reconnect)
  if (swPruneIntervalMap.has(jadibotNum)) {
    clearInterval(swPruneIntervalMap.get(jadibotNum))
    swPruneIntervalMap.delete(jadibotNum)
  }
  const statsPath = path.join(process.cwd(), 'data_jadibot', jadibotNum, 'ceksw', 'swstats.json')
  const iv = setInterval(() => {
    try { pruneSwStatsAt(statsPath, jadibotNum) } catch {}
  }, _SW_PRUNE_INTERVAL_MS)
  swPruneIntervalMap.set(jadibotNum, iv)
}

function stopJadibotSwPrune(jadibotNum) {
  if (swPruneIntervalMap.has(jadibotNum)) {
    clearInterval(swPruneIntervalMap.get(jadibotNum))
    swPruneIntervalMap.delete(jadibotNum)
  }
}

/* ================= UTILS ================= */
function loadConfig() {
  try {
    const p = path.join(process.cwd(), 'config.json')
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {}
  return {}
}

// Ambil link WA owner dari config.botReply.sourceUrl (fallback ke nomor pertama di owners)
function getOwnerContact() {
  try {
    const cfg = loadConfig()
    if (cfg.botReply?.sourceUrl) return cfg.botReply.sourceUrl
    const owner = (cfg.owners || [])[0]
    if (owner) return `https://wa.me/${owner}`
  } catch {}
  return 'https://wa.me/6289688206739'
}

function isSessionValid(sessionDir) {
  const sessionFile = sessionDir + '.json'
  return fs.existsSync(sessionFile) || fs.existsSync(path.join(sessionDir, 'creds.json'))
}

function ensureJadibotDataDir() {
  fs.mkdirSync(path.dirname(JADIBOT_DATA_PATH), { recursive: true })
}

function loadJadibotRealtimeData() {
  try {
    ensureJadibotDataDir()
    if (!fs.existsSync(JADIBOT_DATA_PATH)) return { bots: {} }
    const parsed = JSON.parse(fs.readFileSync(JADIBOT_DATA_PATH, 'utf-8'))
    if (!parsed || typeof parsed !== 'object') return { bots: {} }
    if (!parsed.bots || typeof parsed.bots !== 'object') parsed.bots = {}
    return parsed
  } catch {
    return { bots: {} }
  }
}


function saveJadibotRealtimeData(data) {
  ensureJadibotDataDir()
  const tmpPath = `${JADIBOT_DATA_PATH}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  fs.renameSync(tmpPath, JADIBOT_DATA_PATH)
}

function formatDurationMs(ms) {
  const totalMinutes = Math.max(1, Math.round(ms / 60000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  const parts = []
  if (days) parts.push(`${days} hari`)
  if (hours) parts.push(`${hours} jam`)
  if (minutes) parts.push(`${minutes} menit`)
  return parts.join(' ') || '1 menit'
}

function formatRemainingTime(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 'kedaluwarsa'
  const totalSeconds = Math.ceil(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const parts = []
  if (days) parts.push(`${days} hari`)
  if (hours) parts.push(`${hours} jam`)
  if (minutes) parts.push(`${minutes} menit`)
  if (seconds && !days) parts.push(`${seconds} detik`)
  if (!parts.length) parts.push(`${seconds} detik`)
  return parts.slice(0, 4).join(' ')
}

function formatJadibotExpiryTime(timestamp) {
  const value = Number(timestamp)
  if (!Number.isFinite(value) || value <= 0) return 'belum tercatat'
  return new Date(value).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).replace(/\./g, ':') + ' WIB'
}

function clearJadibotExpiryWarningTimers(number) {
  number = String(number || '').replace(/[^0-9]/g, '')
  const timers = expiryWarningTimers.get(number) || []
  for (const timer of timers) clearTimeout(timer)
  expiryWarningTimers.delete(number)
}

// ── Helper realtime: baca setting per-jadibot → list fitur aktif & berhenti ─
// Semua fungsi notif pakai ini — tidak ada lagi hardcode daftar fitur
// Total auto fitur: 7 (readsw, antidel, anticall, anticallvid, online, typing, recording)
// → konsisten dengan counter di menu-cmd.js (_jbAutoList.length = 7)
function buildJadibotFeatureStatus(number) {
  const readsw      = getJadibotReadsw(number)
  const antidel     = getJadibotAntidel(number)
  const autoTyping  = getJadibotAutoTyping(number)
  const autoRec     = getJadibotAutoRecording(number)
  const autoOnline  = getJadibotAutoOnline(number)
  const anticall    = getJadibotAnticall(number)
  const anticallvid = getJadibotAnticallvid(number)

  const swOn    = readsw.enabled !== false
  const reactOn = swOn && readsw.autoReaction !== false

  // swStatus string — format inline untuk baris fitur
  const swStatus = !swOn
    ? `~ReadSW~ ~ReactionSW~ _(nonaktif)_`
    : reactOn ? `*ReadSW + ReactionSW* ✅`
              : `*ReadSW* ✅ _— tanpa reaksi_`

  const antidelOn      = antidel.enabled === true
  const typingOn       = autoTyping.enabled === true
  const recOn          = autoRec.enabled === true
  const onlineOn       = autoOnline.enabled === true
  const anticallOn     = anticall.enabled === true
  const anticallvidOn  = anticallvid.enabled === true

  // Fitur yang AKTIF — numbered list, untuk notif connect/reconnect/welcome
  const activeLines = []
  if (swOn)           activeLines.push(`👁️ ${swStatus}`)
  if (antidelOn)      activeLines.push(`🔕 *Anti-Delete* — Tangkap pesan yang dihapus`)
  if (typingOn)       activeLines.push(`💬 *Auto Typing* — Indikator mengetik realtime`)
  if (recOn)          activeLines.push(`🎙️ *Auto Recording* — Indikator merekam realtime`)
  if (onlineOn)       activeLines.push(`🟢 *Auto Online* — Selalu tampil online`)
  if (anticallOn)     activeLines.push(`🚫 *Anti Call* — Tolak panggilan suara otomatis`)
  if (anticallvidOn)  activeLines.push(`📵 *Anti Call Video* — Tolak panggilan video otomatis`)
  activeLines.push(`🤖 *Full Command Bot* — Semua perintah aktif`)
  const activeFeaturesText = activeLines.map((l, i) => `${i + 1}. ${l}`).join('\n')

  // Fitur yang BERHENTI — bullet ~strikethrough~, untuk notif stop/expired/warning
  // Hanya fitur yang sedang ON yang masuk daftar ini
  const stoppedLines = []
  if (swOn)            stoppedLines.push(`~ReadSW${reactOn ? ' + ReactionSW' : ''}~`)
  if (antidelOn)       stoppedLines.push(`~Anti-Delete~`)
  if (typingOn || recOn) stoppedLines.push(`~Auto Typing${recOn ? ' / Recording' : ''}~`)
  if (onlineOn)        stoppedLines.push(`~Auto Online~`)
  if (anticallOn)      stoppedLines.push(`~Anti Call~`)
  if (anticallvidOn)   stoppedLines.push(`~Anti Call Video~`)
  stoppedLines.push(`~Semua command bot~`)
  const stoppedFeaturesText = stoppedLines.map(l => `• ${l}`).join('\n')

  return { activeFeaturesText, stoppedFeaturesText, swStatus, swOn, reactOn }
}

// direct=true → pesan dikirim langsung ke nomor jadibot (user)
// direct=false → pesan dikirim ke GC/owner
function msgJadibotExpiryWarning(number, remainingText, expiresAtText, durationLabel = '1 hari', direct = false) {
  const masked = maskNumber(number)
  const ver = loadConfig().botVersion || 'V27.1'

  if (direct) {
    // ── Ke USER jadibot (personal, kasual) ──
    return (
      `╔══════════════════════╗\n` +
      `║  ⏰  *HAMPIR HABIS!*   ║\n` +
      `╚══════════════════════╝\n\n` +
      `📱 *Nomor kamu:* \`+${number}\`\n` +
      `⏳ *Sisa waktu:* *${remainingText}*\n` +
      `📅 *Habis pada:* _${expiresAtText}_\n\n` +
      `⚠️ *Masa aktif jadibot kamu akan segera berakhir!*\n\n` +
      `_Jika tidak diperpanjang, fitur berikut akan berhenti:_\n` +
      `${buildJadibotFeatureStatus(number).stoppedFeaturesText}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `> 💡 _Hubungi owner sekarang untuk perpanjang masa aktif:_\n` +
      `📞 ${getOwnerContact()}\n\n` +
      `> _Notif otomatis — Wily Bot ${ver}_ 🤖`
    )
  }

  // ── Ke GC/owner (monitoring, dengan command) ──
  return (
    `╔══════════════════════╗\n` +
    `║  ⏰  *HAMPIR EXPIRED*  ║\n` +
    `╚══════════════════════╝\n\n` +
    `📱 *Nomor  :* \`+${number}\`\n` +
    `⏳ *Sisa   :* *${remainingText}*\n` +
    `📅 *Habis  :* _${expiresAtText}_\n\n` +
    `⚠️ *Masa aktif jadibot +${masked} akan segera habis!*\n` +
    `_Bot otomatis berhenti dan sesi dihapus saat waktu tiba._\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🛠️ *Perpanjang Sekarang:*\n` +
    `• \`.upbot ${number} ${durationLabel}\` — perpanjang durasi\n` +
    `• \`.upbot ${number} p\` — ubah ke permanent\n\n` +
    `> _Notif otomatis — Wily Bot ${ver}_ 🤖`
  )
}

async function sendDirectJadibotNotice(sock, number, text) {
  if (!sock || !number || !text) return
  try {
    await sock.sendMessage(`${number}@s.whatsapp.net`, { text })
  } catch {}
}

// Kirim pesan langsung ke nomor jadibot via main bot, dengan resolve JID (LID support)
async function sendDirectToUser(mainBotSock, number, text) {
  const sock = getActiveMainSock(mainBotSock)
  if (!sock) return false
  try {
    await delay(800)
    let jid = `${number}@s.whatsapp.net`
    try {
      const [res] = await sock.onWhatsApp(`${number}@s.whatsapp.net`)
      if (res?.exists && res?.jid) jid = res.jid
    } catch {}
    await sock.sendMessage(jid, { text })
    console.log(`[JADIBOT] ✅ Notif user terkirim ke +${number} (jid: ${jid})`)
    return true
  } catch (e) {
    console.log(`[JADIBOT] ⚠️ Gagal kirim notif user ke +${number}: ${e?.message}`)
    return false
  }
}

function getJadibotExpirySummary(number) {
  const meta = getJadibotExpiry(number)
  if (!meta) {
    return {
      remaining: 'Tidak diketahui',
      expiresAtText: 'Tidak diketahui',
      durationText: 'Tidak diketahui',
      status: 'unknown'
    }
  }
  if (meta.permanent === true) {
    return {
      remaining: 'Permanent',
      expiresAtText: 'Permanent',
      durationText: 'Permanent',
      status: 'permanent'
    }
  }
  const remainingMs = Number(meta.expiresAt) - Date.now()
  return {
    remaining: formatRemainingTime(remainingMs),
    expiresAtText: formatJadibotExpiryTime(meta.expiresAt),
    durationText: meta.durationText || formatDurationMs(Number(meta.durationMs) || DEFAULT_JADIBOT_DURATION_MS),
    status: remainingMs <= 0 ? 'expired' : (meta.status || 'active')
  }
}

// Satu satuan durasi, misal "1h", "20m", "2j". Diekspor biar jadibot-cmd.js
// pakai pattern yang sama persis (single source of truth), termasuk untuk
// durasi gabungan seperti "1h,20m" atau "1h.20m" (1 hari + 20 menit).
// Pemisah antar-satuan boleh koma (,) ATAU titik (.) — keduanya sama artinya.
const JADIBOT_DURATION_UNIT_SOURCE = '\\d+\\s*(?:menit|mnt|min|minute|minutes|m|jam|hour|hours|j|hari|day|days|h|d)'
const JADIBOT_DURATION_PERMANENT_SOURCE = '(?:permanent|permanen|perm|perma|selamanya|p)'
const JADIBOT_DURATION_COMPOUND_SOURCE = `${JADIBOT_DURATION_UNIT_SOURCE}(?:\\s*[,.]\\s*${JADIBOT_DURATION_UNIT_SOURCE})*`

function parseJadibotDuration(input = '') {
  const clean = String(input || '').trim().toLowerCase()
  if (!clean) {
    return {
      ms: DEFAULT_JADIBOT_DURATION_MS,
      label: formatDurationMs(DEFAULT_JADIBOT_DURATION_MS),
      isDefault: true
    }
  }
  // p = singkatan permanent
  if (['permanent', 'permanen', 'perm', 'perma', 'selamanya', 'p'].includes(clean)) {
    return {
      ms: 'permanent',
      label: 'Permanent',
      permanent: true,
      isDefault: false
    }
  }
  // Durasi gabungan dipisah koma ATAU titik, misal "1h,20m" / "1h.20m" =
  // 1 hari + 20 menit. m=menit, j=jam, h=hari, d=hari — dijumlahkan semua.
  const parts = clean.split(/[,.]/).map(p => p.trim()).filter(Boolean)
  if (!parts.length) return null
  let ms = 0
  for (const part of parts) {
    const match = part.match(/^(\d+)\s*(menit|mnt|min|minute|minutes|m|jam|hour|hours|j|hari|day|days|h|d)$/i)
    if (!match) return null
    const value = Number(match[1])
    if (!Number.isSafeInteger(value) || value <= 0) return null
    const unit = match[2].toLowerCase()
    let multiplier = 60000 // default: menit
    if (['jam', 'hour', 'hours', 'j'].includes(unit)) multiplier = 60 * 60000
    if (['hari', 'day', 'days', 'h', 'd'].includes(unit)) multiplier = 24 * 60 * 60000
    ms += value * multiplier
  }
  if (!Number.isSafeInteger(ms) || ms <= 0) return null
  return { ms, label: formatDurationMs(ms), isDefault: false }
}

function getJadibotExpiry(number) {
  number = String(number || '').replace(/[^0-9]/g, '')
  const data = loadJadibotRealtimeData()
  return data.bots[number] || null
}

function setPermanentJadibot(number, status = 'active') {
  number = String(number || '').replace(/[^0-9]/g, '')
  if (expiryTimers.has(number)) {
    clearTimeout(expiryTimers.get(number))
    expiryTimers.delete(number)
  }
  clearJadibotExpiryWarningTimers(number)
  const now = Date.now()
  const data = loadJadibotRealtimeData()
  const existing = data.bots[number] || {}
  data.bots[number] = {
    ...existing,
    number,
    permanent: true,
    status,
    createdAt: existing.createdAt || now,
    updatedAt: now,
    expiresAt: undefined,
    durationMs: undefined,
    durationText: 'Permanent',
    isPaused: undefined,
    pausedAt: undefined,
    pausedRemainingMs: undefined,
  }
  saveJadibotRealtimeData(data)
  return data.bots[number]
}

function ensureJadibotExpiry(number, durationMs = null, status = 'starting') {
  number = String(number || '').replace(/[^0-9]/g, '')
  const now = Date.now()
  const data = loadJadibotRealtimeData()
  const existing = data.bots[number]
  if (existing?.permanent === true) {
    existing.status = status
    existing.updatedAt = now
    data.bots[number] = existing
    saveJadibotRealtimeData(data)
    return existing
  }
  if (existing && Number(existing.expiresAt) > now) {
    existing.status = status
    existing.updatedAt = now
    data.bots[number] = existing
    saveJadibotRealtimeData(data)
    return existing
  }
  const ms = Number(durationMs) > 0 ? Number(durationMs) : DEFAULT_JADIBOT_DURATION_MS
  const meta = {
    number,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + ms,
    durationMs: ms,
    durationText: formatDurationMs(ms),
    status
  }
  data.bots[number] = meta
  saveJadibotRealtimeData(data)
  return meta
}

function extendJadibotExpiry(number, addedDurationMs, status = 'active') {
  number = String(number || '').replace(/[^0-9]/g, '')
  const addMs = Number(addedDurationMs)
  if (!number || !Number.isSafeInteger(addMs) || addMs <= 0) return null
  const now = Date.now()
  const data = loadJadibotRealtimeData()
  const existing = data.bots[number] || null
  const oldExpiresAt = existing?.permanent === true ? now : (Number(existing?.expiresAt) || 0)
  const baseExpiresAt = oldExpiresAt > now ? oldExpiresAt : now
  const oldRemainingMs = Math.max(0, baseExpiresAt - now)
  const newExpiresAt = baseExpiresAt + addMs
  const totalRemainingMs = Math.max(0, newExpiresAt - now)
  const meta = {
    ...(existing || {}),
    number,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    expiresAt: newExpiresAt,
    durationMs: totalRemainingMs,
    durationText: formatDurationMs(totalRemainingMs),
    addedDurationMs: addMs,
    addedDurationText: formatDurationMs(addMs),
    previousRemainingMs: oldRemainingMs,
    previousRemainingText: formatRemainingTime(oldRemainingMs),
    status,
    permanent: false,
  }
  data.bots[number] = meta
  saveJadibotRealtimeData(data)
  return meta
}

// Kebalikan dari extendJadibotExpiry: mengurangi sisa masa berlaku jadibot.
// Tidak berlaku untuk bot permanent (dikembalikan { error: 'permanent' }) karena
// permanent tidak punya expiresAt numerik untuk dikurangi.
// Hasil dijamin tidak pernah negatif — jika pengurangan melebihi sisa waktu,
// sisa langsung dianggap 0 (kedaluwarsa), bukan expiresAt di masa lalu.
function reduceJadibotExpiry(number, subtractedDurationMs, status = 'active') {
  number = String(number || '').replace(/[^0-9]/g, '')
  const subMs = Number(subtractedDurationMs)
  if (!number || !Number.isSafeInteger(subMs) || subMs <= 0) return null
  const now = Date.now()
  const data = loadJadibotRealtimeData()
  const existing = data.bots[number] || null
  if (!existing) return null
  if (existing.permanent === true) return { error: 'permanent' }
  const oldExpiresAt = Number(existing.expiresAt) || now
  const oldRemainingMs = Math.max(0, oldExpiresAt - now)
  const newExpiresAt = Math.max(now, oldExpiresAt - subMs)
  const totalRemainingMs = Math.max(0, newExpiresAt - now)
  const actualSubtractedMs = oldRemainingMs - totalRemainingMs
  const meta = {
    ...existing,
    number,
    createdAt: existing.createdAt || now,
    updatedAt: now,
    expiresAt: newExpiresAt,
    durationMs: totalRemainingMs,
    durationText: totalRemainingMs > 0 ? formatDurationMs(totalRemainingMs) : 'Kedaluwarsa',
    subtractedDurationMs: subMs,
    subtractedDurationText: formatDurationMs(subMs),
    previousRemainingMs: oldRemainingMs,
    previousRemainingText: formatRemainingTime(oldRemainingMs),
    status,
    permanent: false,
  }
  data.bots[number] = meta
  saveJadibotRealtimeData(data)
  return {
    ...meta,
    expiredNow: totalRemainingMs <= 0,
    requestedSubtractMs: subMs,
    actualSubtractedMs
  }
}

function updateJadibotExpiryStatus(number, status) {
  number = String(number || '').replace(/[^0-9]/g, '')
  const data = loadJadibotRealtimeData()
  if (!data.bots[number]) return null
  data.bots[number].status = status
  data.bots[number].updatedAt = Date.now()
  saveJadibotRealtimeData(data)
  return data.bots[number]
}

function persistConnectedAt(number, ts) {
  number = String(number || '').replace(/[^0-9]/g, '')
  const data = loadJadibotRealtimeData()
  if (!data.bots[number]) return
  data.bots[number].connectedAt = ts
  saveJadibotRealtimeData(data)
}

// ── Notif reconnect ke OWNER — in-memory saja ────────────────────────────────
// Owner dapat notif sekali per restart (set kosong tiap restart = by design).
function markJadibotReconnectNotified(number) {
  number = String(number || '').replace(/[^0-9]/g, '')
  reconnectNotifiedSet.add(number)
}

function isJadibotReconnectNotified(number) {
  number = String(number || '').replace(/[^0-9]/g, '')
  return reconnectNotifiedSet.has(number)
}

// ── Notif reconnect ke USER JADIBOT — persistent ke realtime.json ─────────────
// User hanya dapat notif SEKALI seumur sesi — tidak spam meski bot restart.
// Flag di-clear saat fresh pairing sehingga setelah pair ulang user dapat notif lagi.
function markJadibotUserReconnectNotified(number) {
  number = String(number || '').replace(/[^0-9]/g, '')
  try {
    const data = loadJadibotRealtimeData()
    if (!data.bots[number]) data.bots[number] = {}
    data.bots[number].userReconnectNotified = true
    saveJadibotRealtimeData(data)
  } catch {}
}

function isJadibotUserReconnectNotified(number) {
  number = String(number || '').replace(/[^0-9]/g, '')
  try {
    const data = loadJadibotRealtimeData()
    return data.bots[number]?.userReconnectNotified === true
  } catch { return false }
}

function clearJadibotUserReconnectNotified(number) {
  number = String(number || '').replace(/[^0-9]/g, '')
  try {
    const data = loadJadibotRealtimeData()
    if (data.bots[number]) {
      delete data.bots[number].userReconnectNotified
      saveJadibotRealtimeData(data)
    }
  } catch {}
}

function restoreConnectedAtMap() {
  const data = loadJadibotRealtimeData()
  for (const [number, meta] of Object.entries(data.bots || {})) {
    if (meta?.connectedAt && !jadibotConnectedAt.has(number)) {
      jadibotConnectedAt.set(number, Number(meta.connectedAt))
    }
  }
}

function removeJadibotExpiry(number) {
  number = String(number || '').replace(/[^0-9]/g, '')
  if (expiryTimers.has(number)) {
    clearTimeout(expiryTimers.get(number))
    expiryTimers.delete(number)
  }
  clearJadibotExpiryWarningTimers(number)
  reconnectNotifiedSet.delete(number)
  const data = loadJadibotRealtimeData()
  if (data.bots[number]) {
    delete data.bots[number]
    saveJadibotRealtimeData(data)
  }
}

// ── Pending expire notif queue — kirim notif saat bot offline/restart ──
// Saat expireJadibot dipanggil tapi main sock belum tersedia (bot belum konek),
// simpan notif ke file ini. Saat bot connect, drain queue dan kirim semua.
function savePendingExpireNotif(number, mode = 'v2') {
  number = String(number || '').replace(/[^0-9]/g, '')
  try {
    let queue = []
    if (fs.existsSync(PENDING_EXPIRE_NOTIFS_PATH)) {
      try { queue = JSON.parse(fs.readFileSync(PENDING_EXPIRE_NOTIFS_PATH, 'utf-8')) } catch {}
    }
    if (!Array.isArray(queue)) queue = []
    // Hindari duplikat
    if (!queue.some(e => e.number === number)) {
      queue.push({ number, mode, expiredAt: Date.now() })
      fs.writeFileSync(PENDING_EXPIRE_NOTIFS_PATH, JSON.stringify(queue, null, 2), 'utf-8')
      console.log(`[JADIBOT] 📥 Pending notif expired +${number} disimpan (akan dikirim saat bot konek)`)
    }
  } catch (e) {
    console.log(`[JADIBOT] ⚠️ Gagal simpan pending notif untuk +${number}: ${e?.message}`)
  }
}

async function drainPendingExpireNotifs(sock) {
  if (!sock) return
  if (!fs.existsSync(PENDING_EXPIRE_NOTIFS_PATH)) return
  let queue = []
  try {
    queue = JSON.parse(fs.readFileSync(PENDING_EXPIRE_NOTIFS_PATH, 'utf-8'))
  } catch { return }
  if (!Array.isArray(queue) || !queue.length) return
  // Hapus file dulu sebelum kirim (biar tidak re-drain saat crash di tengah)
  try { fs.unlinkSync(PENDING_EXPIRE_NOTIFS_PATH) } catch {}
  console.log(`[JADIBOT] 📤 Drain ${queue.length} pending notif expired...`)
  const cfg = loadConfig()
  const owners = (cfg.owners || []).map(n => String(n).replace(/[^0-9]/g, '')).filter(Boolean)
  for (const entry of queue) {
    const { number } = entry
    // Kirim notif ke user jadibot
    try {
      let _jid = `${number}@s.whatsapp.net`
      try {
        const [_res] = await sock.onWhatsApp(`${number}@s.whatsapp.net`)
        if (_res?.exists && _res?.jid) _jid = _res.jid
      } catch {}
      await sock.sendMessage(_jid, { text: msgJadibotExpired(number, true) })
      console.log(`[JADIBOT] ✅ Pending notif expired terkirim ke +${number}`)
    } catch (e) {
      console.log(`[JADIBOT] ⚠️ Gagal kirim pending notif expired ke +${number}: ${e?.message}`)
    }
    await new Promise(r => setTimeout(r, 800))
    // Kirim notif ke semua owner (kecuali kalau owner = user jadibot itu sendiri)
    for (const ownerNum of owners) {
      if (ownerNum === number) continue
      try {
        await sock.sendMessage(`${ownerNum}@s.whatsapp.net`, { text: msgOwnerExpired(number) })
        console.log(`[JADIBOT][OWNER-NOTIF] ✅ Pending owner notif expired terkirim ke +${ownerNum}`)
      } catch (e) {
        console.log(`[JADIBOT][OWNER-NOTIF] ⚠️ Gagal kirim pending owner notif ke +${ownerNum}: ${e?.message}`)
      }
      await new Promise(r => setTimeout(r, 800))
    }
  }
}

// ── Simpan sisa waktu jadibot saat logout paksa (agar bisa dilanjutkan saat konek ulang) ──
function saveLogoutRemainingMs(number) {
  number = String(number || '').replace(/[^0-9]/g, '')
  const data = loadJadibotRealtimeData()
  const meta = data.bots[number]
  if (!meta) return
  if (!data.logoutSaved) data.logoutSaved = {}
  const now = Date.now()
  if (meta.permanent === true) {
    data.logoutSaved[number] = { permanent: true, savedAt: now }
  } else {
    const remainingMs = Number(meta.expiresAt) - now
    if (remainingMs <= 0) return // sudah expired, tidak perlu disimpan
    data.logoutSaved[number] = { remainingMs, permanent: false, savedAt: now }
  }
  saveJadibotRealtimeData(data)
  console.log(`[JADIBOT] 💾 Sisa waktu +${number} tersimpan (${meta.permanent ? 'Permanent' : formatRemainingTime(Number(meta.expiresAt) - now)})`)
}

// ── Ambil data sisa waktu yang tersimpan dari logout sebelumnya ──
function getLogoutSavedMs(number) {
  number = String(number || '').replace(/[^0-9]/g, '')
  const data = loadJadibotRealtimeData()
  if (!data.logoutSaved) return null
  return data.logoutSaved[number] || null
}

// ── Hapus data sisa waktu setelah berhasil dipakai ──
function clearLogoutSavedMs(number) {
  number = String(number || '').replace(/[^0-9]/g, '')
  const data = loadJadibotRealtimeData()
  if (data.logoutSaved?.[number]) {
    delete data.logoutSaved[number]
    saveJadibotRealtimeData(data)
    console.log(`[JADIBOT] 🗑️ Data sisa waktu tersimpan +${number} dibersihkan (sudah dipakai)`)
  }
}

function isJadibotExpired(number) {
  const meta = getJadibotExpiry(number)
  // Tidak ada data expiry = sesi orphan (expired tapi folder belum terhapus)
  // Harus dianggap expired, bukan tidak expired — cegah auto-permanent
  if (!meta) return true
  if (meta.permanent === true) return false
  return Number(meta.expiresAt) <= Date.now()
}

// direct=true → pesan dikirim langsung ke nomor jadibot (v2 mode)
// direct=false → pesan dikirim ke GC/owner (v1 mode)
function msgJadibotExpired(number, direct = false) {
  const masked = maskNumber(number)
  const ver = loadConfig().botVersion || 'V27.1'
  const now = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })

  if (direct) {
    // ── Ke USER jadibot (personal, kasual) ──
    return (
      `╔══════════════════════╗\n` +
      `║  ❌  *JADIBOT BERAKHIR* ║\n` +
      `╚══════════════════════╝\n\n` +
      `📱 *Nomor kamu:* \`+${number}\`\n` +
      `🕐 *Waktu:* _${now} WIB_\n\n` +
      `🚨 *Masa aktif jadibot kamu telah berakhir!*\n` +
      `🗑️ ~Sesi otomatis dihapus dari server.~\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `❌ *Fitur yang Berhenti:*\n` +
      `${buildJadibotFeatureStatus(number).stoppedFeaturesText}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `> 💡 _Hubungi owner untuk mengaktifkan kembali:_\n` +
      `📞 ${getOwnerContact()}\n\n` +
      `> _Notif otomatis — Wily Bot ${ver}_ 🤖`
    )
  }

  // ── Ke GC/owner (monitoring, dengan command) ──
  return (
    `╔══════════════════════╗\n` +
    `║  ❌  *JADIBOT EXPIRED* ║\n` +
    `╚══════════════════════╝\n\n` +
    `📱 *Nomor  :* \`+${number}\`\n` +
    `🕐 *Waktu  :* _${now} WIB_\n\n` +
    `⏰ *Masa berlaku jadibot +${masked} telah habis.*\n` +
    `🗑️ ~Sesi dan data otomatis dihapus realtime.~\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `❌ *Fitur yang Berhenti:*\n` +
    `${buildJadibotFeatureStatus(number).stoppedFeaturesText}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 *Aktifkan Kembali:*\n` +
    `• \`.jadibot ${number} 1h\` — aktifkan 1 hari\n` +
    `• \`.jadibot ${number} p\` — aktifkan permanent\n\n` +
    `> _Notif otomatis — Wily Bot ${ver}_ 🤖`
  )
}

// ── Notif expired → ke OWNER DM (alert monitoring) ──────────────────────────
function msgOwnerExpired(number) {
  const cfg    = loadConfig()
  const ver    = cfg.botVersion || 'V27.1'
  const masked = maskNumber(number)
  // Filter out nomor yg baru expired — jadibotMap.delete() dipanggil setelah fungsi ini,
  // jadi tanpa filter, nomor yg expired masih muncul di list (bug realtime).
  const remainingList = [...jadibotMap.keys()].filter(n => n !== number)
  const _now = Date.now()

  const listPart = remainingList.length > 0
    ? `📊 *Jadibot Masih Aktif (${remainingList.length}):*\n` +
      remainingList.map((v, i) => {
        const _m = getJadibotExpiry(v)
        const _isPerm = _m?.permanent === true
        const _sisa = _isPerm
          ? '♾️ Permanent'
          : (_m?.expiresAt ? formatRemainingTime(Math.max(0, Number(_m.expiresAt) - _now)) : '?')
        const _exp = _isPerm ? '' : (_m?.expiresAt ? ` _(s/d ${formatJadibotExpiryTime(_m.expiresAt)})_` : '')
        return `${i + 1}. \`+${v}\` — *${_sisa}*${_exp}`
      }).join('\n') + `\n`
    : `> ❌ _Tidak ada jadibot lain yang aktif saat ini._\n`

  return (
    `╔══════════════════════╗\n` +
    `║  ❌  *JADIBOT EXPIRED!* ║\n` +
    `╚══════════════════════╝\n\n` +
    `📱 *Nomor :* \`+${number}\`\n` +
    `🕐 *Waktu :* _${_nowStr()}_\n\n` +
    `⏰ *Masa berlaku jadibot +${masked} telah habis secara otomatis.*\n` +
    `🗑️ ~Sesi dihapus dari server secara realtime.~\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `❌ *Fitur yang Berhenti di Nomor Ini:*\n` +
    `${buildJadibotFeatureStatus(number).stoppedFeaturesText}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `${listPart}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 *Aktifkan Kembali:*\n` +
    `• \`.jadibot ${number} 1h\` — aktifkan 1 hari\n` +
    `• \`.jadibot ${number} p\` — aktifkan permanent\n\n` +
    `> _Notif otomatis — Wily Bot ${ver}_ 🤖`
  )
}

async function expireJadibot(number, sendReply = null) {
  number = String(number || '').replace(/[^0-9]/g, '')

  // Guard: cegah double-expiry untuk nomor yang sama (race condition)
  if (expiringJadibot.has(number)) return
  expiringJadibot.add(number)
  stoppingJadibot.add(number)

  const sessionDir = path.join(process.cwd(), 'jadibot', number)
  const sock = jadibotMap.get(number)
  const expiredMsg = msgJadibotExpired(number)

  // Cek mode pairing untuk tentukan kemana notif expired dikirim
  const expiryCfg = loadConfig()
  const expiryMode = (expiryCfg.jadibotPairingMode || 'v2').toLowerCase()

  // Ambil main bot socket — dipakai untuk kirim notif ke nomor target
  // JANGAN pakai sock (jadibot) karena sock.sendMessage ke dirinya sendiri
  // masuk sebagai "note to self" di WA, tidak muncul sebagai chat biasa
  const _expireMainSock = getActiveMainSock()

  // Helper: resolve JID & kirim notif expired ke nomor user jadibot via main bot
  const _sendExpiredDirect = async () => {
    if (!_expireMainSock) {
      // Sock belum tersedia (bot offline/restart) — simpan ke pending queue,
      // akan dikirim otomatis saat bot konek kembali
      console.log(`[JADIBOT] ⚠️ Main sock tidak tersedia, notif expired +${number} → pending queue`)
      savePendingExpireNotif(number, expiryCfg.jadibotPairingMode || 'v2')
      return
    }
    try {
      // Resolve JID (support LID/linked device)
      let _expJid = `${number}@s.whatsapp.net`
      try {
        const [_waRes] = await _expireMainSock.onWhatsApp(`${number}@s.whatsapp.net`)
        if (_waRes?.exists && _waRes?.jid) _expJid = _waRes.jid
      } catch (_) {}
      await _expireMainSock.sendMessage(_expJid, { text: msgJadibotExpired(number, true) })
      console.log(`[JADIBOT] ✅ Notif expired terkirim ke +${number} (jid: ${_expJid})`)
    } catch (e) {
      console.log(`[JADIBOT] ⚠️ Gagal kirim notif expired ke +${number}: ${e?.message}`)
    }
  }

  if (expiryMode === 'v2') {
    // V2: kirim notif expired langsung ke nomor user jadibot via main bot
    await _sendExpiredDirect()
  } else {
    // V1: kirim notif expired ke GC/owner
    if (sendReply) {
      try {
        await sendReply(expiredMsg)
        console.log(`[JADIBOT][V1] ✅ Notif expired terkirim ke GC/owner`)
      } catch (e) {
        console.log(`[JADIBOT][V1] ⚠️ Gagal kirim notif expired ke GC/owner: ${e?.message}`)
      }
    }
    // V1: JUGA kirim langsung ke nomor user jadibot via main bot
    await _sendExpiredDirect()
  }

  // Notif ke semua owner via DM (selalu dikirim di semua mode)
  try {
    await sendOwnerNotif(null, msgOwnerExpired(number), [number])
    console.log(`[JADIBOT] ✅ Notif expired terkirim ke semua owner`)
  } catch (e) {
    console.log(`[JADIBOT] ⚠️ Gagal kirim notif expired ke owner: ${e?.message}`)
  }

  // Langkah 3: tutup socket
  try {
    if (sock) {
      sock.ev.removeAllListeners()
      if (sock.ws) sock.ws.close()
    }
  } catch {}

  // Langkah 4: bersihkan semua Map/Set
  jadibotMap.delete(number)
  stopJadibotAutoOnline(number)
  stopJadibotSwPrune(number)
  pairingRequested.delete(number)
  reconnectingJadibot.delete(number)
  activeOrStartingJadibot.delete(number)
  if (pairingTimeout.has(number)) {
    clearTimeout(pairingTimeout.get(number))
    pairingTimeout.delete(number)
  }
  if (typeof global.autoStartedJadibot !== 'undefined') {
    global.autoStartedJadibot.delete(number)
  }

  // Langkah 5: hapus folder sesi + file json DULU (sync, sebelum hapus data)
  // PENTING: urutan ini sengaja dibalik vs sebelumnya.
  // Dulu: hapus data realtime.json → setTimeout 500ms → hapus folder
  //   → kalau bot crash dalam 500ms: data hilang tapi folder masih ada → "orphan" di restart berikutnya
  // Sekarang: hapus folder DULU (sync) → LALU hapus data dari realtime.json
  //   → kalau crash di antara keduanya: folder sudah tiada, data masih ada → tidak orphan, tidak distart ulang karena folder tidak ada
  try {
    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true })
  } catch {}
  try {
    const _sf = sessionDir + '.json'
    if (fs.existsSync(_sf)) fs.unlinkSync(_sf)
  } catch {}

  // Langkah 6: hapus data expiry dari JSON (setelah folder sudah bersih)
  removeJadibotExpiry(number)

  // Langkah 7: lepas guard setelah selesai
  setTimeout(() => {
    stoppingJadibot.delete(number)
    expiringJadibot.delete(number)
  }, 2000)

  console.log(`[JADIBOT] ⏰ ${number} expired → notif terkirim → sesi dihapus realtime`)
}

async function cleanupExpiredJadibots(sendReply = null) {
  const expired = []
  const data = loadJadibotRealtimeData()
  const now = Date.now()
  const numbers = new Set([
    ...jadibotMap.keys(),
    ...Object.keys(data.bots || {})
  ])
  for (const number of numbers) {
    const meta = data.bots?.[number]
    if (meta && Number(meta.expiresAt) <= now) {
      expired.push(number)
      await expireJadibot(number, sendReply)
    }
  }
  return expired
}

function scheduleJadibotExpiry(number, sendReply = null) {
  number = String(number || '').replace(/[^0-9]/g, '')
  const meta = getJadibotExpiry(number)
  if (!meta) return
  if (meta.permanent === true) return
  if (expiryTimers.has(number)) {
    clearTimeout(expiryTimers.get(number))
    expiryTimers.delete(number)
  }
  clearJadibotExpiryWarningTimers(number)
  const remaining = Number(meta.expiresAt) - Date.now()
  if (remaining <= 0) {
    expireJadibot(number, sendReply)
    return
  }
  // Warning timer dihapus — notif cukup 1x saat benar-benar habis (via expireJadibot)
  const timer = setTimeout(() => {
    if (isJadibotExpired(number)) {
      expireJadibot(number, sendReply)
    } else {
      scheduleJadibotExpiry(number, sendReply)
    }
  }, Math.min(remaining, MAX_TIMER_MS))
  expiryTimers.set(number, timer)
}

function purgeExpiredJadibotSessions() {
  const data = loadJadibotRealtimeData()
  const now = Date.now()
  const expired = []
  for (const [number, meta] of Object.entries(data.bots)) {
    if (meta?.permanent === true) continue
    if (Number(meta?.expiresAt) <= now) expired.push(number)
  }
  for (const number of expired) {
    const sessionDir = path.join(process.cwd(), 'jadibot', number)
    try {
      if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true })
    } catch {}
    try {
      const _sf = sessionDir + '.json'
      if (fs.existsSync(_sf)) fs.unlinkSync(_sf)
    } catch {}
    delete data.bots[number]
    if (typeof global.autoStartedJadibot !== 'undefined') {
      global.autoStartedJadibot.delete(number)
    }
  }
  saveJadibotRealtimeData(data)
  return expired
}

function formatPairingCode(code) {
  // Format: XXXX-XXXX supaya lebih mudah dibaca
  const clean = String(code).replace(/[^A-Z0-9]/gi, '').toUpperCase()
  if (clean.length === 8) return clean.slice(0, 4) + '-' + clean.slice(4)
  return code
}

/* ================= SW HANDLER JADIBOT ================= */
function getJadibotSwSet(number) {
  if (!jadibotSwSets.has(number)) jadibotSwSets.set(number, new Set())
  return jadibotSwSets.get(number)
}

function getJadibotTracker(number) {
  if (!jadibotTrackers.has(number)) {
    const usersFile = path.join(process.cwd(), 'data_jadibot', number, 'swtrack', 'users.json')
    jadibotTrackers.set(number, createSwTracker(usersFile))
  }
  return jadibotTrackers.get(number)
}

const _JADIBOT_LOG_COLORS = [
  '\x1b[36m',                   // cyan
  '\x1b[35m',                   // magenta
  '\x1b[33m',                   // yellow
  '\x1b[32m',                   // green
  '\x1b[34m',                   // blue
  '\x1b[31m',                   // red
  '\x1b[38;2;255;165;0m',       // orange
  '\x1b[38;2;180;120;255m',     // purple
  '\x1b[38;2;0;200;200m',       // teal
  '\x1b[38;2;255;105;180m',     // pink
  '\x1b[38;2;100;200;100m',     // lime
  '\x1b[38;2;255;200;0m',       // gold
]

function getJadibotLogColor(number) {
  const digits = String(number).replace(/[^0-9]/g, '')
  const idx = digits ? (parseInt(digits.slice(-3), 10) % _JADIBOT_LOG_COLORS.length) : 0
  return _JADIBOT_LOG_COLORS[idx]
}

function getSwGreeting() {
  const h = parseInt(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour: 'numeric', hour12: false }))
  if (h >= 5 && h < 11) return 'Pagi 🌆'
  if (h >= 11 && h < 15) return 'Siang 🏙️'
  if (h >= 15 && h < 18) return 'Sore 🌇'
  return 'Malam 🌃'
}

async function handleJadibotSW(msg, sock, swSet, number) {
  try {
    if (!msg.message) return
    // fromMe=true diblokir untuk status@broadcast, tapi diizinkan untuk group status
    // agar jadibot bisa react ke story gc yang dipost oleh jadibot itu sendiri

    const remoteJid = msg.key?.remoteJid
    const isStatusBroadcast = remoteJid === 'status@broadcast'
    const _gsPayload = msg.message?.groupStatusMessageV2 || msg.message?.groupStatusMentionMessage || msg.message?.groupMentionedMessage
        || (msg.message && (() => { try { const vals = Object.values(msg.message); for (const v of vals) { if (v?.contextInfo?.isGroupStatus) return v; } } catch {} return null; })())
    const isGroupStatus = !isStatusBroadcast && isJidGroup(remoteJid) && !!_gsPayload

    // Blokir fromMe untuk status@broadcast saja, bukan group status
    if (msg.key?.fromMe && !isGroupStatus) return
    if (!isStatusBroadcast && !isGroupStatus) return

    // Skip reactionMessage & protocolMessage DULU — bukan story asli, hanya reaksi/sistem
    const msgType = getContentType(msg.message)
    if (!msgType || msgType === 'reactionMessage' || msgType === 'protocolMessage') return

    const storyConfig = getJadibotReadsw(number)
    if (storyConfig.enabled === false) return

    const msgId = msg.key?.id
    if (!msgId || swSet.has(msgId)) return
    swSet.add(msgId)

    // Tracker terisolasi per-jadibot → data/swtrack/jadibot/<number>/users/
    const tracker = getJadibotTracker(number)

    const _perUserEmojis = getJadibotEmojis(number)
    const reactStatus = _perUserEmojis || []
    let usedReaction = reactStatus.length ? (getJadibotRandomEmoji(number) || '❌') : '❌'

    const useRandomDelay = storyConfig.randomDelay !== false
    const delayMinMs = storyConfig.delayMinMs || 1000
    const delayMaxMs = storyConfig.delayMaxMs || 20000
    const fixedDelayMs = storyConfig.fixedDelayMs || 3000
    const delayMs = useRandomDelay
      ? Math.floor(Math.random() * (delayMaxMs - delayMinMs)) + delayMinMs
      : fixedDelayMs

    // ── Resolusi sender ──
    const rawParticipant = msg.key?.participant || msg.participant || msg.sender
    const senderPn = rawParticipant && !String(rawParticipant).endsWith('@lid') ? rawParticipant : null
    let senderLid = rawParticipant && String(rawParticipant).endsWith('@lid') ? rawParticipant : null
    if (!senderLid && msg.key?.participantAlt && String(msg.key.participantAlt).endsWith('@lid')) {
      senderLid = msg.key.participantAlt
    }

    let resolveMethod = null
    let resolvedPn = senderPn
    if (resolvedPn) resolveMethod = 'PN langsung ✓'

    // Coba resolve LID via Signal Lib
    if (!resolvedPn && senderLid && sock?.signalRepository?.lidMapping?.getPNForLID) {
      try {
        const r = await sock.signalRepository.lidMapping.getPNForLID(senderLid)
        if (r && !String(r).endsWith('@lid')) {
          resolvedPn = jidNormalizedUser(r)
          resolveMethod = 'Signal Lib ✓'
        }
      } catch (_) {}
    }

    // Fallback: cache LID->PN dari group metadata (shared dengan bot utama)
    if (!resolvedPn && senderLid && typeof global.__lookupLidPn === 'function') {
      try {
        const r = global.__lookupLidPn(senderLid)
        if (r && !String(r).endsWith('@lid')) {
          resolvedPn = jidNormalizedUser(r)
          resolveMethod = 'Cache Grup ✓'
        }
      } catch (_) {}
    }

    if (!resolvedPn && senderLid) resolveMethod = 'LID belum ke-resolve ❌'
    if (!resolvedPn && !senderLid && rawParticipant) resolveMethod = 'Tanpa LID ⚠️'

    // Fallback: kalau fromMe=true (jadibot sendiri yang post story gc), gunakan ID jadibot sebagai sender
    if (!resolvedPn && !senderLid && !rawParticipant && msg.key?.fromMe && isGroupStatus) {
      resolvedPn = jidNormalizedUser(sock.user?.id || `${number}@s.whatsapp.net`)
      resolveMethod = 'Self Story ✓'
    }

    const senderJid = resolvedPn || senderLid || rawParticipant
    const hasSender = !!senderJid
    const senderJidNorm = resolvedPn || (senderPn ? jidNormalizedUser(senderPn) : null)

    // Skip story milik jadibot sendiri di status@broadcast — group status boleh dilanjut
    const botNum = String(number).replace(/[^0-9]/g, '')
    const senderNum = (resolvedPn || senderPn || '')
      .split('@')[0].split(':')[0].replace(/[^0-9]/g, '')
    if (!isGroupStatus && botNum && senderNum && botNum === senderNum) {
      swSet.delete(msgId)
      return
    }

    let shouldReact = storyConfig.autoReaction !== false && reactStatus.length && hasSender

    // ── SwTrack: tulis entry awal ke folder jadibot ──
    const trackNumber = resolvedPn
      ? extractSwNumber(resolvedPn)
      : (senderPn ? extractSwNumber(senderPn) : null)

    if (trackNumber) {
      if (tracker.isSwUserTracked(trackNumber, msgId)) {
        swSet.delete(msgId)
        return
      }
      tracker.markSwUserEntry(trackNumber, msgId, {
        id: msgId,
        sender: resolvedPn || senderPn || rawParticipant || '',
        name: msg.pushName || '',
        type: getContentType(msg.message) || 'unknown',
        arrivedAt: new Date().toISOString(),
        read: false,
        reacted: false,
        reactionExpected: !!(shouldReact && (isGroupStatus ? (msg.key?.fromMe || senderJidNorm) : resolvedPn)),
        emoji: null,
        resolve: resolveMethod,
        source: isGroupStatus ? 'group' : 'status',
        number: trackNumber,
        resolvedPn: resolvedPn || null,
        messageKey: msg.key || null,
      })
    }

    await new Promise(r => setTimeout(r, delayMs))

    // Cek apakah story dihapus pengirim selama delay berlangsung
    if (trackNumber && tracker.isSwUserDeleted(trackNumber, msgId)) {
      swSet.delete(msgId)
      return
    }

    const activeStoryConfig = getJadibotReadsw(number)
    if (activeStoryConfig.enabled === false) {
      swSet.delete(msgId)
      return
    }
    shouldReact = activeStoryConfig.enabled !== false
      && activeStoryConfig.autoReaction !== false
      && reactStatus.length > 0
      && hasSender
      && (isGroupStatus ? (msg.key?.fromMe || !!senderJidNorm) : !!resolvedPn)
    if (trackNumber) {
      tracker.updateSwUserEntry(trackNumber, msgId, {
        reactionExpected: !!(shouldReact && (isGroupStatus ? (msg.key?.fromMe || senderJidNorm) : resolvedPn)),
      })
    }

    const isConnClosed = (err) => {
      const s = err?.message || String(err)
      return s.includes('Connection Closed') || s.includes('Connection closed') || s.includes('EPIPE') || s.includes('Socket closed')
    }

    // ── Read receipt ──
    let readOk = false
    if (isStatusBroadcast) {
      const buildKey = (participant) => ({
        ...msg.key,
        remoteJid: 'status@broadcast',
        ...(participant && { participant }),
        fromMe: false,
      })
      const receiptKeys = []
      const seenParts = new Set()
      const pushKey = (p) => {
        if (!p) return
        const norm = jidNormalizedUser(p)
        if (seenParts.has(norm)) return
        seenParts.add(norm)
        receiptKeys.push(buildKey(norm))
      }
      pushKey(rawParticipant)
      pushKey(senderLid)
      pushKey(resolvedPn)

      if (trackNumber) {
        tracker.updateSwUserEntry(trackNumber, msgId, { receiptKeys, resolvedPn: resolvedPn || null, messageKey: msg.key })

        // ── Auto-retry SW sebelumnya yang terlewat (belum dibaca/direact) ──
        const missed = tracker.getMissedSwEntries(
          trackNumber,
          msgId,
          activeStoryConfig.enabled !== false && activeStoryConfig.autoReaction !== false
        )
          .filter(e => !swSet.has(e.id)) // skip yang masih on-progress
        if (missed.length > 0) {
          let retriedCount = 0
          let lastResolve = null
          for (const miss of missed) {
            try {
              const mk = miss.receiptKeys || []
              if (mk.length > 0 && !miss.read) {
                await Promise.all(mk.map(k => sock.sendReceipts([k], 'read').catch(() => {})))
              }
              const mp = miss.resolvedPn
              // Cek ulang setting mode SAAT INI — kalau di antara story masuk dan
              // retry-nya jalan, jadibot sudah dipindah ke Read Only, jangan
              // tetap kirim reaksi (data harus ikut kondisi realtime, bukan
              // kondisi lama waktu story itu pertama masuk).
              const retryStoryConfig = getJadibotReadsw(number)
              const retryShouldReact = retryStoryConfig.enabled !== false && retryStoryConfig.autoReaction !== false
              let retryEmoji = null
              if (retryShouldReact && miss.reactionExpected === true && !miss.reacted && mp && miss.messageKey) {
                retryEmoji = getJadibotRandomEmoji(number) || '❤️'
                await sock.sendMessage(
                  'status@broadcast',
                  { react: { key: miss.messageKey, text: retryEmoji } },
                  { statusJidList: [jidNormalizedUser(sock.user.id), jidNormalizedUser(mp)] }
                ).catch(() => { retryEmoji = null })
                tracker.updateSwUserEntry(trackNumber, miss.id, { read: true, reacted: !!retryEmoji, emoji: retryEmoji, retriedAt: new Date().toISOString() })
              } else if (mk.length > 0) {
                tracker.updateSwUserEntry(trackNumber, miss.id, { read: true, retriedAt: new Date().toISOString() })
              }
              retriedCount++
              lastResolve = miss.resolve || lastResolve
            } catch {}
          }
          // ── 1 kotak ringkasan per nomor — bukan 1 kotak per story tertunda ──
          if (retriedCount > 0) {
            const lastMiss = missed[missed.length - 1]
            logStoryRetrySummary({
              botId: sock.user?.name || maskNumber(number),
              name: lastMiss.name || trackNumber,
              number: maskNumber(lastMiss.number || trackNumber),
              count: retriedCount,
              storyCount: getStoryCountToday(lastMiss.number || trackNumber, path.join(process.cwd(), 'data_jadibot', number, 'swtrack')),
              resolve: lastResolve,
              emojiMode: getJadibotEmojiMode(number),
            })
          }
        }
      }

      await Promise.all(
        receiptKeys.map(k =>
          sock.sendReceipts([k], 'read').catch(err => {
            if (!isConnClosed(err)) console.error('\x1b[31m[Jadibot AutoRead] read failed:\x1b[39m', err?.message || String(err))
          })
        )
      )
      readOk = true
    } else {
      // Group status — read + view receipt agar counter "dilihat" naik
      await Promise.all([
        sock.readMessages([msg.key]).catch(err => {
          if (!isConnClosed(err)) console.error('\x1b[31m[Jadibot GS Read]\x1b[39m', err?.message || String(err))
        }),
        sock.sendReceipts([msg.key], 'read').catch(() => {}),
      ])
      readOk = true
    }

    // ── Reaction ──
    const latestReactionConfig = getJadibotReadsw(number)
    shouldReact = latestReactionConfig.enabled !== false
      && latestReactionConfig.autoReaction !== false
      && reactStatus.length > 0
      && hasSender
      && (isGroupStatus ? (msg.key?.fromMe || !!senderJidNorm) : !!resolvedPn)
    if (trackNumber) {
      tracker.updateSwUserEntry(trackNumber, msgId, {
        reactionExpected: !!(shouldReact && (isGroupStatus ? (msg.key?.fromMe || senderJidNorm) : resolvedPn)),
      })
    }

    if (isStatusBroadcast && shouldReact && resolvedPn) {
      await sock.sendMessage(
        'status@broadcast',
        { react: { key: msg.key, text: usedReaction } },
        { statusJidList: [jidNormalizedUser(sock.user.id), jidNormalizedUser(resolvedPn)] }
      ).catch(err => {
        if (!isConnClosed(err)) console.error('\x1b[31m[Jadibot Reaction]\x1b[39m', err?.message || String(err))
        usedReaction = '❌ Gagal'
      })
    } else if (isGroupStatus && shouldReact) {
      // Dua jalur reaksi:
      // fromMe=true  → react ke group JID (story sendiri = group message, WA izinkan react ke pesan sendiri)
      // fromMe=false → react ke status@broadcast + statusJidList (linked status dari orang lain)
      if (msg.key?.fromMe) {
        // Story gc milik jadibot sendiri — react ke group JID
        const gsSelfKey = { ...msg.key }
        await sock.sendMessage(
          remoteJid,
          { react: { key: gsSelfKey, text: usedReaction } }
        ).catch(err => {
          if (!isConnClosed(err)) console.error('\x1b[31m[Jadibot GS Self-Reaction]\x1b[39m', err?.message || String(err))
          usedReaction = '❌ Gagal'
        })
      } else {
        // Story gc orang lain — react via status@broadcast + statusJidList
        const gsStatusKey = {
          remoteJid: 'status@broadcast',
          fromMe: false,
          id: msg.key?.id,
          participant: senderJidNorm || undefined,
        }
        const gsStatusJidList = [jidNormalizedUser(sock.user.id), ...(senderJidNorm ? [senderJidNorm] : [])]
        await sock.sendMessage(
          'status@broadcast',
          { react: { key: gsStatusKey, text: usedReaction } },
          { statusJidList: gsStatusJidList }
        ).catch(err => {
          if (!isConnClosed(err)) console.error('\x1b[31m[Jadibot GS Reaction]\x1b[39m', err?.message || String(err))
          usedReaction = '❌ Gagal'
        })
      }
    } else if (shouldReact && !resolvedPn && isStatusBroadcast) {
      usedReaction = '⏭️ Skip (LID belum resolve)'
    }

    const reactionSuccess = shouldReact && usedReaction !== '❌ Gagal' && usedReaction !== '⏭️ Skip (LID belum resolve)'

    // ── SwStats + SwTrack update ──
    const from = jidNormalizedUser(senderJid || remoteJid)
    const storyNumber = jidDecode(from)?.user || ''
    // Untuk fromMe=true (story jadibot sendiri di GC), pakai nama jadibot dari sock.user.name
    const storyName = msg.pushName || (msg.key?.fromMe ? (sock.user?.name || '') : '') || storyNumber

    // Tulis ke path jadibot sendiri: data_jadibot/<number>/ceksw/swstats.json
    const jadibotStatsPath = path.join(process.cwd(), 'data_jadibot', number, 'ceksw', 'swstats.json')
    updateSwStatsAt(jadibotStatsPath, storyNumber, storyName, reactionSuccess, reactionSuccess ? usedReaction : null, msgId)

    if (trackNumber) {
      tracker.updateSwUserEntry(trackNumber, msgId, {
        name: storyName,
        number: storyNumber,
        resolve: resolveMethod,
        read: readOk,
        reacted: reactionSuccess,
        emoji: reactionSuccess ? usedReaction : null,
        processedAt: new Date().toISOString(),
      })
    }

    // msgId TIDAK dihapus dari swSet — cegah spam kalau WA re-deliver story yang sama

    // ── Console log ──
    const botId = sock.user?.id?.split(':')[0] || ''
    const debounceKey = `jb:${botId}:${from}`
    if (!storyDebounce.has(debounceKey)) {
      storyDebounce.set(debounceKey, { time: Date.now(), count: 1 })

      const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
      const jakartaDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))

      const innerType = isGroupStatus
        ? (() => { const inner = _gsPayload?.message; return inner ? Object.keys(inner).find(k => k !== 'messageContextInfo') : null })()
        : getContentType(msg.message)

      const _jbBaseType = getMediaTypeEmoji(innerType);
      const _jbMediaType = isGroupStatus ? [_jbBaseType[0] + ' GC', _jbBaseType[1]] : _jbBaseType;
      logStoryView({
        botId: sock.user?.name || maskNumber(botId),
        mediaType: _jbMediaType,
        idStory: msg.key?.id || null,
        greeting: getSwGreeting(),
        dayName: dayNames[jakartaDate.getDay()],
        date: `${jakartaDate.getDate()} ${monthNames[jakartaDate.getMonth()]} ${jakartaDate.getFullYear()}`,
        time: jakartaDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '.'),
        name: storyName,
        number: maskNumber(storyNumber),
        storyCount: getStoryCountToday(storyNumber, path.join(process.cwd(), 'data_jadibot', number, 'swtrack')),
        success: reactionSuccess ? 'Iya ✓' : (readOk ? 'Baca ✓' : 'Gagal ❌'),
        reaction: shouldReact ? usedReaction : 'Off ❌',
        resolve: resolveMethod,
        delaySeconds: (delayMs / 1000).toFixed(1),
        mode: shouldReact ? `Read+Reaction ✓${isGroupStatus ? ' [Grup]' : ''}` : 'Read Only 👁️',
        emojiMode: getJadibotEmojiMode(number),
      })

      setTimeout(() => {
        const d = storyDebounce.get(debounceKey)
        if (d && d.count > 1) console.log(`\x1b[33m   └─ +${d.count - 1} story lainnya dari ${storyName}\x1b[39m`)
        storyDebounce.delete(debounceKey)
      }, 3000)
    } else {
      const d = storyDebounce.get(debounceKey)
      if (d) { d.count++; storyDebounce.set(debounceKey, d) }
    }

  } catch (err) {
    console.error('\x1b[31m[Jadibot SW Error]\x1b[39m', err?.message || String(err))
  }
}

/* ================= PESAN RAPIH ================= */
// direct=true → dikirim ke nomor tujuan (user jadibot) — footer sopan, tanpa command owner
// direct=false → dikirim ke GC/owner — footer dengan command .jadibot
function msgPairingCode(code, number, direct = false) {
  const formatted = formatPairingCode(code)
  const masked = maskNumber(number)
  const ver = loadConfig().botVersion || 'V27.1'

  const footer = direct
    ? (
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⏳ *Segera masukkan kode sebelum kedaluwarsa!*\n` +
        `> _Kode hanya berlaku ±3 menit — jangan ditunda._\n\n` +
        `📌 *Catatan penting:*\n` +
        `• Pastikan kamu membuka WhatsApp yang sesuai nomor di atas\n` +
        `• Jangan bagikan kode ini ke siapapun\n` +
        `• ~Kode tidak bisa dipakai ulang~ setelah digunakan atau expired\n\n` +
        `💡 *Kode sudah habis atau ada kendala?*\n` +
        `📞 Hubungi owner: ${getOwnerContact()}\n\n` +
        `> _Powered by Wily Bot ${ver}_ 🤖`
      )
    : (
        `⏳ *Batas waktu: 3 menit*\n` +
        `⚠️ Jika gagal, ketik *.jadibot* ulang`
      )

  return direct
    ? (
      // ── Pesan langsung ke USER JADIBOT ──────────────────────────────────────
      `🤖 *J A D I B O T*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📱 *Nomor kamu:* \`+${number}\`\n\n` +
      `🔑 *Kode Pairing:*\n` +
      `> ✨ *${formatted}* ✨\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 *Cara memasukkan kode:*\n` +
      `1️⃣ Buka *WhatsApp* di HP kamu\n` +
      `2️⃣ Ketuk ⋮ → *Perangkat Tertaut*\n` +
      `3️⃣ Ketuk *Tautkan Perangkat*\n` +
      `4️⃣ Pilih *Tautkan dengan nomor telepon*\n` +
      `5️⃣ Masukkan kode di atas\n\n` +
      `> ⚠️ _Berlaku *±3 menit* — ~jangan ditunda!~_\n` +
      `> 🔒 _Jangan bagikan kode ini ke siapapun_\n\n` +
      `💬 *Ada kendala?* Hubungi: ${getOwnerContact()}\n\n` +
      `> _Powered by Wily Bot ${ver}_ 🤖`
    )
    : (
      // ── Pesan ke GC/owner (fallback v1) ─────────────────────────────────────
      `🤖 *J A D I B O T*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📱 *Nomor:* \`+${number}\`\n\n` +
      `🔑 *Kode Pairing:*\n` +
      `> ✨ *${formatted}* ✨\n\n` +
      `> ⚠️ _Berlaku *3 menit* — ~jangan ditunda!~_\n` +
      `> _Ketik .jadibot ulang jika gagal_`
    )
}


// ── Notif pairing expired → ke OWNER DM (monitoring, beda dari versi user/GC) ─
function msgOwnerPairingExpired(number) {
  const cfg    = loadConfig()
  const ver    = cfg.botVersion || 'V27.1'
  const masked = maskNumber(number)
  return (
    `╔══════════════════════╗\n` +
    `║   ⏰  *PAIRING TIMEOUT*  ║\n` +
    `╚══════════════════════╝\n\n` +
    `📱 *Nomor  :* \`+${number}\`\n` +
    `🕐 *Waktu  :* _${_nowStr()}_\n\n` +
    `⚠️ *Kode pairing +${masked} tidak dimasukkan dalam 3 menit.*\n` +
    `> _Sesi otomatis dihapus dari server — tidak ada data yang tersisa._\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 *Kemungkinan penyebab:*\n` +
    `• Pengguna tidak sempat membuka pesan kode\n` +
    `• Kode terlambat dimasukkan ke WhatsApp\n` +
    `• Pengguna salah langkah saat scan/input kode\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔄 *Aktifkan ulang jika diperlukan:*\n` +
    `• \`.jadibot ${number} <durasi>\` — coba pairing lagi\n\n` +
    `> _Notif otomatis — Wily Bot ${ver}_ 🤖`
  )
}

// direct=true → dikirim ke nomor target (v2): tampilkan link owner, bukan command bot
// direct=false → dikirim ke GC/owner (v1): tampilkan command bot
function msgPairingExpired(number, direct = false) {
  const masked  = maskNumber(number)
  const ver     = loadConfig().botVersion || 'V27.1'

  if (direct) {
    // Versi lengkap → dikirim ke nomor tujuan (user jadibot)
    return (
      `⏰ *Waktu Habis — Pairing Gagal*\n\n` +
      `📱 *Nomor kamu:* \`+${number}\`\n` +
      `🕐 _${_nowStr()}_\n\n` +
      `❌ ~Kode pairing sudah kedaluwarsa!~\n` +
      `> _Kode tidak dimasukkan dalam *3 menit* — sesi otomatis dibatalkan._\n\n` +
      `🗑️ *Yang terjadi:*\n` +
      `- ~Kode tidak lagi berlaku~\n` +
      `- ~Sesi dihapus otomatis dari server~\n` +
      `- ~Jadibot belum aktif di nomormu~\n\n` +
      `📋 *Kemungkinan penyebab:*\n` +
      `1. Terlambat membuka pesan kode\n` +
      `2. Salah langkah saat input di WhatsApp\n` +
      `3. Koneksi internet terganggu saat proses\n\n` +
      `💡 *Ingin coba lagi?*\n` +
      `📞 _Hubungi owner untuk kode baru:_\n` +
      `${getOwnerContact()}\n\n` +
      `> _Notif otomatis — Wily Bot ${ver}_ 🤖`
    )
  }

  // Versi singkat → dikirim ke GC/owner chat
  return (
    `⏰ *Waktu Habis — Pairing Gagal*\n\n` +
    `📱 *Nomor:* \`${masked}\`\n` +
    `🕐 _${_nowStr()}_\n\n` +
    `❌ ~Kode pairing kedaluwarsa~ — tidak dimasukkan dalam *3 menit.*\n` +
    `🗑️ ~Sesi otomatis dihapus dari server.~\n\n` +
    `💡 *Aktifkan ulang:*\n` +
    `- Ketik \`.jadibot ${number} <durasi>\`\n\n` +
    `> _Notif otomatis — Wily Bot ${ver}_ 🤖`
  )
}

function msgConnected(number) {
  const masked = maskNumber(number)
  const now = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })

  const config = loadConfig()
  const ver = config.botVersion || 'V27.1'
  const { activeFeaturesText } = buildJadibotFeatureStatus(number)
  const expiry = getJadibotExpiry(number)
  let expiryLine = ''
  if (expiry?.permanent === true) {
    expiryLine = `♾️ *Masa Berlaku:* Permanent\n`
  } else if (expiry?.expiresAt) {
    const rem = Number(expiry.expiresAt) - Date.now()
    if (rem > 0) expiryLine = `⏳ *Masa Berlaku:* ${formatRemainingTime(rem)}\n`
  }

  return (
    `╔══════════════════════╗\n` +
    `║  ✅  *JADIBOT AKTIF*  ║\n` +
    `╚══════════════════════╝\n\n` +
    `📱 *Nomor  :* \`+${number}\`\n` +
    `🕐 *Waktu  :* _${now} WIB_\n` +
    (expiryLine ? expiryLine : '') +
    `\n` +
    `🎉 *Jadibot +${masked} berhasil terhubung dan siap digunakan!*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🤖 *Fitur Otomatis yang Aktif:*\n` +
    `${activeFeaturesText}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🛠️ *Kontrol Jadibot:*\n` +
    `• \`.menu\` — Lihat semua fitur\n` +
    `• \`.readsw\` — Kelola ReadSW / ReactionSW\n` +
    `• \`.listbot\` — Daftar jadibot aktif\n` +
    `• \`.stopbot ${number}\` — Matikan jadibot\n\n` +
    `> _Notif otomatis — Wily Bot ${ver}_ 🤖`
  )
}

function msgDirectWelcome(number) {
  const now = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
  const ver = loadConfig().botVersion || 'V27.1'
  const { activeFeaturesText } = buildJadibotFeatureStatus(number)
  const expiry = getJadibotExpiry(number)
  let expiryLine = ''
  if (expiry?.permanent === true) {
    expiryLine = `♾️ *Masa Aktif:* Permanent\n`
  } else if (expiry?.expiresAt) {
    const remaining = Number(expiry.expiresAt) - Date.now()
    if (remaining > 0) {
      expiryLine = `⏳ *Masa Aktif:* ${formatRemainingTime(remaining)}\n`
    }
  }
  return (
    `╔══════════════════════╗\n` +
    `║  🤖  *J A D I B O T*  ║\n` +
    `╚══════════════════════╝\n\n` +
    `👋 *Halo! Nomormu kini aktif sebagai Jadibot!*\n\n` +
    `📱 *Nomor  :* \`+${number}\`\n` +
    `🕐 *Aktif  :* _${now} WIB_\n` +
    (expiryLine ? expiryLine : '') +
    `\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `✨ *Fitur yang Berjalan Otomatis di Nomormu:*\n` +
    `${activeFeaturesText}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 *Command (kirim ke bot utama):*\n` +
    `• \`.ping\` — Cek bot aktif\n` +
    `• \`.menu\` — Daftar semua fitur\n` +
    `• \`.readsw\` — Kelola ReadSW / ReactionSW\n` +
    `• \`.antidel\` — Kelola Anti-Delete\n` +
    `• \`.sticker\` — Buat stiker\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `> ⚠️ _Jangan hapus bot ini dari *Perangkat Tertaut* WhatsApp-mu, agar jadibot tetap aktif!_\n\n` +
    `💡 *Perlu bantuan? Hubungi owner:*\n` +
    `📞 ${getOwnerContact()}\n\n` +
    `> _Powered by Wily Bot ${ver}_ 🤖`
  )
}

function msgLoggedOut(number, remainingList, savedLabel = '') {
  const masked = maskNumber(number)
  const now = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
  const ver = loadConfig().botVersion || 'V27.1'

  const listPart = remainingList.length === 0
    ? `> ❌ _Tidak ada jadibot lain yang aktif saat ini._`
    : `📊 *Jadibot Masih Aktif (${remainingList.length}):*\n` +
      remainingList.map((v, i) => `${i + 1}. \`+${v}\``).join('\n')

  return (
    `╔══════════════════════╗\n` +
    `║  ⚠️  *JADIBOT LOGOUT*  ║\n` +
    `╚══════════════════════╝\n\n` +
    `📱 *Nomor  :* \`+${number}\`\n` +
    `🕐 *Waktu  :* _${now} WIB_\n\n` +
    `🚨 *Jadibot +${masked} telah logout dari WhatsApp!*\n` +
    `_Perangkat Tertaut dihapus atau sesi berakhir._\n\n` +
    `🗑️ ~Sesi otomatis dihapus dari server.~\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `❌ *Fitur yang Berhenti:*\n` +
    `${buildJadibotFeatureStatus(number).stoppedFeaturesText}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${listPart}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    (savedLabel
      ? `💾 *Sisa waktu +${masked} tersimpan:* _${savedLabel}_\n` +
        `🔄 Konek ulang → waktu otomatis dilanjutkan!\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n`
      : '') +
    `💡 *Aktifkan Kembali:*\n` +
    `• Ketik \`.jadibot ${number}\` di chat bot ini\n\n` +
    `> _Notif otomatis — Wily Bot ${ver}_ 🤖`
  )
}

function msgLoggedOutDirect(number, savedLabel = '') {
  const now = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
  const ver = loadConfig().botVersion || 'V27.1'
  return (
    `╔══════════════════════╗\n` +
    `║  ⚠️  *JADIBOT LOGOUT*  ║\n` +
    `╚══════════════════════╝\n\n` +
    `📱 *Nomor kamu:* \`+${number}\`\n` +
    `🕐 *Waktu logout:* _${now} WIB_\n\n` +
    `🚨 *Sesi jadibot kamu telah berakhir!*\n\n` +
    `_Kemungkinan penyebab:_\n` +
    `• Kamu menghapus bot dari *Perangkat Tertaut*\n` +
    `• WhatsApp melakukan logout otomatis\n` +
    `• Sesi kadaluarsa atau tergantikan perangkat lain\n\n` +
    `🗑️ ~Sesi otomatis dihapus dari server.~\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `❌ *Fitur yang Berhenti:*\n` +
    `${buildJadibotFeatureStatus(number).stoppedFeaturesText}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    (savedLabel
      ? `💾 *Sisa waktu tersimpan:* _${savedLabel}_\n` +
        `🔄 Konek ulang → waktu otomatis dilanjutkan!\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n`
      : '') +
    `> 💡 _Hubungi owner untuk mengaktifkan kembali:_\n` +
    `📞 ${getOwnerContact()}\n\n` +
    `> _Notif otomatis — Wily Bot ${ver}_ 🤖`
  )
}

// ── Kirim notif ke semua owner di config.owners[] via main bot ──────────────
// excludeNumbers: nomor yang skip (misal nomor jadibot itu sendiri)
async function sendOwnerNotif(mainBotSock, text, excludeNumbers = []) {
  const sock = getActiveMainSock(mainBotSock)
  if (!sock) return
  const cfg = loadConfig()
  const owners = (cfg.owners || []).map(n => String(n).replace(/[^0-9]/g, '')).filter(Boolean)
  for (const ownerNum of owners) {
    if (excludeNumbers.includes(ownerNum)) continue
    try {
      await sock.sendMessage(`${ownerNum}@s.whatsapp.net`, { text })
      console.log(`[JADIBOT][OWNER-NOTIF] ✅ Notif terkirim ke owner +${ownerNum}`)
    } catch (e) {
      console.log(`[JADIBOT][OWNER-NOTIF] ⚠️ Gagal kirim ke +${ownerNum}: ${e?.message}`)
    }
  }
}

// ── Kirim interactive quick reply button ke satu JID tertentu ───────────────
// Dipakai untuk notif di GC/chat owner dengan tombol "Lanjutkan" → auto kirim command.
async function sendInteractiveButton(sock, jid, text, buttonCommand, quotedMsg = null) {
  if (!sock || !jid) return
  const ctxInfo = (quotedMsg?.key?.id && quotedMsg?.message)
    ? { stanzaId: quotedMsg.key.id, participant: quotedMsg.key.participant || quotedMsg.key.remoteJid, quotedMessage: quotedMsg.message }
    : {}
  try {
    const msg = generateWAMessageFromContent(jid, {
      interactiveMessage: {
        body:   { text },
        footer: { text: '' },
        header: { title: '', subtitle: '', hasMediaAttachment: false },
        contextInfo: ctxInfo,
        nativeFlowMessage: {
          messageParamsJson: JSON.stringify({}),
          buttons: [{
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
              display_text: '🔄 Jadibot Lagi',
              id: buttonCommand
            })
          }]
        }
      }
    }, {})
    await sock.relayMessage(msg.key.remoteJid, msg.message, {
      messageId: msg.key.id,
      additionalNodes: [{
        tag: 'biz',
        attrs: {},
        content: [{
          tag: 'interactive',
          attrs: { type: 'native_flow', v: '1' },
          content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
        }]
      }]
    })
  } catch (e) {
    // Fallback: plain text jika button gagal
    try { await sock.sendMessage(jid, { text }) } catch {}
  }
}

// ── Kirim notif ke owner dengan Quick Reply button "Lanjutkan" ──────────────
// Button otomatis kirim command tertentu (misal .jadibot <nomor>) saat ditekan.
async function sendOwnerNotifWithButton(mainBotSock, text, buttonCommand, excludeNumbers = []) {
  const sock = getActiveMainSock(mainBotSock)
  if (!sock) return
  const cfg = loadConfig()
  const owners = (cfg.owners || []).map(n => String(n).replace(/[^0-9]/g, '')).filter(Boolean)
  for (const ownerNum of owners) {
    if (excludeNumbers.includes(ownerNum)) continue
    const jid = `${ownerNum}@s.whatsapp.net`
    try {
      // Coba kirim dengan interactive button (quick reply)
      const msg = generateWAMessageFromContent(jid, {
        interactiveMessage: {
          body:   { text },
          footer: { text: '' },
          header: { title: '', subtitle: '', hasMediaAttachment: false },
          contextInfo: {},
          nativeFlowMessage: {
            messageParamsJson: JSON.stringify({}),
            buttons: [{
              name: 'quick_reply',
              buttonParamsJson: JSON.stringify({
                display_text: '🔄 Jadibot Lagi',
                id: buttonCommand
              })
            }]
          }
        }
      }, {})
      await sock.relayMessage(msg.key.remoteJid, msg.message, {
        messageId: msg.key.id,
        additionalNodes: [{
          tag: 'biz',
          attrs: {},
          content: [{
            tag: 'interactive',
            attrs: { type: 'native_flow', v: '1' },
            content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
          }]
        }]
      })
      console.log(`[JADIBOT][OWNER-NOTIF] ✅ Notif+button terkirim ke owner +${ownerNum}`)
    } catch (e) {
      // Fallback: kirim plain text jika button gagal
      console.log(`[JADIBOT][OWNER-NOTIF] ⚠️ Button gagal, fallback plain text ke +${ownerNum}: ${e?.message}`)
      try {
        await sock.sendMessage(jid, { text })
      } catch {}
    }
  }
}

function _nowStr() {
  const d = new Date()
  const hari  = d.toLocaleDateString('id-ID', { weekday: 'short', timeZone: 'Asia/Jakarta' })
  const tgl   = d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Jakarta' })
  const waktu = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' }).replace(/\./g, ':')
  return `${hari}, ${tgl} | ${waktu} WIB`
}

// ── Notif terhubung → ke OWNER (managerial/monitoring) ───────────────────────
function msgOwnerConnected(number, isReconnect = false) {
  const cfg    = loadConfig()
  const ver    = cfg.botVersion || 'V27.1'
  const masked = maskNumber(number)
  const meta   = getJadibotExpiry(number)
  const isPerm = meta?.permanent === true
  const sisa   = !meta ? '_Tidak ada data_'
    : isPerm ? '*Permanent* ♾️'
    : `*${formatRemainingTime(Math.max(0, Number(meta.expiresAt) - Date.now()))}*`
  const { activeFeaturesText } = buildJadibotFeatureStatus(number)

  if (isReconnect) {
    return (
      `╔══════════════════════╗\n` +
      `║  🔄  *JADIBOT ONLINE*  ║\n` +
      `╚══════════════════════╝\n\n` +
      `📱 *Nomor  :* \`+${number}\`\n` +
      `🕐 *Waktu  :* _${_nowStr()}_\n` +
      `⏳ *Sisa   :* ${sisa}\n\n` +
      `🔄 *Jadibot +${masked} reconnect dan kembali online secara otomatis.*\n` +
      `> _Tidak perlu tindakan — semua fitur lanjut berjalan normal._\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `✨ *Fitur yang Lanjut Berjalan:*\n` +
      `${activeFeaturesText}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🛠️ *Kontrol Cepat (Owner):*\n` +
      `• \`.listbot\` — Cek semua jadibot aktif\n` +
      `• \`.stopbot ${number}\` — Hentikan jika diperlukan\n` +
      `• \`.upbot ${number} <durasi>\` — Perpanjang masa aktif\n\n` +
      `> _Notif otomatis — Wily Bot ${ver}_ 🤖`
    )
  }

  return (
    `╔══════════════════════╗\n` +
    `║  ✅  *JADIBOT AKTIF*   ║\n` +
    `╚══════════════════════╝\n\n` +
    `📱 *Nomor  :* \`+${number}\`\n` +
    `🕐 *Waktu  :* _${_nowStr()}_\n` +
    `⏳ *Durasi :* ${sisa}\n\n` +
    `🎉 *Jadibot +${masked} berhasil terhubung dan siap beroperasi!*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🤖 *Fitur Otomatis yang Berjalan:*\n` +
    `${activeFeaturesText}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🛠️ *Kontrol Jadibot (Owner):*\n` +
    `• \`.listbot\` — Cek semua jadibot aktif\n` +
    `• \`.stopbot ${number}\` — Hentikan jadibot\n` +
    `• \`.upbot ${number} <durasi>\` — Perpanjang masa aktif\n` +
    `• \`.downbot ${number} <durasi>\` — Kurangi masa aktif\n\n` +
    `> _Notif otomatis — Wily Bot ${ver}_ 🤖`
  )
}

// ── Notif reconnect → ke USER JADIBOT (personal, beda dari versi owner) ──────
function msgDirectReconnect(number) {
  const cfg    = loadConfig()
  const ver    = cfg.botVersion || 'V27.1'
  const { activeFeaturesText } = buildJadibotFeatureStatus(number)

  const meta   = getJadibotExpiry(number)
  const isPerm = meta?.permanent === true
  const sisa   = !meta ? '_Tidak ada data_'
    : isPerm ? '*Permanent* ♾️'
    : `*${formatRemainingTime(Math.max(0, Number(meta.expiresAt) - Date.now()))}*`

  return (
    `╔══════════════════════╗\n` +
    `║  🔄  *JADIBOT ONLINE*  ║\n` +
    `╚══════════════════════╝\n\n` +
    `📱 *Nomor kamu:* \`+${number}\`\n` +
    `🕐 *Waktu:* _${_nowStr()}_\n` +
    `⏳ *Sisa Masa Aktif:* ${sisa}\n\n` +
    `🔄 *Nomormu kembali online secara otomatis!*\n` +
    `> _Semua fitur lanjut berjalan — tidak perlu tindakan apapun._\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `✨ *Fitur yang Lanjut Berjalan:*\n` +
    `${activeFeaturesText}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 *Ingin perpanjang atau ada pertanyaan?*\n` +
    `📞 Hubungi owner: ${getOwnerContact()}\n\n` +
    `> _Notif otomatis — Wily Bot ${ver}_ 🤖`
  )
}

// ── Notif logout → ke OWNER (alert monitoring) ───────────────────────────────
function msgOwnerLogout(number, savedLabel = '') {
  const cfg    = loadConfig()
  const ver    = cfg.botVersion || 'V27.1'
  const masked = maskNumber(number)
  const remainingList = [...jadibotMap.keys()]

  const listPart = remainingList.length > 0
    ? `📊 *Jadibot Masih Aktif (${remainingList.length}):*\n` +
      remainingList.map((v, i) => `${i + 1}. \`+${v}\``).join('\n') + `\n`
    : `> ❌ _Tidak ada jadibot lain yang aktif saat ini._\n`

  // ── Info waktu sesi user jadibot ──
  const meta = getJadibotExpiry(number)
  let sesiPart = ''
  if (meta) {
    if (meta.permanent === true) {
      const createdAt = meta.createdAt
        ? new Date(meta.createdAt).toLocaleString('id-ID', {
            timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit',
            year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
          }) + ' WIB'
        : 'Tidak diketahui'
      sesiPart =
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `📋 *Info Sesi Jadibot:*\n` +
        `⏱️ *Durasi    :* _Permanent_\n` +
        `📅 *Mulai     :* _${createdAt}_\n` +
        `♾️ *Berakhir  :* _Permanent (tidak ada batas waktu)_\n\n`
    } else {
      const createdAt = meta.createdAt
        ? new Date(meta.createdAt).toLocaleString('id-ID', {
            timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit',
            year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
          }) + ' WIB'
        : 'Tidak diketahui'
      const expiresAt = meta.expiresAt
        ? new Date(Number(meta.expiresAt)).toLocaleString('id-ID', {
            timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit',
            year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
          }) + ' WIB'
        : 'Tidak diketahui'
      const durationText = meta.durationText || 'Tidak diketahui'
      const remMs = Number(meta.expiresAt) - Date.now()
      const sisaWaktu = remMs > 0 ? formatRemainingTime(remMs) : '0 (sudah habis saat logout)'
      sesiPart =
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `📋 *Info Sesi Jadibot:*\n` +
        `⏱️ *Durasi    :* _${durationText}_\n` +
        `📅 *Mulai     :* _${createdAt}_\n` +
        `⌛ *Berakhir  :* _${expiresAt}_\n` +
        `⏳ *Tersisa   :* _${sisaWaktu}_\n\n`
    }
  }

  return (
    `╔══════════════════════╗\n` +
    `║  🚨  *JADIBOT LOGOUT!* ║\n` +
    `╚══════════════════════╝\n\n` +
    `📱 *Nomor :* \`+${number}\`\n` +
    `🕐 *Waktu :* _${_nowStr()}_\n\n` +
    `⚠️ *Jadibot +${masked} telah keluar dari Perangkat Tertaut WhatsApp.*\n` +
    `_Kemungkinan: logout manual, hapus perangkat, atau sesi kadaluarsa._\n` +
    `🗑️ ~Sesi otomatis dihapus secara permanen.~\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `❌ *Fitur yang Berhenti di Nomor Ini:*\n` +
    `${buildJadibotFeatureStatus(number).stoppedFeaturesText}\n\n` +
    `${sesiPart}` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `${listPart}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    (savedLabel
      ? `💾 *Sisa waktu tersimpan:* _${savedLabel}_\n` +
        `🔄 Ketik \`.jadibot ${number}\` → waktu otomatis dilanjutkan!\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n`
      : '') +
    `💡 *Aktifkan Kembali:*\n` +
    `• Ketik \`.jadibot ${number}\` di chat bot\n\n` +
    `> _Notif otomatis — Wily Bot ${ver}_ 🤖`
  )
}

/* ================= START JADIBOT ================= */
async function startJadibot(number, sendReply, mainBotNumber, editMsg = null, sendPairingMsg = null, durationMs = undefined, mainBotSock = null, reactFn = null, requesterNumber = null, replyJid = null) {
  number = number.replace(/[^0-9]/g, '')
  const hasRequestedDuration = durationMs !== undefined && durationMs !== null

  if (hasRequestedDuration) {
    removeJadibotExpiry(number)
  } else if (isJadibotExpired(number)) {
    await expireJadibot(number, sendReply)
    return
  }

  if (activeOrStartingJadibot.has(number)) {
    if (jadibotMap.has(number)) {
      console.log(`\x1b[33m[JADIBOT]\x1b[0m ⚠️ ${number} sudah aktif/dalam proses start, skip duplikat`)
      return
    }
    // Nomor sedang dalam proses pairing tapi belum terhubung → tutup socket lama & reset state
    console.log(`\x1b[33m[JADIBOT]\x1b[0m 🔁 ${number} pairing stuck → tutup socket lama & coba ulang`)
    const oldSock = startingSocketMap.get(number)
    if (oldSock) {
      try {
        oldSock.ev.removeAllListeners()
        if (oldSock.ws) oldSock.ws.close()
      } catch {}
      startingSocketMap.delete(number)
    }
    activeOrStartingJadibot.delete(number)
    pairingRequested.delete(number)
    if (pairingTimeout.has(number)) {
      clearTimeout(pairingTimeout.get(number))
      pairingTimeout.delete(number)
    }
    // Tunggu sebentar agar socket lama selesai sebelum buat yang baru
    await delay(800)
  }
  activeOrStartingJadibot.add(number)
  pairingTimeoutNotified.delete(number)
  if (!hasRequestedDuration && getJadibotExpiry(number)) {
    updateJadibotExpiryStatus(number, 'starting')
    scheduleJadibotExpiry(number, sendReply)
  }

  if (typeof global.autoStartedJadibot !== 'undefined') {
    global.autoStartedJadibot.add(number)
  }

  const sessionDir = path.join(process.cwd(), 'jadibot', number)
  const sessionFile = sessionDir + '.json'

  const { state, saveCreds, contacts: jbContacts, groups: jbGroups, settings: jbSettings, clearCacheInPlace: jbClearCache, getSizeReport: jbSizeReport } = await useSingleFileAuthState(sessionFile)
  if (jbClearCache)   jadibotClearSesiMap.set(number, jbClearCache)
  if (jbSizeReport)   jadibotSesiReportMap.set(number, jbSizeReport)
  const { version } = await getJadibotVersion()

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: state.keys,
    },
    logger: silentLogger,
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '136.0.7103.93'],
    keepAliveIntervalMs: 30000,
    syncFullHistory: true,
  })

  sock.isMainBot = false
  sock.mainBotNumber = global.__mainBotNumber || mainBotNumber || ''
  sock.jadibotUserNumber = requesterNumber || null

  injectClient(
    sock,
    new Map(),
    jbContacts,
    jbGroups,
    jbSettings
  )

  sock.loadedCommands = [
    'p', 'ping', 'menu',
    'antidel', 'ad',
    'readsw',
    'anticall', 'ac',
    'anticallvid', 'acv',
    'autocallaudio', 'aca',
    'online',
    'typing', 'typ',
    'recording', 'record',
    'tt', 'ig', 'fb', 'ytmp3', 'ytmp4', 'play',
    'allunduh', 'twdl',
    'animgif', 'animegif', 'gifanime',
    'sticker', 's',
    'wm', 'swm',
    'toimg', 'hd',
    'upswgc', 'swgc', 'swgrup', 'swgroup', 'statusgrup', 'statusgroup',

    'readchat',
    'ceksw',
    'ceksetting',
    'emoji', 'emojiadd', 'emojidel', 'emojilist',
    'emojidefault', 'emojicustom', 'emojiclear',
    'ceksesi', 'clearsesi', 'cs',
    'del', 'd', 'delbot',
    'font', 'fontgen', 'fontuntik',
    'getppuser',
    'logo'
  ]

  sock.ev.on('creds.update', async (...args) => {
    try { await saveCreds(...args) } catch {}
  })

  // Daftarkan socket ke startingSocketMap selama belum connected
  startingSocketMap.set(number, sock)

  /* ================= CONNECTION ================= */
  let pairingMsgKey = null
  let pairingMsg    = null  // full message object untuk quoted reply
  let aborted = false
  let hasConnectedOnce = false

  function cleanupSocket() {
    aborted = true
    try {
      sock.ev.removeAllListeners()
      if (sock.ws) sock.ws.close()
    } catch {}
  }

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    const reason = lastDisconnect?.error?.output?.statusCode

    /* ===== PAIRING CODE — TIMEOUT 3 MENIT ===== */
    if (
      connection === 'connecting' &&
      !state.creds?.registered &&
      !pairingRequested.has(number)
    ) {
      pairingRequested.add(number)

      // Kirim kode pairing setelah koneksi stabil (dengan retry)
      setTimeout(async () => {
        await delay(1000) // tunggu socket stabil
        let retries = 3
        while (retries > 0) {
          if (aborted) break
          try {
            // Gunakan kode pairing dari config.json, sama seperti bot utama.
            // Baileys akan membuat kode acak hanya jika pairingCode kosong.
            const cfg = loadConfig()
            const customPairingCode = cfg.pairingCode
              ? String(cfg.pairingCode).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8).padEnd(8, '0')
              : undefined
            const code = await sock.requestPairingCode(number, customPairingCode)
            if (aborted) break

            // Cek mode pairing dari config terbaru (jangan pakai cfg yang tidak
            // tersedia di scope callback pairing).
            const pairingMode = (cfg.jadibotPairingMode || 'v2').toLowerCase()
            // v1 = kirim pairing code ke GC/owner chat
            // v2 = kirim pairing code langsung ke nomor tujuan (private)

            let directPairingSent = false

            const _pairSock = getActiveMainSock(mainBotSock)
            if (pairingMode === 'v2' && _pairSock) {
              // ── V2: Kirim kode langsung ke nomor tujuan ──
              try {
                // Pakai plain @s.whatsapp.net — jangan onWhatsApp() resolve dulu.
                // onWhatsApp bisa return LID JID yang belum ada key-exchange-nya
                // → sendMessage ke LID JID = not-acceptable dari WA server.
                const targetJid = `${number}@s.whatsapp.net`

                await _pairSock.sendMessage(targetJid, { text: msgPairingCode(code, number, true) })
                directPairingSent = true
                console.log(`[JADIBOT][V2] ✅ Pairing code terkirim realtime ke +${number} (jid: ${targetJid})`)

                // Notif ke GC/owner chat bahwa kode sudah dikirim ke nomor tujuan
                try {
                  // ── Hitung info durasi untuk notif owner ──
                  const _pairNowMs = Date.now()
                  const _pairExpiry = getJadibotExpiry(number)
                  const _pairIsPerm = !hasRequestedDuration && _pairExpiry?.permanent === true
                  const _pairDurMs = durationMs || (_pairExpiry?.durationMs) || DEFAULT_JADIBOT_DURATION_MS
                  const _pairDurText = _pairIsPerm ? 'Permanent ♾️' : formatDurationMs(_pairDurMs)
                  const _pairStartText = formatJadibotExpiryTime(_pairNowMs)
                  const _pairEndText = _pairIsPerm
                    ? 'Selamanya ♾️'
                    : formatJadibotExpiryTime(_pairNowMs + _pairDurMs)
                  const _pairVer = loadConfig().botVersion || 'V27.1'

                  const sentInfo = await sendReply(
                    `🤖 *J A D I B O T*\n` +
                    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `✅ *Kode pairing berhasil dikirim!*\n` +
                    `📩 Kode dikirim langsung ke nomor:\n` +
                    `📱 \`+${number}\`\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━━\n` +
                    `📋 *Detail Sesi Jadibot:*\n` +
                    `⏱️ *Durasi    :* ${_pairDurText}\n` +
                    `📅 *Mulai    :* _${_pairStartText}_\n` +
                    `📅 *Berakhir :* _${_pairEndText}_\n` +
                    `🔄 *Status   :* ~Belum terhubung~ ⏳\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━━\n` +
                    `📌 *Instruksi untuk mereka:*\n` +
                    `1️⃣ Buka pesan kode di nomor mereka\n` +
                    `2️⃣ Buka WA → ⋮ → *Perangkat Tertaut*\n` +
                    `3️⃣ *Tautkan Perangkat* → *Tautkan dengan nomor telepon*\n` +
                    `4️⃣ Masukkan kode sebelum kedaluwarsa\n\n` +
                    `> ⚠️ _Kode hanya berlaku *3 menit* — ~jangan ditunda!~_\n` +
                    `> _Wily Bot ${_pairVer}_ 🤖`
                  )
                  if (sentInfo?.key) { pairingMsgKey = sentInfo.key; pairingMsg = sentInfo }
                } catch {}

              } catch (e) {
                console.log(`[JADIBOT][V2] ⚠️ Gagal kirim pairing code ke +${number}: ${e?.message}`)
                // Fallback: kirim ke GC/owner jika pengiriman langsung gagal
                if (!directPairingSent) {
                  try {
                    const sentInfo = await sendReply(msgPairingCode(code, number))
                    if (sentInfo?.key) { pairingMsgKey = sentInfo.key; pairingMsg = sentInfo }
                    directPairingSent = true
                    console.log(`[JADIBOT][V2→V1] ✅ Fallback: pairing code dikirim ke GC/owner`)
                  } catch (e2) {
                    console.log(`[JADIBOT][V2→V1] ⚠️ Fallback gagal juga: ${e2?.message}`)
                  }
                }
              }
            }

            // ── V1 atau fallback jika V2 gagal: kirim kode ke GC/owner chat ──
            if (!directPairingSent) {
              if (sendPairingMsg) {
                const sentInfo = await sendPairingMsg(code, number)
                if (sentInfo?.key) { pairingMsgKey = sentInfo.key; pairingMsg = sentInfo }
              } else {
                // V1: kirim plain text ke GC/owner
                try {
                  const sentInfo = await sendReply(msgPairingCode(code, number))
                  if (sentInfo?.key) { pairingMsgKey = sentInfo.key; pairingMsg = sentInfo }
                } catch (e) {
                  console.log(`[JADIBOT][V1] ⚠️ Gagal kirim pairing code ke GC: ${e?.message}`)
                }
              }
              if (pairingMode === 'v1') console.log(`[JADIBOT][V1] ✅ Pairing code terkirim ke GC/owner`)
            }
            break
          } catch (err) {
            if (aborted) break
            retries--
            console.error(`[JADIBOT] Gagal request pairing code ${number} (sisa retry: ${retries}):`, err?.message)
            if (retries > 0) await delay(2000)
          }
        }
        if (!aborted && retries === 0) {
          try {
            await sendReply(
              `╔══════════════════════╗\n` +
              `║   ❌  *GAGAL PAIRING*   ║\n` +
              `╚══════════════════════╝\n\n` +
              `⚠️ Gagal mendapatkan kode pairing untuk *${maskNumber(number)}*.\n` +
              `Koneksi terputus sebelum kode berhasil dibuat.\n\n` +
              `💡 Ketik *.jadibot ${number}* untuk coba lagi.`
            )
          } catch {}
        }
      }, 2000)

      // ⏱️ AUTO STOP setelah 3 MENIT jika belum terhubung
      const timeout = setTimeout(async () => {
        if (state.creds?.registered || jadibotMap.has(number)) return
        if (!claimPairingTimeoutNotification(number)) {
          console.log(`[JADIBOT][PAIR-TIMEOUT] ⚠️ Notif sudah diklaim sebelumnya untuk +${number}, skip timer duplikat`)
          return
        }

        console.log(`[JADIBOT] ⏰ Pairing timeout 3 menit → ${number} → sesi dihapus`)

        pairingRequested.delete(number)
        pairingTimeout.delete(number)
        activeOrStartingJadibot.delete(number)
        startingSocketMap.delete(number)

        // Tutup socket
        cleanupSocket()

        // Hapus sesi
        setTimeout(() => {
          if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true })
          }
          try { const _sf = sessionDir + '.json'; if (fs.existsSync(_sf)) fs.unlinkSync(_sf) } catch {}
          removeJadibotExpiry(number)
        }, 500)

        // Kirim notif pairing timeout sesuai mode
        const _expSock = getActiveMainSock(mainBotSock)
        const _expMode = ((loadConfig().jadibotPairingMode) || 'v2').toLowerCase()

        if (_expMode === 'v2') {
          // V2: kirim langsung ke nomor target (direct=true → tampilkan link owner)
          if (_expSock) {
            try {
              let _expJid = `${number}@s.whatsapp.net`
              try {
                const [_expWa] = await _expSock.onWhatsApp(`${number}@s.whatsapp.net`)
                if (_expWa?.exists && _expWa?.jid) _expJid = _expWa.jid
              } catch (_) {}
              await _expSock.sendMessage(_expJid, { text: msgPairingExpired(number, true) })
              console.log(`[JADIBOT][V2][EXPIRED] ✅ Notif pairing timeout terkirim langsung ke +${number}`)
            } catch (e) {
              console.log(`[JADIBOT][V2][EXPIRED] ⚠️ Gagal kirim ke nomor tujuan: ${e?.message}`)
            }
          }
          // V2: JUGA notif ke GC/owner (yang request jadibot) agar tahu pairing gagal
          try {
            const _expText = msgPairingExpired(number, false)
            const _expBtnSock = getActiveMainSock(mainBotSock)
            if (replyJid && _expBtnSock) {
              await sendInteractiveButton(_expBtnSock, replyJid, _expText, `.jadibot ${number}`, pairingMsg)
            } else {
              await sendReply(_expText)
            }
            console.log(`[JADIBOT][V2][EXPIRED] ✅ Notif pairing timeout terkirim ke GC/owner`)
          } catch (e) {
            console.log(`[JADIBOT][V2][EXPIRED] ⚠️ Gagal kirim notif ke GC/owner: ${e?.message}`)
          }
        } else {
          // V1: kirim ke GC/owner (direct=false → tampilkan command bot)
          try {
            const _expTextV1 = msgPairingExpired(number, false)
            const _expBtnSockV1 = getActiveMainSock(mainBotSock)
            if (replyJid && _expBtnSockV1) {
              await sendInteractiveButton(_expBtnSockV1, replyJid, _expTextV1, `.jadibot ${number}`, pairingMsg)
            } else {
              await sendReply(_expTextV1)
            }
            console.log(`[JADIBOT][V1][EXPIRED] ✅ Notif pairing timeout terkirim ke GC/owner`)
          } catch (e) {
            console.log(`[JADIBOT][V1][EXPIRED] ⚠️ Gagal kirim notif ke GC/owner: ${e?.message}`)
          }
          // V1: JUGA kirim langsung ke nomor target (direct=true → tampilkan link owner)
          if (_expSock) {
            try {
              let _expJidV1 = `${number}@s.whatsapp.net`
              try {
                const [_expWaV1] = await _expSock.onWhatsApp(`${number}@s.whatsapp.net`)
                if (_expWaV1?.exists && _expWaV1?.jid) _expJidV1 = _expWaV1.jid
              } catch (_) {}
              await _expSock.sendMessage(_expJidV1, { text: msgPairingExpired(number, true) })
              console.log(`[JADIBOT][V1][EXPIRED] ✅ Notif pairing timeout terkirim langsung ke +${number}`)
            } catch (e) {
              console.log(`[JADIBOT][V1][EXPIRED] ⚠️ Gagal kirim notif langsung ke +${number}: ${e?.message}`)
            }
          }
        }

        // Permintaan manual sudah mendapat satu pesan lewat sendReply.
        // Auto-start tetap mengirim laporan monitoring ke owner.
        if (!requesterNumber) {
          try {
            await sendOwnerNotifWithButton(mainBotSock, msgOwnerPairingExpired(number), `.jadibot ${number}`, [number])
            console.log(`[JADIBOT][EXPIRED] ✅ Notif pairing timeout terkirim ke owner DM`)
          } catch {}
        }
      }, PAIRING_TIMEOUT_MS)

      pairingTimeout.set(number, timeout)
    }

    /* ===== CONNECTED ===== */
    if (connection === 'open') {
      hasConnectedOnce = true
      const isFreshPairing = pairingRequested.has(number)
      const _connectTs = Date.now()

      // Connection box ditampilkan SETELAH expiry diset (lihat di bawah)

      jadibotMap.set(number, sock)
      jadibotConnectedAt.set(number, _connectTs)
      persistConnectedAt(number, _connectTs)
      startingSocketMap.delete(number)
      pairingRequested.delete(number)
      // Fresh pairing → reset flag notif user agar reconnect berikutnya kirim notif lagi
      if (isFreshPairing) clearJadibotUserReconnectNotified(number)

      // Start per-jadibot autoonline (isolated dari bot utama & jadibot lain)
      try { startJadibotAutoOnline(sock, number) } catch {}

      // Start auto-prune SwStats tiap 6 jam (isolated per jadibot)
      try { startJadibotSwPrune(number) } catch {}

      // Auto-init emoji.json per jadibot — copy dari bot utama jika belum ada
      try { getJadibotEmojis(number) } catch {}

      // Init ceksw config per-jadibot — default OFF jika belum pernah ada
      try { initJadibotCekswConfig(number) } catch {}

      // SwStats: prune activeSW expired supaya data jadibot realtime & akurat
      try { pruneSwStatsAt(path.join(process.cwd(), 'data_jadibot', number, 'ceksw', 'swstats.json'), number) } catch {}

      // Pastikan registered = true tersimpan agar reconnect tidak trigger pairing ulang
      if (!state.creds.registered) {
        state.creds.registered = true
        saveCreds()
      }

      if (durationMs === 'permanent') {
        setPermanentJadibot(number, 'active')
      } else if (hasRequestedDuration) {
        ensureJadibotExpiry(number, durationMs, 'active')
        scheduleJadibotExpiry(number, sendReply)
      } else if (getJadibotExpiry(number)) {
        updateJadibotExpiryStatus(number, 'active')
        scheduleJadibotExpiry(number, sendReply)
      } else {
        // Tidak ada data expiry = sesi orphan yang berhasil konek ulang
        // Jangan jadikan permanent — hentikan & bersihkan sesi ini
        console.log(`[JADIBOT] ⚠️ ${number} tidak ada data expiry saat konek → sesi dihentikan (bukan permanent)`)
        setTimeout(() => expireJadibot(number, sendReply), 500)
      }

      // Hapus data sisa waktu yang tersimpan dari logout sebelumnya (sudah berhasil konek ulang)
      clearLogoutSavedMs(number)

      if (pairingTimeout.has(number)) {
        clearTimeout(pairingTimeout.get(number))
        pairingTimeout.delete(number)
      }

      // ── Combined connection + expiry box ──
      {
        const _LC2 = '\x1b[36m', _LR2 = '\x1b[0m', _LB2 = '\x1b[1m'
        const _meta2 = getJadibotExpiry(number)
        let _exIcon = '♾️ ', _exLabel = 'Permanent'
        if (_meta2 && _meta2.permanent !== true && _meta2.expiresAt) {
          const _ms2 = Number(_meta2.expiresAt) - Date.now()
          if (_ms2 <= 0) { _exIcon = '💀'; _exLabel = 'kedaluwarsa' }
          else { _exIcon = '🕐'; _exLabel = formatRemainingTime(_ms2) }
        }
        const _line2 = '─'.repeat(34)
        console.log(`${_LC2}╭${_line2}╮${_LR2}`)
        console.log(`${_LC2}│${_LR2} ✅ ${_LB2}+${number}${_LR2} ${isFreshPairing ? 'CONNECTED ✔' : 'RECONNECTED ✔'}`)
        console.log(`${_LC2}│${_LR2} ${_exIcon} ${_exLabel}`)
        console.log(`${_LC2}╰${_line2}╯${_LR2}`)
      }

      // Edit pesan pairing secara realtime → tandai sudah terhubung
      if (pairingMsgKey && editMsg) {
        try {
          await editMsg(
            pairingMsgKey,
            `╔══════════════════════╗\n` +
            `║   ✅  *J A D I B O T*  ║\n` +
            `╚══════════════════════╝\n\n` +
            `📱 *Nomor:* ${maskNumber(number)}\n\n` +
            `🎉 *Kode berhasil digunakan!*\n` +
            `Jadibot sudah terhubung dan aktif.\n\n` +
            `✅ Pesan ini diperbarui otomatis saat terhubung.`
          )
        } catch {}
      }

      // Kirim pesan sambutan hanya saat fresh pairing (bukan reconnect otomatis)
      if (isFreshPairing) {
        try { if (reactFn) await reactFn('✅') } catch {}

        // Cek mode pairing — v2 = kirim welcome ke nomor tujuan, v1 = tidak
        const connCfg = loadConfig()
        const connPairingMode = (connCfg.jadibotPairingMode || 'v2').toLowerCase()

        // Helper: kirim msgDirectWelcome ke nomor jadibot via main bot (dengan resolve JID)
        const _sendWelcomeDirect = async (_sock) => {
          if (!_sock) return false
          try {
            await delay(800)
            // Resolve JID yang benar dulu (support LID/linked device)
            let _jid = `${number}@s.whatsapp.net`
            try {
              const [_waRes] = await _sock.onWhatsApp(`${number}@s.whatsapp.net`)
              if (_waRes?.exists && _waRes?.jid) _jid = _waRes.jid
            } catch (_) {}
            await _sock.sendMessage(_jid, { text: msgDirectWelcome(number) })
            console.log(`[JADIBOT] ✅ Notif welcome terkirim ke +${number} via main bot (jid: ${_jid})`)
            return true
          } catch (e) {
            console.log(`[JADIBOT] ⚠️ Gagal kirim notif welcome ke +${number}: ${e?.message}`)
            return false
          }
        }

        if (connPairingMode === 'v2') {
          // V2: kirim welcome langsung ke nomor jadibot via main bot
          const _welcomeSock = getActiveMainSock(mainBotSock)
          const _sent = await _sendWelcomeDirect(_welcomeSock)

          // Fallback jika main bot gagal: kirim via socket jadibot sendiri
          if (!_sent) {
            try {
              await delay(300)
              await sendDirectJadibotNotice(sock, number, msgDirectWelcome(number))
              console.log(`[JADIBOT][V2][FALLBACK] ✅ Notif welcome via self-sock ke +${number}`)
            } catch {}
          }
        } else {
          // V1: kirim notif ke GC/owner
          try {
            await sendReply(msgConnected(number))
            console.log(`[JADIBOT][V1] ✅ Notif terhubung terkirim ke GC/owner`)
          } catch (e) {
            console.log(`[JADIBOT][V1] ⚠️ Gagal kirim notif terhubung ke GC: ${e?.message}`)
          }
          // V1: JUGA kirim langsung ke nomor jadibot via main bot
          const _welcomeSockV1 = getActiveMainSock(mainBotSock)
          await _sendWelcomeDirect(_welcomeSockV1)
        }
      }

      // ── Notif reconnect ke OWNER — in-memory flag, sekali per restart ──────────
      const _skipOwnerReconnectNotif = !isFreshPairing && isJadibotReconnectNotified(number)
      if (!_skipOwnerReconnectNotif) {
        // Claim dulu sebelum await — cegah race condition jika connection='open' fire cepat
        if (!isFreshPairing) markJadibotReconnectNotified(number)
        try {
          await sendOwnerNotif(mainBotSock, msgOwnerConnected(number, !isFreshPairing), [number])
        } catch {}
      }

      // ── Notif reconnect ke USER JADIBOT — persistent flag, sekali seumur sesi ─
      // Tidak dikirim ulang meski bot restart berkali-kali. Di-reset hanya saat fresh pairing.
      if (!isFreshPairing && !isJadibotUserReconnectNotified(number)) {
        // Claim persistent dulu sebelum await
        markJadibotUserReconnectNotified(number)
        try {
          const _sentRecon = await sendDirectToUser(mainBotSock, number, msgDirectReconnect(number))
          if (!_sentRecon) {
            await delay(300)
            await sendDirectJadibotNotice(sock, number, msgDirectReconnect(number))
            console.log(`[JADIBOT][RECONNECT][FALLBACK] ✅ Notif reconnect via self-sock ke +${number}`)
          }
        } catch {}
      }
    }

    /* ===== DISCONNECTED ===== */
    if (connection === 'close') {
      startingSocketMap.delete(number)

      // Cek apakah ini putus di tengah proses pairing (belum pernah konek, belum registered)
      // Jika iya → kirim notif "kode expired" sekarang (timer tidak akan sempat jalan)
      const _wasStillPairing = pairingTimeout.has(number) &&
        !hasConnectedOnce &&
        !state.creds?.registered &&
        !jadibotMap.has(number)

      // ── RACE CONDITION GUARD ──────────────────────────────────────────────────
      // Saat user memasukkan kode pairing yang benar, WA mengirim:
      //   connection='close' (reason 428) → lalu connection='open'
      // Ini adalah handshake normal WA, BUKAN kegagalan pairing.
      // Jika reason=428 (Connection Closed) → beri jeda 4 detik sebelum cleanup,
      // sehingga 'connection=open' punya waktu untuk fire duluan.
      // Jika dalam 4 detik sudah konek/registered → skip cleanup (pairing berhasil).
      if (_wasStillPairing && reason === 428) {
        console.log(`[JADIBOT] ⏸️ Close reason=428 saat pairing +${number} → tahan 4s (kemungkinan handshake WA)`)
        await delay(4000)
        // Re-check: kalau sudah berhasil konek setelah delay → skip cleanup
        if (jadibotMap.has(number) || state.creds?.registered) {
          console.log(`[JADIBOT] ✅ +${number} berhasil pairing setelah delay, skip cleanup`)
          return
        }
        console.log(`[JADIBOT] ⏰ +${number} masih belum konek setelah 4s, lanjut cleanup`)
      }
      // ─────────────────────────────────────────────────────────────────────────

      if (pairingTimeout.has(number)) {
        clearTimeout(pairingTimeout.get(number))
        pairingTimeout.delete(number)
      }

      if (_wasStillPairing) {
        // Guard atomik: timer dan connection.close hanya boleh mengklaim satu notif.
        if (!claimPairingTimeoutNotification(number)) {
          console.log(`[JADIBOT][PAIR-TIMEOUT] ⚠️ Notif sudah dikirim sebelumnya untuk +${number}, skip duplikat`)
        } else {
          console.log(`[JADIBOT] ⏰ Pairing socket close saat proses pairing → kirim notif timeout ke ${number}`)
          const _ptSock = getActiveMainSock(mainBotSock)

          // Kirim ke nomor target (direct=true → link owner, bukan command)
          if (_ptSock) {
            try {
              await _ptSock.sendMessage(`${number}@s.whatsapp.net`, { text: msgPairingExpired(number, true) })
              console.log(`[JADIBOT][PAIR-TIMEOUT] ✅ Notif terkirim langsung ke +${number}`)
            } catch (e) {
              console.log(`[JADIBOT][PAIR-TIMEOUT] ⚠️ Gagal kirim ke +${number}: ${e?.message}`)
            }
          }

          // Kirim ke GC/owner (direct=false → command bot + button Lanjutkan)
          if (sendReply) {
            try {
              const _ptText = msgPairingExpired(number, false)
              const _ptSockBtn = getActiveMainSock(mainBotSock)
              if (replyJid && _ptSockBtn) {
                await sendInteractiveButton(_ptSockBtn, replyJid, _ptText, `.jadibot ${number}`, pairingMsg)
              } else {
                await sendReply(_ptText)
              }
              console.log(`[JADIBOT][PAIR-TIMEOUT] ✅ Notif terkirim ke GC/owner`)
            } catch (e) {
              console.log(`[JADIBOT][PAIR-TIMEOUT] ⚠️ Gagal kirim ke GC/owner: ${e?.message}`)
            }
          }

          // Permintaan manual sudah mendapat satu pesan lewat sendReply.
          // Auto-start tetap mengirim laporan monitoring ke owner.
          if (!requesterNumber) {
            try {
              await sendOwnerNotifWithButton(mainBotSock, msgOwnerPairingExpired(number), `.jadibot ${number}`, [number])
              console.log(`[JADIBOT][PAIR-TIMEOUT] ✅ Notif pairing timeout terkirim ke owner DM`)
            } catch {}
          }
        }

        // Cleanup session pairing yang gagal + stop semua proses terkait
        pairingRequested.delete(number)
        activeOrStartingJadibot.delete(number)
        removeJadibotExpiry(number)
        cleanupSocket()
        setTimeout(() => {
          try { if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true }) } catch {}
          try { if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile) } catch {}
        }, 300)
        return  // ← stop di sini, jangan sampai isJadibotExpired check di bawah ikut kirim notif lagi
      }

      pairingRequested.delete(number)

      /* STOP MANUAL DARI BOT UTAMA */
      if (stoppingJadibot.has(number)) {
        stoppingJadibot.delete(number)
        jadibotMap.delete(number)
        stopJadibotAutoOnline(number)
        stopJadibotSwPrune(number)
        activeOrStartingJadibot.delete(number)
        const _C = '\x1b[36m', _R = '\x1b[0m', _B = '\x1b[1m';
        console.log(`${_C}╠══════════════════════════════════╣${_R}`);
        console.log(`${_C}║${_R} ⏹️  ${_B}+${number}${_R} STOPPED`);
        console.log(`${_C}╚══════════════════════════════════╝${_R}`);
        return
      }

      /* ===== LOGOUT PAKSA DARI WHATSAPP ===== */
      if (reason === DisconnectReason.loggedOut) {
        // Hitung sisa waktu SEBELUM dihapus, untuk ditampilkan di notif dan disimpan
        const _logoutMeta = getJadibotExpiry(number)
        let _savedRemainingLabel = ''
        if (_logoutMeta) {
          if (_logoutMeta.permanent === true) {
            _savedRemainingLabel = 'Permanent ♾️'
          } else {
            const _rem = Number(_logoutMeta.expiresAt) - Date.now()
            if (_rem > 0) _savedRemainingLabel = formatRemainingTime(_rem)
          }
        }

        // Hapus dari map DULU baru ambil sisa list (agar nomor ini tidak muncul di list)
        jadibotMap.delete(number)
        stopJadibotAutoOnline(number)
        stopJadibotSwPrune(number)
        activeOrStartingJadibot.delete(number)

        const _C = '\x1b[36m', _R2 = '\x1b[0m', _B2 = '\x1b[1m';
        console.log(`${_C}╠══════════════════════════════════╣${_R2}`);
        console.log(`${_C}║${_R2} 🚫 ${_B2}+${number}${_R2} LOGOUT PAKSA → sesi dihapus`);
        if (_savedRemainingLabel) console.log(`${_C}║${_R2} 💾 Sisa waktu tersimpan: ${_savedRemainingLabel}`);
        console.log(`${_C}╚══════════════════════════════════╝${_R2}`);

        // Beri tahu owner via react ❌ (realtime)
        try { if (reactFn) await reactFn('❌') } catch {}

        // Cek mode pairing untuk tentukan kemana notif logout dikirim
        const logoutCfg = loadConfig()
        const logoutMode = (logoutCfg.jadibotPairingMode || 'v2').toLowerCase()

        if (logoutMode === 'v2') {
          // V2: kirim notif langsung ke nomor tujuan via main bot
          const _logoutSock = getActiveMainSock(mainBotSock)
          if (_logoutSock) {
            try {
              await _logoutSock.sendMessage(`${number}@s.whatsapp.net`, {
                text: msgLoggedOutDirect(number, _savedRemainingLabel)
              })
              console.log(`[JADIBOT][V2] ✅ Notif logout terkirim ke +${number}`)
            } catch (e) {
              console.log(`[JADIBOT][V2] ⚠️ Gagal kirim notif logout ke +${number}: ${e?.message}`)
            }
          }
        } else {
          // V1: kirim notif ke GC/owner
          const remainingList = [...jadibotMap.keys()]
          try {
            await sendReply(msgLoggedOut(number, remainingList, _savedRemainingLabel))
            console.log(`[JADIBOT][V1] ✅ Notif logout terkirim ke GC/owner`)
          } catch (e) {
            console.log(`[JADIBOT][V1] ⚠️ Gagal kirim notif logout ke GC: ${e?.message}`)
          }
          // V1: JUGA kirim langsung ke nomor target via main bot
          // (biar user tau jadibotnya logout & perlu hubungi owner)
          const _logoutSockV1 = getActiveMainSock(mainBotSock)
          if (_logoutSockV1) {
            try {
              await _logoutSockV1.sendMessage(`${number}@s.whatsapp.net`, {
                text: msgLoggedOutDirect(number, _savedRemainingLabel)
              })
              console.log(`[JADIBOT][V1] ✅ Notif logout terkirim langsung ke +${number}`)
            } catch (e) {
              console.log(`[JADIBOT][V1] ⚠️ Gagal kirim notif logout langsung ke +${number}: ${e?.message}`)
            }
          }
        }

        // Notif realtime logout ke semua owner di config.owners[] + button Lanjutkan
        try {
          await sendOwnerNotifWithButton(mainBotSock, msgOwnerLogout(number), `.jadibot ${number}`, [number])
        } catch {}

        // BARU setelah notif terkirim: simpan sisa waktu, tutup socket & hapus sesi
        cleanupSocket()
        setTimeout(() => {
          if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true })
          }
          try { if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile) } catch {}
          saveLogoutRemainingMs(number) // ← simpan sisa waktu sebelum data expiry dihapus
          removeJadibotExpiry(number)
        }, 300)
        return
      }

      // PENTING: cek expired HANYA kalau sesi ini sudah pernah berhasil 'open'
      // di proses berjalan ini. Sebelum pernah open (masih proses pairing awal),
      // belum ada data expiry tersimpan (baru diisi saat connection==='open'),
      // jadi getJadibotExpiry()===null di sini BUKAN berarti expired — itu cuma
      // artinya belum sempat konek. Tanpa guard ini, disconnect biasa (restartRequired
      // dll, hal normal & sering terjadi saat proses pairing) langsung dianggap
      // "expired" dan sesi baru dihapus sebelum sempat konek sama sekali.
      if (hasConnectedOnce && isJadibotExpired(number)) {
        await expireJadibot(number, sendReply)
        return
      }

      /* ===== SESSION SUDAH TIDAK ADA ===== */
      if (!isSessionValid(sessionDir)) {
        jadibotMap.delete(number)
        stopJadibotAutoOnline(number)
        stopJadibotSwPrune(number)
        activeOrStartingJadibot.delete(number)
        const _C = '\x1b[36m', _R = '\x1b[0m', _B = '\x1b[1m';
        console.log(`${_C}╠══════════════════════════════════╣${_R}`);
        console.log(`${_C}║${_R} ❌ ${_B}+${number}${_R} SESSION INVALID → tidak restart`);
        console.log(`${_C}╚══════════════════════════════════╝${_R}`);
        return
      }

      /* ===== RECONNECT NORMAL ===== */
      // Guard: cegah duplicate reconnect jika close event terpicu lebih dari sekali
      if (reconnectingJadibot.has(number)) {
        console.log(`\x1b[33m[JADIBOT]\x1b[0m ⚠️ ${number} sudah dalam proses reconnect, skip duplikat`)
        return
      }
      reconnectingJadibot.add(number)

      // Hapus referensi socket lama dari map agar tidak stale
      jadibotMap.delete(number)

      const _C = '\x1b[36m', _R = '\x1b[0m', _B = '\x1b[1m';
      console.log(`${_C}╠══════════════════════════════════╣${_R}`);
      console.log(`${_C}║${_R} 🔄 ${_B}+${number}${_R} DISCONNECTED → reconnecting...`);
      console.log(`${_C}╚══════════════════════════════════╝${_R}`);
      // Tutup socket lama DULU sebelum buat yang baru
      cleanupSocket()
      setTimeout(() => {
        reconnectingJadibot.delete(number)
        activeOrStartingJadibot.delete(number)
        // Fix: hapus timer pairing lama sebelum startJadibot baru dipanggil.
        // Tanpa ini, timer lama (T1) yang masih hidup bisa fire setelah guard
        // pairingTimeoutNotified di-reset oleh startJadibot baru, menghasilkan
        // dua notif "pairing gagal" sekaligus (double notification bug).
        if (pairingTimeout.has(number)) {
          clearTimeout(pairingTimeout.get(number))
          pairingTimeout.delete(number)
        }
        // .catch() wajib — startJadibot async, error di dalamnya tidak pernah
        // nyangkut ke try/catch biasa dan akan jadi unhandledRejection yang
        // (tanpa guard global) mematikan seluruh proses bot.
        Promise.resolve(startJadibot(number, sendReply, mainBotNumber, editMsg, sendPairingMsg, hasConnectedOnce ? undefined : durationMs, getActiveMainSock(mainBotSock), null, requesterNumber))
          .catch(err => {
            console.log(`\x1b[31m[JADIBOT]\x1b[0m ❌ Reconnect ${number} gagal: ${err?.message}`)
            activeOrStartingJadibot.delete(number)
            startingSocketMap.delete(number)
          })
      }, 3000)
    }
  })

  /* ================= ANTI CALL ================= */
  sock.ev.on('call', async calls => {
    for (const call of calls) {
      try {
        if (call.status !== 'offer') continue
        const jadibotNum = getJadibotNumber(sock)
        const isVideo = call.isVideo === true
        const setting = isVideo ? getJadibotAnticallvid(jadibotNum) : getJadibotAnticall(jadibotNum)
        if (!setting.enabled) continue
        const callerNumber = (call.from || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '')
        const whitelist = setting.whitelist || []
        const isWhitelisted = whitelist.some(n => {
          const c = n.replace(/[^0-9]/g, '')
          return callerNumber.includes(c) || c.includes(callerNumber)
        })
        if (isWhitelisted) {
          console.log(`[JADIBOT][${isVideo ? 'AntiCallVid' : 'AntiCall'}] +${jadibotNum} → ${callerNumber} WHITELISTED, skip`)
          continue
        }
        await sock.rejectCall(call.id, call.from)
        console.log(`[JADIBOT][${isVideo ? 'AntiCallVid' : 'AntiCall'}] +${jadibotNum} → Rejected ${isVideo ? 'video' : 'voice'} call from ${callerNumber}`)
        if (setting.message) {
          await new Promise(r => setTimeout(r, 1000))
          await sock.sendMessage(call.from, { text: setting.message })
        }
      } catch (err) {
        console.error(`[JADIBOT][AntiCall] Error:`, err.message)
      }
    }
  })

  /* ================= GROUPS CACHE ================= */
  sock.ev.on('groups.upsert', async groupsData => {
    try {
      for (const group of groupsData) {
        try {
          const existing = sock.groups.read(group.id) || {}
          sock.groups.write(group.id, { ...existing, ...group })
        } catch (_) {}
      }
    } catch (_) {}
  })
  sock.ev.on('groups.update', async groupsData => {
    try {
      for (const group of groupsData) {
        try {
          const existing = sock.groups.read(group.id) || {}
          sock.groups.write(group.id, { ...existing, ...group })
        } catch (_) {}
      }
    } catch (_) {}
  })

  /* ================= MESSAGE ================= */
  const swSet = getJadibotSwSet(number)
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') {
      // type='append' = echo pesan yang dikirim jadibot sendiri
      // Tangkap khusus group story (fromMe=true) agar jadibot bisa react ke story GC miliknya sendiri
      if (type === 'append') {
        for (const msg of messages) {
          if (!msg.message || !msg.key?.fromMe) continue
          if (!isJidGroup(msg.key?.remoteJid)) continue
          const _chkGs = msg.message?.groupStatusMessageV2 || msg.message?.groupStatusMentionMessage || msg.message?.groupMentionedMessage
            || (msg.message && (() => { try { const vals = Object.values(msg.message); for (const v of vals) { if (v?.contextInfo?.isGroupStatus) return v; } } catch {} return null; })())
          if (!_chkGs) continue
          handleJadibotSW(msg, sock, swSet, number).catch(err =>
            console.error('[JADIBOT APPEND SW ERROR]', err?.message || String(err))
          )
        }
      }
      return
    }

    for (const msg of messages) {
      if (!msg.message) continue
      // Guard: jadibot sudah logout/disconnect → skip pesan yang masih di queue
      // Mencegah race condition: pesan masuk sebelum logout, diproses setelah socket mati
      if (aborted || !jadibotMap.has(number)) continue
      // Blokir pesan yang dikirim oleh kode bot sendiri (ada di _botSentIds)
      // fromMe=true bisa juga dari WA user asli (multi-device) — jangan skip itu
      if (msg.key?.fromMe && sock._botSentIds?.has(msg.key?.id)) continue

      // Cache pesan + pre-download media untuk antidel
      if (msg.key?.id && !sock.cacheMsg.has(msg.key.id)) {
        sock.cacheMsg.set(msg.key.id, msg)
        setTimeout(() => sock.cacheMsg.delete(msg.key.id), 60000)
        preDownloadMediaForAntidel(msg, sock).catch(() => {})


      }

      // ── Deteksi SW dihapus realtime (terisolasi per-jadibot) ──
      const _protoMsg = msg.message?.protocolMessage
      if (_protoMsg && _protoMsg.type === 0) { // 0 = REVOKE
        const _isStatusRevoke =
          msg.key?.remoteJid === 'status@broadcast' ||
          _protoMsg.key?.remoteJid === 'status@broadcast'
        const _deletedId = _protoMsg.key?.id
        if (_isStatusRevoke && _deletedId) {
          try {
            const _jadibotSwDir = path.join(process.cwd(), 'data_jadibot', number, 'swtrack')
            let _handled = false
            // ── Fast path: LRU lookup (O(1)) — baca hanya file milik ownerNum ──
            const _lruOwner = lookupSwMsgOwner(_deletedId, number)
            if (_lruOwner) {
              try {
                const _ownerNum = String(_lruOwner).replace(/[^0-9]/g, '')
                const _ownerFile = path.join(_jadibotSwDir, _ownerNum + '.json')
                if (fs.existsSync(_ownerFile)) {
                  const _userData = JSON.parse(fs.readFileSync(_ownerFile, 'utf-8'))
                  if (_userData[_deletedId]) {
                    _handled = true
                    if (!_userData[_deletedId].deleted) {
                      _userData[_deletedId] = { ..._userData[_deletedId], deleted: true, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
                      const _tmpFp = _ownerFile + '.tmp'
                      fs.writeFileSync(_tmpFp, JSON.stringify(_userData, null, 2), 'utf-8')
                      fs.renameSync(_tmpFp, _ownerFile)
                    }
                  }
                }
              } catch {}
            }
            // ── Slow path: scan semua file per-nomor di swDir ──
            if (!_handled && fs.existsSync(_jadibotSwDir)) {
              try {
                const _swFiles = fs.readdirSync(_jadibotSwDir).filter(f => f.endsWith('.json') && f !== 'users.json')
                for (const _f of _swFiles) {
                  const _fp = path.join(_jadibotSwDir, _f)
                  try {
                    const _userData = JSON.parse(fs.readFileSync(_fp, 'utf-8'))
                    if (_userData[_deletedId]) {
                      if (!_userData[_deletedId].deleted) {
                        _userData[_deletedId] = { ..._userData[_deletedId], deleted: true, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
                        const _tmpFp = _fp + '.tmp'
                        fs.writeFileSync(_tmpFp, JSON.stringify(_userData, null, 2), 'utf-8')
                        fs.renameSync(_tmpFp, _fp)
                      }
                      break
                    }
                  } catch {}
                }
              } catch {}
            }
          } catch {}
        }
      }

      // AutoRead SW — pakai Set terisolasi per-jadibot agar tidak bentrok dengan main bot / jadibot lain
      handleJadibotSW(msg, sock, swSet, number).catch(err =>
        console.error('[JADIBOT SW ERROR]', err?.message || String(err))
      )

      // Auto Typing / Auto Recording per pesan — terisolasi per-jadibot, data di data_jadibot
      try {
        const _atJid = msg.key?.remoteJid
        const _atIsGroup = _atJid?.endsWith('@g.us')
        const _atIsStatus = _atJid === 'status@broadcast'
        if (!_atIsStatus && _atJid && !msg.key?.fromMe) {
          const _atCfg = getJadibotAutoTyping(number)
          const _arCfg = getJadibotAutoRecording(number)
          const _doType = _atCfg.enabled && (_atIsGroup ? _atCfg.groupChat !== false : _atCfg.privateChat !== false)
          const _doRecord = !_doType && _arCfg.enabled && (_atIsGroup ? _arCfg.groupChat !== false : _arCfg.privateChat !== false)
          // Skip typing/recording saat stealth mode aktif — mencegah jadibot flash online sendiri
          if ((_doType || _doRecord) && !sock.__stealthMode) {
            const _presence = _doType ? 'composing' : 'recording'
            const _delaySec = _doType ? (_atCfg.delaySeconds || 5) : (_arCfg.delaySeconds || 5)
            const _delayMs  = Math.min(_delaySec * 1000, 30000)
            // Tandai typing aktif → interval stealth skip unavailable agar delay tidak terpotong
            sock.__typingActive = (sock.__typingActive || 0) + 1
            safeSendPresenceUpdate(sock, _presence, _atJid)
            setTimeout(() => {
              safeSendPresenceUpdate(sock, 'paused', _atJid)
              sock.__typingActive = Math.max(0, (sock.__typingActive || 1) - 1)
            }, _delayMs)
          }
        }
      } catch {}

      // Auto Read Chat — private only, terisolasi per-jadibot
      try {
        const _rcJid = msg.key?.remoteJid
        const _rcIsPrivate = _rcJid && !_rcJid.endsWith('@g.us') && _rcJid !== 'status@broadcast'
        if (_rcIsPrivate && !msg.key?.fromMe) {
          if (getJadibotReadchat(number)?.enabled) {
            sock.readMessages([msg.key]).catch(() => {})
          }
        }
      } catch {}

      try {
        await getHandler('message')(
          { message: msg, type: 'notify' },
          sock
        )
      } catch (err) {
        console.error('[JADIBOT MESSAGE ERROR]', err)
        logError(err instanceof Error ? err : new Error(String(err)), `jadibot-message:${number}`)
      }
    }
  })

  sock.ev.on('messages.update', updates => {
    for (const update of updates) {
      Promise.resolve(
        getHandler('antidelete')(update, sock)
      ).catch(err => console.error(`[JADIBOT][AntiDelete] ${number}:`, err.message))
    }
  })
}

/* ================= START JADIBOT QR ================= */
async function startJadibotQR(number, sendReply, sendImage, mainBotNumber, durationMs = undefined, mainBotSock = null, reactFn = null, requesterNumber = null) {
  number = number.replace(/[^0-9]/g, '')
  const hasRequestedDuration = durationMs !== undefined && durationMs !== null

  if (hasRequestedDuration) {
    removeJadibotExpiry(number)
  } else if (isJadibotExpired(number)) {
    await expireJadibot(number, sendReply)
    return
  }

  if (activeOrStartingJadibot.has(number)) {
    console.log(`\x1b[33m[JADIBOT QR]\x1b[0m ⚠️ ${number} sudah aktif/dalam proses start, skip duplikat`)
    return
  }
  activeOrStartingJadibot.add(number)
  if (!hasRequestedDuration && getJadibotExpiry(number)) {
    updateJadibotExpiryStatus(number, 'starting')
    scheduleJadibotExpiry(number, sendReply)
  }

  if (typeof global.autoStartedJadibot !== 'undefined') {
    global.autoStartedJadibot.add(number)
  }

  const sessionDir = path.join(process.cwd(), 'jadibot', number)
  const sessionFile = sessionDir + '.json'

  const { state, saveCreds, contacts: jbContacts, groups: jbGroups, settings: jbSettings, clearCacheInPlace: jbClearCache, getSizeReport: jbSizeReport } = await useSingleFileAuthState(sessionFile)
  if (jbClearCache)   jadibotClearSesiMap.set(number, jbClearCache)
  if (jbSizeReport)   jadibotSesiReportMap.set(number, jbSizeReport)
  const { version } = await getJadibotVersion()

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: state.keys,
    },
    logger: silentLogger,
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '136.0.7103.93'],
    keepAliveIntervalMs: 30000,
    syncFullHistory: true,
  })

  sock.isMainBot = false
  sock.mainBotNumber = global.__mainBotNumber || mainBotNumber || ''
  sock.jadibotUserNumber = requesterNumber || null

  injectClient(
    sock,
    new Map(),
    jbContacts,
    jbGroups,
    jbSettings
  )

  sock.loadedCommands = [
    'p', 'ping', 'menu',
    'antidel', 'ad',
    'readsw',
    'anticall', 'ac',
    'anticallvid', 'acv',
    'autocallaudio', 'aca',
    'online',
    'typing', 'typ',
    'recording', 'record',
    'tt', 'ig', 'fb', 'ytmp3', 'ytmp4', 'play',
    'allunduh', 'twdl',
    'animgif', 'animegif', 'gifanime',
    'sticker', 's',
    'wm', 'swm',
    'toimg', 'hd',
    'upswgc', 'swgc', 'swgrup', 'swgroup', 'statusgrup', 'statusgroup',

    'readchat',
    'ceksw',
    'ceksetting',
    'emoji', 'emojiadd', 'emojidel', 'emojilist',
    'emojidefault', 'emojicustom', 'emojiclear',
    'ceksesi', 'clearsesi', 'cs',
    'del', 'd', 'delbot',
    'font', 'fontgen', 'fontuntik',
    'getppuser',
    'logo'
  ]

  sock.ev.on('creds.update', async (...args) => {
    try { await saveCreds(...args) } catch {}
  })

  let qrSentCount = 0
  let hasConnected = false

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    const reason = lastDisconnect?.error?.output?.statusCode

    /* ===== KIRIM QR CODE ===== */
    if (qr) {
      qrSentCount++
      try {
        const qrBuffer = await QRCode.toBuffer(qr, { type: 'png', width: 512, margin: 2 })
        const caption =
          `╔══════════════════════╗\n` +
          `║   🤖  *J A D I B O T*  ║\n` +
          `╚══════════════════════╝\n\n` +
          `📱 *Nomor:* ${maskNumber(number)}\n` +
          `🔄 *QR ke-${qrSentCount}*\n\n` +
          `📋 *Cara Scan:*\n` +
          `1️⃣ Buka WhatsApp di HP kamu\n` +
          `2️⃣ Ketuk ⋮ (titik tiga) → *Perangkat Tertaut*\n` +
          `3️⃣ Ketuk *Tautkan Perangkat*\n` +
          `4️⃣ Scan QR di atas\n\n` +
          `⏳ QR berlaku ±60 detik\n` +
          `⚠️ Jika QR expired, QR baru akan dikirim otomatis`
        await sendImage(qrBuffer, caption)
        console.log(`[JADIBOT QR] QR ke-${qrSentCount} dikirim untuk ${number}`)
      } catch (err) {
        console.error(`[JADIBOT QR] Gagal kirim QR ${number}:`, err?.message)
      }
    }

    /* ===== CONNECTED ===== */
    if (connection === 'open') {
      hasConnected = true
      const _connectTs = Date.now()
      jadibotMap.set(number, sock)
      jadibotConnectedAt.set(number, _connectTs)
      persistConnectedAt(number, _connectTs)

      // Start per-jadibot autoonline (isolated dari bot utama & jadibot lain)
      try { startJadibotAutoOnline(sock, number) } catch {}

      // Start auto-prune SwStats tiap 6 jam (isolated per jadibot)
      try { startJadibotSwPrune(number) } catch {}

      // Auto-init emoji.json per jadibot — copy dari bot utama jika belum ada
      try { getJadibotEmojis(number) } catch {}

      // Init ceksw config per-jadibot — default OFF jika belum pernah ada
      try { initJadibotCekswConfig(number) } catch {}

      // SwStats: prune activeSW expired supaya data jadibot realtime & akurat
      try { pruneSwStatsAt(path.join(process.cwd(), 'data_jadibot', number, 'ceksw', 'swstats.json'), number) } catch {}

      // Pastikan registered = true tersimpan agar reconnect tidak trigger QR ulang
      if (!state.creds.registered) {
        state.creds.registered = true
        saveCreds()
      }

      if (durationMs === 'permanent') {
        setPermanentJadibot(number, 'active')
      } else if (hasRequestedDuration) {
        ensureJadibotExpiry(number, durationMs, 'active')
        scheduleJadibotExpiry(number, sendReply)
      } else if (getJadibotExpiry(number)) {
        updateJadibotExpiryStatus(number, 'active')
        scheduleJadibotExpiry(number, sendReply)
      } else {
        // Tidak ada data expiry = sesi orphan yang berhasil konek ulang via QR
        // Jangan jadikan permanent — hentikan & bersihkan sesi ini
        console.log(`[JADIBOT QR] ⚠️ ${number} tidak ada data expiry saat konek → sesi dihentikan (bukan permanent)`)
        setTimeout(() => expireJadibot(number, sendReply), 500)
      }

      // Hapus data sisa waktu yang tersimpan dari logout sebelumnya (sudah berhasil konek ulang)
      clearLogoutSavedMs(number)

      // ── Combined connection + expiry box (QR mode) ──
      {
        const _LC2 = '\x1b[36m', _LR2 = '\x1b[0m', _LB2 = '\x1b[1m'
        const _meta2 = getJadibotExpiry(number)
        let _exIcon = '♾️ ', _exLabel = 'Permanent'
        if (_meta2 && _meta2.permanent !== true && _meta2.expiresAt) {
          const _ms2 = Number(_meta2.expiresAt) - Date.now()
          if (_ms2 <= 0) { _exIcon = '💀'; _exLabel = 'kedaluwarsa' }
          else { _exIcon = '🕐'; _exLabel = formatRemainingTime(_ms2) }
        }
        const _line2 = '─'.repeat(34)
        console.log(`${_LC2}╭${_line2}╮${_LR2}`)
        console.log(`${_LC2}│${_LR2} ✅ ${_LB2}+${number}${_LR2} CONNECTED ✔`)
        console.log(`${_LC2}│${_LR2} ${_exIcon} ${_exLabel}`)
        console.log(`${_LC2}╰${_line2}╯${_LR2}`)
      }
      try { if (reactFn) await reactFn('✅') } catch {}

      // Cek mode pairing — v2 = kirim welcome ke nomor tujuan, v1 = tidak
      const connCfgQR = loadConfig()
      const connPairingModeQR = (connCfgQR.jadibotPairingMode || 'v2').toLowerCase()

      // Helper: kirim msgDirectWelcome ke nomor jadibot via main bot (dengan resolve JID)
      const _sendWelcomeDirectQR = async (_sock) => {
        if (!_sock) return false
        try {
          await delay(800)
          // Resolve JID yang benar dulu (support LID/linked device)
          let _jidQR = `${number}@s.whatsapp.net`
          try {
            const [_waResQR] = await _sock.onWhatsApp(`${number}@s.whatsapp.net`)
            if (_waResQR?.exists && _waResQR?.jid) _jidQR = _waResQR.jid
          } catch (_) {}
          await _sock.sendMessage(_jidQR, { text: msgDirectWelcome(number) })
          console.log(`[JADIBOT QR] ✅ Notif welcome terkirim ke +${number} via main bot (jid: ${_jidQR})`)
          return true
        } catch (e) {
          console.log(`[JADIBOT QR] ⚠️ Gagal kirim notif welcome ke +${number}: ${e?.message}`)
          return false
        }
      }

      if (connPairingModeQR === 'v2') {
        // V2: kirim welcome langsung ke nomor jadibot via main bot
        const _welcomeSockQR = getActiveMainSock(mainBotSock)
        const _sentQR = await _sendWelcomeDirectQR(_welcomeSockQR)

        // Fallback jika main bot gagal: kirim via socket jadibot sendiri
        if (!_sentQR) {
          try {
            await delay(300)
            await sendDirectJadibotNotice(sock, number, msgDirectWelcome(number))
            console.log(`[JADIBOT QR][V2][FALLBACK] ✅ Notif welcome via self-sock ke +${number}`)
          } catch {}
        }
      } else {
        // V1: kirim notif ke GC/owner
        try {
          await sendReply(msgConnected(number))
          console.log(`[JADIBOT QR][V1] ✅ Notif terhubung terkirim ke GC/owner`)
        } catch (e) {
          console.log(`[JADIBOT QR][V1] ⚠️ Gagal kirim notif terhubung ke GC: ${e?.message}`)
        }
        // V1: JUGA kirim langsung ke nomor jadibot via main bot
        const _welcomeSockV1QR = getActiveMainSock(mainBotSock)
        await _sendWelcomeDirectQR(_welcomeSockV1QR)
      }
    }

    /* ===== DISCONNECTED ===== */
    if (connection === 'close') {
      if (stoppingJadibot.has(number)) {
        stoppingJadibot.delete(number)
        jadibotMap.delete(number)
        stopJadibotAutoOnline(number)
        stopJadibotSwPrune(number)
        activeOrStartingJadibot.delete(number)
        const _C = '\x1b[36m', _R = '\x1b[0m', _B = '\x1b[1m';
        console.log(`${_C}╠══════════════════════════════════╣${_R}`);
        console.log(`${_C}║${_R} ⏹️  ${_B}+${number}${_R} STOPPED`);
        console.log(`${_C}╚══════════════════════════════════╝${_R}`);
        return
      }

      if (reason === DisconnectReason.loggedOut) {
        // Hitung sisa waktu SEBELUM dihapus, untuk ditampilkan di notif dan disimpan
        const _logoutMetaQR = getJadibotExpiry(number)
        let _savedRemainingLabelQR = ''
        if (_logoutMetaQR) {
          if (_logoutMetaQR.permanent === true) {
            _savedRemainingLabelQR = 'Permanent ♾️'
          } else {
            const _remQR = Number(_logoutMetaQR.expiresAt) - Date.now()
            if (_remQR > 0) _savedRemainingLabelQR = formatRemainingTime(_remQR)
          }
        }

        jadibotMap.delete(number)
        stopJadibotAutoOnline(number)
        stopJadibotSwPrune(number)
        activeOrStartingJadibot.delete(number)
        const _C = '\x1b[36m', _R2 = '\x1b[0m', _B2 = '\x1b[1m';
        console.log(`${_C}╠══════════════════════════════════╣${_R2}`);
        console.log(`${_C}║${_R2} 🚫 ${_B2}+${number}${_R2} LOGOUT PAKSA → sesi dihapus`);
        if (_savedRemainingLabelQR) console.log(`${_C}║${_R2} 💾 Sisa waktu tersimpan: ${_savedRemainingLabelQR}`);
        console.log(`${_C}╚══════════════════════════════════╝${_R2}`);

        // Beri tahu owner via react ❌ (realtime)
        try { if (reactFn) await reactFn('❌') } catch {}

        // Cek mode pairing untuk tentukan kemana notif logout dikirim
        const logoutCfgQR = loadConfig()
        const logoutModeQR = (logoutCfgQR.jadibotPairingMode || 'v2').toLowerCase()

        if (logoutModeQR === 'v2') {
          // V2: kirim notif langsung ke nomor tujuan via main bot
          const _logoutSockQR = getActiveMainSock(mainBotSock)
          if (_logoutSockQR) {
            try {
              await _logoutSockQR.sendMessage(`${number}@s.whatsapp.net`, {
                text: msgLoggedOutDirect(number, _savedRemainingLabelQR)
              })
              console.log(`[JADIBOT QR][V2] ✅ Notif logout terkirim ke +${number}`)
            } catch (e) {
              console.log(`[JADIBOT QR][V2] ⚠️ Gagal kirim notif logout ke +${number}: ${e?.message}`)
            }
          }
        } else {
          // V1: kirim notif ke GC/owner
          const remainingListQR = [...jadibotMap.keys()]
          try {
            await sendReply(msgLoggedOut(number, remainingListQR, _savedRemainingLabelQR))
            console.log(`[JADIBOT QR][V1] ✅ Notif logout terkirim ke GC/owner`)
          } catch (e) {
            console.log(`[JADIBOT QR][V1] ⚠️ Gagal kirim notif logout ke GC: ${e?.message}`)
          }
        }

        // BARU hapus sesi setelah notif terkirim, simpan sisa waktu terlebih dulu
        setTimeout(() => {
          if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true })
          }
          try { if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile) } catch {}
          saveLogoutRemainingMs(number) // ← simpan sisa waktu sebelum data expiry dihapus
          removeJadibotExpiry(number)
        }, 300)
        return
      }

      // Sama seperti versi pairing-code: jangan anggap "belum ada data expiry"
      // sebagai expired kalau memang belum pernah berhasil open sekalipun —
      // itu cuma disconnect biasa di tengah proses scan QR, bukan sesi expired.
      if (hasConnected && isJadibotExpired(number)) {
        await expireJadibot(number, sendReply)
        return
      }

      // Jika sudah pernah connect via QR, selalu coba reconnect
      // (creds.json mungkin belum tersimpan tepat waktu sebelum disconnect sesaat)
      if (hasConnected || isSessionValid(sessionDir)) {
        // Guard: cegah duplicate reconnect
        if (reconnectingJadibot.has(number)) {
          console.log(`[JADIBOT QR] ⚠️ ${number} sudah dalam proses reconnect, skip duplikat`)
          return
        }
        reconnectingJadibot.add(number)
        jadibotMap.delete(number)
        const _C = '\x1b[36m', _R = '\x1b[0m', _B = '\x1b[1m';
        console.log(`${_C}╠══════════════════════════════════╣${_R}`);
        console.log(`${_C}║${_R} 🔄 ${_B}+${number}${_R} DISCONNECTED → reconnecting...`);
        console.log(`${_C}╚══════════════════════════════════╝${_R}`);
        // Tutup socket lama DULU sebelum buat yang baru
        // agar WA tidak kick socket lama dengan alasan loggedOut
        // yang akan memicu penghapusan sesi secara salah
        try {
          sock.ev.removeAllListeners()
          if (sock.ws) sock.ws.close()
        } catch {}
        setTimeout(() => {
          reconnectingJadibot.delete(number)
          activeOrStartingJadibot.delete(number)
          startJadibotQR(number, sendReply, sendImage, mainBotNumber, hasConnected ? undefined : durationMs, getActiveMainSock(mainBotSock), null, requesterNumber)
        }, 3000)
        return
      }

      jadibotMap.delete(number)
      stopJadibotAutoOnline(number)
      stopJadibotSwPrune(number)
      activeOrStartingJadibot.delete(number)
      const _C = '\x1b[36m', _R = '\x1b[0m', _B = '\x1b[1m';
      console.log(`${_C}╠══════════════════════════════════╣${_R}`);
      console.log(`${_C}║${_R} ❌ ${_B}+${number}${_R} SESSION INVALID → tidak restart`);
      console.log(`${_C}╚══════════════════════════════════╝${_R}`);
    }
  })

  /* ================= ANTI CALL (QR) ================= */
  sock.ev.on('call', async calls => {
    for (const call of calls) {
      try {
        if (call.status !== 'offer') continue
        const jadibotNum = getJadibotNumber(sock)
        const isVideo = call.isVideo === true
        const setting = isVideo ? getJadibotAnticallvid(jadibotNum) : getJadibotAnticall(jadibotNum)
        if (!setting.enabled) continue
        const callerNumber = (call.from || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '')
        const whitelist = setting.whitelist || []
        const isWhitelisted = whitelist.some(n => {
          const c = n.replace(/[^0-9]/g, '')
          return callerNumber.includes(c) || c.includes(callerNumber)
        })
        if (isWhitelisted) {
          console.log(`[JADIBOT QR][${isVideo ? 'AntiCallVid' : 'AntiCall'}] +${jadibotNum} → ${callerNumber} WHITELISTED, skip`)
          continue
        }
        await sock.rejectCall(call.id, call.from)
        console.log(`[JADIBOT QR][${isVideo ? 'AntiCallVid' : 'AntiCall'}] +${jadibotNum} → Rejected ${isVideo ? 'video' : 'voice'} call from ${callerNumber}`)
        if (setting.message) {
          await new Promise(r => setTimeout(r, 1000))
          await sock.sendMessage(call.from, { text: setting.message })
        }
      } catch (err) {
        console.error(`[JADIBOT QR][AntiCall] Error:`, err.message)
      }
    }
  })

  /* ================= GROUPS CACHE (QR) ================= */
  sock.ev.on('groups.upsert', async groupsData => {
    try {
      for (const group of groupsData) {
        try {
          const existing = sock.groups.read(group.id) || {}
          sock.groups.write(group.id, { ...existing, ...group })
        } catch (_) {}
      }
    } catch (_) {}
  })
  sock.ev.on('groups.update', async groupsData => {
    try {
      for (const group of groupsData) {
        try {
          const existing = sock.groups.read(group.id) || {}
          sock.groups.write(group.id, { ...existing, ...group })
        } catch (_) {}
      }
    } catch (_) {}
  })

  const swSet = getJadibotSwSet(number)
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') {
      // type='append' = echo pesan yang dikirim jadibot sendiri
      // Tangkap khusus group story (fromMe=true) agar jadibot bisa react ke story GC miliknya sendiri
      if (type === 'append') {
        for (const msg of messages) {
          if (!msg.message || !msg.key?.fromMe) continue
          if (!isJidGroup(msg.key?.remoteJid)) continue
          const _chkGs = msg.message?.groupStatusMessageV2 || msg.message?.groupStatusMentionMessage || msg.message?.groupMentionedMessage
            || (msg.message && (() => { try { const vals = Object.values(msg.message); for (const v of vals) { if (v?.contextInfo?.isGroupStatus) return v; } } catch {} return null; })())
          if (!_chkGs) continue
          handleJadibotSW(msg, sock, swSet, number).catch(err =>
            console.error('[JADIBOT QR APPEND SW ERROR]', err?.message || String(err))
          )
        }
      }
      return
    }
    for (const msg of messages) {
      if (!msg.message) continue
      // Guard: jadibot (QR mode) sudah logout/disconnect → skip pesan di queue
      if (!jadibotMap.has(number)) continue
      // Blokir pesan yang dikirim oleh kode bot sendiri (ada di _botSentIds)
      // fromMe=true bisa juga dari WA user asli (multi-device) — jangan skip itu
      if (msg.key?.fromMe && sock._botSentIds?.has(msg.key?.id)) continue

      // Cache pesan + pre-download media untuk antidel
      if (msg.key?.id && !sock.cacheMsg.has(msg.key.id)) {
        sock.cacheMsg.set(msg.key.id, msg)
        setTimeout(() => sock.cacheMsg.delete(msg.key.id), 60000)
        preDownloadMediaForAntidel(msg, sock).catch(() => {})


      }

      // AutoRead SW — pakai Set terisolasi per-jadibot agar tidak bentrok dengan main bot / jadibot lain
      handleJadibotSW(msg, sock, swSet, number).catch(err =>
        console.error('[JADIBOT QR SW ERROR]', err?.message || String(err))
      )

      // Auto Typing / Auto Recording per pesan — terisolasi per-jadibot, data di data_jadibot
      try {
        const _atJid = msg.key?.remoteJid
        const _atIsGroup = _atJid?.endsWith('@g.us')
        const _atIsStatus = _atJid === 'status@broadcast'
        if (!_atIsStatus && _atJid && !msg.key?.fromMe) {
          const _atCfg = getJadibotAutoTyping(number)
          const _arCfg = getJadibotAutoRecording(number)
          const _doType = _atCfg.enabled && (_atIsGroup ? _atCfg.groupChat !== false : _atCfg.privateChat !== false)
          const _doRecord = !_doType && _arCfg.enabled && (_atIsGroup ? _arCfg.groupChat !== false : _arCfg.privateChat !== false)
          // Skip typing/recording saat stealth mode aktif — mencegah jadibot flash online sendiri
          if ((_doType || _doRecord) && !sock.__stealthMode) {
            const _presence = _doType ? 'composing' : 'recording'
            const _delaySec = _doType ? (_atCfg.delaySeconds || 5) : (_arCfg.delaySeconds || 5)
            const _delayMs  = Math.min(_delaySec * 1000, 30000)
            sock.__typingActive = (sock.__typingActive || 0) + 1
            safeSendPresenceUpdate(sock, _presence, _atJid)
            setTimeout(() => {
              safeSendPresenceUpdate(sock, 'paused', _atJid)
              sock.__typingActive = Math.max(0, (sock.__typingActive || 1) - 1)
            }, _delayMs)
          }
        }
      } catch {}

      // Auto Read Chat — private only, terisolasi per-jadibot
      try {
        const _rcJid = msg.key?.remoteJid
        const _rcIsPrivate = _rcJid && !_rcJid.endsWith('@g.us') && _rcJid !== 'status@broadcast'
        if (_rcIsPrivate && !msg.key?.fromMe) {
          if (getJadibotReadchat(number)?.enabled) {
            sock.readMessages([msg.key]).catch(() => {})
          }
        }
      } catch {}

      try {
        await getHandler('message')({ message: msg, type: 'notify' }, sock)
      } catch (err) {
        console.error('[JADIBOT QR MESSAGE ERROR]', err)
      }
    }
  })

  sock.ev.on('messages.update', updates => {
    for (const update of updates) {
      Promise.resolve(
        getHandler('antidelete')(update, sock)
      ).catch(err => console.error(`[JADIBOT QR][AntiDelete] ${number}:`, err.message))
    }
  })
}

/* ================= STOP JADIBOT ================= */
async function stopJadibot(number, sendReply) {
  number = number.replace(/[^0-9]/g, '')
  const sock = jadibotMap.get(number)
  const sessionDir = path.join(process.cwd(), 'jadibot', number)
  const sessionFile = sessionDir + '.json'

  if (!sock) {
    const hadData = fs.existsSync(sessionDir) || fs.existsSync(sessionFile) || !!getJadibotExpiry(number)
    jadibotMap.delete(number)
    pairingRequested.delete(number)
    reconnectingJadibot.delete(number)
    activeOrStartingJadibot.delete(number)
    if (pairingTimeout.has(number)) {
      clearTimeout(pairingTimeout.get(number))
      pairingTimeout.delete(number)
    }
    // Tutup socket yang mungkin masih dalam proses pairing di background
    const stuckSock = startingSocketMap.get(number)
    if (stuckSock) {
      try {
        stuckSock.ev.removeAllListeners()
        if (stuckSock.ws) stuckSock.ws.close()
      } catch {}
      startingSocketMap.delete(number)
    }
    removeJadibotExpiry(number)
    try {
      if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true })
    } catch {}
    try { if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile) } catch {}
    return await sendReply(
      hadData
        ? (
          `╔══════════════════════╗\n` +
          `║  🛑  *JADIBOT STOP*  ║\n` +
          `╚══════════════════════╝\n\n` +
          `✅ Data jadibot *${maskNumber(number)}* berhasil dibersihkan.\n` +
          `📴 Status sebelumnya tidak aktif/terputus.\n` +
          `🗑️ Sesi lama sudah dihapus.`
        )
        : (
          `╔══════════════════════╗\n` +
          `║   ❌  *GAGAL STOP*   ║\n` +
          `╚══════════════════════╝\n\n` +
          `Jadibot *${maskNumber(number)}* tidak aktif atau sudah dihentikan.`
        )
    )
  }

  stoppingJadibot.add(number)

  try {
    sock.ev.removeAllListeners()
    if (sock.ws) sock.ws.close()
  } catch {}

  jadibotMap.delete(number)
  stoppingJadibot.delete(number)
  activeOrStartingJadibot.delete(number)
  pairingRequested.delete(number)
  jadibotSwSets.delete(number)
  jadibotTrackers.delete(number)
  if (jadibotCleanerTimers.has(number)) {
    clearInterval(jadibotCleanerTimers.get(number))
    jadibotCleanerTimers.delete(number)
  }
  stopJadibotAutoOnline(number)
  stopJadibotSwPrune(number)
  if (pairingTimeout.has(number)) {
    clearTimeout(pairingTimeout.get(number))
    pairingTimeout.delete(number)
  }
  startingSocketMap.delete(number)

  setTimeout(() => {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true })
    }
    try { if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile) } catch {}
    removeJadibotExpiry(number)
  }, 500)

  await sendReply(
    `╔══════════════════════╗\n` +
    `║  🛑  *JADIBOT STOP*  ║\n` +
    `╚══════════════════════╝\n\n` +
    `✅ Jadibot *${maskNumber(number)}* berhasil dihentikan.\n` +
    `🗑️ Sesi telah dihapus.\n\n` +
    `💡 Ketik *.jadibot ${number}* untuk aktifkan kembali.`
  )
}

/* ================= PAUSE / RESUME TIMER ================= */

function pauseAllJadibotTimers() {
  const data = loadJadibotRealtimeData()
  const now = Date.now()
  let changed = false
  for (const [number, meta] of Object.entries(data.bots)) {
    if (meta.isPaused) continue
    if (meta.permanent === true) continue
    const remaining = Number(meta.expiresAt) - now
    if (remaining <= 0) continue
    data.bots[number] = {
      ...meta,
      isPaused: true,
      pausedAt: now,
      pausedRemainingMs: remaining,
    }
    changed = true
  }
  if (changed) saveJadibotRealtimeData(data)
  return changed
}

function resumeAllJadibotTimers() {
  const data = loadJadibotRealtimeData()
  const now = Date.now()
  let changed = false
  for (const [number, meta] of Object.entries(data.bots)) {
    if (meta.permanent === true) continue
    if (!meta.isPaused) continue
    const remaining = Number(meta.pausedRemainingMs) || 0
    if (remaining <= 0) {
      delete data.bots[number]
      changed = true
      continue
    }
    data.bots[number] = {
      ...meta,
      expiresAt: now + remaining,
      isPaused: false,
      pausedAt: undefined,
      pausedRemainingMs: undefined,
      updatedAt: now,
    }
    changed = true
  }
  if (changed) saveJadibotRealtimeData(data)
  return changed
}

/* ================= EXPORT ================= */
export {
  startJadibot,
  startJadibotQR,
  stopJadibot,
  jadibotMap,
  jadibotClearSesiMap,
  jadibotSesiReportMap,
  jadibotConnectedAt,
  activeOrStartingJadibot,
  pendingJadibotChoices,
  formatPairingCode,
  maskNumber,
  parseJadibotDuration,
  getJadibotExpiry,
  formatRemainingTime,
  formatJadibotExpiryTime,
  getJadibotExpirySummary,
  cleanupExpiredJadibots,
  purgeExpiredJadibotSessions,
  removeJadibotExpiry,
  setPermanentJadibot,
  ensureJadibotExpiry,
  extendJadibotExpiry,
  reduceJadibotExpiry,
  updateJadibotExpiryStatus,
  scheduleJadibotExpiry,
  pauseAllJadibotTimers,
  resumeAllJadibotTimers,
  restoreConnectedAtMap,
  reconnectingJadibot,
  startingSocketMap,
  saveLogoutRemainingMs,
  getLogoutSavedMs,
  clearLogoutSavedMs,
  drainPendingExpireNotifs
}