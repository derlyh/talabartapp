-- ============================================================
-- 009_produccion_auth.sql
-- CONFIGURACIÓN DE PRODUCCIÓN: AUTENTICACIÓN CENTRALIZADA EN SUPABASE AUTH
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- 1. Asegurar columna email en public.usuarios
ALTER TABLE IF EXISTS public.usuarios ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Función y Trigger automático al crear usuarios desde el Dashboard de Supabase
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_nombre TEXT;
    v_rol TEXT;
BEGIN
    -- Extraer nombre del metadata o usar el prefijo del correo
    v_nombre := COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1));
    
    -- Si se especificó rol en el metadata usarlo, si es el primer usuario poner 'admin', sino 'vendedor'
    IF NEW.raw_user_meta_data->>'rol' IN ('admin', 'vendedor', 'trabajador') THEN
        v_rol := NEW.raw_user_meta_data->>'rol';
    ELSIF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE rol = 'admin') THEN
        v_rol := 'admin';
    ELSE
        v_rol := 'vendedor';
    END IF;

    -- Insertar o actualizar en public.usuarios
    INSERT INTO public.usuarios (id, email, nombre, rol, activo)
    VALUES (NEW.id, NEW.email, v_nombre, v_rol, true)
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        nombre = COALESCE(EXCLUDED.nombre, public.usuarios.nombre),
        updated_at = now();

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Evitar que una falla en el trigger bloquee la creación en auth.users
    RETURN NEW;
END;
$$;

-- 3. Vincular el trigger a auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Permisos para que la app lea y actualice usuarios
GRANT ALL ON TABLE public.usuarios TO authenticated, anon;
