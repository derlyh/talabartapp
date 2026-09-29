import { APP_CONFIG } from './config.js';

// ============================================================
// Formateo
// ============================================================

/**
 * Formatear número como moneda
 */
export function formatMoneda(valor) {
    return new Intl.NumberFormat(APP_CONFIG.formatoFecha, {
        style: 'currency',
        currency: APP_CONFIG.moneda,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(valor || 0);
}

/**
 * Formatear fecha
 */
export function formatFecha(fecha, opciones = {}) {
    if (!fecha) return '—';
    const defaults = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    return new Date(fecha).toLocaleDateString(
        APP_CONFIG.formatoFecha,
        { ...defaults, ...opciones }
    );
}

/**
 * Formatear fecha corta (sin hora)
 */
export function formatFechaCorta(fecha) {
    return formatFecha(fecha, { hour: undefined, minute: undefined });
}

// ============================================================
// Notificaciones
// ============================================================

/**
 * Mostrar notificación tipo toast
 */
export function mostrarNotificacion(mensaje, tipo = 'info', duracion = 4000) {
    const contenedor = document.getElementById('notificaciones') || crearContenedorNotificaciones();

    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.innerHTML = `
        <span class="toast-icono">${iconoTipo(tipo)}</span>
        <span class="toast-mensaje">${mensaje}</span>
        <button class="toast-cerrar" onclick="this.parentElement.remove()">×</button>
    `;

    contenedor.appendChild(toast);

    // Auto-remover
    setTimeout(() => {
        toast.classList.add('toast-saliendo');
        setTimeout(() => toast.remove(), 300);
    }, duracion);
}

// Hacer disponible globalmente para auth.js
window.mostrarNotificacion = mostrarNotificacion;

function crearContenedorNotificaciones() {
    const div = document.createElement('div');
    div.id = 'notificaciones';
    div.className = 'notificaciones-contenedor';
    document.body.appendChild(div);
    return div;
}

function iconoTipo(tipo) {
    const iconos = {
        info: 'ℹ️',
        success: '✅',
        error: '❌',
        warning: '⚠️'
    };
    return iconos[tipo] || iconos.info;
}

// ============================================================
// Modal de confirmación
// ============================================================

/**
 * Mostrar modal de confirmación
 * @returns {Promise<boolean>}
 */
export function confirmar(titulo, mensaje) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3>${titulo}</h3>
                </div>
                <div class="modal-body">
                    <p>${mensaje}</p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="modal-cancelar">Cancelar</button>
                    <button class="btn btn-danger" id="modal-confirmar">Confirmar</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('#modal-confirmar').onclick = () => {
            overlay.remove();
            resolve(true);
        };
        overlay.querySelector('#modal-cancelar').onclick = () => {
            overlay.remove();
            resolve(false);
        };
    });
}

// ============================================================
// Paginación
// ============================================================

/**
 * Generar HTML de controles de paginación
 */
export function generarPaginacion(paginaActual, totalPaginas, onCambio) {
    if (totalPaginas <= 1) return '';

    const paginas = [];
    for (let i = 1; i <= totalPaginas; i++) {
        if (
            i === 1 || i === totalPaginas ||
            (i >= paginaActual - 2 && i <= paginaActual + 2)
        ) {
            paginas.push(i);
        } else if (paginas[paginas.length - 1] !== '...') {
            paginas.push('...');
        }
    }

    const contenedor = document.createElement('div');
    contenedor.className = 'paginacion';

    // Botón anterior
    const btnAnterior = document.createElement('button');
    btnAnterior.className = 'btn btn-sm';
    btnAnterior.textContent = '← Anterior';
    btnAnterior.disabled = paginaActual === 1;
    btnAnterior.onclick = () => onCambio(paginaActual - 1);
    contenedor.appendChild(btnAnterior);

    // Números de página
    paginas.forEach(p => {
        if (p === '...') {
            const span = document.createElement('span');
            span.className = 'paginacion-ellipsis';
            span.textContent = '...';
            contenedor.appendChild(span);
        } else {
            const btn = document.createElement('button');
            btn.className = `btn btn-sm ${p === paginaActual ? 'btn-primary' : ''}`;
            btn.textContent = p;
            btn.onclick = () => onCambio(p);
            contenedor.appendChild(btn);
        }
    });

    // Botón siguiente
    const btnSiguiente = document.createElement('button');
    btnSiguiente.className = 'btn btn-sm';
    btnSiguiente.textContent = 'Siguiente →';
    btnSiguiente.disabled = paginaActual === totalPaginas;
    btnSiguiente.onclick = () => onCambio(paginaActual + 1);
    contenedor.appendChild(btnSiguiente);

    return contenedor;
}

// ============================================================
// Helpers de formularios
// ============================================================

/**
 * Obtener datos de un formulario como objeto
 */
export function getFormData(formulario) {
    const formData = new FormData(formulario);
    const datos = {};
    for (const [key, value] of formData.entries()) {
        datos[key] = value === '' ? null : value;
    }
    return datos;
}

/**
 * Llenar un formulario con datos de un objeto
 */
export function setFormData(formulario, datos) {
    Object.entries(datos).forEach(([key, value]) => {
        const campo = formulario.querySelector(`[name="${key}"]`);
        if (campo) {
            campo.value = value ?? '';
        }
    });
}

// ============================================================
// Debounce (para búsqueda)
// ============================================================

/**
 * Debounce: retrasa la ejecución hasta que el usuario deje de escribir
 */
export function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}
