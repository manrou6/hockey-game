# ASSETS_SPEC — Ficha de assets para generar con ChatGPT

Documento para Guillem (no necesitas tocar código). Aquí tienes **cinco fichas**. Cada una tiene un texto marcado **«COPIA DESDE AQUÍ → HASTA AQUÍ»** que puedes pegar tal cual en ChatGPT. Lo que ChatGPT te devuelva me lo pasas a mí (Claude Code) y yo lo reviso, lo optimizo, lo integro y lo registro.

Estado: actualizado el 2026-10-07 al **nuevo estilo: 3D low-poly heroico facetado** (decidido por Guillem; sustituye al «semi-realista»; ver `docs/04`). Todo lo de aquí respeta docs/01 (equipos y atributos), docs/04 (dirección de arte, presupuestos y licencias) y CLAUDE.md. Si algo de aquí choca con un documento, manda el documento y te lo digo antes de cambiarlo.

**Referencias de estilo ya generadas** (guardadas en `docs/concept/style/`): la misma escena en low-poly con suelo **azul**, **parquet** y **crema** (`style_lowpoly_suelo-azul.jpg`, `style_lowpoly_suelo-parquet.jpg`, `style_lowpoly_suelo-crema.jpg`) y **la primera versión del modo neón** (`style_lowpoly_neon.jpg`, que es la imagen **01N** de la Ficha 1 ya existente como referencia; si eliges otra variante más adelante, la sustituirá). Los prompts con los que se generaron están en `docs/prompts/` (`concept_01_suelos.txt` y `concept_01n_neon.txt`). Son la referencia principal del estilo, de los tres suelos y del neón: **adjúntalas a la conversación de ChatGPT** (con el clip) cuando generes la Ficha 1 y di «mismo estilo que estas imágenes».


## Antes de empezar (léelo una vez)

1. **Orden recomendado:** primero la Ficha 1 (arte conceptual, es lo que más ayuda a decidir el aspecto del juego en F4) y la Ficha 4 (datos de equipos, los uso ya en F2 con equipos de prueba). Escudos, equipaciones y texturas (fichas 2 y 3) cuando llegue F4; si los tienes antes, mejor, los guardo.
2. **Una conversación de ChatGPT por ficha** y pega siempre primero el **BLOQUE DE ESTILO** (justo debajo). Así todas las imágenes salen coherentes.
3. **Pide 3-4 variantes** de cada imagen y quédate con la mejor. No hace falta que sea perfecta: es referencia.
4. **Lo que ChatGPT hace mal y cómo evitarlo:**
   - **Texto dentro de las imágenes** (letras, números, nombres): sale con faltas. Pídele **sin texto** o con texto inventado muy corto; los nombres, dorsales y abreviaturas los pongo yo por código.
   - **Fondo transparente real:** a veces no lo da. Si el PNG sale con fondo de cuadros dibujado o de color, pídele **«fondo verde puro #00FF00 liso»** y yo lo quito.
   - **Tamaños exactos:** no siempre los respeta. Pide el tamaño, y si sale otro, me lo pasas igual; yo lo escalo. Lo importante es la **proporción** y que sea **nítida**.
   - **Marcas reales:** a veces «se le cuelan» logos parecidos a los reales. Revisa cada imagen con la lista de la Ficha 5.
5. **Cómo me pasas los archivos (sin tocar nada técnico):** arrastra los archivos al chat conmigo (o adjúntalos con el clip). Con cada archivo, dime en una frase **qué es** y pega **el texto que le diste a ChatGPT (el prompt)**. Si algún día el chat no admite el archivo (por tamaño, por ejemplo), te daré los pasos exactos, clic a clic, para subirlo a GitHub.
6. **Nombres de archivo** (sin espacios, en minúsculas): `concept_01_pista-tv-azul.jpg`, `concept_01n_pista-tv-neon.jpg`, `crest_serra-blava.svg` (o `.png`), `kit_serra-blava.png`, `tex_boards_atlas.svg` (o `.png`), `logo_center.svg`, `teams.json`.

### BLOQUE DE ESTILO (pégalo al empezar CADA conversación)

COPIA DESDE AQUÍ ↓

````
Vamos a crear arte para un videojuego móvil de HOCKEY SOBRE PATINES (rink hockey, patines de 4 ruedas "quad" sobre pista dura; NO es hockey sobre hielo ni hockey línea).

ESTILO: 3D LOW-POLY HEROICO FACETADO. Render 3D con caras planas visibles y aristas nítidas. No es fotorrealista, ni cartoon redondeado, ni pixel art, ni anime.
- Jugadores: proporciones atléticas ligeramente exageradas (hombros anchos, piernas largas), formas simplificadas con caras planas suaves, colores LISOS y saturados SIN texturas, rostros sencillos (pocos rasgos). Siempre con el stick cogido a DOS manos.
- Pabellón y público: claramente facetados (caras planas visibles, aristas nítidas). El público, de muy pocos polígonos: figuras simples de colores.
- Materiales MATES (nada de reflejos duros ni brillos). Luz limpia de pabellón cubierto, con contraluz suave y sombras suaves.
- Suelo SELECCIONABLE: azul mate liso, parquet claro (listones sutiles) o crema liso. Te diré cuál usar en cada imagen. Líneas blancas finas.
- Colores de equipación saturados y lisos, que se lean bien desde lejos.

Datos del deporte para que salga correcto:
- Pista de 40 x 20 m con esquinas redondeadas, rodeada de una valla blanca de 1 m de alto con paneles publicitarios planos (formas geométricas de colores). Dos porterías de 1,70 x 1,05 m con red.
- Cinco jugadores por equipo en pista (4 jugadores + portero). Jugadores: camiseta, pantalón corto, medias largas, rodilleras, espinilleras, guantes, patines de 4 ruedas, un stick corto de pala recta y plana, SIN casco. Portero: casco con rejilla, peto, protecciones de piernas grandes, guantes y stick.
- La bola es pequeña, redonda y naranja (23 cm de circunferencia).

REGLAS OBLIGATORIAS:
- Todo inventado: NINGÚN escudo, camiseta, patrocinador, marca, pabellón ni jugador reales. Si algo se parece a un club o marca real, cámbialo.
- SIN texto legible dentro de las imágenes (como mucho palabras inventadas muy cortas en la publicidad). Sin números de camiseta salvo que te lo pida.
- Sin marcas de agua, sin firmas, sin logos de ChatGPT/OpenAI.
- Apto para todos los públicos (sin sangre, sin peleas).
- Si te adjunto imágenes de referencia de estilo, mantén exactamente ese estilo.
````

HASTA AQUÍ ↑

---

## Ficha 1 — Arte conceptual (referencia visual para F4)

**Para qué sirve:** es solo **referencia** para decidir cómo se verá el juego en F4 (presentación TV y arte). **No entra en el juego** ni pesa en la descarga: lo guardo en `docs/concept/`. Es la continuación de las 3 imágenes de estilo que ya tienes.

**Qué quiero (10 imágenes: 01, 01N y 02-09):**

| Nº | Imagen | Para qué lo uso |
|---|---|---|
| 01 | **Plano general de TV comparando los tres suelos**: la misma escena (pista completa vista desde la grada central, cámara elevada, jugadores pequeños en acción, público al fondo) en **tres versiones idénticas que solo cambian el suelo: azul mate, parquet claro y crema liso** | Cámara TV por defecto; **con esta imagen decides el suelo por defecto** |
| 01N | **Modo NEÓN** (opción desbloqueable; **ya existe una primera versión** como referencia, `docs/concept/style/style_lowpoly_neon.jpg`: se sustituye solo si eliges otra variante): la misma escena que la 01 (suelo oscuro), pabellón oscuro, **líneas de pista y vallas en cian y magenta luminosos**, **estela luminosa de la bola**, bordes de luz en los jugadores, público en silueta con algunas luces | Tema neón (colores, materiales y luz; mismos modelos) |
| 02 | **Plano TV cercano**: un jugador conduciendo la bola, la valla con paneles geométricos detrás, fondo ligeramente desenfocado | Cámara cercana |
| 03 | **Vista alta / táctica**: pista vista desde arriba en diagonal, se leen las posiciones y las líneas | Cámara táctica |
| 04 | **Detalle de estilo y materiales**: jugador de cerca con la cara y el equipo facetados, valla, rueda de patín, pala del stick y bola naranja (todo mate, caras planas visibles) | Modelos y materiales |
| 05 | **Pabellón modesto**: pabellón pequeño de pueblo, grada de un lado, techo bajo, facetado | Estadio 1 de 3 |
| 06 | **Pabellón mediano**: grada a tres lados, focos, marcador electrónico | Estadio 2 de 3 |
| 07 | **Gran pabellón de final de copa**: grada llena a cuatro lados, focos potentes, ambiente de gala | Estadio 3 de 3 |
| 08 | **Banquillos y mesa de anotadores** con marcador electrónico | Pabellón modular |
| 09 | **Ambiente**: celebración de un gol, público (figuras de pocos polígonos) en pie, luces cálidas | Ambiente / repetición |

**Formato:** apaisado **16:9** (o lo más parecido que te deje ChatGPT, p. ej. 1792×1024 o 1536×1024), **JPG o PNG**, lado largo entre 1536 y 2048 px. Pide **3-4 variantes** de cada una (en la 01, **3-4 variantes de la composición y los tres suelos en cada una**). En la 01, la 01N, la 02 y la 03 pide que **no haya marcador ni interfaz** dibujados. **Adjunta siempre las 3 imágenes de estilo.**

**Colores de equipo:** haz las imágenes 01-03 con **dos equipos inventados** de colores muy distintos (como en las de referencia: azul y amarillo contra rojo y blanco).

COPIA DESDE AQUÍ ↓

````
(Pega primero el BLOQUE DE ESTILO y adjunta las 3 imágenes de referencia de estilo.)

Genera la imagen conceptual nº [NÚMERO] de la lista siguiente. Formato apaisado 16:9, mismo estilo 3D low-poly heroico facetado que las imágenes de referencia, sin texto legible, sin interfaz ni marcadores dibujados, todo inventado.

[PEGA AQUÍ UNA SOLA FILA, por ejemplo:]
01 — Plano general de TV: la pista completa vista desde la grada central, cámara elevada a unos 10 m de altura mirando hacia el centro, jugadores pequeños en plena jugada (azul y amarillo contra rojo y blanco), público de pocos polígonos al fondo, luz limpia de pabellón con contraluz suave. Dame TRES versiones con exactamente la misma composición que solo cambian el suelo: (a) azul mate liso, (b) parquet claro de listones sutiles, (c) crema liso.

[o, para la 01N:]
01N — La misma escena que la 01 en MODO NEÓN: pabellón oscuro, suelo oscuro, líneas de pista y paneles de valla en cian y magenta luminosos, estela luminosa de la bola, bordes de luz en los jugadores, público en silueta con algunas luces. Mismos modelos, solo cambian colores, materiales y luz.

Dame 4 variantes. Después de cada una, dime en una línea qué has cambiado respecto a la anterior.
````

HASTA AQUÍ ↑

**Cómo me lo pasas:** los 10 archivos con su número (`concept_01_pista-tv-azul.jpg`, `concept_01_pista-tv-parquet.jpg`, `concept_01_pista-tv-crema.jpg`, `concept_01n_pista-tv-neon.jpg`, `concept_02_…`) y, en un mensaje, **qué suelo prefieres como defecto** y cuál variante te gusta más de cada imagen. Con eso actualizo la guía de arte de F4 (docs/04) y te la enseño antes de aplicarla.

---

## Ficha 2 — Escudos y equipaciones de equipos inventados (docs/01)

Hay **12 equipos de la liga base** (Vic, Reus, Igualada, Lloret, Calafell, Sant Sadurní, Voltregà, Barcelona, Lleida, Girona, A Coruña, Alcobendas). La **ciudad puede ser real; todo lo demás es inventado**: nombre del club, apodo, escudo, colores exactos y patrocinadores.

### 2A. Escudos

**Ruta recomendada (coincide con docs/04: «escudos vectoriales y simples»): que ChatGPT escriba el SVG.** Es un archivo de texto, ligero, sin fondo (transparente por naturaleza) y nítido a cualquier tamaño. ChatGPT lo escribe como código y tú solo copias el texto en un archivo `.svg` (te explico cómo abajo) o me lo pegas directamente en el chat.

**Ruta alternativa (PNG):** si prefieres que ChatGPT dibuje una imagen, vale como borrador o como versión final **solo con tu OK explícito** (lo anoto en DECISIONS.md, porque docs/04 dice vectorial).

**Reglas del escudo (las dos rutas):**
- **Máximo 4 colores planos** (los 2 colores del equipo + blanco o negro). **Sin degradados, sin sombras, sin brillos, sin texturas, sin aspecto fotográfico.**
- Forma de escudo **simple y simétrica** (círculo, escudo clásico, rombo, pentágono…). **Un solo símbolo** reconocible (ave, torre, montaña, rueda, estrella, ola…).
- **Sin texto** (la abreviatura de 3 letras la pongo yo por código). Si quieres iniciales, solo 1-3 letras en el diseño.
- Tiene que **entenderse a 48 px** (así se verá en el marcador).
- **Nada que recuerde a un club real**: ni forma, ni combinación de colores y símbolo, ni lema. Ejemplo de lo que NO vale: un escudo azul y granate con un balón y una cruz (parece el de un club grande). Ante la duda, cambia el símbolo.

**Formato SVG:** un solo archivo `.svg`, `viewBox="0 0 512 512"`, **como mucho 30 formas**, colores en hexadecimal (`#1E6FD9`), **sin `<text>`, sin imágenes incrustadas, sin filtros, sin degradados**.

**Formato PNG (alternativa):** **512 × 512 px, PNG con transparencia**, escudo centrado con 24 px de margen. Si no consigue transparencia, fondo **verde puro #00FF00 liso**. Yo lo reduzco a 256 y 64 px.

COPIA DESDE AQUÍ ↓

````
(Pega primero el BLOQUE DE ESTILO, pero IGNORA lo del 3D facetado: aquí quiero un diseño PLANO, vectorial y en 2D.)

Diseña el ESCUDO de un club inventado de hockey sobre patines.
- Ciudad (solo como inspiración, el escudo no lleva su nombre): [CIUDAD]
- Nombre inventado del club: [NOMBRE] — apodo: [APODO]
- Colores (hex): [COLOR 1] y [COLOR 2]
- Símbolo: [AVE / TORRE / MONTAÑA / RUEDA / ESTRELLA / OLA…]

Escríbelo como un ARCHIVO SVG completo (solo el código, en un bloque de código), con viewBox="0 0 512 512", máximo 30 formas, solo colores planos en hexadecimal (máximo 4 colores), sin <text>, sin imágenes, sin filtros ni degradados, forma de escudo simple y simétrica. Tiene que entenderse a 48 px. No debe parecerse a ningún escudo real de ningún club.
Dame 3 variantes numeradas.
````

HASTA AQUÍ ↑

**Cómo guardar el SVG (si no me lo pegas):** abre el Bloc de notas, pega el código, «Guardar como…», nombre `crest_serra-blava.svg` y en «Tipo» elige «Todos los archivos». Arrastra ese archivo al chat conmigo.

### 2B. Equipaciones (diseño de referencia)

Las camisetas del juego se construyen **por código** con 2 colores del equipo **lisos** (sin texturas), un dibujo sencillo y el dorsal y el nombre generados como un atlas pequeño por código (docs/04). Por eso lo que necesito de ChatGPT es **la hoja de diseño**, no una textura lista.

**Qué quiero por equipo (una imagen):** vistas **frontal y trasera** de camiseta, pantalón y medias, **equipación titular** y **equipación suplente**, más la **del portero**. PNG **1536 × 1024**, fondo liso gris claro `#EEEEEE`, **sin texto ni números**.

**Reglas:**
- **2 colores del equipo + 1 detalle** (blanco o negro). Titular: base color 1, dibujo color 2. Suplente: al revés.
- **El dibujo, de esta lista cerrada** (para poder hacerlo por código): `solid` (liso), `hoops` (aros horizontales), `stripes` (rayas verticales), `sash` (banda diagonal), `halves` (mitades), `chestBand` (franja en el pecho).
- **Colores en hexadecimal** (dime cuáles usó: te los pido en el texto de abajo).
- El portero va con un **tercer color muy distinto** de los dos equipos.
- **Sin patrocinadores reales, sin marcas de ropa deportiva, sin rayas de tres bandas ni formas típicas de marcas conocidas.** Nada que recuerde a la camiseta de un club real.

COPIA DESDE AQUÍ ↓

````
(Pega primero el BLOQUE DE ESTILO.)

Crea la hoja de diseño de equipación del club inventado "[NOMBRE]" (ciudad: [CIUDAD]).
- Colores: primario [HEX 1], secundario [HEX 2], portero [HEX 3].
- Dibujo: [solid / hoops / stripes / sash / halves / chestBand]
- Muestra: camiseta, pantalón corto y medias, en vista frontal y trasera, EQUIPACIÓN TITULAR (base primario, dibujo secundario), EQUIPACIÓN SUPLENTE (al revés) y EQUIPACIÓN DE PORTERO (con peto y casco con rejilla).
- Ilustración limpia y plana, sobre fondo liso gris claro #EEEEEE, tamaño 1536 x 1024, SIN texto, SIN números, SIN logos ni patrocinadores, SIN marcas de ropa deportiva.
Al final, lista los colores usados con su código hexadecimal.
````

HASTA AQUÍ ↑

---

## Ficha 3 — Texturas y arte plano: suelos, vallas con patrocinadores inventados, logo central

**Con el low-poly casi no hay texturas.** Nada de texturas fotográficas grandes. Lo que sí hace falta de ChatGPT son tres cosas pequeñas y planas: **el atlas de paneles de las vallas**, **el logo del círculo central** y los **escudos** (Ficha 2, SVG). El suelo y el modo neón **no necesitan archivos**.

### 3A. Suelos y modo neón: sin archivos (solo decisiones)

Los tres suelos son **intercambiables** en Configuració y el **modo neón** (desbloqueable más adelante) también: **solo cambian colores, materiales y luz; nunca modelos distintos** (docs/04). Por eso aquí **no se genera ninguna textura de suelo**:

| Suelo | Cómo se hace | Color orientativo (sacado de tus imágenes de referencia; lo confirmas tú) |
|---|---|---|
| **Azul mate** | Color liso | `#4A88C4` |
| **Parquet claro** | Color base + **patrón sutil de listones generado por código** (listones largos de 2-3 tonos de madera clara muy próximos, sin veta; se crea al arrancar, **0 bytes de descarga**) | `#DDBF98` |
| **Crema liso** | Color liso | `#EBDDBF` |
| **Neón (desbloqueable)** | Pabellón casi a oscuras (azul marino `#14114E`), suelo azul intenso **brillante con reflejos** `#0A78C6`, líneas de pista y borde de la valla **emisivos en cian `#00E5FF` y magenta `#FF2BD6`**, estela luminosa **naranja** de la bola, equipaciones con detalles reflectantes, público en penumbra | **Ya hay primera referencia:** `docs/concept/style/style_lowpoly_neon.jpg` (colores muestreados de la imagen; provisionales) |

**Los hex de los suelos son provisionales** (Guillem, 2026-10-07). El suelo brillante con reflejos del neón es una excepción a «materiales mates»: se haría con un reflejo barato (specular alto y/o una textura de reflejo borrosa), **nada de reflejos planares costosos**; se confirma con medición en F4. Líneas de pista: blancas `#FFFFFF`, dibujadas por código. **El suelo por defecto lo decides tú** con la imagen 01 de la Ficha 1 (no se fija ninguno todavía).

### 3B. Vallas con patrocinadores inventados (1 atlas pequeño)

- **`tex_boards_atlas`: 1024 × 512 px** (orientativo: lo confirmo al integrarlo). Cuadrícula de **4 columnas × 4 filas = 16 paneles de 256 × 128 px** (proporción 2:1 = un tramo de valla de 2 m × 1 m, 128 px por metro). Numerados de izquierda a derecha y de arriba abajo.
- **Paneles 1-15:** 15 anuncios **distintos e inventados**, **planos y geométricos como en tus imágenes de referencia** (triángulos, círculos, trapecios, bandas en azul, amarillo, rojo…): **fondo de color liso**, **un símbolo geométrico** y, si quieres, **un nombre inventado de máx. 8 letras**. Como mucho 3-4 colores por panel, sin degradados, sin sombras, sin fotos. **Panel 16:** blanco liso (relleno).
- Margen de seguridad de **12 px** en el borde de cada panel.
- **Ruta recomendada: que ChatGPT escriba un SVG** (un solo archivo de 1024×512 con 16 grupos `<g>`, formas planas y colores en hexadecimal). Es exacto y ocupa muy poco; **yo lo convierto a PNG/KTX2**. Si pone texto, que sea con `<text>` y una fuente genérica (yo lo repongo con una tipografía deportiva si hace falta). **Ruta alternativa:** una imagen PNG de ese tamaño; vale con tu OK, pero el texto suele salir con faltas.
- **Con el modo neón no hace falta otro atlas:** los mismos paneles se pintan con otra luz y colores emisivos.
- **Patrocinadores inventados — ejemplos válidos** (comprueba siempre que no existan buscándolos en Google): Zentora, Aqualume, Vantiq, Orbelis, Kelmora, Brivio, Nordavia, Calmora, Tessera, Pontiq. Si alguno coincide por casualidad con una empresa real, se cambia.
- **Prohibido:** marcas reales de cualquier sector (bebidas, bancos, deportes, coches, apuestas…), logos que se les parezcan, colores y formas típicos de una marca conocida, y publicidad de apuestas, tabaco o alcohol.

### 3C. Logo central y escudos (SVG planos)

- **Logo del círculo central:** **SVG plano**, `viewBox="0 0 512 512"`, circular, 2-3 colores, **sin texto** (si lo prefieres, PNG 512×512 transparente con tu OK). Competición inventada.
- **Escudos:** ver la Ficha 2 (SVG planos, máx. 4 colores, sin texto).

### Presupuesto de descarga de esta ficha (recalculado para el low-poly)

| Pieza | Peso aproximado en la descarga |
|---|---|
| Suelos azul, parquet, crema y neón | **0 MB** (colores y parquet por código) |
| Atlas de vallas 1024×512 (colores planos, comprime muy bien: WebP/KTX2) | **0,1-0,3 MB** |
| Logo central SVG | 5-20 KB |
| 12 escudos SVG (5-15 KB cada uno) | 0,06-0,2 MB |
| Atlas de dorsales y nombres 512×512 | **0 MB** (se genera al arrancar) |
| **Total de texturas y arte 2D** | **≈ 0,3-0,6 MB → techo de esta ficha: ≤ 1 MB** (la propuesta anterior, semi-realista, era ≈ 4-6 MB) |

En memoria de la GPU: ≈ 3,5 MB (atlas de vallas 2 MB, dorsales 1 MB, parquet 0,25 MB). **Descarga inicial total del juego (objetivo low-poly de docs/04): ≤ 10 MB** (antes ≤ 25 MB), con el techo duro de 25 MB.

COPIA DESDE AQUÍ ↓

````
(Pega primero el BLOQUE DE ESTILO, pero aquí quiero GRÁFICOS 2D PLANOS y vectoriales: nada de 3D, ni sombras, ni degradados, ni fotos.)

PIEZA 1 — Atlas de paneles de valla. Escribe un ARCHIVO SVG completo (solo el código, en un bloque de código) de 1024 x 512 (viewBox="0 0 1024 512"), dividido en una cuadrícula de 4 columnas x 4 filas = 16 paneles de 256 x 128, numerados de izquierda a derecha y de arriba abajo, cada uno en su propio grupo <g id="panel-01"> ... <g id="panel-16">. Paneles 1 a 15: anuncios INVENTADOS planos y geométricos (triángulos, círculos, trapecios, bandas), fondo de color liso, un símbolo geométrico y, opcionalmente, un nombre inventado de máximo 8 letras con <text>; 3-4 colores por panel (azul, amarillo, rojo, blanco, negro), sin degradados ni sombras ni imágenes. Panel 16: blanco liso. Margen de 12 px dentro de cada panel. Usa estos nombres inventados: Zentora, Aqualume, Vantiq, Orbelis, Kelmora, Brivio, Nordavia, Calmora, Tessera, Pontiq y otros 5 que inventes tú (que no se parezcan a ninguna marca real). Prohibidas las marcas reales y la publicidad de apuestas, tabaco o alcohol.
Cuando termines, dame la LISTA de los 16 paneles (número y nombre).

PIEZA 2 — Logo central. Escribe un ARCHIVO SVG completo (viewBox="0 0 512 512") del logo INVENTADO de una competición de hockey sobre patines, circular, plano, 2-3 colores en hexadecimal, sin <text>, sin degradados, sin imágenes.
````

HASTA AQUÍ ↑

---

## Ficha 4 — Datos de contenido para F2 / F5: equipos y jugadores (JSON)

Los datos viven **en un archivo, no en el código** (docs/05: «datos sobre código»). Yo lo guardaré como `src/data/teams.json`. ChatGPT te lo escribe y tú me lo pasas; **yo lo valido** (formato, números repetidos, rangos) antes de usarlo.

### Campos (todo en inglés porque es lo que lee el programa; los nombres de personas y equipos, los que quieras inventar)

**Equipo**

| Campo | Qué es | Valores |
|---|---|---|
| `id` | Identificador | minúsculas y guiones, único: `serra-blava` |
| `city` | Ciudad (puede ser real) | texto |
| `name` | Nombre del club **inventado** | texto |
| `nickname` | Apodo inventado | texto |
| `abbr` | Abreviatura del marcador | **3 letras mayúsculas, único** en toda la liga |
| `colors` | Los 2 colores | `primary`, `secondary` en hexadecimal `#RRGGBB` |
| `goalkeeperColor` | Color del portero | hexadecimal, **muy distinto** de los otros dos |
| `kitPattern` | Dibujo de la camiseta | `solid`, `hoops`, `stripes`, `sash`, `halves`, `chestBand` |
| `style` | Estilo de juego | `balanced`, `attacking`, `defensive`, `counter` |
| `defenseSystem` | Sistema defensivo preferido (docs/03 §7) | `square` (zona en cuadrado), `diamond` (rombo), `man` (individual), `highPress` (presión alta) |
| `arena` | Pabellón (docs/04) | `modest`, `medium`, `grand` |
| `crest` | Archivo del escudo | `crest_<id>.svg` o `.png` |
| `players` | **10 jugadores: 8 de pista + 2 porteros** | lista |

**Jugador**

| Campo | Qué es | Valores |
|---|---|---|
| `id` | Identificador | `<abbr en minúsculas>-<dorsal con 2 cifras>`: `sbv-09` |
| `name` | Nombre **inventado** | texto |
| `number` | Dorsal | entero **1-99, único en el equipo**. Porteros: 1 y 12 |
| `position` | Posición (**provisional**, la ajusto en F2) | `GK` portero, `DEF` defensa, `MID` medio, `FWD` delantero. Reparto sugerido: 2 GK + 3 DEF + 2 MID + 3 FWD |
| `age` | Edad | 18-38 |
| `look` | Aspecto (docs/04: 4-6 caras, peinados y tonos combinables) | `face`, `hair`, `skin`: enteros **1-6** |
| `attributes` | Atributos **0-99** (docs/01) | ver abajo |

**Atributos de jugador de pista (13, todos 0-99):** `speed`, `acceleration`, `agility` (patinaje), `control` (control de bola), `dribbling` (regate), `passing` (pase), `shotPower`, `shotAccuracy` (tiro), `marking`, `tackling` (defensa: marcaje, robo), `physical` (físico), `stamina` (resistencia), `vision` (visión).

**Atributos de portero (5, todos 0-99):** `reflexes` (reflejos), `positioning` (posición), `stretch` (estirada), `rushing` (salida), `stickPlay` (juego con stick).

### Reglas de equilibrio (para que ningún equipo sea absurdo)

- **No pongas el «global»**: lo calculo yo.
- Valores normales entre **40 y 90**. **Un 95-99 es una leyenda** (como mucho 1 en toda la liga). Un 30 solo en puntos débiles evidentes.
- Media de cada equipo entre **60 y 76**. Los mejores equipos, 2-3 jugadores de 82-90; los modestos, ninguno por encima de 82.
- **Coherencia con la posición:** los DEF altos en `marking`, `tackling` y `physical`; los FWD en `shotPower`, `shotAccuracy`, `dribbling` y `speed`; los MID en `passing`, `vision` y `stamina`.
- Los porteros no tienen atributos de pista, y los jugadores de pista no tienen los de portero.
- **Nombres inventados**: mezcla de catalanes, castellanos y algún portugués, italiano o argentino según el equipo; **sin nombres de jugadores reales conocidos** (de hockey patines ni de otros deportes). Nombres y apellidos distintos entre sí en toda la liga.

### Ejemplo completo (1 equipo, 10 jugadores)

Es un **ejemplo válido**: copia esta forma y cambia los valores.

```json
{
  "version": 1,
  "teams": [
    {
      "id": "serra-blava",
      "city": "Vic",
      "name": "Patins Serra Blava",
      "nickname": "Els Falcons",
      "abbr": "SBV",
      "colors": {"primary": "#1E6FD9", "secondary": "#F2B705"},
      "goalkeeperColor": "#2BB673",
      "kitPattern": "hoops",
      "style": "attacking",
      "defenseSystem": "square",
      "arena": "medium",
      "crest": "crest_serra-blava.svg",
      "players": [
        {"id": "sbv-01", "name": "Marc Ferrer", "number": 1, "position": "GK", "age": 27, "look": {"face": 2, "hair": 3, "skin": 2}, "attributes": {"reflexes": 78, "positioning": 74, "stretch": 76, "rushing": 68, "stickPlay": 62}},
        {"id": "sbv-12", "name": "Pau Giralt", "number": 12, "position": "GK", "age": 21, "look": {"face": 4, "hair": 1, "skin": 3}, "attributes": {"reflexes": 64, "positioning": 61, "stretch": 66, "rushing": 55, "stickPlay": 50}},
        {"id": "sbv-03", "name": "Joan Vilar", "number": 3, "position": "DEF", "age": 29, "look": {"face": 1, "hair": 2, "skin": 2}, "attributes": {"speed": 66, "acceleration": 64, "agility": 62, "control": 70, "dribbling": 58, "passing": 64, "shotPower": 60, "shotAccuracy": 58, "marking": 80, "tackling": 78, "physical": 76, "stamina": 72, "vision": 68}},
        {"id": "sbv-05", "name": "Oriol Pons", "number": 5, "position": "DEF", "age": 24, "look": {"face": 3, "hair": 4, "skin": 1}, "attributes": {"speed": 70, "acceleration": 72, "agility": 68, "control": 66, "dribbling": 62, "passing": 66, "shotPower": 62, "shotAccuracy": 60, "marking": 74, "tackling": 72, "physical": 70, "stamina": 74, "vision": 64}},
        {"id": "sbv-07", "name": "Ricard Soler", "number": 7, "position": "DEF", "age": 31, "look": {"face": 5, "hair": 1, "skin": 4}, "attributes": {"speed": 62, "acceleration": 60, "agility": 60, "control": 68, "dribbling": 56, "passing": 70, "shotPower": 58, "shotAccuracy": 62, "marking": 78, "tackling": 74, "physical": 78, "stamina": 68, "vision": 72}},
        {"id": "sbv-08", "name": "Nil Camps", "number": 8, "position": "MID", "age": 26, "look": {"face": 2, "hair": 5, "skin": 2}, "attributes": {"speed": 74, "acceleration": 74, "agility": 76, "control": 78, "dribbling": 72, "passing": 80, "shotPower": 66, "shotAccuracy": 68, "marking": 62, "tackling": 60, "physical": 64, "stamina": 78, "vision": 82}},
        {"id": "sbv-10", "name": "Biel Roca", "number": 10, "position": "MID", "age": 23, "look": {"face": 6, "hair": 3, "skin": 3}, "attributes": {"speed": 76, "acceleration": 78, "agility": 80, "control": 80, "dribbling": 78, "passing": 76, "shotPower": 70, "shotAccuracy": 70, "marking": 58, "tackling": 56, "physical": 62, "stamina": 76, "vision": 78}},
        {"id": "sbv-09", "name": "Adrià Mas", "number": 9, "position": "FWD", "age": 28, "look": {"face": 4, "hair": 2, "skin": 1}, "attributes": {"speed": 80, "acceleration": 82, "agility": 78, "control": 76, "dribbling": 80, "passing": 68, "shotPower": 84, "shotAccuracy": 82, "marking": 50, "tackling": 48, "physical": 66, "stamina": 74, "vision": 70}},
        {"id": "sbv-11", "name": "Lluc Bosch", "number": 11, "position": "FWD", "age": 25, "look": {"face": 1, "hair": 6, "skin": 2}, "attributes": {"speed": 82, "acceleration": 80, "agility": 84, "control": 78, "dribbling": 84, "passing": 66, "shotPower": 78, "shotAccuracy": 76, "marking": 46, "tackling": 44, "physical": 60, "stamina": 72, "vision": 68}},
        {"id": "sbv-14", "name": "Eloi Prat", "number": 14, "position": "FWD", "age": 20, "look": {"face": 3, "hair": 4, "skin": 3}, "attributes": {"speed": 78, "acceleration": 80, "agility": 80, "control": 72, "dribbling": 76, "passing": 64, "shotPower": 74, "shotAccuracy": 72, "marking": 48, "tackling": 46, "physical": 58, "stamina": 70, "vision": 64}}
      ]
    }
  ]
}
```

COPIA DESDE AQUÍ ↓

````
Necesito datos de equipos INVENTADOS para un videojuego de hockey sobre patines. Devuelve ÚNICAMENTE un bloque de código JSON válido (sin comentarios, sin texto antes ni después) con este formato EXACTO (te pego un ejemplo de un equipo; respeta los nombres de los campos, los tipos y los valores permitidos):

[PEGA AQUÍ EL EJEMPLO JSON DE ARRIBA]

Genera [3] equipos: [LISTA DE CIUDADES, p. ej. Reus, Igualada, Lloret]. La ciudad puede ser real; el nombre del club, el apodo y los colores son inventados y no se parecen a ningún club real. Cada equipo tiene 10 jugadores: 2 porteros (dorsales 1 y 12) y 8 de pista (3 DEF, 2 MID, 3 FWD), dorsales únicos entre 1 y 99.

Reglas:
- Abreviaturas (abbr) de 3 letras mayúsculas, únicas entre todos los equipos. "id" en minúsculas con guiones.
- Atributos entre 40 y 90 (un 95-99 solo para una leyenda por liga). Media del equipo entre 60 y 76. DEF altos en marking/tackling/physical; FWD altos en shotPower/shotAccuracy/dribbling/speed; MID altos en passing/vision/stamina. Los porteros solo llevan los 5 atributos de portero.
- "look": face, hair y skin son enteros del 1 al 6.
- Nombres de personas inventados (mezcla catalanes, castellanos y algún otro origen), sin nombres de jugadores reales de ningún deporte. No repitas nombres ni apellidos entre equipos.
- colors.primary, colors.secondary y goalkeeperColor en hexadecimal #RRGGBB, el del portero muy distinto de los otros dos. kitPattern, style, defenseSystem y arena solo con los valores del ejemplo.
- Cada colors.primary y colors.secondary debe ser distinto del de los demás equipos (que se distingan bien desde lejos).

Antes de contestar, comprueba tú mismo: JSON válido, dorsales no repetidos, 10 jugadores por equipo, abreviaturas únicas, atributos dentro de rango.
````

HASTA AQUÍ ↑

**Para los 12 equipos de la liga:** pídeselo **de 3 en 3 equipos** (4 mensajes) para que no se corte ni se equivoque. Me pasas los 4 resultados y yo los junto en un solo archivo.

---

## Ficha 5 — Cómo registrar en CREDITS.md los archivos generados con IA

**Regla de CLAUDE.md:** todo asset va registrado en `CREDITS.md` con fuente, autor y licencia. Los archivos hechos con ChatGPT **no son CC0** ni de un tercero: se registran como **«Generado con IA»**, con la herramienta, la fecha y el texto con el que se pidió.

**Qué me tienes que dar con cada archivo** (en el mismo mensaje en que me lo pasas):
1. **Qué es** y para qué (una frase).
2. **El texto que le diste a ChatGPT** (el prompt), completo.
3. **La fecha** en que lo generaste y **qué ChatGPT usaste** (plan y modelo, si lo ves en pantalla).
4. **Una confirmación tuya:** «lo he revisado y no se parece a ninguna marca, escudo, camiseta ni patrocinador reales».
5. Si ChatGPT te mostró algún **aviso** (de derechos, de contenido), pégamelo.

**Qué hago yo:** añado una fila por archivo a `CREDITS.md`, en una sección nueva «Assets generados con IA», con este formato:

| Archivo | Descripción | Herramienta y fecha | Prompt | Licencia / permiso | Revisado por | Estado |
|---|---|---|---|---|---|---|
| `public/assets/crests/crest_serra-blava.svg` | Escudo del club inventado Patins Serra Blava | ChatGPT (modelo y plan indicados por Guillem), 2026-10-12 | `docs/prompts/crest_serra-blava.txt` | Generado con IA; uso en el juego según los términos de OpenAI vigentes en esa fecha | Guillem (marca/escudo real: descartado) | Final |
| `docs/concept/concept_01_pista-tv-azul.jpg` | Arte conceptual del plano TV general (suelo azul) | ChatGPT, 2026-10-12 | `docs/prompts/concept_01.txt` | Generado con IA; solo referencia, no se distribuye con el juego | Guillem | Referencia |

- El **prompt completo** lo guardo como texto en `docs/prompts/` (un archivo por asset o por lote) y en la tabla pongo la ruta.
- **Estado:** `Referencia` (no entra en el juego), `Borrador` (provisional) o `Final` (entra en el juego).
- **Licencia:** **no pongo CC0** en estos archivos. Pongo «Generado con IA; uso según términos de OpenAI vigentes en [fecha]». **Guarda tú una captura o el enlace de los términos de uso de tu plan el día que generes** (los términos pueden cambiar) y dime la fecha.
- **Lo que no puedo garantizar:** que un archivo generado con IA tenga derechos de autor registrables en todos los países (en algunos no los tiene) ni que sea único. Por eso: **nada de copiar un estilo o un diseño reconocible de una marca o club real**, aunque ChatGPT lo permita.
- Si **ChatGPT genera algo que se parece a una marca real**, no se usa y se vuelve a generar. Yo también reviso lo que me pases y te aviso si algo me parece sospechoso.

### Lista final antes de pasármelo (marca todo)

- [ ] No hay ningún escudo, camiseta, patrocinador, logo, pabellón o nombre reales (ni parecidos).
- [ ] No hay texto legible raro, ni marcas de agua, ni firmas.
- [ ] El tamaño y el formato son los pedidos (o el más cercano) y la imagen está **nítida**.
- [ ] El nombre del archivo sigue el patrón de esta ficha.
- [ ] Te acuerdas del **prompt**, la **fecha** y has hecho la **confirmación** del punto 4.
- [ ] Para el JSON: ChatGPT ha comprobado dorsales, abreviaturas, 10 jugadores por equipo y rangos.

## Qué hago yo con cada cosa (resumen)

| Qué me pasas | Dónde lo guardo | Cuándo se usa |
|---|---|---|
| Arte conceptual (10 imágenes: 01, 01N, 02-09) | `docs/concept/` (no entra en el juego); las 3 de estilo ya están en `docs/concept/style/` | Guía de arte de F4; elegir el suelo por defecto |
| Escudos (SVG) | `public/assets/crests/` | Marcador y menús (F2 / F4) |
| Hojas de equipación | `docs/concept/kits/` como referencia; el dibujo se construye por código con colores lisos | Equipaciones (F2 / F4) |
| Atlas de vallas (SVG → PNG/KTX2, 1024×512) y logo central (SVG) | `public/assets/textures/` | Pista y vallas (F4) |
| Suelos (azul, parquet, crema) y modo neón | **Sin archivos:** colores, patrón de parquet y luz por código (un «tema» de pabellón como datos) | F4 |
| `teams.json` | `src/data/teams.json` | Equipos de F2; liga de 12 de F5 |
| Prompts y créditos | `docs/prompts/` y `CREDITS.md` | Siempre |
