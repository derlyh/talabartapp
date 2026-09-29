import { login, registrarse } from '../../auth.js';
import { navegar } from '../../router.js';

export function init() {
    // Formularios y pestañas
    const tabLogin = document.getElementById('tab-login');
    const tabRegistro = document.getElementById('tab-registro');
    const formLogin = document.getElementById('login-form');
    const formRegistro = document.getElementById('registro-form');

    // Mensajes y botones login
    const errorLogin = document.getElementById('login-error');
    const btnLogin = document.getElementById('login-btn');

    // Mensajes y botones registro
    const errorRegistro = document.getElementById('registro-error');
    const exitoRegistro = document.getElementById('registro-exito');
    const btnReg = document.getElementById('reg-btn');

    // --- Control de Pestañas ---
    if (tabLogin && tabRegistro) {
        tabLogin.addEventListener('click', () => {
            tabLogin.style.background = 'var(--color-primary)';
            tabLogin.style.color = 'white';
            tabRegistro.style.background = '';
            tabRegistro.style.color = '';
            formLogin.classList.remove('hidden');
            formRegistro.classList.add('hidden');
            if (errorLogin) errorLogin.style.display = 'none';
        });

        tabRegistro.addEventListener('click', () => {
            tabRegistro.style.background = 'var(--color-primary)';
            tabRegistro.style.color = 'white';
            tabLogin.style.background = '';
            tabLogin.style.color = '';
            formRegistro.classList.remove('hidden');
            formLogin.classList.add('hidden');
            if (errorRegistro) errorRegistro.style.display = 'none';
            if (exitoRegistro) exitoRegistro.style.display = 'none';
        });
    }

    // --- Evento Login ---
    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;

            if (!email || !password) {
                mostrarErrorLogin('Por favor completa todos los campos');
                return;
            }

            btnLogin.disabled = true;
            btnLogin.innerHTML = '<span class="spinner"></span> Ingresando...';
            errorLogin.style.display = 'none';

            try {
                await login(email, password);
                navegar('/dashboard');
            } catch (error) {
                console.error('Error de login:', error);
                let mensaje = error.message || 'Error al iniciar sesión';

                if (error.message?.includes('Invalid login credentials')) {
                    mensaje = '⚠️ Correo o contraseña incorrectos. Si aún no tienes una cuenta registrada en este proyecto de Supabase, pulsa en la pestaña "Crear Cuenta".';
                } else if (error.message?.includes('Email not confirmed')) {
                    mensaje = '📧 Debes confirmar tu correo electrónico antes de ingresar, o desactivar "Confirm email" en Supabase Auth.';
                } else if (error.message?.includes('User not found')) {
                    mensaje = '⚠️ El usuario no existe en la base de datos. Crea tu cuenta en la pestaña "Crear Cuenta".';
                }

                mostrarErrorLogin(mensaje);
            } finally {
                btnLogin.disabled = false;
                btnLogin.textContent = 'Iniciar Sesión';
            }
        });
    }

    // --- Evento Registro ---
    if (formRegistro) {
        formRegistro.addEventListener('submit', async (e) => {
            e.preventDefault();

            const nombre = document.getElementById('reg-nombre').value.trim();
            const email = document.getElementById('reg-email').value.trim();
            const password = document.getElementById('reg-password').value;
            const rol = document.getElementById('reg-rol').value;

            if (!nombre || !email || !password) {
                mostrarErrorRegistro('Por favor completa todos los campos requeridos');
                return;
            }

            if (password.length < 6) {
                mostrarErrorRegistro('La contraseña debe tener al menos 6 caracteres');
                return;
            }

            btnReg.disabled = true;
            btnReg.innerHTML = '<span class="spinner"></span> Registrando...';
            errorRegistro.style.display = 'none';
            exitoRegistro.style.display = 'none';

            try {
                const resultado = await registrarse(nombre, email, password, rol);

                // Si la sesión se inició automáticamente
                if (resultado.session) {
                    exitoRegistro.textContent = '¡Cuenta creada con éxito! Redirigiendo...';
                    exitoRegistro.style.display = 'block';
                    setTimeout(() => navegar('/dashboard'), 1200);
                } else {
                    // Si Supabase requiere confirmación por email
                    exitoRegistro.innerHTML = '✅ ¡Usuario registrado! Si tu proyecto de Supabase tiene activo el envío de confirmaciones, revisa tu correo electrónico para verificar tu cuenta antes de iniciar sesión.';
                    exitoRegistro.style.display = 'block';
                }
            } catch (error) {
                console.error('Error de registro:', error);
                let mensaje = error.message || 'No se pudo crear la cuenta';
                if (error.message?.includes('User already registered')) {
                    mensaje = 'Ya existe un usuario registrado con este correo. Cambia a la pestaña "Iniciar Sesión".';
                } else if (error.message?.includes('Password should be at least')) {
                    mensaje = 'La contraseña debe tener mínimo 6 caracteres.';
                }
                mostrarErrorRegistro(mensaje);
            } finally {
                btnReg.disabled = false;
                btnReg.textContent = 'Registrarse y Entrar';
            }
        });
    }

    function mostrarErrorLogin(msg) {
        errorLogin.innerHTML = msg;
        errorLogin.style.display = 'block';
    }

    function mostrarErrorRegistro(msg) {
        errorRegistro.innerHTML = msg;
        errorRegistro.style.display = 'block';
    }
}
