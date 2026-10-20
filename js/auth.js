import { db } from './supabase-client.js';

// Estado de sesión y perfil del usuario
let perfilActual = null;
let usuarioActual = null;

/**
 * Inicializar módulo de autenticación con Supabase Auth
 */
export async function initAuth() {
    try {
        const { data: { session }, error } = await db.auth.getSession();
        if (session?.user) {
            usuarioActual = session.user;
            await cargarPerfilSupabase(session.user);
        } else {
            usuarioActual = null;
            perfilActual = null;
        }
    } catch (e) {
        console.error('Error al inicializar sesión en Supabase:', e);
        usuarioActual = null;
        perfilActual = null;
    }

    // Escuchar cambios de sesión en tiempo real (login, logout, refresh de token)
    db.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
            usuarioActual = session.user;
            await cargarPerfilSupabase(session.user);
        } else {
            usuarioActual = null;
            perfilActual = null;
        }
        window.dispatchEvent(new CustomEvent('cambio-rol-usuario', { detail: perfilActual }));
    });
}

/**
 * Cargar o sincronizar el perfil del usuario desde public.usuarios
 */
async function cargarPerfilSupabase(user) {
    if (!user) return;
    try {
        // 1. Intentar consultar por ID en public.usuarios
        let { data, error } = await db
            .from('usuarios')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

        // 2. Si no se encontró por ID, intentar por correo
        if (!data && user.email) {
            const { data: porEmail } = await db
                .from('usuarios')
                .select('*')
                .eq('email', user.email)
                .maybeSingle();
            data = porEmail;
        }

        // 3. Si no existe aún en public.usuarios, crearlo con los datos de Supabase Auth
        if (!data) {
            const nombre = user.user_metadata?.nombre || (user.email ? user.email.split('@')[0] : 'Usuario');
            const rol = user.user_metadata?.rol || 'admin';

            const nuevoUsuario = {
                id: user.id,
                email: user.email,
                nombre: nombre,
                rol: rol,
                activo: true
            };

            const { data: insertado } = await db
                .from('usuarios')
                .upsert([nuevoUsuario], { onConflict: 'id' })
                .select()
                .maybeSingle();

            perfilActual = insertado || nuevoUsuario;
        } else {
            perfilActual = data;
        }
    } catch (err) {
        console.warn('Aviso al cargar perfil de usuario:', err);
        perfilActual = {
            id: user.id,
            email: user.email,
            nombre: user.user_metadata?.nombre || (user.email ? user.email.split('@')[0] : 'Usuario'),
            rol: user.user_metadata?.rol || 'admin',
            activo: true
        };
    }
}

/**
 * Obtener el usuario autenticado de Supabase
 */
export function getUsuario() {
    return usuarioActual;
}

/**
 * Obtener el perfil completo del usuario (nombre, rol, tarifas, etc.)
 */
export function getPerfil() {
    return perfilActual;
}

/**
 * Obtener el rol del usuario conectado
 */
export function getRol() {
    return perfilActual?.rol || null;
}

/**
 * Verificar si el usuario conectado posee uno de los roles permitidos
 */
export function tieneRol(...roles) {
    const rolActual = getRol();
    if (!rolActual) return false;
    if (rolActual === 'admin') return true;
    return roles.includes(rolActual);
}

/**
 * Cambiar temporalmente el rol activo (para pruebas en interfaz)
 */
export function cambiarRolActivo(nuevoRol) {
    if (perfilActual) {
        perfilActual.rol = nuevoRol;
        window.dispatchEvent(new CustomEvent('cambio-rol-usuario', { detail: perfilActual }));
    }
}

/**
 * Iniciar sesión con Supabase Auth (correo y contraseña creados en el dashboard de Supabase)
 */
export async function login(email, password) {
    const { data, error } = await db.auth.signInWithPassword({
        email: email.trim(),
        password
    });

    if (error) {
        throw error;
    }

    usuarioActual = data.user;
    await cargarPerfilSupabase(data.user);
    window.dispatchEvent(new CustomEvent('cambio-rol-usuario', { detail: perfilActual }));
    return { user: usuarioActual, session: data.session };
}

/**
 * Cerrar sesión en Supabase Auth y redirigir al login
 */
export async function logout() {
    try {
        await db.auth.signOut();
    } catch (e) {
        console.warn('Aviso cerrando sesión en Supabase:', e);
    }
    perfilActual = null;
    usuarioActual = null;
    window.dispatchEvent(new CustomEvent('cambio-rol-usuario', { detail: null }));
    window.location.hash = '#/login';
}

/**
 * Guard de ruta
 */
export function guardRuta(rolesPermitidos = []) {
    return true;
}

export function mostrarNotificacion(mensaje, tipo = 'info') {
    if (window.mostrarNotificacion) {
        window.mostrarNotificacion(mensaje, tipo);
    } else {
        alert(mensaje);
    }
}
