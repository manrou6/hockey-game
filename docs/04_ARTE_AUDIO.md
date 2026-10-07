# 04 — Arte y audio

## Dirección visual
**Cambio de dirección de arte (decidido por Guillem, 2026-10-07; sustituye al «semi-realista» anterior):** **3D low-poly heroico facetado.** Referencia principal del estilo: las 3 imágenes de `docs/concept/style/` (la misma escena con suelo azul, parquet y crema).
- **Facetado y limpio:** caras planas visibles y aristas nítidas en todo (sombreado plano, `convertToFlatShadedMesh()` o normales por cara en el propio modelo). Nada de fotorrealismo, nada de cartoon redondeado, nada de pixel art.
- **Materiales mates**, de color liso (sin texturas fotográficas): nada de reflejos duros ni brillos. Luz limpia de pabellón cubierto con **contraluz suave** y **sombras suaves**; sin HDRI. **Única excepción** (aceptada por Guillem el 2026-10-07): el suelo del modo neón es brillante, con un reflejo barato (sin espejo real ni reflejos planares), siempre que cambiar de modo siga siendo solo colores, materiales y luz.
- Prioridad de calidad visual: 1) jugadores y animación, 2) pista y bola, 3) porterías y vallas, 4) pabellón, 5) público.
- Colores de equipación saturados y lisos para leer bien a los equipos desde la cámara lejana.

### Suelo seleccionable y modo noche NEÓN (parte del alcance de F4)
- **Suelo seleccionable por el jugador en Configuració** (y, en el futuro, un suelo por defecto por pabellón): **azul mate** (liso), **parquet claro** (patrón sutil de listones **generado por código**, sin archivo de textura) o **crema** (liso). **El suelo por defecto no está decidido todavía**: lo decidirá Guillem con la imagen 01 de la Ficha 1 de `ASSETS_SPEC.md`. No se fija ninguno hasta entonces.
- **Modo noche NEÓN, opción DESBLOQUEABLE** (cómo se desbloquea se decidirá más adelante; **solo se deja prevista la opción**): los mismos modelos, pabellón oscuro, líneas de pista y vallas en cian/magenta emisivos y una estela luminosa de la bola. Primera referencia: `docs/concept/style/style_lowpoly_neon.jpg` (imagen 01N de la Ficha 1; si Guillem elige otra variante, la sustituirá). Rasgos: pabellón casi a oscuras, líneas de pista y borde de la valla en neón cian y magenta, estela naranja de la bola, equipaciones con detalles reflectantes, suelo brillante con reflejos (reflejo barato, no planar) y público en penumbra.
- **Regla de diseño:** cambiar de suelo o de modo es **solo cambiar colores, materiales y luz; nunca modelos distintos**. Por eso el arte se hace con un «tema» de pabellón como **datos** (color del suelo y patrón, color y fuerza de la luz principal y del contraluz, tinte de las vallas, color de las líneas y su emisión, estela de la bola, color del fondo/pabellón) que el render lee; el mismo número de mallas en todos los temas.

## Jugadores
- Modelo humanoide base riggeado, **low-poly** (CC0, p. ej. Quaternius) con proporciones **atléticas ligeramente exageradas** (hombros anchos, piernas largas), formas simplificadas con caras planas suaves, **colores lisos saturados sin texturas** y **rostros sencillos**. Equipamiento modelado/añadido por código: rodilleras, espinilleras, guantes, patines de 4 ruedas (quad). **El stick, siempre a dos manos.** Porteros: casco con rejilla, peto, protecciones de piernas grandes, guantes.
- Equipaciones: camiseta, pantalón, medias con 2 colores del equipo en colores lisos con un dibujo sencillo (`solid`, `hoops`, `stripes`, `sash`, `halves`, `chestBand`); dorsal y nombre en un **atlas pequeño de texturas generado por código** (la única textura de los jugadores).
- Variedad: 4-6 caras/peinados/tonos de piel combinables (colores lisos).
- Animación: el patinaje es procedural (zancada lateral, deslizamiento, cruce de piernas en curva, frenada) sobre el esqueleto, mezclado con animaciones de tren superior (conducir, pase, tiro, regate, celebración). Animaciones de librería (si se usan) deben tener licencia de uso en juegos.
- LOD: 2 niveles según distancia a cámara (con tan pocos polígonos, un segundo nivel basta).

## Pabellón y ambiente
- Pabellón modular **claramente facetado** (caras planas visibles, aristas nítidas): grada a 3-4 lados, techo con focos, marcador electrónico, banquillos, mesa de anotadores.
- **Público de pocos polígonos:** figuras simples facetadas de colores (cuerpo y cabeza de unas pocas caras), **instanciadas** (instancing / thin instances) y con los colores de los equipos; sin animación individual (como mucho, una oscilación compartida por filas).
- 3 pabellones: modesto, mediano, gran pabellón (final de copa); se distinguen por tamaño, gradas y luces, **no por modelos de suelo ni de jugadores**.

## Interfaz
- Marcador estilo TV compacto arriba (equipos con abreviatura de 3 letras, resultado, reloj, faltas de equipo como puntos, sancionados con cuenta atrás).
- Menús limpios, tipografía deportiva, transiciones rápidas, todo navegable con un pulgar.
- Escudos y nombres de equipo inventados, generados vectorialmente.

## Fuentes de assets permitidas (registrar cada uno en CREDITS.md)
- Modelos 3D low-poly: Quaternius, Kenney, Poly Pizza (filtrar CC0), Sketchfab solo con licencia CC0 o CC-BY verificada.
- Texturas: casi no hay (colores lisos, parquet y dorsales por código); si hiciera falta alguna, Poly Haven (CC0) o ambientCG (CC0). Ya no se usa HDRI.
- Arte 2D (escudos, logo central, atlas de vallas, referencias): generado con IA por Guillem según `docs/ASSETS_SPEC.md` y registrado en CREDITS.md como «Generado con IA».
- Sonido: Freesound solo CC0 (comprobar licencia de cada archivo), Kenney audio (CC0), y síntesis por código.
- Si un asset requiere iniciar sesión para descargarlo, Claude Code da a Guillem pasos exactos para descargarlo y subirlo al repo.
- Prohibido: marcas, escudos, camisetas o patrocinadores reales; música con copyright.

## Audio
- Ambiente: público (murmullo, ovación, pitos, cánticos genéricos), eco de pabellón.
- Juego: ruedas sobre pista (varía con velocidad), golpe de stick, impacto de bola en valla/poste/protecciones, frenada, silbato (generado por código), sirena de final de parte.
- Mezcla dinámica: el público sube en ataques peligrosos y explota con gol.
- Música solo en menús (CC0 o generada).

## Presupuestos de rendimiento (Pixel 8a, 60 fps)
El low-poly facetado es mucho más ligero que el semi-realista. Se mantienen los **techos duros** de antes y se añaden **objetivos** más estrictos (propuestos por Claude y **aceptados por Guillem el 2026-10-07 como objetivo provisional**; se confirman con medición en el Pixel 8a al empezar F4):

| | Techo duro (de antes) | Objetivo low-poly |
|---|---|---|
| Triángulos visibles en partido | ≤ 200k | **≤ 80k** (10 jugadores ~2k c/u, pabellón facetado ~25k, público instanciado ~20k) |
| Draw calls | ≤ 120 | **≤ 60** (público instanciado, materiales por color, atlas de vallas) |
| Texturas | máx. 1024 px en jugadores; KTX2 (Basis) y atlas | **Sin texturas en jugadores** (salvo el atlas de dorsales/nombres, 512×512, generado por código); atlas de vallas **1024×512**; suelo, parquet y neón sin archivos |
| Luces | 1 luz con sombras (cascada única), resto horneado o ambiental | 1 direccional con sombras suaves + contraluz suave sin sombras + ambiental hemisférica; **sin HDRI**; el neón = luz tenue + materiales emisivos (el *bloom* solo en el preset Alto) |
| Peso de descarga inicial | ≤ 25 MB | **≤ 10 MB** (modelos low-poly ~1-3 MB, texturas < 1 MB, audio comprimido ~4-5 MB, código ~1,5 MB); el resto, en carga diferida y caché (service worker) |

- Escalado de resolución dinámico si baja de 55 fps. Preset de calidad: Bajo / Medio / Alto, autodetectado.
- Cambiar de suelo o de modo (neón) no debe costar rendimiento extra más allá de los emisivos y del *bloom* opcional.
