/**
 * ───────────────────────────────
 *  Base Script : Bang Dika Ardnt
 *  Recode By   : Bang Wilykun
 *  WhatsApp    : 6289688206739
 *  Telegram    : @Wilykun1994
 * ───────────────────────────────
 *
 *  cekip-cmd.js — .cekip : cek info nomor WhatsApp
 *  (terdaftar?, foto profil, status/bio)
 * ───────────────────────────────
 */
'use strict';

/* ── Negara dari kode negara (akurat — dari prefix internasional) ── */
const COUNTRY_CODES = {
    '62': 'Indonesia', '60': 'Malaysia', '65': 'Singapura', '66': 'Thailand',
    '63': 'Filipina', '84': 'Vietnam', '95': 'Myanmar', '856': 'Laos',
    '855': 'Kamboja', '673': 'Brunei', '1': 'Amerika/Kanada', '44': 'Inggris',
    '81': 'Jepang', '82': 'Korea Selatan', '86': 'China', '91': 'India',
    '61': 'Australia', '49': 'Jerman', '33': 'Prancis', '39': 'Italia',
    '34': 'Spanyol', '31': 'Belanda', '7': 'Rusia/Kazakhstan', '55': 'Brasil',
    '52': 'Meksiko', '54': 'Argentina', '27': 'Afrika Selatan', '20': 'Mesir',
    '234': 'Nigeria', '971': 'UEA', '966': 'Arab Saudi', '90': 'Turki',
};
function detectCountry(nomor) {
    for (const len of [3, 2, 1]) {
        const kode = nomor.slice(0, len);
        if (COUNTRY_CODES[kode]) return { kode: '+' + kode, negara: COUNTRY_CODES[kode] };
    }
    return { kode: '', negara: 'Tidak diketahui' };
}

/* ── Operator Indonesia dari prefix (akurat saat nomor diterbitkan;
       bisa meleset kalau nomor sudah porting operator) ── */
const OPERATOR_ID = [
    [/^6281[12]/, 'Telkomsel'], [/^62822/, 'Telkomsel'], [/^62823/, 'Telkomsel'],
    [/^62852/, 'Telkomsel'], [/^62853/, 'Telkomsel'], [/^62821/, 'Telkomsel'],
    [/^62814/, 'Indosat'], [/^62815/, 'Indosat'], [/^62816/, 'Indosat'],
    [/^62855/, 'Indosat'], [/^62856/, 'Indosat'], [/^62857/, 'Indosat'],
    [/^62858/, 'Indosat'], [/^62817/, 'XL'], [/^62818/, 'XL'],
    [/^62819/, 'XL'], [/^62859/, 'XL'], [/^62877/, 'XL'], [/^62878/, 'XL'],
    [/^62831/, 'Axis'], [/^62832/, 'Axis'], [/^62833/, 'Axis'],
    [/^62838/, 'Axis'], [/^62895/, '3 (Tri)'], [/^62896/, '3 (Tri)'],
    [/^62897/, '3 (Tri)'], [/^62898/, '3 (Tri)'], [/^62899/, '3 (Tri)'],
    [/^62881/, 'Smartfren'], [/^62882/, 'Smartfren'], [/^62883/, 'Smartfren'],
    [/^62884/, 'Smartfren'], [/^62885/, 'Smartfren'], [/^62886/, 'Smartfren'],
    [/^62887/, 'Smartfren'], [/^62888/, 'Smartfren'], [/^62889/, 'Smartfren'],
];
function detectOperator(nomor) {
    if (!nomor.startsWith('62')) return null;
    for (const [re, nama] of OPERATOR_ID) {
        if (re.test(nomor)) return nama;
    }
    return null;
}

/* ── Normalisasi nomor → JID ── */
function toJid(input) {
    if (!input) return null;
    let s = String(input).trim();
    if (s.includes('@')) return s; // sudah JID
    let num = s.replace(/[^0-9]/g, '');
    if (!num) return null;
    if (num.startsWith('0')) num = '62' + num.slice(1);
    return `${num}@s.whatsapp.net`;
}

async function handleCekip({ hisoka, m, query, tolak, logCommand }) {
    try {
        if (typeof logCommand === 'function') logCommand(m, hisoka, 'cekip');

        const input = String(query || '').trim().split(/\s+/)[0];
        if (!input) {
            await m.reply(
                `🔍 *CEK IP / CEK NOMOR*\n\n` +
                `Cara pakai:\n` +
                `• _.cekip 6289xxxx_\n` +
                `• _.cekip +6289xxxx_\n` +
                `• _.cekip 089xxxx_\n\n` +
                `_Cek apakah nomor terdaftar di WA + info profil._`
            );
            return;
        }

        const jid = toJid(input);
        if (!jid) {
            await tolak(hisoka, m, `❌ *Nomor tidak valid.*\nContoh: _.cekip 6289123456789_`);
            return;
        }

        const nomor = jid.split('@')[0];
        await m.reply(`⏳ _Mengecek ${nomor}..._`);

        /* 1. Cek terdaftar di WhatsApp */
        let terdaftar = false;
        let isBusiness = false;
        try {
            const res = await hisoka.onWhatsApp(jid);
            if (res && res.length > 0) {
                terdaftar = res[0]?.exists || false;
                isBusiness = res[0]?.isBusiness || false;
            }
        } catch {}

        if (!terdaftar) {
            await m.reply(
                `🔍 *HASIL CEK NOMOR*\n\n` +
                `📱 Nomor : ${nomor}\n` +
                `❌ _Nomor ini TIDAK terdaftar di WhatsApp._`
            );
            return;
        }

        /* 2. Foto profil */
        let ppUrl = null;
        try {
            ppUrl = await hisoka.profilePictureUrl(jid, 'image').catch(() => null);
        } catch {}

        /* 3. Status / bio */
        let status = null;
        try {
            const st = await hisoka.fetchStatus(jid).catch(() => null);
            status = st?.status || null;
        } catch {}

        /* ── Susun hasil (hacker style) ── */
        const { negara, kode } = detectCountry(nomor);
        const operator = detectOperator(nomor);
        const teks =
            `┌─ 🔍 *TARGET ACQUIRED* ─┐\n` +
            `│ 📱 *${nomor}*\n` +
            `└──────────────────┘\n\n` +
            `> *├─ STATUS ─┤*\n` +
            `> ✅ Terdaftar WhatsApp\n` +
            `> 🏢 Akun Bisnis: ${isBusiness ? 'YA' : 'TIDAK'}\n\n` +
            `> *├─ JARINGAN ─┤*\n` +
            `> 🌍 Negara: ${negara} (${kode})\n` +
            (operator ? `> 📡 Operator: ${operator}\n` : ``) +
            `> 📶 Tipe: Seluler\n\n` +
            `> *├─ PROFIL ─┤*\n` +
            `> 📝 Bio: ${status || '-'}\n` +
            `> 🖼️ Foto: ${ppUrl ? 'TERDETEKSI' : 'TIDAK ADA'}`;

        if (ppUrl) {
            await hisoka.sendMessage(m.from, {
                image: { url: ppUrl },
                caption: teks,
            }, { quoted: m });
        } else {
            await m.reply(teks);
        }
    } catch (err) {
        console.error('[CEKIP] Error:', err?.message);
        await tolak(hisoka, m, `❌ *Gagal cek nomor.*`);
    }
}

export { handleCekip };
/**
 * ── Plugin ESM ──
 */
export const command = /^(cekip)$/i;
export const tags = ['tools'];
export const help = ['cekip'];
export default handleCekip;
