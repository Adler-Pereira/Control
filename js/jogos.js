import { sb, $, $$, esc, montarLayout, cardJogo, configurado, param } from './app.js';

await montarLayout();
const main = $('#conteudo');
main.insertAdjacentHTML('beforeend', `
  <h1>Jogos</h1>
  <div class="form-linha" style="margin-bottom:12px">
    <input id="q" type="search" placeholder="Buscar pelo nome..." value="${esc(param('q') || '')}">
    <select id="ordem">
      <option value="avg_rating">Mais bem avaliados</option>
      <option value="reviews_count">Mais avaliados</option>
      <option value="title">Ordem alfabética</option>
      <option value="created_at">Adicionados recentemente</option>
    </select>
  </div>
  <div class="chips" id="cats"></div>
  <div class="grade" id="lista"></div>`);

let cat = param('cat') || '';
if (configurado) {
  const { data: cats } = await sb.from('categories').select('*').order('name');
  $('#cats').innerHTML = `<button class="chip" data-c="">Todas</button>` +
    (cats || []).map((c) => `<button class="chip" data-c="${c.id}">${esc(c.name)}</button>`).join('');
  $$('#cats .chip').forEach((b) => b.onclick = () => { cat = b.dataset.c; carregar(); });

  let t; $('#q').oninput = () => { clearTimeout(t); t = setTimeout(carregar, 300); };
  $('#ordem').onchange = carregar;
  carregar();
}

async function carregar() {
  $$('#cats .chip').forEach((b) => b.classList.toggle('ativo', b.dataset.c === String(cat)));
  const ordem = $('#ordem').value;
  let q = sb.from('games').select('*, categories(name)').order(ordem, { ascending: ordem === 'title' }).limit(60);
  const termo = $('#q').value.trim().replace(/[%,()]/g, '');
  if (termo) q = q.ilike('title', `%${termo}%`);
  if (cat) q = q.eq('category_id', cat);
  const { data, error } = await q;
  $('#lista').innerHTML = error ? '<p class="vazio">Erro ao carregar.</p>'
    : (data.map(cardJogo).join('') || '<p class="vazio">Nenhum jogo encontrado.</p>');
}
