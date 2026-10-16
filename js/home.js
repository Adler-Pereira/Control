import { sb, $, esc, montarLayout, cardJogo, configurado, usuario, perfil, data, urlSegura, COLUNAS_CARD, avatarHtml, toast, falha } from './app.js';

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
  <section id="grupo" style="margin-top:8px">
    <div class="controles" style="justify-content:space-between;align-items:center"><h2 style="margin:0">🎮 Procurando grupo agora</h2>
      <button class="btn pequeno hidden" id="lfg-abrir">+ Quero jogar agora</button></div>
    <form class="cartao hidden" id="lfg-form" style="margin-top:10px">
      <div class="form-linha">
        <div class="busca-jogo"><label for="lfg-busca">Jogo</label><input id="lfg-busca" type="search" placeholder="Qual jogo?" autocomplete="off"><input type="hidden" id="lfg-jogo"><div class="sugestoes hidden" id="lfg-sug"></div></div>
        <div><label for="lfg-plat">Plataforma</label><select id="lfg-plat"><option value="">Qualquer</option>${['PlayStation', 'Xbox', 'PC', 'Nintendo', 'Mobile', 'Crossplay'].map((x) => `<option>${x}</option>`).join('')}</select></div>
        <div><label for="lfg-vagas">Vagas</label><input id="lfg-vagas" type="number" min="1" max="20" value="3"></div>
        <div><label for="lfg-dur">Por quanto tempo</label><select id="lfg-dur"><option value="1">1 hora</option><option value="2">2 horas</option><option value="4">4 horas</option></select></div>
      </div>
      <label for="lfg-nota">Recado</label><input id="lfg-nota" maxlength="200" placeholder="Ex.: Raid no difícil, com call. Nível 50+.">
      <div class="controles" style="margin-top:10px"><button class="btn">Publicar e avisar meus amigos</button><button type="button" class="btn sec" id="lfg-cancelar">Cancelar</button></div>
    </form>
    <div class="lista" id="lfg-lista" style="margin-top:10px"></div>
  </section>
  <section id="sec-rec" class="hidden"><h2>Recomendados para você</h2><div class="grade" id="rec"></div></section>
  <h2>Destaques</h2><div class="grade" id="destaques"></div>
  <h2>Em promoção</h2><div class="grade" id="promos"></div>
  <h2>Últimas notícias</h2><div class="lista" id="noticias"></div>`);

if (configurado) {
  const [dest, promos, news] = await Promise.all([
    sb.from('games').select(COLUNAS_CARD).eq('featured', true).order('avg_rating', { ascending: false }).limit(8),
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
    const { data: rec } = await sb.rpc('recommend_games', { lim: 4 }).select(COLUNAS_CARD);
    if (rec?.length) { $('#sec-rec').classList.remove('hidden'); $('#rec').innerHTML = rec.map(cardJogo).join(''); }
  }
}

// ---------- Procurando grupo agora ----------
if (configurado) carregarLfg();
async function carregarLfg() {
  const u = await usuario();
  const { data: ps } = await sb.from('lfg_posts').select('*, profiles!lfg_posts_user_id_fkey(username,avatar_url,equipped_frame,psn_id,xbox_gamertag,discord_user), games(slug,title,cover_url), lfg_interest(user_id)')
    .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(20);
  $('#lfg-abrir').classList.toggle('hidden', !u);
  const resta = (d) => { const m = Math.max(0, Math.round((new Date(d) - Date.now()) / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`; };
  $('#lfg-lista').innerHTML = (ps || []).map((x) => {
    const meu = u && x.user_id === u.id, foi = u && x.lfg_interest.some((i) => i.user_id === u.id);
    const contas = [x.platform === 'PlayStation' && x.profiles?.psn_id && 'PSN: ' + x.profiles.psn_id, x.platform === 'Xbox' && x.profiles?.xbox_gamertag && 'Xbox: ' + x.profiles.xbox_gamertag, x.profiles?.discord_user && 'Discord: ' + x.profiles.discord_user].filter(Boolean);
    return `<div class="cartao controles lfg" style="align-items:center">
      ${avatarHtml(x.profiles)}
      <div style="flex:1;min-width:200px"><a class="usuario" href="perfil.html?u=${encodeURIComponent(x.profiles?.username || '')}">${esc(x.profiles?.username)}</a> quer jogar
        ${x.games ? `<a href="jogo.html?slug=${encodeURIComponent(x.games.slug)}"><strong>${esc(x.games.title)}</strong></a>` : '<strong>agora</strong>'}
        ${x.platform ? `<span class="tag">${esc(x.platform)}</span>` : ''} ${x.slots ? `<span class="tag">${x.lfg_interest.length}/${x.slots} interessados</span>` : ''}
        ${x.note ? `<br><span class="muted">${esc(x.note)}</span>` : ''}
        ${contas.length ? `<br><span class="muted" style="font-size:.82rem">${esc(contas.join(' · '))}</span>` : ''}
        <br><span class="muted" style="font-size:.8rem">⏱️ expira em ${resta(x.expires_at)}</span></div>
      ${meu ? `<button class="btn sec pequeno" data-lfg-fim="${x.id}">Encerrar</button>`
        : u ? `<button class="btn pequeno ${foi ? 'sec' : ''}" data-lfg-quero="${x.id}" ${foi ? 'disabled' : ''}>${foi ? '✓ Avisado' : '🙋 Quero jogar'}</button>` : ''}
    </div>`;
  }).join('') || '<p class="muted">Ninguém procurando grupo agora. Seja o primeiro!</p>';

  $('#lfg-lista').querySelectorAll('[data-lfg-quero]').forEach((b) => b.onclick = async () => {
    const { error } = await sb.from('lfg_interest').insert({ lfg_id: Number(b.dataset.lfgQuero), user_id: u.id });
    if (error) return falha(error);
    toast('Avisamos que você quer jogar! Combinem pelo perfil, Amigos ou Discord.'); carregarLfg();
  });
  $('#lfg-lista').querySelectorAll('[data-lfg-fim]').forEach((b) => b.onclick = async () => {
    const { error } = await sb.from('lfg_posts').delete().eq('id', b.dataset.lfgFim); error ? falha(error) : carregarLfg();
  });
  if (!u || $('#lfg-form').dataset.ok) return;
  $('#lfg-form').dataset.ok = '1';
  $('#lfg-abrir').onclick = () => $('#lfg-form').classList.toggle('hidden');
  $('#lfg-cancelar').onclick = () => $('#lfg-form').classList.add('hidden');
  let t;
  $('#lfg-busca').oninput = () => {
    $('#lfg-jogo').value = ''; clearTimeout(t);
    t = setTimeout(async () => {
      const termo = $('#lfg-busca').value.trim().replace(/[%,()]/g, '');
      if (termo.length < 2) return $('#lfg-sug').classList.add('hidden');
      const { data } = await sb.from('games').select('id,title').ilike('title', `%${termo}%`).order('igdb_rating_count', { ascending: false, nullsFirst: false }).limit(6);
      $('#lfg-sug').innerHTML = (data || []).map((j) => `<button type="button" data-id="${j.id}" data-t="${esc(j.title)}">${esc(j.title)}</button>`).join('');
      $('#lfg-sug').classList.remove('hidden');
      $('#lfg-sug').querySelectorAll('[data-id]').forEach((b) => b.onclick = () => { $('#lfg-jogo').value = b.dataset.id; $('#lfg-busca').value = b.dataset.t; $('#lfg-sug').classList.add('hidden'); });
    }, 300);
  };
  $('#lfg-form').onsubmit = async (e) => {
    e.preventDefault();
    const horas = Number($('#lfg-dur').value);
    const { error } = await sb.from('lfg_posts').insert({ user_id: u.id, game_id: $('#lfg-jogo').value ? Number($('#lfg-jogo').value) : null,
      platform: $('#lfg-plat').value || null, slots: Number($('#lfg-vagas').value) || null, note: $('#lfg-nota').value.trim() || null,
      expires_at: new Date(Date.now() + horas * 3600e3).toISOString() });
    if (error) return falha(/row-level/.test(error.message) ? { message: 'Você já tem 3 pedidos ativos. Encerre um para criar outro.' } : error);
    toast('Publicado! Seus amigos foram avisados.'); e.target.reset(); e.target.classList.add('hidden'); carregarLfg();
  };
}
