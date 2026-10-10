## §E Salud del código y del panel

Auditoría sobre el código fusionado de la **v0.1.29** (commit `00fc599`). **Nada aplicado**: solo medidas y propuestas. Ningún cambio en `src/` ni en `tests/`.
Medidas tomadas con `npx vitest run --maxWorkers=1` en una máquina de 4 CPU compartida con otros 7 agentes (carga media 3-7): los tiempos absolutos están inflados; lo que vale es el orden relativo.

**Resumen en 6 líneas**
- El código está sano: la sim es pura (solo importa `config/rink` y el *tipo* `Tuning`), los 358 números de `tuning.ts` se leen todos (ningún parámetro muerto) y la suite unitaria tarda **~10 s** (652 tests).
- Lo que pesa: 3 funciones de la sim de 150-180 líneas (`stepPlayer`, `stepWorld`, `planPass`) que F1.6 (regates, aixecar) y F2 (rivales) van a engordar, y `renderer.ts` (846 líneas, 9 cosas distintas).
- El panel tiene **356 ajustes en 23 secciones**; Guillem toca de verdad unos 35. Propuesta: pestaña **«Bàsic»** (~35) + **«Avançat»** en 10 grupos plegables + grupo **«Experimental»** (lo apagado de fábrica). Compatible con el test «cada número del panel exactamente una vez».
- Hay duplicados de concepto (no de código muerto): 10 parejas de parámetros con el mismo significado o un valor derivado guardado aparte (`slowMo.lead = volley.windowTime / 2`).
- Tests: no hay tests lentos; sí ~12 umbrales que pasan por < 5 % o por 1 tick, y 8 tests que fijan valores de fábrica a propósito. E2E: 5 specs con riesgo de *flake* por tiempo real en WebGL por CPU.
- Para probar «sin cambio de comportamiento» en cualquier refactor: **`npm run bench:feel`** (puerta de regresión del tacto, 550 métricas, ~2 min, ya en la rama principal) + suite unitaria + (propuesto) un **hash de determinismo** del estado del mundo.

---

### E.1 Tamaño de los archivos

`src/` = 10.368 líneas (57 archivos), `tests/` = 9.116 líneas (45 archivos).

**Top 15 por líneas (src + tests)**

| # | Archivo | Líneas | Qué mezcla |
|---|---|---|---|
| 1 | `src/render/renderer.ts` | 846 | Una sola clase `Renderer`: motor/escena/luces/sombras y calidad; mallas de jugadores y dorsales; palos (rig + animación de alcance); bola + marcador en el suelo + silueta (`ballGhost`) + halo de la volea (textura dinámica); anillos (control, receptor, recepción, pared); retícula del tiro; flecha del pase; cámara; instrumentación de rendimiento (`renderStats`). 8 constantes de «tacto» visual fuera de `tuning.ts` (`STICK_REACH`, `REACH_*`, `BALL_DROP_TIME`…). |
| 2 | `src/config/tuning.ts` | 823 | 23 secciones, 358 números. ~45 % son comentarios (bien: documentan la historia de cada valor), pero mezcla parámetros de **sim**, de **render/HUD** (11, ver E.2.3) y de **dispositivo** (`input`, `buttons`). |
| 3 | `src/sim/world.ts` | 732 | Estado del mundo; cambio de jugador (manual/automático); reglas de juego libre (gol, reinicio); volea (`volleyStep`, `volleyShoot`); `stepWorld` (ver E.1.2); muerte de pases; acciones con bola. Además calcula **vista del HUD** dentro del tick (anillo del receptor, plan de la flecha, retícula del tiro). 8 objetos temporales a nivel de módulo (`effective`, `botCtx`, `passResult`, `assistTmp`, `contactTmp`…). |
| 4 | `tests/unit/pass.test.ts` | 712 | 33 tests; un `describe` de 358 líneas («passing to the teammates (world)»). |
| 5 | `src/sim/pass.ts` | 700 | Tipos de pase, niveles de asistencia, elección de receptor, pase al espacio, balística (raso, alto fuerte, bombeo, alto por el aire), error, planificación (`planPass`) y ejecución. 6 constantes de tacto fuera de `tuning.ts`. |
| 6 | `tests/unit/bench/volleyBench.ts` | 641 | Motor del banco de volea + humano simulado + tablas. |
| 7 | `tests/unit/shot.test.ts` | 617 | 38 tests (dirección, error por contexto, mundo, media vuelta). |
| 8 | `tests/unit/bench/passBench.ts` | 615 | Cadenas, pases sueltos, pase al espacio (`runSpace` 176 líneas). |
| 9 | `src/config/tuningMeta.ts` | 471 | Rangos/pasos/unidades de los 356 ajustes del panel (1 línea por ajuste). |
| 10 | `tests/unit/bench/shotBench.ts` | 462 | Tiros, primer toque, media vuelta. |
| 11 | `src/sim/player.ts` | 419 | Estado del jugador + toda la locomoción en `stepPlayer` (trencada, derrape, planeo, sprint, giro, aceleración) + choque entre jugadores. |
| 12 | `src/i18n/{ca,es,en}.json` | 415 c/u | **372 de las 413 claves (90 %) son etiquetas del panel** (`tuning.*`). |
| 13 | `tests/unit/bench/driveAimBench.test.ts` | 412 | Banco del alto fuerte con su motor (`runDrive` 167 líneas) dentro del propio `.test.ts`. |
| 14 | `src/sim/shot.ts` | 382 | Botón de tiro, media vuelta, dirección (opción A), modelo de error por contexto, ejecución. |
| 15 | `tests/unit/skating.test.ts` | 380 | 28 tests de patinaje. |

(Siguen `src/sim/ball.ts` 364, `tests/unit/bench/volleyCueRealFlow.test.ts` 307, `tests/unit/volley.test.ts` 302.)

#### E.1.2 Funciones de más de 80 líneas

**`src/`**

| Función | Archivo:línea | Líneas | Qué hace dentro |
|---|---|---|---|
| `stepPlayer` | `src/sim/player.ts:214` | 180 | Trencada (detección, cancelación, pre-frenada, corte, salida), derrape de 4 ruedas, planeo, bloqueo de sprint tras trencada/carga de tiro, empujón de sprint, giro limitado por radio, aceleración/sobrevelocidad. |
| `stepWorld` | `src/sim/world.ts:469` | 163 | Muerte/propiedad del pase, cambio de jugador, comandos de bots y humano, botones PASE/TIRO, choques, volea, bola llevada o libre + tiradas de recepción + búfer de entrada, y vista del HUD (receptor, flecha, retícula). |
| `planPass` | `src/sim/pass.ts:502` | 148 | Receptor y pase al espacio, adelanto, fuerza automática + carga, raso / alto fuerte (por el aire o no) / bombeo / mezcla, error de apuntado, conversión en pase a la pared. |
| `substep` | `src/sim/ball.ts:114` | 111 | Integración de la bola + suelo + vallas + porterías + jugadores en un sub-paso. |
| `planWallPass` | `src/sim/wallPass.ts:51` | 103 | Iteración del punto de rebote en la valla. |
| `collideGoal` | `src/sim/ball.ts:265` | 100 | Postes, larguero, red, interior de la portería. |
| `Renderer.sync` | `src/render/renderer.ts:602` | 89 | Interpolación de jugadores, palos, bola (escala por distancia), halo, silueta, marcador, cámara. |
| `volleyStep` | `src/sim/world.ts:320` | 86 | Ventana del remate en el aire, armado, golpe o arrastre. |
| `buildGoals` | `src/render/rinkBuilder.ts:129` | 81 | Geometría de las porterías y red. |

Cerca del límite: constructor de `Renderer` (61, `renderer.ts:120`), `predictContact` (65, `volley.ts:40`), `planShot` (61, `shot.ts:216`).

**`tests/`** (sin contar bloques `describe`): `runSpace` (`bench/passBench.ts:421`, 176), `runCase` (`bench/volleyCueRealFlow.test.ts:72`, 171), `runDrive` (`bench/driveAimBench.test.ts:107`, 167), `runChain` (`bench/passBench.ts:72`, 136), `runVolley` (`bench/volleyBench.ts:234`, 135), `runShots` (`bench/shotBench.ts:97`, 124), `runFirstTouch` (`bench/shotBench.ts:260`, 115). Bloques `describe` > 200 líneas: `pass.test.ts:207` (358), `bench/passBench.test.ts:21` (252), `mates.test.ts:46` (220).

---

### E.2 `tuning.ts` y el panel

#### E.2.1 Parámetros muertos: ninguno
Se buscó cada una de las 358 rutas (`sección.clave`) en `src/` fuera de `config/tuning*.ts`, y a mano las claves con nombre genérico o repetido (`lead`, `reach`, `minSpeed`, `tapTime`, `firstTouchError`, `highPenalty`, `duration`, `speed`, `move`, `heavy`…): **las 358 se leen**. `sim.tickRate` y `sim.maxStepsPerFrame` no están en el panel (decisión 2026-10-02).

#### E.2.2 Duplicados y casi-duplicados (mismo significado o valor derivado)

| Parámetros | Valores | ¿Mismo significado? | Propuesta |
|---|---|---|---|
| `slowMo.lead` ↔ `volley.windowTime` | 0,2 = 0,4 / 2 | **Derivado**: la cámara lenta debe empezar al abrirse la ventana (v0.1.29). Solo lo garantiza un test (`slowMo.test.ts:72`) con los valores de fábrica. Si Guillem cambia `volley.windowTime` en el panel, la cámara lenta deja de coincidir con la ventana. | Decisión de diseño (preguntar): calcularlo (`lead = windowTime/2`) o pasar a `slowMo.leadFraction`. No cambia nada con los valores de fábrica. |
| `volleyCue.lead` ↔ `volley.lookahead` | 0,45 ≤ 0,5 | Relación implícita: el aviso en la bola no puede salir antes de lo que la sim mira hacia delante (`renderer.ts:319` usa `v.time` de `predictContact`). El panel permite `lead` 0,5 con `lookahead` 0,2. | Documentarlo en el comentario y/o acotar el rango. |
| `shot.tapTime` ↔ `pass.tapTime` | 0,2 / 0,2 | Sí (toque vs mantener un botón). | Mantener separados (Guillem podría querer otro umbral para el tiro); solo anotarlo. |
| `shot.chargeTime` ↔ `pass.powerChargeTime` | 0,6 / 0,6 | Sí, con **nombres distintos**. | Unificar el nombre (ver E.2.4). |
| `shot.firstTouchError` ↔ `receive.firstTouchError` | 1,25 / 1,25 | Sí (tiro / pase al primer toque). El del pase vive en `receive` aunque es un error del **pase**. | Mover a `pass.firstTouchError` (con migración, ver riesgo en E.4). |
| `shot.errorPower` ↔ `pass.errorPower` | 0,04 / 0,04 | Sí, para acciones distintas. | Mantener. |
| `shot.attributeAdvantage`, `pass.attributeAdvantage`, `dribble.controlAdvantage`, `receive.controlAdvantage` | 0,5 ×4 | Sí: «cuánto reduce un atributo 99». | En F2 (atributos), agruparlos en una sección `attributes` leída por `feel.ts`. |
| `pass.driveLight/StrongCorrection` ↔ `assist.light/strongCorrection` | 0,7 / 1 iguales; solo Mitjana difiere (0,95 vs 0,85) | Sí. | Mantener (v0.1.29 lo separó a propósito); anotarlo. |
| `pass.driveAirFull` ↔ `pass.driveAirEnd` | 16,5 / 16,5 | La mezcla entre ambos está **apagada** de fábrica. | Grupo «Experimental» del panel. |
| `volley.highPenalty` ↔ `receive.highPenalty` | 0,1 / 0,1 | Parecido (bola alta en remate / en recepción). | Mantener. |
| `skating.sprintBoostCooldown` ↔ `cut.cooldown` | 0,8 / 0,8 | Enfriamiento compartido según el comentario, pero dos valores. | Anotar; revisar en F1.6 (regates). |
| `cameraTv/Close/Tactical.fovSpeedRef` | 9 ×3 | Sí. | Podría ir a `camera`; valor bajo. |
| `assist.mediumCone` ↔ `wall.mediumCone` | 0,6 / 0,6 | **No** (cono del receptor vs cono de la pared). | Coincidencia; nada. |

Números de tacto **fuera** de `tuning.ts` (regla 4 de CLAUDE.md; coordinar con §D): `MAX_LEAN` 85° (`input/passGesture.ts`), `DOUBLE_TAP_MS` 350 (`input/keyboard.ts`), `GAMEPAD_SPRINT_TRAVEL` 0,95 (`input/gamepad.ts`), `GOAL_RESET_TICKS` 90 (`sim/world.ts:21`), en `sim/mates.ts` `PASS_MIN_SPEED`, `FETCH_MAX_SPEED`, `ARRIVED`, `TURN_ONLY`, `SPOT_MARGIN_Y`, `NO_BACK_STEP`, `RESTART_DISTANCE`; en `sim/pass.ts` `SPACE_MARGIN`, `SPACE_MIN_CROSS`, `DISTANCE_COST`, `DRIVE_MAX_ELEVATION`; `HIGH_MAX_ELEVATION`, `DEFAULT_DISTANCE` (`sim/shot.ts`); en el render `STICK_REACH`, `REACH_DISTANCE`, `REACH_MIN/MAX_HEIGHT`, `BALL_DROP_TIME`. Constantes **duplicadas**: `AIM_MIN_STICK` 0,05 (`sim/pass.ts:101` y `sim/shot.ts:169`) y la altura del jugador (`PLAYER_HEIGHT` en `sim/player.ts:10` y `PLAYER_HEIGHT_VISUAL` en `render/renderer.ts:55`, ambas 1,75). Los de solver (`MAX_SUBSTEPS`, `BISECT`, `SOLVER_DT`…) están bien donde están. Además, `gameSpeed.ts` limita la velocidad a 0,5-2 mientras el panel ofrece 80-140 %: no es un fallo, solo dos rangos.

#### E.2.3 Mezcla de dominios dentro de las secciones
- **Solo render/HUD dentro de secciones de la sim** (11): `ball.visualScale`, `visualRefDistance`, `markerRadius`, `ghost`, `ghostOpacity`, `ghostDistance`, `ghostSize`; `receive.showFeedback`, `receive.feedbackTime`; `assist.targetRing`; `wall.showMarkers`. No pueden cambiar la sim ni los bancos, pero hoy no se distingue.
- **Al revés**: `input.bufferTime` (sección de dispositivo) es una **regla de la sim** (lo leen `sim/dribble.ts`, `sim/pass.ts`, `sim/shot.ts`); `shot.reticleRange` (HUD) lo lee `sim/world.ts`.
- La capa `feel.ts` (atributos F2) cubre `skating/cut/dribble/pass/receive/wall/shot/volley`; `assist`, `mates`, `ball` e `input` se leen directamente (coherente hoy, a decidir en F2).

#### E.2.4 Nombres incoherentes
- **Niveles de asistencia**: `lightCone/mediumCone/strongCone` (assist, wall), `lightAimRange…` (shot), `lightSpaceRespect…` (assist) frente a `driveLightCorrection…` (pass: el prefijo va delante del nivel); `mediumErrorFactor/strongErrorFactor` sin `light`; `mediumArrivalBonus` solo Mitjana.
- **Interruptores 0/1** sin convención: `enabled`, `ball`, `ghost`, `heavy`, `sweetSpot`, `assist` (wall), `move`, `quickReturn`, `autoSwitch`, `autoReceive`, `switchControl`, `lostPassSwitch`, `showFeedback`, `showMarkers`, `targetRing`, `onlyWithSprint`.
- **`shot.errorTurn` vs `shot.turnError`** en la misma sección: el primero es grados de error por radián girado; el segundo, el multiplicador de la media vuelta. Fácil de confundir.
- `dribble.relockTime` vs `receive.lockTime` (mismo concepto: no poder tocar la bola un rato).
- `lead` significa 4 cosas: `slowMo.lead` y `volleyCue.lead` (s), `pass.lead` y `wall.lead` (fracción).
- Unidades: `haptics.*Ms` en ms (todo lo demás en s); `input.joystickRadiusPx` lleva la unidad en el nombre y `input.passDragDistance` / `buttons.*` (también px) no.
- Ángulos guardados como radianes con 7 decimales (`1.0471976` = 60°). **No** sustituirlos por `deg(60)`: el valor cambiaría en 5·10⁻⁸, el hash de determinismo cambiaría y `TuningOverrides` (tolerancia 1e-9) daría por caducados los ajustes guardados de Guillem (se borran y sale el aviso). Basta con un comentario «60°».
- **Comentarios desfasados** (documentación, no código): `tuning.ts` (`input.passDragDistance`) y `src/input/actionButtons.ts:117` dicen «arriba-izquierda = alto fuerte, arriba-derecha = bombeo», que es el gesto de la v0.1.19; desde la v0.1.20 es al revés (`passGesture.ts`, `tests/e2e/mates.spec.ts`, DECISIONS 2026-10-07). Los comentarios de `assist` y `wall` hablan de 3 niveles («Desactivada / Ligera / Fuerte») sin Mitjana.

#### E.2.5 El panel hoy
- **23 secciones, 356 ajustes** (358 números menos `sim.*`); `shotError` es una sección del panel con rutas `shot.ctx*`; solo las 2 primeras secciones salen abiertas (por índice: `details.open = i <= 1`).
- Ajustes por sección: game 1 · skating 28 · cut 14 · dribble 18 · pass 38 · shot 36 · shotError 11 · volley 15 · slowMo 6 · volleyCue 9 · haptics 3 · receive 28 · wall 14 · assist 20 · passArrow 6 · mates 25 · ball 25 · input 10 · buttons 12 · cameraTv 12 · cameraClose 12 · cameraTactical 12 · camera 1.
- Guillem ha ajustado de verdad: patinaje e `input` (ronda 1, «PATINS tuning v0.1.6»), botones y velocidad de juego. El resto lo han fijado los bancos.
- **Poco útiles para Guillem (~250)**: umbrales y penalizaciones de la recepción (28), los 11 pesos del error por contexto, parámetros de balística (`driveLaunchAngle`, `driveAir*`, `loft*`, `groundShortFrom/To`, `*NoTarget*`), detalles de la trencada y del derrape (`gestureTime`, `skidReleaseStick/Window`, `accelCapFactor`, `turnRadiusPerSpeed2`), los 12 del pase al espacio, la mayoría de `mates` (intercepción, asentarse, variaciones), física fina de la bola (restituciones, fricciones, `airDrag`, `netDamping`, los 5 `heavy*`), 36 de cámaras (útiles: altura, distancia, apertura, tamaño de bola) y los tamaños del halo de la volea.

#### E.2.6 Propuesta de agrupación (necesita el visto bueno de Guillem: es su herramienta)
1. **Pestaña «Bàsic» (~35 ajustes)**, lo que se nota jugando: `game.speed`; `skating.maxSpeed`, `sprintSpeed`, `accel`, `maxTurnRate`, `skidTime`; `cut.minSpeed`, `cut.redirect`, `cut.cooldown`; `dribble.sprintSpeedWithBall`, `dribble.sprintSeparation`, `dribble.pickupRadius`; `pass.tapTime`, `pass.groundArrivalSpeed`, `pass.driveAirHeight`, `pass.lead`; `assist.mediumCone`, `assist.mediumCorrection`; `shot.quickSpeed`, `shot.maxSpeed`, `shot.chargeTime`, `shot.errorBase`; `volley.windowTime`, `volley.good`; `slowMo.enabled`, `slowMo.scale`; `volleyCue.ball`; `haptics.volleyMs`; `mates.switchControl`, `mates.autoSwitch`; `input.sprintThreshold`, `input.joystickDeadZone`, `input.bufferTime`; altura, distancia y apertura **de la cámara activa**; `ball.visualScale`.
2. **Pestaña «Avançat»: de 23 secciones a 10 grupos plegables**: (1) Ritme i patinatge = game + skating + cut; (2) Conducció = dribble; (3) Passada = pass (sub-bloques rasa / alta forta i bombeig / error) + assist + wall + passArrow; (4) Recepció i companys = receive + mates; (5) Tir = shot + shotError; (6) Remat a l'aire = volley + slowMo + volleyCue + haptics; (7) Bola; (8) Controls = input + buttons; (9) Càmeres = camera + **solo el preset activo** (36 → 13 filas); (10) **Experimental (apagat de fàbrica)** = `ball.heavy` + 5 `heavy*`, `shot.sweetSpot` + 2, `shot.ctxPressure`, `shot.ctxOffBalance`, `cut.onlyWithSprint`, `pass.driveAirEnd` (13).
3. **Buscador** por texto y botón **«Només modificats»** arriba (con 356 filas, en el móvil es lo que más ahorra).
4. **Cómo sigue cumpliéndose el test** `tests/unit/tuningMeta.test.ts` («cada número, salvo `sim`, exactamente una vez»): «Bàsic» es una **vista filtrada** por un campo nuevo `basic?: true` en `TuningParamMeta`, no una sección con rutas repetidas; los grupos son un campo `group` de `TuningSectionMeta` (o secciones anidadas) y `TUNING_PARAMS` sigue siendo el `flatMap` de las secciones. Test nuevo: toda ruta `basic` existe y hay ≤ 40. Las **rutas no cambian**, así que los ajustes guardados de Guillem (`patins.tuning.v1`, por ruta) siguen valiendo.

---

### E.3 Tests

#### E.3.1 Los más lentos
Suite unitaria completa (`--maxWorkers=1`, con carga): **9,9 s** de reloj, 652 tests pasados, 50 omitidos (los bancos, solo con `PATINS_BENCH`); los tests en sí son el 51 % y transformar/importar el 47 %.

| # | Test | ms |
|---|---|---|
| 1 | `rebound.test.ts` › nothing goes through the posts, the bar or the net, up to 30 m/s | 346 |
| 2 | `wallPass.test.ts` › with the assist on, most wall passes come back… | 285 |
| 3 | `pass.test.ts` › Strong helps more than Light, and aiming still matters with Light | 243 |
| 4 | `pass.test.ts` › a tap to a teammate 6 m away leaves slower than… (short passes) | 170 |
| 5 | `ball.test.ts` › a 30 m/s ground ball in any direction never leaves the rink | 166 |
| 6 | `rng.test.ts` › floats are in [0,1) and roughly uniform | 163 |
| 7 | `skating.test.ts` › random sprinting for 2 minutes always stays inside… | 104 |
| 8 | `dribble.test.ts` › normal-speed slaloms for a minute never lose the ball | 86 |
| 9 | `mates.test.ts` › is deterministic with teammates, passes and control switches | 83 |
| 10 | `pass.test.ts` › Mitjana: the ground pass arrives faster (mediumArrivalBonus)… | 70 |
| 11 | `gameSpeed.test.ts` › does not touch the determinism… at any speed | 54 |
| 12 | `pass.test.ts` › a charged driven pass is faster and flatter… | 47 |
| 13 | `determinism.test.ts` › same seed + same inputs → identical state | 45 |
| 14 | `rebound.test.ts` › the heavy ball is off by factory… | 41 |
| 15 | `pass.test.ts` › a lob to nobody goes further the longer PASE is held… | 35 |

Por archivo: `pass` 403 ms · `rebound` 397 · `wallPass` 289 · `mates` 188 · `rng` 164 · `ball` 144 · `skating` 136 · `dribble` 129 · `volley` 87 · `quickReturn` 80 · `shot` 66 · `gameSpeed` 63 · `passSpace` 60 · `determinism` 50 · `receive` 42. **Conclusión: la suite unitaria no tiene un problema de velocidad.**

**Los bancos sí** (`PATINS_BENCH=1`, 7 archivos, 50 casos, un solo proceso, con carga): **~22 min**. `driveAimBench` 458 s · `passBench` 362 s · `volleyBench` 243 s · `shotBench` 183 s · `volleyCueRealFlow` 73 s · `airPassBench` 5 s · `reboundBench` 1 s. Los casos más largos son **barridos históricos** que ya decidieron un valor: «sweep (v0.1.29): driven-only error factor × Mitjana correction» 239 s, «Mitjana, high and chip shots» 143 s, «v0.1.24: sweep of the space-pass power» 118 s, «how much Forta helps over Mitjana» 113 s, «v0.1.24: power of a pass into space» 73 s. La puerta permanente `npm run bench:feel` (550 métricas, ~2 min) ya cubre la regresión; los barridos pueden archivarse (propuesta R8).

#### E.3.2 Tests frágiles
Medido envolviendo los comparadores numéricos (`toBeGreaterThan`, `toBeLessThan`, `…OrEqual`, `toBeCloseTo`) en una ejecución aparte (configuración de vitest en el scratchpad, sin tocar `tests/`): 59.660 aserciones, 1.536 distintas. Todas las semillas son fijas, así que **ninguno es aleatorio**: «frágil» quiere decir que se rompe con un cambio pequeño de valores o de física, no que falle de vez en cuando.

**Pasan por muy poco (< 5 %) o por 1 tick**

| Test | Umbral | Valor | Margen | Depende de |
|---|---|---|---|---|
| `receive.test.ts:171` rebote | `< 14·reboundKeep + 0,01` | 4,90 vs 4,91 | 0,2 % | Es una igualdad disfrazada: cualquier energía extra en el rebote lo rompe. Mejor `toBeCloseTo`. |
| `volley.test.ts` «TIRO released right at the contact» | `≥ 17,2` / `> quickSpeed·(1+0,75·powerBonus)` = 22,25 | 17,35 / 23 | 0,9 % / 3,3 % | `volley.powerBonus`, `shot.quickSpeed` |
| `ball.test.ts` «a shot into the mouth is a goal…» | `x < GX + goalDepthBottom` (18,12) / `> GX + R` (17,24) | 17,90 | 1,2 % / 3,7 % | `ball.netDamping`, `netRestitution` |
| `pass.test.ts` «a lofted pass is pure physics» | `< −0,1553` (×106 ticks) | −0,1574 | 1,3 % | `ball.airDrag` |
| `stickMapping.test.ts` «speed grows with travel…» | `< 1` y `> 0,95` | 0,981 | 1,9 % / 3,1 % | `input.joystickCurve`, `sprintThreshold` |
| `skating.test.ts:315` trencada, enfriamiento | `> cooldown − 2·DT` | 1 tick por encima | 1 tick | `cut.cooldown` |
| `shot.test.ts:534` y `:579` media vuelta | `≤ 0,35 s` | 0,333 s | 1 tick | `shot.turnTime` 0,22 + toque: +0,017 s lo rompe |
| `dribble.test.ts` «a real opponent nearby makes the ball separate more» | `> 0,2056` | 0,2114 | 2,8 % | `dribble.pressureSeparation` |
| `mates.test.ts` «the new controlled player dribbles, does the trencada…» | `> 7,56` | 7,81 | 3,2 % | `skating.maxSpeed` |
| `pass.test.ts` «Mitjana: the ground pass arrives faster» | `> 14,15` | 14,68 | 3,6 % | `assist.mediumArrivalBonus` |
| `slowMo.test.ts` «never jumps» | salto por fotograma `< 0,1` | 0,096 | 3,7 % | `slowMo.rampIn/rampOut/scale`: con `rampIn` 0,03 s falla aunque sea un ajuste legítimo |
| `mates.test.ts:128` «teammates offer a passing line…» | `\|dx − supportAhead\| < 1 m` | 0,96 m | 3,8 % | `mates.spotVariation` = 1,5 m de deriva con 1 m de tolerancia: pasa por la semilla |

Los que pasan con margen 0 son límites físicos exactos y están bien (velocidad tope tras el empujón = `sprintSpeed + sprintBoostOvershoot`, separación entre jugadores = 2·radio, bola dentro de la pista); conviene que lo digan con `toBeCloseTo`.

**Tests que fijan valores de fábrica a propósito** (guardianes de decisiones: si Claude cambia el valor de fábrica hay que tocar el test; los cambios de Guillem en el panel no les afectan): `volley.test.ts:196-197` (`minHeight` 0,15 y `maxHeight` 1,5 = reglamento art. 6.3), `rebound.test.ts:33` (`ball.heavy` 0), `gameSpeed.test.ts:23` (`game.speed` 1), `shot.test.ts:280` (`sweetSpot` 0), `slowMo.test.ts:46-48` (duración ≤ 0,35, escala 0,6-0,7) y `:72` (`lead = windowTime/2`), `volleyFeedback.test.ts:32-33` (pulso 25-40 ms), `passSpace.test.ts:95`. Propuesta: un prefijo común en el título («decisión:») para distinguirlos de los fallos reales.

**Umbrales fijos de tacto** (especificación de docs/03, no fragilidad): p. ej. `skating.test.ts` «llega al 90 % en ~1,5 s (1,3-1,9)». Si Guillem cambia la aceleración **de fábrica** se tocan a la vez test y docs/03.

**Dependencia del orden**: solo 2 tests mutan el `TUNING` global (`cameraPresets.test.ts:91`, `skating.test.ts:32`) y lo restauran en `finally`. `tuningWith()` (copiado en 8 archivos) clona el `TUNING` **actual**, no `TUNING_DEFAULTS`: hoy da igual porque vitest aísla cada archivo. **No activar `isolate: false`** aunque vitest lo sugiera («~3,9 s más rápido»): el `TUNING` global y los temporales de la sim a nivel de módulo pasarían de un archivo a otro.

**Duplicación en los tests**: `tuningWith` ×8, `lcg` ×6 (bancos), `cmd`, `run`, `setup`, `tapAt`, `takeBall`, `runUntil` ×2-3.

#### E.3.3 E2E (Playwright) con riesgo de *flake*
Headless Chromium dibuja con SwiftShader (por CPU) a pocos fps; el bucle limita la recuperación a `maxStepsPerFrame` = 5, así que **el tiempo de juego va más lento que el real** cuando la máquina está cargada. `retries: 0`, `workers: 1`.

| Spec | Riesgo | Por qué |
|---|---|---|
| `perf.spec.ts` | **Alto** con carga | `simTickMs < 0,5` es tiempo de reloj con CPU ×4 en una máquina compartida (`draw calls` y triángulos sí son deterministas). |
| `debug.spec.ts` | Medio | Exige 5-135 ticks en 2 s: a < 0,5 fps no llega a 5. |
| `controls.spec.ts` (joystick), `rotation.spec.ts` | Medio | `waitForTimeout(1200)` y después «se ha movido > 0,3 m»; luego 150 ms y `vx > 0,5`. Dependen de los fps. |
| `camera.spec.ts` | Medio | Esperas fijas (3,5 s / 2,5 s / 1,5 s) para que el suavizado de la cámara converja y comparar escalas de la bola (`tactical > tv·1,3`, `> close·1,4`). |
| `volley.spec.ts` | Medio-bajo | La ventana dura ~0,2 s de juego; ya se mitiga pulsando TIR desde la página (`MutationObserver`). |
| `mates.spec.ts` (gesto real) | Bajo | Movimientos cada 16 ms y `poll` de 2 s. |
| `menu`, `smoke`, `pwa`, `ghost`, `shot`, `ball`, `tuning`, `speed`, `dribble` | Bajo | Usan `expect.poll` con márgenes amplios. Las capturas solo se guardan, no se comparan. |

Propuesta: etiquetar `@timing` los cuatro primeros y darles `retries: 1` solo a ellos; en `perf.spec`, comparar `simTickMs` con una medida de referencia tomada en la misma ejecución, no con un número absoluto.

#### E.3.4 Lo que `simPurity.test.ts` no detecta
El test busca con expresiones regulares en el texto de `src/sim/**`. No detecta:
1. **Importaciones sin `from`**: `import '../render/x'` (efecto lateral), `import()` dinámico, `require`, alias o rutas absolutas, ni `../i18n/` o `../config/*` que a su vez toquen el DOM (dependencias transitivas). Hoy la sim solo importa `config/rink` y el tipo `Tuning`: limpio.
2. **Globales que no están en la lista**: `globalThis`, `self`, `crypto.getRandomValues` / `randomUUID`, `setTimeout` / `setInterval` / `requestAnimationFrame`, `process`, `Intl` / `toLocaleString`.
3. **Estado compartido entre mundos**: 8 temporales a nivel de módulo en `world.ts` y 7 en `pass.ts` (y otros en `shot.ts`, `volley.ts`, `wallPass.ts`, `dribble.ts`; `botCtx.players` guarda incluso referencias a los jugadores del último mundo). Son seguros mientras cada uso los reescriba entero antes de leerlos, pero nada comprueba que dos mundos avanzados **intercalados** tick a tick (repeticiones, *rollback* del online F7, un banco con dos mundos) den lo mismo que por separado.
4. **La capa `feel.ts`**: el patrón `tuning\.(skating|…)` no ve `t.skating`, `TUNING.skating`, `const { skating } = tuning` ni `tuning['skating']`.
5. **`determinism.test.ts`**: 1 jugador, sin compañeros, PASE nunca pulsado, una semilla, y solo compara dos ejecuciones del mismo código: **no detecta un cambio de comportamiento entre versiones** (no hay hash de referencia). `JSON.stringify` además iguala `NaN` con `null` y `-0` con `0`. `mates.test` y `gameSpeed.test` cubren más casos, pero con el mismo límite.
6. Funciones de `Math` (`sin`, `atan2`, `exp`, `pow`) pueden dar bits distintos en otro motor de JS (V8 frente a Safari): no importa hoy, sí para repeticiones y online entre dispositivos (F7).

---

### E.4 Refactor priorizado (nada aplicado)

**Cómo demostrar «sin cambio de comportamiento»** (vale para todas las filas marcadas «No»):
(a) **`npm run bench:feel`**: puerta de regresión del tacto, 550 métricas, ~2 min, en la rama principal (`tests/unit/bench/feelRegression.ts`). Debe salir **idéntica** a la línea base de la v0.1.29.
(b) Suite unitaria completa en verde **sin tocar ningún umbral**.
(c) *(Propuesto en R1)* **hash de determinismo** idéntico: es más estricto que (a) porque detecta cualquier bit distinto, no solo las métricas que se miden.
Para cambios del panel o del render: `tests/unit/tuningMeta.test.ts` + `tests/e2e/tuning.spec.ts` + capturas, y (a) idéntico porque la sim no se toca.

| Prioridad | Cambio | Beneficio | Riesgo | Esfuerzo | ¿Cambia el comportamiento? |
|---|---|---|---|---|---|
| **R1** Alta · antes de F1.6 | Test de **hash de determinismo** (`tests/unit/determinismHash.test.ts`): entradas guionizadas con 3 jugadores, pases de los 3 tipos, pared, tiro, volea, trencada y derrape; hash FNV de todos los números del `WorldState` en los ticks 600 / 1800 / 3600; y una variante con **dos mundos intercalados**. | Prueba en segundos de que un refactor no cambia nada; cubre los huecos 3 y 5 de E.3.4. | Ninguno (solo es un test); cada cambio de tacto intencionado obliga a actualizar el hash (se anota en DECISIONS). | S | No |
| **R2** Alta · antes de F1.6 | Arreglar los **comentarios desfasados** (gesto de altura en `tuning.ts` y `actionButtons.ts:117`; 3 niveles de asistencia en `assist`/`wall`); comentario «= 60°» junto a cada ángulo en radianes. | Evita que otra sesión «corrija» el código al revés. | Nulo. | XS | No |
| **R3** Alta · antes de F1.6 (con el OK de Guillem) | Panel **«Bàsic» / «Avançat»**, 10 grupos, «Experimental», buscador, «Només modificats», solo la cámara activa (E.2.6). | De 356 filas a ~35 a la vista; Guillem encuentra lo que busca. Las rutas no cambian, sus ajustes guardados siguen valiendo. | Bajo (solo UI). Mantener el test «exactamente una vez» con el campo `basic`. | M | No (la sim no se toca) |
| **R4** Media · antes de F1.6 | Partir **`stepPlayer`** (trencada / derrape / planeo-sprint / giro-aceleración) y **`stepWorld`** (propiedad del pase, comandos, botones, cuerpos, bola y recepciones, vista) en funciones con el **mismo orden de operaciones**. | F1.6 añade regates y aixecar justo ahí; sin partir, `stepPlayer` pasaría de 250 líneas. | Medio: el orden de las operaciones con coma flotante y los temporales compartidos. Solo se acepta con R1 + `bench:feel` idénticos. | M | No |
| **R5** Media · antes de F2 | Partir **`planPass`** (receptor y espacio / fuerza / balística por tipo / error / pared). | F2 (rivales que interceptan, presión) toca el pase. | Medio (como R4). | M | No |
| **R6** Media · antes de F2 | Sacar el cálculo de la **vista del HUD** de `stepWorld` (anillo del receptor, plan de la flecha, retícula) a `computeView(world)`, llamado después del tick. | Separa la sim de la UI y quita trabajo por tick cuando haya 10 entidades. | Medio: el HUD debe leer el mismo estado. Si el hash incluye esos campos, se excluyen o se comprueban aparte. | M | No |
| **R7** Media · antes de F2 | Partir **`renderer.ts`**: `ballView.ts` (bola, marcador, silueta, halo), `hudOverlays.ts` (anillos, retícula, flecha, marcas de pared), `stickRig.ts`, `renderStats.ts`. | F2 añade rivales y porteros; hoy es un archivo de 846 líneas. | Bajo (la sim no se toca); vigilar el presupuesto con `perf.spec`. | M | No |
| **R8** Media | Bancos: dejar `bench:feel` como puerta y mover los **barridos históricos** (P7 v0.1.22-24, barridos v0.1.29 del alto fuerte, opciones del tiro v0.1.25) a `bench/archive` detrás de `PATINS_BENCH=archive`. | `PATINS_BENCH=1` pasa de ~22 min (con carga) a lo imprescindible; las cifras históricas siguen reproducibles. | Bajo. Coordinar con §J. | S | No |
| **R9** Media | `tests/unit/helpers.ts`: `tuningWith` (clonando **`TUNING_DEFAULTS`**), `cmd`, `lcg`; umbrales de 1 tick y las «igualdades disfrazadas» de E.3.2 pasan a `toBeCloseTo` o a márgenes derivados de `tuning`. | Menos copia y pega; menos falsos rojos al afinar. | Bajo: cada test debe seguir comprobando lo mismo. | S | No |
| **R10** Media | E2E: etiqueta `@timing` + `retries: 1` solo para perf/debug/controls/rotation/camera; `perf.spec` relativo. | Menos rojos de CI por carga. | Bajo (un reintento puede tapar una regresión real; por eso solo en esos 5). | S | No |
| **R11** Baja · con el OK de Guillem | `slowMo.lead` calculado de `volley.windowTime` (o `leadFraction`); acotar `volleyCue.lead ≤ volley.lookahead`. | El panel no puede desincronizar la cámara lenta de la ventana. | Bajo. | XS | **Solo si se usa el panel** (con los valores de fábrica, idéntico) |
| **R12** Baja | Números de tacto fuera de `tuning.ts` (E.2.2) → `tuning.ts` con el **mismo valor**; unificar `AIM_MIN_STICK` y la altura del jugador. | Cumple la regla 4 de CLAUDE.md; Guillem podría afinarlos. | Bajo si los valores son bit a bit los mismos (R1 lo prueba). Cada uno añade una fila al panel (o queda en `sim.*`, sin exponer). | S | No |
| **R13** Baja | Separar las etiquetas del panel en `src/i18n/tuning.<idioma>.json` (372 de 413 claves). | Diccionarios principales legibles. | Bajo; ampliar `i18n.test`. | S | No |
| **R14** Baja · mejor con F2 | Renombrar y mover rutas (parámetros solo de render a `view`, `input.bufferTime` a la sim, `receive.firstTouchError` a `pass`, `errorTurn`/`turnError`, `chargeTime`/`powerChargeTime`, `relockTime`/`lockTime`, interruptores `xxxOn`, atributos a `attributes`). | Nombres coherentes; saber de un vistazo qué ajustes no pueden cambiar la sim. | **Medio**: `TuningOverrides` guarda por ruta: sin un **mapa de migración** (ruta vieja → nueva, conservando `base`), Guillem perdería sus ajustes guardados en silencio. | M | No (si se migra) |
| **No hacer** | `isolate: false` en vitest; sustituir ángulos por `deg()`. | — | Fugas entre archivos de tests / ajustes guardados dados por caducados y hash distinto (E.2.4). | — | — |

**Orden recomendado antes de F1.6**: R1 → R2 → R4 (con R1 y `bench:feel` idénticos) → R3 cuando Guillem lo apruebe. R5-R7 al empezar F2. El resto, cuando se pase por ese código.

**Decisiones para Guillem** (de esta sección):
1. ¿Panel con pestaña «Bàsic» (~35 ajustes) y «Avançat» agrupado, más «Experimental» y buscador? (R3)
2. ¿Que la cámara lenta siga siempre a la ventana de la volea aunque cambie su duración en el panel? (R11)
