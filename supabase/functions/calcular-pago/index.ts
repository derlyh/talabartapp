// Supabase Edge Function: calcular-pago
// Servidor Deno para consolidación de nómina de artesanos
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Manejo de preflight CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // 1. Validar usuario autenticado
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Falta cabecera de autorización' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

        if (authError || !user) {
            return new Response(JSON.stringify({ error: 'Token no válido o sesión expirada' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 2. Validar que sea rol admin
        const { data: perfil } = await supabaseClient
            .from('usuarios')
            .select('rol')
            .eq('id', user.id)
            .single();

        if (perfil?.rol !== 'admin') {
            return new Response(JSON.stringify({ error: 'Acceso denegado: Se requiere rol administrador' }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 3. Obtener parámetros del cuerpo
        const { desde, hasta, trabajadorId } = await req.json().catch(() => ({}));

        let query = supabaseClient
            .from('pagos_trabajadores')
            .select(`
                id,
                monto,
                tipo_pago,
                detalle_calculo,
                pagado,
                fecha_pago,
                created_at,
                usuarios!trabajador_id (id, nombre, telefono, tarifa_hora, tarifa_unidad),
                registros_produccion (
                    id,
                    cantidad,
                    horas_trabajadas,
                    estado,
                    productos (nombre)
                )
            `)
            .order('created_at', { ascending: false });

        if (desde) query = query.gte('created_at', desde);
        if (hasta) query = query.lte('created_at', hasta);
        if (trabajadorId) query = query.eq('trabajador_id', trabajadorId);

        const { data: pagos, error: queryError } = await query;
        if (queryError) throw queryError;

        // 4. Consolidar métricas por artesano
        const resumenPorTrabajador = {};
        let totalGeneral = 0;
        let totalPendiente = 0;
        let totalDesembolsado = 0;

        for (const p of pagos || []) {
            const tId = p.usuarios?.id || 'desconocido';
            const tNombre = p.usuarios?.nombre || 'Sin nombre';
            const monto = parseFloat(p.monto) || 0;

            if (!resumenPorTrabajador[tId]) {
                resumenPorTrabajador[tId] = {
                    trabajadorId: tId,
                    nombre: tNombre,
                    totalMonto: 0,
                    totalPendiente: 0,
                    totalPagado: 0,
                    cantidadLotes: 0
                };
            }

            resumenPorTrabajador[tId].totalMonto += monto;
            resumenPorTrabajador[tId].cantidadLotes += 1;
            totalGeneral += monto;

            if (p.pagado) {
                resumenPorTrabajador[tId].totalPagado += monto;
                totalDesembolsado += monto;
            } else {
                resumenPorTrabajador[tId].totalPendiente += monto;
                totalPendiente += monto;
            }
        }

        return new Response(JSON.stringify({
            fechaGeneracion: new Date().toISOString(),
            periodo: { desde: desde || 'inicio', hasta: hasta || 'hoy' },
            totales: {
                totalGeneral,
                totalPendiente,
                totalDesembolsado,
                registrosProcesados: (pagos || []).length
            },
            resumenTrabajadores: Object.values(resumenPorTrabajador),
            detallePagos: pagos
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
