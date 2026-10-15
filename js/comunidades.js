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
    <label for="jogo">Jogo (opcional)</label><select id="jogo"><option value="">Nenhum</option></select>
    <label for="discord">Convite do Discord (opcional)</label><input id="discord" placeholder="https://discord.gg/...">
    <div class="controles" style="margin-top:16px"><button class="btn" value="ok">Criar (+20 XP)</button><button class="btn sec" value="cancel" formnovalidate>Cancelar</button></div>
  </form></dialog>`);

if (configurado) {
  carregar();
  let t; $('#q').oninput = () => { clearTimeout(t); t = setTimeout(carregar, 300); };
  const { data: jogos } = await sb.from('games').select('id,title').order('title');
  $('#jogo').innerHTML += (jogos || []).map((j) => `<option value="${j.id}">${esc(j.title)}</option>`).join('');

  $('#nova').onclick = async () => { if (!(await usuario())) return (location.href = 'entrar.html?volta=comunidades.html'); $('#dlg').showModal(); };
  $('#dlg').addEventListener('close', async () => {
    if ($('#dlg').returnValue !== 'ok') return;
    const { data, error } = await sb.from('communities').insert({
      name: $('#nome').value.trim(), description: $('#desc').value.trim() || null,
      game_id: $('#jogo').value || null, discord_invite: $('#discord').value.trim() || null,
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
      <h3>${esc(c.name)}</h3>
      <p class="muted">${esc(c.description || '')}</p>
      <p style="margin-top:8px">${c.games ? `<span class="tag">${esc(c.games.title)}</span> ` : ''}<span class="tag">${c.members_count} membros</span>
      ${c.discord_invite ? ' <span class="tag" style="background:#5865F2;color:#fff">Discord</span>' : ''}</p>
    </a>`).join('') || '<p class="vazio">Nenhuma comunidade ainda. Crie a primeira!</p>';
}
