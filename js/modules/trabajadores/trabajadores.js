import { db } from '../../supabase-client.js';
import { formatMoneda, mostrarNotificacion, confirmar, debounce } from '../../utils.js';

let listaTrabajadores = [];
let trabajadorViendo = null;

export async function init() {
    listaTrabajadores = [];
    trabajadorViendo = null;

    // Referencias DOM
    const btnNuevo = document.getElementById('btn-nuevo-trabajador');
    const filtroBuscar = document.getElementById('filtro-buscar-trabajador');
    const filtroRol = document.getElementById('filtro-rol-trabajador');
    const filtroTipoPago = document.getElementById('filtro-tipo-pago');
    const btnLimpiar = document.getElementById('btn-limpiar-filtros-trabajador');

    // Modales y Formularios
    const modal = document.getElementById('modal-trabajador');
    const form = document.getElementById('form-trabajador');
    const btnCancelar = document.getElementById('btn-cancelar-trabajador');

    const modalVer = document.getElementById('modal-ver-trabajador');
    const btnCerrarVer = document.getElementById('btn-cerrar-ver-trabajador');
    const btnEditarDesdeVer = document.getElementById('btn-editar-desde-ver');

    if (btnNuevo) btnNuevo.addEventListener('click', abrirModalNuevo);
    if (btnCancelar) btnCancelar.addEventListener('click', cerrarModal);
    if (form) form.addEventListener('submit', guardarTrabajador);

    if (btnCerrarVer && modalVer) {
        btnCerrarVer.addEventListener('click', () => modalVer.classList.add('hidden'));
    }
    if (btnEditarDesdeVer) {
        btnEditarDesdeVer.addEventListener('click', () => {
            if (trabajadorViendo) {
                if (modalVer) modalVer.classList.add('hidden');
                abrirModalEditar(trabajadorViendo);
            }
        });
    }

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
            <td colspan="9" class="text-center py-4">
                <div class="spinner"></div>
                <p class="mt-1 text-muted">Cargando personal del taller...</p>
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
                <td colspan="9" class="text-center text-error py-4">
                    Error al cargar trabajadores: ${err.message}
                </td>
            </tr>
        `;
    }
}

/**
 * Renderizar la tabla con filtros activos
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
            const doc = (t.documento || '').toLowerCase();
            const esp = (t.especialidad || '').toLowerCase();
            const mail = (t.email || '').toLowerCase();
            const bco = (t.banco || '').toLowerCase();
            const cta = (t.cuenta_bancaria || '').toLowerCase();
            return nom.includes(busqueda) || tel.includes(busqueda) || doc.includes(busqueda) || 
                   esp.includes(busqueda) || mail.includes(busqueda) || bco.includes(busqueda) || cta.includes(busqueda);
        });
    }

    if (filtrados.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="empty-state py-4">
                    <div class="empty-icono">👥</div>
                    <p class="text-muted">No se encontraron trabajadores con los criterios seleccionados.</p>
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
            ? `${formatMoneda(trab.tarifa_hora || 0)} / h`
            : `${formatMoneda(trab.tarifa_unidad || 0)} / ud`;

        // Estado activo
        const estadoBadge = trab.activo !== false
            ? '<span class="badge badge-disponible">Activo</span>'
            : '<span class="badge badge-agotado">Inactivo</span>';

        // Contacto
        let contactoHtml = '';
        if (trab.telefono) {
            contactoHtml += `<div>📞 <a href="tel:${trab.telefono}">${trab.telefono}</a></div>`;
        }
        if (trab.email) {
            contactoHtml += `<div style="font-size:0.75rem; color:var(--color-text-muted);">✉️ ${trab.email}</div>`;
        }
        if (!contactoHtml) {
            contactoHtml = '<span class="text-muted">—</span>';
        }

        // Cuenta bancaria
        let cuentaHtml = '<span class="text-muted">—</span>';
        if (trab.banco || trab.cuenta_bancaria) {
            cuentaHtml = `<div><strong>${trab.banco || 'Cuenta'}:</strong></div>
                          <div style="font-size:0.8rem; font-family:var(--font-mono);">${trab.cuenta_bancaria || ''}</div>`;
        }

        // Subtítulo especialidad
        const espHtml = trab.especialidad 
            ? `<div style="font-size: 0.78rem; color: var(--color-text-muted);">🏷️ ${trab.especialidad}</div>` 
            : '';

        tr.innerHTML = `
            <td>
                <div style="font-weight: 600; font-size: 0.95rem; cursor: pointer; color: var(--color-primary);" class="link-ver-ficha">
                    ${trab.nombre}
                </div>
                ${espHtml}
            </td>
            <td><code style="font-size: 0.82rem;">${trab.documento || '—'}</code></td>
            <td>${contactoHtml}</td>
            <td>${cuentaHtml}</td>
            <td>${rolBadge}</td>
            <td>${modalidad}</td>
            <td style="font-weight: 600; color: var(--color-secondary);">${tarifa}</td>
            <td>${estadoBadge}</td>
            <td style="text-align: right;">
                <div class="btn-group" style="justify-content: flex-end;">
                    <button class="btn btn-secondary btn-sm btn-ver" title="Ver ficha completa">
                        👁️
                    </button>
                    <button class="btn btn-secondary btn-sm btn-editar" title="Editar información y tarifas">
                        ✏️
                    </button>
                    <button class="btn btn-danger btn-sm btn-eliminar" title="Eliminar trabajador">
                        🗑️
                    </button>
                </div>
            </td>
        `;

        tr.querySelector('.link-ver-ficha').addEventListener('click', () => abrirModalVer(trab));
        tr.querySelector('.btn-ver').addEventListener('click', () => abrirModalVer(trab));
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
    document.getElementById('trab-documento').value = '';
    document.getElementById('trab-email').value = '';
    document.getElementById('trab-direccion').value = '';
    document.getElementById('trab-especialidad').value = '';
    document.getElementById('trab-banco').value = '';
    document.getElementById('trab-cuenta').value = '';
    document.getElementById('trab-titular').value = '';
    document.getElementById('trab-notas').value = '';
    document.getElementById('trab-rol').value = 'trabajador';
    document.getElementById('trab-tipo-pago').value = 'por_unidad';
    document.getElementById('trab-tarifa-unidad').value = '15000';
    document.getElementById('trab-tarifa-hora').value = '18000';
    document.getElementById('trab-activo').checked = true;

    if (titulo) titulo.textContent = '➕ Agregar Nuevo Trabajador';
    modal.classList.remove('hidden');
    document.getElementById('trab-nombre')?.focus();
}

function abrirModalEditar(trab) {
    const modal = document.getElementById('modal-trabajador');
    const form = document.getElementById('form-trabajador');
    const titulo = document.getElementById('modal-trabajador-titulo');

    if (!modal || !form) return;

    document.getElementById('trabajador-id').value = trab.id || '';
    document.getElementById('trab-nombre').value = trab.nombre || '';
    document.getElementById('trab-documento').value = trab.documento || '';
    document.getElementById('trab-telefono').value = trab.telefono || '';
    document.getElementById('trab-email').value = trab.email || '';
    document.getElementById('trab-direccion').value = trab.direccion || '';
    document.getElementById('trab-especialidad').value = trab.especialidad || '';
    document.getElementById('trab-banco').value = trab.banco || '';
    document.getElementById('trab-cuenta').value = trab.cuenta_bancaria || '';
    document.getElementById('trab-titular').value = trab.titular_cuenta || '';
    document.getElementById('trab-rol').value = trab.rol || 'trabajador';
    document.getElementById('trab-tipo-pago').value = trab.tipo_pago || 'por_unidad';
    document.getElementById('trab-tarifa-unidad').value = trab.tarifa_unidad ?? 0;
    document.getElementById('trab-tarifa-hora').value = trab.tarifa_hora ?? 0;
    document.getElementById('trab-notas').value = trab.notas || '';
    document.getElementById('trab-activo').checked = trab.activo !== false;

    if (titulo) titulo.textContent = `✏️ Editar a ${trab.nombre}`;
    modal.classList.remove('hidden');
    document.getElementById('trab-nombre')?.focus();
}

function abrirModalVer(trab) {
    trabajadorViendo = trab;
    const modalVer = document.getElementById('modal-ver-trabajador');
    const titulo = document.getElementById('ver-trab-titulo');
    const contenido = document.getElementById('ver-trab-contenido');

    if (!modalVer || !contenido) return;

    if (titulo) titulo.textContent = `Ficha: ${trab.nombre}`;

    let rolTexto = 'Artesano / Confección';
    if (trab.rol === 'admin') rolTexto = 'Administrador';
    if (trab.rol === 'vendedor') rolTexto = 'Vendedor';

    const estadoTexto = trab.activo !== false 
        ? '<span class="badge badge-disponible">Activo en el taller</span>' 
        : '<span class="badge badge-agotado">Inactivo</span>';

    const modalidadTexto = trab.tipo_pago === 'por_hora' ? '⏱️ Por Hora' : '📦 Por Unidad Fabricada';

    contenido.innerHTML = `
        <div style="display:flex; align-items:center; gap:var(--space-md); margin-bottom:var(--space-md); padding-bottom:var(--space-md); border-bottom:1px solid var(--color-border);">
            <div class="avatar" style="width:52px; height:52px; font-size:1.4rem; background:var(--color-primary); color:white;">
                ${trab.nombre ? trab.nombre.charAt(0).toUpperCase() : 'T'}
            </div>
            <div>
                <h2 style="font-size:1.25rem; margin-bottom:2px;">${trab.nombre}</h2>
                <div style="display:flex; gap:6px; align-items:center;">
                    <span class="badge badge-primary">${rolTexto}</span>
                    ${estadoTexto}
                </div>
            </div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:var(--space-sm); font-size:0.9rem; margin-bottom:var(--space-md);">
            <div>
                <span class="text-muted" style="display:block; font-size:0.75rem;">CÉDULA / DOCUMENTO</span>
                <strong>${trab.documento || 'No registrada'}</strong>
            </div>
            <div>
                <span class="text-muted" style="display:block; font-size:0.75rem;">TELÉFONO / WHATSAPP</span>
                <strong>${trab.telefono ? `<a href="tel:${trab.telefono}">${trab.telefono}</a>` : 'No registrado'}</strong>
            </div>
            <div>
                <span class="text-muted" style="display:block; font-size:0.75rem;">CORREO ELECTRÓNICO</span>
                <strong>${trab.email || 'No registrado'}</strong>
            </div>
            <div>
                <span class="text-muted" style="display:block; font-size:0.75rem;">ESPECIALIDAD</span>
                <strong>${trab.especialidad || 'General del taller'}</strong>
            </div>
            <div style="grid-column: span 2;">
                <span class="text-muted" style="display:block; font-size:0.75rem;">DIRECCIÓN</span>
                <span>${trab.direccion || 'No registrada'}</span>
            </div>
        </div>

        <div style="background:var(--color-surface-2); padding:var(--space-md); border-radius:var(--radius-md); margin-bottom:var(--space-md); border:1px solid var(--color-border);">
            <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:var(--color-primary); margin-bottom:var(--space-xs);">
                💰 Modalidad de Pago y Tarifas
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span class="text-muted">Modalidad:</span>
                <strong>${modalidadTexto}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span class="text-muted">Tarifa por Unidad:</span>
                <strong style="color:var(--color-secondary);">${formatMoneda(trab.tarifa_unidad || 0)} / pieza</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
                <span class="text-muted">Tarifa por Hora:</span>
                <strong style="color:var(--color-secondary);">${formatMoneda(trab.tarifa_hora || 0)} / hora</strong>
            </div>
        </div>

        <div style="background:var(--color-surface-2); padding:var(--space-md); border-radius:var(--radius-md); border:1px solid var(--color-border);">
            <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:var(--color-primary); margin-bottom:var(--space-xs);">
                💳 Datos Bancarios para Transferencia
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span class="text-muted">Banco / Billetera:</span>
                <strong>${trab.banco || 'No especificado'}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span class="text-muted">Número de Cuenta:</span>
                <strong style="font-family:var(--font-mono);">${trab.cuenta_bancaria || 'No especificado'}</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
                <span class="text-muted">Titular:</span>
                <span>${trab.titular_cuenta || trab.nombre}</span>
            </div>
        </div>

        ${trab.notas ? `
            <div style="margin-top:var(--space-sm); font-size:0.85rem; color:var(--color-text-muted);">
                <strong>Observaciones:</strong> ${trab.notas}
            </div>
        ` : ''}
    `;

    modalVer.classList.remove('hidden');
}

function cerrarModal() {
    const modal = document.getElementById('modal-trabajador');
    if (modal) modal.classList.add('hidden');
}

/**
 * Función inteligente para guardar en Supabase con fallback progresivo si faltan columnas en la DB
 */
async function ejecutarGuardadoConFallback(payload, id = null) {
    let datos = { ...payload };

    // Intento 1: con todos los campos
    let res = id 
        ? await db.from('usuarios').update(datos).eq('id', id)
        : await db.from('usuarios').insert([datos]);

    if (!res.error) return res;

    // Si hay error por columnas no existentes aún en la base de datos (PGRST204 o 42703)
    let intentos = 0;
    while (res.error && intentos < 8 && (
        res.error.code === 'PGRST204' || 
        res.error.code === '42703' || 
        res.error.message?.includes('schema cache') || 
        res.error.message?.includes('does not exist')
    )) {
        intentos++;
        // Extraer nombre de la columna que falló
        const match = res.error.message.match(/'([^']+)' column/) || res.error.message.match(/column "([^"]+)"/);
        if (match && match[1] && datos.hasOwnProperty(match[1])) {
            const col = match[1];
            console.warn(`Columna '${col}' no existe en 'usuarios'. Reintentando guardado sin '${col}'...`);
            delete datos[col];

            res = id 
                ? await db.from('usuarios').update(datos).eq('id', id)
                : await db.from('usuarios').insert([datos]);
        } else {
            // Si no detecta columna específica, filtrar solo a columnas base del esquema inicial
            console.warn('Filtrando datos a campos base compatibles...');
            const baseCols = ['id', 'nombre', 'rol', 'telefono', 'email', 'activo', 'tarifa_hora', 'tarifa_unidad', 'tipo_pago'];
            const datosSeguros = {};
            baseCols.forEach(k => {
                if (datos.hasOwnProperty(k)) datosSeguros[k] = datos[k];
            });
            datos = datosSeguros;

            res = id 
                ? await db.from('usuarios').update(datos).eq('id', id)
                : await db.from('usuarios').insert([datos]);
            break;
        }
    }

    return res;
}

/**
 * Guardar o actualizar trabajador en Supabase
 */
async function guardarTrabajador(e) {
    e.preventDefault();

    const btn = document.getElementById('btn-guardar-trabajador');
    const id = document.getElementById('trabajador-id').value.trim();
    const nombre = document.getElementById('trab-nombre').value.trim();
    const documento = document.getElementById('trab-documento').value.trim() || null;
    const telefono = document.getElementById('trab-telefono').value.trim() || null;
    const email = document.getElementById('trab-email').value.trim() || null;
    const direccion = document.getElementById('trab-direccion').value.trim() || null;
    const especialidad = document.getElementById('trab-especialidad').value.trim() || null;
    const rol = document.getElementById('trab-rol').value;
    const tipo_pago = document.getElementById('trab-tipo-pago').value;
    const tarifa_unidad = parseFloat(document.getElementById('trab-tarifa-unidad').value) || 0;
    const tarifa_hora = parseFloat(document.getElementById('trab-tarifa-hora').value) || 0;
    const banco = document.getElementById('trab-banco').value.trim() || null;
    const cuenta_bancaria = document.getElementById('trab-cuenta').value.trim() || null;
    const titular_cuenta = document.getElementById('trab-titular').value.trim() || null;
    const notas = document.getElementById('trab-notas').value.trim() || null;
    const activo = document.getElementById('trab-activo').checked;

    if (!nombre) {
        mostrarNotificacion('El nombre del trabajador es obligatorio', 'warning');
        return;
    }

    const payload = {
        nombre,
        documento,
        telefono,
        email,
        direccion,
        especialidad,
        rol,
        tipo_pago,
        tarifa_unidad,
        tarifa_hora,
        banco,
        cuenta_bancaria,
        titular_cuenta,
        notas,
        activo,
        updated_at: new Date().toISOString()
    };

    try {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Guardando datos...';

        if (id) {
            // Actualizar existente
            const { error } = await ejecutarGuardadoConFallback(payload, id);
            if (error) throw error;
            mostrarNotificacion(`Datos de "${nombre}" actualizados correctamente`, 'success');
        } else {
            // Generar UUID propio si es nuevo
            payload.id = crypto.randomUUID ? crypto.randomUUID() : (
                'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                })
            );

            const { error } = await ejecutarGuardadoConFallback(payload, null);
            if (error) {
                // Verificar si es restricción con auth.users
                if (error.message?.includes('foreign key') || error.code === '23503') {
                    throw new Error('Supabase requiere ejecutar la migración 010 para permitir registrar trabajadores sin cuenta de correo en auth.users.');
                }
                throw error;
            }
            mostrarNotificacion(`Trabajador "${nombre}" agregado con éxito`, 'success');
        }

        cerrarModal();
        await cargarTrabajadores();

    } catch (err) {
        console.error('Error al guardar trabajador:', err);
        mostrarNotificacion('Error al guardar datos: ' + (err.message || err), 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '💾 Guardar Trabajador';
    }
}

/**
 * Confirmar y ejecutar eliminación de trabajador
 */
async function confirmarEliminar(trab) {
    const seguro = await confirmar(
        'Eliminar Trabajador',
        `¿Estás seguro de que deseas eliminar a "${trab.nombre}" del taller?`
    );

    if (!seguro) return;

    try {
        const { error } = await db
            .from('usuarios')
            .delete()
            .eq('id', trab.id);

        if (error) {
            // Si hay restricción de llave foránea (órdenes o pagos asociados)
            if (error.code === '23503' || error.message?.includes('foreign key') || error.message?.includes('violates')) {
                const deshabilitar = await confirmar(
                    'Registros Históricos Encontrados',
                    `"${trab.nombre}" tiene órdenes de trabajo, pagos o ventas registradas en el sistema. Para no alterar el historial financiero de tu taller, no puede ser borrado físicamente.\n\n¿Deseas marcarlo como INACTIVO? Dejará de aparecer en las listas de selección pero se conservará su historial intacto.`
                );

                if (deshabilitar) {
                    const { error: errUpdate } = await db
                        .from('usuarios')
                        .update({ activo: false, updated_at: new Date().toISOString() })
                        .eq('id', trab.id);

                    if (errUpdate) throw errUpdate;
                    mostrarNotificacion(`"${trab.nombre}" marcado como Inactivo`, 'info');
                    await cargarTrabajadores();
                    return;
                }
            } else {
                throw error;
            }
        } else {
            mostrarNotificacion(`"${trab.nombre}" eliminado correctamente`, 'success');
            await cargarTrabajadores();
        }

    } catch (err) {
        console.error('Error al eliminar trabajador:', err);
        mostrarNotificacion('No se pudo eliminar: ' + err.message, 'error');
    }
}
