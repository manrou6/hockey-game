# Plan F1.6: regates, aixecar y picar, juego detrás de la portería, amago de tiro y primer rival

> **Propuesta para Guillem. No hay nada implementado.** Bloque 2, entregable F (2026-10-09). Está hecho sobre el código de la v0.1.29 (commit 00fc599) y tiene en cuenta la auditoría §A (`docs/audit/A.md`, hallazgo 1). Las decisiones de diseño que cambian lo que ya está en /docs están en el §9, cada una con una recomendación, y **no se aplica ninguna sin el sí de Guillem** (CLAUDE.md). Los cambios técnicos internos se anotarán en DECISIONS.md al hacerse.

## 0. En 10 líneas (para Guillem)
1. F1.6 añade **5 regates** con REGATE + joystick: cambio de lado, finta de cuerpo, ruleta, bola entre los patines del rival y amago de tiro. Además: **aixecar** (levantarte tú la bola), **aixecar + picar** (rematarla en el aire), **juego por detrás de la portería** y un **rival de prueba** al que regatear.
2. Primero llega el rival (F1.6a), porque sin él no se puede medir si un regate funciona. Después, los regates (b, c), el amago (d), aixecar (e), picar (f), detrás de la portería (g) y la **ronda 3** contigo (h).
3. **Gesto de aixecar.** El plan parte de la **opción A**: deslizar el pulgar derecho por la zona libre del centro de la pantalla. La **opción B**, la que preferiste el 08-10, es arrastrar en diagonal arriba-derecha sobre Regat. En el §4 se comparan las dos. Recomiendo **A**, pero propongo dejar **las dos activas durante la ronda 3** para que elijas probándolas en el móvil. La simulación es la misma para las dos.
4. **Picar** es el remate en el aire que ya existe (F1.5d/e), aplicado a tu propia levantada: Xut en la ventana, con el anillo dorado, el timing y la vibración. Opcionalmente también se podrá picar deslizando el dedo hacia la portería.
5. Mientras la bola que te has levantado está en el aire, **el joystick solo apunta** (igual que con el alto fuerte desde la v0.1.29) y sigues yendo a por ella. Así no la pierdes al apuntar a la portería.
6. Cada sub-paso trae su banco de pruebas con objetivos numéricos y una lista de qué probar en el Pixel. Sin el rival, todo lo de antes tiene que salir **idéntico** (pase, tiro, volea, rechaces).
7. Hay 15 decisiones en el §9. Las más importantes son la 1, 2, 3, 6, 7 y 10.

## 1. Objetivo
Que **regatear «se sienta bien»**, porque es el pilar 3 del GDD («el 1 contra 1 es el corazón del juego») y el criterio de aceptación de F1 (docs/06): «Guillem dice que conducir y regatear "se siente bien" tras una ronda de ajustes». En concreto:
- Al menos 5 regates de la tabla de docs/03 §4, con animación provisional (docs/06 F1), que salen al pulsar, son cancelables tras su parte activa y tienen éxito según el timing, la posición del rival y el atributo Regate.
- Aixecar y el combo aixecar + picar, sin ningún botón nuevo (decisión de Guillem del 2026-10-08), siempre con la bola por debajo de 1,50 m (reglamento, art. 6.3).
- Poder jugar detrás de la portería: patinar por detrás, pasar desde ahí y rematar de «cuchara». Para eso hacen falta cámara, colisiones con la portería, la red y la valla, y pases y tiros que funcionen desde esa zona.
- Un rival básico (quieto o que encara) que basta para probar regates y amagos. No es la IA de F2.
- Una ronda 3 de afinación con Guillem en el Pixel 8a.

Fuera de F1.6: la IA de equipo y la defensa en «cuadro» (F2), el portero (F1.8; el amago y la cuchara le dejarán preparada la señal), las faltas (F3), el editor de botones y el esquema de Gestos (F1.7) y el menú de retos de Entrenamiento (docs/06 F1, sub-paso aparte).

**Requisito previo:** F1.5 sigue abierta hasta que la volea le guste a Guillem (docs/06). F1.6a-d no tocan la volea; F1.6e-f sí. Ver la decisión 0.

## 2. Punto de partida (v0.1.29, verificado en el código)
- **Regat no hace nada todavía.** El botón registra la pulsación (`src/input/actionButtons.ts`, solo al apoyar el dedo, sin seguir el arrastre), igual que la tecla L y el botón X del mando. La simulación la guarda 0,2 s en el búfer (`p.bufDribble`, `src/sim/dribble.ts` `bufferActions`), pero ningún código la usa.
- **Regat mantenido ya no es sprint.** El encargo lo menciona, pero desde la v0.1.5 el sprint es la zona exterior del joystick (docs/03 §3A). Hoy mantener Regat no hace nada. En defensa (F2), docs/03 lo reserva para «presionar».
- **No hay rivales.** `createWorld(seed, mates)` solo crea al equipo 0. Pero todo lo que ya existe reacciona a un jugador de otro equipo en cuanto aparece:
  - `pressureOn` separa más la bola al conducir (+0,4 m con presión máxima a menos de 1,8 m; `dribble.pressureSeparation`, `pressureRadius`).
  - Sube el error del pase (+4° con presión máxima, `pass.errorPressure`).
  - Los jugadores ya chocan entre sí (`collidePlayers`) y la bola choca con su cuerpo (evento `player`).
  - El error del tiro por presión está preparado pero a 0 (`shot.ctxPressure`).
- **La trencada choca con «REGATE + lateral».** A ≥ 5 m/s, girar el joystick de golpe (en ≤ 0,15 s) a 60-126° de la marcha inicia una trencada (`cut.*`), y más allá de 126° una frenada-derrape. Un regate lateral o una ruleta hechos con el joystick dispararían también esas maniobras si no se resuelve. Es el mismo mecanismo que P12 (el golpe de joystick a sprint desvía el pase).
- **Remate en el aire.** Con el balón del jugador controlado, `volleyStep` (`src/sim/world.ts`) predice el contacto (`predictContact`), abre la ventana y remata con Xut. Hay tres detalles que afectan a la levantada propia:
  - **(a)** La ventana se cierra si el jugador tiene `noPickupTicks > 0`, y soltar la bola (`releaseBall`) se los pone durante 0,3 s (`dribble.relockTime`). Con una levantada propia, la ventana no se abriría hasta pasados 0,3 s.
  - **(b)** «El joystick solo apunta» (`humanCommand`) solo se aplica si el jugador es el `receiver`, y `findReceiver` descarta a quien tiene `noPickupTicks`.
  - **(c)** El arreglo de la v0.1.29 (`aerialPass = passTo === controlled && passAir > 0 && inAir`, `world.ts:453`) solo cubre el alto fuerte que llega por el aire, es decir, el que sale a menos de 16,5 m del stick. La auditoría §A (hallazgo 1) midió que con pases de 17,9-20 m y el joystick a fondo hacia la portería se pierden sin tocar 11-14 de 24.

  Con una levantada propia no hay ningún pase (`passTo = -1`, `passAir = 0`). Si hoy apuntas el joystick a la portería mientras la bola está en el aire, tu jugador patina hacia allí y la bola cae donde ya no estás: el mismo fallo que la v0.1.29 arregló para el alto fuerte. **El plan lo resuelve en F1.6e** (ver «Regla única: el joystick solo apunta»).
- **Tirar desde detrás de la portería apunta a la red de atrás.** `planShot` (`src/sim/shot.ts`) apunta a la portería con el joystick suelto a ≤ 10 m (`releasedNear`). Si la bola está detrás de la línea de gol, el tiro va al centro de la portería atravesando la red. Además, `needsTurn` hace una media vuelta hacia ella, y la retícula se dibuja en un sitio imposible.
- **Espacio detrás de la portería.** Entre la red de atrás (a ras de suelo, 0,92 m detrás de la línea de gol) y la valla de fondo quedan 1,88 m. El jugador mide 0,6 m de diámetro, así que cabe. A 8,4 m/s, el radio de giro mínimo es de ~9 m: rodear la portería obliga a frenar, como en la realidad. La pared con la valla (`wallPass.ts`) solo usa las vallas laterales. Los rechaces en la valla de fondo y en las esquinas ya están medidos (docs/03 §2).
- **Pantalla del Pixel 8a en horizontal (≈ 915 × 412 px CSS, DECISIONS 2026-10-09):**
  - Joystick: nace en x < 366 (40 % izquierdo).
  - Xut: x 781-881 / y 278-378.
  - Passada: x 673-757 / y 304-388.
  - Regat: x 779-863 / y 178-262, justo encima de Xut.
  - Canvi: x 591-653 / y 298-360.
  - Pausa, cámara y panel: arriba a la derecha (~60 px).
  - **Zona libre:** la franja x 366-575 en toda la altura bajo la barra de arriba, más la banda por encima de los botones (x 575-915, y 70-170), siempre a ≥ 16 px de cualquier botón.

## 3. Gestos: la base del plan (opción A)
**Una sola idea: «la zona libre es el juego por el aire».** El pulgar derecho desliza desde la zona libre:
- **Con la bola en el stick:** deslizar = **aixecar**. La levantada sale hacia donde patinas (o hacia donde miras si vas despacio). El gesto solo la dispara: su dirección no importa, siempre que vaya hacia arriba o hacia la portería (±75°). Cuenta si recorre ≥ 40 px en ≤ 0,35 s y empieza a ≥ 16 px de un botón.
- **Con la bola en el aire y la ventana abierta** (tu levantada o un pase de un compañero): deslizar **hacia la portería** = **picar / volea**. Es el plan A del 2026-10-09:
  - **Esquina:** la dirección del dedo respecto a la línea jugador→portería en la pantalla, ampliada según el nivel de asistencia.
  - **Altura:** corto (40-110 px) = raso; largo (> 110 px) = alto. El picado solo sale con el arrastre diagonal de Xut.
  - **Momento:** cuando levantas el dedo, como al soltar Xut.
  - Solo cuenta una vez por bola.
- **Xut sigue funcionando** siempre en la ventana (F1.5d), así que el deslizamiento es opcional.
- Regat se queda **solo para los regates**: el toque sale al pulsar, sin retraso y sin ambigüedad.
- Teclado: **U + L** = aixecar (U es el modificador «por arriba», como en el pase y el tiro). Picar = K/Espacio en la ventana. Amago = K mantenida + L.
- Mando: **LB + X** = aixecar. Picar = B en la ventana. Amago = B mantenido + X.
- Pistas visuales:
  - Las primeras veces que llevas la bola, la zona libre se ve tenue con el texto «Llisca aquí per aixecar» durante 3 s (i18n ca/es/en; se apaga en el panel).
  - Con la ventana abierta, una estela dorada en el suelo va del jugador a la portería, y la retícula sigue al dedo.

La simulación recibe **órdenes abstractas** y no sabe qué gesto las produjo. En `PlayerCommand` habrá:
- `lift` (aixecar, pulsación),
- `shotFeint` (amago),
- `swipeStrike` con `swipeAimX/Y` (dirección en la pista, calculada fuera de la simulación con la cámara de ese momento) y `swipeHeight`.

Gracias a eso, A y B (y el teclado y el mando) se pueden cambiar sin tocar `src/sim`.

## 4. Decisión del gesto de aixecar (opción B)
**Qué es la opción B** (DECISIONS 2026-10-08, punto 2; la que prefirió Guillem): aixecar = **arrastrar en diagonal arriba-derecha sobre Regat**. Es el mismo lenguaje que el alto fuerte de Passada y el tiro alto de Xut: «↗ = por arriba». Picar = Xut en la ventana.

**El conflicto ya registrado:** los regates salen al pulsar, pero un arrastre solo se reconoce cuando el dedo ya se ha movido, así que el regate ya ha empezado. Hay tres maneras de resolverlo (DECISIONS 2026-10-08):
- **B1 (la recomendada entonces).** El regate sale al pulsar. Si en los primeros ~0,1 s el dedo se arrastra ↗ (≥ 40 px y entre 15° y 85° de la vertical, los mismos números que Passada), se convierte en aixecar. Este plan lo hace invisible: **todos los regates empiezan con una anticipación de 0,08-0,10 s** (el cuerpo se inclina y la bola aún no se mueve), que además es la «señal» a la que reacciona el rival. Durante esa anticipación, el arrastre ↗ cambia el regate por la levantada, que también empieza metiendo la pala por debajo de la bola. Si el arrastre llega tarde, sale el regate.
- **B2.** Todos los regates salen al soltar Regat: +~0,1 s en cada regate, pero sin ambigüedad.
- **C (doble toque).** Descartada: el primer toque ya lanza un regate, se confunde con dos regates seguidos y es más lenta (~0,3 s).

**A frente a B:**

| Criterio | A: deslizar en la zona libre | B: Regat ↗ (B1) |
|---|---|---|
| Lo ya decidido | **Cambia** la decisión del 08-10 (aixecar dentro de Regat): necesita el sí de Guillem | Es lo que eligió Guillem |
| Regat toque = regate «al pulsar» | Intacto: 0 ms y ninguna ambigüedad | Ventana de 0,1 s para convertirlo: sin retraso extra (va dentro de la anticipación), pero exige un arrastre **rápido** (≥ 40 px en 0,1 s ≈ 400 px/s); si es lento sale el regate |
| Regat mantenido (hoy nada; «presionar» en defensa en F2) | Sin conflicto | Sin conflicto (en defensa no hay bola que levantar), pero Regat acumula tres usos: toque, ↗ y mantener |
| Joystick | Sin conflicto: el regate toma la dirección del joystick y la levantada va hacia donde patinas | Igual |
| Arrastres de Passada y Xut | Separados: el arrastre que empieza en un botón es de ese botón (captura del puntero) y la zona libre excluye 16 px alrededor | **Coherente:** ↗ es «por arriba» en los tres botones |
| Se descubre solo | Zona invisible: necesita la pista visual de las primeras veces | Por analogía con Passada y Xut, que Guillem ya domina; basta una marca ↗ pequeña en Regat |
| Se activa sin querer | Poco: la zona no hace nada más y solo cuenta con bola o con la ventana abierta | Medio: un toque de regate «arrastrado» 40 px ↗ levanta la bola sin querer, y una levantada lenta sale como regate |
| Tapa la jugada | La franja central es donde se dibujan el jugador y la bola, justo cuando hay que ver el anillo dorado para el timing. Empezar en la banda sobre los botones lo reduce | No: el pulgar se queda en los botones |
| Combo aixecar + picar | Dos deslizamientos en la misma zona (sin recorrido) o deslizar + Xut (volver 3-6 cm) | Regat ↗ y Xut justo debajo (~1,5-2 cm): muy compacto |
| Volea con deslizamiento (plan del 09-10) | Misma familia de gestos | Compatible: el deslizamiento para rematar puede existir igual |
| Esquema «Gestos» de F1.7 (docs/03 §3B: deslizar = pase/tiro en la mitad derecha) | Habrá que separar «deslizar hacia arriba = aixecar» de los deslizamientos de pase y tiro | En ese esquema no hay Regat («doble toque = regate»): aixecar necesitará otro gesto igualmente |
| Coste técnico | Reconocedor nuevo, proyección con la cámara y pista visual | Seguir el arrastre en Regat (copia del de Passada) y la conversión en `moves` |

**Cómo combina cada uno con los regates:**

| Jugada | Con A | Con B |
|---|---|---|
| Cambio de lado → aixecar | Toque de Regat, luego deslizar en la zona | Toque de Regat, luego otra pulsación de Regat ↗ |
| Finta → regate | Toques de Regat | Igual |
| Ruleta → aixecar al salir | Deslizar al acabar la parte activa | Regat ↗ al acabar la parte activa |
| Caño (la bola va suelta) | No se puede levantar hasta recogerla | Igual |
| **Amago → aixecar por encima del stick tumbado → picar** (la combinación estrella) | Mantener Xut, deslizar recto hasta Regat (amago), deslizar en la zona (aixecar), deslizar hacia la portería o Xut (picar) | Mantener Xut, deslizar hasta Regat (amago), levantar y pulsar Regat ↗ (aixecar), Xut (picar): todo en 2 cm |
| Aixecar durante la parte activa de un regate | Espera en el búfer (0,2 s) y sale al acabarla | Solo convierte durante la anticipación; después espera como en A |
| Pared con la valla, pase y tiro | Sin cambios | Sin cambios |
| Cuchara detrás de la portería | Aixecar + picar al lado del palo | Igual |

**Recomendación (decide Guillem): A como gesto principal.** El regate es el corazón del juego y A lo deja instantáneo y sin ambigüedad. Además, junta todo el juego por el aire (aixecar, picar, volea) en un solo gesto y produce menos activaciones sin querer. B tiene ventajas reales: es lo que eligió Guillem, el pulgar se queda en los botones, no tapa la bola y el combo es más compacto. Su riesgo es que en el móvil una levantada lenta salga como regate.

Como la simulación es la misma, propongo **implementar los dos** y tenerlos **los dos activos durante la ronda 3** (interruptor «Gest d'aixecar: Zona lliure / Regat ↗ / Tots dos» en el panel, por defecto «Tots dos»; A y B no se pisan). Después de probarlos, Guillem elige y el otro se apaga sin tocar nada más.

## 5. Los regates de F1.6 (qué hace cada uno)
**Cómo se elige el regate:** al pulsar Regat con la bola cuenta la **dirección del joystick respecto al rival**, si hay uno delante (a ≤ 5 m y dentro de ±70° de la marcha; docs/03 §4: «dirección relativa al defensor»). Si no hay rival, cuenta respecto a la marcha (o a donde miras si vas despacio). Ángulos de fábrica, ajustables en el panel:

| Regate (i18n ca) | Gesto | Qué hace (valores iniciales) | Para qué |
|---|---|---|---|
| **Canvi de costat** (derecha ↔ revés) | Regat + joystick a 30-120° | La bola cruza por delante del cuerpo de la derecha al revés (o al revés) 0,7 m en 0,30 s; paso lateral (+2,5 m/s de lado) conservando el 85 % de la velocidad | Superar en carrera |
| **Finta** (de cuerpo) | Regat con el joystick suelto | Amago de hombro hacia un lado durante 0,25 s sin mover la bola (alterna el lado en cada toque; empieza al revés); el rival puede picar | Abrir el otro lado (idea de REFERENCIA_PARTIDOS) |
| **Ruleta** 360° | Regat + joystick hacia atrás (> 120°); también vale dar la vuelta al joystick | Giro completo en 0,55 s con la bola siempre al lado contrario del rival (radio 0,5 m), sale desplazado 0,8 m hacia el lado del giro al 45 % de la velocidad; durante el giro, robar es 5 veces más difícil | Proteger la bola y salir |
| **Entre patins** (caño) | Regat + joystick hacia el rival (±30°) con él a 1-3 m | La bola sale suelta hacia sus patines a +6 m/s; tú lo rodeas y tienes prioridad para recogerla (zona de 0,9 m durante 1 s). Pasa si el rival tiene la postura abierta (moviéndose de lado, estirando el stick o tras picar en una finta); si está plantado, le choca en los patines | Alto riesgo, alto premio |
| **Amagar el tir** | Mantener Xut y deslizar el pulgar recto hacia arriba hasta Regat, u otro dedo en Regat; teclado K + L; mando B + X | Cancela la carga (no sale el tiro) y la bola sigue en la pala; un rival en la línea de tiro que ha visto la carga se tira a tapar: stick al suelo 0,8 s | Tumbar al defensa (y en F1.8 al portero) |
| **Aixecar** | §3 / §4 | Ver F1.6e | Pasar por encima de un stick caído y preparar la picada |
| **Aixecar + picar** | Aixecar y, en la ventana, Xut o deslizar hacia la portería | Remate en el aire de F1.5d/e sobre tu propia levantada | Picada |
| Pared con la valla | Ya existe (v0.1.20) | Sin cambios | — |
| Sin rival delante: **Conducció llarga** | Regat + joystick hacia delante | Empuja la bola ~2,5 m por delante para correr detrás (prioridad para recogerla) | Ganar velocidad en campo abierto |

**Comunes a todos:**
- Anticipación de 0,08-0,10 s (es la señal para el rival y la ventana de B1), parte activa y recuperación. Cancelables tras la parte activa con pase, tiro u otro regate (docs/03 §4).
- **Encadenar dos regates con buen timing** (el segundo empieza ≤ 0,35 s después del primero y el primero «superó» al rival) da un impulso de +0,8 m/s durante 0,4 s.
- El atributo **Regate** (docs/01; 75 = jugador medio) se lee con `movesFor` en `feel.ts`: con 99, un 10 % más rápido y +10 puntos de probabilidad de que el rival pique.
- **Regat + lateral no inicia trencada**, y Regat + atrás no inicia derrape: el regate se queda el golpe de joystick (decisión 6).
- La «Vaselina (bola por encima)» de la tabla de docs/03 §4 desaparece, porque la cubre aixecar (decisión 4).

## 6. Sub-pasos (cada uno cabe en una sesión)
**Por qué este orden.** Sin rival no hay nada que regatear ni que medir, así que va primero. Los regates son el pilar y no tocan la volea, así que pueden avanzar aunque F1.5 siga abierta. El amago va antes de aixecar porque crea el stick tumbado que justifica la levantada. Picar necesita aixecar. Detrás de la portería usa todo lo anterior (la cuchara es aixecar + picar). La ronda 3 cierra.

Al final de **cada** sub-paso, según CLAUDE.md:
- build OK, Vitest OK, Playwright OK;
- el banco de regresión del bloque 2 (J) sin cambios con el rival apagado;
- commit, versión 0.1.N+1 (la v0.1.30 queda para los arreglos del bloque 2), PROGRESS.md, despliegue y lista corta de qué probar.

Todo número de tacto va en `src/config/tuning.ts` + `tuningMeta.ts` + etiquetas i18n ca/es/en (lo exige `tuningMeta.test.ts`). `src/sim` sigue puro y determinista: sin DOM, sin render, sin `Math.random` ni `Date.now`; el azar sale de `world.rng`. Lo vigila `simPurity.test.ts`, que también cubrirá `src/sim/ai/`.

### F1.6a: Rival de prueba y banco de regates (la infraestructura)
- **Qué se hace:**
  - Un rival del equipo 1, solo para entrenar, en `src/sim/ai/defender.ts` (docs/05: la IA vive en `sim/ai/`).
  - Modos: **Apagat** (por defecto: el juego no cambia), **Quiet** (no mueve los patines; reacciona con el cuerpo y el stick) y **Encara** (se mantiene entre la bola y su portería a ~1,8 m, se desliza de lado y hacia atrás hasta 3 m/s con 0,25 s de reacción y mira siempre a la bola).
  - **Stick:** una pala a ~1 m por delante y a su derecha que barre ±70°. Si la bola (llevada o suelta) pasa a ≤ 0,35 m de la pala, se tira una vez (`world.rng`) si la toca. La probabilidad depende de la separación de la bola, del Control del atacante y de su atributo Defensa (robo). Si la toca, la bola sale despejada; si la controla, es suya.
  - **Estados:** plantado, reaccionando, picado (se ha comprometido a un lado), tapando (stick al suelo) y recuperando.
  - **Reinicio automático** de la jugada 1,5 s después de que el atacante lo supere (≥ 4 m por detrás de él con la bola), le roben o se pierda la bola. También un botón «Reinicia la jugada» en el panel.
  - Su presión ya separa la bola y sube el error del pase (lo que hay hoy). La presión en el tiro sigue a 0 (decisión 9).
- **Controles:** ninguno nuevo. El rival se elige en el panel (sección «Defensa de prova»: modo, distancia de salida, reacción, alcance y probabilidad de robo, velocidad lateral).
- **Simulación:**
  - `ai/defender.ts`: devuelve un `PlayerCommand` más la postura del stick.
  - `world.ts`: crea el rival, aplica el robo y el reinicio.
  - `player.ts`: estado del rival y desplazamiento en postura defensiva.
  - `feel.ts`: `defenderFor`.
  - Tuning nuevo: `defender`.
- **Render:** cápsula de otro color (ficticio, ningún club real), su stick (tumbado cuando tapa) y una inclinación cuando pica.
- **Banco** `tests/unit/bench/dribbleBench.ts`:
  - Atacante con Control 75 y Regate 75, que sale a 8 m del rival a 4 / 7 / 9 m/s.
  - El «humano» pulsa a una distancia d (1,0 a 4,0 m) con ±0,07 s de error de timing y ±8° de joystick, y luego sigue hacia una puerta 4 m por detrás del rival.
  - Resultados (300 por caso): **supera / robada / perdida**, duración del regate, separación máxima, velocidad de salida / de entrada.
  - **Objetivo de este sub-paso:** sin regate, yendo recto contra el rival Quiet, **robada ≥ 80 %**, para que el regate sea necesario. Rodeándolo a 1,5 m de distancia lateral: anotar la cifra (referencia).
- **Tests:** `defender.test.ts`:
  - roba una bola llevada recta contra él;
  - respeta la reacción de 0,25 s;
  - mismo resultado con la misma semilla (determinismo con rival);
  - con el modo Apagat, `stepWorld` es idéntico tick a tick al de la v0.1.29.
- **Qué probar en el móvil:**
  - [ ] En el panel, «Defensa de prova» → Quiet: aparece un rival delante.
  - [ ] Si vas recto contra él, casi siempre te la quita.
  - [ ] Pasados 1,5 s se reinicia solo.
  - [ ] Con Encara se pone delante de ti y se desliza de lado.
  - [ ] Con Apagat el juego es como en la v0.1.29.

### F1.6b: Motor de regates + Canvi de costat + Finta
- **Qué se hace:**
  - El motor de regates en `src/sim/moves.ts`: lee `bufDribble` (hoy sin uso), elige el regate (§5), lo ejecuta (anticipación, parte activa y recuperación; la bola sigue una curva fija respecto a la pala, así que es determinista) y gestiona la cancelación y el impulso al encadenar.
  - El rival reacciona a la anticipación con su tiempo de reacción y tira si pica (finta).
  - **Regat + lateral consume el golpe de joystick: no hay trencada.** Durante 0,1 s alrededor de la pulsación, el golpe no inicia trencada (`moves.flickGrace`).
  - Animación provisional (docs/06): el cuerpo se inclina, una estela corta en la bola y un destello pequeño en Regat.
  - Línea de diagnóstico en el panel ⚙: último regate, duración y si superó al rival.
- **Controles:** Regat (toque) + joystick: lateral = Canvi de costat; suelto = Finta. Teclado L + WASD. Mando X + stick izquierdo.
- **Simulación:**
  - `moves.ts` (nuevo).
  - `world.ts`: llama al motor antes de `stepDribble`; durante un regate la bola la lleva el motor, no `stepDribble`.
  - `player.ts`: estado del regate; excepción de la trencada.
  - `feel.ts`: `movesFor`.
  - Tuning nuevo: sección `moves` («Regats»): ángulos de elección, anticipación, duraciones, desplazamientos, velocidad conservada, ventana de cancelación, impulso al encadenar, `flickGrace`.
- **Banco y objetivos** (rival Quiet, patinando a 7 m/s; Encara entre paréntesis):
  - Canvi de costat pulsado a 1,5-2,5 m: supera **≥ 75 % (≥ 55 %)**. Demasiado pronto (≥ 4 m) o tarde (≤ 1 m): ≤ 35 %.
  - Duración 0,30 ± 0,05 s, separación máxima ≤ 0,45 m, velocidad de salida ≥ 80 %.
  - Finta a 1,5-3 m: el rival pica el **50-65 %**. Finta + canvi al otro lado: supera **≥ 85 %**.
  - Regat + lateral a ≥ 5 m/s: 0 trencadas.
  - Sin pulsar Regat, la trencada sigue igual (cifras de docs/03 §1).
- **Tests:** `moves.test.ts`:
  - elección por ángulo (con y sin rival);
  - duraciones;
  - la bola no supera la separación máxima;
  - se cancela después de la parte activa y no antes;
  - la trencada solo se suprime con Regat;
  - determinismo;
  - e2e `moves.spec.ts`: tocar Regat con la bola cambia la bola de lado (estado de depuración `window.__patins`).
- **Qué probar en el móvil:**
  - [ ] Llevando la bola, Regat con el joystick a un lado: la bola cambia de lado y tú das un paso.
  - [ ] Contra el rival Quiet, pulsando a unos 2 m lo pasas casi siempre; muy cerca o muy lejos, no.
  - [ ] Regat con el joystick suelto: amago de hombro; a veces el rival se va hacia ese lado.
  - [ ] Regat + lateral a toda velocidad ya no hace trencada.
  - [ ] ¿Se lee el regate con la cámara TV, o hace falta la Cercana?

### F1.6c: Ruleta, Entre patins y Conducció llarga
- **Qué se hace:**
  - Ruleta (Regat + atrás, o el joystick dando la vuelta). Con Regat, el derrape no se dispara.
  - Caño (bola suelta hacia los patines del rival, prioridad para recogerla y el rival tarda 0,8 s en girarse).
  - Conducció llarga (sin rival delante).
  - Postura abierta o cerrada del rival.
- **Controles:** Regat + joystick hacia atrás = Ruleta; hacia el rival = Entre patins; adelante sin rival = Conducció llarga. Teclado y mando igual que en b.
- **Simulación:** `moves.ts` (dos regates más), `ai/defender.ts` (postura de los patines, giro tras el caño), `world.ts` (prioridad de recogida, como el `passTo` de un pase a uno mismo). Más valores en `moves` y `defender`.
- **Banco y objetivos:**
  - Ruleta contra Encara a 1-1,5 m de cara: conserva la bola **≥ 75 %**, robo durante el giro **≤ 10 %**, duración 0,55 ± 0,05 s, sale al 40-50 % de velocidad y desplazado 0,8 m.
  - Caño contra un rival con la postura abierta: supera **≥ 65 %**. Contra uno plantado: **≤ 25 %** (alto riesgo).
  - Tras el caño, la recoge en ≤ 1,0 s.
  - Conducció llarga en campo abierto: la recupera ≥ 95 % y gana ≥ 0,2 s en 10 m respecto a conducir.
  - Encadenar finta + caño: supera ≥ 70 %.
- **Tests:** ampliar `moves.test.ts` (atrás + Regat = ruleta y no derrape; el caño pasa por los patines solo con la postura abierta) y `defender.test.ts`.
- **Qué probar en el móvil:**
  - [ ] Regat tirando del joystick hacia atrás: giras con la bola protegida y sales de lado.
  - [ ] Regat hacia el rival cuando está estirando el stick o se ha movido: la bola le pasa entre los patines. Si está plantado, te la quita.
  - [ ] Sin rival, Regat hacia delante te deja la bola por delante para correr.
  - [ ] ¿Cuál de los cuatro regates sale sin querer?

### F1.6d: Amago de tiro
- **Qué se hace:**
  - Mientras cargas Xut con la bola, deslizar el pulgar recto hacia arriba hasta Regat (hoy un arrastre recto hacia arriba en Xut no cambia nada: menos de 15° de inclinación = raso) o pulsar Regat con otro dedo cancela el tiro: la bola se queda en la pala y no puedes tirar en 0,1 s. Se reconoce **en cuanto el dedo entra en Regat**, no al soltar, para que nunca salga un tiro sin querer.
  - El rival que está en la línea de tiro y ve la carga ≥ 0,2 s (con su reacción) **se tira a tapar**: stick al suelo 0,8 s. En ese tiempo no roba, pero bloquea los rasos que le pasan por el stick o el cuerpo.
  - Si tiras de verdad contra un rival tapando, el tiro raso puede chocar con él.
  - Queda la señal `p.shotFeintTick` para que el portero de F1.8 reaccione a los amagos (docs/03 §5).
- **Controles:** táctil, Xut mantenido → deslizar hasta Regat (u otro dedo en Regat). Teclado: K o Espacio mantenida + L. Mando: B mantenido + X.
- **Simulación:**
  - `shot.ts`: cancelación de la carga.
  - `commands.ts`: `shotFeint`.
  - `ai/defender.ts`: estado «tapando».
  - `actionButtons.ts`: el arrastre de Xut que entra en el rectángulo de Regat (+10 px) emite el amago.
  - Valores en `moves` (amago) y `defender` (alcance de reacción 10 m, probabilidad, duración del stick tumbado).
- **Banco y objetivos:**
  - Carga ≥ 0,2 s a ≤ 10 m de la portería con el rival en la línea: se tira **≥ 70 %**. A > 14 m: ≤ 30 %. Carga < 0,15 s: casi nunca.
  - Amago → canvi de costat: supera **≥ 85 %**.
  - El tiro real contra un rival tapando: medir cuántos bloquea.
  - Amago reconocido el 100 % con el arrastre sintético hasta Regat y **0 tiros** en esos casos.
  - Sin amago, el tiro de siempre es idéntico (banco de tiro con el rival apagado).
- **Tests:** `moves.test.ts` (el amago cancela y no tira; la carga larga sigue siendo un tiro); test de entrada puro del arrastre Xut→Regat (estilo `passGesture.test.ts`); e2e del amago.
- **Qué probar en el móvil:**
  - [ ] Mantén Xut y desliza el pulgar recto hasta Regat: no tira y el rival se tira al suelo.
  - [ ] Justo después, Regat a un lado: lo pasas.
  - [ ] Si sueltas Xut sin llegar a Regat, tira como siempre.
  - [ ] ¿Es cómodo el deslizamiento, o preferirías hacia abajo? (decisión 7)

### F1.6e: Aixecar (la levantada propia), gesto A y gesto B
- **Qué se hace:**
  - **Física:** la pala se mete debajo de la bola (0,08 s) y la bola sale con la velocidad vertical justa para que su punto más alto sea **0,9 m** (`lift.apex`; en el panel, como mucho **1,50 m**, el reglamento). Su velocidad horizontal es la tuya más 1,2 m/s hacia donde patinas, así que cae unos 0,6-1,0 m por delante de donde estará tu pala si sigues recto. Después es física pura: gravedad, aire y bote.
  - **Sin bloqueo de recogida:** la levantada propia no pone `noPickupTicks`, y el remate y la recepción la reconocen desde que sale.
  - **Recontrol:** si no picas, la bajas o la recoges al caer con la misma tirada de recepción, con −0,3 de dificultad (`lift.recontrolBonus`). Si cae limpia, sigues conduciendo.
  - **Por encima del stick tumbado** del rival: la bola pasa si va por encima de 0,12 m al cruzarlo.
  - **Gestos:** reconocedor A en `src/input/airGesture.ts` (función pura, como `passGesture.ts`) y arrastre ↗ en Regat para B, con el interruptor «Gest d'aixecar» (§4) y la pista visual de la zona libre.
- **Regla única: «el joystick solo apunta» también con tu levantada** (lo que pide la auditoría §A):
  - Desde que sale la levantada hasta que la controlas, la rematas o «muere» (cae y se aleja más de 1,7 m de tu pala, o pasan 1,2 s), el mundo la marca como tuya (`world.liftOwner`, el equivalente a `passTo` de un pase a ti mismo).
  - Durante ese tiempo eres su receptor y el joystick **solo apunta**: el jugador va al punto de contacto previsto **conservando su velocidad, también el sprint**. Hoy `humanCommand` quita el sprint al receptor y, como la levantada se calcula con tu velocidad, al frenar la bola se te iría por delante.
  - El arreglo de la v0.1.29 (`aerialPass`) solo cubre el alto fuerte de menos de 16,5 m. En F1.6e la condición pasa a ser una sola: «una bola en el aire que va a ti», sea `passTo === controlado` o `liftOwner === controlado`. Para la levantada propia es obligatorio. Extenderlo a la vaselina y al alto fuerte largo es justo el hallazgo 1 de §A: si la v0.1.30 no lo arregla antes, se decide aquí (decisión 10) y se mide con el banco `volleyCueRealFlow`.
- **Controles:**
  - Táctil A: con la bola, deslizar ≥ 40 px en ≤ 0,35 s desde la zona libre.
  - Táctil B: Regat ↗ en la anticipación.
  - Teclado: U + L. Mando: LB + X.
  - El joystick sigue mandando hacia dónde patinas hasta que la bola sale; en el aire, solo apunta.
- **Simulación:**
  - `src/sim/lift.ts` (nuevo).
  - `world.ts`: `liftOwner`, la regla única en `humanCommand`, `volleyStep` sin el bloqueo de `noPickupTicks` para la levantada propia, recepción de la levantada.
  - `commands.ts`: `lift`.
  - `feel.ts`: `liftFor`.
  - Tuning: secciones `lift` («Aixecar»: altura, hacia delante, tiempo de pala, recontrol, alcance, tiempo máximo) y `airGesture` («Gest de l'aire»: modo A/B/ambos, zona, recorrido mínimo, tiempo máximo, margen con los botones, ángulo máximo, longitud del alto, ventana de B, distancia e inclinación de B, pista visual sí/no).
  - En `src/game`, proyección del deslizamiento a la pista con la cámara del momento: queda fuera de la simulación.
- **Banco** `liftBench.ts` y **objetivos:**
  - Altura máxima ≤ 1,50 m el **100 %** en todo el rango del panel (prueba de propiedad).
  - De fábrica, punto más alto 0,9 ± 0,1 m.
  - Patinando recto, vuelve a tu alcance **≥ 95 %** parado y patinando, **≥ 85 %** a sprint.
  - Con el joystick apuntando a la portería mientras está en el aire (lo que rompía el pase en la v0.1.28): **≥ 95 %**, con 0 levantadas «perdidas sin tocar».
  - Recontrol sin picar **≥ 90 %** (limpio ≥ 70 %) y tenerla otra vez en ≤ 0,9 s.
  - Por encima de un stick tumbado a 1,5-2,5 m: pasa **≥ 95 %**.
  - Gesto A (Playwright, deslizamientos sintéticos): reconocido el 100 % dentro de las reglas y el 0 % si empieza sobre un botón o a < 16 px, sin bola o sin ventana.
  - Gesto B: ↗ en ≤ 0,1 s → aixecar el 100 %; toque sin arrastre → regate el 100 %.
- **Protección:**
  - Banco J (pase, tiro, volea, rechaces, dirección del alto fuerte) idéntico con el rival apagado y sin levantar.
  - La volea a un pase de un compañero no cambia: remata el 100 %, buen timing ~85 %, 77-86 % entre los palos desde la esquina (cifras de la v0.1.28 y la v0.1.29).
  - Si se extiende la regla única a la vaselina y al alto fuerte largo (decisión 10), esas cifras se rehacen y se comparan.
- **Tests:**
  - `lift.test.ts`: altura máxima, cae a su alcance, la ventana se abre desde la salida, el joystick a 90° no la pierde, sprint conservado, recontrol;
  - `airGesture.test.ts` (pura);
  - e2e `lift.spec.ts` (deslizar en la zona libre levanta la bola; captura de pantalla).
- **Qué probar en el móvil:**
  - [ ] Llevando la bola, desliza el pulgar derecho por el centro de la pantalla: la bola sube un poco y cae delante de ti.
  - [ ] Haz lo mismo con Regat ↗. ¿Cuál te sale mejor? (decisión 1)
  - [ ] Mientras está en el aire, apunta el joystick a la portería: no la pierdes.
  - [ ] Si no haces nada, la recoges y sigues.
  - [ ] Amago (el rival se tumba) y después aixecar: la bola pasa por encima de su stick.
  - [ ] ¿Se activa alguna vez sin querer?

### F1.6f: Aixecar + picar y deslizar para rematar
- **Qué se hace:**
  - La picada es el **remate en el aire de F1.5d/e sin cambios de reglas**: misma ventana (0,4 s), buen timing ±0,08 s, hasta +15 % de potencia, error del tiro × 1,25 × (1 + dificultad en el aire), anillo dorado en la bola, aviso en Xut y vibración con el timing perfecto. Lo nuevo es que ahora se abre también con tu levantada.
  - **Deslizar hacia la portería** en la zona libre como alternativa a Xut (§3; plan A del 2026-10-09), con la estela dorada en el suelo y la retícula que sigue al dedo. Vale para la picada y para la volea a un pase.
  - **Cámara lenta con la levantada propia:** apagada de fábrica (decisión 11), con un interruptor en «Càmera lenta del remat a l'aire».
- **Controles:** aixecar y, en la ventana, Xut (toque, o soltarlo; arrastre diagonal = alto o picado, como siempre) o deslizar hacia la portería en la zona libre (corto = raso, largo = alto). Teclado K o Espacio. Mando B.
- **Simulación:**
  - `volley.ts` y `world.ts`: el remate lee la dirección del deslizamiento si lo hay, o el joystick si no.
  - `commands.ts`: `swipeStrike`, `swipeAimX/Y`, `swipeHeight`.
  - `slowMo` en `src/game`: interruptor para la levantada propia.
  - Más valores en `airGesture`.
- **Banco y objetivos** (humano normal ±0,07 s, Mitjana, `runVolley` ampliado con el caso «levantada propia», parado / patinando / a sprint):
  - Remata en el aire **≥ 95 %** y con buen timing **≥ 70 %** (el objetivo de F1.5d).
  - Contacto entre 0,3 y 0,9 m **≥ 80 %**.
  - Entre los palos: de frente a 6-8 m **≥ 75 %**, a 10 m **≥ 60 %**, a 7 m y 45° **≥ 60 %**.
  - Jugada completa (del gesto a que sale la bola): 0,55-0,85 s.
  - Con el deslizamiento: los mismos porcentajes, ± 5 puntos, que con Xut.
  - La curva de timing sigue igual que la de la v0.1.28.
- **Tests:** ampliar `volley.test.ts` (ventana con la levantada propia; el deslizamiento remata con su dirección; fuera de la ventana el deslizamiento no hace nada; una sola vez por bola), `airGesture.test.ts` y el e2e `volley.spec.ts`.
- **Qué probar en el móvil:**
  - [ ] Aixecar y Xut cuando el anillo dorado destella: la picada sale fuerte y vibra.
  - [ ] Igual, deslizando hacia la portería en lugar de Xut. ¿Qué prefieres?
  - [ ] Pulsar demasiado pronto o tarde: sale floja o desviada, y fuera de la ventana no pasa nada.
  - [ ] Contra el rival tumbado tras un amago: amago → aixecar → picar.
  - [ ] ¿Echas de menos la cámara lenta en la picada?

### F1.6g: Juego por detrás de la portería
- **Qué se hace:**
  - **(1) Tiro desde detrás de la línea de gol.** Nunca va a la red de atrás ni hace media vuelta hacia ella, y la retícula no aparece. Xut va hacia donde apunta el joystick (o hacia donde miras), raso y rápido: el **tiro-pase atrás** al punto de remate. Passada sigue siendo el pase asistido de siempre.
  - **(2) Cuchara:** desde el lado del palo (a ±0,6 m de la línea de gol y a 0,9-2,5 m del centro), aixecar + picar hacia la portería con ángulo muy cerrado. Es el combo de F1.6f; solo se comprueba que la puntería acepta ese ángulo. Sin portero, medir. La cuchara automática con una sola pulsación queda como idea (decisión 13).
  - **(3) Conducir alrededor de la portería** (1,88 m de hueco): sin atascos con la red ni la valla, y la bola no se queda «pegada» entre las dos.
  - **(4) Pase desde detrás:** si la línea del pase cruza la portería, la asistencia lo avisa con la flecha en rojo y busca la salida por el lado. Se mide antes de cambiar nada.
  - **(5) Cámara:** comprobar que con los 3 presets el jugador y la bola se ven detrás de cada portería y no quedan bajo los botones (se amplía el test e2e de cámaras). Si la red tapa la bola, extender la silueta de la bola (v0.1.19) a la red.
  - El rebote asistido hacia un compañero en la valla de fondo pasa a F2 (decisión 13).
- **Controles:** los de siempre. Detrás de la portería, Xut = tiro-pase atrás hacia el joystick; cuchara = aixecar + picar.
- **Simulación:**
  - `shot.ts`: `behindGoalLine` en `planShot` y `needsTurn`.
  - `world.ts`: retícula.
  - `pass.ts`: aviso de portería en medio.
  - `dribble.ts`: si hace falta, que la bola no se atasque entre la red y la valla.
  - Tuning `behind` («Darrere la porteria»: margen tras la línea, velocidad del tiro-pase atrás, zona de la cuchara).
  - En el render, solo si la silueta lo necesita.
- **Banco** `behindGoalBench.ts` y **objetivos:**
  - Rodear la portería con la bola a 4 y 6 m/s: la conserva **≥ 90 %**, nunca parada más de 0,5 s, **0 túneles** a través de la red.
  - **0 tiros a la red de atrás** desde detrás de la línea.
  - Pase atrás a un compañero quieto en el punto de remate (4-6 m delante de la portería): llega **≥ 90 %**, choca con la portería **≤ 5 %**.
  - Cuchara sin portero: medir. Objetivo provisional ≥ 50 % entre los palos.
  - Rechaces (banco J): idénticos.
- **Tests:** `behindGoal.test.ts` (el tiro desde detrás nunca apunta a la red; sin media vuelta; rodear sin atascarse); e2e de cámaras con el jugador detrás de cada portería (capturas en `docs/screenshots`).
- **Qué probar en el móvil:**
  - [ ] Pasa por detrás de la portería con la bola: no te atascas.
  - [ ] Desde detrás, Xut con el joystick hacia el centro: sale un pase-tiro raso al punto de remate, no a la red.
  - [ ] Desde el lado del palo, aixecar + picar: ¿entra?
  - [ ] Con las 3 cámaras, ¿ves bien la bola detrás de la portería?

### F1.6h: Ronda 3 de afinación con Guillem
- **Qué se hace:**
  - Despliegue con todo encendido y la lista de qué probar.
  - Guillem prueba 2-3 días, graba 30 s y dice 3 cosas que se sienten mal (docs/03 §9).
  - Elige el gesto (A, B o los dos) y pega «PATINS tuning vX». Esos valores pasan a ser los de fábrica, con aviso de guardados borrados.
  - Se repiten todos los bancos y se actualizan docs/03 §4 (la tabla de regates con lo decidido), DECISIONS y PROGRESS.
  - Se verifican los criterios del §10 y se cierra F1.6.
- **Qué probar en el móvil (resumen):**
  - [ ] Los 5 regates contra Quiet y Encara.
  - [ ] Amago → aixecar → picar.
  - [ ] Juego por detrás de la portería.
  - [ ] Con el rival apagado, ¿todo sigue igual que antes?
  - [ ] ¿Regatear «se siente bien»?

## 7. Métricas y objetivos (resumen)
| Qué | Objetivo | Banco |
|---|---|---|
| Sin regate, recto contra Quiet | robada ≥ 80 % | dribbleBench |
| Canvi de costat a 1,5-2,5 m | supera ≥ 75 % (Encara ≥ 55 %), 0,30 s, separación ≤ 0,45 m, salida ≥ 80 % | dribbleBench |
| Finta | pica 50-65 %; finta + canvi ≥ 85 % | dribbleBench |
| Ruleta | conserva ≥ 75 %, robo ≤ 10 %, 0,55 s | dribbleBench |
| Entre patins | postura abierta ≥ 65 %, plantado ≤ 25 % | dribbleBench |
| Amago de tiro | se tira ≥ 70 % (≤ 10 m, carga ≥ 0,2 s); 0 tiros sin querer | dribbleBench + test de entrada |
| Aixecar | altura ≤ 1,50 m el 100 %; vuelve a tu alcance ≥ 95 % (sprint ≥ 85 %); joystick a la portería ≥ 95 %; por encima del stick ≥ 95 % | liftBench |
| Aixecar + picar | remata ≥ 95 %, buen timing ≥ 70 %, entre los palos 6-8 m ≥ 75 % | runVolley ampliado |
| Detrás de la portería | conserva ≥ 90 %, 0 túneles, 0 tiros a la red de atrás, pase atrás ≥ 90 % | behindGoalBench |
| Gestos A y B | 100 % reconocidos dentro de las reglas, 0 % fuera | airGesture.test + Playwright |
| **Protección** | Rival apagado: pase (cadenas Mitjana 100 % / 2,87 s), tiro (rápido 7 m 94 %, carga completa 14 m 91 %), volea (100 % / ~85 % buen timing), rechaces y dirección del alto fuerte **idénticos** a la línea base de la v0.1.29 | Banco J del bloque 2 |
| Determinismo y rendimiento | misma semilla = mismo resultado con rival; sim ≤ 0,03 ms por tick con CPU ×4 (hoy 0,01) | determinism.test, §C |

Todas son **propuestas iniciales**: tras la ronda 3, Guillem puede pedir regates más fáciles o más difíciles, y los objetivos se reescriben en DECISIONS.

## 8. Riesgos
1. **El gesto (A o B) no convence en el móvil.** A tapa la jugada y su zona es invisible; B pierde levantadas lentas o levanta sin querer. Mitigación: los dos detrás de un interruptor, la simulación común y la decisión con el móvil en la mano.
2. **Un pulgar para todo.** Xut, Regat y la zona libre se reparten un solo pulgar derecho; los combos son secuenciales (0,15-0,25 s por cambio de sitio). Si molesta, el editor de botones de F1.7 puede adelantarse (ya se hizo con otras cosas en F1.3).
3. **Regates contra la trencada y el derrape.** Si la excepción es demasiado ancha, la trencada con bola deja de salir. Se protege con los tests de la trencada; P12 (pases) se decide aparte.
4. **El rival de prueba demasiado bueno o demasiado tonto.** El banco base (robada ≥ 80 % sin regate) y los objetivos por regate lo acotan. Que se convierta en la IA de F2 queda fuera: es un muñeco documentado como tal.
5. **Tocar la volea con F1.5 todavía abierta.** F1.6e-f cambian `volleyStep` y `humanCommand`. Mitigación: el banco J idéntico, `volleyCueRealFlow` y esperar el visto bueno de la volea antes de F1.6e (decisión 0).
6. **La regla única «el joystick solo apunta»:** si se extiende a la vaselina y al alto fuerte largo, cambia el tacto de F1.5 (no podrás moverte mientras viene una vaselina hacia ti). Por eso es una decisión, no un arreglo.
7. **Legibilidad.** Desplazamientos de 0,7 m vistos con la cámara TV a 21 m son pequeños, y las animaciones provisionales sobre cápsulas pueden no leerse. Mitigación: estela de la bola, inclinación y destello. Puede que la ronda 3 empuje a usar la Cercana.
8. **Reglamento (F3).** La levantada y la picada respetan 1,50 m, pero picar con Xut en diagonal ↖ (picado) puede pasar de 1,50 m. Además, golpear la bola alta cerca de un rival puede ser stick peligroso (art. 15.1.m), y el art. 7.3.c habla de goles golpeando la bola por encima de la portería. Se anota para F3; no se penaliza nada en F1.6.
9. **Detrás de la portería:** la pala choca con la red o la valla (la bola tiembla o se pierde) y no se puede girar cerrado a velocidad. El banco lo mide antes de tocar nada.
10. **Alcance:** 8 sub-pasos. Si hay que recortar, F1.6g (detrás de la portería) puede pasar a F2 sin romper nada.

## 9. Decisiones que debe tomar Guillem
0. **¿Empezar F1.6 con F1.5 abierta?** Recomendación: sí, con F1.6a-d (no tocan la volea). F1.6e solo después de tu visto bueno a la volea de la v0.1.29.
1. **Gesto de aixecar: A (deslizar en la zona libre) o B (Regat ↗; la que preferiste el 08-10).** Recomendación: **A** como gesto principal, con **los dos activos en la ronda 3**; después eliges en el móvil (§4).
2. **Picar también deslizando hacia la portería** (además de Xut, que siempre funciona). Recomendación: sí; sirve igual para la volea a un pase.
3. **Cómo se elige el regate:** por la dirección del joystick respecto al rival (si hay uno delante a ≤ 5 m) y, si no, respecto a la marcha. Recomendación: sí (es lo que dice docs/03 §4).
4. **La lista de regates:** Canvi de costat, Finta, Ruleta, Entre patins y Amagar el tir, más Aixecar y Aixecar + picar; quitar «Vaselina (bola por encima)» de docs/03 §4 (la cubre aixecar). «Pasarse la bola por debajo de los propios patines» queda para más adelante. Recomendación: sí.
5. **Ruleta = Regat + joystick hacia atrás** (en vez de solo «girar el joystick», que es difícil a la primera). Recomendación: atrás, y aceptar también el giro.
6. **Regat + lateral no hace trencada (el regate gana)**, y Regat + atrás no hace derrape. Recomendación: sí. P12 (el golpe de joystick que desvía el pase a sprint) se decide aparte, aunque es el mismo mecanismo.
7. **Gesto del amago:** mantener Xut y deslizar el pulgar recto hacia arriba hasta Regat (el «cancelar con REGATE» de docs/03 con un solo pulgar; u otro dedo en Regat). Alternativa: deslizar hacia abajo. Recomendación: hasta Regat.
8. **Rival de prueba:** modos Quiet y Encara, roba con el stick, reinicio automático; sin presión activa hasta F2. Recomendación: sí.
9. **Presión del rival en el error del tiro** (`shot.ctxPressure`, hoy 0). Recomendación: seguir a 0 en F1.6 (mediré qué haría) y decidir en F2. La presión en el pase y en la conducción ya actúa sola.
10. **Con tu levantada en el aire, el joystick solo apunta** y sigues yendo a por ella a tu velocidad (como el alto fuerte desde la v0.1.29). Recomendación: sí. Y si la v0.1.30 no lo ha arreglado antes, aplicar la misma regla a todo pase por el aire dirigido a ti, incluidos la vaselina y el alto fuerte largo (el hallazgo 1 de §A: hoy se pierden 11-14 de 24 de 17,9-20 m si apuntas a la portería).
11. **Cámara lenta en la picada de tu propia levantada.** Recomendación: apagada (tú marcas el ritmo y saldría en cada levantada), con interruptor. La propuesta P16 (cámara lenta «fuerte») sigue aparte.
12. **Una sola levantada** (punto más alto 0,9 m, cae justo delante; en el panel hasta 1,50 m), en vez de dos (corta y larga) según el gesto. Recomendación: una.
13. **Detrás de la portería:** Xut detrás de la línea de gol = tiro-pase atrás hacia el joystick (nunca a la red); cuchara = aixecar + picar a mano (la cuchara automática con una pulsación, más adelante); rebote asistido en la valla de fondo hacia un compañero, en F2 con la IA. Recomendación: sí a las tres.
14. **Impulso al encadenar dos regates:** +0,8 m/s durante 0,4 s, en el panel. Recomendación: empezar así y ajustar en la ronda 3.
15. **Freno en T** (REFERENCIA_PARTIDOS pide preguntarlo en F1.6). Recomendación: no cambiar nada; la frenada de 4 ruedas fue tu decisión y funciona.

## 10. Criterios de aceptación de F1.6 (cómo se verificarán)
| Criterio | Cómo |
|---|---|
| ≥ 5 regates de docs/03 §4 con animación provisional, que salen al pulsar | `moves.test.ts`, dribbleBench, e2e `moves.spec.ts`, prueba de Guillem |
| Aixecar y aixecar + picar sin botones nuevos, ≤ 1,50 m | `lift.test.ts`, liftBench, runVolley ampliado, e2e `lift.spec.ts` |
| Juego por detrás de la portería (patinar, pase atrás, cuchara, cámara) | behindGoalBench, `behindGoal.test.ts`, capturas de las 3 cámaras |
| Amago de tiro con reacción del rival | dribbleBench, test de entrada del arrastre Xut→Regat |
| Rival básico (Quiet / Encara) | `defender.test.ts`, dribbleBench |
| Nada de lo anterior cambia con el rival apagado | Banco J idéntico, `determinism.test.ts`, `simPurity.test.ts` |
| Textos en ca/es/en; números en tuning.ts y en el panel | `i18n.test.ts`, `tuningMeta.test.ts` |
| 60 fps en el Pixel 8a | `perf.spec.ts` + línea de rendimiento de Guillem (`?debug=1`) |
| **Ronda 3:** Guillem dice que regatear «se siente bien» | Prueba en el Pixel 8a; valores de «PATINS tuning vX» como fábrica |

## Objeciones
*(Crítico de diseño independiente, fase 3 del bloque 2, 2026-10-10. Todo lo citado se ha comprobado en el código de la v0.1.29 y en las auditorías de `docs/audit/`. No reescribe el plan: señala dónde falla y propone un cambio concreto.)*

**O1 — Las letras «A» y «B» no significan lo mismo que en DECISIONS ni que en docs/06** · Gravedad **Alta**
- *Qué falla:* la «opción A» del plan (deslizar en la zona libre, PLAN_F1_6:8, :53-54) **no existe** entre las opciones de aixecar de DECISIONS.md:128. Allí, A = «los regates salen al soltar», B = «el regate se convierte en aixecar si arrastras ↗ en 0,1 s» y C = «doble toque». La zona libre era la opción A de **otro** juego de opciones: el gesto del **remate** (DECISIONS.md:134). La «B2» del plan es, en realidad, la A de DECISIONS:128. Además, docs/06:19 dice «aixecar dentro de REGATE». La auditoría D (C1) ya pedía nombres distintos para los dos juegos de opciones.
- *Por qué importa:* Guillem no lee código y decide por letras. Puede aprobar «la A» pensando en otra cosa, y la decisión 1 (:413) cambia una decisión suya ya registrada (DECISIONS:128 punto 1, :129) sin decirlo claramente.
- *Propuesta:* usar en todo el plan nombres en vez de letras: «Aixecar-Zona lliure», «Aixecar-Regat↗ (conversión en 0,1 s)», «Regat al soltar» y «Doble toc». En la decisión 1, decir en una línea que «Zona lliure» saca aixecar de Regat, en contra de docs/06:19 y de DECISIONS:128 (1).

**O2 — El gesto se decide al final, con todo lo demás ya construido encima** · Gravedad **Alta**
- *Qué falla:* el plan implementa los dos gestos (dos reconocedores, interruptor, pista visual, i18n y e2e; :115, :270, :285) con «Tots dos» activo de fábrica, y Guillem no elige hasta la ronda 3 (:371). Para entonces, F1.6f (deslizar para rematar) y F1.6g (cuchara) ya dependen de ese gesto.
- *Por qué importa:* es la decisión de ergonomía más cara de F1.6. Con los dos activos, las activaciones sin querer se suman. Y si gana B, el reconocedor A y la proyección con la cámara (:286) se tiran a la basura.
- *Propuesta:*
  - **Antes de F1.6e**, medir sin construir nada: añadir a la línea de diagnóstico del panel cuánto tarda el pulgar de Guillem en recorrer 40 px y con qué inclinación, en los arrastres ↗ de Passada que ya hace cada día. Así se sabe si los 0,1 s de B1 (:79, :88) están a su alcance.
  - Hacer un prototipo de **solo entrada** (con una levantada provisional) al final de F1.6b. Guillem prueba una vez y elige, y solo se implementa el gesto ganador.
  - Nunca «Tots dos» de fábrica.

**O3 — La levantada propia rompe la predicción del contacto y la recogida** · Gravedad **Alta**
- *Qué falla:* `predictContact` (volley.ts:36-41, :85-100) se queda con «el primer paso por el alcance» y, dentro de él, con la distancia mínima. Una bola que sale de tu propia pala está en ese primer paso desde t = 0, así que el contacto «previsto» cae a ~0,03-0,05 s de la salida, en cuanto pasa de 0,15 m de altura, y no en la bajada. Además, sin `noPickupTicks` (:267), `pickupDistance` (dribble.ts:167-174; `pickupMaxHeight` 0,35 m, tuning.ts:236) la vuelve a recoger en los primeros ~0,1 s. El test previsto «la ventana se abre desde la salida» (:301) pasaría justo con el comportamiento equivocado.
- *Por qué importa:* el anillo dorado, la vibración y el «buen timing» de la picada quedarían anclados al gesto de levantar, no a la caída. La jugada estrella no funcionaría y los tests seguirían en verde.
- *Propuesta:* una regla propia para la levantada (`liftOwner`): no se puede recoger ni rematar mientras sube (vz > 0, o durante `lift.selfTouchDelay`), y `predictContact` solo busca en la rama de bajada. Métricas: contacto previsto en la bajada ≥ 95 %, y tiempo del gesto al contacto de 0,45-0,75 s.

**O4 — «El joystick solo apunta» anula el uso para el que existe aixecar** · Gravedad **Alta**
- *Qué falla:* durante el vuelo (~0,6-0,85 s) el jugador va solo al punto de contacto, a su velocidad y sin poder girar (:272-273). Pero aixecar sirve para «pasar por encima de un stick tumbado» (:127, :269). A 7 m/s recorres ~5 m durante el vuelo y el defensor tumbado está a 2,5-3,5 m: tu jugador choca con su cuerpo (`collidePlayers`) sin poder esquivarlo. El banco solo mide que la bola pasa por encima del stick (:293).
- *Por qué importa:* la combinación amago → aixecar → picar, la «estrella» (:108), quedaría bloqueada por el propio piloto automático.
- *Propuesta:*
  - Con tu levantada, el joystick sigue mandando el **lateral** (el piloto automático solo gobierna el avance), o solo apunta cuando Xut está armado.
  - La caída de la bola se desplaza hacia el lado del joystick.
  - Métrica nueva: «amago → aixecar contra Quiet tumbado: lo superas y recuperas la bola ≥ 70 %».

**O5 — Elegir el regate con dos pulgares: trencada, derrape y finta chocan** · Gravedad **Alta**
- *Qué falla:*
  - (a) La trencada empieza en el mismo tick del golpe de joystick, con frenada previa inmediata, y cancelarla cuesta la recarga de 0,8 s (player.ts:240-254, :259-265). El `flickGrace` «0,1 s alrededor de la pulsación» (:186) exige ver el futuro o deshacer una frenada ya empezada. Con dos pulgares, el golpe llega 30-80 ms antes o después de Regat: si llega antes, ya estás frenando; si llega después, el regate se elige con el joystick viejo (hacia delante = caño o conducció llarga, :125, :130).
  - (b) Finta = «joystick suelto» (:123). Pero soltar el joystick de golpe (≥ 60 % en 0,1 s) a ≥ 3,5 m/s **es la frenada-derrape** (player.ts:227, :270; tuning.ts:103-105). La finta, el regate más usado en los partidos reales (REFERENCIA §1.4), acabaría en un derrape que separa la bola.
  - (c) Hay un hueco en la tabla: joystick hacia el rival con el rival a 3-5 m (el caño pide 1-3 m). Y la misma entrada cambia de regate cuando el rival entra o sale del cono de 5 m.
- *Por qué importa:* los regates saldrían cambiados o acompañados de una maniobra que no has pedido, justo en el pilar 3 del GDD.
- *Propuesta:*
  - Leer la dirección del joystick al **terminar** la anticipación, no al pulsar.
  - Si pulsas Regat ≤ `flickGrace` después de que empiece una trencada o un derrape, se cancelan sin recarga y se recupera la velocidad (`cutSpeed0`).
  - Finta = Regat con el joystick **en la dirección de la marcha** (sin golpe en los últimos 0,15 s); el caño solo con el joystick hacia el rival ±15° y él a 1-3 m.
  - Nada de derrape por soltar el joystick durante 0,15 s alrededor de Regat.
  - En el banco, simular un desfase entre los pulgares de ±80 ms y contar «regate distinto del que querías» y «trencadas o derrapes sin querer».

**O6 — El amago choca con el tiro picado y el alto: Regat está a 16 px de Xut** · Gravedad **Alta**
- *Qué falla:* Regat ocupa y 178-262 y Xut y 278-378 (:45, :47; tuning.ts:740-754), así que el rectángulo de Regat + 10 px (:249) empieza 6 px por encima de Xut. El picado es arrastrar ↖ en Xut y el alto, ↗ (actionButtons.ts:136-143, passGesture.ts:11-15: ≥ 40 px y ≥ 15°). Un ↖ de 60-80 px desde el centro de Xut (831, 328), inclinado 20-45°, entra en Regat + 10 px (p. ej., 70 px a 30° → (796, 267)). Como el amago se reconoce «en cuanto el dedo entra» (:240), **cancela el tiro**. La alternativa de la decisión 7, deslizar hacia abajo, solo tiene 34 px de pantalla por debajo de Xut. La métrica (:255) solo comprueba el caso buscado.
- *Por qué importa:* picados y altos se convertirían en amagos sin querer, y el tiro picado es justo el que «salta la muralla de sticks».
- *Propuesta:*
  - Amago solo con un arrastre casi vertical (menos de 15° de inclinación, que hoy es «raso» y no cambia nada), que entre en el círculo de Regat (no en el rectángulo + 10 px) o se quede ≥ 60 ms dentro.
  - Métrica inversa con arrastres sintéticos: «↖ y ↗ de 40-120 px desde cualquier punto de Xut → 0 % de amagos».

**O7 — Los objetivos de picar, cuchara y amago se miden sin portero** · Gravedad **Media**
- *Qué falla:* «entre los palos ≥ 75 %» (:326), la cuchara «sin portero, ≥ 50 %» (:358) y el portero que no llega hasta F1.8 (:22). Pero el sentido de la jugada es tumbar al **portero** («amagar al portero hasta que cae y entonces levantar la bola», REFERENCIA §1.4; aceptación de F1 en docs/06:23).
- *Por qué importa:* sin portero, esas cifras solo miden la puntería. La ronda 3 preguntaría «¿se siente bien?» sin el rival para el que existe la jugada.
- *Propuesta:* un portero provisional mínimo en F1.6d (una caja en «mariposa» que reacciona a `shotFeintTick`), o adelantar un F1.8 mínimo antes de F1.6f. Marcar esas cifras como «provisionales, sin portero» y no usarlas como criterio de aceptación.

**O8 — Rodear la portería «a 4 y 6 m/s» es imposible con la física que el propio plan cita** · Gravedad **Media**
- *Qué falla:* el plan da el radio de giro mínimo, 0,35 + 0,12·v² (:42), y luego pide rodear la portería a 4 y 6 m/s sin pararse más de 0,5 s (:355). Con 1,88 m de hueco detrás y un jugador de 0,3 m de radio, rodear una portería de ~1,9 m de ancho exige radios de ~1-1,5 m, es decir, ≤ 2,5-3,2 m/s. A 6 m/s el radio mínimo es de 4,7 m.
- *Por qué importa:* el banco fallará siempre o se redefinirá después de medir, y eso es justo un objetivo que se ajusta a la medida.
- *Propuesta:* escribir el objetivo como velocidad de **entrada**, «frena y rodea». Medir el tiempo de poste a poste, bola conservada ≥ 90 % y 0 túneles. Antes, arreglar los dos modelos de portería distintos (auditoría B, F5: 3,8 cm), que es justo donde se notan.

**O9 — Falta lo que más se usa detrás de la portería: la pared con la valla de fondo y las esquinas** · Gravedad **Media**
- *Qué falla:* el plan constata que `wallPass.ts` solo usa las vallas laterales (:42), y F1.6g (:340-345) no lo amplía. La decisión 13 manda el rebote hacia un compañero a F2, y PLAN_F2:626 lo pone como opcional y el primero que se recorta (PLAN_F2:740). Sin embargo, la **recomendación n.º 1** del informe real (ordenadas por impacto) es el rebote en la valla, con «uso constante de las vallas redondeadas de detrás de la portería para autopases» (REFERENCIA §1.3 y §1.8).
- *Por qué importa:* el juego detrás de la portería que pidió Guillem quedaría sin su herramienta principal.
- *Propuesta:* en F1.6g, extender `planWallPass` a la valla de fondo y a las esquinas para el autopase (la geometría del punto espejo y la bisección ya existe). Banco: «autopase por la esquina rodeando al rival Encara ≥ 60 %». A cambio, recortar el deslizamiento para rematar (decisión 2) o la Conducció llarga.

**O10 — La red de protección no cubre lo que se toca** · Gravedad **Media**
- *Qué falla:* el plan se protege con el banco J idéntico (:144, :297, :394). Pero el banco J solo mide pase, tiro, volea y rechaces (auditoría J, «Qué mide»): nada de conducción, separación de la bola, trencada, derrape ni pérdidas. Y F1.6b toca justo `stepPlayer` (la excepción de la trencada) y quién mueve la bola durante un regate (:192), mientras F1.6a mete un jugador nuevo en `stepWorld`. La auditoría E recomienda **antes de F1.6** dos cosas que el plan no recoge: R1, el hash de determinismo con dos mundos intercalados, y R4, partir `stepPlayer` y `stepWorld` (E.4, filas R1 y R4, y su «orden recomendado»).
- *Por qué importa:* se podría romper la trencada o la conducción y el banco J seguiría «idéntico».
- *Propuesta:* un sub-paso F1.6-0 antes de F1.6a con tres cosas, en este orden:
  1. R1;
  2. un bloque «conducción y patinaje» en `bench:feel` (separación, pérdidas a sprint, trencada con su tiempo y su velocidad de salida, derrape);
  3. R4 con el hash idéntico.

**O11 — El rival de prueba hereda dos sesgos del código fijado al equipo 0** · Gravedad **Media**
- *Qué falla:*
  - En el bucle de recepción, si dos sticks llegan a la bola en el mismo tick gana siempre el índice más bajo, es decir, el humano (world.ts:558-599, `break`). PLAN_F2:67 lo arregla en F2a, **después** de medir los regates.
  - `ballLooseForTeam` es verdadero cuando la lleva un rival (world.ts:183-188), así que con los 2 compañeros de Entrenamiento un robo del rival puede disparar el cambio automático.
  - El rival «fijo contra el controlado» se reescribirá como `defendStep(world, i, assignment, out)` (PLAN_F2:340).
- *Por qué importa:* todas las cifras de F1.6a-d (robada ≥ 80 %, superar ≥ 75 %…) están medidas con un sesgo a favor del atacante y cambiarán en F2a. Además, se programa dos veces lo mismo.
- *Propuesta:* pasar la «recogida justa» y la protección del cambio automático a F1.6a, y escribir `ai/defender.ts` desde el principio con la firma de F2.

**O12 — Lo que el plan mide en metros, la cámara TV lo enseña en pocos píxeles** · Gravedad **Media**
- *Qué falla:* desplazamientos de 0,7 m (:122) y separación ≤ 0,45 m (:198). Con la cámara TV (10 m de altura, 21 m de distancia, fov 0,6; tuning.ts:773-779) salen unos ~29 px por metro a lo largo de la pista y ~12 px por metro en profundidad (acortamiento 10/23). Un cambio de lado atacando a lo largo de la pista mueve la bola en profundidad: **~9 px**. La cápsula mide ~17 px. Y la anticipación (0,08-0,10 s, 5-6 fotogramas) es «la señal» a la que reacciona el rival (:133): el rival la ve, Guillem casi no.
- *Por qué importa:* el riesgo 7 (:406) es real y se descubriría en la ronda 3, demasiado tarde.
- *Propuesta:* en F1.6b, medir en una captura cuántos píxeles de pantalla se mueve la bola con cada cámara, con un objetivo de ≥ 20 px en la TV (o exagerar el desplazamiento solo en el render). Decidir pronto si Entrenamiento usa la cámara Cercana.

**O13 — La tabla A frente a B no es justa: la anticipación existe con los dos** · Gravedad **Media**
- *Qué falla:* la tabla pone «A: 0 ms y ninguna ambigüedad» (:88), pero todos los regates llevan una anticipación de 0,08-0,10 s en la que la bola no se mueve, también con A (:133). docs/03:156 (§9) pide «latencia de la entrada al movimiento visible ≤ 50 ms».
- *Por qué importa:* sesga la recomendación de A y no comprueba un criterio que ya está escrito.
- *Propuesta:* o bien la anticipación se ve desde el primer tick (inclinación medible en pantalla), o bien con A no hay anticipación. En los dos casos, añadir la métrica «latencia de la pulsación al primer movimiento visible ≤ 50 ms».

**O14 — Métricas que se cumplen solas** · Gravedad **Media**
- *Qué falla:*
  - Los gestos «reconocidos el 100 % dentro de las reglas y el 0 % fuera» (:294-295) y el amago «100 % con el arrastre sintético» (:255) solo comprueban el reconocedor contra su propia especificación.
  - El rival se afina en el mismo banco y en el mismo sub-paso que los regates que debe medir («robada ≥ 80 %» :169, y luego «supera ≥ 75 %» :197).
- *Por qué importa:* todo puede salir en verde con un gesto que en el móvil se dispara sin querer, o con un rival hecho a la medida de los objetivos.
- *Propuesta:*
  - Congelar los parámetros del rival al cerrar F1.6a, con su propia línea base («defender-v1»).
  - Añadir contadores a la línea de diagnóstico del panel que Guillem pueda copiar tras jugar: regates por tipo, conversiones de regate a aixecar, amagos, gestos A empezados y abortados, y «aixecar sin querer» (levantada seguida de una pérdida en < 1 s). Son tasas reales del Pixel, sin que Guillem programe nada.

**O15 — Ocho sub-pasos «de una sesión» que no lo son, y el recorte propuesto es el equivocado** · Gravedad **Media**
- *Qué falla:* F1.6e (:264-311) junta física, `liftOwner`, la regla del joystick, dos reconocedores, la proyección con la cámara, la pista visual, dos secciones del panel, tres tests y un e2e. Y el riesgo 10 (:409) propone recortar F1.6g, que es justo lo que pidió Guillem.
- *Por qué importa:* se cortaría por donde el encargo no lo permite.
- *Propuesta:*
  - Partir F1.6e en e1 (física, `liftOwner` y banco, con teclado) y e2 (gesto).
  - Si hay que recortar, quitar por este orden: el gesto que pierda (O2), deslizar para rematar (decisión 2; Xut ya funciona), la Conducció llarga (no está en docs/03 §4 ni en el encargo), el impulso al encadenar (decisión 14) y el interruptor de la cámara lenta (decisión 11).

**O16 — Demasiadas decisiones para Guillem, y varias son técnicas** · Gravedad **Baja-Media**
- *Qué falla:* el §9 (:411-427) tiene 16 decisiones, y el resumen de la FASE 4 admite «hasta 8» entre los dos planes. Según CLAUDE.md, «los cambios técnicos internos: decide tú». Son técnicas o ya están documentadas: la 0 (orden de trabajo), la 3 (ya lo dice docs/03:104), la 8 (cómo se configura una herramienta de prueba), y la 12 y la 14 (valores del panel).
- *Por qué importa:* Guillem decide mejor pocas cosas bien explicadas.
- *Propuesta:* dejar 5: el gesto (1, con los nombres de O1), la lista de regates con la finta y sin la vaselina (4), que Regat gane a la trencada y al derrape (6), extender «el joystick solo apunta» (10) y lo de detrás de la portería (13). El resto, «decide Claude; se revisa en la ronda 3».

**O17 — Pruebas en el móvil sobre una PWA que puede estar vieja** · Gravedad **Baja-Media**
- *Qué falla:* la auditoría I mide que la app que vuelve de «recientes» nunca busca la versión nueva y que se recarga sola en mitad de una jugada. El plan depende de 8 o más despliegues y de una ronda con «PATINS tuning vX» (:371).
- *Por qué importa:* Guillem puede estar probando una versión anterior y dar por buena o mala una cosa que no ha visto.
- *Propuesta:* la P-A de la auditoría I (aviso «Hi ha una versió nova») como requisito previo de F1.6a, y que el primer punto de cada lista de qué probar sea «comprueba que el panel dice vX».

**O18 — Rendimiento: dos cifras distintas para lo mismo y una prueba que no mide bien** · Gravedad **Baja**
- *Qué falla:* «≤ 0,03 ms por tick con CPU ×4 (hoy 0,01)» (:395), mientras PLAN_F2:91 da «hoy ~0,03 ms» para lo mismo. La §C de la auditoría (rendimiento) no existe: no hay `docs/audit/C.md` y PROGRESS la tiene sin hacer. Además, `perf.spec` compara tiempo de reloj en una máquina compartida (auditoría E, E.3.3).
- *Por qué importa:* el objetivo no se puede comprobar, y el riesgo real de F1.6 es el render (el rival, su stick, las estelas y la pista de la zona libre), no la simulación.
- *Propuesta:* medir en el Pixel con `?debug=1` y con referencias relativas, y fijar un presupuesto de draw calls para lo nuevo.

**O19 — Reglamento: «tirarse a tapar»** · Gravedad **Baja**
- *Qué falla:* el rival «se tira a tapar» y queda «tumbado» (:241, :309). docs/02 solo deja tumbarse al portero en su área («fuera del área se comporta como jugador»), y el art. 6.1 limita con qué se juega la bola.
- *Por qué importa:* si un jugador de pista no puede jugar la bola tumbado o de rodillas, el premio del amago sería una falta en F3.
- *Propuesta:* modelarlo como «stick plano en el suelo, agachado» (sin tumbarse), con [VERIFICAR] en docs/02 para F3.

**O20 — La capa de entrada decide entre `lift` y `swipeStrike` mirando el estado de la simulación** · Gravedad **Baja-Media**
- *Qué falla:* el mismo deslizamiento significa aixecar «con la bola en el stick» y picar «con la ventana abierta» (:54-59), y la entrada emite órdenes distintas (`lift`, `swipeStrike`; :68-72). Para elegir, `src/input` tiene que leer el estado del último fotograma, que va un fotograma por detrás de la simulación, y con la cámara lenta todavía más.
- *Por qué importa:* en los bordes (bola recién recogida, ventana que se acaba de cerrar, levantada que acaba de salir) se emite la orden equivocada, y la simulación ya no puede corregirla. Además, el teclado y el mando tendrían que repetir esa misma lógica.
- *Propuesta (decisión técnica, para DECISIONS):* una sola orden `airSwipe {dirX, dirY, longitud}`. La simulación la interpreta en el tick en que llega: aixecar si llevas la bola, remate si la ventana está abierta, nada en otro caso. Test: el mismo `airSwipe` en el tick de la recogida y en el de cierre de la ventana da el resultado esperado.

**Lo que cambiaría primero**
- Renombrar las opciones de aixecar (O1) y elegir el gesto **antes** de F1.6e, con la medida del pulgar y un prototipo de entrada (O2).
- Añadir F1.6-0: hash de determinismo, bloque «conducción y patinaje» en `bench:feel` y la recogida justa (O10, O11).
- Rediseñar la elección del regate frente a la trencada, el derrape y el desfase entre pulgares, y quitar «finta = joystick suelto» (O5).
- Reglas propias de la levantada: sin recoger ni rematar mientras sube, y joystick lateral libre (O3, O4).
- Amago solo con un arrastre vertical que se quede en Regat, más la métrica inversa con picados y altos (O6).
