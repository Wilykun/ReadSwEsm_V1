import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildMassMentionReply,
    findParticipantByIdentity,
    getMentionedJids,
    hasAllMentionText,
    isGroupAdmin,
    isMassMention,
    isNativeGroupMention,
    sendMassMentionReply,
} from '../SEMUA_FITUR/antitag/antitag.js';

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
    assert.deepEqual(reply.mentions, ['628123456789@s.whatsapp.net']);
});

test('group admin and bot owner receive an explanation without claiming their message was deleted', () => {
    for (const status of ['owner', 'groupAdmin']) {
        const reply = buildMassMentionReply({ status, senderName: 'Admin' });
        assert.match(reply.text, /tidak dihapus/);
        assert.doesNotMatch(reply.text, /sudah dihapus otomatis/);
    }
});

test('bot permission, uncertain roles, and delete failure each get an accurate response', () => {
    const notAdmin = buildMassMentionReply({ status: 'botNotAdmin', senderName: 'Member' });
    assert.match(notAdmin.text, /bot bukan admin grup/);
    assert.match(notAdmin.text, /Jadikan bot admin/);
    assert.match(notAdmin.text, /pesan tidak dihapus/);

    const unknown = buildMassMentionReply({ status: 'botAdminUnknown', senderName: 'Member' });
    assert.match(unknown.text, /status admin bot tidak dapat dipastikan/);
    assert.match(unknown.text, /Pesan tidak dihapus/);

    const roleUnknown = buildMassMentionReply({ status: 'senderRoleUnknown', senderName: 'Member' });
    assert.match(roleUnknown.text, /peran pengirim tidak dapat dipastikan/);
    assert.match(roleUnknown.text, /Pesan tidak dihapus/);

    const failedDelete = buildMassMentionReply({ status: 'deleteFailed', senderName: 'Member' });
    assert.match(failedDelete.text, /WhatsApp menolak penghapusan/);
    assert.match(failedDelete.text, /Pesan mungkin masih terlihat/);
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
