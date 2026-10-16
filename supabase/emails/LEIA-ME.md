# E-mails do site pelo Brevo (sem o limite do Supabase)

O e-mail padrão do Supabase manda poucos e-mails por hora para o site **inteiro**. Num lançamento, com vários amigos se cadastrando ao mesmo tempo (ou alguém errando o e-mail), o cadastro trava.

Com o **Brevo** o plano grátis manda **300 e-mails por dia**. Tempo: uns 20 minutos.

---

## 1. Criar a conta no Brevo
1. Entre em https://www.brevo.com/pt/ → **Cadastre-se grátis**.
2. Preencha o perfil (nome, "empresa": pode ser `Control Critic`, site: `https://control-critic.netlify.app`).
3. Se pedir para escolher plano, fique no **Free**.

> O Brevo às vezes **analisa a conta** antes de liberar envios (pode levar de minutos a 1 dia). Se aparecer um aviso de "conta em validação", responda o que eles pedirem.

## 2. Cadastrar o remetente
O e-mail que aparece como "De:" nas mensagens.
1. No Brevo: menu do seu nome (canto superior direito) → **Senders, Domains & Dedicated IPs** → aba **Senders** → **Add a sender**.
2. Nome: `Control Critic`. E-mail: um e-mail seu (ex.: um Gmail criado para o site, como `controlcritic.site@gmail.com`).
3. O Brevo manda um código para esse e-mail: confirme.

> **Sobre cair no spam:** usando um Gmail como remetente, parte das mensagens pode ir para o spam (o Gmail não "assina" e-mails enviados por outros serviços). Funciona para o lançamento entre amigos; peça para a galera olhar o spam e marcar "não é spam".
> Para o melhor resultado, o ideal é um **domínio próprio** (ex.: `controlcritic.com.br`, cerca de R$ 40/ano no registro.br) autenticado no Brevo (aba **Domains**). Isso pode ficar para depois.

## 3. Pegar os dados do SMTP
1. No Brevo: menu do seu nome → **SMTP & API** → aba **SMTP**.
2. Anote:
   - **SMTP Server:** `smtp-relay.brevo.com`
   - **Port:** `587`
   - **Login:** um endereço parecido com `xxxxxx@smtp-brevo.com`
3. Clique em **Generate a new SMTP key**, dê o nome `supabase` e **copie a chave** (ela só aparece uma vez). Ela é a **senha** do SMTP. Não cole no chat nem no GitHub.

## 4. Colocar no Supabase
1. Supabase → **Authentication → Emails** (ou **Authentication → SMTP Settings**, conforme a versão do painel) → **SMTP Settings** → ligue **Enable Custom SMTP**.
2. Preencha:

| Campo | Valor |
|---|---|
| Sender email | o e-mail confirmado no passo 2 |
| Sender name | `Control Critic` |
| Host | `smtp-relay.brevo.com` |
| Port number | `587` |
| Minimum interval between emails | `10` (segundos, padrão) |
| Username | o **Login** do passo 3 (`...@smtp-brevo.com`) |
| Password | a **SMTP key** do passo 3 |

3. **Save**.

## 5. Aumentar o limite do Supabase
1. Supabase → **Authentication → Rate Limits**.
2. **Rate limit for sending emails:** coloque `100` (por hora). O Brevo grátis aguenta 300 por dia.
3. **Save**.

## 6. E-mails em português (com a cara do site)
1. Supabase → **Authentication → Emails** → aba **Templates**.
2. Para cada modelo, troque o **Subject** e cole o conteúdo do arquivo desta pasta no **Message body** (no GitHub, abra o arquivo → botão **Raw** → copie tudo):

| Modelo no Supabase | Assunto (Subject) | Arquivo |
|---|---|---|
| Confirm signup | `Confirme seu e-mail no Control Critic` | `confirmar-cadastro.html` |
| Reset password | `Redefinir sua senha do Control Critic` | `redefinir-senha.html` |
| Change email address | `Confirme seu novo e-mail` | `trocar-email.html` |
| Invite user | `Você foi convidado para o Control Critic` | `convite.html` |

3. Salve cada um.

## 7. Conferir os endereços de retorno
Para os links dos e-mails levarem de volta ao site certo:
1. Supabase → **Authentication → URL Configuration**.
2. **Site URL:** `https://control-critic.netlify.app`
3. **Redirect URLs:** adicione `https://control-critic.netlify.app/**`
4. **Save**.

## 8. Testar
1. Abra o site numa janela anônima e crie uma conta com um e-mail seu.
2. O e-mail deve chegar em até 1 minuto, em português, com o botão amarelo. Olhe o spam também.
3. No Brevo, em **Transactional → Logs** (ou **Statistics**), dá para ver cada e-mail enviado e se foi entregue.

---

## Problemas comuns
| O que acontece | O que fazer |
|---|---|
| Cadastro dá erro "Error sending confirmation email" | Login ou SMTP key errados, ou o remetente não foi confirmado no Brevo (passo 2). Gere uma SMTP key nova e cole de novo. |
| Brevo diz que a conta está "em validação" / suspensa | Responda o formulário do Brevo; até liberar, os envios não saem. |
| E-mail não chega | Veja o spam; confira em Brevo → Logs se foi enviado. Se não aparece lá, o problema está nos dados do passo 4. |
| Link do e-mail abre "localhost" ou dá erro | Ajuste o passo 7 (Site URL e Redirect URLs). |
| Ainda aparece "email rate limit exceeded" | Faça o passo 5 (ele só aparece depois de ligar o SMTP próprio). |
