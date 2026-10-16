// Processamento do microfone para a call (parecido com o do Discord):
//  - Supressão de ruído por IA (RNNoise): remove teclado, ventilador, latido, barulho de rua
//  - Sensibilidade de entrada (noise gate): abaixo do volume escolhido o microfone fica mudo
//  - Medidor de volume para ajustar a sensibilidade
// Tudo roda no próprio navegador (WebAssembly). Se o navegador não suportar, usa o microfone direto.
import { RnnoiseWorkletNode, NoiseGateWorkletNode, loadRnnoise } from '../vendor/ruido/index.js';

let wasmRnnoise = null;
const BASE = new URL('../vendor/ruido/', import.meta.url).href;

// Preferências salvas no aparelho
export const PADRAO_AUDIO = { ruidoIA: true, eco: true, ganho: true, sensibilidade: -55, autoSens: false, ptt: false, tecla: 'KeyV', mic: null, saida: null };
export function prefsAudio() {
  try { return { ...PADRAO_AUDIO, ...JSON.parse(localStorage.getItem('cc_audio') || '{}') }; } catch { return { ...PADRAO_AUDIO }; }
}
export function salvarPrefsAudio(o) { try { localStorage.setItem('cc_audio', JSON.stringify(o)); } catch { /* ignora */ } }

// Restrições do getUserMedia: com a IA ligada, a supressão do navegador fica desligada (senão a voz fica "abafada")
export const restricoesMic = (o) => ({
  deviceId: o.mic ? { ideal: o.mic } : undefined,
  echoCancellation: o.eco,
  autoGainControl: o.ganho,
  noiseSuppression: !o.ruidoIA,
  channelCount: 1,
  sampleRate: 48000,
});

// Recebe o stream bruto do microfone e devolve { track, medir(), definirSensibilidade(db), fechar() }
export async function processarMic(bruto, o) {
  const original = bruto.getAudioTracks()[0];
  if (!window.AudioWorkletNode || (!o.ruidoIA && o.sensibilidade == null)) return semProcessamento(original);
  try {
    const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    const fonte = ctx.createMediaStreamSource(bruto);
    let ultimo = fonte;
    let rnn = null;
    if (o.ruidoIA) {
      wasmRnnoise ||= await loadRnnoise({ url: BASE + 'rnnoise.wasm', simdUrl: BASE + 'rnnoise_simd.wasm' });
      await ctx.audioWorklet.addModule(BASE + 'rnnoise-worklet.js');
      rnn = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary: wasmRnnoise });
      ultimo.connect(rnn); ultimo = rnn;
    }
    // Medidor (antes do gate, para mostrar o volume real da voz)
    const analisador = ctx.createAnalyser();
    analisador.fftSize = 1024;
    ultimo.connect(analisador);
    let gate = null;
    const montarGate = async (db) => {
      if (gate) { ultimo.disconnect(gate); gate.disconnect(); gate = null; }
      if (db == null) { ultimo.connect(destino); return; }
      try { ultimo.disconnect(destino); } catch { /* ainda não ligado */ }
      gate = new NoiseGateWorkletNode(ctx, { openThreshold: db, closeThreshold: db - 6, holdMs: 250, maxChannels: 1 });
      ultimo.connect(gate); gate.connect(destino);
    };
    const destino = ctx.createMediaStreamDestination();
    await ctx.audioWorklet.addModule(BASE + 'noisegate-worklet.js');
    await montarGate(o.autoSens ? null : o.sensibilidade);
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    const track = destino.stream.getAudioTracks()[0];
    const buf = new Float32Array(analisador.fftSize);
    return {
      track, processado: true,
      // nível atual em dB (−100 a 0)
      medir() { analisador.getFloatTimeDomainData(buf); let s = 0; for (const x of buf) s += x * x; return Math.max(-100, 10 * Math.log10(s / buf.length + 1e-10)); },
      definirSensibilidade: (db) => montarGate(db),
      fechar() { try { rnn?.destroy(); } catch { /* ignora */ } track.stop(); original.stop(); ctx.close().catch(() => {}); },
    };
  } catch (e) {
    console.warn('Processamento de áudio indisponível, usando o microfone direto:', e);
    return semProcessamento(original);
  }
}

function semProcessamento(track) {
  return { track, processado: false, medir: () => -100, definirSensibilidade: () => {}, fechar: () => track.stop() };
}

// Melhora a qualidade do Opus na descrição recebida do outro lado (é ela que define como ESTE lado envia):
// mais taxa de bits (voz mais nítida), correção de perdas (FEC) e som estéreo para o áudio da tela.
export function melhorarOpus(sdp) {
  const pt = sdp.match(/a=rtpmap:(\d+) opus\/48000/i)?.[1];
  if (!pt) return sdp;
  return sdp.replace(new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`, 'g'), (linha, params) => {
    const p = Object.fromEntries(params.split(';').map((x) => x.trim().split('=')).filter((x) => x[0]));
    Object.assign(p, { useinbandfec: '1', stereo: '1', 'sprop-stereo': '1', maxaveragebitrate: '128000', usedtx: '0' });
    return `a=fmtp:${pt} ` + Object.entries(p).map(([k, v]) => `${k}=${v}`).join(';');
  });
}

// Escolhe o fone/caixa de som (Chrome e Edge; no Safari/Firefox usa o padrão do sistema)
export async function definirSaida(el, id) {
  if (!el?.setSinkId) return;
  try { await el.setSinkId(id || ''); } catch { /* aparelho desconectado: fica no padrão */ }
}
