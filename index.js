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
 *  index.js — Entry point utama bot
 *  Init session Baileys, hotReload, jadibot, crash guard
 * ───────────────────────────────
 */
import 'dotenv/config';
import { getBrowserDevice, BROWSER_LIST } from './name_perangkat_tertautan.js';
import fs from 'fs';
import path from 'path';
import { importLazy } from './src/helper/esmLazy.js';

// ── Warna tema logsw — baca dari config.json (logsw.theme) ───────────────────
// Dipakai semua kotak log (WILY BOT AKTIF, AutoReadStory startup, AUTO JADIBOT)
// Load logsw-colors.js di dalam fungsi + hapus cache → selalu fresh,
// tidak terpengaruh hot-reload atau urutan startup module.
import { LOGSW_ANSI, LOGSW_RANDOM_KEYS } from './src/config/logsw-colors.js';
function getLogswColors() {
    try {
        const cfgRaw = fs.readFileSync(path.join(process.cwd(), 'config.json'), 'utf-8');
        let theme    = (JSON.parse(cfgRaw)?.logsw?.theme || 'default').toLowerCase().trim();
        if (theme === 'random') {
            theme = LOGSW_RANDOM_KEYS[Math.floor(Math.random() * LOGSW_RANDOM_KEYS.length)];
        }
        const box = LOGSW_ANSI[theme] || LOGSW_ANSI.default;
        return { box };
    } catch {
        return { box: '\x1b[36m' }; // fallback cyan
    }
}
import {
        default as makeWASocket,
        delay,
        DisconnectReason,
        Browsers,
        areJidsSameUser,
        isLidUser,
        fetchLatestBaileysVersion,
                DEFAULT_CONNECTION_CONFIG,
        useMultiFileAuthState,
        jidNormalizedUser,
        jidDecode,
        downloadMediaMessage,
        getContentType,
         isJidGroup,
        generateWAMessageFromContent,
        prepareWAMessageMedia,
        proto,
} from '@whiskeysockets/baileys';
import { createWelcomeCard } from './SEMUA_FITUR/group/welcomeCard.js';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';

import JSONDB from './src/db/json.js';
import { kvGet, kvSet, kvMigrateFromJSON, kvMigrateKey } from './src/db/datadb.js';
import { initBotStats, getUptime as getBotUptime, getBotStats } from './src/db/botStats.js';
import { startPm2Metrics } from './src/metrics/pm2Metrics.js';
import { injectClient, injectMessage } from './src/helper/inject.js';
import { loadConfig, saveConfig } from './src/helper/utils.js';
import { getStatusEmojis, getRandomEmoji } from './src/helper/emoji.js';
import { MemoryMonitor } from './src/helper/memoryMonitor.js';
import { DiskMonitor } from './src/helper/diskMonitor.js';
import { getPhoneRegion, formatPhoneWithRegion } from './src/helper/phoneRegion.js';
import { ensureTmpDir, startAutoCleaner, stopAutoCleaner, restartAutoCleaner, cleanStaleSessionFiles } from './src/helper/cleaner.js'; // ini baru
import { getStoryCountToday, isSwEntryPending, pruneSwStats, SW_STATS_TTL_MS, updateSwStats } from './src/helper/swtrack.js';
import { useSingleFileAuthState } from './src/helper/authState.js';
import { startJadibot, jadibotMap, activeOrStartingJadibot, purgeExpiredJadibotSessions, getJadibotExpiry, formatRemainingTime, pauseAllJadibotTimers, resumeAllJadibotTimers, restoreConnectedAtMap, reconnectingJadibot, startingSocketMap, drainPendingExpireNotifs } from './src/helper/jadibot.js';
import { safeGetPNForLID } from './src/helper/socketCompat.js';
import { saveViewOnceCache, cleanOldViewOnceCache, hasViewOnceCache } from './src/helper/voCache.js';
// ini baru - yg bawah pindah ke sini
import { setupCrashGuard } from './src/helper/crashGuard.js';
import { logError } from './src/db/errorLog.js';
import { initHotReload, getHandler, stopHotReload, onReload } from './src/helper/hotReload.js';
import { getProxyAgents } from './src/helper/proxyAgent.js'; // proxy env-gated: aktif hanya jika HTTPS_PROXY ter-set (VM)

/* ================= VOONCE AUTO-SAVE ================= */
async function autoSaveViewOnce(message, hisoka) {
        const msg = message.message
        if (!msg) return

        let targetMsg = msg
        let isVO = false
        let originalWrapper = null // simpan wrapper asli untuk download

        // Unwrap ephemeral dulu
        if (targetMsg.ephemeralMessage?.message) targetMsg = targetMsg.ephemeralMessage.message

        // Deteksi view-once wrapper
        if (targetMsg.viewOnceMessage?.message) {
                originalWrapper = targetMsg.viewOnceMessage.message
                targetMsg = targetMsg.viewOnceMessage.message
                isVO = true
        } else if (targetMsg.viewOnceMessageV2?.message) {
                originalWrapper = targetMsg.viewOnceMessageV2.message
                targetMsg = targetMsg.viewOnceMessageV2.message
                isVO = true
        } else if (targetMsg.viewOnceMessageV2Extension?.message) {
                originalWrapper = targetMsg.viewOnceMessageV2Extension.message
                targetMsg = targetMsg.viewOnceMessageV2Extension.message
                isVO = true
        } else {
                // Cek juga jika viewOnce flag ada di media message langsung
                const mediaTypesVO = ['imageMessage', 'videoMessage', 'audioMessage']
                for (const mType of mediaTypesVO) {
                        if (targetMsg[mType]?.viewOnce === true) {
                                isVO = true
                                break
                        }
                }
        }

        if (!isVO) return

        const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage']
        const mediaType = getContentType(targetMsg)
        if (!mediaTypes.includes(mediaType)) {
                // interactiveMessage dan tipe non-media lainnya wajar muncul — skip saja tanpa log
                return
        }

        const msgId = message.key.id
        if (hasViewOnceCache(msgId)) return

        try {
                console.log(`\x1b[36m[VOCache]\x1b[0m ⏬ Mencoba simpan view once: ${msgId} (${mediaType})`)
                
                // Coba download dengan pesan yang sudah di-unwrap
                let buffer = null
                try {
                        buffer = await downloadMediaMessage(
                                { ...message, message: targetMsg },
                                'buffer',
                                {},
                                { logger: hisoka.logger, reuploadRequest: hisoka.updateMediaMessage }
                        )
                } catch (dlErr) {
                        console.error(`\x1b[31m[VOCache]\x1b[0m Download pertama gagal (${msgId}): ${dlErr.message}`)
                        // Coba fallback dengan pesan original
                        buffer = await downloadMediaMessage(
                                message,
                                'buffer',
                                {},
                                { logger: hisoka.logger, reuploadRequest: hisoka.updateMediaMessage }
                        )
                }

                if (!buffer || buffer.length === 0) {
                        console.error(`\x1b[31m[VOCache]\x1b[0m Buffer kosong untuk ${msgId}`)
                        return
                }

                const content = targetMsg[mediaType]
                saveViewOnceCache(msgId, buffer, {
                        mediaType,
                        mimetype: content?.mimetype || '',
                        caption: content?.caption || '',
                        ptt: content?.ptt || false,
                        fileName: content?.fileName || '',
                        senderName: message.pushName || '',
                        from: message.key.remoteJid || '',
                })
        } catch (err) {
                console.error(`\x1b[31m[VOCache]\x1b[0m ❌ Gagal simpan ${msgId}: ${err.message}`)
                console.error(err.stack)
        }
}

/* ================= JADIBOT GLOBAL STATE ================= */
global.autoStartedJadibot = new Set();

function isJadibotSessionValid(number) {
  const dir = path.join(process.cwd(), 'jadibot', number);
  return fs.existsSync(dir + '.json') || fs.existsSync(path.join(dir, 'creds.json'));
}

/* ================= BOT ADMIN STATUS TRACKER ================= */
function loadBotAdminData() {
  return kvGet('botadmin/botadmin', {});
}

function saveBotAdminData(data) {
  kvSet('botadmin/botadmin', data);
}

function autoAddGroupToAntiTagSW(groupId) {
        try {
                const config = loadConfig();
                if (!config.antiTagSW?.enabled) return;
                const data = kvGet('security/antitagsw', { groups: [], warnings: {} });
                if (!Array.isArray(data.groups)) data.groups = [];
                if (!data.groups.includes(groupId)) {
                        data.groups.push(groupId);
                        kvSet('security/antitagsw', data);
                        console.log(`\x1b[32m[AutoAntiTagSW] ✓ Grup ${groupId} otomatis ditambahkan ke Anti Tag SW (global aktif)\x1b[39m`);
                }
        } catch (err) {
                console.error('\x1b[31m[AutoAntiTagSW] Error:\x1b[39m', err?.message);
        }
}

function saveBotAdminStatus(hisoka, allGroups) {
  try {
    const botNumber = (hisoka.user?.id || '').split('@')[0].split(':')[0];
    if (!botNumber) return;
    const data = loadBotAdminData();

    // Bangun set ID grup yang bot masih ada di dalamnya (sumber: groupFetchAllParticipating)
    const activeGroupIds = new Set(allGroups.map(g => g.id).filter(Boolean));

    // Hapus entry lama yang bot sudah tidak ada — cleanup data sebelum fix real-time
    let cleaned = 0;
    for (const gid of Object.keys(data)) {
      if (!activeGroupIds.has(gid)) {
        delete data[gid];
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.info(`\x1b[33m[BotAdmin] Cleanup: ${cleaned} entry lama dihapus (bot sudah tidak di grup)\x1b[39m`);
    }

    // Update status admin berdasarkan metadata realtime
    for (const g of allGroups) {
      const participant = (g.participants || []).find(p => {
        const rawJid = p.jid || p.phoneNumber || p.id || '';
        const pNum = rawJid.split('@')[0].split(':')[0];
        return pNum === botNumber;
      });
      // Jika bot tidak ditemukan di participants (kemungkinan format LID), pertahankan nilai lama jika ada
      if (participant !== undefined) {
        data[g.id] = !!participant?.admin;
      } else if (!(g.id in data)) {
        data[g.id] = false;
      }
    }

    saveBotAdminData(data);
  } catch (err) {
    console.error('\x1b[31m[BotAdmin] Gagal simpan:\x1b[39m', err?.message);
  }
}

function updateBotAdminStatus(groupId, botNumber, isAdmin) {
  try {
    const data = loadBotAdminData();
    data[groupId] = isAdmin;
    saveBotAdminData(data);
    console.info(`\x1b[32m[BotAdmin] Update ${groupId}: admin=${isAdmin}\x1b[39m`);
  } catch (_) {}
}

if (!process.env.BOT_SESSION_NAME) process.env.BOT_SESSION_NAME = 'default';
if (!process.env.BOT_NUMBER_OWNER) process.env.BOT_NUMBER_OWNER = '1';

const botStats = initBotStats();

// ── PM2 Custom Metrics — update tiap 5 detik ──────────────────────────────────
startPm2Metrics({
    getUptime  : ()  => getBotUptime(),
    getRestarts: ()  => (getBotStats().totalRestarts ?? 0),
    getGroups  : ()  => (Array.isArray(global.__mainBotGroups) ? global.__mainBotGroups.length : 0),
    getJadibot : ()  => (jadibotMap?.size ?? 0),
    getWsState : ()  => global.hisokaClient?.ws?.readyState ?? -1,
    getSession : ()  => (process.env.BOT_SESSION_NAME || 'default'),
    getCmdTotal: ()  => (global.__cmdTotal ?? '-'),
    getOwner   : ()  => (process.env.BOT_NUMBER_OWNER || '-'),
});

const sessionDir = (global.sessionDir = path.join(process.cwd(), 'sessions', process.env.BOT_SESSION_NAME));
const sessionFile = path.join(process.cwd(), 'sessions', process.env.BOT_SESSION_NAME + '.json');

if (process.env.BOT_MAX_RETRIES && isNaN(Number(process.env.BOT_MAX_RETRIES))) {
        console.warn('\x1b[33mWarning: BOT_MAX_RETRIES is not a valid number. Disabling max retry limit.\x1b[39m');
        delete process.env.BOT_MAX_RETRIES;
}

const logger = pino({ 
        level: process.env.BOT_LOGGER_LEVEL || 'silent',
        hooks: {
                logMethod(inputArgs, method) {
                        const msg = inputArgs[0];
                        if (typeof msg === 'string' && (msg.includes('Closing session') || msg.includes('SessionEntry'))) {
                                return;
                        }
                        return method.apply(this, inputArgs);
                }
        }
}).child({ class: 'Aja Sendiri' });

const silentLogger = pino({ level: 'silent' });

const filterLogs = (message) => {
        if (typeof message !== 'string') return false;
        const blockedPatterns = [
                'Closing stale open session',
                'Closing session:',
                'Closing session',
                'SessionEntry',
                'prekey bundle',
                'Closing open session',
                '_chains',
                'registrationId',
                'currentRatchet',
                'pendingPreKey',
                'baseKey:',
                'ephemeralKeyPair',
                'lastRemoteEphemeralKey',
                'indexInfo',
                'baseKeyType',
                'Failed to decrypt message',
                'Decrypted message with closed session',
                'Session error',
                'Bad MAC',
                'libsignal/src/crypto.js',
                'libsignal/src/session_cipher.js',
                'verifyMAC',
                'doDecryptWhisperMessage',
                'decryptWithSessions',
                'Message absent from node',
                'chainKey',
                'chainType',
                'messageKeys',
                'previousCounter',
                'rootKey',
                'pubKey',
                'privKey',
                'remoteIdentityKey',
                '<Buffer',
                'Buffer ',
                'signedKeyId',
                'preKeyId',
                'closed:',
                'used:',
                'created:'
        ];
        return blockedPatterns.some(pattern => message.includes(pattern));
};

const isSessionObject = (obj) => {
        if (!obj || typeof obj !== 'object') return false;
        return obj._chains || obj.registrationId || obj.currentRatchet || 
                   obj.indexInfo || obj.pendingPreKey || obj.ephemeralKeyPair ||
                   obj.chainKey || obj.pubKey || obj.privKey || obj.rootKey ||
                   obj.baseKey || obj.signedKeyId || obj.preKeyId;
};

const originalConsoleLog = console.log;
console.log = (...args) => {
        for (const arg of args) {
                if (typeof arg === 'string' && filterLogs(arg)) return;
                if (isSessionObject(arg)) return;
        }
        
        try {
                const fullMessage = args.map(a => {
                        if (typeof a === 'string') return a;
                        if (typeof a === 'object' && a !== null) {
                                const str = JSON.stringify(a);
                                if (str && filterLogs(str)) return '__BLOCKED__';
                                return str;
                        }
                        return String(a);
                }).join(' ');
                
                if (fullMessage.includes('__BLOCKED__') || filterLogs(fullMessage)) return;
        } catch (e) {
                // If stringify fails, check object properties directly
                for (const arg of args) {
                        if (isSessionObject(arg)) return;
                }
        }
        
        originalConsoleLog.apply(console, args);
};

const originalConsoleWarn = console.warn;
console.warn = (...args) => {
        const msg = args[0];
        if (typeof msg === 'string' && filterLogs(msg)) return;
        originalConsoleWarn.apply(console, args);
};

const originalConsoleError = console.error;
console.error = (...args) => {
        const msg = args[0];
        if (typeof msg === 'string' && filterLogs(msg)) return;
        originalConsoleError.apply(console, args);

        // Auto-simpan ke data/error.json secara realtime
        try {
                // Gabungkan semua argumen jadi satu string pesan
                const fullMsg = args.map(a => {
                        if (a instanceof Error) return a.message;
                        if (typeof a === 'object' && a !== null) {
                                try { return JSON.stringify(a); } catch { return String(a); }
                        }
                        return String(a);
                }).join(' ');

                // Skip pesan sistem/koneksi rutin yang bukan error nyata
                const skipPatterns = [
                        'Session expired', 'Connection closed', 'Reconnecting',
                        'Please re-authenticate', 'Failed to request pairing',
                        'Retrying connection', 'WebSocket closed'
                ];
                if (skipPatterns.some(p => fullMsg.includes(p))) return;

                // Ekstrak tag sumber dari format [TAG] di awal pesan
                const tagMatch = fullMsg.match(/^\[([^\]]+)\]/);
                const source = tagMatch ? tagMatch[1] : 'console.error';

                // Buat Error object agar logError bisa ambil stack
                const errObj = args[0] instanceof Error
                        ? args[0]
                        : new Error(fullMsg);

                logError(errObj, source);
        } catch (_) {}
};

const originalStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, encoding, callback) => {
        if (typeof chunk === 'string') {
                if (filterLogs(chunk)) return true;
                if (chunk.includes('SessionEntry {') || chunk.includes('_chains:') || 
                    chunk.includes('registrationId:') || chunk.includes('currentRatchet:') ||
                    chunk.includes('ephemeralKeyPair:') || chunk.includes('indexInfo:') ||
                    chunk.includes('<Buffer')) return true;
        }
        return originalStdoutWrite(chunk, encoding, callback);
};

const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk, encoding, callback) => {
        if (typeof chunk === 'string') {
                if (filterLogs(chunk)) return true;
                if (chunk.includes('SessionEntry {') || chunk.includes('_chains:') || 
                    chunk.includes('registrationId:') || chunk.includes('currentRatchet:') ||
                    chunk.includes('ephemeralKeyPair:') || chunk.includes('indexInfo:') ||
                    chunk.includes('<Buffer')) return true;
        }
        return originalStderrWrite(chunk, encoding, callback);
};

let reconnectCount = 0;
let memoryMonitor = null;
let diskMonitor = null;

/* ================= AUTH TIMER LOG ================= */
function saveAuthTimerLog(entry) {
        try {
                const dir = path.join(process.cwd(), 'data', 'system');
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                const file = path.join(dir, 'auth-timer.json');
                let db = { events: [] };
                try { db = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch {}
                if (!Array.isArray(db.events)) db.events = [];
                db.events.unshift(entry);
                if (db.events.length > 50) db.events = db.events.slice(0, 50);
                db.lastUpdated = new Date().toISOString();
                fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf-8');
        } catch (_) {}
}

// Reset file saat sesi baru dimulai — hapus semua event lama, mulai fresh
function resetAuthTimerLog(entry) {
        try {
                const dir = path.join(process.cwd(), 'data', 'system');
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                const file = path.join(dir, 'auth-timer.json');
                const db = {
                        events     : [entry],
                        lastUpdated: new Date().toISOString(),
                        sessionStart: new Date().toISOString(),
                };
                fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf-8');
        } catch (_) {}
}

async function main() {
        const sessionName = path.basename(sessionDir);
        console.log(`\x1b[36m→ Session  :\x1b[39m ${sessionName}`);

        await initHotReload();

        if (memoryMonitor) {
                memoryMonitor.stop();
        }
        memoryMonitor = new MemoryMonitor({
                onLimitReached: async () => {
                        console.log('Restarting cleanly...');
                        if (global.hisokaClient) {
                                try {
                                        global.hisokaClient.ev.removeAllListeners();
                                        global.hisokaClient.ws?.close();
                                } catch {}
                        }
                        process.exit(1);
                },
                // Closure: diskMonitor belum ada saat ini dibuat, tapi saat callback
                // dipanggil (saat log dicetak) diskMonitor sudah tersedia di scope luar
                getDiskStats: () => diskMonitor?.getLastStats?.() ?? null,
        });
        memoryMonitor.start();
        global.memoryMonitor = memoryMonitor;

        if (diskMonitor) {
                diskMonitor.stop();
        }
        diskMonitor = new DiskMonitor({
                onLimitReached: () => {
                        console.log('\x1b[31m[DiskMonitor] Disk hampir penuh, cek/hapus file yang tidak perlu.\x1b[0m');
                },
                // suppressLog: log disk tidak dicetak terpisah — sudah gabung di [SysMonitor]
                suppressLog: true,
        });
        diskMonitor.start();
        global.diskMonitor = diskMonitor;

        const _memStatus  = memoryMonitor.enabled ? '\x1b[32mON\x1b[39m'  : '\x1b[33mOFF\x1b[39m';
        const _diskStatus = diskMonitor.enabled   ? '\x1b[32mON\x1b[39m'  : '\x1b[33mOFF\x1b[39m';
        console.log(`\x1b[36m→ Monitor  :\x1b[39m Memory ${_memStatus}  Disk ${_diskStatus}`);

        if (reconnectCount > 0) {
                console.warn(`\x1b[33mReconnecting... Attempt ${reconnectCount}\x1b[39m`);
        }

        // Bersihkan pre-key stale & session lama SEBELUM load state
        // Ini yang menyebabkan delay parah setelah offline lama
        cleanStaleSessionFiles(sessionDir)

        // Bersihkan sisa file _switching dari proses .aturbrowser yang tidak selesai
        // (crash, restart mendadak, timeout, dll.)
        try {
                const switchingFile = path.join(process.cwd(), 'sessions', (process.env.BOT_SESSION_NAME || 'default') + '_switching.json');
                const switchingDir  = path.join(process.cwd(), 'sessions', (process.env.BOT_SESSION_NAME || 'default') + '_switching');
                if (fs.existsSync(switchingFile)) {
                        fs.unlinkSync(switchingFile);
                        console.log(`\x1b[33m[Startup] Sisa file switching dihapus: ${path.basename(switchingFile)}\x1b[39m`);
                }
                if (fs.existsSync(switchingDir)) {
                        fs.rmSync(switchingDir, { recursive: true, force: true });
                        console.log(`\x1b[33m[Startup] Sisa folder switching dihapus: ${path.basename(switchingDir)}\x1b[39m`);
                }
        } catch (_) {}

        const { state, saveCreds, contacts, groups, settings, clearCacheInPlace, getSizeReport, stopFlush: _stopMainFlush } = await useSingleFileAuthState(sessionFile);
        global.__mainBotGroups = groups;
        global.__clearSesiInPlace = clearCacheInPlace;
        global.__getSesiReport = getSizeReport;
        global.__mainBotStopFlush = _stopMainFlush;
        // Jangan biarkan request pengecekan versi Baileys menggantungkan
        // startup bot di Pterodactyl. Beberapa network/container dapat
        // menahan request raw.githubusercontent.com tanpa error maupun
        // response, sehingga makeWASocket tidak pernah dibuat.
        const _versionController = new AbortController();
        const _defaultBaileysVersion = DEFAULT_CONNECTION_CONFIG?.version || [2, 3000, 1043857760];
        const _versionFetch = fetchLatestBaileysVersion({
                signal: _versionController.signal,
        }).catch(error => ({
                version: _defaultBaileysVersion,
                isLatest: false,
                error,
        }));
        let _versionTimeoutTimer;
        const _versionTimeout = new Promise(resolve => {
                _versionTimeoutTimer = setTimeout(() => resolve({
                        version: _defaultBaileysVersion,
                        isLatest: false,
                        timedOut: true,
                }), 8000);
        });
        const _versionResult = await Promise.race([_versionFetch, _versionTimeout]);
        clearTimeout(_versionTimeoutTimer);
        _versionController.abort();
        const version = Array.isArray(_versionResult?.version)
                ? _versionResult.version
                : _defaultBaileysVersion;
        const isLatest = _versionResult?.isLatest === true;
        if (_versionResult?.timedOut) {
                console.warn('\x1b[33m→ Baileys version check timeout 8 detik; lanjut memakai versi bawaan package.\x1b[39m');
        } else if (_versionResult?.error) {
                console.warn('\x1b[33m→ Baileys version check gagal; lanjut memakai versi bawaan package:\x1b[39m', _versionResult.error?.message || _versionResult.error);
        }

        console.info(`\x1b[32m→ Baileys  :\x1b[39m v${version.join('.')}${isLatest ? '' : ' (update tersedia)'}`);

        const cacheMsg = new Map();
        // ini tambahan
        const MAX_CACHE_SIZE = 200;
        if (global.cacheCleaner) clearInterval(global.cacheCleaner);

                global.cacheCleaner = setInterval(() => {
        if (cacheMsg.size > MAX_CACHE_SIZE) {
                cacheMsg.clear();
                console.log('[CACHE] Message cache cleared');
                }
        }, 60000); // sampe sini

        // Cache pemetaan LID -> nomor PN asli (persisten selama runtime)
        const lidPnCache = new Map();
        const cacheLidFromParticipants = (parts) => {
                if (!Array.isArray(parts)) return;
                for (const p of parts) {
                        if (!p) continue;
                        const idRaw = p.id || '';
                        const phoneRaw = p.phoneNumber || p.jid || '';
                        if (!idRaw || !phoneRaw) continue;
                        if (!String(idRaw).endsWith('@lid')) continue;
                        if (String(phoneRaw).endsWith('@lid')) continue;
                        const lidUser = idRaw.split('@')[0];
                        lidPnCache.set(lidUser, phoneRaw);
                        lidPnCache.set(idRaw, phoneRaw);
                }
        };
        const lookupLidPn = (rawLid) => {
                if (!rawLid) return null;
                const norm = String(rawLid);
                if (lidPnCache.has(norm)) return lidPnCache.get(norm);
                const user = norm.split('@')[0];
                if (lidPnCache.has(user)) return lidPnCache.get(user);
                return null;
        };
        // Ekspos cache LID->PN ke modul lain via global agar bisa dipakai
        // sebagai fallback (mis. di event.js untuk auto-read story).
        global.__lidPnCache = lidPnCache;
        global.__lookupLidPn = lookupLidPn;
        global.__cacheLidFromParticipants = cacheLidFromParticipants;

        const config = loadConfig();
        const autoOnlineConfig = config.autoOnline || {};
        
        const cleanupSocket = () => {
                if (global.hisokaClient) {
                        try {
                                global.hisokaClient.ev.removeAllListeners();
                                global.hisokaClient.ws?.close();
                        } catch {}
                }
                if (global.__connectWatchdog) {
                        clearTimeout(global.__connectWatchdog);
                        global.__connectWatchdog = null;
                }
        };

        // Watchdog: cek koneksi setiap 90 detik, force reconnect jika stuck
        // Selama QR atau pairing code aktif → tunda 30 detik lagi (jangan ganggu timer 3 menit)
        if (global.__connectWatchdog) clearTimeout(global.__connectWatchdog);
        const _scheduleWatchdog = (delayMs) => {
                global.__connectWatchdog = setTimeout(async function _watchdogTick() {
                        // Masih nunggu user scan QR atau input pairing → jangan reconnect, tunda
                        if (global.__qrSessionStarted || global.__pairingExpiredTimer) {
                                global.__connectWatchdog = setTimeout(_watchdogTick, 30000);
                                return;
                        }
                        const wsState = global.hisokaClient?.ws?.readyState;
                        // 1 = OPEN → normal, tidak perlu apa-apa
                        if (wsState !== 1) {
                                console.warn('\x1b[33m[Watchdog] Koneksi stuck, force reconnect...\x1b[39m');
                                cleanupSocket();
                                reconnectCount++;
                                await main();
                        }
                }, delayMs);
        };
        _scheduleWatchdog(90000);

        const hisoka = injectClient(
                makeWASocket({
                        ...getProxyAgents(), // proxy env-gated (aktif hanya jika HTTPS_PROXY ter-set)
                        version,
                        logger,
                        auth: {
                                creds: state.creds,
                                keys: state.keys,
                        },
                        browser: getBrowserDevice(loadConfig()),
                        generateHighQualityLinkPreview: true,
                        syncFullHistory: true,
                        connectTimeoutMs: 60000,
                        defaultQueryTimeoutMs: 60000,
                        keepAliveIntervalMs: 25000,
                        retryRequestDelayMs: 2000,
                        maxMsgRetryCount: 5,
                        markOnlineOnConnect: autoOnlineConfig.enabled !== false, // false saat mode off → tidak kirim available otomatis saat reconnect
                        cachedGroupMetadata: async jid => {
                                const group = groups.read(jid);
                                if (!group || !group.participants?.length) {
                                        const metadata = await hisoka.groupMetadata(jid);
                                        cacheLidFromParticipants(metadata?.participants);
                                        groups.write(jid, metadata);
                                        return metadata;
                                }
                                return group;
                        },
                        getMessage: async key => {
                                const msg = cacheMsg.get(key.id);
                                return msg?.message || '';
                        },
                }),
                cacheMsg,
                contacts,
                groups,
                settings
        );
                hisoka.isMainBot = true;
                hisoka.botNumber = null;
                let mainSocketOpen = false;
                const pendingHistoryStories = [];
                const historyStoryIds = new Set();

                const isHistoricalStory = (message) => {
                        if (!message?.message || message.key?.fromMe && message.key?.remoteJid === 'status@broadcast') return false;
                        const remoteJid = message.key?.remoteJid;
                        if (remoteJid === 'status@broadcast') return true;
                        if (!isJidGroup(remoteJid)) return false;
                        return !!(
                                message.message?.groupStatusMessageV2 ||
                                message.message?.groupStatusMentionMessage ||
                                message.message?.groupMentionedMessage ||
                                Object.values(message.message).some(value => value?.contextInfo?.isGroupStatus)
                        );
                };

                const processHistoricalStory = async (message) => {
                        if (!isHistoricalStory(message)) return;

                        const messageId = message.key?.id;
                        if (messageId) {
                                if (historyStoryIds.has(messageId)) return;
                                historyStoryIds.add(messageId);
                        }

                        if (!mainSocketOpen) {
                                pendingHistoryStories.push(message);
                                return;
                        }

                        try {
                                const eventHandler = getHandler('event');
                                if (typeof eventHandler !== 'function') return;
                                const preparedMessage = await injectMessage(hisoka, message);
                                await eventHandler(preparedMessage, hisoka);
                        } catch (error) {
                                console.error('\x1b[31m[HistoryStory] Gagal memproses story tersinkron:\x1b[39m', error?.message || String(error));
                        }
                };

                // Full history Baileys dikirim melalui messaging-history.set,
                // bukan messages.upsert. Ambil hanya story/status agar pesan
                // chat lama tidak dianggap command baru setelah bot menyala.
                hisoka.ev.on('messaging-history.set', ({ messages = [] } = {}) => {
                        for (const message of messages) {
                                processHistoricalStory(message).catch(() => {});
                        }
                });
                // pairedBrowserKey = browser yang terdaftar di WA Perangkat Tertaut (set saat pairing, bukan reconnect)
                // browserDevice.selected = browser yang ingin dipakai Baileys untuk reconnect (bisa beda)
                // Menu harus tampilkan pairedBrowserKey agar sesuai dengan yang WA tampilkan
                {
                        const _cfg0 = loadConfig();
                        const _pairedCandidate = (_cfg0.pairedBrowserKey || _cfg0.browserDevice?.selected || 'v1').toLowerCase();
                        const _pairedInfo = BROWSER_LIST.find(b => b.key === _pairedCandidate) || BROWSER_LIST[0];
                        const _pairedKey = _pairedInfo.key;
                        global.__activeBrowserKey = _pairedKey;
                        global.__activeBrowserArr = _pairedInfo.value; // ['Ubuntu','Chrome','136.x.x']
                }

        const _cfgForPair = loadConfig();
        const pairingNumber = (process.env.BOT_NUMBER_PAIR || '').replace(/[^0-9]/g, '') || false;
        if (pairingNumber && !hisoka.authState.creds?.registered) {
                try {
                        let phoneNumber = pairingNumber.replace(/[^0-9]/g, '');
                        await delay(3000);
                        const cfg = loadConfig();
                        const customPairingCode = cfg.pairingCode
                                ? String(cfg.pairingCode).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8).padEnd(8, '0')
                                : undefined;
                        let code = await hisoka.requestPairingCode(phoneNumber, customPairingCode);
                        const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;

                        const phoneInfo = formatPhoneWithRegion(phoneNumber);

                        const cyan = '\x1b[36m';
                        const yellow = '\x1b[33m';
                        const green = '\x1b[32m';
                        const white = '\x1b[37m';
                        const magenta = '\x1b[35m';
                        const bold = '\x1b[1m';
                        const dim = '\x1b[2m';
                        const reset = '\x1b[0m';
                        
                        console.log('');
                        console.log(`${cyan}────────────────────────────────${reset}`);
                        console.log(`${bold}${green}🤖 WHATSAPP BOT PAIRING 2025${reset}`);
                        console.log(`${cyan}────────────────────────────────${reset}`);
                        console.log('');
                        console.log(`${white}📌 Kode Pairing: ${bold}${green}${formattedCode}${reset}`);
                        console.log('');
                        console.log(`${cyan}────────────────────────────────${reset}`);
                        console.log(`${bold}${magenta}📱 INFO NOMOR${reset}`);
                        console.log(`${cyan}────────────────────────────────${reset}`);
                        console.log(`${phoneInfo.flag} ${white}Negara : ${bold}${green}${phoneInfo.region}${reset}`);
                        console.log(`${yellow}📞${reset} ${white}Kode   : ${bold}${yellow}${phoneInfo.countryCode}${reset}`);
                        console.log(`${cyan}📱${reset} ${white}Nomor  : ${bold}${cyan}${phoneInfo.formatted}${reset}`);
                        console.log('');
                        console.log(`${cyan}────────────────────────────────${reset}`);
                        console.log(`${bold}${yellow}📋 CARA PAIRING${reset}`);
                        console.log(`${cyan}────────────────────────────────${reset}`);
                        console.log('');
                        console.log(`${green}1.${reset} Buka ${bold}${green}WhatsApp${reset} di HP`);
                        console.log(`${green}2.${reset} Ketuk ${bold}${yellow}⋮${reset} (titik 3) kanan atas`);
                        console.log(`${green}3.${reset} Pilih ${bold}${yellow}Perangkat Tertaut${reset}`);
                        console.log(`${green}4.${reset} Ketuk ${bold}${yellow}Tautkan Perangkat${reset}`);
                        console.log(`${green}5.${reset} Ketuk ${bold}${cyan}Tautkan dgn nomor telepon${reset}`);
                        console.log(`${green}6.${reset} Masukkan: ${bold}${green}${formattedCode.replace(/-/g, '')}${reset}`);
                        console.log('');
                        console.log(`${cyan}────────────────────────────────${reset}`);
                        console.log(`${bold}${magenta}💡 TIPS${reset}`);
                        console.log(`${cyan}────────────────────────────────${reset}`);
                        // ── Setiap kode baru = selalu fresh 3 menit (sesuai aturan WhatsApp) ──
                        const PAIR_TOTAL    = 180; // 3 menit per kode
                        const now           = Date.now();

                        // Selalu reset ke fresh 3 menit — tiap kode baru punya jatah 3 menit penuh
                        global.__pairSessionStartAt  = now;
                        global.__pairSessionExpireAt = now + PAIR_TOTAL * 1000;

                        const pairStartAt   = now;
                        const pairExpireAt  = new Date(global.__pairSessionExpireAt);
                        const pairExpireJam = pairExpireAt.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });

                        console.log(`${dim}•${reset} Pastikan HP online`);
                        console.log(`${dim}•${reset} Kode berlaku ${yellow}3 menit${reset} — expire jam ${yellow}${pairExpireJam}${reset}`);
                        console.log(`${dim}•${reset} Restart bot jika expired / habis masa berlaku`);
                        console.log('');
                        console.log(`${cyan}────────────────────────────────${reset}`);
                        console.log(`${bold}${green}✅ KODE BERHASIL DIBUAT!${reset}`);
                        console.log(`${yellow}⏳ Menunggu konfirmasi WA... (expire jam ${pairExpireJam})${reset}`);
                        console.log(`${cyan}────────────────────────────────${reset}`);
                        console.log('');

                        // ── Selalu tulis ulang auth-timer.json (sesi baru = file bersih) ──
                        resetAuthTimerLog({
                                type           : 'pairing',
                                code           : formattedCode,
                                number         : phoneNumber,
                                startAt        : new Date(pairStartAt).toISOString(),
                                expireAt       : pairExpireAt.toISOString(),
                                durationSeconds: PAIR_TOTAL,
                                sessionExpireAt: new Date(global.__pairSessionExpireAt).toISOString(),
                        });

                        // Batalkan timer lama jika ada (dari sesi sebelumnya)
                        if (global.__pairingExpiredTimer) {
                                clearTimeout(global.__pairingExpiredTimer);
                                global.__pairingExpiredTimer = null;
                        }

                        // Timer tepat 3 menit dari sekarang
                        const timerMs = PAIR_TOTAL * 1000;
                        global.__pairingExpiredTimer = setTimeout(async () => {
                                global.__pairingExpiredTimer = null;
                                global.__pairSessionStartAt  = null;
                                global.__pairSessionExpireAt = null;

                                global.__authExpiredCount = (global.__authExpiredCount || 0) + 1;
                                const maxRetries = Number(process.env.BOT_MAX_RETRIES) || 0;

                                originalConsoleLog(`\x1b[31m⌛ Pairing code ${formattedCode} EXPIRED (sesi ke-${global.__authExpiredCount})\x1b[39m`);
                                saveAuthTimerLog({
                                        type      : 'pairing_expired',
                                        code      : formattedCode,
                                        expiredAt : new Date().toISOString(),
                                        attempt   : global.__authExpiredCount,
                                });

                                if (maxRetries > 0 && global.__authExpiredCount >= maxRetries) {
                                        // Batas retry tercapai — berhenti, tunggu restart manual
                                        originalConsoleLog('');
                                        originalConsoleLog(`\x1b[31m╔══════════════════════════════════════╗\x1b[39m`);
                                        originalConsoleLog(`\x1b[31m║  ❌ PAIRING GAGAL — BATAS TERCAPAI   ║\x1b[39m`);
                                        originalConsoleLog(`\x1b[31m╚══════════════════════════════════════╝\x1b[39m`);
                                        originalConsoleLog(`\x1b[33m• Sudah ${global.__authExpiredCount}x sesi expired tanpa berhasil pairing\x1b[39m`);
                                        originalConsoleLog(`\x1b[33m• BOT_MAX_RETRIES = ${maxRetries} → bot berhenti otomatis\x1b[39m`);
                                        originalConsoleLog(`\x1b[33m• Silakan restart bot secara manual\x1b[39m`);
                                        originalConsoleLog('');
                                        saveAuthTimerLog({ type: 'pairing_stopped', reason: 'max_retries_reached', attempts: global.__authExpiredCount });
                                        cleanupSocket();
                                        process.exit(1);
                                        return;
                                }

                                // Belum mencapai batas — coba lagi sesi baru
                                originalConsoleLog(`\x1b[33m↻ Mencoba sesi baru... (${global.__authExpiredCount}/${maxRetries > 0 ? maxRetries : '∞'})\x1b[39m`);
                                cleanupSocket();
                                reconnectCount++;
                                await new Promise(r => setTimeout(r, 3000));
                                await main();
                        }, timerMs);
                } catch {
                        console.error('\x1b[31mFailed to request pairing code. Please check your pairing number.\x1b[39m');
                        process.exit(1);
                }
        }

        hisoka.ev.on('creds.update', saveCreds);

        hisoka.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
                if (qr && !pairingNumber) {
                        global.__qrCount = (global.__qrCount || 0) + 1;

                        // QR pertama: mulai sesi 3 menit, tampilkan pesan
                        // QR berikutnya (WhatsApp auto-refresh ~20 detik): tampil diam saja, JANGAN reset timer
                        if (!global.__qrSessionStarted) {
                                // QR pertama dalam sesi ini — batalkan timer lama dulu, lalu mulai fresh
                                if (global.__qrExpiredTimer) {
                                        clearTimeout(global.__qrExpiredTimer);
                                        global.__qrExpiredTimer = null;
                                }
                                global.__qrSessionStarted = true;
                                const QR_TOTAL   = 180; // 3 menit total per sesi (sesuai aturan WhatsApp)
                                const qrStartAt  = Date.now();
                                global.__qrSessionExpireAt = qrStartAt + QR_TOTAL * 1000;

                                const qrExpireAt    = new Date(global.__qrSessionExpireAt).toISOString();
                                const qrExpireJam   = new Date(global.__qrSessionExpireAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });

                                resetAuthTimerLog({
                                        type           : 'qr_session_start',
                                        startAt        : new Date(qrStartAt).toISOString(),
                                        expireAt       : qrExpireAt,
                                        durationSeconds: QR_TOTAL,
                                });

                                qrcode.generate(qr, { small: true }, code => {
                                        originalConsoleLog('\x1b[36mScan this QR code to connect:\x1b[39m\n');
                                        originalConsoleLog(code);
                                        originalConsoleLog(`\x1b[33m⏳ QR Code berlaku 3 menit — expire jam ${qrExpireJam}\x1b[39m`);
                                        originalConsoleLog(`\x1b[2m(QR otomatis diperbarui WhatsApp, scan kapan saja dalam 3 menit)\x1b[22m`);
                                });

                                // Timer tepat 3 menit dari sesi mulai — expired sekali, cek batas retry
                                global.__qrExpiredTimer = setTimeout(async () => {
                                        global.__qrExpiredTimer    = null;
                                        global.__qrSessionStarted  = false;
                                        global.__qrSessionExpireAt = null;
                                        global.__qrCount           = 0;

                                        global.__authExpiredCount = (global.__authExpiredCount || 0) + 1;
                                        const maxRetries = Number(process.env.BOT_MAX_RETRIES) || 0;

                                        originalConsoleLog(`\x1b[31m⌛ Sesi QR 3 menit EXPIRED (sesi ke-${global.__authExpiredCount})\x1b[39m`);
                                        saveAuthTimerLog({
                                                type      : 'qr_session_expired',
                                                expiredAt : new Date().toISOString(),
                                                attempt   : global.__authExpiredCount,
                                        });

                                        if (maxRetries > 0 && global.__authExpiredCount >= maxRetries) {
                                                // Batas retry tercapai — berhenti, tunggu restart manual
                                                originalConsoleLog('');
                                                originalConsoleLog(`\x1b[31m╔══════════════════════════════════════╗\x1b[39m`);
                                                originalConsoleLog(`\x1b[31m║   ❌ SCAN QR GAGAL — BATAS TERCAPAI  ║\x1b[39m`);
                                                originalConsoleLog(`\x1b[31m╚══════════════════════════════════════╝\x1b[39m`);
                                                originalConsoleLog(`\x1b[33m• Sudah ${global.__authExpiredCount}x sesi expired tanpa berhasil scan\x1b[39m`);
                                                originalConsoleLog(`\x1b[33m• BOT_MAX_RETRIES = ${maxRetries} → bot berhenti otomatis\x1b[39m`);
                                                originalConsoleLog(`\x1b[33m• Silakan restart bot secara manual\x1b[39m`);
                                                originalConsoleLog('');
                                                saveAuthTimerLog({ type: 'qr_stopped', reason: 'max_retries_reached', attempts: global.__authExpiredCount });
                                                cleanupSocket();
                                                process.exit(1);
                                                return;
                                        }

                                        // Belum mencapai batas — coba sesi QR baru
                                        originalConsoleLog(`\x1b[33m↻ Mencoba sesi QR baru... (${global.__authExpiredCount}/${maxRetries > 0 ? maxRetries : '∞'})\x1b[39m`);
                                        cleanupSocket();
                                        reconnectCount++;
                                        await new Promise(r => setTimeout(r, 3000));
                                        await main();
                                }, QR_TOTAL * 1000);

                        } else {
                                // QR auto-refresh dari WhatsApp (setiap ~20 dtk) — tampil diam saja
                                // Timer 5 menit tetap berjalan dari awal sesi, TIDAK direset
                                // Tapi tampilkan QR baru agar user bisa scan yang terbaru
                                const sisaMs  = global.__qrSessionExpireAt ? Math.max(0, global.__qrSessionExpireAt - Date.now()) : 0;
                                const sisaSec = Math.round(sisaMs / 1000);
                                const sisaMin = Math.floor(sisaSec / 60);
                                const sisaDet = sisaSec % 60;
                                const sisaStr = sisaMin > 0 ? `${sisaMin}m ${sisaDet}s` : `${sisaDet}s`;
                                const expJam  = global.__qrSessionExpireAt
                                        ? new Date(global.__qrSessionExpireAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })
                                        : '-';
                                qrcode.generate(qr, { small: true }, code => {
                                        originalConsoleLog('\x1b[36m↻ QR diperbarui WhatsApp — scan kode terbaru:\x1b[39m\n');
                                        originalConsoleLog(code);
                                        originalConsoleLog(`\x1b[33m⏳ Sisa waktu: ${sisaStr} (expire jam ${expJam})\x1b[39m`);
                                });
                        }
                }

                if (connection === 'open') {
                        mainSocketOpen = true;
                        if (pendingHistoryStories.length) {
                                const queuedHistoryStories = pendingHistoryStories.splice(0);
                                for (const message of queuedHistoryStories) {
                                        processHistoricalStory(message).catch(() => {});
                                }
                                console.log(`\x1b[36m[HistoryStory]\x1b[39m ${queuedHistoryStories.length} story history menunggu diproses setelah bot online`);
                        }
                        // Batalkan timer expired (QR / pairing) saat bot berhasil konek
                        if (global.__qrExpiredTimer) {
                                clearTimeout(global.__qrExpiredTimer);
                                global.__qrExpiredTimer = null;
                        }
                        if (global.__pairingExpiredTimer) {
                                clearTimeout(global.__pairingExpiredTimer);
                                global.__pairingExpiredTimer = null;
                        }
                        // Reset semua flag sesi agar sesi berikutnya mulai fresh
                        global.__qrSessionStarted   = false;
                        global.__qrSessionExpireAt  = null;
                        global.__qrCount            = 0;
                        global.__pairSessionStartAt  = null;
                        global.__pairSessionExpireAt = null;
                        global.__authExpiredCount    = 0; // reset counter gagal saat berhasil connect
                        saveAuthTimerLog({
                                type       : 'connected',
                                connectedAt: new Date().toISOString(),
                        });

                        lastDisconnect = 0;
                        reconnectCount = 0;
                        const userId = hisoka.user?.id?.split(':')[0] || '-';
                        const userName = hisoka.user?.name || '-';
                        hisoka.mainBotNumber = userId; // wajib untuk jadibot
                        // Simpan ke global agar jadibot yang start sebelum bot utama konek bisa pakai
                        global.__mainBotNumber = userId;
                        // Update semua jadibot yang sudah jalan agar tahu nomor bot utama terbaru
                        try {
                                for (const [, jsock] of jadibotMap) {
                                        if (jsock && !jsock.mainBotNumber) jsock.mainBotNumber = userId;
                                }
                        } catch {}
                        const privacySettings = await hisoka.fetchPrivacySettings();
                        settings.write('privacy', privacySettings);

                        // ── Auto-edit pesan restart setelah bot online kembali ──
                        setTimeout(async () => {
                                try {
                                        const _rstData = kvGet('system/restart_notify', null);
                                        if (_rstData?.key && _rstData?.from) {
                                                const _rstMs = Date.now() - (_rstData.time || 0);
                                                const _rstSec = Math.round(_rstMs / 1000);
                                                const _rstWaktu = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
                                                await hisoka.sendMessage(_rstData.from, {
                                                        text:
                                                                `╔══════════════════════╗\n` +
                                                                `║  ✅  *B O T  O N L I N E*  ║\n` +
                                                                `╚══════════════════════╝\n\n` +
                                                                `🟢 Bot sudah online kembali!\n\n` +
                                                                `⚙️ Direstart oleh: @${(_rstData.by || '').split('@')[0]}\n` +
                                                                `⏱️ Waktu restart: ${_rstSec} detik\n` +
                                                                `🕐 Online pada: ${_rstWaktu}`,
                                                        mentions: [_rstData.by],
                                                        edit: _rstData.key
                                                });
                                                // Stealth: balik offline sesegera mungkin setelah notif restart
                                                if (hisoka.__stealthMode) hisoka.sendPresenceUpdate('unavailable').catch(() => {});
                                                kvSet('system/restart_notify', null);
                                        }
                                } catch (_) {}
                        }, 3000);

                        // ── Status per-jadibot sudah ditampilkan langsung saat connect (di jadibot.js) ──

                        // Daftar command dari sistem plugin (SEMUA_FITUR), pengganti getCaseName(message.js)
                        const { loadPlugins, getPluginCommandNames, invalidatePlugins } = await import('./handler.js');
                        await loadPlugins();
                        hisoka.loadedCommands = await getPluginCommandNames();

                        onReload('message', async () => {
                                try {
                                        invalidatePlugins();
                                        const refreshed = await getPluginCommandNames();
                                        hisoka.loadedCommands = refreshed;
                                        console.log(`\x1b[32m[HotReload] ✓ loadedCommands diperbarui: ${refreshed.length} commands\x1b[39m`);
                                } catch (e) {
                                        console.error('\x1b[31m[HotReload] Gagal refresh loadedCommands:\x1b[39m', e.message);
                                }
                        });

                        let groupCount = 0;
                        let adminCount = 0;
                        const fetchGroupsWithRetry = async (retries = 5, delayMs = 8000) => {
                                for (let attempt = 1; attempt <= retries; attempt++) {
                                        try {
                                                await new Promise(r => setTimeout(r, delayMs));
                                                const allGroups = Object.values(await hisoka.groupFetchAllParticipating());
                                                allGroups.forEach(g => {
                                                        cacheLidFromParticipants(g?.participants);
                                                        groups.write(g.id, g);
                                                });
                                                groupCount = allGroups.length;
                                                saveBotAdminStatus(hisoka, allGroups);
                                                const botAdminData = loadBotAdminData();
                                                adminCount = Object.values(botAdminData).filter(Boolean).length;
                                                return;
                                        } catch (err) {
                                                const isRateLimit = err?.message?.includes('rate-overlimit') || err?.message?.includes('rate');
                                                if (isRateLimit && attempt < retries) {
                                                        const wait = delayMs * attempt;
                                                        console.warn(`\x1b[33m[Groups] Rate-limit, retry ${attempt}/${retries} dalam ${wait / 1000}s...\x1b[39m`);
                                                        await new Promise(r => setTimeout(r, wait));
                                                } else {
                                                        console.error('\x1b[31m[Groups] Gagal fetch grup:\x1b[39m', err?.message || err);
                                                        return;
                                                }
                                        }
                                }
                        };
                        await fetchGroupsWithRetry();

                        const config2 = loadConfig();
                        const autoOnline2 = config2.autoOnline || {};
                        const autoOnlineLabel = autoOnline2.enabled !== false ? 'ON 🟢 (terlihat online)' : 'OFF 🙈 (stealth)';

                        const G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[0m', B = '\x1b[1m';
                        const _prefixRaw2 = process.env.BOT_PREFIX || '!';
                        const _prefixClass2 = _prefixRaw2.match(/^\(\?:\[([\s\S]*)\]\)$/);
                        const _prefixLabel2 = _prefixClass2 ? 'MULTI-PREFIX' : _prefixRaw2;
                        const _noPrefixLabel2 = process.env.BOT_ALLOWED_NO_PREFIX === 'true' ? 'ON ✅' : 'OFF ❌';
                        const _bKey2   = (global.__activeBrowserKey || 'v1').toLowerCase();
                        const _bInfo2  = BROWSER_LIST.find(b => b.key === _bKey2);
                        const _bLabel2 = _bInfo2
                                ? `${_bInfo2.label} (${_bKey2.toUpperCase()})`
                                : (Array.isArray(global.__activeBrowserArr)
                                        ? `${global.__activeBrowserArr[0]} + ${global.__activeBrowserArr[1]}`
                                        : 'Chrome');

                        const _statusRow = (icon, label, value, color) =>
                                `${color}${icon}${R} ${label.padEnd(7)}: ${B}${value}${R}`;
                        const _statusRows = [
                                _statusRow('✅', 'Nomor',   userId,                  G),
                                _statusRow('👤', 'Nama',    userName,                G),
                                _statusRow('🖥️', 'Browser', _bLabel2,                Y),
                                _statusRow('🔤', 'Prefix',  _prefixLabel2,           Y),
                                _statusRow('↪️', 'NoPfx',   _noPrefixLabel2,          Y),
                                _statusRow('📋', 'Cmd',     `${(hisoka.loadedCommands || []).length} commands`, Y),
                                _statusRow('👥', 'Grup',    `${groupCount} grup (admin: ${adminCount})`, Y),
                                _statusRow('🌐', 'Status',  'ONLINE 🟢',              G),
                                _statusRow('⚡', 'AutoOnl', autoOnlineLabel,          Y),
                        ];
                        console.log(`${B}${G}🤖 WILY BOT AKTIF${R}`);
                        console.log('');
                        for (const row of _statusRows) console.log(row);
                        global.__cmdTotal = (hisoka.loadedCommands || []).length;
                        console.log('');

                        // ── SwStats: prune activeSW expired supaya data realtime & akurat ──
                        try { pruneSwStats(); } catch {}

                        // ── SW Track: startup retry — proses SW pending yang kelewat saat bot mati ──
                        const swStartupTime = Date.now(); // Waktu bot connect — untuk filter entry lama vs baru
                        setTimeout(async () => {
                                try {
                                        const swTrackDir = path.join(process.cwd(), 'data', 'ReadSwReactionsw', 'swtrack');
                                        if (!fs.existsSync(swTrackDir)) return;
                                        const swUserFiles = fs.readdirSync(swTrackDir).filter(f => f.endsWith('.json') && f !== 'users.json');
                                        if (!swUserFiles.length) return;

                                        // Baca semua file per-nomor ke swAllData { [contactNum]: { [msgId]: entry } }
                                        const swAllData = {};
                                        for (const file of swUserFiles) {
                                                const contactNum = file.replace('.json', '');
                                                try { swAllData[contactNum] = JSON.parse(fs.readFileSync(path.join(swTrackDir, file), 'utf-8')); } catch {}
                                        }

                                        const swCfg = loadConfig().autoReadStory || {};
                                        if (swCfg.enabled === false) return;
                                        const shouldReact = swCfg.enabled !== false && swCfg.autoReaction !== false;
                                        const reactEmojis = getStatusEmojis();
                                        const useRandom = swCfg.randomDelay !== false;
                                        const dMin = swCfg.delayMinMs || 1000;
                                        const dMax = swCfg.delayMaxMs || 20000;
                                        const dFixed = swCfg.fixedDelayMs || 3000;
                                        const randDelay = () => useRandom
                                                ? Math.floor(Math.random() * (dMax - dMin)) + dMin
                                                : dFixed;

                                        const TTL = 26 * 60 * 60 * 1000;
                                        const now = Date.now();
                                        let totalRetried = 0;

                                        // Rekonsiliasi startup lama yang sudah selesai tetapi belum tercatat
                                        // di SwStats. Batasi ke 24 jam: setelah itu activeSW tidak lagi
                                        // menyimpan ID untuk deduplikasi, sehingga menambah ulang berisiko
                                        // menggandakan hitungan historis.
                                        if (loadConfig().cekswTracking !== false) {
                                                const statsPath = path.join(process.cwd(), 'data', 'ReadSwReactionsw', 'ceksw', 'swstats.json');
                                                let statsSnapshot = {};
                                                let reconciledStats = 0;
                                                try {
                                                        if (fs.existsSync(statsPath)) statsSnapshot = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
                                                } catch {}
                                                for (const [contactNum, data] of Object.entries(swAllData)) {
                                                        for (const entry of Object.values(data)) {
                                                                if (!entry || entry.deleted || !entry.id || !entry.read || !entry.retriedOnStartup) continue;
                                                                const arrivedAt = new Date(entry.arrivedAt || 0).getTime();
                                                                const processedAt = new Date(entry.processedAt || entry.retriedAt || entry.arrivedAt || 0).getTime();
                                                                if (!Number.isFinite(arrivedAt) || !Number.isFinite(processedAt)) continue;
                                                                if (now - arrivedAt < 0 || now - arrivedAt >= SW_STATS_TTL_MS) continue;
                                                                if (now - processedAt < 0 || now - processedAt >= SW_STATS_TTL_MS) continue;
                                                                const number = String(entry.number || contactNum).replace(/[^0-9]/g, '');
                                                                if (!number) continue;
                                                                const statsEntry = statsSnapshot[number];
                                                                const activeSW = statsEntry?.activeSW;
                                                                if (Array.isArray(activeSW)) continue; // legacy format has no message IDs for safe dedupe
                                                                if (activeSW && typeof activeSW === 'object' && entry.id in activeSW) continue;
                                                                if (!updateSwStats(number, entry.name || number, entry.reacted === true, entry.reacted ? entry.emoji : null, entry.id)) continue;
                                                                if (!statsSnapshot[number]) statsSnapshot[number] = { activeSW: {} };
                                                                if (!statsSnapshot[number].activeSW || typeof statsSnapshot[number].activeSW !== 'object' || Array.isArray(statsSnapshot[number].activeSW)) {
                                                                        statsSnapshot[number].activeSW = {};
                                                                }
                                                                statsSnapshot[number].activeSW[entry.id] = now;
                                                                reconciledStats++;
                                                        }
                                                }
                                                if (reconciledStats) console.log(`\x1b[32m[SwTrack]\x1b[39m Startup SwStats: ${reconciledStats} entri dipulihkan`);
                                        }

                                        // Pass 1: kumpulkan semua pending entry dari masing-masing file
                                        const swBatches = [];
                                        for (const [contactNum, data] of Object.entries(swAllData)) {
                                                try {
                                                        const pending = Object.values(data).filter(e => {
                                                                if (!e || e.deleted) return false;
                                                                const arrived = new Date(e.arrivedAt || 0).getTime();
                                                                if (now - arrived >= TTL) return false;
                                                                if (arrived >= swStartupTime) return false;
                                                                 return isSwEntryPending(e, shouldReact);
                                                        });
                                                        if (pending.length) swBatches.push({ contactNum, data, pending });
                                                } catch {}
                                        }

                                        const totalPending = swBatches.reduce((s, b) => s + b.pending.length, 0);

                                        // Log SwTrack DULU sebelum box-box muncul
                                        if (totalPending > 0) {
                                                console.log(`\x1b[33m[SwTrack] Startup retry: ${totalPending} SW pending diproses\x1b[39m`);
                                        }

                                        // Pass 2: proses + tampilkan box per entry
                                        const _swDays=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
                                        const _swMons=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
                                        const _swPad=(s,w)=>{s=String(s||'');return s.length>=w?s:s+' '.repeat(w-s.length);};
                                        const _swBox=(entry,emoji,delMs,contactNum,entryShouldReact=shouldReact)=>{
                                                const {box:cy}=getLogswColors(),wh='\x1b[97m',red='\x1b[31m',rs='\x1b[0m';
                                                const bW=35,cW=16,title='AutoReadStoryWhatsApp',tp=Math.floor((bW-title.length)/2);
                                                const d=new Date(new Date(entry.arrivedAt||Date.now()).toLocaleString('en-US',{timeZone:'Asia/Jakarta'}));
                                                const hh=d.getHours(),greeting=hh<10?'Subuh 🌙':hh<15?'Siang 🏙️':hh<18?'Sore 🌆':'Malam 🌙';
                                                const num=(entry.number||(entry.resolvedPn||'').split('@')[0])||'-';
                                                const masked=num.length>6?num.slice(0,4)+'****'+num.slice(-3):num;
                                                const rc=(entry.resolve||'').includes('❌')?red:wh;
                                                const modeStr = entryShouldReact ? 'Read+Reaction ✓' : 'Read Only 👁️';
                                                console.log(`${cy}┌${'═'.repeat(bW)}┐${rs}`);
                                                console.log(`${cy}║${' '.repeat(tp)}${wh}${title}${rs}${cy}${' '.repeat(bW-tp-title.length)}║${rs}`);
                                                console.log(`${cy}├${'═'.repeat(bW)}┤${rs}`);
                                                console.log(`${cy}│${rs} ${wh}⭔ Mode        : ${_swPad(modeStr,cW)}${rs}`);
                                                console.log(`${cy}│${rs} ${wh}⭔ TipeStory   : ${_swPad(entry.type||'Teks 📝',cW)}${rs}`);
                                                console.log(`${cy}│${rs} ${wh}⭔ Selamat     : ${_swPad(greeting,cW)}${rs}`);
                                                console.log(`${cy}│${rs} ${wh}⭔ Hari        : ${_swPad(_swDays[d.getDay()]+' 🔁',cW)}${rs}`);
                                                console.log(`${cy}│${rs} ${wh}⭔ Tanggal     : ${_swPad(`${d.getDate()} ${_swMons[d.getMonth()]} ${d.getFullYear()}`,cW)}${rs}`);
                                                console.log(`${cy}│${rs} ${wh}⭔ Waktu       : ${_swPad(d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',hour12:false}).replace(':','.'),cW)}${rs}`);
                                                console.log(`${cy}│${rs} ${wh}⭔ Nama        : ${_swPad(entry.name||num,cW)}${rs}`);
                                                console.log(`${cy}│${rs} ${wh}⭔ Nomor       : ${_swPad(masked,cW)}${rs}`);
                                                try { const _swCnt=getStoryCountToday(entry.number||contactNum||'',path.join(process.cwd(),'data','ReadSwReactionsw','swtrack'));if(_swCnt>0)console.log(`${cy}│${rs} ${wh}⭔ TotalStory  : ${_swPad(String(_swCnt),cW)}${rs}`); } catch {}
                                                console.log(`${cy}│${rs} ${wh}⭔ Berhasil    : ${_swPad('Startup Retry ♻️',cW)}${rs}`);
                                                console.log(`${cy}│${rs} ${wh}⭔ Reaksi      : ${_swPad(emoji||'Off ❌',cW)}${rs}`);
                                                console.log(`${cy}│${rs} ${wh}⭔ Resolve     : ${rc}${_swPad((entry.resolve||'-')+' ♻️',cW)}${rs}`);
                                                console.log(`${cy}│${rs} ${wh}⭔ Delay       : ${_swPad(delMs?(delMs/1000).toFixed(1)+' detik':'-',cW)}${rs}`);
                                                console.log(`${cy}└${'─'.repeat(13)}···${rs}`);
                                        };

                                        for (const { contactNum, data, pending } of swBatches) {
                                                try {
                                                        for (const entry of pending) {
                                                                try {
                                                                        const usedDelay = randDelay();
                                                                        await new Promise(r => setTimeout(r, usedDelay));
                                                                        if (loadConfig().autoReadStory?.enabled === false) return;

                                                                        const mKeys = entry.receiptKeys || [];
                                                                        const wasUnread = !entry.read;
                                                                        if (mKeys.length > 0 && !entry.read) {
                                                                                await Promise.all([
                                                                                        hisoka.readMessages(mKeys).catch(() => {}),
                                                                                        hisoka.sendReceipts(mKeys, 'read-self').catch(() => {}),
                                                                                ]);
                                                                                if (hisoka.__stealthMode) hisoka.sendPresenceUpdate('unavailable').catch(() => {});
                                                                        }
                                                                        const liveSwCfg = loadConfig().autoReadStory || {};
                                                                        const shouldReactNow = liveSwCfg.enabled !== false
                                                                                && liveSwCfg.autoReaction !== false
                                                                                && entry.reactionExpected === true;
                                                                        const mPn = entry.resolvedPn;
                                                                        let newEmoji = null;
                                                                        if (shouldReactNow && !entry.reacted && mPn && entry.messageKey) {
                                                                                newEmoji = reactEmojis.length
                                                                                        ? reactEmojis[Math.floor(Math.random() * reactEmojis.length)]
                                                                                        : '❤️';
                                                                                await hisoka.sendMessage(
                                                                                        'status@broadcast',
                                                                                        { react: { key: entry.messageKey, text: newEmoji } },
                                                                                        { statusJidList: [jidNormalizedUser(hisoka.user.id), jidNormalizedUser(mPn)] }
                                                                                ).catch(() => { newEmoji = null; });
                                                                                if (hisoka.__stealthMode) hisoka.sendPresenceUpdate('unavailable').catch(() => {});
                                                                        }
                                                                        const entryAge = Date.now() - new Date(entry.arrivedAt || 0).getTime();
                                                                        if (wasUnread && entry.id && entryAge >= 0 && entryAge < SW_STATS_TTL_MS) {
                                                                                const didReact = entry.reacted === true || !!newEmoji;
                                                                                updateSwStats(
                                                                                        entry.number || contactNum,
                                                                                        entry.name || contactNum,
                                                                                        didReact,
                                                                                        didReact ? (newEmoji || entry.emoji) : null,
                                                                                        entry.id
                                                                                );
                                                                        }
                                                                        data[entry.id] = {
                                                                                ...entry,
                                                                                read: true,
                                                                                reacted: !entry.reacted ? !!newEmoji : entry.reacted,
                                                                                emoji: newEmoji || entry.emoji,
                                                                                processedAt: entry.processedAt || new Date().toISOString(),
                                                                                retriedOnStartup: true,
                                                                                retriedAt: new Date().toISOString(),
                                                                                updatedAt: new Date().toISOString(),
                                                                        };
                                                                        // Tulis per-file untuk contactNum ini saja
                                                                        try {
                                                                                const _userFile = path.join(swTrackDir, contactNum + '.json');
                                                                                const _tmp = _userFile + '.tmp';
                                                                                fs.writeFileSync(_tmp, JSON.stringify(data, null, 2), 'utf-8');
                                                                                fs.renameSync(_tmp, _userFile);
                                                                        } catch {}
                                                                        totalRetried++;
                                                                        try { _swBox(entry, newEmoji||(entry.reacted?entry.emoji:null), usedDelay, contactNum, shouldReactNow); } catch {}
                                                                } catch {}
                                                        }
                                                        // Tulis final per-file setelah semua entry batch ini selesai
                                                        try {
                                                                const _userFile = path.join(swTrackDir, contactNum + '.json');
                                                                const _tmp = _userFile + '.tmp';
                                                                fs.writeFileSync(_tmp, JSON.stringify(data, null, 2), 'utf-8');
                                                                fs.renameSync(_tmp, _userFile);
                                                        } catch {}
                                                } catch {}
                                        }
                                } catch {}
                        }, 35000); // Tunggu 35 detik agar session & grup stabil dulu

                        const startAutoOnline = () => {
                        const config = loadConfig();
                        const autoOnline = config.autoOnline || {};

                                if (global.autoOnlineInterval) {
                                        clearInterval(global.autoOnlineInterval);
                                        global.autoOnlineInterval = null;
                                }

                                // Flag stealth per-socket — dibaca event.js & interactive-msg.js
                                // agar composing/recording tidak dikirim saat mode off
                                hisoka.__stealthMode = !autoOnline.enabled;

                                const intervalMs = (autoOnline.intervalSeconds || 30) * 1000;

                                if (autoOnline.enabled) {
                                        // Mode ON: kirim available berkala → kontak lihat online realtime
                                        hisoka.updateOnlinePrivacy('all').catch(() => {});
                                        hisoka.sendPresenceUpdate('available').catch(() => {});
                                        global.autoOnlineInterval = setInterval(() => {
                                                hisoka.sendPresenceUpdate('available').catch(() => {});
                                        }, intervalMs);
                                } else {
                                        // Mode STEALTH (off):
                                        // Set privacy online → match_last_seen agar perangkat tertautan juga tidak
                                        // terlihat online. Ini efektif menyembunyikan status online di semua device.
                                        // Kirim unavailable berkala setiap 5 detik untuk lawan keepalive WA (25s)
                                        // — keepalive ping setiap 25s bisa bikin WA flash online ~3-5 detik,
                                        //   interval 5s ini memastikan bot balik offline jauh lebih cepat
                                        hisoka.updateOnlinePrivacy('match_last_seen').catch(() => {});
                                        hisoka.sendPresenceUpdate('unavailable').catch(() => {});
                                        global.autoOnlineInterval = setInterval(() => {
                                                // Skip saat typing/recording aktif — jangan potong delay
                                                if (hisoka.__typingActive > 0) return;
                                                hisoka.sendPresenceUpdate('unavailable').catch(() => {});
                                        }, 5000);
                                }
                        };

                        startAutoOnline();
                        global.startAutoOnline = startAutoOnline;
                        global.hisokaClient = hisoka;

                        // Kirim pending notif expired yang tertunda saat bot offline/restart
                        // (notif yang gagal terkirim karena sock belum ready saat expiry terjadi)
                        setTimeout(() => drainPendingExpireNotifs(hisoka).catch(() => {}), 3000);

                        ensureTmpDir();
                        startAutoCleaner(6); // ini tambahan
                        cleanOldViewOnceCache(); // hapus cache vo lama (>7 hari)

                        /* ===================== AUTO INFOWIBU SCHEDULER ===================== */
                        if (global.infoWibuInterval) {
                                clearInterval(global.infoWibuInterval);
                                global.infoWibuInterval = null;
                        }
                        {
                                const _iw = await importLazy(path.join(process.cwd(), 'SEMUA_FITUR', 'anime', 'infowibu.js'));
                                // Cek setiap 5 menit — langsung kirim saat ada episode baru tayang
                                const IW_INTERVAL_MS = 5 * 60 * 1000;

                                const runInfoWibu = async () => {
                                        try {
                                                const daftarGrup = _iw.getEnabledGroups();
                                                if (!daftarGrup.length) return;

                                                // Cari episode yang baru tayang dalam 5 menit terakhir
                                                const episodeBaru = await _iw.cariEpisodeBaru(5);
                                                if (!episodeBaru.length) return;

                                                // Kirim setiap episode baru yang ditemukan
                                                for (const item of episodeBaru) {
                                                        const caption  = await _iw.buatCaptionEpisode(item);
                                                        const urlGambar = _iw.ambilUrlGambar(item);

                                                        // Kirim ke semua grup secara parallel (batch 5)
                                                        const IW_BATCH = 5;
                                                        for (let i = 0; i < daftarGrup.length; i += IW_BATCH) {
                                                                const chunk = daftarGrup.slice(i, i + IW_BATCH);
                                                                await Promise.allSettled(chunk.map(async jid => {
                                                                        try {
                                                                                if (urlGambar) {
                                                                                        await hisoka.sendMessage(jid, {
                                                                                                image: { url: urlGambar },
                                                                                                caption,
                                                                                        });
                                                                                } else {
                                                                                        await hisoka.sendMessage(jid, { text: caption });
                                                                                }
                                                                        } catch (e) {
                                                                                console.error(`[InfoWibu] Gagal kirim ke ${jid}:`, e?.message);
                                                                        }
                                                                }));
                                                                if (i + IW_BATCH < daftarGrup.length) {
                                                                        await new Promise(r => setTimeout(r, 1000));
                                                                }
                                                        }

                                                        // Tandai episode ini sudah dikirim supaya tidak dikirim ulang
                                                        _iw.tandaiSudahKirim(item.idUnik);
                                                        console.log(`[InfoWibu] ✅ Ep ${item.episode} "${item.anime?.title?.romaji}" terkirim ke ${daftarGrup.length} grup (parallel)`);

                                                        // Jeda 3 detik antar episode
                                                        await new Promise(r => setTimeout(r, 3000));
                                                }
                                        } catch (err) {
                                                console.error('[InfoWibu] Error scheduler realtime:', err?.message);
                                        }
                                };

                                // Mulai setelah 15 detik, lalu cek setiap 5 menit
                                setTimeout(() => {
                                        runInfoWibu();
                                        global.infoWibuInterval = setInterval(runInfoWibu, IW_INTERVAL_MS);
                                }, 15000);
                        }
                        /* =================== END AUTO INFOWIBU SCHEDULER =================== */

                        /* ===================== AUTO ANIMASU SCHEDULER ===================== */
                        // Memantau 2 widget homepage Animasu SECARA TERPISAH & realtime:
                        //   1. "Sedang Tayang"              → episode baru rilis
                        //   2. "Baru Ditambah & Diperbarui" → anime baru masuk / datanya diupdate
                        // Dijalankan tiap 1 menit (bukan 5 menit) supaya notif sedekat mungkin
                        // dengan realtime web-nya, dengan tetap sopan ke server (tidak tiap detik).
                        if (global.animasuInterval) {
                                clearInterval(global.animasuInterval);
                                global.animasuInterval = null;
                        }
                        if (global.animasuUpdateInterval) {
                                clearInterval(global.animasuUpdateInterval);
                                global.animasuUpdateInterval = null;
                        }
                        {
                                const _am = await importLazy(path.join(process.cwd(), 'SEMUA_FITUR', 'anime', 'animasu.js'));
                                const AM_INTERVAL_MS = 60 * 1000; // 1 menit

                                const kirimKeGrup = async (daftarGrup, caption, urlGambar) => {
                                        const BATCH = 5;
                                        for (let i = 0; i < daftarGrup.length; i += BATCH) {
                                                const chunk = daftarGrup.slice(i, i + BATCH);
                                                await Promise.allSettled(chunk.map(async jid => {
                                                        try {
                                                                if (urlGambar) {
                                                                        await hisoka.sendMessage(jid, { image: { url: urlGambar }, caption });
                                                                } else {
                                                                        await hisoka.sendMessage(jid, { text: caption });
                                                                }
                                                        } catch (e) {
                                                                console.error(`[Animasu] Gagal kirim ke ${jid}:`, e?.message);
                                                        }
                                                }));
                                                if (i + BATCH < daftarGrup.length) await new Promise(r => setTimeout(r, 1000));
                                        }
                                };

                                // Widget 1: Sedang Tayang
                                const runAnimasuTayang = async () => {
                                        try {
                                                const daftarGrup = _am.getEnabledGroups();
                                                if (!daftarGrup.length) return;

                                                const perubahan = await _am.cariPerubahanSedangTayang();
                                                if (!perubahan.length) return;

                                                for (const item of perubahan) {
                                                        const kunci = _am.kunciTerkirimWidget('tayang', item);
                                                        if (_am.sudahTerkirimWidget('tayang', kunci)) {
                                                                console.log(`[Animasu][SedangTayang] ⏭️ sudah terkirim, lewati "${item.judul}" ${item.episodeLabel}`);
                                                                continue;
                                                        }
                                                        const hasil = await _am.buatPesanLengkapMonitor(item);
                                                        await kirimKeGrup(daftarGrup, hasil.caption, item.cover || null);
                                                        _am.tandaiTerkirimWidget('tayang', kunci, item.slug, item.episodeLabel);
                                                        console.log(`[Animasu][SedangTayang] ✅ (${item.tipe}) "${item.judul}" ${item.episodeLabel} → ${daftarGrup.length} grup`);
                                                        await new Promise(r => setTimeout(r, 1500));
                                                }
                                        } catch (err) {
                                                console.error('[Animasu][SedangTayang] Error scheduler:', err?.message);
                                        }
                                };

                                // Widget 2: Baru Ditambah & Diperbarui
                                const runAnimasuUpdate = async () => {
                                        try {
                                                const daftarGrup = _am.getEnabledGroups();
                                                if (!daftarGrup.length) return;

                                                const perubahan = await _am.cariPerubahanBaruDiperbarui();
                                                if (!perubahan.length) return;

                                                for (const item of perubahan) {
                                                        const kunci = _am.kunciTerkirimWidget('update', item);
                                                        if (_am.sudahTerkirimWidget('update', kunci)) {
                                                                console.log(`[Animasu][BaruUpdate] ⏭️ sudah terkirim, lewati "${item.judul}" ${item.episodeLabel}`);
                                                                continue;
                                                        }
                                                        const hasil = await _am.buatPesanLengkapMonitor(item);
                                                        await kirimKeGrup(daftarGrup, hasil.caption, item.cover || null);
                                                        _am.tandaiTerkirimWidget('update', kunci, item.slug, `${item.episodeLabel} | ${item.statusLabel}`);
                                                        console.log(`[Animasu][BaruUpdate] ✅ (${item.tipe}) "${item.judul}" ${item.episodeLabel} → ${daftarGrup.length} grup`);
                                                        await new Promise(r => setTimeout(r, 1500));
                                                }
                                        } catch (err) {
                                                console.error('[Animasu][BaruUpdate] Error scheduler:', err?.message);
                                        }
                                };

                                // Mulai 30 detik setelah start (setelah infowibu), 2 widget di-stagger
                                // 15 detik supaya tidak nge-fetch homepage barengan.
                                setTimeout(() => {
                                        runAnimasuTayang();
                                        global.animasuInterval = setInterval(runAnimasuTayang, AM_INTERVAL_MS);
                                }, 30000);
                                setTimeout(() => {
                                        runAnimasuUpdate();
                                        global.animasuUpdateInterval = setInterval(runAnimasuUpdate, AM_INTERVAL_MS);
                                }, 45000);
                        }
                        /* =================== END AUTO ANIMASU SCHEDULER =================== */

                        /* =================== AUTO AN1GAME SCHEDULER =================== */

                        // Helper: kirim notif AniGame — gambar+caption+button dalam SATU pesan
                        // captionBtn  = caption tanpa link download (untuk body interactive msg)
                        // captionText = caption dengan link download (untuk fallback plain text)
                        const kirimAnigameInteraktif = async (jid, imgBuffer, captionBtn, apkUrl, gameUrl, captionText = null) => {
                                const capFallback = captionText || captionBtn;
                                // Kalau ga ada direct APK, tombol Download tetap muncul → arah ke game page
                                const dlUrl  = apkUrl || gameUrl;
                                const btnList = [];
                                if (dlUrl)   btnList.push({ name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '📥 Download MOD APK', url: dlUrl,  merchant_url: dlUrl  }) });
                                if (gameUrl) btnList.push({ name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '🔗 Halaman Game',     url: gameUrl, merchant_url: gameUrl }) });

                                // Kalau ga ada URL sama sekali — kirim biasa
                                if (!btnList.length) {
                                        if (imgBuffer) await hisoka.sendMessage(jid, { image: imgBuffer, caption: capFallback });
                                        else           await hisoka.sendMessage(jid, { text: capFallback });
                                        return;
                                }

                                try {
                                        // Siapkan media header jika ada gambar
                                        const headerMedia = imgBuffer
                                                ? await prepareWAMessageMedia({ image: imgBuffer }, { upload: hisoka.waUploadToServer })
                                                : {};

                                        const msg = generateWAMessageFromContent(jid, {
                                                interactiveMessage: {
                                                        body:   { text: captionBtn },
                                                        footer: { text: '🌐 AN1.COM — APK MOD Gratis' },
                                                        header: { title: '', hasMediaAttachment: !!imgBuffer, ...headerMedia },
                                                        nativeFlowMessage: { messageParamsJson: '{}', buttons: btnList },
                                                },
                                        }, {});

                                        await hisoka.relayMessage(msg.key.remoteJid, msg.message, {
                                                messageId: msg.key.id,
                                                additionalNodes: [{ tag: 'biz', attrs: {}, content: [{ tag: 'interactive', attrs: { type: 'native_flow', v: '1' }, content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }] }] }],
                                        });
                                } catch (e) {
                                        console.warn(`[AniGame] ⚠️ Interactive gagal (${e?.message}), fallback`);
                                        if (imgBuffer) await hisoka.sendMessage(jid, { image: imgBuffer, caption: capFallback });
                                        else           await hisoka.sendMessage(jid, { text: capFallback });
                                }
                        };

                        if (global.anigameInterval) {
                                clearInterval(global.anigameInterval);
                                global.anigameInterval = null;
                        }
                        {
                                const _ag             = await importLazy(path.join(process.cwd(), 'SEMUA_FITUR', 'tools', 'an1game.js'));
                                const AG_INTERVAL_MS  = 10 * 60 * 1000; // 10 menit

                                const runAnigame = async () => {
                                        try {
                                                const daftarGrup = _ag.getEnabledGroups();
                                                if (!daftarGrup.length) return;

                                                const gameBaru = await _ag.cariGameBaru();
                                                if (!gameBaru.length) {
                                                        return;
                                                }

                                                console.log(`[AniGame] 🎮 ${gameBaru.length} game baru ditemukan!`);

                                                for (const game of gameBaru) {
                                                        const caption    = _ag.buatCaption(game, game, { hideDownload: false }); // fallback plain text
                                                        const captionBtn = _ag.buatCaption(game, game, { hideDownload: true  }); // untuk button msg
                                                        const urlGambar  = game.image || null;

                                                        // Download image dulu sebagai buffer dengan header Referer
                                                        // Retry 3x, validasi magic bytes, support jpg/png/webp/gif
                                                        let imgBuffer = null;
                                                        if (urlGambar) {
                                                                const axios = (await import('axios')).default;
                                                                const IMG_HEADERS = {
                                                                        'Referer'        : 'https://an1.com/',
                                                                        'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                                                                        'Accept'         : 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                                                                        'Accept-Encoding': 'gzip, deflate, br',
                                                                };

                                                                // Deteksi mime type dari magic bytes buffer
                                                                const detectMime = (buf) => {
                                                                        if (!buf || buf.length < 4) return null;
                                                                        if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
                                                                        if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
                                                                        if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
                                                                        if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'image/webp';
                                                                        return null;
                                                                };

                                                                for (let attempt = 1; attempt <= 3; attempt++) {
                                                                        try {
                                                                                const resp = await axios.get(urlGambar, {
                                                                                        responseType: 'arraybuffer',
                                                                                        timeout: 20000,
                                                                                        headers: IMG_HEADERS,
                                                                                });
                                                                                const buf  = Buffer.from(resp.data);
                                                                                const mime = detectMime(buf);
                                                                                if (!mime) {
                                                                                        console.warn(`[AniGame] ⚠️ Attempt ${attempt}: Buffer bukan gambar valid (${buf.length} bytes), skip`);
                                                                                        continue;
                                                                                }
                                                                                imgBuffer = buf;
                                                                                console.log(`[AniGame] 🖼️ Gambar OK: ${buf.length} bytes (${mime}) [attempt ${attempt}]`);
                                                                                break;
                                                                        } catch (imgErr) {
                                                                                console.warn(`[AniGame] ⚠️ Attempt ${attempt}/3 download gambar gagal: ${imgErr?.message}`);
                                                                                if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
                                                                        }
                                                                }
                                                                if (!imgBuffer) console.warn(`[AniGame] ⚠️ Semua attempt gagal — kirim teks saja`);
                                                        }

                                                        // Ekstrak URL untuk tombol interaktif
                                                        const apkUrl  = game.downloadUrl || '';
                                                        const gameUrl = game.url         || '';

                                                        // Kirim ke semua grup aktif (batch 5) — pakai interactive message + URL button
                                                        let berhasil = 0, gagal = 0;
                                                        const BATCH = 5;
                                                        for (let i = 0; i < daftarGrup.length; i += BATCH) {
                                                                const chunk   = daftarGrup.slice(i, i + BATCH);
                                                                const results = await Promise.allSettled(chunk.map(async jid => {
                                                                        await kirimAnigameInteraktif(jid, imgBuffer, captionBtn, apkUrl, gameUrl, caption);
                                                                }));
                                                                for (const r of results) {
                                                                        if (r.status === 'fulfilled') berhasil++;
                                                                        else {
                                                                                gagal++;
                                                                                console.error(`[AniGame] Gagal kirim ke grup:`, r.reason?.message);
                                                                        }
                                                                }
                                                                if (i + BATCH < daftarGrup.length) await new Promise(r => setTimeout(r, 1000));
                                                        }

                                                        // Tandai terkirim hanya jika minimal 1 grup berhasil menerima
                                                        if (berhasil > 0) {
                                                                _ag.tandaiDanLog(game, daftarGrup);
                                                                console.log(`[AniGame] ✅ "${game.title || game.fullTitle}" terkirim ke ${berhasil}/${daftarGrup.length} grup`);
                                                        } else {
                                                                console.error(`[AniGame] ❌ "${game.title || game.fullTitle}" GAGAL dikirim ke semua grup (${gagal} gagal) — TIDAK ditandai terkirim, akan dicoba lagi nanti`);
                                                        }
                                                        await new Promise(r => setTimeout(r, 2000));
                                                }
                                        } catch (err) {
                                                console.error('[AniGame] Error scheduler:', err?.message);
                                        }
                                };

                                // Mulai 60 detik setelah start (setelah animasu)
                                setTimeout(() => {
                                        runAnigame();
                                        global.anigameInterval = setInterval(runAnigame, AG_INTERVAL_MS);
                                }, 60000);
                        }
                        /* =================== END AUTO AN1GAME SCHEDULER =================== */

                        /* =================== AUTO ALQANIME NOTIF SCHEDULER =================== */
                        if (global.alqanimeInterval) {
                                clearInterval(global.alqanimeInterval);
                                global.alqanimeInterval = null;
                        }
                        {
                                const ALQ_PATH       = path.join(process.cwd(), 'SEMUA_FITUR', 'anime', 'alqanime-monitor.js');
                                const ALQ_INTERVAL_MS = 60 * 1000;

                                const ALQ_SCRAPE_PATH = path.join(process.cwd(), 'SEMUA_FITUR', 'anime', 'alqanime.js');

                                const runAlqanime = async () => {
                                        if (global.alqanimeRunning) return;
                                        global.alqanimeRunning = true;
                                        try {
                                                        const _alq = await importLazy(ALQ_PATH);

                                                const daftarGrup = _alq.getEnabledGroups();
                                                if (!daftarGrup.length) return;

                                                // cariEpisodeBaru sekarang return { episodes, perubahanHangat, lagiHangat }
                                                const hasil        = await _alq.cariEpisodeBaru();
                                                const episodeBaru  = Array.isArray(hasil) ? hasil : (hasil.episodes || []);
                                                const hangat       = Array.isArray(hasil) ? [] : (hasil.perubahanHangat || []);
                                                const allHangat    = Array.isArray(hasil) ? [] : (hasil.lagiHangat || []);

                                                // ── Kirim notif EPISODE/BATCH BARU ────────────────────────────────────
                                                if (episodeBaru.length) {
                                                        const sudahKirimEp = new Set();
                                                        const episodeUnik  = episodeBaru.filter(item => {
                                                                const key = item.id || `${item.url}::${item.epNum}`;
                                                                if (sudahKirimEp.has(key)) return false;
                                                                sudahKirimEp.add(key);
                                                                return true;
                                                        });

                                                        for (const item of episodeUnik) {
                                                                const caption   = _alq.buatCaptionGabung(item);
                                                                const urlGambar = _alq.ambilUrlGambar(item);

                                                                let imgBuffer  = null;
                                                                let imgSendUrl = null;
                                                                if (urlGambar) {
                                                                        imgBuffer  = await _alq.downloadImageBuffer(urlGambar);
                                                                        if (!imgBuffer) imgSendUrl = _alq.buatProxyUrl(urlGambar);
                                                                }

                                                                const BATCH = 5;
                                                                for (let i = 0; i < daftarGrup.length; i += BATCH) {
                                                                        const chunk = daftarGrup.slice(i, i + BATCH);
                                                                        await Promise.allSettled(chunk.map(async jid => {
                                                                                try {
                                                                                        if (imgBuffer) {
                                                                                                await hisoka.sendMessage(jid, { image: imgBuffer, mimetype: 'image/jpeg', caption });
                                                                                        } else if (imgSendUrl) {
                                                                                                await hisoka.sendMessage(jid, { image: { url: imgSendUrl }, caption });
                                                                                        } else {
                                                                                                await hisoka.sendMessage(jid, { text: caption });
                                                                                        }
                                                                                } catch (e) {
                                                                                        console.error(`[AlqanimeNotif] Gagal kirim ep ke ${jid}:`, e?.message);
                                                                                }
                                                                        }));
                                                                        if (i + BATCH < daftarGrup.length) await new Promise(r => setTimeout(r, 1000));
                                                                }

                                                                _alq.tandaiDanLog(item, daftarGrup);
                                                                const labelRilisan = _alq.buatLabelRilisan(item);
                                                                console.log(`[AlqanimeNotif] ✅ ${labelRilisan} "${item.judul}" terkirim ke ${daftarGrup.length} grup`);
                                                                await new Promise(r => setTimeout(r, 2000));
                                                        }
                                                }

                                                // ── Kirim notif LAGI HANGAT (pesan terpisah) ──────────────────────────
                                                if (hangat.length && allHangat.length) {
                                                        const captionHangat = _alq.buatCaptionHangat(hangat, allHangat);
                                                        const BATCH = 5;
                                                        for (let i = 0; i < daftarGrup.length; i += BATCH) {
                                                                const chunk = daftarGrup.slice(i, i + BATCH);
                                                                await Promise.allSettled(chunk.map(async jid => {
                                                                        try {
                                                                                await hisoka.sendMessage(jid, { text: captionHangat });
                                                                        } catch (e) {
                                                                                console.error(`[AlqanimeNotif] Gagal kirim hangat ke ${jid}:`, e?.message);
                                                                        }
                                                                }));
                                                                if (i + BATCH < daftarGrup.length) await new Promise(r => setTimeout(r, 1000));
                                                        }
                                                        console.log(`[AlqanimeNotif] 🔥 Lagi Hangat berubah (${hangat.length} baru) — terkirim ke ${daftarGrup.length} grup`);
                                                }

                                        } catch (err) {
                                                console.error('[AlqanimeNotif] Error scheduler:', err?.message);
                                        } finally {
                                                global.alqanimeRunning = false;
                                        }
                                };

                                // Mulai 45 detik setelah start (setelah animasu)
                                setTimeout(() => {
                                        runAlqanime();
                                        global.alqanimeInterval = setInterval(runAlqanime, ALQ_INTERVAL_MS);
                                }, 45000);
                        }
                        /* ================= END AUTO ALQANIME NOTIF SCHEDULER ================= */
                        /* =================== AUTO DOUJINDESU NOTIF SCHEDULER =================== */
                        if (global.doujindesuInterval) {
                                clearInterval(global.doujindesuInterval);
                                global.doujindesuInterval = null;
                        }
                        if (global.doujindesuStartTimeout) {
                                clearTimeout(global.doujindesuStartTimeout);
                                global.doujindesuStartTimeout = null;
                        }
                        {
                                const DOUJIN_PATH = path.join(process.cwd(), 'SEMUA_FITUR', 'anime', 'doujindesu-monitor.js');
                                const DOUJIN_INTERVAL_MS = 60 * 1000;
                                
                                const runDoujin = async () => {
                                        if (global.doujindesuRunning) return;
                                        global.doujindesuRunning = true;
                                        try {
                                                const doujinMonitor = await importLazy(DOUJIN_PATH);
                                                await doujinMonitor.processNewChapters(hisoka);
                                        } catch (err) {
                                                console.error('[DoujinMonitor] Error scheduler:', err?.message);
                                        } finally {
                                                global.doujindesuRunning = false;
                                        }
                                };

                                global.doujindesuStartTimeout = setTimeout(() => {
                                        global.doujindesuStartTimeout = null;
                                        runDoujin();
                                        global.doujindesuInterval = setInterval(runDoujin, DOUJIN_INTERVAL_MS);
                                }, 50000);
                        }
                        /* ================= END AUTO DOUJINDESU NOTIF SCHEDULER ================= */


                        /* =================== AUTO NEKOPOI NOTIF SCHEDULER =================== */
                        if (global.nekopoinotifInterval) {
                                clearInterval(global.nekopoinotifInterval);
                                global.nekopoinotifInterval = null;
                        }
                        {
                                const NEKO_PATH        = path.join(process.cwd(), 'SEMUA_FITUR', 'anime', 'nekopoi-monitor.js');
                                const NEKO_SCRAPE_PATH = path.join(process.cwd(), 'SEMUA_FITUR', 'anime', 'nekopoi.js');
                                const NEKO_INTERVAL_MS = 1 * 60 * 1000; // 1 menit

                                const runNekopoinotif = async () => {
                                        if (global.nekopoinotifRunning) return;
                                        global.nekopoinotifRunning = true;
                                        try {
                                                        const _neko = await importLazy(NEKO_PATH);

                                                const daftarGrup = _neko.getEnabledGroups();
                                                if (!daftarGrup.length) return;

                                                const kontenBaru = await _neko.cariKontenBaru();
                                                if (!kontenBaru.length) return;

                                                const sudahKirim = new Set();
                                                const unikList   = kontenBaru.filter(item => {
                                                        const key = item.id || item.url;
                                                        if (sudahKirim.has(key)) return false;
                                                        sudahKirim.add(key);
                                                        return true;
                                                });

                                                for (const item of unikList) {
                                                        const caption   = _neko.buatCaption(item);
                                                        const urlGambar = item.thumbnail || null;

                                                        let imgBuffer  = null;
                                                        let imgSendUrl = null;
                                                        if (urlGambar) {
                                                                imgBuffer  = await _neko.downloadImageBuffer(urlGambar);
                                                                if (!imgBuffer) imgSendUrl = _neko.buatProxyUrl(urlGambar);
                                                        }

                                                        const BATCH = 5;
                                                        for (let i = 0; i < daftarGrup.length; i += BATCH) {
                                                                const chunk = daftarGrup.slice(i, i + BATCH);
                                                                await Promise.allSettled(chunk.map(async jid => {
                                                                        try {
                                                                                if (imgBuffer) {
                                                                                        await hisoka.sendMessage(jid, { image: imgBuffer, mimetype: 'image/jpeg', caption });
                                                                                } else if (imgSendUrl) {
                                                                                        try {
                                                                                                await hisoka.sendMessage(jid, { image: { url: imgSendUrl }, caption });
                                                                                        } catch (_) {
                                                                                                // Proxy gambar mati → caption teks tetap terkirim,
                                                                                                // item tidak hilang diam-diam walau ditandai terkirim.
                                                                                                await hisoka.sendMessage(jid, { text: caption });
                                                                                        }
                                                                                } else {
                                                                                        await hisoka.sendMessage(jid, { text: caption });
                                                                                }
                                                                        } catch (e) {
                                                                                console.error(`[NekopoinNotif] Gagal kirim ke ${jid}:`, e?.message);
                                                                        }
                                                                }));
                                                                if (i + BATCH < daftarGrup.length) await new Promise(r => setTimeout(r, 1000));
                                                        }

                                                        _neko.tandaiDanLog(item, daftarGrup);
                                                        console.log(`[NekopoinNotif] ✅ "${item.title}" [${item.kategori}] terkirim ke ${daftarGrup.length} grup`);
                                                        await new Promise(r => setTimeout(r, 2000));
                                                }
                                        } catch (err) {
                                                console.error('[NekopoinNotif] Error scheduler:', err?.message);
                                        } finally {
                                                global.nekopoinotifRunning = false;
                                        }
                                };

                                // Mulai 60 detik setelah start (setelah alqanime)
                                setTimeout(() => {
                                        runNekopoinotif();
                                        global.nekopoinotifInterval = setInterval(runNekopoinotif, NEKO_INTERVAL_MS);
                                }, 60000);
                        }
                        /* ================= END AUTO NEKOPOI NOTIF SCHEDULER ================= */

                        /* ================= AUTO HENTAICOP NOTIF SCHEDULER ================= */
                        if (global.hentaicopnotifInterval) {
                                clearInterval(global.hentaicopnotifInterval);
                                global.hentaicopnotifInterval = null;
                        }
                        {
                                const HC_PATH        = path.join(process.cwd(), 'SEMUA_FITUR', 'anime', 'hentaicop-monitor.js');
                                const HC_SCRAPE_PATH = path.join(process.cwd(), 'SEMUA_FITUR', 'anime', 'hentaicop.js');
                                const HC_INTERVAL_MS = 1 * 60 * 1000; // 1 menit

                                const runHentaicopnotif = async () => {
                                        if (global.hentaicopnotifRunning) return;
                                        global.hentaicopnotifRunning = true;
                                        try {
                                                        const _hc = await importLazy(HC_PATH);

                                                const daftarGrup = _hc.getEnabledGroups();
                                                if (!daftarGrup.length) return;

                                                const kontenBaru = await _hc.cariKontenBaru();
                                                if (!kontenBaru.length) return;

                                                const sudahKirim = new Set();
                                                const unikList   = kontenBaru.filter(item => {
                                                        const key = item.id || item.url;
                                                        if (sudahKirim.has(key)) return false;
                                                        sudahKirim.add(key);
                                                        return true;
                                                });

                                                for (const item of unikList) {
                                                        const caption   = _hc.buatCaption(item);
                                                        const urlGambar = item.thumbnail || null;

                                                        let imgBuffer  = null;
                                                        let imgSendUrl = null;
                                                        if (urlGambar) {
                                                                imgBuffer  = await _hc.downloadImageBuffer(urlGambar);
                                                                if (!imgBuffer) imgSendUrl = _hc.buatProxyUrl(urlGambar);
                                                        }

                                                        const BATCH = 5;
                                                        for (let i = 0; i < daftarGrup.length; i += BATCH) {
                                                                const chunk = daftarGrup.slice(i, i + BATCH);
                                                                await Promise.allSettled(chunk.map(async jid => {
                                                                        try {
                                                                                if (imgBuffer) {
                                                                                        await hisoka.sendMessage(jid, { image: imgBuffer, mimetype: 'image/jpeg', caption });
                                                                                } else if (imgSendUrl) {
                                                                                        await hisoka.sendMessage(jid, { image: { url: imgSendUrl }, caption });
                                                                                } else {
                                                                                        await hisoka.sendMessage(jid, { text: caption });
                                                                                }
                                                                        } catch (e) {
                                                                                console.error(`[HentaicopNotif] Gagal kirim ke ${jid}:`, e?.message);
                                                                        }
                                                                }));
                                                                if (i + BATCH < daftarGrup.length) await new Promise(r => setTimeout(r, 1000));
                                                        }

                                                        _hc.tandaiDanLog(item, daftarGrup);
                                                        console.log(`[HentaicopNotif] ✅ "${item.title}" [${item.kategori}] terkirim ke ${daftarGrup.length} grup`);
                                                        await new Promise(r => setTimeout(r, 2000));
                                                }
                                        } catch (err) {
                                                console.error('[HentaicopNotif] Error scheduler:', err?.message);
                                        } finally {
                                                global.hentaicopnotifRunning = false;
                                        }
                                };

                                // Mulai 90 detik setelah start (setelah nekopoi)
                                setTimeout(() => {
                                        runHentaicopnotif();
                                        global.hentaicopnotifInterval = setInterval(runHentaicopnotif, HC_INTERVAL_MS);
                                }, 90000);
                        }
                        /* =============== END AUTO HENTAICOP NOTIF SCHEDULER =============== */

                        /* ===================== AUTO TVONENEWS SCHEDULER ===================== */
                        if (global.tvoneInterval) {
                                clearInterval(global.tvoneInterval);
                                global.tvoneInterval = null;
                        }
                        {
                                const TV_TVPATH    = path.join(process.cwd(), 'SEMUA_FITUR', 'news', 'tvonenews.js');
                                const TV_INTERVAL_MS = 5 * 60 * 1000;

                                const runTVOne = async () => {
                                        try {
                                                // Selalu reload modul supaya perubahan langsung aktif
                                                const _tv = await importLazy(TV_TVPATH);

                                                const daftarGrup = _tv.getEnabledGroups();
                                                if (!daftarGrup.length) return;

                                                const beritaBaru = await _tv.cariBeritaBaru();
                                                if (!beritaBaru.length) return;

                                                for (const item of beritaBaru) {
                                                        const caption   = _tv.buatCaption(item);
                                                        const urlGambar = item.cover || null;

                                                        // Download buffer dulu → kompatibel semua versi WA
                                                        let imgBuffer = null;
                                                        if (urlGambar) {
                                                                imgBuffer = await _tv.downloadImageBuffer(urlGambar);
                                                        }

                                                        // Kirim ke semua grup secara parallel (batch 5)
                                                        const TV_BATCH = 5;
                                                        for (let i = 0; i < daftarGrup.length; i += TV_BATCH) {
                                                                const chunk = daftarGrup.slice(i, i + TV_BATCH);
                                                                await Promise.allSettled(chunk.map(async jid => {
                                                                        try {
                                                                                if (imgBuffer) {
                                                                                        await hisoka.sendMessage(jid, {
                                                                                                image   : imgBuffer,
                                                                                                mimetype: 'image/jpeg',
                                                                                                caption,
                                                                                        });
                                                                                } else if (urlGambar) {
                                                                                        await hisoka.sendMessage(jid, {
                                                                                                image: { url: urlGambar },
                                                                                                caption,
                                                                                        });
                                                                                } else {
                                                                                        await hisoka.sendMessage(jid, { text: caption });
                                                                                }
                                                                        } catch (e) {
                                                                                console.error(`[TVOneNews] Gagal kirim ke ${jid}:`, e?.message);
                                                                        }
                                                                }));
                                                                if (i + TV_BATCH < daftarGrup.length) {
                                                                        await new Promise(r => setTimeout(r, 1000));
                                                                }
                                                        }

                                                        _tv.tandaiDanLog(item, daftarGrup);
                                                        console.log(`[TVOneNews] ✅ "${item.judul?.slice(0,50)}" terkirim ke ${daftarGrup.length} grup (parallel)`);
                                                }
                                        } catch (err) {
                                                console.error('[TVOneNews] Error scheduler:', err?.message);
                                        }
                                };

                                // Mulai 45 detik setelah start, lalu setiap 5 menit
                                setTimeout(() => {
                                        runTVOne();
                                        global.tvoneInterval = setInterval(runTVOne, TV_INTERVAL_MS);
                                }, 45000);
                        }
                        /* =================== END AUTO TVONENEWS SCHEDULER =================== */

                        /* ===================== AUTO MALNEWS SCHEDULER ===================== */
                        if (global.malnewsInterval) {
                                clearInterval(global.malnewsInterval);
                                global.malnewsInterval = null;
                        }
                        {
                                const MAL_PATH        = path.join(process.cwd(), 'SEMUA_FITUR', 'news', 'malnews.js');
                                const MAL_INTERVAL_MS = 5 * 60 * 1000;

                                const runMALNews = async () => {
                                        try {
                                                const _mal = await importLazy(MAL_PATH);

                                                const daftarGrup = _mal.getEnabledGroups();
                                                if (!daftarGrup.length) return;

                                                const beritaBaru = await _mal.cariBeritaBaru();
                                                if (!beritaBaru.length) return;

                                                for (const item of beritaBaru) {
                                                        const caption   = _mal.buatCaption(item);
                                                        const urlGambar = _mal.ambilUrlGambar(item);

                                                        const MAL_BATCH = 5;
                                                        for (let i = 0; i < daftarGrup.length; i += MAL_BATCH) {
                                                                const chunk = daftarGrup.slice(i, i + MAL_BATCH);
                                                                await Promise.allSettled(chunk.map(async jid => {
                                                                        try {
                                                                                if (urlGambar) {
                                                                                        await hisoka.sendMessage(jid, {
                                                                                                image  : { url: urlGambar },
                                                                                                caption,
                                                                                        });
                                                                                } else {
                                                                                        await hisoka.sendMessage(jid, { text: caption });
                                                                                }
                                                                        } catch (e) {
                                                                                console.error(`[MALNews] Gagal kirim ke ${jid}:`, e?.message);
                                                                        }
                                                                }));
                                                                if (i + MAL_BATCH < daftarGrup.length) {
                                                                        await new Promise(r => setTimeout(r, 1000));
                                                                }
                                                        }

                                                        _mal.tandaiDanLog(item, daftarGrup);
                                                        console.log(`[MALNews] ✅ "${(item.judulID || item.judul)?.slice(0,50)}" terkirim ke ${daftarGrup.length} grup`);
                                                }
                                        } catch (err) {
                                                console.error('[MALNews] Error scheduler:', err?.message);
                                        }
                                };

                                // Mulai 60 detik setelah start, lalu setiap 5 menit
                                setTimeout(() => {
                                        runMALNews();
                                        global.malnewsInterval = setInterval(runMALNews, MAL_INTERVAL_MS);
                                }, 60000);
                        }
                        /* =================== END AUTO MALNEWS SCHEDULER =================== */

                        /* ===================== AUTO SHOLAT SCHEDULER ===================== */
                        if (global.autoSholatInterval) {
                                clearInterval(global.autoSholatInterval);
                                global.autoSholatInterval = null;
                        }
                        {
                                const AS_PATH = path.join(process.cwd(), 'SEMUA_FITUR', 'setting', 'autosholat.js');
                                // Lacak sholat yang sudah dikirim hari ini (reset otomatis tiap hari baru)
                                let _sholatTerkirimHariIni = new Set();
                                let _hariTerakhirSholat    = '';

                                const runAutoSholat = async () => {
                                        try {
                                                const _as = await importLazy(AS_PATH);
                                                const daftarGrup = _as.getEnabledGroups();
                                                if (!daftarGrup.length) return;

                                                // Reset tracker setiap hari baru (WIB)
                                                const hariIni = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
                                                if (_hariTerakhirSholat !== hariIni) {
                                                        _sholatTerkirimHariIni = new Set();
                                                        _hariTerakhirSholat    = hariIni;
                                                }

                                                const cocok = await _as.cekWaktuSholat();
                                                if (!cocok) return;
                                                if (_sholatTerkirimHariIni.has(cocok.nama)) return; // sudah dikirim
                                                _sholatTerkirimHariIni.add(cocok.nama);

                                                const jadwal  = await _as.getJadwalHariIni();
                                                const caption = _as.buatCaption(cocok.nama, cocok.waktu, jadwal);
                                                const urlGbr  = await _as.buatGambarOverlay(cocok.nama, cocok.waktu);
                                                const urlAud  = _as.getAudio(cocok.nama);

                                                // Konversi MP3 → OGG/Opus + generate waveform sekali sebelum dikirim ke semua grup
                                                let _asVnBuf   = null;
                                                let _asWaveform = null;
                                                try {
                                                        const { toVoiceNote: _asToVN, generateWaveform: _asGenWF } = await importLazy(path.resolve('././SEMUA_FITUR/media/audioconvert.js'));
                                                        const _asAudBuf = await _as.ambilAudioAdzan(cocok.nama);
                                                        _asVnBuf    = await _asToVN(_asAudBuf, 'audio/mpeg');
                                                        _asWaveform = await _asGenWF(_asVnBuf, 'audio/ogg; codecs=opus').catch(() => null);
                                                } catch (_asConvErr) {
                                                        console.error('[AutoSholat] Gagal konversi audio:', _asConvErr?.message);
                                                }

                                                console.log(`[AutoSholat] ⏰ ${cocok.nama} ${cocok.waktu} WIB → kirim ke ${daftarGrup.length} grup`);

                                                const AS_BATCH = 5;
                                                for (let i = 0; i < daftarGrup.length; i += AS_BATCH) {
                                                        const chunk = daftarGrup.slice(i, i + AS_BATCH);

                                                        await Promise.allSettled(chunk.map(async jid => {
                                                                try {
                                                                        // SATU gambar + tombol owner (URL owner config.json);
                                                                        // tanpa externalAdReply → tanpa thumbnail duplikat.
                                                                        // Tanpa owner di config → gambar biasa (tetap 1 gambar).
                                                                        // Helper SAMA dengan .autosholat test → test = realtime.
                                                                        const _asCfgS   = loadConfig();
                                                                        const _asOwnerS = Array.isArray(_asCfgS.owners) ? (_asCfgS.owners[0] || '') : '';
                                                                        const _asBtnUrl = _asOwnerS ? `https://wa.me/${_asOwnerS}` : null;
                                                                        const imgMsg = await _as.kirimSholatInteraktif(hisoka, jid, urlGbr, caption, _asBtnUrl);
                                                                        if (_asVnBuf) {
                                                                                await hisoka.sendMessage(jid, {
                                                                                        audio   : _asVnBuf,
                                                                                        ptt     : true,
                                                                                        mimetype: 'audio/ogg; codecs=opus',
                                                                                        ...(_asWaveform ? { waveform: _asWaveform } : {}),
                                                                                }, { quoted: imgMsg });
                                                                        }
                                                                } catch (e) {
                                                                        console.error(`[AutoSholat] Gagal kirim ke ${jid}:`, e?.message);
                                                                }
                                                        }));
                                                        if (i + AS_BATCH < daftarGrup.length) {
                                                                await new Promise(r => setTimeout(r, 1500));
                                                        }
                                                }
                                                console.log(`[AutoSholat] ✅ ${cocok.nama} terkirim ke ${daftarGrup.length} grup`);
                                        } catch (err) {
                                                console.error('[AutoSholat] Error scheduler:', err?.message);
                                        }
                                };

                                // Validasi gambar di startup
                                try {
                                        const IMG_DIR = path.join(process.cwd(), 'img', 'sholat');
                                        const requiredImgs = ['subuh.png', 'zuhur.png', 'ashar.png', 'maghrib.png', 'isya.png'];
                                        for (const img of requiredImgs) {
                                                const filePath = path.join(IMG_DIR, img);
                                                if (!fs.existsSync(filePath)) throw new Error(`Gambar sholat tidak ditemukan: ${filePath}`);
                                        }
                                        console.log('[AutoSholat] Validasi gambar OK');
                                        
                                        // Cek setiap 60 detik, mulai setelah 10 detik
                                        setTimeout(() => {
                                                runAutoSholat();
                                                global.autoSholatInterval = setInterval(runAutoSholat, 60 * 1000);
                                        }, 10000);
                                } catch (err) {
                                        console.error('[AutoSholat] Startup gagal:', err?.message);
                                }
                        }
                        /* =================== END AUTO SHOLAT SCHEDULER =================== */

                        // Auto-start jadibot sekarang dilakukan di level startup proses (lihat bawah)
                        // agar jadibot jalan SEGERA tanpa menunggu bot utama selesai pairing
                } // tutup if (connection === 'open') [auto-start block]

                if (connection === 'open') {
                        if (global.__connectWatchdog) {
                                clearTimeout(global.__connectWatchdog);
                                global.__connectWatchdog = null;
                        }
                        // Pastikan registered = true tersimpan permanen setelah terhubung
                        // Tangkap dulu state sebelum diubah agar bisa dipakai di bawah
                        const _wasFirstPairing = !state.creds.registered;
                        if (_wasFirstPairing) {
                                state.creds.registered = true;
                                saveCreds();
                        }
                        // Setiap kali bot berhasil terhubung (pairing baru MAUPUN reconnect),
                        // sync pairedBrowserKey = browserDevice.selected.
                        // Ini memastikan menu & .aturbrowser selalu tampil browser yang BENAR-BENAR terhubung.
                        try {
                                const _pairCfg = loadConfig();
                                const _pairKey = (_pairCfg.browserDevice?.selected || 'v1').toLowerCase();
                                if (_pairCfg.pairedBrowserKey !== _pairKey) {
                                        _pairCfg.pairedBrowserKey = _pairKey;
                                        saveConfig(_pairCfg);
                                }
                                const _pairInfo = BROWSER_LIST.find(b => b.key === _pairKey) || BROWSER_LIST[0];
                                global.__activeBrowserKey = _pairKey;
                                global.__activeBrowserArr = _pairInfo.value;
                        } catch {}
                }

                if (connection === 'close') {
                        if (global.autoOnlineInterval) {
                                clearInterval(global.autoOnlineInterval);
                                global.autoOnlineInterval = null;
                                console.log(`\x1b[33m[AutoOnline]\x1b[39m Cleared on disconnect`);
                        }

                        // Internal restart diminta (browser switch) — jangan reconnect otomatis di sini
                        if (global.__skipNextReconnect) {
                                console.log('\x1b[33m[InternalRestart]\x1b[39m Skip reconnect otomatis — internal restart sudah dijadwalkan.');
                                return;
                        }

                        const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode || 0;
                        const C = '\x1b[36m', Y = '\x1b[33m', R = '\x1b[0m', B = '\x1b[1m';

                        switch (statusCode) {
                                case DisconnectReason.loggedOut: {
                                        console.log('');
                                        console.log(`${C}════════════════════════════════════${R}`);
                                        console.log(`${B}${Y}⚠️  BOT UTAMA LOGOUT — RE-AUTH${R}`);
                                        console.log(`${C}════════════════════════════════════${R}`);
                                        console.log(`${Y}• Sesi bot utama dihapus${R}`);
                                        console.log(`${Y}• Jadibot aktif tetap berjalan${R}`);
                                        console.log(`${Y}• Menampilkan kode pairing / QR baru...${R}`);
                                        console.log(`${C}════════════════════════════════════${R}`);
                                        console.log('');

                                        cleanupSocket();

                                        try { await fs.promises.unlink(sessionFile) } catch {}
                                        try { await fs.promises.rm(sessionDir, { recursive: true, force: true }) } catch {}

                                        await delay(2000);
                                        reconnectCount = 0;
                                        await main();
                                        break;
                                }

                                case DisconnectReason.forbidden: {
                                        // 403 berarti kredensial sesi sudah tidak diterima WA.
                                        // Jangan retry: retry hanya mengulang 403 dan membuat sesi
                                        // yang sudah tidak tertaut terlihat masih aktif.
                                        console.log('');
                                        console.log(`${C}════════════════════════════════════${R}`);
                                        console.log(`${B}${Y}⚠️  FORBIDDEN (403) — SESI TIDAK TERTAUT${R}`);
                                        console.log(`${Y}• Sesi utama dihapus realtime${R}`);
                                        console.log(`${Y}• Tidak ada reconnect attempt${R}`);
                                        console.log(`${Y}• Menampilkan QR / pairing code baru...${R}`);
                                        console.log(`${C}════════════════════════════════════${R}`);
                                        console.log('');

                                        cleanupSocket();
                                        try { await fs.promises.unlink(sessionFile); } catch {}
                                        try { await fs.promises.rm(sessionDir, { recursive: true, force: true }); } catch {}

                                        reconnectCount = 0;
                                        global.__qrSessionStarted = false;
                                        global.__qrSessionExpireAt = null;
                                        global.__qrCount = 0;
                                        global.__pairSessionStartAt = null;
                                        global.__pairSessionExpireAt = null;
                                        if (global.__qrExpiredTimer) {
                                                clearTimeout(global.__qrExpiredTimer);
                                                global.__qrExpiredTimer = null;
                                        }
                                        if (global.__pairingExpiredTimer) {
                                                clearTimeout(global.__pairingExpiredTimer);
                                                global.__pairingExpiredTimer = null;
                                        }

                                        await delay(2000);
                                        await main();
                                        break;
                                }

                                case DisconnectReason.restartRequired:
                                        console.info('\x1b[33mRestart required. Reconnecting...\x1b[39m');
                                        cleanupSocket();
                                        await main();
                                        break;

                                case 408: {
                                        const _now408 = Date.now();
                                        if (hisoka.authState.creds?.registered) {
                                                // Sudah terdaftar (koneksi normal) → reconnect biasa
                                                console.info('\x1b[33mConnection timeout. Reconnecting in 5s...\x1b[39m');
                                                await delay(5000);
                                        } else if (global.__qrSessionExpireAt && _now408 < global.__qrSessionExpireAt) {
                                                // Masih dalam sesi QR — reset ke fresh 3 menit saat reconnect
                                                console.info(`\x1b[33m↻ WA disconnect (408) — reconnect QR otomatis... (QR baru = 3 menit)\x1b[39m`);
                                                global.__qrSessionStarted  = false;
                                                global.__qrSessionExpireAt = null;
                                                global.__qrCount           = 0;
                                                await delay(3000);
                                        } else if (global.__pairSessionExpireAt && _now408 < global.__pairSessionExpireAt) {
                                                // Masih dalam sesi pairing — reset ke fresh 3 menit saat reconnect
                                                console.info(`\x1b[33m↻ WA disconnect (408) — reconnect pairing otomatis... (kode baru = 3 menit)\x1b[39m`);
                                                global.__pairSessionStartAt  = null;
                                                global.__pairSessionExpireAt = null;
                                                await delay(3000);
                                        } else {
                                                // Tidak ada sesi aktif → reset semua & reconnect normal
                                                global.__pairSessionStartAt  = null;
                                                global.__pairSessionExpireAt = null;
                                                global.__qrSessionStarted    = false;
                                                global.__qrSessionExpireAt   = null;
                                                global.__qrCount             = 0;
                                                reconnectCount++;
                                                const waitSec = Math.min(5 * reconnectCount, 60);
                                                console.info(`\x1b[33mConnection timeout. Reconnecting in ${waitSec}s... (Attempt ${reconnectCount})\x1b[39m`);
                                                await delay(waitSec * 1000);
                                        }
                                        cleanupSocket();
                                        await main();
                                        break;
                                }

                                case 515:
                                        console.info('\x1b[33mStream error (515). Reconnecting in 5s...\x1b[39m');
                                        await delay(5000);
                                        cleanupSocket();
                                        await main();
                                        break;

                                case 503:
                                        reconnectCount++;
                                        const waitSvc = Math.min(10 * reconnectCount, 60);
                                        console.warn(`\x1b[33mService unavailable (503). Reconnecting in ${waitSvc}s... (Attempt ${reconnectCount})\x1b[39m`);
                                        await delay(waitSvc * 1000);
                                        cleanupSocket();
                                        await main();
                                        break;

                                default:
                                        reconnectCount++;
                                        const waitSec = Math.min(5 * reconnectCount, 60);
                                        console.error(`\x1b[31mConnection closed [${statusCode}]. Reconnecting in ${waitSec}s... (Attempt ${reconnectCount})\x1b[39m`);
                                        await delay(waitSec * 1000);
                                        cleanupSocket();
                                        await main();
                                        break;
                        }
                }
        });

        hisoka.ev.on('contacts.upsert', async contactsData => {
                try {
                        await Promise.all(
                                contactsData.map(async contact => {
                                        try {
                                                const jid = await hisoka.resolveLidToPN({ remoteJid: contact.id, remoteJidAlt: contact.phoneNumber });
                                                const existingContact = (await contacts.read(jid)) || {};
                                                contacts.write(
                                                        jid,
                                                        Object.assign(
                                                                isLidUser(contact.id) ? { id: jid, lid: contact.id } : {},
                                                                { isContact: true },
                                                                existingContact,
                                                                contact
                                                        )
                                                );
                                        } catch (_) {}
                                })
                        );
                } catch (err) { console.error('[contacts.upsert]', err?.message); }
        });

        hisoka.ev.on('contacts.update', async contactsData => {
                try {
                        await Promise.all(
                                contactsData.map(async contact => {
                                        try {
                                                const jid = await hisoka.resolveLidToPN({ remoteJid: contact.id, remoteJidAlt: contact.phoneNumber });
                                                const existingContact = (await contacts.read(jid)) || {};
                                                contacts.write(
                                                        jid,
                                                        Object.assign(isLidUser(contact.id) ? { id: jid, lid: contact.id } : {}, existingContact, contact)
                                                );
                                        } catch (_) {}
                                })
                        );
                } catch (err) { console.error('[contacts.update]', err?.message); }
        });

        hisoka.ev.on('groups.upsert', async groupsData => {
                try { await Promise.all(
                        groupsData.map(async group => {
                                try {
                                const groupId = group.id;
                                const existingGroup = groups.read(groupId) || {};
                                groups.write(groupId, { ...existingGroup, ...group });

                                // Auto-add ke Anti Tag SW jika global aktif
                                autoAddGroupToAntiTagSW(groupId);

                                if (process.env.BOT_AUTO_UPSWGC === 'true') {
                                        try {
                                                await delay(2000);
                                                const groupMetadata = await hisoka.groupMetadata(groupId);
                                                const allMembers = groupMetadata.participants.map(p => p.id);
                                                const groupName = groupMetadata.subject;
                                                
                                                const storyText = `🎉 Bot telah bergabung ke grup:\n\n*${groupName}*\n\nKetik .menu untuk melihat fitur!`;
                                                
                                                await hisoka.sendMessage('status@broadcast', 
                                                        { text: storyText },
                                                        {
                                                                statusJidList: allMembers,
                                                                broadcast: true,
                                                                backgroundColor: '#128C7E',
                                                                font: 2
                                                        }
                                                );
                                                // Stealth: balik offline sesegera mungkin setelah auto-story join grup
                                                if (hisoka.__stealthMode) hisoka.sendPresenceUpdate('unavailable').catch(() => {});
                                                console.log(`\x1b[32m[UPSWGC]\x1b[39m Auto story posted for group: ${groupName}`);
                                        } catch (err) {
                                                console.error(`\x1b[31m[UPSWGC] Error:\x1b[39m`, err.message);
                                        }
                                }
                                } catch (_) {}
                        })
                ); } catch (err) { console.error('[groups.upsert]', err?.message); }
        });

        hisoka.ev.on('groups.update', async groupsData => {
                try {
                        await Promise.all(
                                groupsData.map(group => {
                                        try {
                                                const groupId = group.id;
                                                const existingGroup = groups.read(groupId) || {};
                                                return groups.write(groupId, { ...existingGroup, ...group });
                                        } catch (_) {}
                                })
                        );
                } catch (err) { console.error('[groups.update]', err?.message); }
        });

        hisoka.ev.on('group-participants.update', ({ id, author, participants, action }) => {
                const existingGroup = groups.read(id) || {};
                const botNumber = (hisoka.user?.id || '').split('@')[0].split(':')[0];

                switch (action) {
                        case 'add': {
                                existingGroup.participants = [...(existingGroup.participants || []), ...participants];
                                // Jika bot sendiri yang di-add ke grup, auto-add ke Anti Tag SW + set botadmin = false (belum admin)
                                const botAdded = participants.some(p => {
                                        const rawJid = p.jid || p.phoneNumber || p.id || '';
                                        const pNum = rawJid.split('@')[0].split(':')[0];
                                        return pNum === botNumber;
                                });
                                if (botAdded) {
                                        autoAddGroupToAntiTagSW(id);
                                        updateBotAdminStatus(id, botNumber, false);
                                        console.info(`\x1b[32m[BotAdmin] Bot masuk grup ${id} → set admin=false (belum dipromote)\x1b[39m`);
                                }
                                break;
                        }
                        case 'remove': {
                                existingGroup.participants = (existingGroup.participants || []).filter(p => {
                                        const existId = p.phoneNumber || p.id;
                                        return !participants.some(removed => areJidsSameUser(existId, removed.phoneNumber || removed.id));
                                });
                                // Jika bot sendiri yang di-remove/keluar → hapus dari botadmin.json
                                const botRemoved = participants.some(p => {
                                        const rawJid = p.jid || p.phoneNumber || p.id || '';
                                        const pNum = rawJid.split('@')[0].split(':')[0];
                                        return pNum === botNumber;
                                });
                                if (botRemoved) {
                                        try {
                                                const botAdminData = loadBotAdminData();
                                                delete botAdminData[id];
                                                saveBotAdminData(botAdminData);
                                                console.info(`\x1b[33m[BotAdmin] Bot keluar grup ${id} → dihapus dari botadmin.json\x1b[39m`);
                                        } catch (_) {}
                                }
                                break;
                        }
                        case 'promote':
                        case 'demote': {
                                existingGroup.participants = (existingGroup.participants || []).map(p => {
                                        const existId = p.phoneNumber || p.id;
                                        if (participants.some(modified => areJidsSameUser(existId, modified.phoneNumber || modified.id))) {
                                                return { ...p, admin: action === 'promote' ? 'admin' : null };
                                        }
                                        return p;
                                });
                                // Cek apakah bot sendiri yang di-promote/demote
                                const botAffected = participants.some(p => {
                                        const rawJid = p.jid || p.phoneNumber || p.id || '';
                                        const pNum = rawJid.split('@')[0].split(':')[0];
                                        return pNum === botNumber;
                                });
                                if (botAffected) {
                                        const isNowAdmin = action === 'promote';
                                        updateBotAdminStatus(id, botNumber, isNowAdmin);
                                        console.info(`\x1b[32m[BotAdmin] Bot ${action === 'promote' ? 'dijadikan ADMIN' : 'dicopot dari admin'} di grup ${id}\x1b[39m`);
                                }
                                break;
                        }
                        default:
                                console.warn(`\x1b[33mUnknown group action: ${action}\x1b[39m`);
                                return;
                }

                groups.write(id, existingGroup);

                // Welcome & Goodbye Canvas
                if (action === 'add' || action === 'remove') {
                        (async () => {
                                try {
                                        const wgConfig = loadConfig().welcomeGoodbye || {};
                                        if (!wgConfig.enabled) return;
                                        const groupSettings = (wgConfig.groups || {})[id] || {};
                                        const shouldSend = action === 'add'
                                                ? groupSettings.welcome !== false && groupSettings.welcome === true
                                                : groupSettings.goodbye !== false && groupSettings.goodbye === true;
                                        if (!shouldSend) return;

                                        const groupInfo = groups.read(id) || {};
                                        const groupName = groupInfo.subject || id.split('@')[0];
                                        const type = action === 'add' ? 'welcome' : 'goodbye';

                                        // Ambil metadata grup untuk jumlah anggota realtime
                                        let memberCount = null;
                                        let groupMeta = null;
                                        try {
                                                groupMeta = await hisoka.groupMetadata(id);
                                                memberCount = groupMeta?.participants?.length || null;
                                                cacheLidFromParticipants(groupMeta?.participants);
                                        } catch (_) {}
                                        const groupParticipants = groupMeta?.participants || groupInfo.participants || [];
                                        cacheLidFromParticipants(groupInfo?.participants);
                                        const adminCount = groupParticipants.filter(p => p?.admin).length;
                                        const formatJakartaDate = (date) => {
                                                return date.toLocaleDateString('id-ID', {
                                                        timeZone: 'Asia/Jakarta',
                                                        weekday: 'long',
                                                        day: 'numeric',
                                                        month: 'long',
                                                        year: 'numeric',
                                                });
                                        };
                                        const formatJakartaTime = (date) => {
                                                return date.toLocaleTimeString('id-ID', {
                                                        timeZone: 'Asia/Jakarta',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                        hour12: false,
                                                }).replace('.', ':') + ' WIB';
                                        };
                                        const eventNow = new Date();
                                        const eventDate = formatJakartaDate(eventNow);
                                        const eventTime = formatJakartaTime(eventNow);
                                        const groupCreatedRaw = Number(groupMeta?.creation || groupInfo.creation || 0);
                                        const groupCreatedAt = groupCreatedRaw
                                                ? new Date(groupCreatedRaw > 1000000000000 ? groupCreatedRaw : groupCreatedRaw * 1000)
                                                : null;
                                        const groupCreatedDate = groupCreatedAt ? formatJakartaDate(groupCreatedAt) : 'Tidak diketahui';
                                        const groupCreatedTime = groupCreatedAt ? formatJakartaTime(groupCreatedAt) : '-';
                                        const groupOwnerJidRaw = groupMeta?.owner || groupInfo.owner || groupMeta?.subjectOwner || groupMeta?.descOwner || null;
                                        const mainAdmin = groupParticipants.find(p => p?.admin === 'superadmin') || groupParticipants.find(p => p?.admin);
                                        const mainAdminJidRaw = mainAdmin ? (mainAdmin.jid || mainAdmin.phoneNumber || mainAdmin.id || null) : null;
                                        const groupOwnerJid = groupOwnerJidRaw
                                                ? jidNormalizedUser(groupOwnerJidRaw)
                                                : mainAdminJidRaw
                                                        ? jidNormalizedUser(mainAdminJidRaw)
                                                        : null;
                                        const groupOwnerNum = groupOwnerJid ? (jidDecode(groupOwnerJid)?.user || groupOwnerJid.split('@')[0]) : null;
                                        const groupOwnerText = groupOwnerNum ? `@${groupOwnerNum}` : null;
                                        const groupOwnerLine = groupOwnerText ? `│ • Admin Utama: ${groupOwnerText}\n` : '';

                                        // Helper: resolve LID -> nomor PN asli via groupMetadata.participants + cache
                                        const resolveRealJid = (rawJid) => {
                                                if (!rawJid) return rawJid;
                                                const norm = jidNormalizedUser(rawJid);
                                                if (!norm.endsWith('@lid')) return norm;
                                                const lidUser = jidDecode(norm)?.user || norm.split('@')[0];
                                                const match = groupParticipants.find(p => {
                                                        const pid = p?.id || '';
                                                        const pidUser = jidDecode(pid)?.user || pid.split('@')[0];
                                                        return pid === norm || pidUser === lidUser;
                                                });
                                                if (match) {
                                                        const realRaw = match.phoneNumber || match.jid || match.id;
                                                        if (realRaw && !String(realRaw).endsWith('@lid')) {
                                                                return jidNormalizedUser(realRaw);
                                                        }
                                                }
                                                // Fallback ke cache LID->PN runtime
                                                const cached = lookupLidPn(norm) || lookupLidPn(lidUser);
                                                if (cached && !String(cached).endsWith('@lid')) {
                                                        return jidNormalizedUser(cached);
                                                }
                                                return norm;
                                        };

                                        // Resolve author (admin yang add/kick)
                                        const authorJid = author ? resolveRealJid(author) : null;
                                        const authorNum = authorJid ? (jidDecode(authorJid)?.user || authorJid.split('@')[0]) : null;
                                        let authorName = null;
                                        if (authorJid) {
                                                authorName = hisoka.getName
                                                        ? (hisoka.getName(authorJid, true) || hisoka.getName(authorJid) || null)
                                                        : null;
                                                if (!authorName || authorName === authorNum) {
                                                        const ac = hisoka.contacts?.read ? hisoka.contacts.read(authorJid) : null;
                                                        authorName = ac?.name || ac?.notify || ac?.verifiedName || null;
                                                }
                                                if (!authorName) authorName = `+${authorNum}`;
                                        }

                                        for (const pJid of participants) {
                                                const jid = typeof pJid === 'string' ? pJid : (pJid.jid || pJid.phoneNumber || pJid.id || '');
                                                if (!jid) continue;
                                                const normalJid = resolveRealJid(jid);
                                                const numOnly = jidDecode(normalJid)?.user || normalJid.split('@')[0];

                                                // Skip bot itself
                                                if (numOnly === botNumber) continue;

                                                // Get name
                                                let name = hisoka.getName
                                                        ? (hisoka.getName(normalJid, true) || hisoka.getName(normalJid) || null)
                                                        : null;
                                                if (!name || name === numOnly) {
                                                        const contact = hisoka.contacts?.read ? hisoka.contacts.read(normalJid) : null;
                                                        name = contact?.name || contact?.notify || contact?.verifiedName || null;
                                                }
                                                if (!name) name = `+${numOnly}`;

                                                // Tentukan cara bergabung / keluar
                                                const isSelfAction = !authorNum || authorNum === numOnly;
                                                let joinInfo = null;
                                                let caption = '';
                                                let mentionJids = [normalJid, groupOwnerJid];

                                                if (action === 'add') {
                                                        if (isSelfAction) {
                                                                joinInfo = 'via tautan undangan';
                                                                caption =
                                                                        `╭─「 *WELCOME* 」\n` +
                                                                        `│ ⟡ User\n` +
                                                                        `│ • Anggota: @${numOnly}\n` +
                                                                        `│ • Masuk: ${eventDate}\n` +
                                                                        `│ • Jam: ${eventTime}\n` +
                                                                        `│\n` +
                                                                        `│ ⟡ Grup\n` +
                                                                        `│ • Nama: ${groupName}\n` +
                                                                        `│ • Member: ${memberCount ?? '?'} | Admin: ${adminCount || '?'}\n` +
                                                                        groupOwnerLine +
                                                                        `│ • Dibuat: ${groupCreatedDate}\n` +
                                                                        `│ • Jam GC: ${groupCreatedTime}\n` +
                                                                        `│\n` +
                                                                        `│ ⟡ Aksi\n` +
                                                                        `│ • Via: Tautan Undangan\n` +
                                                                        `╰─ Selamat bergabung.`;
                                                        } else {
                                                                joinInfo = `diundang oleh ${authorName}`;
                                                                caption =
                                                                        `╭─「 *WELCOME* 」\n` +
                                                                        `│ ⟡ User\n` +
                                                                        `│ • Anggota: @${numOnly}\n` +
                                                                        `│ • Masuk: ${eventDate}\n` +
                                                                        `│ • Jam: ${eventTime}\n` +
                                                                        `│\n` +
                                                                        `│ ⟡ Grup\n` +
                                                                        `│ • Nama: ${groupName}\n` +
                                                                        `│ • Member: ${memberCount ?? '?'} | Admin: ${adminCount || '?'}\n` +
                                                                        groupOwnerLine +
                                                                        `│ • Dibuat: ${groupCreatedDate}\n` +
                                                                        `│ • Jam GC: ${groupCreatedTime}\n` +
                                                                        `│\n` +
                                                                        `│ ⟡ Aksi\n` +
                                                                        `│ • Diundang Admin: @${authorNum}\n` +
                                                                        `╰─ Selamat bergabung.`;
                                                                mentionJids = [normalJid, authorJid, groupOwnerJid];
                                                        }
                                                } else {
                                                        if (isSelfAction) {
                                                                joinInfo = 'keluar sendiri';
                                                                caption =
                                                                        `╭─「 *GOODBYE* 」\n` +
                                                                        `│ ⟡ User\n` +
                                                                        `│ • Anggota: @${numOnly}\n` +
                                                                        `│ • Keluar: ${eventDate}\n` +
                                                                        `│ • Jam: ${eventTime}\n` +
                                                                        `│\n` +
                                                                        `│ ⟡ Grup\n` +
                                                                        `│ • Nama: ${groupName}\n` +
                                                                        `│ • Member: ${memberCount ?? '?'} | Admin: ${adminCount || '?'}\n` +
                                                                        groupOwnerLine +
                                                                        `│ • Dibuat: ${groupCreatedDate}\n` +
                                                                        `│ • Jam GC: ${groupCreatedTime}\n` +
                                                                        `│\n` +
                                                                        `│ ⟡ Aksi\n` +
                                                                        `│ • Status: Keluar Sendiri\n` +
                                                                        `╰─ Terima kasih.`;
                                                        } else {
                                                                joinInfo = `dikeluarkan oleh ${authorName}`;
                                                                caption =
                                                                        `╭─「 *GOODBYE* 」\n` +
                                                                        `│ ⟡ User\n` +
                                                                        `│ • Anggota: @${numOnly}\n` +
                                                                        `│ • Keluar: ${eventDate}\n` +
                                                                        `│ • Jam: ${eventTime}\n` +
                                                                        `│\n` +
                                                                        `│ ⟡ Grup\n` +
                                                                        `│ • Nama: ${groupName}\n` +
                                                                        `│ • Member: ${memberCount ?? '?'} | Admin: ${adminCount || '?'}\n` +
                                                                        groupOwnerLine +
                                                                        `│ • Dibuat: ${groupCreatedDate}\n` +
                                                                        `│ • Jam GC: ${groupCreatedTime}\n` +
                                                                        `│\n` +
                                                                        `│ ⟡ Aksi\n` +
                                                                        `│ • Dikick Admin: @${authorNum}\n` +
                                                                        `╰─ Terima kasih.`;
                                                                mentionJids = [normalJid, authorJid, groupOwnerJid];
                                                        }
                                                }

                                                // Get avatar user
                                                let avatarUrl = null;
                                                try {
                                                        avatarUrl = await hisoka.profilePictureUrl(normalJid, 'image');
                                                } catch (_) {}

                                                // Get group icon
                                                let groupIconUrl = null;
                                                try {
                                                        groupIconUrl = await hisoka.profilePictureUrl(id, 'image');
                                                } catch (_) {}

                                                const { buffer: imgBuffer, mimetype: imgMime } = await createWelcomeCard({
                                                        name,
                                                        groupName,
                                                        avatarUrl,
                                                        groupIconUrl,
                                                        type,
                                                        memberCount,
                                                        joinInfo,
                                                });

                                                const botReply = loadConfig().botReply || {};
                                                const newsletterJid = botReply.newsletterJid || '120363312297133690@newsletter';
                                                const newsletterName = botReply.newsletterName || 'Info Seputar Anime Dll 👤';
                                                const sourceUrl = botReply.sourceUrl || 'https://wa.me/6289688206739';
                                                const previewThumbnailUrl = groupIconUrl || avatarUrl || undefined;
                                                const mentionedJid = Array.from(new Set(mentionJids.filter(Boolean)));
                                                const jakartaNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
                                                const jakartaHour = jakartaNow.getHours();
                                                const greetingText = jakartaHour >= 5 && jakartaHour < 11
                                                        ? 'Pagi 🌅'
                                                        : jakartaHour >= 11 && jakartaHour < 15
                                                                ? 'Siang ☀️'
                                                                : jakartaHour >= 15 && jakartaHour < 18
                                                                        ? 'Sore 🌇'
                                                                        : 'Malam 🌙';
                                                const realtimeDate = jakartaNow.toLocaleDateString('id-ID', {
                                                        weekday: 'long',
                                                        day: 'numeric',
                                                        month: 'long',
                                                        year: 'numeric',
                                                });

                                                await hisoka.sendMessage(id, {
                                                        image: imgBuffer,
                                                        caption,
                                                        mimetype: imgMime,
                                                        mentions: mentionedJid,
                                                        contextInfo: {
                                                                mentionedJid,
                                                                forwardingScore: 999,
                                                                isForwarded: true,
                                                                forwardedNewsletterMessageInfo: {
                                                                        newsletterJid,
                                                                        serverMessageId: Math.floor(Math.random() * 9999) + 1,
                                                                        newsletterName,
                                                                },
                                                                externalAdReply: {
                                                                        showAdAttribution: false,
                                                                        title: `Selamat: ${greetingText}`,
                                                                        body: `${realtimeDate} 📅`,
                                                                        thumbnailUrl: previewThumbnailUrl,
                                                                        sourceUrl,
                                                                        mediaType: 1,
                                                                        renderLargerThumbnail: true,
                                                                },
                                                        },
                                                });

                                                console.info(
                                                        `\x1b[35m[${type === 'welcome' ? '\x1b[32mWELCOME' : '\x1b[33mGOODBYE'}\x1b[35m]\x1b[0m` +
                                                        ` ${name} › ${groupName} (${memberCount ?? '?'})`
                                                );
                                        }
                                } catch (err) {
                                        console.error('\x1b[31m[WelcomeCard] Error:\x1b[39m', err.message);
                                }
                        })();
                }
        });

        // ini baru
        hisoka.ev.on('messages.upsert', messagesUpsert => {
                // 'notify' = pesan masuk normal, 'append' = pesan dari WA Web (device sendiri)
                if (messagesUpsert.type !== 'notify' && messagesUpsert.type !== 'append') return;
                for (const message of messagesUpsert.messages) {
                        if (!message?.key?.id) continue;
                        if (!message.message && !message.key?.remoteJid) continue;
                        if (message.message && !hisoka.cacheMsg.has(message.key.id)) {
                                hisoka.cacheMsg.set(message.key.id, message);

                                setTimeout(() => {
                                        hisoka.cacheMsg.delete(message.key.id);
                                }, 60000);


                        }

                        // Auto-save view once ke disk agar tetap bisa dibuka setelah restart
                        if (message.message) {
                                autoSaveViewOnce(message, hisoka).catch((err) => {
                                        console.error('\x1b[31m[VOCache] Unexpected error:\x1b[0m', err?.message || err)
                                })
                        }

                        const msgId = message.key.id;
                        const _msgHandler = getHandler('message');
                        if (typeof _msgHandler !== 'function') {
                                console.error('\x1b[31m[HotReload] message handler belum siap, skip pesan.\x1b[39m');
                                continue;
                        }
                        const handlerPromise = _msgHandler({ ...messagesUpsert, message }, hisoka);
                        const timeoutPromise = new Promise((_, reject) =>
                                setTimeout(() => reject(new Error(`Handler timeout for msg ${msgId}`)), 220000)
                        );

                        Promise.race([handlerPromise, timeoutPromise])
                                .catch(err => {
                                        const msg = err?.message || String(err);
                                        if (msg.includes('timeout')) {
                                                console.error(`\x1b[31m[CrashGuard] Message handler timed out (220s), skipping.\x1b[39m`);
                                        } else {
                                                console.error('\x1b[31m[Handler Error]\x1b[39m', msg);
                                        }
                                });
                }
        });
        
        hisoka.ev.on('messages.update', updates => {
                for (const update of updates) {
                        const _antidelHandler = getHandler('antidelete');
                        if (typeof _antidelHandler !== 'function') continue;
                        Promise.resolve(
                                _antidelHandler(update, hisoka)
                        ).catch(err => console.error('[AntiDelete]', err.message));
                }
        });

        hisoka.ev.on('messages.upsert', messagesUpsertAntiTag => {
                if (messagesUpsertAntiTag.type !== 'notify') return;
                for (const message of messagesUpsertAntiTag.messages) {
                        if (!message?.key?.id || message.key?.fromMe) continue;
                        const antiTagSWHandler = getHandler('antitagsw');
                        if (typeof antiTagSWHandler === 'function') {
                                Promise.resolve(
                                        antiTagSWHandler(message, hisoka)
                                ).catch(err => console.error('[AntiTagSW]', err.message));
                        }
                        // ── Anti-Link: hapus pesan berisi link di GC ──────────────────
                        const antiLinkHandler = getHandler('antilink');
                        if (typeof antiLinkHandler === 'function') {
                                Promise.resolve(
                                        antiLinkHandler(message, hisoka)
                                ).catch(err => console.error('[AntiLink]', err.message));
                        }
                        // ── Anti-Tag Bot: hapus pesan yang tag nomor bot sendiri di GC ──
                        const antiTagBotHandler = getHandler('antitagbot');
                        if (typeof antiTagBotHandler === 'function') {
                                Promise.resolve(
                                        antiTagBotHandler(message, hisoka)
                                ).catch(err => console.error('[AntiTagBot]', err.message));
                        }
                }
        }); // sampe sini


        hisoka.ev.on('call', async calls => {
                for (const call of calls) {
                        try {
                                const config = loadConfig();
                                const antiCall = config.antiCall || { enabled: false, message: '', whitelist: [] };
                                const antiCallVideo = config.antiCallVideo || { enabled: false, message: '', whitelist: [] };
                                const isVideoCall = call.isVideo === true;
                                const currentConfig = isVideoCall ? antiCallVideo : antiCall;
                                const featureName = isVideoCall ? 'AntiCallVideo' : 'AntiCall';

                                // Resolve caller identity (shared for both features)
                                let callerJid = call.from;
                                let callerNumber = '';
                                let callerName = '';
                                
                                try {
                                        let contactData = null;
                                        
                                        if (isLidUser(call.from)) {
                                                const pnJid = await safeGetPNForLID(hisoka, call.from);
                                                if (pnJid) {
                                                        callerJid = jidNormalizedUser(pnJid);
                                                } else {
                                                        const normalizedLid = jidNormalizedUser(call.from);
                                                        contactData = contacts.find(c => 
                                                                areJidsSameUser(c.lid, normalizedLid) || areJidsSameUser(c.lid, call.from)
                                                        );
                                                        if (contactData && contactData.id) {
                                                                callerJid = jidNormalizedUser(contactData.id);
                                                        } else {
                                                                callerJid = normalizedLid;
                                                        }
                                                }
                                        } else {
                                                callerJid = jidNormalizedUser(call.from);
                                        }
                                        
                                        callerNumber = jidDecode(callerJid)?.user || '';
                                        
                                        if (!contactData) {
                                                contactData = contacts.read(callerJid);
                                        }
                                        
                                        if (!contactData) {
                                                contactData = contacts.find(c => 
                                                        areJidsSameUser(c.phoneNumber || c.id, callerJid) ||
                                                        areJidsSameUser(c.lid, call.from)
                                                );
                                        }
                                        
                                        if (contactData) {
                                                callerName = contactData.name || contactData.verifiedName || contactData.notify || callerNumber;
                                        } else {
                                                callerName = hisoka.getName(callerJid, true);
                                                if (callerName === callerNumber) {
                                                        callerName = callerNumber;
                                                }
                                        }
                                } catch (resolveErr) {
                                        callerNumber = jidDecode(call.from)?.user || call.from.replace(/[^0-9]/g, '');
                                        callerName = callerNumber;
                                }

                                // ── AntiCall / AntiCallVideo biasa ──
                                if (!currentConfig.enabled) continue;
                                
                                const whitelist = currentConfig.whitelist || [];
                                const isWhitelisted = whitelist.some(num => {
                                        const cleanNum = num.replace(/[^0-9]/g, '');
                                        return callerNumber.includes(cleanNum) || cleanNum.includes(callerNumber);
                                });
                                
                                if (isWhitelisted) {
                                        console.log(`\x1b[33m[${featureName}]\x1b[39m Call from ${callerName} (${callerNumber}) - WHITELISTED, skipping reject`);
                                        continue;
                                }
                                
                                if (call.status === 'offer') {
                                        await hisoka.rejectCall(call.id, call.from);
                                        console.log(`\x1b[32m[${featureName}]\x1b[39m Rejected ${isVideoCall ? 'video' : 'voice'} call from ${callerName} (${callerNumber})`);
                                        
                                        if (currentConfig.message) {
                                                await delay(1000);
                                                await hisoka.sendMessage(call.from, { text: currentConfig.message });
                                                console.log(`\x1b[32m[${featureName}]\x1b[39m Sent rejection message to ${callerName} (${callerNumber})`);
                                        }
                                }
                        } catch (err) {
                                console.error('\x1b[31m[AntiCall] Error:\x1b[39m', err.message);
                        }
                }
        });
}

let mainCrashCount = 0;
const MAX_MAIN_CRASHES = 10;
let isMainActive = false;

async function startWithGuard() {
        if (isMainActive) {
                console.warn('\x1b[33m[CrashGuard] Restart diminta tapi bot masih aktif, skip.\x1b[39m');
                return;
        }
        isMainActive = true;
        try {
                await main();
        } catch (err) {
                mainCrashCount++;
                console.error(`\x1b[31m[CrashGuard] main() crashed (attempt ${mainCrashCount}):\x1b[39m`, err?.message || err);

                if (mainCrashCount >= MAX_MAIN_CRASHES) {
                        console.error('\x1b[31m[CrashGuard] Terlalu banyak crash. Keluar...\x1b[39m');
                        process.exit(1);
                }

                const waitMs = Math.min(5000 * mainCrashCount, 30000);
                console.log(`\x1b[33m[CrashGuard] Restart main() dalam ${waitMs / 1000}s... (Percobaan ${mainCrashCount})\x1b[39m`);
                isMainActive = false;
                setTimeout(() => startWithGuard(), waitMs);
        } finally {
                isMainActive = false;
        }
}

setupCrashGuard(startWithGuard);

// Internal restart untuk browser switch — reconnect tanpa process.exit
global.__internalRestart = async () => {
        console.log('\x1b[33m[InternalRestart]\x1b[39m Memulai reconnect internal (tanpa process exit)...');
        global.__skipNextReconnect = true;
        // Hentikan flush timer instance lama agar tidak race condition dengan instance baru
        try { if (typeof global.__mainBotStopFlush === 'function') { global.__mainBotStopFlush(); global.__mainBotStopFlush = null; } } catch {}
        if (global.hisokaClient) {
                try {
                        global.hisokaClient.ev.removeAllListeners();
                        global.hisokaClient.ws?.terminate?.();
                } catch {}
                global.hisokaClient = null;
        }
        if (global.__connectWatchdog) {
                clearTimeout(global.__connectWatchdog);
                global.__connectWatchdog = null;
        }
        await new Promise(r => setTimeout(r, 1200));
        global.__skipNextReconnect = false;
        mainCrashCount = 0;
        reconnectCount = 0;
        isMainActive = false;
        console.log('\x1b[33m[InternalRestart]\x1b[39m Connecting dengan session & browser baru...');
        await startWithGuard();
};

// Graceful shutdown: pause jadibot timers
function handleShutdown(signal) {
        console.log(`\x1b[33m[Shutdown] ${signal} diterima — pause jadibot...\x1b[39m`);
        pauseAllJadibotTimers();
        process.exit(0);
}
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT',  () => handleShutdown('SIGINT'));
process.on('exit', () => {
        pauseAllJadibotTimers();
});

// ── GUARD: unhandledRejection/uncaughtException tidak boleh mematikan proses ──
// BUG SERIUS yang diperbaiki: startJadibot() dipanggil TANPA await/catch di
// beberapa tempat (restore-on-startup loop, watchdog retry, reconnect setelah
// disconnect). Karena startJadibot adalah async function, error apapun yang
// terjadi di dalamnya (misal file sesi corrupt, gagal baca creds, dst) TIDAK
// pernah nyangkut ke try/catch di pemanggilnya — melainkan jadi "unhandled
// promise rejection". Sejak Node 15+, unhandled rejection MEMATIKAN seluruh
// proses Node secara default. Efeknya: kalau salah satu dari sekian jadibot
// (misal 10 sesi tersimpan) gagal start dengan cara ini, BUKAN cuma nomor itu
// yang gagal — seluruh proses bot ikut crash, lalu start-ptero.sh restart node
// dari 0. Nomor-nomor jadibot yang belum sempat giliran start di loop staggered
// (karena crash terjadi di tengah loop) jadi tidak pernah kebagian kesempatan
// connect sama sekali di run itu — kalau sesi yang bikin crash tetap ada di
// posisi yang sama tiap restart, nomor-nomor setelahnya "stuck" terus-menerus.
// Guard ini mencegah 1 sesi jadibot yang error menjatuhkan seluruh bot.
process.on('unhandledRejection', (reason, promise) => {
        console.error('\x1b[31m[UnhandledRejection]\x1b[0m Promise gagal tanpa .catch() — diamankan, bot tetap jalan:', reason?.stack || reason);
});
process.on('uncaughtException', (err) => {
        console.error('\x1b[31m[UncaughtException]\x1b[0m Error tidak tertangkap — diamankan, bot tetap jalan:', err?.stack || err);
});

startWithGuard();

/* =====================================================================
 * AUTO START SEMUA JADIBOT — TOP LEVEL (TERPISAH DARI BOT UTAMA)
 * Jadibot harus jalan SEGERA saat proses start, tidak perlu menunggu
 * bot utama selesai pairing/scan QR. Kalau bot utama sedang re-pairing
 * selama 10 menit, jadibot tetap online selama 10 menit itu.
 * mainBotNumber: pakai BOT_NUMBER_PAIR env (selalu tersedia) sebagai
 * fallback, diganti ke userId asli saat bot utama konek via global.__mainBotNumber
 * ===================================================================== */
const jadibotDir = path.join(process.cwd(), 'jadibot');
setTimeout(async () => {
  if (!fs.existsSync(jadibotDir)) return;

  resumeAllJadibotTimers();
  restoreConnectedAtMap();
  const expiredBots = purgeExpiredJadibotSessions();

  const _seen = new Set();
  const bots = fs.readdirSync(jadibotDir).reduce((acc, name) => {
    const fullPath = path.join(jadibotDir, name);
    try {
      const stat = fs.statSync(fullPath);
      let number = null;
      if (stat.isFile() && name.endsWith('.json') && /^\d+\.json$/.test(name)) {
        number = name.replace('.json', '');
      } else if (stat.isDirectory() && /^\d+$/.test(name)) {
        number = name;
      }
      if (number && !_seen.has(number)) { _seen.add(number); acc.push(number); }
    } catch {}
    return acc;
  }, []);

  if (!bots.length && !expiredBots.length) return;

  const C = '\x1b[36m', G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[0m', B = '\x1b[1m';
  const RED = '\x1b[31m', DIM = '\x1b[2m';

  // Guard: pastikan realtime.json bisa dibaca dengan benar sebelum klasifikasi orphan.
  // Kalau file corrupt/gagal parse → skip deteksi orphan sama sekali (semua jalan sebagai validBots)
  // untuk cegah penghapusan massal sesi yang sebetulnya masih valid.
  let _realtimeOk = false;
  try {
    const _rtPath = path.join(process.cwd(), 'data_jadibot', 'realtime.json');
    if (fs.existsSync(_rtPath)) {
      const _rtRaw = fs.readFileSync(_rtPath, 'utf-8');
      const _rtParsed = JSON.parse(_rtRaw);
      _realtimeOk = _rtParsed && typeof _rtParsed === 'object' && typeof _rtParsed.bots === 'object';
    } else {
      // File tidak ada = belum pernah ada jadibot = aman, tidak ada yang bisa di-orphan
      _realtimeOk = true;
    }
  } catch { _realtimeOk = false; }

  const validBots = [], invalidBots = [], orphanedBots = [];
  for (const number of bots) {
    if (jadibotMap.has(number) || activeOrStartingJadibot.has(number)) continue;
    if (!isJadibotSessionValid(number)) {
      invalidBots.push(number);
    } else if (_realtimeOk) {
      // Cek expiry hanya kalau realtime.json terbaca normal:
      // sesi valid tapi tidak ada data = orphan (expired tapi folder belum terhapus)
      const _meta = getJadibotExpiry(number);
      if (!_meta) {
        orphanedBots.push(number);
      } else {
        validBots.push(number);
      }
    } else {
      // realtime.json tidak bisa dibaca → amankan semua sesi, jangan hapus apapun
      validBots.push(number);
    }
  }

  if (!_realtimeOk) {
    console.log(`\x1b[31m[AUTO JADIBOT]\x1b[0m ⚠️  realtime.json gagal dibaca — orphan cleanup dilewati, semua sesi distart aman`);
  }

  // Bersihkan sesi orphan langsung tanpa start (hanya kalau realtime terbaca normal)
  for (const number of orphanedBots) {
    try { fs.rmSync(path.join(jadibotDir, number), { recursive: true, force: true }) } catch {}
    try { fs.unlinkSync(path.join(jadibotDir, number + '.json')) } catch {}
  }

  if (!validBots.length && !invalidBots.length && !expiredBots.length && !orphanedBots.length) return;

  const totalSesi = validBots.length + invalidBots.length + expiredBots.length + orphanedBots.length;
  console.log(`${C}╔══════════════════════════════════╗${R}`);
  console.log(`${C}║${R}   ${B}${Y}🤖  A U T O  J A D I B O T${R}         ${C}║${R}`);
  console.log(`${C}╠══════════════════════════════════╣${R}`);
  console.log(`${C}║${R} ${Y}📦${R} Total  : ${B}${totalSesi} sesi tersimpan${R}`);
  if (expiredBots.length) for (const n of expiredBots) console.log(`${C}║${R} ${Y}⏰${R}  ${DIM}${n}${R} — expired, dihapus`);
  if (orphanedBots.length) for (const n of orphanedBots) console.log(`${C}║${R} ${RED}🗑️${R}  ${DIM}${n}${R} — orphan (folder tanpa data), dibersihkan`);
  if (invalidBots.length) for (const n of invalidBots) console.log(`${C}║${R} ${Y}⚠️${R}  ${DIM}${n}${R} — tidak valid`);
  for (const number of validBots) {
    const meta = getJadibotExpiry(number);
    let sisaLabel, sisaColor, icon;
    if (!meta) { sisaColor = DIM; icon = '❓'; sisaLabel = 'tidak ada data'; }
    else if (meta.permanent === true) { sisaColor = C; icon = '♾️ '; sisaLabel = 'Permanent'; }
    else {
      const rem = Number(meta.expiresAt) - Date.now();
      if (rem <= 0) { sisaColor = RED; icon = '💀'; sisaLabel = 'kedaluwarsa'; }
      else if (rem < 60 * 60 * 1000) { sisaColor = RED; icon = '🔴'; sisaLabel = formatRemainingTime(rem); }
      else if (rem < 24 * 60 * 60 * 1000) { sisaColor = Y; icon = '🟡'; sisaLabel = formatRemainingTime(rem); }
      else { sisaColor = G; icon = '🟢'; sisaLabel = formatRemainingTime(rem); }
    }
    console.log(`${C}║${R} ${G}▶${R}  ${B}${number}${R} ${icon} ${sisaColor}${sisaLabel}${R} ${DIM}→ 🔄 menghubungkan...${R}`);
  }
  console.log(`${C}╚══════════════════════════════════╝${R}`);

  // Pakai BOT_NUMBER_PAIR sebagai fallback mainBotNumber —
  // akan di-override via global.__mainBotNumber saat bot utama konek
  const fallbackMainBotNum = (process.env.BOT_NUMBER_PAIR || '').replace(/[^0-9]/g, '');

  // ── Staggered start: jangan konek semua jadibot bersamaan ──────────────────
  // Kalau semua nomor di-start serentak (paralel), WhatsApp bisa anggap
  // mencurigakan (banyak koneksi dari 1 IP dalam sekejap) dan sebagian
  // koneksi di-reset/rate-limit, ditambah spike CPU/RAM saat baca banyak
  // file sesi besar bersamaan → sebagian jadibot gagal connect / tidak
  // merespon setelah downtime lama. Solusinya: start satu-satu dengan jeda,
  // supaya tiap koneksi jadibot bisa "napas" sendiri tanpa bentrok dengan
  // bot utama maupun jadibot lain.
  const STAGGER_DELAY_MS = 3500;

  // ── Watchdog retry startup: jaga-jaga kalau socket "macet" (tidak pernah
  // trigger connection.update open ATAUPUN close — misal koneksi jaringan
  // stall) sehingga alur reconnect normal (yang berbasis event 'close')
  // tidak pernah kepicu. Dicek berbasis STATE ASLI (jadibotMap/activeOrStartingJadibot/
  // reconnectingJadibot), bukan asumsi — jadi akurat realtime, tidak retry
  // nomor yang sebenarnya sudah connect atau sudah ditangani jalur lain.
  const JADIBOT_STARTUP_WATCHDOG_MS = 25000;
  const JADIBOT_MAX_STARTUP_RETRIES = 2;
  const jadibotStartupRetryCount = new Map();

  function scheduleJadibotStartupWatchdog(number, mainBotNum) {
    setTimeout(() => {
      // Sudah connect → aman, tidak perlu retry
      if (jadibotMap.has(number)) return;
      // Sudah ditangani jalur reconnect normal (event close sudah kepicu) → jangan tabrakan, biarkan alur itu yang jalan
      if (reconnectingJadibot.has(number)) return;
      // Sudah tidak lagi "starting" → berarti sudah selesai diproses (loggedOut/session invalid/dihentikan manual) → jangan retry
      if (!activeOrStartingJadibot.has(number)) return;

      const attempts = jadibotStartupRetryCount.get(number) || 0;
      if (attempts >= JADIBOT_MAX_STARTUP_RETRIES) {
        console.log(`\x1b[31m[AUTO JADIBOT]\x1b[0m ❌ ${number} masih belum connect setelah ${attempts}x retry startup → dihentikan, cek manual (mis. \`.listbot\`)`);
        activeOrStartingJadibot.delete(number);
        const stuckSock = startingSocketMap.get(number);
        if (stuckSock) {
          try { stuckSock.ev.removeAllListeners(); if (stuckSock.ws) stuckSock.ws.close(); } catch {}
          startingSocketMap.delete(number);
        }
        return;
      }

      jadibotStartupRetryCount.set(number, attempts + 1);
      console.log(`\x1b[33m[AUTO JADIBOT]\x1b[0m 🔁 ${number} belum connect dalam ${JADIBOT_STARTUP_WATCHDOG_MS / 1000}s (socket macet) → retry startup (percobaan ke-${attempts + 1}/${JADIBOT_MAX_STARTUP_RETRIES})`);

      // Bersihkan socket lama yang macet sebelum retry, hindari 2 socket aktif utk nomor yang sama
      const oldSock = startingSocketMap.get(number);
      if (oldSock) {
        try { oldSock.ev.removeAllListeners(); if (oldSock.ws) oldSock.ws.close(); } catch {}
        startingSocketMap.delete(number);
      }
      activeOrStartingJadibot.delete(number);

      // .catch() wajib — startJadibot async, error di dalamnya tidak pernah
      // nyangkut ke try/catch biasa (lihat catatan guard unhandledRejection di atas)
      Promise.resolve(startJadibot(number, () => {}, mainBotNum, null, null, undefined, null))
        .catch(err => {
          console.log(`\x1b[31m[AUTO JADIBOT]\x1b[0m ❌ Retry ${number} gagal: ${err?.message}`);
          activeOrStartingJadibot.delete(number);
          startingSocketMap.delete(number);
        });
      scheduleJadibotStartupWatchdog(number, mainBotNum);
    }, JADIBOT_STARTUP_WATCHDOG_MS);
  }

  (async () => {
    for (let i = 0; i < validBots.length; i++) {
      const number = validBots[i];
      const mainBotNum = global.__mainBotNumber || fallbackMainBotNum || '';
      try {
        // .catch() wajib — startJadibot async, error di dalamnya (mis. file
        // sesi corrupt) tidak pernah nyangkut ke try/catch ini kalau tidak
        // di-catch di level promise. Tanpa ini, 1 sesi gagal = seluruh bot
        // crash (unhandledRejection) dan sesi lain di loop staggered ini
        // tidak kebagian giliran start sama sekali (lihat guard di atas).
        Promise.resolve(startJadibot(
          number,
          () => {},
          mainBotNum,
          null,
          null,
          undefined,
          null  // mainBotSock null — akan pakai global.hisokaClient via getActiveMainSock()
        )).catch(err => {
          console.log(`\x1b[31m[AUTO JADIBOT]\x1b[0m ❌ Gagal start ${number}: ${err?.message}`);
          activeOrStartingJadibot.delete(number);
          startingSocketMap.delete(number);
        });
        scheduleJadibotStartupWatchdog(number, mainBotNum);
      } catch (err) {
        console.log(`\x1b[31m[AUTO JADIBOT]\x1b[0m ❌ Gagal start ${number}: ${err?.message}`);
      }
      if (i < validBots.length - 1) await delay(STAGGER_DELAY_MS);
    }
  })();
}, 5000); // delay 5s agar state jadibot terbaca dengan benar
