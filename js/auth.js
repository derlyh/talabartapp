import { db } from './supabase-client.js';

// ============================================================
// Perfiles predeterminados para acceso directo sin login
// ============================================================
const USUARIOS_SISTEMA = {
    admin: {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'admin@talabarteria.com',
        nombre: 'Administrador Taller',
        rol: 'admin',
        activo: true,
        tarifa_hora: 20000,
        tarifa_unidad: 15000,
        tipo_pago: 'por_unidad'
    },
    vendedor: {
        id: '00000000-0000-0000-0000-000000000002',
        email: 'vendedor@talabarteria.com',
        nombre: 'Carlos Vendedor',
        rol: 'vendedor',
        activo: true,
        tarifa_hora: 12000,
        tarifa_unidad: 10000,
        tipo_pago: 'por_unidad'
    },
    trabajador: {
        id: '00000000-0000-0000-0000-000000000003',
        email: 'artesano@talabarteria.com',
        nombre: 'Mateo Artesano',
        rol: 'trabajador',
        activo: true,
        tarifa_hora: 15000,
        tarifa_unidad: 12000,
        tipo_pago: 'por_hora'
    }
};

// Rol activo y usuario
let perfilActual = null;
let usuarioActual = null;

export async function initAuth() {
    const userId = localStorage.getItem('talabartapp_user_id');
    if (userId) {
        try {
            const { data } = await db.from('usuarios').select('*').eq('id', userId).single();
            if (data) {
                perfilActual = data;
                usuarioActual = {
                    id: data.id,
                    email: data.nombre + '@local', // mock
                    user_metadata: { nombre: data.nombre, rol: data.rol }
                };
            }
        } catch(e) {
            console.error('Error cargando sesion:', e);
            localStorage.removeItem('talabartapp_user_id');
        }
    }
}

export function getUsuario() { return usuarioActual; }
export function getPerfil() { return perfilActual; }
export function getRol() { return perfilActual?.rol || null; }

export function tieneRol(...roles) {
    if (getRol() === 'admin') return true;
    return roles.includes(getRol());
}

export function cambiarRolActivo(nuevoRol) {
    // Solo para pruebas si se usa el selector
    if(perfilActual) {
        perfilActual.rol = nuevoRol;
        window.dispatchEvent(new CustomEvent('cambio-rol-usuario', { detail: perfilActual }));
    }
}

export async function login(nombre, password) {
    const { data, error } = await db.from('usuarios')
        .select('*')
        .eq('nombre', nombre)
        .eq('password', password)
        .single();
        
    if (error || !data) {
        throw new Error('Credenciales incorrectas');
    }
    
    perfilActual = data;
    usuarioActual = { id: data.id, email: data.nombre + '@local', user_metadata: { nombre: data.nombre, rol: data.rol }};
    localStorage.setItem('talabartapp_user_id', data.id);
    window.dispatchEvent(new CustomEvent('cambio-rol-usuario', { detail: perfilActual }));
    return { user: usuarioActual };
}

export async function registrarse(nombre, email, password, rol) {
    // Verifica si existe
    const { data: existe } = await db.from('usuarios').select('id').eq('nombre', nombre).maybeSingle();
    if (existe) throw new Error('Ya existe un usuario con ese nombre');

    const { data, error } = await db.from('usuarios')
        .insert([{ nombre, password, rol, activo: true }])
        .select()
        .single();

    if (error) throw error;
    
    perfilActual = data;
    usuarioActual = { id: data.id, email: data.nombre + '@local', user_metadata: { nombre: data.nombre, rol: data.rol }};
    localStorage.setItem('talabartapp_user_id', data.id);
    window.dispatchEvent(new CustomEvent('cambio-rol-usuario', { detail: perfilActual }));
    return { user: usuarioActual, session: true };
}

export async function logout() {
    perfilActual = null;
    usuarioActual = null;
    localStorage.removeItem('talabartapp_user_id');
    window.location.hash = '#/login';
}

/**
 * Inicializar módulo de autenticación:
 * Asegura que los usuarios base existan en public.usuarios en Supabase.
 */
export async function initAuth() {
    // Intentar sincronizar usuarios base silenciosamente en Supabase
    try {
        const usuariosParaInsertar = Object.values(USUARIOS_SISTEMA);
        await db.from('usuarios').upsert(usuariosParaInsertar, { onConflict: 'id' });
    } catch (err) {
        console.warn('Aviso sincronización usuarios base:', err.message);
    }
}

/**
 * Guard de ruta: siempre permite el acceso
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
