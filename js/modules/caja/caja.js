import { db } from '../../supabase-client.js';
import { formatMoneda, formatFecha, mostrarNotificacion, getFormData } from '../../utils.js';
import { getPerfil } from '../../auth.js';

let cajaActiva = null;

export async function init() {
    configurarEventos();
    await cargarCajaActiva();
    await cargarHistorial();
}

function configurarEventos() {
    document.getElementById('btn-abrir-caja')?.addEventListener('click', () => {
        document.getElementById('modal-abrir-caja').classList.add('active');
    });
    
    document.getElementById('btn-cerrar-modal-abrir')?.addEventListener('click', () => {
        document.getElementById('modal-abrir-caja').classList.remove('active');
    });

    document.getElementById('form-abrir-caja')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = getFormData(e.target);
        await abrirCaja(formData);
    });

    // Cierre
    document.getElementById('btn-cerrar-caja')?.addEventListener('click', () => {
        if (!cajaActiva) return;
        document.getElementById('arqueo-esperado').textContent = formatMoneda(cajaActiva.saldo_esperado);
        document.getElementById('input-saldo-real').value = cajaActiva.saldo_esperado;
        calcularDiferencia();
        document.getElementById('modal-cerrar-caja').classList.add('active');
    });

    document.getElementById('btn-cerrar-modal-cerrar')?.addEventListener('click', () => {
        document.getElementById('modal-cerrar-caja').classList.remove('active');
    });

    document.getElementById('input-saldo-real')?.addEventListener('input', calcularDiferencia);

    document.getElementById('form-cerrar-caja')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = getFormData(e.target);
        await cerrarCaja(data);
    });

    // Movimientos
    document.getElementById('btn-nuevo-ingreso')?.addEventListener('click', () => abrirModalMovimiento('ingreso'));
    document.getElementById('btn-nuevo-egreso')?.addEventListener('click', () => abrirModalMovimiento('egreso'));
    
    document.getElementById('btn-cerrar-modal-movimiento')?.addEventListener('click', () => {
        document.getElementById('modal-movimiento').classList.remove('active');
    });

    document.getElementById('form-movimiento')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = getFormData(e.target);
        await registrarMovimiento(data);
    });
}

function calcularDiferencia() {
    const esperado = parseFloat(cajaActiva?.saldo_esperado || 0);
    const real = parseFloat(document.getElementById('input-saldo-real').value || 0);
    const dif = real - esperado;
    
    const divDif = document.getElementById('arqueo-diferencia');
    divDif.textContent = formatMoneda(dif);
    divDif.style.color = dif < 0 ? 'var(--color-danger)' : (dif > 0 ? 'var(--color-success)' : 'inherit');
}

async function cargarCajaActiva() {
    try {
        const { data, error } = await db
            .from('cajas')
            .select('*')
            .eq('estado', 'abierta')
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) throw error;

        if (data && data.length > 0) {
            cajaActiva = data[0];
            actualizarUIActiva();
            await cargarMovimientosCaja(cajaActiva.id);
        } else {
            cajaActiva = null;
            actualizarUIInactiva();
        }
    } catch (error) {
        console.error('Error al cargar caja activa:', error);
        mostrarNotificacion('Error al cargar estado de la caja', 'error');
    }
}

function actualizarUIActiva() {
    document.getElementById('btn-abrir-caja').style.display = 'none';
    document.getElementById('btn-cerrar-caja').style.display = 'inline-flex';
    document.getElementById('caja-activa-info').style.display = 'block';
    document.getElementById('caja-toolbar').style.display = 'flex';
    
    document.getElementById('caja-fecha-apertura').textContent = `Apertura: ${formatFecha(cajaActiva.fecha_apertura)}`;
    document.getElementById('stat-inicial').textContent = formatMoneda(cajaActiva.monto_inicial);
    document.getElementById('stat-ventas').textContent = formatMoneda(cajaActiva.total_ventas_efectivo);
    document.getElementById('stat-egresos').textContent = formatMoneda(cajaActiva.total_egresos);
    document.getElementById('stat-esperado').textContent = formatMoneda(cajaActiva.saldo_esperado);
}

function actualizarUIInactiva() {
    document.getElementById('btn-abrir-caja').style.display = 'inline-flex';
    document.getElementById('btn-cerrar-caja').style.display = 'none';
    document.getElementById('caja-activa-info').style.display = 'none';
    document.getElementById('caja-toolbar').style.display = 'none';
    
    const tbody = document.querySelector('#tabla-movimientos tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Caja cerrada. Abra la caja para registrar movimientos.</td></tr>';
}

async function cargarMovimientosCaja(cajaId) {
    try {
        const { data, error } = await db
            .from('movimientos_caja')
            .select(`*, usuarios(nombre)`)
            .eq('caja_id', cajaId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const tbody = document.querySelector('#tabla-movimientos tbody');
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay movimientos aún.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(mov => `
            <tr>
                <td>${new Date(mov.fecha).toLocaleTimeString()}</td>
                <td>
                    <span class="badge ${mov.tipo === 'ingreso' ? 'badge-success' : 'badge-danger'}">
                        ${mov.tipo.toUpperCase()}
                    </span>
                </td>
                <td>${mov.concepto}</td>
                <td style="color: ${mov.tipo === 'ingreso' ? 'var(--color-success)' : 'var(--color-danger)'}; font-weight: bold;">
                    ${mov.tipo === 'ingreso' ? '+' : '-'}${formatMoneda(mov.monto)}
                </td>
                <td>${mov.usuarios?.nombre || 'Usuario'}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error al cargar movimientos:', error);
    }
}

async function abrirCaja(formData) {
    try {
        const perfil = getPerfil();
        const { data, error } = await db
            .from('cajas')
            .insert([{
                monto_inicial: parseFloat(formData.monto_inicial) || 0,
                saldo_esperado: parseFloat(formData.monto_inicial) || 0,
                notas: formData.notas,
                usuario_id: perfil?.id,
                estado: 'abierta'
            }])
            .select();

        if (error) throw error;

        document.getElementById('modal-abrir-caja').classList.remove('active');
        mostrarNotificacion('Caja abierta correctamente', 'success');
        await cargarCajaActiva();
    } catch (error) {
        console.error('Error al abrir caja:', error);
        mostrarNotificacion('Error al abrir la caja', 'error');
    }
}

function abrirModalMovimiento(tipo) {
    document.getElementById('modal-movimiento-titulo').textContent = tipo === 'ingreso' ? 'Registrar Ingreso Extra' : 'Registrar Egreso';
    document.getElementById('movimiento-tipo').value = tipo;
    document.getElementById('form-movimiento').reset();
    document.getElementById('modal-movimiento').classList.add('active');
}

async function registrarMovimiento(data) {
    if (!cajaActiva) {
        mostrarNotificacion('No hay una caja abierta', 'error');
        return;
    }

    try {
        const perfil = getPerfil();
        const monto = parseFloat(data.monto);
        
        // 1. Insertar movimiento
        const { error: errorMov } = await db
            .from('movimientos_caja')
            .insert([{
                caja_id: cajaActiva.id,
                tipo: data.tipo,
                concepto: data.concepto,
                monto: monto,
                usuario_id: perfil?.id
            }]);

        if (errorMov) throw errorMov;

        // 2. Actualizar totales de caja
        let updateData = {};
        if (data.tipo === 'ingreso') {
            updateData.total_ingresos_extra = parseFloat(cajaActiva.total_ingresos_extra) + monto;
            updateData.saldo_esperado = parseFloat(cajaActiva.saldo_esperado) + monto;
        } else {
            updateData.total_egresos = parseFloat(cajaActiva.total_egresos) + monto;
            updateData.saldo_esperado = parseFloat(cajaActiva.saldo_esperado) - monto;
        }

        const { error: errorCaja } = await db
            .from('cajas')
            .update(updateData)
            .eq('id', cajaActiva.id);

        if (errorCaja) throw errorCaja;

        document.getElementById('modal-movimiento').classList.remove('active');
        mostrarNotificacion('Movimiento registrado', 'success');
        await cargarCajaActiva(); // Refrescar

    } catch (error) {
        console.error('Error al registrar movimiento:', error);
        mostrarNotificacion('Error al registrar movimiento', 'error');
    }
}

async function cerrarCaja(data) {
    try {
        const real = parseFloat(data.saldo_real);
        const esperado = parseFloat(cajaActiva.saldo_esperado);
        const diferencia = real - esperado;

        const { error } = await db
            .from('cajas')
            .update({
                estado: 'cerrada',
                fecha_cierre: new Date().toISOString(),
                saldo_real: real,
                diferencia: diferencia,
                notas: cajaActiva.notas + '\nCierre: ' + (data.notas_cierre || '')
            })
            .eq('id', cajaActiva.id);

        if (error) throw error;

        document.getElementById('modal-cerrar-caja').classList.remove('active');
        mostrarNotificacion('Caja cerrada y arqueada correctamente', 'success');
        
        cajaActiva = null;
        actualizarUIInactiva();
        await cargarHistorial();

    } catch (error) {
        console.error('Error al cerrar caja:', error);
        mostrarNotificacion('Error al cerrar la caja', 'error');
    }
}

async function cargarHistorial() {
    try {
        const { data, error } = await db
            .from('cajas')
            .select('*')
            .eq('estado', 'cerrada')
            .order('fecha_cierre', { ascending: false })
            .limit(10);

        if (error) throw error;

        const tbody = document.querySelector('#tabla-historial-cajas tbody');
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay historial de cajas cerradas.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(c => `
            <tr>
                <td>${formatFecha(c.fecha_apertura)} - ${new Date(c.fecha_cierre).toLocaleTimeString()}</td>
                <td><span class="badge badge-secondary">Cerrada</span></td>
                <td>${formatMoneda(c.monto_inicial)}</td>
                <td>${formatMoneda(c.saldo_real)}</td>
                <td style="color: ${c.diferencia < 0 ? 'var(--color-danger)' : (c.diferencia > 0 ? 'var(--color-success)' : 'inherit')};">
                    ${c.diferencia > 0 ? '+' : ''}${formatMoneda(c.diferencia)}
                </td>
                <td>
                    <button class="btn btn-sm btn-outline" onclick="alert('Funcionalidad de ver detalle en desarrollo')">📄 Detalle</button>
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('Error al cargar historial:', error);
    }
}
