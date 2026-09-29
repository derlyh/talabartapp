/**
 * ============================================================
 * Módulo: Directorio de Clientes
 * Archivo: js/modules/clientes/clientes.js
 * TalabartApp — Sistema de Gestión
 * ============================================================
 */

import { db } from '../../supabase-client.js';
import { APP_CONFIG } from '../../config.js';
import {
    formatMoneda,
    mostrarNotificacion,
    confirmar,
    generarPaginacion,
    debounce
} from '../../utils.js';

// ============================================================
// Estado del módulo
// ============================================================
const estado = {
    paginaActual: 1,
    itemsPorPagina: APP_CONFIG.itemsPorPagina || 10,
    busqueda: '',
    totalRegistros: 0,
    clientes: [],
    cargando: false
};

// ============================================================
// Funciones auxiliares
// ============================================================

/**
 * Escapar caracteres HTML para prevenir inyección XSS
 */
function escapeHtml(texto) {
    if (texto === null || texto === undefined) return '';
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Obtener la inicial para el avatar de cliente
 */
function obtenerInicial(nombre) {
    if (!nombre) return '?';
    return nombre.trim().charAt(0).toUpperCase();
}

// ============================================================
// Carga de datos
// ============================================================

/**
 * Cargar lista de clientes con paginación y búsqueda
 */
async function cargarClientes() {
    estado.cargando = true;
    renderCargando();

    try {
        const desde = (estado.paginaActual - 1) * estado.itemsPorPagina;
        const hasta = desde + estado.itemsPorPagina - 1;

        // Intentar consultar clientes con la relación de ventas para obtener compras
        let query = db
            .from('clientes')
            .select('id, nombre, telefono, email, direccion, notas, created_at, ventas(id, total, estado)', { count: 'exact' });

        if (estado.busqueda) {
            const termino = estado.busqueda.trim();
            // Buscar por nombre, teléfono o email
            query = query.or(`nombre.ilike.%${termino}%,telefono.ilike.%${termino}%,email.ilike.%${termino}%`);
        }

        let { data, count, error } = await query
            .order('nombre', { ascending: true })
            .range(desde, hasta);

        // Fallback defensivo si la relación con ventas falla por RLS o caché
        if (error) {
            console.warn('Consulta con relación a ventas falló, reintentando consulta directa:', error.message);

            let querySimple = db
                .from('clientes')
                .select('id, nombre, telefono, email, direccion, notas, created_at', { count: 'exact' });

            if (estado.busqueda) {
                const termino = estado.busqueda.trim();
                querySimple = querySimple.or(`nombre.ilike.%${termino}%,telefono.ilike.%${termino}%,email.ilike.%${termino}%`);
            }

            const fallbackRes = await querySimple
                .order('nombre', { ascending: true })
                .range(desde, hasta);

            if (fallbackRes.error) throw fallbackRes.error;

            data = fallbackRes.data;
            count = fallbackRes.count;
        }

        estado.clientes = data || [];
        estado.totalRegistros = count || 0;

        renderTabla();
        renderPaginacion();
        actualizarContador();
    } catch (error) {
        console.error('Error al cargar clientes:', error);
        mostrarNotificacion('Error al cargar la lista de clientes: ' + (error.message || error), 'error');
        renderError('No se pudo cargar la información de los clientes.');
    } finally {
        estado.cargando = false;
    }
}

// ============================================================
// Renderizado de UI
// ============================================================

/**
 * Renderizar estado de carga en la tabla
 */
function renderCargando() {
    const tbody = document.getElementById('tabla-clientes-body');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="6">
                <div class="loading-contenedor">
                    <div class="spinner"></div>
                    <p>Cargando clientes...</p>
                </div>
            </td>
        </tr>
    `;
}

/**
 * Renderizar mensaje de error en la tabla
 */
function renderError(mensaje) {
    const tbody = document.getElementById('tabla-clientes-body');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="6">
                <div class="empty-state">
                    <div class="empty-icono">⚠️</div>
                    <p style="color: var(--color-error); font-weight: 500;">${escapeHtml(mensaje)}</p>
                    <button class="btn btn-secondary btn-sm" id="btn-reintentar-clientes" style="margin-top: var(--space-sm);">
                        🔄 Reintentar
                    </button>
                </div>
            </td>
        </tr>
    `;

    const btnReintentar = document.getElementById('btn-reintentar-clientes');
    if (btnReintentar) {
        btnReintentar.addEventListener('click', cargarClientes);
    }
}

/**
 * Renderizar las filas de la tabla de clientes
 */
function renderTabla() {
    const tbody = document.getElementById('tabla-clientes-body');
    if (!tbody) return;

    if (estado.clientes.length === 0) {
        const esBusqueda = Boolean(estado.busqueda);
        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="empty-state">
                        <div class="empty-icono">👥</div>
                        <p style="font-size: 1.1rem; font-weight: 600; margin-bottom: var(--space-xs);">
                            ${esBusqueda ? 'Sin coincidencias' : 'No hay clientes registrados'}
                        </p>
                        <p class="text-muted" style="font-size: 0.85rem; margin-bottom: var(--space-md);">
                            ${esBusqueda
                                ? `No se encontraron clientes para "${escapeHtml(estado.busqueda)}"`
                                : 'Comienza registrando tu primer cliente para gestionar sus pedidos y compras.'}
                        </p>
                        ${!esBusqueda ? `
                            <button type="button" class="btn btn-primary btn-sm" id="btn-empty-nuevo-cliente">
                                ➕ Registrar primer cliente
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;

        const btnEmptyNuevo = document.getElementById('btn-empty-nuevo-cliente');
        if (btnEmptyNuevo) {
            btnEmptyNuevo.addEventListener('click', abrirModalNuevo);
        }
        return;
    }

    tbody.innerHTML = estado.clientes.map(cliente => {
        const inicial = obtenerInicial(cliente.nombre);

        // Teléfono con enlace directo
        const telefonoHtml = cliente.telefono
            ? `<a href="tel:${escapeHtml(cliente.telefono)}" style="color: var(--color-text); text-decoration: none; display: inline-flex; align-items: center; gap: 4px;" title="Llamar">
                   📞 ${escapeHtml(cliente.telefono)}
               </a>`
            : '<span class="text-muted">—</span>';

        // Correo con enlace mailto
        const correoHtml = cliente.email
            ? `<a href="mailto:${escapeHtml(cliente.email)}" style="color: var(--color-secondary); text-decoration: none; display: inline-flex; align-items: center; gap: 4px;" title="Enviar correo">
                   ✉️ ${escapeHtml(cliente.email)}
               </a>`
            : '<span class="text-muted">—</span>';

        // Dirección
        const direccionHtml = cliente.direccion
            ? `<span title="${escapeHtml(cliente.direccion)}">📍 ${escapeHtml(cliente.direccion)}</span>`
            : '<span class="text-muted">—</span>';

        // Cálculo de Total de Compras y Notas
        const ventas = Array.isArray(cliente.ventas) ? cliente.ventas : [];
        const ventasValidas = ventas.filter(v => v.estado !== 'cancelada');
        const cantCompras = ventasValidas.length;
        const totalCompras = ventasValidas.reduce((sum, v) => sum + (Number(v.total) || 0), 0);

        const totalComprasBadge = cantCompras > 0
            ? `<div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                   <strong style="color: var(--color-text);">${formatMoneda(totalCompras)}</strong>
                   <span class="badge badge-pagada" style="font-size: 0.7rem;">
                       ${cantCompras} ${cantCompras === 1 ? 'compra' : 'compras'}
                   </span>
               </div>`
            : `<span class="text-muted" style="font-size: 0.85rem;">Sin compras aún</span>`;

        const notasHtml = cliente.notas
            ? `<div class="text-muted" style="font-size: 0.78rem; margin-top: 4px; max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(cliente.notas)}">
                   📝 ${escapeHtml(cliente.notas)}
               </div>`
            : '';

        return `
            <tr data-cliente-id="${cliente.id}">
                <td>
                    <div style="display: flex; align-items: center; gap: var(--space-sm);">
                        <div style="width: 34px; height: 34px; border-radius: var(--radius-full); background: var(--color-surface-3); color: var(--color-secondary); display: flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: 700; flex-shrink: 0; border: 1px solid var(--color-border);">
                            ${inicial}
                        </div>
                        <div style="font-weight: 600; color: var(--color-text);">
                            ${escapeHtml(cliente.nombre)}
                        </div>
                    </div>
                </td>
                <td>${telefonoHtml}</td>
                <td>${correoHtml}</td>
                <td>${direccionHtml}</td>
                <td>
                    ${totalComprasBadge}
                    ${notasHtml}
                </td>
                <td style="text-align: right;">
                    <div class="btn-group" style="justify-content: flex-end;">
                        <button type="button" class="btn btn-sm btn-secondary btn-editar" data-id="${cliente.id}" title="Editar cliente">
                            ✏️ Editar
                        </button>
                        <button type="button" class="btn btn-sm btn-danger btn-eliminar" data-id="${cliente.id}" title="Eliminar cliente">
                            🗑️ Eliminar
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Renderizar controles de paginación
 */
function renderPaginacion() {
    const contenedor = document.getElementById('paginacion-clientes');
    if (!contenedor) return;

    contenedor.innerHTML = '';
    const totalPaginas = Math.ceil(estado.totalRegistros / estado.itemsPorPagina) || 1;

    if (totalPaginas > 1) {
        const paginacionEl = generarPaginacion(estado.paginaActual, totalPaginas, (nuevaPagina) => {
            estado.paginaActual = nuevaPagina;
            cargarClientes();
        });

        if (paginacionEl) {
            contenedor.appendChild(paginacionEl);
        }
    }
}

/**
 * Actualizar etiqueta con contador de resultados
 */
function actualizarContador() {
    const contador = document.getElementById('contador-clientes');
    if (!contador) return;

    if (estado.totalRegistros === 0) {
        contador.textContent = '0 clientes';
        return;
    }

    const inicio = (estado.paginaActual - 1) * estado.itemsPorPagina + 1;
    const fin = Math.min(estado.paginaActual * estado.itemsPorPagina, estado.totalRegistros);
    contador.textContent = `Mostrando ${inicio}–${fin} de ${estado.totalRegistros} cliente${estado.totalRegistros === 1 ? '' : 's'}`;
}

// ============================================================
// Gestión del Modal
// ============================================================

/**
 * Abrir modal para crear nuevo cliente
 */
function abrirModalNuevo() {
    const modal = document.getElementById('modal-cliente');
    const form = document.getElementById('form-cliente');
    const titulo = document.getElementById('modal-cliente-titulo');
    const btnGuardar = document.getElementById('btn-guardar-cliente');

    if (!modal || !form) return;

    form.reset();
    document.getElementById('cliente-id').value = '';

    if (titulo) titulo.textContent = '➕ Nuevo Cliente';
    if (btnGuardar) {
        btnGuardar.disabled = false;
        btnGuardar.textContent = '💾 Guardar Cliente';
    }

    modal.classList.remove('hidden');

    setTimeout(() => {
        const inputNombre = document.getElementById('cliente-nombre');
        if (inputNombre) inputNombre.focus();
    }, 100);
}

/**
 * Abrir modal para editar cliente existente
 */
function abrirModalEditar(cliente) {
    const modal = document.getElementById('modal-cliente');
    const form = document.getElementById('form-cliente');
    const titulo = document.getElementById('modal-cliente-titulo');
    const btnGuardar = document.getElementById('btn-guardar-cliente');

    if (!modal || !form || !cliente) return;

    form.reset();

    document.getElementById('cliente-id').value = cliente.id || '';
    document.getElementById('cliente-nombre').value = cliente.nombre || '';
    document.getElementById('cliente-telefono').value = cliente.telefono || '';
    document.getElementById('cliente-email').value = cliente.email || '';
    document.getElementById('cliente-direccion').value = cliente.direccion || '';
    document.getElementById('cliente-notas').value = cliente.notas || '';

    if (titulo) titulo.textContent = '✏️ Editar Cliente';
    if (btnGuardar) {
        btnGuardar.disabled = false;
        btnGuardar.textContent = '💾 Actualizar Cliente';
    }

    modal.classList.remove('hidden');

    setTimeout(() => {
        const inputNombre = document.getElementById('cliente-nombre');
        if (inputNombre) inputNombre.focus();
    }, 100);
}

/**
 * Cerrar modal de cliente
 */
function cerrarModal() {
    const modal = document.getElementById('modal-cliente');
    const form = document.getElementById('form-cliente');

    if (modal) modal.classList.add('hidden');
    if (form) form.reset();
}

// ============================================================
// Guardar y Eliminar
// ============================================================

/**
 * Guardar cliente (Creación o Actualización)
 */
async function guardarCliente(e) {
    e.preventDefault();

    const id = document.getElementById('cliente-id').value.trim();
    const nombre = document.getElementById('cliente-nombre').value.trim();
    const telefono = document.getElementById('cliente-telefono').value.trim() || null;
    const email = document.getElementById('cliente-email').value.trim() || null;
    const direccion = document.getElementById('cliente-direccion').value.trim() || null;
    const notas = document.getElementById('cliente-notas').value.trim() || null;

    // Validación: nombre requerido
    if (!nombre) {
        mostrarNotificacion('El nombre del cliente es obligatorio.', 'warning');
        document.getElementById('cliente-nombre').focus();
        return;
    }

    // Validación: email válido si fue ingresado
    if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            mostrarNotificacion('Por favor ingresa un correo electrónico válido.', 'warning');
            document.getElementById('cliente-email').focus();
            return;
        }
    }

    const btnGuardar = document.getElementById('btn-guardar-cliente');
    const textoOriginal = btnGuardar ? btnGuardar.textContent : '';

    if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.innerHTML = '<span class="spinner"></span> Guardando...';
    }

    try {
        const payload = {
            nombre,
            telefono,
            email,
            direccion,
            notas
        };

        if (id) {
            // Actualizar cliente existente
            const { error } = await db
                .from('clientes')
                .update(payload)
                .eq('id', id);

            if (error) throw error;
            mostrarNotificacion('Cliente actualizado exitosamente.', 'success');
        } else {
            // Crear nuevo cliente
            const { error } = await db
                .from('clientes')
                .insert([payload]);

            if (error) throw error;
            mostrarNotificacion('Cliente registrado exitosamente.', 'success');
        }

        cerrarModal();
        await cargarClientes();
    } catch (error) {
        console.error('Error al guardar cliente:', error);
        mostrarNotificacion('Error al guardar cliente: ' + (error.message || error), 'error');
    } finally {
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.textContent = textoOriginal;
        }
    }
}

/**
 * Eliminar cliente previa confirmación
 */
async function eliminarCliente(id) {
    const cliente = estado.clientes.find(c => c.id === id);
    const nombre = cliente ? cliente.nombre : 'este cliente';

    const confirmado = await confirmar(
        'Eliminar Cliente',
        `¿Estás seguro de que deseas eliminar a "${nombre}"? Esta acción no se puede deshacer.`
    );

    if (!confirmado) return;

    try {
        const { error } = await db
            .from('clientes')
            .delete()
            .eq('id', id);

        if (error) {
            // Manejar posibles restricciones de clave foránea
            if (error.code === '23503' || error.message?.includes('foreign key')) {
                mostrarNotificacion('No se puede eliminar el cliente porque tiene registros o compras vinculadas.', 'error');
            } else {
                mostrarNotificacion('Error al eliminar cliente: ' + (error.message || error), 'error');
            }
            return;
        }

        mostrarNotificacion('Cliente eliminado exitosamente.', 'success');

        // Si se eliminó el único registro de una página superior a la primera, retroceder
        if (estado.clientes.length === 1 && estado.paginaActual > 1) {
            estado.paginaActual--;
        }

        await cargarClientes();
    } catch (error) {
        console.error('Error al eliminar cliente:', error);
        mostrarNotificacion('Error al eliminar cliente: ' + (error.message || error), 'error');
    }
}

// ============================================================
// Inicialización del módulo
// ============================================================

/**
 * Función principal exportada para inicializar el módulo
 */
export function init() {
    // 1. Botón Nuevo Cliente
    const btnNuevo = document.getElementById('btn-nuevo-cliente');
    if (btnNuevo) {
        btnNuevo.addEventListener('click', abrirModalNuevo);
    }

    // 2. Campo de búsqueda con debounce
    const inputBuscar = document.getElementById('input-buscar-cliente');
    const btnLimpiar = document.getElementById('btn-limpiar-busqueda');

    if (inputBuscar) {
        inputBuscar.addEventListener('input', debounce((e) => {
            estado.busqueda = e.target.value.trim();
            estado.paginaActual = 1;

            if (btnLimpiar) {
                btnLimpiar.style.display = estado.busqueda ? 'inline-flex' : 'none';
            }

            cargarClientes();
        }, 350));
    }

    if (btnLimpiar) {
        btnLimpiar.addEventListener('click', () => {
            if (inputBuscar) {
                inputBuscar.value = '';
                inputBuscar.focus();
            }
            estado.busqueda = '';
            estado.paginaActual = 1;
            btnLimpiar.style.display = 'none';
            cargarClientes();
        });
    }

    // 3. Delegación de eventos en la tabla para botones Editar y Eliminar
    const tbody = document.getElementById('tabla-clientes-body');
    if (tbody) {
        tbody.addEventListener('click', (e) => {
            const btnEditar = e.target.closest('.btn-editar');
            if (btnEditar) {
                const id = btnEditar.getAttribute('data-id');
                const cliente = estado.clientes.find(c => c.id === id);
                if (cliente) {
                    abrirModalEditar(cliente);
                }
                return;
            }

            const btnEliminar = e.target.closest('.btn-eliminar');
            if (btnEliminar) {
                const id = btnEliminar.getAttribute('data-id');
                if (id) {
                    eliminarCliente(id);
                }
            }
        });
    }

    // 4. Formulario de cliente (submit)
    const formCliente = document.getElementById('form-cliente');
    if (formCliente) {
        formCliente.addEventListener('submit', guardarCliente);
    }

    // 5. Botones para cerrar modal
    const btnCerrarModal = document.getElementById('btn-cerrar-modal');
    if (btnCerrarModal) {
        btnCerrarModal.addEventListener('click', cerrarModal);
    }

    const btnCancelarModal = document.getElementById('btn-cancelar-modal');
    if (btnCancelarModal) {
        btnCancelarModal.addEventListener('click', cerrarModal);
    }

    // 6. Cerrar modal al hacer clic en el backdrop o presionar Escape
    const modalCliente = document.getElementById('modal-cliente');
    if (modalCliente) {
        modalCliente.addEventListener('click', (e) => {
            if (e.target === modalCliente) {
                cerrarModal();
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('modal-cliente');
            if (modal && !modal.classList.contains('hidden')) {
                cerrarModal();
            }
        }
    });

    // 7. Carga inicial de datos
    cargarClientes();
}
