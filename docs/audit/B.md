## §B Robustez de la simulación

Auditoría de BLOQUE 2 sobre la v0.1.29 (commit 00fc599). **No se ha cambiado nada de `src/`.** Todo lo de aquí se
reproduce con el banco permanente `tests/unit/bench/stressBench.ts` + `stressBench.test.ts` (solo corre con
`PATINS_BENCH=1`; en `npm test` sale «skipped»).

**Resumen.** En 2,4 millones de ticks de partidas con entradas aleatorias (más 546 000 con ajustes extremos del panel,
114 000 del bucle real y 2 M de tiros a 28-37 m/s) **no ha salido ni un NaN/Infinity, ni un túnel a través de
postes, larguero, red o valla, ni un jugador fuera de la pista, ni una bola atascada o inalcanzable, ni un pase que
no se resuelva, y la simulación es determinista** (también a 0,8 / 1,0 / 1,4 de velocidad, a 30 / 60 / 144 Hz, con
tirones y con la cámara lenta: solo cambia cuántos ticks se ejecutan). Sí hay **6 fallos reales y claros**, todos
arreglables sin cambiar el tacto (candidatos a una v0.1.30): el más visible, **CANVI mientras el stick acompaña
una volea teletransporta la bola 2-10 m** (F1), y el de §A, **el alto fuerte de más de 16,5 m se pierde si apuntas a
la portería mientras vuela** (F6).

### Método

**Cómo se ejecuta** (todas las cifras de este documento salen de aquí):

```
PATINS_BENCH=1 npx vitest run tests/unit/bench/stressBench --maxWorkers=1            # todo (B1-B6)
PATINS_BENCH=1 npx vitest run tests/unit/bench/stressBench --maxWorkers=1 -t "B1"    # una parte
# tamaños: PATINS_STRESS_GAMES (2000), PATINS_STRESS_SECONDS (20), PATINS_STRESS_LOOP_GAMES (8)
```

Tiempo medido (máquina de 4 CPU compartida con otros agentes, 2026-10-10): **140 s en total**; B1 79,5 s, B2 13,2 s,
B3 14,6 s, B4 10,7 s, B5 21,4 s, B6 unos segundos.

**Entradas.** Un LCG de 32 bits con semilla propia (`Lcg`, nunca `Math.random`) maneja al «humano» (`policyStep`):
tramos de joystick (dirección al azar, *flicks* de 50-150° a sprint para trencadas y frenadas, ir a por la bola,
joystick suelto, hacia la portería), PASE y TIRO (toque o mantenido hasta 1,5-2 s, las 3 alturas, la altura cambiada
mientras se mantiene, los dos a la vez), REGATE, CANVI (y CANVI machacado al 8 % por tick mientras el stick acompaña
una volea, a propósito), e intentos de volea (Xut mantenido cuando viene una bola en el aire y soltado en el contacto
± 0,3 s, a veces mantenido de más: el «soltar tarde»). La política mira el mundo, pero sigue siendo una función
determinista de (mundo, su LCG). Mundo: `createWorld(seed, 2)` como el juego (2 compañeros); por semilla se alternan
los 4 niveles de asistencia y, 1 de cada 20, bola pesada, `mates.switchControl` = 0 o sin compañeros.

**Comprobaciones en cada tick** (`Monitor`): NaN/±Infinity en cualquier número del mundo (los campos que usan NaN como
«ninguno» —`latchDir`, `meetX/Y`, `wallX/Y`, `timing`, `contactHeight`, `shotPressHeading`, `receivedBallAngle`,
`stickHist`— pueden ser NaN, nunca ±Infinity); índices válidos; bola bajo el suelo; bola más allá de la línea de la
valla (separado: suelta / en el stick / acompañada en la volea); bola dentro de un poste o del larguero (> 2 mm),
dentro de la red por fuera (> 2 mm), dentro de la portería sin gol, gol que no entra por la boca; bola «dentro» pero
fuera de la jaula; saltos de la bola en un tick mayores que lo que permite su velocidad (por tipo: suelta, en el
stick, al recogerla, al soltarla, en la volea); jugadores dentro de la valla o de una portería, velocidades;
**atascos**: bola parada 4 s → prueba de alcance (se copia el mundo y se lleva al jugador controlado hacia ella 10 s;
si falla, se prueba desde 32 posiciones alrededor), bola parada por encima de la altura del stick 2 s, bola que
vibra sin moverse 2 s, `passTo`/`wallFrom` > 8 s, `passFrom` sin receptor > 8 s, volea acompañada más de su
ventana, contacto de volea abierto > 3 s, reinicio tras gol > 2 s. Además cuenta qué se ha ejercitado (cobertura).

**Partes del banco.**

| Parte | Qué | Tamaño y semillas |
|---|---|---|
| B1 | Partidas a nivel de tick, todo comprobado cada tick | 2000 partidas × 20 s, semillas 1..2000 (entradas: LCG `seed·7919+17`) = 2 400 000 ticks |
| B2 | Túneles: tiros de solo-física de bola a postes (todas las direcciones delante y por fuera), larguero, boca, red (lados, fondo, techo), vallas, esquinas, y «apretones» con 1-3 jugadores moviéndose junto a la portería | 21 329 tiros a 28 / 29 / 30 / 37 m/s (LCG 4242; bote de valla con semilla 9000+i) + 6 452 con la bola pesada a 30 m/s = 2 018 322 ticks |
| B3 | Determinismo | 60 semillas (101..160) × 20 s, 5 formas (abajo) |
| B4 | **El bucle real** (`src/game/game.ts`, clase `Game`, sin render: `performance.now` simulado) | velocidad 0,8 / 1,0 / 1,4 × fotogramas de 1/30, 1/60, 1/144 s y «tirones» (60 fps ± 2 ms, 2 % de fotogramas de 0 ms, 4 % de 50-400 ms), cámara lenta encendida; 8 partidas × 20 s reales por combinación (semillas 20000..20007) = 96 partidas, 114 112 ticks |
| B5 | Ajustes del panel (`tuningMeta.ts`) | (a) cada uno de los 355 valores del panel (todos menos la velocidad de juego) en su mínimo y en su máximo, uno a uno: 710 partidas × 10 s (semillas 30000..30709); (b) todos al azar en su rango a la vez: 200 × 10 s (LCG 31337, semillas 40000..40199) |
| B6 | Reproducciones dirigidas de cada hallazgo (imprimen el número; tras arreglar deben cambiar) | — |

**Cobertura de B1** (lo que de verdad pasó en las 2000 partidas): 1744 tiros (113 de media vuelta), **233 voleas**
(342 veces el stick acompañando la bola), 1187 goles, 886 bolas fuera, pases 1318 rasos / 1335 altos fuertes / 738
vaselinas, 89 paredes, 5703 recepciones (115 bajando la bola alta), 14 393 trencadas, 39 070 frenadas, 22 293 cambios
de jugador, 1519 bolas paradas ≥ 4 s (todas con prueba de alcance).

### Lo que **no** ha salido (con la evidencia)

| Comprobación | Resultado |
|---|---|
| NaN / ±Infinity en el mundo | **0** en B1 (2,4 M ticks), B4 (114 k), B5 (546 k, con valores extremos del panel). |
| Túnel a 28-37 m/s (postes, larguero, red, valla, esquinas) | **0** en 27 781 tiros (B2): nunca más allá de la valla (máx. −0,000 m), nunca dentro de un poste (máx. 0,000 m), ninguna bola dentro de la portería sin gol, ningún gol por fuera de la boca, ninguna bola bajo el suelo; 100 % de los tiros a la boca son gol salvo 4 que tocan antes el poste/red por geometría. Motivo: subpasos de ≤ 0,9 radios (hasta 24, válidos hasta 47 m/s; el tiro más rápido posible es ~37 m/s; con el panel al extremo, 47,0 m/s, B5b) y la red es una caja sólida. |
| Bola suelta fuera de la pista o bajo el suelo | **0** (B1: centro nunca más allá de la línea de valla; B4 igual). Ver F2 (bola en la volea) e I2 (apretones de ≤ 2,3 cm). |
| Jugadores fuera de la pista o dentro de una portería | **0** (penetración máx. 0,000 m en B1, B4, B5). Solape entre jugadores ≤ 5,4 cm. |
| Bola atascada / inalcanzable | **0** inalcanzables de 1519 bolas paradas ≥ 4 s (B1; en B4 y B5 no se hace la prueba de alcance). En 4 casos el «conductor» simple no llegó desde donde estaba (bola detrás de la portería), pero sí desde alrededor (14/21, 9/15, 14/14, 15/20 aproximaciones). **0** bolas paradas encima de la red, **0** bolas vibrando encajadas. |
| Estados que no se resuelven | **0** `passTo` > 8 s, **0** paredes > 8 s, **0** voleas acompañadas más de su ventana, **0** contactos abiertos > 3 s, **0** reinicios tras gol atascados, **0** bolas «dentro» sin gol > 1 tick. 1 `passFrom` > 8 s (I5: una vaselina sin receptor que rodó 8 s a ≥ 1 m/s; se resuelve sola). |
| Determinismo | 60/60 idénticos **dos veces seguidas** y **reproduciendo** las órdenes grabadas (hash exacto de todo el mundo). **Intercalado** tick a tick con otro mundo y **foto (`structuredClone`) + otro mundo + continuar**: el estado que decide el juego (posiciones, velocidades, posesión, temporizadores, rng) **idéntico en 60/60**; el mundo completo difiere en 18-19 de 60 solo en 3 campos de HUD: F4. |
| Velocidad de juego y cámara lenta | **Leyendo el código:** `src/sim` solo importa de `src/sim` y `src/config` y no lee `tuning.game` ni `tuning.slowMo` (grep, y `simPurity.test.ts`); `game.ts:70-71` multiplica el tiempo real del fotograma por la velocidad (`gameSeconds`) y la escala de la cámara lenta, y `FixedStepLoop` lo convierte en ticks enteros de 1/60 s (máx. 5 por fotograma). **Medido (B4):** 96 partidas del bucle real: reproducir los ticks grabados da el **mismo mundo bit a bit (0 diferencias)**, y con otra velocidad y la cámara lenta apagada en el `tuning` también (**0**); contabilidad del acumulador exacta (error ≤ 4,3·10⁻¹³ s); ticks por segundo real 47,90-47,96 / 59,87-59,96 / 83,99-84,00 a 0,8 / 1,0 / 1,4 (= 60 × velocidad); con cámara lenta, los ticks ejecutados = 60 × velocidad × escala (p. ej. 1,04 s reales → 42,0 pedidos / 42 hechos). |

### Hallazgos

| # | Hallazgo | Severidad | Cómo reproducir (semilla, tick, comando) | Causa probable (archivo:línea) | Arreglo propuesto | ¿Cambia el tacto? |
|---|---|---|---|---|---|---|
| F1 | **CANVI (o cualquier cambio de jugador) mientras el stick acompaña una volea («soltar tarde») teletransporta la bola** a la pala del nuevo jugador controlado: 2-10 m en un tick, con la velocidad de ese jugador; luego se le cae. | **Media** (visible, regala la bola; ventana de ~0,2 s) | B6 F1: 5,59 m. B1: 136 veces en 342 acompañamientos (la política machaca CANVI a propósito), p. ej. semilla 4 tick 225 (3,28 m), semilla 223 tick 598 (10,2 m); B4 semilla 20005 tick 641 (8,6 m, bucle real). `-t "B6"` / `-t "B1"` | `src/sim/world.ts:320-343`: con `v.hold > 0`, `volleyStep` coloca la bola en la pala de `world.controlled` (l. 323, 338), que ya es otro; `switchControl` (l. 172-180) no cierra la volea. | Cerrar la volea al cambiar de jugador (`closeVolley` en `switchControl` si `volley.hold > 0`: la bola cae donde está), o guardar quién la acompaña. | No |
| F2 | **La volea acompañada ignora la valla y las porterías**: la bola va pegada a la pala aunque la pala esté al otro lado de la valla (hasta 0,26 m fuera) o dentro de una portería sin gol; si al caer está a más de ~1 m de altura **se da por fuera** sin haber salido. | **Baja-Media** (cerca de la valla/portería y soltando tarde) | B6 F2: de cara a la valla, 0,24 m fuera; con altura 1,2 m, «fuera». B1: semilla 1024 ticks 141-143 (0,20 m fuera, luego salto de 1,07 m), semilla 1696 ticks 421-427 (dentro de la portería sin gol); B5a semilla 30447 tick 354 (0,26 m). | `src/sim/world.ts:333-343` (no hace lo de `keepInPlay`); `src/sim/ball.ts:194-199` (fuera si está por encima de la valla). | Mantener la bola en juego también en la volea acompañada (como `dribble.ts:79-92`), o terminarla si la pala queda fuera. | No (solo pegado a la valla/portería) |
| F3 | **Tras una bola fuera, se repone dentro de una portería**: se pone 1,2 m delante del jugador controlado, solo apartada de la valla; si está a < ~2 m de cara a una portería queda dentro de la jaula (sin gol) y al tick siguiente la red la expulsa 0,5-0,85 m por detrás o por el lado. | **Baja** (juego libre; F1.6/F2 traerán las reglas de saque) | B6 F3: repuesta en (17,60, 0,30), expulsada 0,59 m. B1: 5 de 886 fueras (semillas 148 t375, 162 t710, 1593 t1180, 1615 t376…); B4 semilla 20001 t321; B5b semilla 40054 t159. | `src/sim/world.ts:243-256` `freePlayBallRules` (solo mira la valla). | Apartar también el punto de las porterías (`collideBox` con radio de bola + margen, como `keepInPlay`). | No |
| F4 | **Datos de un mundo se cuelan en otro** por variables temporales compartidas del módulo: `volley.time`/`volley.height` se copian aunque no haya contacto, y `lastShot.targetY` sale de un plan con `targetY` sin rellenar si el tiro no va a portería. **No cambia el juego** (estado de juego idéntico 60/60) pero el mundo completo deja de ser función solo de (semilla, órdenes). | **Baja** hoy; **Alta** para online/repeticiones (sumas de control, *rollback*) | B6 F4: el `volley.time` de un mundo sin bola pasa de 0 a 0,25 s porque otro mundo calculó un contacto. B3: difiere en 18-19 de 60 (intercalado / foto + continuar), campos `volley.height` 31, `volley.time` 12, `lastShot.targetY` 6. `-t "B3"` | `src/sim/world.ts:366-368` (copia `contactTmp.time/height` aunque `found` sea falso); `src/sim/volley.ts:52-53` (`predictContact` solo reinicia `found/passes`); `src/sim/shot.ts:216-247` (`planShot` no asigna `out.targetY` si no apunta a portería) con `planTmp` de módulo (`shot.ts:345`, `volley.ts:417`). | Copiar tiempo/altura solo si `found` (si no, 0) y dar valor a `targetY` en todas las ramas de `planShot`. | No |
| F5 | **Dos modelos de la portería**: jugadores y bola en el stick usan `goalFootprints` (fondo 0,92 m, media anchura 0,926 m) y la física de la bola otra caja (fondo 0,958 m, media anchura 0,888 m). La bola llevada contra el fondo de la red queda 3,8 cm dentro de la red de la física; si se suelta ahí, salta 3,8 cm. | **Baja** (cosmético) | B6 F5: 3,8 cm dentro, salto 3,8 cm. B1: 422 ticks (semilla 148 ticks 326-329…); B4: 5. | `src/sim/rink.ts:67-75` frente a `src/sim/ball.ts:319-325`; usados en `dribble.ts:79-92` y `rink.ts:133-151`. | Una sola caja de portería (en `rink.ts`) con las medidas de la física, usada por los tres. | No (≤ 4 cm) |
| F6 | **(De §A, verificado.) El alto fuerte de más de 16,5 m se pierde sin tocarlo si, tras soltar el joystick un instante, apuntas a la portería mientras vuela**: el receptor patina hacia donde apuntas. Hasta 16,5 m (llega por el aire) sí se recibe. docs/03 dice que desde la v0.1.29 «desde que sale un alto fuerte dirigido a ti… el joystick solo apunta», sin límite de distancia. | **Media** (pase perdido en una jugada normal) | B6 F6 (pase de 25° hacia un compañero en (6, 2), control al receptor, 3 ticks sin joystick y luego a la portería): 10 / 14 / 16 / 17 m → recibido; **18 m y 20 m → no lo toca (a 5,1 y 4,8 m de su pala)**; con el joystick suelto, recibido a todas las distancias. | `src/sim/world.ts:453`: `aerialPass` exige `world.passAir > 0`, y el alto fuerte de > 16,5 m (`pass.driveAirEnd`) tiene `passAir` 0. | `aerialPass = passTo === controlled && passKind === PASS_DRIVE && inAir(ball)`. | No hasta 16,5 m; a más distancia aplica la regla ya documentada (avisar a Guillem en una línea) |
| F7 | **La trencada se puede redirigir al final y gira al jugador hasta ~155° en un tick** (la velocidad se invierte y la bola en el stick salta 0,71 m). | Baja | B1 semilla 206 tick 1084 (jugador 2: rumbo −2,63 → 0,05 rad, bola 0,71 m). | `src/sim/player.ts:278` (`cutTo = want` en cualquier momento) y `:296-304` (con `e` ≈ 1 el rumbo pasa a `cutTo`). | Limitar cuánto se puede redirigir según avanza la trencada. | **Sí** → (b) |

#### (a) Fallos reales y claros, arreglables sin cambiar el tacto → candidatos a v0.1.30

Orden propuesto por impacto. Cada uno con el test unitario que lo cubriría (en `tests/unit/`, no en el banco); las
funciones `repro*` de `stressBench.ts` ya montan cada caso.

1. **F1 CANVI durante la volea acompañada.** Test (`tests/unit/volley.test.ts`): mundo `createWorld(3, 2)`, bola en la
   pala del jugador 0 con `volley.hold` > 0 y Xut mantenido (como `holdOnStick`), un tick con `switchPlayer` →
   la bola se mueve < 0,4 m en ese tick y `volley.hold` = 0 (hoy: 5,59 m).
2. **F6 alto fuerte largo con el joystick a la portería.** Test (`tests/unit/volley.test.ts`, como el de la v0.1.29
   pero a 18 y 20 m): pase alto fuerte real a un compañero, control al receptor, 3 ticks sin joystick y luego hacia la
   portería → el receptor toca la bola (hoy: no la toca; ≤ 17 m sí).
3. **F3 bola repuesta dentro de la portería.** Test (`tests/unit/rink.test.ts` o uno nuevo de juego libre): jugador
   controlado en (`goalLineX(1)` − 0,8, 0,3) mirando a +x, bola volando por encima de la valla lateral → tras el tick
   del «fuera» la bola está fuera de las dos `goalFootprints` (+ radio) y en el tick siguiente se mueve < 5 cm (hoy:
   dentro, y sale disparada 0,59 m).
4. **F2 volea acompañada contra la valla / portería.** Test (`tests/unit/volley.test.ts`): jugador pegado a la valla
   lateral mirándola, bola acompañada con altura 0,3 y 1,2 m hasta que cae → en ningún tick la bola pasa la línea de la
   valla y no hay evento `out` (hoy: 0,24 m fuera; con 1,2 m, «fuera»); y delante de la boca, nunca dentro de la
   portería sin gol.
5. **F4 datos compartidos entre mundos.** Test (`tests/unit/determinism.test.ts`): dos mundos; calcular un contacto de
   volea en uno no cambia `volley.time/height` del otro; y el hash del mundo completo de una partida intercalada tick a
   tick con otra = el de la misma partida sola (2 semillas × 10 s, como B3).
6. **F5 dos modelos de la portería.** Test (`tests/unit/rink.test.ts`): llevar la bola contra el fondo de la red de +x
   40 ticks → penetración en la caja de la física ≤ 1 mm, y al soltarla no se mueve más de 1 mm en el tick siguiente
   (hoy 3,8 cm).

Tras arreglar, `-t "B6"` debe imprimir: F1 ≈ 0 m, F2 0 m fuera y «out: false», F3 fuera de la jaula y ~0 m, F4 sin
cambio, F5 ≈ 0 cm, F6 recibido a 18 y 20 m; y en B1/B3 deben desaparecer `ballTeleport.holdAfterSwitch`,
`ballBeyondBoards.hold`, `ballInCageNotGoal.*`, `outRespawnInGoal`, `ballInCageNet.carried` y las diferencias del
mundo completo.

#### (b) Todo lo demás (no son fallos claros, o arreglarlos cambia el tacto)

- **F7** trencada redirigida al final (arriba): es tacto; decide Guillem si se limita.
- **I1 Saltos de la bola que son a propósito**, medidos para que se sepa su tamaño: al bajar con el stick una bola alta
  pasa del aire al suelo en un tick (hasta 0,95 m de caída; 153 veces en B1; el dibujo la hace caer en ~0,1 s, v0.1.28);
  al empezar la volea acompañada la bola se pega a la pala (hasta `volley.reach` 0,75 m + su movimiento; máx. 1,05 m);
  la bola en el stick sigue a la pala cuando el jugador gira de golpe (frenada, fin de trencada, giro sobre sí mismo a
  30 rad/s): ≤ 0,71 m (35 casos de 2,4 M ticks por encima de 0,5 m + lo que avanza el jugador).
- **I2 Apretones**: si un jugador empuja la bola contra la valla o la red, el empuje del cuerpo va después de la valla
  en cada subpaso (`ball.ts:202-223`) y la bola acaba ≤ 2,3 cm dentro de la valla (B5b, semilla 40002 t415) o ≤ 1,1 cm
  dentro de la red (B2, apretón a 37 m/s). Cosmético.
- **I3 (lectura de código, sin medir)**: en un subpaso se mira si la bola cruza la línea por la boca (`ball.ts:305-308`)
  antes que los postes (`:313-317`): una bola cuyo centro cruza a menos de un radio del poste por dentro cuenta como gol
  y se coloca dentro (≤ 3,7 cm). B2 no ve ningún gol por fuera de la boca; no parece importar.
- **I4 Tope de 5 ticks por fotograma** (`tuning.sim.maxStepsPerFrame`, sin «espiral de la muerte»): un fotograma de más
  de 83 ms a velocidad 1,0 (104 ms a 0,8; **59,5 ms a 1,4**; con la cámara lenta al 60 %, 139 / 99 ms) pierde tiempo de
  juego: con los tirones de B4 se perdió el 24-31 %. A 60 fps en el Pixel no aplica; a 1,4 un móvil a < 17 fps iría más
  lento de lo pedido. Es diseño.
- **I5** `passFrom` dura mientras un pase sin receptor sigue rodando a ≥ 1 m/s (semilla 1892 t893: > 8 s). Solo excluye
  al que pasó de «receptor»; inofensivo.
- **I6 Panel al extremo (B5)**: ningún ajuste del panel, ni solo ni todos a la vez, produce NaN, túneles ni jugadores
  fuera. Con valores al azar sale la bola suelta a 47,0 m/s (subpasos aún suficientes) y el jugador a 16 m/s (el máximo
  del panel); la bola en el stick llega a «moverse» 2,3 m en un tick (semilla 40034 t110: giro brusco con un stick
  muy largo). Los avisos de B5a por ajuste son F1/F2/F5/I1 con otra semilla, no fallos nuevos.
- **I7** La cámara lenta y la velocidad de juego son escalas globales del bucle: confirmado que la simulación no cambia;
  con rivales y online habrá que revisarlas (ya anotado en DECISIONS, v0.1.28).
- **Sin hallazgo** en: NaN/Infinity, túneles, jugadores fuera, bola atascada o inalcanzable, pases/voleas que no se
  resuelven, determinismo del estado de juego, dependencia de la velocidad o de la cámara lenta (evidencia en la tabla
  de arriba).
