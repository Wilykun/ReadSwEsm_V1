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
 *  inject.js — Inject properti & method ke message object
 *  Tambah m.isOwner, m.isQuoted, m.command, dll ke Baileys msg
 * ───────────────────────────────
 */
/**
 * ═══════════════════════════════════════════════════════════════
 *  Message Object Injector
 *  Inject properti & method tambahan ke object pesan Baileys:
 *  m.isOwner, m.isAdmin, m.isQuoted, m.command, m.reply, dll
 *  — menyederhanakan penulisan handler di seluruh codebase.
 * ═══════════════════════════════════════════════════════════════
 */
'use strict';

import {
        areJidsSameUser,
        generateWAMessageFromContent,
        getContentType,
        isJidGroup,
        isJidStatusBroadcast,
        isLidUser,
        jidDecode,
        jidNormalizedUser,
        downloadMediaMessage,
        generateMessageIDV2,
} from '@whiskeysockets/baileys';
import { isPnUser, safeGetPNForLID } from './socketCompat.js';
import fs from 'fs';
import path from 'path';

import { escapeRegExp, parseMention, parseMessage } from './utils.js';

function getOwners() {
        try {
                const configPath = path.join(process.cwd(), 'config.json');
                if (fs.existsSync(configPath)) {
                        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                        return config.owners || [];
                }
        } catch (err) {}
        return process.env.BOT_NUMBER_OWNER ? process.env.BOT_NUMBER_OWNER.split(',').filter(Boolean).map(x => x.trim()) : [];
}

export function injectClient(hisoka, cacheMsg, contacts, groups, settings) {
        hisoka.loadedCommands = [];
        hisoka.cacheMsg = cacheMsg;
        hisoka.mediaCacheAntidel = new Map();
        hisoka.contacts = contacts;
        hisoka.groups = groups;
        hisoka.settings = settings;

        hisoka.downloadMediaMessage = async message => {
                const type = getContentType(message.message);
                if (!type || !message.message[type]?.mimetype) {
                        throw new Error('No media found in message');
                }

                const media = await downloadMediaMessage(
                        message,
                        'buffer',
                        {},
                        {
                                logger: hisoka.logger,
                                reuploadRequest: hisoka.updateMediaMessage,
                        }
                );

                return media;
        };

        hisoka.getName = (jid, nameContact = false) => {
                jid = jidNormalizedUser(jid);

                if (!jid) return 'Unknown';

                if (isJidGroup(jid)) {
                        const group = groups.read(jid) || {};
                        if (group.subject) return group.subject;
                        // Fallback: cek cache grup bot utama (global) kalau jadibot belum punya
                        if (global.__mainBotGroups) {
                                try {
                                        const mainGroup = global.__mainBotGroups.read(jid);
                                        if (mainGroup?.subject) return mainGroup.subject;
                                } catch (_) {}
                        }
                        return jid.split('@')[0];
                }

                if (areJidsSameUser(jid, hisoka.user.id)) {
                        return hisoka.user.name;
                }

                const contact = contacts.find(c => areJidsSameUser(c.phoneNumber || c.id, jid));
                if (!contact) return jidDecode(jid).user;
                const originalName = contact.verifiedName || contact.notify;
                return (nameContact ? contact.name || originalName : originalName || contact.name) || jidDecode(jid).user;
        };

        hisoka.getEphemeral = async jid => {
                const contact = isJidGroup(jid) ? groups.read(jid) : contacts.read(jid);
                if (contact && typeof contact.ephemeralDuration === 'number') {
                        const data = {};
                        const ephemeralExpiration = contact?.ephemeralDuration;
                        const ephemeralSettingTimestamp = contact?.ephemeralSettingTimestamp;

                        if (typeof ephemeralExpiration === 'number') {
                                if (typeof ephemeralSettingTimestamp === 'number') {
                                        data.ephemeralSettingTimestamp = ephemeralSettingTimestamp;
                                }

                                data.ephemeralDuration = ephemeralExpiration;
                        }

                        return data;
                }

                if (typeof hisoka.fetchDisappearingDuration === 'function') {
                        const disappearing = await hisoka.fetchDisappearingDuration(jid).catch(() => null);
                        if (disappearing && disappearing.length && disappearing[0].disappearing_mode) {
                                const data = {
                                        ephemeralDuration: disappearing[0].disappearing_mode.duration,
                                        ephemeralSettingTimestamp: +new Date(disappearing[0].disappearing_mode.setAt) / 1000,
                                };

                                hisoka.contacts.write(jid, { ...contact, ...data });

                                return data;
                        }
                }

                return { ephemeralDuration: 0 };
        };

        hisoka.messageModify = async (jid, message, options = {}) => {
                const copyMessage = { ...message };

                let mtype = getContentType(message.message);
                let content = message.message[mtype];

                if (typeof options.text === 'string' || typeof options.text === 'number') {
                        if (mtype == 'extendedTextMessage') copyMessage.message[mtype].text = options.text ?? content.text;
                        else if (mtype == 'productMessage') copyMessage.message[mtype].body = options.text ?? content.body;
                        else if (mtype == 'listMessage') copyMessage.message[mtype].title = options.text ?? content.title;
                        else if (mtype == 'locationMessage') copyMessage.message[mtype].name = options.text ?? content.name;
                        else if (mtype == 'conversation') {
                                mtype = 'extendedTextMessage';
                                copyMessage.message[mtype] = { text: options.text };
                                delete copyMessage.message.conversation;
                        } else copyMessage.message[mtype].caption = options.text ?? content?.caption;
                }

                if (options.mentions || options.contextInfo) {
                        if (options?.mentions) {
                                let mentionedJid = [];
                                let groupMentions = [];

                                if (typeof options.mentions === 'string') {
                                        if (isJidGroup(options.mentions)) options.mentions = [options.mentions];
                                        else options.mentions = [options.mentions];
                                }

                                if (typeof options.mentions === 'boolean' && options.mentions) {
                                        options.mentions = parseMention(options.text || options.caption);
                                }

                                if (Array.isArray(options.mentions)) {
                                        options.mentions = options.mentions.map(v => {
                                                if (typeof v === 'object') {
                                                        const groupJid = v.id || v.groupJid;
                                                        if (isJidGroup(groupJid)) {
                                                                const groupSubject = v.name || v.groupSubject || hisoka.getName(groupJid);
                                                                groupMentions.push({ groupJid, groupSubject });
                                                        } else {
                                                                mentionedJid.push(groupJid);
                                                        }
                                                }

                                                if (typeof v === 'string' || typeof v === 'number') {
                                                        if (isJidGroup(v)) {
                                                                groupMentions.push({ groupJid: v, groupSubject: hisoka.getName(v) });
                                                        }

                                                        if (isPnUser(v)) mentionedJid.push(v);
                                                }
                                        });
                                }

                                delete options.mentions;

                                copyMessage.message[mtype].contextInfo = {
                                        ...(copyMessage.message[mtype]?.contextInfo || {}),
                                        mentionedJid,
                                        groupMentions,
                                };
                        }

                        if (typeof options?.contextInfo === 'object') {
                                copyMessage.message[mtype].contextInfo = {
                                        ...(copyMessage.message[mtype]?.contextInfo || {}),
                                        ...options.contextInfo,
                                };
                        }
                }

                const ephemeral = await hisoka.getEphemeral(jid);
                if (typeof ephemeral.ephemeralDuration === 'number') {
                        const data = {};
                        const ephemeralExpiration = options.ephemeralExpiration || ephemeral.ephemeralDuration;
                        const ephemeralSettingTimestamp = options.ephemeralSettingTimestamp || ephemeral.ephemeralSettingTimestamp;

                        if (typeof ephemeralExpiration === 'number') {
                                if (typeof ephemeralSettingTimestamp === 'number') {
                                        data.ephemeralSettingTimestamp = ephemeralSettingTimestamp;
                                }

                                data.expiration = ephemeralExpiration;
                        }

                        copyMessage.message[mtype].contextInfo = {
                                ...(copyMessage.message[mtype]?.contextInfo || {}),
                                ...data,
                        };
                }

                const messageContent = generateWAMessageFromContent(jid, copyMessage.message, options);
                const participant = options?.userJid || copyMessage.key.participant || copyMessage.participant || jid;

                messageContent.messageTimestamp = messageContent.messageTimestamp || Math.floor(Date.now() / 1000);
                messageContent.participant = participant;
                messageContent.isBot = false;

                messageContent.key = messageContent.key;
                messageContent.key.id = generateMessageIDV2(hisoka.user.id);
                messageContent.key.remoteJid = jid || copyMessage.key.remoteJid;
                if (isJidGroup(jid) || isJidStatusBroadcast(jid)) {
                        messageContent.key.participant = participant;
                }
                messageContent.key.fromMe = areJidsSameUser(participant, hisoka.user.id);

                return messageContent;
        };

        hisoka.resolveLidToPN = async key => {
                if (!key) return jidNormalizedUser(hisoka.user.id);
                if (key.fromMe) {
                        return jidNormalizedUser(hisoka.user.id);
                }

                if (isLidUser(key.remoteJid)) {
                        return jidNormalizedUser(
                                key.remoteJidAlt || (await safeGetPNForLID(hisoka, key.remoteJid)) || key.remoteJid
                        );
                }

                if (isJidGroup(key.remoteJid)) {
                        const jid = jidNormalizedUser(
                                key.participantAlt ||
                                        (await safeGetPNForLID(hisoka, key.participant)) ||
                                        key.participant
                        );

                        if (isLidUser(jid)) {
                                let group = await groups.read(key.remoteJid);
                                if (!group) {
                                        group = await hisoka.groupMetadata(key.remoteJid).catch(() => null);
                                }

                                if (!group || !group.participants.length) return jid;

                                await groups.write(key.remoteJid, group);

                                const participant = group.participants.find(p => areJidsSameUser(p.lid, jid) || areJidsSameUser(p.id, jid));

                                if (!participant) return jid;

                                return jidNormalizedUser(participant.phoneNumber || participant.id);
                        }

                        return jid;
                }

                if (isLidUser(key.participant)) {
                        return jidNormalizedUser(
                                key.participantAlt ||
                                        (await safeGetPNForLID(hisoka, key.participant)) ||
                                        key.remoteJid
                        );
                }

                return jidNormalizedUser(isJidStatusBroadcast(key.remoteJid) ? key.participant : key.remoteJid);
        };

        // Set untuk track ID pesan yang dikirim bot sendiri (bukan dari WA Web user)
        if (!hisoka._botSentIds) {
                hisoka._botSentIds = new Set();
        }

        const relayMessage = hisoka.relayMessage;
        hisoka.relayMessage = async (jid, message, options = {}) => {
                const messageId = options.messageId || generateMessageIDV2(hisoka.user.id);
                // Catat ID ini sebagai pesan yang dikirim bot — bukan WA Web user
                hisoka._botSentIds.add(messageId);
                // Bersihkan setelah 2 menit agar tidak bocor memori
                setTimeout(() => hisoka._botSentIds.delete(messageId), 120000);
                return relayMessage.call(hisoka, jid, message, { ...options, messageId });
        };

        return hisoka;
}

export async function injectMessage(hisoka, WAMessage) {
        const copyMessage = { ...WAMessage };

        if (!WAMessage.message) return copyMessage;

        await injectStartMessage(hisoka, copyMessage);

        const from = isLidUser(copyMessage.key.remoteJid) ? copyMessage.key.remoteJidAlt : copyMessage.key.remoteJid;
        const getText = (content = {}, message = {}) => {
                if (content.nativeFlowResponseMessage?.paramsJson) {
                        try {
                                const nfp = JSON.parse(content.nativeFlowResponseMessage.paramsJson);
                                if (nfp?.id) return nfp.id;
                        } catch (_) {}
                }
                return (
                        content.text ||
                        content.conversation ||
                        content.caption ||
                        content.selectedButtonId ||
                        content.singleSelectReply?.selectedRowId ||
                        content.selectedId ||
                        content.contentText ||
                        content.selectedDisplayText ||
                        content.title ||
                        content.name ||
                        message.conversation ||
                        ''
                );
        };

        copyMessage.message = parseMessage(WAMessage.message);
        copyMessage.type = getContentType(copyMessage.message) || getContentType(WAMessage.message) || 'conversation';

        Object.defineProperty(copyMessage, 'content', {
                value: copyMessage.message[copyMessage.type] || WAMessage.message[getContentType(WAMessage.message)] || {},
                enumerable: false,
                writable: false,
        });

        Object.defineProperty(copyMessage, 'text', {
                value: getText(copyMessage.content, WAMessage.message).trim(),
                enumerable: false,
                writable: false,
        });

        Object.defineProperty(copyMessage, 'raw', {
                value: WAMessage.message,
                enumerable: false,
                writable: false,
        });

        copyMessage.isMedia = !!copyMessage.content.mimetype || !!copyMessage.content.thumbnailDirectPath;

        await injectEndMessage(hisoka, copyMessage);

        const quotedID = copyMessage.content?.contextInfo?.stanzaId;
        if (quotedID) {
                copyMessage.isQuoted = true;

                const cacheMsg = hisoka.cacheMsg.get(quotedID);
                if (cacheMsg) {
                        copyMessage.quoted = await injectMessage(hisoka, cacheMsg);
                } else {
                        copyMessage.quoted = {};

                        const participant = jidNormalizedUser(copyMessage.content.contextInfo.participant);
                        const botLidRaw = hisoka.user?.lid || '';
                        const botLidNum = botLidRaw.split('@')[0].split(':')[0];
                        const participantNum = participant.split('@')[0].split(':')[0];
                        const isFromMe = areJidsSameUser(participant, hisoka.user.id) ||
                                (botLidNum && participantNum === botLidNum);
                        copyMessage.quoted.key = {
                                remoteJid: from,
                                fromMe: isFromMe,
                                id: quotedID,
                        };

                        if (isJidGroup(from) && participant) copyMessage.quoted.key.participant = participant;

                        await injectStartMessage(hisoka, copyMessage.quoted);

                        copyMessage.quoted.message =
                                parseMessage(copyMessage.content.contextInfo.quotedMessage) ||
                                copyMessage.content.contextInfo.quotedMessage ||
                                {};
                        copyMessage.quoted.type = getContentType(copyMessage.quoted.message) || 'conversation';

                        Object.defineProperty(copyMessage.quoted, 'content', {
                                value: copyMessage.quoted.message[copyMessage.quoted.type] || {},
                                enumerable: false,
                                writable: false,
                        });

                        Object.defineProperty(copyMessage.quoted, 'text', {
                                value: getText(copyMessage.quoted.content, copyMessage.quoted.message).trim(),
                                enumerable: false,
                                writable: false,
                        });

                        Object.defineProperty(copyMessage.quoted, 'raw', {
                                value: copyMessage.content.contextInfo.quotedMessage || {},
                                enumerable: false,
                                writable: false,
                        });

                        copyMessage.quoted.isMedia =
                                !!copyMessage.quoted.content.mimetype || !!copyMessage.quoted.content.thumbnailDirectPath;

                        await injectEndMessage(hisoka, copyMessage.quoted);
                }
        } else {
                copyMessage.isQuoted = false;
                copyMessage.quoted = null;
        }

        return copyMessage;
}

async function injectStartMessage(hisoka, WAMessage) {
        if (WAMessage.key) {
                const from = isLidUser(WAMessage.key.remoteJid) ? WAMessage.key.remoteJidAlt : WAMessage.key.remoteJid;
                let sender = await hisoka.resolveLidToPN(WAMessage.key);

                // Kalau sender masih LID (resolusi gagal), cari di contacts store
                if (isLidUser(sender) && hisoka.contacts) {
                        const contact = hisoka.contacts.find(c => areJidsSameUser(c.id, sender));
                        if (contact?.phoneNumber) sender = jidNormalizedUser(contact.phoneNumber);
                }

                const isGroup = isJidGroup(from);

                if (isGroup) {
                        const group = hisoka.groups.read(from);
                        const admins = group?.participants?.filter(v => v.admin) || [];

                        // Cari nama grup: cache lokal → cache bot utama → getName
                        const _groupSubject = group?.subject
                                || global.__mainBotGroups?.read?.(from)?.subject
                                || (typeof hisoka.getName === 'function' ? hisoka.getName(from) : null)
                                || null;

                        Object.defineProperties(WAMessage, {
                                isGroupAdmin: {
                                        value: admins.some(v => areJidsSameUser(v.phoneNumber || v.id, sender)),
                                        enumerable: false,
                                        writable: false,
                                },
                                isGroupBotAdmin: {
                                        value: admins.some(v => areJidsSameUser(v.phoneNumber || v.id, hisoka.user.id)),
                                        enumerable: false,
                                        writable: false,
                                },
                                isGroupSuperAdmin: {
                                        value: admins.some(v => v.admin === 'superadmin' && areJidsSameUser(v.phoneNumber || v.id, sender)),
                                        enumerable: false,
                                        writable: false,
                                },
                                groupSubject: {
                                        value: _groupSubject,
                                        enumerable: false,
                                        writable: true,
                                },
                        });
                }

                Object.defineProperties(WAMessage, {
                        from: { value: from, enumerable: false, writable: false },
                        sender: { value: sender, enumerable: false, writable: false },
                        isPrivate: { value: isPnUser(from) || isLidUser(from), enumerable: false, writable: false },
                        isGroup: { value: isGroup, enumerable: false, writable: false },
                        status: { value: isJidStatusBroadcast(from), enumerable: false, writable: false },
                        isBot: {
                                // Cek apakah ID ini ada di Set pesan yang dikirim bot sendiri
                                // Ini membedakan reply bot (diblokir) vs command WA Web user (diproses)
                                // WA Web juga generate ID 3EB0... jadi tidak bisa pakai startsWith saja
                                value: WAMessage.key.fromMe && hisoka._botSentIds?.has(WAMessage.key.id),
                                enumerable: false,
                                writable: false,
                        },
                        pushName: {
                                value: WAMessage.pushName || hisoka.getName(sender),
                                enumerable: false,
                                writable: false,
                        },
                });

                WAMessage.key.fromMe = areJidsSameUser(sender, hisoka.user.id) || WAMessage.key.fromMe;

                const owners = getOwners();
                const _senderNum = parseInt(String(sender).split('@')[0].split(':')[0]);
                const _isInOwnerList = owners.map(x => parseInt(x)).includes(_senderNum);

                // isRealOwner — cek daftar owners di config.json + bot sendiri (JID sama)
                // Tidak termasuk fromMe generik — murni untuk cek hak akses command
                // areJidsSameUser disertakan supaya bot sendiri selalu dikenali meski LID belum resolve
                Object.defineProperty(WAMessage, 'isRealOwner', {
                        value: _isInOwnerList || areJidsSameUser(sender, hisoka.user.id),
                        enumerable: false,
                        writable: false,
                });

                // isOwner — kompatibel dengan kode lama (owner config + fromMe + bot sendiri)
                // Dipakai untuk fitur lain yang butuh cek lebih luas
                Object.defineProperty(WAMessage, 'isOwner', {
                        value:
                                _isInOwnerList ||
                                WAMessage.key.fromMe ||
                                areJidsSameUser(sender, hisoka.user.id),
                        enumerable: false,
                        writable: false,
                });
        }

        return WAMessage;
}

async function injectEndMessage(hisoka, WAMessage) {
        const groupMentions = WAMessage.content?.contextInfo?.groupMentions?.map(v => v.groupJid) || [];
        const contactMentions = WAMessage.content?.contextInfo?.mentionedJid || [];
        const statusMentions = WAMessage.statusMentions || WAMessage.statusMentionSources || [];
        const mentions = await Promise.all(
                Array.from(new Set([...groupMentions, ...contactMentions, ...statusMentions])).map(mention => {
                        if (isLidUser(mention)) {
                                return hisoka.resolveLidToPN({ remoteJid: WAMessage.from, participant: mention }).catch(() => null);
                        } else {
                                return mention;
                        }
                })
        );

        WAMessage.mentions = mentions.map(jidNormalizedUser).filter(Boolean);

        const regPrefix = new RegExp(`^${process.env.BOT_PREFIX || '!'}`);
        const prefix = regPrefix.test(WAMessage.text) ? WAMessage.text.match(regPrefix)[0] : '';
        const afterPrefix = WAMessage.text.replace(regPrefix, '').trim().split(/ +/)[0];
        const allowNoPrefix = process.env.BOT_ALLOWED_NO_PREFIX === 'true' && !prefix;
        const hasExtraWords = WAMessage.text.trim().includes(' ');
        // Cache Set di hisoka untuk lookup O(1) — jauh lebih cepat dari O(n) regex scan per pesan
        if (!hisoka._commandSet || hisoka._commandSetSize !== hisoka.loadedCommands.length) {
                hisoka._commandSet = new Set(hisoka.loadedCommands.map(c => c.toLowerCase()));
                hisoka._commandSetSize = hisoka.loadedCommands.length;
        }
        const _cmdMatch = hisoka._commandSet.has(afterPrefix.toLowerCase());
        // ── Fitur Alias: typo command → cari yang paling mirip ──
        // Jika exact match gagal, coba fuzzy matching sebelum m.command di-set kosong.
        let _fuzzyInfo = null;
        if (!_cmdMatch && afterPrefix.length >= 2 && !!prefix) {
                try {
                        const { findTopMatches } = await import('../../SEMUA_FITUR/helper/cmdalias.js');
                        const _list = findTopMatches(afterPrefix, hisoka.loadedCommands, 10, 40);
                        if (_list.length) _fuzzyInfo = { typed: afterPrefix.toLowerCase(), matches: _list };
                } catch (_) {}
        }
        const _effectiveCmdMatch = _cmdMatch || !!_fuzzyInfo;
        // Prefix tetap wajib kecuali command tanpa prefix memang diizinkan.
        // Saat mode no-prefix aktif, batasi ke nama command yang valid dan
        // satu token saja agar teks percakapan biasa tidak ikut diproses.
        const isCommand = _effectiveCmdMatch && (!!prefix || (allowNoPrefix && !hasExtraWords));
        const query = isCommand
                ? WAMessage.text.replace(regPrefix, '').replace(afterPrefix, '').trim()
                : WAMessage.text.trim();

        Object.defineProperties(WAMessage, {
                prefix: { value: prefix, enumerable: false, writable: false },
                command: { value: isCommand ? (_fuzzyInfo ? _fuzzyInfo.matched : afterPrefix.toLowerCase()) : '', enumerable: false, writable: false },
                query: { value: query, enumerable: false, writable: false },
                // Info fuzzy untuk pesan "Maksudnya...?" di message.js
                fuzzyInfo: { value: _fuzzyInfo, enumerable: false, writable: false },
        });

        WAMessage.downloadMedia = async () => await hisoka.downloadMediaMessage(WAMessage);

        WAMessage.reply = async (text, options = {}) => {
                const toJid = options.toJid || WAMessage.from;
                const ephemeral = await hisoka.getEphemeral(toJid);

                let messagePayload;
                if (typeof text === 'string') {
                        messagePayload = {
                                text,
                                ...options,
                        };
                } else {
                        messagePayload = { ...text, ...options };
                }

                return hisoka.sendMessage(
                        toJid,
                        messagePayload,
                        {
                                quoted: WAMessage,
                                ephemeralExpiration: WAMessage.content?.contextInfo?.expiration || ephemeral.expiration,
                                ...options,
                        }
                );
        };

        WAMessage.throw = async (text, params = {}) => {
                text = text
                        .replace(/{name}/g, params.name || WAMessage.pushName)
                        .replace(/{prefix}/g, params.prefix || WAMessage.prefix)
                        .replace(/{cmd}/g, params.cmd || WAMessage.command);

                return WAMessage.reply(text);
        };

        return WAMessage;
}
