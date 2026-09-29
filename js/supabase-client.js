import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Inicializar cliente de Supabase
// Se usa el CDN global cargado en index.html
const { createClient } = supabase;

export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
