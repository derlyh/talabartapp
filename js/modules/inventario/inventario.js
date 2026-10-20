import { db } from '../../supabase-client.js';
import { getRol } from '../../auth.js';
import {
    mostrarNotificacion,
    confirmar,
    generarPaginacion,
    formatMoneda,
    debounce
} from '../../utils.js';

// ============================================================
// Estado del módulo
// ============================================================
let paginaActual = 1;
let totalPaginas = 1;
const ELEMENTOS_POR_PAGINA = 10;

const filtros = {
    busqueda: '',
    categoria: '',
    estado: '',
    origen: ''
};

let categoriasList = [];
let productosList = [];
let canalRealtime = null;

/**
 * Función de escape para evitar inyecciones HTML en strings dinámicos
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

// ============================================================
// Inicialización del Módulo
// ============================================================
export async function init() {
    // 1. Limpieza de suscripciones Realtime previas
    if (canalRealtime) {
        try {
            await db.removeChannel(canalRealtime);
        } catch (err) {
            console.warn('Error al desuscribir canal realtime previo:', err);
        }
        canalRealtime = null;
    }

    // 2. Reset de estado
    paginaActual = 1;
    totalPaginas = 1;
    filtros.busqueda = '';
    filtros.categoria = '';
    filtros.estado = '';
    filtros.origen = '';
    productosList = [];
    categoriasList = [];

    // 3. Configurar UI según rol
    configurarSeguridadRol();

    // 4. Configurar escuchadores de eventos
    configurarEventosFiltros();
    configurarEventosModales();
    configurarEventosFormularios();
    configurarEventosTablas();

    // 5. Cargar datos iniciales
    await cargarCategorias();
    await cargarProductos();

    // 6. Suscribir a cambios en tiempo real en la tabla productos
    canalRealtime = db.channel('productos-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, () => {
            cargarProductos();
        })
        .subscribe();
}

/**
 * Aplica restricciones de permisos de acuerdo al rol del usuario
 */
function configurarSeguridadRol() {
    const esAdmin = getRol() === 'admin';

    // Botón "Nuevo Producto"
    const btnNuevoProducto = document.getElementById('btn-nuevo-producto');
    if (btnNuevoProducto) {
        if (!esAdmin) {
            btnNuevoProducto.disabled = true;
            btnNuevoProducto.title = 'Solo administradores pueden crear productos';
        } else {
            btnNuevoProducto.disabled = false;
            btnNuevoProducto.removeAttribute('title');
        }
    }

    // Formulario de creación de categoría dentro del modal
    const formCategoria = document.getElementById('form-categoria');
    if (formCategoria) {
        const elementos = formCategoria.querySelectorAll('input, button');
        elementos.forEach(el => {
            el.disabled = !esAdmin;
            if (!esAdmin) {
                el.title = 'Solo administradores pueden crear categorías';
            } else {
                el.removeAttribute('title');
            }
        });
    }
}

// ============================================================
// Gestión de Categorías
// ============================================================

/**
 * Carga las categorías desde Supabase y refresca dropdowns y modal
 */
async function cargarCategorias() {
    try {
        const { data, error } = await db
            .from('categorias')
            .select('*')
            .order('nombre', { ascending: true });

        if (error) throw error;

        categoriasList = data || [];
        renderizarSelectsCategorias();
        renderizarTablaCategorias();
    } catch (err) {
        console.error('Error al cargar categorías:', err);
        mostrarNotificacion('Error al cargar categorías: ' + (err.message || err), 'error');
    }
}

/**
 * Renderiza las opciones de categorías en los elementos select
 */
function renderizarSelectsCategorias() {
    // Select de filtro principal
    const selectFiltro = document.getElementById('filtro-categoria');
    if (selectFiltro) {
        const valorPrevio = selectFiltro.value;
        selectFiltro.innerHTML = '<option value="">Todas las categorías</option>';
        categoriasList.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.textContent = cat.nombre;
            selectFiltro.appendChild(opt);
        });
        // Restaurar valor previo si aún existe
        if (categoriasList.some(c => c.id === valorPrevio)) {
            selectFiltro.value = valorPrevio;
        }
    }

    // Select en formulario de producto
    const selectProducto = document.getElementById('producto-categoria');
    if (selectProducto) {
        const valorPrevio = selectProducto.value;
        selectProducto.innerHTML = '<option value="">Sin categoría</option>';
        categoriasList.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.textContent = cat.nombre;
            selectProducto.appendChild(opt);
        });
        if (categoriasList.some(c => c.id === valorPrevio)) {
            selectProducto.value = valorPrevio;
        }
    }
}

/**
 * Renderiza la lista de categorías en la tabla del modal de gestión
 */
function renderizarTablaCategorias() {
    const tbody = document.getElementById('tabla-categorias-body');
    if (!tbody) return;

    if (categoriasList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="text-center text-muted" style="padding: var(--space-md);">
                    No hay categorías registradas.
                </td>
            </tr>
        `;
        return;
    }

    const esAdmin = getRol() === 'admin';

    tbody.innerHTML = categoriasList.map(cat => `
        <tr>
            <td><strong>${escapeHTML(cat.nombre)}</strong></td>
            <td><span class="text-muted">${escapeHTML(cat.descripcion || '—')}</span></td>
            <td class="text-right">
                <button type="button" 
                        class="btn btn-sm btn-danger btn-eliminar-cat" 
                        data-id="${cat.id}" 
                        data-nombre="${escapeHTML(cat.nombre)}"
                        ${!esAdmin ? 'disabled title="Solo administradores"' : 'title="Eliminar categoría"'}>
                    🗑️
                </button>
            </td>
        </tr>
    `).join('');
}

/**
 * Agrega una nueva categoría
 */
async function agregarCategoria(e) {
    e.preventDefault();

    if (getRol() !== 'admin') {
        mostrarNotificacion('Solo los administradores pueden crear categorías', 'error');
        return;
    }

    const inputNombre = document.getElementById('categoria-nombre');
    const inputDesc = document.getElementById('categoria-descripcion');
    const btnGuardar = document.getElementById('btn-guardar-categoria');

    const nombre = inputNombre.value.trim();
    const descripcion = inputDesc.value.trim() || null;

    if (!nombre) {
        mostrarNotificacion('El nombre de la categoría es obligatorio', 'warning');
        inputNombre.focus();
        return;
    }

    try {
        btnGuardar.disabled = true;
        btnGuardar.innerHTML = '<span class="spinner"></span> Guardando...';

        const { error } = await db
            .from('categorias')
            .insert([{ nombre, descripcion }]);

        if (error) {
            if (error.code === '23505') {
                throw new Error('Ya existe una categoría con el nombre "' + nombre + '"');
            }
            throw error;
        }

        mostrarNotificacion(`Categoría "${nombre}" creada con éxito`, 'success');
        inputNombre.value = '';
        inputDesc.value = '';

        await cargarCategorias();
    } catch (err) {
        console.error('Error al agregar categoría:', err);
        mostrarNotificacion(err.message || 'Error al agregar categoría', 'error');
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.innerHTML = '➕ Agregar';
    }
}

/**
 * Elimina una categoría tras confirmación
 */
async function eliminarCategoria(id, nombre) {
    if (getRol() !== 'admin') {
        mostrarNotificacion('Solo los administradores pueden eliminar categorías', 'error');
        return;
    }

    const confirmado = await confirmar(
        'Eliminar Categoría',
        `¿Estás seguro de eliminar la categoría "${nombre}"?\nLos productos vinculados no se eliminarán, pero quedarán sin categoría asignada.`
    );

    if (!confirmado) return;

    try {
        const { error } = await db
            .from('categorias')
            .delete()
            .eq('id', id);

        if (error) throw error;

        mostrarNotificacion(`Categoría "${nombre}" eliminada`, 'success');

        // Si el filtro actual era la categoría eliminada, resetearlo
        if (filtros.categoria === id) {
            filtros.categoria = '';
        }

        await cargarCategorias();
        await cargarProductos();
    } catch (err) {
        console.error('Error al eliminar categoría:', err);
        mostrarNotificacion('Error al eliminar categoría: ' + (err.message || err), 'error');
    }
}

// ============================================================
// Carga y Renderizado de Productos (Paginación y Filtros de Servidor)
// ============================================================

/**
 * Consulta la base de datos de productos aplicando filtros y paginación con .range()
 */
async function cargarProductos() {
    const tbody = document.getElementById('tabla-productos-body');
    if (!tbody) return;

    // Estado visual de carga
    tbody.innerHTML = `
        <tr>
            <td colspan="7">
                <div class="loading-contenedor">
                    <div class="spinner"></div>
                    <p>Cargando productos...</p>
                </div>
            </td>
        </tr>
    `;

    try {
        const desde = (paginaActual - 1) * ELEMENTOS_POR_PAGINA;
        const hasta = desde + ELEMENTOS_POR_PAGINA - 1;

        let query = db
            .from('productos')
            .select('*, categorias(id, nombre)', { count: 'exact' })
            .order('created_at', { ascending: false });

        // Filtro de búsqueda por texto (nombre o descripción)
        if (filtros.busqueda) {
            const busquedaLimpia = filtros.busqueda.trim().replace(/,/g, '');
            if (busquedaLimpia) {
                query = query.or(`nombre.ilike.%${busquedaLimpia}%,descripcion.ilike.%${busquedaLimpia}%`);
            }
        }

        // Filtro por categoría
        if (filtros.categoria) {
            query = query.eq('categoria_id', filtros.categoria);
        }

        // Filtro por estado
        if (filtros.estado) {
            query = query.eq('estado', filtros.estado);
        }

        // Filtro por origen
        if (filtros.origen) {
            query = query.eq('origen', filtros.origen);
        }

        // Rango de paginación
        query = query.range(desde, hasta);

        const { data, count, error } = await query;
        if (error) throw error;

        productosList = data || [];
        totalPaginas = count ? Math.ceil(count / ELEMENTOS_POR_PAGINA) : 1;

        // Ajuste en caso de que la página actual supere el total de páginas
        if (paginaActual > totalPaginas && totalPaginas > 0) {
            paginaActual = totalPaginas;
            return cargarProductos();
        }

        renderizarProductos();
        renderizarPaginacionInventario();
    } catch (err) {
        console.error('Error al cargar productos:', err);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-error" style="padding: var(--space-xl);">
                    ⚠️ Error al cargar productos: ${escapeHTML(err.message || 'Error de conexión')}
                </td>
            </tr>
        `;
    }
}

/**
 * Renderiza los productos en la tabla principal
 */
function renderizarProductos() {
    const tbody = document.getElementById('tabla-productos-body');
    if (!tbody) return;

    if (productosList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="empty-state">
                        <div class="empty-icono">📦</div>
                        <h3>No se encontraron productos</h3>
                        <p>No hay productos que coincidan con los criterios seleccionados.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    const esAdmin = getRol() === 'admin';

    tbody.innerHTML = productosList.map(prod => {
        // Formato de badge de origen
        const badgeOrigen = prod.origen === 'fabricado'
            ? '<span class="badge badge-fabricado">Fabricado</span>'
            : '<span class="badge badge-comprado">Comprado</span>';

        // Formato de badge de estado
        let badgeEstado = '';
        if (prod.estado === 'disponible') {
            badgeEstado = '<span class="badge badge-disponible">Disponible</span>';
        } else if (prod.estado === 'en_produccion') {
            badgeEstado = '<span class="badge badge-en_produccion">En Producción</span>';
        } else if (prod.estado === 'agotado') {
            badgeEstado = '<span class="badge badge-agotado">Agotado</span>';
        } else {
            badgeEstado = `<span class="badge">${escapeHTML(prod.estado)}</span>`;
        }

        // Nombre de categoría
        const categoriaNombre = prod.categorias?.nombre ||
            categoriasList.find(c => c.id === prod.categoria_id)?.nombre ||
            '—';

        // Vista previa de imagen o icono de cuero / talabartería
        let imagenHtml = '';
        if (prod.imagen_url) {
            imagenHtml = `
                <img src="${escapeHTML(prod.imagen_url)}" 
                     alt="${escapeHTML(prod.nombre)}" 
                     class="producto-thumb"
                     onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'producto-thumb\\'>👜</div>';">
            `;
        } else {
            imagenHtml = '<div class="producto-thumb">👜</div>';
        }

        // Resalte de stock
        let stockHtml = '';
        if (prod.stock === 0) {
            stockHtml = '<span class="stock-destacado-alerta">0 unid.</span>';
        } else if (prod.stock <= 3) {
            stockHtml = `<span class="stock-destacado-bajo">${prod.stock} unid.</span>`;
        } else {
            stockHtml = `<span>${prod.stock} unid.</span>`;
        }

        // Etiquetas de especialidad en cuero
        let tipoCuero = prod.tipo_cuero || '';
        let colorCuero = prod.color || '';
        if (!tipoCuero && prod.descripcion) {
            const mCuero = prod.descripcion.match(/\[Cuero:\s*([^\]]+)\]/);
            if (mCuero) tipoCuero = mCuero[1].trim();
        }
        if (!colorCuero && prod.descripcion) {
            const mColor = prod.descripcion.match(/\[Color:\s*([^\]]+)\]/);
            if (mColor) colorCuero = mColor[1].trim();
        }

        let tagsCueroHtml = '';
        if (tipoCuero || colorCuero) {
            tagsCueroHtml = `
                <div style="display:flex; gap:4px; margin-top:3px; flex-wrap:wrap;">
                    ${tipoCuero ? `<span class="badge" style="font-size:0.68rem; padding:1px 6px; background:rgba(184,115,51,0.15); color:var(--color-primary-light);">🐂 ${escapeHTML(tipoCuero)}</span>` : ''}
                    ${colorCuero ? `<span class="badge" style="font-size:0.68rem; padding:1px 6px; background:rgba(217,119,6,0.12); color:#d97706;">🎨 ${escapeHTML(colorCuero)}</span>` : ''}
                </div>
            `;
        }

        return `
            <tr>
                <td>
                    <div class="producto-celda">
                        <div>${imagenHtml}</div>
                        <div class="producto-info">
                            <span class="producto-nombre">${escapeHTML(prod.nombre)}</span>
                            <span class="producto-desc" title="${escapeHTML(prod.descripcion || '')}">
                                ${escapeHTML(prod.descripcion || 'Sin descripción')}
                            </span>
                            ${tagsCueroHtml}
                        </div>
                    </div>
                </td>
                <td><span class="text-muted">${escapeHTML(categoriaNombre)}</span></td>
                <td>${badgeOrigen}</td>
                <td><strong>${formatMoneda(prod.precio)}</strong></td>
                <td>${stockHtml}</td>
                <td>${badgeEstado}</td>
                <td class="text-right">
                    <div class="acciones-celda">
                        <button type="button" 
                                class="btn btn-sm btn-secondary btn-editar" 
                                data-id="${prod.id}" 
                                ${!esAdmin ? 'disabled title="Solo administradores pueden editar"' : 'title="Editar producto"'}>
                            ✏️
                        </button>
                        <button type="button" 
                                class="btn btn-sm btn-danger btn-eliminar" 
                                data-id="${prod.id}" 
                                ${!esAdmin ? 'disabled title="Solo administradores pueden eliminar"' : 'title="Eliminar producto"'}>
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Renderiza los controles de paginación del inventario
 */
function renderizarPaginacionInventario() {
    const contenedor = document.getElementById('paginacion-inventario');
    if (!contenedor) return;

    contenedor.innerHTML = '';

    const elemPaginacion = generarPaginacion(paginaActual, totalPaginas, (nuevaPagina) => {
        paginaActual = nuevaPagina;
        cargarProductos();
    });

    if (elemPaginacion) {
        contenedor.appendChild(elemPaginacion);
    }
}

// ============================================================
// Modales de Producto (Crear / Editar)
// ============================================================

/**
 * Abre el modal para crear un nuevo producto
 */
function abrirModalCrearProducto() {
    if (getRol() !== 'admin') {
        mostrarNotificacion('Solo los administradores pueden crear productos', 'error');
        return;
    }

    const modal = document.getElementById('modal-producto');
    const form = document.getElementById('form-producto');
    const titulo = document.getElementById('modal-producto-titulo');
    const previewBox = document.getElementById('producto-imagen-preview-box');

    if (!modal || !form) return;

    form.reset();
    document.getElementById('producto-id').value = '';
    document.getElementById('producto-stock').value = '0';
    document.getElementById('producto-precio').value = '';
    document.getElementById('producto-origen').value = 'fabricado';
    document.getElementById('producto-estado').value = 'disponible';
    if (document.getElementById('producto-tipo-cuero')) document.getElementById('producto-tipo-cuero').value = '';
    if (document.getElementById('producto-color')) document.getElementById('producto-color').value = '';

    if (previewBox) previewBox.style.display = 'none';
    if (titulo) titulo.textContent = '➕ Nuevo Producto';

    modal.classList.remove('hidden');
    document.getElementById('producto-nombre')?.focus();
}

/**
 * Abre el modal para editar un producto existente
 */
function abrirModalEditarProducto(id) {
    if (getRol() !== 'admin') {
        mostrarNotificacion('Solo los administradores pueden editar productos', 'error');
        return;
    }

    const prod = productosList.find(p => p.id === id);
    if (!prod) {
        mostrarNotificacion('No se encontró la información del producto', 'error');
        return;
    }

    const modal = document.getElementById('modal-producto');
    const form = document.getElementById('form-producto');
    const titulo = document.getElementById('modal-producto-titulo');
    const previewBox = document.getElementById('producto-imagen-preview-box');
    const previewImg = document.getElementById('producto-preview-img');

    if (!modal || !form) return;

    form.reset();

    document.getElementById('producto-id').value = prod.id;
    document.getElementById('producto-nombre').value = prod.nombre || '';
    document.getElementById('producto-categoria').value = prod.categoria_id || '';
    document.getElementById('producto-descripcion').value = prod.descripcion || '';
    document.getElementById('producto-precio').value = prod.precio ?? '';
    document.getElementById('producto-stock').value = prod.stock ?? 0;
    document.getElementById('producto-origen').value = prod.origen || 'fabricado';
    document.getElementById('producto-estado').value = prod.estado || 'disponible';
    document.getElementById('producto-imagen-url').value = prod.imagen_url || '';

    // Tono y tipo de cuero
    let tipoCueroVal = prod.tipo_cuero || '';
    let colorVal = prod.color || '';
    if (!tipoCueroVal && prod.descripcion) {
        const mCuero = prod.descripcion.match(/\[Cuero:\s*([^\]]+)\]/);
        if (mCuero) tipoCueroVal = mCuero[1].trim();
    }
    if (!colorVal && prod.descripcion) {
        const mColor = prod.descripcion.match(/\[Color:\s*([^\]]+)\]/);
        if (mColor) colorVal = mColor[1].trim();
    }
    if (document.getElementById('producto-tipo-cuero')) document.getElementById('producto-tipo-cuero').value = tipoCueroVal;
    if (document.getElementById('producto-color')) document.getElementById('producto-color').value = colorVal;

    if (prod.imagen_url && previewBox && previewImg) {
        previewImg.src = prod.imagen_url;
        previewBox.style.display = 'flex';
    } else if (previewBox) {
        previewBox.style.display = 'none';
    }

    if (titulo) titulo.textContent = '✏️ Editar Producto';

    modal.classList.remove('hidden');
    document.getElementById('producto-nombre')?.focus();
}

/**
 * Cierra el modal de producto
 */
function cerrarModalProducto() {
    const modal = document.getElementById('modal-producto');
    const form = document.getElementById('form-producto');
    const previewBox = document.getElementById('producto-imagen-preview-box');

    if (modal) modal.classList.add('hidden');
    if (form) form.reset();
    if (previewBox) previewBox.style.display = 'none';
}

/**
 * Maneja el envío del formulario de producto (insertar o actualizar)
 */
async function guardarProducto(e) {
    e.preventDefault();

    if (getRol() !== 'admin') {
        mostrarNotificacion('Solo los administradores pueden realizar esta acción', 'error');
        return;
    }

    const btnGuardar = document.getElementById('btn-guardar-producto');
    const id = document.getElementById('producto-id').value.trim();
    const nombre = document.getElementById('producto-nombre').value.trim();
    const categoria_id = document.getElementById('producto-categoria').value || null;
    const descripcion = document.getElementById('producto-descripcion').value.trim() || null;
    const tipo_cuero = document.getElementById('producto-tipo-cuero')?.value || '';
    const color = document.getElementById('producto-color')?.value || '';
    const precioRaw = document.getElementById('producto-precio').value;
    const stockRaw = document.getElementById('producto-stock').value;
    const origen = document.getElementById('producto-origen').value;
    const estado = document.getElementById('producto-estado').value;
    const imagen_url = document.getElementById('producto-imagen-url').value.trim() || null;

    // Validaciones
    if (!nombre) {
        mostrarNotificacion('El nombre del producto es obligatorio', 'warning');
        return;
    }

    const precio = parseFloat(precioRaw);
    if (isNaN(precio) || precio < 0) {
        mostrarNotificacion('El precio debe ser un número válido mayor o igual a 0', 'warning');
        return;
    }

    const stock = parseInt(stockRaw, 10);
    if (isNaN(stock) || stock < 0) {
        mostrarNotificacion('El stock debe ser un número entero mayor o igual a 0', 'warning');
        return;
    }

    const datos = {
        nombre,
        categoria_id,
        descripcion,
        precio,
        stock,
        origen,
        estado,
        imagen_url,
        ...(tipo_cuero ? { tipo_cuero } : {}),
        ...(color ? { color } : {})
    };

    try {
        btnGuardar.disabled = true;
        btnGuardar.innerHTML = '<span class="spinner"></span> Guardando...';

        if (id) {
            // Actualización con fallback progresivo
            let res = await db.from('productos').update(datos).eq('id', id);
            if (res.error && (res.error.code === '42703' || res.error.code === 'PGRST204' || (res.error.message && (res.error.message.includes('tipo_cuero') || res.error.message.includes('color'))))) {
                console.warn('Columnas tipo_cuero/color no presentes en tabla. Usando fallback en descripción.');
                let descConTags = descripcion || '';
                if (tipo_cuero && !descConTags.includes(`[Cuero: ${tipo_cuero}]`)) {
                    descConTags = descConTags ? `${descConTags} | [Cuero: ${tipo_cuero}]` : `[Cuero: ${tipo_cuero}]`;
                }
                if (color && !descConTags.includes(`[Color: ${color}]`)) {
                    descConTags = descConTags ? `${descConTags} | [Color: ${color}]` : `[Color: ${color}]`;
                }
                const datosFallback = {
                    nombre,
                    categoria_id,
                    descripcion: descConTags || null,
                    precio,
                    stock,
                    origen,
                    estado,
                    imagen_url
                };
                const fallbackRes = await db.from('productos').update(datosFallback).eq('id', id);
                if (fallbackRes.error) throw fallbackRes.error;
            } else if (res.error) {
                throw res.error;
            }
            mostrarNotificacion(`Producto "${nombre}" actualizado con éxito`, 'success');
        } else {
            // Inserción con fallback progresivo
            let res = await db.from('productos').insert([datos]);
            if (res.error && (res.error.code === '42703' || res.error.code === 'PGRST204' || (res.error.message && (res.error.message.includes('tipo_cuero') || res.error.message.includes('color'))))) {
                console.warn('Columnas tipo_cuero/color no presentes en tabla. Usando fallback en descripción.');
                let descConTags = descripcion || '';
                if (tipo_cuero && !descConTags.includes(`[Cuero: ${tipo_cuero}]`)) {
                    descConTags = descConTags ? `${descConTags} | [Cuero: ${tipo_cuero}]` : `[Cuero: ${tipo_cuero}]`;
                }
                if (color && !descConTags.includes(`[Color: ${color}]`)) {
                    descConTags = descConTags ? `${descConTags} | [Color: ${color}]` : `[Color: ${color}]`;
                }
                const datosFallback = {
                    nombre,
                    categoria_id,
                    descripcion: descConTags || null,
                    precio,
                    stock,
                    origen,
                    estado,
                    imagen_url
                };
                const fallbackRes = await db.from('productos').insert([datosFallback]);
                if (fallbackRes.error) throw fallbackRes.error;
            } else if (res.error) {
                throw res.error;
            }
            mostrarNotificacion(`Producto "${nombre}" creado con éxito`, 'success');
        }

        cerrarModalProducto();
        await cargarProductos();
    } catch (err) {
        console.error('Error al guardar producto:', err);
        mostrarNotificacion('Error al guardar producto: ' + (err.message || err), 'error');
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.innerHTML = '💾 Guardar Producto';
    }
}

/**
 * Elimina un producto tras confirmación modal
 */
async function eliminarProducto(id) {
    if (getRol() !== 'admin') {
        mostrarNotificacion('Solo los administradores pueden eliminar productos', 'error');
        return;
    }

    const prod = productosList.find(p => p.id === id);
    const nombreProd = prod ? prod.nombre : 'este producto';

    const confirmado = await confirmar(
        'Eliminar Producto',
        `¿Estás seguro de que deseas eliminar permanentemente "${nombreProd}"? Esta acción no se puede deshacer.`
    );

    if (!confirmado) return;

    try {
        const { error } = await db
            .from('productos')
            .delete()
            .eq('id', id);

        if (error) throw error;

        mostrarNotificacion(`Producto "${nombreProd}" eliminado exitosamente`, 'success');
        await cargarProductos();
    } catch (err) {
        console.error('Error al eliminar producto:', err);
        mostrarNotificacion('Error al eliminar producto: ' + (err.message || err), 'error');
    }
}

// ============================================================
// Modal de Gestión de Categorías
// ============================================================

/**
 * Abre el modal de gestión de categorías
 */
function abrirModalCategorias() {
    const modal = document.getElementById('modal-categorias');
    if (modal) {
        modal.classList.remove('hidden');
        document.getElementById('categoria-nombre')?.focus();
    }
}

/**
 * Cierra el modal de categorías
 */
function cerrarModalCategorias() {
    const modal = document.getElementById('modal-categorias');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// ============================================================
// Configuración de Eventos del DOM
// ============================================================

/**
 * Asigna eventos a los controles de filtros
 */
function configurarEventosFiltros() {
    // Búsqueda con debounce para optimizar consultas
    const inputBusqueda = document.getElementById('filtro-busqueda');
    if (inputBusqueda) {
        inputBusqueda.addEventListener('input', debounce((e) => {
            filtros.busqueda = e.target.value.trim();
            paginaActual = 1;
            cargarProductos();
        }, 350));
    }

    // Filtro Categoría
    const selectCategoria = document.getElementById('filtro-categoria');
    if (selectCategoria) {
        selectCategoria.addEventListener('change', (e) => {
            filtros.categoria = e.target.value;
            paginaActual = 1;
            cargarProductos();
        });
    }

    // Filtro Estado
    const selectEstado = document.getElementById('filtro-estado');
    if (selectEstado) {
        selectEstado.addEventListener('change', (e) => {
            filtros.estado = e.target.value;
            paginaActual = 1;
            cargarProductos();
        });
    }

    // Filtro Origen
    const selectOrigen = document.getElementById('filtro-origen');
    if (selectOrigen) {
        selectOrigen.addEventListener('change', (e) => {
            filtros.origen = e.target.value;
            paginaActual = 1;
            cargarProductos();
        });
    }

    // Botón Limpiar Filtros
    const btnLimpiar = document.getElementById('btn-limpiar-filtros');
    if (btnLimpiar) {
        btnLimpiar.addEventListener('click', () => {
            filtros.busqueda = '';
            filtros.categoria = '';
            filtros.estado = '';
            filtros.origen = '';

            if (inputBusqueda) inputBusqueda.value = '';
            if (selectCategoria) selectCategoria.value = '';
            if (selectEstado) selectEstado.value = '';
            if (selectOrigen) selectOrigen.value = '';

            paginaActual = 1;
            cargarProductos();
        });
    }
}

/**
 * Asigna eventos de apertura y cierre a los modales
 */
function configurarEventosModales() {
    // Botón abrir modal nuevo producto
    const btnNuevo = document.getElementById('btn-nuevo-producto');
    if (btnNuevo) {
        btnNuevo.addEventListener('click', abrirModalCrearProducto);
    }

    // Botón abrir modal categorías
    const btnCategorias = document.getElementById('btn-categorias');
    if (btnCategorias) {
        btnCategorias.addEventListener('click', abrirModalCategorias);
    }

    // Botones cerrar modal producto
    const btnCerrarProd = document.getElementById('btn-cerrar-modal-producto');
    if (btnCerrarProd) btnCerrarProd.addEventListener('click', cerrarModalProducto);

    const btnCancelarProd = document.getElementById('btn-cancelar-producto');
    if (btnCancelarProd) btnCancelarProd.addEventListener('click', cerrarModalProducto);

    // Cerrar al hacer clic fuera del modal de producto
    const modalProd = document.getElementById('modal-producto');
    if (modalProd) {
        modalProd.addEventListener('click', (e) => {
            if (e.target === modalProd) cerrarModalProducto();
        });
    }

    // Botones cerrar modal categorías
    const btnCerrarCat = document.getElementById('btn-cerrar-modal-categorias');
    if (btnCerrarCat) btnCerrarCat.addEventListener('click', cerrarModalCategorias);

    const btnCerrarCatFooter = document.getElementById('btn-cerrar-categorias-footer');
    if (btnCerrarCatFooter) btnCerrarCatFooter.addEventListener('click', cerrarModalCategorias);

    // Cerrar al hacer clic fuera del modal de categorías
    const modalCat = document.getElementById('modal-categorias');
    if (modalCat) {
        modalCat.addEventListener('click', (e) => {
            if (e.target === modalCat) cerrarModalCategorias();
        });
    }

    // Vista previa dinámica de URL de imagen en modal de producto
    const inputImagen = document.getElementById('producto-imagen-url');
    const previewBox = document.getElementById('producto-imagen-preview-box');
    const previewImg = document.getElementById('producto-preview-img');

    if (inputImagen && previewBox && previewImg) {
        const actualizarPreview = () => {
            const url = inputImagen.value.trim();
            if (url) {
                previewImg.src = url;
                previewImg.onerror = () => {
                    previewBox.style.display = 'none';
                };
                previewImg.onload = () => {
                    previewBox.style.display = 'flex';
                };
            } else {
                previewBox.style.display = 'none';
            }
        };

        inputImagen.addEventListener('input', debounce(actualizarPreview, 400));
        inputImagen.addEventListener('change', actualizarPreview);
    }

    // Tecla Escape para cerrar modales activos
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (modalProd && !modalProd.classList.contains('hidden')) {
                cerrarModalProducto();
            }
            if (modalCat && !modalCat.classList.contains('hidden')) {
                cerrarModalCategorias();
            }
        }
    });
}

/**
 * Asigna eventos de envío a formularios
 */
function configurarEventosFormularios() {
    // Formulario guardar producto
    const formProducto = document.getElementById('form-producto');
    if (formProducto) {
        formProducto.addEventListener('submit', guardarProducto);
    }

    // Formulario agregar categoría
    const formCategoria = document.getElementById('form-categoria');
    if (formCategoria) {
        formCategoria.addEventListener('submit', agregarCategoria);
    }
}

/**
 * Delegación de eventos para clics en tablas (editar/eliminar)
 */
function configurarEventosTablas() {
    // Tabla de productos
    const tbodyProductos = document.getElementById('tabla-productos-body');
    if (tbodyProductos) {
        tbodyProductos.addEventListener('click', (e) => {
            const btnEditar = e.target.closest('.btn-editar');
            if (btnEditar) {
                const id = btnEditar.getAttribute('data-id');
                if (id) abrirModalEditarProducto(id);
                return;
            }

            const btnEliminar = e.target.closest('.btn-eliminar');
            if (btnEliminar) {
                const id = btnEliminar.getAttribute('data-id');
                if (id) eliminarProducto(id);
                return;
            }
        });
    }

    // Tabla de categorías
    const tbodyCategorias = document.getElementById('tabla-categorias-body');
    if (tbodyCategorias) {
        tbodyCategorias.addEventListener('click', (e) => {
            const btnEliminarCat = e.target.closest('.btn-eliminar-cat');
            if (btnEliminarCat) {
                const id = btnEliminarCat.getAttribute('data-id');
                const nombre = btnEliminarCat.getAttribute('data-nombre');
                if (id) eliminarCategoria(id, nombre);
                return;
            }
        });
    }
}
