// Preencha com os dados do SEU projeto Supabase (Project Settings > API Keys).
// URL: só o endereço do projeto, SEM "/rest/v1" no final.
// Chave: a "Publishable key" (começa com sb_publishable_) ou a antiga "anon" (começa com eyJ).
// A "anon public key" foi feita para ficar no navegador: quem protege os dados
// são as regras de segurança (RLS) do supabase/schema.sql.
// NUNCA coloque aqui a "Secret key" (sb_secret_...) nem a "service_role".
export const SUPABASE_URL = 'https://jcnukczycjmktshvnnpq.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_9EnmFX6R1I_JNkSJ348ldg_nCi8bD7d';

// Servidores STUN/TURN usados nas chamadas de voz/vídeo.
// STUN público funciona para a maioria das redes. Se alguém não conseguir
// conectar (rede corporativa, 4G restrito), adicione um servidor TURN aqui.
export const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];
