import { SUPABASE_ANON_KEY } from './config.js';
import { sb, $, esc, montarLayout, configurado, usuario, perfil, nivel, avatar, estrelas, data, cardJogo, toast, falha, param, urlSegura, denunciar, avatarHtml, sair, COLUNAS_CARD, aoVivo, seloAoVivo, estadoPush, ativarPush, desativarPush, steamAgora, carrossel, enviarImagem, srcCapa } from './app.js';
import { COLUNAS_POST, postHtml, ligarPosts, compositorHtml, ligarCompositor } from './posts.js';

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
    meu ? sb.rpc('recommend_games', { lim: 8 }).select(COLUNAS_CARD) : Promise.resolve({ data: null }),
  ]);
  const [{ data: selos }, { data: bib }, { count: seguidores }, { count: seguindo }, { data: sigo }] = await Promise.all([
    sb.from('user_cosmetics').select('cosmetic_id, cosmetics(name,icon,kind,rarity,sort)').eq('user_id', p.id),
    sb.from('user_games').select('*, games(id,slug,title,cover_url,avg_rating,reviews_count, deals(discount_pct,price_cents,store))').eq('user_id', p.id).order('updated_at', { ascending: false }).limit(2000),
    sb.from('follows').select('follower_id', { count: 'exact', head: true }).eq('followed_id', p.id),
    sb.from('follows').select('followed_id', { count: 'exact', head: true }).eq('follower_id', p.id),
    u && !meu ? sb.from('follows').select('followed_id').eq('follower_id', u.id).eq('followed_id', p.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const [{ data: amigosDele }, { data: amizade }, { data: titulos }] = await Promise.all([
    sb.rpc('friends_of', { uid: p.id }),
    u && !meu ? sb.from('friendships').select('*').eq('user_a', u.id < p.id ? u.id : p.id).eq('user_b', u.id < p.id ? p.id : u.id).maybeSingle() : Promise.resolve({ data: null }),
    (p.titles || []).length ? sb.from('site_titles').select('*').order('sort') : Promise.resolve({ data: [] }),
  ]);
  const { data: listas } = await sb.from('user_lists').select('id,title,is_public,list_items(count)').eq('user_id', p.id).order('updated_at', { ascending: false }).limit(30);
  const GRUPOS = [['jogando', '🎮 Jogando'], ['quero_jogar', '📌 Quero jogar'], ['zerado', '🏆 Zerados'], ['abandonei', '💤 Abandonados'], [null, '📚 Na biblioteca']];
  const lista = bib || [];
  // Últimos jogados (Steam) ou atualizados por último
  const recentes = lista.filter((x) => x.status || x.hours).slice().sort((a, b) => new Date(b.last_played || b.updated_at) - new Date(a.last_played || a.updated_at)).slice(0, 4);
  const vitrine = (p.showcase_games || []).map((gid) => lista.find((x) => x.game_id === gid)?.games).filter(Boolean);
  const desejos = lista.filter((x) => x.wishlist);
  const reais = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const itemBib = (x) => {
    const d = (x.games.deals || []).filter((k) => k.discount_pct > 0).sort((a, b) => b.discount_pct - a.discount_pct)[0];
    return `<a class="review" href="jogo.html?slug=${encodeURIComponent(x.games.slug)}" style="display:flex;gap:10px;align-items:center;color:var(--texto);text-decoration:none">
      <img ${srcCapa(x.games.cover_url, 160)} alt="" style="width:64px;height:38px;object-fit:cover;border-radius:6px">
      <span style="flex:1"><strong>${esc(x.games.title)}</strong>${x.hours ? ` <span class="muted">· ${Number(x.hours).toLocaleString('pt-BR')} h</span>` : ''}</span>
      ${d ? `<span class="tag amarela">-${d.discount_pct}% ${d.price_cents != null ? reais(d.price_cents) : ''}</span>` : ''}</a>`;
  };
  const banner = urlSegura(p.banner_url);
  const contas = [
    p.psn_id && `<span title="PlayStation Network">🎮 PSN: ${esc(p.psn_id)}</span>`,
    p.xbox_gamertag && `<span title="Xbox">🟩 Xbox: ${esc(p.xbox_gamertag)}</span>`,
    p.discord_user && `<span title="Discord">💬 Discord: ${esc(p.discord_user)}</span>`,
    p.steam_profile && `<a href="${urlSegura(p.steam_profile)}" target="_blank" rel="noopener">🖥️ Steam</a>`,
    p.twitch_user && `<a href="https://twitch.tv/${encodeURIComponent(p.twitch_user)}" target="_blank" rel="noopener" id="link-twitch">📺 Twitch</a>`,
  ].filter(Boolean).join('');

  // Banner da loja de conquistas vira o fundo da página; a imagem enviada pela pessoa fica no topo do perfil
  document.querySelector('.perfil-fundo')?.remove();
  if (banner && /^[a-z0-9_]+$/.test(p.equipped_banner || '')) document.body.insertAdjacentHTML('afterbegin', `<div class="perfil-fundo bn-${p.equipped_banner}"></div>`);

  main.innerHTML = `
    ${meu && param('senha') ? `<div class="cartao" style="margin-bottom:16px"><h3>Definir nova senha</h3>
      <form id="form-senha" class="controles"><input id="nova-senha" type="password" minlength="8" required placeholder="Nova senha" style="max-width:280px"><button class="btn">Salvar senha</button></form></div>` : ''}

    <section class="perfil-capa">
      <div class="perfil-banner ${!banner && /^[a-z0-9_]+$/.test(p.equipped_banner || '') ? 'bn-' + p.equipped_banner : ''}" ${banner ? `style="background-image:url('${banner}')"` : ''}></div>
      <div class="perfil-info">
        ${avatarHtml(p, 'grande', 'Foto de ' + p.username)}
        <div class="nome-bloco">
          <h1 style="margin:0">${esc(p.username)}</h1>
          <p><span class="tag amarela">Nível ${n.lv} · ${n.titulo}</span>
            ${p.role === 'admin' ? '<span class="tag">🛡️ Administrador</span>' : p.role === 'moderator' ? '<span class="tag">🛡️ Moderador</span>' : ''}
            ${(titulos || []).filter((t) => (p.titles || []).includes(t.id)).map((t) => `<span class="tag" style="background:${esc(t.color)};color:#000">${esc(t.icon || '')} ${esc(t.name)}</span>`).join(' ')}</p>
          ${p.bio ? `<p class="quebra" style="margin-top:6px">${esc(p.bio)}</p>` : meu ? '<p class="muted" style="margin-top:6px">Adicione uma bio contando o que você joga.</p>' : ''}
          <span id="steam-agora"></span>
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
    ${vitrine.length || meu ? `<h2>🏆 Vitrine</h2>${vitrine.length ? `<div class="vitrine-jogos">${vitrine.map((g) => `<a href="jogo.html?slug=${encodeURIComponent(g.slug)}"><img ${srcCapa(g.cover_url, 320)} alt="" loading="lazy"><span>${esc(g.title)}</span></a>`).join('')}</div>`
      : '<p class="muted">Escolha até 6 jogos favoritos para exibir aqui em "✏️ Editar perfil".</p>'}` : ''}
    ${lista.length ? `<h3 style="margin-top:14px">🕹️ Jogados recentemente</h3>
      <div class="lista">${recentes.map(itemBib).join('') || '<p class="muted">Nada jogado recentemente.</p>'}</div>
      <button class="btn sec" id="ver-bib" style="margin-top:10px">📚 Ver biblioteca completa (${lista.length})</button>
      <dialog id="dlg-bib" style="width:min(760px,96vw)"><div class="controles" style="justify-content:space-between;align-items:center"><h2 style="margin:0">Biblioteca de ${esc(p.username)}</h2><button class="btn sec pequeno" id="fechar-bib">✕ Fechar</button></div>
        <input type="search" id="busca-bib" placeholder="Buscar na biblioteca..." style="margin:10px 0">
        <div class="chips" id="abas-bib">${GRUPOS.map(([k, t]) => {
          const qtd = lista.filter((x) => x.status === k && (k || !x.wishlist || x.hours)).length;
          return qtd ? `<button class="chip" data-g="${k ?? ''}">${t} (${qtd})</button>` : ''; }).join('')}</div>
        <div class="lista" id="lista-bib" style="margin-top:10px"></div></dialog>`
      : `<p class="vazio">${meu ? 'Sua biblioteca está vazia. Importe da Steam ou abra a página de um jogo e marque "Jogando", "Zerado"...' : 'Biblioteca vazia.'}</p>`}

    <h2>📸 Posts</h2>
    ${meu ? compositorHtml() : ''}
    <div class="lista" id="posts-perfil" style="margin-top:12px"></div>

    <h2>📋 Listas</h2>
    <div class="grade" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">
      ${(listas || []).map((l) => `<a class="cartao" href="lista.html?id=${l.id}" style="color:var(--texto);text-decoration:none">
        <strong>${l.is_public ? '' : '🔒 '}${esc(l.title)}</strong><br><span class="muted">${l.list_items?.[0]?.count ?? 0} jogo(s)</span></a>`).join('')}
      ${meu ? '<button class="cartao" id="nova-lista" style="cursor:pointer;color:var(--amarelo);font:inherit;font-weight:700">+ Nova lista</button>' : ''}
      ${!(listas || []).length && !meu ? '<p class="muted">Nenhuma lista pública.</p>' : ''}
    </div>

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
    ${meu ? `<h2>Notificações no celular</h2>
      <div class="cartao controles" style="align-items:center">
        <span style="flex:1" class="muted" id="push-status">Receba no celular avisos de chamadas, mensagens, partidas e promoções da sua lista de desejos — mesmo com o site fechado.</span>
        <button class="btn" id="push-bt" disabled>Verificando…</button>
      </div>
      <h2>Privacidade e conta</h2>
      <div class="cartao controles" style="align-items:center">
        <span style="flex:1" class="muted">Seus direitos pela LGPD. Veja a <a href="privacidade.html">Política de Privacidade</a>.</span>
        <button class="btn sec" id="exportar">⬇️ Baixar meus dados</button>
        <button class="btn perigo" id="excluir-conta">Excluir minha conta</button>
      </div><dialog id="dlg-editar"></dialog>` : ''}`;

  // Twitch: mostra 🔴 AO VIVO
  if (p.twitch_user) aoVivo([p.twitch_user]).then((m) => { const s = m.get(p.twitch_user.toLowerCase()); if (s) $('.nome-bloco h1')?.insertAdjacentHTML('afterend', seloAoVivo(s, p.twitch_user)); });

  // Biblioteca completa (janela com abas e busca)
  let grupoAtual = null;
  const mostrarGrupo = (k) => {
    grupoAtual = k;
    main.querySelectorAll('#abas-bib .chip').forEach((c) => c.classList.toggle('ativo', c.dataset.g === k));
    const termo = ($('#busca-bib')?.value || '').trim().toLowerCase();
    const sel = lista.filter((x) => termo ? x.games.title.toLowerCase().includes(termo) : (x.status ?? '') === k && (k || !x.wishlist || x.hours));
    $('#lista-bib').innerHTML = sel.slice(0, 300).map(itemBib).join('') || '<p class="muted">Nada encontrado.</p>';
  };
  $('#ver-bib')?.addEventListener('click', () => { $('#dlg-bib').showModal(); const c = main.querySelector('#abas-bib .chip'); if (c && grupoAtual === null) mostrarGrupo(c.dataset.g); });
  $('#fechar-bib')?.addEventListener('click', () => $('#dlg-bib').close());
  main.querySelectorAll('#abas-bib .chip').forEach((c) => c.onclick = () => { $('#busca-bib').value = ''; mostrarGrupo(c.dataset.g); });
  $('#busca-bib')?.addEventListener('input', () => mostrarGrupo(grupoAtual));

  // Jogando agora na Steam
  if (p.steam_id) steamAgora([p.steam_id]).then((r) => {
    const s = r[p.steam_id];
    if (s?.jogo) $('#steam-agora').innerHTML = `<span class="jogando-agora" title="Status da Steam">Jogando agora: <strong>${esc(s.jogo)}</strong></span>`;
  });

  // Posts da pessoa
  const carregarPostsPerfil = async () => {
    const { data: ps } = await sb.from('posts').select(COLUNAS_POST).eq('user_id', p.id).eq('status', 'published').order('created_at', { ascending: false }).limit(30);
    $('#posts-perfil').innerHTML = (ps || []).map((x) => postHtml(x, { u })).join('') || '<p class="muted">Nenhum post ainda.</p>';
    ligarPosts($('#posts-perfil'), { u });
  };
  if (meu) ligarCompositor($('#compositor'), { u, aoPublicar: carregarPostsPerfil });
  carregarPostsPerfil();

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
  // Notificações no celular
  const atualizarPush = async () => {
    const st = await estadoPush(), bt = $('#push-bt');
    bt.disabled = st === 'sem-suporte' || st === 'bloqueado';
    bt.textContent = { ativo: '🔕 Desativar neste aparelho', inativo: '🔔 Ativar neste aparelho', bloqueado: 'Bloqueado no navegador', 'sem-suporte': 'Não suportado aqui' }[st];
    bt.className = st === 'ativo' ? 'btn sec' : 'btn';
    if (st === 'sem-suporte') $('#push-status').textContent = 'Este navegador não suporta notificações. No iPhone (iOS 16.4+), instale o app pela tela de início e ative por ele.';
    if (st === 'bloqueado') $('#push-status').textContent = 'As notificações estão bloqueadas para este site. Libere no cadeado da barra de endereço e recarregue.';
  };
  $('#push-bt').onclick = async () => {
    try {
      if ((await estadoPush()) === 'ativo') { await desativarPush(); toast('Notificações desativadas neste aparelho.'); }
      else { await ativarPush(p.id); toast('🔔 Pronto! Você vai receber os avisos neste aparelho.'); }
    } catch (e) { falha(e); }
    atualizarPush();
  };
  atualizarPush();
  $('#nova-lista')?.addEventListener('click', async () => {
    const titulo = prompt('Nome da lista (ex.: "Melhores jogos de terror", "Para jogar com amigos"):');
    if (!titulo?.trim()) return;
    const { data: l, error } = await sb.from('user_lists').insert({ user_id: p.id, title: titulo.trim().slice(0, 80) }).select().single();
    if (error) return falha(error);
    location.href = 'lista.html?id=' + l.id;
  });
  $('#exportar').onclick = () => exportarDados(p);
  $('#excluir-conta').onclick = async () => {
    const conf = prompt(`Isso apaga DEFINITIVAMENTE sua conta, perfil, avaliações, posts, biblioteca e imagens.\n\nPara confirmar, digite seu nome de usuário: ${p.username}`);
    if (conf === null) return;
    if (conf.trim() !== p.username) return toast('Nome de usuário não confere. Nada foi apagado.', true);
    const { error } = await sb.rpc('delete_my_account');
    if (error) return falha(error);
    alert('Sua conta foi excluída. Sentiremos sua falta!');
    await sair();
  };
  $('#logout').onclick = () => sair();
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
        <div><label for="twitch">Usuário da Twitch</label><input id="twitch" maxlength="25" pattern="[A-Za-z0-9_]{3,25}" value="${esc(p.twitch_user || '')}" placeholder="aparece 🔴 AO VIVO quando estiver transmitindo"></div>
        <div><label for="steam">Link do perfil Steam</label><input id="steam" type="url" placeholder="https://steamcommunity.com/id/..." value="${esc(p.steam_profile || '')}"></div>
      </div>
    </div>

    <div class="secao-form"><h3>Moldura e banner</h3>
      <p class="muted" style="font-size:.85rem">Escolha em <a href="conquistas.html">🏆 Conquistas</a>. O banner de conquista vira o fundo do seu perfil; a imagem que você enviar acima fica no topo.</p>
      <div class="controles" style="margin-top:8px">${p.equipped_frame ? '<button type="button" class="btn sec pequeno" data-tirar="frame">Tirar moldura da foto</button>' : ''}
        ${p.equipped_banner ? '<button type="button" class="btn sec pequeno" data-tirar="banner">Tirar banner de conquista</button>' : ''}</div>
    </div>

    <div class="secao-form"><h3>Vitrine (até 6 jogos)</h3>
      <p class="muted" style="font-size:.85rem">Os jogos que aparecem em destaque no seu perfil. Só jogos da sua biblioteca.</p>
      <input type="search" id="vit-busca" placeholder="Filtrar..." style="margin-top:6px">
      <div class="escolha-jogos" id="vit-lista"><p class="muted">Carregando...</p></div>
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

  // Vitrine: escolhe entre os jogos da biblioteca
  const escolhidos = new Set(p.showcase_games || []);
  const { data: meusJogos } = await sb.from('user_games').select('game_id, games(title)').eq('user_id', p.id).limit(2000);
  const desenharVitrine = () => {
    const t = $('#vit-busca').value.trim().toLowerCase();
    const l = (meusJogos || []).filter((x) => x.games && (!t || x.games.title.toLowerCase().includes(t)))
      .sort((a, b) => escolhidos.has(b.game_id) - escolhidos.has(a.game_id) || a.games.title.localeCompare(b.games.title)).slice(0, 150);
    $('#vit-lista').innerHTML = l.map((x) => `<label><input type="checkbox" value="${x.game_id}" style="width:auto" ${escolhidos.has(x.game_id) ? 'checked' : ''}> ${esc(x.games.title)}</label>`).join('') || '<p class="muted">Sua biblioteca está vazia.</p>';
    $('#vit-lista').querySelectorAll('input').forEach((i) => i.onchange = () => {
      const gid = Number(i.value);
      if (i.checked && escolhidos.size >= 6) { i.checked = false; return toast('Máximo de 6 jogos na vitrine.', true); }
      i.checked ? escolhidos.add(gid) : escolhidos.delete(gid);
    });
  };
  desenharVitrine(); $('#vit-busca').oninput = desenharVitrine;
  dlg.querySelectorAll('[data-tirar]').forEach((b) => b.onclick = async () => {
    const { error } = await sb.rpc('equip_cosmetic', { tipo: b.dataset.tirar, cid: null });
    if (error) return falha(error);
    toast(b.dataset.tirar === 'frame' ? 'Moldura removida.' : 'Banner removido.'); b.remove();
  });

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
        discord_user: $('#discord').value.trim() || null, steam_profile: steam || null, twitch_user: $('#twitch').value.trim() || null,
        fav_categories: [...dlg.querySelectorAll('#favs .chip.ativo')].map((b) => Number(b.dataset.id)),
      };
      if ('showcase_games' in p) dados.showcase_games = [...escolhidos];
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

// Foto até 512px e banner até 1600px, comprimidos no aparelho antes do envio
const enviar = (uid, tipo, arq) => enviarImagem(uid, tipo, arq, LIMITE_MB, tipo === 'foto' ? 512 : 1600);

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
    if (!session) throw new Error('Sua sessão expirou. Saia e entre de novo na sua conta.');
    const r = await fetch('/.netlify/functions/importar-steam', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}`, apikey: SUPABASE_ANON_KEY },
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
