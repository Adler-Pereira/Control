// Robô semanal (segunda de manhã):
//  1) Steam: atualiza horas e conquistas de quem já vinculou a Steam (só jogos que já estão na biblioteca/catálogo)
//  3) Limpeza: apaga stories vencidos e os arquivos deles do armazenamento
//  2) Desafio: se não houver desafio aberto, abre o próximo da lista (7 dias), com moldura de prêmio
// Variáveis: SUPABASE_URL, SUPABASE_SERVICE_KEY, STEAM_API_KEY (opcional: sem ela pula a parte da Steam)
import { supabaseRest } from '../lib/igdb.mjs';
import { steam, importarConquistas } from '../lib/steam.mjs';

const gh = !!process.env.GITHUB_ACTIONS;
const env = (k) => (process.env[k] || '').trim();
const aviso = (m) => console.log(gh ? `::notice::${m}` : m);
if (!env('SUPABASE_URL') || !env('SUPABASE_SERVICE_KEY')) { console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_KEY'); process.exit(1); }
const api = supabaseRest(env('SUPABASE_URL').replace(/\/+(rest\/v1)?\/*$/, ''), env('SUPABASE_SERVICE_KEY'));

// ---------- 1) Steam ----------
async function steamSemanal() {
  if (!env('STEAM_API_KEY')) return aviso('Steam: pulado (falta o segredo STEAM_API_KEY no GitHub).');
  const perfis = await api('profiles?select=id,username,steam_id&steam_id=not.is.null&limit=5000');
  let ok = 0, falhas = 0;
  for (const p of perfis) {
    try {
      const dono = await steam('IPlayerService/GetOwnedGames/v1', { steamid: p.steam_id, include_appinfo: '1', include_played_free_games: '1' });
      const jogos = (dono.response?.games || []).filter((g) => g.appid);
      if (!jogos.length) continue;   // perfil ficou privado: não apaga nada
      const porAppid = new Map();
      for (let i = 0; i < jogos.length; i += 150)
        for (const g of await api(`games?select=id,steam_appid&steam_appid=in.(${jogos.slice(i, i + 150).map((g) => g.appid).join(',')})`)) porAppid.set(g.steam_appid, g.id);
      const linhas = jogos.filter((g) => porAppid.has(g.appid)).map((g) => ({
        user_id: p.id, game_id: porAppid.get(g.appid), hours: Math.round((g.playtime_forever || 0) / 6) / 10, updated_at: new Date().toISOString(),
        hours_2weeks: g.playtime_2weeks ? Math.round(g.playtime_2weeks / 6) / 10 : null,
        last_played: g.rtime_last_played ? new Date(g.rtime_last_played * 1000).toISOString() : null,
      }));
      for (let i = 0; i < linhas.length; i += 500)
        await api('user_games?on_conflict=user_id,game_id', { method: 'POST', body: linhas.slice(i, i + 500), prefer: 'resolution=merge-duplicates' });
      await importarConquistas(p.steam_id, jogos, porAppid, p.id, api).catch(() => {});
      ok++;
    } catch (e) { falhas++; console.log(`Steam ${p.username}: ${e.message}`); }
    await new Promise((r) => setTimeout(r, 1500));   // gentil com o limite da Steam
  }
  aviso(`Steam: ${ok} perfil(is) atualizado(s)${falhas ? `, ${falhas} com erro` : ''}.`);
}

// ---------- 2) Desafio da semana ----------
const DESAFIOS = [
  { title: 'Melhor print da semana', description: 'Poste o print mais bonito que você tirou num jogo esta semana. Vence quem tiver mais curtidas + escolha da equipe.', premio: 'f_premio_print' },
  { title: 'Zerei!', description: 'Zerou algum jogo? Poste a tela final ou os créditos e conte o que achou.', premio: 'f_premio_zerei' },
  { title: 'Mostre seu setup', description: 'Foto do seu canto gamer: PC, console, cadeira, tudo. Capricha na iluminação!', premio: 'f_premio_setup' },
  { title: 'Indique um jogo esquecido', description: 'Aquele jogo bom que ninguém comenta. Poste com o jogo marcado e diga por que vale a pena.', premio: 'f_premio_critico' },
  { title: 'Momento mais engraçado', description: 'Bug, fail ou zoeira: poste o print ou meme do momento mais engraçado da semana.', premio: null },
  { title: 'Personagem favorito', description: 'Poste seu personagem favorito de todos os tempos e o motivo.', premio: null },
];
async function desafioSemanal() {
  const agora = new Date().toISOString();
  const abertos = await api(`challenges?select=id&ends_at=gt.${agora}&limit=1`);
  if (abertos.length) return aviso('Desafio: já existe um desafio aberto ou agendado, nada a fazer.');
  const ultimos = await api('challenges?select=title&order=created_at.desc&limit=6');
  const usados = new Set(ultimos.map((c) => c.title));
  const d = DESAFIOS.find((x) => !usados.has(x.title)) || DESAFIOS[0];
  const premios = d.premio ? await api(`cosmetics?select=id&id=eq.${d.premio}`) : [];
  const fim = new Date(Date.now() + 7 * 864e5 - 36e5).toISOString();
  await api('challenges', { method: 'POST', body: [{ title: d.title, description: d.description, starts_at: agora, ends_at: fim, reward_cosmetic: premios[0]?.id || null, reward_xp: 200 }] });
  aviso(`Desafio: aberto "${d.title}" até ${fim.slice(0, 10)}. Premie os vencedores em Admin → Desafios.`);
}

// ---------- 3) Limpeza: stories vencidos (que não viraram destaque) somem do banco e do armazenamento ----------
async function limparStories() {
  const limite = new Date(Date.now() - 2 * 864e5).toISOString();
  const velhos = await api(`stories?select=id,image_url,video_url&highlight=is.null&expires_at=lt.${limite}&limit=1000`);
  if (!velhos.length) return aviso('Limpeza: nenhum story vencido.');
  const base = env('SUPABASE_URL').replace(/\/+(rest\/v1)?\/*$/, '');
  const caminhos = velhos.flatMap((s) => [s.image_url, s.video_url]).filter(Boolean)
    .map((u) => u.split('/storage/v1/object/public/media/')[1]).filter(Boolean);
  const chave = env('SUPABASE_SERVICE_KEY');
  for (let i = 0; i < caminhos.length; i += 100) {
    await fetch(`${base}/storage/v1/object/media`, { method: 'DELETE', headers: { apikey: chave, ...(chave.startsWith('eyJ') ? { Authorization: `Bearer ${chave}` } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: caminhos.slice(i, i + 100) }) }).catch(() => {});
  }
  for (let i = 0; i < velhos.length; i += 200) await api(`stories?id=in.(${velhos.slice(i, i + 200).map((s) => s.id).join(',')})`, { method: 'DELETE' });
  aviso(`Limpeza: ${velhos.length} story(s) vencido(s) e ${caminhos.length} arquivo(s) apagados.`);
}

const so = process.argv[2];
if (!so || so === 'limpeza') await limparStories();
if (!so || so === 'steam') await steamSemanal();
if (!so || so === 'desafio') await desafioSemanal();
