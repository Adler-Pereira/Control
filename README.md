# Control Critic

Portal de jogos feito pela comunidade: **avaliações**, **notícias oficiais automáticas**, **promoções**,
**recomendações personalizadas**, **comunidades com mural, call de voz/vídeo e compartilhamento de tela**,
integração com o **Discord** (para quem joga no PS5/Xbox) e um **painel de administração**.

> Projeto da equipe Gustavo Barros Tenório, Giovanni Henrique de Lima Franco Matos, Adler Pereira de Lima e Danilo Silva Bernardino.

## Funcionalidades

| Área | O que faz |
|---|---|
| Jogos | Catálogo de milhares de jogos de todas as plataformas (via IGDB), com busca, filtros por categoria e plataforma, ordenação e paginação; busca ampliada adiciona qualquer jogo sob demanda |
| Avaliações | Nota de 1 a 5 estrelas e comentário; média recalculada automaticamente no banco |
| Perfil e XP | Cadastro/login, foto, banner, bio, contas de PSN/Xbox/Discord/Steam, categorias favoritas e perfil público com link para compartilhar; XP e níveis (+10 por avaliação, +5 por post, +20 por criar comunidade) |
| Recomendações | Sugestões por usuário com base nas categorias favoritas e nos jogos que ele avaliou bem |
| Comunidades | Criar/participar, mural em tempo real |
| Call | Voz, câmera e compartilhamento de tela direto no navegador (WebRTC), até ~6 pessoas |
| Discord / PS5 | Convite do servidor e widget mostrando quem está online e em call. Pelo console, entra-se na call pelo Discord vinculado |
| Notícias | Escritas pela equipe + importadas automaticamente (PlayStation Blog, Xbox Wire, anúncios oficiais da Steam) |
| Promoções | Preços e descontos da Steam (BR) atualizados automaticamente; outras lojas cadastradas no painel |
| Biblioteca | Jogando / Zerado / Quero jogar / Abandonei, horas jogadas e importação automática da biblioteca da Steam |
| Lista de desejos | Notificação automática quando um jogo desejado entra em promoção ou fica mais barato |
| Social | Seguir pessoas, perfil público, notificações em tempo real (sino) |
| Partidas | Agendar partidas nas comunidades, confirmar presença com limite de vagas, lembrete 1h antes e exportar para a agenda (.ics) |
| Segurança e LGPD | Denúncias com fila de moderação, Política de Privacidade, Termos de Uso, aceite no cadastro, baixar meus dados e excluir conta |
| App instalável | PWA: instala no celular/computador e abre mesmo sem internet (última versão) |
| Fale Conosco | Mensagens com assunto (inclusive pedidos de privacidade), respondidas pelo painel |
| Painel de Admin | Visão geral com números, jogos, notícias, promoções, moderação de avaliações/posts/comunidades, mensagens, usuários (papéis e banimento) e configuração do robô |

## Arquitetura

- **Front-end:** HTML, CSS e JavaScript puro (módulos ES). Sem build.
- **Back-end:** [Supabase](https://supabase.com) (login, Postgres, armazenamento de imagens e tempo real).
  Toda a segurança fica no banco, com Row Level Security (`supabase/schema.sql`).
- **Automação:** GitHub Actions roda `scripts/sync.mjs` a cada 6 horas (notícias e promoções, em lotes de 200 jogos por vez) e `scripts/igdb.mjs` todo dia (amplia o catálogo e traz lançamentos).
- **Função no servidor:** `netlify/functions/buscar-jogo.mjs` busca no IGDB e adiciona automaticamente os jogos procurados, sem expor as chaves.
- **Hospedagem:** Netlify, com deploy automático a cada push na `main`.

```
├── *.html              páginas
├── css/style.css       estilos
├── js/                 lógica de cada página (app.js = base comum, voz.js = calls)
├── img/                imagens
├── supabase/           schema.sql (tabelas, regras, automações) e seed.sql (dados iniciais)
├── scripts/            robô de sincronização e verificador de links
└── .github/workflows/  CI e robô agendado
```

## Como colocar no ar (passo a passo)

### 1. Supabase
1. Crie um projeto gratuito em supabase.com.
2. Em **SQL Editor**, cole e rode o conteúdo de `supabase/schema.sql` e depois o de `supabase/seed.sql`.
3. Em **Project Settings → API**, copie a **Project URL** e a **anon public key** para `js/config.js`.
   A anon key pode ficar pública. **Nunca** coloque a `service_role` key no site.
4. Em **Authentication → URL Configuration**, coloque o endereço do site (ex.: `https://controlcritic.netlify.app`) em *Site URL* e em *Redirect URLs*.

### 2. Primeiro administrador
Crie sua conta pelo site e rode no SQL Editor:
```sql
update profiles set role = 'admin' where username = 'SEU_USUARIO';
```
Depois disso, outros papéis podem ser dados pelo próprio painel (aba Usuários).

### 3. Netlify
1. **Add new site → Import from Git** e escolha este repositório.
2. Não há comando de build. O `netlify.toml` já está configurado.

### 4. Robô de notícias e promoções
No GitHub: **Settings → Secrets and variables → Actions**, crie:
- `SUPABASE_URL`: a Project URL
- `SUPABASE_SERVICE_KEY`: a **service_role** key (só aqui, nunca no código)

Para testar, vá em **Actions → Sincronizar notícias e promoções → Run workflow**.
O resultado aparece no painel de admin, na aba Automação.

### 5. Catálogo completo (IGDB)
1. Entre em **dev.twitch.tv/console** com uma conta da Twitch (ative a verificação em duas etapas, que é obrigatória).
2. **Register Your Application**: nome `Control Critic`, OAuth Redirect URL `http://localhost`, categoria *Website Integration*, tipo *Confidential*.
3. Abra o app, copie o **Client ID** e gere um **Client Secret**.
4. No **GitHub** (Settings → Secrets and variables → Actions), crie `IGDB_CLIENT_ID` e `IGDB_CLIENT_SECRET`.
5. No **Netlify** (Site configuration → Environment variables), crie `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`,
   `SUPABASE_URL` e `SUPABASE_SERVICE_KEY`, e faça um novo deploy. Essas variáveis ficam só no servidor e não aparecem no site.
6. Pronto: **todo dia** o robô "Importar jogos (IGDB)" adiciona os próximos 2.000 jogos mais populares e os lançamentos
   recentes, e a busca do site importa na hora qualquer jogo que alguém procurar e ainda não esteja no catálogo.
   Para acelerar a carga inicial, rode **Actions → Importar jogos (IGDB) → Run workflow** com uma quantidade maior.
   O resultado de cada execução aparece no resumo da execução no GitHub e em **Admin → Automação**.

Os dados de jogos vêm do [IGDB](https://www.igdb.com) (Twitch), com crédito no rodapé do site. Para uso comercial, confira os termos de uso do IGDB.

### 6. Importação da biblioteca da Steam
1. Gere uma chave gratuita em **steamcommunity.com/dev/apikey** (domínio: o endereço do site no Netlify).
2. No **Netlify**, crie a variável `STEAM_API_KEY` com essa chave e faça um novo deploy.
3. Cada pessoa usa em **Perfil → Importar da Steam**. O perfil e os "Detalhes de jogos" precisam estar públicos na Steam.
   PlayStation e Xbox não oferecem API oficial para isso.

### 7. Lembretes de partida
O `schema.sql` agenda os lembretes no próprio banco (extensão `pg_cron`, a cada 10 minutos). Se o Supabase não permitir
ativar a extensão, o robô de sincronização envia os lembretes como reserva (com menos precisão).

### 8. Discord em uma comunidade
Na página da comunidade, o dono clica em **Configurar** e cola:
- o **convite** (`https://discord.gg/...`), de preferência sem expiração;
- opcionalmente o **ID do servidor**, depois de ativar *Configurações do servidor → Widget → Habilitar widget*.

## Atualizar um projeto que já está no ar
Quando este repositório trouxer mudanças no banco, rode de novo, no SQL Editor, `supabase/schema.sql` e depois
`supabase/seed.sql`. Os dois podem ser executados várias vezes sem apagar nada: só adicionam o que falta.
Depois rode o robô (Actions → Run workflow) para buscar capas, descrições, preços e notícias dos jogos novos.

## Rodar localmente
Os módulos JS precisam de um servidor (abrir o arquivo direto não funciona):
```bash
npx serve .        # ou: python3 -m http.server 8000
```

## Textos legais
`privacidade.html` e `termos.html` são **modelos** escritos para o projeto. Revisem com a equipe/orientador e,
se o site crescer ou for monetizado, com um advogado.

## Limitações conhecidas
- **Calls** são ponto a ponto, então funcionam bem com até ~6 pessoas. Em redes muito restritas pode ser preciso
  configurar um servidor TURN em `js/config.js`. Consoles não abrem calls pelo navegador, por isso a integração com o Discord.
- **Promoções automáticas** só existem para a Steam (API pública). PlayStation e Xbox não têm API pública confiável,
  então essas ofertas são cadastradas no painel.
- Os **links das lojas** cadastrados no `seed.sql` devem ser conferidos. Alguns de Xbox apontam para a busca da loja.
