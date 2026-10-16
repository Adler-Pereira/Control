// Backup semanal das tabelas do Control Critic em arquivos JSON (GitHub Actions guarda por 90 dias).
// Não inclui senhas nem e-mails (ficam no serviço de login do Supabase, fora destas tabelas).
// Variáveis: SUPABASE_URL e SUPABASE_SERVICE_KEY.
import { mkdirSync, writeFileSync } from 'node:fs';
import { supabaseRest } from '../lib/igdb.mjs';

const env = (k) => (process.env[k] || '').trim();
if (!env('SUPABASE_URL') || !env('SUPABASE_SERVICE_KEY')) { console.error('::error::Segredos SUPABASE_URL/SUPABASE_SERVICE_KEY ausentes.'); process.exit(1); }
const api = supabaseRest(env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY'));

// Ordem pensada para restaurar (tabelas "pai" primeiro)
const TABELAS = ['categories', 'settings', 'site_titles', 'cosmetics', 'profiles', 'games', 'deals', 'price_history', 'news', 'reviews', 'review_votes', 'review_comments',
  'communities', 'community_secrets', 'community_members', 'community_requests', 'posts', 'events', 'event_attendees', 'user_games', 'user_lists', 'list_items',
  'follows', 'friendships', 'direct_messages', 'lfg_posts', 'lfg_interest', 'user_cosmetics', 'notifications', 'reports', 'contact_messages', 'xp_log', 'admin_log'];

const pasta = `backup-${new Date().toISOString().slice(0, 10)}`;
mkdirSync(pasta, { recursive: true });
const resumo = [];
for (const t of TABELAS) {
  const linhas = [];
  try {
    for (let de = 0; ; de += 1000) {
      const lote = await api(`${t}?select=*&limit=1000&offset=${de}`);
      linhas.push(...lote);
      if (lote.length < 1000) break;
    }
    writeFileSync(`${pasta}/${t}.json`, JSON.stringify(linhas));
    resumo.push(`${t}: ${linhas.length}`);
  } catch (e) {
    resumo.push(`${t}: não exportada (${e.message.slice(0, 80)})`);
  }
}
writeFileSync(`${pasta}/LEIA-ME.txt`, `Backup do Control Critic em ${new Date().toISOString()}\n\n${resumo.join('\n')}\n`);
console.log(`::notice::Backup concluído: ${resumo.join(' · ')}`);
