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
