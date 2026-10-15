// Credenciais temporárias de TURN para as calls (retransmissão quando a conexão direta é bloqueada).
//   GET /.netlify/functions/turn  ->  { iceServers: [...] }
// Aceita duas fontes (pode usar uma, outra ou as duas):
//  1) TURN próprio (coturn no seu computador/servidor), gratuito:
//       TURN_URL     ex.: turn:meu-endereco.duckdns.org:3478
//       TURN_SECRET  o mesmo "static-auth-secret" do turnserver.conf
//  2) TURN da Cloudflare: CLOUDFLARE_TURN_KEY_ID e CLOUDFLARE_TURN_API_TOKEN
import { createHmac } from 'node:crypto';

const env = (k) => (process.env[k] || '').trim();
const json = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const VALIDADE = 6 * 3600; // segundos

// Padrão "TURN REST API" do coturn: usuário = expiração:id, senha = HMAC-SHA1(segredo, usuário)
function turnProprio() {
  const urls = env('TURN_URL').split(',').map((u) => u.trim()).filter((u) => /^turns?:/.test(u));
  if (!urls.length || !env('TURN_SECRET')) return null;
  const username = `${Math.floor(Date.now() / 1000) + VALIDADE}:controlcritic`;
  const credential = createHmac('sha1', env('TURN_SECRET')).update(username).digest('base64');
  // também via TCP, que passa por mais firewalls
  const todas = urls.flatMap((u) => (u.includes('transport=') ? [u] : [u, `${u}?transport=tcp`]));
  return { urls: todas, username, credential };
}

async function turnCloudflare() {
  if (!env('CLOUDFLARE_TURN_KEY_ID') || !env('CLOUDFLARE_TURN_API_TOKEN')) return [];
  const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env('CLOUDFLARE_TURN_KEY_ID')}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('CLOUDFLARE_TURN_API_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: VALIDADE }),
  });
  if (!r.ok) throw new Error(`Cloudflare respondeu ${r.status}`);
  const d = await r.json();
  return Array.isArray(d.iceServers) ? d.iceServers : d.iceServers ? [d.iceServers] : [];
}

export default async (req) => {
  const origem = req.headers.get('origin') || req.headers.get('referer') || '';
  if (origem && new URL(origem).host !== new URL(req.url).host) return json(403, { erro: 'Origem não permitida.' });
  const lista = [];
  const proprio = turnProprio();
  if (proprio) lista.push(proprio);
  try { lista.push(...(await turnCloudflare())); } catch (e) { console.error(e); }
  if (!lista.length) return json(503, { erro: 'TURN não configurado.' });
  return json(200, { iceServers: lista });
};
