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
 *  antitag.js — Anti-Tag Nomor Bot di Grup
 *  Hapus otomatis pesan yang men-tag nomor bot sendiri di GC.
 *  Aman untuk: owner, admin grup.
 *  Syarat hapus: bot harus admin di grup.
 * ───────────────────────────────
 */

'use strict';

import fs from 'fs';
import path from 'path';
import { isJidGroup, jidNormalizedUser, areJidsSameUser, getContentType } from '@whiskeysockets/baileys';

import { kvGet, kvSet } from '../../src/db/datadb.js';
import { resolveLidFromContacts } from '../antitagsw/antitagsw.js';

const CONFIG_PATH = path.join(process.cwd(), 'config.json');

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        }
    } catch (_) {}
    return {};
}

function saveConfig(cfg) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
    } catch (err) {
        console.error('\x1b[31m[AntiTagBot] Gagal simpan config:\x1b[39m', err.message);
    }
}

export function isAntiTagBotEnabled() {
    return !!(loadConfig()?.antiTagBot?.enabled);
}

function getBotJid(hisoka) {
    return jidNormalizedUser(hisoka.user?.id || '');
}

function getBotNumber(hisoka) {
    return (hisoka.user?.id || '').split('@')[0].split(':')[0];
}

function getBotLid(hisoka) {
    // Baileys stores bot's own LID in hisoka.user.lid
    return hisoka.user?.lid || hisoka.user?.lidJid || null;
}

function getSenderNumber(message) {
    const raw = message.key?.participant || message.participant || message.key?.remoteJid || '';
    return raw.split('@')[0].split(':')[0];
}

function getSenderJid(message) {
    const raw = message.key?.participant || message.participant || '';
    if (!raw) return null;
    return jidNormalizedUser(raw);
}

function getPhoneNumber(value) {
    if (value == null || String(value).toLowerCase().includes('@lid')) return null;
    const number = String(value).split('@')[0].split(':')[0].replace(/\D/g, '');
    return number || null;
}

function getIdentityTargets(jids = []) {
    const normalizedJids = new Set();
    const numbers = new Set();

    for (const raw of jids) {
        if (!raw) continue;
        const value = String(raw);
        try { normalizedJids.add(jidNormalizedUser(value)); }
        catch (_) { normalizedJids.add(value); }

        const phoneNumber = getPhoneNumber(value);
        if (phoneNumber) numbers.add(phoneNumber);

        if (value.toLowerCase().includes('@lid')) {
            try {
                const resolved = resolveLidFromContacts(value);
                if (resolved?.jid) {
                    try { normalizedJids.add(jidNormalizedUser(resolved.jid)); }
                    catch (_) { normalizedJids.add(String(resolved.jid)); }
                }
                const resolvedNumber = getPhoneNumber(resolved?.number);
                if (resolvedNumber) numbers.add(resolvedNumber);
            } catch (_) {}
        }
    }

    return { jids: [...normalizedJids], numbers: [...numbers] };
}

function getParticipantPhoneNumbers(participant) {
    return [...new Set(
        [participant?.phoneNumber, participant?.id, participant?.jid]
            .map(getPhoneNumber)
            .filter(Boolean)
    )];
}

export function findParticipantByIdentity(participants, targetJids = [], targetNumbers = []) {
    const jids = (targetJids || []).filter(Boolean).map(jid => {
        try { return jidNormalizedUser(jid); } catch (_) { return String(jid); }
    });
    const numbers = new Set((targetNumbers || []).map(getPhoneNumber).filter(Boolean));

    return (participants || []).find(participant => {
        const candidates = [
            participant?.id,
            participant?.jid,
            participant?.phoneNumber,
            participant?.lid,
        ].filter(Boolean);

        return candidates.some(candidate => {
            const candidateJid = String(candidate);
            if (jids.some(target => {
                try { return areJidsSameUser(candidateJid, target); } catch (_) { return false; }
            })) return true;

            const candidateNumber = getPhoneNumber(candidateJid);
            return !!candidateNumber && numbers.has(candidateNumber);
        });
    }) || null;
}

export function isGroupAdmin(participant) {
    return participant?.admin === true
        || participant?.admin === 'admin'
        || participant?.admin === 'superadmin';
}

function getParticipantIdentityKey(participant) {
    const phoneNumber = getParticipantPhoneNumbers(participant)[0];
    if (phoneNumber) return `phone:${phoneNumber}`;

    const jid = [participant?.id, participant?.jid, participant?.lid].find(Boolean);
    if (!jid) return null;
    try { return `jid:${jidNormalizedUser(jid)}`; }
    catch (_) { return `jid:${String(jid)}`; }
}

function getIdentityTargetKey(targets) {
    if (targets.numbers[0]) return `phone:${targets.numbers[0]}`;
    if (targets.jids[0]) return `jid:${targets.jids[0]}`;
    return null;
}

export function isMassMention(mentionedJids, participants, senderParticipant = null) {
    const parts = Array.isArray(participants) ? participants : [];
    if (parts.length < 3 || !Array.isArray(mentionedJids) || mentionedJids.length < 2) return false;

    const senderKey = getParticipantIdentityKey(senderParticipant);
    const mentionableCount = parts.length - (senderKey ? 1 : 0);
    if (mentionableCount < 2) return false;

    // Anggap mass-mention bila mencakup minimal 90% anggota selain pengirim.
    const requiredCount = Math.max(2, Math.ceil(mentionableCount * 0.9));
    const mentionedKeys = new Set();

    for (const jid of mentionedJids) {
        const targets = getIdentityTargets([jid]);
        const participant = findParticipantByIdentity(parts, targets.jids, targets.numbers);
        const key = getParticipantIdentityKey(participant) || getIdentityTargetKey(targets);
        if (key && key !== senderKey) mentionedKeys.add(key);
    }

    return mentionedKeys.size >= requiredCount;
}

function isOwnerNumber(numbers, config) {
    const candidates = new Set(
        (Array.isArray(numbers) ? numbers : [numbers])
            .map(getPhoneNumber)
            .filter(Boolean)
    );
    const owners = (config.owners || []).map(getPhoneNumber).filter(Boolean);
    return owners.some(owner => candidates.has(owner));
}

function findParticipant(participants, targetNumber) {
    const normalizedTarget = getPhoneNumber(targetNumber);
    if (!normalizedTarget) return null;
    return (participants || []).find(participant =>
        getParticipantPhoneNumbers(participant).includes(normalizedTarget)
    ) || null;
}

/**
 * Cari bot di list participants — gabungan 4 strategi:
 * 1. phoneNumber field
 * 2. id/jid non-@lid (phone JID)
 * 3. LID via botLidFromUser
 * 4. Resolve setiap @lid participant via contacts → cocokkan nomor
 */
function findBotParticipant(participants, botNumber, botLidFromUser) {
    const parts = participants || [];

    // Strategi 1 & 2: cari via nomor telepon (non-LID)
    const byPhone = findParticipant(parts, botNumber);
    if (byPhone) return byPhone;

    // Strategi 3: cari via botLid yang diketahui
    if (botLidFromUser) {
        const byLid = findParticipantByLid(parts, botLidFromUser);
        if (byLid) return byLid;
    }

    // Strategi 4: semua participant @lid → resolve satu-satu → cocokkan botNumber
    for (const p of parts) {
        const idStr = p.id || p.jid || '';
        if (!idStr.includes('@lid')) continue;
        try {
            const resolved = resolveLidFromContacts(idStr);
            if (resolved?.number && resolved.number === botNumber) return p;
            if (resolved?.jid) {
                try {
                    if (areJidsSameUser(resolved.jid, botNumber + '@s.whatsapp.net')) return p;
                } catch (_) {}
            }
        } catch (_) {}
        // Coba via hisoka.contacts jika tersedia (injeksi global tidak ada, skip)
    }
    return null;
}

function findParticipantByLid(participants, botLid) {
    if (!botLid) return null;
    const lidNum = botLid.split('@')[0].split(':')[0];
    return (participants || []).find(p => {
        // Cek via id jika format @lid
        const idStr = p.id || p.jid || '';
        if (idStr.includes('@lid')) {
            try { if (areJidsSameUser(idStr, botLid)) return true; } catch (_) {}
            const pNum = idStr.split('@')[0].split(':')[0];
            if (pNum === lidNum) return true;
        }
        // Cek via field lid
        if (p.lid) {
            try { if (areJidsSameUser(p.lid, botLid)) return true; } catch (_) {}
            const pNum = p.lid.split('@')[0].split(':')[0];
            if (pNum === lidNum) return true;
        }
        return false;
    });
}

/**
 * Ambil semua mentionedJid dari pesan (semua lapisan contextInfo).
 */
function getMentionedJids(message) {
    try {
        const msg = message?.message;
        if (!msg) return [];
        const msgType = getContentType(msg);
        const candidates = [
            msg[msgType],
            msg.extendedTextMessage,
            msg.imageMessage,
            msg.videoMessage,
            msg.audioMessage,
            msg.documentMessage,
            msg.stickerMessage,
            msg.buttonsMessage,
            msg.listMessage,
            msg.templateMessage?.hydratedTemplate,
        ].filter(Boolean);
        const all = new Set();
        for (const obj of candidates) {
            const mentioned = obj?.contextInfo?.mentionedJid;
            if (Array.isArray(mentioned)) {
                for (const j of mentioned) { if (j) all.add(j); }
            }
        }
        return [...all];
    } catch (_) { return []; }
}

/**
 * Deteksi apakah pesan ini men-tag nomor bot.
 * Mendukung: @s.whatsapp.net, @lid (via botLid dan contacts), dan teks harfiah @nomor.
 * botLid: hisoka.user.lid — ambil SEBELUM memanggil fungsi ini.
 */
function isBotMentioned(message, botJid, botNumber, botLid) {
    try {
        const msg = message?.message;
        if (!msg) return false;

        const jids = getMentionedJids(message);
        const botLidNum = botLid ? botLid.split('@')[0].split(':')[0] : null;

        for (const jid of jids) {
            const jidNum = jid.split('@')[0].split(':')[0];

            // Cek via areJidsSameUser (phone JID)
            try { if (areJidsSameUser(jid, botJid)) return true; } catch (_) {}

            // Cek nomor telepon mentah (untuk @s.whatsapp.net)
            if (botNumber && !jid.includes('@lid') && jidNum === botNumber) return true;

            // Cek via botLid langsung (paling akurat untuk @lid)
            if (botLid && jid.includes('@lid')) {
                try { if (areJidsSameUser(jid, botLid)) return true; } catch (_) {}
                if (botLidNum && jidNum === botLidNum) return true;
            }

            // Cek resolve @lid → nomor telepon via contacts
            if (jid.includes('@lid')) {
                try {
                    const resolved = resolveLidFromContacts(jid);
                    if (resolved?.number && botNumber && resolved.number === botNumber) return true;
                    if (resolved?.jid) {
                        try { if (areJidsSameUser(resolved.jid, botJid)) return true; } catch (_) {}
                    }
                } catch (_) {}
            }
        }

        // Fallback: cek teks harfiah @nomor (untuk @s.whatsapp.net mentions)
        const textContent =
            msg?.conversation ||
            msg?.extendedTextMessage?.text ||
            msg?.imageMessage?.caption ||
            msg?.videoMessage?.caption ||
            msg?.documentMessage?.caption ||
            '';
        if (textContent && botNumber && textContent.includes(`@${botNumber}`)) return true;

    } catch (_) {}
    return false;
}

// ── Dedup cache: cegah proses pesan yang sama 2x ─────────────────────────────
const _processedMsgIds = new Set();

// ── Auto-handler: dipanggil dari message.js ──────────────────────────────────
export default async function handleAntiTagBot(message, hisoka) {
    try {
        // Hanya bot utama yang boleh jalankan antitag — jadibot skip
        if (hisoka?.isMainBot === false) return;

        if (!message?.key?.remoteJid) return;
        if (!message?.message) return;

        // Dedup: skip jika message ID ini sudah diproses
        const msgId = message.key?.id;
        if (msgId) {
            if (_processedMsgIds.has(msgId)) return;
            _processedMsgIds.add(msgId);
            if (_processedMsgIds.size > 500) {
                const first = _processedMsgIds.values().next().value;
                _processedMsgIds.delete(first);
            }
        }

        const remoteJid = message.key.remoteJid;
        if (!isJidGroup(remoteJid)) return;
        if (message.key?.fromMe) return;

        // Cek config aktif
        if (!isAntiTagBotEnabled()) return;

        // ── Early-exit: jika tidak ada mentionedJid sama sekali, skip ────────
        const allMentioned = getMentionedJids(message);
        if (allMentioned.length === 0) return;

        const botJid    = getBotJid(hisoka);
        const botNumber = getBotNumber(hisoka);
        // Ambil botLid dari hisoka.user.lid (tersedia di Baileys untuk @lid system)
        const botLidFromUser = getBotLid(hisoka);

        // Cek awal dengan botLid dari hisoka.user (paling akurat untuk @lid)
        const mentionedEarly = isBotMentioned(message, botJid, botNumber, botLidFromUser);

        const senderJid    = getSenderJid(message);
        const senderNumber = getSenderNumber(message);
        const senderName   = message.pushName || message.verifiedBizName || senderNumber;
        const config       = loadConfig();

        // ── Exempt: owner selalu aman ──────────────────────────────────────────
        if (isOwnerNumber(senderNumber, config)) return;

        // ── Fetch groupMeta untuk cek admin dan dapatkan botLid dari peserta ──
        let isAdmin = false;
        let groupMeta = null;
        let senderIsGroupAdmin = false;
        let botLidFromGroup = null;

        try {
            groupMeta = await hisoka.groupMetadata(remoteJid);
            if (groupMeta) hisoka.groups?.write(remoteJid, groupMeta);

            const parts = groupMeta?.participants || [];
            const botP  = findBotParticipant(parts, botNumber, botLidFromUser);

            isAdmin         = !!botP?.admin;
            botLidFromGroup = botP?.lid
                || (botP?.id?.includes('@lid') ? botP.id : null)
                || botLidFromUser || null;

            // Update KV cache
            const botAdminData = kvGet('botadmin/botadmin', {});
            botAdminData[remoteJid] = isAdmin;
            kvSet('botadmin/botadmin', botAdminData);

            // Cari sender
            const senderP = senderJid
                ? parts.find(p => {
                    try { return areJidsSameUser(p.id || p.jid || '', senderJid); } catch (_) { return false; }
                  }) || findParticipant(parts, senderNumber)
                : findParticipant(parts, senderNumber);
            senderIsGroupAdmin = !!senderP?.admin;

        } catch (_fetchErr) {
            const botAdminData = kvGet('botadmin/botadmin', {});
            if (remoteJid in botAdminData) isAdmin = botAdminData[remoteJid] === true;
            groupMeta = hisoka.groups?.read(remoteJid) || null;
            if (groupMeta) {
                const parts  = groupMeta?.participants || [];
                const botP   = findBotParticipant(parts, botNumber, botLidFromUser);
                isAdmin          = !!botP?.admin;
                botLidFromGroup  = botP?.lid || (botP?.id?.includes('@lid') ? botP.id : null) || botLidFromUser || null;
                const senderP    = senderJid
                    ? parts.find(p => { try { return areJidsSameUser(p.id || p.jid || '', senderJid); } catch (_) { return false; } })
                        || findParticipant(parts, senderNumber)
                    : findParticipant(parts, senderNumber);
                senderIsGroupAdmin = !!senderP?.admin;
            }
        }

        // ── Final mention check: gabung semua sumber botLid ───────────────────
        const effectiveBotLid = botLidFromGroup || botLidFromUser || null;
        const isMentioned = mentionedEarly || isBotMentioned(message, botJid, botNumber, effectiveBotLid);

        if (!isMentioned) return;

        // ── Exempt: admin grup — reply lucu tapi tidak hapus ──────────────────
        if (senderIsGroupAdmin) {
            console.log(`\x1b[33m[AntiTagBot] 🛡️  Admin: ${senderName} (+${senderNumber}) tag bot — aman\x1b[39m`);
            const adminMention = senderJid || (senderNumber + '@s.whatsapp.net');
            const adminReplies = [
                `@${senderNumber} *Oalah, admin yang tag bot?* 😂\nYa udah, kali ini aman. _Jangan keseringan ya_ 🙏`,
                `@${senderNumber} *Admin, ngapain tag aku?* 💀\nPesanmu aman dan tidak dihapus 🤣`,
                `@${senderNumber} *Admin tag bot?* 😭\nOke, kali ini aman. _Jangan diulang terus ya_ 😏`,
                `@${senderNumber} *Wkwk, admin kok tag bot?* 😆\nAman, pesannya tidak aku hapus 🫡`,
                `@${senderNumber} *Aduh, admin ketahuan tag bot* 😅\nUntung admin—pesanmu aman 😈`,
            ];
            const picked = adminReplies[Math.floor(Math.random() * adminReplies.length)];
            await hisoka.sendMessage(remoteJid, {
                text: picked,
                mentions: [adminMention],
            }, { quoted: message }).catch(() => {});
            return;
        }

        // ── Bot harus admin untuk bisa hapus ──────────────────────────────────
        if (!isAdmin) {
            console.log(`\x1b[33m[AntiTagBot] ⚠️  Bot bukan admin — skip hapus (${groupMeta?.subject || remoteJid.split('@')[0]})\x1b[39m`);
            return;
        }

        // ── Reply sebelum hapus — isi beda tergantung owner atau bukan ────────
        const isOwner = isOwnerNumber(senderNumber, config);
        const mention  = senderJid || (senderNumber + '@s.whatsapp.net');

        let replyText;
        if (isOwner) {
            replyText =
                `🚫 *ANTI-TAG BOT*\n\n` +
                `@${senderNumber} 👑\n` +
                `> Kamu owner bot, jadi pesanmu aman.\n\n` +
                `_Tolong jangan tag bot di grup, ya_ 🙏`;
        } else {
            replyText =
                `🚫 *ANTI-TAG BOT*\n\n` +
                `@${senderNumber} ⚠️\n` +
                `> Jangan tag bot di grup.\n\n` +
                `Pesanmu sudah dihapus otomatis.`;
        }

        await hisoka.sendMessage(remoteJid, {
            text: replyText,
            mentions: [mention],
        }, { quoted: message });

        // ── Hapus pesan ────────────────────────────────────────────────────────
        await hisoka.sendMessage(remoteJid, { delete: message.key });
        console.log(`\x1b[32m[AntiTagBot] ✅ ${senderName} (+${senderNumber}) tag bot → dihapus | Grup: ${groupMeta?.subject || remoteJid.split('@')[0]}\x1b[39m`);

    } catch (err) {
        console.error('\x1b[31m[AntiTagBot] Error:\x1b[39m', err?.message || err);
    }
}

async function sendAntitagSelection({ hisoka, m, Button, tolak, enabled }) {
    const prefix = m.prefix || '.';
    const statusText =
        `🚫 *ANTI-TAG BOT*\n\n` +
        `🔍 *Status:* ${enabled ? '✅ *ON*' : '❌ *OFF*'}\n` +
        `_Pesan anggota yang men-tag nomor bot di grup akan dihapus otomatis._\n\n` +
        `*Syarat:* Bot harus menjadi admin grup.\n` +
        `*Aman:* Owner bot dan admin grup.\n\n` +
        `_Pilih status melalui tombol di bawah._`;

    if (Button) {
        try {
            const button = new Button()
                .setBody(statusText)
                .setFooter('🛡️ Anti-Tag Bot')
                .addSelection('🎛️ Pilih Status')
                .makeSections('⚙️ Mode')
                .makeRow(
                    enabled ? '✓ ✅ Aktif' : '✅ Aktif',
                    'Aktifkan Anti-Tag Bot',
                    'Hapus otomatis pesan anggota yang men-tag nomor bot',
                    `${prefix}antitag on`
                )
                .makeRow(
                    enabled ? '❌ Nonaktif' : '✓ ❌ Nonaktif',
                    'Nonaktifkan Anti-Tag Bot',
                    'Matikan penghapusan otomatis tag nomor bot',
                    `${prefix}antitag off`
                );

            await button.run(m.from, hisoka, m);
            return;
        } catch (err) {
            console.warn('[AntiTagBot] Gagal mengirim single-select, gunakan fallback teks:', err?.message || err);
        }
    }

    await tolak(hisoka, m,
        `${statusText}\n\n` +
        `*Penggunaan:*\n` +
        `• \`${prefix}antitag on\` — aktifkan\n` +
        `• \`${prefix}antitag off\` — nonaktifkan`
    );
}

// ── Command handler: .antitag on/off ─────────────────────────────────────────
export async function handleAntitag({ hisoka, m, query, tolak, logCommand, Button }) {
    if (!m.isOwner) return;
    logCommand?.(m, 'antitag');

    const arg = (query || '').trim().toLowerCase();
    const cfg = loadConfig();

    if (!cfg.antiTagBot) cfg.antiTagBot = { enabled: false };
    const isOn = cfg.antiTagBot.enabled;

    if (!arg || arg === 'status') {
        await sendAntitagSelection({ hisoka, m, Button, tolak, enabled: isOn });
        return;
    }

    if (arg === 'on') {
        if (isOn) {
            await tolak(hisoka, m,
                `ℹ️ *ANTI-TAG BOT*\n\nFitur sudah dalam keadaan *ON*.`
            );
            return;
        }
        cfg.antiTagBot.enabled = true;
        saveConfig(cfg);
        await tolak(hisoka, m,
            `✅ *ANTI-TAG BOT AKTIF*\n\n` +
            `> Pesan anggota yang men-tag nomor bot akan dihapus otomatis.\n\n` +
            `🛡️ Owner dan admin grup tetap aman.`
        );
        return;
    }

    if (arg === 'off') {
        if (!isOn) {
            await tolak(hisoka, m,
                `ℹ️ *ANTI-TAG BOT*\n\nFitur sudah dalam keadaan *OFF*.`
            );
            return;
        }
        cfg.antiTagBot.enabled = false;
        saveConfig(cfg);
        await tolak(hisoka, m,
            `❌ *ANTI-TAG BOT NONAKTIF*\n\n` +
            `Fitur berhasil dimatikan.`
        );
        return;
    }

    await tolak(hisoka, m,
        `❓ *Perintah tidak dikenal.*\n\n` +
        `Gunakan salah satu:\n` +
        `• \`on\` — aktifkan fitur\n` +
        `• \`off\` — matikan fitur`
    );
}

/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const plugins = [
    { command: /^(antitag)$/i, tags: ['antitag'], help: ['antitag'], handler: 'handleAntitag' },
];
