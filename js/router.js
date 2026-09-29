import { initAuth, getUsuario, guardRuta } from './auth.js';

// ============================================================
// Router SPA basado en hash
// ============================================================

const rutas = {};
let contenedor = null;

/**
 * Registrar una ruta
 */
export function registrarRuta(path, config) {
    rutas[path] = config;
}

/**
 * Navegar a una ruta programáticamente
 */
export function navegar(path) {
    window.location.hash = '#' + path;
}

/**
 * Obtener la ruta actual
 */
function getRutaActual() {
    const hash = window.location.hash.slice(1) || '/dashboard';
    const [ruta, ...params] = hash.split('?');
    const queryParams = new URLSearchParams(params.join('?'));
    return { ruta, queryParams };
}

/**
 * Cargar el contenido HTML de un módulo
 */
async function cargarHTML(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Error cargando ${url}`);
        return await response.text();
    } catch (error) {
        console.error('Error cargando módulo:', error);
        return `<div class="error-page" style="padding: var(--space-2xl); text-align: center;">
            <h2>Error de Carga</h2>
            <p class="text-muted">No se pudo cargar el archivo de vista: ${url}</p>
        </div>`;
    }
}

/**
 * Manejar cambio de ruta
 */
async function manejarRuta() {
    const { ruta, queryParams } = getRutaActual();
    
    // Si la ruta es vacía o /, ir directo a dashboard o login
    if (ruta === '' || ruta === '/') {
        navegar(getUsuario() ? '/dashboard' : '/login');
        return;
    }
    
    // Proteger rutas
    if (ruta !== '/login' && !getUsuario()) {
        navegar('/login');
        return;
    }

    const config = rutas[ruta];

    if (!config) {
        navegar('/dashboard');
        return;
    }

    // Actualizar título
    document.title = `${config.titulo} | TalabartApp`;

    // Actualizar navegación activa en sidebar
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === '#' + ruta);
    });

    // Cargar HTML del módulo
    if (config.html) {
        const html = await cargarHTML(config.html);
        contenedor.innerHTML = html;
    }

    // Ejecutar función de inicialización del módulo
    if (config.cargar) {
        await config.cargar(queryParams);
    }
}

/**
 * Inicializar el router
 */
export async function initRouter(selectorContenedor) {
    contenedor = document.querySelector(selectorContenedor);
    if (!contenedor) {
        console.error('Contenedor no encontrado:', selectorContenedor);
        return;
    }

    await initAuth();

    window.addEventListener('hashchange', manejarRuta);

    if (!window.location.hash || window.location.hash === '#/') {
        window.location.hash = getUsuario() ? '#/dashboard' : '#/login';
    } else {
        await manejarRuta();
    }
}
