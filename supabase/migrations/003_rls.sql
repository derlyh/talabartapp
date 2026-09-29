-- ============================================================
-- Habilitar RLS en todas las tablas
-- ============================================================
ALTER TABLE public.usuarios             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detalle_ventas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuentas_cobro        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registros_produccion  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_trabajadores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log            ENABLE ROW LEVEL SECURITY;

-- Helper: obtener rol del usuario actual
CREATE OR REPLACE FUNCTION public.get_mi_rol()
RETURNS rol_usuario AS $$
    SELECT rol FROM public.usuarios WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ==================== PRODUCTOS ====================
DROP POLICY IF EXISTS "productos_select" ON public.productos;
DROP POLICY IF EXISTS "productos_insert" ON public.productos;
DROP POLICY IF EXISTS "productos_update" ON public.productos;
DROP POLICY IF EXISTS "productos_delete" ON public.productos;

CREATE POLICY "productos_select" ON public.productos
    FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "productos_insert" ON public.productos
    FOR INSERT WITH CHECK (public.get_mi_rol() = 'admin');
CREATE POLICY "productos_update" ON public.productos
    FOR UPDATE USING (public.get_mi_rol() = 'admin');
CREATE POLICY "productos_delete" ON public.productos
    FOR DELETE USING (public.get_mi_rol() = 'admin');

-- ==================== VENTAS ====================
DROP POLICY IF EXISTS "ventas_select" ON public.ventas;
DROP POLICY IF EXISTS "ventas_insert" ON public.ventas;
DROP POLICY IF EXISTS "ventas_update" ON public.ventas;

CREATE POLICY "ventas_select" ON public.ventas
    FOR SELECT USING (public.get_mi_rol() IN ('admin', 'vendedor'));
CREATE POLICY "ventas_insert" ON public.ventas
    FOR INSERT WITH CHECK (public.get_mi_rol() IN ('admin', 'vendedor'));
CREATE POLICY "ventas_update" ON public.ventas
    FOR UPDATE USING (public.get_mi_rol() = 'admin');

-- ==================== DETALLE_VENTAS ====================
DROP POLICY IF EXISTS "det_ventas_select" ON public.detalle_ventas;
DROP POLICY IF EXISTS "det_ventas_insert" ON public.detalle_ventas;

CREATE POLICY "det_ventas_select" ON public.detalle_ventas
    FOR SELECT USING (public.get_mi_rol() IN ('admin', 'vendedor'));
CREATE POLICY "det_ventas_insert" ON public.detalle_ventas
    FOR INSERT WITH CHECK (public.get_mi_rol() IN ('admin', 'vendedor'));

-- ==================== REGISTROS_PRODUCCION ====================
DROP POLICY IF EXISTS "reg_prod_select_admin" ON public.registros_produccion;
DROP POLICY IF EXISTS "reg_prod_select_trabajador" ON public.registros_produccion;
DROP POLICY IF EXISTS "reg_prod_insert" ON public.registros_produccion;
DROP POLICY IF EXISTS "reg_prod_update_admin" ON public.registros_produccion;
DROP POLICY IF EXISTS "reg_prod_update_trabajador" ON public.registros_produccion;

CREATE POLICY "reg_prod_select_admin" ON public.registros_produccion
    FOR SELECT USING (public.get_mi_rol() = 'admin');
CREATE POLICY "reg_prod_select_trabajador" ON public.registros_produccion
    FOR SELECT USING (
        public.get_mi_rol() = 'trabajador'
        AND trabajador_id = auth.uid()
    );
CREATE POLICY "reg_prod_insert" ON public.registros_produccion
    FOR INSERT WITH CHECK (
        public.get_mi_rol() IN ('admin', 'trabajador')
        AND (public.get_mi_rol() = 'admin' OR trabajador_id = auth.uid())
    );
CREATE POLICY "reg_prod_update_admin" ON public.registros_produccion
    FOR UPDATE USING (public.get_mi_rol() = 'admin');
CREATE POLICY "reg_prod_update_trabajador" ON public.registros_produccion
    FOR UPDATE USING (
        public.get_mi_rol() = 'trabajador'
        AND trabajador_id = auth.uid()
    );

-- ==================== PAGOS_TRABAJADORES ====================
DROP POLICY IF EXISTS "pagos_select_admin" ON public.pagos_trabajadores;
DROP POLICY IF EXISTS "pagos_select_trabajador" ON public.pagos_trabajadores;
DROP POLICY IF EXISTS "pagos_update_admin" ON public.pagos_trabajadores;

CREATE POLICY "pagos_select_admin" ON public.pagos_trabajadores
    FOR SELECT USING (public.get_mi_rol() = 'admin');
CREATE POLICY "pagos_select_trabajador" ON public.pagos_trabajadores
    FOR SELECT USING (
        public.get_mi_rol() = 'trabajador'
        AND trabajador_id = auth.uid()
    );
CREATE POLICY "pagos_update_admin" ON public.pagos_trabajadores
    FOR UPDATE USING (public.get_mi_rol() = 'admin');

-- ==================== CLIENTES ====================
DROP POLICY IF EXISTS "clientes_select" ON public.clientes;
DROP POLICY IF EXISTS "clientes_insert" ON public.clientes;
DROP POLICY IF EXISTS "clientes_update" ON public.clientes;
DROP POLICY IF EXISTS "clientes_delete" ON public.clientes;

CREATE POLICY "clientes_select" ON public.clientes
    FOR SELECT USING (public.get_mi_rol() IN ('admin', 'vendedor'));
CREATE POLICY "clientes_insert" ON public.clientes
    FOR INSERT WITH CHECK (public.get_mi_rol() IN ('admin', 'vendedor'));
CREATE POLICY "clientes_update" ON public.clientes
    FOR UPDATE USING (public.get_mi_rol() IN ('admin', 'vendedor'));
CREATE POLICY "clientes_delete" ON public.clientes
    FOR DELETE USING (public.get_mi_rol() IN ('admin', 'vendedor'));

-- ==================== CUENTAS_COBRO ====================
DROP POLICY IF EXISTS "cuentas_select" ON public.cuentas_cobro;
DROP POLICY IF EXISTS "cuentas_insert" ON public.cuentas_cobro;
DROP POLICY IF EXISTS "cuentas_select_publico" ON public.cuentas_cobro;

CREATE POLICY "cuentas_select" ON public.cuentas_cobro
    FOR SELECT USING (public.get_mi_rol() IN ('admin', 'vendedor'));
CREATE POLICY "cuentas_insert" ON public.cuentas_cobro
    FOR INSERT WITH CHECK (public.get_mi_rol() IN ('admin', 'vendedor'));
-- Vista pública para QR (anónimo puede leer)
CREATE POLICY "cuentas_select_publico" ON public.cuentas_cobro
    FOR SELECT USING (true);

-- ==================== CATEGORIAS ====================
DROP POLICY IF EXISTS "categorias_select" ON public.categorias;
DROP POLICY IF EXISTS "categorias_insert" ON public.categorias;
DROP POLICY IF EXISTS "categorias_update" ON public.categorias;
DROP POLICY IF EXISTS "categorias_delete" ON public.categorias;

CREATE POLICY "categorias_select" ON public.categorias
    FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "categorias_insert" ON public.categorias
    FOR INSERT WITH CHECK (public.get_mi_rol() = 'admin');
CREATE POLICY "categorias_update" ON public.categorias
    FOR UPDATE USING (public.get_mi_rol() = 'admin');
CREATE POLICY "categorias_delete" ON public.categorias
    FOR DELETE USING (public.get_mi_rol() = 'admin');

-- ==================== AUDIT_LOG ====================
DROP POLICY IF EXISTS "audit_select_admin" ON public.audit_log;
CREATE POLICY "audit_select_admin" ON public.audit_log
    FOR SELECT USING (public.get_mi_rol() = 'admin');

-- ==================== USUARIOS ====================
DROP POLICY IF EXISTS "usuarios_select_self" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_select_admin" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_update_admin" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_insert" ON public.usuarios;

CREATE POLICY "usuarios_select_self" ON public.usuarios
    FOR SELECT USING (id = auth.uid());
CREATE POLICY "usuarios_select_admin" ON public.usuarios
    FOR SELECT USING (public.get_mi_rol() = 'admin');
CREATE POLICY "usuarios_update_admin" ON public.usuarios
    FOR UPDATE USING (public.get_mi_rol() = 'admin');
CREATE POLICY "usuarios_insert" ON public.usuarios
    FOR INSERT WITH CHECK (true);
