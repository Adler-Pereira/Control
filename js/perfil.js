import { sb, $, esc, montarLayout, configurado, exigirLogin, perfil, nivel, avatar, estrelas, data, cardJogo, toast, falha, param } from './app.js';

await montarLayout();
const main = $('#conteudo');

if (configurado) {
  const u = await exigirLogin();
  if (u) carregar(u);
}

async function carregar(u) {
  const p = await perfil();
  const n = nivel(p.xp);
  const [{ data: cats }, { data: reviews }, { data: comms }, { data: rec }] = await Promise.all([
    sb.from('categories').select('*').order('name'),
    sb.from('reviews').select('*, games(slug,title)').eq('user_id', u.id).order('created_at', { ascending: false }),
    sb.from('community_members').select('communities(id,name)').eq('user_id', u.id),
    sb.rpc('recommend_games', { lim: 8 }),
  ]);

  main.innerHTML = `
    ${param('senha') ? `<div class="cartao" style="margin-bottom:16px"><h3>Definir nova senha</h3>
      <form id="form-senha" class="controles"><input id="nova-senha" type="password" minlength="8" required placeholder="Nova senha" style="max-width:280px"><button class="btn">Salvar senha</button></form></div>` : ''}
    <div class="cartao" style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
      <img class="avatar grande" src="${avatar(p)}" alt="">
      <div style="flex:1;min-width:220px">
        <h1 style="margin:0">${esc(p.username)}</h1>
        <p><span class="tag amarela">Nível ${n.lv} · ${n.titulo}</span> ${p.role !== 'user' ? `<span class="tag">${p.role}</span>` : ''}</p>
        <div class="barra-xp" style="margin-top:10px" title="${p.xp} XP"><div style="width:${n.pct}%"></div></div>
        <p class="muted" style="font-size:.85rem">${p.xp} XP · próximo nível em ${n.prox} XP</p>
      </div>
      <button class="btn sec" id="logout">Sair</button>
    </div>

    <h2>Recomendados para você</h2>
    <p class="muted" style="margin-bottom:12px">Com base nas suas categorias favoritas e nos jogos que você avaliou bem.</p>
    <div class="grade">${(rec || []).map(cardJogo).join('') || '<p class="vazio">Avalie jogos para receber recomendações.</p>'}</div>

    <h2>Editar perfil</h2>
    <form class="cartao" id="form-perfil">
      <div class="form-linha">
        <div><label for="username">Nome de usuário</label><input id="username" value="${esc(p.username)}" minlength="3" maxlength="30" pattern="[A-Za-z0-9_]+" required></div>
        <div><label for="foto">Foto de perfil</label><input id="foto" type="file" accept="image/png,image/jpeg,image/webp"></div>
      </div>
      <label for="bio">Bio</label><textarea id="bio" rows="2" maxlength="300">${esc(p.bio || '')}</textarea>
      <label>Categorias favoritas</label>
      <div class="chips" id="favs">${(cats || []).map((c) => `<button type="button" class="chip ${p.fav_categories.includes(c.id) ? 'ativo' : ''}" data-id="${c.id}">${esc(c.name)}</button>`).join('')}</div>
      <button class="btn">Salvar</button>
    </form>

    <div class="detalhe" style="margin-top:8px">
      <div><h2>Minhas avaliações (${reviews.length})</h2><div class="lista">
        ${reviews.map((r) => `<div class="review"><a href="jogo.html?slug=${encodeURIComponent(r.games.slug)}">${esc(r.games.title)}</a> ${estrelas(r.rating)}
          <span class="muted">${data(r.created_at)}</span>${r.body ? `<p class="quebra muted">${esc(r.body)}</p>` : ''}</div>`).join('') || '<p class="vazio">Nenhuma avaliação ainda.</p>'}
      </div></div>
      <div><h2>Minhas comunidades</h2><div class="lista">
        ${(comms || []).map((m) => `<a class="cartao" href="comunidade.html?id=${m.communities.id}">${esc(m.communities.name)}</a>`).join('') || '<p class="vazio">Você ainda não participa de comunidades.</p>'}
      </div></div>
    </div>`;

  main.querySelectorAll('#favs .chip').forEach((b) => b.onclick = () => b.classList.toggle('ativo'));
  $('#logout').onclick = () => sb.auth.signOut();

  $('#form-senha')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: $('#nova-senha').value });
    error ? falha(error) : (toast('Senha atualizada!'), history.replaceState(null, '', 'perfil.html'), $('#form-senha').parentElement.remove());
  });

  $('#form-perfil').onsubmit = async (e) => {
    e.preventDefault();
    const dados = {
      username: $('#username').value.trim(), bio: $('#bio').value.trim() || null,
      fav_categories: [...main.querySelectorAll('#favs .chip.ativo')].map((b) => Number(b.dataset.id)),
    };
    const arq = $('#foto').files[0];
    if (arq) {
      if (arq.size > 2 * 1024 * 1024) return toast('A foto deve ter no máximo 2 MB.', true);
      const caminho = `avatars/${u.id}/avatar-${Date.now()}.${arq.name.split('.').pop().toLowerCase()}`;
      const { error } = await sb.storage.from('media').upload(caminho, arq, { upsert: true });
      if (error) return falha(error);
      dados.avatar_url = sb.storage.from('media').getPublicUrl(caminho).data.publicUrl;
    }
    const { error } = await sb.from('profiles').update(dados).eq('id', u.id);
    if (error) return falha(error.code === '23505' ? { message: 'Esse nome de usuário já está em uso.' } : error);
    toast('Perfil atualizado!');
    setTimeout(() => location.reload(), 700);
  };
}
