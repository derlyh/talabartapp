import { db } from '../../supabase-client.js';
import { getUsuario, getPerfil } from '../../auth.js';
import { formatMoneda, formatFecha, mostrarNotificacion, confirmar, generarPaginacion, debounce } from '../../utils.js';
import { navegar } from '../../router.js';

// ============================================================
// MÓDULO DE VENTAS — TalabartApp
// ============================================================

/**
 * Etiquetas legibles para métodos de pago
 */
const METODO_PAGO_LABELS = {
    efectivo: '💵 Efectivo',
    transferencia: '🏦 Transferencia',
    tarjeta: '💳 Tarjeta',
    qr: '📱 QR'
};

/**
 * Iconos según categoría de producto (para fallback si no hay imagen)
 */
const CATEGORIA_ICONOS = {
    cinturones: '🥋',
    billeteras: '👛',
    bolsos: '👜',
    monturas: '🐴',
    calzado: '👞',
    accesorios: '🎒',
    default: '📦'
};

// ============================================================
// 1. LISTADO Y GESTIÓN DE VENTAS (ventas.html)
// ============================================================

/**
 * Inicializar vista de listado de ventas
 */
export async function init() {
    // Estado local del listado
    let paginaActual = 1;
    const porPagina = 10;
    let totalVentas = 0;
    let ventasCargadas = [];

    // Referencias a elementos DOM
    const tbody = document.getElementById('ventas-tbody');
    const paginacionContenedor = document.getElementById('paginacion-contenedor');
    const filtroBuscar = document.getElementById('filtro-buscar');
    const filtroFechaDesde = document.getElementById('filtro-fecha-desde');
    const filtroFechaHasta = document.getElementById('filtro-fecha-hasta');
    const filtroMetodo = document.getElementById('filtro-metodo');
    const filtroEstado = document.getElementById('filtro-estado');
    const btnLimpiarFiltros = document.getElementById('btn-limpiar-filtros');

    // Referencias del Modal de Detalle
    const modalDetalle = document.getElementById('modal-detalle');
    const btnCerrarModal = document.getElementById('btn-cerrar-modal');
    const btnCerrarModalPie = document.getElementById('btn-cerrar-modal-pie');
    const btnImprimirComprobante = document.getElementById('btn-imprimir-comprobante');
    const btnDetalleGenerarQr = document.getElementById('btn-detalle-generar-qr');

    let ventaSeleccionada = null;

    /**
     * Cargar ventas desde Supabase con filtros y paginación
     */
    async function cargarVentas() {
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="loading-contenedor">
                        <div class="spinner"></div>
                        <p>Cargando ventas...</p>
                    </div>
                </td>
            </tr>
        `;

        try {
            // Construir consulta base
            let query = db
                .from('ventas')
                .select(`
                    id,
                    fecha,
                    total,
                    metodo_pago,
                    estado,
                    notas,
                    cliente_id,
                    vendedor_id,
                    clientes (id, nombre, telefono, email, direccion),
                    usuarios!vendedor_id (id, nombre)
                `, { count: 'exact' });

            // Filtro de método de pago
            const metodo = filtroMetodo?.value;
            if (metodo) {
                query = query.eq('metodo_pago', metodo);
            }

            // Filtro de estado
            const estado = filtroEstado?.value;
            if (estado) {
                query = query.eq('estado', estado);
            }

            // Filtro de rango de fechas
            const fechaDesde = filtroFechaDesde?.value;
            if (fechaDesde) {
                query = query.gte('fecha', `${fechaDesde}T00:00:00.000Z`);
            }

            const fechaHasta = filtroFechaHasta?.value;
            if (fechaHasta) {
                query = query.lte('fecha', `${fechaHasta}T23:59:59.999Z`);
            }

            // Filtro de búsqueda por cliente o ID
            const busqueda = filtroBuscar?.value?.trim();
            if (busqueda) {
                // Verificar si es un UUID completo
                const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(busqueda);
                if (esUuid) {
                    query = query.eq('id', busqueda);
                } else {
                    // Buscar clientes que coincidan con el término
                    const { data: clientesCoincidentes, error: errClientes } = await db
                        .from('clientes')
                        .select('id')
                        .ilike('nombre', `%${busqueda}%`);

                    if (!errClientes && clientesCoincidentes && clientesCoincidentes.length > 0) {
                        const clienteIds = clientesCoincidentes.map(c => c.id);
                        query = query.in('cliente_id', clienteIds);
                    } else {
                        // Si no hay clientes coincidentes, buscar en notas
                        query = query.ilike('notas', `%${busqueda}%`);
                    }
                }
            }

            // Ordenamiento por fecha descendente
            query = query.order('fecha', { ascending: false });

            // Paginación
            const desde = (paginaActual - 1) * porPagina;
            const hasta = desde + porPagina - 1;
            query = query.range(desde, hasta);

            const { data, error, count } = await query;

            if (error) throw error;

            ventasCargadas = data || [];
            totalVentas = count || 0;

            renderTablaVentas();
            renderPaginacion();

        } catch (error) {
            console.error('Error cargando ventas:', error);
            tbody.innerHTML = `
                <tr>
                    <td colspan="7">
                        <div class="empty-state">
                            <div class="empty-icono">⚠️</div>
                            <p class="text-error">Error al cargar las ventas: ${error.message}</p>
                            <button type="button" class="btn btn-secondary btn-sm" id="btn-reintentar-ventas">Reintentar</button>
                        </div>
                    </td>
                </tr>
            `;
            document.getElementById('btn-reintentar-ventas')?.addEventListener('click', cargarVentas);
        }
    }

    /**
     * Renderizar filas de la tabla de ventas
     */
    function renderTablaVentas() {
        if (!tbody) return;

        if (ventasCargadas.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7">
                        <div class="empty-state">
                            <div class="empty-icono">🛒</div>
                            <p>No se encontraron ventas con los filtros aplicados.</p>
                            <a href="#/nueva-venta" class="btn btn-primary btn-sm">➕ Registrar Nueva Venta</a>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = ventasCargadas.map(venta => {
            const clienteNombre = venta.clientes?.nombre || 'Público General';
            const vendedorNombre = venta.usuarios?.nombre || 'Vendedor';
            const fechaStr = formatFecha(venta.fecha);
            const idCorto = venta.id.slice(0, 8).toUpperCase();
            const metodoLabel = METODO_PAGO_LABELS[venta.metodo_pago] || venta.metodo_pago;

            const esPendiente = venta.estado === 'pendiente';
            const esCancelada = venta.estado === 'cancelada';

            return `
                <tr data-venta-id="${venta.id}">
                    <td>
                        <strong style="font-family: var(--font-mono); color: var(--color-secondary);">#${idCorto}</strong>
                        <div style="font-size: 0.75rem; color: var(--color-text-muted);">${fechaStr}</div>
                    </td>
                    <td>
                        <div style="font-weight: 500;">${clienteNombre}</div>
                        ${venta.clientes?.telefono ? `<div style="font-size: 0.75rem; color: var(--color-text-muted);">📞 ${venta.clientes.telefono}</div>` : ''}
                    </td>
                    <td>${vendedorNombre}</td>
                    <td>
                        <span class="badge badge-${venta.metodo_pago}">
                            ${metodoLabel}
                        </span>
                    </td>
                    <td>
                        <strong style="font-size: 1rem; color: var(--color-text);">${formatMoneda(venta.total)}</strong>
                    </td>
                    <td>
                        <span class="badge badge-${venta.estado}">
                            ${venta.estado}
                        </span>
                    </td>
                    <td style="text-align: right;">
                        <div class="acciones-celda" style="justify-content: flex-end;">
                            <button type="button" class="btn btn-secondary btn-sm btn-ver-detalle" data-id="${venta.id}" title="Ver detalle de venta">
                                👁️ Detalle
                            </button>
                            ${esPendiente ? `
                                <button type="button" class="btn btn-warning btn-sm btn-generar-qr" data-id="${venta.id}" title="Generar / Cobrar con QR">
                                    📱 QR
                                </button>
                            ` : ''}
                            ${!esCancelada ? `
                                <button type="button" class="btn btn-danger btn-sm btn-cancelar-venta" data-id="${venta.id}" title="Cancelar venta">
                                    ❌ Cancelar
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Conectar eventos a los botones de acción
        tbody.querySelectorAll('.btn-ver-detalle').forEach(btn => {
            btn.addEventListener('click', () => abrirModalDetalle(btn.dataset.id));
        });

        tbody.querySelectorAll('.btn-generar-qr').forEach(btn => {
            btn.addEventListener('click', () => gestionarQrVenta(btn.dataset.id));
        });

        tbody.querySelectorAll('.btn-cancelar-venta').forEach(btn => {
            btn.addEventListener('click', () => procesarCancelacionVenta(btn.dataset.id));
        });
    }

    /**
     * Renderizar controles de paginación
     */
    function renderPaginacion() {
        if (!paginacionContenedor) return;
        paginacionContenedor.innerHTML = '';

        const totalPaginas = Math.ceil(totalVentas / porPagina);
        if (totalPaginas <= 1) return;

        const elementoPaginacion = generarPaginacion(paginaActual, totalPaginas, (nuevaPagina) => {
            paginaActual = nuevaPagina;
            cargarVentas();
        });

        if (elementoPaginacion) {
            paginacionContenedor.appendChild(elementoPaginacion);
        }
    }

    /**
     * Abrir modal con detalle de la venta e ítems
     */
    async function abrirModalDetalle(ventaId) {
        if (!modalDetalle) return;

        const venta = ventasCargadas.find(v => v.id === ventaId);
        if (!venta) return;
        ventaSeleccionada = venta;

        // Llenar cabecera e información general
        document.getElementById('detalle-folio').textContent = `Folio: #${venta.id.toUpperCase()}`;
        document.getElementById('detalle-fecha').textContent = formatFecha(venta.fecha);
        document.getElementById('detalle-estado').innerHTML = `<span class="badge badge-${venta.estado}">${venta.estado}</span>`;
        document.getElementById('detalle-vendedor').textContent = venta.usuarios?.nombre || 'Vendedor';
        document.getElementById('detalle-metodo').innerHTML = `<span class="badge badge-${venta.metodo_pago}">${METODO_PAGO_LABELS[venta.metodo_pago] || venta.metodo_pago}</span>`;

        const cliente = venta.clientes;
        document.getElementById('detalle-cliente-nombre').textContent = cliente?.nombre || 'Público General';
        
        let contactoTexto = '—';
        if (cliente) {
            contactoTexto = [cliente.telefono, cliente.email, cliente.direccion].filter(Boolean).join(' • ') || 'Sin datos adicionales';
        }
        document.getElementById('detalle-cliente-contacto').textContent = contactoTexto;
        document.getElementById('detalle-notas').textContent = venta.notas || 'Ninguna observación';

        // Configurar botón QR en modal si la venta está pendiente
        if (btnDetalleGenerarQr) {
            if (venta.estado === 'pendiente') {
                btnDetalleGenerarQr.classList.remove('hidden');
                btnDetalleGenerarQr.onclick = () => {
                    cerrarModalDetalle();
                    gestionarQrVenta(venta.id);
                };
            } else {
                btnDetalleGenerarQr.classList.add('hidden');
            }
        }

        // Cargar ítems de detalle_ventas
        const itemsTbody = document.getElementById('detalle-items-tbody');
        itemsTbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Cargando productos...</td></tr>`;

        // Abrir modal
        modalDetalle.classList.remove('hidden');

        try {
            const { data: items, error } = await db
                .from('detalle_ventas')
                .select(`
                    id,
                    cantidad,
                    precio_unit,
                    subtotal,
                    productos (id, nombre)
                `)
                .eq('venta_id', ventaId);

            if (error) throw error;

            if (!items || items.length === 0) {
                itemsTbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No se registraron productos en esta venta.</td></tr>`;
            } else {
                itemsTbody.innerHTML = items.map(item => `
                    <tr>
                        <td>
                            <strong>${item.productos?.nombre || 'Producto'}</strong>
                        </td>
                        <td style="text-align: center;">${item.cantidad}</td>
                        <td style="text-align: right;">${formatMoneda(item.precio_unit)}</td>
                        <td style="text-align: right; font-weight: 600;">${formatMoneda(item.subtotal || item.cantidad * item.precio_unit)}</td>
                    </tr>
                `).join('');
            }

            document.getElementById('detalle-subtotal').textContent = formatMoneda(venta.total);
            document.getElementById('detalle-total').textContent = formatMoneda(venta.total);

        } catch (err) {
            console.error('Error cargando ítems de venta:', err);
            itemsTbody.innerHTML = `<tr><td colspan="4" class="text-error">Error al cargar productos: ${err.message}</td></tr>`;
        }
    }

    /**
     * Cerrar modal de detalle
     */
    function cerrarModalDetalle() {
        if (!modalDetalle) return;
        modalDetalle.classList.add('hidden');
        ventaSeleccionada = null;
    }

    /**
     * Generar o redirigir a Cobro QR si la venta está pendiente
     */
    async function gestionarQrVenta(ventaId) {
        try {
            // Verificar si ya existe un registro en cuentas_cobro
            const { data: cuentaExistente, error: errConsulta } = await db
                .from('cuentas_cobro')
                .select('id')
                .eq('venta_id', ventaId)
                .maybeSingle();

            if (errConsulta && errConsulta.code !== 'PGRST116') {
                console.warn('Consulta cuentas_cobro:', errConsulta);
            }

            if (!cuentaExistente) {
                // Obtener datos de la venta para registrar la cuenta de cobro
                const { data: venta, error: errVenta } = await db
                    .from('ventas')
                    .select('id, total')
                    .eq('id', ventaId)
                    .single();

                if (errVenta) throw errVenta;

                const qrPayload = JSON.stringify({
                    sistema: 'Talabartería El Rodeo',
                    venta_id: venta.id,
                    monto: venta.total,
                    fecha: new Date().toISOString()
                });

                const { error: errInsert } = await db
                    .from('cuentas_cobro')
                    .insert([{
                        venta_id: venta.id,
                        monto: venta.total,
                        estado: 'pendiente',
                        qr_data: qrPayload,
                        fecha_limite: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                    }]);

                if (errInsert) throw errInsert;
            }

            // Redirigir al módulo de QR
            navegar(`/qr?venta=${ventaId}`);

        } catch (error) {
            console.error('Error gestionando QR de cobro:', error);
            mostrarNotificacion('Error al generar QR: ' + error.message, 'error');
        }
    }

    /**
     * Cancelar venta y restaurar stock en inventario
     */
    async function procesarCancelacionVenta(ventaId) {
        const venta = ventasCargadas.find(v => v.id === ventaId);
        if (!venta) return;

        if (venta.estado === 'cancelada') {
            mostrarNotificacion('Esta venta ya se encuentra cancelada', 'warning');
            return;
        }

        const confirmado = await confirmar(
            'Cancelar Venta',
            `¿Estás seguro de que deseas cancelar la venta #${ventaId.slice(0, 8).toUpperCase()}? Esta acción actualizará el estado a "cancelada" y devolverá las existencias al inventario.`
        );

        if (!confirmado) return;

        try {
            // 1. Obtener los ítems vendidos para reincorporar al stock
            const { data: items, error: errItems } = await db
                .from('detalle_ventas')
                .select('producto_id, cantidad')
                .eq('venta_id', ventaId);

            if (errItems) throw errItems;

            // 2. Restaurar stock en cada producto
            if (items && items.length > 0) {
                for (const item of items) {
                    const { data: prod } = await db
                        .from('productos')
                        .select('id, stock')
                        .eq('id', item.producto_id)
                        .single();

                    if (prod) {
                        const nuevoStock = prod.stock + item.cantidad;
                        await db
                            .from('productos')
                            .update({
                                stock: nuevoStock,
                                estado: nuevoStock > 0 ? 'disponible' : 'agotado'
                            })
                            .eq('id', item.producto_id);
                    }
                }
            }

            // 3. Actualizar estado de la venta
            const { error: errUpdateVenta } = await db
                .from('ventas')
                .update({ estado: 'cancelada' })
                .eq('id', ventaId);

            if (errUpdateVenta) throw errUpdateVenta;

            // 4. Si existe cuenta de cobro asociada, marcar como vencida o cancelada
            await db
                .from('cuentas_cobro')
                .update({ estado: 'vencida' })
                .eq('venta_id', ventaId);

            mostrarNotificacion('Venta cancelada exitosamente y stock restaurado', 'success');
            await cargarVentas();

        } catch (error) {
            console.error('Error al cancelar la venta:', error);
            mostrarNotificacion('No se pudo cancelar la venta: ' + error.message, 'error');
        }
    }

    // ============================================================
    // Eventos del Listado
    // ============================================================

    // Filtros con Debounce en búsqueda
    filtroBuscar?.addEventListener('input', debounce(() => {
        paginaActual = 1;
        cargarVentas();
    }, 350));

    filtroFechaDesde?.addEventListener('change', () => {
        paginaActual = 1;
        cargarVentas();
    });

    filtroFechaHasta?.addEventListener('change', () => {
        paginaActual = 1;
        cargarVentas();
    });

    filtroMetodo?.addEventListener('change', () => {
        paginaActual = 1;
        cargarVentas();
    });

    filtroEstado?.addEventListener('change', () => {
        paginaActual = 1;
        cargarVentas();
    });

    // Limpiar todos los filtros
    btnLimpiarFiltros?.addEventListener('click', () => {
        if (filtroBuscar) filtroBuscar.value = '';
        if (filtroFechaDesde) filtroFechaDesde.value = '';
        if (filtroFechaHasta) filtroFechaHasta.value = '';
        if (filtroMetodo) filtroMetodo.value = '';
        if (filtroEstado) filtroEstado.value = '';
        paginaActual = 1;
        cargarVentas();
    });

    // Eventos de cierre de modal
    btnCerrarModal?.addEventListener('click', cerrarModalDetalle);
    btnCerrarModalPie?.addEventListener('click', cerrarModalDetalle);

    modalDetalle?.addEventListener('click', (e) => {
        if (e.target === modalDetalle) cerrarModalDetalle();
    });

    // Imprimir comprobante de venta
    btnImprimirComprobante?.addEventListener('click', () => {
        window.print();
    });

    // Tecla ESC para cerrar modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalDetalle && !modalDetalle.classList.contains('hidden')) {
            cerrarModalDetalle();
        }
    });

    // Carga inicial de datos
    await cargarVentas();
}


// ============================================================
// 2. PUNTO DE VENTA / NUEVA VENTA (nueva-venta.html)
// ============================================================

/**
 * Inicializar vista de Punto de Venta (POS)
 */
export async function initNuevaVenta() {
    // Estado local del POS
    let catalogoProductos = [];
    let categorias = [];
    let categoriaFiltro = '';
    let busquedaTexto = '';

    // Carrito: array de { producto: Object, cantidad: number }
    let carrito = [];
    let metodoPagoSeleccionado = 'efectivo';

    // Referencias DOM del catálogo
    const gridProductos = document.getElementById('pos-productos-grid');
    const inputBuscar = document.getElementById('pos-buscar-producto');
    const contenedorPills = document.getElementById('pos-categorias-pills');

    // Referencias DOM del carrito
    const clienteSelect = document.getElementById('pos-cliente-select');
    const btnAbrirClienteModal = document.getElementById('btn-abrir-cliente-modal');
    const carritoEmpty = document.getElementById('carrito-empty');
    const carritoItemsLista = document.getElementById('carrito-items-lista');
    const btnVaciarCarrito = document.getElementById('btn-vaciar-carrito');
    const posTotalItems = document.getElementById('pos-total-items');
    const posSubtotal = document.getElementById('pos-subtotal');
    const posTotal = document.getElementById('pos-total');
    const posNotas = document.getElementById('pos-notas');
    const metodosGrid = document.getElementById('metodos-pago-grid');
    const btnCompletarVenta = document.getElementById('btn-completar-venta');

    // Referencias DOM del modal nuevo cliente
    const modalNuevoCliente = document.getElementById('modal-nuevo-cliente');
    const formNuevoCliente = document.getElementById('form-nuevo-cliente');
    const btnCerrarClienteModal = document.getElementById('btn-cerrar-cliente-modal');
    const btnCancelarCliente = document.getElementById('btn-cancelar-cliente');

    /**
     * Cargar catálogo de productos en stock, categorías y clientes
     */
    async function cargarDatosIniciales() {
        try {
            // Identificar al vendedor logueado
            const perfil = getPerfil();
            const usuario = getUsuario();
            const badgeVendedor = document.getElementById('pos-vendedor-badge');
            if (badgeVendedor) {
                const nombreVendedor = perfil?.nombre || usuario?.email || 'Vendedor';
                badgeVendedor.textContent = `👤 Vendedor: ${nombreVendedor}`;
            }

            // 1. Cargar productos disponibles (stock > 0)
            const { data: prods, error: errProds } = await db
                .from('productos')
                .select(`
                    id,
                    nombre,
                    categoria_id,
                    descripcion,
                    precio,
                    stock,
                    estado,
                    imagen_url,
                    categorias (id, nombre)
                `)
                .gt('stock', 0)
                .order('nombre');

            if (errProds) throw errProds;
            catalogoProductos = prods || [];

            // 2. Cargar categorías activas
            const { data: cats, error: errCats } = await db
                .from('categorias')
                .select('id, nombre')
                .order('nombre');

            if (!errCats && cats) {
                categorias = cats;
                renderCategoriasPills();
            }

            // 3. Cargar listado de clientes
            await cargarClientesSelect();

            // 4. Renderizar catálogo de productos
            renderCatalogo();

        } catch (error) {
            console.error('Error inicializando POS:', error);
            if (gridProductos) {
                gridProductos.innerHTML = `
                    <div class="empty-state" style="grid-column: 1 / -1;">
                        <div class="empty-icono">⚠️</div>
                        <p class="text-error">Error al cargar productos: ${error.message}</p>
                    </div>
                `;
            }
        }
    }

    /**
     * Cargar y poblar clientes en el select
     */
    async function cargarClientesSelect(clienteSeleccionarId = null) {
        if (!clienteSelect) return;

        try {
            const { data: clientes, error } = await db
                .from('clientes')
                .select('id, nombre, telefono, email')
                .order('nombre');

            if (error) throw error;

            clienteSelect.innerHTML = `<option value="">👤 Público General (Sin registrar)</option>`;

            (clientes || []).forEach(cli => {
                const opt = document.createElement('option');
                opt.value = cli.id;
                opt.textContent = `${cli.nombre}${cli.telefono ? ` (${cli.telefono})` : ''}`;
                if (clienteSeleccionarId && cli.id === clienteSeleccionarId) {
                    opt.selected = true;
                }
                clienteSelect.appendChild(opt);
            });
        } catch (err) {
            console.error('Error cargando clientes:', err);
        }
    }

    /**
     * Renderizar píldoras de categorías
     */
    function renderCategoriasPills() {
        if (!contenedorPills) return;

        contenedorPills.innerHTML = `
            <button type="button" class="categoria-pill ${categoriaFiltro === '' ? 'active' : ''}" data-cat-id="">
                Todas
            </button>
        ` + categorias.map(cat => `
            <button type="button" class="categoria-pill ${categoriaFiltro === cat.id ? 'active' : ''}" data-cat-id="${cat.id}">
                ${cat.nombre}
            </button>
        `).join('');

        contenedorPills.querySelectorAll('.categoria-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                contenedorPills.querySelectorAll('.categoria-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                categoriaFiltro = pill.dataset.catId || '';
                renderCatalogo();
            });
        });
    }

    /**
     * Obtener icono visual para un producto
     */
    function getIconoProducto(nombreCat = '') {
        const catKey = (nombreCat || '').toLowerCase();
        for (const [key, icon] of Object.entries(CATEGORIA_ICONOS)) {
            if (catKey.includes(key)) return icon;
        }
        return CATEGORIA_ICONOS.default;
    }

    /**
     * Renderizar tarjetas de productos en el catálogo
     */
    function renderCatalogo() {
        if (!gridProductos) return;

        // Filtrar por categoría y texto de búsqueda
        const productosFiltrados = catalogoProductos.filter(prod => {
            const coincideCat = !categoriaFiltro || prod.categoria_id === categoriaFiltro;
            const coincideTexto = !busquedaTexto ||
                prod.nombre.toLowerCase().includes(busquedaTexto) ||
                (prod.descripcion && prod.descripcion.toLowerCase().includes(busquedaTexto));
            return coincideCat && coincideTexto;
        });

        if (productosFiltrados.length === 0) {
            gridProductos.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; padding: var(--space-xl) 0;">
                    <div class="empty-icono">🔍</div>
                    <p>No se encontraron productos disponibles con estos criterios.</p>
                </div>
            `;
            return;
        }

        gridProductos.innerHTML = productosFiltrados.map(prod => {
            const itemEnCarrito = carrito.find(i => i.producto.id === prod.id);
            const cantidadEnCarrito = itemEnCarrito ? itemEnCarrito.cantidad : 0;
            const stockDisponible = prod.stock - cantidadEnCarrito;
            const sinStock = stockDisponible <= 0;
            const categoriaNombre = prod.categorias?.nombre || 'General';
            const icono = getIconoProducto(categoriaNombre);

            return `
                <div class="producto-card" data-producto-id="${prod.id}">
                    ${cantidadEnCarrito > 0 ? `
                        <div class="producto-card-badge-cart" title="Cantidad en el carrito">
                            ${cantidadEnCarrito} en orden
                        </div>
                    ` : ''}

                    <div class="producto-card-img">
                        ${prod.imagen_url ? `
                            <img src="${prod.imagen_url}" alt="${prod.nombre}" onerror="this.parentElement.innerHTML='${icono}'">
                        ` : icono}
                    </div>

                    <div class="producto-card-info">
                        <div class="producto-card-categoria">${categoriaNombre}</div>
                        <div class="producto-card-nombre" title="${prod.nombre}">${prod.nombre}</div>
                        <div class="producto-card-precio">${formatMoneda(prod.precio)}</div>
                        <div class="producto-card-stock ${stockDisponible <= 3 ? 'stock-bajo' : ''}">
                            📦 ${stockDisponible} ${stockDisponible === 1 ? 'disponible' : 'disponibles'}
                        </div>
                    </div>

                    <button type="button" class="btn btn-sm btn-primary btn-agregar"
                            data-producto-id="${prod.id}"
                            ${sinStock ? 'disabled' : ''}>
                        ${sinStock ? 'Sin más stock' : '➕ Agregar'}
                    </button>
                </div>
            `;
        }).join('');

        // Eventos en botones de agregar producto
        gridProductos.querySelectorAll('.btn-agregar').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                agregarAlCarrito(btn.dataset.productoId);
            });
        });

        // Hacer clic en toda la tarjeta para agregar
        gridProductos.querySelectorAll('.producto-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON') return;
                const prodId = card.dataset.productoId;
                agregarAlCarrito(prodId);
            });
        });
    }

    /**
     * Agregar un producto al carrito o incrementar su cantidad
     */
    function agregarAlCarrito(productoId) {
        const prod = catalogoProductos.find(p => p.id === productoId);
        if (!prod) return;

        const itemExistente = carrito.find(i => i.producto.id === productoId);

        if (itemExistente) {
            if (itemExistente.cantidad < prod.stock) {
                itemExistente.cantidad++;
            } else {
                mostrarNotificacion(`No hay más stock disponible para ${prod.nombre} (máx: ${prod.stock})`, 'warning');
                return;
            }
        } else {
            carrito.push({
                producto: prod,
                cantidad: 1
            });
        }

        renderCarrito();
        renderCatalogo();
    }

    /**
     * Modificar la cantidad de un ítem en el carrito
     */
    function actualizarCantidad(productoId, nuevaCantidad) {
        const item = carrito.find(i => i.producto.id === productoId);
        if (!item) return;

        let cant = parseInt(nuevaCantidad, 10);

        if (isNaN(cant) || cant <= 0) {
            eliminarDelCarrito(productoId);
            return;
        }

        if (cant > item.producto.stock) {
            cant = item.producto.stock;
            mostrarNotificacion(`El stock máximo disponible es de ${item.producto.stock} unidades`, 'warning');
        }

        item.cantidad = cant;
        renderCarrito();
        renderCatalogo();
    }

    /**
     * Quitar un ítem del carrito
     */
    function eliminarDelCarrito(productoId) {
        carrito = carrito.filter(i => i.producto.id !== productoId);
        renderCarrito();
        renderCatalogo();
    }

    /**
     * Vaciar todos los ítems del carrito
     */
    function vaciarCarrito() {
        if (carrito.length === 0) return;
        carrito = [];
        renderCarrito();
        renderCatalogo();
    }

    /**
     * Renderizar el listado de productos en el resumen del carrito y totales
     */
    function renderCarrito() {
        if (!carritoItemsLista || !carritoEmpty) return;

        if (carrito.length === 0) {
            carritoEmpty.style.display = 'block';
            carritoItemsLista.innerHTML = '';
            if (posTotalItems) posTotalItems.textContent = '0 uds';
            if (posSubtotal) posSubtotal.textContent = '$0';
            if (posTotal) posTotal.textContent = '$0';
            if (btnCompletarVenta) btnCompletarVenta.disabled = true;
            return;
        }

        carritoEmpty.style.display = 'none';

        carritoItemsLista.innerHTML = carrito.map(item => {
            const subtotalItem = item.cantidad * item.producto.precio;
            const alMaximo = item.cantidad >= item.producto.stock;

            return `
                <div class="carrito-item-row" data-id="${item.producto.id}">
                    <div class="carrito-item-info">
                        <div class="carrito-item-titulo" title="${item.producto.nombre}">${item.producto.nombre}</div>
                        <div class="carrito-item-precio-unit">${formatMoneda(item.producto.precio)} c/u</div>
                    </div>

                    <div class="carrito-item-controles">
                        <button type="button" class="btn-qty btn-restar-qty" data-id="${item.producto.id}" title="Disminuir">-</button>
                        <input type="number" class="input-qty input-cambiar-qty"
                               data-id="${item.producto.id}"
                               value="${item.cantidad}"
                               min="1"
                               max="${item.producto.stock}">
                        <button type="button" class="btn-qty btn-sumar-qty" data-id="${item.producto.id}" ${alMaximo ? 'disabled' : ''} title="Aumentar">+</button>
                    </div>

                    <div class="carrito-item-subtotal">${formatMoneda(subtotalItem)}</div>

                    <button type="button" class="btn-quitar btn-eliminar-item" data-id="${item.producto.id}" title="Quitar de la orden">
                        🗑️
                    </button>
                </div>
            `;
        }).join('');

        // Calcular totales
        const totalUds = carrito.reduce((acc, i) => acc + i.cantidad, 0);
        const montoTotal = carrito.reduce((acc, i) => acc + (i.cantidad * i.producto.precio), 0);

        if (posTotalItems) posTotalItems.textContent = `${totalUds} uds`;
        if (posSubtotal) posSubtotal.textContent = formatMoneda(montoTotal);
        if (posTotal) posTotal.textContent = formatMoneda(montoTotal);
        if (btnCompletarVenta) btnCompletarVenta.disabled = false;

        // Conectar eventos del carrito
        carritoItemsLista.querySelectorAll('.btn-restar-qty').forEach(btn => {
            btn.addEventListener('click', () => {
                const item = carrito.find(i => i.producto.id === btn.dataset.id);
                if (item) actualizarCantidad(item.producto.id, item.cantidad - 1);
            });
        });

        carritoItemsLista.querySelectorAll('.btn-sumar-qty').forEach(btn => {
            btn.addEventListener('click', () => {
                const item = carrito.find(i => i.producto.id === btn.dataset.id);
                if (item) actualizarCantidad(item.producto.id, item.cantidad + 1);
            });
        });

        carritoItemsLista.querySelectorAll('.input-cambiar-qty').forEach(input => {
            input.addEventListener('change', () => {
                actualizarCantidad(input.dataset.id, input.value);
            });
        });

        carritoItemsLista.querySelectorAll('.btn-eliminar-item').forEach(btn => {
            btn.addEventListener('click', () => {
                eliminarDelCarrito(btn.dataset.id);
            });
        });
    }

    /**
     * Flujo de Checkout: registrar la venta completa
     */
    async function procesarCompletarVenta() {
        if (carrito.length === 0) {
            mostrarNotificacion('El carrito de compras está vacío', 'warning');
            return;
        }

        const usuario = getUsuario();
        if (!usuario) {
            mostrarNotificacion('Debes iniciar sesión para registrar ventas', 'error');
            navegar('/login');
            return;
        }

        const clienteId = clienteSelect?.value || null;
        const metodoPago = metodoPagoSeleccionado;
        const notas = posNotas?.value?.trim() || null;

        // Si es QR, el estado inicial es 'pendiente' para esperar confirmación de pago;
        // en otros métodos se considera 'pagada' de inmediato en mostrador.
        const estadoVenta = (metodoPago === 'qr') ? 'pendiente' : 'pagada';

        // Bloquear botón durante el procesamiento
        if (btnCompletarVenta) {
            btnCompletarVenta.disabled = true;
            btnCompletarVenta.innerHTML = `<span class="spinner"></span> Registrando venta...`;
        }

        try {
            // ============================================================
            // 1. Insertar cabecera de venta en 'ventas'
            // ============================================================
            const { data: nuevaVenta, error: errVenta } = await db
                .from('ventas')
                .insert([{
                    cliente_id: clienteId,
                    vendedor_id: usuario.id,
                    metodo_pago: metodoPago,
                    estado: estadoVenta,
                    notas: notas
                }])
                .select()
                .single();

            if (errVenta) throw errVenta;

            // ============================================================
            // 2. Insertar los ítems en 'detalle_ventas'
            // Nota: Los triggers en PostgreSQL 'trg_descontar_stock' y
            // 'trg_recalcular_total' descontarán el stock y calcularán el total automáticamente.
            // ============================================================
            const detalles = carrito.map(item => ({
                venta_id: nuevaVenta.id,
                producto_id: item.producto.id,
                cantidad: item.cantidad,
                precio_unit: item.producto.precio
            }));

            const { error: errDetalles } = await db
                .from('detalle_ventas')
                .insert(detalles);

            if (errDetalles) {
                // Si falla el detalle (por ejemplo por concurrencia de stock), cancelar la venta creada
                await db.from('ventas').update({ estado: 'cancelada' }).eq('id', nuevaVenta.id);
                throw errDetalles;
            }

            // ============================================================
            // 3. Si el método de pago es 'qr', insertar en 'cuentas_cobro' y redirigir
            // ============================================================
            if (metodoPago === 'qr') {
                const totalCalculado = carrito.reduce((acc, i) => acc + (i.cantidad * i.producto.precio), 0);
                const qrPayload = JSON.stringify({
                    sistema: 'Talabartería El Rodeo',
                    venta_id: nuevaVenta.id,
                    monto: totalCalculado,
                    metodo: 'qr',
                    fecha: new Date().toISOString()
                });

                const { error: errCobro } = await db
                    .from('cuentas_cobro')
                    .insert([{
                        venta_id: nuevaVenta.id,
                        monto: totalCalculado,
                        estado: 'pendiente',
                        qr_data: qrPayload,
                        fecha_limite: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                    }]);

                if (errCobro) {
                    console.warn('Error al registrar cuenta_cobro para QR:', errCobro);
                }

                mostrarNotificacion('Venta registrada con éxito. Redirigiendo a pantalla de Cobro QR...', 'success');
                navegar(`/qr?venta=${nuevaVenta.id}`);
                return;
            }

            // ============================================================
            // 4. Venta con otros métodos de pago: Notificar y redirigir a #/ventas
            // ============================================================
            mostrarNotificacion('¡Venta completada con éxito!', 'success');
            navegar('/ventas');

        } catch (error) {
            console.error('Error procesando venta:', error);
            mostrarNotificacion('Error al procesar la venta: ' + error.message, 'error');
            if (btnCompletarVenta) {
                btnCompletarVenta.disabled = false;
                btnCompletarVenta.innerHTML = `✅ Completar Venta`;
            }
        }
    }

    // ============================================================
    // Modal de Creación Rápida de Cliente
    // ============================================================

    function abrirModalCliente() {
        if (!modalNuevoCliente) return;
        formNuevoCliente?.reset();
        modalNuevoCliente.classList.remove('hidden');
        document.getElementById('cliente-nombre')?.focus();
    }

    function cerrarModalCliente() {
        if (!modalNuevoCliente) return;
        modalNuevoCliente.classList.add('hidden');
        formNuevoCliente?.reset();
    }

    btnAbrirClienteModal?.addEventListener('click', abrirModalCliente);
    btnCerrarClienteModal?.addEventListener('click', cerrarModalCliente);
    btnCancelarCliente?.addEventListener('click', cerrarModalCliente);

    modalNuevoCliente?.addEventListener('click', (e) => {
        if (e.target === modalNuevoCliente) cerrarModalCliente();
    });

    formNuevoCliente?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nombre = document.getElementById('cliente-nombre')?.value?.trim();
        const telefono = document.getElementById('cliente-telefono')?.value?.trim() || null;
        const email = document.getElementById('cliente-email')?.value?.trim() || null;
        const direccion = document.getElementById('cliente-direccion')?.value?.trim() || null;
        const notas = document.getElementById('cliente-notas')?.value?.trim() || null;

        if (!nombre) {
            mostrarNotificacion('El nombre del cliente es obligatorio', 'warning');
            return;
        }

        const btnGuardar = document.getElementById('btn-guardar-cliente');
        if (btnGuardar) {
            btnGuardar.disabled = true;
            btnGuardar.textContent = 'Guardando...';
        }

        try {
            const { data: nuevoCliente, error } = await db
                .from('clientes')
                .insert([{ nombre, telefono, email, direccion, notas }])
                .select()
                .single();

            if (error) throw error;

            mostrarNotificacion(`Cliente "${nuevoCliente.nombre}" registrado exitosamente`, 'success');
            cerrarModalCliente();

            // Recargar selector de clientes y seleccionar al nuevo cliente
            await cargarClientesSelect(nuevoCliente.id);

        } catch (err) {
            console.error('Error al registrar cliente:', err);
            mostrarNotificacion('Error al guardar cliente: ' + err.message, 'error');
        } finally {
            if (btnGuardar) {
                btnGuardar.disabled = false;
                btnGuardar.textContent = 'Guardar Cliente';
            }
        }
    });

    // ============================================================
    // Eventos del POS
    // ============================================================

    // Búsqueda en catálogo con debounce
    inputBuscar?.addEventListener('input', debounce((e) => {
        busquedaTexto = (e.target.value || '').trim().toLowerCase();
        renderCatalogo();
    }, 250));

    // Selector de métodos de pago
    metodosGrid?.querySelectorAll('.metodo-pago-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            metodosGrid.querySelectorAll('.metodo-pago-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            metodoPagoSeleccionado = btn.dataset.metodo || 'efectivo';
        });
    });

    // Vaciar carrito
    btnVaciarCarrito?.addEventListener('click', async () => {
        if (carrito.length === 0) return;
        const confirmado = await confirmar('Vaciar Carrito', '¿Deseas quitar todos los productos del carrito?');
        if (confirmado) vaciarCarrito();
    });

    // Completar venta
    btnCompletarVenta?.addEventListener('click', procesarCompletarVenta);

    // Carga inicial
    await cargarDatosIniciales();
}
