// Verifica se todo src/href local usado nos HTML e JS aponta para um arquivo que existe.
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const arquivos = [...readdirSync('.').filter((f) => f.endsWith('.html')), ...readdirSync('js').map((f) => 'js/' + f)];
const faltando = new Set();
for (const f of arquivos) {
  const s = readFileSync(f, 'utf8');
  for (const [, ref] of s.matchAll(/(?:src|href)="([^"#?$]+?\.(?:png|jpe?g|webp|svg|css|js|html))["?]/g)) {
    if (/^(https?:|mailto:|\/\/)/.test(ref)) continue;
    const alvo = f.startsWith('js/') && ref.startsWith('./') ? 'js/' + ref.slice(2) : ref;
    if (!existsSync(alvo)) faltando.add(`${f} -> ${ref}`);
  }
}
if (faltando.size) { console.error('Referências quebradas:\n' + [...faltando].join('\n')); process.exit(1); }
console.log(`OK: ${arquivos.length} arquivos verificados.`);
