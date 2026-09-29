import { db } from '../../supabase-client.js';
import { getRol, getUsuario } from '../../auth.js';
import { formatMoneda, formatFecha, mostrarNotificacion, confirmar, generarPaginacion } from '../../utils.js';

let pagosList = [];
let paginaActual = 1;
const POR_PAGINA = 10;
let pagoSeleccionado = null;

export async function init() {
    paginaActual = 1;
    pagosList = [];
    pagoSeleccionado = null;

    const esAdmin = getRol() === 'admin';

    // Referencias
    const filtroTrabajador = document.getElementById('filtro-trabajador');
    const contenedorFiltroTrab = document.getElementById('filtro-trabajador-contenedor');
    const filtroEstado = document.getElementById('filtro-estado-pago');
    const filtroDesde = document.getElementById('filtro-fecha-desde');
    const filtroHasta = document.getElementById('filtro-fecha-hasta');
    const btnLimpiar = document.getElementById('btn-limpiar-filtros-pagos');

    // Modales
    const modalComp = document.getElementById('modal-comprobante-pago');
    const btnCerrarComp = document.getElementById('btn-cerrar-comprobante');
    const btnImprimir = document.getElementById('btn-imprimir-recibo');

    if (btnCerrarComp && modalComp) {
        btnCerrarComp.addEventListener('click', () => modalComp.classList.add('hidden'));
    }
    if (btnImprimir) {
        btnImprimir.addEventListener('click', () => window.print());
    }

    // Configurar visibilidad según rol
    if (!esAdmin && contenedorFiltroTrab) {
        contenedorFiltroTrab.style.display = 'none';
    }

    // Eventos
    if (filtroTrabajador) filtroTrabajador.addEventListener('change', () => { paginaActual = 1; cargarPagos(); });
    if (filtroEstado) filtroEstado.addEventListener('change', () => { paginaActual = 1; cargarPagos(); });
    if (filtroDesde) filtroDesde.addEventListener('change', () => { paginaActual = 1; cargarPagos(); });
    if (filtroHasta) filtroHasta.addEventListener('change', () => { paginaActual = 1; cargarPagos(); });
    if (btnLimpiar) {
        btnLimpiar.addEventListener('click', () => {
            if (filtroTrabajador) filtroTrabajador.value = '';
            if (filtroEstado) filtroEstado.value = '';
            if (filtroDesde) filtroDesde.value = '';
            if (filtroHasta) filtroHasta.value = '';
            paginaActual = 1;
            cargarPagos();
        });
    }

    if (esAdmin) {
        await cargarTrabajadores();
    }

    await cargarPagos();
}

/**
 * Cargar lista de artesanos para el filtro
 */
async function cargarTrabajadores() {
    const select = document.getElementById('filtro-trabajador');
    if (!select) return;

    try {
        const { data, error } = await db
            .from('usuarios')
            .select('id, nombre')
            .eq('rol', 'trabajador')
            .order('nombre');

        if (error) throw error;

        select.innerHTML = '<option value="">Todos los trabajadores</option>';
        (data || []).forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.nombre;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error('Error cargando trabajadores:', err);
    }
}

/**
 * Cargar pagos con filtros y resumen KPI
 */
async function cargarPagos() {
    const tbody = document.getElementById('pagos-tbody');
    const esAdmin = getRol() === 'admin';
    const usuario = getUsuario();

    const trabajadorId = document.getElementById('filtro-trabajador')?.value;
    const estado = document.getElementById('filtro-estado-pago')?.value;
    const fechaDesde = document.getElementById('filtro-fecha-desde')?.value;
    const fechaHasta = document.getElementById('filtro-fecha-hasta')?.value;

    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="8" class="text-center py-4">
                <div class="spinner"></div>
                <p class="mt-1 text-muted">Consultando liquidaciones...</p>
            </td>
        </tr>
    `;

    try {
        let query = db
            .from('pagos_trabajadores')
            .select(`
                id,
                monto,
                tipo_pago,
                detalle_calculo,
                pagado,
                fecha_pago,
                created_at,
                trabajador_id,
                usuarios!trabajador_id (id, nombre),
                registros_produccion (
                    id,
                    cantidad,
                    horas_trabajadas,
                    estado,
                    productos (id, nombre)
                )
            `)
            .order('created_at', { ascending: false });

        if (!esAdmin && usuario) {
            query = query.eq('trabajador_id', usuario.id);
        } else if (trabajadorId) {
            query = query.eq('trabajador_id', trabajadorId);
        }

        if (estado === 'pendiente') {
            query = query.eq('pagado', false);
        } else if (estado === 'pagado') {
            query = query.eq('pagado', true);
        }

        if (fechaDesde) {
            query = query.gte('created_at', `${fechaDesde}T00:00:00.000Z`);
        }
        if (fechaHasta) {
            query = query.lte('created_at', `${fechaHasta}T23:59:59.999Z`);
        }

        const { data, error } = await query;
        if (error) throw error;

        pagosList = data || [];

        // Calcular estadísticas KPI
        let totalLiquidado = 0;
        let totalPendiente = 0;
        let totalPagado = 0;

        pagosList.forEach(p => {
            const monto = parseFloat(p.monto) || 0;
            totalLiquidado += monto;
            if (p.pagado) totalPagado += monto;
            else totalPendiente += monto;
        });

        const elLiquidado = document.getElementById('stat-total-liquidado');
        const elPendiente = document.getElementById('stat-total-pendiente');
        const elPagado = document.getElementById('stat-total-pagado');

        if (elLiquidado) elLiquidado.textContent = formatMoneda(totalLiquidado);
        if (elPendiente) elPendiente.textContent = formatMoneda(totalPendiente);
        if (elPagado) elPagado.textContent = formatMoneda(totalPagado);

        // Renderizar tabla
        renderizarTabla();

    } catch (err) {
        console.error('Error cargando pagos:', err);
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-error py-4">
                    Error al consultar liquidaciones: ${err.message}
                </td>
            </tr>
        `;
    }
}

function renderizarTabla() {
    const tbody = document.getElementById('pagos-tbody');
    const esAdmin = getRol() === 'admin';

    if (!tbody) return;

    if (pagosList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-state py-4">
                    <div class="empty-icono">💰</div>
                    <p class="text-muted">No se registran pagos con los filtros seleccionados.</p>
                </td>
            </tr>
        `;
        document.getElementById('paginacion-pagos').innerHTML = '';
        return;
    }

    const inicio = (paginaActual - 1) * POR_PAGINA;
    const paginados = pagosList.slice(inicio, inicio + POR_PAGINA);
    const totalPaginas = Math.ceil(pagosList.length / POR_PAGINA);

    tbody.innerHTML = '';
    paginados.forEach(p => {
        const tr = document.createElement('tr');
        const trabajadorNombre = p.usuarios?.nombre || 'Trabajador';
        const productoNombre = p.registros_produccion?.productos?.nombre || 'Lote de Producción';
        const modalidad = p.tipo_pago === 'por_hora' ? '⏱️ Por Hora' : '📦 Por Unidad';

        // Detalle de cálculo legible
        let detalleTexto = '—';
        if (p.detalle_calculo) {
            const dc = p.detalle_calculo;
            if (dc.tipo === 'por_hora') {
                detalleTexto = `${dc.horas || 0} hrs × ${formatMoneda(dc.tarifa)}`;
            } else if (dc.tipo === 'por_unidad') {
                detalleTexto = `${dc.cantidad || 0} unid × ${formatMoneda(dc.tarifa)}`;
            }
        }

        const estadoBadge = p.pagado
            ? '<span class="badge badge-pagada">PAGADO</span>'
            : '<span class="badge badge-pendiente">PENDIENTE</span>';

        tr.innerHTML = `
            <td style="font-size:0.85rem;">${formatFecha(p.created_at)}</td>
            <td><strong>${trabajadorNombre}</strong></td>
            <td>${productoNombre}</td>
            <td><small>${modalidad}</small></td>
            <td style="font-family:var(--font-mono); font-size:0.85rem;">${detalleTexto}</td>
            <td style="font-weight:700; color:var(--color-secondary);">${formatMoneda(p.monto)}</td>
            <td>${estadoBadge}</td>
            <td>
                <div class="btn-group">
                    <button class="btn btn-secondary btn-sm btn-comprobante" title="Ver Recibo">
                        🧾
                    </button>
                    ${!p.pagado && esAdmin ? `
                        <button class="btn btn-success btn-sm btn-pagar" title="Marcar Pagado">
                            ✅ Pagar
                        </button>
                    ` : ''}
                </div>
            </td>
        `;

        tr.querySelector('.btn-comprobante').addEventListener('click', () => abrirComprobante(p));

        const btnPagar = tr.querySelector('.btn-pagar');
        if (btnPagar) {
            btnPagar.addEventListener('click', () => marcarComoPagado(p));
        }

        tbody.appendChild(tr);
    });

    // Paginación
    const pagContenedor = document.getElementById('paginacion-pagos');
    pagContenedor.innerHTML = '';
    if (totalPaginas > 1) {
        const paginador = generarPaginacion(paginaActual, totalPaginas, (nuevaPagina) => {
            paginaActual = nuevaPagina;
            renderizarTabla();
        });
        pagContenedor.appendChild(paginador);
    }
}

/**
 * Mostrar comprobante de pago imprimible
 */
function abrirComprobante(pago) {
    pagoSeleccionado = pago;
    const modal = document.getElementById('modal-comprobante-pago');
    if (!modal) return;

    document.getElementById('comp-trabajador').textContent = pago.usuarios?.nombre || '—';
    document.getElementById('comp-fecha').textContent = formatFecha(pago.created_at);
    document.getElementById('comp-producto').textContent = pago.registros_produccion?.productos?.nombre || 'Trabajo Artesanal';
    document.getElementById('comp-tipo').textContent = pago.tipo_pago === 'por_hora' ? 'Remuneración por Horas Trabajadas' : 'Remuneración por Unidad Fabricada';

    let detalle = 'Cálculo estándar';
    if (pago.detalle_calculo) {
        const dc = pago.detalle_calculo;
        if (dc.tipo === 'por_hora') {
            detalle = `${dc.horas} horas registradas × tarifa ${formatMoneda(dc.tarifa)}/hora = ${formatMoneda(pago.monto)}`;
        } else if (dc.tipo === 'por_unidad') {
            detalle = `${dc.cantidad} unidades terminadas × tarifa ${formatMoneda(dc.tarifa)}/unidad = ${formatMoneda(pago.monto)}`;
        }
    }
    document.getElementById('comp-detalle-calculo').textContent = detalle;
    document.getElementById('comp-monto').textContent = formatMoneda(pago.monto);

    modal.classList.remove('hidden');
}

/**
 * Marcar pago como efectuado
 */
async function marcarComoPagado(pago) {
    const seguro = await confirmar(
        'Efectuar Pago',
        `¿Confirmas el desembolso de ${formatMoneda(pago.monto)} a ${pago.usuarios?.nombre || 'el trabajador'}?`
    );

    if (!seguro) return;

    try {
        const { error } = await db
            .from('pagos_trabajadores')
            .update({
                pagado: true,
                fecha_pago: new Date()
            })
            .eq('id', pago.id);

        if (error) throw error;

        mostrarNotificacion('Pago registrado como desembolsado exitosamente', 'success');
        await cargarPagos();

    } catch (err) {
        console.error('Error al pagar:', err);
        mostrarNotificacion('Error al registrar desembolso: ' + err.message, 'error');
    }
}
