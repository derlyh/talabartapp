-- ============================================================
-- 011_mercado_talabarteria.sql
-- ESPECIALIZACIÓN DE MERCADO: TALABARTERÍA Y MARROQUINERÍA ARTESANAL
-- Ejecutar en el Editor SQL de Supabase
-- ============================================================

-- 1. Campos específicos de talabartería en la tabla de productos
ALTER TABLE IF EXISTS public.productos ADD COLUMN IF NOT EXISTS tipo_cuero TEXT;
ALTER TABLE IF EXISTS public.productos ADD COLUMN IF NOT EXISTS color TEXT;

-- 2. Asegurar categorías oficiales de talabartería y marroquinería
INSERT INTO public.categorias (nombre, descripcion)
VALUES 
    ('Monturas & Aperos', 'Monturas charras, galápagos, jáquimas, pecheras y aperos en cuero'),
    ('Cinturones & Reatas', 'Cinturones en vaqueta vegetal, reatas artesanales y chapas en bronce'),
    ('Marroquinería Fina', 'Billeteras bifold, tarjeteros, monederos y llaveros en cuero genuino'),
    ('Bolsos & Morrales', 'Bolsos cruzados, maletines ejecutivos y morrales rústicos en cuero graso'),
    ('Botas & Calzado Taller', 'Botas de montar, botines de trabajo y calzado en carnaza y cuero'),
    ('Insumos, Cueros & Herrajes', 'Hojas de vaqueta, badana, hebillas, remaches y bálsamos nutritivos')
ON CONFLICT (nombre) DO UPDATE 
SET descripcion = EXCLUDED.descripcion;

-- 3. Productos iniciales para demostración comercial y catálogo de taller
DO $$
DECLARE
    cat_monturas UUID;
    cat_cinturones UUID;
    cat_marroquineria UUID;
    cat_bolsos UUID;
    cat_insumos UUID;
BEGIN
    SELECT id INTO cat_monturas FROM public.categorias WHERE nombre = 'Monturas & Aperos' LIMIT 1;
    SELECT id INTO cat_cinturones FROM public.categorias WHERE nombre = 'Cinturones & Reatas' LIMIT 1;
    SELECT id INTO cat_marroquineria FROM public.categorias WHERE nombre = 'Marroquinería Fina' LIMIT 1;
    SELECT id INTO cat_bolsos FROM public.categorias WHERE nombre = 'Bolsos & Morrales' LIMIT 1;
    SELECT id INTO cat_insumos FROM public.categorias WHERE nombre = 'Insumos, Cueros & Herrajes' LIMIT 1;

    -- Cinturón Clásico Vaqueta
    IF NOT EXISTS (SELECT 1 FROM public.productos WHERE nombre = 'Cinturón Clásico Vaqueta 40mm') THEN
        INSERT INTO public.productos (nombre, categoria_id, tipo_cuero, color, descripcion, precio, stock, origen, estado)
        VALUES (
            'Cinturón Clásico Vaqueta 40mm', 
            cat_cinturones, 
            'Vaqueta Vegetal', 
            'Café Moro', 
            'Cinturón de una sola pieza en vaqueta curtida al tanino vegetal con bordes bruñidos y hebilla maciza.', 
            65000, 
            15, 
            'fabricado', 
            'disponible'
        );
    END IF;

    -- Billetera Bifold
    IF NOT EXISTS (SELECT 1 FROM public.productos WHERE nombre = 'Billetera Bifold Artesanal Pull-Up') THEN
        INSERT INTO public.productos (nombre, categoria_id, tipo_cuero, color, descripcion, precio, stock, origen, estado)
        VALUES (
            'Billetera Bifold Artesanal Pull-Up', 
            cat_marroquineria, 
            'Cuero Graso', 
            'Miel', 
            'Billetera de 6 bolsillos cosida con hilo encerado calibre 0.8mm. Cuero con efecto envejecido natural.', 
            55000, 
            22, 
            'fabricado', 
            'disponible'
        );
    END IF;

    -- Morral Rústico
    IF NOT EXISTS (SELECT 1 FROM public.productos WHERE nombre = 'Morral de Viaje Cuero Graso Envejecido') THEN
        INSERT INTO public.productos (nombre, categoria_id, tipo_cuero, color, descripcion, precio, stock, origen, estado)
        VALUES (
            'Morral de Viaje Cuero Graso Envejecido', 
            cat_bolsos, 
            'Cuero Graso', 
            'Habano', 
            'Morral amplio con compartimiento acolchado para laptop, herrajes de bronce pavonado y forro en lona impermeable.', 
            280000, 
            6, 
            'fabricado', 
            'disponible'
        );
    END IF;

    -- Montura Charra de Trabajo
    IF NOT EXISTS (SELECT 1 FROM public.productos WHERE nombre = 'Montura de Paseo Vaqueta Cincelada a Mano') THEN
        INSERT INTO public.productos (nombre, categoria_id, tipo_cuero, color, descripcion, precio, stock, origen, estado)
        VALUES (
            'Montura de Paseo Vaqueta Cincelada a Mano', 
            cat_monturas, 
            'Vaqueta Vegetal', 
            'Suela', 
            'Fuste reforzado en madera y cuero crudo, pechera y grupera a juego, cincelado floral artesanal de alta durabilidad.', 
            1450000, 
            2, 
            'fabricado', 
            'disponible'
        );
    END IF;

    -- Bálsamo Hidratante para Cuero
    IF NOT EXISTS (SELECT 1 FROM public.productos WHERE nombre = 'Bálsamo Cera y Grasa de Castor para Cuero 120g') THEN
        INSERT INTO public.productos (nombre, categoria_id, tipo_cuero, color, descripcion, precio, stock, origen, estado)
        VALUES (
            'Bálsamo Cera y Grasa de Castor para Cuero 120g', 
            cat_insumos, 
            'Herrajes / Químico', 
            'Natural', 
            'Nutrición y protección hidrófuga para aperos, cinturones y botas. 100% natural sin siliconas corrosivas.', 
            24000, 
            30, 
            'comprado', 
            'disponible'
        );
    END IF;

    -- Hoja de Vaqueta
    IF NOT EXISTS (SELECT 1 FROM public.productos WHERE nombre = 'Media Hoja de Vaqueta Curtido Vegetal 3.2mm') THEN
        INSERT INTO public.productos (nombre, categoria_id, tipo_cuero, color, descripcion, precio, stock, origen, estado)
        VALUES (
            'Media Hoja de Vaqueta Curtido Vegetal 3.2mm', 
            cat_insumos, 
            'Vaqueta Vegetal', 
            'Natural', 
            'Piel de calibre parejo para confección de fundas, vainas, cartucheras, cinturones y piezas estructuradas.', 
            175000, 
            8, 
            'comprado', 
            'disponible'
        );
    END IF;
END $$;

-- 4. Asegurar permisos RLS en categorias y productos
ALTER TABLE IF EXISTS public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.productos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Categorias publicas para lectura" ON public.categorias;
CREATE POLICY "Categorias publicas para lectura" ON public.categorias
    FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Categorias gestionables por usuarios autenticados" ON public.categorias;
CREATE POLICY "Categorias gestionables por usuarios autenticados" ON public.categorias
    FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Productos lectura para todos" ON public.productos;
CREATE POLICY "Productos lectura para todos" ON public.productos
    FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Productos gestionables por todos" ON public.productos;
CREATE POLICY "Productos gestionables por todos" ON public.productos
    FOR ALL TO public USING (true) WITH CHECK (true);
