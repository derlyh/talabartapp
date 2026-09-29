import { db } from './supabase-client.js';

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
