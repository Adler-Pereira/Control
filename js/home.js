import { sb, $, esc, montarLayout, cardJogo, configurado, usuario, data, urlSegura } from './app.js';

await montarLayout();
const main = $('#conteudo');
main.insertAdjacentHTML('beforeend', `
  <section class="hero">
    <div>
      <h1>Aqui, as novidades estão ao seu alcance!</h1>
      <p>Notícias, avaliações da comunidade, promoções e salas de voz para jogar junto, tudo em um só lugar.</p>
      <div class="controles">
        <a class="btn" href="jogos.html">Explorar jogos</a>
        <a class="btn sec" href="comunidades.html">Ver comunidades</a>
      </div>
    </div>
    <img src="img/Adelino.png" alt="Adelino, o mascote do Control Critic">
  </section>
  <section id="sec-rec" class="hidden"><h2>Recomendados para você</h2><div class="grade" id="rec"></div></section>
  <h2>Destaques</h2><div class="grade" id="destaques"></div>
  <h2>Em promoção</h2><div class="grade" id="promos"></div>
  <h2>Últimas notícias</h2><div class="lista" id="noticias"></div>`);

if (configurado) {
  const [dest, promos, news] = await Promise.all([
    sb.from('games').select('*, categories(name)').eq('featured', true).order('avg_rating', { ascending: false }).limit(8),
    sb.from('deals').select('*, games(slug,title,cover_url)').gt('discount_pct', 0).order('discount_pct', { ascending: false }).limit(4),
    sb.from('news').select('id,title,summary,source,source_url,created_at').eq('published', true).order('created_at', { ascending: false }).limit(5),
  ]);
  $('#destaques').innerHTML = (dest.data || []).map(cardJogo).join('') || '<p class="vazio">Nenhum destaque ainda.</p>';
  $('#promos').innerHTML = (promos.data || []).map((d) => `
    <a class="jogo-card" href="jogo.html?slug=${encodeURIComponent(d.games.slug)}">
      <img src="${urlSegura(d.games.cover_url) || 'img/Control.png'}" alt="" loading="lazy">
      <div class="info"><span class="titulo">${esc(d.games.title)}</span>
      <span><span class="tag amarela">-${d.discount_pct}%</span> <span class="tag">${esc(d.store)}</span></span></div></a>`).join('')
    || '<p class="vazio">Sem promoções no momento.</p>';
  $('#noticias').innerHTML = (news.data || []).map((n) => `
    <article class="cartao"><span class="muted">${data(n.created_at)}${n.source ? ' · ' + esc(n.source) : ''}</span>
    <h3><a href="novidades.html#n${n.id}">${esc(n.title)}</a></h3>
    ${n.summary ? `<p class="muted">${esc(n.summary)}</p>` : ''}</article>`).join('') || '<p class="vazio">Nenhuma notícia ainda.</p>';

  if (await usuario()) {
    const { data: rec } = await sb.rpc('recommend_games', { lim: 4 });
    if (rec?.length) { $('#sec-rec').classList.remove('hidden'); $('#rec').innerHTML = rec.map(cardJogo).join(''); }
  }
}
