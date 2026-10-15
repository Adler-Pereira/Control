import { sb, $, esc, montarLayout, configurado, param, estrelas, data, urlSegura, usuario, avatar, toast, falha } from './app.js';

await montarLayout();
const main = $('#conteudo');
const LOJAS = [['store_ps', 'iconepl', 'PlayStation'], ['store_xbox', 'iconexb', 'Xbox'], ['store_steam', 'iconest', 'Steam'], ['store_nintendo', 'iconenin', 'Nintendo']];
const reais = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

if (configurado) carregar();

async function carregar() {
  const { data: g } = await sb.from('games').select('*, categories(name,id)').eq('slug', param('slug')).maybeSingle();
  if (!g) { main.innerHTML += '<p class="vazio">Jogo não encontrado.</p>'; return; }
  document.title = `${g.title} | Control Critic`;
  const u = await usuario();
  const [{ data: reviews }, { data: deals }, { data: comms }] = await Promise.all([
    sb.from('reviews').select('*, profiles(username,avatar_url)').eq('game_id', g.id).eq('status', 'published').order('created_at', { ascending: false }),
    sb.from('deals').select('*').eq('game_id', g.id).order('discount_pct', { ascending: false }),
    sb.from('communities').select('id,name,members_count').eq('game_id', g.id).limit(5),
  ]);
  const minha = u && reviews.find((r) => r.user_id === u.id);

  main.innerHTML = `
    <div class="detalhe">
      <div>
        <img src="${urlSegura(g.cover_url) || 'img/Control.png'}" alt="" style="border-radius:14px;width:100%">
        <h1 style="margin-top:16px">${esc(g.title)}</h1>
        <p>${g.categories ? `<a class="tag" href="jogos.html?cat=${g.categories.id}">${esc(g.categories.name)}</a>` : ''} ${g.release_year ? `<span class="tag">${g.release_year}</span>` : ''}</p>
        <p class="quebra" style="margin-top:12px">${esc(g.description || '')}</p>
      </div>
      <aside class="lista">
        <div class="cartao">
          <div class="nota-grande">${Number(g.avg_rating).toFixed(1)}</div>
          ${estrelas(g.avg_rating)} <span class="muted">${g.reviews_count} avaliação(ões)</span>
        </div>
        <div class="cartao"><h3>Onde comprar</h3><div class="lojas">
          ${LOJAS.filter(([k]) => g[k]).map(([k, ic, n]) => `<a href="${urlSegura(g[k])}" target="_blank" rel="noopener" title="${n}"><img src="img/icones/${ic}.png" alt="${n}"></a>`).join('') || '<span class="muted">Sem links cadastrados.</span>'}
        </div>
        ${(deals || []).filter((d) => d.discount_pct > 0).map((d) => `<p style="margin-top:10px"><span class="tag amarela">-${d.discount_pct}%</span>
          ${esc(d.store)}: ${d.price_cents != null ? `<strong>${reais(d.price_cents)}</strong>` : ''}
          ${d.original_cents ? `<s class="muted">${reais(d.original_cents)}</s>` : ''}
          ${d.url ? ` · <a href="${urlSegura(d.url)}" target="_blank" rel="noopener">ver oferta</a>` : ''}</p>`).join('')}
        </div>
        ${comms?.length ? `<div class="cartao"><h3>Comunidades</h3>${comms.map((c) => `<p><a href="comunidade.html?id=${c.id}">${esc(c.name)}</a> <span class="muted">· ${c.members_count} membros</span></p>`).join('')}</div>` : ''}
      </aside>
    </div>

    <h2>${minha ? 'Sua avaliação' : 'Avalie este jogo'}</h2>
    <div class="cartao" id="form-area">
      ${u ? `
      <form id="form-review">
        <div class="estrelas-input">${[5, 4, 3, 2, 1].map((n) => `<input type="radio" name="nota" id="n${n}" value="${n}" ${minha?.rating === n ? 'checked' : ''} required><label for="n${n}" title="${n}">★</label>`).join('')}</div>
        <label for="txt">Comentário (opcional)</label>
        <textarea id="txt" rows="3" maxlength="2000" placeholder="O que achou?">${esc(minha?.body || '')}</textarea>
        <div class="controles" style="margin-top:10px">
          <button class="btn">${minha ? 'Atualizar' : 'Publicar'} avaliação</button>
          ${minha ? '<button type="button" class="btn sec" id="apagar">Apagar</button>' : ''}
        </div>
      </form>` : `<p><a href="entrar.html?volta=${encodeURIComponent('jogo.html?slug=' + g.slug)}">Entre</a> para avaliar e ganhar XP.</p>`}
    </div>

    <h2>Avaliações da comunidade</h2>
    <div class="lista">${reviews.map((r) => `
      <article class="review"><header><img class="avatar" src="${avatar(r.profiles)}" alt="">
        <strong>${esc(r.profiles?.username)}</strong> ${estrelas(r.rating)} <span class="muted">${data(r.created_at)}</span></header>
        ${r.body ? `<p class="quebra">${esc(r.body)}</p>` : ''}</article>`).join('') || '<p class="vazio">Seja o primeiro a avaliar!</p>'}
    </div>`;

  $('#form-review')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rating = Number(new FormData(e.target).get('nota'));
    const body = $('#txt').value.trim() || null;
    const { error } = minha
      ? await sb.from('reviews').update({ rating, body }).eq('id', minha.id)
      : await sb.from('reviews').insert({ game_id: g.id, user_id: u.id, rating, body });
    if (error) return falha(error);
    toast(minha ? 'Avaliação atualizada!' : 'Avaliação publicada! +10 XP');
    carregar();
  });
  $('#apagar')?.addEventListener('click', async () => {
    if (!confirm('Apagar sua avaliação?')) return;
    const { error } = await sb.from('reviews').delete().eq('id', minha.id);
    if (error) return falha(error);
    toast('Avaliação removida.'); carregar();
  });
}
