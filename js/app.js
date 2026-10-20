import { initRouter, registrarRuta, navegar } from './router.js';
import { getUsuario, getPerfil, getRol, cambiarRolActivo, initAuth, tieneRol, logout } from './auth.js';
import { mostrarNotificacion } from './utils.js';

// ============================================================
// Registro de rutas
// ============================================================

// Login
registrarRuta('/login', {
    titulo: 'Iniciar Sesión',
    html: 'modules/auth/login.html',
    roles: [],
    cargar: async () => {
        const modulo = await import('./modules/auth/login.js');
        modulo.init();
    }
});

// Dashboard
registrarRuta('/dashboard', {
    titulo: 'Dashboard',
    html: 'modules/dashboard/dashboard.html',
    roles: [],
    cargar: async () => {
        const modulo = await import('./modules/dashboard/dashboard.js');
        modulo.init();
    }
});

// Inventario
registrarRuta('/inventario', {
    titulo: 'Inventario',
    html: 'modules/inventario/inventario.html',
    roles: ['admin', 'vendedor'],
    cargar: async () => {
        const modulo = await import('./modules/inventario/inventario.js');
        modulo.init();
    }
});

// Ventas
registrarRuta('/ventas', {
    titulo: 'Ventas',
    html: 'modules/ventas/ventas.html',
    roles: ['admin', 'vendedor'],
    cargar: async () => {
        const modulo = await import('./modules/ventas/ventas.js');
        modulo.init();
    }
});

registrarRuta('/nueva-venta', {
    titulo: 'Nueva Venta',
    html: 'modules/ventas/nueva-venta.html',
    roles: ['admin', 'vendedor'],
    cargar: async () => {
        const modulo = await import('./modules/ventas/ventas.js');
        modulo.initNuevaVenta();
    }
});

// Clientes
registrarRuta('/clientes', {
    titulo: 'Clientes',
    html: 'modules/clientes/clientes.html',
    roles: ['admin', 'vendedor'],
    cargar: async () => {
        const modulo = await import('./modules/clientes/clientes.js');
        modulo.init();
    }
});

// QR
registrarRuta('/qr', {
    titulo: 'Cobro QR',
    html: 'modules/qr/qr.html',
    roles: ['admin', 'vendedor'],
    cargar: async () => {
        const modulo = await import('./modules/qr/qr.js');
        modulo.init();
    }
});

// Productividad
registrarRuta('/productividad', {
    titulo: 'Productividad',
    html: 'modules/productividad/productividad.html',
    roles: ['admin', 'trabajador'],
    cargar: async () => {
        const modulo = await import('./modules/productividad/productividad.js');
        modulo.init();
    }
});

// Pagos
registrarRuta('/pagos', {
    titulo: 'Pagos Trabajadores',
    html: 'modules/productividad/pagos.html',
    roles: ['admin', 'trabajador'],
    cargar: async () => {
        const modulo = await import('./modules/productividad/pagos.js');
        modulo.init();
    }
});

// Trabajadores
registrarRuta('/trabajadores', {
    titulo: 'Trabajadores',
    html: 'modules/trabajadores/trabajadores.html',
    roles: ['admin'],
    cargar: async () => {
        const modulo = await import('./modules/trabajadores/trabajadores.js');
        modulo.init();
    }
});

// Caja
registrarRuta('/caja', {
    titulo: 'Caja Diaria',
    html: 'modules/caja/caja.html',
    roles: ['admin', 'vendedor'],
    cargar: async () => {
        const modulo = await import('./modules/caja/caja.js');
        modulo.init();
    }
});

// ============================================================
// Inicialización
// ============================================================

async function iniciarApp() {
    // Inicializar router
    await initRouter('#app-content');

    // Configurar toggle sidebar mobile
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');

    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 &&
                !sidebar.contains(e.target) &&
                e.target !== menuToggle) {
                sidebar.classList.remove('open');
            }
        });
    }

    // Configurar botón cerrar sesión
    const btnLogout = document.getElementById('btn-cerrar-sesion');
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            await logout();
            mostrarNotificacion('Sesión cerrada correctamente', 'info');
        });
    }

    // Escuchar evento de cambio de rol para refrescar sidebar
    window.addEventListener('cambio-rol-usuario', () => {
        actualizarSidebar();
    });

    window.addEventListener('hashchange', actualizarSidebar);
    actualizarSidebar();
}

/**
 * Actualizar visualmente la información del sidebar según el perfil actual
 */
function actualizarSidebar() {
    const perfil = getPerfil();
    const sidebar = document.getElementById('sidebar');
    
    // Si estamos en login o no hay usuario, ocultar sidebar
    if (window.location.hash === '#/login' || !perfil) {
        if (sidebar) sidebar.style.display = 'none';
        return;
    } else {
        if (sidebar) sidebar.style.display = 'flex';
    }

    if (perfil) {
        const avatar = document.getElementById('user-avatar');
        const nombre = document.getElementById('user-nombre');
        const rol = document.getElementById('user-rol');

        if (avatar) avatar.textContent = perfil.nombre?.charAt(0)?.toUpperCase() || 'A';
        if (nombre) nombre.textContent = perfil.nombre || 'Administrador';
        if (rol) {
            const rolesLabels = {
                admin: '👑 Administrador',
                vendedor: '🛒 Mostrador / Ventas',
                trabajador: '🔨 Maestro Artesano'
            };
            rol.textContent = rolesLabels[perfil.rol] || perfil.rol || 'En turno';
        }
    }

    // Adaptar secciones visibles según rol
    const navProduccion = document.getElementById('nav-produccion');
    const navOperaciones = document.getElementById('nav-operaciones');

    if (navProduccion) {
        navProduccion.style.display = tieneRol('admin', 'trabajador') ? '' : 'none';
    }
    if (navOperaciones) {
        navOperaciones.style.display = tieneRol('admin', 'vendedor') ? '' : 'none';
    }
}

// Iniciar aplicación directamente
iniciarApp();
