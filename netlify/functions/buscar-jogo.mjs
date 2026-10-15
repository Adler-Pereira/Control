// Busca sob demanda: procura jogos de todas as plataformas no IGDB e,
// para usuários logados, adiciona o jogo escolhido ao catálogo.
//   GET  /.netlify/functions/buscar-jogo?q=hollow   -> resultados
//   POST /.netlify/functions/buscar-jogo  {igdb_id}  -> adiciona (precisa de login)
// Variáveis no Netlify: IGDB_CLIENT_ID, IGDB_CLIENT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY
import { igdb, CAMPOS, FILTRO_BASE, paraLinha, plataformas, supabaseRest } from '../../lib/igdb.mjs';

const env = (k) => (process.env[k] || '').trim();
const json = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export default async (req) => {
  if (['IGDB_CLIENT_ID', 'IGDB_CLIENT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'].some((k) => !env(k)))
    return json(503, { erro: 'Busca ampliada ainda não configurada no Netlify (variáveis de ambiente).' });
  const cred = { clientId: env('IGDB_CLIENT_ID'), secret: env('IGDB_CLIENT_SECRET') };
  const api = supabaseRest(env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY'));

  try {
    if (req.method === 'GET') {
      const q = (new URL(req.url).searchParams.get('q') || '').replace(/["\;]/g, ' ').trim().slice(0, 60);
      if (q.length < 2) return json(400, { erro: 'Digite pelo menos 2 letras.' });
      const achados = await igdb('games', `search "${q}"; fields name,slug,first_release_date,cover.image_id,platforms.abbreviation,platforms.name,total_rating_count; where ${FILTRO_BASE}; limit 12;`, cred);
      const ids = achados.map((g) => g.id);
      const jaTem = ids.length ? await api(`games?select=igdb_id,slug&igdb_id=in.(${ids.join(',')})`) : [];
      const mapa = new Map(jaTem.map((g) => [Number(g.igdb_id), g.slug]));
      return json(200, achados.map((g) => ({
        igdb_id: g.id, titulo: g.name, ano: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
        capa: g.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_small/${g.cover.image_id}.jpg` : null,
        plataformas: plataformas(g), slug_no_site: mapa.get(g.id) || null,
      })));
    }

    if (req.method === 'POST') {
      // Confere o login com o próprio Supabase
      const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      const base = env('SUPABASE_URL').replace(/\/+(rest\/v1)?\/*$/, '');
      const u = token && await fetch(`${base}/auth/v1/user`, { headers: { apikey: env('SUPABASE_SERVICE_KEY'), Authorization: `Bearer ${token}` } });
      if (!u || !u.ok) return json(401, { erro: 'Entre na sua conta para adicionar jogos.' });
      const usuario = await u.json();
      const [perfil] = await api(`profiles?select=banned&id=eq.${usuario.id}`);
      if (!perfil || perfil.banned) return json(403, { erro: 'Conta sem permissão para adicionar jogos.' });

      const { igdb_id } = await req.json().catch(() => ({}));
      if (!Number.isInteger(igdb_id)) return json(400, { erro: 'Jogo inválido.' });
      const [existe] = await api(`games?select=slug&igdb_id=eq.${igdb_id}`);
      if (existe) return json(200, { slug: existe.slug });

      const [g] = await igdb('games', `${CAMPOS} where id = ${igdb_id} & ${FILTRO_BASE};`, cred);
      if (!g) return json(404, { erro: 'Jogo não encontrado no IGDB.' });
      const cats = Object.fromEntries((await api('categories?select=id,slug')).map((c) => [c.slug, c.id]));
      const linha = { ...paraLinha(g, cats), added_by: usuario.id };
      // Se o slug já existir (outro jogo com mesmo nome), acrescenta o id do IGDB
      const [mesmoSlug] = await api(`games?select=id&slug=eq.${encodeURIComponent(linha.slug)}`);
      if (mesmoSlug) linha.slug = `${linha.slug}-${igdb_id}`;
      const [novo] = await api('games', { method: 'POST', body: linha, prefer: 'return=representation' });
      // XP para quem ampliou o catálogo
      await api('rpc/add_xp', { method: 'POST', body: { uid: usuario.id, amount: 5 } }).catch(() => {});
      return json(201, { slug: novo.slug });
    }
    return json(405, { erro: 'Método não permitido.' });
  } catch (e) {
    console.error(e);
    return json(502, { erro: 'Falha ao consultar o catálogo. Tente de novo em instantes.' });
  }
};
