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

function isOwnerNumber(num, config) {
    const owners = config.owners || [];
    return owners.some(o => String(o) === String(num));
}

function findParticipant(participants, targetNumber) {
    // Cari berdasarkan nomor telepon — cek semua field yang mungkin ada
    return (participants || []).find(p => {
        // phoneNumber field (explicit phone number, reliable)
        if (p.phoneNumber) {
            const pn = String(p.phoneNumber).split('@')[0].split(':')[0];
            if (pn === targetNumber) return true;
        }
        // id/jid field — hanya valid jika bukan @lid
        const idStr = p.id || p.jid || '';
        if (!idStr.includes('@lid')) {
            const pNum = idStr.split('@')[0].split(':')[0];
            if (pNum === targetNumber) return true;
        }
        return false;
    });
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

// ── Command handler: .antitag on/off ─────────────────────────────────────────
export async function handleAntitag({ hisoka, m, query, tolak, logCommand }) {
    if (!m.isOwner) return;
    logCommand?.(m, 'antitag');

    const arg = (query || '').trim().toLowerCase();
    const cfg = loadConfig();

    if (!cfg.antiTagBot) cfg.antiTagBot = { enabled: false };
    const isOn = cfg.antiTagBot.enabled;

    const STATUS_STR = isOn ? '✅ *ON*' : '❌ *OFF*';

    if (!arg || arg === 'status') {
        await tolak(hisoka, m,
            `🚫 *ANTI-TAG BOT*\n\n` +
            `🔍 *Status:* ${STATUS_STR}\n` +
            `_Pesan anggota yang men-tag nomor bot di grup akan dihapus otomatis._\n\n` +
            `*Syarat:*\n` +
            `• Bot harus menjadi *admin* grup.\n` +
            `• Fitur harus dalam keadaan *ON*.\n\n` +
            `*Aman, tidak dihapus:*\n` +
            `• Owner bot.\n` +
            `• Admin grup.\n\n` +
            `*Cara mengaktifkan:*\n` +
            `1. Jadikan bot sebagai admin grup.\n` +
            `2. Kirim \`.antitag on\`.\n\n` +
            `_Untuk menonaktifkan, kirim \`.antitag off\`._`
        );
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
