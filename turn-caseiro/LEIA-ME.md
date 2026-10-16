# TURN caseiro (grátis, usando o seu computador)

> **Tem CGNAT (passo 0)?** Então este método não funciona. Use a pasta **`turn-proprio`**:
> - `GUIA-ORACLE.md`: servidor grátis na nuvem, recomendado;
> - `GUIA-IPV6-CASA.md`: o seu PC, pelo IPv6.

Quando o computador está ligado, ele retransmite o áudio/vídeo de quem não consegue conexão direta na call.
Com ele desligado, a call continua funcionando para quem consegue se conectar direto (e usa a Cloudflare, se estiver configurada).

## O que passa pelo TURN (e quanto de internet gasta)

O TURN retransmite **tudo** da call de quem precisa dele: **voz, câmera e tela compartilhada**.

Ele só entra quando duas pessoas não conseguem se conectar direto, por exemplo no 4G ou em redes com CGNAT. Na maioria das calls a conexão é direta e o seu PC nem é usado.

Quando é usado, cada transmissão retransmitida passa pela sua internet: **entra** do lado de quem envia e **sai** para quem assiste. Por pessoa que recebe pelo TURN:

| O que é transmitido | Gasto aproximado |
|---|---|
| Voz | 0,05 Mbps |
| Câmera 720p | 1,2 Mbps |
| Tela 720p | 2,5 Mbps |
| Tela 1080p | 4 Mbps |

Exemplo: alguém compartilha a tela em 1080p para 3 pessoas, todas pelo TURN. Isso gasta uns **12 Mbps de upload** da sua internet (e o mesmo de download).

Com 20 a 50 Mbps de upload, dá conta tranquilo de uma ou duas calls assim. Se ficar pesado, peça para quem transmite usar 720p.

## 0. Verifique se é possível (CGNAT)
1. Abra o painel do seu roteador (geralmente http://192.168.0.1 ou http://192.168.1.1) e veja o **IP WAN**.
2. Compare com o IP de https://ifconfig.me
   - **Iguais** → ótimo, dá para continuar.
   - **Diferentes**, ou o IP WAN começa com `100.64` a `100.127` → seu provedor usa **CGNAT** e o TURN caseiro não vai funcionar.
     Dá para pedir ao provedor um "IP público" (alguns liberam de graça, outros cobram) — ou fique com a Cloudflare/Discord.

## 1. Instale o Docker Desktop
https://www.docker.com/products/docker-desktop (Windows: ele usa o WSL2; aceite as instalações que ele pedir).

## 2. Configure
1. Copie esta pasta `turn-caseiro` para o seu computador.
2. Edite `turnserver.conf`:
   - `static-auth-secret=` uma senha longa e aleatória (ex.: gere em https://www.random.org/strings/ com 40 caracteres).
   - `external-ip=` o IP de https://ifconfig.me
3. No Windows/Mac: em `docker-compose.yml`, apague a linha `network_mode: host` e tire o `#` das linhas de `ports`.

## 3. Libere as portas no roteador (redirecionamento de portas / port forwarding)
Aponte para o IP do seu PC na rede de casa (veja com `ipconfig` no Windows, campo "Endereço IPv4"):
- **3478** UDP e TCP
- **49160 a 49200** UDP

No Windows, permita também no Firewall quando ele perguntar (ou crie regras de entrada para essas portas).

## 4. Ligue o servidor
Na pasta `turn-caseiro`, abra o terminal e rode:
```
docker compose up -d
```
Ele liga sozinho junto com o Docker Desktop. Para parar: `docker compose down`.

## 5. Avise o site (Netlify → Site configuration → Environment variables)
- `TURN_URL` = `turn:SEU_IP_PUBLICO:3478` (ou `turn:seunome.duckdns.org:3478`)
- `TURN_SECRET` = a mesma senha do `static-auth-secret`

Depois: **Deploys → Trigger deploy**.

## IP que muda (opcional, recomendado)
Se o seu IP público muda de tempos em tempos, crie um endereço grátis em https://www.duckdns.org,
instale o atualizador deles no PC, e use `turn:seunome.duckdns.org:3478` no `TURN_URL`.
Quando o IP mudar, atualize também o `external-ip` do `turnserver.conf` e reinicie (`docker compose restart`).

## Testar
Em https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/ não dá para usar o segredo direto;
o jeito mais simples é: com o servidor ligado, peça para um amigo em outra rede (ex.: 4G) entrar na call com você.
Se conectar e aparecer áudio/vídeo, está funcionando.

## Cuidados
- Quem usar a retransmissão se conecta ao **IP da sua casa** (o site não mostra esse IP, mas ele aparece para o navegador).
- A configuração já **bloqueia acesso à sua rede local** e limita o número de conexões e a velocidade.
- Nunca publique o `static-auth-secret` (nem no GitHub).
