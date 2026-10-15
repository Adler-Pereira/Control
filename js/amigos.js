import { sb, $, esc, montarLayout, configurado, exigirLogin, perfil, avatarHtml, toast, falha, param, aoMudarOnline } from './app.js';
import { montarCall } from './chamada-ui.js';

await montarLayout();
const main = $('#conteudo');
let call = null;

if (configurado) {
  const u = await exigirLogin();
  if (u) carregar(u);
}

async function carregar(u) {
  const p = await perfil();
  const { data: rel, error } = await sb.from('friendships').select('*').or(`user_a.eq.${u.id},user_b.eq.${u.id}`);
  if (error) return falha(error.message.includes('friendships') ? { message: 'Banco desatualizado: rode de novo o supabase/schema.sql.' } : error);
  const outroId = (f) => (f.user_a === u.id ? f.user_b : f.user_a);
  const ids = rel.map(outroId);
  const { data: perfis } = ids.length ? await sb.from('profiles').select('id,username,avatar_url,equipped_frame,psn_id,xbox_gamertag,discord_user').in('id', ids) : { data: [] };
  const P = new Map((perfis || []).map((x) => [x.id, x]));
  const amigos = rel.filter((f) => f.status === 'aceita').map((f) => ({ ...P.get(outroId(f)), room_key: f.room_key })).filter((x) => x.id).sort((a, b) => a.username.localeCompare(b.username));
  const recebidos = rel.filter((f) => f.status === 'pendente' && f.requester !== u.id).map((f) => P.get(outroId(f))).filter(Boolean);
  const enviados = rel.filter((f) => f.status === 'pendente' && f.requester === u.id).map((f) => P.get(outroId(f))).filter(Boolean);

  const linhaAmigo = (a) => `<div class="cartao controles amigo" data-id="${a.id}" style="align-items:center">
      <span class="ponto-online" title="offline"></span>${avatarHtml(a)}
      <span style="flex:1;min-width:140px"><a class="usuario" href="perfil.html?u=${encodeURIComponent(a.username)}">${esc(a.username)}</a>
        <br><span class="muted" style="font-size:.8rem">${[a.psn_id && 'PSN: ' + esc(a.psn_id), a.xbox_gamertag && 'Xbox: ' + esc(a.xbox_gamertag), a.discord_user && 'Discord: ' + esc(a.discord_user)].filter(Boolean).join(' · ')}</span></span>
      <button class="btn pequeno" data-chamar="${esc(a.username)}">📞 Call</button>
      <button class="btn sec pequeno" data-remover="${a.id}" title="Desfazer amizade">✕</button></div>`;

  main.innerHTML = `
    <h1>Amigos</h1>
    <div id="area-call" class="cartao hidden" style="margin-bottom:18px"><div class="controles" style="justify-content:space-between;align-items:center">
      <h2 style="margin:0" id="titulo-call"></h2><button class="btn sec pequeno" id="fechar-call">Fechar</button></div><div id="call-box"></div></div>

    ${recebidos.length ? `<h2>Pedidos recebidos (${recebidos.length})</h2><div class="lista">${recebidos.map((a) => `
      <div class="cartao controles" style="align-items:center">${avatarHtml(a)}
        <a class="usuario" style="flex:1" href="perfil.html?u=${encodeURIComponent(a.username)}">${esc(a.username)}</a>
        <button class="btn pequeno" data-aceitar="${a.id}">Aceitar</button><button class="btn sec pequeno" data-recusar="${a.id}">Recusar</button></div>`).join('')}</div>` : ''}

    <h2>Meus amigos (${amigos.length}) <span class="muted" id="n-online" style="font-family:Inter;font-size:1rem"></span></h2>
    <div class="lista" id="lista-amigos">${amigos.map(linhaAmigo).join('') || '<p class="vazio">Você ainda não tem amigos aqui. Busque pelo nome de usuário abaixo ou adicione pelo perfil de alguém.</p>'}</div>

    <h2>Adicionar amigo</h2>
    <div class="cartao">
      <input id="busca" type="search" placeholder="Buscar pelo nome de usuário..." autocomplete="off">
      <div class="lista" id="resultados" style="margin-top:10px"></div>
    </div>

    ${enviados.length ? `<h2>Pedidos enviados</h2><div class="lista">${enviados.map((a) => `
      <div class="cartao controles" style="align-items:center">${avatarHtml(a)}<span style="flex:1">${esc(a.username)} <span class="muted">· aguardando</span></span>
        <button class="btn sec pequeno" data-cancelar="${a.id}">Cancelar</button></div>`).join('')}</div>` : ''}`;

  // Online agora (ordem: online primeiro)
  aoMudarOnline((online) => {
    let n = 0;
    main.querySelectorAll('.amigo').forEach((el) => {
      const on = online.has(el.dataset.id); n += on;
      el.querySelector('.ponto-online').classList.toggle('on', on);
      el.querySelector('.ponto-online').title = on ? 'online agora' : 'offline';
      el.style.order = on ? -1 : 0;
    });
    $('#n-online').textContent = n ? `· ${n} online` : '';
  });

  const acao = async (fn, args, msg) => { const { error } = await sb.rpc(fn, args); if (error) return falha(error); if (msg) toast(msg); carregar(u); };
  main.querySelectorAll('[data-aceitar]').forEach((b) => b.onclick = () => acao('friend_answer', { outro: b.dataset.aceitar, aceitar: true }, 'Agora vocês são amigos! 🤝'));
  main.querySelectorAll('[data-recusar]').forEach((b) => b.onclick = () => acao('friend_answer', { outro: b.dataset.recusar, aceitar: false }));
  main.querySelectorAll('[data-cancelar]').forEach((b) => b.onclick = () => acao('friend_remove', { outro: b.dataset.cancelar }));
  main.querySelectorAll('[data-remover]').forEach((b) => b.onclick = () => confirm('Desfazer esta amizade?') && acao('friend_remove', { outro: b.dataset.remover }));

  // Busca de pessoas
  let t;
  $('#busca').oninput = () => { clearTimeout(t); t = setTimeout(buscar, 300); };
  async function buscar() {
    const q = $('#busca').value.trim().replace(/[%,()]/g, '');
    if (q.length < 2) { $('#resultados').innerHTML = ''; return; }
    const { data } = await sb.from('profiles').select('id,username,avatar_url,equipped_frame').ilike('username', `%${q}%`).neq('id', u.id).limit(10);
    const status = new Map(rel.map((f) => [outroId(f), f]));
    $('#resultados').innerHTML = (data || []).map((x) => {
      const f = status.get(x.id);
      const btn = f?.status === 'aceita' ? '<span class="tag">Amigos</span>' : f ? '<span class="tag">Pendente</span>' : `<button class="btn pequeno" data-add="${x.id}">+ Adicionar</button>`;
      return `<div class="controles" style="align-items:center">${avatarHtml(x)}<a class="usuario" style="flex:1" href="perfil.html?u=${encodeURIComponent(x.username)}">${esc(x.username)}</a>${btn}</div>`;
    }).join('') || '<p class="muted">Ninguém encontrado.</p>';
    $('#resultados').querySelectorAll('[data-add]').forEach((b) => b.onclick = async () => {
      const { data: r, error } = await sb.rpc('friend_request', { alvo: b.dataset.add });
      if (error) return falha(error);
      toast(r === 'amigos' ? 'Agora vocês são amigos! 🤝' : 'Pedido de amizade enviado!');
      carregar(u);
    });
  }

  // Call privada com um amigo (a sala usa uma chave que só os dois conhecem)
  const abrirCall = async (username, avisar) => {
    const a = amigos.find((x) => x.username === username);
    if (!a) return toast('Vocês precisam ser amigos para fazer uma call.', true);
    await call?.sair();
    $('#area-call').classList.remove('hidden');
    $('#titulo-call').textContent = `📞 Call com ${a.username}`;
    call = montarCall($('#call-box'), { salaId: `dm-${a.room_key}`, u, p, descricao: 'Call privada entre vocês dois, com tela compartilhada e chat.' });
    $('#area-call').scrollIntoView({ behavior: 'smooth' });
    if (avisar) { const { error } = await sb.rpc('friend_call', { outro: a.id }); if (!error) toast(`${a.username} foi avisado(a). Clique em "Entrar na call".`); }
  };
  main.querySelectorAll('[data-chamar]').forEach((b) => b.onclick = () => abrirCall(b.dataset.chamar, true));
  $('#fechar-call').onclick = async () => { await call?.sair(); call = null; $('#area-call').classList.add('hidden'); history.replaceState(null, '', 'amigos.html'); };
  if (param('call')) abrirCall(param('call'), false);
}
