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
 *  antitagsw.js — Anti-tag status WhatsApp
 *  Blokir mention massal lewat story/caption/reply
 * ───────────────────────────────
 */
/**
 * ═══════════════════════════════════════════════════════════════
 *  Anti-Tag Semua Warga (AntiTagSW) Handler
 *  Fitur untuk mencegah anggota mentag grup lewat status WhatsApp,
 *  caption media (gambar/video/audio), dan pesan reply.
 *  Referensi: github.com/hitlabmodv2/MD-FURINA
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

import fs from 'fs';
import path from 'path';
import { isJidGroup, jidNormalizedUser, areJidsSameUser, jidDecode, getContentType } from '@whiskeysockets/baileys';

import { kvGet, kvSet, kvMigrateFromJSON, kvMigrateKey } from '../../src/db/datadb.js';
kvMigrateFromJSON('security/antitagsw', path.join(process.cwd(), 'data', 'antitagsw.json'));
kvMigrateKey('antitagsw', 'security/antitagsw');

// Set global untuk menandai pesan yang dihapus oleh antitagsw
// agar anti-delete tidak mengirim notifikasi "PESAN DIHAPUS"
if (!global.__antiTagSWDeletedIds) global.__antiTagSWDeletedIds = new Set();

// Mapping tipe konten status → label + emoji
const CONTENT_TYPE_MAP = {
    imageMessage:         ['Gambar 🖼️', '🖼️'],
    videoMessage:         ['Video 🎥', '🎥'],
    audioMessage:         ['Audio 🎵', '🎵'],
    ptvMessage:           ['Video Pesan 📹', '📹'],
    stickerMessage:       ['Stiker 🎨', '🎨'],
    documentMessage:      ['Dokumen 📄', '📄'],
    documentWithCaptionMessage: ['Dokumen 📄', '📄'],
    conversation:         ['Teks 💬', '💬'],
    extendedTextMessage:  ['Teks 💬', '💬'],
    reactionMessage:      ['Reaksi 🔥', '🔥'],
    pollCreationMessage:  ['Polling 📊', '📊'],
    pollCreationMessageV2: ['Polling 📊', '📊'],
    pollCreationMessageV3: ['Polling 📊', '📊'],
};

function detectStatusContentType(message) {
    try {
        const msg = message?.message || {};

        // Cek inner message dari groupStatusMentionMessage / groupStatusMessageV2
        const inner = msg?.groupStatusMentionMessage?.message
            || msg?.groupStatusMessageV2?.message
            || msg?.groupMentionedMessage?.message
            || msg;

        // Cari tipe pertama yang ada
        for (const [key, val] of Object.entries(CONTENT_TYPE_MAP)) {
            if (inner[key]) return val;
        }

        // Fallback: cek pakai getContentType di level dalam
        const innerType = getContentType(inner);
        if (innerType && CONTENT_TYPE_MAP[innerType]) return CONTENT_TYPE_MAP[innerType];
    } catch (_) {}
    return ['Status 📲', '📲'];
}

// Tipe pesan yang terdeteksi sebagai "tag grup lewat status"
const ANTITAG_MSG_TYPES = [
    'groupStatusMentionMessage',
    'groupStatusMessageV2',
    'groupMentionedMessage',
];

// Tipe pesan media yang bisa membawa caption dengan tag grup
const MEDIA_CAPTION_TYPES = [
    'imageMessage',
    'videoMessage',
    'audioMessage',
    'documentMessage',
    'documentWithCaptionMessage',
    'extendedTextMessage',
    'conversation',
];

/**
 * Rapikan pesan AntiTagSW ke format WhatsApp yang lebih mudah dibaca.
 * Hanya menghapus bingkai dekoratif fitur ini; isi, markdown WhatsApp,
 * daftar, command, ID kode, dan kutipan tetap dipertahankan.
 */
function formatAntiTagText(text) {
    if (typeof text !== 'string') return text;

    return text
        .split('\n')
        .map(line => {
            const trimmed = line.trim();

            // Pertahankan isi judul, buang bingkai kiri/kanannya.
            const title = trimmed.match(/^[╭┌].*?〔\s*(.*?)\s*〕.*[╮]?$/);
            if (title) return title[1];

            // Hapus garis penutup dan garis dekoratif yang berdiri sendiri.
            if (/^[╰└].*$/.test(trimmed)) return '';
            if (/^[◈⬛─━═—_]+$/.test(trimmed)) return '';
            if (/^[│┃]?\s*[─━═—_]{3,}\s*[│┃]?$/.test(trimmed)) return '';

            // Hapus garis vertikal dekoratif dari awal baris.
            return line.replace(/^\s*[│┃]\s?/, '');
        })
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Deteksi apakah pesan mengandung tag grup lewat caption / reply
 * Cek contextInfo.groupJid atau contextInfo.mentionedJid yang berisi @g.us
 */
function detectCaptionGroupTag(message) {
    try {
        const msg = message?.message || {};
        const msgType = getContentType(msg);
        if (!msgType) return false;

        if (!MEDIA_CAPTION_TYPES.includes(msgType)) return false;

        const inner = msg[msgType] || {};
        const ctx = inner?.contextInfo || {};

        // Cek groupJid (tag grup via caption)
        if (ctx?.groupJid && isJidGroup(ctx.groupJid)) return true;

        // Cek mentionedJid yang berisi JID grup (@g.us)
        if (Array.isArray(ctx?.mentionedJid)) {
            if (ctx.mentionedJid.some(j => isJidGroup(j))) return true;
        }

        // Cek quoted message yang merupakan status tag (reply ke status tag)
        const quotedMsg = ctx?.quotedMessage || {};
        for (const t of ANTITAG_MSG_TYPES) {
            if (quotedMsg[t]) return true;
        }

        return false;
    } catch (_) {
        return false;
    }
}

function loadConfig() {
    try {
        const configPath = path.join(process.cwd(), 'config.json');
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
    } catch (_) {}
    return {};
}

function loadData() {
    return kvGet('security/antitagsw', { groups: [], warnings: {} });
}

function saveData(data) {
    try {
        kvSet('security/antitagsw', data);
    } catch (err) {
        console.error('\x1b[31m[AntiTagSW] Gagal simpan data:\x1b[39m', err.message);
    }
}

const _LOG_KEY = 'security/antitagsw_log';
const _LOG_MAX = 500;

function appendLog(entry) {
    try {
        const logs = kvGet(_LOG_KEY, []);
        logs.push(entry);
        if (logs.length > _LOG_MAX) logs.splice(0, logs.length - _LOG_MAX);
        kvSet(_LOG_KEY, logs);
    } catch (_) {}
}

export function getAntiTagSWLog(groupId) {
    try {
        const logs = kvGet(_LOG_KEY, []);
        return groupId ? logs.filter(l => l.gid === groupId) : logs;
    } catch (_) { return []; }
}

export function clearAntiTagSWLog(groupId) {
    try {
        if (!groupId) { kvSet(_LOG_KEY, []); return; }
        const logs = kvGet(_LOG_KEY, []);
        kvSet(_LOG_KEY, logs.filter(l => l.gid !== groupId));
    } catch (_) {}
}

let _contactsCache = null;
let _contactsCacheTime = 0;
const _CONTACTS_TTL = 60000;

function _loadContactsFromFile() {
    const now = Date.now();
    if (_contactsCache && (now - _contactsCacheTime) < _CONTACTS_TTL) return _contactsCache;
    try {
        const sessionName = process.env.BOT_SESSION_NAME || 'hisoka';
        const contactsPath = path.join(process.cwd(), 'sessions', sessionName, 'contacts.json');
        if (fs.existsSync(contactsPath)) {
            _contactsCache = JSON.parse(fs.readFileSync(contactsPath, 'utf-8'));
            _contactsCacheTime = now;
        }
    } catch (_) { _contactsCache = null; }
    return _contactsCache || {};
}

export function resolveLidFromContacts(lid) {
    if (!lid) return null;
    try {
        const contacts = _loadContactsFromFile();
        for (const [phoneJid, entry] of Object.entries(contacts)) {
            if (phoneJid.includes('@lid') || typeof entry !== 'object') continue;
            if (entry.lid === lid || entry.id === lid) {
                const phone = entry.jid || phoneJid;
                if (phone && !phone.includes('@lid')) {
                    return {
                        jid: jidNormalizedUser(phone),
                        number: phone.split('@')[0],
                        name: entry.name || entry.notify || null
                    };
                }
            }
        }
    } catch (_) {}
    return null;
}

async function getSenderJid(message, hisoka) {
    let sender = message.key?.participant || message.participant;

    if (!sender) return null;

    if (sender.includes('@lid')) {
        // Coba 1: resolve dari contacts
        try {
            const contacts = hisoka.contacts;
            if (contacts?.read) {
                const contact = contacts.read(sender);
                if (contact?.id && !contact.id.includes('@lid')) return jidNormalizedUser(contact.id);
                if (contact?.phoneNumber) return jidNormalizedUser(contact.phoneNumber + '@s.whatsapp.net');
            }
        } catch (_) {}

        // Coba 2: resolve dari participants grup (LID ↔ phoneNumber)
        try {
            const remoteJid = message.key?.remoteJid;
            if (remoteJid && isJidGroup(remoteJid)) {
                const group = hisoka.groups?.read(remoteJid);
                if (group?.participants) {
                    const match = group.participants.find(p =>
                        (p.lid && areJidsSameUser(p.lid, sender)) ||
                        (p.id && areJidsSameUser(p.id, sender))
                    );
                    if (match?.phoneNumber) return jidNormalizedUser(match.phoneNumber + '@s.whatsapp.net');
                    if (match?.id && !match.id.includes('@lid')) return jidNormalizedUser(match.id);
                }
            }
        } catch (_) {}

        // Coba 3: reverse lookup dari contacts.json file (paling akurat untuk LID)
        try {
            const resolved = resolveLidFromContacts(sender);
            if (resolved?.jid) return resolved.jid;
        } catch (_) {}

        // Coba 4: hisoka.resolveLidToPN (async fallback)
        try {
            if (typeof hisoka.resolveLidToPN === 'function') {
                const resolved = await hisoka.resolveLidToPN({
                    remoteJid: message.key?.remoteJid,
                    participant: sender
                });
                if (resolved && !resolved.includes('@lid')) return jidNormalizedUser(resolved);
            }
        } catch (_) {}

        // Tidak bisa resolve LID — kembalikan sender asli (masih @lid)
    }

    return jidNormalizedUser(sender);
}

function isOwnerJid(senderJid, senderNumber, config) {
    const owners = (config.owners || []);
    const ownerJids = owners.map(o => o + '@s.whatsapp.net');
    return ownerJids.some(o => areJidsSameUser(o, senderJid)) ||
        owners.some(o => senderNumber === o);
}

/**
 * Bangun info statistik grup dengan simbol keren
 */
function buildGroupStats(groupMeta, newWarn, maxWarnings) {
    const participants = groupMeta?.participants || [];
    const totalMembers = participants.length;
    const totalAdmins = participants.filter(p => p.admin).length;
    const totalMembers_ = totalMembers - totalAdmins;

    // Warning bar dengan simbol keren
    const filled = '◆'.repeat(newWarn);
    const empty = '◇'.repeat(maxWarnings - newWarn);
    const warnBar = filled + empty;

    // Grafik member sederhana
    const adminPct = totalMembers > 0 ? Math.round((totalAdmins / totalMembers) * 10) : 0;
    const memberPct = 10 - adminPct;
    const adminBar = '█'.repeat(adminPct) + '░'.repeat(memberPct);

    return {
        totalMembers,
        totalAdmins,
        totalMembers_,
        warnBar,
        adminBar,
        adminPct: totalMembers > 0 ? Math.round((totalAdmins / totalMembers) * 100) : 0,
    };
}

export default async function handleAntiTagSW(message, hisoka) {
    try {
        if (!message?.key?.remoteJid) return;
        if (!message.message) return;

        const remoteJid = message.key.remoteJid;

        if (!isJidGroup(remoteJid)) return;
        if (message.key?.fromMe) return;

        // Cek tipe pesan
        const msgType = getContentType(message.message);
        if (!msgType) return;

        const isTagStatus = ANTITAG_MSG_TYPES.includes(msgType);
        const isCaptionTag = !isTagStatus && detectCaptionGroupTag(message);

        // Hanya proses jika salah satu terdeteksi
        if (!isTagStatus && !isCaptionTag) return;

        // Cek config global
        const config = loadConfig();
        const antiTagSWConfig = config.antiTagSW || {};
        if (!antiTagSWConfig.enabled) return;

        // Cek apakah grup ini mengaktifkan antitagsw
        const data = loadData();
        if (!data.groups.includes(remoteJid)) return;

        const senderJid = await getSenderJid(message, hisoka);
        if (!senderJid) return;

        const isLid = senderJid.includes('@lid');
        const senderNumber = isLid ? `[LID]` : (jidDecode(senderJid)?.user || senderJid.split('@')[0] || '');

        // Skip owner
        if (isOwnerJid(senderJid, senderNumber, config)) return;

        // Skip bot sendiri
        const botJid = jidNormalizedUser(hisoka.user?.id || '');
        if (areJidsSameUser(senderJid, botJid)) return;

        const botNumber = botJid.split('@')[0].split(':')[0];
        const senderNumberClean = senderJid.split('@')[0].split(':')[0];
        function loadBotAdminFile() {
            return kvGet('botadmin/botadmin', {});
        }

        function saveBotAdminFile(data) {
            try { kvSet('botadmin/botadmin', data); } catch (_) {}
        }

        function findParticipant(participants, targetJids = [], targetNumbers = []) {
            const jids = targetJids.filter(Boolean).map(j => jidNormalizedUser(j));
            const numbers = targetNumbers.filter(Boolean).map(n => String(n).split('@')[0].split(':')[0]);

            return participants?.find(p => {
                // Baileys bisa mengisi participant dengan id @lid, jid PN,
                // phoneNumber, atau kombinasi beberapa field sekaligus.
                const candidates = [p?.id, p?.jid, p?.phoneNumber, p?.lid].filter(Boolean);
                return candidates.some(candidate => {
                    const candidateText = String(candidate);
                    if (jids.some(target => {
                        try { return areJidsSameUser(candidateText, target); } catch (_) { return false; }
                    })) return true;

                    const candidateNumber = candidateText.split('@')[0].split(':')[0];
                    return numbers.includes(candidateNumber);
                });
            }) || null;
        }

        // Selalu fetch live groupMetadata agar status admin bot akurat (realtime)
        let groupMeta = null;
        let isAdmin = false;
        try {
            groupMeta = await hisoka.groupMetadata(remoteJid);
            if (groupMeta) hisoka.groups?.write(remoteJid, groupMeta);
            const botP = findParticipant(groupMeta?.participants, [botJid], [botNumber]);
            isAdmin = !!botP?.admin;
            // Update cache
            const botAdminData = loadBotAdminFile();
            botAdminData[remoteJid] = isAdmin;
            saveBotAdminFile(botAdminData);
        } catch (_) {
            // Fallback: cache file, lalu cache memory
            const botAdminData = loadBotAdminFile();
            if (remoteJid in botAdminData) {
                isAdmin = botAdminData[remoteJid] === true;
            }
            groupMeta = hisoka.groups?.read(remoteJid) || null;
            if (groupMeta) {
                const botP = findParticipant(groupMeta?.participants, [botJid], [botNumber]);
                isAdmin = !!botP?.admin;
            }
        }

        // Deteksi tipe konten
        const [contentLabel, contentEmoji] = detectStatusContentType(message);
        const tagMethod = isTagStatus ? 'Status WA' : isCaptionTag ? 'Caption/Reply' : 'Tidak Diketahui';
        let senderActionJid = senderJid;

        if (groupMeta?.participants) {
            const rawSenderJid = message.key?.participant || message.participant || '';
            const senderParticipant = findParticipant(
                groupMeta.participants,
                [senderJid, rawSenderJid],
                [senderNumberClean]
            );
            if (senderParticipant?.admin) {
                // Admin bebas tag status — balas tapi tanpa warning/kick
                try {
                    await hisoka.sendMessage(remoteJid, {
                        text: `*👑 ADMIN DIIZINKAN*\n\n` +
                            `• Nama/ID: ${isLid ? '_(ID tidak dikenal / LID)_' : '@' + senderNumber}\n` +
                            `• Status: *Admin*\n\n` +
                            `> Tag grup melalui status diperbolehkan untuk admin.`,
                        contextInfo: { mentionedJid: isLid ? [] : [senderJid] }
                    }, { quoted: message });
                } catch (_) {}
                return;
            }

            // Untuk operasi remove, prioritaskan phoneNumber dari metadata.
            // Mengirim @lid mentah sering membuat groupParticipantsUpdate
            // gagal walaupun akun tersebut sudah ditemukan dengan benar.
            senderActionJid = senderParticipant?.phoneNumber
                || (senderParticipant?.id && !String(senderParticipant.id).includes('@lid') ? senderParticipant.id : null)
                || senderJid;
            if (senderActionJid && !String(senderActionJid).includes('@')) {
                senderActionJid = `${senderActionJid}@s.whatsapp.net`;
            }
            senderActionJid = senderActionJid ? jidNormalizedUser(senderActionJid) : senderJid;
        }

        console.log(`\x1b[33m[AntiTagSW] Terdeteksi! Type: ${msgType} | Metode: ${tagMethod} | Sender: ${senderNumber} | BotAdmin: ${isAdmin}\x1b[39m`);

        if (!isAdmin) {
            console.log('\x1b[33m[AntiTagSW] Bot bukan admin, hanya kirim peringatan (tanpa hapus/kick).\x1b[39m');
        }

        // Reload fresh dari disk tepat sebelum update warning (hindari race condition)
        const freshData = loadData();
        if (!freshData.warnings[remoteJid]) freshData.warnings[remoteJid] = {};
        if (!freshData.warnings[remoteJid][senderJid]) freshData.warnings[remoteJid][senderJid] = 0;
        freshData.warnings[remoteJid][senderJid] += 1;

        const newWarn = freshData.warnings[remoteJid][senderJid];
        const maxWarnings = antiTagSWConfig.maxWarnings ?? 3;
        saveData(freshData);
        Object.assign(data, freshData);

        // Catat log pelanggaran (warn dulu, nanti di-overwrite ke kick jika sampai max)
        const _logEntry = {
            gid: remoteJid,
            senderJid,
            senderNum: senderNumber,
            action: newWarn >= maxWarnings ? 'kick' : 'warn',
            warnCount: newWarn,
            maxWarn: maxWarnings,
            method: tagMethod,
            ts: Date.now(),
        };
        appendLog(_logEntry);

        const now = new Date();
        const timeStr = now.toLocaleTimeString('id-ID', {
            timeZone: 'Asia/Jakarta',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        const dateStr = now.toLocaleDateString('id-ID', {
            timeZone: 'Asia/Jakarta',
            day: '2-digit', month: '2-digit', year: 'numeric'
        });

        // Bangun statistik grup
        const stats = buildGroupStats(groupMeta, newWarn, maxWarnings);

        const _pelanggarLabel = isLid ? `👤 *Pelanggar* ﹕_(ID tidak dikenal / akun privat)_\n` : `👤 *Pelanggar* ﹕@${senderNumber}\n`;
        const _mentionList = isLid ? [] : [senderJid];

        if (newWarn >= maxWarnings) {
            // Reset warning setelah max tercapai
            delete freshData.warnings[remoteJid][senderJid];
            saveData(freshData);

            const kickStatusLine = isAdmin
                ? `💥 *Status*    ﹕ Telah di-*KICK* dari grup!`
                : `⚠️ *Bot bukan admin* — tidak bisa kick!\n💡 Jadikan bot admin agar bisa kick otomatis.`;

            const kickMsg =
                `*⛔ ANTI-TAG STATUS*\n` +
                `\n` +
                _pelanggarLabel +
                `🕐 *Waktu:* ${timeStr} • ${dateStr}\n` +
                `${contentEmoji} *Konten:* ${contentLabel}\n` +
                `📡 *Metode:* ${tagMethod}\n` +
                `\n` +
                `*📊 STATISTIK GRUP*\n` +
                `• Total member: *${stats.totalMembers}* orang\n` +
                `• Total admin: *${stats.totalAdmins}* orang\n` +
                `• Member biasa: *${stats.totalMembers_}* orang\n` +
                `• Rasio admin: *${stats.adminPct}%*\n` +
                `  ${stats.adminBar}\n` +
                `\n` +
                `*⚠️ PELANGGARAN*\n` +
                `> 🚫 Mentag grup lewat *${tagMethod}*\n` +
                `\n` +
                `🔴 *Peringatan:* ${maxWarnings}/${maxWarnings}\n` +
                `• ${kickStatusLine}\n` +
                `\n` +
                `_Jangan ulangi perbuatan ini di grup lain!_ 😤`;

            await hisoka.sendMessage(remoteJid, {
                text: formatAntiTagText(kickMsg),
                contextInfo: { mentionedJid: _mentionList }
            }, { quoted: message });

            if (isAdmin) {
                // Tandai ID agar anti-delete tidak notif "PESAN DIHAPUS"
                global.__antiTagSWDeletedIds.add(message.key.id);
                setTimeout(() => global.__antiTagSWDeletedIds.delete(message.key.id), 10000);

                // Hapus pesan tag status
                try {
                    await hisoka.sendMessage(remoteJid, {
                        delete: {
                            remoteJid: remoteJid,
                            fromMe: false,
                            id: message.key.id,
                            participant: message.key.participant
                        }
                    });
                } catch (delErr) {
                    console.error('\x1b[31m[AntiTagSW] Gagal hapus pesan:\x1b[39m', delErr.message);
                }

                try {
                    await hisoka.groupParticipantsUpdate(remoteJid, [senderActionJid || senderJid], 'remove');
                    console.log(`\x1b[31m[AntiTagSW] ✓ Kicked ${senderNumber} dari ${remoteJid}\x1b[39m`);
                } catch (kickErr) {
                    console.error('\x1b[31m[AntiTagSW] Gagal kick:\x1b[39m', kickErr.message);
                    await hisoka.sendMessage(remoteJid, {
                        text: `❌ *Gagal mengeluarkan anggota.*\n> ${isLid ? '_(ID tidak dikenal / LID)_' : '@' + senderNumber} — pastikan bot adalah admin grup.`,
                        contextInfo: { mentionedJid: _mentionList }
                    });
                }
            }
        } else {
            const deleteInfo = isAdmin
                ? `🗑️ *Pesan*     ﹕ Telah dihapus otomatis.\n`
                : `⚠️ *Pesan*     ﹕ Bot bukan admin, tidak bisa hapus.\n`;

            const nextWarnInfo = (newWarn >= maxWarnings - 1)
                ? `⚡ *Peringatan berikutnya = KICK otomatis!*`
                : `💡 Sisa *${maxWarnings - newWarn}x* lagi sebelum di-kick!`;

            const warnMsg =
                `*⚠️ ANTI-TAG STATUS*\n` +
                `\n` +
                _pelanggarLabel +
                `🕐 *Waktu:* ${timeStr} • ${dateStr}\n` +
                `${contentEmoji} *Konten:* ${contentLabel}\n` +
                `📡 *Metode:* ${tagMethod}\n` +
                `${deleteInfo}` +
                `\n` +
                `*📊 STATISTIK GRUP*\n` +
                `• Total member: *${stats.totalMembers}* orang\n` +
                `• Total admin: *${stats.totalAdmins}* orang\n` +
                `• Member biasa: *${stats.totalMembers_}* orang\n` +
                `• Rasio admin: *${stats.adminPct}%*\n` +
                `  ${stats.adminBar}\n` +
                `\n` +
                `*🚫 PERINGATAN*\n` +
                `> 🔴 *Peringatan:* dilarang mentag grup via *${tagMethod}*!\n` +
                `\n` +
                `📊 *Progress:* ${stats.warnBar} ${newWarn}/${maxWarnings}\n` +
                `> ${nextWarnInfo}`;

            await hisoka.sendMessage(remoteJid, {
                text: formatAntiTagText(warnMsg),
                contextInfo: { mentionedJid: _mentionList }
            }, { quoted: message });

            if (isAdmin) {
                // Tandai ID agar anti-delete tidak notif "PESAN DIHAPUS"
                global.__antiTagSWDeletedIds.add(message.key.id);
                setTimeout(() => global.__antiTagSWDeletedIds.delete(message.key.id), 10000);

                // Hapus pesan tag status
                try {
                    await hisoka.sendMessage(remoteJid, {
                        delete: {
                            remoteJid: remoteJid,
                            fromMe: false,
                            id: message.key.id,
                            participant: message.key.participant
                        }
                    });
                } catch (delErr) {
                    console.error('\x1b[31m[AntiTagSW] Gagal hapus pesan:\x1b[39m', delErr.message);
                }
            }

            console.log(`\x1b[33m[AntiTagSW] Warn ${newWarn}/${maxWarnings} - ${senderNumber} | Admin: ${isAdmin} | Metode: ${tagMethod}\x1b[39m`);
        }
    } catch (err) {
        console.error('\x1b[31m[AntiTagSW] Error:\x1b[39m', err.message);
    }
}

export function isAntiTagSWEnabled(groupId) {
    const data = loadData();
    return data.groups.includes(groupId);
}

export function getAllAntiTagSWGroups() {
    const data = loadData();
    return Array.isArray(data.groups) ? [...data.groups] : [];
}

export function toggleAntiTagSW(groupId, enable) {
    const data = loadData();
    if (enable) {
        if (!data.groups.includes(groupId)) {
            data.groups.push(groupId);
        }
    } else {
        data.groups = data.groups.filter(g => g !== groupId);
        if (data.warnings[groupId]) {
            delete data.warnings[groupId];
        }
    }
    saveData(data);
    return data;
}

export function resetWarnings(groupId, userJid) {
    const data = loadData();
    if (!data.warnings[groupId]) return;
    if (userJid) {
        delete data.warnings[groupId][userJid];
    } else {
        delete data.warnings[groupId];
    }
    saveData(data);
}

export function getWarnings(groupId) {
    const data = loadData();
    return data.warnings[groupId] || {};
}

// ── Merged from antitagsw.js ──────────────────────────────────────────────────
export async function handleAntitagsw({ hisoka, m, query, tolak: rawTolak, logCommand, loadConfig, saveConfig, toggleAntiTagSW, saveCekautoTimestamp, sendConfirmWithButtons, isAntiTagSWEnabled, getAllAntiTagSWGroups, getWarnings, resetWarnings, kvGet, Button, clearAntiTagSWLog, getAntiTagSWLog, resolveLidFromContacts }) {
        const tolak = (bot, message, text) => rawTolak(bot, message, formatAntiTagText(text));
        if (!m.isGroup) return tolak(hisoka, m, '❌ *`.antitagsw` hanya bisa digunakan di grup.*');
        if (!m.isAdmin && !m.isOwner) return tolak(hisoka, m, '❌ *Akses ditolak.* _Hanya admin grup atau owner bot yang bisa menggunakan perintah ini._');

        const arg = (query || '').trim().toLowerCase();

        if (arg === 'global on') {
                if (!m.isOwner) return tolak(hisoka, m, '❌ *Akses ditolak.* _Hanya owner bot yang bisa mengubah pengaturan global._');
                const config = loadConfig();
                if (!config.antiTagSW) config.antiTagSW = {};
                config.antiTagSW.enabled = true;
                saveConfig(config);
                await tolak(hisoka, m,
                        `*🌐 ANTITAGSW GLOBAL*\n\n` +
                        `✅ *Global AntiTagSW diaktifkan!*\n\n` +
                        `_Sekarang admin grup dapat mengaktifkan fitur ini di grup masing-masing._\n` +
                        `> Gunakan \`.antitagsw on\` untuk mengaktifkan proteksi grup.`
                );
                logCommand(m, hisoka, 'antitagsw global on');
        } else if (arg === 'global off') {
                if (!m.isOwner) return tolak(hisoka, m, '❌ *Akses ditolak.* _Hanya owner bot yang bisa mengubah pengaturan global._');
                const config = loadConfig();
                if (!config.antiTagSW) config.antiTagSW = {};
                config.antiTagSW.enabled = false;
                saveConfig(config);
                await tolak(hisoka, m,
                        `*🌐 ANTITAGSW GLOBAL*\n\n` +
                        `🔴 *Global AntiTagSW dinonaktifkan!*\n\n` +
                        `_Proteksi tidak akan berjalan di grup mana pun sampai fitur global diaktifkan kembali._\n` +
                        `> Gunakan \`.antitagsw global on\` untuk mengaktifkannya lagi.`
                );
                logCommand(m, hisoka, 'antitagsw global off');
        } else if (arg === 'on') {
                const config = loadConfig();
                let globalAutoEnabled = false;
                if (!config.antiTagSW?.enabled) {
                        if (!m.isOwner) {
                                return tolak(hisoka, m, '❌ *AntiTagSW sedang dinonaktifkan secara global.*\n> Minta owner menjalankan \`.antitagsw global on\` terlebih dahulu.');
                        }
                        if (!config.antiTagSW) config.antiTagSW = {};
                        config.antiTagSW.enabled = true;
                        saveConfig(config);
                        globalAutoEnabled = true;
                }
                toggleAntiTagSW(m.from, true);
                saveCekautoTimestamp('antiTagSWGrup', m.from);
                // Gunakan reply teks biasa untuk konfirmasi utama. Pesan
                // native list kadang di-ack Baileys tetapi tidak tampil di
                // beberapa client WhatsApp, sehingga command terlihat diam.
                await tolak(hisoka, m,
                        `*✅ ANTI-TAG SEMUA WARGA*\n\n` +
                        `🟢 *Fitur AntiTagSW aktif!*\n` +
                        (globalAutoEnabled ? `🌐 *Global juga diaktifkan otomatis!*\n` : '') +
                        `\n` +
                        `*⚙️ KONFIGURASI*\n` +
                        `• Maks. warning: *${config.antiTagSW?.maxWarnings ?? 3}x*\n\n` +
                        `_Anggota yang mentag grup lewat status akan diperingatkan dan dikeluarkan setelah batas tercapai._\n` +
                        `> Status fitur: *AKTIF*`
                );
                logCommand(m, hisoka, 'antitagsw on');
        } else if (arg === 'off') {
                toggleAntiTagSW(m.from, false);
                await tolak(hisoka, m,
                        `*❌ ANTI-TAG SEMUA WARGA*\n\n` +
                        `🔴 *Fitur AntiTagSW ~NONAKTIF~.*\n\n` +
                        `_Semua warning di grup ini juga sudah direset._\n` +
                        `> Gunakan \`.antitagsw on\` untuk mengaktifkannya kembali.`
                );
                logCommand(m, hisoka, 'antitagsw off');
        } else if (arg === 'reset') {
                resetWarnings(m.from);
                await tolak(hisoka, m, '✅ *Semua warning AntiTagSW di grup ini sudah direset.*\n> Status pelanggaran kembali bersih.');
                logCommand(m, hisoka, 'antitagsw reset');

        } else if (arg.startsWith('warn')) {
                if (!m.isOwner) return tolak(hisoka, m, '❌ *Akses ditolak.* _Hanya owner yang bisa mengubah batas warning._');
                const warnNum = parseInt((arg.replace(/^warn\s*/, '') || '').trim(), 10);
                if (!warnNum || isNaN(warnNum) || warnNum < 1 || warnNum > 100) {
                        return tolak(hisoka, m,
                                `*⚠️ ANTITAGSW WARN*\n\n` +
                                `❌ *Angka tidak valid.*\n\n` +
                                `*Format:* \`.antitagsw warn <angka>\`\n` +
                                `*Contoh:* \`.antitagsw warn 5\`\n\n` +
                                `> Angka yang valid: *1–100*.`
                        );
                }
                const config = loadConfig();
                if (!config.antiTagSW) config.antiTagSW = {};
                const oldMax = config.antiTagSW.maxWarnings ?? 3;
                config.antiTagSW.maxWarnings = warnNum;
                saveConfig(config);
                await tolak(hisoka, m,
                        `*⚠️ ANTITAGSW WARN*\n\n` +
                        `✅ *Batas warning berhasil diubah.*\n\n` +
                        `• Sebelumnya: *${oldMax}x*\n` +
                        `• Sekarang: *${warnNum}x*\n\n` +
                        `_Anggota akan dikeluarkan setelah melanggar sebanyak ${warnNum}x._\n` +
                        `> Konfigurasi tersimpan di \`config.json\`.`
                );
                logCommand(m, hisoka, `antitagsw warn ${warnNum}`);

        } else if (arg === 'add') {
                const config = loadConfig();
                if (!config.antiTagSW?.enabled) {
                        if (!m.isOwner) return tolak(hisoka, m, '❌ *AntiTagSW sedang dinonaktifkan secara global.*\n> Minta owner menjalankan \`.antitagsw global on\` terlebih dahulu.');
                        if (!config.antiTagSW) config.antiTagSW = {};
                        config.antiTagSW.enabled = true;
                        saveConfig(config);
                }
                const alreadyAdded = isAntiTagSWEnabled(m.from);
                toggleAntiTagSW(m.from, true);
                await tolak(hisoka, m,
                        `*✅ ANTI-TAG SEMUA WARGA*\n\n` +
                        `${alreadyAdded ? '🔄 *Grup ini sudah terdaftar sebelumnya.*' : '➕ *Grup berhasil ditambahkan.*'}\n\n` +
                        `• Global: 🟢 *Aktif*\n` +
                        `• Grup ini: 🟢 *Aktif*\n` +
                        `• Maks. warning: *${config.antiTagSW?.maxWarnings ?? 3}x*\n\n` +
                        `_Tag grup lewat status akan dipantau dan diproses sesuai batas warning._\n` +
                        `> Gunakan \`.antitagsw status\` untuk melihat detail.`
                );
                logCommand(m, hisoka, 'antitagsw add');

        } else if (arg === 'list') {
                if (!m.isOwner && !m.isAdmin) return tolak(hisoka, m, '❌ *Akses ditolak.* _Hanya owner atau admin yang bisa melihat daftar AntiTagSW._');
                const allGroups = getAllAntiTagSWGroups();
                if (!allGroups.length) {
                        return tolak(hisoka, m,
                                `*📋 DAFTAR ANTITAGSW*\n\n` +
                                `❌ _Belum ada grup yang terdaftar._\n\n` +
                                `> Gunakan \`.antitagsw add\` di grup yang ingin diaktifkan.`
                        );
                }

                const botAdminCache = kvGet('botadmin/botadmin', {});
                const botNum = (hisoka.user?.id || '').split(':')[0].split('@')[0];

                const grupInfoList = [];
                for (let i = 0; i < allGroups.length; i++) {
                        const gid = allGroups[i];
                        let namaGrup = '-';
                        let totalMember = '?';
                        let totalAdmin = '?';
                        let botIsAdmin = botAdminCache[gid] === true;

                        try {
                                const meta = await hisoka.groupMetadata(gid);
                                if (meta) {
                                        namaGrup = meta.subject || '-';
                                        const participants = meta.participants || [];
                                        totalMember = participants.length;
                                        totalAdmin = participants.filter(p => p.admin).length;
                                        const botP = participants.find(p => {
                                                const pNum = (p.jid || p.id || '').split('@')[0].split(':')[0];
                                                return pNum === botNum;
                                        });
                                        botIsAdmin = botP !== undefined ? !!botP.admin : (botAdminCache[gid] === true);
                                }
                        } catch {
                                try {
                                        const cached = hisoka.groups?.read(gid);
                                        if (cached) {
                                                namaGrup = cached.subject || '-';
                                                const participants = cached.participants || [];
                                                totalMember = participants.length;
                                                totalAdmin = participants.filter(p => p.admin).length;
                                        }
                                } catch {}
                        }

                        const warnings = getWarnings(gid);
                        const totalWarned = Object.keys(warnings).length;
                        grupInfoList.push({ gid, namaGrup, totalMember, totalAdmin, totalWarned, botIsAdmin });
                }

                let listBaris = '';
                for (let i = 0; i < grupInfoList.length; i++) {
                        const { gid, namaGrup, totalMember, totalAdmin, totalWarned, botIsAdmin } = grupInfoList[i];
                        listBaris +=
                                `${i + 1}. *${namaGrup}*\n` +
                                `   • ID: \`${gid}\`\n` +
                                `   • Anggota: *${totalMember}* | Admin: *${totalAdmin}*\n` +
                                `   • Bot admin: ${botIsAdmin ? '✅ Ya' : '❌ Bukan'}\n` +
                                `   • Member warned: *${totalWarned} orang*\n\n`;
                }

                const listText =
                        `*📋 DAFTAR ANTITAGSW*\n\n` +
                        `🟢 Total aktif: *${allGroups.length} grup*\n\n` +
                        listBaris +
                        `*🗑️ CARA HAPUS*\n` +
                        `1. Reply pesan ini dengan nomor grup.\n` +
                        `2. Contoh: \`1\`, \`1,2\`, atau \`1,2,3\`.\n` +
                        `3. Ketik \`semua\` untuk menghapus semua grup.\n` +
                        `4. Ketik \`reset\` untuk mereset semua warning.\n\n` +
                        `> Nomor grup mengikuti urutan daftar di atas.`;

                if (!global.__antiTagSWListSessions) global.__antiTagSWListSessions = new Map();
                const sentList = await hisoka.sendMessage(m.from, { text: formatAntiTagText(listText) }, { quoted: m }).catch(() => null);
                if (sentList?.key?.id) {
                        global.__antiTagSWListSessions.set(sentList.key.id, {
                                groups: grupInfoList,
                                from: m.from,
                                by: m.sender || m.key?.participant || m.from,
                                ts: Date.now()
                        });
                        setTimeout(() => global.__antiTagSWListSessions?.delete(sentList.key.id), 5 * 60 * 1000);
                }
                logCommand(m, hisoka, 'antitagsw list');

        } else if (arg === 'log' || arg.startsWith('log ')) {
                const logSub = arg.slice(3).trim();

                if (logSub === 'clear all') {
                        if (!m.isOwner) return tolak(hisoka, m, '❌ *Akses ditolak.* _Hanya owner yang bisa menghapus semua log._');
                        clearAntiTagSWLog();
                        return tolak(hisoka, m, '✅ *Semua log AntiTagSW berhasil dihapus.*\n> Riwayat pelanggaran seluruh grup sudah dibersihkan.');
                }

                if (logSub === 'clear') {
                        clearAntiTagSWLog(m.from);
                        return tolak(hisoka, m, '✅ *Log AntiTagSW grup ini berhasil dihapus.*\n> Riwayat pelanggaran grup ini sudah dibersihkan.');
                }

                const showAll = (logSub === 'all') && m.isOwner;
                const rawLogs = getAntiTagSWLog(showAll ? null : m.from);

                if (!rawLogs.length) {
                        return tolak(hisoka, m,
                                `*📜 LOG ANTITAGSW*\n\n` +
                                `ℹ️ _Belum ada riwayat pelanggaran${showAll ? '' : ' di grup ini'}._\n\n` +
                                `*📋 SUB-PERINTAH*\n` +
                                `• \`.antitagsw log\` → log grup ini\n` +
                                (m.isOwner ? `• \`.antitagsw log all\` → log semua grup\n` : '') +
                                `• \`.antitagsw log clear\` → hapus log grup ini\n` +
                                (m.isOwner ? `• \`.antitagsw log clear all\` → hapus semua log\n` : '') +
                                `\n> Gunakan command di atas sesuai kebutuhan.`
                        );
                }

                const _fmtWaktu = (ts) => new Date(ts).toLocaleString('id-ID', {
                        timeZone: 'Asia/Jakarta',
                        day: '2-digit', month: '2-digit', year: '2-digit',
                        hour: '2-digit', minute: '2-digit'
                });
                const _fmtAction = (l) => l.action === 'kick' ? `🔴 KICK` : `🟡 WARN ${l.warnCount}/${l.maxWarn}`;

                const totalWarn = rawLogs.filter(l => l.action === 'warn').length;
                const totalKick = rawLogs.filter(l => l.action === 'kick').length;

                if (showAll) {
                        const byGid = {};
                        for (const l of rawLogs) {
                                if (!byGid[l.gid]) byGid[l.gid] = [];
                                byGid[l.gid].push(l);
                        }
                        const uniqueGids = Object.keys(byGid);

                        const namaGrupCache = {};
                        await Promise.all(uniqueGids.map(async (gid) => {
                                try {
                                        const mt = await hisoka.groupMetadata(gid);
                                        namaGrupCache[gid] = mt?.subject || gid.split('@')[0];
                                } catch {
                                        try { namaGrupCache[gid] = hisoka.groups?.read(gid)?.subject || gid.split('@')[0]; }
                                        catch { namaGrupCache[gid] = gid.split('@')[0]; }
                                }
                        }));

                        const GRUP_PER_MSG = 5;
                        const header =
                                `*📜 LOG ANTITAGSW — SEMUA GRUP*\n\n` +
                                `• Jumlah grup: *${uniqueGids.length}*\n` +
                                `• Total log: *${rawLogs.length}*\n` +
                                `• Warn: *${totalWarn}* | Kick: *${totalKick}*`;

                        for (let gi = 0; gi < uniqueGids.length; gi += GRUP_PER_MSG) {
                                const batch = uniqueGids.slice(gi, gi + GRUP_PER_MSG);
                                let batchTxt = '';
                                for (const gid of batch) {
                                        const logs = byGid[gid].slice(-10).reverse();
                                        const gWarn = byGid[gid].filter(l => l.action === 'warn').length;
                                        const gKick = byGid[gid].filter(l => l.action === 'kick').length;
                                        batchTxt +=
                                                `*🏘️ ${namaGrupCache[gid]}*\n` +
                                                `• Total: *${byGid[gid].length}* | Warn: *${gWarn}* | Kick: *${gKick}*\n` +
                                                `_Menampilkan ${logs.length} log terbaru._\n\n`;
                                        for (let i = 0; i < logs.length; i++) {
                                                const l = logs[i];
                                                batchTxt +=
                                                        `${i + 1}. ${_fmtAction(l)}\n` +
                                                        `   • Pengguna: ${l.senderJid?.includes('@lid') ? (r=>r?('@'+r.number+(r.name?' ('+r.name+')':'')):'⚠️ ID tidak dikenal (LID)')(resolveLidFromContacts(l.senderJid)) : '@'+l.senderNum}\n` +
                                                        `   • Metode: *${l.method || '-'}* • Waktu: _${_fmtWaktu(l.ts)}_\n\n`;
                                        }
                                                batchTxt += `\n`;
                                }
                                const finalTxt = gi === 0 ? header + '\n\n' + batchTxt.trim() : batchTxt.trim();
                                await tolak(hisoka, m, finalTxt);
                                if (gi + GRUP_PER_MSG < uniqueGids.length) await new Promise(r => setTimeout(r, 600));
                        }

                } else {
                        const recentLogs = rawLogs.slice(-25).reverse();
                        let logBaris = '';
                        for (let i = 0; i < recentLogs.length; i++) {
                                const l = recentLogs[i];
                                logBaris +=
                                        `${i + 1}. ${_fmtAction(l)}\n` +
                                        `   • Pengguna: ${l.senderJid?.includes('@lid') ? (r=>r?('@'+r.number+(r.name?' ('+r.name+')':'')):'⚠️ ID tidak dikenal (LID)')(resolveLidFromContacts(l.senderJid)) : '@'+l.senderNum}\n` +
                                        `   • Metode: *${l.method || '-'}* • Waktu: _${_fmtWaktu(l.ts)}_\n\n`;
                        }
                        await tolak(hisoka, m,
                                `*📜 LOG ANTITAGSW*\n\n` +
                                `• Total log grup ini: *${rawLogs.length}*\n` +
                                `• Warn: *${totalWarn}* | Kick: *${totalKick}*\n` +
                                `_Menampilkan 25 log terbaru._\n\n` +
                                logBaris +
                                `*📋 SUB-PERINTAH*\n` +
                                `• \`.antitagsw log\` → log grup ini\n` +
                                (m.isOwner ? `• \`.antitagsw log all\` → log semua grup\n` : '') +
                                `• \`.antitagsw log clear\` → hapus log grup ini\n` +
                                (m.isOwner ? `• \`.antitagsw log clear all\` → hapus semua log\n` : '') +
                                `\n> Gunakan command sesuai kebutuhan.`
                        );
                }
                logCommand(m, hisoka, 'antitagsw log');

        } else {
                const config = loadConfig();
                const isEnabled = isAntiTagSWEnabled(m.from);
                const globalEnabled = config.antiTagSW?.enabled ?? false;
                const warnings = getWarnings(m.from);
                const totalWarned = Object.keys(warnings).length;

                let grupStatus;
                if (isEnabled) {
                        grupStatus = '🟢 Aktif';
                } else if (globalEnabled) {
                        grupStatus = '🔴 ~Nonaktif~ _(belum ditambahkan)_';
                } else {
                        grupStatus = '🔴 ~Nonaktif~';
                }

                const hintAdd = globalEnabled && !isEnabled
                        ? `> 💡 Ketik \`.antitagsw add\` untuk mengaktifkan di grup ini!\n\n`
                        : '';

                let statusText =
                        `*ℹ️ ANTI-TAG SEMUA WARGA*\n\n` +
                        `• Global: ${globalEnabled ? '🟢 *Aktif*' : '🔴 ~Nonaktif~'}\n` +
                        `• Grup ini: ${grupStatus}\n\n` +
                        `*⚙️ KONFIGURASI*\n` +
                        `• Maks. warning: *${config.antiTagSW?.maxWarnings ?? 3}x*\n` +
                        `• Member warned: *${totalWarned} orang*\n\n` +
                        `> ℹ️ Mendeteksi tag grup melalui status WhatsApp.\n\n` +
                        hintAdd +
                        `*📋 CARA PENGGUNAAN*\n` +
                        `• \`.antitagsw add\` → tambah grup ini\n` +
                        `• \`.antitagsw on\` → aktifkan\n` +
                        `• \`.antitagsw off\` → nonaktifkan\n` +
                        `• \`.antitagsw reset\` → reset warning\n` +
                        `• \`.antitagsw list\` → daftar grup aktif\n` +
                        `• \`.antitagsw log\` → riwayat pelanggaran\n` +
                        (m.isOwner ?
                        `• \`.antitagsw warn <n>\` → atur batas warning\n` +
                        `• \`.antitagsw log all\` → lihat semua grup\n` +
                        `• \`.antitagsw global on\` → aktifkan global\n` +
                        `• \`.antitagsw global off\` → nonaktifkan global\n` : '');

                await tolak(hisoka, m, statusText);
        }
}

// ─── handleAntitagswCallbacks ─────────────────────────────────────────────────
// Menangani semua callback interaktif AntiTagSW (button reply, session reply).
// @returns {boolean} true jika pesan sudah ditangani
// ──────────────────────────────────────────────────────────────────────────────
export async function handleAntitagswCallbacks({ hisoka, m, tolak: rawTolak, toggleAntiTagSW, resetWarnings, getAllAntiTagSWGroups }) {
        const tolak = (bot, message, text) => rawTolak(bot, message, formatAntiTagText(text));
        // ── Reply-based session delete (dari .antitagsw list) ─────────────────────
        if (global.__antiTagSWListSessions?.size && m.quoted?.key?.id && (m.isOwner || m.isAdmin)) {
                const sessId = m.quoted.key.id;
                const sess = global.__antiTagSWListSessions?.get(sessId);
                if (sess && sess.from === m.from) {
                        const rawReply = (m.text || m.body || '').trim().toLowerCase();
                        if (rawReply) {
                                global.__antiTagSWListSessions.delete(sessId);
                                try {
                                        const { groups: sessGroups } = sess;
                                        if (rawReply === 'semua') {
                                                const total = sessGroups.length;
                                                for (const g of sessGroups) toggleAntiTagSW(g.gid, false);
                                                await tolak(hisoka, m,
                                                        `*🗑️ HAPUS SEMUA GRUP*\n\n` +
                                                        `✅ *Semua grup berhasil dihapus.*\n` +
                                                        `• Total: *${total} grup*\n` +
                                                        `• Semua warning juga direset.\n\n` +
                                                        `> Daftar AntiTagSW sekarang kosong.`
                                                );
                                        } else if (rawReply === 'reset') {
                                                for (const g of sessGroups) resetWarnings(g.gid);
                                                await tolak(hisoka, m,
                                                        `*🔄 RESET WARNING*\n\n` +
                                                        `✅ *Warning berhasil direset.*\n` +
                                                        `• Total: *${sessGroups.length} grup*\n` +
                                                        `• Grup tetap terdaftar.\n\n` +
                                                        `_Pengaturan AntiTagSW tidak berubah._`
                                                );
                                        } else {
                                                const nums = rawReply.split(/[,\s]+/)
                                                        .map(n => parseInt(n.trim(), 10))
                                                        .filter(n => !isNaN(n) && n >= 1 && n <= sessGroups.length);
                                                const uniq = [...new Set(nums)];
                                                if (!uniq.length) {
                                                        await tolak(hisoka, m,
                                                                `❌ *Nomor tidak valid.*\n` +
                                                                `> Masukkan angka 1–${sessGroups.length}.\n` +
                                                                `Contoh: \`1\` atau \`1,2,3\`.\n` +
                                                                `Ketik \`semua\` atau \`reset\` sesuai kebutuhan.`
                                                        );
                                                } else {
                                                        const dihapus = [];
                                                        for (const n of uniq) {
                                                                const g = sessGroups[n - 1];
                                                                if (g) {
                                                                        toggleAntiTagSW(g.gid, false);
                                                                        dihapus.push(`${n}. *${g.namaGrup}*`);
                                                                }
                                                        }
                                                        const listDihapus = dihapus.map(d => `• ✅ ${d}`).join('\n');
                                                        await tolak(hisoka, m,
                                                                `*🗑️ ANTITAGSW REMOVED*\n\n` +
                                                                `✅ *${dihapus.length} grup berhasil dihapus.*\n\n` +
                                                                listDihapus + `\n` +
                                                                `\n⚠️ _Warning di grup tersebut juga direset._`
                                                        );
                                                }
                                        }
                                } catch (e) {
                                        await tolak(hisoka, m, `❌ *Gagal memproses permintaan.*\n> Detail: \`${e.message}\``);
                                }
                                return true;
                        }
                }
        }

        const txt = typeof m.text === 'string' ? m.text : '';

        // ── __antitagsw_del__ — hapus satu grup dari daftar ───────────────────────
        if ((m.isOwner || m.isAdmin) && txt.startsWith('__antitagsw_del__')) {
                const targetGid = txt.slice('__antitagsw_del__'.length).trim();
                if (targetGid) {
                        try {
                                let namaGrup = targetGid;
                                try { const mt = await hisoka.groupMetadata(targetGid); namaGrup = mt?.subject || targetGid; } catch { try { namaGrup = hisoka.groups?.read(targetGid)?.subject || targetGid; } catch {} }
                                toggleAntiTagSW(targetGid, false);
                                await tolak(hisoka, m,
                                        `*🗑️ ANTITAGSW REMOVED*\n\n` +
                                        `✅ *Grup berhasil dihapus.*\n` +
                                        `• Nama: *${namaGrup}*\n` +
                                        `• ID: \`${targetGid}\`\n\n` +
                                        `> Warning di grup ini juga sudah direset.`
                                );
                        } catch (e) {
                                await tolak(hisoka, m, `❌ *Gagal menghapus grup.*\n> Detail: \`${e.message}\``);
                        }
                        return true;
                }
                return false;
        }

        // ── __antitagsw_delall__ — hapus semua grup dari daftar ───────────────────
        if ((m.isOwner || m.isAdmin) && txt === '__antitagsw_delall__') {
                try {
                        const allG = getAllAntiTagSWGroups();
                        const total = allG.length;
                        for (const gid of allG) toggleAntiTagSW(gid, false);
                        await tolak(hisoka, m,
                                `*🗑️ ANTITAGSW HAPUS SEMUA*\n\n` +
                                `✅ *Semua grup berhasil dihapus.*\n` +
                                `• Total dihapus: *${total} grup*\n` +
                                `• Semua warning juga direset.\n\n` +
                                `> Gunakan \`.antitagsw add\` untuk mendaftarkan ulang grup.`
                        );
                } catch (e) {
                        await tolak(hisoka, m, `❌ *Gagal menghapus semua grup.*\n> Detail: \`${e.message}\``);
                }
                return true;
        }

        // ── __antitagsw_resetall__ — reset semua warning ──────────────────────────
        if ((m.isOwner || m.isAdmin) && txt === '__antitagsw_resetall__') {
                try {
                        const allG = getAllAntiTagSWGroups();
                        for (const gid of allG) resetWarnings(gid);
                        await tolak(hisoka, m,
                                `*🔄 ANTITAGSW RESET SEMUA*\n\n` +
                                `✅ *Semua warning berhasil direset.*\n` +
                                `• Total grup direset: *${allG.length} grup*\n` +
                                `• Grup tetap terdaftar di AntiTagSW.\n\n` +
                                `_Data pelanggaran sudah dibersihkan tanpa menghapus grup dari daftar._`
                        );
                } catch (e) {
                        await tolak(hisoka, m, `❌ *Gagal mereset semua warning.*\n> Detail: \`${e.message}\``);
                }
                return true;
        }

        return false;
}


/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const plugins = [
    { command: /^(antitagsw)$/i, tags: ['group'], help: ['antitagsw'], handler: 'handleAntitagsw' },
];
