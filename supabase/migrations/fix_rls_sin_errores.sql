-- ============================================================
-- SCRIPT CORTO Y SEGURO (SIN ERRORES) PARA QUITAR RLS
-- Copiar y pegar en SQL Editor de Supabase
-- ============================================================

-- 1. Desactivar RLS en todas las tablas
ALTER TABLE IF EXISTS public.productos            DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.categorias           DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.clientes             DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ventas               DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.detalle_ventas       DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cuentas_cobro        DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.registros_produccion  DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pagos_trabajadores   DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.usuarios             DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_log            DISABLE ROW LEVEL SECURITY;

-- 2. Dar permisos totales al rol anon (para usar la app sin login)
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- 3. Quitar restricción con auth.users para que permita usuarios locales
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

-- 4. Crear los usuarios del taller
INSERT INTO public.usuarios (id, nombre, rol, activo, tarifa_hora, tarifa_unidad, tipo_pago)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'Administrador Taller', 'admin', true, 20000, 15000, 'por_unidad'),
    ('00000000-0000-0000-0000-000000000002', 'Carlos Vendedor', 'vendedor', true, 12000, 10000, 'por_unidad'),
    ('00000000-0000-0000-0000-000000000003', 'Mateo Artesano', 'trabajador', true, 15000, 12000, 'por_hora')
ON CONFLICT (id) DO UPDATE 
SET nombre = EXCLUDED.nombre,
    rol = EXCLUDED.rol;
