import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildBotMentionReply,
    buildMassMentionReply,
    deletePreviousAntitagSelectionMenu,
    findParticipantByIdentity,
    getMentionedJids,
    hasAllMentionText,
    handleAntitag,
    isAntitagSelectionMenu,
    isGroupAdmin,
    isMassMention,
    isNativeGroupMention,
    sendAntitagSelection,
    sendMassMentionReply,
} from '../SEMUA_FITUR/group/antitag.js';

function makeParticipants(count) {
    return Array.from({ length: count }, (_, index) => ({
        id: `${628100000000 + index}@s.whatsapp.net`,
    }));
}

test('a member mentioning at least 90% of the other group participants is mass-tagging', () => {
    const participants = makeParticipants(10);
    assert.equal(
        isMassMention(
            participants.slice(1).map(participant => participant.id),
            participants,
            participants[0],
        ),
        true,
    );
});

test('ordinary mentions do not count as mass-tagging', () => {
    const participants = makeParticipants(10);
    assert.equal(
        isMassMention(
            participants.slice(1, 3).map(participant => participant.id),
            participants,
            participants[0],
        ),
        false,
    );
});

test('the sender is excluded from the mass-mention threshold', () => {
    const participants = makeParticipants(4);
    assert.equal(
        isMassMention(
            participants.map(participant => participant.id),
            participants,
            participants[0],
        ),
        true,
    );
});

test('participant lookup matches phoneNumber when the participant id is a LID', () => {
    const admin = {
        id: '551234567@lid',
        phoneNumber: '628123456789@s.whatsapp.net',
        admin: 'superadmin',
    };
    assert.equal(
        findParticipantByIdentity(
            [admin],
            ['628123456789@s.whatsapp.net'],
            ['628123456789'],
        ),
        admin,
    );
    assert.equal(isGroupAdmin(admin), true);
    assert.equal(isGroupAdmin({ id: '628111@s.whatsapp.net' }), false);
});

test('native @semua inside groupMentionedMessage is detected without individual JIDs', () => {
    const groupJid = '120363000000000000@g.us';
    const message = {
        key: { remoteJid: groupJid, id: 'native-all-1' },
        message: {
            groupMentionedMessage: {
                message: {
                    extendedTextMessage: {
                        text: '@semua',
                        contextInfo: {
                            groupMentions: [{ groupJid, groupSubject: 'Test Group' }],
                        },
                    },
                },
            },
        },
    };

    assert.equal(getMentionedJids(message).length, 0);
    assert.equal(isNativeGroupMention(message, groupJid), true);
    assert.equal(isNativeGroupMention(message, '120363999999999999@g.us'), false);
});

test('mentions nested under groupMentionedMessage are still extracted', () => {
    const message = {
        message: {
            groupMentionedMessage: {
                message: {
                    extendedTextMessage: {
                        text: '@member',
                        contextInfo: { mentionedJid: ['628123456789@s.whatsapp.net'] },
                    },
                },
            },
        },
    };

    assert.deepEqual(getMentionedJids(message), ['628123456789@s.whatsapp.net']);
});

test('groupMentions targeting the current group are detected without the wrapper', () => {
    const groupJid = '120363000000000000@g.us';
    const message = {
        key: { remoteJid: groupJid },
        message: {
            extendedTextMessage: {
                text: '@semua',
                contextInfo: { groupMentions: [{ groupJid }] },
            },
        },
    };

    assert.equal(isNativeGroupMention(message, groupJid), true);
});

test('only explicit all-mention text is classified as an @semua candidate', () => {
    assert.equal(hasAllMentionText({ message: { conversation: '@semua' } }), true);
    assert.equal(
        hasAllMentionText({
            message: {
                groupMentionedMessage: {
                    message: { extendedTextMessage: { text: '@everyone' } },
                },
            },
        }),
        true,
    );
    assert.equal(hasAllMentionText({ message: { conversation: 'Halo semua' } }), false);
});

test('deleted mass-mention reply confirms deletion and mentions the sender by phone JID', () => {
    const reply = buildMassMentionReply({
        status: 'deleted',
        senderName: 'Agan',
        senderParticipant: {
            id: '551234567@lid',
            phoneNumber: '628123456789@s.whatsapp.net',
        },
    });

    assert.match(reply.text, /@semua\/mass-mention terdeteksi/);
    assert.match(reply.text, /Pesanmu sudah dihapus otomatis/);
    assert.match(reply.text, /jempolmu lagi latihan maraton/);
    assert.match(reply.text, /🧹|😅/);
    assert.deepEqual(reply.mentions, ['628123456789@s.whatsapp.net']);
});

test('group admin and bot owner receive an explanation without claiming their message was deleted', () => {
    for (const [status, emoji] of [['owner', '👑'], ['groupAdmin', '🛡️']]) {
        const reply = buildMassMentionReply({ status, senderName: 'Admin' });
        assert.match(reply.text, /tidak dihapus/);
        assert.doesNotMatch(reply.text, /sudah dihapus otomatis/);
        assert.ok(reply.text.includes(emoji), `${status} reply should use a contextual emoji`);
        assert.match(reply.text, /lolos/);
    }
});

test('bot permission, uncertain roles, and delete failure each get an accurate response', () => {
    const notAdmin = buildMassMentionReply({ status: 'botNotAdmin', senderName: 'Member' });
    assert.match(notAdmin.text, /bot bukan admin grup/);
    assert.match(notAdmin.text, /Jadikan bot admin/);
    assert.match(notAdmin.text, /pesan tidak dihapus/);
    assert.match(notAdmin.text, /🤖/);
    assert.match(notAdmin.text, /Tangan bot belum sampai/);

    const unknown = buildMassMentionReply({ status: 'botAdminUnknown', senderName: 'Member' });
    assert.match(unknown.text, /status admin bot tidak dapat dipastikan/);
    assert.match(unknown.text, /Pesan tidak dihapus/);
    assert.match(unknown.text, /🕵️/);

    const roleUnknown = buildMassMentionReply({ status: 'senderRoleUnknown', senderName: 'Member' });
    assert.match(roleUnknown.text, /peran pengirim tidak dapat dipastikan/);
    assert.match(roleUnknown.text, /Pesan tidak dihapus/);
    assert.match(roleUnknown.text, /🧐/);

    const failedDelete = buildMassMentionReply({ status: 'deleteFailed', senderName: 'Member' });
    assert.match(failedDelete.text, /WhatsApp menolak penghapusan/);
    assert.match(failedDelete.text, /Pesan mungkin masih terlihat/);
    assert.match(failedDelete.text, /🧱/);
});

test('direct bot-mention replies are funny but distinguish successful and failed deletion', () => {
    const deleted = buildBotMentionReply({
        status: 'deleted',
        senderJid: '628123456789@s.whatsapp.net',
    });
    assert.match(deleted.text, /Pesanmu sudah dihapus otomatis/);
    assert.match(deleted.text, /sat set/);
    assert.deepEqual(deleted.mentions, ['628123456789@s.whatsapp.net']);

    const failed = buildBotMentionReply({
        status: 'deleteFailed',
        senderName: 'Member',
    });
    assert.match(failed.text, /WhatsApp menolak penghapusan/);
    assert.match(failed.text, /Pesan mungkin masih terlihat/);
    assert.doesNotMatch(failed.text, /sudah dihapus otomatis/);

    const notAdmin = buildBotMentionReply({ status: 'botNotAdmin', senderName: 'Member' });
    assert.match(notAdmin.text, /bot bukan admin grup/);
    assert.match(notAdmin.text, /😅/);
});

test('mass-mention status reply quotes the original group message', async () => {
    const calls = [];
    const message = { key: { remoteJid: '120363000000000000@g.us', id: 'all-mention-1' } };
    const sent = await sendMassMentionReply({
        hisoka: {
            async sendMessage(...args) {
                calls.push(args);
                return {};
            },
        },
        remoteJid: message.key.remoteJid,
        message,
        msgId: message.key.id,
        status: 'botNotAdmin',
        senderName: 'Member',
        senderParticipant: null,
    });

    assert.equal(sent, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], message.key.remoteJid);
    assert.match(calls[0][1].text, /bot bukan admin grup/);
    assert.deepEqual(calls[0][2], { quoted: message });
});

test('failed reply sends return false instead of throwing from the handler', async () => {
    const sent = await sendMassMentionReply({
        hisoka: { async sendMessage() { throw new Error('offline'); } },
        remoteJid: '120363000000000000@g.us',
        message: { key: { id: 'failed-reply' } },
        msgId: 'failed-reply',
        status: 'deleted',
        senderName: 'Member',
        senderParticipant: null,
    });
    assert.equal(sent, false);
});

function makeAntitagMenuMessage(groupJid = '120363000000000000@g.us') {
    const buttons = [{
        name: 'single_select',
        buttonParamsJson: JSON.stringify({
            sections: [{
                rows: [
                    { id: '!antitag on' },
                    { id: '!antitag off' },
                ],
            }],
        }),
    }];

    return {
        key: {
            remoteJid: groupJid,
            id: 'antitag-menu-1',
            fromMe: true,
        },
        raw: {
            interactiveMessage: {
                body: { text: '🚫 ANTI-TAG BOT' },
                nativeFlowMessage: { buttons },
            },
        },
    };
}

test('only a quoted AntiTagBot status menu from this chat is eligible for cleanup', () => {
    const menu = makeAntitagMenuMessage();
    assert.equal(isAntitagSelectionMenu(menu, menu.key.remoteJid), true);
    assert.equal(isAntitagSelectionMenu(menu, '120363999999999999@g.us'), false);
    assert.equal(
        isAntitagSelectionMenu({ ...menu, key: { ...menu.key, fromMe: false } }, menu.key.remoteJid),
        false,
    );
    assert.equal(
        isAntitagSelectionMenu({
            ...menu,
            raw: { conversation: 'pesan bot biasa' },
        }, menu.key.remoteJid),
        false,
    );
});

test('selecting an AntiTagBot action deletes only its quoted menu message', async () => {
    const calls = [];
    const menu = makeAntitagMenuMessage();
    const deleted = await deletePreviousAntitagSelectionMenu({
        hisoka: { async sendMessage(...args) { calls.push(args); } },
        m: { from: menu.key.remoteJid, quoted: menu },
    });

    assert.equal(deleted, true);
    assert.deepEqual(calls, [[menu.key.remoteJid, { delete: menu.key }]]);
});

test('single-select reflects the actual ON/OFF state in its status and selected row', async () => {
    const records = [];
    class ButtonRecorder {
        constructor() {
            this.rows = [];
            records.push(this);
        }
        setBody(body) { this.body = body; return this; }
        setFooter(footer) { this.footer = footer; return this; }
        addSelection(title) { this.selection = title; return this; }
        makeSections(title) { this.section = title; return this; }
        makeRow(...row) { this.rows.push(row); return this; }
        async run(jid, hisoka, quoted) { this.sent = { jid, quoted }; }
    }

    const m = { from: '120363000000000000@g.us', prefix: '!' };
    await sendAntitagSelection({
        hisoka: {},
        m,
        Button: ButtonRecorder,
        tolak: async () => assert.fail('fallback should not be used'),
        enabled: true,
        notice: 'Sudah aktif.',
    });
    await sendAntitagSelection({
        hisoka: {},
        m,
        Button: ButtonRecorder,
        tolak: async () => assert.fail('fallback should not be used'),
        enabled: false,
    });

    assert.match(records[0].body, /\*Status:\* ✅ \*ON\*/);
    assert.match(records[0].body, /Sudah aktif\./);
    assert.equal(records[0].rows[0][0], '✓ ✅ Aktif');
    assert.equal(records[0].rows[0][3], '!antitag on');
    assert.equal(records[0].rows[1][0], '❌ Nonaktif');

    assert.match(records[1].body, /\*Status:\* ❌ \*OFF\*/);
    assert.equal(records[1].rows[0][0], '✅ Aktif');
    assert.equal(records[1].rows[1][0], '✓ ❌ Nonaktif');
    assert.equal(records[1].rows[1][3], '!antitag off');
});

test('reselecting ON and changing state both return the refreshed status menu', async () => {
    const records = [];
    class ButtonRecorder {
        constructor() { this.rows = []; records.push(this); }
        setBody(body) { this.body = body; return this; }
        setFooter() { return this; }
        addSelection() { return this; }
        makeSections() { return this; }
        makeRow(...row) { this.rows.push(row); return this; }
        async run() {}
    }

    let storedOn = true;
    let writes = 0;
    const m = { from: '120363000000000000@g.us', prefix: '.', isOwner: true };
    const shared = {
        hisoka: {},
        m,
        tolak: async () => assert.fail('single-select should remain available'),
        logCommand() {},
        Button: ButtonRecorder,
        readConfig: () => ({ antiTagBot: { enabled: storedOn } }),
        writeConfig: cfg => {
            writes++;
            storedOn = !!cfg.antiTagBot.enabled;
            return true;
        },
    };

    await handleAntitag({ ...shared, query: 'on' });
    assert.equal(writes, 0);
    assert.match(records[0].body, /\*Status:\* ✅ \*ON\*/);
    assert.match(records[0].body, /sudah dalam keadaan \*ON\*/);
    assert.equal(records[0].rows[0][0], '✓ ✅ Aktif');

    await handleAntitag({ ...shared, query: 'off' });
    assert.equal(storedOn, false);
    assert.match(records[1].body, /\*Status:\* ❌ \*OFF\*/);
    assert.match(records[1].body, /berhasil dinonaktifkan/);
    assert.equal(records[1].rows[1][0], '✓ ❌ Nonaktif');

    await handleAntitag({ ...shared, query: 'on' });
    assert.equal(storedOn, true);
    assert.match(records[2].body, /\*Status:\* ✅ \*ON\*/);
    assert.match(records[2].body, /berhasil diaktifkan/);
    assert.equal(records[2].rows[0][0], '✓ ✅ Aktif');
    assert.equal(writes, 2);
});

test('non-owner AntiTagBot commands receive an access reply instead of silence', async () => {
    let response = '';
    let readConfigCalled = false;
    await handleAntitag({
        hisoka: {},
        m: { isOwner: false },
        query: '',
        tolak: async (_bot, _message, text) => { response = text; },
        readConfig: () => {
            readConfigCalled = true;
            return {};
        },
    });

    assert.match(response, /Akses ditolak/);
    assert.equal(readConfigCalled, false);
});
