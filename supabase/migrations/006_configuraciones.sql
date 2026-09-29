-- 006_configuraciones.sql
CREATE TABLE IF NOT EXISTS public.configuraciones (
    clave TEXT PRIMARY KEY,
    valor JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Desactivar RLS para lectura pública
ALTER TABLE IF EXISTS public.configuraciones DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.configuraciones TO anon, authenticated;

-- Insertar configuración por defecto
INSERT INTO public.configuraciones (clave, valor)
VALUES (
    'cuentas_bancarias',
    '[
        {"banco": "Bancolombia Ahorros", "numero": "987-654321-00"},
        {"banco": "Nequi / Daviplata", "numero": "310 123 4567"},
        {"banco": "Titular", "numero": "Talabartería de Cuero S.A.S"}
    ]'::jsonb
)
ON CONFLICT (clave) DO NOTHING;
