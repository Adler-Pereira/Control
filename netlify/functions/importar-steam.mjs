// Importa a biblioteca da Steam de um usuário logado para "Minha biblioteca".
//   POST /.netlify/functions/importar-steam  { perfil: "https://steamcommunity.com/id/fulano" }
// Usa a Steam Web API oficial (GetOwnedGames). O perfil e os "detalhes de jogos" precisam estar públicos.
// Variáveis no Netlify: STEAM_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
import { supabaseRest, usuarioLogado } from '../../lib/igdb.mjs';

const MAX_NOVOS_NO_CATALOGO = 3000;
const env = (k) => (process.env[k] || '').trim();
const json = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'jogo';

async function steam(metodo, params, ms = 15000) {
  const q = new URLSearchParams({ key: env('STEAM_API_KEY'), format: 'json', ...params });
  const r = await fetch(`https://api.steampowered.com/${metodo}/?${q}`, { signal: AbortSignal.timeout(ms) });
  if (r.status === 403) throw Object.assign(new Error('Chave da Steam inválida no servidor.'), { status: 503 });
  if (!r.ok) throw new Error(`Steam respondeu ${r.status}`);
  return r.json();
}

async function steamId(perfil) {
  const s = perfil.trim();
  const num = s.match(/(?:profiles\/)?(\d{17})\/?$/);
  if (num) return num[1];
  const nome = s.match(/steamcommunity\.com\/id\/([A-Za-z0-9_-]+)/)?.[1] || (/^[A-Za-z0-9_-]{2,32}$/.test(s) ? s : null);
  if (!nome) return null;
  const r = await steam('ISteamUser/ResolveVanityURL/v1', { vanityurl: nome });
  return r.response?.success === 1 ? r.response.steamid : null;
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { erro: 'Método não permitido.' });
  if (['STEAM_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'].some((k) => !env(k)))
    return json(503, { erro: 'Importação da Steam ainda não configurada no servidor (variável STEAM_API_KEY no Netlify).' });
  const api = supabaseRest(env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY'));

  try {
    // Login
    const login = await usuarioLogado(req, env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY'));
    if (!login.usuario) {
      console.error('importar-steam:', login.erro);
      return json(401, { erro: `Não foi possível confirmar seu login (${login.erro}). Saia e entre de novo na sua conta e tente outra vez.` });
    }
    const { id: uid } = login.usuario;

    const { perfil } = await req.json().catch(() => ({}));
    if (!perfil || String(perfil).length > 200) return json(400, { erro: 'Informe o link do seu perfil da Steam.' });
    const sid = await steamId(String(perfil));
    if (!sid) return json(404, { erro: 'Perfil da Steam não encontrado. Confira o link.' });

    const dono = await steam('IPlayerService/GetOwnedGames/v1', { steamid: sid, include_appinfo: '1', include_played_free_games: '1' });
    const jogos = (dono.response?.games || []).filter((g) => g.appid && g.name);
    if (!jogos.length) return json(422, { erro: 'Não conseguimos ver seus jogos. Na Steam, vá em Editar perfil → Privacidade e deixe "Detalhes de jogos" como Público.' });

    // Jogos que já existem no catálogo (pelo ID da Steam)
    const porAppid = new Map();
    for (let i = 0; i < jogos.length; i += 150) {
      const ids = jogos.slice(i, i + 150).map((g) => g.appid).join(',');
      for (const g of await api(`games?select=id,steam_appid&steam_appid=in.(${ids})`)) porAppid.set(g.steam_appid, g.id);
    }

    // Os que faltam entram no catálogo com os dados da Steam (o robô completa descrição e preço depois)
    const faltando = jogos.filter((g) => !porAppid.has(g.appid)).slice(0, MAX_NOVOS_NO_CATALOGO);
    let novos = 0;
    for (let i = 0; i < faltando.length; i += 200) {
      const lote = faltando.slice(i, i + 200);
      const slugs = lote.map((g) => slugify(g.name));
      const usados = new Set((await api(`games?select=slug&slug=in.(${slugs.map((x) => `"${x}"`).join(',')})`)).map((g) => g.slug));
      const linhas = lote.map((g, k) => ({
        slug: usados.has(slugs[k]) ? `${slugs[k]}-${g.appid}` : slugs[k],
        title: g.name.slice(0, 200), steam_appid: g.appid, platforms: ['PC'],
        store_steam: `https://store.steampowered.com/app/${g.appid}/`,
        cover_url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`,
        added_by: uid,
      }));
      const r = await api('games?on_conflict=slug', { method: 'POST', body: linhas, prefer: 'resolution=ignore-duplicates,return=representation' });
      for (const g of r || []) porAppid.set(g.steam_appid, g.id);
      novos += r?.length ?? 0;
    }

    // Biblioteca: grava as horas; não mexe no status nem na lista de desejos que a pessoa já marcou
    const linhas = jogos.filter((g) => porAppid.has(g.appid)).map((g) => ({
      user_id: uid, game_id: porAppid.get(g.appid),
      hours: Math.round((g.playtime_forever || 0) / 6) / 10, updated_at: new Date().toISOString(),
      hours_2weeks: g.playtime_2weeks ? Math.round(g.playtime_2weeks / 6) / 10 : null,
      last_played: g.rtime_last_played ? new Date(g.rtime_last_played * 1000).toISOString() : null,
    }));
    for (let i = 0; i < linhas.length; i += 500)
      await api('user_games?on_conflict=user_id,game_id', { method: 'POST', body: linhas.slice(i, i + 500), prefer: 'resolution=merge-duplicates' });

    // Guarda o ID da Steam (usado no "jogando agora") e o link do perfil, se a pessoa ainda não tinha preenchido
    await api(`profiles?id=eq.${uid}`, { method: 'PATCH', body: { steam_id: sid } }).catch(() => {});
    await api(`profiles?id=eq.${uid}&steam_profile=is.null`, { method: 'PATCH', body: { steam_profile: `https://steamcommunity.com/profiles/${sid}` } }).catch(() => {});

    const conquistas = await importarConquistas(sid, jogos, porAppid, uid, api).catch((e) => { console.error('conquistas:', e); return null; });

    return json(200, { importados: linhas.length, novos_no_catalogo: novos, ignorados: jogos.length - linhas.length, conquistas: conquistas?.total ?? null });
  } catch (e) {
    console.error(e);
    return json(e.status || 502, { erro: e.status ? e.message : 'Falha ao falar com a Steam. Tente de novo em instantes.' });
  }
};

// Conquistas dos jogos mais jogados (a Steam exige uma consulta por jogo, então limitamos aos 12 com mais horas):
// total desbloqueado, e as mais raras (menor % de jogadores no mundo) para a vitrine do perfil.
async function importarConquistas(sid, jogos, porAppid, uid, api) {
  const top = jogos.filter((g) => g.playtime_forever > 0).sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 12);
  const res = await Promise.allSettled(top.map(async (g) => {
    const [eu, glob, esq] = await Promise.all([
      steam('ISteamUserStats/GetPlayerAchievements/v1', { steamid: sid, appid: g.appid }, 6000),
      steam('ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2', { gameid: g.appid }, 6000).catch(() => ({})),
      steam('ISteamUserStats/GetSchemaForGame/v2', { appid: g.appid, l: 'brazilian' }, 6000).catch(() => ({})),
    ]);
    const lista = eu.playerstats?.achievements || [];
    const pct = Object.fromEntries((glob.achievementpercentages?.achievements || []).map((a) => [a.name, Number(a.percent)]));
    const info = Object.fromEntries((esq.game?.availableGameStats?.achievements || []).map((a) => [a.name, a]));
    const feitas = lista.filter((a) => a.achieved === 1);
    return { g, total: lista.length, feitas: feitas.length,
      raras: feitas.map((a) => ({ jogo: g.name, nome: info[a.apiname]?.displayName || a.apiname, icone: info[a.apiname]?.icon || null, pct: pct[a.apiname] ?? 100 })) };
  }));
  const ok = res.filter((r) => r.status === 'fulfilled' && r.value.total).map((r) => r.value);
  for (const r of ok) {
    const gid = porAppid.get(r.g.appid);
    if (gid) await api(`user_games?user_id=eq.${uid}&game_id=eq.${gid}`, { method: 'PATCH', body: { ach_done: r.feitas, ach_total: r.total } }).catch(() => {});
  }
  const total = ok.reduce((t, r) => t + r.feitas, 0);
  const raras = ok.flatMap((r) => r.raras).filter((a) => a.pct < 100).sort((a, b) => a.pct - b.pct).slice(0, 6)
    .map((a) => ({ ...a, pct: Math.round(a.pct * 10) / 10, icone: /^https:\/\/[a-z0-9.-]+\.(steamstatic\.com|akamaihd\.net)\//.test(a.icone || '') ? a.icone : null }));
  await api(`profiles?id=eq.${uid}`, { method: 'PATCH', body: { steam_conquistas: { total, jogos: ok.length, raras, em: new Date().toISOString() } } });
  return { total };
}
