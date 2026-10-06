# 03 — Jugabilidad: física, controles, regates, cámara e IA

Todos los números son valores iniciales para afinar. Viven en src/config/tuning.ts y se pueden tocar en vivo desde un panel de debug (solo en build de desarrollo).

## 1. Sensación de patinaje
- Simulación a 60 Hz con paso fijo; render interpolado.
- Jugador = cápsula en el plano de la pista con inercia real de patinador:
  - Velocidad máx. normal (también conduciendo): ~8,4 m/s. Sprint sin bola: ~12,6 m/s (~45 km/h, valor de Guillem en la ronda 1, pendiente de valorar en el móvil; un jugador real ronda 30-35 km/h); con bola ~9,3 m/s. Giro a velocidad más abierto y caro que en F0 (radio mínimo ~9 m a 8,4 m/s), deslizamiento al planear más corto. Valores de fábrica = ajustes de Guillem en la ronda 1 (2026-10-02).
  - Aceleración desde parado: curva no lineal (arranca fuerte), ~0 → 90 % de la máxima normal en ~1,5 s.
  - **Empujón de sprint**: al entrar en sprint (zona exterior del joystick, Shift, mando) hay un impulso breve (~0,25 s de aceleración extra que puede pasar un poco del tope de sprint), con un tiempo de recarga para que no se pueda encadenar; al salir del sprint, desaceleración suave y natural hasta la velocidad normal.
  - Giro: radio mínimo crece con la velocidad (a tope no se gira en seco). Giro cerrado = pérdida de velocidad.
  - **Trencada (corte lateral de 4 ruedas que redirige)** (petición de Guillem, opción A, 2026-10-02; equilibrada en v0.1.8-v0.1.10): a ≥ 5 m/s, si el joystick gira **de golpe** (en ≤ 0,15 s) a entre 60° y 126° de la marcha. Dos fases: **(1) frenada previa** (~0,3 s; era 0,5 s en v0.1.8) derrapando en la dirección vieja, perdiendo ~35 % de la velocidad y empezando a girar el cuerpo — es el tiempo de reacción del rival; **(2) giro** (~0,18 s; era 0,25 s hasta v0.1.9) de lado hacia la nueva dirección. Maniobra completa ~0,48 s (era ~0,75 s en v0.1.8). Sale a ~38 % de la velocidad que llevaba, con un empujón suave (8 m/s² durante 0,2 s), y durante 0,6 s no puede esprintar aunque el pulgar esté en el anillo: tiene que reacelerar. El empujón de salida comparte recarga con el de sprint. Recarga de la trencada 0,8 s **contados desde el final de la maniobra**. Volver el joystick a la dirección antigua (también durante la frenada previa) la cancela. Las curvas normales no la disparan; por encima de 126° es la frenada-derrape. Con bola, se separa del stick (separación extra reducida por el atributo Control). Opción "solo con sprint" (Sí/No, por defecto No).
  - **Frenada de 4 ruedas (derrape)** (sustituye a la frenada "en T" de F0; petición de Guillem): al llevar el joystick en sentido contrario a la marcha, o al soltarlo de golpe a velocidad (levantar el pulgar), el jugador no se para en seco: sigue deslizando en la dirección que llevaba, pierde la velocidad en ~0,4-0,6 s y gira un poco el cuerpo hacia el lado del derrape. Si se vuelve a empujar hacia delante, el derrape se cancela. Con la bola en el stick a velocidad alta, el derrape la separa del stick (misma regla de separación de la conducción). Sonido de ruedas y chispas: F4.
  - Deslizamiento: si en vez de soltar de golpe se devuelve el joystick al centro poco a poco, el jugador planea y desacelera suave, nunca se para de golpe.
  - Contacto: empujones hombro con hombro según Físico; nunca atravesar jugadores ni la valla.
- Resistencia: el sprint la gasta; baja → menor aceleración y peor control. Cambios recuperan.

## 2. Bola
- Física 3D propia: posición con altura (z), rodadura, fricción, giro.
- Rebote en valla con pérdida de energía (~0,7) y algo de aleatoriedad determinista. Rebote en postes y travesaño.
- La bola puede ir por el aire (pase alto fuerte, vaselina, tiro alto) y botar.
- **Pase alto fuerte** (el elevado habitual en hockey patines, decidido por Guillem 2026-10-03; física real desde v0.1.14): sale del stick desde el suelo, sube, alcanza poca altura y baja de forma natural cerca del receptor. Es **balística real**: al soltar se calcula el ángulo de salida para que la altura máxima sea ~0,8 m sobre esa distancia (nunca más empinado que 25°, que es el que usan los pases cortos) y la velocidad para que caiga 1 m antes del receptor (máximo 28 m/s); si a esa altura no llega ni a la velocidad máxima (pases muy largos), sale a 28 m/s con el ángulo justo un poco más alto para que llegue igualmente (v0.1.15); después solo actúan gravedad, rebote y rodadura. Alcance: los tres tipos de pase cruzan la pista de valla a valla (~39 m); el alto fuerte se mantiene bajo (≤ 0,9 m) hasta ~20 m y sube algo más lejos (~1,5 m a 30 m). El ángulo de caída ya no se ajusta: lo da la física (≈ el de salida, algo más empinado por el aire). La **vaselina** es el arco alto (30°) de siempre, también física pura, manteniendo más tiempo.
- Conducción: la bola va "imantada" al stick con un margen; a más velocidad y peor Control, más se separa y más fácil es robarla. Nunca debe parecer pegada con pegamento.
- Tiro: potencia ~15-30 m/s según carga y atributo. Precisión con cono de error que se reduce con atributo y tiempo de preparación.

## 3. Controles (dos esquemas, seleccionables y combinables)
### A. Joystick + botones (por defecto)
- Joystick virtual flotante (aparece donde pones el pulgar izquierdo, mitad izquierda de la pantalla).
- **Velocidad analógica y sprint en el joystick** (cambio de diseño pedido por Guillem, 2026-10-02; antes el sprint era REGATE mantenido): cuanto más lejos del centro, más rápido. Zona muerta central → no se mueve; de ahí hasta el **umbral de sprint** (90 % del recorrido por defecto) la velocidad sube de 0 a la máxima normal (7,5 m/s) según una **curva de respuesta** (1 = lineal, más = más precisión al principio; por defecto 1,5); desde el umbral = **sprint** (~9 m/s). Un anillo en el joystick marca dónde empieza el sprint y se ilumina (junto con el pulgar) mientras esprintas; un margen anti-parpadeo evita entrar y salir en la frontera. El umbral se ajusta en el panel entre 70 % y 130 % (más de 100 % = arrastrar el pulgar más allá del borde del círculo). Todo lo que depende del sprint (separación de la bola, y en el futuro la resistencia) usa esta definición.
- Botones (derecha), grandes, semitransparentes, posiciones editables (de momento desde el panel de afinación, sección "Botons"; editor de arrastrar en F1.7):
  - PASE (**potencia y altura separadas**, decidido por Guillem, opción A, v0.1.17): el pase sale **al soltar** el botón. **Altura** = deslizar el dedo hacia arriba sobre Passada mientras lo mantienes: sin deslizar = **bajo (raso)**; ~1 cm (60 px, ajustable) = **alto fuerte**; ~2 cm (120 px) = **vaselina**; se puede cambiar de idea moviendo el dedo antes de soltar. **Potencia** = cuánto se mantiene: un **toque** (< 0,2 s) = potencia automática; manteniendo, la potencia sube de 0 a 1 en 0,6 s (ajustable). Raso cargado = más rápido (hasta 30 m/s); alto fuerte cargado = más rápido y más plano al mismo compañero; sin compañero, la potencia da la distancia. Mientras se mantiene, un **arco** alrededor del botón se llena con la potencia y su **color** es la altura: blanco (bajo), naranja (alto fuerte), morado (vaselina); la **flecha en el suelo** muestra la dirección FINAL del pase (con la corrección de la asistencia), su longitud = la fuerza y el mismo color; tras un toque aparece un instante. La flecha se activa/desactiva en Configuració; longitud y grosor en el panel. Con el joystick suelto se pasa hacia donde mira el jugador. **Receptor**: el compañero más alineado con la dirección apuntada dentro del cono de la asistencia (a igual ángulo, el más cercano), **elegido al pulsar** el botón: un anillo celeste en el suelo lo marca mientras llevas la bola y se queda fijo mientras mantienes (se puede quitar en el panel). **La asistencia solo actúa al soltar** (dirección y fuerza); después la bola es física pura. **Fuerza automática** (v0.1.17): raso → la velocidad justa para que llegue al receptor a ~14 m/s (sale entre 17 y 30 m/s: rápido y seco); alto fuerte → balística inversa que sube ~1,2 m (como mucho 25° de salida, máximo 20 m/s) y cae 1,5 m antes del receptor, claramente más lento que el raso a distancias cortas y medias; vaselina → arco a 30° que cae ~1 m antes. Sin receptor: raso a 18 m/s; alto fuerte a 18 m (30 m cargado); vaselina 6-30 m según la potencia. **Anticipación**: el pase va a donde estará el stick del receptor (tu error de apuntado se mide respecto a donde VES al compañero). **El receptor** va al punto de encuentro como un jugador normal y tiene una **zona de recepción** de 0,65 m (en F1.4c su parte exterior será un control difícil). Sin asistencia, el receptor es el compañero hacia el que va de verdad la bola. El que pasa nunca persigue ni bloquea su propio pase. **Error**: pequeño y determinista, mayor a sprint, con presión, derrapando o en trencada, y en los pases altos; el atributo Pase lo reduce.
  - TIRO: toque = tiro rápido. Mantener = carga (barra) y soltar. Deslizar el dedo al soltar = dirección/efecto (arriba = tiro alto).
  - REGATE: pulsar = finta/regate contextual según dirección (sale al pulsar). Ya no hace sprint.
  - En defensa: PASE → cambiar jugador, TIRO → entrada/robo, REGATE (mantener) → presionar. El sprint, también en defensa, es la zona exterior del joystick.
- **Quién controlas (diseño final, decidido por Guillem 2026-10-02, "como el FIFA")**:
  - En ataque, **el control pasa al receptor del pase**: en cuanto sale el pase hacia un compañero, controlas a ese compañero (la cámara y el joystick lo siguen con una transición suave) y el que pasó se mueve solo con un movimiento de apoyo. Si un compañero recoge una bola suelta, también pasas a controlarlo a él.
  - Tras el cambio, el joystick que llevabas apretado (apuntando el pase) no mueve al nuevo jugador: él va solo a por la bola hasta que sueltas el joystick o lo giras claramente (≥ 45°). Con el joystick suelto, el jugador controlado va a buscar el pase que le llega.
  - Un anillo amarillo en el suelo marca al jugador controlado; cada jugador lleva su número encima (provisional hasta F4).
  - **Pase perdido** (v0.1.16, decidido por Guillem, opción B): si el pase "muere" sin que nadie lo toque (choca con algo, se para o pasa de largo fuera del alcance del receptor), el control pasa automáticamente al compañero más cercano a la bola (interruptor en el panel, activado por defecto).
  - **Cambio de jugador** (adelantado de F2 a petición de Guillem, v0.1.17): **automático** mientras la bola está suelta (nadie del equipo la lleva) — el control pasa al compañero más cercano a la bola, con histéresis para que no parpadee (tiene que estar 1,5 m más cerca que el tuyo durante 0,25 s, y no antes de 0,6 s desde el último cambio; todo ajustable, con interruptor); y **a voluntad** con el botón **Canvi** (pequeño, a la izquierda de Passada; posición y tamaño en el panel "Botons"), tecla **Q** o botón **Y** del mando: te pasa al compañero más cercano a la bola (si ya lo eres, al siguiente; si un compañero lleva la bola, a él). Tras estos cambios el joystick mueve al nuevo jugador al instante (solo tras un pase se ignora hasta soltarlo). En F2 se reutilizará en defensa.
  - Banco de pruebas F1.4 (sin rivales): 2 compañeros que ofrecen línea de pase a los lados y por delante del que lleva la bola (cada uno con su ritmo y una posición que varía un poco, para no ir "en espejo"), van a buscar el pase, recogen bolas lentas cerca de ellos. Interruptor de afinación "El control passa al receptor" (Sí por defecto); con No, sigues con tu jugador y el compañero te devuelve la bola a los 0,5 s, del mismo tipo (raso o elevado) que la recibió.
- Buffer de input de 150 ms (si pulsas un poco antes de recibir, la acción sale al recibir).
- Asistencia al pase y apuntado configurable (Desactivada / Ligera / Fuerte), en Configuració (por defecto **Ligera**):
  - Desactivada: el pase va exactamente donde apuntas, raso a fuerza fija (14 m/s); nadie es "receptor" de antemano.
  - Ligera: cono ±25° para elegir compañero, corrige el 70 % de la dirección hacia él (apuntar sigue importando), fuerza automática.
  - Fuerte: cono ±45°, corrige el 100 %, fuerza automática.
  - Los compañeros de la IA pasan siempre con asistencia Fuerte (y con su propio error según su atributo Pase).

### B. Gestos
- Mano izquierda igual (joystick, con su velocidad analógica y su zona de sprint). Mano derecha: deslizar corto = pase en esa dirección, deslizar largo hacia portería = tiro (longitud = potencia), doble toque = regate.

### PC
- Teclado: WASD/flechas = patinar a la velocidad normal máxima (las teclas no son analógicas), Shift = sprint, J = pase (mantener = más potencia), **U** mantenida = pase alto fuerte, **U dos veces** (mantenida) **o Shift+U** = vaselina, K/Espacio = tiro, L = regate, **Q** = cambio de jugador.
- Mando (Gamepad API): stick izquierdo analógico (a fondo = sprint), RB/RT = sprint, A = pase (mantener = más potencia), **LB** = pase alto fuerte, **LB+RB** = vaselina (entonces RB no esprinta), B = tiro, X = regate, **Y** = cambio de jugador.

### Feedback
- Vibración háptica corta (Vibration API) en tiro, gol, choque y poste. Desactivable.

## 4. Regates (el corazón del juego)
Se ejecutan con REGATE + dirección relativa al defensor. Éxito según atributo Regate, velocidad, timing y posición del defensor.
| Regate | Input | Uso |
|---|---|---|
| Amago de tiro | Mantener TIRO y cancelar con REGATE | Tumbar al portero o al defensa |
| Cambio de lado (derecha ↔ revés) | REGATE + lateral | Superar en carrera |
| Ruleta 360° | REGATE + giro de joystick | Proteger la bola y salir |
| Bola entre patines/piernas del rival | REGATE + hacia el defensor (timing) | Alto riesgo, alto premio |
| Vaselina (bola por encima) | REGATE + hacia el defensor mantenido | Superar stick tumbado o portero adelantado |
| Pared con la valla | PASE contra la valla en la dirección | Autopase rodeando al defensor |
| Juego por detrás de la portería | Conducir por detrás + TIRO | Remate de "cuchara" o pase atrás |
- Encadenar 2 regates con buen timing da un pequeño impulso de velocidad (recompensa el estilo).
- Animaciones de regate de 0,3-0,6 s, cancelables tras su ventana activa para no sentirse lento.

## 5. Porteros
- Postura base de rodillas/agachado, desplazamiento lateral, estirada de piernas (protecciones grandes), parada con stick, guante y cuerpo; se tumba.
- IA de portero: posición según ángulo de la bola, anticipa pase atrás, sale en 1 vs 1, reacciona a amagos (puede picar).
- Control manual del portero opcional en libres directos/penaltis cuando defiende el jugador humano: deslizar para estirarse.

## 6. Cámara (sistema de presets)
Cambio de diseño pedido por Guillem (2026-10-02, F1.2b): en vez de una sola cámara con "distancia en 3 niveles", hay **un único sistema de cámara con presets**. Cada preset calcula una pose (posición, punto al que mira, apertura); al cambiar de preset la cámara hace una **transición suave** (sin salto). Las cámaras especiales se añadirán como presets nuevos sin rehacer el sistema.

Presets elegibles por el jugador (botón pequeño en pantalla 🎥 y opción en Configuració; se recuerda la última elegida entre partidas):
1. **TV lateral** (por defecto): cámara elevada en la grada central, vista de retransmisión abierta; sigue un punto entre el jugador controlado y la bola con anticipación (lookahead según velocidad), suavizado crítico (sin vibrar) y algo de zoom abierto a velocidad.
2. **Cercana**: más baja y cerca, sigue al jugador y a la bola también a lo ancho de la pista; para regatear y tirar con detalle.
3. **Alta / táctica**: más elevada y abierta (en el centro se ve la pista entera); para leer pases y posiciones.

Todos los parámetros de cada preset (altura, distancia, apertura/zoom, suavizado, anticipación, peso bola/jugador, seguimiento a lo largo y a lo ancho) viven en `src/config/tuning.ts` (`cameraTv`, `cameraClose`, `cameraTactical`, y `camera.transitionTime`) y se ajustan desde el panel de afinación del móvil.

Ninguna cámara debe dejar al jugador ni a la bola bajo el joystick o los botones (test e2e), y todas deben mantener 60 fps en el Pixel 8a.

Presets especiales futuros (F3+): detrás del lanzador en directas/penaltis; repeticiones (detrás de portería, a ras de pista, cenital).

## 7. IA de equipo
- Arquitectura: equipo (táctica) → roles → jugador (decisiones con utilidad + steering).
- Sistemas defensivos: zona en cuadrado, zona en rombo, individual, presión alta. Cada equipo tiene uno preferido y cambia según el marcador/tiempo.
- Ataque: ocupar espacios, pases de apoyo, desmarques al segundo palo, uso de la valla y de la zona tras portería, aprovechar superioridad numérica.
- Decisión del jugador IA con bola: tirar / pasar / regatear / proteger según ventaja, presión y atributos.
- Reacciona a inferioridad (más conservador) y a falta de equipo cercana a la 10ª/15ª (defiende con menos contacto).
- Dificultad cambia tiempo de reacción, calidad de decisión y agresividad, no velocidades.

## 8. Árbitro
- Detección de faltas por reglas: contacto desde atrás, golpe de stick al cuerpo, stick alto, obstrucción, zancadilla, retención.
- Gravedad según velocidad del impacto, posición y si cortaba ocasión manifiesta (último defensor, bola controlada, dirección a portería).
- Ley de la ventaja cuando el atacante sigue con la bola en ataque.

## 9. Medir que "se siente bien"
- Latencia input → movimiento visible ≤ 50 ms.
- Ningún frame > 33 ms en partido en Pixel 8a.
- Un jugador nuevo marca un gol en el modo entrenamiento en menos de 60 s.
- Sesiones de prueba: Guillem graba 30 s de pantalla y lista 3 cosas que se sienten mal; se ajusta tuning.ts.
