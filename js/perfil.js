import { sb, $, esc, montarLayout, configurado, usuario, perfil, nivel, avatar, estrelas, data, cardJogo, toast, falha, param, urlSegura } from './app.js';

await montarLayout();
const main = $('#conteudo');
const LIMITE_MB = 3;

if (configurado) iniciar();

async function iniciar() {
  const u = await usuario();
  const alvo = param('u');
  let p;
  if (alvo) {
    ({ data: p } = await sb.from('profiles').select('*').eq('username', alvo).maybeSingle());
    if (!p) { main.innerHTML = '<p class="vazio">Usuário não encontrado.</p>'; return; }
  } else {
    if (!u) { location.href = 'entrar.html?volta=perfil.html'; return; }
    p = await perfil();
  }
  const meu = u && p.id === u.id;
  document.title = `${p.username} | Control Critic`;
  carregar(p, meu);
}

async function carregar(p, meu) {
  const n = nivel(p.xp);
  const [{ data: reviews }, { data: comms }, rec] = await Promise.all([
    sb.from('reviews').select('*, games(slug,title)').eq('user_id', p.id).eq('status', 'published').order('created_at', { ascending: false }),
    sb.from('community_members').select('communities(id,name)').eq('user_id', p.id),
    meu ? sb.rpc('recommend_games', { lim: 8 }) : Promise.resolve({ data: null }),
  ]);
  const banner = urlSegura(p.banner_url);
  const contas = [
    p.psn_id && `<span title="PlayStation Network">🎮 PSN: ${esc(p.psn_id)}</span>`,
    p.xbox_gamertag && `<span title="Xbox">🟩 Xbox: ${esc(p.xbox_gamertag)}</span>`,
    p.discord_user && `<span title="Discord">💬 Discord: ${esc(p.discord_user)}</span>`,
    p.steam_profile && `<a href="${urlSegura(p.steam_profile)}" target="_blank" rel="noopener">🖥️ Steam</a>`,
  ].filter(Boolean).join('');

  main.innerHTML = `
    ${meu && param('senha') ? `<div class="cartao" style="margin-bottom:16px"><h3>Definir nova senha</h3>
      <form id="form-senha" class="controles"><input id="nova-senha" type="password" minlength="8" required placeholder="Nova senha" style="max-width:280px"><button class="btn">Salvar senha</button></form></div>` : ''}

    <section class="perfil-capa">
      <div class="perfil-banner" ${banner ? `style="background-image:url('${banner}')"` : ''}></div>
      <div class="perfil-info">
        <img class="avatar grande" src="${avatar(p)}" alt="Foto de ${esc(p.username)}">
        <div class="nome-bloco">
          <h1 style="margin:0">${esc(p.username)}</h1>
          <p><span class="tag amarela">Nível ${n.lv} · ${n.titulo}</span> ${p.role !== 'user' ? `<span class="tag">${esc(p.role)}</span>` : ''}</p>
          ${p.bio ? `<p class="quebra" style="margin-top:6px">${esc(p.bio)}</p>` : meu ? '<p class="muted" style="margin-top:6px">Adicione uma bio contando o que você joga.</p>' : ''}
          ${contas ? `<div class="contas-jogo">${contas}</div>` : ''}
          <div class="barra-xp" style="margin-top:10px;max-width:360px" title="${p.xp} XP"><div style="width:${n.pct}%"></div></div>
          <p class="muted" style="font-size:.85rem">${p.xp} XP · próximo nível em ${n.prox} XP</p>
        </div>
        ${meu ? `<div class="controles"><button class="btn" id="editar">✏️ Editar perfil</button>
          <button class="btn sec" id="compartilhar">🔗 Copiar link</button><button class="btn sec" id="logout">Sair</button></div>` : ''}
      </div>
    </section>

    ${meu ? `<h2>Recomendados para você</h2>
      <p class="muted" style="margin-bottom:12px">Com base nas suas categorias favoritas e nos jogos que você avaliou bem.</p>
      <div class="grade">${(rec.data || []).map(cardJogo).join('') || '<p class="vazio">Escolha categorias favoritas em "Editar perfil" ou avalie jogos para receber recomendações.</p>'}</div>` : ''}

    <div class="detalhe" style="margin-top:8px">
      <div><h2>Avaliações (${reviews.length})</h2><div class="lista">
        ${reviews.map((r) => `<div class="review"><a href="jogo.html?slug=${encodeURIComponent(r.games.slug)}">${esc(r.games.title)}</a> ${estrelas(r.rating)}
          <span class="muted">${data(r.created_at)}</span>${r.body ? `<p class="quebra muted">${esc(r.body)}</p>` : ''}</div>`).join('') || '<p class="vazio">Nenhuma avaliação ainda.</p>'}
      </div></div>
      <div><h2>Comunidades</h2><div class="lista">
        ${(comms || []).map((m) => `<a class="cartao" href="comunidade.html?id=${m.communities.id}">${esc(m.communities.name)}</a>`).join('') || '<p class="vazio">Nenhuma comunidade ainda.</p>'}
      </div></div>
    </div>
    ${meu ? '<dialog id="dlg-editar"></dialog>' : ''}`;

  if (!meu) return;
  $('#logout').onclick = () => sb.auth.signOut();
  $('#compartilhar').onclick = async () => {
    const link = location.origin + location.pathname + '?u=' + encodeURIComponent(p.username);
    try { await navigator.clipboard.writeText(link); toast('Link do perfil copiado!'); } catch { prompt('Copie o link do seu perfil:', link); }
  };
  $('#editar').onclick = () => abrirEditor(p);

  $('#form-senha')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: $('#nova-senha').value });
    if (error) return falha(error);
    toast('Senha atualizada!'); history.replaceState(null, '', 'perfil.html'); $('#form-senha').parentElement.remove();
  });
}

// ---------- Editor de perfil (com pré-visualização da foto e do banner) ----------
async function abrirEditor(p) {
  const { data: cats } = await sb.from('categories').select('*').order('name');
  const dlg = $('#dlg-editar');
  const novos = { foto: null, banner: null };
  const remover = { foto: false, banner: false };

  dlg.innerHTML = `<form id="form-perfil">
    <h2 style="margin-top:0">Editar perfil</h2>

    <div class="editor-imagens">
      <div>
        <label>Banner <span class="muted">(recomendado 1500×500, até ${LIMITE_MB} MB)</span></label>
        <label class="zona-upload banner" id="zona-banner" style="${p.banner_url ? `background-image:url('${urlSegura(p.banner_url)}')` : ''}">
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-tipo="banner">
          <span class="dica">📷 Clique ou arraste uma imagem para o banner</span>
        </label>
        ${p.banner_url ? '<button type="button" class="btn sec pequeno" data-remover="banner" style="margin-top:6px">Remover banner</button>' : ''}
      </div>
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <label class="zona-upload foto" id="zona-foto" style="background-image:url('${avatar(p)}')">
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-tipo="foto">
          <span class="dica">📷 Trocar</span>
        </label>
        <div class="muted" style="font-size:.88rem">Foto de perfil<br>Quadrada, até ${LIMITE_MB} MB.<br>
          ${p.avatar_url ? '<button type="button" class="btn sec pequeno" data-remover="foto" style="margin-top:6px">Usar foto padrão</button>' : ''}</div>
      </div>
    </div>

    <div class="secao-form"><h3>Sobre você</h3>
      <label for="username">Nome de usuário</label>
      <input id="username" value="${esc(p.username)}" minlength="3" maxlength="30" pattern="[A-Za-z0-9_]+" title="Use só letras, números e _" required>
      <label for="bio">Bio <span class="muted" id="bio-cont"></span></label>
      <textarea id="bio" rows="3" maxlength="300" placeholder="Ex.: Viciado em soulslike, jogo à noite no PS5.">${esc(p.bio || '')}</textarea>
    </div>

    <div class="secao-form"><h3>Contas de jogo</h3>
      <p class="muted" style="font-size:.85rem">Aparecem no seu perfil para a galera te adicionar.</p>
      <div class="form-linha">
        <div><label for="psn">PSN ID</label><input id="psn" maxlength="30" value="${esc(p.psn_id || '')}"></div>
        <div><label for="xbox">Gamertag Xbox</label><input id="xbox" maxlength="30" value="${esc(p.xbox_gamertag || '')}"></div>
        <div><label for="discord">Usuário do Discord</label><input id="discord" maxlength="40" value="${esc(p.discord_user || '')}"></div>
        <div><label for="steam">Link do perfil Steam</label><input id="steam" type="url" placeholder="https://steamcommunity.com/id/..." value="${esc(p.steam_profile || '')}"></div>
      </div>
    </div>

    <div class="secao-form"><h3>Categorias favoritas</h3>
      <p class="muted" style="font-size:.85rem">Usadas nas suas recomendações.</p>
      <div class="chips" id="favs" style="margin-top:8px">${(cats || []).map((c) => `<button type="button" class="chip ${p.fav_categories.includes(c.id) ? 'ativo' : ''}" data-id="${c.id}">${esc(c.name)}</button>`).join('')}</div>
    </div>

    <div class="controles" style="margin-top:18px;position:sticky;bottom:-22px;background:var(--cartao);padding:12px 0">
      <button class="btn" id="salvar">Salvar alterações</button>
      <button type="button" class="btn sec" id="cancelar">Cancelar</button>
    </div>
  </form>`;
  dlg.showModal();

  const contar = () => ($('#bio-cont').textContent = `(${$('#bio').value.length}/300)`);
  contar(); $('#bio').oninput = contar;
  $('#cancelar').onclick = () => dlg.close();
  dlg.querySelectorAll('#favs .chip').forEach((b) => b.onclick = () => b.classList.toggle('ativo'));

  // Pré-visualização + arrastar e soltar
  const escolher = (tipo, arq) => {
    if (!arq) return;
    if (!arq.type.startsWith('image/')) return toast('Escolha um arquivo de imagem.', true);
    if (arq.size > LIMITE_MB * 1024 * 1024) return toast(`A imagem deve ter no máximo ${LIMITE_MB} MB.`, true);
    novos[tipo] = arq; remover[tipo] = false;
    $(`#zona-${tipo}`).style.backgroundImage = `url('${URL.createObjectURL(arq)}')`;
  };
  dlg.querySelectorAll('.zona-upload').forEach((z) => {
    const input = z.querySelector('input');
    input.onchange = () => escolher(input.dataset.tipo, input.files[0]);
    z.ondragover = (e) => { e.preventDefault(); z.classList.add('arrastando'); };
    z.ondragleave = () => z.classList.remove('arrastando');
    z.ondrop = (e) => { e.preventDefault(); z.classList.remove('arrastando'); escolher(input.dataset.tipo, e.dataTransfer.files[0]); };
  });
  dlg.querySelectorAll('[data-remover]').forEach((b) => b.onclick = () => {
    const t = b.dataset.remover; remover[t] = true; novos[t] = null;
    $(`#zona-${t}`).style.backgroundImage = t === 'foto' ? "url('img/perfilpadrao.png')" : 'none';
    b.remove();
  });

  $('#form-perfil').onsubmit = async (e) => {
    e.preventDefault();
    const steam = $('#steam').value.trim();
    if (steam && !/^https:\/\/steamcommunity\.com\/(id|profiles)\/[A-Za-z0-9_-]+\/?$/.test(steam)) return toast('Link da Steam inválido. Ex.: https://steamcommunity.com/id/seunome', true);
    const btn = $('#salvar'); btn.disabled = true; btn.textContent = 'Salvando...';
    try {
      const dados = {
        username: $('#username').value.trim(), bio: $('#bio').value.trim() || null,
        psn_id: $('#psn').value.trim() || null, xbox_gamertag: $('#xbox').value.trim() || null,
        discord_user: $('#discord').value.trim() || null, steam_profile: steam || null,
        fav_categories: [...dlg.querySelectorAll('#favs .chip.ativo')].map((b) => Number(b.dataset.id)),
      };
      for (const [tipo, coluna] of [['foto', 'avatar_url'], ['banner', 'banner_url']]) {
        if (remover[tipo]) dados[coluna] = null;
        if (novos[tipo]) dados[coluna] = await enviar(p.id, tipo, novos[tipo]);
      }
      const { error } = await sb.from('profiles').update(dados).eq('id', p.id);
      if (error) throw error.code === '23505' ? new Error('Esse nome de usuário já está em uso.')
        : /column .* does not exist|schema cache/.test(error.message) ? new Error('Banco desatualizado: rode de novo o supabase/schema.sql no Supabase.') : error;
      toast('Perfil atualizado!');
      setTimeout(() => location.reload(), 600);
    } catch (err) { falha(err); btn.disabled = false; btn.textContent = 'Salvar alterações'; }
  };
}

async function enviar(uid, tipo, arq) {
  const ext = (arq.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  const caminho = `avatars/${uid}/${tipo}-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('media').upload(caminho, arq, { contentType: arq.type });
  if (error) throw new Error(`Não foi possível enviar a imagem (${error.message}).`);
  return sb.storage.from('media').getPublicUrl(caminho).data.publicUrl;
}
