import { urlSegura } from './app.js';
import { sb, $, esc, montarLayout, configurado, usuario, falha, toast } from './app.js';

await montarLayout();
const main = $('#conteudo');
main.insertAdjacentHTML('beforeend', `
  <h1>Comunidades</h1>
  <p class="muted">Converse, marque partidas e entre em call com quem joga o mesmo que você.</p>
  <div class="controles" style="margin:16px 0"><input id="q" type="search" placeholder="Buscar comunidade..." style="max-width:360px"><button class="btn" id="nova">+ Criar comunidade</button></div>
  <div class="grade" id="lista"></div>
  <dialog id="dlg"><form id="form" method="dialog">
    <h2 style="margin-top:0">Nova comunidade</h2>
    <label for="nome">Nome</label><input id="nome" required minlength="3" maxlength="60">
    <label for="desc">Descrição</label><textarea id="desc" rows="3" maxlength="500"></textarea>
    <label for="busca-jogo">Jogo (opcional)</label>
    <div class="busca-jogo"><input id="busca-jogo" type="search" placeholder="Digite o nome do jogo..." autocomplete="off">
      <input type="hidden" id="jogo"><div class="sugestoes hidden" id="sugestoes"></div></div>
    <p class="muted" id="jogo-escolhido" style="font-size:.85rem;margin-top:4px"></p>
    <label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" id="privada" style="width:auto"> 🔒 Privada (só entra quem você aprovar ou tiver o link de convite)</label>
    <label for="discord">Convite do Discord (opcional)</label><input id="discord" placeholder="https://discord.gg/...">
    <div class="controles" style="margin-top:16px"><button class="btn" value="ok">Criar (+20 XP)</button><button class="btn sec" value="cancel" formnovalidate>Cancelar</button></div>
  </form></dialog>`);

if (configurado) {
  carregar();
  let t; $('#q').oninput = () => { clearTimeout(t); t = setTimeout(carregar, 300); };
  // Busca de jogo com sugestões (o catálogo tem milhares de jogos)
  let tBusca;
  const escolher = (id, titulo) => {
    $('#jogo').value = id || '';
    $('#busca-jogo').value = titulo || '';
    $('#jogo-escolhido').innerHTML = id ? `✓ ${esc(titulo)} <a href="#" id="limpar-jogo">remover</a>` : '';
    $('#limpar-jogo')?.addEventListener('click', (e) => { e.preventDefault(); escolher(null, ''); });
    $('#sugestoes').classList.add('hidden');
  };
  $('#busca-jogo').oninput = () => {
    $('#jogo').value = ''; $('#jogo-escolhido').textContent = '';
    clearTimeout(tBusca);
    tBusca = setTimeout(async () => {
      const termo = $('#busca-jogo').value.trim().replace(/[%,()]/g, '');
      if (termo.length < 2) return $('#sugestoes').classList.add('hidden');
      const { data } = await sb.from('games').select('id,title,release_year,cover_url').ilike('title', `%${termo}%`)
        .order('igdb_rating_count', { ascending: false, nullsFirst: false }).limit(8);
      $('#sugestoes').innerHTML = (data || []).map((j) => `<button type="button" data-id="${j.id}" data-t="${esc(j.title)}">
        ${urlSegura(j.cover_url) ? `<img src="${urlSegura(j.cover_url)}" alt="">` : ''}<span>${esc(j.title)}${j.release_year ? ` <span class="muted">(${j.release_year})</span>` : ''}</span></button>`).join('')
        || '<p class="muted" style="padding:8px">Nenhum jogo encontrado.</p>';
      $('#sugestoes').classList.remove('hidden');
      $('#sugestoes').querySelectorAll('[data-id]').forEach((b) => b.onclick = () => escolher(b.dataset.id, b.dataset.t));
    }, 300);
  };

  $('#nova').onclick = async () => { if (!(await usuario())) return (location.href = 'entrar.html?volta=comunidades.html'); $('#dlg').showModal(); };
  $('#dlg').addEventListener('close', async () => {
    if ($('#dlg').returnValue !== 'ok') return;
    const { data, error } = await sb.from('communities').insert({
      name: $('#nome').value.trim(), description: $('#desc').value.trim() || null,
      game_id: $('#jogo').value || null, is_private: $('#privada').checked, discord_invite: $('#discord').value.trim() || null,
    }).select().single();
    if (error) return falha(error.message.includes('discord') ? { message: 'Convite do Discord inválido. Use https://discord.gg/xxxx' } : error);
    toast('Comunidade criada!');
    location.href = 'comunidade.html?id=' + data.id;
  });
}

async function carregar() {
  let q = sb.from('communities').select('*, games(title)').order('members_count', { ascending: false }).limit(60);
  const termo = $('#q').value.trim().replace(/[%,()]/g, '');
  if (termo) q = q.ilike('name', `%${termo}%`);
  const { data } = await q;
  $('#lista').innerHTML = (data || []).map((c) => `
    <a class="cartao" href="comunidade.html?id=${c.id}" style="color:var(--texto);text-decoration:none">
      <h3>${c.is_private ? '🔒 ' : ''}${esc(c.name)}</h3>
      <p class="muted">${esc(c.description || '')}</p>
      <p style="margin-top:8px">${c.games ? `<span class="tag">${esc(c.games.title)}</span> ` : ''}<span class="tag">${c.members_count} membros</span>
      ${c.discord_invite ? ' <span class="tag" style="background:#5865F2;color:#fff">Discord</span>' : ''}</p>
    </a>`).join('') || '<p class="vazio">Nenhuma comunidade ainda. Crie a primeira!</p>';
}
