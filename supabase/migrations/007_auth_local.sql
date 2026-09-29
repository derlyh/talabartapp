-- 007_auth_local.sql

-- 1. Agregar campo password a usuarios
ALTER TABLE IF EXISTS public.usuarios ADD COLUMN IF NOT EXISTS password TEXT;

-- 2. Asegurarse de que el FK con auth.users no moleste al crear usuarios
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

-- 3. Crear usuario admin por defecto si no existe con password 'admin123'
INSERT INTO public.usuarios (id, nombre, rol, password, activo)
VALUES (gen_random_uuid(), 'Admin Principal', 'admin', 'admin123', true)
ON CONFLICT DO NOTHING;

-- 4. Dar permisos a tabla configuraciones por si hubo error antes
CREATE TABLE IF NOT EXISTS public.configuraciones (
    clave TEXT PRIMARY KEY,
    valor JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE IF EXISTS public.configuraciones DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.configuraciones TO anon, authenticated;
