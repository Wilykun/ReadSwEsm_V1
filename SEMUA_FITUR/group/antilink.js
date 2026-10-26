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
 *  antilink.js — Anti-Link di Grup
 *  Blokir link apapun di grup, sistem warn+kick otomatis
 *  Hanya berjalan di bot utama (bukan jadibot)
 * ───────────────────────────────
 */

'use strict';

import fs from 'fs';
import path from 'path';
import { isJidGroup, jidNormalizedUser, areJidsSameUser, jidDecode, getContentType } from '@whiskeysockets/baileys';

import { kvGet, kvSet } from '../../src/db/datadb.js';

// Tandai pesan yang dihapus oleh antilink agar anti-delete tidak notif
if (!global.__antiLinkDeletedIds) global.__antiLinkDeletedIds = new Set();

// ─── Regex deteksi link ───────────────────────────────────────────────────────
const LINK_REGEX = /(?:https?:\/\/|www\.)[^\s<>"']+|(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+(?:com|net|org|id|co|io|me|info|biz|tv|online|site|web|app|shop|store|link|cc|to|ly|gg|lol|wtf|xyz|top|pro|live|news|tech|digital|media|click|page|space|chat|group|my|asia|be|in|us|uk|de|fr|ru|jp|au|ca|it|es|br|nl|pl|se|no|fi|dk|sg|ph|vn|th|hk|tw|nz|za|ae|tr|mx|ar|cl|pe)\b(?:[\/\w\-._~:/?#[\]@!$&'()*+,;=%]*)?/gi;

// Tipe pesan yang bisa mengandung teks / caption
const TEXT_MSG_TYPES = [
    'conversation', 'extendedTextMessage',
    'imageMessage', 'videoMessage', 'documentMessage',
    'documentWithCaptionMessage', 'audioMessage',
    'buttonsMessage', 'listMessage', 'templateMessage',
];

// ─── Config & Data helpers ────────────────────────────────────────────────────

function loadConfig() {
    try {
        const p = path.join(process.cwd(), 'config.json');
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch (_) {}
    return {};
}

function saveConfig(cfg) {
    try {
        fs.writeFileSync(path.join(process.cwd(), 'config.json'), JSON.stringify(cfg, null, 2), 'utf-8');
    } catch (err) {
        console.error('\x1b[31m[AntiLink] Gagal simpan config:\x1b[39m', err.message);
    }
}

function loadData() {
    const d = kvGet('security/antilink', { groups: [], disabledGroups: [], warnings: {} });
    if (!Array.isArray(d.groups)) d.groups = [];
    if (!Array.isArray(d.disabledGroups)) d.disabledGroups = [];
    if (!d.warnings) d.warnings = {};
    return d;
}

function saveData(d) {
    try { kvSet('security/antilink', d); }
    catch (err) { console.error('\x1b[31m[AntiLink] Gagal simpan data:\x1b[39m', err.message); }
}

// ─── Exported helpers ─────────────────────────────────────────────────────────

export function isAntiLinkEnabled(groupId) {
    const d = loadData();
    return d.groups.includes(groupId);
}

export function isAntiLinkDisabled(groupId) {
    const d = loadData();
    return d.disabledGroups.includes(groupId);
}

export function toggleAntiLink(groupId, enable) {
    const d = loadData();
    if (enable) {
        // Aktifkan: masuk groups, keluar disabledGroups
        if (!d.groups.includes(groupId)) d.groups.push(groupId);
        d.disabledGroups = d.disabledGroups.filter(g => g !== groupId);
    } else {
        // Nonaktifkan: keluar groups, masuk disabledGroups
        d.groups = d.groups.filter(g => g !== groupId);
        if (!d.disabledGroups.includes(groupId)) d.disabledGroups.push(groupId);
        // Reset warnings saat dinonaktifkan
        if (d.warnings[groupId]) delete d.warnings[groupId];
    }
    saveData(d);
}

export function getAntiLinkWarnings(groupId) {
    const d = loadData();
    return d.warnings[groupId] || {};
}

export function resetAntiLinkWarnings(groupId) {
    const d = loadData();
    if (groupId) delete d.warnings[groupId];
    else d.warnings = {};
    saveData(d);
}

export function getAllAntiLinkGroups() {
    const d = loadData();
    return [...d.groups];
}

export function getDisabledAntiLinkGroups() {
    const d = loadData();
    return [...d.disabledGroups];
}

// ─── Log ──────────────────────────────────────────────────────────────────────

const _LOG_KEY = 'security/antilink_log';
const _LOG_MAX  = 500;

function appendLog(entry) {
    try {
        const logs = kvGet(_LOG_KEY, []);
        logs.push(entry);
        if (logs.length > _LOG_MAX) logs.splice(0, logs.length - _LOG_MAX);
        kvSet(_LOG_KEY, logs);
    } catch (_) {}
}

export function getAntiLinkLog(groupId) {
    try {
        const logs = kvGet(_LOG_KEY, []);
        return groupId ? logs.filter(l => l.gid === groupId) : logs;
    } catch (_) { return []; }
}

export function clearAntiLinkLog(groupId) {
    try {
        if (!groupId) { kvSet(_LOG_KEY, []); return; }
        kvSet(_LOG_KEY, kvGet(_LOG_KEY, []).filter(l => l.gid !== groupId));
    } catch (_) {}
}

// ─── Ambil teks dari berbagai tipe pesan ─────────────────────────────────────

function extractTextFromMsgObj(msgObj) {
    if (!msgObj || typeof msgObj !== 'object') return '';
    const t = getContentType(msgObj);
    if (!t) return '';
    const inner = msgObj[t] || {};
    if (t === 'conversation') return inner || '';
    if (t === 'extendedTextMessage') return inner.text || '';
    if (['imageMessage','videoMessage','documentMessage','documentWithCaptionMessage','audioMessage'].includes(t))
        return inner.caption || '';
    if (t === 'buttonsMessage') return inner.contentText || inner.footerText || '';
    if (t === 'listMessage') return inner.description || inner.title || '';
    if (t === 'templateMessage')
        return inner.hydratedTemplate?.hydratedContentText
            || inner.hydratedFourRowTemplate?.hydratedContentText || '';
    return '';
}

function extractText(message) {
    if (!message?.message) return '';
    return extractTextFromMsgObj(message.message);
}

function detectLink(text) {
    if (!text || typeof text !== 'string') return false;
    LINK_REGEX.lastIndex = 0;
    return LINK_REGEX.test(text);
}

function extractLinks(text) {
    if (!text || typeof text !== 'string') return [];
    LINK_REGEX.lastIndex = 0;
    return text.match(LINK_REGEX) || [];
}

// ─── Ambil contextInfo dari pesan ────────────────────────────────────────────
function getContextInfo(message) {
    if (!message?.message) return null;
    try {
        const msgObj = message.message;
        const t = getContentType(msgObj);
        if (!t) return null;
        const inner = msgObj[t];
        if (typeof inner === 'object' && inner?.contextInfo) return inner.contextInfo;
    } catch (_) {}
    return null;
}

// ─── Admin helpers ────────────────────────────────────────────────────────────

function findParticipant(participants, targetNumber) {
    return participants?.find(p => {
        const num = (p.jid || p.phoneNumber || p.id || '').split('@')[0].split(':')[0];
        return num === targetNumber;
    });
}

function loadBotAdminFile() { return kvGet('botadmin/botadmin', {}); }
function saveBotAdminFile(d) { try { kvSet('botadmin/botadmin', d); } catch (_) {} }

function isOwnerJid(senderJid, senderNumber, config) {
    const owners = config.owners || [];
    return owners.some(o => areJidsSameUser(o + '@s.whatsapp.net', senderJid) || o === senderNumber);
}

async function getBotAdminStatus(remoteJid, botNumber, hisoka) {
    let groupMeta = null, isAdmin = false;
    try {
        groupMeta = await hisoka.groupMetadata(remoteJid);
        if (groupMeta) hisoka.groups?.write(remoteJid, groupMeta);
        isAdmin = !!findParticipant(groupMeta?.participants, botNumber)?.admin;
        const bad = loadBotAdminFile(); bad[remoteJid] = isAdmin; saveBotAdminFile(bad);
    } catch (_) {
        const bad = loadBotAdminFile();
        if (remoteJid in bad) isAdmin = bad[remoteJid] === true;
        groupMeta = hisoka.groups?.read(remoteJid) || null;
        if (groupMeta) isAdmin = !!findParticipant(groupMeta?.participants, botNumber)?.admin;
    }
    return { groupMeta, isAdmin };
}

async function deleteMsg(remoteJid, msgId, participant, hisoka) {
    global.__antiLinkDeletedIds.add(msgId);
    setTimeout(() => global.__antiLinkDeletedIds.delete(msgId), 10000);
    try {
        await hisoka.sendMessage(remoteJid, { delete: { remoteJid, fromMe: false, id: msgId, participant } });
        return true;
    } catch (err) {
        console.error('\x1b[31m[AntiLink] Gagal hapus pesan:\x1b[39m', err.message);
        return false;
    }
}

function buildGroupStats(groupMeta, newWarn, maxWarnings) {
    const parts = groupMeta?.participants || [];
    const totalMembers = parts.length;
    const totalAdmins = parts.filter(p => p.admin).length;
    const totalMembers_ = totalMembers - totalAdmins;
    const filled = '◆'.repeat(Math.min(newWarn, maxWarnings));
    const empty  = '◇'.repeat(Math.max(maxWarnings - newWarn, 0));
    const warnBar = filled + empty;
    const ap = totalMembers > 0 ? Math.round((totalAdmins / totalMembers) * 10) : 0;
    const adminBar = '█'.repeat(ap) + '░'.repeat(10 - ap);
    return { totalMembers, totalAdmins, totalMembers_, warnBar, adminBar,
             adminPct: totalMembers > 0 ? Math.round((totalAdmins / totalMembers) * 100) : 0 };
}

function getWaktuStr() {
    const now = new Date();
    return {
        timeStr: now.toLocaleTimeString('id-ID', { timeZone:'Asia/Jakarta', hour:'2-digit', minute:'2-digit', second:'2-digit' }),
        dateStr: now.toLocaleDateString('id-ID',  { timeZone:'Asia/Jakarta', day:'2-digit', month:'2-digit', year:'numeric' })
    };
}

// ═══════════════════════════════════════════════════════════════
//  Auto-deteksi link — HANYA bot utama (bukan jadibot)
// ═══════════════════════════════════════════════════════════════
export default async function handleAntiLink(message, hisoka) {
    try {
        if (hisoka?.isMainBot === false) return;
        if (!message?.key?.remoteJid || !message.message) return;

        const remoteJid = message.key.remoteJid;
        if (!isJidGroup(remoteJid)) return;
        if (message.key?.fromMe) return;

        const config = loadConfig();
        const antiLinkConfig = config.antiLink || {};
        if (!antiLinkConfig.enabled) return;

        const data = loadData();
        if (!Array.isArray(data.groups) || !data.groups.includes(remoteJid)) return;

        const senderJid = jidNormalizedUser(
            message.key.participant || message.participant || message.key.remoteJid
        );
        if (!senderJid) return;

        const isLid = senderJid.includes('@lid');
        const senderNumber      = isLid ? '[LID]' : (jidDecode(senderJid)?.user || senderJid.split('@')[0] || '');
        const senderNumberClean = senderJid.split('@')[0];
        const pushName          = message.pushName || message.verifiedBizName || null;

        const botJid    = jidNormalizedUser(hisoka.user?.id || '');
        const botNumber = botJid.split('@')[0];

        if (areJidsSameUser(senderJid, botJid)) return;

        const isOwner = isOwnerJid(senderJid, senderNumber, config);
        const { groupMeta, isAdmin: botIsAdmin } = await getBotAdminStatus(remoteJid, botNumber, hisoka);

        let senderIsAdmin = false;
        if (groupMeta?.participants) {
            senderIsAdmin = !!findParticipant(groupMeta.participants, senderNumberClean)?.admin;
        }

        const maxWarnings = antiLinkConfig.maxWarnings ?? 3;

        // ── Admin / Owner GC me-reply pesan berisi link → hapus pesan quoted ──
        if (isOwner || senderIsAdmin) {
            const ctx = getContextInfo(message);
            if (ctx?.stanzaId && ctx?.quotedMessage) {
                const quotedText = extractTextFromMsgObj(ctx.quotedMessage);
                if (detectLink(quotedText)) {
                    const qId          = ctx.stanzaId;
                    const qParticipant = ctx.participant || ctx.remoteJid;
                    const qNum         = qParticipant
                        ? (jidDecode(jidNormalizedUser(qParticipant))?.user || qParticipant.split('@')[0])
                        : '-';
                    const links       = extractLinks(quotedText);
                    const linkPreview = links[0] ? links[0].slice(0, 60) + (links[0].length > 60 ? '…' : '') : '-';

                    console.log(`\x1b[33m[AntiLink] Admin/Owner @${senderNumberClean} reply pesan link → hapus quoted (${qId})\x1b[39m`);

                    if (botIsAdmin) {
                        const deleted = await deleteMsg(remoteJid, qId, qParticipant, hisoka);
                        const _delTxt = deleted
                            ? `╭─〔 🗑️ *Anti-Link* 〕\n│\n│ ✅ *Pesan link berhasil dihapus!*\n│\n│ 👤 Pengirim : @${qNum}\n│ 🛡️ Dihapus oleh : _${isOwner ? 'owner' : 'admin'}_\n│\n╰────────────────────`
                            : `╭─〔 ❌ *Anti-Link* 〕\n│\n│ *Gagal hapus pesan link.*\n│\n> Pastikan bot sudah menjadi\n> *admin grup* lalu coba lagi.\n│\n╰────────────────────`;
                        await hisoka.sendMessage(remoteJid, {
                            text: _delTxt,
                            contextInfo: { mentionedJid: qParticipant ? [jidNormalizedUser(qParticipant)] : [] }
                        }, { quoted: message });
                    } else {
                        await hisoka.sendMessage(remoteJid, {
                            text: `╭─〔 ⚠️ *Anti-Link* 〕\n│\n│ 🤖 Bot *bukan admin* di grup ini!\n│\n> Jadikan bot *admin grup* agar\n> bisa hapus pesan link otomatis.\n│\n╰────────────────────`
                        }, { quoted: message });
                    }
                }
            }
            return; // Owner/Admin bebas kirim link sendiri
        }

        // ── Member biasa kirim pesan berisi link ──────────────────────────────
        const msgType = getContentType(message.message);
        if (!msgType || !TEXT_MSG_TYPES.includes(msgType)) return;

        const text = extractText(message);
        if (!text || !detectLink(text)) return;

        const links       = extractLinks(text);
        const linkPreview = links[0] ? links[0].slice(0, 60) + (links[0].length > 60 ? '…' : '') : '-';

        console.log(`\x1b[33m[AntiLink] Link terdeteksi! Sender: ${senderNumber} | BotAdmin: ${botIsAdmin} | Link: ${linkPreview}\x1b[39m`);

        // ── Bot bukan admin → kirim peringatan tapi tidak bisa hapus/kick ──────
        if (!botIsAdmin) {
            console.log('\x1b[33m[AntiLink] Bot bukan admin — kirim notif peringatan.\x1b[39m');
            const { dateStr, timeStr } = getWaktuStr();
            const isLid2 = senderJid.includes('@lid');
            const _mention2 = isLid2 ? [] : [senderJid];
            const _name2 = isLid2
                ? (pushName ? `*${pushName}*` : '_akun privat_')
                : `@${senderNumber}`;
            await hisoka.sendMessage(remoteJid, {
                text:
                    `╭─〔 ⚠️ *Anti-Link* 〕\n` +
                    `│\n` +
                    `│ 👤 ${_name2}\n` +
                    `│ 🕐 ${timeStr} • ${dateStr}\n` +
                    `│\n` +
                    `│ ⚠️ Mengirim *link* di grup ini!\n` +
                    `│\n` +
                    `│ ❌ Bot *bukan admin* — tidak bisa\n` +
                    `│    hapus pesan atau kick member.\n` +
                    `│ ℹ️ Jadikan bot *admin grup* agar\n` +
                    `│    Anti-Link bisa berjalan penuh!\n` +
                    `│\n` +
                    `╰────────────────────`,
                contextInfo: { mentionedJid: _mention2 }
            }, { quoted: message });
            return;
        }

        // ── Bot admin → proses warn + hapus pesan ────────────────────────────
        const freshData = loadData();
        if (!freshData.warnings) freshData.warnings = {};
        if (!freshData.warnings[remoteJid]) freshData.warnings[remoteJid] = {};
        if (!freshData.warnings[remoteJid][senderJid]) freshData.warnings[remoteJid][senderJid] = 0;
        freshData.warnings[remoteJid][senderJid] += 1;
        const newWarn = freshData.warnings[remoteJid][senderJid];
        saveData(freshData);

        appendLog({ gid: remoteJid, senderJid, senderNum: senderNumber,
            action: newWarn >= maxWarnings ? 'kick' : 'warn',
            warnCount: newWarn, maxWarn: maxWarnings, link: linkPreview, ts: Date.now() });

        const { dateStr, timeStr } = getWaktuStr();
        const warnFilled = '◆'.repeat(Math.min(newWarn, maxWarnings));
        const warnEmpty  = '◇'.repeat(Math.max(maxWarnings - newWarn, 0));
        const warnBar    = warnFilled + warnEmpty;
        const _mention   = isLid ? [] : [senderJid];
        const _user      = isLid
            ? (pushName ? `*${pushName}*` : '_akun privat_')
            : `@${senderNumber}`;

        // Hapus pesan dulu
        await deleteMsg(remoteJid, message.key.id, message.key.participant, hisoka);

        if (newWarn >= maxWarnings) {
            delete freshData.warnings[remoteJid][senderJid];
            saveData(freshData);

            await hisoka.sendMessage(remoteJid, {
                text:
                    `╭─〔 🔨 *Anti-Link — KICK* 〕\n` +
                    `│\n` +
                    `│ 👤 ${_user}\n` +
                    `│ 🕐 ${timeStr} • ${dateStr}\n` +
                    `│\n` +
                    `│ 🔴 Peringatan [${warnBar}] *${maxWarnings}/${maxWarnings}*\n` +
                    `│\n` +
                    `│ • Pesan berisi link _telah dihapus_\n` +
                    `│ • Member telah di-*KICK* dari grup!\n` +
                    `│\n` +
                    `│ _Akibat mengirim link berulang kali!_\n` +
                    `│\n` +
                    `╰────────────────────`,
                contextInfo: { mentionedJid: _mention }
            }, { quoted: message });

            try {
                await hisoka.groupParticipantsUpdate(remoteJid, [senderJid], 'remove');
                console.log(`\x1b[31m[AntiLink] ✓ Kicked ${senderNumber} dari ${remoteJid}\x1b[39m`);
            } catch (kickErr) {
                console.error('\x1b[31m[AntiLink] Gagal kick:\x1b[39m', kickErr.message);
                await hisoka.sendMessage(remoteJid, {
                    text:
                        `╭─〔 ❌ *Anti-Link* 〕\n│\n` +
                        `│ *Gagal kick* ${isLid ? '_akun privat_' : `@${senderNumber}`}!\n│\n` +
                        `> Pastikan bot masih berstatus *admin grup*.\n│\n` +
                        `╰────────────────────`,
                    contextInfo: { mentionedJid: _mention }
                });
            }
        } else {
            const nextInfo = newWarn >= maxWarnings - 1
                ? `│ • ⚡ *Satu lagi = KICK otomatis!*`
                : `│ • 💡 Sisa *${maxWarnings - newWarn}x* lagi sebelum di-kick`;

            await hisoka.sendMessage(remoteJid, {
                text:
                    `╭─〔 ⚠️ *Anti-Link — Peringatan* 〕\n` +
                    `│\n` +
                    `│ 👤 ${_user}\n` +
                    `│ 🕐 ${timeStr} • ${dateStr}\n` +
                    `│\n` +
                    `│ 🟡 Peringatan [${warnBar}] *${newWarn}/${maxWarnings}*\n` +
                    `│\n` +
                    `│ • Pesan berisi link _telah dihapus_\n` +
                    `${nextInfo}\n` +
                    `│\n` +
                    `│ _Dilarang mengirim link di grup ini!_\n` +
                    `│\n` +
                    `╰────────────────────`,
                contextInfo: { mentionedJid: _mention }
            }, { quoted: message });
        }
    } catch (err) {
        console.error('\x1b[31m[AntiLink] Error:\x1b[39m', err.message);
    }
}

// ═══════════════════════════════════════════════════════════════
//  Command Handler — .antilink [sub-perintah]
//  HANYA bot utama
// ═══════════════════════════════════════════════════════════════
export async function handleAntilink({ hisoka, m, query, tolak, logCommand, loadConfig: _lc, saveConfig: _sc, pendingAntilinkChoices }) {
    if (hisoka?.isMainBot === false) return;
    if (!m.isGroup) return tolak(hisoka, m, '❌ Fitur ini hanya bisa digunakan di grup!');
    if (!m.isAdmin && !m.isOwner) return tolak(hisoka, m, '❌ Hanya admin grup atau owner bot yang bisa menggunakan perintah ini!');

    const lc = _lc || loadConfig;
    const sc = _sc || saveConfig;

    const arg = (query || '').trim().toLowerCase();

    // ── global on/off ─────────────────────────────────────────────────────────
    if (arg === 'global on' || arg === 'global off') {
        if (!m.isOwner) return tolak(hisoka, m, '❌ Hanya owner bot yang bisa mengubah pengaturan global!');
        const enable = arg === 'global on';
        const config = lc();
        if (!config.antiLink) config.antiLink = {};
        config.antiLink.enabled = enable;
        sc(config);
        logCommand(m, hisoka, `antilink ${arg}`);
        return tolak(hisoka, m,
            `╭─〔 🌐 *Anti-Link Global* 〕\n│\n` +
            `│ ${enable ? '✅ *Global AntiLink DIAKTIFKAN!*' : '🔴 *Global AntiLink DINONAKTIFKAN!*'}\n│\n` +
            (enable
                ? `> Sekarang admin grup bisa mengaktifkan\n> fitur ini di masing-masing grup.\n`
                : `> Fitur _tidak akan aktif_ di semua grup.\n`) +
            `│\n╰────────────────────`
        );
    }

    // ── on ────────────────────────────────────────────────────────────────────
    if (arg === 'on') {
        const config = lc();
        let globalAutoEnabled = false;
        if (!config.antiLink?.enabled) {
            if (!m.isOwner) return tolak(hisoka, m, '❌ Fitur AntiLink dinonaktifkan secara global oleh owner bot.\nMinta owner aktifkan dengan perintah: *.antilink global on*');
            if (!config.antiLink) config.antiLink = {};
            config.antiLink.enabled = true;
            sc(config);
            globalAutoEnabled = true;
        }
        toggleAntiLink(m.from, true);
        logCommand(m, hisoka, 'antilink on');

        // Cek bot admin realtime
        const botJid = jidNormalizedUser(hisoka.user?.id || '');
        const { isAdmin: botIsAdmin } = await getBotAdminStatus(m.from, botJid.split('@')[0], hisoka);
        const botNote = botIsAdmin
            ? `│ 🤖 Status Bot : ✅ _Admin — bisa hapus & kick_\n`
            : `│ 🤖 Status Bot : ❌ *Bukan admin!*\n> ⚠️ Jadikan bot *admin grup* agar\n> bisa hapus pesan & kick otomatis.\n`;

        return tolak(hisoka, m,
            `╭─〔 ✅ *Anti-Link* 〕\n│\n│ 🟢 *Fitur AntiLink AKTIF!*\n` +
            (globalAutoEnabled ? `│ 🌐 _Global juga diaktifkan otomatis!_\n` : '') +
            `│\n` + botNote +
            `│\n│ ⚙️ *Konfigurasi:*\n│ • Maks. warning : *${config.antiLink?.maxWarnings ?? 3}x*\n│\n` +
            `> Link dari member akan dihapus\n> dan mendapat peringatan atau kick.\n│\n` +
            `│ 👑 _Admin & Owner GC bebas kirim link_\n│\n╰────────────────────`
        );
    }

    // ── off ───────────────────────────────────────────────────────────────────
    if (arg === 'off') {
        toggleAntiLink(m.from, false);

        // Grup aktif terakhir baru saja dimatikan → global ikut false (akurat & realtime)
        let globalAutoDisabledOff = false;
        if (!getAllAntiLinkGroups().length) {
            const cfgOff = lc();
            if (cfgOff.antiLink?.enabled) {
                if (!cfgOff.antiLink) cfgOff.antiLink = {};
                cfgOff.antiLink.enabled = false;
                sc(cfgOff);
                globalAutoDisabledOff = true;
            }
        }

        logCommand(m, hisoka, 'antilink off');
        return tolak(hisoka, m,
            `╭─〔 🔴 *Anti-Link* 〕\n│\n│ *Fitur AntiLink NONAKTIF!*\n│\n` +
            (globalAutoDisabledOff ? `│ 🌐 _Global juga ikut dinonaktifkan_\n│ _(tidak ada grup aktif tersisa)_\n│\n` : '') +
            `> Semua warning di grup ini\n> juga telah _direset otomatis_.\n│\n╰────────────────────`
        );
    }

    // ── off all — nonaktifkan AntiLink di SEMUA grup terdaftar (realtime) ───────
    if (arg === 'off all' || arg === 'offall') {
        if (!m.isOwner) return tolak(hisoka, m, '❌ Hanya owner bot yang bisa menonaktifkan AntiLink di semua grup!');

        const aktifGroups = getAllAntiLinkGroups();
        if (!aktifGroups.length) {
            logCommand(m, hisoka, 'antilink off all');
            return tolak(hisoka, m,
                `╭─〔 🔴 *Anti-Link — Off All* 〕\n│\n` +
                `│ ℹ️ *Tidak ada grup yang terdaftar aktif.*\n│\n` +
                `> Semua grup memang sudah dalam\n> status *nonaktif (false)* secara default.\n│\n╰────────────────────`
            );
        }

        for (const gid of aktifGroups) toggleAntiLink(gid, false);

        // Tidak ada grup aktif tersisa → global enabled juga di-set false (akurat & realtime)
        const configOffAll = lc();
        if (!configOffAll.antiLink) configOffAll.antiLink = {};
        configOffAll.antiLink.enabled = false;
        sc(configOffAll);

        logCommand(m, hisoka, 'antilink off all');

        const _offAllPrefix =
            `╭─〔 🔴 *Anti-Link — Off All* 〕\n│\n` +
            `│ ✅ *AntiLink dinonaktifkan di semua grup!*\n│\n` +
            `│ 🗑️ Total grup   : *${aktifGroups.length}*\n` +
            `│ 🌐 Global      : 🔴 _ikut dinonaktifkan (config.json)_\n` +
            `│ 💾 Status       : _tersimpan realtime_\n│\n` +
            `> Semua warning di grup tersebut\n> juga telah _direset otomatis_.\n│\n╰────────────────────`;

        // Gabung jadi satu pesan: konfirmasi + status terbaru (realtime)
        await sendAntilinkStatus({ hisoka, m, lc, pendingAntilinkChoices, logCommand, withReaction: false, prefixText: _offAllPrefix });
        return;
    }

    // ── on all — aktifkan kembali AntiLink di semua grup yang pernah nonaktif ──
    if (arg === 'on all' || arg === 'onall') {
        if (!m.isOwner) return tolak(hisoka, m, '❌ Hanya owner bot yang bisa mengaktifkan AntiLink di semua grup!');

        const config = lc();
        let globalAutoEnabled = false;
        if (!config.antiLink?.enabled) {
            if (!config.antiLink) config.antiLink = {};
            config.antiLink.enabled = true;
            sc(config);
            globalAutoEnabled = true;
        }

        const disabledGroups = getDisabledAntiLinkGroups();
        if (!disabledGroups.length) {
            logCommand(m, hisoka, 'antilink on all');
            return tolak(hisoka, m,
                `╭─〔 🟢 *Anti-Link — On All* 〕\n│\n` +
                `│ ℹ️ *Tidak ada grup nonaktif yang bisa diaktifkan.*\n│\n` +
                `> Gunakan \`.antilink add\` di grup baru\n> untuk mendaftarkannya.\n│\n╰────────────────────`
            );
        }

        for (const gid of disabledGroups) toggleAntiLink(gid, true);
        logCommand(m, hisoka, 'antilink on all');

        const _onAllPrefix =
            `╭─〔 🟢 *Anti-Link — On All* 〕\n│\n` +
            `│ ✅ *AntiLink diaktifkan kembali di semua grup!*\n│\n` +
            (globalAutoEnabled ? `│ 🌐 _Global juga diaktifkan otomatis!_\n│\n` : '') +
            `│ ➕ Total grup   : *${disabledGroups.length}*\n` +
            `│ 💾 Status       : _tersimpan realtime_\n│\n╰────────────────────`;

        // Gabung jadi satu pesan: konfirmasi + status terbaru (realtime)
        await sendAntilinkStatus({ hisoka, m, lc, pendingAntilinkChoices, logCommand, withReaction: false, prefixText: _onAllPrefix });
        return;
    }

    // ── add ───────────────────────────────────────────────────────────────────
    if (arg === 'add') {
        const config = lc();
        if (!config.antiLink?.enabled) {
            if (!m.isOwner) return tolak(hisoka, m, '❌ Fitur AntiLink dinonaktifkan secara global.\nMinta owner aktifkan dulu: *.antilink global on*');
            if (!config.antiLink) config.antiLink = {};
            config.antiLink.enabled = true;
            sc(config);
        }
        const alreadyAdded = isAntiLinkEnabled(m.from);
        toggleAntiLink(m.from, true);
        logCommand(m, hisoka, 'antilink add');
        return tolak(hisoka, m,
            `╭─〔 ✅ *Anti-Link* 〕\n│\n` +
            `│ ${alreadyAdded ? '🔄 Grup ini _sudah terdaftar_ sebelumnya.' : '➕ Grup ini berhasil *ditambahkan!*'}\n│\n` +
            `│ 🌐 Global   : 🟢 Aktif\n│ 📌 Grup ini : 🟢 *Aktif*\n│\n` +
            `│ ⚙️ *Konfigurasi:*\n│ • Maks. warning : *${config.antiLink?.maxWarnings ?? 3}x*\n│\n` +
            `> Link dari member akan dihapus\n> dan mendapat peringatan atau kick.\n│\n` +
            `│ 👑 _Admin & Owner GC bebas kirim link_\n│\n╰────────────────────`
        );
    }

    // ── reset ─────────────────────────────────────────────────────────────────
    if (arg === 'reset') {
        resetAntiLinkWarnings(m.from);
        logCommand(m, hisoka, 'antilink reset');
        return tolak(hisoka, m, `╭─〔 🔄 *Anti-Link — Reset* 〕\n│\n│ ✅ *Semua warning* di grup ini\n│ telah _direset!_\n│\n╰────────────────────`);
    }

    // ── warn <n> ──────────────────────────────────────────────────────────────
    if (arg.startsWith('warn')) {
        if (!m.isOwner) return tolak(hisoka, m, '❌ Hanya owner yang bisa mengubah batas warning!');
        const warnNum = parseInt(arg.replace(/^warn\s*/,'').trim(), 10);
        if (!warnNum || isNaN(warnNum) || warnNum < 1 || warnNum > 100) {
            return tolak(hisoka, m,
                `╭─〔 ⚠️ *Anti-Link — Warn* 〕\n│\n│ ❌ *Angka tidak valid!*\n│\n` +
                `│ 📌 *Format:*\n│ \`.antilink warn <angka>\`\n│\n` +
                `│ 📌 *Contoh:*\n│ \`.antilink warn 5\`\n│\n` +
                `│ ℹ️ Angka valid: *1 — 100*\n│\n╰────────────────────`
            );
        }
        const config = lc();
        if (!config.antiLink) config.antiLink = {};
        const oldMax = config.antiLink.maxWarnings ?? 3;
        config.antiLink.maxWarnings = warnNum;
        sc(config);
        logCommand(m, hisoka, `antilink warn ${warnNum}`);
        return tolak(hisoka, m,
            `╭─〔 ⚙️ *Anti-Link — Warn* 〕\n│\n│ ✅ *Batas warning berhasil diubah!*\n│\n` +
            `│ 📊 Sebelum  : ~${oldMax}x~\n│ 📊 Sekarang : *${warnNum}x*\n│\n` +
            `> Anggota akan dikick setelah\n> melanggar sebanyak *${warnNum}x*\n│\n` +
            `│ 💾 _Tersimpan ke config_\n│\n╰────────────────────`
        );
    }

    // ── list ──────────────────────────────────────────────────────────────────
    if (arg === 'list') {
        const allGroups = getAllAntiLinkGroups();
        if (!allGroups.length) {
            return tolak(hisoka, m,
                `╭─〔 📋 *Daftar Anti-Link* 〕\n│\n│ ❌ _Belum ada grup yang terdaftar._\n│\n` +
                `> Gunakan \`.antilink add\` di grup\n> yang ingin diaktifkan.\n│\n╰────────────────────`
            );
        }

        const botAdminCache = loadBotAdminFile();
        const botNum = (hisoka.user?.id || '').split(':')[0].split('@')[0];

        const grupInfoList = [];
        for (let i = 0; i < allGroups.length; i++) {
            const gid = allGroups[i];
            let namaGrup = '-', totalMember = '?', totalAdmin = '?';
            let botIsAdminGrup = botAdminCache[gid] === true;
            try {
                const meta = await hisoka.groupMetadata(gid);
                if (meta) {
                    namaGrup = meta.subject || '-';
                    const parts = meta.participants || [];
                    totalMember = parts.length;
                    totalAdmin  = parts.filter(p => p.admin).length;
                    const botP  = parts.find(p => (p.jid || p.id || '').split('@')[0].split(':')[0] === botNum);
                    botIsAdminGrup = botP !== undefined ? !!botP.admin : (botAdminCache[gid] === true);
                }
            } catch {
                try {
                    const cached = hisoka.groups?.read(gid);
                    if (cached) {
                        namaGrup = cached.subject || '-';
                        const parts = cached.participants || [];
                        totalMember = parts.length;
                        totalAdmin  = parts.filter(p => p.admin).length;
                    }
                } catch {}
            }
            const warns      = getAntiLinkWarnings(gid);
            const totalWarned = Object.keys(warns).length;
            grupInfoList.push({ gid, namaGrup, totalMember, totalAdmin, totalWarned, botIsAdmin: botIsAdminGrup });
        }

        let listBaris = '';
        for (let i = 0; i < grupInfoList.length; i++) {
            const { gid, namaGrup, totalMember, totalAdmin, totalWarned, botIsAdmin } = grupInfoList[i];
            listBaris +=
                `│ *${i + 1}.* ${namaGrup}\n` +
                `│    🆔 \`${gid}\`\n` +
                `│    👥 Anggota : *${totalMember}* | 🛡️ Admin: *${totalAdmin}*\n` +
                `│    🤖 Bot Admin: ${botIsAdmin ? '✅ Ya' : '❌ Bukan'}\n` +
                `│    ⚠️ Warned  : *${totalWarned} orang*\n│\n`;
        }

        const listText =
            `╭─〔 📋 *Daftar Anti-Link* 〕\n│\n│ 🟢 Total aktif: *${allGroups.length} grup*\n│\n` +
            listBaris +
            `│ ─────────────────\n│ 🗑️ *Cara hapus:*\n` +
            `│ Reply pesan ini dengan nomor urut\n│ Contoh: *1* atau *1,2* atau *1,2,3*\n│\n` +
            `│ • Ketik *semua* → hapus semua grup\n│ • Ketik *reset* → reset warning semua\n│\n╰────────────────────`;

        if (!global.__antiLinkListSessions) global.__antiLinkListSessions = new Map();
        const sentList = await hisoka.sendMessage(m.from, { text: listText }, { quoted: m }).catch(() => null);
        if (sentList?.key?.id) {
            global.__antiLinkListSessions.set(sentList.key.id, {
                groups: grupInfoList, from: m.from,
                by: m.sender || m.key?.participant || m.from, ts: Date.now()
            });
            setTimeout(() => global.__antiLinkListSessions?.delete(sentList.key.id), 5 * 60 * 1000);
        }
        logCommand(m, hisoka, 'antilink list');
        return;
    }

    // ── log ───────────────────────────────────────────────────────────────────
    if (arg === 'log' || arg.startsWith('log ')) {
        const logSub  = arg.slice(3).trim();

        if (logSub === 'clear all') {
            if (!m.isOwner) return tolak(hisoka, m, '❌ Hanya owner yang bisa clear semua log!');
            clearAntiLinkLog();
            return tolak(hisoka, m, '✅ Semua log AntiLink berhasil dihapus!');
        }
        if (logSub === 'clear') {
            clearAntiLinkLog(m.from);
            return tolak(hisoka, m, '✅ Log AntiLink grup ini berhasil dihapus!');
        }

        const showAll = (logSub === 'all') && m.isOwner;
        const rawLogs = getAntiLinkLog(showAll ? null : m.from);

        if (!rawLogs.length) {
            return tolak(hisoka, m,
                `╭─〔 📜 *Log Anti-Link* 〕\n│\n│ ℹ️ _Belum ada riwayat pelanggaran${showAll ? '' : ' di grup ini'}._\n│\n` +
                `│ 📋 *Sub-perintah:*\n` +
                `│ • \`.antilink log\` — Log grup ini\n` +
                (m.isOwner ? `│ • \`.antilink log all\` — Semua grup\n` : '') +
                `│ • \`.antilink log clear\` — Hapus log grup\n` +
                (m.isOwner ? `│ • \`.antilink log clear all\` — Hapus semua\n` : '') +
                `│\n╰────────────────────`
            );
        }

        const _fmtWaktu  = ts => new Date(ts).toLocaleString('id-ID', { timeZone:'Asia/Jakarta', day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
        const _fmtAction = l  => l.action === 'kick' ? `🔴 KICK` : `🟡 WARN ${l.warnCount}/${l.maxWarn}`;
        const totalWarn  = rawLogs.filter(l => l.action === 'warn').length;
        const totalKick  = rawLogs.filter(l => l.action === 'kick').length;

        if (showAll) {
            const byGid = {};
            for (const l of rawLogs) { if (!byGid[l.gid]) byGid[l.gid] = []; byGid[l.gid].push(l); }
            const uniqueGids = Object.keys(byGid);
            const namaCache  = {};
            await Promise.all(uniqueGids.map(async gid => {
                try { namaCache[gid] = (await hisoka.groupMetadata(gid))?.subject || gid.split('@')[0]; }
                catch { try { namaCache[gid] = hisoka.groups?.read(gid)?.subject || gid.split('@')[0]; } catch { namaCache[gid] = gid.split('@')[0]; } }
            }));
            const header =
                `╭─〔 📜 *Log Anti-Link — Semua Grup* 〕\n│\n` +
                `│ 🏘️ Jumlah grup : *${uniqueGids.length}*\n│ 📊 Total log   : *${rawLogs.length}*\n` +
                `│ 🟡 Warn: *${totalWarn}* | 🔴 Kick: *${totalKick}*\n│\n╰────────────────────`;
            const GRUP_PER_MSG = 5;
            for (let gi = 0; gi < uniqueGids.length; gi += GRUP_PER_MSG) {
                const batch = uniqueGids.slice(gi, gi + GRUP_PER_MSG);
                let batchTxt = '';
                for (const gid of batch) {
                    const logs  = byGid[gid].slice(-10).reverse();
                    const gWarn = byGid[gid].filter(l => l.action === 'warn').length;
                    const gKick = byGid[gid].filter(l => l.action === 'kick').length;
                    batchTxt += `┌─〔 *🏘️ ${namaCache[gid]}* 〕\n│ 📊 Total: *${byGid[gid].length}* | 🟡 ${gWarn} | 🔴 ${gKick}\n│\n`;
                    for (let i = 0; i < logs.length; i++) {
                        const l = logs[i];
                        batchTxt += `│ *${i+1}.* ${_fmtAction(l)}\n│    👤 @${l.senderNum}\n│    🔗 ${l.link || '-'} • 🕐 ${_fmtWaktu(l.ts)}\n│\n`;
                    }
                    batchTxt += `└────────────────────────────────\n\n`;
                }
                const finalTxt = gi === 0 ? header + '\n\n' + batchTxt.trim() : batchTxt.trim();
                await tolak(hisoka, m, finalTxt);
                if (gi + GRUP_PER_MSG < uniqueGids.length) await new Promise(r => setTimeout(r, 600));
            }
        } else {
            const recent = rawLogs.slice(-25).reverse();
            let logBaris = '';
            for (let i = 0; i < recent.length; i++) {
                const l = recent[i];
                logBaris += `│ *${i+1}.* ${_fmtAction(l)}\n│    👤 @${l.senderNum || l.senderJid?.split('@')[0]}\n│    🔗 ${l.link || '-'} • 🕐 ${_fmtWaktu(l.ts)}\n│\n`;
            }
            await tolak(hisoka, m,
                `╭─〔 📜 *Log Anti-Link* 〕\n│\n│ 📊 Total log grup ini: *${rawLogs.length}*\n` +
                `│ 🟡 Warn: *${totalWarn}* | 🔴 Kick: *${totalKick}*\n│ _Tampil 25 terbaru_\n│\n` +
                logBaris +
                `│ 📋 *Sub-perintah:*\n` +
                `│ • \`.antilink log\` — Log grup ini\n` +
                (m.isOwner ? `│ • \`.antilink log all\` — Semua grup\n` : '') +
                `│ • \`.antilink log clear\` — Hapus log grup\n` +
                (m.isOwner ? `│ • \`.antilink log clear all\` — Hapus semua\n` : '') +
                `│\n╰────────────────────`
            );
        }
        logCommand(m, hisoka, 'antilink log');
        return;
    }

    // ── status — list semua GC bot dengan ✅/❌/➕ + session add/del ────────────
    await sendAntilinkStatus({ hisoka, m, lc, pendingAntilinkChoices, logCommand });
}

// ═══════════════════════════════════════════════════════════════
//  Helper — Render & kirim STATUS ANTI-LINK (dipakai oleh .antilink status
//  maupun otomatis setelah off all / on all agar hasilnya realtime)
// ═══════════════════════════════════════════════════════════════
async function sendAntilinkStatus({ hisoka, m, lc, pendingAntilinkChoices, logCommand, withReaction = true, prefixText = '' }) {
    if (withReaction) await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
    try {
        const config = lc();
        const globalEnabled = config.antiLink?.enabled ?? false;
        const maxWarnings   = config.antiLink?.maxWarnings ?? 3;

        // Ambil semua GC yang bot ikuti sekarang (fresh, realtime)
        const allGroupsRaw = await hisoka.groupFetchAllParticipating();
        const allGroups    = Object.values(allGroupsRaw || {});

        // Ambil ulang data terbaru dari storage (bukan cache lama)
        const aktifGroups    = getAllAntiLinkGroups();
        const disabledGroups = getDisabledAntiLinkGroups();
        const aktifSet       = new Set(aktifGroups);
        const disabledSet    = new Set(disabledGroups);

        const totalAktif = aktifGroups.length;

        // ── Urutkan: ✅ Aktif → ❌ Nonaktif (pernah on, lalu di-off) → ➕ Belum daftar ──
        const _urutan = (g) => {
            if (aktifSet.has(g.id))    return 0;
            if (disabledSet.has(g.id)) return 1;
            return 2;
        };
        allGroups.sort((a, b) => {
            const uA = _urutan(a), uB = _urutan(b);
            if (uA !== uB) return uA - uB;
            return (a.subject || '').localeCompare(b.subject || '', 'id');
        });

        const gcList = allGroups.map((g, i) => {
            const jid  = g.id;
            const nama = (g.subject || 'Tanpa Nama').slice(0, 30);
            let ikon;
            if (aktifSet.has(jid))    ikon = '✅';
            else if (disabledSet.has(jid)) ikon = '❌';
            else                      ikon = '➕';
            return { no: i + 1, jid, nama, ikon };
        });

        const totalNon = gcList.filter(g => g.ikon === '❌').length;

        let txt = prefixText ? `${prefixText}\n\n` : '';
        txt += `╭─「 📋 *STATUS ANTI-LINK* 」\n│\n`;
        txt += `│ Total GC bot   : *${allGroups.length} grup*\n`;
        txt += `│ Terdaftar aktif: *${totalAktif} grup*\n`;
        if (totalNon) txt += `│ Nonaktif       : *${totalNon} grup*\n`;
        txt += `│ 🌐 Global      : ${globalEnabled ? '🟢 Aktif' : '🔴 Nonaktif'}\n`;
        txt += `│ ⚙️ Maks. warn  : *${maxWarnings}x*\n`;
        txt += `│\n`;
        txt += `│ Ket: ✅ Aktif  ❌ Nonaktif  ➕ Belum daftar\n`;
        txt += `│━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

        // Sisipkan pemisah antar kelompok
        let lastIkon = '';
        gcList.forEach(({ no, nama, ikon }) => {
            if (ikon !== lastIkon) {
                const label = ikon === '✅' ? 'Aktif' : ikon === '❌' ? 'Nonaktif' : 'Belum daftar';
                txt += `│ ┄ ${label} ┄\n`;
                lastIkon = ikon;
            }
            const noStr = String(no).padStart(2, ' ');
            txt += `│ ${noStr}. ${ikon} ${nama}\n`;
        });

        txt += `│\n`;
        txt += `│ 📌 *Reply pesan ini:*\n`;
        txt += `│ • *add 1,2,3* — aktifkan GC nomor tsb\n`;
        txt += `│ • *del 2,4* — nonaktifkan GC nomor tsb\n`;
        txt += `│ • *add all* — aktifkan SEMUA GC\n`;
        txt += `│ • *del all* — nonaktifkan SEMUA GC\n`;
        txt += `│ ⏳ Menu berlaku *5 menit*\n`;
        txt += `╰──────────────────────`;

        const statusMsg = await hisoka.sendMessage(m.from, { text: txt }, { quoted: m });
        if (withReaction) await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });

        // Simpan session untuk reply handler
        if (pendingAntilinkChoices) {
            const choiceKey = `${m.from}::${m.sender || m.key?.participant || ''}`;
            const old = pendingAntilinkChoices.get(choiceKey);
            if (old?.timeout) clearTimeout(old.timeout);
            const t = setTimeout(() => pendingAntilinkChoices?.delete(choiceKey), 5 * 60 * 1000);
            pendingAntilinkChoices.set(choiceKey, {
                gcList,
                botMsgId : statusMsg?.key?.id || '',
                expiresAt: Date.now() + 5 * 60 * 1000,
                timeout  : t,
            });
        }
        logCommand(m, hisoka, 'antilink status');
        return true;
    } catch (err) {
        console.error('[AntiLink] status error:', err?.message);
        if (withReaction) await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════
//  Reply Handler — Tangani reply ke .antilink status (add/del)
// ═══════════════════════════════════════════════════════════════
export async function handleAntilinkStatusReply({ hisoka, m, pendingAntilinkChoices, getQuotedStanzaId, tolak, logCommand }) {
    if (!pendingAntilinkChoices?.size) return false;
    if (!m.isOwner && !m.isAdmin) return false;

    const quotedId = getQuotedStanzaId(m);
    if (!quotedId) return false;

    const choiceKey = `${m.from}::${m.sender || m.key?.participant || ''}`;
    const pending   = pendingAntilinkChoices.get(choiceKey);
    if (!pending || pending.botMsgId !== quotedId) return false;
    if (Date.now() > pending.expiresAt) {
        pendingAntilinkChoices.delete(choiceKey);
        return false;
    }

    const teks     = (m.body || m.text || '').trim().toLowerCase();
    const matchAll = teks.match(/^(add|del)\s+all$/i);
    const match    = teks.match(/^(add|del)\s+([\d,\s]+)$/i);
    if (!matchAll && !match) return false;

    const { gcList } = pending;
    const aksi = (matchAll || match)[1].toLowerCase();

    let dipilih;
    if (matchAll) {
        dipilih = gcList;
        if (!dipilih.length) {
            await tolak(hisoka, m, '❌ Tidak ada grup yang bisa diproses.');
            return true;
        }
    } else {
        const nomor = [...new Set(
            match[2].split(/[,\s]+/).map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n >= 1)
        )];
        if (!nomor.length) return false;
        dipilih = nomor.map(n => gcList[n - 1]).filter(Boolean);
        if (!dipilih.length) {
            await tolak(hisoka, m, `❌ Nomor tidak valid. Pilih antara 1–${gcList.length}.`);
            return true;
        }
    }

    const config = loadConfig();
    if (!config.antiLink?.enabled && aksi === 'add') {
        if (!m.isOwner) {
            await tolak(hisoka, m, '❌ Fitur AntiLink dinonaktifkan secara global.\nMinta owner aktifkan dulu: *.antilink global on*');
            return true;
        }
        if (!config.antiLink) config.antiLink = {};
        config.antiLink.enabled = true;
        saveConfig(config);
    }

    const namaList = [];
    for (const { jid, nama } of dipilih) {
        toggleAntiLink(jid, aksi === 'add');
        namaList.push(nama);
    }

    // Del all (atau del sisa terakhir) → tidak ada grup aktif tersisa, global ikut false
    let globalAutoDisabled = false;
    if (aksi === 'del' && !getAllAntiLinkGroups().length) {
        const cfgAfterDel = loadConfig();
        if (cfgAfterDel.antiLink?.enabled) {
            if (!cfgAfterDel.antiLink) cfgAfterDel.antiLink = {};
            cfgAfterDel.antiLink.enabled = false;
            saveConfig(cfgAfterDel);
            globalAutoDisabled = true;
        }
    }

    const ikon   = aksi === 'add' ? '✅' : '❌';
    const action = aksi === 'add' ? 'Diaktifkan' : 'Dinonaktifkan';

    let txt = `${ikon} *AntiLink ${action} (${dipilih.length} GC):*\n`;
    namaList.forEach((n, i) => { txt += `${i + 1}. ${n}\n`; });
    if (globalAutoDisabled) txt += `\n🌐 _Global juga ikut dinonaktifkan (tidak ada grup aktif tersisa)._`;
    txt += `\n💡 Ketik *.antilink status* untuk cek ulang.`;

    await hisoka.sendMessage(m.from, { react: { text: ikon, key: m.key } });
    await tolak(hisoka, m, txt);
    logCommand(m, hisoka, `antilink-${aksi}`);

    clearTimeout(pending.timeout);
    pendingAntilinkChoices.delete(choiceKey);
    return true;
}

// ═══════════════════════════════════════════════════════════════
//  Callbacks — Tangani reply dari .antilink list (sesi interaktif)
// ═══════════════════════════════════════════════════════════════
export async function handleAntilinkCallbacks({ hisoka, m, tolak }) {
    if (!global.__antiLinkListSessions?.size) return false;
    if (!m.quoted?.key?.id) return false;
    if (!m.isOwner && !m.isAdmin) return false;

    const sessId = m.quoted.key.id;
    const sess   = global.__antiLinkListSessions?.get(sessId);
    if (!sess || sess.from !== m.from) return false;

    const rawReply = (m.text || m.body || '').trim().toLowerCase();
    if (!rawReply) return false;

    global.__antiLinkListSessions.delete(sessId);

    try {
        const { groups: sessGroups } = sess;
        if (rawReply === 'semua') {
            const total = sessGroups.length;
            for (const g of sessGroups) toggleAntiLink(g.gid, false);
            await tolak(hisoka, m,
                `╭───〔 *🗑️ HAPUS SEMUA* 〕───╮\n│\n│ ✅ Semua grup dihapus!\n│ 🗑️ Total: *${total} grup*\n│ ⚠️ Semua warning juga direset.\n│\n╰────────────────────────────────────╯`
            );
        } else if (rawReply === 'reset') {
            for (const g of sessGroups) resetAntiLinkWarnings(g.gid);
            await tolak(hisoka, m,
                `╭───〔 *🔄 RESET WARNING* 〕───╮\n│\n│ ✅ Warning direset!\n│ 📊 Total: *${sessGroups.length} grup*\n│ 🟢 Grup tetap terdaftar.\n│\n╰────────────────────────────────────╯`
            );
        } else {
            const nums = rawReply.split(/[,\s]+/)
                .map(n => parseInt(n.trim(), 10))
                .filter(n => !isNaN(n) && n >= 1 && n <= sessGroups.length);
            const uniq = [...new Set(nums)];
            if (!uniq.length) {
                await tolak(hisoka, m,
                    `❌ Nomor tidak valid!\nMasukkan angka 1-${sessGroups.length}, contoh: *1* atau *1,2,3*\nAtau ketik *semua* / *reset*`
                );
            } else {
                const dihapus = [];
                for (const n of uniq) {
                    const g = sessGroups[n - 1];
                    if (g) { toggleAntiLink(g.gid, false); dihapus.push(`${n}. *${g.namaGrup}*`); }
                }
                const listDihapus = dihapus.map(d => `│ ✅ ${d}`).join('\n');
                await tolak(hisoka, m,
                    `╭───〔 *🗑️ ANTILINK REMOVED* 〕───╮\n│\n│ ✅ *${dihapus.length} grup* berhasil dihapus!\n│\n` +
                    listDihapus + `\n│\n│ ⚠️ Warning di grup tersebut direset.\n│\n╰────────────────────────────────────╯`
                );
            }
        }
    } catch (e) {
        await tolak(hisoka, m, `❌ Gagal proses: ${e.message}`);
    }
    return true;
}

/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const plugins = [
    { command: /^(antilink)$/i, tags: ['group'], help: ['antilink'], handler: 'handleAntilink' },
];
