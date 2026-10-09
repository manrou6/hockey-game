# 02 — Reglamento (World Skate, versión 2026) adaptado al juego

Fuente de verdad: reglamento oficial World Skate de rink hockey (descargable en worldskate.org; rulebook 2026 en inglés: https://hoqueipt.com/media/docs/rulebook-2026-en.pdf) y su documento de aclaraciones de enero 2026. Si este archivo contradice el reglamento oficial, gana el oficial. Las medidas marcadas [VERIFICAR] deben contrastarse con el reglamento técnico antes de fijarlas en el código. Lo marcado **(verificado por Guillem, 2026-10-09)** está contrastado con ese reglamento 2026.

## Pista y material
- Pista rectangular de esquinas redondeadas. Medida de referencia del juego: 40 × 20 m (rango oficial aprox. 34-44 × 17-22) [VERIFICAR].
- Valla perimetral de ~1 m de altura: la bola rebota y sigue en juego (elemento clave de la jugabilidad).
- Porterías: 1,70 m de ancho × 1,05 m de alto (interior), con espacio jugable por detrás [VERIFICAR distancia línea de gol-valla, aprox. 2,8 m].
- Área de penalti rectangular frente a cada portería (aprox. 9 × 5,4 m) [VERIFICAR].
- Punto de penalti a 5,4 m y punto de libre directo a 7,4 m de la línea de gol [VERIFICAR].
- Bola: **72 mm de diámetro y 150 g ± 5 g** (reglamento técnico, art. 4; verificado por Guillem, 2026-10-09). El juego usa hoy una bola de 23 cm de circunferencia (73,2 mm de diámetro) y su rozamiento con el aire está calculado para ~155 g: diferencia mínima, sin cambios hasta F3 (ver «Choques con el juego actual»).

## Equipos
- 5 en pista: 4 jugadores + 1 portero. Convocatoria de 10 (8 + 2 porteros).
- Cambios ilimitados y "al vuelo" por la zona de banquillo. Cambio irregular = tarjeta azul (sin libre directo si el juego estaba activo).

## Tiempo
- 2 partes a reloj parado (real 2 × 25 min; en juego configurable, ver GDD).
- Tiempo muerto: 1 por equipo y parte (1 min) [VERIFICAR].
- Si se pita libre directo o penalti con menos de 3 s, el reloj se pone a 5 s solo para el lanzamiento, sin rebote.

## Antijuego (posesión)
- El equipo atacante dispone de un tiempo máximo de posesión para tirar (45 s) [VERIFICAR]. Mostrar contador en el marcador cuando quedan 10 s.
- Pasividad prolongada: aviso y pérdida de posesión (falta técnica, libre indirecto).

## Juego
- La bola se juega con el stick, el patín o las extremidades inferiores, de la cintura hacia abajo (art. 6.1; verificado por Guillem, 2026-10-09). Nunca con las manos, salvo el portero en su área.
- Stick por encima de los hombros: es **falta técnica cuando pone en peligro** a rivales o compañeros (art. 15.1.m; verificado por Guillem, 2026-10-09). No es falta siempre (antes este documento decía «siempre, salvo en el tiro»).

### Bola alta (verificado por Guillem, 2026-10-09)
- **Altura máxima 1,50 m**: la bola no puede levantarse ni jugarse a más de 1,50 m del suelo, excepto el portero dentro de su área (art. 6.3).
- Levantarla por encima de 1,50 m es **falta técnica**, pase lo que pase después (art. 15.1.d).
- Si la sube un **defensor dentro de su propia área** con un movimiento del stick: libre indirecto desde una esquina superior del área, **no penalti** (art. 21.2; art. 29.3).
- El **lugar de la falta** es donde el stick golpeó la bola (art. 20.2).
- Si la bola sube a más de 1,50 m por un **rebote en la portería o en la valla**, sigue en juego (art. 6.5.c).
- **Gol no válido** si se golpea la bola a propósito por encima de la portería, en un tiro o en un pase (art. 7.3.c).
- Portero: puede tumbarse y usar todo el cuerpo en su área. Fuera del área se comporta como jugador.

## Faltas y sanciones
| Tipo | Sanción técnica | Sanción disciplinaria |
|---|---|---|
| Falta leve | Libre indirecto | Ninguna. Cuenta como falta de equipo si es de contacto/antideportiva |
| Falta de equipo acumulada | En la 10ª, 15ª, 20ª... falta de equipo: libre directo | — |
| Tarjeta amarilla (nueva 2026) | Según la falta | Aviso; 2 amarillas al mismo jugador = azul |
| Falta grave (azul) | Libre directo solo si cortaba una ocasión manifiesta de gol; si no, libre indirecto | 2 min de inferioridad, se cumplen enteros |
| Falta muy grave (roja) | Libre directo o penalti según caso | Expulsión + 4 min de inferioridad, se cumplen enteros |
| Falta dentro del área (que lo merezca) | Penalti | Según gravedad |

- Novedad 2026 clave para el juego: recibir gol en inferioridad NO libera al sancionado. La inferioridad dura su tiempo completo.
- Tirar la bola fuera a propósito para retrasar el reinicio: amarilla + falta de equipo.
- Banquillo: la primera amarilla a cualquier miembro del banquillo es aviso colectivo; la siguiente es roja directa al infractor y 4 min de inferioridad al equipo.

## Libre directo y penalti (2026)
- El lanzador tiene 5 s para iniciar tras la indicación del árbitro.
- Penalti dinámico: el lanzador puede arrancar, fintar y regatear como en un libre directo.
- El portero puede moverse/adelantarse desde el silbato.
- Resto de jugadores detrás de la línea de la bola/fuera de la zona [VERIFICAR posición exacta].
- Si es en el último segundo (regla de 5 s): un solo intento, sin rebote.

## Desempates
- Copa/eliminatoria: prórroga (gol de oro o 2 × 5 min según competición) [VERIFICAR] y después tanda de libres directos: primera serie de 3 por equipo; si persiste el empate, series sucesivas de 1. Un mismo jugador puede lanzar todas las de su equipo en las series de 1.

## Choques con el juego actual (v0.1.28; decisión pendiente para F3)
Nada de esto cambia el juego todavía: en F3 (reglas y árbitro) se decide si se aplica la regla estricta o si es una opción de Configuració.
- **Bola por encima de 1,50 m (art. 6.3 y 15.1.d)**: hoy no es falta. Pasan de 1,50 m: la **vaselina** (punto más alto 1,37 m a 12 m, que algunas veces llega a 1,51 m; 1,96 m a 16 m; 2,58 m a 20 m; 3,36 m a 25 m), el **alto fuerte largo** (más de 20 m: 1,89 m de media a 25 m, hasta 2,08 m) y el **tiro picado** (1,84 m de media a 10 m, 2,56 m a 14 m). Cumplen: el alto fuerte hasta ~17 m (máx. 1,33 m, F1.5e), el tiro alto y el remate en el aire (contacto hasta 1,50 m, `volley.maxHeight`).
- **Defensor que la sube en su área (art. 21.2) y lugar de la falta (art. 20.2)**: no hay faltas aún.
- **Rebote que sube por encima de 1,50 m (art. 6.5.c)**: el juego ya lo deja seguir (no hay regla de altura).
- **Gol tras golpearla a propósito por encima de la portería (art. 7.3.c)**: hoy cuenta cualquier gol.
- **Stick por encima de los hombros (art. 15.1.m)**: el juego no modela la altura del stick; un remate en el aire muy alto (1,2-1,5 m) podría ser falta si pone en peligro a alguien.
- **Bola (art. 4)**: 73,2 mm en el juego frente a 72 mm, y rozamiento con el aire calculado para ~155 g frente a 150 g ± 5 g.
- **Jugar con el patín o las piernas (art. 6.1)**: el juego solo usa el stick.

## Simplificaciones permitidas en el juego
- Medidas exactas de pista se pueden redondear si no afectan a la jugabilidad.
- El árbitro es un sistema de reglas (con dos árbitros visuales en pista), sin error humano en dificultad Normal. En dificultad Leyenda, opción "árbitro realista" con ventaja y criterio más permisivo.
- Opciones de reglas para el jugador: Completo (por defecto) / Simplificado (sin amarillas ni antijuego, faltas de equipo cada 10).
