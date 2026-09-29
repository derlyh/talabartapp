-- ============================================================
-- SCRIPT CONSOLIDADO: TABLAS RESTANTES, INDEPENDENCIA Y LOGIN LOCAL
-- Copiar y ejecutar en el SQL Editor de Supabase
-- ============================================================

-- 1. Separar tabla de usuarios de Supabase Auth (por si había error)
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_schema = 'public' 
          AND table_name = 'usuarios' 
          AND constraint_type = 'FOREIGN KEY'
    ) LOOP
        EXECUTE 'ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name) || ' CASCADE;';
    END LOOP;
END $$;

-- 2. Asegurar que la tabla usuarios exista de forma independiente
CREATE TABLE IF NOT EXISTS public.usuarios (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre        TEXT        NOT NULL,
    rol           TEXT        NOT NULL DEFAULT 'vendedor',
    telefono      TEXT,
    activo        BOOLEAN     NOT NULL DEFAULT TRUE,
    tarifa_hora   NUMERIC(10,2) DEFAULT 0,
    tarifa_unidad NUMERIC(10,2) DEFAULT 0,
    tipo_pago     TEXT        DEFAULT 'por_unidad',
    password      TEXT,       -- Nuevo campo para login sin supabase
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Si la tabla ya existía, añadimos password por si falta
ALTER TABLE IF EXISTS public.usuarios ADD COLUMN IF NOT EXISTS password TEXT;

-- 3. Crear módulo de caja (005_modulo_caja)
CREATE TABLE IF NOT EXISTS public.cajas (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha_apertura        TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_cierre          TIMESTAMPTZ,
    monto_inicial         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monto_inicial >= 0),
    total_ventas_efectivo NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_ingresos_extra  NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_egresos         NUMERIC(12,2) NOT NULL DEFAULT 0,
    saldo_esperado        NUMERIC(12,2) NOT NULL DEFAULT 0,
    saldo_real            NUMERIC(12,2),
    diferencia            NUMERIC(12,2) DEFAULT 0,
    estado                TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
    notas                 TEXT,
    usuario_id            UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.movimientos_caja (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caja_id     UUID NOT NULL REFERENCES public.cajas(id) ON DELETE CASCADE,
    tipo        TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
    concepto    TEXT NOT NULL,
    monto       NUMERIC(12,2) NOT NULL CHECK (monto > 0),
    metodo_pago TEXT NOT NULL DEFAULT 'efectivo',
    categoria   TEXT, 
    fecha       TIMESTAMPTZ NOT NULL DEFAULT now(),
    usuario_id  UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Crear configuraciones (006_configuraciones)
CREATE TABLE IF NOT EXISTS public.configuraciones (
    clave TEXT PRIMARY KEY,
    valor JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.configuraciones (clave, valor)
VALUES (
    'cuentas_bancarias',
    '[
        {"banco": "Bancolombia Ahorros", "numero": "987-654321-00"},
        {"banco": "Nequi / Daviplata", "numero": "310 123 4567"},
        {"banco": "Titular", "numero": "Talabartería de Cuero S.A.S"}
    ]'::jsonb
) ON CONFLICT (clave) DO NOTHING;

-- 5. Dar permisos y quitar RLS
ALTER TABLE IF EXISTS public.cajas DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.movimientos_caja DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.configuraciones DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.usuarios DISABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
