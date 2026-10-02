# 02 — Reglamento (World Skate, versión 2026) adaptado al juego

Fuente de verdad: reglamento oficial World Skate de rink hockey (descargable en worldskate.org) y su documento de aclaraciones de enero 2026. Si este archivo contradice el reglamento oficial, gana el oficial. Las medidas marcadas [VERIFICAR] deben contrastarse con el reglamento técnico antes de fijarlas en el código.

## Pista y material
- Pista rectangular de esquinas redondeadas. Medida de referencia del juego: 40 × 20 m (rango oficial aprox. 34-44 × 17-22) [VERIFICAR].
- Valla perimetral de ~1 m de altura: la bola rebota y sigue en juego (elemento clave de la jugabilidad).
- Porterías: 1,70 m de ancho × 1,05 m de alto (interior), con espacio jugable por detrás [VERIFICAR distancia línea de gol-valla, aprox. 2,8 m].
- Área de penalti rectangular frente a cada portería (aprox. 9 × 5,4 m) [VERIFICAR].
- Punto de penalti a 5,4 m y punto de libre directo a 7,4 m de la línea de gol [VERIFICAR].
- Bola: ~155 g, ~23 cm de circunferencia [VERIFICAR].

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
- La bola se juega con el stick. Desde 2026 también se permite jugarla con patines, piernas y cintura (no con las manos, salvo el portero en su área).
- Stick por encima del hombro (salvo en el tiro): falta.
- Bola por encima de la altura reglamentaria intencionadamente [VERIFICAR regla de bola alta]: falta.
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

## Simplificaciones permitidas en el juego
- Medidas exactas de pista se pueden redondear si no afectan a la jugabilidad.
- El árbitro es un sistema de reglas (con dos árbitros visuales en pista), sin error humano en dificultad Normal. En dificultad Leyenda, opción "árbitro realista" con ventaja y criterio más permisivo.
- Opciones de reglas para el jugador: Completo (por defecto) / Simplificado (sin amarillas ni antijuego, faltas de equipo cada 10).
