import { sb, $, esc, montarLayout, configurado, urlSegura } from './app.js';

await montarLayout();
const main = $('#conteudo');
const reais = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
main.insertAdjacentHTML('beforeend', `<h1>Promoções</h1>
  <p class="muted">Preços da Steam atualizados automaticamente várias vezes ao dia. Ofertas de outras lojas são cadastradas pela equipe.</p>
  <div class="grade" id="lista" style="margin-top:16px"></div>`);

if (configurado) {
  const { data: deals } = await sb.from('deals').select('*, games(slug,title,cover_url)').gt('discount_pct', 0).order('discount_pct', { ascending: false });
  $('#lista').innerHTML = (deals || []).map((d) => `
    <div class="jogo-card">
      <a href="jogo.html?slug=${encodeURIComponent(d.games.slug)}"><img src="${urlSegura(d.games.cover_url) || 'img/Control.png'}" alt="" loading="lazy"></a>
      <div class="info">
        <a class="titulo" href="jogo.html?slug=${encodeURIComponent(d.games.slug)}" style="color:var(--texto)">${esc(d.games.title)}</a>
        <span><span class="tag amarela">-${d.discount_pct}%</span> <span class="tag">${esc(d.store)}</span></span>
        <span>${d.price_cents != null ? `<strong>${reais(d.price_cents)}</strong>` : ''} ${d.original_cents ? `<s class="muted">${reais(d.original_cents)}</s>` : ''}</span>
        ${d.ends_at ? `<span class="muted">Até ${new Date(d.ends_at).toLocaleDateString('pt-BR')}</span>` : ''}
        ${d.url ? `<a class="btn pequeno" href="${urlSegura(d.url)}" target="_blank" rel="noopener">Ver na loja</a>` : ''}
      </div>
    </div>`).join('') || '<p class="vazio">Nenhuma promoção ativa agora.</p>';
}
