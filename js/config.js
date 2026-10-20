// Configuración de Supabase
// Se pueden definir mediante variables en .env / window.__ENV__ o directamente como valores por defecto:
const env = (typeof window !== 'undefined' && window.__ENV__) || {};

export const SUPABASE_URL = env.SUPABASE_URL || 'https://toaenatrupqxdxakyoww.supabase.co';
export const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvYWVuYXRydXBxeGR4YWt5b3d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxNTU0MzIsImV4cCI6MjEwNDczMTQzMn0.NTImWji90RUegGjlT1Ryi4BYOHLOiLIgSR5O9kUXQcA';

// Configuración general de la aplicación
export const APP_CONFIG = {
    nombre: env.APP_NAME || 'Talabartería El Rodeo',
    version: '1.0.0',
    itemsPorPagina: 20,
    moneda: env.APP_CURRENCY || 'COP',  // Moneda por defecto (COP, USD, MXN, etc.)
    formatoFecha: env.APP_LOCALE || 'es-CO'
};
