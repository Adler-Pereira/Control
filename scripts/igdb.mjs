// Importa jogos do IGDB para o Supabase.
//   node scripts/igdb.mjs continuo 2000    -> (automático, todo dia) próximos 2000 populares + lançamentos recentes
//   node scripts/igdb.mjs populares 5000   -> os N jogos mais avaliados, do início
//   node scripts/igdb.mjs recentes         -> só os lançamentos dos últimos 60 dias
// Variáveis: IGDB_CLIENT_ID, IGDB_CLIENT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY
import { igdb, CAMPOS, FILTRO_BASE, paraLinha, supabaseRest } from '../lib/igdb.mjs';

const gh = !!process.env.GITHUB_ACTIONS;
const falhar = (m) => { console.error(gh ? `::error::${m}` : m); process.exit(1); };
const aviso = (m) => console.log(gh ? `::notice::${m}` : m); // aparece no resumo da execução no GitHub
process.on('unhandledRejection', (e) => falhar(`Falha: ${e?.message || e}`));

const env = (k) => (process.env[k] || '').trim();
const faltam = ['IGDB_CLIENT_ID', 'IGDB_CLIENT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'].filter((k) => !env(k));
if (faltam.length) falhar(`Segredos ausentes no GitHub: ${faltam.join(', ')}`);

const cred = { clientId: env('IGDB_CLIENT_ID'), secret: env('IGDB_CLIENT_SECRET') };
const api = supabaseRest(env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY'));
const modo = process.argv[2] || 'continuo';
const qtd = Math.min(Number(process.argv[3]) || (modo === 'populares' ? 5000 : 2000), 20000);
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
const agora = Math.floor(Date.now() / 1000);

const cats = Object.fromEntries((await api('categories?select=id,slug')).map((c) => [c.slug, c.id]));
const cfg = Object.fromEntries((await api('settings?select=key,value')).map((s) => [s.key, s.value]));

// Jogos que já existem (para não duplicar e só completar o que falta)
const existentes = [];
for (let de = 0; ; de += 1000) {
  const lote = await api(`games?select=id,slug,igdb_id,steam_appid,cover_url,description_lang,category_id,release_year,store_ps,store_xbox,store_steam,store_nintendo,platforms,videos,igdb_rating_count&order=id&limit=1000&offset=${de}`);
  existentes.push(...lote);
  if (lote.length < 1000) break;
}
const porIgdb = new Map(existentes.filter((g) => g.igdb_id).map((g) => [Number(g.igdb_id), g]));
const porSteam = new Map(existentes.filter((g) => g.steam_appid).map((g) => [g.steam_appid, g]));
const porSlug = new Map(existentes.map((g) => [g.slug, g]));
const antes = existentes.length;
console.log(`Catálogo atual: ${antes} jogos. Modo: ${modo}.`);

const totais = { lidos: 0, novos: 0, completados: 0 };

async function importar(onde, ordem, inicio, quantidade) {
  let lidosAqui = 0;
  for (let offset = inicio; offset < inicio + quantidade; offset += 500) {
    const jogos = await igdb('games', `${CAMPOS} where ${onde}; sort ${ordem}; limit ${Math.min(500, inicio + quantidade - offset)}; offset ${offset};`, cred);
    if (!jogos.length) break;
    lidosAqui += jogos.length;
    const inserir = [];
    for (const g of jogos) {
      const linha = paraLinha(g, cats);
      if (!linha.title || !linha.slug) continue;
      const atual = porIgdb.get(g.id) || (linha.steam_appid && porSteam.get(linha.steam_appid)) || porSlug.get(linha.slug);
      if (!atual) {
        inserir.push(linha);
        porSlug.set(linha.slug, linha); porIgdb.set(g.id, linha);
        continue;
      }
      if (!atual.id) continue;
      // Já existe: só preenche campos vazios (não sobrescreve o que a equipe editou)
      const patch = {};
      for (const k of ['igdb_id', 'steam_appid', 'cover_url', 'category_id', 'release_year', 'store_ps', 'store_xbox', 'store_steam', 'store_nintendo'])
        if ((atual[k] == null || atual[k] === '') && linha[k] != null) patch[k] = linha[k];
      if (!atual.description_lang && linha.description) { patch.description = linha.description; patch.description_lang = 'en'; } // sem descrição ainda
      if (!atual.platforms?.length && linha.platforms.length) patch.platforms = linha.platforms;
      if (!atual.videos?.length && linha.videos.length) patch.videos = linha.videos;
      // Popularidade só é regravada quando muda bastante (evita milhares de gravações inúteis)
      if (Math.abs((atual.igdb_rating_count || 0) - linha.igdb_rating_count) > 20 || patch.igdb_id) {
        patch.igdb_rating = linha.igdb_rating; patch.igdb_rating_count = linha.igdb_rating_count;
      }
      if (Object.keys(patch).length) {
        await api(`games?id=eq.${atual.id}`, { method: 'PATCH', body: patch });
        Object.assign(atual, patch); totais.completados++;
      }
    }
    if (inserir.length) {
      const r = await api('games?on_conflict=slug', { method: 'POST', body: inserir, prefer: 'resolution=ignore-duplicates,return=representation' });
      totais.novos += r?.length ?? 0;
    }
    console.log(`  offset ${offset}: ${jogos.length} lidos, ${inserir.length} novos`);
    await espera(300); // IGDB permite 4 requisições por segundo
  }
  totais.lidos += lidosAqui;
  return lidosAqui;
}

const POPULARES = `${FILTRO_BASE} & total_rating_count > 5`;
const RECENTES = `${FILTRO_BASE} & first_release_date > ${agora - 60 * 86400} & first_release_date < ${agora} & (hypes > 3 | total_rating_count > 0)`;
let proximoOffset = Number(cfg.igdb_offset) || 0;

if (modo === 'populares') {
  await importar(POPULARES, 'total_rating_count desc', 0, qtd);
  proximoOffset = Math.max(proximoOffset, qtd);
} else if (modo === 'recentes') {
  await importar(RECENTES, 'first_release_date desc', 0, 500);
} else {
  // Contínuo: avança pela lista de populares a cada dia; ao chegar no fim, recomeça (atualiza notas e links)
  const lidos = await importar(POPULARES, 'total_rating_count desc', proximoOffset, qtd);
  proximoOffset = lidos < qtd ? 0 : proximoOffset + qtd;
  await importar(RECENTES, 'first_release_date desc', 0, 500);
}

const depois = antes + totais.novos;
await api('settings?on_conflict=key', { method: 'POST', prefer: 'resolution=merge-duplicates', body: [
  { key: 'last_igdb', value: { at: new Date().toISOString(), modo, ...totais, catalogo: depois } },
  { key: 'igdb_offset', value: proximoOffset },
] });
aviso(`IGDB (${modo}): ${totais.lidos} lidos, ${totais.novos} jogos novos, ${totais.completados} atualizados. Catálogo: ${antes} → ${depois} jogos. Próxima posição na lista: ${proximoOffset}.`);
