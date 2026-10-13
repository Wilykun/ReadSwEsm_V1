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
 *  menu_utama.js — Builder teks menu utama bot (OTOMATIS)
 *  Daftar command di-generate dari metadata plugin di SEMUA_FITUR
 *  (export const command/tags/help tiap file). Kategori baru otomatis
 *  jadi section baru — tidak perlu edit manual lagi.
 * ───────────────────────────────
 */
import { getBotVersion } from '../../src/helper/utils.js';
import { loadPlugins } from '../../src/helper/pluginLoader.js';

// Tampilan section per kategori. Kategori yang belum terdaftar di sini
// OTOMATIS dibuatkan section dari nama kategorinya (title-case).
const CATEGORY_META = {
        ai:        { emoji: '🤖', title: 'AI CHAT' },
        anime:    { emoji: '🎌', title: 'ANIME & MANGA' },
        antidel:   { emoji: '🛡️', title: 'ANTI DELETE' },
        antilink:  { emoji: '🔗', title: 'ANTI LINK' },
        antitag:   { emoji: '🚫', title: 'ANTI TAG' },
        antitagsw: { emoji: '👁️', title: 'ANTI TAG SW' },
        download:  { emoji: '📥', title: 'DOWNLOAD' },
        event:     { emoji: '🎉', title: 'EVENT' },
        group:     { emoji: '👥', title: 'FITUR GRUP' },
        info:      { emoji: '🔍', title: 'INFO & CEK' },
        jadibot:  { emoji: '🤖', title: 'JADIBOT' },
        media:    { emoji: '💬', title: 'PESAN & STICKER' },
        menu:     { emoji: '📋', title: 'SUB MENU' },
        music:    { emoji: '🎙️', title: 'MUSIK' },
        news:     { emoji: '📰', title: 'BERITA' },
        readsw:   { emoji: '📡', title: 'STATUS & STORY' },
        setting:  { emoji: '⚙️', title: 'PENGATURAN' },
        system:   { emoji: '🖥️', title: 'SISTEM' },
        tools:    { emoji: '🌐', title: 'WEB & TOOLS' },
};

// Urutan section. Kategori baru (tidak ada di sini) otomatis
// ditambahkan di akhir sesuai urutan abjad.
const SECTION_ORDER = [
        'ai', 'anime', 'antidel', 'antilink', 'antitag', 'antitagsw',
        'download', 'event', 'group', 'info', 'jadibot', 'media',
        'menu', 'music', 'news', 'readsw', 'setting', 'system', 'tools',
];

function metaFor(category) {
        if (CATEGORY_META[category]) return CATEGORY_META[category];
        const title = category.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return { emoji: '📦', title };
}

// Urai /^(a|b|c)$/i jadi ['a','b','c'] (format ketat dari codemod)
function aliasesFrom(command) {
        const m = /^\^\(\s*(.+?)\s*\)\$$/.exec(command.source);
        if (!m) return [];
        return m[1].split('|').map(s => s.replace(/\\(.)/g, '$1'));
}

export async function buildMenuUtama({ pushName, isOwner, uptimeStr, tgl, jam, browserLabel, totalCmdCount, totalSemuaFitur, fiturAktif, fiturTidakAktif }) {
        const plugins = await loadPlugins();

        // Kelompokkan plugin per kategori (tags[0]), urut abjad dalam section
        const byCat = new Map();
        for (const p of plugins) {
                const cat = (p.tags && p.tags[0]) || 'lainnya';
                if (!byCat.has(cat)) byCat.set(cat, []);
                byCat.get(cat).push(p);
        }
        for (const list of byCat.values()) {
                list.sort((a, b) => {
                        const an = aliasesFrom(a.command)[0] || '';
                        const bn = aliasesFrom(b.command)[0] || '';
                        return an.localeCompare(bn);
                });
        }

        const orderedCats = [
                ...SECTION_ORDER.filter(c => byCat.has(c)),
                ...[...byCat.keys()].filter(c => !SECTION_ORDER.includes(c)).sort(),
        ];

        let body = '';
        for (const cat of orderedCats) {
                const meta = metaFor(cat);
                const lines = [];
                for (const p of byCat.get(cat)) {
                        const aliases = aliasesFrom(p.command);
                        if (!aliases.length) continue;
                        lines.push(`│ • \`${aliases.join('\` • \`')}\``);
                }
                if (!lines.length) continue;
                body += `├─────────────────────┤\n│ ${meta.emoji} *${meta.title}*\n├─────────────────────┤\n${lines.join('\n')}\n`;
        }

        return `╭─────────────────────╮
│ 🤖 *WILY BOT ${getBotVersion()}* │
├─────────────────────┤
│ 👤 *User:* ${pushName} ${isOwner ? '👑' : ''}
│ ⏱️ *Uptime:* _${uptimeStr}_
│ 📅 *Tanggal:* ${tgl}
│ 🕐 *Waktu:* ${jam} WIB
│ 🖥️ *Device:* ${browserLabel}
│ 📜 *Total Cmd:* \`${totalCmdCount}\`
│ 🗂️ *Total Fitur:* \`${totalSemuaFitur}\`
│ ✅ *Aktif:* ${fiturAktif} │ ❌ *Nonaktif:* ${fiturTidakAktif}
│ 🌐 *Status:* Online 🟢
${body}╰─────────────────────╯
> _Ketik command untuk pakai fitur_ `;
}
