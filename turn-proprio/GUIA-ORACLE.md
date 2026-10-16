# TURN grátis na Oracle Cloud (sempre ligado, sem depender do seu PC)

A Oracle oferece de graça, para sempre, máquinas virtuais com IP público e **10 TB de tráfego de saída por mês**. É mais do que suficiente para as calls do Control Critic.

Com o TURN dela configurado, a call usa **primeiro o seu TURN**. A Cloudflare só entra se ele não responder.

Tempo: uns 30 minutos.

> **Cartão de crédito:** o cadastro pede um cartão, só para verificar a identidade. Usando apenas recursos marcados como **"Always Free"**, não há cobrança.

---

## 1. Criar a conta
1. Entre em https://www.oracle.com/br/cloud/free/ → **Comece gratuitamente**.
2. Em **Home Region**, escolha **Brazil East (Sao Paulo)** ou **Brazil Southeast (Vinhedo)**. Fica mais perto de vocês, o que dá menos atraso na call. **Não dá para mudar depois.**
3. Termine o cadastro e a verificação do cartão. A conta pode levar alguns minutos para ficar pronta.

## 2. Criar a máquina
1. No painel, abra **Menu ☰ → Compute → Instances → Create instance**.
2. Dê um nome, por exemplo `turn-controlcritic`.
3. Em **Image and shape**, clique em **Edit**:
   - **Image:** Change image → **Canonical Ubuntu 24.04**.
   - **Shape:** Change shape → **Ampere → VM.Standard.A1.Flex** com **1 OCPU e 6 GB**, que aparece como "Always Free-eligible".
     - Se der **"Out of capacity"**, escolha **Specialty and previous generation → VM.Standard.E2.1.Micro**, que também é grátis, ou tente outro "Availability domain".
4. Em **Networking**, deixe criar uma rede nova (**Create new virtual cloud network**) e marque **Assign a public IPv4 address**.
5. Em **Add SSH keys**, escolha **Generate a key pair for me** e clique em **Save private key**. Guarde esse arquivo `.key`: ele é a "chave da porta" da máquina.
6. Clique em **Create**. Em 1 ou 2 minutos fica **Running**. Anote o **Public IP address**.

## 3. Entrar na máquina
1. Mova o arquivo `.key` para uma pasta fácil, por exemplo `C:\oracle\turn.key`.
2. Abra o **Terminal** do Windows (PowerShell) e rode os comandos abaixo. O primeiro só arruma a permissão do arquivo, sem isso o SSH recusa a chave:
   ```
   icacls C:\oracle\turn.key /inheritance:r /grant:r "$($env:USERNAME):(R)"
   ssh -i C:\oracle\turn.key ubuntu@IP_PUBLICO_DA_MAQUINA
   ```
3. Na pergunta "Are you sure you want to continue connecting", digite `yes`. Você está dentro quando aparecer `ubuntu@turn-controlcritic:~$`.

## 4. Abrir as portas no painel da Oracle
A Oracle bloqueia tudo por padrão. Para liberar só o necessário:
1. Na página da instância, clique na **Subnet** (em "Primary VNIC").
2. Em **Security Lists**, abra a **Default Security List**.
3. Clique em **Add Ingress Rules** e adicione três regras, todas com **Source CIDR** `0.0.0.0/0`:

| IP Protocol | Destination Port Range |
|---|---|
| UDP | `3478` |
| TCP | `3478` |
| UDP | `49160-49400` |

## 5. Instalar o TURN (um comando)
1. Crie um **segredo**: uma senha longa, com 30 a 40 letras e números, sem espaços. Gere em https://www.random.org/strings/.
   - Use **o mesmo segredo** em todos os seus servidores TURN (Oracle e PC de casa).
   - Ele é igual ao `TURN_SECRET` do Netlify.
2. No terminal da máquina (passo 3), cole o comando abaixo, trocando `SEU_SEGREDO`:
   ```
   curl -fsSL https://raw.githubusercontent.com/Control-Critic/Constrol/main/turn-proprio/instalar.sh -o instalar.sh && sudo bash instalar.sh "SEU_SEGREDO" oracle
   ```
3. No final aparece **✅ TURN ligado!** e a linha que vai no Netlify, por exemplo `turn:129.146.10.20:3478`.

## 6. Avisar o site (Netlify)
1. Abra **Site configuration → Environment variables**.
2. **`TURN_URL`:** cole a linha do passo 5, por exemplo `turn:129.146.10.20:3478`.
   - Se depois for usar também o PC de casa, separe os dois por vírgula: `turn:129.146.10.20:3478,turn:[2804:...]:3478`.
   - Se você já tinha um `TURN_URL` antigo (do TURN caseiro que não funcionou), **substitua**.
3. **`TURN_SECRET`:** o segredo do passo 5.
4. Mantenha as variáveis da Cloudflare: ela continua como reserva.
5. **Deploys → Trigger deploy**.

## 7. Testar
1. No site, abra **Admin → Site → 📡 Servidores de retransmissão → Testar agora**.
2. O endereço da Oracle deve aparecer **✅ respondendo**.
3. O teste final é uma call com alguém no 4G compartilhando a tela.

---

## Cuidados
- **Máquina parada por falta de uso:** a Oracle pode desligar máquinas grátis que ficam quase sem uso por 7 dias seguidos, e um TURN passa a maior parte do tempo parado.
  - Se acontecer, é só clicar em **Start** na instância. O IP continua o mesmo.
  - Para evitar de vez, mude a conta para **Pay As You Go** (Billing → Upgrade). Você continua sem pagar nada enquanto usar só o "Always Free", e a Oracle para de recolher máquinas paradas.
- **IP fixo:** o IP público continua o mesmo enquanto a instância existir. Se apagar a instância e criar outra, atualize o `TURN_URL`.
- **Trocar o segredo:** rode o comando do passo 5 de novo com o segredo novo e atualize o `TURN_SECRET` no Netlify.
- **Ver o estado do servidor:** entre na máquina e rode `sudo systemctl status coturn`. Para ver o registro de uso: `sudo journalctl -u coturn -n 50`.
- O arquivo `.key` e o segredo **não** vão para o GitHub nem para o chat.
