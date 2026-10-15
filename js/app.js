import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Aceita a URL com ou sem "/rest/v1" e barras no final
const URL_PROJETO = SUPABASE_URL.trim().replace(/\/+(rest\/v1)?\/*$/, '');
const chaveSecreta = /^sb_secret_/.test(SUPABASE_ANON_KEY) || /service_role/.test(atobSeguro(SUPABASE_ANON_KEY.split('.')[1]));
export const configurado = URL_PROJETO.startsWith('https://') && !SUPABASE_ANON_KEY.startsWith('COLE_') && !chaveSecreta;
export const sb = configurado ? createClient(URL_PROJETO, SUPABASE_ANON_KEY) : null;

function atobSeguro(s) { try { return atob(s.replace(/-/g, '+').replace(/_/g, '/')); } catch { return ''; } }

// ---------- Utilidades ----------
export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
export const param = (nome) => new URLSearchParams(location.search).get(nome);

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Aceita apenas links http(s) ou caminhos relativos (evita javascript: em links vindos do banco)
export function urlSegura(u) {
  if (!u) return '';
  const s = String(u).trim();
  if (/^https?:\/\//i.test(s) || /^[a-z0-9_\-./]+$/i.test(s)) return esc(s);
  return '';
}

export function estrelas(nota) {
  const n = Math.round(Number(nota) || 0);
  return `<span class="estrelas" aria-label="${n} de 5">${'★'.repeat(n)}<span class="vazia">${'★'.repeat(5 - n)}</span></span>`;
}

export function data(d) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function toast(msg, erro = false) {
  let box = $('#toast');
  if (!box) { box = document.createElement('div'); box.id = 'toast'; document.body.append(box); }
  const t = document.createElement('div');
  t.className = 'toast' + (erro ? ' erro' : '');
  t.textContent = msg;
  box.append(t);
  setTimeout(() => t.remove(), 4000);
}

export function falha(err) {
  console.error(err);
  toast(err?.message || 'Algo deu errado. Tente de novo.', true);
}

// Nível: cada nível exige mais XP (50, 200, 450, 800...)
export function nivel(xp) {
  const lv = Math.floor(Math.sqrt((xp || 0) / 50)) + 1;
  const atual = 50 * (lv - 1) ** 2, prox = 50 * lv ** 2;
  const titulos = ['Novato', 'Aprendiz', 'Jogador', 'Veterano', 'Crítico', 'Especialista', 'Lenda'];
  return { lv, titulo: titulos[Math.min(lv - 1, titulos.length - 1)], pct: Math.round(((xp - atual) / (prox - atual)) * 100), prox };
}

export const avatar = (p) => urlSegura(p?.avatar_url) || 'img/perfilpadrao.png';

// ---------- Sessão ----------
let _perfil;
export async function usuario() {
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  return session?.user ?? null;
}
export async function perfil() {
  if (_perfil !== undefined) return _perfil;
  const u = await usuario();
  if (!u) return (_perfil = null);
  const { data } = await sb.from('profiles').select('*').eq('id', u.id).single();
  return (_perfil = data);
}
export async function exigirLogin() {
  const u = await usuario();
  if (!u) { location.href = 'entrar.html?volta=' + encodeURIComponent(location.pathname.split('/').pop() + location.search); return null; }
  return u;
}

// ---------- Layout comum ----------
const LINKS = [
  ['index.html', 'Início'], ['jogos.html', 'Jogos'], ['novidades.html', 'Novidades'], ['promocoes.html', 'Promoções'],
  ['comunidades.html', 'Comunidades'], ['sobre.html', 'Quem Somos'], ['contato.html', 'Fale Conosco'],
];

export async function montarLayout() {
  const pagina = location.pathname.split('/').pop() || 'index.html';
  const topo = document.createElement('header');
  topo.className = 'topo';
  topo.innerHTML = `
    <div class="topo-inner">
      <a class="logo" href="index.html" aria-label="Control Critic - início">
        <img class="marca" src="img/ControlHeader.png" alt="Control Critic">
        <img class="mascote" src="img/Adelino.png" alt="">
      </a>
      <button class="menu-toggle" aria-label="Abrir menu">☰</button>
      <nav class="nav">${LINKS.map(([h, t]) => `<a href="${h}" class="${h === pagina ? 'ativo' : ''}">${t}</a>`).join('')}</nav>
      <form class="busca" action="jogos.html"><input name="q" type="search" placeholder="Buscar jogo..." aria-label="Buscar jogo"></form>
      <div class="conta"></div>
    </div>`;
  document.body.prepend(topo);
  $('.menu-toggle', topo).onclick = () => topo.classList.toggle('aberto');

  const rodape = document.createElement('footer');
  rodape.className = 'rodape';
  rodape.innerHTML = `
    <div class="redes">
      <a href="https://www.instagram.com/Control.Critic/" target="_blank" rel="noopener"><img src="img/redes/insta.png" alt="Instagram"></a>
      <a href="https://twitter.com/ControlCritic" target="_blank" rel="noopener"><img src="img/redes/tw.png" alt="Twitter"></a>
      <a href="contato.html"><img src="img/redes/gm.png" alt="Fale conosco"></a>
    </div>
    <p>© ${new Date().getFullYear()} Control Critic. Todos os direitos reservados.</p>
    <p style="font-size:.8rem;margin-top:6px">Dados de jogos: <a href="https://www.igdb.com" target="_blank" rel="noopener">IGDB.com</a> e Steam.</p>`;
  document.body.append(rodape);

  if (!configurado) {
    $('main')?.insertAdjacentHTML('afterbegin', chaveSecreta
      ? `<div class="aviso erro"><strong>Chave secreta no site!</strong> O <code>js/config.js</code> está com a Secret/service_role key,
         que dá acesso total ao banco. Troque pela Publishable key e gere uma nova Secret key no Supabase.</div>`
      : `<div class="aviso"><strong>Supabase ainda não configurado.</strong>
         Preencha <code>js/config.js</code> com a URL e a Publishable key do projeto (veja o README).</div>`);
    return;
  }

  const conta = $('.conta', topo);
  const p = await perfil();
  if (!p) {
    conta.innerHTML = `<a class="btn pequeno" href="entrar.html">Entrar</a>`;
  } else {
    conta.innerHTML = `
      ${p.role !== 'user' ? '<a class="btn sec pequeno" href="admin.html">Admin</a>' : ''}
      <a href="perfil.html" title="${esc(p.username)}"><img class="avatar" src="${avatar(p)}" alt="Meu perfil"></a>`;
  }
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') location.href = 'index.html'; });
}

export function cardJogo(g) {
  return `<a class="jogo-card" href="jogo.html?slug=${encodeURIComponent(g.slug)}">
    <img src="${urlSegura(g.cover_url) || 'img/Control.png'}" alt="" loading="lazy">
    <div class="info">
      <span class="titulo">${esc(g.title)}</span>
      ${g.categories ? `<span><span class="tag">${esc(g.categories.name)}</span></span>` : ''}
      <span>${estrelas(g.avg_rating)} <span class="muted">(${g.reviews_count})</span></span>
    </div></a>`;
}
