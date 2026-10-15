// Funções compartilhadas entre o robô (scripts/igdb.mjs) e a busca sob demanda
// (netlify/functions/buscar-jogo.mjs). Dados de jogos: IGDB.com (Twitch).

let cache = { token: null, expira: 0 };

export async function tokenTwitch(clientId, secret) {
  if (cache.token && Date.now() < cache.expira) return cache.token;
  const r = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(secret)}&grant_type=client_credentials`, { method: 'POST' });
  if (!r.ok) throw new Error(`Twitch recusou as credenciais do IGDB (HTTP ${r.status}). Confira IGDB_CLIENT_ID e IGDB_CLIENT_SECRET.`);
  const j = await r.json();
  cache = { token: j.access_token, expira: Date.now() + (j.expires_in - 300) * 1000 };
  return cache.token;
}

export async function igdb(endpoint, corpo, { clientId, secret }) {
  const token = await tokenTwitch(clientId, secret);
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const r = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
      method: 'POST', headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' }, body: corpo,
    });
    if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 1000 * (tentativa + 1))); continue; } // limite: 4 req/s
    if (!r.ok) throw new Error(`IGDB ${endpoint}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
    return r.json();
  }
  throw new Error('IGDB: limite de requisições excedido.');
}

// Só jogos "principais": sem DLC/expansão (parent_game) e sem versões/edições (version_parent)
export const FILTRO_BASE = 'version_parent = null & parent_game = null';
export const CAMPOS = `fields name,slug,summary,first_release_date,total_rating,total_rating_count,
  cover.image_id,artworks.image_id,screenshots.image_id,genres.name,themes.name,platforms.abbreviation,platforms.name,
  websites.url,external_games.url,external_games.uid,external_games.category,external_games.external_game_source;`;

const PLATAFORMAS = [
  [/^PS[1-5]$|^PSV(ita)?$|^PSP$/i, 'PlayStation'], [/^(XONE|XBOX|X360|Series X\|S|XSX)/i, 'Xbox'],
  [/^(PC|Win|Linux|Mac)/i, 'PC'], [/^(Switch|Switch 2|NS|Wii|WiiU|3DS|NDS)/i, 'Nintendo'], [/^(iOS|Android)$/i, 'Mobile'],
];
export function plataformas(g) {
  const s = new Set();
  for (const p of g.platforms || []) {
    const ab = p.abbreviation || p.name || '';
    const achou = PLATAFORMAS.find(([re]) => re.test(ab)) || (/playstation/i.test(p.name) && [, 'PlayStation']) || (/xbox/i.test(p.name) && [, 'Xbox']);
    if (achou) s.add(achou[1]);
  }
  return [...s];
}

// Gêneros/temas do IGDB -> categorias do site (a primeira regra que bater vence)
const REGRAS = [
  ['terror', (G, T) => T.has('Horror')],
  ['mobile', (G, T, P) => P.length > 0 && P.every((p) => p === 'Mobile')],
  ['luta', (G) => G.has('Fighting')],
  ['fps', (G, T) => G.has('Shooter') && !T.has('Horror')],
  ['esportes', (G) => G.has('Sport') || G.has('Racing')],
  ['musica', (G) => G.has('Music')],
  ['simulacao', (G) => G.has('Simulator')],
  ['estrategia', (G) => ['Strategy', 'Real Time Strategy (RTS)', 'Turn-based strategy (TBS)', 'Tactical', 'MOBA'].some((x) => G.has(x))],
  ['rpg', (G) => G.has('Role-playing (RPG)')],
  ['arcade', (G) => G.has('Arcade') || G.has('Pinball')],
  ['indies', (G) => G.has('Indie')],
  ['aventura', (G) => G.has('Adventure') || G.has('Point-and-click')],
  ['acao', () => true],
];
export function categoria(g, plats) {
  const G = new Set((g.genres || []).map((x) => x.name)), T = new Set((g.themes || []).map((x) => x.name));
  return REGRAS.find(([, f]) => f(G, T, plats))[0];
}

const img = (id, tam = 't_screenshot_big') => id ? `https://images.igdb.com/igdb/image/upload/${tam}/${id}.jpg` : null;

// Converte links das lojas para a versão brasileira
function lojas(g) {
  const urls = [...(g.websites || []).map((w) => w.url), ...(g.external_games || []).map((e) => e.url)].filter(Boolean);
  const out = {};
  for (const u of urls) {
    if (!out.store_steam && /store\.steampowered\.com\/app\/\d+/.test(u)) out.store_steam = u.split('?')[0];
    else if (!out.store_ps && /store\.playstation\.com\//.test(u)) out.store_ps = u.replace(/\/[a-z]{2}-[a-z]{2}\//i, '/pt-br/');
    else if (!out.store_xbox && /(xbox\.com|microsoft\.com)\//.test(u)) out.store_xbox = u.replace(/\/[a-z]{2}-[a-z]{2}\//i, '/pt-BR/');
    else if (!out.store_nintendo && /nintendo\.com\//.test(u)) out.store_nintendo = u;
  }
  // ID da Steam: pelo link ou pelo "uid" da fonte Steam (código 1)
  let appid = out.store_steam?.match(/\/app\/(\d+)/)?.[1];
  if (!appid) {
    const st = (g.external_games || []).find((e) => (e.external_game_source ?? e.category) === 1 && /^\d+$/.test(e.uid || ''));
    if (st) appid = st.uid;
  }
  if (appid) { out.steam_appid = Number(appid); out.store_steam ||= `https://store.steampowered.com/app/${appid}/`; }
  return out;
}

// Jogo do IGDB -> linha da tabela games
export function paraLinha(g, idsCategorias) {
  const plats = plataformas(g);
  const l = lojas(g);
  return {
    igdb_id: g.id,
    slug: g.slug,
    title: g.name,
    description: g.summary ? g.summary.slice(0, 1500) : null,
    description_lang: g.summary ? 'en' : null, // IGDB só tem textos em inglês
    cover_url: img(g.artworks?.[0]?.image_id) || img(g.screenshots?.[0]?.image_id) || img(g.cover?.image_id, 't_cover_big'),
    release_year: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
    category_id: idsCategorias[categoria(g, plats)] ?? null,
    platforms: plats,
    igdb_rating: g.total_rating != null ? Math.round(g.total_rating * 100) / 100 : null,
    igdb_rating_count: g.total_rating_count || 0,
    store_ps: l.store_ps ?? null, store_xbox: l.store_xbox ?? null, store_steam: l.store_steam ?? null, store_nintendo: l.store_nintendo ?? null,
    steam_appid: l.steam_appid ?? null,
  };
}

// Cliente REST mínimo do Supabase (chave secreta só no servidor)
export function supabaseRest(url, key) {
  const base = url.trim().replace(/\/+(rest\/v1)?\/*$/, '');
  const auth = key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {};
  return async function api(caminho, { method = 'GET', body, prefer } = {}) {
    const r = await fetch(`${base}/rest/v1/${caminho}`, {
      method, headers: { apikey: key, ...auth, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const txt = await r.text();
    if (!r.ok) throw new Error(`${method} ${caminho.split('?')[0]}: ${r.status} ${txt.slice(0, 300)}`);
    return txt ? JSON.parse(txt) : null;
  };
}
