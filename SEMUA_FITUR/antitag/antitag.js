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
 *  antitag.js — Anti-Tag Bot dan @semua di Grup
 *  Hapus otomatis mention nomor bot dan tag hampir seluruh anggota grup.
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
        return true;
    } catch (err) {
        return false;
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

export function buildMassMentionReply({ status, senderName = 'anggota grup', senderParticipant = null }) {
    const senderPhone = getParticipantPhoneNumbers(senderParticipant)[0] || null;
    const senderMention = senderPhone ? `${senderPhone}@s.whatsapp.net` : null;
    const senderLabel = senderMention ? `@${senderPhone}` : `*${senderName}*`;
    const statusMessages = {
        deleted: [
            `🚨 Waduh, satu grup dipanggil semua—jempolmu lagi latihan maraton, ya? 😅\nMention seperlunya, biar notifikasi grup nggak ikut senam pagi. 🏃`,
            `💥 *DOR!* Pesan dihapus karena kamu manggil semua orang.\nJangan bikin HP orang lain bunyi terus, kasihan! 🫠`,
            `🧹 *Sat set sat set!* Pesan dibersihkan karena mass-mention.\nLain kali mention satu-satu aja ya, jangan dikeroyok! 🤣`,
            `📢 *Anti-Tag aktif!* Nggak usah panggil semua warga kalau cuma mau nanya hal sepele. 😤`
        ],
        owner: [
            `👑 Owner lolos razia—petugasnya masih nunggu gajian dari bos 😎`,
            `👑 Wih, owner nih! Silakan tag semua, bot nggak berani hapus. 🙇`,
            `👑 Bos besar lewat, jangan halangi! 🫡`
        ],
        groupAdmin: [
            `🛡️ Admin lolos dulu—badge-nya lagi kerja lembur hari ini 🤭`,
            `🛡️ Ampun, admin! Pesanmu aman, nggak aku hapus. 🫡`,
            `🛡️ Wah, ada admin grup. Silakan dilanjut, nggak aku sapu kok. 😂`
        ],
        botNotAdmin: [
            `🤖 Tangan bot belum sampai ke tombol hapus. Kasih akses admin dulu, baru bisa bantu bersih-bersih! 🧹`,
            `🤖 Yah, aku belum jadi admin. Jadi nggak bisa hapus pesanmu. *Jadikan admin dong!* 🥺`,
            `🤖 Tombol hapus aku terkunci karena aku bukan admin di grup ini. 🔓`
        ],
        botAdminUnknown: [
            `🕵️ Izin bot lagi main petak umpet—bot nggak mau asal sapu, nanti adminnya ikut 😅`,
            `🕵️ Status admin aku lagi *error*. Jadi aku diam dulu deh, ngeri salah hapus. 🤫`,
            `🕵️ Lagi nunggu laporan status admin dari server, sabar ya! ⏳`
        ],
        senderRoleUnknown: [
            `🧐 Status pengirimnya belum kebaca. Bot tahan sapu dulu—nggak mau salah bersih-bersih 😅`,
            `🧐 Siapa kamu? Statusnya nggak kebaca di sistem. Ya udah, aku loloskan kali ini. 🤣`,
            `🧐 Data pengirim lagi *loading*. Selamat, pesanmu aman! 🎊`
        ],
        deleteFailed: [
            `🧱 Bot sudah coba hapus, tapi tombol hapus lagi ngambek. WhatsApp yang menang ronde ini 🙃`,
            `🧱 Gagal hapus. Mungkin koneksi lagi *bad mood*. 🙄`,
            `🧱 Tombol hapus lagi *off duty*. Pesannya tetap di sana ya. 🙃`
        ],
    };
    const messages = statusMessages[status] || [];
    const details = messages[Math.floor(Math.random() * messages.length)] || `Status: ${status}`;

    return {
        text: `🚫 *ANTI-TAG BOT*\n\n${senderLabel}\n${details}`,
        ...(senderMention ? { mentions: [senderMention] } : {}),
    };
}

export async function sendMassMentionReply({ hisoka, remoteJid, message, msgId, status, senderName, senderParticipant }) {
    try {
        const reply = buildMassMentionReply({ status, senderName, senderParticipant });
        await hisoka.sendMessage(remoteJid, reply, { quoted: message });
        return true;
    } catch (replyErr) {
        return false;
    }
}

export function buildBotMentionReply({
    status,
    senderName = 'anggota grup',
    senderJid = null,
    senderParticipant = null,
}) {
    const senderPhone = getParticipantPhoneNumbers(senderParticipant)[0] || getPhoneNumber(senderJid);
    const senderMention = senderPhone ? `${senderPhone}@s.whatsapp.net` : null;
    const senderLabel = senderMention ? `@${senderPhone}` : `*${senderName}*`;
    const statusMessages = {
        botNotAdmin: [
            `🤖 Tangan bot belum sampai ke tombol hapus—kasih akses dulu, baru bisa bantu bersih-bersih 😅`,
            `🤖 Mau aku hapus, tapi statusku cuma member biasa. Jadikan aku admin dulu dong! 🥹`,
            `🤖 Akses ditolak sistem WhatsApp: Bot belum punya pangkat Admin. 🛡️`
        ],
        botAdminUnknown: [
            `🕵️ Izin bot lagi main petak umpet. Bot nggak mau asal hapus, nanti salah orang 😅`,
            `🕵️ Sinyal izin admin lagi *delay*, tahan dulu ya! ⏱️`
        ],
        deleted: [
            `📣 Bot disapa, bot langsung beres-beres—sat set! 😄 Jangan tag bot sembarangan, ya.`,
            `🧹 *HAP!* Pesan tag bot berhasil dimusnahkan. Kaget kan? 😜`,
            `🚫 Jangan colek-colek bot kalau nggak ada perlu penting. Pesan sudah dihapus ya! 🤫`,
            `⚡ *Zap!* Tag bot terdeteksi dan langsung dihilangkan dari muka bumi grup. 💨`
        ],
        deleteFailed: [
            `🧱 Tombol hapusnya lagi ngambek. Bot sudah coba, tapi WhatsApp yang menang ronde ini 🙃`,
            `🧱 Waduh, gagal dihapus. Mungkin jariku lagi kram. 😭`
        ],
    };
    const messages = statusMessages[status] || [];
    const details = messages[Math.floor(Math.random() * messages.length)] || `Status: ${status}`;

    return {
        text: `🚫 *ANTI-TAG BOT*\n\n${senderLabel}\n${details}`,
        ...(senderMention ? { mentions: [senderMention] } : {}),
    };
}

async function sendBotMentionPermissionReply({
    hisoka,
    remoteJid,
    message,
    msgId,
    status,
    senderName,
    senderJid,
    senderParticipant,
}) {
    try {
        await hisoka.sendMessage(remoteJid, buildBotMentionReply({
            status,
            senderName,
            senderJid,
            senderParticipant,
        }), { quoted: message });
    } catch (replyErr) {}
}

function getParticipantIdentityKey(participant) {
    const phoneNumber = getParticipantPhoneNumbers(participant)[0];
    if (phoneNumber) return `phone:${phoneNumber}`;

    const jid = [participant?.id, participant?.jid, participant?.lid].find(Boolean);
    if (!jid) return null;
    try { return `jid:${jidNormalizedUser(jid)}`; }
    catch (_) { return `jid:${String(jid)}`; }
}

export function isMassMention(mentionedJids, participants, senderParticipant = null) {
    const parts = Array.isArray(participants) ? participants : [];
    if (parts.length < 3 || !Array.isArray(mentionedJids) || mentionedJids.length < 2) return false;

    const senderKey = getParticipantIdentityKey(senderParticipant);
    const mentionableCount = parts.length - (senderKey ? 1 : 0);
    if (mentionableCount < 2) return false;

    const requiredCount = Math.max(2, Math.ceil(mentionableCount * 0.9));
    const mentionedKeys = new Set();

    for (const jid of mentionedJids) {
        const targets = getIdentityTargets([jid]);
        const participant = findParticipantByIdentity(parts, targets.jids, targets.numbers);
        const key = getParticipantIdentityKey(participant);
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

function findBotParticipant(participants, botNumber, botLidFromUser) {
    const parts = participants || [];

    const byPhone = findParticipant(parts, botNumber);
    if (byPhone) return byPhone;

    if (botLidFromUser) {
        const byLid = findParticipantByLid(parts, botLidFromUser);
        if (byLid) return byLid;
    }

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
    }
    return null;
}

function findParticipantByLid(participants, botLid) {
    if (!botLid) return null;
    const lidNum = botLid.split('@')[0].split(':')[0];
    return (participants || []).find(p => {
        const idStr = p.id || p.jid || '';
        if (idStr.includes('@lid')) {
            try { if (areJidsSameUser(idStr, botLid)) return true; } catch (_) {}
            const pNum = idStr.split('@')[0].split(':')[0];
            if (pNum === lidNum) return true;
        }
        if (p.lid) {
            try { if (areJidsSameUser(p.lid, botLid)) return true; } catch (_) {}
            const pNum = p.lid.split('@')[0].split(':')[0];
            if (pNum === lidNum) return true;
        }
        return false;
    });
}

const WRAPPED_MESSAGE_KEYS = [
    'ephemeralMessage',
    'viewOnceMessage',
    'documentWithCaptionMessage',
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension',
    'editedMessage',
    'associatedChildMessage',
    'groupStatusMessage',
    'groupStatusMessageV2',
    'groupStatusMentionMessage',
    'groupMentionedMessage',
];

function getMessageLayers(message) {
    const layers = [];
    let current = message?.message;

    for (let depth = 0; current && typeof current === 'object' && depth < 8; depth++) {
        layers.push(current);
        const wrapped = WRAPPED_MESSAGE_KEYS
            .map(key => current[key])
            .find(value => value?.message && typeof value.message === 'object');
        if (!wrapped || wrapped.message === current) break;
        current = wrapped.message;
    }

    return layers;
}

function getMessageContextInfos(message) {
    const contexts = [];
    for (const layer of getMessageLayers(message)) {
        if (layer?.contextInfo && typeof layer.contextInfo === 'object') {
            contexts.push(layer.contextInfo);
        }
        for (const value of Object.values(layer)) {
            if (value?.contextInfo && typeof value.contextInfo === 'object') {
                contexts.push(value.contextInfo);
            }
            if (value?.hydratedTemplate?.contextInfo) {
                contexts.push(value.hydratedTemplate.contextInfo);
            }
        }
    }
    return contexts;
}

function getMessageText(message) {
    const texts = [];
    for (const layer of getMessageLayers(message)) {
        if (typeof layer.conversation === 'string') texts.push(layer.conversation);
        for (const key of ['extendedTextMessage', 'imageMessage', 'videoMessage', 'documentMessage']) {
            const value = layer[key];
            const text = value?.text || value?.caption;
            if (typeof text === 'string') texts.push(text);
        }
    }
    return texts.join('\n');
}

export function hasAllMentionText(message) {
    return /@(semua|everyone|all)(?=$|[\s.,!?])/i.test(getMessageText(message));
}

export const hasMassMentionText = hasAllMentionText;

export function getMentionedJids(message) {
    const all = new Set();
    for (const context of getMessageContextInfos(message)) {
        if (!Array.isArray(context.mentionedJid)) continue;
        for (const jid of context.mentionedJid) {
            if (jid) all.add(jid);
        }
    }
    return [...all];
}

function areSameGroupJid(left, right) {
    if (!left || !right) return false;
    try {
        if (areJidsSameUser(left, right)) return true;
    } catch (_) {}
    try {
        return jidNormalizedUser(left) === jidNormalizedUser(right);
    } catch (_) {
        return String(left) === String(right);
    }
}

function getNativeGroupMentionInfo(message, remoteJid) {
    const layers = getMessageLayers(message);
    const hasNativeWrapper = layers.some(layer => !!layer?.groupMentionedMessage);
    const groupMentions = getMessageContextInfos(message)
        .flatMap(context => Array.isArray(context.groupMentions) ? context.groupMentions : [])
        .filter(groupMention => groupMention?.groupJid);
    const targetGroupJids = [...new Set(groupMentions.map(groupMention => String(groupMention.groupJid)))];
    const hasExplicitTargets = targetGroupJids.length > 0;
    const matchesCurrentGroup = targetGroupJids.some(groupJid => areSameGroupJid(groupJid, remoteJid));

    return {
        hasNativeWrapper,
        hasExplicitTargets,
        matchesCurrentGroup,
        targetGroupJids,
        hasSignal: hasNativeWrapper || hasExplicitTargets,
        detected: isJidGroup(remoteJid) && (
            (hasExplicitTargets && matchesCurrentGroup)
            || (!hasExplicitTargets && hasNativeWrapper)
        ),
    };
}

export function isNativeGroupMention(message, remoteJid) {
    return getNativeGroupMentionInfo(message, remoteJid).detected;
}

function isBotMentioned(message, botJid, botNumber, botLid) {
    try {
        const msg = message?.message;
        if (!msg) return false;

        const jids = getMentionedJids(message);
        const botLidNum = botLid ? botLid.split('@')[0].split(':')[0] : null;

        for (const jid of jids) {
            const jidNum = jid.split('@')[0].split(':')[0];

            try { if (areJidsSameUser(jid, botJid)) return true; } catch (_) {}

            if (botNumber && !jid.includes('@lid') && jidNum === botNumber) return true;

            if (botLid && jid.includes('@lid')) {
                try { if (areJidsSameUser(jid, botLid)) return true; } catch (_) {}
                if (botLidNum && jidNum === botLidNum) return true;
            }

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

const _processedMsgIds = new Set();

export default async function handleAntiTagBot(message, hisoka) {
    try {
        if (hisoka?.isMainBot === false) return;

        if (!message?.key?.remoteJid) return;
        if (!message?.message) return;

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

        const allMentioned = getMentionedJids(message);
        const nativeMentionInfo = getNativeGroupMentionInfo(message, remoteJid);
        const nativeGroupMention = nativeMentionInfo.detected;
        const massMentionText = hasMassMentionText(message);
        const textMassMention = massMentionText
            && (!nativeMentionInfo.hasExplicitTargets || nativeMentionInfo.matchesCurrentGroup);
        const possibleMassMention = nativeMentionInfo.hasSignal || massMentionText || allMentioned.length > 1;
        const config = loadConfig();
        const featureEnabled = !!config?.antiTagBot?.enabled;

        if (!featureEnabled) {
            return;
        }

        if (allMentioned.length === 0 && !nativeGroupMention && !textMassMention) return;

        const botJid    = getBotJid(hisoka);
        const botNumber = getBotNumber(hisoka);
        const botLidFromUser = getBotLid(hisoka);

        const mentionedEarly = isBotMentioned(message, botJid, botNumber, botLidFromUser);

        const senderJid    = getSenderJid(message);
        const senderNumber = getSenderNumber(message);
        const senderName   = message.pushName || message.verifiedBizName || senderNumber;
        const senderIdentity = getIdentityTargets([
            senderJid,
            message.key?.participant,
            message.participant,
        ]);

        let isAdmin = false;
        let botAdminKnown = false;
        let groupMeta = null;
        let groupMetaFresh = false;
        let senderIsGroupAdmin = false;
        let senderParticipant = null;
        let botLidFromGroup = null;

        try {
            groupMeta = await hisoka.groupMetadata(remoteJid);
            groupMetaFresh = !!groupMeta;
            if (groupMeta) hisoka.groups?.write(remoteJid, groupMeta);

            const parts = groupMeta?.participants || [];
            const botP  = findBotParticipant(parts, botNumber, botLidFromUser);

            botAdminKnown = !!botP;
            isAdmin         = !!botP?.admin;
            botLidFromGroup = botP?.lid
                || (botP?.id?.includes('@lid') ? botP.id : null)
                || botLidFromUser || null;

            if (botAdminKnown) {
                const botAdminData = kvGet('botadmin/botadmin', {});
                botAdminData[remoteJid] = isAdmin;
                kvSet('botadmin/botadmin', botAdminData);
            }

            senderParticipant = findParticipantByIdentity(parts, senderIdentity.jids, senderIdentity.numbers);
            senderIsGroupAdmin = isGroupAdmin(senderParticipant);

        } catch (_fetchErr) {
            const botAdminData = kvGet('botadmin/botadmin', {});
            if (remoteJid in botAdminData) {
                isAdmin = botAdminData[remoteJid] === true;
                botAdminKnown = true;
            }
            if (!groupMetaFresh) groupMeta = hisoka.groups?.read(remoteJid) || null;
            if (groupMeta) {
                const parts  = groupMeta?.participants || [];
                const botP   = findBotParticipant(parts, botNumber, botLidFromUser);
                if (botP) {
                    botAdminKnown = true;
                    isAdmin = !!botP.admin;
                    botLidFromGroup = botP?.lid || (botP?.id?.includes('@lid') ? botP.id : null) || botLidFromUser || null;
                }
                senderParticipant = findParticipantByIdentity(parts, senderIdentity.jids, senderIdentity.numbers);
                senderIsGroupAdmin = groupMetaFresh && isGroupAdmin(senderParticipant);
            }
        }

        const effectiveBotLid = botLidFromGroup || botLidFromUser || null;
        const isBotTagged = mentionedEarly || isBotMentioned(message, botJid, botNumber, effectiveBotLid);
        const isMassTagged = nativeGroupMention
            || textMassMention
            || isMassMention(allMentioned, groupMeta?.participants || [], senderParticipant);

        const isSenderLid = String(message.key?.participant || message.participant || '').includes('@lid');
        const senderOwnerCandidates = [
            ...senderIdentity.numbers,
            ...getParticipantPhoneNumbers(senderParticipant),
            ...(!isSenderLid ? [senderNumber] : []),
        ];
        const senderIsOwner = isOwnerNumber(senderOwnerCandidates, config);

        if (!isBotTagged && !isMassTagged) {
            return;
        }

        if (senderIsOwner) {
            if (isMassTagged) {
                await sendMassMentionReply({
                    hisoka, remoteJid, message, msgId, status: 'owner', senderName, senderParticipant,
                });
            } else if (isBotTagged) {
                const ownerMention = getParticipantPhoneNumbers(senderParticipant)[0];
                const mention = ownerMention ? `${ownerMention}@s.whatsapp.net` : senderJid;
                const ownerLabel = ownerMention ? `@${ownerMention}` : `*${senderName}*`;
                try {
                    await hisoka.sendMessage(remoteJid, {
                        text:
                            `🚫 *ANTI-TAG BOT*\n\n${ownerLabel} 👑\n` +
                            `> Mention bot terdeteksi dari owner bot.\n` +
                            `> Pesan tidak dihapus karena owner dikecualikan.\n\n` +
                            `😎 Owner dapat jalur VIP hari ini—jangan dipakai buat manggil bot tiap menit, ya.`,
                        ...(mention ? { mentions: [mention] } : {}),
                    }, { quoted: message });
                } catch (replyErr) {}
            }
            return;
        }

        if (senderIsGroupAdmin) {
            if (isMassTagged) {
                await sendMassMentionReply({
                    hisoka, remoteJid, message, msgId, status: 'groupAdmin', senderName, senderParticipant,
                });
                return;
            }
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

        if (!groupMetaFresh || !isAdmin || !botAdminKnown) {
            const botIsConfirmedNotAdmin = groupMetaFresh && botAdminKnown && !isAdmin;
            const replyStatus = botIsConfirmedNotAdmin ? 'botNotAdmin' : 'botAdminUnknown';
            if (isMassTagged) {
                await sendMassMentionReply({
                    hisoka, remoteJid, message, msgId, status: replyStatus, senderName, senderParticipant,
                });
            } else if (isBotTagged) {
                await sendBotMentionPermissionReply({
                    hisoka, remoteJid, message, msgId, status: replyStatus,
                    senderName, senderJid, senderParticipant,
                });
            }
            return;
        }

        if (isMassTagged && !senderParticipant) {
            await sendMassMentionReply({
                hisoka, remoteJid, message, msgId, status: 'senderRoleUnknown', senderName, senderParticipant,
            });
            return;
        }

        if (isMassTagged) {
            let deleted = false;
            try {
                await hisoka.sendMessage(remoteJid, { delete: message.key });
                deleted = true;
            } catch (deleteErr) {}

            await sendMassMentionReply({
                hisoka,
                remoteJid,
                message,
                msgId,
                status: deleted ? 'deleted' : 'deleteFailed',
                senderName,
                senderParticipant,
            });
            return;
        }

        let deleted = false;
        try {
            await hisoka.sendMessage(remoteJid, { delete: message.key });
            deleted = true;
        } catch (deleteErr) {}

        await hisoka.sendMessage(remoteJid, buildBotMentionReply({
            status: deleted ? 'deleted' : 'deleteFailed',
            senderName,
            senderJid,
            senderParticipant,
        }), { quoted: message });

    } catch (err) {}
}

export function isAntitagSelectionMenu(quoted, remoteJid) {
    const key = quoted?.key;
    if (!key?.id || key.fromMe !== true) return false;
    if (key.remoteJid && remoteJid && key.remoteJid !== remoteJid) return false;

    let serialized;
    try {
        serialized = JSON.stringify(quoted.raw || quoted.message || {});
    } catch (_) {
        return false;
    }

    return /\bANTI-TAG BOT\b/i.test(serialized)
        && /antitag\s+on/i.test(serialized)
        && /antitag\s+off/i.test(serialized);
}

export async function deletePreviousAntitagSelectionMenu({ hisoka, m }) {
    const remoteJid = m?.from || m?.key?.remoteJid;
    const quoted = m?.quoted;
    if (!remoteJid || !isAntitagSelectionMenu(quoted, remoteJid)) return false;

    try {
        await hisoka.sendMessage(remoteJid, { delete: quoted.key });
        return true;
    } catch (err) {
        return false;
    }
}

export async function sendAntitagSelection({ hisoka, m, Button, tolak, enabled, notice = '' }) {
    const prefix = m.prefix || '.';
    const statusText =
        `🚫 *ANTI-TAG BOT*\n\n` +
        `🔍 *Status:* ${enabled ? '✅ *ON*' : '❌ *OFF*'}\n` +
        (notice ? `${notice}\n\n` : '') +
        `_Tag bot dan @semua dari anggota biasa dihapus otomatis, lalu bot mengirim peringatan singkat._\n\n` +
        `*Syarat hapus:* Bot harus menjadi admin grup; jika belum, bot membalas bahwa pesan tidak terhapus.\n` +
        `*Aman:* Owner bot dan admin grup tidak dihapus, tetapi tetap mendapat balasan.\n\n` +
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
                    'Hapus tag bot dan @semua dari anggota biasa',
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
        } catch (err) {}
    }

    await tolak(hisoka, m,
        `${statusText}\n\n` +
        `*Penggunaan:*\n` +
        `• \`${prefix}antitag on\` — aktifkan\n` +
        `• \`${prefix}antitag off\` — nonaktifkan`
    );
}

export async function handleAntitag({
    hisoka,
    m,
    query,
    tolak,
    logCommand,
    Button,
    readConfig = loadConfig,
    writeConfig = saveConfig,
}) {
    if (!m.isOwner) {
        await tolak(hisoka, m, '❌ *Akses ditolak.*\n> Hanya owner bot yang bisa mengubah atau melihat pengaturan Anti-Tag Bot.');
        return;
    }
    logCommand?.(m, 'antitag');

    const arg = (query || '').trim().toLowerCase();
    const cfg = readConfig();

    if (!cfg.antiTagBot) cfg.antiTagBot = { enabled: false };
    const isOn = !!cfg.antiTagBot.enabled;
    const isSelectionCommand = !arg || arg === 'status' || arg === 'on' || arg === 'off';

    if (isSelectionCommand) {
        await deletePreviousAntitagSelectionMenu({ hisoka, m });
    }

    if (!arg || arg === 'status') {
        await sendAntitagSelection({ hisoka, m, Button, tolak, enabled: isOn });
        return;
    }

    if (arg === 'on') {
        if (isOn) {
            await sendAntitagSelection({
                hisoka, m, Button, tolak, enabled: true,
                notice: 'ℹ️ Fitur memang sudah dalam keadaan *ON*.',
            });
            return;
        }
        cfg.antiTagBot.enabled = true;
        if (writeConfig(cfg) === false) {
            await sendAntitagSelection({
                hisoka, m, Button, tolak, enabled: !!readConfig()?.antiTagBot?.enabled,
                notice: '❌ Pengaturan gagal disimpan. Status di atas menunjukkan keadaan yang tersimpan.',
            });
            return;
        }
        await sendAntitagSelection({
            hisoka, m, Button, tolak, enabled: true,
            notice: '✅ Anti-Tag Bot berhasil diaktifkan.',
        });
        return;
    }

    if (arg === 'off') {
        if (!isOn) {
            await sendAntitagSelection({
                hisoka, m, Button, tolak, enabled: false,
                notice: 'ℹ️ Fitur memang sudah dalam keadaan *OFF*.',
            });
            return;
        }
        cfg.antiTagBot.enabled = false;
        if (writeConfig(cfg) === false) {
            await sendAntitagSelection({
                hisoka, m, Button, tolak, enabled: !!readConfig()?.antiTagBot?.enabled,
                notice: '❌ Pengaturan gagal disimpan. Status di atas menunjukkan keadaan yang tersimpan.',
            });
            return;
        }
        await sendAntitagSelection({
            hisoka, m, Button, tolak, enabled: false,
            notice: '✅ Anti-Tag Bot berhasil dinonaktifkan.',
        });
        return;
    }

    await tolak(hisoka, m,
        `❓ *Perintah tidak dikenal.*\n\n` +
        `Gunakan salah satu:\n` +
        `• \`on\` — aktifkan fitur\n` +
        `• \`off\` — matikan fitur`
    );
}

export const plugins = [
    { command: /^(antitag)$/i, tags: ['antitag'], help: ['antitag'], handler: 'handleAntitag' },
];