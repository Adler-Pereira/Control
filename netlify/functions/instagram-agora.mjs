// Botão "📸 Postar no Instagram agora" do painel de admin.
//   POST /.netlify/functions/instagram-agora  { noticia: 123 }
// Marca a notícia como urgente e dispara o robô do Instagram no GitHub Actions (publica em ~1 a 2 minutos).
// Variáveis no Netlify: SUPABASE_URL, SUPABASE_SERVICE_KEY e GITHUB_DISPARO_TOKEN (token do GitHub com permissão "Actions: read and write" só neste repositório)
import { supabaseRest, usuarioLogado } from '../../lib/igdb.mjs';

const env = (k) => (process.env[k] || '').trim();
const json = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const REPO = 'Control-Critic/Constrol';

export default async (req) => {
  if (req.method !== 'POST') return json(405, { erro: 'Método não permitido.' });
  if (!env('SUPABASE_URL') || !env('SUPABASE_SERVICE_KEY')) return json(503, { erro: 'Servidor sem configuração do Supabase.' });
  const login = await usuarioLogado(req, env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY'));
  if (!login.usuario) return json(401, { erro: 'Entre na sua conta de novo.' });
  const api = supabaseRest(env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY'));
  const [p] = await api(`profiles?id=eq.${login.usuario.id}&select=role`);
  if (!['admin', 'moderator'].includes(p?.role)) return json(403, { erro: 'Só a equipe pode publicar no Instagram.' });

  const { noticia } = await req.json().catch(() => ({}));
  const id = Number(noticia);
  if (!id) return json(400, { erro: 'Notícia inválida.' });
  const [n] = await api(`news?id=eq.${id}&select=id,instagram_at`);
  if (!n) return json(404, { erro: 'Notícia não encontrada.' });
  if (n.instagram_at) return json(409, { erro: 'Esta notícia já foi publicada no Instagram.' });
  await api(`news?id=eq.${id}`, { method: 'PATCH', body: { instagram_status: 'urgente' } });

  if (!env('GITHUB_DISPARO_TOKEN')) return json(200, { ok: true, aviso: 'Marcada como urgente. Sem GITHUB_DISPARO_TOKEN no Netlify, ela sai na próxima execução do robô (ou rode "Instagram → urgente" no GitHub Actions).' });
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/instagram.yml/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('GITHUB_DISPARO_TOKEN')}`, Accept: 'application/vnd.github+json', 'User-Agent': 'control-critic', 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify({ ref: 'main', inputs: { modo: 'urgente', noticia: String(id) } }),
  });
  if (!r.ok) return json(502, { erro: `Marcada como urgente, mas o GitHub recusou o disparo (${r.status}). Confira o GITHUB_DISPARO_TOKEN.` });
  return json(200, { ok: true });
};
