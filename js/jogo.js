import { sb, $, esc, montarLayout, configurado, param, estrelas, data, urlSegura, usuario, avatar, avatarHtml, toast, falha, denunciar, traduzirNoNavegador } from './app.js';

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
    sb.from('reviews').select('*, profiles(username,avatar_url,equipped_frame)').eq('game_id', g.id).eq('status', 'published').order('created_at', { ascending: false }),
    sb.from('deals').select('*').eq('game_id', g.id).order('discount_pct', { ascending: false }),
    sb.from('communities').select('id,name,members_count').eq('game_id', g.id).limit(5),
  ]);
  const { data: bib } = u ? await sb.from('user_games').select('*').eq('user_id', u.id).eq('game_id', g.id).maybeSingle() : { data: null };
  const { count: desejam } = await sb.from('user_games').select('user_id', { count: 'exact', head: true }).eq('game_id', g.id).eq('wishlist', true);
  const minha = u && reviews.find((r) => r.user_id === u.id);

  main.innerHTML = `
    <div class="detalhe">
      <div>
        <img src="${urlSegura(g.cover_url) || 'img/Control.png'}" alt="" style="border-radius:14px;width:100%">
        <h1 style="margin-top:16px">${esc(g.title)}</h1>
        <p>${g.categories ? `<a class="tag" href="jogos.html?cat=${g.categories.id}">${esc(g.categories.name)}</a>` : ''} ${g.release_year ? `<span class="tag">${g.release_year}</span>` : ''}
          ${(g.platforms || []).map((pl) => `<a class="tag" href="jogos.html?plat=${encodeURIComponent(pl)}">${esc(pl)}</a>`).join(' ')}</p>
        <p class="quebra" style="margin-top:12px" id="descricao">${esc(g.description || '')}</p>
        ${g.description_lang === 'en' ? '<p class="muted" id="desc-aviso" style="font-size:.82rem;margin-top:4px">🌐 Traduzindo a descrição (original em inglês)...</p>' : ''}
      </div>
      <aside class="lista">
        <div class="cartao">
          <div class="nota-grande">${Number(g.avg_rating).toFixed(1)}</div>
          ${estrelas(g.avg_rating)} <span class="muted">${g.reviews_count} avaliação(ões) no Control Critic</span>
          ${g.igdb_rating ? `<p class="muted" style="margin-top:8px;font-size:.88rem">Nota da crítica e público (IGDB): <strong>${Math.round(g.igdb_rating)}/100</strong> · ${g.igdb_rating_count} votos</p>` : ''}
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

    <h2>Minha biblioteca</h2>
    <div class="cartao">
      ${u ? `<div class="biblioteca">
        <select id="b-status" aria-label="Status">
          <option value="">— Não está na biblioteca —</option>
          ${[['jogando', '🎮 Jogando'], ['zerado', '🏆 Zerado'], ['quero_jogar', '📌 Quero jogar'], ['abandonei', '💤 Abandonei']]
            .map(([v, t]) => `<option value="${v}" ${bib?.status === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <input id="b-horas" type="number" min="0" step="0.5" placeholder="Horas" value="${bib?.hours ?? ''}" style="max-width:110px" aria-label="Horas jogadas">
        <button class="btn sec desejo ${bib?.wishlist ? 'ativo' : ''}" id="b-desejo">${bib?.wishlist ? '💖 Na lista de desejos' : '🤍 Lista de desejos'}</button>
      </div>
      <p class="muted" style="font-size:.85rem;margin-top:8px">Na lista de desejos você recebe uma notificação quando o jogo entrar em promoção.
        ${desejam ? `${desejam} pessoa(s) desejam este jogo.` : ''}</p>`
      : `<p><a href="entrar.html?volta=${encodeURIComponent('jogo.html?slug=' + g.slug)}">Entre</a> para adicionar à sua biblioteca e receber alertas de promoção.</p>`}
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
      <article class="review"><header>${avatarHtml(r.profiles)}
        <a class="usuario" href="perfil.html?u=${encodeURIComponent(r.profiles?.username || '')}">${esc(r.profiles?.username)}</a> ${estrelas(r.rating)} <span class="muted">${data(r.created_at)}</span>
        ${u && r.user_id !== u.id ? `<button class="bt-denunciar" data-den="${r.id}" title="Denunciar">🚩 Denunciar</button>` : ''}</header>
        ${r.body ? `<p class="quebra">${esc(r.body)}</p>` : ''}</article>`).join('') || '<p class="vazio">Seja o primeiro a avaliar!</p>'}
    </div>`;

  main.querySelectorAll('[data-den]').forEach((b) => b.onclick = () => denunciar('review', b.dataset.den));
  if (g.description_lang === 'en') traduzirDescricao(g);

  // Biblioteca: salva ao mudar qualquer campo
  const salvarBib = async (mudanca) => {
    const atual = { status: $('#b-status').value || null, hours: $('#b-horas').value === '' ? null : Number($('#b-horas').value),
      wishlist: $('#b-desejo').classList.contains('ativo'), ...mudanca };
    const vazio = !atual.status && !atual.wishlist && atual.hours == null;
    const { error } = vazio
      ? await sb.from('user_games').delete().eq('user_id', u.id).eq('game_id', g.id)
      : await sb.from('user_games').upsert({ user_id: u.id, game_id: g.id, ...atual, updated_at: new Date().toISOString() });
    if (error) return falha(error);
    return true;
  };
  $('#b-status')?.addEventListener('change', async () => { if (await salvarBib()) toast('Biblioteca atualizada.'); });
  $('#b-horas')?.addEventListener('change', async () => { if (await salvarBib()) toast('Horas salvas.'); });
  $('#b-desejo')?.addEventListener('click', async (e) => {
    const b = e.currentTarget, ativo = !b.classList.contains('ativo');
    if (!(await salvarBib({ wishlist: ativo }))) return;
    b.classList.toggle('ativo', ativo);
    b.textContent = ativo ? '💖 Na lista de desejos' : '🤍 Lista de desejos';
    toast(ativo ? 'Adicionado à lista de desejos. Avisaremos quando entrar em promoção!' : 'Removido da lista de desejos.');
  });

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

// Descrição em inglês: traduz no servidor (fica salva para todos) ou, como reserva, no navegador
async function traduzirDescricao(g) {
  const aviso = $('#desc-aviso');
  try {
    const r = await fetch(`/.netlify/functions/traduzir?id=${g.id}`);
    if (r.ok) {
      const d = await r.json();
      $('#descricao').textContent = d.description;
      aviso?.remove();
      return;
    }
  } catch { /* sem função disponível: tenta no navegador */ }
  const t = await traduzirNoNavegador(g.description);
  if (t) { $('#descricao').textContent = t; if (aviso) aviso.textContent = '🌐 Tradução automática do navegador (original em inglês).'; }
  else if (aviso) aviso.textContent = '🌐 Descrição disponível apenas em inglês por enquanto.';
}
