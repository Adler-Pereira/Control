// Importa jogos do IGDB para o Supabase.
//   node scripts/igdb.mjs populares 5000   -> os N jogos mais avaliados de todas as plataformas
//   node scripts/igdb.mjs recentes          -> lançamentos dos últimos 60 dias (roda toda semana)
// Variáveis: IGDB_CLIENT_ID, IGDB_CLIENT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY
import { igdb, CAMPOS, FILTRO_BASE, paraLinha, supabaseRest } from '../lib/igdb.mjs';

const gh = !!process.env.GITHUB_ACTIONS;
const falhar = (m) => { console.error(gh ? `::error::${m}` : m); process.exit(1); };
process.on('unhandledRejection', (e) => falhar(`Falha: ${e?.message || e}`));

const env = (k) => (process.env[k] || '').trim();
const faltam = ['IGDB_CLIENT_ID', 'IGDB_CLIENT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'].filter((k) => !env(k));
if (faltam.length) falhar(`Segredos ausentes no GitHub: ${faltam.join(', ')}`);

const cred = { clientId: env('IGDB_CLIENT_ID'), secret: env('IGDB_CLIENT_SECRET') };
const api = supabaseRest(env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY'));
const modo = process.argv[2] || 'populares';
const total = Math.min(Number(process.argv[3]) || 5000, 20000);
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Categorias do site (slug -> id)
const cats = Object.fromEntries((await api('categories?select=id,slug')).map((c) => [c.slug, c.id]));

// Jogos que já existem (para não duplicar e só completar o que falta)
const existentes = [];
for (let de = 0; ; de += 1000) {
  const lote = await api(`games?select=id,slug,igdb_id,steam_appid,cover_url,description,category_id,release_year,store_ps,store_xbox,store_steam,store_nintendo,platforms&order=id&limit=1000&offset=${de}`);
  existentes.push(...lote);
  if (lote.length < 1000) break;
}
const porIgdb = new Map(existentes.filter((g) => g.igdb_id).map((g) => [Number(g.igdb_id), g]));
const porSteam = new Map(existentes.filter((g) => g.steam_appid).map((g) => [g.steam_appid, g]));
const porSlug = new Map(existentes.map((g) => [g.slug, g]));
console.log(`Catálogo atual: ${existentes.length} jogos. Modo: ${modo}.`);

const onde = modo === 'recentes'
  ? `${FILTRO_BASE} & first_release_date > ${Math.floor(Date.now() / 1000) - 60 * 86400} & first_release_date < ${Math.floor(Date.now() / 1000)} & hypes > 5`
  : `${FILTRO_BASE} & total_rating_count > 5`;
const ordem = modo === 'recentes' ? 'hypes desc' : 'total_rating_count desc';
const limite = modo === 'recentes' ? 300 : total;

let novos = 0, completados = 0, lidos = 0;
for (let offset = 0; offset < limite; offset += 500) {
  const jogos = await igdb('games', `${CAMPOS} where ${onde}; sort ${ordem}; limit ${Math.min(500, limite - offset)}; offset ${offset};`, cred);
  if (!jogos.length) break;
  lidos += jogos.length;
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
    // Já existe: só preenche campos vazios (não sobrescreve o que a equipe editou)
    const patch = {};
    for (const k of ['igdb_id', 'steam_appid', 'cover_url', 'description', 'category_id', 'release_year', 'store_ps', 'store_xbox', 'store_steam', 'store_nintendo'])
      if ((atual[k] == null || atual[k] === '') && linha[k] != null) patch[k] = linha[k];
    if (!atual.platforms?.length && linha.platforms.length) patch.platforms = linha.platforms;
    patch.igdb_rating = linha.igdb_rating; patch.igdb_rating_count = linha.igdb_rating_count;
    if (atual.id) { await api(`games?id=eq.${atual.id}`, { method: 'PATCH', body: patch }); completados++; Object.assign(atual, patch); }
  }
  if (inserir.length) {
    const r = await api('games?on_conflict=slug', { method: 'POST', body: inserir, prefer: 'resolution=ignore-duplicates,return=representation' });
    novos += r?.length ?? 0;
  }
  console.log(`  lote ${offset / 500 + 1}: ${jogos.length} lidos, ${inserir.length} novos`);
  await espera(300); // IGDB permite 4 requisições por segundo
}

await api('settings?on_conflict=key', { method: 'POST', prefer: 'resolution=merge-duplicates',
  body: [{ key: 'last_igdb', value: { at: new Date().toISOString(), modo, lidos, novos, completados } }] });
console.log(`Concluído: ${lidos} lidos no IGDB, ${novos} jogos novos, ${completados} existentes atualizados.`);
