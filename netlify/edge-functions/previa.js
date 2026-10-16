// Prévia de links (WhatsApp, Discord, Telegram, X, Facebook, Google...).
// Só roda quando quem pede a página é um robô de prévia/busca: pessoas recebem o site normal, sem custo extra.
// Coloca título, descrição e imagem do jogo, perfil ou comunidade nas tags Open Graph.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../js/config.js';

const ROBOS = /whatsapp|facebookexternalhit|facebot|discordbot|telegrambot|twitterbot|slackbot|linkedinbot|googlebot|bingbot|applebot|embedly|redditbot|skypeuripreview|pinterest/i;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const corta = (t, n = 200) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

async function rest(caminho) {
  const r = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/${caminho}`, { headers: { apikey: SUPABASE_ANON_KEY } });
  if (!r.ok) return null;
  const d = await r.json();
  return Array.isArray(d) ? d[0] : d;
}

async function dados(url) {
  const p = url.pathname, q = url.searchParams;
  if (p.endsWith('/jogo.html') && q.get('slug')) {
    const g = await rest(`games?select=title,description,cover_url,avg_rating,reviews_count&slug=eq.${encodeURIComponent(q.get('slug'))}&limit=1`);
    if (g) return { titulo: `${g.title} | Control Critic`, desc: (g.reviews_count ? `★ ${Number(g.avg_rating).toFixed(1)} · ${g.reviews_count} avaliação(ões). ` : '') + corta(g.description, 170), img: g.cover_url, tipo: 'video.game' };
  }
  if (p.endsWith('/perfil.html') && q.get('u')) {
    const u = await rest(`profiles?select=username,bio,avatar_url,xp&username=eq.${encodeURIComponent(q.get('u'))}&limit=1`);
    if (u) return { titulo: `${u.username} | Control Critic`, desc: corta(u.bio) || `Veja os jogos, avaliações e conquistas de ${u.username} no Control Critic.`, img: u.avatar_url, tipo: 'profile' };
  }
  if (p.endsWith('/comunidade.html') && q.get('id')) {
    const c = await rest(`communities?select=name,description,banner_url,icon_url,members_count,is_private&id=eq.${Number(q.get('id')) || 0}&limit=1`);
    if (c) return { titulo: `${c.name} | Control Critic`, desc: `${c.members_count} membros. ` + (c.is_private ? 'Comunidade privada.' : corta(c.description, 170)), img: c.banner_url || c.icon_url };
  }
  if (p.endsWith('/index.html') && q.get('post')) {
    const x = await rest(`posts?select=body,image_url,profiles!posts_user_id_fkey(username)&id=eq.${Number(q.get('post')) || 0}&limit=1`);
    if (x) return { titulo: `${x.profiles?.username || 'Post'} no Control Critic`, desc: corta(x.body), img: x.image_url, tipo: 'article' };
  }
  return null;
}

export default async (req, context) => {
  const resp = await context.next();
  if (!ROBOS.test(req.headers.get('user-agent') || '') || !(resp.headers.get('content-type') || '').includes('text/html')) return resp;
  const url = new URL(req.url);
  let html = await resp.text();
  const d = await dados(url).catch(() => null) || {};
  const titulo = d.titulo || html.match(/<title>([^<]*)<\/title>/)?.[1] || 'Control Critic';
  const desc = d.desc || html.match(/<meta name="description" content="([^"]*)"/)?.[1] || 'Rede social de jogos: avaliações, comunidades, calls e promoções.';
  const img = /^https:\/\//.test(d.img || '') ? d.img : `${url.origin}/img/app/icone-512.png`;
  const tags = `
  <meta property="og:site_name" content="Control Critic">
  <meta property="og:type" content="${d.tipo || 'website'}">
  <meta property="og:title" content="${esc(titulo)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="${esc(img)}">
  <meta property="og:url" content="${esc(url.href)}">
  <meta property="og:locale" content="pt_BR">
  <meta name="twitter:card" content="${d.img ? 'summary_large_image' : 'summary'}">`;
  if (d.titulo) html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(titulo)}</title>`);
  html = html.replace('</head>', `${tags}\n</head>`);
  const h = new Headers(resp.headers); h.delete('content-length');
  return new Response(html, { status: resp.status, headers: h });
};

export const config = { path: '/*', excludedPath: ['/css/*', '/js/*', '/img/*', '/.netlify/*', '/sw.js', '/manifest.webmanifest', '/sitemap.xml', '/robots.txt'] };
