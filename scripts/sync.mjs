import { idioma, traduzir } from '../lib/idioma.mjs';
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
const POR_JOGO_STEAM = 2;
     // anúncios oficiais por jogo na Steam
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
  if (!/<item[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml)) return lerAtom(xml);
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map(([it]) => {
    const img = it.match(/<media:content[^>]+url="([^"]+)"/i)?.[1] || it.match(/<enclosure[^>]+url="([^"]+)"[^>]*type="image/i)?.[1]
      || it.match(/<img[^>]+src="([^"]+)"/i)?.[1] || null;
    return {
      title: texto(tag(it, 'title')),
      link: decodificar(tag(it, 'link')),
      // Tira a frase automática dos blogs WordPress ("The post X appeared first on Y.")
      summary: resumo(texto(tag(it, 'description')).replace(/\s*The post .*? appeared first on .*$/i, '').trim()) || null,
      date: tag(it, 'pubDate'),
      image: img && /^https:\/\//.test(img) ? decodificar(img) : null,
    };
  }).filter((i) => i.title && /^https?:\/\//.test(i.link));
}

// Formato Atom (Blogger e outros): <entry> com <link rel="alternate" href>, <summary>/<content> e <published>
function lerAtom(xml) {
  return [...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)].map(([it]) => {
    const link = it.match(/<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["']/i)?.[1] || it.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || '';
    const corpo = tag(it, 'summary') || tag(it, 'content');
    const img = it.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i)?.[1] || decodificar(corpo).match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || null;
    return {
      title: texto(tag(it, 'title')),
      link: decodificar(link),
      summary: resumo(texto(decodificar(corpo))) || null,
      date: tag(it, 'published') || tag(it, 'updated'),
      // Blogger manda miniatura pequena (s72-c): pede a versão grande
      image: img && /^https:\/\//.test(img) ? decodificar(img).replace(/\/s\d+(-c)?\//, '/s1200/') : null,
    };
  }).filter((i) => i.title && /^https?:\/\//.test(i.link));
}

async function inserirNoticias(lista, publicar) {
  if (!lista.length) return 0;
  const linhas = lista.map((n) => ({
    title: n.title.slice(0, 300), summary: n.summary || null, body: n.summary || n.title, cover_url: n.image,
    source: n.source, source_url: n.link, game_id: n.game_id ?? null, published: publicar, lang: n.lang ?? null,
    created_at: n.date && !isNaN(Date.parse(n.date)) ? new Date(n.date).toISOString() : new Date().toISOString(),
  }));
  const r = await api('news?on_conflict=source_url', { method: 'POST', body: linhas, prefer: 'resolution=ignore-duplicates,return=representation' });
  return r?.length ?? 0;
}

// ---------- execução ----------
const cfg = Object.fromEntries((await api('settings?select=key,value')).map((s) => [s.key, s.value]));
const publicar = cfg.auto_publish_news !== false;
const DEEPL = (process.env.DEEPL_API_KEY || '').trim();
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let novas = 0, precos = 0, promocoes = 0, capas = 0, traduzidas = 0;

// Notícias em inglês são traduzidas (se houver chave do DeepL); senão ficam marcadas como "en"
async function prepararNoticias(itens) {
  for (const n of itens) n.lang = idioma(`${n.title} ${n.summary}`);
  const en = itens.filter((n) => n.lang === 'en');
  if (DEEPL && en.length) {
    try {
      const t = await traduzir(en.flatMap((n) => [n.title, n.summary || '']), DEEPL);
      en.forEach((n, i) => { n.title = t[i * 2]; n.summary = t[i * 2 + 1] || n.summary; n.lang = 'pt'; });
      traduzidas += en.length;
    } catch (e) { erros.push(`Tradução: ${e.message}`); }
  }
  return itens;
}

// 1) Feeds RSS oficiais
for (const feed of cfg.feeds || []) {
  try {
    const itens = lerRss(await (await baixar(feed.url)).text()).slice(0, POR_FEED);
    const n = await inserirNoticias(await prepararNoticias(itens.map((i) => ({ ...i, source: feed.name }))), publicar);
    novas += n; console.log(`RSS ${feed.name}: ${itens.length} lidas, ${n} novas`);
  } catch (e) { erros.push(`Feed ${feed.name}: ${e.message}`); }
}

// 2) Preços da Steam Brasil de TODO o catálogo, 100 jogos por consulta
const todos = [];
for (let de = 0; ; de += 1000) {
  const lote = await api(`games?select=id,steam_appid&steam_appid=not.is.null&order=id&limit=1000&offset=${de}`);
  todos.push(...lote);
  if (lote.length < 1000) break;
}
const atuais = new Map();
for (let de = 0; ; de += 1000) {
  const lote = await api(`deals?select=game_id,price_cents,original_cents,discount_pct&store=eq.steam&order=game_id&limit=1000&offset=${de}`);
  for (const d of lote) atuais.set(d.game_id, d);
  if (lote.length < 1000) break;
}
const porApp = new Map(todos.map((g) => [g.steam_appid, g.id]));
const apps = [...porApp.keys()];
console.log(`Consultando preços de ${apps.length} jogos da Steam...`);
for (let i = 0; i < apps.length; i += 100) {
  const ids = apps.slice(i, i + 100);
  try {
    const r = await (await baixar(`https://store.steampowered.com/api/appdetails?appids=${ids.join(',')}&cc=br&filters=price_overview`)).json();
    const mudou = [];
    for (const appid of ids) {
      const po = r?.[appid]?.success ? r[appid].data?.price_overview : null;
      const gid = porApp.get(appid), antes = atuais.get(gid);
      const novo = po ? { price_cents: po.final, original_cents: po.initial, discount_pct: po.discount_percent }
        : antes ? { price_cents: antes.price_cents, original_cents: antes.original_cents, discount_pct: 0 } : null; // saiu de promoção / gratuito
      if (!novo || (!antes && !(po?.discount_percent > 0))) continue; // só guarda jogos em promoção (ou que já tinham registro)
      if (po?.discount_percent > 0) promocoes++;
      if (antes && antes.price_cents === novo.price_cents && antes.discount_pct === novo.discount_pct) continue; // nada mudou
      mudou.push({ game_id: gid, store: 'steam', ...novo, url: `https://store.steampowered.com/app/${appid}/`, auto: true, updated_at: new Date().toISOString() });
    }
    if (mudou.length) { await api('deals?on_conflict=game_id,store', { method: 'POST', prefer: 'resolution=merge-duplicates', body: mudou }); precos += mudou.length; }
  } catch (e) { erros.push(`Preços Steam (lote ${i / 100 + 1}): ${e.message}`); }
  await espera(Number(process.env.ESPERA ?? 1500)); // respeita o limite de requisições da Steam
}

// 3) Capa e descrição em português: primeiro os jogos que estão com descrição em inglês ou sem descrição
const DETALHES = Number(process.env.STEAM_LOTE) || 150;
const prioridade = await api(`games?select=id,title,steam_appid,cover_url,description,description_lang,steam_checked_at&steam_appid=not.is.null&steam_checked_at=is.null&or=(description_lang.eq.en,description.is.null)&limit=${DETALHES}`);
const resto = prioridade.length < DETALHES ? await api(`games?select=id,title,steam_appid,cover_url,description,description_lang,steam_checked_at&steam_appid=not.is.null&order=steam_checked_at.asc.nullsfirst&limit=${DETALHES - prioridade.length}`) : [];
for (const g of [...prioridade, ...resto.filter((x) => !prioridade.some((p) => p.id === x.id))]) {
  try {
    const r = await (await baixar(`https://store.steampowered.com/api/appdetails?appids=${g.steam_appid}&cc=br&l=brazilian&filters=basic`)).json();
    const info = r[g.steam_appid]?.data;
    const patch = { steam_checked_at: new Date().toISOString() };
    if (!g.cover_url && /^https:\/\//.test(info?.header_image || '')) patch.cover_url = info.header_image;
    const desc = info?.short_description ? texto(info.short_description).slice(0, 1000) : null;
    // Só troca a descrição se a da Steam estiver em português (jogos sem tradução vêm em inglês)
    if (desc && idioma(desc) === 'pt' && (g.description_lang !== 'pt' || !g.description)) {
      if (g.description && g.description_lang === 'en') patch.description_en = g.description;
      patch.description = desc; patch.description_lang = 'pt';
    } else if (desc && !g.description) { patch.description = desc; patch.description_lang = idioma(desc); }
    if (patch.description || patch.cover_url) capas++;
    await api(`games?id=eq.${g.id}`, { method: 'PATCH', body: patch });
  } catch (e) { erros.push(`Detalhes Steam ${g.title}: ${e.message}`); }
  await espera(Number(process.env.ESPERA ?? 1600));
}

// 4) Anúncios oficiais na Steam: só para jogos em destaque ou que a comunidade avaliou
const comNoticias = await api('games?select=id,title,steam_appid&steam_appid=not.is.null&or=(featured.eq.true,reviews_count.gt.0)&order=reviews_count.desc&limit=60');
for (const g of comNoticias) {
  try {
    const r = await (await baixar(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${g.steam_appid}&count=${POR_JOGO_STEAM}&maxlength=600&feeds=steam_community_announcements&format=json`)).json();
    const itens = (r.appnews?.newsitems || []).map((i) => ({
      title: `${g.title}: ${texto(i.title)}`, link: i.url, summary: resumo(texto(i.contents)),
      date: new Date(i.date * 1000).toISOString(), image: null, source: 'Steam', game_id: g.id,
    }));
    // só traduz o que ainda não está no banco
    const ja = itens.length ? await api(`news?select=source_url&source_url=in.(${itens.map((n) => `"${n.link.replace(/"/g, '')}"`).join(',')})`) : [];
    const novosItens = itens.filter((n) => !ja.some((j) => j.source_url === n.link));
    novas += await inserirNoticias(await prepararNoticias(novosItens), publicar);
  } catch (e) { erros.push(`Notícias Steam ${g.title}: ${e.message}`); }
  await espera(300);
}

// 5) Lembretes de partidas (reserva, caso o pg_cron não esteja ativo)
const lembretes = await api('rpc/send_event_reminders', { method: 'POST', body: {} }).catch((e) => { erros.push(`Lembretes: ${e.message}`); return 0; });
if (lembretes) console.log(`Lembretes de partida enviados: ${lembretes}`);

// 6) Gamificação (reserva, caso o pg_cron não esteja ativo): premia o top 10 do mês e expira itens temporários
const premiados = await api('rpc/award_monthly_top', { method: 'POST', body: {} }).catch((e) => { erros.push(`Ranking mensal: ${e.message}`); return 0; });
if (premiados) console.log(`Top 10 do mês premiados: ${premiados}`);
await api('rpc/expire_cosmetics', { method: 'POST', body: {} }).catch((e) => erros.push(`Itens temporários: ${e.message}`));

// 7) Limpa promoções manuais vencidas
await api(`deals?auto=eq.false&ends_at=lt.${new Date().toISOString()}`, { method: 'DELETE' }).catch((e) => erros.push(e.message));

await api('settings?on_conflict=key', { method: 'POST', prefer: 'resolution=merge-duplicates',
  body: [{ key: 'last_sync', value: { at: new Date().toISOString(), news: novas, deals: precos, promos: promocoes, checked: apps.length, translated: traduzidas, errors: erros.slice(0, 20) } }] });

const resumoFinal = `Steam: ${apps.length} jogos verificados, ${promocoes} em promoção agora, ${precos} preços alterados. ${novas} notícias novas (${traduzidas} traduzidas). ${capas} jogos com capa/descrição em português. ${erros.length} erro(s).`;
console.log(gh ? `::notice::${resumoFinal}` : resumoFinal);
erros.slice(0, 30).forEach((e) => console.warn(gh ? `::warning::${e}` : ` - ${e}`));
