import { sb, $, esc, montarLayout, configurado, usuario, perfil, nivel, avatar, estrelas, data, cardJogo, toast, falha, param, urlSegura, denunciar, avatarHtml } from './app.js';

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
  carregar(p, meu, u);
}

async function carregar(p, meu, u) {
  const n = nivel(p.xp);
  const [{ data: reviews }, { data: comms }, rec] = await Promise.all([
    sb.from('reviews').select('*, games(slug,title)').eq('user_id', p.id).eq('status', 'published').order('created_at', { ascending: false }),
    sb.from('community_members').select('communities(id,name)').eq('user_id', p.id),
    meu ? sb.rpc('recommend_games', { lim: 8 }) : Promise.resolve({ data: null }),
  ]);
  const [{ data: selos }, { data: bib }, { count: seguidores }, { count: seguindo }, { data: sigo }] = await Promise.all([
    sb.from('user_cosmetics').select('cosmetic_id, cosmetics(name,icon,kind,rarity,sort)').eq('user_id', p.id),
    sb.from('user_games').select('*, games(id,slug,title,cover_url,avg_rating,reviews_count, deals(discount_pct,price_cents,store))').eq('user_id', p.id).order('updated_at', { ascending: false }).limit(500),
    sb.from('follows').select('follower_id', { count: 'exact', head: true }).eq('followed_id', p.id),
    sb.from('follows').select('followed_id', { count: 'exact', head: true }).eq('follower_id', p.id),
    u && !meu ? sb.from('follows').select('followed_id').eq('follower_id', u.id).eq('followed_id', p.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const [{ data: amigosDele }, { data: amizade }] = await Promise.all([
    sb.rpc('friends_of', { uid: p.id }),
    u && !meu ? sb.from('friendships').select('*').eq('user_a', u.id < p.id ? u.id : p.id).eq('user_b', u.id < p.id ? p.id : u.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const GRUPOS = [['jogando', '🎮 Jogando'], ['quero_jogar', '📌 Quero jogar'], ['zerado', '🏆 Zerados'], ['abandonei', '💤 Abandonados'], [null, '📚 Na biblioteca']];
  const lista = bib || [];
  const desejos = lista.filter((x) => x.wishlist);
  const reais = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const itemBib = (x) => {
    const d = (x.games.deals || []).filter((k) => k.discount_pct > 0).sort((a, b) => b.discount_pct - a.discount_pct)[0];
    return `<a class="review" href="jogo.html?slug=${encodeURIComponent(x.games.slug)}" style="display:flex;gap:10px;align-items:center;color:var(--texto);text-decoration:none">
      <img src="${urlSegura(x.games.cover_url) || 'img/Control.png'}" alt="" style="width:64px;height:38px;object-fit:cover;border-radius:6px">
      <span style="flex:1"><strong>${esc(x.games.title)}</strong>${x.hours ? ` <span class="muted">· ${Number(x.hours).toLocaleString('pt-BR')} h</span>` : ''}</span>
      ${d ? `<span class="tag amarela">-${d.discount_pct}% ${d.price_cents != null ? reais(d.price_cents) : ''}</span>` : ''}</a>`;
  };
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
      <div class="perfil-banner ${/^[a-z0-9_]+$/.test(p.equipped_banner || '') ? 'bn-' + p.equipped_banner : ''}" ${banner && !p.equipped_banner ? `style="background-image:url('${banner}')"` : ''}></div>
      <div class="perfil-info">
        ${avatarHtml(p, 'grande', 'Foto de ' + p.username)}
        <div class="nome-bloco">
          <h1 style="margin:0">${esc(p.username)}</h1>
          <p><span class="tag amarela">Nível ${n.lv} · ${n.titulo}</span> ${p.role !== 'user' ? `<span class="tag">${esc(p.role)}</span>` : ''}</p>
          ${p.bio ? `<p class="quebra" style="margin-top:6px">${esc(p.bio)}</p>` : meu ? '<p class="muted" style="margin-top:6px">Adicione uma bio contando o que você joga.</p>' : ''}
          ${contas ? `<div class="contas-jogo">${contas}</div>` : ''}
          ${(() => { const s = (selos || []).filter((x) => x.cosmetics?.kind === 'badge').sort((a, b) => a.cosmetics.sort - b.cosmetics.sort);
            return s.length || p.streak_current ? `<div class="vitrine">${p.streak_current ? `<span title="Dias seguidos">🔥 ${p.streak_current} dias</span>` : ''}
              ${s.slice(-6).reverse().map((x) => `<span title="${esc(x.cosmetics.name)}">${esc(x.cosmetics.icon || '🏅')} ${esc(x.cosmetics.name)}</span>`).join('')}
              <a href="conquistas.html" style="font-size:.82rem;align-self:center">${meu ? 'Ver conquistas →' : ''}</a></div>` : ''; })()}
          <div class="barra-xp" style="margin-top:10px;max-width:360px" title="${p.xp} XP"><div style="width:${n.pct}%"></div></div>
          <p class="muted" style="font-size:.85rem">${p.xp} XP · próximo nível em ${n.prox} XP</p>
          <p style="margin-top:6px"><strong id="n-seguidores">${seguidores ?? 0}</strong> seguidores · <strong>${seguindo ?? 0}</strong> seguindo ·
            <strong>${lista.filter((x) => x.status).length}</strong> jogos na biblioteca</p>
        </div>
        ${!meu ? `<div class="controles">${u ? `<button class="btn ${sigo ? 'sec' : ''}" id="seguir">${sigo ? '✓ Seguindo' : '+ Seguir'}</button>
          <button class="btn sec" id="amizade">${amizade?.status === 'aceita' ? '🤝 Amigos' : amizade ? (amizade.requester === u.id ? '⏳ Pedido enviado' : '✓ Aceitar amizade') : '👥 Adicionar amigo'}</button>` : ''}
          ${u ? '<button class="bt-denunciar" id="den-perfil">🚩 Denunciar perfil</button>' : ''}</div>` : ''}
        ${meu ? `<div class="controles"><button class="btn" id="editar">✏️ Editar perfil</button>
          <a class="btn sec" href="conquistas.html">🏆 Conquistas</a><button class="btn sec" id="compartilhar">🔗 Copiar link</button><button class="btn sec" id="logout">Sair</button></div>` : ''}
      </div>
    </section>

    ${meu ? `<h2>Recomendados para você</h2>
      <p class="muted" style="margin-bottom:12px">Com base nas suas categorias favoritas e nos jogos que você avaliou bem.</p>
      <div class="grade">${(rec.data || []).map(cardJogo).join('') || '<p class="vazio">Escolha categorias favoritas em "Editar perfil" ou avalie jogos para receber recomendações.</p>'}</div>` : ''}

    <h2>Biblioteca</h2>
    ${meu ? `<div class="cartao" style="margin-bottom:12px"><div class="controles" style="align-items:center">
      <span style="flex:1">Importe seus jogos e horas jogadas da <strong>Steam</strong> (seu perfil e a lista de jogos precisam estar públicos).</span>
      <button class="btn sec" id="importar-steam">🖥️ Importar da Steam</button></div>
      <p class="muted" style="font-size:.82rem;margin-top:6px">PlayStation e Xbox não oferecem importação oficial: adicione esses jogos pela página de cada jogo.</p></div>` : ''}
    ${lista.length ? `<div class="chips" id="abas-bib">${GRUPOS.map(([k, t]) => {
        const qtd = lista.filter((x) => x.status === k && (k || !x.wishlist || x.hours)).length;
        return qtd ? `<button class="chip" data-g="${k ?? ''}">${t} (${qtd})</button>` : ''; }).join('')}</div>
      <div class="lista" id="lista-bib"></div>` : `<p class="vazio">${meu ? 'Sua biblioteca está vazia. Abra a página de um jogo e marque "Jogando", "Zerado"...' : 'Biblioteca vazia.'}</p>`}

    ${desejos.length ? `<h2>💖 Lista de desejos (${desejos.length})</h2><div class="lista">${desejos.map(itemBib).join('')}</div>` : ''}

    <div class="detalhe" style="margin-top:8px">
      <div><h2>Avaliações (${reviews.length})</h2><div class="lista">
        ${reviews.map((r) => `<div class="review"><a href="jogo.html?slug=${encodeURIComponent(r.games.slug)}">${esc(r.games.title)}</a> ${estrelas(r.rating)}
          <span class="muted">${data(r.created_at)}</span>${r.body ? `<p class="quebra muted">${esc(r.body)}</p>` : ''}</div>`).join('') || '<p class="vazio">Nenhuma avaliação ainda.</p>'}
      </div></div>
      <div><h2>Amigos (${(amigosDele || []).length})</h2><div class="controles" style="margin-bottom:12px">
        ${(amigosDele || []).slice(0, 24).map((a) => `<a href="perfil.html?u=${encodeURIComponent(a.username)}" title="${esc(a.username)}">${avatarHtml(a)}</a>`).join('') || '<span class="muted">Nenhum amigo ainda.</span>'}
        ${meu ? '<a class="btn sec pequeno" href="amigos.html">Gerenciar amigos</a>' : ''}</div>
      <h2>Comunidades</h2><div class="lista">
        ${(comms || []).map((m) => `<a class="cartao" href="comunidade.html?id=${m.communities.id}">${esc(m.communities.name)}</a>`).join('') || '<p class="vazio">Nenhuma comunidade ainda.</p>'}
      </div></div>
    </div>
    ${meu ? `<h2>Privacidade e conta</h2>
      <div class="cartao controles" style="align-items:center">
        <span style="flex:1" class="muted">Seus direitos pela LGPD. Veja a <a href="privacidade.html">Política de Privacidade</a>.</span>
        <button class="btn sec" id="exportar">⬇️ Baixar meus dados</button>
        <button class="btn perigo" id="excluir-conta">Excluir minha conta</button>
      </div><dialog id="dlg-editar"></dialog>` : ''}`;

  // Abas da biblioteca
  const mostrarGrupo = (k) => {
    main.querySelectorAll('#abas-bib .chip').forEach((c) => c.classList.toggle('ativo', c.dataset.g === k));
    const sel = lista.filter((x) => (x.status ?? '') === k && (k || !x.wishlist || x.hours));
    $('#lista-bib').innerHTML = sel.map(itemBib).join('');
  };
  const primeira = main.querySelector('#abas-bib .chip');
  if (primeira) { main.querySelectorAll('#abas-bib .chip').forEach((c) => c.onclick = () => mostrarGrupo(c.dataset.g)); mostrarGrupo(primeira.dataset.g); }

  if (!meu) {
    $('#den-perfil')?.addEventListener('click', () => denunciar('profile', p.id));
    $('#amizade')?.addEventListener('click', async (e) => {
      if (amizade?.status === 'aceita') return (location.href = 'amigos.html');
      if (amizade && amizade.requester === u.id) return;
      const { data: r, error } = await sb.rpc('friend_request', { alvo: p.id });
      if (error) return falha(error);
      e.currentTarget.textContent = r === 'amigos' ? '🤝 Amigos' : '⏳ Pedido enviado';
      toast(r === 'amigos' ? 'Agora vocês são amigos! 🤝' : 'Pedido de amizade enviado!');
    });
    $('#seguir')?.addEventListener('click', async (e) => {
      const b = e.currentTarget, seguir = b.textContent.includes('Seguir') && !b.textContent.includes('✓');
      const { error } = seguir
        ? await sb.from('follows').insert({ follower_id: u.id, followed_id: p.id })
        : await sb.from('follows').delete().eq('follower_id', u.id).eq('followed_id', p.id);
      if (error) return falha(error);
      b.textContent = seguir ? '✓ Seguindo' : '+ Seguir'; b.classList.toggle('sec', seguir);
      const n = $('#n-seguidores'); n.textContent = Number(n.textContent) + (seguir ? 1 : -1);
    });
    return;
  }

  $('#importar-steam').onclick = () => importarSteam(p);
  $('#exportar').onclick = () => exportarDados(p);
  $('#excluir-conta').onclick = async () => {
    const conf = prompt(`Isso apaga DEFINITIVAMENTE sua conta, perfil, avaliações, posts, biblioteca e imagens.\n\nPara confirmar, digite seu nome de usuário: ${p.username}`);
    if (conf === null) return;
    if (conf.trim() !== p.username) return toast('Nome de usuário não confere. Nada foi apagado.', true);
    const { error } = await sb.rpc('delete_my_account');
    if (error) return falha(error);
    await sb.auth.signOut().catch(() => {});
    alert('Sua conta foi excluída. Sentiremos sua falta!');
    location.href = 'index.html';
  };
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

// LGPD: baixa um arquivo JSON com todos os dados da pessoa
async function exportarDados(p) {
  const tabelas = [['avaliacoes', 'reviews', 'user_id'], ['posts', 'posts', 'user_id'], ['biblioteca', 'user_games', 'user_id'],
    ['comunidades', 'community_members', 'user_id'], ['seguindo', 'follows', 'follower_id'], ['seguidores', 'follows', 'followed_id'], ['amizades_a', 'friendships', 'user_a'], ['amizades_b', 'friendships', 'user_b'],
    ['partidas', 'event_attendees', 'user_id'], ['notificacoes', 'notifications', 'user_id']];
  const out = { exportado_em: new Date().toISOString(), perfil: p };
  const { data: { user } } = await sb.auth.getUser();
  out.conta = { email: user?.email, criada_em: user?.created_at };
  for (const [nome, t, col] of tabelas) out[nome] = (await sb.from(t).select('*').eq(col, p.id)).data || [];
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `control-critic-${p.username}.json` });
  a.click(); URL.revokeObjectURL(a.href);
}

// Importa jogos e horas da Steam (via função no servidor, que guarda a chave da Steam)
async function importarSteam(p) {
  const perfilSteam = prompt('Cole o link do seu perfil da Steam (ex.: https://steamcommunity.com/id/seunome):', p.steam_profile || '');
  if (!perfilSteam) return;
  const bt = $('#importar-steam'); bt.disabled = true; bt.textContent = 'Importando... (pode levar um minuto)';
  try {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch('/.netlify/functions/importar-steam', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify({ perfil: perfilSteam.trim() }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erro || 'Não foi possível importar.');
    alert(`Importação concluída!\n\n${d.importados} jogo(s) adicionados ou atualizados na sua biblioteca` +
      (d.novos_no_catalogo ? `\n${d.novos_no_catalogo} jogo(s) novos entraram no catálogo do site` : '') +
      (d.ignorados ? `\n${d.ignorados} item(ns) ignorados (ferramentas, softwares etc.)` : ''));
    location.reload();
  } catch (e) { falha(e); bt.disabled = false; bt.textContent = '🖥️ Importar da Steam'; }
}
