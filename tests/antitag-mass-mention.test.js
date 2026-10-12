import assert from 'node:assert/strict';
import test from 'node:test';
import {
    findParticipantByIdentity,
    getMentionedJids,
    hasAllMentionText,
    isGroupAdmin,
    isMassMention,
    isNativeGroupMention,
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
