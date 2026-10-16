# TURN no seu PC por IPv6 (opcional, complementa a Oracle)

## Antes de começar: vale a pena?
A sua internet tem **CGNAT**, então ninguém de fora alcança o seu PC pelo IPv4. Pelo **IPv6** dá, porque o seu provedor entrega IPv6 público (os endereços que começam com `2804:`).

**Limitação importante:**
- Pelo IPv6, o TURN do seu PC só atende quem **também tem IPv6**. Hoje isso é a maioria no 4G/5G da Vivo, Claro e TIM, e uma parte da internet fixa.
- Quem não tem IPv6 usa a **Oracle** e, se ela falhar, a **Cloudflare**.
- Quando as duas pessoas têm IPv6, muitas vezes elas já se conectam **direto**, sem TURN.

Ou seja, este servidor ajuda numa parte pequena das calls. **Faça primeiro a Oracle** (`GUIA-ORACLE.md`) e deixe este para depois, se quiser.

**Requisitos:**
- **Windows 11** (versão 22H2 ou mais nova);
- o **PC ligado** para atender.

Tempo: uns 30 minutos.

---

## 1. Instalar o Ubuntu dentro do Windows (WSL)
1. Abra o **PowerShell como administrador**: botão direito no menu Iniciar → "Terminal (Admin)".
2. Rode o comando abaixo e reinicie o PC se ele pedir:
   ```
   wsl --install -d Ubuntu
   ```
   Se você já instalou o Docker Desktop, o WSL já existe e isso só acrescenta o Ubuntu.
3. Abra o **Ubuntu** pelo menu Iniciar. Ele vai pedir para criar um usuário e uma senha do Linux; anote.

## 2. Fazer o Ubuntu usar a mesma rede do Windows (modo "espelhado")
1. Feche o Ubuntu. No PowerShell (admin), rode:
   ```
   notepad "$env:USERPROFILE\.wslconfig"
   ```
2. O Bloco de Notas abre (aceite criar o arquivo, se perguntar). Cole o texto abaixo e salve:
   ```
   [wsl2]
   networkingMode=mirrored
   ```
3. No PowerShell (admin), libere a entrada no Ubuntu e no Windows. São 4 comandos:
   ```
   wsl --shutdown
   Set-NetFirewallHyperVVMSetting -Name '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -DefaultInboundAction Allow
   New-NetFirewallRule -DisplayName "TURN Control Critic (UDP)" -Direction Inbound -Protocol UDP -LocalPort 3478,49160-49400 -Action Allow
   New-NetFirewallRule -DisplayName "TURN Control Critic (TCP)" -Direction Inbound -Protocol TCP -LocalPort 3478 -Action Allow
   ```

## 3. Instalar o TURN (mesmo script da Oracle)
1. Abra o Ubuntu e cole o comando abaixo. Use o **mesmo segredo** da Oracle:
   ```
   curl -fsSL https://raw.githubusercontent.com/Control-Critic/Constrol/main/turn-proprio/instalar.sh -o instalar.sh && sudo bash instalar.sh "SEU_SEGREDO" casa
   ```
2. No final aparecem **✅ TURN ligado!** e o seu IPv6 fixo, já no formato do Netlify. Exemplo: `turn:[2804:1eec:2f00:78a::10]:3478`.
   - Se aparecer "não encontrado", rode `ipconfig` no PowerShell. Use o **"Endereço IPv6"**, e não o **"Endereço IPv6 Temporário"**, que muda todo dia.

## 4. Liberar o IPv6 no roteador (Huawei)
Por padrão, o roteador da operadora bloqueia conexões IPv6 que chegam de fora.
1. Entre em http://192.168.18.1, com o usuário de administrador (a etiqueta embaixo do roteador costuma ter os dados).
2. Procure em **Security** (Segurança) por **Firewall Level** ou por opções de **IPv6**.
3. Permita conexões de entrada por IPv6. As opções mais comuns são:
   - deixar o nível do firewall em **Low**;
   - desmarcar o bloqueio de entrada IPv6;
   - criar uma regra liberando as portas **3478** (UDP e TCP) e **49160 a 49400** (UDP) para o IPv6 do seu PC.
4. Se essas opções não existirem ou estiverem bloqueadas, a operadora travou o acesso. Nesse caso este método não funciona. Tudo bem: a Oracle cobre.

## 5. Avisar o site (Netlify)
1. Em **Environment variables**, edite o `TURN_URL` e acrescente o endereço do PC **depois** do da Oracle, separado por vírgula:
   ```
   turn:IP_DA_ORACLE:3478,turn:[SEU_IPV6]:3478
   ```
2. O `TURN_SECRET` continua o mesmo.
3. Clique em **Deploys → Trigger deploy**.

## 6. Ligar sozinho quando o PC ligar
O Ubuntu do WSL só roda quando é chamado. Para o TURN subir sozinho ao entrar no Windows, rode no PowerShell (admin):
```
schtasks /create /tn "TURN Control Critic" /sc onlogon /rl highest /tr "wsl -d Ubuntu -u root service coturn start"
```

## 7. Testar
1. No **celular, no 4G**, com o Wi-Fi desligado, entre no site como admin.
2. Abra **Admin → Site → 📡 Servidores de retransmissão → Testar agora**.
3. O endereço `[2804:...]` deve aparecer **✅ respondendo**. No Wi-Fi de casa o teste não vale, porque o PC está na mesma rede.

---

## Cuidados
- **O IPv6 pode mudar:** se o provedor trocar o seu prefixo (costuma acontecer quando o roteador reinicia), o endereço muda.
  - Para descobrir o novo, rode `ipconfig` de novo.
  - Atualize o `TURN_URL` no Netlify e faça um novo deploy.
  - O teste do admin mostra ❌ quando isso acontece.
- **Quem usa este TURN se conecta ao IPv6 da sua casa.** O site não exibe esse endereço, mas o navegador da outra pessoa vê.
- O servidor já vem com limites de uso e bloqueia o acesso à sua rede interna.
- Para desligar: no Ubuntu, `sudo service coturn stop`. Para tirar de vez, apague a tarefa com `schtasks /delete /tn "TURN Control Critic"`.
