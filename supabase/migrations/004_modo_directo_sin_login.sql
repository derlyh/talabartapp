-- ============================================================
-- SOLUCIÓN DEFINITIVA: QUITAR POLÍTICAS RESTRICTIVAS Y PERMITIR ACCESO TOTAL
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- 1. DESHABILITAR RLS EN TODAS LAS TABLAS
ALTER TABLE IF EXISTS public.usuarios             DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.categorias           DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.productos            DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.clientes             DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ventas               DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.detalle_ventas       DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cuentas_cobro        DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.registros_produccion  DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pagos_trabajadores   DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_log            DISABLE ROW LEVEL SECURITY;

-- 2. ELIMINAR TODAS LAS POLÍTICAS ANTERIORES PARA EVITAR CUALQUIER RESTRICCIÓN
DROP POLICY IF EXISTS "productos_select" ON public.productos;
DROP POLICY IF EXISTS "productos_insert" ON public.productos;
DROP POLICY IF EXISTS "productos_update" ON public.productos;
DROP POLICY IF EXISTS "productos_delete" ON public.productos;
DROP POLICY IF EXISTS "productos_libre_acceso" ON public.productos;

DROP POLICY IF EXISTS "categorias_select" ON public.categorias;
DROP POLICY IF EXISTS "categorias_insert" ON public.categorias;
DROP POLICY IF EXISTS "categorias_update" ON public.categorias;
DROP POLICY IF EXISTS "categorias_delete" ON public.categorias;
DROP POLICY IF EXISTS "categorias_libre_acceso" ON public.categorias;

DROP POLICY IF EXISTS "clientes_select" ON public.clientes;
DROP POLICY IF EXISTS "clientes_insert" ON public.clientes;
DROP POLICY IF EXISTS "clientes_update" ON public.clientes;
DROP POLICY IF EXISTS "clientes_delete" ON public.clientes;
DROP POLICY IF EXISTS "clientes_libre_acceso" ON public.clientes;

DROP POLICY IF EXISTS "ventas_select" ON public.ventas;
DROP POLICY IF EXISTS "ventas_insert" ON public.ventas;
DROP POLICY IF EXISTS "ventas_update" ON public.ventas;
DROP POLICY IF EXISTS "ventas_libre_acceso" ON public.ventas;

DROP POLICY IF EXISTS "det_ventas_select" ON public.detalle_ventas;
DROP POLICY IF EXISTS "det_ventas_insert" ON public.detalle_ventas;
DROP POLICY IF EXISTS "det_ventas_libre_acceso" ON public.detalle_ventas;

DROP POLICY IF EXISTS "cuentas_select" ON public.cuentas_cobro;
DROP POLICY IF EXISTS "cuentas_insert" ON public.cuentas_cobro;
DROP POLICY IF EXISTS "cuentas_select_publico" ON public.cuentas_cobro;
DROP POLICY IF EXISTS "cuentas_libre_acceso" ON public.cuentas_cobro;

DROP POLICY IF EXISTS "reg_prod_select_admin" ON public.registros_produccion;
DROP POLICY IF EXISTS "reg_prod_select_trabajador" ON public.registros_produccion;
DROP POLICY IF EXISTS "reg_prod_insert" ON public.registros_produccion;
DROP POLICY IF EXISTS "reg_prod_update_admin" ON public.registros_produccion;
DROP POLICY IF EXISTS "reg_prod_update_trabajador" ON public.registros_produccion;
DROP POLICY IF EXISTS "reg_prod_libre_acceso" ON public.registros_produccion;

DROP POLICY IF EXISTS "pagos_select_admin" ON public.pagos_trabajadores;
DROP POLICY IF EXISTS "pagos_select_trabajador" ON public.pagos_trabajadores;
DROP POLICY IF EXISTS "pagos_update_admin" ON public.pagos_trabajadores;
DROP POLICY IF EXISTS "pagos_libre_acceso" ON public.pagos_trabajadores;

DROP POLICY IF EXISTS "usuarios_select_self" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_select_admin" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_update_admin" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_insert" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_libre_acceso" ON public.usuarios;

DROP POLICY IF EXISTS "audit_select_admin" ON public.audit_log;
DROP POLICY IF EXISTS "audit_libre_acceso" ON public.audit_log;

-- 3. POLÍTICAS DE PERMISO TOTAL (POR SI RLS SE RE-HABILITA)
CREATE POLICY "productos_libre_acceso" ON public.productos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "categorias_libre_acceso" ON public.categorias FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "clientes_libre_acceso" ON public.clientes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ventas_libre_acceso" ON public.ventas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "det_ventas_libre_acceso" ON public.detalle_ventas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "cuentas_libre_acceso" ON public.cuentas_cobro FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "reg_prod_libre_acceso" ON public.registros_produccion FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "pagos_libre_acceso" ON public.pagos_trabajadores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "usuarios_libre_acceso" ON public.usuarios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "audit_libre_acceso" ON public.audit_log FOR ALL USING (true) WITH CHECK (true);

-- 4. INSERTAR USUARIOS BASE PARA LAS RELACIONES (vendedor_id, trabajador_id)
INSERT INTO public.usuarios (id, nombre, rol, activo, tarifa_hora, tarifa_unidad, tipo_pago)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'Administrador Taller', 'admin', true, 20000, 15000, 'por_unidad'),
    ('00000000-0000-0000-0000-000000000002', 'Carlos Vendedor', 'vendedor', true, 12000, 10000, 'por_unidad'),
    ('00000000-0000-0000-0000-000000000003', 'Mateo Artesano', 'trabajador', true, 15000, 12000, 'por_hora')
ON CONFLICT (id) DO UPDATE 
SET nombre = EXCLUDED.nombre,
    rol = EXCLUDED.rol;
