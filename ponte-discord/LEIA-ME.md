# Ponte de voz: Discord ↔ call do site

Com a ponte ligada, **quem está no canal de voz do Discord (inclusive pelo PS5/Xbox) e quem está na call da comunidade no site se ouvem**.

## Como funciona

- Um robô do Control Critic entra no canal de voz do Discord.
- Na call do site, ele aparece como um participante chamado **🎮 Discord**.
- O áudio vai e volta entre as duas salas.
- A ponte **liga sozinha** quando tem gente nos dois lados e **desliga sozinha** 30 segundos depois que um lado esvazia.

**Limitações:**
- **Só voz.** O Discord não permite que robôs transmitam tela ou câmera, então o compartilhamento de tela continua só no site.
- No Discord, todo mundo do site aparece como **uma pessoa só** (o robô).
- No site, todo mundo do Discord aparece como **um quadro só** ("🎮 Discord").
- **Só funciona com o seu PC ligado** e o Docker Desktop aberto.

Tempo total da primeira instalação: uns 30 a 40 minutos. Depois, ela liga sozinha.

---

## Parte 1: Instalar o Docker Desktop (uma vez só)

O Docker é o programa que roda a ponte (e o TURN caseiro, se você quiser) sem você precisar instalar Node, bibliotecas etc.

1. Confira se o Windows é 10 ou 11, 64 bits. Em **Configurações → Sistema → Sobre**, deve aparecer "Sistema operacional de 64 bits".
2. Baixe o **Docker Desktop for Windows** em https://www.docker.com/products/docker-desktop/ e instale. Deixe marcada a opção **"Use WSL 2 instead of Hyper-V"**.
3. Se o instalador pedir para atualizar ou instalar o **WSL**, aceite. Se ele não fizer sozinho:
   - abra o **PowerShell como administrador** (botão direito no menu Iniciar → "Terminal (Admin)");
   - rode `wsl --install`;
   - reinicie o PC.
4. Reinicie o PC quando pedir.
5. Abra o **Docker Desktop**. Pode pular o login ("Continue without signing in"). Espere aparecer **"Engine running"** com a bolinha verde, no canto inferior esquerdo.
6. Para a ponte voltar sozinha quando o PC ligar: no Docker Desktop, vá na engrenagem ⚙️ → **General** → marque **"Start Docker Desktop when you sign in to your computer"**.

> **Erro de "virtualização" ou "WSL 2 installation is incomplete"?** A virtualização precisa estar ligada na BIOS. Procure no Google "ativar virtualização BIOS" junto com a marca da sua placa-mãe ou notebook. Normalmente a opção se chama **Intel VT-x**, **Intel Virtualization Technology** ou **AMD SVM**.

---

## Parte 2: Baixar os arquivos da ponte

1. Abra https://github.com/Control-Critic/Constrol
2. Clique no botão verde **Code → Download ZIP**.
3. Extraia o ZIP numa pasta fácil, por exemplo `C:\ControlCritic`.
4. A pasta que você vai usar é `C:\ControlCritic\Constrol-main\ponte-discord`.

---

## Parte 3: Criar o robô no Discord (uma vez só)

1. Entre em https://discord.com/developers/applications e faça login.
2. **New Application** → nome `Control Critic` → aceite os termos → **Create**.
3. No menu da esquerda, abra **Bot**:
   - Se quiser, troque a foto do robô pela do Adelino.
   - Em **Token**, clique em **Reset Token** e copie o código que aparecer. **Esse token é a senha do robô:** não mande para ninguém, não cole no chat nem no GitHub. Se vazar, volte aqui e clique em Reset Token de novo.
   - Desmarque **Public Bot**, para só você poder adicionar o robô em servidores.
   - As opções de "Privileged Gateway Intents" **não** precisam ser ligadas.
4. Convide o robô para o seu servidor:
   1. No menu da esquerda, abra **OAuth2 → URL Generator**.
   2. Em **Scopes**, marque **bot**.
   3. Em **Bot Permissions**, marque **View Channels**, **Connect**, **Speak** e **Use Voice Activity**.
   4. Copie a URL gerada lá embaixo, abra no navegador, escolha o servidor da comunidade e clique em **Autorizar**.
5. Se o canal de voz for restrito, dê ao cargo do robô permissão de **Ver canal**, **Conectar** e **Falar** nesse canal.

---

## Parte 4: Pegar os números (IDs)

**ID do canal de voz:**
1. No Discord, ligue o modo desenvolvedor em **Configurações de usuário → Avançado → Modo desenvolvedor**.
2. Clique com o botão direito no **canal de voz** que vai ter a ponte → **Copiar ID do canal**. É um número com uns 18 dígitos.

**Número da comunidade no site:**
1. Abra a comunidade no site.
2. O número fica no endereço. Exemplo: em `comunidade.html?id=3`, o número é `3`.

---

## Parte 5: Preencher o arquivo de configuração

1. Na pasta `ponte-discord`, copie o arquivo `.env.exemplo` e renomeie a cópia para **`.env`** (só isso, sem "exemplo" e sem ".txt").
   - Se o Windows esconder as extensões, ligue no Explorador de Arquivos: **Exibir → Mostrar → Extensões de nomes de arquivos**.
2. Abra o `.env` com o Bloco de Notas e preencha:
   - `DISCORD_TOKEN=` o token do robô (Parte 3).
   - `PONTES=` o número da comunidade, dois-pontos e o ID do canal. Exemplo: `PONTES=3:123456789012345678`
     - Para várias comunidades, separe por vírgula: `3:1234...,7:5678...`
   - `SUPABASE_CHAVE_PUBLICA=` a **Publishable key**. Ela está no Supabase em Project Settings → API Keys, e é a mesma que está no `js/config.js` do site.
   - `SUPABASE_SERVICE_KEY=` preencha **só se a comunidade for privada**. É a Secret key do Supabase. Se a comunidade for pública, deixe vazio.
3. Salve. No Bloco de Notas, em "Tipo", escolha **Todos os arquivos**, para ele não salvar como `.env.txt`.

---

## Parte 6: Ligar a ponte

1. Abra o Docker Desktop e espere ficar verde.
2. Na pasta `ponte-discord`, dê dois cliques em **`ligar.bat`**. Na primeira vez ele baixa e monta tudo, o que leva de 2 a 5 minutos.
3. Dê dois cliques em **`ver-registro.bat`**. Deve aparecer algo assim:
   ```
   discord: conectado como Control Critic#1234
   TURN do site obtido.
   ponte "Nome da Comunidade" pronta: call do site <-> #nome-do-canal
   ```
4. **Teste com outra pessoa:**
   1. Alguém entra no canal de voz do Discord.
   2. Você entra na call da comunidade no site.
   3. Em até 15 segundos, o robô entra no Discord e aparece **🎮 Discord** na call do site. No chat da call chega o aviso "Ponte ligada".
   4. Falem dos dois lados.

**Para desligar:** dê dois cliques em `desligar.bat`.

**Para atualizar** (quando houver versão nova): baixe o ZIP de novo, copie o seu `.env` para a pasta nova e rode `ligar.bat`.

---

## Problemas comuns

| O que aparece | O que fazer |
|---|---|
| `ligar.bat` diz que não encontrou o docker | Abra o Docker Desktop e espere ficar verde. Se acabou de instalar, reinicie o PC. |
| `Faltam variáveis no .env` | O arquivo não se chama exatamente `.env` (talvez `.env.txt`), ou falta preencher algum campo. |
| `An invalid token was provided` | O token está errado ou foi trocado. Gere outro em Bot → Reset Token. |
| `Canal de voz ... não encontrado` | O robô não foi convidado para o servidor (Parte 3, item 4), o ID não é de um canal de **voz**, ou o robô não tem permissão de ver o canal. |
| `Comunidade X não encontrada` | Confira o número da comunidade no endereço do site. |
| `... é privada: coloque SUPABASE_SERVICE_KEY` | Preencha a Secret key no `.env` (só no seu PC; nunca no GitHub). |
| O robô entra no Discord, mas no site ninguém ouve | Provavelmente é a rede. Veja se o registro mostra `TURN do site obtido`. Se mostrar `Sem TURN`, configure a Cloudflare ou o TURN caseiro no Netlify (README do site). |
| A voz do site picota no Discord | Feche programas pesados ou downloads. A ponte mistura o áudio em tempo real e precisa de um pouco de CPU. |
| Ouço minha própria voz de volta | Alguém está **nas duas calls ao mesmo tempo** (no Discord e no site). Cada pessoa deve ficar em uma só. |

Depois de corrigir o `.env`, rode `ligar.bat` de novo.

---

## (Opcional) TURN caseiro no mesmo Docker

Se quiser usar o seu PC também como servidor TURN (para as calls do site funcionarem em redes difíceis), siga a pasta `turn-caseiro`. Com o Docker Desktop já instalado, falta só:
- verificar o CGNAT;
- preencher o `turnserver.conf`;
- liberar as portas no roteador;
- rodar `docker compose up -d` naquela pasta.

O passo a passo está em `turn-caseiro/LEIA-ME.md`.

## Segurança

- O `.env` fica só no seu PC. Ele já está no `.gitignore` e nunca deve ir para o GitHub.
- O robô só ouve e fala no canal configurado. Ele não lê mensagens de texto, nem grava ou guarda áudio.
- Quem estiver no canal com a ponte ligada está sendo transmitido para a call do site, e vice-versa. Vale avisar a galera do servidor, por exemplo na descrição do canal: "🔗 Este canal está ligado à call do Control Critic".
