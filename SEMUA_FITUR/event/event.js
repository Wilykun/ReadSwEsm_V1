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
 *  event.js — Handler event Baileys
 *  Welcome/goodbye grup, connection update, QR code
 * ───────────────────────────────
 */
/**
 * ═══════════════════════════════════════════════════════════════
 *  Baileys Event Handler
 *  Menangani semua event non-pesan: welcome/goodbye anggota
 *  grup, auto typing/recording, auto read status (SW),
 *  SwTrack anti-miss retry, dan auto read chat private.
 * ═══════════════════════════════════════════════════════════════
 */
'use strict';

import fs from 'fs';
import path from 'path';
import { jidNormalizedUser, toNumber, jidDecode, proto, isJidGroup, delay } from '@whiskeysockets/baileys';
import { isPnUser } from '../../src/helper/socketCompat.js';
import { getJadibotReadchat, getJadibotNumber, getJadibotEmojiMode, getJadibotAutoTyping, getJadibotAutoRecording } from '../../src/helper/jadibotSettings.js';

import { telegram } from '../../src/helper/index.js';
import { isNumber } from '../../src/helper/text.js';
import { getRandomEmoji, getStatusEmojis, getMode } from '../../src/helper/emoji.js';
import { getTmpPath } from '../../src/helper/cleaner.js';
import {
        SW_TRACK_USER_DIR,
        SW_TRACK_DIR,
        updateSwStats,
        isSwUserTracked,
        loadSwUser,
        markSwUserEntry,
        updateSwUserEntry,
        getMissedSwEntries,
        extractSwNumber,
        storyDebounce,
        maskNumber,
        logStoryView,
        logStoryRetrySummary,
        getMediaTypeEmoji,
        getStoryCountToday,
        lookupSwMsgOwner,
} from '../../src/helper/swtrack.js';

// ── Dedup log "SW dihapus": revoke story bisa terkirim >1x (notify + append,
// atau replay saat reconnect). Skip cepat via memori untuk hindari scan file
// berulang; ground truth sebenarnya ada di flag `deleted` yg tersimpan di disk
// (lihat pemakaian di bawah) sehingga tetap akurat 100% walau proses restart.
const _recentSwRevoke = new Map();
const _SW_REVOKE_DEDUPE_TTL = 10 * 60 * 1000; // bersihkan entri memori setelah 10 menit
setInterval(() => {
        const cutoff = Date.now() - _SW_REVOKE_DEDUPE_TTL;
        for (const [k, ts] of _recentSwRevoke) {
                if (ts < cutoff) _recentSwRevoke.delete(k);
        }
}, 5 * 60 * 1000).unref?.();

function loadConfig() {
        try {
                const configPath = path.join(process.cwd(), 'config.json');
                if (fs.existsSync(configPath)) {
                        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                }
        } catch (err) {}
        return {};
}

function getGreeting() {
        const hour = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour: 'numeric', hour12: false });
        const h = parseInt(hour);
        if (h >= 5 && h < 11) return 'Pagi 🌆';
        if (h >= 11 && h < 15) return 'Siang 🏙️';
        if (h >= 15 && h < 18) return 'Sore 🌇';
        return 'Malam 🌃';
}

// Global shared Set — semua instance (main bot + jadibot) share satu Set
// supaya story yang sama tidak diproses duplikat oleh beberapa instance
if (!global.__swProcessingSet) global.__swProcessingSet = new Set();
const swProcessingSet = global.__swProcessingSet;

// TTL cleanup swProcessingSet — cegah memory leak kalau bot jalan lama tanpa restart.
// Story yang sudah diproses disimpan selamanya di Set; cleanup tiap 2 jam.
// Pakai companion Map untuk track kapan msgId masuk ke Set.
if (!global.__swProcessingSetTs) global.__swProcessingSetTs = new Map();
const _swProcessingSetTs = global.__swProcessingSetTs;
const _SW_SET_TTL = 2 * 60 * 60 * 1000; // 2 jam
setInterval(() => {
        const cutoff = Date.now() - _SW_SET_TTL;
        for (const [id, ts] of _swProcessingSetTs) {
                if (ts < cutoff) {
                        swProcessingSet.delete(id);
                        _swProcessingSetTs.delete(id);
                }
        }
}, 30 * 60 * 1000).unref?.(); // check tiap 30 menit

// ── Notif akurat ke owner bila Telegram-notif AKTIF tapi token/chatId kosong ──
// Dipanggil tiap ada status dibaca yang seharusnya terkirim; debounce 6 jam
// agar tidak spam. Kembalikan true bila notif dikirim.
export function notifTeleBelumLengkap(hisoka, loadConfig, telegramConfig) {
        try {
                const tokenAda = !!String(telegramConfig.token || '').trim();
                const chatAda = !!String(telegramConfig.chatId || '').trim();
                const kurang = [];
                if (!tokenAda) kurang.push('Token');
                if (!chatAda) kurang.push('Chat ID');
                if (!kurang.length) return false;
                const skr = Date.now();
                if (global.__teleCfgWarnTs && skr - global.__teleCfgWarnTs < 6 * 3600 * 1000) return false;
                global.__teleCfgWarnTs = skr;
                let jidOwner = '';
                try {
                        const owners = (loadConfig().owners || []).filter(Boolean);
                        if (owners.length) jidOwner = String(owners[0]).replace(/\D/g, '') + '@s.whatsapp.net';
                } catch (_) {}
                if (!jidOwner || !hisoka?.sendMessage) return false;
                const labelKurang = kurang.length > 1 ? `*${kurang.join(' & ')}* belum diset` : `*${kurang[0]}* belum diset`;
                let langkah;
                if (!tokenAda && !chatAda) {
                        langkah = `Lihat cara lengkap: \`.tele tutorial\``;
                } else if (!chatAda) {
                        langkah = `1. Buka https://t.me/userinfobot → klik *Start* → copy ID kamu\n2. Kirim: \`.tele chatid <id>\`\n3. Tes: \`.tele test\``;
                } else {
                        langkah = `1. Buka https://t.me/BotFather → /newbot → copy token\n2. Kirim: \`.tele token <token>\`\n3. Tes: \`.tele test\``;
                }
                const teks = `⚠️ *Telegram Notif* aktif tapi belum lengkap: ${labelKurang} — status yang dibaca tidak terkirim ke Telegram.\n\n*Lengkapi:*\n${langkah}`;
                Promise.resolve(hisoka.sendMessage(jidOwner, { text: teks })).catch(() => {});
                return true;
        } catch (_) { return false; }
}

// ── Format caption notif Telegram: badge tipe + tanggal ID + caption rapi ──
// Dipakai untuk caption media maupun pesan teks. Escape HTML agar parse_mode
// tidak gagal saat caption mengandung <, > atau &.
export function formatTeleCaption({ type, text, fromUser, storyName, timestampMs }) {
        const tipe = type === 'imageMessage' ? '🖼️ <b>Foto</b>'
                : type === 'videoMessage' ? '🎥 <b>Video</b>'
                : type === 'audioMessage' ? '🎵 <b>Audio</b>' : '📝 <b>Teks</b>';
        const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const bln = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        const p = new Date(new Date(timestampMs).toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
        const tgl = `${p.getDate()} ${bln[p.getMonth()]} ${p.getFullYear()}`;
        const jam = p.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '.');
        return `${tipe} dari <a href="https://wa.me/${esc(fromUser)}">@${esc(storyName)}</a>\n📅 ${tgl} · 🕐 ${jam} WIB${text ? `\n\n💬 <i>${esc(text)}</i>` : ''}`;
}

// ── Kirim ke Telegram + AUTO-OFF bila kredensial terbukti salah ─────────────
// Dipakai semua jalur kirim backup story. Bila Telegram menjawab 401
// (token invalid), chat not found / kicked / blocked → enabled=false + DM 1x
// ke owner. Network error & 429 TIDAK mematikan fitur (transien).
// Kembalikan { ok } — tidak pernah throw.
export async function teleSendAuto(hisoka, chatId, media, opts) {
        let data;
        try {
                data = await telegram.send(chatId, media, opts);
        } catch (e) {
                console.error('\x1b[33m[AutoReadSW] Telegram network error:\x1b[39m', e.message);
                return { ok: false };
        }
        if (data?.ok) return { ok: true };
        const desc = String(data?.description || '');
        const code = data?.error_code;
        const fatal = code === 401 || /unauthorized/i.test(desc)
                || /chat not found/i.test(desc)
                || /bot was kicked|kicked from the/i.test(desc)
                || /forbidden/i.test(desc);
        if (fatal) {
                try {
                        const cfgPath = path.join(process.cwd(), 'config.json');
                        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
                        if (cfg.telegram?.enabled) {
                                cfg.telegram.enabled = false;
                                fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
                                const sebab = (code === 401 || /unauthorized/i.test(desc)) ? '*Token* tidak valid (Unauthorized)'
                                        : /chat not found/i.test(desc) ? '*Chat ID* salah (chat tidak ditemukan)'
                                        : 'bot tidak bisa mengirim ke chat tujuan';
                                const owners = (cfg.owners || []).filter(Boolean);
                                if (owners.length && hisoka?.sendMessage) {
                                        const jid = String(owners[0]).replace(/\D/g, '') + '@s.whatsapp.net';
                                        const teks = `⚠️ *Telegram Notif* dimatikan otomatis: ${sebab}.\n\nPerbaiki dulu, lalu aktifkan lagi:\n1. \`.tele token <token>\` — via https://t.me/BotFather\n2. \`.tele chatid <id>\` — via https://t.me/userinfobot\n3. \`.tele on\``;
                                        hisoka.sendMessage(jid, { text: teks }).catch(() => {});
                                }
                        }
                } catch (_) {}
        } else {
                console.error('\x1b[31m[AutoReadSW] Telegram send gagal:\x1b[39m', desc || 'unknown');
        }
        return { ok: false };
}

export default async function (m, hisoka) {
        try {

                if (m.content && m.content.contextInfo && isNumber(m.content.contextInfo.expiration) && isPnUser(m.from)) {
                        const expiration = m.content.contextInfo.expiration;
                        const ephemeralSettingTimestamp = toNumber(m.content.contextInfo.ephemeralSettingTimestamp);
                        const contact = hisoka.contacts.read(m.from) || {};
                        hisoka.contacts.write(m.from, { ...contact, ephemeralSettingTimestamp, ephemeralDuration: expiration });
                }

                if (m.message.protocolMessage) {
                        const protocolMessage = m.message.protocolMessage;
                        const key = protocolMessage.key;
                        const type = protocolMessage.type;

                        switch (type) {
                                case proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING:
                                case proto.Message.ProtocolMessage.Type.EPHEMERAL_SYNC_RESPONSE: {
                                        const id = await hisoka.resolveLidToPN(key);
                                        const contact = hisoka.contacts.read(id) || {};
                                        hisoka.contacts.write(id, {
                                                ...contact,
                                                ephemeralSettingTimestamp: toNumber(
                                                        protocolMessage.ephemeralSettingTimestamp || m.message.messageTimestamp
                                                ),
                                                ephemeralDuration: protocolMessage.ephemeralExpiration,
                                        });
                                        break;
                                }
                                case proto.Message.ProtocolMessage.Type.REVOKE: {
                                        // ── Deteksi SW dihapus realtime ──
                                        const isStatusRevoke =
                                                m.key?.remoteJid === 'status@broadcast' ||
                                                key?.remoteJid === 'status@broadcast';
                                        // Dedup 100% akurat: skip cepat via memori (hindari scan file
                                        // berulang saat event sama datang beruntun dalam 1 proses),
                                        // TAPI status "sudah dicatat" yg sebenarnya (ground truth)
                                        // diambil dari flag `deleted` yg tersimpan di disk, jadi
                                        // tetap tidak dobel walau bot restart/reconnect berkali-kali.
                                        if (isStatusRevoke && key?.id && _recentSwRevoke.has(key.id)) break;
                                        if (isStatusRevoke && key?.id) {
                                                try {
                                                        let _handled = false;
                                                        // ── Fast path: LRU lookup (O(1)) — baca hanya file milik ownerNum ──
                                                        const _lruOwner = lookupSwMsgOwner(key.id, null);
                                                        if (_lruOwner) {
                                                                try {
                                                                        const _ownerNum = String(_lruOwner).replace(/[^0-9]/g, '');
                                                                        const _ownerFile = path.join(SW_TRACK_DIR, _ownerNum + '.json');
                                                                        if (fs.existsSync(_ownerFile)) {
                                                                                const _userData = JSON.parse(fs.readFileSync(_ownerFile, 'utf-8'));
                                                                                if (_userData[key.id]) {
                                                                                        _recentSwRevoke.set(key.id, Date.now());
                                                                                        _handled = true;
                                                                                        if (!_userData[key.id].deleted) {
                                                                                                _userData[key.id] = { ..._userData[key.id], deleted: true, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
                                                                                                const _tmpFp = _ownerFile + '.tmp';
                                                                                                fs.writeFileSync(_tmpFp, JSON.stringify(_userData, null, 2), 'utf-8');
                                                                                                fs.renameSync(_tmpFp, _ownerFile);
                                                                                        }
                                                                                }
                                                                        }
                                                                } catch {}
                                                        }
                                                        // ── Slow path: scan semua file per-nomor di SW_TRACK_DIR ──
                                                        if (!_handled && fs.existsSync(SW_TRACK_DIR)) {
                                                                try {
                                                                        const _swFiles = fs.readdirSync(SW_TRACK_DIR).filter(f => f.endsWith('.json') && f !== 'users.json');
                                                                        for (const _f of _swFiles) {
                                                                                const _fp = path.join(SW_TRACK_DIR, _f);
                                                                                try {
                                                                                        const _userData = JSON.parse(fs.readFileSync(_fp, 'utf-8'));
                                                                                        if (_userData[key.id]) {
                                                                                                _recentSwRevoke.set(key.id, Date.now());
                                                                                                if (!_userData[key.id].deleted) {
                                                                                                        _userData[key.id] = { ..._userData[key.id], deleted: true, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
                                                                                                        const _tmpFp = _fp + '.tmp';
                                                                                                        fs.writeFileSync(_tmpFp, JSON.stringify(_userData, null, 2), 'utf-8');
                                                                                                        fs.renameSync(_tmpFp, _fp);
                                                                                                }
                                                                                                break;
                                                                                        }
                                                                                } catch {}
                                                                        }
                                                                } catch {}
                                                        }
                                                } catch {}
                                        }
                                        break;
                                }
                        }
                }

                if (!m.key?.fromMe && !m.status && m.message && m.type && m.type !== 'protocolMessage' && m.type !== 'reactionMessage') {
                        const config = loadConfig();
                        // isPnUser cek @pn — tapi Baileys modern pakai @s.whatsapp.net untuk private
                        // Fix: private = bukan grup DAN bukan status broadcast
                        const isGroup   = isJidGroup(m.from);
                        const isPrivate = !isGroup && m.from !== 'status@broadcast' && typeof m.from === 'string';

                        // ── Auto Typing / Recording ─────────────────────────────────────────
                        // Jadibot: skip di sini — sudah ditangani langsung di jadibot.js (pakai setting per-jadibot)
                        // Bot utama: baca dari config.json
                        if (hisoka.isMainBot !== false) {
                                const autoTyping    = config.autoTyping    || {};
                                const autoRecording = config.autoRecording || {};

                                const shouldAutoType   = autoTyping.enabled   && ((isPrivate && autoTyping.privateChat)   || (isGroup && autoTyping.groupChat));
                                const shouldAutoRecord = autoRecording.enabled && ((isPrivate && autoRecording.privateChat) || (isGroup && autoRecording.groupChat));

                                // Skip typing/recording saat stealth mode aktif — mencegah bot flash online sendiri
                                if ((shouldAutoType || shouldAutoRecord) && !hisoka.__stealthMode) {
                                        (async () => {
                                                try {
                                                        // Tandai typing aktif → interval stealth skip kirim unavailable
                                                        // agar delay tidak dipotong paksa oleh keepalive counter
                                                        hisoka.__typingActive = (hisoka.__typingActive || 0) + 1;
                                                        if (shouldAutoType && !shouldAutoRecord) {
                                                                await hisoka.sendPresenceUpdate('composing', m.from);
                                                                await delay((autoTyping.delaySeconds || 5) * 1000);
                                                                await hisoka.sendPresenceUpdate('paused', m.from);
                                                        } else if (shouldAutoRecord && !shouldAutoType) {
                                                                await hisoka.sendPresenceUpdate('recording', m.from);
                                                                await delay((autoRecording.delaySeconds || 5) * 1000);
                                                                await hisoka.sendPresenceUpdate('paused', m.from);
                                                        } else {
                                                                await hisoka.sendPresenceUpdate('composing', m.from);
                                                                await delay((autoTyping.delaySeconds || 5) * 1000);
                                                                await hisoka.sendPresenceUpdate('recording', m.from);
                                                                await delay((autoRecording.delaySeconds || 5) * 1000);
                                                                await hisoka.sendPresenceUpdate('paused', m.from);
                                                        }
                                                } catch (err) {
                                                        console.error('\x1b[31m[AutoTyping/Recording] Error:\x1b[39m', err.message);
                                                } finally {
                                                        hisoka.__typingActive = Math.max(0, (hisoka.__typingActive || 1) - 1);
                                                }
                                        })();
                                }
                        }

                        // ── Auto Read Chat (private only) ──────────────────────────────────
                        if (isPrivate && !m.key?.fromMe) {
                                try {
                                        let readChatEnabled = false;
                                        if (hisoka.isMainBot === false) {
                                                const jadibotNum = getJadibotNumber(hisoka);
                                                readChatEnabled = getJadibotReadchat(jadibotNum)?.enabled || false;
                                        } else {
                                                readChatEnabled = config.readChat?.enabled || false;
                                        }
                                        if (readChatEnabled) {
                                                hisoka.readMessages([m.key]).catch(() => {});
                                        }
                                } catch (err) {
                                        console.error('\x1b[31m[ReadChat] Error:\x1b[39m', err.message);
                                }
                        }
                }
                // ini baru
                if (!m.key?.fromMe && m.key?.remoteJid === 'status@broadcast' && m.message && m.type && m.type !== 'protocolMessage' && m.type !== 'reactionMessage') { // sampe sini
                        // Jadibot punya handler sendiri (handleJadibotSW di jadibot.js).
                        // Kalau event.js ikut proses → reaksi duplikat. Skip kalau bukan bot utama.
                        if (hisoka.isMainBot === false) return;

                        const config = loadConfig();
                        const storyConfig = config.autoReadStory || {};

                        if (storyConfig.enabled === false) return;

                        // ── SwTrack: in-memory dedup (sebelum resolve, tanpa baca disk)
                        const msgId = m.key?.id;
                        if (!msgId || swProcessingSet.has(msgId)) return;
                        swProcessingSet.add(msgId);
                        _swProcessingSetTs.set(msgId, Date.now()); // untuk TTL cleanup

                        const reactStatus = getStatusEmojis();
                        let usedReaction = reactStatus.length ? getRandomEmoji('status') : '❌';

                        const useRandomDelay = storyConfig.randomDelay !== false;
                        const delayMinMs = storyConfig.delayMinMs || 1000;
                        const delayMaxMs = storyConfig.delayMaxMs || 20000;
                        const fixedDelayMs = storyConfig.fixedDelayMs || 3000;

                        const delayMs = useRandomDelay 
                                ? Math.floor(Math.random() * (delayMaxMs - delayMinMs)) + delayMinMs
                                : fixedDelayMs;

                        // Resolusi sender: PN diutamakan, LID disimpan untuk fallback
                        const rawParticipant = m.key?.participant || m.participant || m.sender;
                        const senderPn = m.sender && !String(m.sender).endsWith('@lid') ? m.sender : null;
                        let senderLid = rawParticipant && String(rawParticipant).endsWith('@lid') ? rawParticipant : null;
                        if (!senderLid && m.key?.participantAlt && String(m.key.participantAlt).endsWith('@lid')) {
                                senderLid = m.key.participantAlt;
                        }
                        // Lacak metode resolve buat ditampilkan di notif
                        let resolveMethod = null;
                        let resolvedPn = senderPn;
                        if (resolvedPn) resolveMethod = 'PN langsung ✓';
                        // Coba resolve PN lewat signalRepository jika belum ada
                        if (!resolvedPn && senderLid && hisoka?.signalRepository?.lidMapping?.getPNForLID) {
                                try {
                                        const r = await hisoka.signalRepository.lidMapping.getPNForLID(senderLid);
                                        if (r && !String(r).endsWith('@lid')) {
                                                resolvedPn = jidNormalizedUser(r);
                                                resolveMethod = 'Signal Lib ✓';
                                        }
                                } catch (_) {}
                        }
                        // Fallback: cache LID->PN runtime dari group metadata (bot utama)
                        if (!resolvedPn && senderLid && typeof global.__lookupLidPn === 'function') {
                                try {
                                        const r = global.__lookupLidPn(senderLid);
                                        if (r && !String(r).endsWith('@lid')) {
                                                resolvedPn = jidNormalizedUser(r);
                                                resolveMethod = 'Cache Grup ✓';
                                        }
                                } catch (_) {}
                        }
                        if (!resolvedPn && senderLid) resolveMethod = 'LID belum ke-resolve ❌';
                        if (!resolvedPn && !senderLid && rawParticipant) resolveMethod = 'Tanpa LID ⚠️';
                        const senderJid = resolvedPn || senderLid || rawParticipant;
                        const hasSender = !!senderJid;

                        // Skip story milik bot utama sendiri
                        const _botNum = (hisoka.user?.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                        const _senderNum = (resolvedPn || senderPn || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                        if (_botNum && _senderNum && _botNum === _senderNum) {
                                swProcessingSet.delete(msgId);
                                return;
                        }

                        let shouldReact = storyConfig.autoReaction !== false && reactStatus.length && hasSender;

                        // ── SwTrack: tentukan nomor dengan PN (bukan LID) lalu tulis entry awal ──
                        // resolvedPn sudah pasti bukan @lid, senderPn juga. Fallback ke null jika LID.
                        const trackNumber = resolvedPn
                                ? extractSwNumber(resolvedPn)
                                : (senderPn ? extractSwNumber(senderPn) : null);
                        if (trackNumber) {
                                if (isSwUserTracked(trackNumber, msgId)) {
                                        swProcessingSet.delete(msgId);
                                        return;
                                }
                                markSwUserEntry(trackNumber, msgId, {
                                        id: msgId,
                                        sender: resolvedPn || senderPn || rawParticipant || '',
                                        name: m.pushName || '',
                                        type: m.type || 'unknown',
                                        arrivedAt: new Date().toISOString(),
                                        read: false,
                                        reacted: false,
                                        reactionExpected: !!(shouldReact && resolvedPn),
                                        emoji: null,
                                        resolve: resolveMethod,
                                        source: 'status',
                                        // Simpan dari awal agar retry bisa jalan walau bot crash sebelum updateSwUserEntry
                                        number: trackNumber,
                                        resolvedPn: resolvedPn || null,
                                        messageKey: m.key || null,
                                });
                        }

                        await new Promise(resolve => setTimeout(resolve, delayMs));

                        // Cek apakah story dihapus pengirim selama delay berlangsung
                        if (trackNumber && !!loadSwUser(trackNumber)[msgId]?.deleted) {
                                swProcessingSet.delete(msgId);
                                return;
                        }

                        const activeStoryConfig = loadConfig().autoReadStory || {};
                        if (activeStoryConfig.enabled === false) {
                                swProcessingSet.delete(msgId);
                                return;
                        }
                        shouldReact = activeStoryConfig.enabled !== false
                                && activeStoryConfig.autoReaction !== false
                                && reactStatus.length > 0
                                && hasSender;

                        const isConnClosed = (err) => {
                                const msg = err?.message || String(err);
                                return msg.includes('Connection Closed') || msg.includes('Connection closed') || msg.includes('connection closed') || msg.includes('EPIPE') || msg.includes('write EPIPE') || msg.includes('Socket closed');
                        };

                        // Bangun beberapa varian key untuk receipt — pakai participant ASLI dari WA
                        // (LID maupun PN) supaya WA cocokkan dengan state story di server, lalu
                        // sync "sudah dilihat" ke semua device (HP & WhatsApp Web).
                        const buildKey = (participant) => ({
                                ...m.key,
                                remoteJid: 'status@broadcast',
                                ...(participant && { participant }),
                                fromMe: false,
                        });
                        const receiptKeys = [];
                        const seenParts = new Set();
                        const pushKey = (p) => {
                                if (!p) return;
                                const norm = jidNormalizedUser(p);
                                if (seenParts.has(norm)) return;
                                seenParts.add(norm);
                                receiptKeys.push(buildKey(norm));
                        };
                        // Urutan prioritas: participant asli dari key, lalu LID & PN hasil resolve
                        pushKey(rawParticipant);
                        pushKey(senderLid);
                        pushKey(resolvedPn);

                        // ── SwTrack: simpan receiptKeys & anti-miss retry ──
                        if (trackNumber) {
                                updateSwUserEntry(trackNumber, msgId, {
                                        receiptKeys,
                                        resolvedPn: resolvedPn || null,
                                        messageKey: m.key,
                                        reactionExpected: !!(shouldReact && resolvedPn),
                                });
                                const missed = getMissedSwEntries(
                                        trackNumber,
                                        msgId,
                                        activeStoryConfig.enabled !== false && activeStoryConfig.autoReaction !== false
                                )
                                        .filter(e => !swProcessingSet.has(e.id)); // skip yg masih on-progress
                                if (missed.length > 0) {
                                        const isCC = (e) => { const s = e?.message || String(e); return s.includes('Connection Closed') || s.includes('Connection closed') || s.includes('EPIPE') || s.includes('Socket closed'); };
                                        let retriedCount = 0;
                                        let lastResolve = null;
                                        // Cek ulang setting mode SAAT INI — kalau sejak story ini masuk,
                                        // reaksi sudah dimatikan (Read Only), retry jangan tetap kirim
                                        // reaksi (data harus ikut kondisi realtime, bukan kondisi lama).
                                        // Nilai ini juga dipakai buat kotak notif supaya akurat menampilkan
                                        // Mode & Reaksi yang sebenarnya berlaku saat retry ini, bukan cuma
                                        // label generik "Retry" yang bikin dikira ada reaksi padahal Read Only.
                                        let retryShouldReact = activeStoryConfig.enabled !== false && activeStoryConfig.autoReaction !== false;
                                        let anyReacted = false;
                                        for (const miss of missed) {
                                                try {
                                                        const mk = miss.receiptKeys || [];
                                                        if (mk.length > 0 && !miss.read) {
                                                                await Promise.all([
                                                                        hisoka.readMessages(mk).catch(e => { if (!isCC(e)) {} }),
                                                                        hisoka.sendReceipts(mk, 'read-self').catch(() => {}),
                                                                ]);
                                                        }
                                                        const retryConfigNow = loadConfig().autoReadStory || {};
                                                        retryShouldReact = retryConfigNow.enabled !== false && retryConfigNow.autoReaction !== false;
                                                        let mp = miss.resolvedPn;
                                                        /* FIX: kalau PN belum ke-resolve saat tracking, coba resolve lagi
                                                           dari sender (bisa LID) — sesuai mode di config.json */
                                                        if (retryShouldReact && !mp && miss.sender && String(miss.sender).endsWith('@lid')) {
                                                                try {
                                                                        if (hisoka?.signalRepository?.lidMapping?.getPNForLID) {
                                                                                const r = await hisoka.signalRepository.lidMapping.getPNForLID(miss.sender);
                                                                                if (r && !String(r).endsWith('@lid')) {
                                                                                        mp = jidNormalizedUser(r);
                                                                                        /* update entry biar retry berikutnya langsung pakai */
                                                                                        updateSwUserEntry(trackNumber, miss.id, { resolvedPn: mp });
                                                                                }
                                                                        }
                                                                } catch {}
                                                        }
                                                        let retryEmoji = null;
                                                        /* Syarat reaksi: mode Read+Reaction (dari config.json) + belum reacted +
                                                           ada PN (asli atau hasil resolve ulang) + ada messageKey.
                                                           reactionExpected lama tidak lagi jadi blocker — mode saat ini yang menentukan. */
                                                        if (retryShouldReact && !miss.reacted && mp && miss.messageKey) {
                                                                retryEmoji = getRandomEmoji('status') || '❤️';
                                                                await hisoka.sendMessage('status@broadcast',
                                                                        { react: { key: miss.messageKey, text: retryEmoji } },
                                                                        { statusJidList: [jidNormalizedUser(hisoka.user.id), jidNormalizedUser(mp)] }
                                                                ).catch(() => { retryEmoji = null; });
                                                                if (retryEmoji) anyReacted = true;
                                                                updateSwUserEntry(trackNumber, miss.id, { read: true, reacted: !!retryEmoji, emoji: retryEmoji, retriedAt: new Date().toISOString() });
                                                        } else if (mk.length > 0) {
                                                                updateSwUserEntry(trackNumber, miss.id, { read: true, retriedAt: new Date().toISOString() });
                                                        }
                                                        retriedCount++;
                                                        lastResolve = miss.resolve || lastResolve;
                                                } catch {}
                                        }
                                        // 1 kotak ringkasan per nomor — bukan 1 kotak per story tertunda,
                                        // supaya retry beruntun tidak kelihatan spam/duplikat di log.
                                        if (retriedCount > 0) {
                                                const lastMiss = missed[missed.length - 1];
                                                logStoryRetrySummary({
                                                        botId: hisoka.isMainBot ? null : (hisoka.user.name || maskNumber(hisoka.user.id.split(':')[0])),
                                                        name: lastMiss.name || trackNumber,
                                                        number: maskNumber(lastMiss.number || trackNumber),
                                                        count: retriedCount,
                                                        storyCount: getStoryCountToday(lastMiss.number || trackNumber),
                                                        resolve: lastResolve,
                                                        emojiMode: getMode(),
                                                        mode: retryShouldReact ? 'Read+Reaction ✓' : 'Read Only 👁️',
                                                        reaction: retryShouldReact ? (anyReacted ? 'Retry Berhasil ♻️' : 'Off ❌') : 'Off ❌',
                                                });
                                        }
                                }
                        }

                        // 'read' = beri tahu poster + WA sync ke device kita (hilangkan tanda hijau)
                        // Kirim per varian key supaya minimal salah satunya cocok di server WA
                        const readPromise = Promise.all(
                                receiptKeys.map(k =>
                                        hisoka.sendReceipts([k], 'read').catch(err => {
                                                if (!isConnClosed(err)) console.error('\x1b[31m[AutoRead] read failed:\x1b[39m', err?.message || String(err));
                                        })
                                )
                        );

                        const latestStoryConfig = loadConfig().autoReadStory || {};
                        shouldReact = latestStoryConfig.enabled !== false
                                && latestStoryConfig.autoReaction !== false
                                && reactStatus.length > 0
                                && hasSender;
                        if (trackNumber) {
                                updateSwUserEntry(trackNumber, msgId, {
                                        reactionExpected: !!(shouldReact && resolvedPn),
                                });
                        }

                        // Reaction butuh statusJidList format PN. Kalau belum ke-resolve, skip reaction
                        // daripada kena 'not-acceptable' dari server.
                        const reactPromise = (shouldReact && resolvedPn) ? hisoka.sendMessage(
                                'status@broadcast',
                                {
                                        react: { key: m.key, text: usedReaction },
                                },
                                {
                                        statusJidList: [jidNormalizedUser(hisoka.user.id), jidNormalizedUser(resolvedPn)],
                                }
                        ).catch((err) => {
                                if (!isConnClosed(err)) {
                                        console.error('\x1b[31m[Reaction Error]\x1b[39m', err?.message || String(err) || 'Unknown');
                                }
                                usedReaction = '❌ Gagal';
                        }) : (shouldReact ? (() => { usedReaction = '⏭️ Skip (LID belum resolve)'; return Promise.resolve(); })() : Promise.resolve());

                        await Promise.all([readPromise, reactPromise]);

                        // Prioritaskan resolvedPn agar storyNumber berisi nomor HP (bukan LID user ID)
                        const from = jidNormalizedUser(resolvedPn || m.participant || m.sender);
                        const storyNumber = trackNumber || jidDecode(from)?.user || '';
                        const storyName = m.pushName || hisoka.getName(from, true) || storyNumber;
                        const messageDate = new Date(toNumber(m.messageTimestamp) * 1000);

                        const reactionSuccess = shouldReact && resolvedPn && usedReaction !== '❌ Gagal' && usedReaction !== '⏭️ Skip (LID belum resolve)';
                        updateSwStats(storyNumber, storyName, reactionSuccess, reactionSuccess ? usedReaction : null, msgId);

                        // ── SwTrack: update hasil ──
                        if (trackNumber) {
                                updateSwUserEntry(trackNumber, msgId, {
                                        name: storyName,
                                        number: storyNumber,
                                        resolve: resolveMethod,
                                        read: true,
                                        reacted: reactionSuccess,
                                        emoji: reactionSuccess ? usedReaction : null,
                                        processedAt: new Date().toISOString(),
                                });
                        }
                        // msgId TIDAK dihapus dari swProcessingSet setelah diproses —
                        // biarkan tetap sebagai pelindung dedup kalau WA re-deliver story yang sama

                        const now = Date.now();
                        // ini baru debounce bot utama dan jadibot
                        const botId = hisoka.user.id.split(':')[0]
                        const debounceKey = `${botId}:${from}` // sampe sini
                        const lastLog = storyDebounce.get(debounceKey);
                        const telegramConfig = loadConfig().telegram || {};

                        if (lastLog) {
                                lastLog.count++;
                                storyDebounce.set(debounceKey, lastLog);
                        } else {
                                storyDebounce.set(debounceKey, { time: now, count: 1 });

                                const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
                                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

                                const jakartaDate = new Date(messageDate.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
                                const dayName = dayNames[jakartaDate.getDay()];
                                const dateStr = `${jakartaDate.getDate()} ${monthNames[jakartaDate.getMonth()]} ${jakartaDate.getFullYear()}`;
                                const timeStr = jakartaDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '.');

                                let successMsg = 'Ke Tele ✓';
                                if (!telegramConfig.enabled || !telegramConfig.chatId || !telegramConfig.token) {
                                        successMsg = 'Ke Tele ❌';
                                }

                                logStoryView({
                     /* ini tambahan */ botId: hisoka.isMainBot ? null : (hisoka.user.name || maskNumber(botId)),
                                        mediaType: getMediaTypeEmoji(m.type),
                                        idStory: m.key?.id || null,
                                        greeting: getGreeting(),
                                        dayName: dayName,
                                        date: dateStr,
                                        time: timeStr,
                                        name: storyName,
                                        number: maskNumber(storyNumber),
                                        storyCount: getStoryCountToday(storyNumber),
                                        success: successMsg,
                                        reaction: shouldReact ? usedReaction : 'Off ❌',
                                        resolve: resolveMethod,
                                        delaySeconds: (delayMs / 1000).toFixed(1),
                                        mode: shouldReact ? 'Read+Reaction ✓' : 'Read Only',
                                        emojiMode: getMode(),
                                });

                                setTimeout(() => {
                                        const data = storyDebounce.get(debounceKey);
                                        if (data && data.count > 1) {
                                                console.log(`\x1b[33m   └─ +${data.count - 1} story lainnya dari ${storyName}\x1b[39m`);
                                        }
                                        storyDebounce.delete(debounceKey);
                                }, 3000);
                        }

                        if (telegramConfig.enabled && telegramConfig.chatId && telegramConfig.token) {
                                const text = formatTeleCaption({
                                        type: m.type,
                                        text: m.text,
                                        fromUser: jidDecode(from).user,
                                        storyName,
                                        timestampMs: toNumber(m.messageTimestamp) * 1000,
                                }).trim();

                                if (m.isMedia) {
                                        try {
                                                const media = await m.downloadMedia();

                                                if (!media || media.length === 0) {
                                                        await teleSendAuto(hisoka, telegramConfig.chatId, text + '\n\n<i>(Media tidak tersedia)</i>', { type: 'text', parse_mode: 'HTML' });
                                                } else {
                                                        const ext = m.type === 'imageMessage' ? 'jpg' : m.type === 'videoMessage' ? 'mp4' : m.type === 'audioMessage' ? 'mp3' : 'bin';
                                                        const tmpFile = getTmpPath(`story_${Date.now()}.${ext}`);

                                                        try {
                                                                fs.writeFileSync(tmpFile, media);

                                                                await teleSendAuto(hisoka, telegramConfig.chatId, media, {
                                                                        caption: text,
                                                                        type: m.type.replace('Message', ''),
                                                                        parse_mode: 'HTML',
                                                                });

                                                                fs.unlinkSync(tmpFile);
                                                        } catch (err) {
                                                                if (fs.existsSync(tmpFile)) {
                                                                        fs.unlinkSync(tmpFile);
                                                                }
                                                                console.error('\x1b[31m[AutoReadSW] Error sending to Telegram:\x1b[39m', err.message);
                                                        }
                                                }
                                        } catch (downloadErr) {
                                                console.error('\x1b[33m[AutoReadSW] Media unavailable:\x1b[39m', downloadErr.message);
                                                await teleSendAuto(hisoka, telegramConfig.chatId, text + '\n\n<i>(Media tidak tersedia)</i>', { type: 'text', parse_mode: 'HTML' }).catch(() => {});
                                        }
                                } else {
                                        await teleSendAuto(hisoka, telegramConfig.chatId, text, { type: 'text', parse_mode: 'HTML' });
                                }
                        } else if (telegramConfig.enabled) {
                                // Notif akurat 1x/6 jam: aktif tapi token/chatId kosong
                                notifTeleBelumLengkap(hisoka, loadConfig, telegramConfig);
                        }
                }
                // Group Linked Status (upswgc / groupStatusMessageV2 / groupStatusMentionMessage / groupMentionedMessage)
                // Cek contextInfo.isGroupStatus sebagai fallback (dikirim via upswgc dengan contextInfo: { isGroupStatus: true })
                const _gsPayload = m.message?.groupStatusMessageV2 || m.message?.groupStatusMentionMessage || m.message?.groupMentionedMessage
                        || (m.message && (() => { try { const vals = Object.values(m.message); for (const v of vals) { if (v?.contextInfo?.isGroupStatus) return v; } } catch {} return null; })());
                if (isJidGroup(m.key?.remoteJid) && _gsPayload) {
                        const _gsInnerMsg = _gsPayload?.message;
                        const _gsInnerType = (() => {
                                try {
                                        return _gsInnerMsg
                                                ? Object.keys(_gsInnerMsg).find(k => k !== 'messageContextInfo') || m.type
                                                : m.type;
                                } catch {
                                        return m.type;
                                }
                        })();
                        // Protocol, reaction, and poll updates may retain group-status context,
                        // but they are not story posts and must not be marked read or logged.
                        const _gsControlTypes = new Set(['protocolMessage', 'reactionMessage', 'pollUpdateMessage']);
                        if (_gsControlTypes.has(m.type) || _gsControlTypes.has(_gsInnerType)) return;

                        // Sama seperti status@broadcast — jadibot sudah dihandle oleh handleJadibotSW
                        if (hisoka.isMainBot === false) return;

                        const config = loadConfig();
                        const storyConfig = config.autoReadStory || {};

                        if (storyConfig.enabled === false) return;

                        // ── SwTrack: in-memory dedup
                        const gsMsgId = m.key?.id;
                        if (!gsMsgId || swProcessingSet.has(gsMsgId)) return;
                        swProcessingSet.add(gsMsgId);
                        _swProcessingSetTs.set(gsMsgId, Date.now()); // untuk TTL cleanup

                        const reactStatus = getStatusEmojis();
                        let usedReaction = reactStatus.length ? getRandomEmoji('status') : '❌';

                        const useRandomDelay = storyConfig.randomDelay !== false;
                        const delayMinMs = storyConfig.delayMinMs || 1000;
                        const delayMaxMs = storyConfig.delayMaxMs || 20000;
                        const fixedDelayMs = storyConfig.fixedDelayMs || 3000;

                        const delayMs = useRandomDelay
                                ? Math.floor(Math.random() * (delayMaxMs - delayMinMs)) + delayMinMs
                                : fixedDelayMs;

                        // Group stories may identify their author with a LID. Never treat
                        // the group's JID as the story author's phone number.
                        const _isUserJid = jid => typeof jid === 'string'
                                && jid.includes('@')
                                && !jid.endsWith('@lid')
                                && !jid.endsWith('@g.us')
                                && !jid.endsWith('@broadcast');
                        const _senderCandidates = [
                                m.key?.participantAlt,
                                m.sender,
                                m.participant,
                                m.key?.participant,
                        ].filter(_isUserJid);
                        let resolvedPn = _senderCandidates[0] ? jidNormalizedUser(_senderCandidates[0]) : null;
                        const senderLid = [
                                m.key?.participant,
                                m.participant,
                                m.sender,
                                m.key?.participantAlt,
                        ].find(jid => typeof jid === 'string' && jid.endsWith('@lid')) || null;
                        let resolveMethod = resolvedPn ? 'PN langsung ✓' : null;
                        if (!resolvedPn && m.key?.fromMe && _isUserJid(hisoka.user?.id)) {
                                resolvedPn = jidNormalizedUser(hisoka.user.id);
                                resolveMethod = 'Self Story ✓';
                        }
                        if (!resolvedPn && senderLid && hisoka?.signalRepository?.lidMapping?.getPNForLID) {
                                try {
                                        const pn = await hisoka.signalRepository.lidMapping.getPNForLID(senderLid);
                                        if (_isUserJid(pn)) {
                                                resolvedPn = jidNormalizedUser(pn);
                                                resolveMethod = 'Signal Lib ✓';
                                        }
                                } catch (_) {}
                        }
                        if (!resolvedPn && senderLid && typeof global.__lookupLidPn === 'function') {
                                try {
                                        const pn = global.__lookupLidPn(senderLid);
                                        if (_isUserJid(pn)) {
                                                resolvedPn = jidNormalizedUser(pn);
                                                resolveMethod = 'Cache Grup ✓';
                                        }
                                } catch (_) {}
                        }
                        if (!resolvedPn && senderLid && typeof hisoka.resolveLidToPN === 'function') {
                                try {
                                        const pn = await hisoka.resolveLidToPN(m.key);
                                        if (_isUserJid(pn)) {
                                                resolvedPn = jidNormalizedUser(pn);
                                                resolveMethod = 'Metadata Grup ✓';
                                        }
                                } catch (_) {}
                        }
                        if (!resolvedPn && senderLid) resolveMethod = 'LID belum ke-resolve ❌';
                        const senderJid = resolvedPn || senderLid || (m.key?.fromMe ? hisoka.user?.id : null);
                        const senderJidNorm = resolvedPn ? jidNormalizedUser(resolvedPn) : null;
                        const hasSender = !!senderJid;
                        const wantsReaction = storyConfig.autoReaction !== false && reactStatus.length > 0;
                        let shouldReact = wantsReaction && hasSender && (m.key?.fromMe || !!senderJidNorm);
                        if (wantsReaction && hasSender && !shouldReact) {
                                usedReaction = '⏭️ Skip (LID belum resolve)';
                        } else if (wantsReaction && !hasSender) {
                                usedReaction = '⏭️ Skip (pengirim tidak tersedia)';
                        }

                        // ── SwTrack: tulis entry awal (group status — sender biasanya PN langsung)
                        const gsTrackNumber = resolvedPn ? extractSwNumber(resolvedPn) : null;
                        if (gsTrackNumber) {
                                if (isSwUserTracked(gsTrackNumber, gsMsgId)) {
                                        swProcessingSet.delete(gsMsgId);
                                        return;
                                }
                                markSwUserEntry(gsTrackNumber, gsMsgId, {
                                        id: gsMsgId,
                                        sender: senderJid || '',
                                        name: m.pushName || '',
                                        type: _gsInnerType || m.type || 'groupStatus',
                                        arrivedAt: new Date().toISOString(),
                                        read: false,
                                        reacted: false,
                                        reactionExpected: !!shouldReact,
                                        emoji: null,
                                        source: 'group',
                                        number: gsTrackNumber,
                                        messageKey: m.key,
                                        resolvedPn: senderJid && !String(senderJid).endsWith('@lid') ? jidNormalizedUser(senderJid) : null,
                                });
                        }

                        await new Promise(resolve => setTimeout(resolve, delayMs));

                        // Cek apakah story GC dihapus pengirim selama delay berlangsung
                        if (gsTrackNumber && !!loadSwUser(gsTrackNumber)[gsMsgId]?.deleted) {
                                swProcessingSet.delete(gsMsgId);
                                return;
                        }

                        const latestGsConfigBeforeReaction = loadConfig().autoReadStory || {};
                        shouldReact = latestGsConfigBeforeReaction.enabled !== false
                                && latestGsConfigBeforeReaction.autoReaction !== false
                                && reactStatus.length > 0
                                && hasSender
                                && (m.key?.fromMe || !!senderJidNorm);
                        if (gsTrackNumber) {
                                updateSwUserEntry(gsTrackNumber, gsMsgId, {
                                        reactionExpected: !!shouldReact,
                                });
                        }

                        const isGsConnClosed = (err) => {
                                const msg = err?.message || String(err);
                                return msg.includes('Connection Closed') || msg.includes('Connection closed') || msg.includes('connection closed') || msg.includes('EPIPE') || msg.includes('write EPIPE') || msg.includes('Socket closed');
                        };

                        // Read + view receipt — agar counter "dilihat" bertambah
                        const gsReadPromise = Promise.all([
                                hisoka.readMessages([m.key]).catch(err => {
                                        if (!isGsConnClosed(err)) console.error('\x1b[31m[GroupStatus Read Error]\x1b[39m', err?.message || String(err));
                                }),
                                hisoka.sendReceipts([m.key], 'read').catch(() => {}),
                        ]);

                        const latestGsConfig = loadConfig().autoReadStory || {};
                        if (latestGsConfig.enabled === false) {
                                swProcessingSet.delete(gsMsgId);
                                return;
                        }
                        shouldReact = latestGsConfig.enabled !== false
                                && latestGsConfig.autoReaction !== false
                                && reactStatus.length > 0
                                && hasSender
                                && (m.key?.fromMe || !!senderJidNorm);
                        if (gsTrackNumber) {
                                updateSwUserEntry(gsTrackNumber, gsMsgId, {
                                        reactionExpected: !!shouldReact,
                                });
                        }

                        // Dua jalur reaksi:
                        // fromMe=true  → react ke group JID (story sendiri = group message, WA izinkan react ke pesan sendiri)
                        // fromMe=false → react ke status@broadcast + statusJidList (linked status dari orang lain)
                        let reactPromise;
                        if (!shouldReact) {
                                reactPromise = Promise.resolve();
                        } else if (m.key?.fromMe) {
                                // Story gc milik bot sendiri — react ke group JID seperti group message biasa
                                const gsSelfKey = { ...m.key };
                                reactPromise = hisoka.sendMessage(
                                        m.key.remoteJid,
                                        { react: { key: gsSelfKey, text: usedReaction } }
                                ).catch((err) => {
                                        if (!isGsConnClosed(err)) console.error('\x1b[31m[GroupStatus Self-Reaction Error]\x1b[39m', err?.message || String(err) || 'Unknown');
                                        usedReaction = '❌ Gagal';
                                });
                        } else {
                                // Story gc orang lain — react via status@broadcast + statusJidList
                                const gsStatusKey = {
                                        remoteJid: 'status@broadcast',
                                        fromMe: false,
                                        id: m.key?.id,
                                        participant: senderJidNorm || undefined,
                                };
                                const gsStatusJidList = [jidNormalizedUser(hisoka.user.id), ...(senderJidNorm ? [senderJidNorm] : [])];
                                reactPromise = hisoka.sendMessage(
                                        'status@broadcast',
                                        { react: { key: gsStatusKey, text: usedReaction } },
                                        { statusJidList: gsStatusJidList }
                                ).catch((err) => {
                                        if (!isGsConnClosed(err)) console.error('\x1b[31m[GroupStatus Reaction Error]\x1b[39m', err?.message || String(err) || 'Unknown');
                                        usedReaction = '❌ Gagal';
                                });
                        }

                        await Promise.all([gsReadPromise, reactPromise]);

                        // Jangan turunkan nomor dari LID: itu ID internal, bukan nomor telepon.
                        const from = jidNormalizedUser(senderJid || m.key.remoteJid);
                        const storyNumber = gsTrackNumber || (resolvedPn ? extractSwNumber(resolvedPn) : '');
                        const _pushName = String(m.pushName || '').trim();
                        const _lidNameDigits = senderLid?.split('@')[0].split(':')[0] || '';
                        const _validPushName = _pushName
                                && !/^(unknown|null|undefined)$/i.test(_pushName)
                                && !(_lidNameDigits && _pushName === _lidNameDigits)
                                ? _pushName
                                : null;
                        const _contactName = resolvedPn
                                ? (hisoka.getName(resolvedPn, true) || hisoka.getName(resolvedPn))
                                : null;
                        const storyName = _validPushName
                                || (_contactName && !/^(unknown|null|undefined)$/i.test(String(_contactName).trim()) ? _contactName : null)
                                || storyNumber
                                || (senderLid ? 'Nama belum tersedia' : 'Nama tidak tersedia');
                        const _groupJid = m.key.remoteJid;
                        const _isRealGroupName = name => {
                                const value = String(name || '').trim();
                                return value
                                        && value !== _groupJid
                                        && value !== _groupJid.split('@')[0]
                                        && !/^\d+$/.test(value);
                        };
                        let groupName = [
                                m.groupSubject,
                                hisoka.groups?.read?.(_groupJid)?.subject,
                                global.__mainBotGroups?.read?.(_groupJid)?.subject,
                        ].find(_isRealGroupName) || null;
                        if (!groupName && typeof hisoka.groupMetadata === 'function') {
                                try {
                                        const metadata = await hisoka.groupMetadata(_groupJid);
                                        groupName = _isRealGroupName(metadata?.subject) ? metadata.subject : null;
                                        if (metadata && hisoka.groups?.write) {
                                                try { await hisoka.groups.write(_groupJid, metadata); } catch (_) {}
                                        }
                                } catch (_) {}
                        }
                        groupName ||= 'Grup tidak diketahui';

                        const gsReactionSuccess = shouldReact && usedReaction !== '❌ Gagal';
                        if (storyNumber) {
                                updateSwStats(storyNumber, storyName, gsReactionSuccess, gsReactionSuccess ? usedReaction : null, gsMsgId);
                        }

                        // ── SwTrack: update hasil handler 2 ──
                        if (gsTrackNumber) {
                                updateSwUserEntry(gsTrackNumber, gsMsgId, {
                                        name: storyName,
                                        number: storyNumber,
                                        read: true,
                                        reacted: gsReactionSuccess,
                                        emoji: gsReactionSuccess ? usedReaction : null,
                                        processedAt: new Date().toISOString(),
                                });
                        }
                        // gsMsgId TIDAK dihapus dari swProcessingSet — cegah spam re-deliver dari WA

                        const nowGs = Date.now();
                        const botIdGs = hisoka.user.id.split(':')[0];
                        const debounceKeyGs = `gs:${botIdGs}:${from}`;
                        const lastLogGs = storyDebounce.get(debounceKeyGs);

                        if (!lastLogGs) {
                                storyDebounce.set(debounceKeyGs, { time: nowGs, count: 1 });

                                const delaySeconds = (delayMs / 1000).toFixed(1);
                                const _baseType = getMediaTypeEmoji(_gsInnerType);
                                const mediaType = [_baseType[0] + ' GC', _baseType[1]];
                                const greeting = getGreeting();

                                const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
                                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
                                const jakartaDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
                                const dayName = dayNames[jakartaDate.getDay()];
                                const dateStr = `${jakartaDate.getDate()} ${monthNames[jakartaDate.getMonth()]} ${jakartaDate.getFullYear()}`;
                                const timeStr = jakartaDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '.');

                                const mode = wantsReaction ? 'Read+Reaction ✓' : 'Read Only 👁️';

                                logStoryView({
                                        botId: hisoka.isMainBot ? null : (hisoka.user.name || maskNumber(botIdGs)),
                                        mediaType,
                                        idStory: m.key?.id || null,
                                        greeting,
                                        dayName,
                                        date: dateStr,
                                        time: timeStr,
                                        name: storyName,
                                        number: storyNumber ? maskNumber(storyNumber) : (senderLid ? 'LID belum resolve' : 'Nomor tidak tersedia'),
                                        storyCount: storyNumber ? getStoryCountToday(storyNumber) : 0,
                                        success: gsReactionSuccess ? 'Grup SW ✓' : 'Baca ✓',
                                        reaction: wantsReaction ? usedReaction : 'Off ❌',
                                        delaySeconds,
                                        mode,
                                        groupName,
                                        resolve: resolveMethod,
                                        emojiMode: getMode(),
                                });

                                setTimeout(() => {
                                        storyDebounce.delete(debounceKeyGs);
                                }, 3000);
                        }
                }
        } catch (e) {
                console.error(`\x1b[31mError in event handler:\x1b[39m\n`, e);
        }
}