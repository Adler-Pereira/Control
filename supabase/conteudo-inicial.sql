-- =====================================================================
-- Conteúdo inicial para o lançamento: 4 desafios semanais (um por semana,
-- começando hoje), molduras e banner exclusivos de prêmio e uma notícia
-- de lançamento. Pode rodar mais de uma vez: o que já existe não duplica.
-- Rode DEPOIS do schema.sql (Supabase → SQL Editor → colar → Run).
-- Para mudar textos, datas ou prêmios depois: Admin → Desafios / Itens.
-- =====================================================================

-- ---------- Prêmios exclusivos (só se ganha vencendo o desafio) ----------
insert into public.cosmetics (id, kind, name, description, rarity, sort, custom, style) values
  ('f_premio_print',  'frame',  'Fotógrafo Virtual', 'Prêmio do desafio "Melhor print da semana"', 'epica',    1001, true,
     '{"cores":["#00e5ff","#7c4dff","#ff4081"],"animado":true,"brilho":true,"velocidade":5,"emoji":"📸"}'),
  ('f_premio_setup',  'frame',  'Mestre do Setup',   'Prêmio do desafio "Mostre seu setup"',       'epica',    1002, true,
     '{"cores":["#ffd33c","#ff6d00"],"animado":true,"brilho":true,"velocidade":4,"emoji":"🖥️"}'),
  ('f_premio_zerei',  'frame',  'Zerador',           'Prêmio do desafio "Zerei!"',                 'rara',     1003, true,
     '{"cores":["#00e676","#1de9b6","#00b0ff"],"animado":true,"velocidade":6,"emoji":"🏆"}'),
  ('f_premio_critico','frame',  'Crítico de Ouro',   'Prêmio do desafio "Indique um jogo esquecido"', 'lendaria', 1004, true,
     '{"cores":["#fff59d","#ffd33c","#b8860b"],"animado":true,"brilho":true,"velocidade":3,"emoji":"⭐"}'),
  ('b_premio_lancamento','banner','Fundador do Lançamento', 'Para quem participou de um desafio no mês de lançamento', 'especial', 1005, true,
     '{"cores":["#0b0b0d","#3a2f00","#ffd33c"]}')
on conflict (id) do nothing;

-- ---------- Desafios: um por semana, a partir de hoje ----------
insert into public.challenges (title, description, starts_at, ends_at, reward_cosmetic, reward_xp)
select d.titulo, d.descricao, now() + d.inicio, now() + d.inicio + interval '7 days', d.premio, d.xp
from (values
  ('📸 Melhor print da semana',
   'Poste o print mais bonito, épico ou engraçado que você tirou jogando. Vale paisagem, momento de chefe, bug bizarro... Os mais curtidos e a escolha da equipe ganham a moldura "Fotógrafo Virtual".',
   interval '0 days', 'f_premio_print', 200),
  ('🖥️ Mostre seu setup',
   'PC, console, cantinho do sofá ou o celular na mesa do trabalho: mostre onde a mágica acontece! Conte o que tem no seu setup. Prêmio: moldura "Mestre do Setup".',
   interval '7 days', 'f_premio_setup', 200),
  ('🏆 Zerei!',
   'Poste o print da tela final (ou dos créditos) de um jogo que você zerou recentemente e conte em uma frase o que achou. Marque o jogo no post! Prêmio: moldura "Zerador".',
   interval '14 days', 'f_premio_zerei', 250),
  ('💎 Indique um jogo esquecido',
   'Aquele jogo que pouca gente conhece e merece mais atenção. Marque o jogo, diga por que vale a pena e convença a galera. Prêmio: moldura "Crítico de Ouro".',
   interval '21 days', 'f_premio_critico', 300)
) as d(titulo, descricao, inicio, premio, xp)
where not exists (select 1 from public.challenges c where c.title = d.titulo);

-- ---------- Notícia de lançamento ----------
insert into public.news (title, summary, body, published)
select '🚀 O Control Critic está no ar!',
  'Feed com fotos, desafios semanais com prêmios, calls com tela compartilhada, Steam integrada e muito mais.',
  'Chegou a hora! O Control Critic agora é uma rede social completa de jogos. Poste prints e conquistas no feed, participe do desafio da semana para ganhar molduras exclusivas, '
  || 'monte sua vitrine de jogos favoritos, importe sua biblioteca da Steam e entre em call com a galera com compartilhamento de tela, sem precisar instalar nada. '
  || 'Encontrou algum problema ou tem uma ideia? Use o botão "🐞 Reportar problema" no rodapé de qualquer página. Bem-vindo!',
  true
where not exists (select 1 from public.news where title = '🚀 O Control Critic está no ar!');

-- Conferência: deve listar os 4 desafios com as datas
select title, starts_at::date as comeca, ends_at::date as termina, reward_cosmetic, reward_xp from public.challenges order by starts_at;
