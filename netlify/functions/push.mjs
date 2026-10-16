// Notificações no celular (Web Push).
//   GET  /.netlify/functions/push              -> { publicKey }  (chave pública para o navegador assinar)
//   POST /.netlify/functions/push  (do banco)  -> envia a notificação para os aparelhos da pessoa
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
  if (!env('PUSH_SECRET') || req.headers.get('x-push-secret') !== env('PUSH_SECRET')) return json(401, { erro: 'Não autorizado.' });

  const { user_id, title, body, link, type } = await req.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/.test(user_id || '')) return json(400, { erro: 'Usuário inválido.' });
  webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:contato@controlcritic.app', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  const api = supabaseRest(env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY'));
  const subs = await api(`push_subscriptions?select=endpoint,p256dh,auth&user_id=eq.${user_id}`);
  const payload = JSON.stringify({ title: String(title || 'Control Critic').slice(0, 120), body: String(body || '').slice(0, 200), link: /^[a-z]+\.html[\w?=&#.%-]*$/i.test(link || '') ? link : 'notificacoes.html', type });
  let enviados = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: type === 'call' ? 'high' : 'normal' });
      enviados++;
    } catch (e) {
      // aparelho desinstalou o app ou bloqueou: remove a inscrição
      if (e.statusCode === 404 || e.statusCode === 410) await api(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' }).catch(() => {});
    }
  }));
  return json(200, { enviados });
};
