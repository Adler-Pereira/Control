-- Dados iniciais: categorias e os jogos que já estavam no site original.
-- Os links das lojas podem ser conferidos e editados depois pelo painel de admin.

insert into public.categories (name, slug) values
  ('Ação','acao'), ('Arcade','arcade'), ('Aventura','aventura'), ('Estratégia','estrategia'),
  ('FPS','fps'), ('Esportes','esportes'), ('Luta','luta'), ('Simulação','simulacao'),
  ('Terror','terror'), ('Música','musica'), ('Indies','indies'), ('Mobile','mobile'), ('RPG','rpg')
on conflict (slug) do nothing;

insert into public.games (slug, title, description, cover_url, release_year, category_id, featured, store_ps, store_xbox, store_steam)
values
  ('resident-evil-village', 'Resident Evil Village', 'Ethan Winters enfrenta horrores em um vilarejo misterioso no leste europeu.',
   'img/jogos/revi.jpg', 2021, (select id from categories where slug='terror'), true,
   'https://www.playstation.com/pt-br/games/resident-evil-village/',
   'https://www.xbox.com/pt-br/games/store/Resident-Evil-Village/9MW7MFV29CMF',
   'https://store.steampowered.com/app/1196590/'),
  ('god-of-war-ragnarok', 'God of War Ragnarök', 'Kratos e Atreus viajam pelos Nove Reinos enquanto o Ragnarök se aproxima.',
   'img/jogos/GodOfWar.png', 2022, (select id from categories where slug='acao'), true,
   'https://www.playstation.com/pt-br/games/god-of-war-ragnarok/', null,
   'https://store.steampowered.com/app/2322010/'),
  ('the-last-of-us-part-ii', 'The Last of Us Part II', 'Ellie parte em uma jornada de vingança em um mundo pós-apocalíptico.',
   'img/jogos/TLOUP2.png', 2020, (select id from categories where slug='acao'), true,
   'https://www.playstation.com/pt-br/games/the-last-of-us-part-ii-remastered/', null, null),
  ('multiversus', 'MultiVersus', 'Jogo de luta em equipe com personagens da Warner Bros.',
   'img/jogos/Multiversus.png', 2024, (select id from categories where slug='luta'), true,
   'https://www.playstation.com/pt-br/games/multiversus/',
   'https://www.xbox.com/pt-br/games/store/multiversus/9ndkxxbl90gf',
   'https://store.steampowered.com/app/1818750/'),
  ('stray', 'Stray', 'Um gato perdido explora uma cidade cibernética habitada por robôs.',
   'img/jogos/Stray.png', 2022, (select id from categories where slug='aventura'), true,
   'https://www.playstation.com/pt-br/games/stray/',
   'https://www.xbox.com/pt-BR/search?q=Stray',
   'https://store.steampowered.com/app/1332010/'),
  ('hollow-knight-silksong', 'Hollow Knight: Silksong', 'Hornet explora um reino desconhecido nesta sequência do aclamado metroidvania.',
   'img/jogos/HollowKnightSS.png', 2025, (select id from categories where slug='indies'), true,
   'https://www.playstation.com/pt-br/games/hollow-knight-silksong/',
   'https://www.xbox.com/pt-BR/search?q=Hollow%20Knight%20Silksong',
   'https://store.steampowered.com/app/1030300/'),
  ('hogwarts-legacy', 'Hogwarts Legacy', 'RPG de mundo aberto ambientado no universo de Harry Potter no século XIX.',
   'img/jogos/Hogwarts.png', 2023, (select id from categories where slug='rpg'), true,
   'https://www.playstation.com/pt-br/games/hogwarts-legacy/',
   'https://www.xbox.com/pt-BR/games/hogwarts-legacy',
   'https://store.steampowered.com/app/990080/'),
  ('lego-star-wars-skywalker-saga', 'LEGO Star Wars: A Saga Skywalker', 'Os nove filmes da saga Skywalker em versão LEGO.',
   'img/jogos/LegoSW.png', 2022, (select id from categories where slug='aventura'), true,
   'https://www.playstation.com/pt-br/games/lego-star-wars-the-skywalker-saga/',
   'https://www.xbox.com/pt-BR/search?q=LEGO%20Star%20Wars%20Skywalker',
   'https://store.steampowered.com/app/920210/'),
  ('elden-ring', 'Elden Ring', 'RPG de ação em mundo aberto criado pela FromSoftware e George R. R. Martin.',
   'img/jogos/EldenRing.png', 2022, (select id from categories where slug='rpg'), true,
   'https://www.playstation.com/pt-br/games/elden-ring/',
   'https://www.xbox.com/pt-BR/search?q=Elden%20Ring',
   'https://store.steampowered.com/app/1245620/'),
  ('the-witcher-3', 'The Witcher 3: Wild Hunt', 'Geralt de Rívia procura Ciri em um vasto mundo de fantasia sombria.',
   'img/jogos/TheWitcher.png', 2015, (select id from categories where slug='rpg'), true,
   'https://www.playstation.com/pt-br/games/the-witcher-3-wild-hunt/',
   'https://www.xbox.com/pt-BR/search?q=The%20Witcher%203',
   'https://store.steampowered.com/app/292030/')
on conflict (slug) do nothing;

-- IDs da Steam usados pelo robô de promoções e notícias
update public.games set steam_appid = 1196590 where slug = 'resident-evil-village';
update public.games set steam_appid = 2322010 where slug = 'god-of-war-ragnarok';
update public.games set steam_appid = 1818750 where slug = 'multiversus';
update public.games set steam_appid = 1332010 where slug = 'stray';
update public.games set steam_appid = 1030300 where slug = 'hollow-knight-silksong';
update public.games set steam_appid = 990080 where slug = 'hogwarts-legacy';
update public.games set steam_appid = 920210 where slug = 'lego-star-wars-skywalker-saga';
update public.games set steam_appid = 1245620 where slug = 'elden-ring';
update public.games set steam_appid = 292030 where slug = 'the-witcher-3';

-- =====================================================================
-- Catálogo ampliado (seguro rodar mais de uma vez).
-- Capas e descrições destes jogos são preenchidas pelo robô a partir da Steam.
-- =====================================================================
insert into public.games (slug, title, release_year, category_id, steam_appid, store_steam) values
  ('counter-strike-2', 'Counter-Strike 2', 2023, (select id from categories where slug='fps'), 730, 'https://store.steampowered.com/app/730/'),
  ('apex-legends', 'Apex Legends', 2020, (select id from categories where slug='fps'), 1172470, 'https://store.steampowered.com/app/1172470/'),
  ('helldivers-2', 'Helldivers 2', 2024, (select id from categories where slug='acao'), 553850, 'https://store.steampowered.com/app/553850/'),
  ('grand-theft-auto-v', 'Grand Theft Auto V', 2015, (select id from categories where slug='acao'), 271590, 'https://store.steampowered.com/app/271590/'),
  ('sekiro', 'Sekiro: Shadows Die Twice', 2019, (select id from categories where slug='acao'), 814380, 'https://store.steampowered.com/app/814380/'),
  ('black-myth-wukong', 'Black Myth: Wukong', 2024, (select id from categories where slug='acao'), 2358720, 'https://store.steampowered.com/app/2358720/'),
  ('monster-hunter-wilds', 'Monster Hunter Wilds', 2025, (select id from categories where slug='acao'), 2246340, 'https://store.steampowered.com/app/2246340/'),
  ('forspoken', 'Forspoken', 2023, (select id from categories where slug='acao'), 1680880, 'https://store.steampowered.com/app/1680880/'),
  ('red-dead-redemption-2', 'Red Dead Redemption 2', 2019, (select id from categories where slug='aventura'), 1174180, 'https://store.steampowered.com/app/1174180/'),
  ('cuphead', 'Cuphead', 2017, (select id from categories where slug='arcade'), 268910, 'https://store.steampowered.com/app/268910/'),
  ('vampire-survivors', 'Vampire Survivors', 2022, (select id from categories where slug='arcade'), 1794680, 'https://store.steampowered.com/app/1794680/'),
  ('baldurs-gate-3', 'Baldur''s Gate 3', 2023, (select id from categories where slug='rpg'), 1086940, 'https://store.steampowered.com/app/1086940/'),
  ('cyberpunk-2077', 'Cyberpunk 2077', 2020, (select id from categories where slug='rpg'), 1091500, 'https://store.steampowered.com/app/1091500/'),
  ('dota-2', 'Dota 2', 2013, (select id from categories where slug='estrategia'), 570, 'https://store.steampowered.com/app/570/'),
  ('civilization-vi', 'Sid Meier''s Civilization VI', 2016, (select id from categories where slug='estrategia'), 289070, 'https://store.steampowered.com/app/289070/'),
  ('age-of-empires-ii-de', 'Age of Empires II: Definitive Edition', 2019, (select id from categories where slug='estrategia'), 813780, 'https://store.steampowered.com/app/813780/'),
  ('forza-horizon-5', 'Forza Horizon 5', 2021, (select id from categories where slug='esportes'), 1551360, 'https://store.steampowered.com/app/1551360/'),
  ('street-fighter-6', 'Street Fighter 6', 2023, (select id from categories where slug='luta'), 1364780, 'https://store.steampowered.com/app/1364780/'),
  ('tekken-8', 'Tekken 8', 2024, (select id from categories where slug='luta'), 1778820, 'https://store.steampowered.com/app/1778820/'),
  ('mortal-kombat-1', 'Mortal Kombat 1', 2023, (select id from categories where slug='luta'), 1971870, 'https://store.steampowered.com/app/1971870/'),
  ('stardew-valley', 'Stardew Valley', 2016, (select id from categories where slug='simulacao'), 413150, 'https://store.steampowered.com/app/413150/'),
  ('euro-truck-simulator-2', 'Euro Truck Simulator 2', 2012, (select id from categories where slug='simulacao'), 227300, 'https://store.steampowered.com/app/227300/'),
  ('microsoft-flight-simulator', 'Microsoft Flight Simulator', 2020, (select id from categories where slug='simulacao'), 1250410, 'https://store.steampowered.com/app/1250410/'),
  ('resident-evil-4', 'Resident Evil 4 (Remake)', 2023, (select id from categories where slug='terror'), 2050650, 'https://store.steampowered.com/app/2050650/'),
  ('dead-space', 'Dead Space (Remake)', 2023, (select id from categories where slug='terror'), 1693980, 'https://store.steampowered.com/app/1693980/'),
  ('phasmophobia', 'Phasmophobia', 2020, (select id from categories where slug='terror'), 739630, 'https://store.steampowered.com/app/739630/'),
  ('hi-fi-rush', 'Hi-Fi Rush', 2023, (select id from categories where slug='musica'), 1817230, 'https://store.steampowered.com/app/1817230/'),
  ('beat-saber', 'Beat Saber', 2019, (select id from categories where slug='musica'), 620980, 'https://store.steampowered.com/app/620980/'),
  ('crypt-of-the-necrodancer', 'Crypt of the NecroDancer', 2015, (select id from categories where slug='musica'), 247080, 'https://store.steampowered.com/app/247080/'),
  ('hades', 'Hades', 2020, (select id from categories where slug='indies'), 1145360, 'https://store.steampowered.com/app/1145360/'),
  ('hades-ii', 'Hades II', 2025, (select id from categories where slug='indies'), 1145350, 'https://store.steampowered.com/app/1145350/'),
  ('hollow-knight', 'Hollow Knight', 2017, (select id from categories where slug='indies'), 367520, 'https://store.steampowered.com/app/367520/'),
  ('celeste', 'Celeste', 2018, (select id from categories where slug='indies'), 504230, 'https://store.steampowered.com/app/504230/')
on conflict (slug) do nothing;

insert into public.games (slug, title, description, release_year, category_id) values
  ('clash-royale', 'Clash Royale', 'Duelos de cartas e torres em tempo real da Supercell.', 2016, (select id from categories where slug='mobile')),
  ('brawl-stars', 'Brawl Stars', 'Batalhas rápidas em equipe com dezenas de personagens.', 2018, (select id from categories where slug='mobile')),
  ('pokemon-go', 'Pokémon GO', 'Capture Pokémon pelo mundo real usando o GPS do celular.', 2016, (select id from categories where slug='mobile'))
on conflict (slug) do nothing;

-- Comunidades iniciais (sem dono: administradas pela equipe)
insert into public.communities (name, description, game_id)
select v.name, v.description, (select id from games where slug = v.jogo)
from (values
  ('Geral', 'Papo livre sobre jogos, lançamentos e o que você está jogando agora.', null),
  ('Bora Jogar (LFG)', 'Procurando grupo? Poste plataforma, jogo e horário e chame a galera para a call.', null),
  ('PlayStation BR', 'Troféus, PS Plus e jogatinas no PS5. Entre na call pelo Discord do console.', null),
  ('Soulslike BR', 'Elden Ring, Sekiro e companhia: builds, chefes e ajuda em co-op.', 'elden-ring'),
  ('FPS Competitivo', 'CS2, Apex e outros: times, treinos e campeonatos.', 'counter-strike-2'),
  ('Terror à Meia-Noite', 'Resident Evil, Dead Space, Phasmophobia: jogue com as luzes apagadas.', 'phasmophobia'),
  ('Indies que Merecem', 'Hades, Hollow Knight, Celeste e outras pérolas independentes.', 'hollow-knight-silksong'),
  ('Luta e FGC', 'Street Fighter 6, Tekken 8 e Mortal Kombat 1: combos e torneios.', 'street-fighter-6')
) as v(name, description, jogo)
where not exists (select 1 from communities c where c.name = v.name);

-- Notícia de boas-vindas
insert into public.news (title, summary, body, published)
select 'Bem-vindo ao novo Control Critic!',
  'Avaliações, comunidades com call de voz, notícias oficiais e promoções em um só lugar.',
  'O Control Critic agora é uma rede social de jogos! Crie sua conta, avalie o que você jogou e ganhe XP, participe das comunidades, entre em call (com compartilhamento de tela) direto pelo navegador ou pelo Discord no console, e acompanhe notícias oficiais e promoções atualizadas automaticamente. Personalize seu perfil com banner e suas contas de PSN, Xbox, Steam e Discord.',
  true
where not exists (select 1 from news where title = 'Bem-vindo ao novo Control Critic!');
