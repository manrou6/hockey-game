# 03 — Jugabilidad: física, controles, regates, cámara e IA

Todos los números son valores iniciales para afinar. Viven en src/config/tuning.ts y se pueden tocar en vivo desde un panel de debug (solo en build de desarrollo).

## 1. Sensación de patinaje
- Simulación a 60 Hz con paso fijo; render interpolado.
- Jugador = cápsula en el plano de la pista con inercia real de patinador:
  - Velocidad máx. normal (también conduciendo): ~8,4 m/s. Sprint sin bola: ~12,6 m/s (~45 km/h, valor de Guillem en la ronda 1, pendiente de valorar en el móvil; un jugador real ronda 30-35 km/h); con bola ~9,3 m/s. Giro a velocidad más abierto y caro que en F0 (radio mínimo ~9 m a 8,4 m/s), deslizamiento al planear más corto. Valores de fábrica = ajustes de Guillem en la ronda 1 (2026-10-02).
  - Aceleración desde parado: curva no lineal (arranca fuerte), ~0 → 90 % de la máxima normal en ~1,5 s.
  - **Empujón de sprint**: al entrar en sprint (zona exterior del joystick, Shift, mando) hay un impulso breve (~0,25 s de aceleración extra que puede pasar un poco del tope de sprint), con un tiempo de recarga para que no se pueda encadenar; al salir del sprint, desaceleración suave y natural hasta la velocidad normal.
  - Giro: radio mínimo crece con la velocidad (a tope no se gira en seco). Giro cerrado = pérdida de velocidad.
  - **Trencada (corte lateral de 4 ruedas que redirige)** (petición de Guillem, opción A, 2026-10-02; equilibrada en v0.1.8-v0.1.9): a ≥ 5 m/s, si el joystick gira **de golpe** (en ≤ 0,15 s) a entre 60° y 126° de la marcha. Dos fases: **(1) frenada previa** (~0,3 s; era 0,5 s en v0.1.8) derrapando en la dirección vieja, perdiendo ~35 % de la velocidad y empezando a girar el cuerpo — es el tiempo de reacción del rival; **(2) giro** (~0,25 s) de lado hacia la nueva dirección. Sale a ~38 % de la velocidad que llevaba, con un empujón suave (8 m/s² durante 0,2 s), y durante 0,6 s no puede esprintar aunque el pulgar esté en el anillo: tiene que reacelerar. El empujón de salida comparte recarga con el de sprint. Recarga de la trencada 0,8 s **contados desde el final de la maniobra**. Volver el joystick a la dirección antigua (también durante la frenada previa) la cancela. Las curvas normales no la disparan; por encima de 126° es la frenada-derrape. Con bola, se separa del stick (separación extra reducida por el atributo Control). Opción "solo con sprint" (Sí/No, por defecto No).
  - **Frenada de 4 ruedas (derrape)** (sustituye a la frenada "en T" de F0; petición de Guillem): al llevar el joystick en sentido contrario a la marcha, o al soltarlo de golpe a velocidad (levantar el pulgar), el jugador no se para en seco: sigue deslizando en la dirección que llevaba, pierde la velocidad en ~0,4-0,6 s y gira un poco el cuerpo hacia el lado del derrape. Si se vuelve a empujar hacia delante, el derrape se cancela. Con la bola en el stick a velocidad alta, el derrape la separa del stick (misma regla de separación de la conducción). Sonido de ruedas y chispas: F4.
  - Deslizamiento: si en vez de soltar de golpe se devuelve el joystick al centro poco a poco, el jugador planea y desacelera suave, nunca se para de golpe.
  - Contacto: empujones hombro con hombro según Físico; nunca atravesar jugadores ni la valla.
- Resistencia: el sprint la gasta; baja → menor aceleración y peor control. Cambios recuperan.

## 2. Bola
- Física 3D propia: posición con altura (z), rodadura, fricción, giro.
- Rebote en valla con pérdida de energía (~0,7) y algo de aleatoriedad determinista. Rebote en postes y travesaño.
- La bola puede ir por el aire (pase elevado, vaselina, tiro alto) y botar.
- Conducción: la bola va "imantada" al stick con un margen; a más velocidad y peor Control, más se separa y más fácil es robarla. Nunca debe parecer pegada con pegamento.
- Tiro: potencia ~15-30 m/s según carga y atributo. Precisión con cono de error que se reduce con atributo y tiempo de preparación.

## 3. Controles (dos esquemas, seleccionables y combinables)
### A. Joystick + botones (por defecto)
- Joystick virtual flotante (aparece donde pones el pulgar izquierdo, mitad izquierda de la pantalla).
- **Velocidad analógica y sprint en el joystick** (cambio de diseño pedido por Guillem, 2026-10-02; antes el sprint era REGATE mantenido): cuanto más lejos del centro, más rápido. Zona muerta central → no se mueve; de ahí hasta el **umbral de sprint** (90 % del recorrido por defecto) la velocidad sube de 0 a la máxima normal (7,5 m/s) según una **curva de respuesta** (1 = lineal, más = más precisión al principio; por defecto 1,5); desde el umbral = **sprint** (~9 m/s). Un anillo en el joystick marca dónde empieza el sprint y se ilumina (junto con el pulgar) mientras esprintas; un margen anti-parpadeo evita entrar y salir en la frontera. El umbral se ajusta en el panel entre 70 % y 130 % (más de 100 % = arrastrar el pulgar más allá del borde del círculo). Todo lo que depende del sprint (separación de la bola, y en el futuro la resistencia) usa esta definición.
- Botones (derecha), grandes, semitransparentes, posiciones editables (de momento desde el panel de afinación, sección "Botons"; editor de arrastrar en F1.7):
  - PASE: toque = pase raso al compañero en la dirección del joystick. Mantener = pase elevado/largo.
  - TIRO: toque = tiro rápido. Mantener = carga (barra) y soltar. Deslizar el dedo al soltar = dirección/efecto (arriba = tiro alto).
  - REGATE: pulsar = finta/regate contextual según dirección (sale al pulsar). Ya no hace sprint.
  - En defensa: PASE → cambiar jugador, TIRO → entrada/robo, REGATE (mantener) → presionar. El sprint, también en defensa, es la zona exterior del joystick.
- Buffer de input de 150 ms (si pulsas un poco antes de recibir, la acción sale al recibir).
- Asistencia al pase y apuntado configurable (Desactivada / Ligera / Fuerte).

### B. Gestos
- Mano izquierda igual (joystick, con su velocidad analógica y su zona de sprint). Mano derecha: deslizar corto = pase en esa dirección, deslizar largo hacia portería = tiro (longitud = potencia), doble toque = regate.

### PC
- Teclado: WASD/flechas = patinar a la velocidad normal máxima (las teclas no son analógicas), Shift = sprint, J = pase, K/Espacio = tiro, L = regate.
- Mando (Gamepad API): stick izquierdo analógico (a fondo = sprint), RB/RT = sprint, A = pase, B = tiro, X = regate.

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
