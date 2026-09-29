-- ============================================================
-- FUNCIÓN: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_usuarios_updated    ON public.usuarios;
DROP TRIGGER IF EXISTS trg_productos_updated   ON public.productos;
DROP TRIGGER IF EXISTS trg_clientes_updated    ON public.clientes;
DROP TRIGGER IF EXISTS trg_ventas_updated      ON public.ventas;
DROP TRIGGER IF EXISTS trg_cuentas_updated     ON public.cuentas_cobro;
DROP TRIGGER IF EXISTS trg_reg_prod_updated    ON public.registros_produccion;

CREATE TRIGGER trg_usuarios_updated    BEFORE UPDATE ON public.usuarios          FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER trg_productos_updated   BEFORE UPDATE ON public.productos         FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER trg_clientes_updated    BEFORE UPDATE ON public.clientes          FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER trg_ventas_updated      BEFORE UPDATE ON public.ventas            FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER trg_cuentas_updated     BEFORE UPDATE ON public.cuentas_cobro     FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER trg_reg_prod_updated    BEFORE UPDATE ON public.registros_produccion FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ============================================================
-- FUNCIÓN: Producción terminada → Inventario + Pago
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_produccion_terminada()
RETURNS TRIGGER AS $$
DECLARE
    v_tipo_pago       tipo_pago_trabajador;
    v_tarifa_hora     NUMERIC(10,2);
    v_tarifa_unidad   NUMERIC(10,2);
    v_monto_pago      NUMERIC(10,2);
    v_detalle         JSONB;
BEGIN
    IF NEW.estado = 'terminado' AND (OLD.estado IS DISTINCT FROM 'terminado') THEN

        IF NEW.fecha_fin IS NULL THEN
            NEW.fecha_fin := now();
        END IF;

        -- 1) Mover producto al inventario
        UPDATE public.productos
        SET stock  = stock + NEW.cantidad,
            estado = 'disponible'
        WHERE id = NEW.producto_id;

        -- 2) Obtener datos del trabajador
        SELECT tipo_pago, tarifa_hora, tarifa_unidad
        INTO v_tipo_pago, v_tarifa_hora, v_tarifa_unidad
        FROM public.usuarios
        WHERE id = NEW.trabajador_id;

        -- 3) Calcular monto
        IF v_tipo_pago = 'por_hora' THEN
            v_monto_pago := COALESCE(NEW.horas_trabajadas, 0) * COALESCE(v_tarifa_hora, 0);
            v_detalle := jsonb_build_object(
                'tipo', 'por_hora',
                'horas', NEW.horas_trabajadas,
                'tarifa', v_tarifa_hora,
                'total', v_monto_pago
            );
        ELSIF v_tipo_pago = 'por_unidad' THEN
            v_monto_pago := NEW.cantidad * COALESCE(v_tarifa_unidad, 0);
            v_detalle := jsonb_build_object(
                'tipo', 'por_unidad',
                'cantidad', NEW.cantidad,
                'tarifa', v_tarifa_unidad,
                'total', v_monto_pago
            );
        ELSE
            v_monto_pago := 0;
            v_detalle := jsonb_build_object('tipo', 'no_definido', 'total', 0);
        END IF;

        -- 4) Insertar pago
        INSERT INTO public.pagos_trabajadores (
            trabajador_id, registro_produccion_id, monto, tipo_pago, detalle_calculo
        ) VALUES (
            NEW.trabajador_id, NEW.id, v_monto_pago,
            COALESCE(v_tipo_pago, 'por_unidad'), v_detalle
        );

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_produccion_terminada ON public.registros_produccion;
CREATE TRIGGER trg_produccion_terminada
    BEFORE UPDATE ON public.registros_produccion
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_produccion_terminada();

-- ============================================================
-- FUNCIÓN: Descuento de stock al vender
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_descontar_stock()
RETURNS TRIGGER AS $$
DECLARE
    v_stock_actual INTEGER;
BEGIN
    SELECT stock INTO v_stock_actual
    FROM public.productos
    WHERE id = NEW.producto_id
    FOR UPDATE;

    IF v_stock_actual < NEW.cantidad THEN
        RAISE EXCEPTION 'Stock insuficiente para producto %. Stock: %, Solicitado: %',
            NEW.producto_id, v_stock_actual, NEW.cantidad;
    END IF;

    UPDATE public.productos
    SET stock  = stock - NEW.cantidad,
        estado = CASE
                    WHEN stock - NEW.cantidad = 0 THEN 'agotado'::estado_producto
                    ELSE estado
                 END
    WHERE id = NEW.producto_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_descontar_stock ON public.detalle_ventas;
CREATE TRIGGER trg_descontar_stock
    AFTER INSERT ON public.detalle_ventas
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_descontar_stock();

-- ============================================================
-- FUNCIÓN: Recalcular total de venta
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_recalcular_total_venta()
RETURNS TRIGGER AS $$
DECLARE
    v_venta_id UUID;
BEGIN
    v_venta_id := COALESCE(NEW.venta_id, OLD.venta_id);

    UPDATE public.ventas
    SET total = (
        SELECT COALESCE(SUM(cantidad * precio_unit), 0)
        FROM public.detalle_ventas
        WHERE venta_id = v_venta_id
    )
    WHERE id = v_venta_id;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_recalcular_total ON public.detalle_ventas;
CREATE TRIGGER trg_recalcular_total
    AFTER INSERT OR UPDATE OR DELETE ON public.detalle_ventas
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_recalcular_total_venta();

-- ============================================================
-- FUNCIÓN: Auditoría genérica
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_audit_log()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.audit_log (tabla, operacion, registro_id, datos_antes, datos_despues, usuario_id)
    VALUES (
        TG_TABLE_NAME,
        TG_OP,
        COALESCE(NEW.id, OLD.id),
        CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        auth.uid()
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_productos ON public.productos;
DROP TRIGGER IF EXISTS trg_audit_ventas    ON public.ventas;
DROP TRIGGER IF EXISTS trg_audit_reg_prod  ON public.registros_produccion;

CREATE TRIGGER trg_audit_productos AFTER INSERT OR UPDATE OR DELETE ON public.productos          FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();
CREATE TRIGGER trg_audit_ventas    AFTER INSERT OR UPDATE OR DELETE ON public.ventas             FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();
CREATE TRIGGER trg_audit_reg_prod  AFTER INSERT OR UPDATE OR DELETE ON public.registros_produccion FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();
