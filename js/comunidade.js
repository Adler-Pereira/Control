import { sb, $, esc, montarLayout, configurado, param, usuario, perfil, avatar, data, toast, falha, urlSegura } from './app.js';
import { SalaVoz } from './voz.js';

await montarLayout();
const main = $('#conteudo');
const id = Number(param('id'));
let sala = null;

if (configurado) carregar();

async function carregar() {
  const { data: c } = await sb.from('communities').select('*, games(slug,title), profiles!communities_owner_id_fkey(username)').eq('id', id).maybeSingle();
  if (!c) { main.innerHTML = '<p class="vazio">Comunidade não encontrada.</p>'; return; }
  document.title = `${c.name} | Control Critic`;
  const u = await usuario();
  const p = await perfil();
  const { data: membro } = u ? await sb.from('community_members').select('user_id').eq('community_id', id).eq('user_id', u.id).maybeSingle() : { data: null };
  const dono = u && (c.owner_id === u.id || ['admin', 'moderator'].includes(p?.role));

  main.innerHTML = `
    <div class="cartao" style="margin-bottom:18px">
      <h1>${esc(c.name)}</h1>
      <p class="muted">${esc(c.description || '')}</p>
      <p style="margin:10px 0">${c.games ? `<a class="tag" href="jogo.html?slug=${encodeURIComponent(c.games.slug)}">${esc(c.games.title)}</a> ` : ''}
        <span class="tag">${c.members_count} membros</span> <span class="muted">· criada por ${esc(c.profiles?.username || '—')}</span></p>
      <div class="controles">
        ${!u ? `<a class="btn" href="entrar.html?volta=${encodeURIComponent('comunidade.html?id=' + id)}">Entrar para participar</a>`
          : membro ? '<button class="btn sec" id="sair">Sair da comunidade</button>' : '<button class="btn" id="participar">Participar</button>'}
        ${dono ? '<button class="btn sec" id="editar">Configurar</button>' : ''}
      </div>
    </div>

    <div class="abas"><button class="aba ativo" data-a="posts">Mural</button><button class="aba" data-a="call">Call 🔊</button><button class="aba" data-a="discord">Discord / PS5</button></div>

    <section data-p="posts">
      ${membro ? `<form id="form-post" class="cartao" style="margin-bottom:14px"><textarea id="txt" rows="3" maxlength="2000" required placeholder="Compartilhe algo, marque uma partida..."></textarea>
        <div style="margin-top:8px"><button class="btn">Publicar (+5 XP)</button></div></form>` : '<p class="muted" style="margin-bottom:12px">Participe da comunidade para publicar.</p>'}
      <div class="lista" id="posts"></div>
    </section>

    <section data-p="call" class="hidden">
      ${membro ? `
        <p class="muted">Chamada de voz e vídeo direto no navegador, com compartilhamento de tela. Ideal para até 6 pessoas.</p>
        <div class="controles" style="margin:12px 0">
          <button class="btn" id="v-entrar">Entrar na call</button>
          <button class="btn sec hidden" id="v-mudo">🎤 Microfone</button>
          <button class="btn sec hidden" id="v-cam">📷 Câmera</button>
          <button class="btn sec hidden" id="v-tela">🖥️ Compartilhar tela</button>
          <button class="btn perigo hidden" id="v-sair">Sair da call</button>
        </div>
        <p class="muted" id="v-info"></p>
        <div class="sala" id="sala"></div>` : '<p class="muted">Participe da comunidade para entrar na call.</p>'}
    </section>

    <section data-p="discord" class="hidden">
      <div class="discord-box">
        <div style="flex:1;min-width:220px">
          <h3>Jogando no PS5 ou Xbox?</h3>
          <p class="muted">Consoles não abrem chamadas pelo navegador, mas têm Discord integrado. Vincule sua conta do Discord ao console
          (Configurações → Usuários e contas → Contas vinculadas) e entre na call do servidor da comunidade.</p>
        </div>
        ${c.discord_invite ? `<a class="btn discord" href="${urlSegura(c.discord_invite)}" target="_blank" rel="noopener">Entrar no servidor do Discord</a>`
          : '<span class="muted">Esta comunidade ainda não tem servidor do Discord vinculado.</span>'}
      </div>
      <div id="widget" style="margin-top:14px"></div>
    </section>

    <dialog id="dlg"><form method="dialog" id="form-cfg">
      <h2 style="margin-top:0">Configurar comunidade</h2>
      <label for="c-nome">Nome</label><input id="c-nome" required minlength="3" maxlength="60" value="${esc(c.name)}">
      <label for="c-desc">Descrição</label><textarea id="c-desc" rows="3" maxlength="500">${esc(c.description || '')}</textarea>
      <label for="c-inv">Convite do Discord</label><input id="c-inv" placeholder="https://discord.gg/..." value="${esc(c.discord_invite || '')}">
      <label for="c-guild">ID do servidor do Discord (para mostrar quem está online/em call)</label>
      <input id="c-guild" placeholder="ex.: 123456789012345678" value="${esc(c.discord_guild_id || '')}">
      <p class="muted" style="font-size:.85rem;margin-top:6px">No Discord: Configurações do servidor → Widget → ative "Habilitar widget do servidor" e copie o ID.</p>
      <div class="controles" style="margin-top:16px"><button class="btn" value="ok">Salvar</button><button class="btn sec" value="cancel" formnovalidate>Cancelar</button>
      <button type="button" class="btn perigo" id="c-del" style="margin-left:auto">Excluir comunidade</button></div>
    </form></dialog>`;

  // Abas
  main.querySelectorAll('.aba').forEach((b) => b.onclick = () => {
    main.querySelectorAll('.aba').forEach((x) => x.classList.toggle('ativo', x === b));
    main.querySelectorAll('[data-p]').forEach((s) => s.classList.toggle('hidden', s.dataset.p !== b.dataset.a));
    if (b.dataset.a === 'discord') widgetDiscord(c.discord_guild_id);
  });

  $('#participar')?.addEventListener('click', async () => {
    const { error } = await sb.from('community_members').insert({ community_id: id, user_id: u.id });
    if (error) return falha(error);
    toast('Bem-vindo à comunidade!'); carregar();
  });
  $('#sair')?.addEventListener('click', async () => {
    await sala?.sair();
    const { error } = await sb.from('community_members').delete().eq('community_id', id).eq('user_id', u.id);
    if (error) return falha(error);
    carregar();
  });

  // Configurações (dono/moderação)
  $('#editar')?.addEventListener('click', () => $('#dlg').showModal());
  $('#dlg')?.addEventListener('close', async () => {
    if ($('#dlg').returnValue !== 'ok') return;
    const { error } = await sb.from('communities').update({
      name: $('#c-nome').value.trim(), description: $('#c-desc').value.trim() || null,
      discord_invite: $('#c-inv').value.trim() || null, discord_guild_id: $('#c-guild').value.trim() || null,
    }).eq('id', id);
    if (error) return falha(/discord/.test(error.message) ? { message: 'Convite ou ID do Discord em formato inválido.' } : error);
    toast('Comunidade atualizada.'); carregar();
  });
  $('#c-del')?.addEventListener('click', async () => {
    if (!confirm('Excluir a comunidade e todos os posts? Isso não pode ser desfeito.')) return;
    const { error } = await sb.from('communities').delete().eq('id', id);
    if (error) return falha(error);
    location.href = 'comunidades.html';
  });

  // Mural
  $('#form-post')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await sb.from('posts').insert({ community_id: id, user_id: u.id, body: $('#txt').value.trim() });
    if (error) return falha(error);
    $('#txt').value = ''; toast('Publicado! +5 XP');
  });
  carregarPosts(u, dono);
  sb.channel('posts:' + id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'posts', filter: `community_id=eq.${id}` }, () => carregarPosts(u, dono))
    .subscribe();

  // Call
  if (membro) configurarCall(u, p);
}

async function carregarPosts(u, dono) {
  const { data: posts } = await sb.from('posts').select('*, profiles(username,avatar_url)').eq('community_id', id).eq('status', 'published')
    .order('created_at', { ascending: false }).limit(100);
  $('#posts').innerHTML = (posts || []).map((x) => `
    <article class="post"><header><img class="avatar" src="${avatar(x.profiles)}" alt="">
      <a class="usuario" href="perfil.html?u=${encodeURIComponent(x.profiles?.username || '')}">${esc(x.profiles?.username)}</a><span class="muted">${data(x.created_at)}</span>
      ${u && (x.user_id === u.id || dono) ? `<button class="btn sec pequeno" data-del="${x.id}" style="margin-left:auto">Apagar</button>` : ''}</header>
      <p class="quebra">${esc(x.body)}</p></article>`).join('') || '<p class="vazio">Nenhum post ainda.</p>';
  $('#posts').querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    if (!confirm('Apagar este post?')) return;
    const { error } = await sb.from('posts').delete().eq('id', b.dataset.del);
    if (error) falha(error); else carregarPosts(u, dono);
  });
}

function configurarCall(u, p) {
  const bt = (s) => $('#v-' + s);
  const atualizar = () => {
    const dentro = !!sala?.local;
    bt('entrar').classList.toggle('hidden', dentro);
    ['mudo', 'cam', 'tela', 'sair'].forEach((s) => bt(s).classList.toggle('hidden', !dentro));
    if (!dentro) { $('#v-info').textContent = ''; return; }
    bt('mudo').textContent = sala.mudo ? '🔇 Ativar microfone' : '🎤 Silenciar';
    bt('cam').classList.toggle('ligado', sala.modoVideo === 'camera');
    bt('tela').classList.toggle('ligado', sala.modoVideo === 'tela');
    bt('tela').textContent = sala.modoVideo === 'tela' ? '🖥️ Parar compartilhamento' : '🖥️ Compartilhar tela';
    $('#v-info').textContent = `${sala.participantes} pessoa(s) na call`;
  };
  if (!navigator.mediaDevices?.getDisplayMedia) bt('tela').disabled = true;

  bt('entrar').onclick = async () => {
    sala = new SalaVoz({ salaId: id, eu: u.id, nome: p.username, container: $('#sala'), aoMudar: atualizar });
    try { await sala.entrar(); } catch (e) {
      sala = null;
      falha(e.name === 'NotAllowedError' ? { message: 'Permita o acesso ao microfone para entrar na call.' } : e);
    }
  };
  bt('sair').onclick = () => sala.sair();
  bt('mudo').onclick = () => sala.alternarMudo();
  bt('cam').onclick = () => sala.alternarCamera().catch(falha);
  bt('tela').onclick = () => sala.alternarTela().catch((e) => e.name !== 'NotAllowedError' && falha(e));
  window.addEventListener('beforeunload', () => sala?.sair());
}

// Widget público do Discord: mostra membros online e quem está em canal de voz
async function widgetDiscord(guildId) {
  const box = $('#widget');
  if (!guildId || box.dataset.ok) return;
  box.dataset.ok = '1';
  try {
    const r = await fetch(`https://discord.com/api/guilds/${encodeURIComponent(guildId)}/widget.json`);
    if (!r.ok) throw new Error();
    const w = await r.json();
    const emCall = (w.members || []).filter((m) => m.channel_id);
    const canais = Object.fromEntries((w.channels || []).map((ch) => [ch.id, ch.name]));
    box.innerHTML = `<div class="cartao">
      <h3>${esc(w.name)} <span class="muted" style="font-family:Inter;font-size:.9rem">· ${w.presence_count} online</span></h3>
      ${emCall.length ? `<p style="margin:8px 0 4px"><strong>Em call agora:</strong></p><div class="discord-membros">
        ${emCall.map((m) => `<span>🔊 ${esc(m.username)} <span class="muted">(${esc(canais[m.channel_id] || 'voz')})</span></span>`).join('')}</div>`
        : '<p class="muted">Ninguém em call no momento.</p>'}
      ${w.instant_invite ? `<p style="margin-top:10px"><a href="${urlSegura(w.instant_invite)}" target="_blank" rel="noopener">Convite instantâneo</a></p>` : ''}
    </div>`;
  } catch {
    box.innerHTML = '<p class="muted">Não foi possível carregar o widget. Verifique se o widget do servidor está habilitado no Discord.</p>';
  }
}
