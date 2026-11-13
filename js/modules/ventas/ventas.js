// ... existing code ...
    // Imprimir comprobante de venta
    btnImprimirComprobante?.addEventListener('click', () => {
        const modalBody = modalDetalle?.querySelector('.modal-body');
        if (!modalBody) return;

        const factura = modalBody.cloneNode(true);
        const ventana = window.open('', '_blank', 'width=900,height=900');

        if (!ventana) {
            mostrarNotificacion('Permite las ventanas emergentes para ver la vista previa de la factura.', 'warning');
            return;
        }

        ventana.document.write(`
            <!doctype html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Factura - Talabartería El Rodeo</title>
                <style>
                    :root {
                        --color-bg: #ffffff;
                        --color-text: #111827;
                        --color-muted: #6b7280;
                        --color-border: #d1d5db;
                        --color-surface: #f8fafc;
                    }
                    * { box-sizing: border-box; }
                    html, body {
                        margin: 0;
                        background: #fff;
                        color: var(--color-text);
                        font-family: Arial, Helvetica, sans-serif;
                    }
                    body {
                        padding: 24px;
                    }
                    .modal-body {
                        background: #fff;
                        color: var(--color-text);
                        max-width: 760px;
                        margin: 0 auto;
                    }
                    .modal-header,
                    .modal-footer,
                    .modal-cerrar,
                    .btn,
                    button,
                    #btn-imprimir-comprobante,
                    #btn-cerrar-modal,
                    #btn-cerrar-modal-pie {
                        display: none !important;
                    }
                    .comprobante-encabezado-taller {
                        text-align: center;
                        padding-bottom: 12px;
                        margin-bottom: 16px;
                        border-bottom: 2px dashed var(--color-border);
                    }
                    .comprobante-encabezado-taller h2 {
                        margin: 6px 0;
                        font-size: 20px;
                        color: #111827;
                    }
                    .info-grid {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 10px 16px;
                        margin: 16px 0;
                        padding: 12px;
                        border: 1px solid var(--color-border);
                        background: var(--color-surface);
                    }
                    .info-item {
                        display: block;
                    }
                    .info-label {
                        font-size: 11px;
                        font-weight: bold;
                        text-transform: uppercase;
                        letter-spacing: 0.08em;
                        color: var(--color-muted);
                        margin-bottom: 4px;
                    }
                    .info-valor {
                        font-size: 14px;
                        color: var(--color-text);
                    }
                    .tabla-contenedor {
                        width: 100%;
                        margin: 12px 0 18px;
                        overflow: visible;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 13px;
                    }
                    th, td {
                        border: 1px solid var(--color-border);
                        padding: 8px 10px;
                        text-align: left;
                        color: var(--color-text);
                    }
                    th {
                        background: #f3f4f6;
                        font-weight: 700;
                    }
                    th:nth-child(2), td:nth-child(2) { text-align: center; }
                    th:nth-child(3), td:nth-child(3),
                    th:nth-child(4), td:nth-child(4) { text-align: right; }
                    .totales-card {
                        margin-top: 16px;
                        border: 1px solid var(--color-border);
                        padding: 10px 12px;
                        background: #fff;
                    }
                    .total-linea {
                        display: flex;
                        justify-content: space-between;
                        padding: 6px 0;
                        font-size: 14px;
                    }
                    .total-destacado {
                        border-top: 1px solid var(--color-border);
                        margin-top: 8px;
                        padding-top: 10px;
                        font-size: 18px;
                        font-weight: bold;
                    }
                    .badge {
                        display: inline-block;
                        font-size: 11px;
                        line-height: 1.3;
                        padding: 4px 8px;
                        border-radius: 999px;
                        border: 1px solid #d1d5db;
                        background: #f9fafb;
                    }
                    .text-muted {
                        color: var(--color-muted);
                    }
                    .text-error {
                        color: #b91c1c;
                    }
                    @media print {
                        body { padding: 0; }
                        .modal-body { max-width: none; }
                    }
                </style>
            </head>
            <body>
                ${factura.outerHTML}
            </body>
            </html>
        `);

        ventana.document.close();
        ventana.focus();
        setTimeout(() => ventana.print(), 400);
    });

    // Tecla ESC para cerrar modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalDetalle && !modalDetalle.classList.contains('hidden')) {
            cerrarModalDetalle();
        }
    });

    // Carga inicial de datos
    await cargarVentas();
}