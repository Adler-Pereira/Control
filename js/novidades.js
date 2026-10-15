import { sb, $, esc, montarLayout, configurado, data, urlSegura } from './app.js';

await montarLayout();
const main = $('#conteudo');
main.insertAdjacentHTML('beforeend', `<h1>Novidades</h1>
  <div class="chips"><button class="chip ativo" data-f="">Todas</button><button class="chip" data-f="equipe">Da equipe</button><button class="chip" data-f="oficial">Oficiais</button></div>
  <div class="lista" id="lista"></div>`);

let filtro = '';
document.querySelectorAll('.chip').forEach((b) => b.onclick = () => {
  filtro = b.dataset.f; document.querySelectorAll('.chip').forEach((x) => x.classList.toggle('ativo', x === b)); carregar();
});
if (configurado) carregar();

async function carregar() {
  let q = sb.from('news').select('*, games(slug,title)').eq('published', true).order('created_at', { ascending: false }).limit(50);
  if (filtro === 'equipe') q = q.is('source', null);
  if (filtro === 'oficial') q = q.not('source', 'is', null);
  const { data: news } = await q;
  $('#lista').innerHTML = (news || []).map((n) => `
    <article class="cartao" id="n${n.id}">
      ${n.cover_url ? `<img src="${urlSegura(n.cover_url)}" alt="" style="border-radius:10px;margin-bottom:10px;max-height:280px;object-fit:cover;width:100%">` : ''}
      <span class="muted">${data(n.created_at)} · ${n.source ? esc(n.source) : 'Equipe Control Critic'}</span>
      <h3>${esc(n.title)}</h3>
      ${n.games ? `<p><a class="tag" href="jogo.html?slug=${encodeURIComponent(n.games.slug)}">${esc(n.games.title)}</a></p>` : ''}
      <p class="quebra">${esc(n.source ? (n.summary || '') : n.body)}</p>
      ${n.source_url ? `<p style="margin-top:8px"><a href="${urlSegura(n.source_url)}" target="_blank" rel="noopener">Ler na fonte oficial →</a></p>` : ''}
    </article>`).join('') || '<p class="vazio">Nenhuma notícia ainda.</p>';
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
}
