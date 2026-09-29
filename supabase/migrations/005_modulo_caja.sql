-- ============================================================
-- MIGRACIÓN: MÓDULO DE CAJA Y ARQUEO DIARIO
-- ============================================================

-- 1. Tabla de Cajas (Turnos / Días de caja)
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

-- 2. Tabla de Movimientos de Caja (Ingresos y Egresos manuales)
CREATE TABLE IF NOT EXISTS public.movimientos_caja (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caja_id     UUID NOT NULL REFERENCES public.cajas(id) ON DELETE CASCADE,
    tipo        TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
    concepto    TEXT NOT NULL,
    monto       NUMERIC(12,2) NOT NULL CHECK (monto > 0),
    metodo_pago TEXT NOT NULL DEFAULT 'efectivo',
    categoria   TEXT, -- 'materiales', 'herramientas', 'adelanto_pago', 'servicios', 'otro'
    fecha       TIMESTAMPTZ NOT NULL DEFAULT now(),
    usuario_id  UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mov_caja_caja ON public.movimientos_caja(caja_id);
CREATE INDEX IF NOT EXISTS idx_cajas_estado  ON public.cajas(estado);

-- 3. Desactivar RLS para acceso libre
ALTER TABLE IF EXISTS public.cajas            DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.movimientos_caja DISABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
