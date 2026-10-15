// Credenciais temporárias de TURN para as calls (retransmissão quando a conexão direta é bloqueada).
//   GET /.netlify/functions/turn  ->  { iceServers: [...] }
// Usa o TURN gratuito da Cloudflare (1.000 GB/mês grátis). Variáveis no Netlify:
//   CLOUDFLARE_TURN_KEY_ID e CLOUDFLARE_TURN_API_TOKEN
const env = (k) => (process.env[k] || '').trim();
const json = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export default async (req) => {
  const origem = req.headers.get('origin') || req.headers.get('referer') || '';
  if (origem && new URL(origem).host !== new URL(req.url).host) return json(403, { erro: 'Origem não permitida.' });
  if (!env('CLOUDFLARE_TURN_KEY_ID') || !env('CLOUDFLARE_TURN_API_TOKEN')) return json(503, { erro: 'TURN não configurado.' });
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env('CLOUDFLARE_TURN_KEY_ID')}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env('CLOUDFLARE_TURN_API_TOKEN')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 6 * 3600 }),
    });
    if (!r.ok) throw new Error(`Cloudflare respondeu ${r.status}`);
    const d = await r.json();
    // Formatos possíveis: { iceServers: [...] } ou { iceServers: { urls, username, credential } }
    const lista = Array.isArray(d.iceServers) ? d.iceServers : d.iceServers ? [d.iceServers] : [];
    return json(200, { iceServers: lista });
  } catch (e) {
    console.error(e);
    return json(502, { erro: 'Falha ao obter credenciais de TURN.' });
  }
};
