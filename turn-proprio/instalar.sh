#!/usr/bin/env bash
# Instala o servidor TURN (coturn) do Control Critic num Ubuntu: máquina grátis da Oracle Cloud ou o Ubuntu do Windows (WSL).
#   Uso:  sudo bash instalar.sh "SEU_SEGREDO_LONGO" oracle     (máquina na Oracle Cloud)
#         sudo bash instalar.sh "SEU_SEGREDO_LONGO" casa       (seu PC, atendendo por IPv6)
# O segredo é o mesmo que vai na variável TURN_SECRET do Netlify (e igual em todos os seus servidores TURN).
set -euo pipefail

SEGREDO="${1:-}"
MODO="${2:-oracle}"
if [ "$(id -u)" != "0" ]; then echo "Rode com sudo:  sudo bash instalar.sh \"SEGREDO\" $MODO"; exit 1; fi
if [ "${#SEGREDO}" -lt 20 ] || [[ "$SEGREDO" =~ [[:space:]\"\'] ]]; then
  echo "O segredo precisa ter pelo menos 20 caracteres, sem espaços nem aspas (use letras e números)."; exit 1
fi
if [ "$MODO" != "oracle" ] && [ "$MODO" != "casa" ]; then echo "O segundo parâmetro deve ser oracle ou casa."; exit 1; fi

echo "==> Instalando o coturn..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq coturn curl >/dev/null

EXTERNO=""
if [ "$MODO" = "oracle" ]; then
  PUBLICO="$(curl -4 -s --max-time 10 https://ifconfig.me || true)"
  PRIVADO="$(hostname -I | awk '{print $1}')"
  if [ -z "$PUBLICO" ]; then echo "Não consegui descobrir o IP público da máquina."; exit 1; fi
  # Na Oracle a máquina só enxerga o IP privado; o público chega por NAT 1:1
  EXTERNO="external-ip=${PUBLICO}/${PRIVADO}"
fi

echo "==> Escrevendo /etc/turnserver.conf"
cat > /etc/turnserver.conf <<CONF
# Gerado por instalar.sh (Control Critic). Para mudar o segredo, rode o instalar.sh de novo.
listening-port=3478
${EXTERNO}
realm=controlcritic
use-auth-secret
static-auth-secret=${SEGREDO}
min-port=49160
max-port=49400
# Limites (evitam abuso): conexões por usuário/total e banda por sessão (4 Mbps = tela 1080p)
user-quota=8
total-quota=80
max-bps=4000000
stale-nonce=600
fingerprint
no-cli
no-tlsv1
no-tlsv1_1
no-multicast-peers
# Não deixa ninguém usar o servidor para alcançar redes internas
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=::1
denied-peer-ip=fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
denied-peer-ip=fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff
simple-log
CONF
chmod 640 /etc/turnserver.conf
chown root:turnserver /etc/turnserver.conf 2>/dev/null || true

if [ "$MODO" = "oracle" ]; then
  echo "==> Liberando as portas no firewall interno da máquina (as imagens da Oracle bloqueiam tudo por padrão)"
  for proto in udp tcp; do iptables -C INPUT -p $proto --dport 3478 -j ACCEPT 2>/dev/null || iptables -I INPUT -p $proto --dport 3478 -j ACCEPT; done
  iptables -C INPUT -p udp --dport 49160:49400 -j ACCEPT 2>/dev/null || iptables -I INPUT -p udp --dport 49160:49400 -j ACCEPT
  echo iptables-persistent iptables-persistent/autosave_v4 boolean true | debconf-set-selections
  echo iptables-persistent iptables-persistent/autosave_v6 boolean true | debconf-set-selections
  apt-get install -y -qq iptables-persistent >/dev/null
  netfilter-persistent save >/dev/null
fi

echo "==> Ligando o serviço (e deixando ligar sozinho)"
sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn 2>/dev/null || true
if command -v systemctl >/dev/null && systemctl is-system-running >/dev/null 2>&1 || [ -d /run/systemd/system ]; then
  systemctl enable coturn >/dev/null 2>&1 || true
  systemctl restart coturn
  sleep 2
  systemctl is-active --quiet coturn && ATIVO=1 || ATIVO=0
else
  service coturn restart && ATIVO=1 || ATIVO=0
fi

echo
if [ "$ATIVO" = "1" ]; then echo "✅ TURN ligado!"; else echo "❌ O coturn não ligou. Veja o erro com: sudo journalctl -u coturn -n 30"; exit 1; fi
if [ "$MODO" = "oracle" ]; then
  echo "Coloque no Netlify (TURN_URL; separe por vírgula se tiver mais de um servidor):"
  echo "    turn:${PUBLICO}:3478"
  echo "Lembre de liberar as portas também no painel da Oracle (Security List): veja o GUIA-ORACLE.md, passo 4."
else
  IPV6="$(ip -6 addr show scope global 2>/dev/null | awk '/inet6/ && !/temporary/ && !/deprecated/ {sub(/\/.*/,"",$2); print $2; exit}')"
  echo "Seu IPv6 fixo parece ser: ${IPV6:-não encontrado}"
  [ -n "$IPV6" ] && echo "Coloque no Netlify (TURN_URL, junto com o da Oracle):    turn:[${IPV6}]:3478"
fi
