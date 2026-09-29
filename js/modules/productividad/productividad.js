import { db } from '../../supabase-client.js';
import { getUsuario, getPerfil, getRol, tieneRol } from '../../auth.js';
import { formatMoneda, formatFecha, mostrarNotificacion, confirmar, generarPaginacion, debounce } from '../../utils.js';

// ============================================================
// MÓDULO DE PRODUCTIVIDAD ARTESANAL — TalabartApp
// ============================================================

/**
 * Etiquetas legibles para los estados de producción
 */
const ESTADOS_PRODUCCION = {
    en_proceso: { etiqueta: 'En Proceso', clase: 'badge-en_proceso' },
    terminado:  { etiqueta: 'Terminado',  clase: 'badge-terminado' },
    rechazado:  { etiqueta: 'Cancelado',  clase: 'badge-rechazado' }
};

/**
 * Formatear badge de estado
 */
function renderBadgeEstado(estado) {
    const config = ESTADOS_PRODUCCION[estado] || { etiqueta: estado || 'Desconocido', clase: 'badge-en_proceso' };
    return `<span class="badge ${config.clase}">${config.etiqueta}</span>`;
}

/**
 * Formatear tipo y tarifa de pago para resumen
 */
function formatearTarifaTrabajador(usuario) {
    if (!usuario) return 'No especificado';
    if (usuario.tipo_pago === 'por_hora') {
        return `Por hora (${formatMoneda(usuario.tarifa_hora || 0)}/h)`;
    } else if (usuario.tipo_pago === 'por_unidad') {
        return `Por unidad (${formatMoneda(usuario.tarifa_unidad || 0)}/pieza)`;
    }
    return 'No configurado';
}

/**
 * Función principal de inicialización del módulo
 */
export async function init() {
    const usuarioAuth = getUsuario();
    const perfilAuth = getPerfil();
    const rolActual = getRol();
    const esAdmin = rolActual === 'admin';
    const esTrabajador = rolActual === 'trabajador';

    // Estado local de la vista
    let paginaActual = 1;
    const porPagina = 10;
    let totalRegistros = 0;
    let registrosCargados = [];
    let productosFabricados = [];
    let listaArtesanos = [];
    let ordenParaFinalizar = null;

    // Referencias a elementos del DOM
    const tbody = document.getElementById('tabla-produccion-body');
    const paginacionContenedor = document.getElementById('paginacion-produccion');

    // Filtros
    const filtroTrabajadorContenedor = document.getElementById('filtro-trabajador-contenedor');
    const filtroTrabajador = document.getElementById('filtro-trabajador');
    const filtroEstado = document.getElementById('filtro-estado');
    const filtroFechaDesde = document.getElementById('filtro-fecha-desde');
    const filtroFechaHasta = document.getElementById('filtro-fecha-hasta');
    const btnLimpiarFiltros = document.getElementById('btn-limpiar-filtros');

    // Métricas
    const metricaEnProceso = document.getElementById('metrica-en-proceso');
    const metricaTerminadas = document.getElementById('metrica-terminadas');
    const metricaUnidades = document.getElementById('metrica-unidades');
    const metricaHoras = document.getElementById('metrica-horas');

    // Botón principal
    const btnNuevaProduccion = document.getElementById('btn-nueva-produccion');

    // Modal Nueva Producción
    const modalNueva = document.getElementById('modal-nueva-produccion');
    const btnCerrarModalNueva = document.getElementById('btn-cerrar-modal-nueva');
    const btnCancelarNueva = document.getElementById('btn-cancelar-nueva-produccion');
    const formNueva = document.getElementById('form-nueva-produccion');
    const selectTrabajador = document.getElementById('produccion-trabajador');
    const grupoTrabajadorSelect = document.getElementById('grupo-trabajador-select');
    const bannerAutoasignado = document.getElementById('banner-autoasignado-trabajador');
    const spanNombreAutoasignado = document.getElementById('nombre-trabajador-autoasignado');
    const selectProducto = document.getElementById('produccion-producto');
    const inputCantidad = document.getElementById('produccion-cantidad');
    const inputFechaInicio = document.getElementById('produccion-fecha-inicio');
    const inputNotas = document.getElementById('produccion-notas');
    const btnGuardarProduccion = document.getElementById('btn-guardar-produccion');

    // Modal Finalizar Producción
    const modalFinalizar = document.getElementById('modal-finalizar-produccion');
    const btnCerrarModalFinalizar = document.getElementById('btn-cerrar-modal-finalizar');
    const btnCancelarFinalizar = document.getElementById('btn-cancelar-finalizar');
    const formFinalizar = document.getElementById('form-finalizar-produccion');
    const finalizarIdInput = document.getElementById('finalizar-orden-id');
    const finalizarProductoNombre = document.getElementById('finalizar-producto-nombre');
    const finalizarProductoCantidad = document.getElementById('finalizar-producto-cantidad');
    const finalizarTrabajadorNombre = document.getElementById('finalizar-trabajador-nombre');
    const finalizarTarifaInfo = document.getElementById('finalizar-tarifa-info');
    const finalizarHorasInput = document.getElementById('finalizar-horas');
    const finalizarAyudaHoras = document.getElementById('finalizar-ayuda-horas');
    const btnConfirmarFinalizar = document.getElementById('btn-confirmar-finalizar');

    // Configurar visibilidad según el rol del usuario
    if (!esAdmin && filtroTrabajadorContenedor) {
        filtroTrabajadorContenedor.style.display = 'none';
    }

    /**
     * Cargar lista de productos con origen 'fabricado'
     */
    async function cargarProductosFabricados() {
        try {
            const { data, error } = await db
                .from('productos')
                .select('id, nombre, stock, estado, precio')
                .eq('origen', 'fabricado')
                .order('nombre', { ascending: true });

            if (error) throw error;
            productosFabricados = data || [];

            if (selectProducto) {
                if (productosFabricados.length === 0) {
                    selectProducto.innerHTML = '<option value="">No hay productos con origen "fabricado"</option>';
                } else {
                    selectProducto.innerHTML = '<option value="">Selecciona una pieza a fabricar...</option>' +
                        productosFabricados.map(p => `
                            <option value="${p.id}">${p.nombre} (Stock actual: ${p.stock})</option>
                        `).join('');
                }
            }
        } catch (err) {
            console.error('Error cargando productos fabricados:', err);
            mostrarNotificacion('Error al cargar catálogo de productos fabricados.', 'error');
        }
    }

    /**
     * Cargar artesanos / trabajadores para selectores
     */
    async function cargarArtesanos() {
        try {
            // Se obtienen usuarios con rol 'trabajador' o 'admin' activos
            const { data, error } = await db
                .from('usuarios')
                .select('id, nombre, rol, tipo_pago, tarifa_hora, tarifa_unidad')
                .eq('activo', true)
                .order('nombre', { ascending: true });

            if (error) throw error;

            listaArtesanos = data || [];

            // Filtrar preferentemente trabajadores
            const soloTrabajadores = listaArtesanos.filter(u => u.rol === 'trabajador' || u.rol === 'admin');

            // Poblar filtro de búsqueda (si es admin)
            if (filtroTrabajador) {
                filtroTrabajador.innerHTML = '<option value="">Todos los artesanos</option>' +
                    soloTrabajadores.map(u => `
                        <option value="${u.id}">${u.nombre} (${u.rol === 'admin' ? 'Administrador' : 'Artesano'})</option>
                    `).join('');
            }

            // Poblar selector del modal de registro
            if (selectTrabajador) {
                selectTrabajador.innerHTML = '<option value="">Selecciona al artesano responsable...</option>' +
                    soloTrabajadores.map(u => {
                        const esquema = u.tipo_pago === 'por_hora'
                            ? `Por hora - ${formatMoneda(u.tarifa_hora || 0)}`
                            : u.tipo_pago === 'por_unidad'
                                ? `Por unidad - ${formatMoneda(u.tarifa_unidad || 0)}`
                                : 'Sin tarifa fija';
                        return `<option value="${u.id}">${u.nombre} [${esquema}]</option>`;
                    }).join('');
            }
        } catch (err) {
            console.error('Error cargando artesanos:', err);
        }
    }

    /**
     * Cargar y calcular métricas globales de productividad
     */
    async function cargarMetricas() {
        try {
            let baseQuery = db
                .from('registros_produccion')
                .select('id, cantidad, horas_trabajadas, estado, trabajador_id');

            // Si es trabajador, limitar a sus propios registros
            if (esTrabajador && usuarioAuth) {
                baseQuery = baseQuery.eq('trabajador_id', usuarioAuth.id);
            }

            const { data, error } = await baseQuery;
            if (error) throw error;

            const todos = data || [];
            const enProceso = todos.filter(r => r.estado === 'en_proceso').length;
            const terminadas = todos.filter(r => r.estado === 'terminado').length;

            const unidades = todos
                .filter(r => r.estado === 'terminado')
                .reduce((sum, r) => sum + (Number(r.cantidad) || 0), 0);

            const horas = todos
                .reduce((sum, r) => sum + (Number(r.horas_trabajadas) || 0), 0);

            if (metricaEnProceso) metricaEnProceso.textContent = enProceso;
            if (metricaTerminadas) metricaTerminadas.textContent = terminadas;
            if (metricaUnidades) metricaUnidades.textContent = unidades;
            if (metricaHoras) metricaHoras.textContent = `${horas.toFixed(1)} h`;
        } catch (err) {
            console.error('Error calculando métricas:', err);
        }
    }

    /**
     * Cargar órdenes de producción con filtros y paginación
     */
    async function cargarRegistros() {
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="8">
                    <div class="loading-contenedor">
                        <div class="spinner"></div>
                        <p>Cargando órdenes de producción...</p>
                    </div>
                </td>
            </tr>
        `;

        try {
            let query = db
                .from('registros_produccion')
                .select(`
                    id,
                    trabajador_id,
                    producto_id,
                    cantidad,
                    horas_trabajadas,
                    estado,
                    fecha_inicio,
                    fecha_fin,
                    notas,
                    created_at,
                    usuarios!trabajador_id (id, nombre, rol, tipo_pago, tarifa_hora, tarifa_unidad),
                    productos!producto_id (id, nombre, stock, origen)
                `, { count: 'exact' });

            // Si es trabajador, solo puede ver lo suyo (RLS también lo restringe)
            if (esTrabajador && usuarioAuth) {
                query = query.eq('trabajador_id', usuarioAuth.id);
            } else if (filtroTrabajador && filtroTrabajador.value) {
                query = query.eq('trabajador_id', filtroTrabajador.value);
            }

            // Filtro de estado
            if (filtroEstado && filtroEstado.value) {
                query = query.eq('estado', filtroEstado.value);
            }

            // Filtro de rango de fechas (por fecha_inicio)
            if (filtroFechaDesde && filtroFechaDesde.value) {
                query = query.gte('fecha_inicio', `${filtroFechaDesde.value}T00:00:00`);
            }
            if (filtroFechaHasta && filtroFechaHasta.value) {
                query = query.lte('fecha_inicio', `${filtroFechaHasta.value}T23:59:59`);
            }

            // Paginación y ordenamiento descendente
            const desdeIdx = (paginaActual - 1) * porPagina;
            const hastaIdx = desdeIdx + porPagina - 1;

            query = query
                .order('fecha_inicio', { ascending: false })
                .range(desdeIdx, hastaIdx);

            const { data, count, error } = await query;
            if (error) throw error;

            registrosCargados = data || [];
            totalRegistros = count || 0;

            renderizarTabla();
            actualizarPaginacion();
        } catch (err) {
            console.error('Error cargando registros de producción:', err);
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center text-error" style="padding: var(--space-xl);">
                        ❌ No se pudieron cargar los registros de producción.<br>
                        <small>${err.message || ''}</small>
                    </td>
                </tr>
            `;
        }
    }

    /**
     * Renderizar tabla de registros
     */
    function renderizarTabla() {
        if (!tbody) return;

        if (registrosCargados.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8">
                        <div class="empty-state">
                            <div class="empty-icono">🔨</div>
                            <h3>No hay órdenes de producción</h3>
                            <p>No se encontraron registros de manufactura con los filtros seleccionados.</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = registrosCargados.map(r => {
            const trabajadorNombre = r.usuarios?.nombre || 'Artesano Desconocido';
            const inicial = trabajadorNombre.charAt(0).toUpperCase();
            const productoNombre = r.productos?.nombre || 'Producto No Encontrado';
            const fechaInicio = formatFecha(r.fecha_inicio);
            const fechaFin = r.fecha_fin ? formatFecha(r.fecha_fin) : '—';
            const horasTexto = (r.horas_trabajadas !== null && r.horas_trabajadas !== undefined)
                ? `${Number(r.horas_trabajadas).toFixed(2)} h`
                : '—';

            // Determinar si el usuario actual tiene permiso de editar/finalizar
            const puedeGestionar = esAdmin || (esTrabajador && usuarioAuth && r.trabajador_id === usuarioAuth.id);

            let botonesAcciones = '';

            if (r.estado === 'en_proceso') {
                if (puedeGestionar) {
                    botonesAcciones = `
                        <button type="button" class="btn btn-sm btn-success btn-finalizar" data-id="${r.id}" title="Finalizar producción e ingresar stock">
                            ✅ Finalizar
                        </button>
                        <button type="button" class="btn btn-sm btn-secondary btn-cancelar" data-id="${r.id}" title="Cancelar orden de producción">
                            ❌ Cancelar
                        </button>
                    `;
                } else {
                    botonesAcciones = `<span class="text-muted" style="font-size:0.8rem;">En ejecución</span>`;
                }
            } else if (r.estado === 'terminado') {
                botonesAcciones = `
                    <span title="Completada y stock acreditado" style="color: var(--color-success); font-weight: 600; font-size: 0.85rem;">
                        ✓ Finalizada
                    </span>
                `;
            } else if (r.estado === 'rechazado') {
                botonesAcciones = `
                    <span class="text-muted" style="font-size: 0.82rem;">Cancelada</span>
                `;
            }

            return `
                <tr data-id="${r.id}">
                    <td>
                        <span style="font-weight: 500;">${fechaInicio}</span>
                        ${r.notas ? `<br><small class="text-muted" title="${r.notas}">📝 ${r.notas.length > 35 ? r.notas.slice(0, 35) + '...' : r.notas}</small>` : ''}
                    </td>
                    <td>
                        <div class="trabajador-celda">
                            <div class="trabajador-avatar-mini">${inicial}</div>
                            <div>
                                <span style="font-weight: 600; color: var(--color-text);">${trabajadorNombre}</span>
                                <div style="font-size: 0.75rem; color: var(--color-text-muted);">
                                    ${formatearTarifaTrabajador(r.usuarios)}
                                </div>
                            </div>
                        </div>
                    </td>
                    <td>
                        <span style="font-weight: 600;">${productoNombre}</span>
                        <div style="font-size: 0.75rem; color: var(--color-text-secondary);">
                            Stock actual: ${r.productos?.stock ?? 0}
                        </div>
                    </td>
                    <td class="text-center">
                        <strong style="font-size: 1.05rem; color: var(--color-secondary);">${r.cantidad}</strong>
                    </td>
                    <td class="text-center">
                        <span style="font-family: monospace; font-size: 0.9rem;">${horasTexto}</span>
                    </td>
                    <td>
                        ${renderBadgeEstado(r.estado)}
                    </td>
                    <td>
                        <span style="font-size: 0.85rem;">${fechaFin}</span>
                    </td>
                    <td class="text-right">
                        <div class="acciones-produccion">
                            ${botonesAcciones}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Enganchar eventos a botones generados dinámicamente
        tbody.querySelectorAll('.btn-finalizar').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const reg = registrosCargados.find(item => item.id === id);
                if (reg) abrirModalFinalizar(reg);
            });
        });

        tbody.querySelectorAll('.btn-cancelar').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const reg = registrosCargados.find(item => item.id === id);
                if (reg) cancelarOrdenProduccion(reg);
            });
        });
    }

    /**
     * Actualizar paginador inferior
     */
    function actualizarPaginacion() {
        if (!paginacionContenedor) return;
        paginacionContenedor.innerHTML = '';
        const totalPaginas = Math.ceil(totalRegistros / porPagina);
        if (totalPaginas > 1) {
            const nav = generarPaginacion(paginaActual, totalPaginas, (nuevaPag) => {
                paginaActual = nuevaPag;
                cargarRegistros();
            });
            paginacionContenedor.appendChild(nav);
        }
    }

    // ============================================================
    // GESTIÓN DEL MODAL: REGISTRAR PRODUCCIÓN
    // ============================================================

    function abrirModalNuevo() {
        if (!modalNueva) return;

        // Resetear formulario
        formNueva.reset();

        // Establecer fecha y hora actual por defecto
        const ahora = new Date();
        ahora.setMinutes(ahora.getMinutes() - ahora.getTimezoneOffset());
        if (inputFechaInicio) {
            inputFechaInicio.value = ahora.toISOString().slice(0, 16);
        }

        if (inputCantidad) {
            inputCantidad.value = '1';
        }

        // Lógica según rol
        if (esTrabajador && usuarioAuth) {
            if (grupoTrabajadorSelect) grupoTrabajadorSelect.style.display = 'none';
            if (bannerAutoasignado) bannerAutoasignado.style.display = 'flex';
            if (spanNombreAutoasignado) spanNombreAutoasignado.textContent = perfilAuth?.nombre || 'Tú (Usuario Actual)';
            if (selectTrabajador) selectTrabajador.value = usuarioAuth.id;
        } else {
            if (grupoTrabajadorSelect) grupoTrabajadorSelect.style.display = 'block';
            if (bannerAutoasignado) bannerAutoasignado.style.display = 'none';
            if (selectTrabajador) selectTrabajador.value = '';
        }

        modalNueva.classList.remove('hidden');
    }

    function cerrarModalNuevo() {
        if (modalNueva) modalNueva.classList.add('hidden');
    }

    async function manejarGuardarNuevaProduccion(e) {
        e.preventDefault();

        // Determinar ID del trabajador
        let trabajadorId = null;
        if (esTrabajador && usuarioAuth) {
            trabajadorId = usuarioAuth.id;
        } else if (selectTrabajador) {
            trabajadorId = selectTrabajador.value;
        }

        if (!trabajadorId) {
            mostrarNotificacion('Debes seleccionar o asignar un trabajador responsable.', 'warning');
            return;
        }

        const productoId = selectProducto ? selectProducto.value : null;
        if (!productoId) {
            mostrarNotificacion('Debes seleccionar una pieza o producto a fabricar.', 'warning');
            return;
        }

        const cantidad = parseInt(inputCantidad?.value || '1', 10);
        if (isNaN(cantidad) || cantidad < 1) {
            mostrarNotificacion('La cantidad a producir debe ser al menos 1.', 'warning');
            return;
        }

        const notas = inputNotas?.value?.trim() || null;
        const fechaInicioVal = inputFechaInicio?.value
            ? new Date(inputFechaInicio.value).toISOString()
            : new Date().toISOString();

        try {
            btnGuardarProduccion.disabled = true;
            btnGuardarProduccion.textContent = '⏳ Registrando...';

            const payload = {
                trabajador_id: trabajadorId,
                producto_id: productoId,
                cantidad: cantidad,
                estado: 'en_proceso',
                fecha_inicio: fechaInicioVal,
                notas: notas
            };

            const { data, error } = await db
                .from('registros_produccion')
                .insert([payload])
                .select();

            if (error) throw error;

            mostrarNotificacion('✅ Orden de producción iniciada correctamente.', 'success');
            cerrarModalNuevo();

            // Recargar datos y métricas
            await Promise.all([cargarRegistros(), cargarMetricas()]);
        } catch (err) {
            console.error('Error registrando orden de producción:', err);
            mostrarNotificacion(`Error al registrar producción: ${err.message || 'Error desconocido'}`, 'error');
        } finally {
            btnGuardarProduccion.disabled = false;
            btnGuardarProduccion.textContent = '🔨 Iniciar Producción';
        }
    }

    // ============================================================
    // GESTIÓN DEL MODAL: FINALIZAR PRODUCCIÓN
    // ============================================================

    function abrirModalFinalizar(registro) {
        if (!modalFinalizar) return;
        ordenParaFinalizar = registro;

        if (finalizarIdInput) finalizarIdInput.value = registro.id;
        if (finalizarProductoNombre) finalizarProductoNombre.textContent = registro.productos?.nombre || 'Producto';
        if (finalizarProductoCantidad) finalizarProductoCantidad.textContent = `${registro.cantidad} unidad(es)`;
        if (finalizarTrabajadorNombre) finalizarTrabajadorNombre.textContent = registro.usuarios?.nombre || 'Artesano';
        if (finalizarTarifaInfo) finalizarTarifaInfo.textContent = formatearTarifaTrabajador(registro.usuarios);

        // Si el trabajador cobra por hora, señalar énfasis en el input
        const cobraPorHora = registro.usuarios?.tipo_pago === 'por_hora';
        if (finalizarHorasInput) {
            finalizarHorasInput.value = registro.horas_trabajadas || '';
            if (cobraPorHora) {
                finalizarHorasInput.placeholder = 'Requerido para cálculo (Ej: 3.5)';
                if (finalizarAyudaHoras) {
                    finalizarAyudaHoras.innerHTML = '⚠️ <strong>Importante:</strong> Este artesano cobra por hora. Las horas registradas multiplicarán su tarifa por hora en el trigger automático.';
                    finalizarAyudaHoras.classList.add('stock-destacado-alerta');
                }
            } else {
                finalizarHorasInput.placeholder = 'Opcional / Informativo (Ej: 2.0)';
                if (finalizarAyudaHoras) {
                    finalizarAyudaHoras.innerHTML = 'Este artesano cobra por unidad. El pago se calculará según la cantidad elaborada por su tarifa unitaria.';
                    finalizarAyudaHoras.classList.remove('stock-destacado-alerta');
                }
            }
        }

        modalFinalizar.classList.remove('hidden');
        if (finalizarHorasInput) finalizarHorasInput.focus();
    }

    function cerrarModalFinalizar() {
        if (modalFinalizar) modalFinalizar.classList.add('hidden');
        ordenParaFinalizar = null;
    }

    async function manejarConfirmarFinalizar(e) {
        e.preventDefault();
        if (!ordenParaFinalizar) return;

        const horasVal = parseFloat(finalizarHorasInput?.value || '0');
        const cobraPorHora = ordenParaFinalizar.usuarios?.tipo_pago === 'por_hora';

        if (cobraPorHora && (isNaN(horasVal) || horasVal <= 0)) {
            mostrarNotificacion('Debes ingresar las horas trabajadas para artesanos con esquema por hora.', 'warning');
            if (finalizarHorasInput) finalizarHorasInput.focus();
            return;
        }

        try {
            btnConfirmarFinalizar.disabled = true;
            btnConfirmarFinalizar.textContent = '⏳ Finalizando y calculando...';

            const payload = {
                estado: 'terminado',
                horas_trabajadas: horasVal > 0 ? horasVal : null,
                fecha_fin: new Date().toISOString()
            };

            // Ejecutar la actualización en Supabase
            // NOTA: El trigger de PostgreSQL `trg_produccion_terminada` se activará automáticamente:
            // 1) Sumará NEW.cantidad a productos.stock y fijará su estado en 'disponible'
            // 2) Consultará el tipo_pago y tarifa del trabajador
            // 3) Creará automáticamente el registro correspondiente en pagos_trabajadores
            const { data, error } = await db
                .from('registros_produccion')
                .update(payload)
                .eq('id', ordenParaFinalizar.id)
                .select();

            if (error) throw error;

            // Mostrar notificación exitosa informando las acciones del trigger
            mostrarNotificacion(
                `🎉 ¡Producción finalizada! Se sumaron +${ordenParaFinalizar.cantidad} unidades al inventario y se generó el pago correspondiente del trabajador.`,
                'success',
                6000
            );

            cerrarModalFinalizar();

            // Recargar registros y actualizar métricas
            await Promise.all([cargarRegistros(), cargarMetricas(), cargarProductosFabricados()]);
        } catch (err) {
            console.error('Error al marcar producción terminada:', err);
            mostrarNotificacion(`Error al finalizar producción: ${err.message || 'Error desconocido'}`, 'error');
        } finally {
            btnConfirmarFinalizar.disabled = false;
            btnConfirmarFinalizar.textContent = '✅ Confirmar y Finalizar';
        }
    }

    // ============================================================
    // CANCELACIÓN DE ÓRDENES DE PRODUCCIÓN
    // ============================================================

    async function cancelarOrdenProduccion(registro) {
        const prodNombre = registro.productos?.nombre || 'la pieza';
        const ok = await confirmar(
            'Cancelar Orden de Producción',
            `¿Estás seguro de que deseas cancelar esta orden de "${prodNombre}" (${registro.cantidad} un.)? El estado cambiará a 'Cancelado' y no sumará stock ni generará pago.`
        );

        if (!ok) return;

        try {
            const { error } = await db
                .from('registros_produccion')
                .update({
                    estado: 'rechazado',
                    fecha_fin: new Date().toISOString()
                })
                .eq('id', registro.id);

            if (error) throw error;

            mostrarNotificacion('Orden de producción cancelada.', 'info');
            await Promise.all([cargarRegistros(), cargarMetricas()]);
        } catch (err) {
            console.error('Error cancelando orden:', err);
            mostrarNotificacion(`Error al cancelar orden: ${err.message || ''}`, 'error');
        }
    }

    // ============================================================
    // LISTENERS DE EVENTOS Y FILTROS
    // ============================================================

    // Botón apertura modal nuevo
    if (btnNuevaProduccion) {
        btnNuevaProduccion.addEventListener('click', abrirModalNuevo);
    }

    // Cierre modal nuevo
    if (btnCerrarModalNueva) btnCerrarModalNueva.addEventListener('click', cerrarModalNuevo);
    if (btnCancelarNueva) btnCancelarNueva.addEventListener('click', cerrarModalNuevo);
    if (formNueva) formNueva.addEventListener('submit', manejarGuardarNuevaProduccion);

    // Cierre modal finalizar
    if (btnCerrarModalFinalizar) btnCerrarModalFinalizar.addEventListener('click', cerrarModalFinalizar);
    if (btnCancelarFinalizar) btnCancelarFinalizar.addEventListener('click', cerrarModalFinalizar);
    if (formFinalizar) formFinalizar.addEventListener('submit', manejarConfirmarFinalizar);

    // Cierre al hacer click en overlay
    if (modalNueva) {
        modalNueva.addEventListener('click', (e) => {
            if (e.target === modalNueva) cerrarModalNuevo();
        });
    }
    if (modalFinalizar) {
        modalFinalizar.addEventListener('click', (e) => {
            if (e.target === modalFinalizar) cerrarModalFinalizar();
        });
    }

    // Filtros con reload
    if (filtroTrabajador) {
        filtroTrabajador.addEventListener('change', () => {
            paginaActual = 1;
            cargarRegistros();
        });
    }

    if (filtroEstado) {
        filtroEstado.addEventListener('change', () => {
            paginaActual = 1;
            cargarRegistros();
        });
    }

    if (filtroFechaDesde) {
        filtroFechaDesde.addEventListener('change', () => {
            paginaActual = 1;
            cargarRegistros();
        });
    }

    if (filtroFechaHasta) {
        filtroFechaHasta.addEventListener('change', () => {
            paginaActual = 1;
            cargarRegistros();
        });
    }

    if (btnLimpiarFiltros) {
        btnLimpiarFiltros.addEventListener('click', () => {
            if (filtroTrabajador) filtroTrabajador.value = '';
            if (filtroEstado) filtroEstado.value = '';
            if (filtroFechaDesde) filtroFechaDesde.value = '';
            if (filtroFechaHasta) filtroFechaHasta.value = '';
            paginaActual = 1;
            cargarRegistros();
        });
    }

    // Cargar datos iniciales en paralelo
    await Promise.all([
        cargarProductosFabricados(),
        cargarArtesanos(),
        cargarMetricas()
    ]);

    await cargarRegistros();
}
