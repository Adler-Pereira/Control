// Notificações no celular (Web Push).
//   GET  /.netlify/functions/push              -> { publicKey }  (chave pública para o navegador assinar)
//   POST /.netlify/functions/push  (do banco)  -> envia a notificação para os aparelhos da pessoa
//   POST /.netlify/functions/push?teste=1 (usuário logado) -> diagnóstico: confere a configuração e manda um teste para os aparelhos dele
// Variáveis no Netlify: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...), PUSH_SECRET,
// SUPABASE_URL, SUPABASE_SERVICE_KEY. O banco chama o POST com o cabeçalho x-push-secret.
import webpush from 'web-push';
import { supabaseRest } from '../../lib/igdb.mjs';

const env = (k) => (process.env[k] || '').trim();
const json = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req) => {
  if (!env('VAPID_PUBLIC_KEY') || !env('VAPID_PRIVATE_KEY')) return json(503, { erro: 'Notificações no celular não configuradas.' });
  if (req.method === 'GET') return json(200, { publicKey: env('VAPID_PUBLIC_KEY') });
  if (req.method !== 'POST') return json(405, { erro: 'Método não permitido.' });
  if (new URL(req.url).searchParams.get('teste')) return diagnostico(req);
  if (!env('PUSH_SECRET') || req.headers.get('x-push-secret') !== env('PUSH_SECRET')) return json(401, { erro: 'Não autorizado.' });

  const { user_id, title, body, link, type } = await req.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/.test(user_id || '')) return json(400, { erro: 'Usuário inválido.' });
  const { enviados } = await enviar(user_id, { title, body, link, type });
  return json(200, { enviados });
};

async function enviar(user_id, { title, body, link, type }) {
  webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:contato@controlcritic.app', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  const api = supabaseRest(env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY'));
  const subs = await api(`push_subscriptions?select=endpoint,p256dh,auth&user_id=eq.${user_id}`);
  const payload = JSON.stringify({ title: String(title || 'Control Critic').slice(0, 120), body: String(body || '').slice(0, 200), link: /^[a-z]+\.html[\w?=&#.%-]*$/i.test(link || '') ? link : 'notificacoes.html', type });
  let enviados = 0;
  const erros = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: type === 'call' ? 'high' : 'normal' });
      enviados++;
    } catch (e) {
      erros.push({ status: e.statusCode || null, servico: new URL(s.endpoint).host, msg: String(e.body || e.message || '').slice(0, 160) });
      // aparelho desinstalou o app, bloqueou, ou se inscreveu com chaves antigas (403): remove a inscrição
      if ([403, 404, 410].includes(e.statusCode)) await api(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' }).catch(() => {});
    }
  }));
  return { aparelhos: subs.length, enviados, erros };
}

// Diagnóstico para o próprio usuário: mostra em que ponto a corrente quebra
async function diagnostico(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const base = env('SUPABASE_URL').replace(/\/+(rest\/v1)?\/*$/, '');
  const quem = token && await fetch(`${base}/auth/v1/user`, { headers: { apikey: env('SUPABASE_SERVICE_KEY'), Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() : null).catch(() => null);
  if (!quem?.id) return json(401, { erro: 'Entre na sua conta para testar.' });
  const api = supabaseRest(env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY'));
  const cfg = (await api('settings?key=eq.push&select=value').catch(() => []))[0]?.value;
  const origem = new URL(req.url).origin;
  const checagens = {
    chaves_netlify: !!(env('VAPID_PUBLIC_KEY') && env('VAPID_PRIVATE_KEY') && env('PUSH_SECRET')),
    banco_configurado: !!cfg?.url,
    segredo_igual: !!cfg?.segredo && cfg.segredo === env('PUSH_SECRET'),
    endereco_certo: !!cfg?.url && cfg.url.startsWith(origem),
    endereco_banco: cfg?.url || null,
  };
  const direto = await enviar(quem.id, { title: '🔔 Teste 1 de 2 (direto)', body: 'Se chegou, o celular está inscrito certinho.', link: 'notificacoes.html', type: 'teste' });
  // Teste 2: pelo caminho real (notificação criada no banco -> gatilho -> esta função)
  await api('notifications', { method: 'POST', body: [{ user_id: quem.id, type: 'teste', title: '🔔 Teste 2 de 2 (pelo banco)', body: 'Se chegou, as notificações do site vão chegar no celular.', link: 'notificacoes.html' }] }).catch(() => {});
  return json(200, { ...checagens, ...direto });
}
