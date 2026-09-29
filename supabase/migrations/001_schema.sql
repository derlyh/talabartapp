-- ============================================================
-- EXTENSIONES (Opcional, gen_random_uuid es nativo en Postgres 13+)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TIPOS ENUM (Creación condicional segura e idempotente)
-- ============================================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rol_usuario') THEN
        CREATE TYPE rol_usuario AS ENUM ('admin', 'vendedor', 'trabajador');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_producto') THEN
        CREATE TYPE estado_producto AS ENUM ('disponible', 'agotado', 'en_produccion');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'origen_producto') THEN
        CREATE TYPE origen_producto AS ENUM ('comprado', 'fabricado');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'metodo_pago') THEN
        CREATE TYPE metodo_pago AS ENUM ('efectivo', 'transferencia', 'tarjeta', 'qr');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_venta') THEN
        CREATE TYPE estado_venta AS ENUM ('pendiente', 'pagada', 'cancelada');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_produccion') THEN
        CREATE TYPE estado_produccion AS ENUM ('en_proceso', 'terminado', 'rechazado');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_pago_trabajador') THEN
        CREATE TYPE tipo_pago_trabajador AS ENUM ('por_hora', 'por_unidad');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_cuenta') THEN
        CREATE TYPE estado_cuenta AS ENUM ('pendiente', 'pagada', 'vencida');
    END IF;
END $$;

-- ============================================================
-- TABLA: usuarios (extiende auth.users de Supabase)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.usuarios (
    id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre        TEXT        NOT NULL,
    rol           rol_usuario NOT NULL DEFAULT 'vendedor',
    telefono      TEXT,
    activo        BOOLEAN     NOT NULL DEFAULT TRUE,
    tarifa_hora   NUMERIC(10,2) DEFAULT 0,
    tarifa_unidad NUMERIC(10,2) DEFAULT 0,
    tipo_pago     tipo_pago_trabajador DEFAULT 'por_unidad',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLA: categorias
-- ============================================================
CREATE TABLE IF NOT EXISTS public.categorias (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre      TEXT NOT NULL UNIQUE,
    descripcion TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLA: productos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.productos (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre       TEXT            NOT NULL,
    categoria_id UUID            REFERENCES public.categorias(id) ON DELETE SET NULL,
    descripcion  TEXT,
    precio       NUMERIC(10,2)   NOT NULL CHECK (precio >= 0),
    stock        INTEGER         NOT NULL DEFAULT 0 CHECK (stock >= 0),
    estado       estado_producto NOT NULL DEFAULT 'disponible',
    origen       origen_producto NOT NULL DEFAULT 'comprado',
    imagen_url   TEXT,
    created_at   TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_productos_categoria ON public.productos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_productos_estado    ON public.productos(estado);

-- ============================================================
-- TABLA: clientes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.clientes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre     TEXT NOT NULL,
    telefono   TEXT,
    email      TEXT,
    direccion  TEXT,
    notas      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLA: ventas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ventas (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id    UUID          REFERENCES public.clientes(id) ON DELETE SET NULL,
    vendedor_id   UUID          NOT NULL REFERENCES public.usuarios(id),
    fecha         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    total         NUMERIC(12,2) NOT NULL DEFAULT 0,
    metodo_pago   metodo_pago   NOT NULL DEFAULT 'efectivo',
    estado        estado_venta  NOT NULL DEFAULT 'pendiente',
    notas         TEXT,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ventas_fecha     ON public.ventas(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente   ON public.ventas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ventas_vendedor  ON public.ventas(vendedor_id);

-- ============================================================
-- TABLA: detalle_ventas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.detalle_ventas (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venta_id    UUID          NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
    producto_id UUID          NOT NULL REFERENCES public.productos(id),
    cantidad    INTEGER       NOT NULL CHECK (cantidad > 0),
    precio_unit NUMERIC(10,2) NOT NULL CHECK (precio_unit >= 0),
    subtotal    NUMERIC(12,2) GENERATED ALWAYS AS (cantidad * precio_unit) STORED
);

CREATE INDEX IF NOT EXISTS idx_detalle_ventas_venta ON public.detalle_ventas(venta_id);

-- ============================================================
-- TABLA: cuentas_cobro (para QR)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cuentas_cobro (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venta_id     UUID          NOT NULL UNIQUE REFERENCES public.ventas(id) ON DELETE CASCADE,
    monto        NUMERIC(12,2) NOT NULL,
    estado       estado_cuenta NOT NULL DEFAULT 'pendiente',
    qr_data      TEXT,
    fecha_limite TIMESTAMPTZ,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLA: registros_produccion
-- ============================================================
CREATE TABLE IF NOT EXISTS public.registros_produccion (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trabajador_id    UUID               NOT NULL REFERENCES public.usuarios(id),
    producto_id      UUID               NOT NULL REFERENCES public.productos(id),
    cantidad         INTEGER            NOT NULL DEFAULT 1 CHECK (cantidad > 0),
    horas_trabajadas NUMERIC(6,2),
    estado           estado_produccion  NOT NULL DEFAULT 'en_proceso',
    fecha_inicio     TIMESTAMPTZ        NOT NULL DEFAULT now(),
    fecha_fin        TIMESTAMPTZ,
    notas            TEXT,
    created_at       TIMESTAMPTZ        NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ        NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reg_prod_trabajador ON public.registros_produccion(trabajador_id);
CREATE INDEX IF NOT EXISTS idx_reg_prod_estado     ON public.registros_produccion(estado);

-- ============================================================
-- TABLA: pagos_trabajadores
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pagos_trabajadores (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trabajador_id          UUID           NOT NULL REFERENCES public.usuarios(id),
    registro_produccion_id UUID           REFERENCES public.registros_produccion(id),
    monto                  NUMERIC(10,2)  NOT NULL CHECK (monto >= 0),
    tipo_pago              tipo_pago_trabajador NOT NULL,
    detalle_calculo        JSONB,
    pagado                 BOOLEAN        NOT NULL DEFAULT FALSE,
    fecha_pago             TIMESTAMPTZ,
    created_at             TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_trab_trabajador ON public.pagos_trabajadores(trabajador_id);

-- ============================================================
-- TABLA: audit_log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
    id            BIGSERIAL PRIMARY KEY,
    tabla         TEXT        NOT NULL,
    operacion     TEXT        NOT NULL,
    registro_id   UUID,
    datos_antes   JSONB,
    datos_despues JSONB,
    usuario_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tabla ON public.audit_log(tabla, created_at DESC);

-- ============================================================
-- TRIGGER SEGURO: Auto-crear usuario en public.usuarios al registrarse en Auth
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_nombre TEXT;
    v_rol public.rol_usuario;
BEGIN
    v_nombre := COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1));
    
    IF NEW.raw_user_meta_data->>'rol' IN ('admin', 'vendedor', 'trabajador') THEN
        v_rol := (NEW.raw_user_meta_data->>'rol')::public.rol_usuario;
    ELSE
        v_rol := 'admin'::public.rol_usuario;
    END IF;

    INSERT INTO public.usuarios (id, nombre, rol, activo)
    VALUES (NEW.id, v_nombre, v_rol, true)
    ON CONFLICT (id) DO UPDATE
    SET nombre = EXCLUDED.nombre,
        rol = EXCLUDED.rol;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Evitar que falle la transacción de auth.users si ocurre algún error
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
