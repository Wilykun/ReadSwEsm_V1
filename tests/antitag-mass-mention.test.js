import assert from 'node:assert/strict';
import test from 'node:test';
import {
    findParticipantByIdentity,
    isGroupAdmin,
    isMassMention,
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
