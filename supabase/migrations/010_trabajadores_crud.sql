-- ============================================================
-- 010_trabajadores_crud.sql
-- PERMITIR AGREGAR, EDITAR Y ELIMINAR TRABAJADORES SIN ERRORES DE LLAVE FORÁNEA
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- 1. Agregar columnas adicionales para información completa de los trabajadores
ALTER TABLE IF EXISTS public.usuarios ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE IF EXISTS public.usuarios ADD COLUMN IF NOT EXISTS documento TEXT;
ALTER TABLE IF EXISTS public.usuarios ADD COLUMN IF NOT EXISTS especialidad TEXT;
ALTER TABLE IF EXISTS public.usuarios ADD COLUMN IF NOT EXISTS direccion TEXT;
ALTER TABLE IF EXISTS public.usuarios ADD COLUMN IF NOT EXISTS banco TEXT;
ALTER TABLE IF EXISTS public.usuarios ADD COLUMN IF NOT EXISTS cuenta_bancaria TEXT;
ALTER TABLE IF EXISTS public.usuarios ADD COLUMN IF NOT EXISTS titular_cuenta TEXT;
ALTER TABLE IF EXISTS public.usuarios ADD COLUMN IF NOT EXISTS notas TEXT;

-- 2. Asegurarse de que el ID tenga valor por defecto UUID si no se envía
ALTER TABLE IF EXISTS public.usuarios ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 3. Quitar restricción de auth.users si aún existe
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

-- 4. Ajustar llaves foráneas en tablas relacionadas para permitir borrar trabajadores
-- A) registros_produccion: si se borra el trabajador, desvincular o borrar registros
DO $$
BEGIN
    ALTER TABLE IF EXISTS public.registros_produccion 
        DROP CONSTRAINT IF EXISTS registros_produccion_trabajador_id_fkey;
        
    ALTER TABLE IF EXISTS public.registros_produccion 
        ADD CONSTRAINT registros_produccion_trabajador_id_fkey 
        FOREIGN KEY (trabajador_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- B) pagos_trabajadores: si se borra el trabajador, borrar sus registros de pago
DO $$
BEGIN
    ALTER TABLE IF EXISTS public.pagos_trabajadores 
        DROP CONSTRAINT IF EXISTS pagos_trabajadores_trabajador_id_fkey;
        
    ALTER TABLE IF EXISTS public.pagos_trabajadores 
        ADD CONSTRAINT pagos_trabajadores_trabajador_id_fkey 
        FOREIGN KEY (trabajador_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- C) ventas: permitir que vendedor_id sea nulo si se elimina el vendedor
DO $$
BEGIN
    ALTER TABLE IF EXISTS public.ventas ALTER COLUMN vendedor_id DROP NOT NULL;

    ALTER TABLE IF EXISTS public.ventas 
        DROP CONSTRAINT IF EXISTS ventas_vendedor_id_fkey;
        
    ALTER TABLE IF EXISTS public.ventas 
        ADD CONSTRAINT ventas_vendedor_id_fkey 
        FOREIGN KEY (vendedor_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- D) cajas: permitir que usuario_id sea nulo al borrar
DO $$
BEGIN
    ALTER TABLE IF EXISTS public.cajas 
        DROP CONSTRAINT IF EXISTS cajas_usuario_id_fkey;
        
    ALTER TABLE IF EXISTS public.cajas 
        ADD CONSTRAINT cajas_usuario_id_fkey 
        FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- E) movimientos_caja: permitir que usuario_id sea nulo al borrar
DO $$
BEGIN
    ALTER TABLE IF EXISTS public.movimientos_caja 
        DROP CONSTRAINT IF EXISTS movimientos_caja_usuario_id_fkey;
        
    ALTER TABLE IF EXISTS public.movimientos_caja 
        ADD CONSTRAINT movimientos_caja_usuario_id_fkey 
        FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 5. Dar permisos completos sobre usuarios
ALTER TABLE IF EXISTS public.usuarios DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.usuarios TO authenticated, anon;
