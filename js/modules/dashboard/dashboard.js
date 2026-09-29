import { db } from '../../supabase-client.js';
import { getUsuario, getPerfil, getRol } from '../../auth.js';
import { formatMoneda, formatFecha, formatFechaCorta, mostrarNotificacion } from '../../utils.js';

// ============================================================
// MÓDULO DE DASHBOARD — Tablero Principal TalabartApp
// ============================================================

/** Canal de suscripción en tiempo real de Supabase */
let canalRealtime = null;

/** Caché de trabajadores para asignación en producción */
let trabajadoresCache = [];

/**
 * Función de escape para evitar inyecciones HTML en strings dinámicos
 * @param {any} str
 * @returns {string}
 */
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Obtener ícono temático representativo de la categoría del producto
 * @param {string} categoria
 * @returns {string}
 */
function obtenerIconoCategoria(categoria) {
    const cat = (categoria || '').toLowerCase();
    if (cat.includes('cinturon') || cat.includes('correa')) return '🥋';
    if (cat.includes('billetera') || cat.includes('cartera')) return '👛';
    if (cat.includes('bolso') || cat.includes('morral') || cat.includes('mochila')) return '👜';
    if (cat.includes('montura') || cat.includes('apero') || cat.includes('caballo')) return '🐴';
    if (cat.includes('calzado') || cat.includes('bota') || cat.includes('zapato')) return '👞';
    if (cat.includes('llavero') || cat.includes('accesorio') || cat.includes('funda')) return '🎒';
    return '📦';
}

/**
 * Obtener ícono y etiqueta amigable según método de pago
 * @param {string} metodo
 * @returns {{ icono: string, label: string }}
 */
function obtenerDetalleMetodoPago(metodo) {
    switch (metodo) {
        case 'efectivo':
            return { icono: '💵', label: 'Efectivo' };
        case 'transferencia':
            return { icono: '🏦', label: 'Transferencia' };
        case 'tarjeta':
            return { icono: '💳', label: 'Tarjeta' };
        case 'qr':
            return { icono: '📱', label: 'Cobro QR' };
        default:
            return { icono: '🪙', label: metodo || 'Otro' };
    }
}

/**
 * Obtener nombre legible del rol
 * @param {string} rol
 * @returns {string}
 */
function obtenerNombreRol(rol) {
    const roles = {
        admin: 'Administrador',
        vendedor: 'Vendedor',
        trabajador: 'Maestro Artesano'
    };
    return roles[rol] || rol || 'Usuario';
}

/**
 * Formatear saludo según hora del día
 * @param {string} nombre
 * @returns {string}
 */
function generarTextoSaludo(nombre) {
    const hora = new Date().getHours();
    let saludo = 'Buen día';
    if (hora >= 12 && hora < 19) {
        saludo = 'Buenas tardes';
    } else if (hora >= 19 || hora < 5) {
        saludo = 'Buenas noches';
    }
    return `¡${saludo}, ${nombre || 'Compañero'}!`;
}

// ============================================================
// Inicialización del Módulo
// ============================================================

/**
 * Inicializar el módulo del tablero principal
 */
export async function init() {
    // 1. Limpieza de canal de Realtime previo si existía
    if (canalRealtime) {
        try {
            await db.removeChannel(canalRealtime);
        } catch (err) {
            console.warn('Error al limpiar canal Realtime del dashboard:', err);
        }
        canalRealtime = null;
    }

    // 2. Configurar encabezado (saludo, fecha y rol)
    configurarEncabezadoUsuario();

    // 3. Configurar eventos de UI (pestañas, botones, modales)
    configurarEventosUI();

    // 4. Cargar lista de artesanos/trabajadores para modales
    await cargarTrabajadores();

    // 5. Cargar métricas y datos del tablero principal
    await cargarDatosDashboard();

    // 6. Configurar suscripción Realtime para actualización en vivo
    configurarRealtime();
}

/**
 * Configurar saludo personalizado, fecha actual y badge de rol
 */
function configurarEncabezadoUsuario() {
    const perfil = getPerfil();
    const rol = getRol() || 'vendedor';

    // Saludo
    const saludoEl = document.getElementById('dash-greeting-text');
    if (saludoEl) {
        const nombreMostrar = perfil?.nombre ? perfil.nombre.split(' ')[0] : 'Usuario';
        saludoEl.textContent = generarTextoSaludo(nombreMostrar);
    }

    // Fecha actual formateada
    const fechaEl = document.getElementById('dash-current-date');
    if (fechaEl) {
        const opciones = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        };
        const fechaTexto = new Date().toLocaleDateString('es-CO', opciones);
        const fechaFinal = fechaTexto.charAt(0).toUpperCase() + fechaTexto.slice(1);
        fechaEl.innerHTML = `<span>📅</span> ${fechaFinal}`;
    }

    // Badge de rol
    const rolBadge = document.getElementById('dash-user-rol');
    if (rolBadge) {
        rolBadge.className = `badge-rol badge-rol-${rol}`;
        rolBadge.textContent = obtenerNombreRol(rol);
    }
}

/**
 * Configurar eventos de interacción en el DOM
 */
function configurarEventosUI() {
    // Botón de refresco manual
    const btnRefresh = document.getElementById('btn-refresh-dashboard');
    if (btnRefresh) {
        btnRefresh.onclick = async () => {
            btnRefresh.classList.add('rotando');
            btnRefresh.disabled = true;
            try {
                await cargarDatosDashboard();
                mostrarNotificacion('Datos del tablero actualizados', 'info', 2000);
            } catch (err) {
                console.error('Error al actualizar datos:', err);
                mostrarNotificacion('No se pudo actualizar el tablero', 'error');
            } finally {
                btnRefresh.classList.remove('rotando');
                btnRefresh.disabled = false;
            }
        };
    }

    // Pestañas de actividad reciente (Ventas vs Producción)
    const tabVentas = document.getElementById('tab-actividad-ventas');
    const tabProduccion = document.getElementById('tab-actividad-produccion');
    const panelVentas = document.getElementById('contenedor-actividad-ventas');
    const panelProduccion = document.getElementById('contenedor-actividad-produccion');

    if (tabVentas && tabProduccion && panelVentas && panelProduccion) {
        tabVentas.onclick = () => {
            tabVentas.classList.add('active');
            tabProduccion.classList.remove('active');
            panelVentas.style.display = 'block';
            panelProduccion.style.display = 'none';
        };

        tabProduccion.onclick = () => {
            tabProduccion.classList.add('active');
            tabVentas.classList.remove('active');
            panelProduccion.style.display = 'block';
            panelVentas.style.display = 'none';
        };
    }

    // Configurar Modales (Reabastecer y Ordenar Producción)
    configurarModales();
}

/**
 * Configurar modales y sus formularios
 */
function configurarModales() {
    // Modal Reabastecer Stock
    const modalReabastecer = document.getElementById('modal-reabastecer');
    const btnCerrarReabastecer = document.getElementById('btn-cerrar-modal-reabastecer');
    const btnCancelarReabastecer = document.getElementById('btn-cancelar-reabastecer');
    const formReabastecer = document.getElementById('form-reabastecer-stock');
    const inputCantidad = document.getElementById('reabastecer-cantidad-input');
    const labelStockActual = document.getElementById('reabastecer-stock-actual');
    const labelStockResultado = document.getElementById('reabastecer-stock-resultado');

    const cerrarModalReabastecer = () => {
        if (modalReabastecer) modalReabastecer.style.display = 'none';
        if (formReabastecer) formReabastecer.reset();
    };

    if (btnCerrarReabastecer) btnCerrarReabastecer.onclick = cerrarModalReabastecer;
    if (btnCancelarReabastecer) btnCancelarReabastecer.onclick = cerrarModalReabastecer;

    if (inputCantidad && labelStockActual && labelStockResultado) {
        inputCantidad.oninput = () => {
            const actual = parseInt(labelStockActual.textContent, 10) || 0;
            const incremento = parseInt(inputCantidad.value, 10) || 0;
            const nuevoTotal = Math.max(0, actual + incremento);
            labelStockResultado.textContent = `${nuevoTotal} unidades`;
        };
    }

    if (formReabastecer) {
        formReabastecer.onsubmit = async (e) => {
            e.preventDefault();
            const productoId = document.getElementById('reabastecer-producto-id')?.value;
            const cantidad = parseInt(inputCantidad?.value, 10);
            const stockActual = parseInt(labelStockActual?.textContent, 10) || 0;

            if (!productoId || isNaN(cantidad) || cantidad <= 0) {
                mostrarNotificacion('Ingrese una cantidad válida mayor a cero', 'warning');
                return;
            }

            const btnSubmit = document.getElementById('btn-guardar-reabastecer');
            if (btnSubmit) btnSubmit.disabled = true;

            try {
                const nuevoStock = stockActual + cantidad;
                const nuevoEstado = nuevoStock > 0 ? 'disponible' : 'agotado';

                const { error } = await db
                    .from('productos')
                    .update({
                        stock: nuevoStock,
                        estado: nuevoEstado,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', productoId);

                if (error) throw error;

                mostrarNotificacion(`Stock actualizado con éxito (+${cantidad} unidades)`, 'success');
                cerrarModalReabastecer();
                await cargarDatosDashboard();
            } catch (error) {
                console.error('Error al reabastecer stock:', error);
                mostrarNotificacion('Error al actualizar el stock: ' + (error.message || 'Error desconocido'), 'error');
            } finally {
                if (btnSubmit) btnSubmit.disabled = false;
            }
        };
    }

    // Modal Ordenar Producción
    const modalProduccion = document.getElementById('modal-ordenar-produccion');
    const btnCerrarProduccion = document.getElementById('btn-cerrar-modal-produccion');
    const btnCancelarProduccion = document.getElementById('btn-cancelar-produccion');
    const formProduccion = document.getElementById('form-ordenar-produccion');

    const cerrarModalProduccion = () => {
        if (modalProduccion) modalProduccion.style.display = 'none';
        if (formProduccion) formProduccion.reset();
    };

    if (btnCerrarProduccion) btnCerrarProduccion.onclick = cerrarModalProduccion;
    if (btnCancelarProduccion) btnCancelarProduccion.onclick = cerrarModalProduccion;

    if (formProduccion) {
        formProduccion.onsubmit = async (e) => {
            e.preventDefault();
            const productoId = document.getElementById('orden-producto-id')?.value;
            const trabajadorId = document.getElementById('orden-trabajador-select')?.value;
            const cantidad = parseInt(document.getElementById('orden-cantidad-input')?.value, 10);
            const notas = document.getElementById('orden-notas-input')?.value?.trim();

            if (!productoId) {
                mostrarNotificacion('Selección de producto inválida', 'warning');
                return;
            }
            if (!trabajadorId) {
                mostrarNotificacion('Por favor asigne un artesano/trabajador para el lote', 'warning');
                return;
            }
            if (isNaN(cantidad) || cantidad <= 0) {
                mostrarNotificacion('La cantidad a producir debe ser al menos 1', 'warning');
                return;
            }

            const btnSubmit = document.getElementById('btn-guardar-produccion');
            if (btnSubmit) btnSubmit.disabled = true;

            try {
                const { error } = await db
                    .from('registros_produccion')
                    .insert({
                        producto_id: productoId,
                        trabajador_id: trabajadorId,
                        cantidad: cantidad,
                        notas: notas || null,
                        estado: 'en_proceso',
                        fecha_inicio: new Date().toISOString()
                    });

                if (error) throw error;

                mostrarNotificacion(`Lote de producción iniciado (${cantidad} piezas)`, 'success');
                cerrarModalProduccion();
                await cargarDatosDashboard();
            } catch (error) {
                console.error('Error al ordenar producción:', error);
                mostrarNotificacion('Error al generar orden: ' + (error.message || 'Error desconocido'), 'error');
            } finally {
                if (btnSubmit) btnSubmit.disabled = false;
            }
        };
    }

    // Cerrar modales con tecla Escape o clic fuera
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            cerrarModalReabastecer();
            cerrarModalProduccion();
        }
    });

    [modalReabastecer, modalProduccion].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    cerrarModalReabastecer();
                    cerrarModalProduccion();
                }
            });
        }
    });
}

/**
 * Cargar lista de trabajadores activos para el selector del modal
 */
async function cargarTrabajadores() {
    try {
        const { data, error } = await db
            .from('usuarios')
            .select('id, nombre, rol')
            .in('rol', ['trabajador', 'admin'])
            .eq('activo', true)
            .order('nombre');

        if (error) throw error;
        trabajadoresCache = data || [];

        const select = document.getElementById('orden-trabajador-select');
        if (select) {
            select.innerHTML = '<option value="">Seleccione artesano disponible...</option>';
            trabajadoresCache.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = `${t.nombre} (${t.rol === 'admin' ? 'Taller Central' : 'Artesano'})`;
                select.appendChild(opt);
            });
        }
    } catch (err) {
        console.warn('No se pudo precargar lista de artesanos:', err);
    }
}

// ============================================================
// Carga y Procesamiento de Métricas
// ============================================================

/**
 * Cargar todas las estadísticas y listas del Dashboard en paralelo
 */
async function cargarDatosDashboard() {
    const ahora = new Date();
    // Inicio del mes en formato ISO
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1, 0, 0, 0, 0).toISOString();
    // Fin del mes en formato ISO
    const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();

    // Consultas concurrentes protegidas con manejo individual
    const [
        resVentasMes,
        resProductos,
        resProduccionActiva,
        resCuentasPendientes,
        resVentasRecientes,
        resProduccionReciente
    ] = await Promise.allSettled([
        // 1. Ventas del Mes
        db.from('ventas')
            .select('id, total, estado, fecha')
            .gte('fecha', inicioMes)
            .lte('fecha', finMes),

        // 2. Productos en Inventario
        db.from('productos')
            .select(`
                id,
                nombre,
                precio,
                stock,
                estado,
                origen,
                imagen_url,
                categoria_id,
                categorias (id, nombre)
            `)
            .order('stock', { ascending: true }),

        // 3. Producción en Proceso
        db.from('registros_produccion')
            .select(`
                id,
                cantidad,
                estado,
                fecha_inicio,
                producto_id,
                trabajador_id,
                productos (id, nombre),
                usuarios!trabajador_id (id, nombre)
            `)
            .eq('estado', 'en_proceso'),

        // 4. Cuentas Pendientes por Cobrar
        db.from('cuentas_cobro')
            .select('id, monto, estado, fecha_limite')
            .eq('estado', 'pendiente'),

        // 5. Ventas Recientes para la pestaña
        db.from('ventas')
            .select(`
                id,
                fecha,
                total,
                metodo_pago,
                estado,
                cliente_id,
                clientes (id, nombre),
                usuarios!vendedor_id (id, nombre)
            `)
            .order('fecha', { ascending: false })
            .limit(6),

        // 6. Producción Reciente para la pestaña
        db.from('registros_produccion')
            .select(`
                id,
                cantidad,
                estado,
                fecha_inicio,
                fecha_fin,
                created_at,
                producto_id,
                trabajador_id,
                productos (id, nombre, imagen_url),
                usuarios!trabajador_id (id, nombre)
            `)
            .order('created_at', { ascending: false })
            .limit(6)
    ]);

    // ---- Procesar 1: Ventas del Mes ----
    let totalVentasMes = 0;
    let conteoVentasMes = 0;
    if (resVentasMes.status === 'fulfilled' && !resVentasMes.value.error && resVentasMes.value.data) {
        const ventasData = resVentasMes.value.data;
        const ventasValidas = ventasData.filter(v => v.estado !== 'cancelada');
        conteoVentasMes = ventasValidas.length;
        totalVentasMes = ventasValidas.reduce((acc, v) => acc + (Number(v.total) || 0), 0);

        renderStatVentas(totalVentasMes, conteoVentasMes);
    } else {
        renderStatVentas(0, 0, resVentasMes.value?.error);
    }

    // ---- Procesar 2: Productos e Inventario ----
    let productosData = [];
    if (resProductos.status === 'fulfilled' && !resProductos.value.error && resProductos.value.data) {
        productosData = resProductos.value.data;
        const totalUnidades = productosData.reduce((acc, p) => acc + (Number(p.stock) || 0), 0);
        const totalReferencias = productosData.length;
        const stockBajoCount = productosData.filter(p => (Number(p.stock) || 0) < 5).length;
        const productosCriticos = productosData.filter(p => (Number(p.stock) || 0) <= 3);

        renderStatInventario(totalUnidades, totalReferencias, stockBajoCount);
        renderAlertasStockBajo(productosCriticos);
    } else {
        renderStatInventario(0, 0, 0, resProductos.value?.error);
        renderAlertasStockBajo([], resProductos.value?.error);
    }

    // ---- Procesar 3: Producción en Proceso ----
    if (resProduccionActiva.status === 'fulfilled' && !resProduccionActiva.value.error && resProduccionActiva.value.data) {
        const prodData = resProduccionActiva.value.data;
        const totalLotes = prodData.length;
        const totalPiezas = prodData.reduce((acc, r) => acc + (Number(r.cantidad) || 0), 0);

        renderStatProduccion(totalLotes, totalPiezas);
    } else {
        renderStatProduccion(0, 0, resProduccionActiva.value?.error);
    }

    // ---- Procesar 4: Cuentas Pendientes por Cobrar ----
    if (resCuentasPendientes.status === 'fulfilled' && !resCuentasPendientes.value.error && resCuentasPendientes.value.data) {
        const cuentasData = resCuentasPendientes.value.data;
        const totalMontoCuentas = cuentasData.reduce((acc, c) => acc + (Number(c.monto) || 0), 0);
        const cantidadCuentas = cuentasData.length;

        renderStatCuentas(totalMontoCuentas, cantidadCuentas);
    } else {
        renderStatCuentas(0, 0, resCuentasPendientes.value?.error);
    }

    // ---- Procesar 5: Ventas Recientes ----
    if (resVentasRecientes.status === 'fulfilled' && !resVentasRecientes.value.error && resVentasRecientes.value.data) {
        renderActividadVentas(resVentasRecientes.value.data);
    } else {
        renderActividadVentas([], resVentasRecientes.value?.error);
    }

    // ---- Procesar 6: Producción Reciente ----
    if (resProduccionReciente.status === 'fulfilled' && !resProduccionReciente.value.error && resProduccionReciente.value.data) {
        renderActividadProduccion(resProduccionReciente.value.data);
    } else {
        renderActividadProduccion([], resProduccionReciente.value?.error);
    }
}

// ============================================================
// Renderizadores de Tarjetas de Estadísticas
// ============================================================

/**
 * Renderizar métrica de ventas del mes
 */
function renderStatVentas(total, conteo, error = null) {
    const valorEl = document.getElementById('stat-ventas-valor');
    const subEl = document.getElementById('stat-ventas-sub');

    if (!valorEl || !subEl) return;

    if (error) {
        valorEl.textContent = '—';
        subEl.innerHTML = `<span style="color:var(--color-error);">Sin acceso a ventas</span>`;
        return;
    }

    valorEl.textContent = formatMoneda(total);
    subEl.innerHTML = conteo === 1
        ? `<strong>1</strong> venta realizada este mes`
        : `<strong>${conteo}</strong> ventas realizadas este mes`;
}

/**
 * Renderizar métrica de inventario total
 */
function renderStatInventario(unidades, referencias, stockBajoCount, error = null) {
    const valorEl = document.getElementById('stat-inventario-valor');
    const subEl = document.getElementById('stat-inventario-sub');

    if (!valorEl || !subEl) return;

    if (error) {
        valorEl.textContent = '—';
        subEl.innerHTML = `<span style="color:var(--color-error);">Error al cargar inventario</span>`;
        return;
    }

    valorEl.textContent = `${unidades.toLocaleString('es-CO')} u.`;

    const pillClass = stockBajoCount > 0 ? 'dash-pill-alerta' : 'dash-pill-ok';
    const pillIcon = stockBajoCount > 0 ? '⚠️' : '✅';
    const pillText = stockBajoCount > 0
        ? `${stockBajoCount} con stock bajo (< 5)`
        : `Niveles óptimos (< 5: 0)`;

    subEl.innerHTML = `
        <span>${referencias} refs</span>
        <span style="color:var(--color-border-light);">•</span>
        <span class="${pillClass}">${pillIcon} ${pillText}</span>
    `;
}

/**
 * Renderizar métrica de producción activa
 */
function renderStatProduccion(lotes, piezas, error = null) {
    const valorEl = document.getElementById('stat-produccion-valor');
    const subEl = document.getElementById('stat-produccion-sub');

    if (!valorEl || !subEl) return;

    if (error) {
        valorEl.textContent = '—';
        subEl.innerHTML = `<span style="color:var(--color-text-muted);">Sin datos de taller</span>`;
        return;
    }

    valorEl.textContent = lotes === 1 ? '1 lote' : `${lotes} lotes`;
    subEl.innerHTML = piezas === 1
        ? `<strong>1</strong> pieza en confección activa`
        : `<strong>${piezas}</strong> piezas en confección artesanal`;
}

/**
 * Renderizar métrica de cuentas pendientes por cobrar
 */
function renderStatCuentas(total, cantidad, error = null) {
    const valorEl = document.getElementById('stat-cuentas-valor');
    const subEl = document.getElementById('stat-cuentas-sub');

    if (!valorEl || !subEl) return;

    if (error) {
        valorEl.textContent = '—';
        subEl.innerHTML = `<span style="color:var(--color-text-muted);">Sin cuentas registradas</span>`;
        return;
    }

    valorEl.textContent = formatMoneda(total);
    subEl.innerHTML = cantidad === 1
        ? `<strong>1</strong> cuenta pendiente por cobrar`
        : `<strong>${cantidad}</strong> cuentas pendientes por recaudar`;
}

// ============================================================
// Renderizadores de Paneles Inferiores
// ============================================================

/**
 * Renderizar tabla de alertas de stock bajo (stock <= 3)
 * @param {Array} productosCriticos
 * @param {any} error
 */
function renderAlertasStockBajo(productosCriticos, error = null) {
    const contenedor = document.getElementById('contenedor-alertas-stock');
    const badgeContador = document.getElementById('dash-badge-criticos');

    if (!contenedor) return;

    if (error) {
        contenedor.innerHTML = `
            <div class="dash-empty-box">
                <div class="dash-empty-icon">⚠️</div>
                <p class="dash-empty-title">Error al consultar alertas</p>
                <p class="dash-empty-desc">${escapeHTML(error.message || 'No se pudo conectar a la base de datos.')}</p>
            </div>
        `;
        if (badgeContador) badgeContador.textContent = 'Error';
        return;
    }

    // Actualizar badge del encabezado
    if (badgeContador) {
        const count = productosCriticos.length;
        badgeContador.textContent = count === 1 ? '1 Crítico' : `${count} Críticos`;
        if (count === 0) {
            badgeContador.className = 'badge badge-disponible';
            badgeContador.textContent = 'Stock Óptimo';
        } else {
            badgeContador.className = 'badge badge-agotado';
        }
    }

    // Estado vacío: sin alertas
    if (productosCriticos.length === 0) {
        contenedor.innerHTML = `
            <div class="dash-empty-box">
                <div class="dash-empty-icon">🛡️</div>
                <p class="dash-empty-title">¡Inventario en estado óptimo!</p>
                <p class="dash-empty-desc">Todos los productos cuentan con más de 3 unidades disponibles en bodega. No hay alertas críticas por atender.</p>
            </div>
        `;
        return;
    }

    // Tabla con alertas de stock
    let html = `
        <div class="tabla-contenedor">
            <table>
                <thead>
                    <tr>
                        <th>Producto</th>
                        <th>Stock</th>
                        <th>Precio</th>
                        <th style="text-align: right;">Acciones</th>
                    </tr>
                </thead>
                <tbody>
    `;

    productosCriticos.forEach(prod => {
        const stockNum = Number(prod.stock) || 0;
        const nombreCat = prod.categorias?.nombre || 'General';
        const iconoFallback = obtenerIconoCategoria(nombreCat);

        const stockBadge = stockNum === 0
            ? `<span class="stock-badge-critico" title="Producto completamente agotado">🚨 Agotado</span>`
            : `<span class="stock-badge-bajo" title="Stock por debajo de 3 unidades">⚠️ ${stockNum} u.</span>`;

        const thumbHTML = prod.imagen_url
            ? `<img src="${escapeHTML(prod.imagen_url)}" alt="${escapeHTML(prod.nombre)}" class="producto-thumb-mini" onerror="this.outerHTML='<div class=\\'producto-thumb-mini\\'>${iconoFallback}</div>'">`
            : `<div class="producto-thumb-mini">${iconoFallback}</div>`;

        html += `
            <tr>
                <td>
                    <div class="producto-celda-compacta">
                        ${thumbHTML}
                        <div class="producto-meta-compacta">
                            <span class="producto-nombre-alerta" title="${escapeHTML(prod.nombre)}">${escapeHTML(prod.nombre)}</span>
                            <span class="producto-cat-alerta">${escapeHTML(nombreCat)}</span>
                        </div>
                    </div>
                </td>
                <td>${stockBadge}</td>
                <td>
                    <strong style="color: var(--color-text); font-size: 0.88rem;">${formatMoneda(prod.precio)}</strong>
                </td>
                <td style="text-align: right;">
                    <div class="acciones-alerta-grupo" style="justify-content: flex-end;">
                        <button class="btn btn-secondary btn-sm btn-accion-reabastecer"
                                data-id="${prod.id}"
                                data-nombre="${escapeHTML(prod.nombre)}"
                                data-stock="${stockNum}"
                                title="Ingresar unidades a bodega">
                            ➕ Reabastecer
                        </button>
                        <button class="btn btn-primary btn-sm btn-accion-ordenar"
                                data-id="${prod.id}"
                                data-nombre="${escapeHTML(prod.nombre)}"
                                title="Ordenar fabricación artesanal">
                            🔨 Producir
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    contenedor.innerHTML = html;

    // Vincular botones de acciones de la tabla
    contenedor.querySelectorAll('.btn-accion-reabastecer').forEach(btn => {
        btn.onclick = () => {
            const id = btn.getAttribute('data-id');
            const nombre = btn.getAttribute('data-nombre');
            const stock = parseInt(btn.getAttribute('data-stock'), 10) || 0;
            abrirModalReabastecer(id, nombre, stock);
        };
    });

    contenedor.querySelectorAll('.btn-accion-ordenar').forEach(btn => {
        btn.onclick = () => {
            const id = btn.getAttribute('data-id');
            const nombre = btn.getAttribute('data-nombre');
            abrirModalOrdenarProduccion(id, nombre);
        };
    });
}

/**
 * Abrir y preparar modal de reabastecimiento
 */
function abrirModalReabastecer(productoId, nombreProducto, stockActual) {
    const modal = document.getElementById('modal-reabastecer');
    const inputId = document.getElementById('reabastecer-producto-id');
    const lblNombre = document.getElementById('reabastecer-producto-nombre');
    const lblStock = document.getElementById('reabastecer-stock-actual');
    const inputCantidad = document.getElementById('reabastecer-cantidad-input');
    const lblResultado = document.getElementById('reabastecer-stock-resultado');

    if (inputId) inputId.value = productoId;
    if (lblNombre) lblNombre.textContent = nombreProducto;
    if (lblStock) lblStock.textContent = stockActual;
    if (inputCantidad) {
        inputCantidad.value = 10;
        inputCantidad.focus();
    }
    if (lblResultado) {
        lblResultado.textContent = `${stockActual + 10} unidades`;
    }

    if (modal) modal.style.display = 'flex';
}

/**
 * Abrir y preparar modal de orden de producción
 */
function abrirModalOrdenarProduccion(productoId, nombreProducto) {
    const modal = document.getElementById('modal-ordenar-produccion');
    const inputId = document.getElementById('orden-producto-id');
    const lblNombre = document.getElementById('orden-producto-nombre');
    const inputCantidad = document.getElementById('orden-cantidad-input');
    const inputNotas = document.getElementById('orden-notas-input');
    const selectTrabajador = document.getElementById('orden-trabajador-select');

    if (inputId) inputId.value = productoId;
    if (lblNombre) lblNombre.textContent = nombreProducto;
    if (inputCantidad) inputCantidad.value = 5;
    if (inputNotas) inputNotas.value = '';

    // Si solo hay un trabajador o el usuario actual es artesano, preseleccionar
    const usuarioActual = getUsuario();
    if (selectTrabajador && usuarioActual) {
        const existeOpcion = Array.from(selectTrabajador.options).some(o => o.value === usuarioActual.id);
        if (existeOpcion) {
            selectTrabajador.value = usuarioActual.id;
        }
    }

    if (modal) modal.style.display = 'flex';
}

/**
 * Renderizar lista de ventas recientes
 * @param {Array} ventas
 * @param {any} error
 */
function renderActividadVentas(ventas, error = null) {
    const contenedor = document.getElementById('contenedor-actividad-ventas');
    if (!contenedor) return;

    if (error) {
        contenedor.innerHTML = `
            <div class="dash-empty-box">
                <div class="dash-empty-icon">⚠️</div>
                <p class="dash-empty-title">Acceso restringido</p>
                <p class="dash-empty-desc">Las ventas solo están visibles para usuarios administradores y vendedores.</p>
            </div>
        `;
        return;
    }

    if (!ventas || ventas.length === 0) {
        contenedor.innerHTML = `
            <div class="dash-empty-box">
                <div class="dash-empty-icon">🛒</div>
                <p class="dash-empty-title">Sin ventas recientes</p>
                <p class="dash-empty-desc">Aún no se han registrado órdenes de venta en la plataforma.</p>
            </div>
        `;
        return;
    }

    let html = '<div class="actividad-lista">';
    ventas.forEach(v => {
        const detalleMetodo = obtenerDetalleMetodoPago(v.metodo_pago);
        const nombreCliente = v.clientes?.nombre || 'Cliente Ocasional';
        const vendedorNombre = v.usuarios?.nombre ? ` • Por ${v.usuarios.nombre.split(' ')[0]}` : '';
        const fechaTexto = formatFecha(v.fecha);

        let badgeEstadoClass = 'badge-pendiente';
        if (v.estado === 'pagada') badgeEstadoClass = 'badge-pagada';
        if (v.estado === 'cancelada') badgeEstadoClass = 'badge-cancelada';

        html += `
            <div class="actividad-card">
                <div class="actividad-lado-izq">
                    <div class="actividad-avatar" title="${detalleMetodo.label}">
                        ${detalleMetodo.icono}
                    </div>
                    <div class="actividad-info">
                        <span class="actividad-titulo" title="${escapeHTML(nombreCliente)}">
                            ${escapeHTML(nombreCliente)}
                        </span>
                        <span class="actividad-sub">
                            ${detalleMetodo.label}${vendedorNombre}
                        </span>
                    </div>
                </div>
                <div class="actividad-lado-der">
                    <span class="actividad-monto">${formatMoneda(v.total)}</span>
                    <span class="badge ${badgeEstadoClass}" style="font-size: 0.68rem; padding: 1px 6px;">${v.estado}</span>
                    <span class="actividad-tiempo">${fechaTexto}</span>
                </div>
            </div>
        `;
    });
    html += '</div>';

    contenedor.innerHTML = html;
}

/**
 * Renderizar lista de producción artesanal reciente
 * @param {Array} producciones
 * @param {any} error
 */
function renderActividadProduccion(producciones, error = null) {
    const contenedor = document.getElementById('contenedor-actividad-produccion');
    if (!contenedor) return;

    if (error) {
        contenedor.innerHTML = `
            <div class="dash-empty-box">
                <div class="dash-empty-icon">⚠️</div>
                <p class="dash-empty-title">Sin acceso a producción</p>
                <p class="dash-empty-desc">No se tienen permisos suficientes para consultar el taller.</p>
            </div>
        `;
        return;
    }

    if (!producciones || producciones.length === 0) {
        contenedor.innerHTML = `
            <div class="dash-empty-box">
                <div class="dash-empty-icon">🔨</div>
                <p class="dash-empty-title">Sin actividad de confección</p>
                <p class="dash-empty-desc">No se han registrado lotes de confección recientemente.</p>
            </div>
        `;
        return;
    }

    let html = '<div class="actividad-lista">';
    producciones.forEach(p => {
        const prodNombre = p.productos?.nombre || 'Artículo artesanal';
        const trabajadorNombre = p.usuarios?.nombre || 'Artesano del taller';
        const fechaRef = p.created_at || p.fecha_inicio;
        const fechaTexto = formatFecha(fechaRef);
        const cantidadPiezas = p.cantidad === 1 ? '1 unidad' : `${p.cantidad} unidades`;

        let badgeEstadoClass = 'badge-en_proceso';
        let textoEstado = 'En proceso';
        if (p.estado === 'terminado') {
            badgeEstadoClass = 'badge-terminado';
            textoEstado = 'Completado';
        } else if (p.estado === 'rechazado') {
            badgeEstadoClass = 'badge-rechazado';
            textoEstado = 'Rechazado';
        }

        html += `
            <div class="actividad-card">
                <div class="actividad-lado-izq">
                    <div class="actividad-avatar" title="Lote de taller">
                        🔨
                    </div>
                    <div class="actividad-info">
                        <span class="actividad-titulo" title="${escapeHTML(prodNombre)}">
                            ${escapeHTML(prodNombre)}
                        </span>
                        <span class="actividad-sub">
                            Artesano: ${escapeHTML(trabajadorNombre)} • <strong>${cantidadPiezas}</strong>
                        </span>
                    </div>
                </div>
                <div class="actividad-lado-der">
                    <span class="badge ${badgeEstadoClass}" style="font-size: 0.68rem; padding: 1px 6px;">
                        ${textoEstado}
                    </span>
                    <span class="actividad-tiempo">${fechaTexto}</span>
                </div>
            </div>
        `;
    });
    html += '</div>';

    contenedor.innerHTML = html;
}

// ============================================================
// Realtime Updates
// ============================================================

/**
 * Escuchar cambios en tiempo real en las tablas clave para mantener el tablero sincronizado
 */
function configurarRealtime() {
    try {
        canalRealtime = db.channel('dashboard-cambios-tiempo-real')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas' }, () => {
                cargarDatosDashboard();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, () => {
                cargarDatosDashboard();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'registros_produccion' }, () => {
                cargarDatosDashboard();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'cuentas_cobro' }, () => {
                cargarDatosDashboard();
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    // Suscripción establecida correctamente
                }
            });
    } catch (err) {
        console.warn('No se pudo establecer suscripción Realtime en dashboard:', err);
    }
}
