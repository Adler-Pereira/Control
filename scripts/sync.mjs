// Robô de sincronização: importa notícias oficiais (RSS + Steam) e atualiza
// promoções da Steam. Roda no GitHub Actions (ver .github/workflows/sync.yml).
// Precisa das variáveis SUPABASE_URL e SUPABASE_SERVICE_KEY (segredos do GitHub).
// Sem dependências: usa só o fetch nativo do Node 20+.

// Tolera URL com "/rest/v1", barras e espaços sobrando (erros comuns ao colar o segredo)
// No GitHub Actions, "::error::" faz a mensagem aparecer no resumo da execução
const gh = !!process.env.GITHUB_ACTIONS;
const falhar = (msg) => { console.error(gh ? `::error::${msg.replace(/\n/g, ' ')}` : msg); process.exit(1); };
process.on('unhandledRejection', (e) => falhar(`Falha inesperada: ${e?.message || e}${e?.cause ? ` (${e.cause.code || e.cause.message})` : ""}`));
process.on('uncaughtException', (e) => falhar(`Falha inesperada: ${e?.message || e}${e?.cause ? ` (${e.cause.code || e.cause.message})` : ""}`));

const URL_BASE = (process.env.SUPABASE_URL || '').trim().replace(/\/+(rest\/v1)?\/*$/, '');
const KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();
if (!URL_BASE || !KEY) falhar(`Segredos ausentes: ${!URL_BASE ? 'SUPABASE_URL ' : ''}${!KEY ? 'SUPABASE_SERVICE_KEY' : ''} (GitHub > Settings > Secrets and variables > Actions).`);
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(URL_BASE)) console.warn(`${gh ? '::warning::' : ''}SUPABASE_URL fora do padrão https://xxxx.supabase.co (comprimento ${URL_BASE.length}, começa com "${URL_BASE.slice(0, 12)}")`);
console.log(`Chave do tipo: ${KEY.startsWith('sb_secret_') ? 'Secret (nova)' : KEY.startsWith('eyJ') ? 'JWT (antiga)' : 'desconhecido'}`);
if (/^sb_publishable_/.test(KEY) || /"role":"anon"/.test(Buffer.from(KEY.split('.')[1] || '', 'base64').toString())) {
  falhar('SUPABASE_SERVICE_KEY está com a chave PÚBLICA. O robô precisa da Secret key (sb_secret_...) ou da service_role.');
}
// Chaves novas (sb_secret_) vão só no header apikey; as antigas (JWT) também no Authorization
const AUTH = KEY.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {};

const POR_FEED = 8;           // notícias novas por feed RSS
const POR_JOGO_STEAM = 2;     // anúncios oficiais por jogo na Steam
const erros = [];

async function api(caminho, { method = 'GET', body, prefer } = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
    method,
    headers: { apikey: KEY, ...AUTH, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const txt = await r.text();
    const dica = r.status === 401 ? ' (chave inválida: confira o segredo SUPABASE_SERVICE_KEY)'
      : r.status === 404 && /relation|table/.test(txt) ? ' (tabela não existe: rode supabase/schema.sql no SQL Editor)' : '';
    throw new Error(`${method} ${caminho}: ${r.status} ${txt}${dica}`);
  }
  // POST/DELETE sem "return=representation" respondem com corpo vazio (201/204)
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

async function baixar(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'ControlCriticBot/1.0 (+github.com/Control-Critic)' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r;
}

// ---------- utilidades de texto ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodificar = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m);
const semCdata = (s) => s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');
const texto = (html) => decodificar(semCdata(html || '').replace(/<[^>]+>/g, ' ')).replace(/\[\/?[a-z0-9=*]+[^\]]*\]/gi, ' ').replace(/\s+/g, ' ').trim();
const resumo = (s, n = 280) => (s.length > n ? s.slice(0, n).replace(/\s\S*$/, '') + '…' : s);
const tag = (xml, nome) => { const m = xml.match(new RegExp(`<${nome}[^>]*>([\\s\\S]*?)</${nome}>`, 'i')); return m ? semCdata(m[1]).trim() : ''; };

function lerRss(xml) {
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map(([it]) => {
    const img = it.match(/<media:content[^>]+url="([^"]+)"/i)?.[1] || it.match(/<enclosure[^>]+url="([^"]+)"[^>]*type="image/i)?.[1]
      || it.match(/<img[^>]+src="([^"]+)"/i)?.[1] || null;
    return {
      title: texto(tag(it, 'title')),
      link: decodificar(tag(it, 'link')),
      summary: resumo(texto(tag(it, 'description'))),
      date: tag(it, 'pubDate'),
      image: img && /^https:\/\//.test(img) ? decodificar(img) : null,
    };
  }).filter((i) => i.title && /^https?:\/\//.test(i.link));
}

async function inserirNoticias(lista, publicar) {
  if (!lista.length) return 0;
  const linhas = lista.map((n) => ({
    title: n.title.slice(0, 300), summary: n.summary || null, body: n.summary || n.title, cover_url: n.image,
    source: n.source, source_url: n.link, game_id: n.game_id ?? null, published: publicar,
    created_at: n.date && !isNaN(Date.parse(n.date)) ? new Date(n.date).toISOString() : new Date().toISOString(),
  }));
  const r = await api('news?on_conflict=source_url', { method: 'POST', body: linhas, prefer: 'resolution=ignore-duplicates,return=representation' });
  return r?.length ?? 0;
}

// ---------- execução ----------
const cfg = Object.fromEntries((await api('settings?select=key,value')).map((s) => [s.key, s.value]));
const publicar = cfg.auto_publish_news !== false;
// Rodízio: a cada execução consulta os jogos verificados há mais tempo (a Steam limita ~200 consultas/5 min)
const POR_EXECUCAO = Number(process.env.STEAM_LOTE) || 200;
const jogos = await api(`games?select=id,title,steam_appid,cover_url,description,featured,reviews_count,steam_checked_at&steam_appid=not.is.null&order=steam_checked_at.asc.nullsfirst&limit=${POR_EXECUCAO}`);
let novas = 0, precos = 0, capas = 0;

// 1) Feeds RSS oficiais
for (const feed of cfg.feeds || []) {
  try {
    const itens = lerRss(await (await baixar(feed.url)).text()).slice(0, POR_FEED);
    const n = await inserirNoticias(itens.map((i) => ({ ...i, source: feed.name })), publicar);
    novas += n; console.log(`RSS ${feed.name}: ${itens.length} lidas, ${n} novas`);
  } catch (e) { erros.push(`Feed ${feed.name}: ${e.message}`); }
}

for (const g of jogos) {
  // 2) Anúncios oficiais na Steam: só para jogos em destaque ou que a comunidade avaliou
  if (g.featured || g.reviews_count > 0) try {
    const r = await (await baixar(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${g.steam_appid}&count=${POR_JOGO_STEAM}&maxlength=600&feeds=steam_community_announcements&format=json`)).json();
    const itens = (r.appnews?.newsitems || []).map((i) => ({
      title: `${g.title}: ${texto(i.title)}`, link: i.url, summary: resumo(texto(i.contents)),
      date: new Date(i.date * 1000).toISOString(), image: null, source: 'Steam', game_id: g.id,
    }));
    novas += await inserirNoticias(itens, publicar);
  } catch (e) { erros.push(`Notícias Steam ${g.title}: ${e.message}`); }

  // 3) Preço e desconto na Steam Brasil (+ capa e descrição para jogos que ainda não têm)
  try {
    const r = await (await baixar(`https://store.steampowered.com/api/appdetails?appids=${g.steam_appid}&cc=br&l=brazilian`)).json();
    const info = r[g.steam_appid]?.data;
    const po = info?.price_overview;
    const faltando = {};
    if (!g.cover_url && /^https:\/\//.test(info?.header_image || '')) faltando.cover_url = info.header_image;
    // Na 1ª verificação troca a descrição (em inglês, do IGDB) pela da Steam em português
    if ((!g.description || !g.steam_checked_at) && info?.short_description) faltando.description = texto(info.short_description).slice(0, 1000);
    if (Object.keys(faltando).length) capas++;
    await api(`games?id=eq.${g.id}`, { method: 'PATCH', body: { ...faltando, steam_checked_at: new Date().toISOString() } });
    if (po) {
      await api('deals?on_conflict=game_id,store', {
        method: 'POST', prefer: 'resolution=merge-duplicates',
        body: [{ game_id: g.id, store: 'steam', price_cents: po.final, original_cents: po.initial, discount_pct: po.discount_percent,
          url: `https://store.steampowered.com/app/${g.steam_appid}/`, auto: true, updated_at: new Date().toISOString() }],
      });
      precos++;
    }
  } catch (e) { erros.push(`Preço Steam ${g.title}: ${e.message}`); }
  await new Promise((r) => setTimeout(r, 1600)); // respeita o limite de requisições da Steam
}

// 4) Lembretes de partidas que começam na próxima 1h30
const lembretes = await api('rpc/send_event_reminders', { method: 'POST', body: {} }).catch((e) => { erros.push(`Lembretes: ${e.message}`); return 0; });
if (lembretes) console.log(`Lembretes de partida enviados: ${lembretes}`);

// 5) Limpa promoções manuais vencidas
await api(`deals?auto=eq.false&ends_at=lt.${new Date().toISOString()}`, { method: 'DELETE' }).catch((e) => erros.push(e.message));

await api('settings?on_conflict=key', { method: 'POST', prefer: 'resolution=merge-duplicates',
  body: [{ key: 'last_sync', value: { at: new Date().toISOString(), news: novas, deals: precos, errors: erros.slice(0, 20) } }] });

console.log(`Concluído: ${novas} notícias novas, ${precos} preços atualizados, ${capas} jogo(s) completados com capa/descrição, ${erros.length} erro(s).`);
erros.forEach((e) => console.warn(gh ? `::warning::${e}` : ` - ${e}`));
