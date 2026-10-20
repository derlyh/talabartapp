import { login } from '../../auth.js';
import { navegar } from '../../router.js';

export function init() {
    const formLogin = document.getElementById('login-form');
    const errorLogin = document.getElementById('login-error');
    const btnLogin = document.getElementById('login-btn');

    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;

            if (!email || !password) {
                mostrarErrorLogin('Por favor ingresa tu correo y contraseña.');
                return;
            }

            btnLogin.disabled = true;
            btnLogin.innerHTML = '<span class="spinner"></span> Ingresando...';
            if (errorLogin) errorLogin.style.display = 'none';

            try {
                await login(email, password);
                navegar('/dashboard');
            } catch (error) {
                console.error('Error de autenticación:', error);
                let mensaje = error.message || 'Error al iniciar sesión';

                if (error.message?.includes('Invalid login credentials')) {
                    mensaje = '⚠️ Correo o contraseña incorrectos. Verifica que el usuario exista en Supabase Auth.';
                } else if (error.message?.includes('Email not confirmed')) {
                    mensaje = '📧 Correo pendiente de confirmación. En Supabase puedes activar "Auto Confirm User" o confirmar el correo para habilitar el acceso.';
                } else if (error.message?.includes('User not found')) {
                    mensaje = '⚠️ Usuario no encontrado en la plataforma.';
                }

                mostrarErrorLogin(mensaje);
            } finally {
                btnLogin.disabled = false;
                btnLogin.textContent = 'Iniciar Sesión';
            }
        });
    }

    function mostrarErrorLogin(msg) {
        if (!errorLogin) return;
        errorLogin.innerHTML = msg;
        errorLogin.style.display = 'block';
    }
}
