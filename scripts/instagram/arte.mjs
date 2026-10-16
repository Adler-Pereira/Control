// Gera as artes do Instagram (1080×1350, JPEG) com a identidade do Control Critic:
// fundo escuro, amarelo #FFD33C, título em Anton maiúsculo, logo e o mascote Adelino.
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const aqui = (p) => fileURLToPath(new URL(p, import.meta.url));
const FONTES = [aqui('./fontes/Anton-Regular.ttf'), aqui('./fontes/Inter-Variable.ttf')];
const W = 1080, H = 1350, AMARELO = '#FFD33C', PRETO = '#0B0B0D';
const b64 = (buf, tipo = 'image/png') => `data:${tipo};base64,${Buffer.from(buf).toString('base64')}`;
const LOGO = b64(readFileSync(aqui('../../img/ControlHeader.png')));
const MASCOTE = b64(readFileSync(aqui('../../img/Adelino.png')));
// Emojis não existem nas fontes da arte (viram quadrados): ficam só na legenda
const semEmoji = (s) => String(s ?? '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s{2,}/g, ' ').trim();
const esc = (s) => semEmoji(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

// Quebra o texto em linhas pela largura aproximada de cada letra (Anton é uma fonte estreita)
function quebrar(texto, tamanho, larguraMax, fator = 0.5) {
  const porLinha = Math.max(6, Math.floor(larguraMax / (tamanho * fator)));
  const linhas = [];
  let atual = '';
  for (const palavra of String(texto).split(/\s+/).filter(Boolean)) {
    if ((atual + ' ' + palavra).trim().length > porLinha && atual) { linhas.push(atual); atual = palavra; } else atual = (atual + ' ' + palavra).trim();
  }
  if (atual) linhas.push(atual);
  return linhas;
}
// Escolhe o maior tamanho de título que cabe em no máximo `maxLinhas`
function ajustarTitulo(texto, larguraMax, maxLinhas, tamanhos = [104, 92, 82, 72, 64, 56]) {
  const t = String(texto).toUpperCase();
  for (const tam of tamanhos) { const l = quebrar(t, tam, larguraMax); if (l.length <= maxLinhas) return { tam, linhas: l }; }
  const tam = tamanhos.at(-1), l = quebrar(t, tam, larguraMax);
  return { tam, linhas: [...l.slice(0, maxLinhas - 1), l.slice(maxLinhas - 1).join(' ').slice(0, 40).replace(/\s\S*$/, '') + '…'] };
}

// Baixa a imagem da notícia e recorta para preencher a arte (se falhar, usa um fundo liso)
async function fundo(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'ControlCriticBot/1.0' } });
    if (!r.ok) return null;
    const img = await sharp(Buffer.from(await r.arrayBuffer())).resize(W, H, { fit: 'cover', position: 'attention' }).jpeg({ quality: 88 }).toBuffer();
    return b64(img, 'image/jpeg');
  } catch { return null; }
}

async function renderizar(svg) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: { fontFiles: FONTES, loadSystemFonts: false, defaultFontFamily: 'Inter' } }).render().asPng();
  return sharp(png).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

const base = (conteudo, img) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${PRETO}" stop-opacity="0.55"/><stop offset="0.35" stop-color="${PRETO}" stop-opacity="0.15"/>
      <stop offset="0.6" stop-color="${PRETO}" stop-opacity="0.85"/><stop offset="1" stop-color="${PRETO}" stop-opacity="1"/>
    </linearGradient>
    <linearGradient id="liso" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2410"/><stop offset="0.6" stop-color="${PRETO}"/><stop offset="1" stop-color="#3a2f00"/></linearGradient>
  </defs>
  ${img ? `<image href="${img}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>` : `<rect width="${W}" height="${H}" fill="url(#liso)"/>`}
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect x="0" y="0" width="${W}" height="14" fill="${AMARELO}"/>
  <image href="${LOGO}" x="56" y="58" width="300" height="88" preserveAspectRatio="xMinYMid meet"/>
  ${conteudo}
  <text x="${W / 2}" y="${H - 34}" text-anchor="middle" font-family="Inter" font-size="24" fill="#9a9aa5">control-critic.netlify.app · link na bio</text>
</svg>`;

const etiqueta = (texto, cor = AMARELO, corTexto = PRETO) => {
  const w = 40 + texto.length * 19;
  return `<rect x="${W - 56 - w}" y="76" width="${w}" height="56" rx="28" fill="${cor}"/>
  <text x="${W - 56 - w / 2}" y="115" text-anchor="middle" font-family="Anton" font-size="32" fill="${corTexto}" letter-spacing="1">${esc(texto)}</text>`;
};

// Notícia: imagem da notícia de fundo, título grande embaixo
export async function arteNoticia({ titulo, fonte, data, capa, urgente = false, numero = null }) {
  const img = await fundo(capa);
  const { tam, linhas } = ajustarTitulo(titulo, W - 112, 5);
  const alturaTitulo = linhas.length * tam * 1.08;
  const yTopo = H - 150 - alturaTitulo;
  const conteudo = `
    ${etiqueta(urgente ? 'URGENTE' : numero ? `NOTÍCIA ${numero}` : 'NOTÍCIA', urgente ? '#E5484D' : AMARELO, urgente ? '#FFFFFF' : PRETO)}
    <rect x="56" y="${yTopo - 46}" width="120" height="10" fill="${AMARELO}"/>
    ${linhas.map((l, i) => `<text x="56" y="${yTopo + tam * (i + 0.9) * 1.08}" font-family="Anton" font-size="${tam}" fill="#FFFFFF">${esc(l)}</text>`).join('')}
    <text x="56" y="${H - 96}" font-family="Inter" font-size="30" font-weight="600" fill="${AMARELO}">${esc([fonte, data].filter(Boolean).join('  ·  '))}</text>
    <image href="${MASCOTE}" x="${W - 190}" y="${H - 250}" width="150" height="150" preserveAspectRatio="xMidYMid meet"/>`;
  return renderizar(base(conteudo, img));
}

// Capa do resumo do dia (primeiro slide do carrossel)
export async function arteResumo({ data, titulos }) {
  const lista = titulos.slice(0, 5).map((t, i) => {
    const l = quebrar(String(t).toUpperCase(), 40, W - 260, 0.5);
    return { n: i + 1, texto: l.length > 2 ? [l[0], l[1].replace(/\s\S*$/, '') + '…'] : l };
  });
  let y = 560;
  const itens = lista.map((it) => {
    const bloco = `<circle cx="92" cy="${y - 14}" r="30" fill="${AMARELO}"/><text x="92" y="${y}" text-anchor="middle" font-family="Anton" font-size="38" fill="${PRETO}">${it.n}</text>
      ${it.texto.map((l, k) => `<text x="146" y="${y + k * 46}" font-family="Anton" font-size="40" fill="#FFFFFF">${esc(l)}</text>`).join('')}`;
    y += 60 + it.texto.length * 46;
    return bloco;
  }).join('');
  const conteudo = `
    ${etiqueta(data)}
    <text x="56" y="330" font-family="Anton" font-size="150" fill="${AMARELO}">RESUMO</text>
    <text x="56" y="460" font-family="Anton" font-size="150" fill="#FFFFFF">DO DIA</text>
    ${itens}
    <text x="56" y="${H - 96}" font-family="Inter" font-size="30" font-weight="600" fill="#c9c9d1">Arraste para o lado →</text>
    <image href="${MASCOTE}" x="${W - 330}" y="140" width="290" height="290" preserveAspectRatio="xMidYMid meet"/>`;
  return renderizar(base(conteudo, null));
}

// Promoção do dia (quando não há notícia)
export async function artePromo({ jogo, desconto, preco, loja, capa }) {
  const img = await fundo(capa);
  const { tam, linhas } = ajustarTitulo(jogo, W - 112, 3, [96, 84, 72, 62]);
  const yTitulo = H - 330 - linhas.length * tam * 1.08;
  const conteudo = `
    ${etiqueta('PROMOÇÃO')}
    <rect x="56" y="${yTitulo - 210}" width="330" height="150" rx="20" fill="${AMARELO}"/>
    <text x="221" y="${yTitulo - 95}" text-anchor="middle" font-family="Anton" font-size="120" fill="${PRETO}">-${esc(desconto)}%</text>
    ${linhas.map((l, i) => `<text x="56" y="${yTitulo + tam * (i + 0.9) * 1.08}" font-family="Anton" font-size="${tam}" fill="#FFFFFF">${esc(l)}</text>`).join('')}
    <text x="56" y="${H - 190}" font-family="Anton" font-size="64" fill="${AMARELO}">${esc(preco || '')}</text>
    <text x="56" y="${H - 110}" font-family="Inter" font-size="30" font-weight="600" fill="#c9c9d1">na ${esc(loja)}</text>
    <image href="${MASCOTE}" x="${W - 190}" y="${H - 250}" width="150" height="150" preserveAspectRatio="xMidYMid meet"/>`;
  return renderizar(base(conteudo, img));
}
