import { db } from '../../supabase-client.js';
import { formatMoneda, mostrarNotificacion, confirmar, debounce } from '../../utils.js';

let listaTrabajadores = [];

export async function init() {
    listaTrabajadores = [];

    // Referencias
    const btnNuevo = document.getElementById('btn-nuevo-trabajador');
    const filtroBuscar = document.getElementById('filtro-buscar-trabajador');
    const filtroRol = document.getElementById('filtro-rol-trabajador');
    const filtroTipoPago = document.getElementById('filtro-tipo-pago');
    const btnLimpiar = document.getElementById('btn-limpiar-filtros-trabajador');

    // Modal
    const modal = document.getElementById('modal-trabajador');
    const form = document.getElementById('form-trabajador');
    const btnCancelar = document.getElementById('btn-cancelar-trabajador');

    if (btnNuevo) btnNuevo.addEventListener('click', abrirModalNuevo);
    if (btnCancelar) btnCancelar.addEventListener('click', cerrarModal);
    if (form) form.addEventListener('submit', guardarTrabajador);

    if (filtroBuscar) filtroBuscar.addEventListener('input', debounce(() => renderizarTabla(), 250));
    if (filtroRol) filtroRol.addEventListener('change', () => renderizarTabla());
    if (filtroTipoPago) filtroTipoPago.addEventListener('change', () => renderizarTabla());
    if (btnLimpiar) {
        btnLimpiar.addEventListener('click', () => {
            if (filtroBuscar) filtroBuscar.value = '';
            if (filtroRol) filtroRol.value = 'trabajador';
            if (filtroTipoPago) filtroTipoPago.value = '';
            cargarTrabajadores();
        });
    }

    await cargarTrabajadores();
}

/**
 * Cargar lista de trabajadores desde Supabase
 */
async function cargarTrabajadores() {
    const tbody = document.getElementById('trabajadores-tbody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="7" class="text-center py-4">
                <div class="spinner"></div>
                <p class="mt-1 text-muted">Cargando personal...</p>
            </td>
        </tr>
    `;

    try {
        const { data, error } = await db
            .from('usuarios')
            .select('*')
            .order('nombre');

        if (error) throw error;

        listaTrabajadores = data || [];
        renderizarTabla();
    } catch (err) {
        console.error('Error cargando trabajadores:', err);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-error py-4">
                    Error al cargar trabajadores: ${err.message}
                </td>
            </tr>
        `;
    }
}

/**
 * Renderizar la tabla con los filtros activos
 */
function renderizarTabla() {
    const tbody = document.getElementById('trabajadores-tbody');
    const busqueda = document.getElementById('filtro-buscar-trabajador')?.value?.trim()?.toLowerCase() || '';
    const rol = document.getElementById('filtro-rol-trabajador')?.value || '';
    const tipoPago = document.getElementById('filtro-tipo-pago')?.value || '';

    if (!tbody) return;

    let filtrados = listaTrabajadores;

    if (rol) {
        filtrados = filtrados.filter(t => t.rol === rol);
    }
    if (tipoPago) {
        filtrados = filtrados.filter(t => t.tipo_pago === tipoPago);
    }
    if (busqueda) {
        filtrados = filtrados.filter(t => {
            const nom = (t.nombre || '').toLowerCase();
            const tel = (t.telefono || '').toLowerCase();
            return nom.includes(busqueda) || tel.includes(busqueda);
        });
    }

    if (filtrados.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state py-4">
                    <div class="empty-icono">👥</div>
                    <p class="text-muted">No se encontraron trabajadores con los filtros aplicados.</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    filtrados.forEach(trab => {
        const tr = document.createElement('tr');

        // Formato rol
        let rolBadge = '';
        if (trab.rol === 'admin') rolBadge = '<span class="badge badge-pagada">👑 Administrador</span>';
        else if (trab.rol === 'vendedor') rolBadge = '<span class="badge badge-pendiente">🛒 Vendedor</span>';
        else rolBadge = '<span class="badge badge-fabricado">🔨 Artesano</span>';

        // Modalidad y tarifa
        const modalidad = trab.tipo_pago === 'por_hora' ? '⏱️ Por Hora' : '📦 Por Unidad';
        const tarifa = trab.tipo_pago === 'por_hora' 
            ? `${formatMoneda(trab.tarifa_hora || 0)} / hora`
            : `${formatMoneda(trab.tarifa_unidad || 0)} / unidad`;

        // Estado activo
        const estadoBadge = trab.activo !== false
            ? '<span class="badge badge-disponible">Activo</span>'
            : '<span class="badge badge-agotado">Inactivo</span>';

        tr.innerHTML = `
            <td>
                <div style="font-weight: 600; font-size: 0.95rem;">${trab.nombre}</div>
            </td>
            <td>${trab.telefono || '<span class="text-muted">—</span>'}</td>
            <td>${rolBadge}</td>
            <td>${modalidad}</td>
            <td style="font-weight: 600; color: var(--color-secondary);">${tarifa}</td>
            <td>${estadoBadge}</td>
            <td>
                <div class="btn-group">
                    <button class="btn btn-secondary btn-sm btn-editar" title="Editar tarifas y datos">
                        ✏️ Editar
                    </button>
                    <button class="btn btn-danger btn-sm btn-eliminar" title="Eliminar">
                        🗑️
                    </button>
                </div>
            </td>
        `;

        tr.querySelector('.btn-editar').addEventListener('click', () => abrirModalEditar(trab));
        tr.querySelector('.btn-eliminar').addEventListener('click', () => confirmarEliminar(trab));

        tbody.appendChild(tr);
    });
}

function abrirModalNuevo() {
    const modal = document.getElementById('modal-trabajador');
    const form = document.getElementById('form-trabajador');
    const titulo = document.getElementById('modal-trabajador-titulo');

    if (!modal || !form) return;

    form.reset();
    document.getElementById('trabajador-id').value = '';
    document.getElementById('trab-rol').value = 'trabajador';
    document.getElementById('trab-tipo-pago').value = 'por_unidad';
    document.getElementById('trab-tarifa-unidad').value = '15000';
    document.getElementById('trab-tarifa-hora').value = '18000';
    document.getElementById('trab-activo').checked = true;

    if (titulo) titulo.textContent = '➕ Nuevo Trabajador / Artesano';
    modal.classList.remove('hidden');
    document.getElementById('trab-nombre')?.focus();
}

function abrirModalEditar(trab) {
    const modal = document.getElementById('modal-trabajador');
    const form = document.getElementById('form-trabajador');
    const titulo = document.getElementById('modal-trabajador-titulo');

    if (!modal || !form) return;

    document.getElementById('trabajador-id').value = trab.id;
    document.getElementById('trab-nombre').value = trab.nombre || '';
    document.getElementById('trab-telefono').value = trab.telefono || '';
    document.getElementById('trab-rol').value = trab.rol || 'trabajador';
    document.getElementById('trab-tipo-pago').value = trab.tipo_pago || 'por_unidad';
    document.getElementById('trab-tarifa-unidad').value = trab.tarifa_unidad ?? 0;
    document.getElementById('trab-tarifa-hora').value = trab.tarifa_hora ?? 0;
    document.getElementById('trab-activo').checked = trab.activo !== false;

    if (titulo) titulo.textContent = `✏️ Editar a ${trab.nombre}`;
    modal.classList.remove('hidden');
    document.getElementById('trab-nombre')?.focus();
}

function cerrarModal() {
    const modal = document.getElementById('modal-trabajador');
    if (modal) modal.classList.add('hidden');
}

/**
 * Guardar trabajador (Insert o Update)
 */
async function guardarTrabajador(e) {
    e.preventDefault();

    const btn = document.getElementById('btn-guardar-trabajador');
    const id = document.getElementById('trabajador-id').value.trim();
    const nombre = document.getElementById('trab-nombre').value.trim();
    const telefono = document.getElementById('trab-telefono').value.trim() || null;
    const rol = document.getElementById('trab-rol').value;
    const tipo_pago = document.getElementById('trab-tipo-pago').value;
    const tarifa_unidad = parseFloat(document.getElementById('trab-tarifa-unidad').value) || 0;
    const tarifa_hora = parseFloat(document.getElementById('trab-tarifa-hora').value) || 0;
    const activo = document.getElementById('trab-activo').checked;

    if (!nombre) {
        mostrarNotificacion('El nombre del trabajador es obligatorio', 'warning');
        return;
    }

    const payload = {
        nombre,
        telefono,
        rol,
        tipo_pago,
        tarifa_unidad,
        tarifa_hora,
        activo
    };

    try {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Guardando...';

        if (id) {
            // Actualizar existente
            const { error } = await db
                .from('usuarios')
                .update(payload)
                .eq('id', id);

            if (error) throw error;
            mostrarNotificacion(`Trabajador "${nombre}" actualizado correctamente`, 'success');
        } else {
            // Crear nuevo: generar UUID propio
            payload.id = crypto.randomUUID ? crypto.randomUUID() : (
                'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                })
            );

            const { error } = await db
                .from('usuarios')
                .insert([payload]);

            if (error) throw error;
            mostrarNotificacion(`Artesano "${nombre}" registrado exitosamente`, 'success');
        }

        cerrarModal();
        await cargarTrabajadores();

    } catch (err) {
        console.error('Error al guardar trabajador:', err);
        mostrarNotificacion('Error al guardar: ' + (err.message || err), 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '💾 Guardar Trabajador';
    }
}

/**
 * Confirmar eliminación de trabajador
 */
async function confirmarEliminar(trab) {
    const seguro = await confirmar(
        'Eliminar Trabajador',
        `¿Estás seguro de eliminar a "${trab.nombre}"? Si tiene ventas o registros de confección asociados, es preferible marcarlo como Inactivo.`
    );

    if (!seguro) return;

    try {
        const { error } = await db
            .from('usuarios')
            .delete()
            .eq('id', trab.id);

        if (error) throw error;

        mostrarNotificacion(`"${trab.nombre}" eliminado correctamente`, 'success');
        await cargarTrabajadores();
    } catch (err) {
        console.error('Error al eliminar:', err);
        mostrarNotificacion('No se pudo eliminar (puede tener registros asociados): ' + err.message, 'error');
    }
}
