/**
 * proxyAgent.js — Proxy agent env-gated untuk makeWASocket (Baileys).
 *
 * AKTIF hanya jika env HTTPS_PROXY/https_proxy (atau HTTP_PROXY/http_proxy)
 * ter-set. Diperlukan di lingkungan yang egress-nya di-intercept proxy
 * (direct wss ke web.whatsapp.com:443 gagal TLS "wrong version number").
 *
 * Di hosting normal (Pterodactyl/Replit/panel) TANPA env proxy → me-return
 * {} sehingga perilaku 100% sama seperti tanpa patch ini.
 *
 * Pakai:  makeWASocket({ version, auth, ...getProxyAgents(), ... })
 */
import { HttpsProxyAgent } from 'https-proxy-agent';

const proxyUrl =
  process.env.HTTPS_PROXY || process.env.https_proxy ||
  process.env.HTTP_PROXY  || process.env.http_proxy  || '';

let agents = {};
if (proxyUrl) {
  try {
    const agent = new HttpsProxyAgent(proxyUrl);
    agents = { agent, fetchAgent: agent };
    console.log(`[proxyAgent] proxy aktif via env (${proxyUrl.replace(/:\/\/.*@/, '://***@')})`);
  } catch (e) {
    console.warn('[proxyAgent] gagal init proxy agent, fallback direct:', e?.message);
  }
}

export function getProxyAgents() { return agents; }
export const proxyAgents = agents;
