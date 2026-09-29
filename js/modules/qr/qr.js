import { db } from '../../supabase-client.js';
import { formatMoneda, formatFecha, mostrarNotificacion, confirmar, debounce } from '../../utils.js';

let cuentaSeleccionada = null;
let listaCuentas = [];

export async function init() {
    cuentaSeleccionada = null;
    listaCuentas = [];

    // Referencias
    const filtroBuscar = document.getElementById('filtro-buscar-cuenta');
    const filtroEstado = document.getElementById('filtro-estado-cuenta');
    const btnRefrescar = document.getElementById('btn-refrescar-cuentas');
    const btnCopiar = document.getElementById('btn-copiar-url');
    const btnDescargar = document.getElementById('btn-descargar-qr');
    const btnMarcarPagada = document.getElementById('btn-marcar-pagada');
    const btnWhatsapp = document.getElementById('btn-compartir-whatsapp');

    // Eventos
    if (filtroBuscar) {
        filtroBuscar.addEventListener('input', debounce(() => cargarCuentas(), 300));
    }
    if (filtroEstado) {
        filtroEstado.addEventListener('change', () => cargarCuentas());
    }
    if (btnRefrescar) {
        btnRefrescar.addEventListener('click', () => cargarCuentas());
    }
    if (btnCopiar) {
        btnCopiar.addEventListener('click', copiarEnlace);
    }
    if (btnDescargar) {
        btnDescargar.addEventListener('click', descargarQrImagen);
    }
    if (btnMarcarPagada) {
        btnMarcarPagada.addEventListener('click', confirmarMarcarPagada);
    }
    if (btnWhatsapp) {
        btnWhatsapp.addEventListener('click', compartirWhatsapp);
    }

    // Revisar si viene parametro ?venta= en hash
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.includes('?') ? hash.split('?')[1] : '');
    const ventaId = params.get('venta');

    // Modal de Config
    document.getElementById('btn-config-cuentas')?.addEventListener('click', abrirConfig);
    document.getElementById('btn-cerrar-config')?.addEventListener('click', () => {
        document.getElementById('modal-config-cuentas').classList.remove('active');
    });
    document.getElementById('btn-add-cuenta')?.addEventListener('click', agregarFilaCuenta);
    document.getElementById('form-config-cuentas')?.addEventListener('submit', guardarConfig);

    await cargarCuentas(ventaId);
}

async function abrirConfig() {
    try {
        const { data, error } = await db.from('configuraciones').select('valor').eq('clave', 'cuentas_bancarias').single();
        let cuentas = [];
        if (!error && data) {
            cuentas = data.valor;
        } else {
            cuentas = [
                { banco: "Bancolombia Ahorros", numero: "987-654321-00" },
                { banco: "Nequi / Daviplata", numero: "310 123 4567" },
                { banco: "Titular", numero: "Talabartería de Cuero S.A.S" }
            ];
        }
        
        const contenedor = document.getElementById('lista-cuentas-config');
        contenedor.innerHTML = '';
        cuentas.forEach(c => agregarFilaCuenta(c.banco, c.numero));

        document.getElementById('modal-config-cuentas').classList.add('active');
    } catch (err) {
        console.error('Error al cargar config:', err);
        mostrarNotificacion('Error al cargar configuración', 'error');
    }
}

function agregarFilaCuenta(banco = '', numero = '') {
    const contenedor = document.getElementById('lista-cuentas-config');
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.gap = '10px';
    div.style.marginBottom = '10px';
    div.innerHTML = `
        <input type="text" placeholder="Banco/Etiqueta" class="form-control" style="flex: 1;" value="${banco}" required>
        <input type="text" placeholder="Número/Valor" class="form-control" style="flex: 1;" value="${numero}" required>
        <button type="button" class="btn btn-danger btn-icon" onclick="this.parentElement.remove()">🗑️</button>
    `;
    contenedor.appendChild(div);
}

async function guardarConfig(e) {
    e.preventDefault();
    const contenedor = document.getElementById('lista-cuentas-config');
    const filas = contenedor.children;
    const cuentas = [];
    for (let f of filas) {
        const inputs = f.querySelectorAll('input');
        if (inputs.length >= 2) {
            cuentas.push({ banco: inputs[0].value, numero: inputs[1].value });
        }
    }

    try {
        const { error } = await db.from('configuraciones')
            .upsert({ clave: 'cuentas_bancarias', valor: cuentas });
        if (error) throw error;
        
        mostrarNotificacion('Configuración guardada correctamente', 'success');
        document.getElementById('modal-config-cuentas').classList.remove('active');
    } catch (err) {
        console.error('Error al guardar config:', err);
        mostrarNotificacion('Error al guardar configuración', 'error');
    }
}

/**
 * Cargar lista de cuentas de cobro
 */
async function cargarCuentas(autoSeleccionarVentaId = null) {
    const tbody = document.getElementById('cuentas-tbody');
    const contador = document.getElementById('contador-cuentas');
    const estado = document.getElementById('filtro-estado-cuenta')?.value;
    const busqueda = document.getElementById('filtro-buscar-cuenta')?.value?.trim()?.toLowerCase();

    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="text-center py-4">
                <div class="spinner"></div>
                <p class="mt-1 text-muted">Consultando cuentas...</p>
            </td>
        </tr>
    `;

    try {
        let query = db
            .from('cuentas_cobro')
            .select(`
                id,
                venta_id,
                monto,
                estado,
                qr_data,
                created_at,
                ventas (
                    id,
                    fecha,
                    total,
                    estado,
                    clientes (id, nombre, telefono, email)
                )
            `)
            .order('created_at', { ascending: false });

        if (estado) {
            query = query.eq('estado', estado);
        }

        const { data, error } = await query;
        if (error) throw error;

        listaCuentas = data || [];

        // Filtro en cliente por nombre de cliente o ID
        if (busqueda) {
            listaCuentas = listaCuentas.filter(c => {
                const nombre = c.ventas?.clientes?.nombre?.toLowerCase() || '';
                const id = c.id.toLowerCase();
                const ventaId = c.venta_id?.toLowerCase() || '';
                return nombre.includes(busqueda) || id.includes(busqueda) || ventaId.includes(busqueda);
            });
        }

        if (contador) {
            const pendientes = listaCuentas.filter(c => c.estado === 'pendiente').length;
            contador.textContent = `${pendientes} pendiente${pendientes !== 1 ? 's' : ''}`;
        }

        if (listaCuentas.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state py-4">
                        <div class="empty-icono">📭</div>
                        <p class="text-muted">No se encontraron cuentas de cobro.</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = '';
        listaCuentas.forEach(cuenta => {
            const tr = document.createElement('tr');
            const cliente = cuenta.ventas?.clientes?.nombre || 'Cliente General';
            const badgeClass = cuenta.estado === 'pagada' ? 'badge-pagada' : 'badge-pendiente';

            tr.innerHTML = `
                <td style="font-size:0.85rem;">${formatFecha(cuenta.created_at)}</td>
                <td><strong>${cliente}</strong></td>
                <td style="font-weight:600; color:var(--color-secondary);">${formatMoneda(cuenta.monto)}</td>
                <td><span class="badge ${badgeClass}">${cuenta.estado.toUpperCase()}</span></td>
                <td>
                    <button class="btn btn-secondary btn-sm btn-ver-qr" data-id="${cuenta.id}">
                        📱 QR
                    </button>
                </td>
            `;

            tr.querySelector('.btn-ver-qr').addEventListener('click', () => {
                seleccionarCuenta(cuenta);
            });

            tbody.appendChild(tr);
        });

        // Auto-seleccionar si se pasó ventaId o seleccionar la primera
        if (autoSeleccionarVentaId) {
            const encontrada = listaCuentas.find(c => c.venta_id === autoSeleccionarVentaId);
            if (encontrada) {
                seleccionarCuenta(encontrada);
                return;
            }
        }

        if (listaCuentas.length > 0 && !cuentaSeleccionada) {
            seleccionarCuenta(listaCuentas[0]);
        }

    } catch (err) {
        console.error('Error cargando cuentas:', err);
        mostrarNotificacion('Error al cargar cuentas de cobro: ' + err.message, 'error');
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-error py-4">
                    Error al cargar las cuentas de cobro.
                </td>
            </tr>
        `;
    }
}

/**
 * Seleccionar y renderizar QR de una cuenta
 */
function seleccionarCuenta(cuenta) {
    cuentaSeleccionada = cuenta;

    const placeholder = document.getElementById('qr-placeholder');
    const contenido = document.getElementById('qr-contenido');
    const badgeEstado = document.getElementById('qr-estado-badge');
    const canvas = document.getElementById('qr-canvas');

    if (!cuenta || !canvas) return;

    placeholder.classList.add('hidden');
    contenido.classList.remove('hidden');

    // Datos del cliente e info
    const cliente = cuenta.ventas?.clientes?.nombre || 'Cliente Ocasional';
    document.getElementById('qr-tarjeta-titulo').textContent = `Cobro #${cuenta.id.slice(0, 8)}`;
    document.getElementById('qr-info-cliente').textContent = cliente;
    document.getElementById('qr-info-monto').textContent = formatMoneda(cuenta.monto);
    document.getElementById('qr-info-venta').textContent = cuenta.venta_id ? cuenta.venta_id.slice(0, 8) : '—';
    document.getElementById('qr-info-fecha').textContent = formatFecha(cuenta.created_at);

    // Estado
    if (cuenta.estado === 'pagada') {
        badgeEstado.className = 'badge badge-pagada';
        badgeEstado.textContent = 'PAGADA';
        document.getElementById('btn-marcar-pagada').style.display = 'none';
    } else {
        badgeEstado.className = 'badge badge-pendiente';
        badgeEstado.textContent = 'PENDIENTE DE COBRO';
        document.getElementById('btn-marcar-pagada').style.display = '';
    }

    // URL pública para el cliente
    // Se calcula con origen actual + ruta a qr-publico.html
    const rutaBase = window.location.href.split('#')[0].replace('index.html', '');
    const urlPublica = `${rutaBase}modules/qr/qr-publico.html?cuenta=${cuenta.id}`;

    document.getElementById('qr-url-publica').value = urlPublica;
    document.getElementById('btn-abrir-publico').href = urlPublica;

    // Generar QR con la librería qrcode.js cargada en index.html
    try {
        if (window.QRCode && typeof window.QRCode.toCanvas === 'function') {
            window.QRCode.toCanvas(canvas, urlPublica, {
                width: 250,
                margin: 2,
                color: {
                    dark: '#1a1a2e',
                    light: '#ffffff'
                }
            }, (error) => {
                if (error) console.error('Error generando QR:', error);
            });
        } else {
            console.warn('QRCode library no encontrada en window');
        }
    } catch (e) {
        console.error('Excepción al generar QR:', e);
    }
}

/**
 * Copiar enlace al portapapeles
 */
async function copiarEnlace() {
    const input = document.getElementById('qr-url-publica');
    if (!input || !input.value) return;

    try {
        await navigator.clipboard.writeText(input.value);
        mostrarNotificacion('¡Enlace copiado al portapapeles!', 'success');
    } catch {
        input.select();
        document.execCommand('copy');
        mostrarNotificacion('¡Enlace copiado!', 'success');
    }
}

/**
 * Descargar imagen del QR
 */
function descargarQrImagen() {
    const canvas = document.getElementById('qr-canvas');
    if (!canvas || !cuentaSeleccionada) return;

    const enlace = document.createElement('a');
    enlace.download = `QR-Cobro-${cuentaSeleccionada.id.slice(0, 8)}.png`;
    enlace.href = canvas.toDataURL('image/png');
    enlace.click();
    mostrarNotificacion('Imagen QR descargada', 'info');
}

/**
 * Compartir por WhatsApp
 */
function compartirWhatsapp() {
    if (!cuentaSeleccionada) return;
    const urlPublica = document.getElementById('qr-url-publica').value;
    const cliente = cuentaSeleccionada.ventas?.clientes?.nombre || 'Cliente';
    const monto = formatMoneda(cuentaSeleccionada.monto);

    const texto = encodeURIComponent(`Hola ${cliente}, aquí tienes el enlace para ver y realizar el pago de tu cuenta en TalabartApp por ${monto}: ${urlPublica}`);
    window.open(`https://wa.me/?text=${texto}`, '_blank');
}

/**
 * Confirmar y marcar cuenta como pagada
 */
async function confirmarMarcarPagada() {
    if (!cuentaSeleccionada) return;

    const seguro = await confirmar(
        'Confirmar Pago',
        `¿Deseas marcar la cuenta de ${formatMoneda(cuentaSeleccionada.monto)} como PAGADA? Esto también actualizará el estado de la venta asociada.`
    );

    if (!seguro) return;

    try {
        // 1. Actualizar cuentas_cobro
        const { error: errCuenta } = await db
            .from('cuentas_cobro')
            .update({ estado: 'pagada', updated_at: new Date() })
            .eq('id', cuentaSeleccionada.id);

        if (errCuenta) throw errCuenta;

        // 2. Actualizar venta
        if (cuentaSeleccionada.venta_id) {
            await db
                .from('ventas')
                .update({ estado: 'pagada', updated_at: new Date() })
                .eq('id', cuentaSeleccionada.venta_id);
        }

        mostrarNotificacion('¡Cuenta y venta marcadas como pagadas!', 'success');
        await cargarCuentas();
        cuentaSeleccionada.estado = 'pagada';
        seleccionarCuenta(cuentaSeleccionada);

    } catch (err) {
        console.error('Error al marcar pagada:', err);
        mostrarNotificacion('No se pudo marcar como pagada: ' + err.message, 'error');
    }
}
