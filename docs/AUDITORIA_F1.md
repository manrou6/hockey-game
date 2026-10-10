# Auditoría de F1 (bloque 2, 2026-10-09/10)

Auditoría del código de la **v0.1.29** (commit `00fc599`) hecha por agentes independientes, cada uno en su copia del repositorio; **no cambia el juego** (los fallos reales y claros de la §B que no cambian el tacto se arreglaron aparte en la **v0.1.30**, ver DECISIONS.md). Cada cifra dice cómo reproducirla. La revisión independiente de las cifras está en `docs/REVISION_BLOQUE2.md`; los planes, en `docs/PLAN_F1_6.md` y `docs/PLAN_F2.md` (con las «Objeciones» del crítico de diseño).

| § | Tema | En una línea |
|---|---|---|
| A | Criterios de aceptación de F1.5 | 41 criterios, 27 cumplidos, 4 cumplidos a falta de la prueba de Guillem; las cifras del tiro y la volea se mantienen |
| B | Robustez de la simulación | Sin NaN, túneles, bolas atascadas ni jugadores fuera; determinista; 7 hallazgos (F1-F7), 5 arreglados en la v0.1.30 |
| C | Rendimiento | Tick de la sim ~6-10 µs; el problema son los picos de planificar pases altos (flecha, 0,3-1,9 ms) y los draw calls con 10 jugadores |
| D | Documentación vs código | 27 discrepancias y 14 contradicciones entre docs, con corrección propuesta |
| E | Salud del código y del panel | Código sano; panel de 356 ajustes (Guillem usa ~35): propuesta «Bàsic / Avançat» |
| I | Actualización de la PWA | La app reanudada nunca busca versión nueva y la actualización recarga en mitad del partido: propuesta de aviso «toca per actualitzar» |
| J | Banco permanente del tacto | `npm run bench:feel`: 550 medidas contra una línea base versionada |

## §A Criterios de aceptación de F1.5

Código auditado: **v0.1.29**, commit `00fc599` (fusionado en `main`). Medido el 2026-10-09 en un worktree limpio de ese commit, sin tocar `src/`. Todas las cifras de esta sección se han **vuelto a medir hoy** con los bancos que ya existen (no copiadas de la documentación); cuando coinciden con lo documentado se dice.

**Dónde están los criterios.** `docs/06_ROADMAP.md` no tiene una lista propia de aceptación de F1.5: la aceptación de F1 (06:23) es de toda la fase («conducir y regatear se siente bien»; «marcar al portero básico, posible pero no trivial», que es de F1.8). Los criterios de F1.5 están repartidos en 06:16-20, en los objetivos con número de `DECISIONS.md` (F1.5a-e y v0.1.29), en `docs/03` §2-§3 y en `PROGRESS.md` (líneas 65-85). La tabla los recoge todos.

### Cómo reproducir (comandos usados hoy)

Todos con `--maxWorkers=1`; los bancos solo corren con `PATINS_BENCH=1`; todos son deterministas (mismas semillas → mismas cifras).

| Id | Comando | Semillas / muestra | Duración hoy |
|---|---|---|---|
| **U** | `npx vitest run tests/unit/shot.test.ts tests/unit/volley.test.ts tests/unit/slowMo.test.ts tests/unit/volleyFeedback.test.ts tests/unit/rebound.test.ts tests/unit/receive.test.ts tests/unit/pass.test.ts tests/unit/simPurity.test.ts tests/unit/determinism.test.ts tests/unit/settings.test.ts tests/unit/tuningMeta.test.ts tests/unit/i18n.test.ts tests/unit/ball.test.ts tests/unit/gameSpeed.test.ts --maxWorkers=1` | — | 14 ficheros, 520 tests en verde |
| **B1** | `PATINS_BENCH=1 npx vitest run tests/unit/bench/shotBench.test.ts -t "v0.1.25 / option-2 ceiling\|the 4 assist levels\|first-touch shot after a ground pass\|turn shot" --reporter=verbose --maxWorkers=1` (líneas `ERRC`, `LEVEL`, `TIMING`, `FIRST`, `TURN`) | semillas 1-300 por caso (`shotBench.ts`: `runShots`, `runFirstTouch`, `runTurn`) | 33 s |
| **B2** | `PATINS_BENCH=1 npx vitest run tests/unit/bench/volleyBench.test.ts -t "how the pass flies\|how many strikes are really in the air" --reporter=verbose --maxWorkers=1` (líneas `VOLP`, `VOLE`) | semillas 1-200 por caso (`passProfile`, `runVolley`) | 72 s |
| **B3** | `PATINS_BENCH=1 npx vitest run tests/unit/bench/volleyBench.test.ts -t "where the pass comes from\|timing curve" --reporter=verbose --maxWorkers=1` (líneas `VOLG`, `VOLT`) | semillas 1-200 (`runVolley`, `runVolleyDirect`) | 51 s |
| **B4** | `PATINS_BENCH=1 npx vitest run tests/unit/bench/volleyBench.test.ts -t "humans and gestures with the cue" --reporter=verbose --maxWorkers=1` (líneas `VOLAH`) | semillas 1-200 | 25 s |
| **B5** | `PATINS_BENCH=1 npx vitest run tests/unit/bench/reboundBench.test.ts tests/unit/bench/airPassBench.test.ts --reporter=verbose --maxWorkers=1` (líneas `REB`, `SGL`) | rechaces: 41 tiros por caso repartidos a lo ancho; pases: semillas 1-1200 (distancia al azar 5-35 m) | 10 s |
| **B6** | `PATINS_BENCH=1 npx vitest run tests/unit/bench/volleyCueRealFlow.test.ts --reporter=verbose --maxWorkers=1` (flujo real frame a frame de `game.ts` + `main.ts`) | semillas 1-12 × 2 ángulos (0° y 35°) = 24 por fila; test «split by pass angle»: semillas 1-24 | 89 s |
| **B7** | `PATINS_BENCH=1 npx vitest run tests/unit/bench/driveAimBench.test.ts -t "miss at the blade and has" --reporter=verbose --maxWorkers=1` (líneas `DRIVE … 8-16`) | 500 pases por distancia (8/10/12/14/16 m), semillas 1-500 | 40 s |
| **CI** | GitHub Actions «CI & Deploy», run 37930372651 sobre `00fc599` (build + `npm test` + `npm run e2e` + despliegue): **verde** | e2e `shot.spec`, `volley.spec`, `perf.spec` incluidos | — |

Abreviaturas de la tabla: «a puerta» = entre los palos y bajo el larguero (sin portero); Mitjana = nivel de asistencia por defecto; «humano normal» = error de timing ±0,07 s, «bueno» ±0,04 s, «torpe» ±0,10 s.

### Tabla de criterios

| # | Criterio (cita corta + fuente) | Cómo se verifica | Valor medido hoy (v0.1.29) | ¿Cumple? | Qué falta |
|---|---|---|---|---|---|
| **Tiro base (F1.5a)** | | | | | |
| 1 | «Tiro con carga» (06:16): toque = rápido a 20 m/s; mantener = carga de arrastre 16 → 28 m/s en 0,6 s, bola pegada, jugador al 80 % sin sprint (03:60; DECISIONS:121) | U (`shot.test.ts:151`, `:366`); B1 `TIMING` | Llega a la línea de gol: rápido 17,4 m/s a 7 m; carga completa 24,7 m/s a 7 m y 23,0 m/s a 14 m (parado) | Sí | — |
| 2 | «Tiro rápido a 7 m sale en ≤ 0,1 s» (DECISIONS:121) | B1 `TIMING`; U (`shot.test.ts:337`: sale el tick en que se suelta) | 0,100 s desde que se pulsa con un toque humano de 0,1 s (0 ticks tras soltar) | Sí | — |
| 3 | Altura con el mismo arrastre diagonal que el pase (raso / alto / picado) y apuntado opción A con retícula (03:60-61; PROGRESS:79) | U (`shot.test.ts:85`, `:101-136`, `:156`, `:404`); CI e2e `shot.spec.ts:27`, `:61` | Tests en verde | Sí | Probado por Guillem en la v0.1.24 (visto bueno, PROGRESS:65) |
| 4 | Gol a portería vacía posible (PROGRESS:71) | B1 (`LEVEL`, `ERRC`) | Rápido raso 7 m de frente: 94 % a puerta (Mitjana) | Sí | El equilibrio real llega con el portero (F1.8) |
| **Modelo de error (F1.5c, objetivos de Guillem)** | | | | | |
| 5 | «Rápido a 7 m de frente ≥ 90 %» (DECISIONS:125; PROGRESS:67) | B1 `ERRC quick 7 m 0°` (3.ª cifra = hoy) | Parado **94 %**, patinando **96 %**, a sprint **90 %** | Sí | A sprint está justo en el límite (±1,7 puntos de ruido con 300 tiros) |
| 6 | «Carga completa a 14 m de frente ≥ 90 %» (DECISIONS:125) | B1 `ERRC full 14 m 0°` | Parado **91 %**, patinando 96 %, a sprint 98 % | Sí | — |
| 7 | «Ningún caso más duro que el techo» (opción 2 del informe de la v0.1.25; DECISIONS:125) | B1 `ERRC` (2.ª cifra = techo emulado, 3.ª = hoy) | En las 48 combinaciones válidas, hoy ≥ techo (p. ej. sprint 7 m: 90 % frente a 86 %; sprint 14 m: 71 % frente a 65 %; trencada / derrape 35-65 % frente a 31-63 %) | Sí | Nota: el techo que imprime hoy el banco a sprint (86 % / 65 %) es más bajo que el citado en DECISIONS:125 (91 % / 70 %), porque el banco lo emula sobre la simulación actual, donde un toque de Xut ya no quita el sprint. Contra cualquiera de los dos, se cumple |
| 8 | Error según el contexto con pesos en el panel; todos a 0 = v0.1.25 exacto (03:63-71; DECISIONS:125) | U (`shot.test.ts:222`, `:237-287`) | Tests en verde. Peor contexto (Mitjana, rápido): 14 m a 30° a sprint 64 %; trencada / derrape 35-65 % | Sí | — |
| 9 | «El tiro me parece infalible» → aceptado tras la v0.1.26: «funciona bastante bien»; aceptados el sprint a 1,5° y el primer toque a 10 m y 30° (DECISIONS:129) | Guillem en el Pixel | — | Sí (Guillem, 2026-10-08) | — |
| **Primer toque y media vuelta (F1.5b)** | | | | | |
| 10 | «Primer toque tras un raso limpio ≥ 75 % a puerta» (DECISIONS:123; PROGRESS:66) | B1 `FIRST front` (cifra «after a clean one») | 7 m 0°: 83 % (antes) / 88 % (después); 7 m 30°: 81 / 86 %; 10 m 0°: 77 / 79 %; **10 m 30°: 69 / 72 %** | Sí (con la excepción aceptada) | 10 m y 30° queda por debajo; Guillem lo aceptó (DECISIONS:129) |
| 11 | «Media vuelta ≤ 0,35 s desde que se pulsa» (03:74; DECISIONS:123) | B1 `TURN`; U (`shot.test.ts:518`) | **0,33 s** desde que se pulsa (0,23 s desde que se suelta) en los 12 casos | Sí | — |
| 12 | «Media vuelta igual con el joystick apuntando o suelto» (DECISIONS:126) | B1 `TURN` (parado / patinando hacia fuera × suelto / apuntando); U (`shot.test.ts:557`, `:581`) | Media vuelta **100 %** en los 4 casos a 3, 5 y 8 m; a puerta 98-99 % (3 m), 92-96 % (5 m), 80-87 % (8 m) | Sí | — |
| **Rechaces (F1.5c b)** | | | | | |
| 13 | «Rebote en valla» (06:16) y rechaces medidos: ninguno atraviesa postes, larguero ni red hasta 30 m/s (03:21; DECISIONS:127) | U (`rebound.test.ts:19`); B5 `REB` | Túneles: **0** en los 20 casos (20 y 28 m/s, bola normal y pesada). Poste 2-39 % dentro, sale con el 63-70 %; larguero 5-20 % dentro, 17-51 % por encima de la valla de fondo; valla de fondo vuelve con el 60-65 % (iguales a 03:21) | Sí | Larguero que sale por encima de la valla de fondo: a F3 (DECISIONS:129) |
| 14 | «Bola pesada» solo para probar, apagada de fábrica (03:22) | U (`rebound.test.ts:32`); B5 `REB heavy` | Valla de fondo 48-56 % con la pesada | Sí | — |
| **Remate en el aire / volea (F1.5d, F1.5e)** | | | | | |
| 15 | «Ningún botón nuevo; una sola regla de remate en el aire (mismo Xut, misma ventana)» (06:19) | U (`volley.test.ts:103-183`) | Tests en verde: el remate sale del mismo Xut en una ventana de 0,4 s; fuera de ella, nada | Sí | — |
| 16 | «Buen timing ≥ 70 %» con un humano normal (DECISIONS:130; PROGRESS:68) | B2 `VOLE`; B4 `VOLAH` | Normal **84-85 %** (en las 9 filas del alto fuerte); bueno 99 %; torpe 64-68 % | Sí | El objetivo era para el humano normal; el torpe queda por debajo |
| 17 | «Remata de primeras ~100 %, el 99 % en el aire, ninguno por debajo de 0,15 m» (DECISIONS:133; PROGRESS:69) | B2 `VOLE drive` (pase de 8 / 12 / 16 m) | Remata **100 %**, en el aire **99 %**, contacto a **0,58-0,64 m**, por debajo de 0,15 m **0 %** | Sí | — |
| 18 | «El alto fuerte llega por el aire a una altura cómoda (0,3-1,0 m)» (06:20; 03:25) | B2 `VOLP drive` | 5-18 m: **100 %** entre 0,3 y 1,0 m (p10 0,47 - p90 0,84 m; mediana 0,52-0,64 m). A 20-25 m (pase de la v0.1.27, por diseño): 1-10 % | Sí (hasta 16,5 m del stick, `pass.driveAirFull`) | Más allá de ~17 m llega botando (decidido); ver fila 26 |
| 19 | «Pico ≤ 1,40 m» (06:20) | B2 `VOLP drive` | Máximo **1,33 m** (5-18 m; media 0,52-1,21 m) | Sí | A 22 m el pico llega a 1,49 m y a 25 m a 2,08 m (fuera del tramo «por el aire»; > 1,50 m es un choque con el reglamento, F3) |
| 20 | Tiempo de vuelo del alto fuerte más corto: 0,52 / 0,71 / 0,83 s a 8 / 12 / 16 m (03:25) | B2 `VOLP drive` | 0,52 / 0,71 / 0,83 s | Sí | — |
| 21 | «Remate en el aire solo de 0,15 a 1,50 m» (06:20; reglamento art. 6.3, docs/02:31) | U (`volley.test.ts:195`); B2 (`<0.15 m 0%`) | Test en verde; `volley.minHeight` 0,15 / `maxHeight` 1,5 | Sí | — |
| 22 | «Altura máxima 1,50 m» en general (06:19) | docs/02:65 + B2 `VOLP` | El remate respeta 1,50 m. **No** la respetan: vaselina (pico 1,51 m a 12 m; 1,96-3,36 m a 16-25 m), alto fuerte de 22-25 m (1,49-2,08 m), tiro picado (docs/02:65) | Parcial | Decidir en F3 la regla estricta o una opción en Configuració (06:19 ya lo aplaza: «las faltas son de F3») |
| 23 | «Recepción de la bola alta» (06:20): el receptor la baja con el stick; «la controla el 98-100 % como antes» (DECISIONS:133; 03:32) | B5 `SGL driven`; U (`pass.test.ts:289`, `volley.test.ts:232`) | La tiene / limpia: 5-8 m 99/99 %, 8-12 m 99/98 %, 12-14 m 99/98 %, 14-16 m 98/88 %, 16-17 m 100/90 %, 17-18 m 100/86 % | Sí | El control **limpio** baja a 86-90 % de 14 a 18 m (v0.1.27: 92-96 %); ya documentado |
| 24 | Sin pulsar Xut, el alto fuerte se controla igual (protección) (DECISIONS:133) | B2 `VOLE` (columna «no TIRO») | Limpia 91-100 %, nunca intocada | Sí | — |
| 25 | Volea a puerta según de dónde viene el pase: esquina 77-86 %, lateral 68-78 %, desde detrás 45-59 % (03:75; DECISIONS:133) | B3 `VOLG` (pase de 10 m, receptor a 7-9 m) | Esquina / pase atrás **78-86 %**, lateral **68-77 %**, desde detrás **47-59 %** | Sí (coincide con lo documentado) | Desde detrás es difícil a propósito (giro); P11 (perfilarse) aplazada |
| 26 | v0.1.29: «un alto fuerte dirigido a ti: ventana, aviso y cámara lenta el 100 %, ningún pase perdido» aunque gires el joystick hacia la portería (DECISIONS:135; PROGRESS:70; 03:75: «desde que sale un alto fuerte dirigido a ti») | B6 (filas `goal` y `goalSoft`: joystick a la portería tras el pase; `release`: suelto) | Pase de 6-16 m, pasador parado / patinando / a sprint, receptor quieto o en carrera: **100 / 100 / 100 %** y 0 perdidos (también a 0,8× y 1,4× de velocidad de juego y a 120 Hz). **Pero** con pases que salen a ≥ 17,9 m del receptor (en carrera a 18 m, o a 20 m): ventana 33-46 % y **pases perdidos sin tocar: 11-14 de 24** (46-58 %) con el joystick a fondo hacia la portería (`goal`) y 5-14 de 24 con el joystick a media inclinación (`goalSoft`) | **Parcial** | Ver «Hallazgo 1»: el arreglo solo cubre el alto fuerte «por el aire» (`passAir > 0`, hasta 16,5 m); docs/03:75 promete más |
| 27 | Cámara lenta de la ventana: encendida, al 60 %, ≤ 0,35 s, empieza al abrirse la ventana; la bola llega ~111 ms más tarde (06:20; DECISIONS:135) | U (`slowMo.test.ts:38-108`); B6 | En el 100 % de las ventanas abiertas: empieza 0,18 s de juego antes del contacto, dura **0,33 s reales** (a 60 Hz) en los que pasan 0,22 s de juego → la bola llega **~0,11 s más tarde**. Momento bueno > 0,20 s reales (test; 0,21 s documentado) | Sí (números) / **Solo Guillem** (que se note) | Guillem no la vio en la v0.1.28: tiene que verla en la v0.1.29. P16 (cámara lenta «fuerte») pendiente de su decisión |
| 28 | Aviso dorado en la bola + Xut dorado (v0.1.29; 03:75) | CI e2e `volley.spec.ts:98` (halo y Xut se encienden, el juego se ralentiza, un toque remata) | e2e en verde en CI | Sí (técnico) / **Solo Guillem** | Que lo vea con la cámara TV en el Pixel |
| 29 | Reaccionar al aviso basta para rematar (requisito implícito de «ver la volea») | B6 test «cue-reactive TIR tap» **corregido** (ver «Hallazgo 2») | Humano que pulsa Xut 0,22 s después de encenderse el aviso (toque de 0,1 s): **remata en el aire 24/24** de 6 a 18 m, parado y a sprint. El banco tal cual da 0/24 (error del banco, no del juego) | Sí (con el banco corregido) | Corregir el banco (Hallazgo 2) |
| 30 | Línea de diagnóstico en el panel ⚙ (v0.1.29; 03:75) | U (`volleyFeedback.test.ts:59`) | Test en verde | Sí | — |
| 31 | Vibración del remate perfecto (32 + 45 + 14 ms) e interruptor «Vibració» encendido de fábrica (06:17; 03:101; DECISIONS:136) | U (`volleyFeedback.test.ts:27`, `:35`; `settings.test.ts:42`) | Tests en verde | Sí (técnico) / **Solo Guillem** | Notarla en el Pixel 8a (en iPhone no hay vibración web) |
| 32 | Alto fuerte más fácil de dirigir: salida media / p90 Mitjana 0,17 / 0,36 m parado, 0,27 / 0,56 m a sprint (03:26; DECISIONS:137) | B7 `DRIVE … 8-16` | Parado → quieto **0,17 / 0,36 m**; sprint → quieto **0,27 / 0,56 m**; la tiene 100 %, limpia 94-96 %, en el aire 98-99 % | Sí (números) / **Solo Guillem** | Lo que más desvía a sprint es la trencada (P12); P13-P15 sin decidir |
| 33 | Plan F1.5d: «buen timing a 7 m ≥ 75 % a puerta» (DECISIONS:232) | B3 `VOLG` (columna «on target» del buen timing) | 7 m 0°: esquina 85 %, lateral 78 %, detrás 57 %; 7 m 30°: 79 / 71 / 52 % | Parcial | No desde detrás ni desde el lateral a 30° (ya dicho en DECISIONS:130) |
| 34 | Plan F1.5d: «mal timing ≤ 55 % a puerta» y «~60 % de buen timing con ±0,04 s» (DECISIONS:232) | B3 `VOLG`, `VOLT`; B4 `VOLAH good` | Mal timing a puerta 53-87 % (a 7 m 0°: 67-87 %); en la curva `VOLT`, de −0,20 a +0,10 s: 75-87 % a puerta (el mal timing cuesta sobre todo potencia: 17,5-17,8 frente a 19,8 m/s). Humano bueno: 99 % de buen timing | **No** | Eran objetivos «propuestos»; la ventana más generosa la decidió Guillem (DECISIONS:130), pero nadie retiró estas dos cifras. Decidir: retirarlas o que el mal timing cueste precisión |
| 35 | Plan F1.5d: rechaces rematables en el aire: «medir» (DECISIONS:232, fila «Rechaces») | — | **Sin medir**: ningún banco remata rechaces de poste, larguero o valla | No | Medirlo (banco de rechaces + `runVolley`); sin portero (F1.8) cuenta poco |
| **Cierre** | | | | | |
| 36 | Protección: tiro, primer toque, media vuelta, cadenas y pases idénticos a la versión anterior (DECISIONS:130, :133, :135) | B1 (comparado con DECISIONS:123-126) | Todas las cifras de B1 coinciden con las de la v0.1.26 en DECISIONS (p. ej. 94 / 96 / 90 %, 91 %, 0,33 s, primer toque 83-88 %) | Sí | Banco de regresión con línea base JSON: tarea J del bloque 2 |
| 37 | Todo número de tacto en `tuning.ts` y en el panel; ningún texto visible sin i18n (CLAUDE.md, reglas 4 e i18n) | U (`tuningMeta.test.ts`, `i18n.test.ts`) | Tests en verde | Sí | Ver nota de documentación al final |
| 38 | 60 fps en el Pixel con lo nuevo de F1.5 (retícula, anillo dorado, cámara lenta) (CLAUDE.md regla 5) | CI e2e `perf.spec.ts` (CPU ×4, 3 cámaras) en verde | Presupuesto de la prueba cumplido en CI | **Solo Guillem** | Mirar fps en `?debug=1` durante una volea en el Pixel (detalle de rendimiento: §C) |
| 39 | «El cierre de F1.5 se aplaza hasta que la volea le guste a Guillem» (06:20; PROGRESS:69-71) | Prueba de Guillem de la v0.1.29 | — | **Solo Guillem** | Ver «Qué tiene que probar Guillem» |
| 40 | Gesto de arrastre hacia la portería para volea y picada «se decide en el plan de F1.6» (06:20; DECISIONS:134) | — | Plan A / B / C escrito, sin aplicar | No aplica a F1.5 | Decisión de Guillem en el plan de F1.6 (no bloquea F1.5) |
| 41 | Aceptación de F1 sobre el tiro: «marcar gol al portero básico es posible pero no trivial» (06:23) | — | Sin portero todavía | No aplica a F1.5 | F1.8 |

**Resumen:** 41 criterios. Cumplen 27 (Sí); 4 cumplen en lo técnico y les falta la prueba de Guillem (27, 28, 31, 32); 3 dependen solo de Guillem (el 9, ya aceptado; el 38 y el 39, pendientes); 3 son parciales (22, 26, 33); 2 no se cumplen (34, 35); y 2 no aplican a F1.5 (40, 41).

### Hallazgos

**Hallazgo 1 (juego; gravedad media; candidato a v0.1.30 si el agente principal lo considera un fallo que no cambia el tacto).** El arreglo de la v0.1.29 («el joystick solo apunta mientras viene un alto fuerte dirigido a ti») solo vale para el alto fuerte que llega por el aire. En `src/sim/world.ts:453`:

```ts
const aerialPass = world.passTo === world.controlled && world.passAir > 0 && inAir(world.ball);
```

`passAir` es 0 en los altos fuertes lanzados a más de `pass.driveAirFull` (16,5 m hasta el stick), que son el pase de la v0.1.27 que cae y bota. Si mientras vuela giras el joystick más de 45° (por ejemplo, hacia la portería), el receptor deja de ir a por la bola, como pasaba antes de la v0.1.29. Medido con B6, en las filas `goal` y `goalSoft` (24 semillas por fila): con pases que salen a 17,9-20,0 m del receptor, la ventana se abre el 33-46 % de las veces y **se pierden sin tocar 11-14 de 24 pases** con el joystick a fondo hacia la portería (5-14 de 24 a media inclinación). Con el joystick suelto se pierden 0-3 de 24. Con pases de 6-16 m (17,5 m si el receptor está quieto), 0 de 24 en todas las filas. Para reproducirlo: en el Pixel, alto fuerte a un compañero a unos 18-20 m (o a uno que corre alejándose a 18 m), y justo al salir el pase se gira el joystick hacia la portería. docs/03:75 dice «desde que sale un alto fuerte dirigido a ti», sin límite de distancia: el documento promete más de lo que hace el código. La vaselina probablemente tiene el mismo problema (estimación, sin medir: su `passAir` también es 0). **Arreglo propuesto (sin aplicar):** que valga para cualquier pase elevado (alto fuerte o vaselina) dirigido al jugador controlado mientras siga vivo (`passTo === controlled`), aunque haya botado; no solo cuando `passAir > 0 && inAir`. **Test propuesto:** en `tests/unit/volley.test.ts`, alto fuerte de 20 m con el joystick a 90° del pase desde que sale → el receptor la toca en todas las semillas. En B6, las filas `goal` de 18-20 m deberían quedar con 0 pases sin tocar. Ojo: se parece a la P10 («el joystick solo apunta» en el primer toque raso), que necesita el visto bueno de Guillem. Hay que decidir si esto es un arreglo o un cambio de tacto.

**Hallazgo 2 (banco; gravedad baja: no afecta al juego ni a ninguna cifra publicada).** En `tests/unit/bench/volleyCueRealFlow.test.ts:166`, el caso `cueTap` hace `cmd.shoot = f === tirPress;` en cada frame. Con la cámara lenta al 60 %, cerca del 40 % de los frames no ejecutan ningún tick. Si el frame en que se pulsa es uno de ellos, el frame siguiente borra la pulsación y el banco nunca dispara: da 0/24 voleas, siempre «high-clean». El juego real no tiene este problema: `game.ts` y `humanInput.ts` solo borran la pulsación después de un tick (`consumeEdges`). **Arreglo propuesto:** `if (f === tirPress) cmd.shoot = true;` (lo borra la línea 197 tras el tick, como hace el juego). Con este cambio, aplicado solo en una copia temporal que ya está borrada: **24/24 voleas en el aire** de 6 a 18 m, parado y a sprint (fila 29). Ninguna cifra de DECISIONS ni de docs/03 usa este test.

**Nota de documentación (para §D).** `volley.highPenalty` (la dificultad extra de rematar por encima de 0,7 m) pasó de 0,5 a **0,1** en la v0.1.28 (`git show 7ce7db7:src/config/tuning.ts`), pero DECISIONS:130 sigue diciendo 0,5 y ninguna entrada de la v0.1.28 lo menciona.

### Qué tiene que probar Guillem (filas «Solo Guillem»)
- Volea con un alto fuerte de 8-16 m: ¿ves el **anillo dorado** en la bola y notas la **cámara lenta**? ¿Te gusta la volea? Esto decide el cierre de F1.5 (filas 27, 28 y 39).
- Lo mismo **girando el joystick hacia la portería** mientras vuela el pase: ahora no se pierde (fila 26). Con pases de unos 20 m sí puede perderse (Hallazgo 1).
- **Vibración** con el timing perfecto, y que el interruptor «Vibració» de Configuració la apague (fila 31).
- Alto fuerte **a sprint**: ¿ya va donde quieres? Si falla al apuntar muy de lado, es la trencada (P12) (fila 32).
- Mirar los fps con `?debug=1` durante una volea (fila 38).

### Lo que falta para cerrar F1.5
1. Que Guillem pruebe la v0.1.29 en el Pixel (anillo dorado, cámara lenta, vibración, apuntar el alto fuerte) y diga si la volea le gusta: es la condición de cierre (06:20).
2. Decidir el Hallazgo 1 (pase largo perdido al girar el joystick): arreglo en la v0.1.30 con test, o dejarlo y corregir docs/03:75.
3. Que Guillem decida las propuestas abiertas que tocan F1.5: P16 (cámara lenta fuerte), P12-P15 (dirección del alto fuerte) y P10-P11 (aplazadas desde la v0.1.27).
4. Retirar o mantener los dos objetivos del plan F1.5d que no se cumplen: «mal timing ≤ 55 %» y «~60 % de buen timing con ±0,04 s» (fila 34).
5. Medir los rechaces rematables en el aire, que el plan F1.5d dejó como «medir» (fila 35), o pasarlo a F1.8 con el portero.
6. Corregir el banco `cueTap` (Hallazgo 2) y añadir las cifras de F1.5 a la línea base de regresión (tarea J).
7. Anotar en DECISIONS el cambio de `volley.highPenalty` de 0,5 a 0,1.
8. Dejar escrito en PROGRESS que la altura de 1,50 m (vaselina, alto fuerte largo y picado) y el gesto de arrastre no bloquean F1.5: son de F3 y de F1.6.

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

## §C Rendimiento

Código auditado: **v0.1.29** (`00fc599`), medido el 2026-10-10 en un worktree limpio, **sin tocar `src/`**. Objetivo de docs/05: 60 fps estables en el Pixel 8a, es decir, 16,7 ms por fotograma.

**Aviso sobre el ruido.** La máquina es un contenedor de 4 vCPU (Xeon a 2,3 GHz) compartido con hasta 3 agentes más; la carga media osciló entre 0,3 y 9 durante las medidas. Cada medida se ha repetido **3 veces** (algunas del navegador, 2). Doy la **mediana** y, entre corchetes, el **rango** [mín-máx] de las repeticiones. Las cifras de Node se repiten con ±5 %; las del navegador, con hasta ±40 %.

### Resumen

1. **La simulación de hoy es barata en régimen normal.** Un tick normal cuesta **6 µs con 3 jugadores y 10 µs con 10 entidades** de mediana en Node. Dentro del juego cuesta más (apartado C6):
   - medido en Chromium a 60 fps, **0,06 ms (3 jugadores) y 0,11 ms (10 entidades) a CPU ×1**, y **0,08 y 0,31 ms a ×4**;
   - es ~10× el micro-banco de Node, porque el tick se ejecuta entre fotogramas de render, con las cachés frías.
2. **El trabajo de CPU por fotograma cabe con margen**, en régimen de 60 fps, calidad media y el modelo «×4 ≈ Pixel 8a» del repo:
   - **~1,9 ms hoy y ~3,2 ms con 10 entidades** de JavaScript de media (p95 3,3 y 6,5 ms);
   - **~2,7 y ~3,9 ms de hilo principal** en total;
   - incluso a ×6 se queda en 4,3 ms (p95 7,5).
   
   El tiempo de GPU del Pixel **no se puede medir aquí**: no hay GPU, WebGL corre en SwiftShader.
3. **Lo que rompe el fotograma son los picos de la simulación, no el promedio.** Los provocan los planificadores que resuelven por **bisección**:
   - `planPass` cuesta **0,33-1,1 ms por llamada con un alto fuerte**, hasta 1,9 ms con carga a 25 m, y **0,57-1,33 ms con una vaselina**;
   - `planShot` cuesta **0,05-0,22 ms con un tiro alto** y **0,23-0,43 ms con un picado**;
   - son cifras de Node/vitest; con el código empaquetado como en producción, la mitad;
   - dentro del juego a ×4, con 10 entidades, el tick tiene **p95 de 0,8-1,1 ms y máximos de 1,9-4,6 ms**; a ×6, picos de **7-13 ms en un solo tick** (un pase alto que sale, más el GC o el JIT de ese tick).
4. **La flecha del pase confirma el hallazgo de PLAN_F2.** Mientras mantienes Passada, la flecha recalcula `planPass` **cada tick**:
   - un tick cuesta **0,52 ms (alto fuerte) y 0,65 ms (vaselina)**, frente a 3 µs sin Passada (×170-230);
   - genera **0,56-0,70 MB de basura por tick** (34-42 MB/s), con 4-6 recolecciones de memoria (GC) menores por segundo;
   - si coincide con un **fotograma de recuperación** (hasta 5 ticks seguidos), en Node son 4-8 ms y en Chromium ×6 hay fotogramas con **10-21 ms solo de sim**. Es la semilla de una espiral de tirones.
5. **Draw calls (llamadas de dibujo).** Hoy hay **35** en calidad media; **con 10 entidades, 93-99**, por encima del objetivo de docs/04 (≤ 60) y cerca del techo duro (120):
   - cada jugador suma **5 draw calls** (cuerpo, «nariz», mango y pala del stick, dorsal) **más ~3,5 de sombra**;
   - los triángulos sobran: 9,7-10,5k de 80k;
   - la CPU del render a ×4 sube de 1,8 a 2,8 ms por fotograma, y el mapa de sombras de 0,5 a 0,85 ms.
6. **El primer uso de un material provoca un tirón:** su shader se compila en mitad del partido. En SwiftShader: **222-556 ms** el primer fotograma con la flecha del pase, y 30-300 ms con otro anillo. En el móvil será menos, pero existe.
7. **PLAN_F2** (detalle en el último apartado):
   - «~1 ms por planificación de pase alto»: **se sostiene**.
   - «0,2-0,4 ms por tick con la IA en el Pixel»: **no se sostiene tal como se calculó (Node × 4)**. La física de hoy con 10 entidades ya cuesta **0,21-0,36 ms por tick dentro del juego a ×4**, 3-6× lo que suponía el plan. Y su objetivo «p95 ≤ 0,5 ms y máx. ≤ 1 ms por tick a ×4» **ya se supera hoy sin IA** (p95 0,8-1,1 ms, máx. 1,9-4,6 ms) por los picos del punto 3.

### Método

**Simulación (Node 22, vitest 5).** El banco es `tests/unit/bench/perfBench.test.ts`, con ayudantes en `perfBench.ts`. Solo corre con `PATINS_BENCH=1`. Se cronometra cada `stepWorld` con `performance.now()`. Antes de medir se calienta el JIT con 3000 ticks. Por mundo: 6 semillas × 3600 ticks, es decir, 6 minutos de juego.
- **Mundo actual:** `createWorld(semilla, 2)` = tú + 2 compañeros, que son los bots de F1.4. A tu jugador lo mueve una entrada aleatoria con semilla:
  - persigue la bola, deambula o se para, y esprinta;
  - pulsa Passada y Xut con duraciones y alturas al azar, además de CANVI y Regat;
  - remata en el aire cuando la sim lo anuncia.
- **Mundo de estrés (10 entidades):** `createWorld(semilla, 3)`, más un portero del equipo 0 y 4 jugadores y un portero del equipo 1, añadidos en el test con `createPlayer`. `stepWorld` ya admite N jugadores sin tocar nada.
  - Los compañeros del equipo 0 siguen con su IA real de F1.4 (`botCommand`).
  - A tu jugador, a los dos porteros y al equipo 1 los mueve una **IA provisional solo de test**: el más cercano persigue la bola, los demás van a puntos alrededor de ella, y el portero se queda en su portería. Quien tiene la bola conduce, pasa (raso, alto fuerte o vaselina; toque o carga) o tira (raso, alto o picado).
  - **No es la IA de F2.** Su propio coste (1,2 µs/tick) **no se cuenta** en las cifras de la simulación.
  - Actividad por minuto: **18 pases** (8 rasos, 7 altos fuertes, 3 vaselinas), **10 tiros** y **33 recepciones**; la bola va suelta el 58 % del tiempo. En el mundo actual: 9 pases, 8 tiros y 14 recepciones por minuto.
- **Por llamada:** micro-bancos de `planPass`, `planShot`, `predictContact`, `stepBall`, `collidePlayers`, `stepPlayer`, `findReceiver`, `pickupDistance` y `pressureOn` en escenarios fijos. Mediana de 5 lotes.
- **Memoria:** `v8.GCProfiler` da los bytes exactos asignados (memoria usada más lo que libera cada GC), el número de GC y su coste. Un muestreo del montón (`HeapProfiler.startSampling`) dice **quién** asigna.
- **Reparto del tiempo:** perfil de CPU con `node:inspector` (muestreo cada 100 µs) del mundo de estrés, en porcentaje.
- **Matiz:** vitest transforma los módulos, y cada import pasa por un objeto intermedio. He empaquetado la misma sim con `rolldown --minify`, como en producción, y la he ejecutado con Node directamente:
  - `benchSim` baja de **4,5 a 3,7 µs** por tick;
  - `planPass` de un alto fuerte a 12 m baja de **0,62 a 0,31 ms**, y el de una vaselina de **0,90 a 0,47 ms**;
  - las asignaciones son **idénticas**.
  
  Es decir, **vitest exagera ×1,2-2 los bucles calientes**.

**Render (Chromium headless + Playwright).** La especificación es `tests/e2e/perfStress.spec.ts` y solo corre con `PATINS_PERF=1`. Proyecto `pixel8a-landscape` (914×411 CSS, DPR 2,625) y cámara TV.
- **Qué se mide:**
  - en la página se envuelven `FixedStepLoop.advance` (sim), `Renderer.sync`, `Renderer.render` (`scene.render` de Babylon: su parte de CPU, mapa de sombras incluido) y los callbacks `onFrame` (HUD);
  - además se leen las métricas de CDP `Performance.getMetrics` (hilo principal entero, script, estilo y layout), los contadores de `SceneInstrumentation` (evaluación de mallas activas, render targets = sombra) y los shaders compilados (`engine._compiledEffects`);
  - cada ventana dura 5 s a CPU ×1, ×4 y ×6 (`Emulation.setCPUThrottlingRate`).
- **Dos regímenes:**
  - **(a) 60 fps**, el principal: la escena se dibuja a 1/4 de resolución para que SwiftShader llegue a 60 fps; así hay ~1 tick por fotograma, como en el móvil;
  - **(b) resolución completa:** SwiftShader va a 6-22 fps y cada fotograma ejecuta 3-5 ticks de recuperación. En este régimen la rasterización por CPU **le quita CPU al hilo principal**, y sus cifras salen infladas ×1,5-2,5. Se dan como cota superior.
  - Calidades: baja (`?quality=low`: sin sombras, DPR 1,25) y media (DPR 1,75, sombra de 1024). A 1/4 de resolución el mapa de sombras conserva su tamaño.
- **«10 entidades»** = el mundo real del juego más 7 jugadores añadidos desde el test: un compañero, que pasa a ser bot de F1.4, un portero y el equipo 1, movidos por un script mínimo de la página que conduce, persigue, pasa y tira.
  - **Representa** la carga de F2 con el render de hoy: por jugador, cápsula, nariz, stick con 2 mallas y dorsal, con sombra.
  - **No representa** el arte de F4: los modelos riggeados y las equipaciones costarán más por jugador.
- **Caveats:**
  - **`performance.now()` va a saltos de 0,1 ms** en esta página, que no es *cross-origin isolated*. Por eso la sim por tick se contrasta con un **perfil de CPU de CDP** (C7). Las dos fuentes coinciden: 0,059 frente a 0,06 ms por tick con 3 jugadores a ×1.
  - **El throttling de CDP** escala bien el trabajo largo (`benchSim` de 60 000 ticks: ×4 = 4,2× el de ×1), pero menos las ráfagas cortas, como un tick: a ×4, el tick suele salir solo ~2-3× más caro que a ×1. Por eso, como cota alta para el Pixel, tomo además **coste a ×1 × 4**.
  - El intervalo entre fotogramas **no dice nada del Pixel**.
- **Del contenedor al Pixel.** Mantengo la convención del repo: CPU ×4 ≈ Pixel 8a (PROGRESS, F0), y ×6 como caso pesimista (calor, núcleo mediano). La única referencia real es la de F0: 1,27 ms de CPU por fotograma en el Pixel, con 9 draw calls y un jugador. Hoy, con 35 draw calls y 3 jugadores, aquí miden 0,7 ms a ×1 y 1,9 ms a ×4, lo que es coherente con un factor de ~3-4. Para tenerlo de verdad, ver M10.

### C1. Coste de la simulación por tick (Node, µs)

| Mundo | Media | p50 | p95 | p99 | Máx. | Peor suma de 5 ticks seguidos |
|---|---|---|---|---|---|---|
| Actual (3 jugadores) | 19,2 [18,6-19,4] | 5,9 [5,8-5,9] | 32,7 [31,8-35,0] | 436 [434-445] | 4600 [2765-6672] | 6136 [5426-8104] |
| Estrés (10 entidades) | 23,5 [23,0-25,2] | 10,1 [9,7-10,4] | 30,8 [27,8-32,1] | 610 [602-649] | 1826 [1647-6371] | 6376 [6368-7913] |
| Estrés, código empaquetado (Node directo) | 18,9-20,8 | 6,2-6,6 | 37 | — | — | — |

**Por lo que pasa en el tick** (media / p95 en µs):

| Clase de tick | Ticks (actual / estrés) | Actual | Estrés |
|---|---|---|---|
| Normal | 18 344 / 19 192 | 8,2 / 18,1 | 11,4 / 17,4 |
| Retícula del tiro (llevas la bola cerca de la portería) | 2529 / 1716 | 12,2 / 31,2 | 13,5 / 23,5 |
| **Flecha** (Passada mantenida con la bola) | 627 / 528 | **320 / 709** | **415 / 1096** |
| **Sale un pase** | 50 / 103 | **317 / 629** | **337 / 1041** |
| **Sale un tiro** | 50 / 61 | **284 / 877** | **244 / 714** |

El p99 (~0,4-0,6 ms) y los máximos los ponen las tres clases en negrita. Los máximos sueltos de 2-6 ms cambian de una repetición a otra: son ruido de la máquina, GC o compilación del JIT.

### C2. Coste por llamada de las predicciones caras (Node/vitest, µs; aprox. ×0,5 en el código empaquetado)

| `planPass` | 6 m | 10 m | 16 m | 25 m |
|---|---|---|---|---|
| Raso, carga 0 | 34-39 | 52-55 | 74-80 | 112-113 |
| **Alto fuerte**, carga 0 | 331-392 | 500-544 | 622-658 | **1076-1118** |
| **Alto fuerte**, carga 1 | 465-516 | 752-763 | 1047-1097 | **1763-1836** (receptor corriendo: hasta 1963) |
| **Vaselina**, carga 0 | 573-655 | 772-798 | 1023-1037 | 1260-1282 |
| **Vaselina**, carga 1 | 584-600 | 773-785 | 1013-1033 | 1239-1278 |

- Con el receptor corriendo a 6 m/s: +3-8 %.
- Sin receptor: raso hacia la valla (planifica la pared) 102-111 µs; alto fuerte o vaselina, 370-525 µs.

| Función | Coste |
|---|---|
| `planShot` a 5 / 10 / 18 m | raso 0,1-0,6 µs · **alto 51-76 / 111-136 / 202-225 µs** · **picado 234-238 / 322-337 / 417-428 µs** |
| `predictContact` (remate en el aire; mira 0,5 s por delante = 30 pasos) | 1,84-2,11 µs por llamada, venga la bola o no |
| `stepBall` con 10 jugadores | tiro a 25 m/s (13 sub-pasos): 6,1-10,0 µs · rodando a 3 m/s: 1,1-1,8 µs |
| `collidePlayers`, los 45 pares de 10 entidades | 1,47-1,85 µs por tick (33-41 ns por par) |
| `stepPlayer` | 0,26-0,29 µs por jugador |
| `findReceiver` (10) / `pickupDistance` / `pressureOn` (10) | 0,04-0,05 / 0,07-0,08 por jugador / 0,21-0,23 µs |

**Por qué son caros.** Cada planificador busca la velocidad o el ángulo por **bisección** (28 pasos en `pass.ts`/`rolling.ts`, 24 en `shot.ts`). En cada paso **simula el vuelo entero** a 120 Hz (`flight`, `crossing`, `heightAt` o `roll`, hasta 6 s). Además, `planPass` lo repite **3 veces** para afinar la anticipación al receptor, y un alto fuerte con carga encadena 4 bisecciones por vuelta. Resultado: ~10⁴-10⁵ pasos de integración por llamada.

### C3. La flecha del pase: coste por tick con Passada mantenida (20 semillas × 36 ticks)

| Altura | Con Passada (media / p95) | Llevando la bola sin Passada |
|---|---|---|
| Raso | 37-41 / 45-54 µs | 2,5-3,6 µs |
| **Alto fuerte** | **515-549 / 717-781 µs** | 2,8-3,3 µs |
| **Vaselina** | **636-696 / 781-1032 µs** | 2,8-3,6 µs |

En Chromium (resolución completa, ~3 ticks por fotograma), la sim por tick en los fotogramas con flecha:

| CPU | Con flecha | Sin flecha | Nota |
|---|---|---|---|
| ×1 | 0,18-0,20 ms | 0,07-0,12 ms | — |
| ×4 | 0,64-0,77 ms | 0,11-0,19 ms | picos de 3,7 ms por tick |
| ×6 | 0,69-0,97 ms | — | fotogramas con **10-13 ms de sim** (3-5 ticks seguidos con flecha) |

En el juego los pases suelen ser cortos (~6 m), por eso sale más barato que en Node a 12 m.

### C4. Memoria y GC

| Escenario | Bytes por tick | MB/s | GC menores | Coste del GC |
|---|---|---|---|---|
| Mundo actual (6 min) | 14,7 k | 0,88 | 6-7 por minuto | media 0,28-0,33 µs/tick; el peor, 0,25-0,30 ms |
| Mundo de estrés (sin la IA de test, que suma 1,8 k) | 20,6 k | 1,24 | 9 por minuto | media 0,49-0,51 µs/tick; el peor, 0,26-0,31 ms |
| Llevar la bola | 2,4 k | 0,15 | 0 | — |
| Passada mantenida, raso | 8,3 k | 0,50 | 0 | — |
| **Passada mantenida, alto fuerte** | **564 k** | **34** | **4 por segundo** | 20-25 µs/tick |
| **Passada mantenida, vaselina** | **704 k** | **42** | **4-6 por segundo** | 21-25 µs/tick |

**Quién asigna** (muestreo del montón, mundo de estrés, por tick):
- **`Math.hypot`: 13 KB (53 %).** Es un builtin de V8 con número variable de argumentos que el compilador no integra: cada llamada crea un array y un número «en caja». En Chromium ×1 cuesta **25-40 ns por paso del solver, frente a 11-19 ns con `Math.sqrt`**.
- **Los bucles `flight` y `crossing`** (integrados en `loftPassSpeed` y `airLaunch`): 5 KB.
- **`stepPlayer`: 2,1 KB.** Crea un cierre (`inCut`) en cada llamada.
- **`predictContact`: 1,1 KB.** `bladePoint` devuelve un objeto nuevo.
- **`collideGoal`: 1,0 KB.** El cierre `clampAxis`.
- **`botCommand`: 0,24 KB.**

**Prueba en el banco** (no aplicada): `Math.hypot` → `Math.sqrt` en toda la sim:

| Medida | Antes | Después |
|---|---|---|
| `planPass` alto fuerte a 12 m | 617 µs, 630 KB por llamada | 487 µs, 373 KB |
| `planPass` vaselina a 12 m | 904 µs, 949 KB por llamada | 805 µs, 568 KB |
| Tick normal del estrés | 8,9 µs | 7,9 µs |

Ayuda, pero la mayor parte de la basura sigue en los bucles de los solvers.

### C5. Reparto del tiempo de la simulación (perfil de CPU del mundo de estrés)

| Función (tiempo total, con lo que llama) | % |
|---|---|
| `planPass` (flecha + pases que salen) | **42,5-42,6** |
| … `loftPassSpeed` / `airLaunch` / `flight` / `crossing` | 21,8 / 16,8 / 19,7-20,1 / 14,6-15,1 |
| `stepPlayer` (10) | 9,1-9,6 |
| `ballActions` (salida de pases y tiros) | 8,2-8,5 |
| `stepBall` (sub-pasos, choques) | 6,2-6,6 |
| `volleyStep` → `predictContact` | 5,2-5,4 → 4,4 |
| `planShot` (retícula y salida) | 3,1 |
| `botCommand` (3 compañeros) | 2,4 |
| `collidePlayers` (45 pares) | 2,0 |
| GC (tiempo propio) | 1,8-3,2 |

### C6. Coste por fotograma en Chromium

**(a) Régimen de 60 fps** (1/4 de resolución, ~1 tick por fotograma). Calidad media, 3 repeticiones; en ms, mediana [rango].

| Escenario | CPU | Trabajo JS: media (p95) | Sim por tick: media / p95 / máx. | Sync | Render Babylon: media (p95) | Sombra / mallas activas | HUD | Hilo principal (CDP) | Draw calls / triángulos |
|---|---|---|---|---|---|---|---|---|---|
| **3 jugadores (hoy)** | ×1 | 0,71 [0,70-0,72] (1,2) | 0,06 / 0,2 / 0,3-2,1 | 0,04 | 0,60 (0,9) | 0,16 / 0,09 | 0,01 | 1,04 | 35 / 4,7k |
| | **×4** | **1,94 [1,92-2,05] (3,3)** | 0,08 / 0,4 / 1,1-1,7 | 0,08 | 1,76 (3,1) | 0,49 / 0,25 | 0,02 | **2,72** | 35 |
| | ×6 | 2,68 [2,66-3,25] (5,1) | 0,13 / 0,6 / 1,7-2,7 | 0,12 | 2,45 (4,7) | 0,78 / 0,34 | 0,04 | 3,79 | 35 |
| **10 entidades** | ×1 | 1,14 [1,08-1,25] (3,0) | 0,11 [0,08-0,12] / 0,2 / 0,9-1,6 | 0,05 | 0,97 (2,7) | 0,27 / 0,13 | 0,01 | 1,48 | **93-95** (táctica: 95-99) / 9,7-10,5k |
| | **×4** | **3,15 [3,03-3,93] (6,5)** | **0,31 [0,21-0,36] / 0,8-1,1 / 1,9-4,6** | 0,14 | 2,80 (5,7) | 0,85 / 0,44 | 0,03 | **3,87** | 72-94 |
| | ×6 | 4,30 [4,18-4,76] (7,5) | 0,32 [0,30-0,39] / 0,9-1,4 / **7,5-13,1** | 0,16 | 3,77 (6,0) | 1,04 / 0,70 | 0,06 | 5,42 | 93-94 |

En calidad baja a 60 fps (2 repeticiones; sin sombras, 23 draw calls hoy y 41-58 con 10 entidades), a ×4: trabajo 1,55-1,70 ms (3 jugadores) y 2,28-2,77 ms (10 entidades); sim por tick 0,09-0,12 y 0,26-0,31 ms.

**(b) Resolución completa** (6-22 fps, 3-5 ticks por fotograma; infladas por SwiftShader, son cota superior). Mediana de 3 repeticiones, en ms:

| Escenario | ×1: trabajo JS (p95) | ×4: trabajo JS (p95) | ×6: trabajo JS (p95) | ×4: render Babylon (p95) | ×4: sombra | ×4: hilo principal | Draw calls |
|---|---|---|---|---|---|---|---|
| Baja, 3 jugadores | 0,95 (2,6) | 3,84 (7,8) | 5,17 (15,8) | 2,81 (7,4) | — | 6,0 | 23 |
| Baja, 10 entidades | 1,96 (4,4) | 7,14 (10,5) | 7,66 (16,4) | 5,78 (8,4) | — | 9,2 | 54-58 en táctica |
| Media, 3 jugadores | 1,82 (5,0) | 4,93 (8,7) | 8,13 (19,6) | 3,89 (6,2) | 0,75 | 7,2 | 35-37 |
| Media, 10 entidades | 2,70 (6,6) | 7,62 (12,6) | 12,15 (18,6) | 6,34 (12,1) | 1,46 | 10,2 | 93-95 |

**Otras observaciones:**
- **Draw calls:** de 3 a 10 entidades se multiplican ×2,7. Cada draw call de más cuesta ~15-20 µs de CPU a ×1 y ~20-50 µs a ×4.
- **HUD:** el estilo y el layout cuestan 0 ms en juego normal. Mientras cargas Passada o Xut, el arco del botón (la variable CSS `--charge`) cuesta 0,14-0,63 ms por fotograma, de media en la ventana.
- **Shaders compilados en mitad de la medida:** 1 en varias ventanas (la flecha, anillos), con fotogramas de 30-556 ms. Ver C8.

### C7. Perfil de CPU en Chromium (sin el sesgo del temporizador de 0,1 ms)

En ms por fotograma, calidad media; el rango es entre 3 repeticiones; la última fila, una sola.

| Escenario | CPU | Sim por tick | Render | GC | Nativo de Chrome («(program)») |
|---|---|---|---|---|---|
| 3 jugadores, resolución completa | ×1 | 0,023-0,032 | 0,77-0,90 | 0,01-0,41 | 2,0-2,9 |
| | ×4 | 0,058-0,102 | 3,3-3,9 | ~0 | 4,1-5,7 |
| 10 entidades, resolución completa | ×1 | 0,047-0,071 | 1,25-1,99 | 0,29-0,40 | 2,8-3,1 |
| | ×4 | **0,12-0,34** | 6,2-7,3 | ~0 | 4,6-6,1 |
| 3 / 10 entidades, 60 fps (1/4 de resolución, calidad baja) | ×1 | 0,059 / 0,132 | 0,42 / 0,61 | ~0 | 0,5-0,6 |
| | ×4 | 0,097 / 0,280 | 1,42 / 2,17 | ~0 | 1,0-1,4 |

- **Dentro del juego, un tick cuesta ~10× lo que mide el micro-banco de Node para el mismo mundo:** 0,06 ms frente a 6 µs con 3 jugadores, y 0,11-0,13 ms frente a 10 µs con 10 entidades, ambos a ×1.
  - Con 3-5 ticks por fotograma, la media baja (0,023-0,07 ms), porque los ticks 2 a 5 ya encuentran la caché caliente.
  - Con el bucle de render parado, `benchSim` en la misma página baja a 2,5-3,5 µs, igual que Node.
  - **Conclusión:** el sobrecoste viene de ejecutar el tick entre fotogramas de render, con las cachés frías, más la competencia por la CPU en este contenedor. En el Pixel el factor será distinto, probablemente menor, pero **multiplicar Node × 4 se queda corto**.
- El «nativo de Chrome» incluye las llamadas al proceso de GPU de SwiftShader. No es extrapolable al móvil.

### C8. Tirones de primer uso (compilación de shaders)

Babylon compila el shader de un material la primera vez que una malla con ese material se dibuja.

| Qué aparece por primera vez | Fotograma (SwiftShader) |
|---|---|
| Flecha del pase | render de **222 ms y 556 ms** (2 repeticiones) |
| Otro anillo o marcador | 30-298 ms |

Hoy hay 13 materiales que solo aparecen en mitad del juego: flecha, anillo del receptor, 4 anillos de recepción, anillos de pared y de encuentro, 3 retículas, halo de la volea y silueta de la bola. Varios comparten shader, así que cada variante nueva compila una sola vez; en las medidas, 1 compilación por ventana. En Android, Chrome guarda los programas compilados en disco, así que el tirón es sobre todo **la primera partida tras instalar o actualizar**. Pero es justo la que prueba Guillem.

### Presupuesto del fotograma (16,7 ms) en el Pixel 8a

Régimen de 60 fps, calidad media. Columnas: el modelo ×4 del repo; y como cotas, ×1 × 4 para la sim y ×6.

| Partida | Hoy (3 jugadores) | F2 (10 entidades, render de hoy) | Cota alta, 10 entidades |
|---|---|---|---|
| Sim, 1 tick (velocidad 100 %) | 0,08 | 0,21-0,36 | 0,44-0,53 (×1 × 4) |
| Sim a velocidad 140 % (1,4 ticks por fotograma) | 0,11 | 0,3-0,5 | 0,6-0,75 |
| Sim en un fotograma de recuperación (5 ticks) | 0,4 | 1,0-1,8 | 2,2-2,7 |
| **+ el tick en que sale un pase alto o un tiro alto/picado** | **+0,7-4** | **+0,7-4** (medido: máx. 1,9-4,6) | **+7-13** (×6, medido) |
| **+ cada tick con la flecha de un pase alto** | **+0,6-2,6** | igual | — |
| **Recuperación de 5 ticks con la flecha** | **6-13** | **6-13** | 10-21 (×6, medido) |
| `Renderer.sync` | 0,08 | 0,14 | 0,16 |
| `scene.render` (CPU de Babylon): media (p95) | 1,8 (3,1) | 2,8 (5,7) | 3,8 (6,0) |
| … sombra / mallas activas | 0,5 / 0,25 | 0,85 / 0,44 | 1,0 / 0,7 |
| HUD: JS / estilo y layout | 0,02 / 0 (0,1-0,6 mientras se carga un botón) | igual | igual |
| **Trabajo JS por fotograma: media (p95)** | **1,9 (3,3)** | **3,2 (6,5)** | 4,3 (7,5) |
| Hilo principal entero (CDP) | 2,7 | 3,9 | 5,4 |
| **Margen hasta 16,7 ms (media)** | **~14 ms** | **~12 ms** | ~11 ms |
| GPU (relleno con MSAA 4× a 1600×719, sombra de 1024, 93-99 draw calls) | **no medible aquí** | | |

El tick con flecha y el de un pase alto se han escalado desde el código empaquetado: 0,15-0,65 ms y 0,17-1 ms × 4.

**Lectura del presupuesto.**
- **En régimen normal sobra CPU**, incluso con 10 entidades y a ×6.
- Lo que hay que vigilar en F2:
  1. **los picos de la sim:** pases y tiros altos, la flecha y la retícula, y la recuperación;
  2. **los draw calls,** que en el Pixel cuestan sobre todo en el proceso de GPU de Chrome y en el driver, que aquí no se ve;
  3. **los tirones de primer uso;**
  4. **la GPU real.**

### Cuellos de botella previsibles en F2 (con números)

1. **IA de 10 entidades.** PLAN_F2 la estima en 50-80 µs por tick en el contenedor.
   - Hoy `botCommand` de 3 compañeros cuesta 0,64 µs por tick (2,4 % de la sim).
   - Dentro del juego, la sim cuesta ~10× el micro-banco de Node a ×1 (C7). Si la IA escala igual, serían **0,5-0,8 ms por tick a ×1 y del orden de 1-2 ms en el Pixel**: el límite de «≤ 1-2 ms por tick» de PLAN_F2, y 5× eso en un fotograma de recuperación.
   - Es una extrapolación, no una medida. Por eso **M9** (medir la IA dentro del navegador) es obligatorio desde F2a.
2. **Colisiones jugador-jugador O(n²): no son un problema.**
   - 45 pares = 1,5-1,9 µs por tick (33-41 ns por par); dentro del juego a ×4, ~0,03-0,08 ms.
   - Con 10 entidades no hace falta una fase ancha (*broad phase*).
   - Pesa más la bola contra los jugadores en sus sub-pasos: un tiro a 25 m/s con 10 jugadores cuesta 6-10 µs por tick.
3. **Predicciones de recepción y volea por jugador.**
   - `predictContact` cuesta ~2 µs por llamada y hoy se hace una vez por tick, solo para el jugador controlado.
   - Para los 10: ~20 µs por tick en Node, es decir **~0,2-0,8 ms dentro del juego**. Solo debe hacerse para el receptor de un pase en el aire, como ya dice PLAN_F2 §11.3.
   - `pickupDistance` y `receiveBall` cuestan 0,08 µs por jugador.
4. **Planificar pases altos desde la IA.**
   - Un `planPass` alto cuesta **0,33-1,9 ms** en Node/vitest (0,17-1 ms empaquetado), es decir **~0,7-4 ms por llamada en el Pixel**.
   - Comparar 4 compañeros × 2 alturas = 8 llamadas = **6-30 ms**: imposible. PLAN_F2 ya decide no usarlo para pensar y usar tablas.
   - Aun así, **cada pase alto que sale paga una llamada**: el p95 del tick «sale un pase» con 10 entidades ya es 1,04 ms en Node, y los máximos dentro del juego a ×4 son 1,9-4,6 ms.
   - Con 10 jugadores pasando habrá más pases altos por minuto que hoy: 7 altos fuertes y 3 vaselinas por minuto en el estrés.
5. **Sombras.** El pase de sombra a ×4 sube de **0,49 a 0,85 ms** con 10 entidades (0,78 → 1,04 ms a ×6). Cada jugador añade ~3,5 draw calls de sombra: cuerpo, nariz y stick.
6. **Draw calls.**
   - Pasan de **35 a 93-99** con 10 entidades: por encima del objetivo de ≤ 60 y cerca del techo de 120.
   - Hoy cada jugador tiene **sus propios materiales** (cuerpo, nariz, stick y dorsal, este con su propia `DynamicTexture`) y 5 mallas.
   - Los triángulos no son problema: ~10k de 80k.
7. **Basura y GC por tick.**
   - Juego normal: 15-21 KB por tick, con un GC menor cada 6-9 s (0,25-0,3 ms en Node; ~1 ms en el Pixel).
   - Con la flecha de un pase alto: **0,56-0,70 MB por tick**, con 4-6 GC por segundo.
   - Fuentes: `Math.hypot`, los bucles de los solvers, los cierres de `stepPlayer` y `collideGoal`, y `bladePoint`.
8. **Shaders compilados en mitad del partido** (C8). F2 añadirá materiales de equipo y de portero.
9. **Retícula del tiro mientras se carga un alto o un picado.** `planShot` se ejecuta cada tick mientras se carga Xut: **0,05-0,43 ms por tick** en Node, ~0,2-1,7 ms en el Pixel. Es el mismo patrón que la flecha.

### Mitigaciones propuestas por prioridad (ninguna aplicada)

| # | Qué | Efecto esperado | Coste y riesgo |
|---|---|---|---|
| **M1** | **No recalcular la flecha ni la retícula en cada tick.** Solo en el último tick del fotograma (el render solo lee el estado final), o solo si cambia el receptor, la altura, la carga (> 2 %) o el ángulo del stick (> 1°); si no, cada 4 ticks. | Flecha: de 0,3-0,65 ms por tick a ~0,01-0,1 ms de media. Desaparece el peor caso de la recuperación: de 6-13 ms a menos de 1 ms en el Pixel. | Bajo. Cambio técnico interno: la flecha muestra lo mismo. Sigue siendo determinista si la regla depende solo del estado. |
| **M2** | **Solvers más baratos.** Bisección de 28 a 14-16 pasos: en [1, 45] m/s, 14 mitades dan 0,003 m/s de precisión. Vuelo integrado a 1/60 s en vez de 1/120 s, o una estimación analítica con 2-3 iteraciones de secante. | Cada `planPass` o `planShot` sería 4-8× más barato: un alto fuerte quedaría en ~0,05-0,15 ms. También baja el pico de cada pase alto que sale. | Medio. Mueve los números del pase y del tiro en milímetros: hay que pasar el banco de tacto J y, si cambia, regenerar su base (decisión técnica en DECISIONS). |
| **M3** | **Tablas precalculadas** de salida del alto fuerte y de la vaselina (distancia × carga), como propone PLAN_F2 §11.1, para la IA y quizá para la flecha. | La IA nunca paga 1-4 ms por pase. | Medio. Hay que invalidarlas al cambiar números en el panel. |
| **M4** | **Cero asignaciones por tick en la sim:** `Math.hypot` → `Math.sqrt` en los bucles calientes; `bladePoint(p, out)` con un objeto reutilizado; sacar del bucle los cierres `inCut` y `clampAxis` y el `events.some(...)`. | Medido (solo `hypot`): −12-20 % de tiempo en los solvers, −40 % de basura y −11 % en el tick normal. Con todo, menos de 1 KB por tick: casi ningún GC en juego normal. | Bajo, pero cambia el último bit de algunos cálculos: banco J. |
| **M5** | **Menos draw calls por jugador:** la nariz dentro del cuerpo (colores por vértice): −1; mango y pala en una sola malla: −1; sticks y dorsales de los 10 como *thin instances*, y los dorsales en un atlas de 512 como pide docs/04: −2 por jugador; solo el cuerpo proyecta sombra: −2-3. | Con 10 entidades: de 93-99 a **~40-45** draw calls. | Medio. Es trabajo de F4 que se puede adelantar en parte en F2. Medirlo con perfStress. |
| **M6** | **Precompilar todos los materiales al cargar**, detrás del menú: `material.forceCompilation`, o un fotograma con todo visible. | Ningún tirón de 0,03-0,5 s la primera vez que aparece la flecha, un anillo o la retícula. | Bajo. |
| **M7** | **Proteger el fotograma de recuperación:** `sim.maxStepsPerFrame` de 5 a 3-4, junto con M1. | Acota la espiral: de 5 ticks × pico a 3 ticks × pico. | Bajo. Por debajo de ~45 fps el juego iría más lento en vez de saltar (hoy ya pasa por debajo de 12 fps). |
| **M8** | **Sombra:** en Medio, solo los cuerpos proyectan sombra; valorar un mapa de 512 en un preset futuro (F6). | Sombra con 10 entidades a ×4: de 0,85 a ~0,4-0,5 ms, y −20-30 draw calls. | Bajo. Es visual: decide Guillem. |
| **M9** | **Medir la IA de F2 dentro del navegador.** El `aiCostBench` de PLAN_F2 §11 debe medirse en Chromium, en régimen de 60 fps y con perfil de CPU, como C6a y C7, no solo como Node × 4. | Estimaciones realistas: dentro del juego el factor es ~10× Node. | Bajo. Se reutiliza `perfStress.spec.ts`. |
| **M10** | **Calibrar en el Pixel real** con una URL de depuración (`?debug=1&stress=10`) que meta las 10 entidades de este test. Guillem apunta los fps, el «cpu avg» y el p95 del panel. | Convierte las estimaciones ×4 y ×6 en datos del Pixel, incluida la GPU, que aquí no se puede medir. | Bajo. 5 minutos de Guillem. |

### ¿Se sostienen las cifras de PLAN_F2?

| Afirmación de PLAN_F2 (rama principal) | Medido aquí | Veredicto |
|---|---|---|
| `planPass` alto fuerte 0,55-1,13 ms (6-16 m), vaselina 0,68-1,93 ms; «~1 ms» por planificación de un pase alto | **Alto fuerte:** carga 0, 0,33-0,66 ms; carga 1, 0,47-1,10 ms (6-16 m); 1,1-1,9 ms a 25 m. **Vaselina:** 0,57-1,04 ms (6-16 m) y 1,24-1,28 ms a 25 m (vitest). Empaquetado como en producción: la mitad. | **Se sostiene** como orden de magnitud y como techo del contenedor. En el código real es ~0,17-1 ms por llamada, es decir **~0,7-4 ms en el Pixel**. |
| La flecha recalcula `planPass` cada tick con Passada: ~0,6-1,9 ms por tick | **Node:** media 0,52 ms por tick (alto fuerte) y 0,65 ms (vaselina), p95 0,72-1,03 ms. **Chromium ×4:** 0,64-0,77 ms por tick de media, picos de 3,7 ms. | **Confirmado.** Es el pico de sim más claro de hoy (M1). |
| `stepWorld` con 3 jugadores 7-8 µs; con 10 jugadores 11-17 µs | 3 jugadores: 8,2 µs de media (p50 5,9) en ticks normales. 10 entidades: 11,4 µs (p50 10,1). Con pases y flechas: 19-24 µs. | **Se sostiene en Node.** |
| Física de hoy con 10 jugadores en el Pixel: 0,05-0,07 ms (Node × 4) | Dentro del juego, a 60 fps: **0,21-0,36 ms por tick a ×4** (0,08-0,12 ms a ×1); el perfil de CPU da 0,28 ms. | **No se sostiene: es 3-6× más.** Medir Node × 4 se queda corto (C7). |
| IA en total, 0,2-0,35 ms por tick en el Pixel («0,2-0,4 ms») | No hay IA que medir. Con el factor medido para la sim de hoy, serían ~1-2 ms. | **Optimista.** Debe medirse en el navegador desde F2a (M9). |
| Objetivo de F2: p95 ≤ 0,5 ms y máx. ≤ 1 ms por tick a ×4 | Hoy, **sin IA**, con 10 entidades: p95 0,8-1,1 ms y máx. 1,9-4,6 ms. Con 3 jugadores: p95 0,35-0,40 ms y máx. 1,1-1,7 ms. | **Ya se supera hoy**, por los picos de `planPass` y `planShot`. Con M1-M3 debería cumplirse. |
| `predictContact` 2 µs; `pressureOn` 0,3 µs | 1,84-2,11 µs; 0,21-0,23 µs. | Se sostiene. |

### Cómo reproducir

| Medida | Comando | Duración aproximada |
|---|---|---|
| Sim (C1-C5) | `PATINS_BENCH=1 npx vitest run tests/unit/bench/perfBench.test.ts --reporter=verbose --maxWorkers=1`. Líneas `TICK`, `TICKCAT`, `ACT`, `BENCHSIM`, `CALL`, `ARROW`, `ALLOC`, `WHATIF` y `PROF`. | ~15 s |
| Render (C3, C6-C8) | `npm run build && PATINS_PERF=1 npx playwright test tests/e2e/perfStress.spec.ts`. Líneas `STRESS` (calidades `low`, `medium`, `low@1/4` y `medium@1/4`), `PROFILE`, `ARROW` y `REF`; JSON en `test-results/perfStress-*.json`. | ~6 min |

- Para el render usé una copia de `playwright.config.ts` con otro puerto (4291), porque otros agentes podían tener su `vite preview` en el 4173.
- Sin `PATINS_BENCH` o `PATINS_PERF` los dos ficheros se saltan: CI y `npm test` no cambian.

**Lo que no se ha podido medir:**
- el tiempo de GPU del Pixel (relleno con MSAA 4× a 1600×719, sombra de 1024, coste de los draw calls en el driver);
- la caída por temperatura tras varios minutos;
- el factor real de CPU del Pixel frente al contenedor.

Todo eso lo resuelve M10.

## §D Auditoría de la documentación

Base: código fusionado de la **v0.1.29** (commit `00fc599`). Se han comparado `docs/01`-`06`, `CLAUDE.md`, `CREDITS.md`, `docs/ASSETS_SPEC.md`, `docs/REFERENCIA_PARTIDOS.md`, `docs/DECISIONS.md` y `docs/PROGRESS.md` con `src/`, `src/config/tuning.ts`, los tests, `package.json`, `vite.config.ts` y `.github/workflows/deploy.yml`. **No se cambia ninguna decisión ni ningún archivo**: solo se proponen textos para los documentos.

Gravedad: **Alta** = un número o una regla de juego que dice lo contrario que el código y puede llevar a una prueba o un plan equivocados; **Media** = una función descrita como hecha que no existe (o al revés), o una contradicción que hay que resolver en un plan; **Baja** = redacción, nombres, fechas o detalles.

Comprobaciones hechas que **cuadran** (no se repiten abajo): todos los parámetros entre comillas invertidas de `docs/03` existen en `tuning.ts` y su valor citado coincide, salvo los de la tabla D.1; ángulos convertidos (p. ej. `shot.mediumAimRange` 0,4712 rad = 27°, `assist.spaceCone` 0,9 rad = 52°, `cut.minAngle`/`skating.brakeAngle` = 60°/126°); radio de giro mínimo 0,35 + 0,12·8,4² = 8,8 m (≈ «~9 m», 03:8); 0 → 90 % en ~1,5 s (test `tests/unit/skating.test.ts:63`); versiones de `package.json` (TS ~5.9, Vite 8.3.2, Vitest 5.0.3, Babylon 9.29.0, vite-plugin-pwa 1.3.0, Playwright 1.56.1) = DECISIONS:5-6; CI de `deploy.yml` (build + Vitest + Playwright en cada rama, Pages solo desde `main`) = DECISIONS:10 y docs/05:73; PWA (`autoUpdate`, `fullscreen`, `landscape`, base `/hockey-game/`) = DECISIONS:8 y :11; presets de cámara (TV 10 m / 21 m, Táctica 26 m / 14 m / 46°) = docs/03:126 y DECISIONS:47; calidad (bajo/medio/alto, medio por defecto) = DECISIONS:23; ajustes de Configuració (`src/ui/settings.ts:7-25`: idioma ca, cámara, asistencia Mitjana, flecha, retícula, vibración, modo afinació) = docs/03; i18n con las mismas 415 líneas en ca/es/en; presupuestos «techo duro» de docs/04 comprobados en `tests/e2e/perf.spec.ts:36-39`.

Algunas cifras se han medido con `planPass` (`src/sim/pass.ts:502`) sin error humano, receptor quieto, Mitjana: alto fuerte a 8 / 12 / 16 / 20 / 25 / 30 m entre jugadores → sale a 12,9 / 15,5 / 19,1 / 19,2 / 20,0 / 20,0 m/s, punto más alto 0,71 / 1,01 / 1,20 / 1,26 / 2,07 / 3,54 m, «por el aire» (`air`) 1 / 1 / 1 / 0 / 0 / 0; con la asistencia Desactivada el raso sale a 18,0 m/s a cualquier distancia (sin receptor).

### D.1 Documentos ↔ código

| # | Doc:línea | Lo que dice | Lo que hace el código (archivo:línea / valor) | Corrección propuesta del doc (texto) | Gravedad |
|---|---|---|---|---|---|
| D1 | docs/03:57 | Hasta el umbral de sprint «la velocidad sube de 0 a la máxima normal (7,5 m/s)»; desde el umbral «sprint (~9 m/s)». | `skating.maxSpeed` **8,4** y `skating.sprintSpeed` **12,6** (tuning.ts:82-83); con bola `dribble.sprintSpeedWithBall` **9,3** (tuning.ts:240). Valores de la ronda 1 (DECISIONS:57, :61). La propia docs/03:8 ya dice 8,4 / 12,6 / 9,3. | «…la velocidad sube de 0 a la máxima normal (**8,4 m/s**, `skating.maxSpeed`)… desde el umbral = **sprint** (**12,6 m/s** sin bola, `skating.sprintSpeed`; **9,3 m/s** con bola, `dribble.sprintSpeedWithBall`).» | Alta |
| D2 | docs/03:24 | Alto fuerte: altura máxima «~0,8 m», cae «1 m antes del receptor», «máximo 28 m/s», «sale a 28 m/s» si no llega; «se mantiene bajo (≤ 0,9 m) hasta ~20 m y sube algo más lejos (~1,5 m a 30 m)». | Desde la v0.1.17: `pass.driveMaxHeight` **1,2** m, `driveMaxSpeed` **20** m/s, `driveChargeMaxSpeed` 26, `driveLandShort` **1,5** m (tuning.ts:380-384; DECISIONS:92). Desde la v0.1.28, hasta 16,5 m llega por el aire (`driveAir*`, tuning.ts:396-400). Medido: a 20 m sube 1,26 m, a 25 m **2,07 m**, a 30 m **3,54 m** (DECISIONS:92 decía «sube 4 m» a 30 m; docs/02:119 mide 1,89 m de media a 25 m). Contradice también docs/03:59, que sí está al día. | «Es **balística real**: al soltar se calcula el ángulo de salida para que la altura máxima sea ~1,2 m (`pass.driveMaxHeight`; nunca más empinado que 25°, `driveLaunchAngle`) y la velocidad para que caiga 1,5 m antes del receptor (`driveLandShort`; máximo 20 m/s, `driveMaxSpeed`; cargado hasta 26 m/s, `driveChargeMaxSpeed`); si no llega ni a la velocidad máxima, sale a 20 m/s con el ángulo justo un poco más alto. **Hasta 16,5 m le llega por el aire** (ver abajo). Más lejos sube más: ~1,3 m a 20 m, ~2 m a 25 m, ~3,5 m a 30 m (pasa de 1,50 m: ver docs/02 «Choques con el juego actual»).» | Alta |
| D3 | docs/03:87 | Desactivada: «el pase va exactamente donde apuntas, raso a fuerza fija (**14 m/s**)». | Con Desactivada el cono es 0 (pass.ts:64), no hay receptor y el raso sale a `pass.groundNoTargetSpeed` **18 m/s** (pass.ts:634, tuning.ts:371), hasta 30 m/s cargado. Medido: 18,0 m/s. docs/03:59 ya dice «Sin receptor: raso a 18 m/s». | «Desactivada: el pase va exactamente donde apuntas, raso a fuerza fija (**18 m/s**, `pass.groundNoTargetSpeed`; cargado, hasta 30 m/s); nadie es "receptor" de antemano.» | Media |
| D4 | docs/03:75 (y DECISIONS:134 a) | v0.1.29: el joystick solo apunta «también **desde que sale un alto fuerte dirigido a ti**», sin límite de distancia. | `aerialPass` exige `world.passAir > 0` (world.ts:453), y `passAir` = `plan.air` (world.ts:703), que vale 0 a partir de `pass.driveAirEnd` **16,5 m** hasta el stick (pass.ts:443-448, tuning.ts:399-400) y siempre que `driveAirHeight` = 0. Medido: `air` = 1 a 16-17 m entre jugadores, 0 a 20 m. Un alto fuerte largo sigue soltándose si giras el joystick más de 45° mientras vuela (el fallo de la v0.1.28) hasta que su trayectoria pasa por la pala. | «Desde la v0.1.29 también desde que sale un alto fuerte dirigido a ti **que te llega por el aire (a menos de 16,5 m de tu stick, `pass.driveAirEnd`)**; un alto fuerte más largo, que llega botando, solo cuenta cuando su trayectoria ya pasa por tu pala, como antes.» (Ampliarlo al largo es un cambio de juego: decide el agente principal / Guillem.) | Media |
| D5 | DECISIONS:130 (entrada v0.1.27) | «`highPenalty` 0,5 por encima de `idealHigh` 0,7 m». | `volley.highPenalty` = **0,1** (tuning.ts:477) desde la v0.1.28 (commit `7ce7db7`: `-highPenalty: 0.5` → `+highPenalty: 0.1`). La entrada de la v0.1.28 (DECISIONS:133) no lo dice: solo cita `receive.highPenalty` 0,1, que es **otro** parámetro. Además `maxHeight` pasó de 1,05 a 1,50 m, así que la rampa (volley.ts:125) suma como mucho +0,1 a 1,50 m. docs/03:75 nombra el parámetro sin valor. | Añadir (sin reescribir la entrada vieja) una línea nueva en DECISIONS: «2026-10-09 (v0.1.28, anotado en la auditoría de la v0.1.29): `volley.highPenalty` 0,5 → **0,1** (con `volley.maxHeight` 1,50 m, un contacto alto suma como mucho +0,1 a la dificultad; uno bajo, `lowPenalty`, hasta +0,5). No se anotó al hacerlo.» y en docs/03:75: «…lo ideal es 0,3-0,7 m; más baja cuesta más (+0,5 a 0,15 m) y más alta un poco (+0,1 a 1,50 m)…». | Media |
| D6 | docs/03:3 | Los números de tuning «se pueden tocar en vivo desde un panel de debug (**solo en build de desarrollo**)». | El panel ⚙ funciona en la versión publicada: se ve con Configuració → «Mode afinació» o con `?debug=1` (main.ts:168-169; debugPanel.ts:6-7; DECISIONS:39). Guillem afina en el Pixel con el build de Pages. docs/03:136 ya dice «panel de afinación del móvil». | «…Viven en `src/config/tuning.ts` y se tocan en vivo desde el **panel de afinación ⚙** (Configuració → Mode afinació, o `?debug=1`), también en la versión publicada; los cambios se guardan en el móvil hasta "Restablir".» | Media |
| D7 | docs/03:54, :94 | «Controles (**dos esquemas, seleccionables y combinables**)»; esquema B de gestos (deslizar = pase/tiro, doble toque = regate). | No hay esquema B: ningún ajuste lo elige (settings.ts:7-22) ni hay entrada de gestos aparte del arrastre de altura (`src/input/passGesture.ts`). Es F1.7 (docs/06:136, PROGRESS:73). | Título: «## 3. Controles (esquema A hecho; esquema B de gestos: F1.7, sin hacer)»; en §B: «*(F1.7, sin hacer; ver la contradicción C3 de la auditoría antes de diseñarlo.)*». | Media |
| D8 | docs/03:76 | «REGATE: pulsar = finta/regate contextual según dirección (sale al pulsar).» (presente) | El botón Regat existe (actionButtons.ts:51) pero solo llena un búfer que nadie lee (`bufDribble`, dribble.ts:208; no hay más usos en `src/`). No hace nada. | «REGATE (F1.6, **aún sin hacer**: hoy el botón no hace nada): pulsar = finta/regate contextual…» | Media |
| D9 | docs/03:101 | «Vibración háptica corta… en tiro, gol, choque y poste. Desactivable.» seguido de «los demás momentos, candidatos… a decidir por Guillem». | Solo vibra el remate en el aire con timing bueno (`haptics.*`, tuning.ts:71-75; main.ts:100-106; `src/game/volleyFeedback.ts`). Tiro, gol, choque y poste no. | «Vibración háptica corta (Vibration API), desactivable (Configuració → Vibració). **Hecho (v0.1.29):** remate en el aire con timing perfecto. **Candidatos, a decidir por Guillem** (DECISIONS 2026-10-09): tiro cargado al máximo, gol, poste/larguero, primer toque perfecto…» | Baja |
| D10 | docs/03:19 | Bola: «rodadura, fricción, **giro**». | No hay giro/efecto de la bola en `src/sim/ball.ts` (ni `spin` ni velocidad angular); el efecto se descartó en la v0.1.13 (DECISIONS:72, «opción B, fuerzas de efecto»). | «Física 3D propia: posición con altura (z), rodadura, fricción y botes; sin efecto (giro) por ahora.» | Baja |
| D11 | docs/03:15-16 | Contacto «según Físico»; Resistencia que el sprint gasta. | No hay atributos Físico ni Resistencia: `PlayerState` solo tiene `control`, `passing`, `shotAccuracy`, `shotPower` (player.ts:27-45); choques entre jugadores con masas iguales (DECISIONS:27). | Añadir «(F2)» a las dos líneas. | Baja |
| D12 | docs/03:13 | El derrape «gira **un poco** el cuerpo hacia el lado del derrape». | `skating.skidBodyTurn` = 1,274 rad = **73°** (tuning.ts:102; ronda 1, DECISIONS:61; antes 34°, DECISIONS:59). | «…y gira el cuerpo hacia el lado del derrape (hasta ~73°, `skating.skidBodyTurn`).» | Baja |
| D13 | docs/03:25 | Arco del alto fuerte «cuyo punto más alto es ~1,2 m (`driveAirApex`)». | `pass.driveAirApex` = **1,15** (tuning.ts:397); es la estimación sin aire, el real ~1,2 m (DECISIONS:133; medido 1,20 m a 16 m). | «…~1,2 m (`driveAirApex` 1,15, estimación sin aire)…» | Baja |
| D14 | docs/03:84 | Con «El control passa al receptor» = No, «el compañero te devuelve la bola a los 0,5 s». | Si vas a más de 3 m/s la devuelve a los 0,1 s (`mates.quickReturn*`, tuning.ts:687-689), como dice la propia docs/03:50. | «…con No, sigues con tu jugador y el compañero te devuelve la bola (a los 0,5 s; a los 0,1 s si sigues corriendo, ver «Devolución rápida»), del mismo tipo…» | Baja |
| D15 | docs/03:86-90 | Niveles «Desactivada / Ligera / **Mitjana** / Fuerte» (mezcla castellano y catalán). | UI ca: Desactivada / Lleugera / Mitjana / Forta (ca.json:345-348); es: Desactivada / Ligera / Media / Fuerte (es.json:345-348). El resto de docs/03 usa Lleugera/Forta. | Usar siempre los nombres catalanes de la UI: «Desactivada / Lleugera / Mitjana / Forta». | Baja |
| D16 | docs/03:89 | Mitjana «corrige el 85 %». | Para el alto fuerte, **95 %** desde la v0.1.29 (`pass.driveMediumCorrection`, tuning.ts:441); docs/03:26 lo dice. | «…cono ±34°, corrige el 85 % (el alto fuerte, el 95 %, `pass.driveMediumCorrection`)…» | Baja |
| D17 | docs/05:69 | Babylon.js «(core, loaders, GUI si conviene)». | Solo `@babylonjs/core` ^9.29.0 (package.json:16). | «Babylon.js (`@babylonjs/core` con imports profundos; loaders y GUI cuando haga falta)». | Baja |
| D18 | docs/05:72 | «Persistencia local: IndexedDB (ligas, carrera, ajustes)». | Ajustes y afinación en `localStorage` (`patins.settings.v1`, settings.ts:24; `patins.tuning.v1`, main.ts:39). DECISIONS:29: IndexedDB en F5, migrando los ajustes. | «Persistencia local: hoy `localStorage` (ajustes y afinación); IndexedDB en F5 (ligas, carrera), migrando los ajustes, con exportar/importar partida.» | Baja |
| D19 | docs/05:101 | Panel de debug con «estado de IA, hitboxes, tuning en vivo», con `?debug=1`. | `?debug=1` muestra fps, frame, cpu/gpu, ticks, draw calls, triángulos y resolución (debugPanel.ts:16-30); el tuning en vivo es el panel ⚙ (Mode afinació o `?debug=1`); IA e hitboxes no existen aún. | «Debug primero: `?debug=1` = estadísticas (fps, frame time, draw calls, resolución); panel ⚙ de afinación en vivo (Mode afinació); estado de IA e hitboxes cuando haya IA (F2).» | Baja |
| D20 | docs/05:102, docs/04:57 | «Autodetección de preset, escalado de resolución dinámico (si baja de 55 fps)». | Sin autodetección ni escalado: calidad «medio» por defecto y `?quality=` (quality.ts:1-3, :79); DECISIONS:23 lo deja para F6. | Añadir «(F6; hoy: Mitjana por defecto y `?quality=`)». | Baja |
| D21 | docs/05:108-110 | Tests mínimos: unit + e2e. | No menciona los **bancos** (`tests/unit/bench/*.test.ts`, solo con `PATINS_BENCH=1`, si no `describe.skip`, p. ej. passBench.test.ts:19), ni `simPurity`, ni `perf.spec`, ni que CI corre typecheck + build + Vitest + Playwright (deploy.yml). | Añadir: «Bancos de tacto (no son tests): `PATINS_BENCH=1 npx vitest run tests/unit/bench/<nombre>`. Guardas: `simPurity` (regla 3), `tuningMeta` (todo número tiene meta y etiqueta), `perf.spec` (CPU ×4, techos de docs/04). CI: typecheck + build, Vitest y Playwright en cada push.» | Baja |
| D22 | docs/05:113 | «URL: https://<usuario>.github.io/<repo>/». | `https://manrou6.github.io/hockey-game/` (README.md:5; base `/hockey-game/`, vite.config.ts:10). | Poner la URL real. | Baja |
| D23 | docs/05:89-93 | `config/ tuning.ts, quality presets`; `public/assets/ … (con CREDITS.md)`. | `src/config` también tiene `rink.ts`, `tuningMeta.ts`, `version.ts`, `controlsLayout.ts`; `public/assets/` solo `.gitkeep`; `CREDITS.md` está en la raíz. | «config/ tuning.ts + tuningMeta.ts (rangos del panel), rink.ts (medidas de reglamento), quality.ts, version.ts»; «public/assets/ … (registrados en /CREDITS.md)». | Baja |
| D24 | docs/02:62-64 | Línea de gol-valla (~2,8 m), área 9 × 5,4 m, penalti 5,4 m y directa 7,4 m marcados **[VERIFICAR]**. | DECISIONS:20 los da por confirmados (reglas WS; se usa 2,8 dentro de 2,70-3,30) y rink.ts:14-29 los marca «(WS)». | Quitar [VERIFICAR] de esas cuatro medidas y añadir «(confirmado, reglas WS; DECISIONS 2026-10-02)»; dejarlo en radio de esquina, altura de valla y fondo de portería. | Baja |
| D25 | docs/02:117 | «Choques con el juego actual (**v0.1.28**…)». | Sigue igual en la v0.1.29 (la v0.1.29 no cambia alturas). | «(v0.1.29; …)». | Baja |
| D26 | CLAUDE.md regla 4 | «Todo número de "game feel" va en `src/config/tuning.ts`». | Fuera de tuning: sprint del mando al 95 % del stick (`GAMEPAD_SPRINT_TRAVEL`, gamepad.ts:10), doble U = vaselina en 350 ms (`DOUBLE_TAP_MS`, keyboard.ts:4), inclinación máxima del arrastre 85° (`MAX_LEAN`, passGesture.ts:20). | Bloque 2 no toca código: anotar en DECISIONS «constantes de entrada fuera de tuning (95 %, 350 ms, 85°): pasar a `tuning.input` en un paso técnico» o moverlas en la v0.1.30 (§E). | Baja |
| D27 | CREDITS.md:14 | «none yet — all **F0** visuals are generated by code». | Sigue siendo cierto en F1 (no hay assets de terceros; `public/assets/` vacío). | «…all visuals so far (F0-F1) are generated by code». | Baja |

### D.2 Contradicciones entre docs/03, DECISIONS, PROGRESS y ROADMAP

| # | Dónde | Contradicción | Cuál parece vigente (y por qué) | Propuesta (solo texto) |
|---|---|---|---|---|
| C1 | docs/03:112 y :116 ↔ DECISIONS:128-129 ↔ PROGRESS:15 | docs/03 da el **doble toque** como alternativa de aixecar «si choca con los regates». DECISIONS:128 dice que el doble toque (C) tiene **el mismo conflicto** y recomienda **B** (el regate sale al pulsar y se convierte en aixecar si el dedo se arrastra en diagonal en ~0,1 s); DECISIONS:129: Guillem **se inclina por B**. PROGRESS:15 habla a la vez de «gesto opción A» y «gesto de aixecar (opción B)»: son **dos juegos de opciones distintos** con las mismas letras (DECISIONS:128, aixecar contra regate; DECISIONS:134, gesto de arrastre del remate). | DECISIONS:129 (2026-10-08, posterior a lo escrito en docs/03 §4); decisión formal pendiente del plan de F1.6. | docs/03:112, columna Input: «Arrastre en diagonal arriba-derecha sobre REGATE; cómo convive con los regates: opciones A/B/C de DECISIONS (2026-10-08), Guillem se inclina por B». Nombrar los dos juegos de opciones de forma distinta en todos los docs: «Aixecar-A/B/C» y «Gesto de remate-A/B/C». |
| C2 | docs/03:77 ↔ docs/03:83, DECISIONS:67, :92 ↔ docs/03:33, :60, :73 | En defensa «PASE → cambiar jugador, TIRO → entrada/robo». Pero (a) cambiar de jugador ya es el botón **Canvi** / Q / Y y el cambio automático (v0.1.17; docs/03:83 «En F2 se reutilizará en defensa»; DECISIONS:67 «botón Canvi, configurable»); (b) PASE y Xut **sin bola** ya hacen otra cosa: esperan en el búfer y salen como pase o tiro **al primer toque** (docs/03:33, :60, :73). | Canvi para cambiar (implementado: actionButtons.ts:30-54, gamepad.ts:53, keyboard.ts:30). Qué hacen PASE/Xut sin bola cuando defiende tu equipo: **sin decidir** (F2). | docs/03:77: «En defensa (F2, sin decidir): Canvi cambia de jugador (como en ataque); qué hacen PASE y TIRO sin bola cuando el rival la tiene (entrada/robo, presión) se decide en el plan de F2, sin romper el primer toque cuando la bola es de tu equipo. REGATE mantenido → presionar (choca con aixecar si este es un arrastre sobre REGATE: ver C1).» |
| C3 | docs/03:94 ↔ DECISIONS:134 ↔ docs/03:112 | El pulgar derecho tendría tres lenguajes: esquema B (deslizar largo hacia la portería = tiro, **longitud = potencia**; **doble toque = regate**), gesto de remate A (deslizar desde la zona libre, **longitud = altura**) y doble toque como alternativa de **aixecar**. | Ninguno decidido: esquema B es F1.7, el gesto del remate se decide en el plan de F1.6 (docs/06:139). | En docs/03 §B: «Antes de diseñarlo, unificar con el gesto de remate (DECISIONS 2026-10-09) y con aixecar: el mismo deslizamiento no puede significar potencia en un sitio y altura en otro, ni el doble toque regate y aixecar.» |
| C4 | docs/03:75, DECISIONS:134 (a) ↔ world.ts:453 | «El joystick solo apunta desde que sale un alto fuerte dirigido a ti» frente a solo los que llegan por el aire (< 16,5 m). | El código (ver D4). | Texto de D4. |
| C5 | DECISIONS:130 ↔ DECISIONS:133 ↔ tuning.ts:477 | `volley.highPenalty` 0,5 (v0.1.27) frente a 0,1 en el código desde la v0.1.28 sin anotar. | El código (0,1). | Texto de D5. Confirmar que fue intencionado (técnico: decide el agente principal). |
| C6 | DECISIONS:197-235 ↔ DECISIONS:130, :132-133 ↔ tuning.ts:465-469 ↔ docs/03:75 | La sección «Plan F1.5d (propuesta, sin aplicar)» sigue con ventana **0,30 s**, timing bueno **±0,05 s**, contacto 0,15-**1,05 m**, alcance **0,65 m**. Lo aplicado: 0,4 s, ±0,08 s, 0,15-1,50 m, `volley.reach` 0,75 m. | El código y docs/03:75 (v0.1.27 con los valores generosos que aprobó Guillem; v0.1.28 con 0,15-1,50 m). | Título: «## Plan F1.5d — remate en el aire / volea (histórico: plan del 2026-10-08; lo aplicado en la v0.1.27-v0.1.28 usa ventana 0,4 s, ±0,08 s, 0,15-1,50 m y alcance 0,75 m; ver docs/03 §3)». |
| C7 | PROGRESS:8 ↔ git (`00fc599`, «(#34)») | FASE 1 v0.1.29 sin marcar: «Falta: PR + CI + fusión + informe». | La v0.1.29 está fusionada (el bloque 2 trabaja sobre ella). | Marcar [x] y dejar solo lo que falte de verdad (informe a Guillem, si no se ha mandado). |
| C8 | PROGRESS:71, :78 ↔ PROGRESS:70, docs/06:139 | «el cierre de F1.5 se aplaza… (prueba de la **v0.1.28**)»; cabecera «siguiente: prueba de Guillem de la **v0.1.28**». | v0.1.29 (PROGRESS:70: «Pendiente: prueba de Guillem»). | Cambiar a «v0.1.29» en las dos. |
| C9 | PROGRESS:73 ↔ docs/06:136, docs/03:101 ↔ DECISIONS:28, :51 | F1.7 incluye «vibración, **mando**». La vibración del remate ya está (v0.1.29) y el mando funciona desde F0.5/F1.3 (`src/input/gamepad.ts`). | docs/06:136 (vibración parcial hecha) y el código. | «F1.7 Gestos (esquema B), editor de botones, resto de vibraciones (candidatos en DECISIONS), pantalla de controles (el mando ya funciona)». |
| C10 | docs/01:21 ↔ docs/06:140 ↔ PROGRESS:75 | Entrenamiento: «retos: conducción, regate de conos, tiro a zonas, **directas**» frente a «3 retos (conos, tiro a zonas, **regatear a un defensa estático**)». | docs/06 (criterio de la fase) y PROGRESS. Las directas son F3. | docs/01:21: «Pista libre + retos (F1: conos, tiro a zonas, regatear a un defensa estático; directas en F3)». |
| C11 | docs/01:48 ↔ docs/03:86 | La dificultad «afecta a… la asistencia al pase/tiro»; pero la asistencia es un ajuste propio de 4 niveles en Configuració (settings.ts:15), sin dificultad todavía. | docs/03 (implementado). | docs/01:48: «…afecta a IA táctica y reacción del portero; la asistencia al pase/tiro es un ajuste aparte (Configuració), que la dificultad podrá fijar por defecto (a decidir en F2/F6)». |
| C12 | DECISIONS:28, :51, PROGRESS:31 ↔ DECISIONS:54 (entrada extra 3: «Regat mantenido = sprint») | Las entradas de F0/F1.3 dicen «REGATE… **mantener = sprint**» y «teclado… Shift **o L**» sin marca de sustituido; DECISIONS:54 (v0.1.5) lo quita. En docs/03 solo queda como historia y es correcto (03:57 «antes el sprint era REGATE mantenido»). Restos fuera de docs: `tests/e2e/smoke.spec.ts:23, 29, 33` mantiene `#btn-dribble` como si fuera el sprint («sprinting half the time»): no hace nada desde la v0.1.5 y, con el joystick a 55 px de 60 (umbral 90 %), el test **nunca esprinta**; `src/main.ts:163` comenta «sprint button». Además docs/03:77 y :111 reservan «mantener REGATE» para presionar y para la vaselina-regate, que compiten con aixecar (C1). | DECISIONS:54 y el código: REGATE sale al pulsar y no esprinta (actionButtons.ts:24). | PROGRESS:31 y DECISIONS:28/:51: añadir «(sustituido en la v0.1.5: sprint en el joystick, DECISIONS ronda 1)». Para el test y el comentario (fuera de docs): anotarlo en la lista de §E; si se quiere cubrir el sprint en el smoke test, empujar el joystick ≥ 90 % (≥ 54 px). |
| C13 | docs/03:8 ↔ :57; docs/03:24 ↔ :59 ↔ docs/02:119; docs/03:87 ↔ :59; docs/03:84 ↔ :50 | Contradicciones dentro de docs/03 (las de D1, D2, D3 y D14). | La línea que coincide con el código (03:8, 03:59, 03:50). | Textos de D1, D2, D3 y D14. |
| C14 | docs/05:72 ↔ DECISIONS:29; docs/02:62-64 ↔ DECISIONS:20; docs/05:102 ↔ DECISIONS:23 | Ver D18, D24 y D20. | DECISIONS (fechadas y aplicadas en el código). | Textos de D18, D24 y D20. |

### D.3 Pasajes desfasados que conviene recortar o marcar

| Dónde | Por qué |
|---|---|
| PROGRESS:130-134 («Notas para la siguiente sesión») | Son de F0: «Próximo paso: F1 en modo plan». Una sesión nueva puede seguirlas (regla 8 de CLAUDE.md). Sustituir por el paso siguiente real (prueba de la v0.1.29 → cierre de F1.5 → plan de F1.6). |
| PROGRESS:92 | Rama de trabajo de F0 (`ccr-c510413a-rbn6hg`), ya no se usa. |
| PROGRESS:41-70 (colas «Pendiente: …» de entradas cerradas: 45, 47, 49, 50, 51, 63-69) | F1.4 está cerrada (PROGRESS:40) y cada versión deja su «Pendiente: prueba de Guillem» aunque la siguiente ya la superó; PROGRESS:63 dice que «respetar el apuntado» queda **apagado**, pero desde la v0.1.23 está al 100 % (PROGRESS:64). Quitar las colas o añadir «(resuelto en vX)». |
| PROGRESS:78 (cabecera del Plan F1.5) | Lista de versiones y «siguiente: prueba de la v0.1.28» (ver C8). |
| DECISIONS:197-235 | Plan F1.5d con valores que no se aplicaron (ver C6). |
| DECISIONS (todo el archivo) | Es un registro: muchas entradas viejas tienen valores sustituidos sin marca (p. ej. :54 7,5 / 9 m/s; :58 empujón +9 m/s²; :59 cuerpo 34°; :72 vuelo guiado; :88 `driveMaxSpeed` 28; :128 altura máxima 1,05 m; :130 `highPenalty` 0,5). Propuesta mínima, sin reescribir el registro: una línea al principio «Registro histórico: las entradas no se corrigen; los valores vigentes están en `src/config/tuning.ts` y docs/03». |
| docs/03:24 | Párrafo del alto fuerte con números de la v0.1.15 (ver D2): reescribir. |
| docs/03:111 (regate «Vaselina») | La propia fila dice que la cubre aixecar (F1.6): quitarla cuando se decida C1, para no dejar otro uso de «mantener REGATE». |
| docs/03:40, :42, :62, :72, :75 (mediciones largas) | Las mismas cifras están, más completas, en DECISIONS:118-120, :121, :124, :130-135. docs/03 debería dejar el diseño y la última cifra clave con un enlace; hoy la línea 75 tiene ~5 000 caracteres y mezcla diseño, ajustes y bancos de tres versiones. |
| REFERENCIA_PARTIDOS:90-91 | «Afinación del pase (ahora, v0.1.21)» y F1.5 «Plan de F1.5: diré cuáles incorporo»: F1.5a-e ya están hechas y la lista de lo que entró está en PROGRESS:80. |
| Comentarios de código y textos desfasados (fuera de docs; para §E, sin tocar en el bloque 2) | tuning.ts:548 «(Desactivada / Ligera / Fuerte)» (son 4 niveles); tuning.ts:600 «Ligera / Fuerta»; tuning.ts:352-353 «Pase attribute modulates them… in F2» (`passing` ya se usa, pass.ts:274); tuning.ts:356-357 «slide up» (es arrastre diagonal); **tuning.ts:711-713 «up-left = driven lofted, up-right = lob»** (al revés desde la v0.1.20: passGesture.ts:16 `dx > 0 ? 1 : 2`); feel.ts:10 «shooting» (hoy `shotAccuracy`/`shotPower`); main.ts:163 «sprint button»; smoke.spec.ts:23-33 (C12); la ayuda del menú (`menu.controlsHint`, es.json:7) no menciona Canvi/Q ni las alturas (U, arrastre). |

### D.4 Lo que tiene que decidir el agente principal (o Guillem)

1. **D5 / C5** — `volley.highPenalty` 0,5 → 0,1 sin anotar: confirmar que fue intencionado y anotarlo en DECISIONS (técnico, agente principal).
2. **D4 / C4** — «el joystick solo apunta» solo con altos fuertes de < 16,5 m: o se corrige el texto (bloque 2), o se amplía al alto fuerte largo en la v0.1.30 (cambia el juego: Guillem).
3. **C2** — qué hacen PASE y TIRO sin bola cuando defiende tu equipo (el primer toque ya los usa): para el plan de F2.
4. **C1 / C3** — un solo lenguaje para el pulgar derecho (aixecar sobre REGATE, gesto de remate, esquema B): para el plan de F1.6; y renombrar las dos series de opciones A/B/C.
5. **C12** — el smoke test e2e cree que esprinta con Regat y no lo hace: arreglo solo de test (agente principal, fuera del bloque 2 si no se quiere tocar tests).

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

## §I Actualización de la PWA

Auditoría sobre el código de la v0.1.29 (commit 00fc599). No cambia el juego: solo este documento y un experimento
Playwright que se salta por defecto (`tests/e2e/pwaUpdate.spec.ts`, se ejecuta solo con `PATINS_PWA=1`).

**Resumen.** Lo que se sospechaba es cierto y queda medido: **una app que vuelve de «recientes» sin recargarse no
busca nunca la versión nueva** (ni al volver a primer plano ni con el tiempo), así que la versión vieja sigue
mientras Android no cierre la app. Hay además un efecto secundario que también explica «a veces veo la vieja»: al
abrir la app tras un despliegue **los primeros segundos siempre son de la versión vieja** y después la página **se
recarga sola**, aunque estés en mitad de una jugada. La caché de GitHub Pages (`max-age=600`) **no** es la causa
cuando el service worker ya está instalado (medido). Propuesta recomendada (sin aplicar): **P-A**, aviso «Hi ha una
versió nova — toca per actualitzar» en el menú, búsqueda de versión al volver a la app y cada 30 min, y nunca
recargar en mitad de una jugada. Está probada con un prototipo.

### I.1 Configuración actual (evidencia)

| Pieza | Valor en la v0.1.29 | Dónde |
|---|---|---|
| Plugin | vite-plugin-pwa 1.3.0 (Workbox 7.4, `generateSW`) | `package.json`, `node_modules` |
| `registerType` | `'autoUpdate'` | `vite.config.ts` |
| `injectRegister` | `false`: registro manual con `registerSW({ immediate: true })` | `vite.config.ts`, `src/main.ts:25` |
| `skipWaiting` / `clientsClaim` | `true` / `true`: la versión nueva se activa y toma la página nada más instalarse | `vite.config.ts` → `dist/sw.js` (`self.skipWaiting(), s.clientsClaim()`) |
| Recarga al activarse | `registerSW` en modo autoUpdate: evento `activated` con `isUpdate` o `isExternal` → `window.location.reload()`, **sin mirar qué está haciendo el jugador** | `node_modules/vite-plugin-pwa/dist/client/build/register.js` |
| Navegación | `NavigationRoute(createHandlerBoundToURL("index.html"))`: **toda apertura de la app la contesta el service worker desde su caché**, nunca la red | `dist/sw.js` |
| Precaché | 73 archivos, 1,81 MB (0,49 MB gzip); `globPatterns` js, css, html, png, svg, json, webmanifest; `cleanupOutdatedCaches: true`; nombre de caché por defecto de Workbox (`workbox-precache-v2-…`) | build |
| Precaché de `index.html` | con revisión → se descarga con `cache: 'reload'` (se salta la caché HTTP) | `dist/workbox-9c191d2f.js` |
| `update()` periódico o al volver a primer plano | **No existe.** El único `visibilitychange` de `main.ts` pausa la partida | `src/main.ts:206` |
| Manifest | `id`/`start_url`/`scope` `/hockey-game/`, `display: fullscreen`, `orientation: landscape` | `dist/manifest.webmanifest` |
| Despliegue | push a `main` → build + Vitest + Playwright → `deploy-pages` (la web cambia al terminar todo el CI) | `.github/workflows/deploy.yml` |
| Cabeceras de GitHub Pages | `Cache-Control: max-age=600` en todos los archivos (dato del encargo; no se pudo comprobar en vivo: el proxy de este entorno bloquea el dominio de Pages) | — |

En la app instalada (`display: fullscreen`) **no hay botón de recargar ni «tirar para recargar»**: la única manera
de recargar es cerrar la app desde recientes y volver a abrirla.

### I.2 Qué pasa en el móvil cuando se despliega una versión nueva

Cuándo mira Chrome si hay service worker nuevo (descarga `sw.js` y lo compara byte a byte):
1. **Al abrir o recargar la página** (navegación). Medido: 1,8-2,0 s después del `load`, cuando la página deja de
   pedir archivos.
2. **Cuando el código llama a `registration.update()`**. Hoy nunca.
3. Regla de las 24 h: si la última comprobación tiene más de 24 h y el service worker atiende otro evento (una
   petición de archivo, push…). El juego lo carga todo al arrancar, así que en la práctica no ocurre.
4. **No** comprueba al volver a primer plano, ni con `visibilitychange`, ni cada cierto tiempo (medido, S2).

La caché HTTP de 10 min (`max-age=600`) **no retrasa** la detección: Chrome pide `sw.js` saltándose la caché
(cabecera medida en la petición: `Cache-Control: max-age=0`) y Workbox baja el `index.html` nuevo con
`cache: 'reload'` (medido: `no-cache`). Solo afectaría a una visita sin service worker (primera vez o tras borrar
los datos): ahí Chrome podría usar un `index.html` de hasta 10 min.

**Cronología (versión actual, autoUpdate)**

| Momento | Qué pasa | Versión que juega Guillem | Evidencia |
|---|---|---|---|
| Fusión en `main` | CI: build + tests + e2e; la web cambia al acabar `deploy-pages` (minutos) | vieja | `deploy.yml` |
| App abierta o en recientes, vuelve a primer plano | Nada: no hay navegación y el código no llama a `update()` | **vieja, indefinidamente** | S2: 0 peticiones de `sw.js` en 25 s tras ocultar/mostrar, congelar/reanudar |
| App cerrada (desde recientes, por Android o reinicio) y abierta de nuevo | El service worker viejo contesta la apertura desde su caché | **vieja** (primeros segundos) | S1 y S3: la versión al cargar es la vieja |
| ~2 s después de cargar | Chrome descarga `sw.js`, ve que cambió e instala: baja solo lo cambiado (11 archivos, 1,2 MB, ~300 KB gzip) | vieja | S1/S3: `sw.js` a +1,8-2,0 s del `load` |
| Instalada | `skipWaiting` + `clientsClaim`: se activa y toma la página | vieja | `dist/sw.js` |
| Activada | `registerSW` recarga la página **esté donde esté** | nueva | S1: 1 recarga sola; S2: con la partida en marcha (tick 385-453) → recarga → tick 0, menú |
| Total al abrir | Vieja durante 6,7-9 s tras el `load` en la prueba (CPU lenta: la carga sola tarda 6-8 s); estimado en el Pixel 8a: **3-8 s** | | S1, S3 |

**Peor caso:** sin límite mientras la app siga viva en recientes (horas o días: depende de cuándo Android la cierre
por memoria). Al reabrirla, unos segundos de versión vieja y una recarga automática. Si se cierra la app antes de que
termine la instalación, la instalación debería seguir en segundo plano (especificación; no medido) y la siguiente
apertura ya sale nueva; si no hay red, lo reintenta en la siguiente apertura.

### I.3 Causas, por probabilidad

1. **Principal: la app vuelve de recientes sin recargarse** y nadie busca la versión nueva (falta `update()` al volver
   a primer plano y cada cierto tiempo). Guillem prueba, cambia a WhatsApp o al chat, vuelve: sigue en la vieja.
2. **Secundaria: al reabrir, los primeros 3-8 s son de la versión vieja** y la recarga automática llega después. Si
   mira la versión en Configuració o se pone a jugar en esos segundos, ve la vieja; y la recarga le saca de la
   partida (vuelve al menú, se pierde la jugada). Puede parecer un fallo del juego.
3. **Menores:** abrir el enlace antes de que termine el CI y el despliegue (son minutos); propagación de la CDN de
   GitHub Pages tras desplegar (normalmente segundos, no comprobable desde aquí); la caché HTTP de 10 min solo sin
   service worker.

Lo que **no** es causa: la caché HTTP de `sw.js` o de `index.html` cuando el service worker existe (medido), ni el
nombre de las cachés (Workbox limpia las viejas al activarse).

### I.4 Experimento

`tests/e2e/pwaUpdate.spec.ts` (se salta sin `PATINS_PWA=1`; tarda ~3 min porque compila dos veces):
`PATINS_PWA=1 npx playwright test tests/e2e/pwaUpdate.spec.ts` (`PATINS_PWA_REUSE=1` reutiliza las compilaciones).
Compila el juego dos veces (A y B: mismo código, distinto identificador de commit; se lee en
`#version-label` «Versió v0.1.29 (aaaaaaa)» / «(bbbbbbb)»), las sirve en `/hockey-game/` con cabeceras como las de
GitHub Pages (`max-age=600`, ETag, Last-Modified), «despliega» B con una página de A abierta y anota cada petición.
Chromium de Playwright con el perfil del Pixel 8a (horizontal). Resultados en `test-results/pwa-update/timeline.json`.
Dos ejecuciones completas, 4/4 escenarios OK en ambas; rangos = las dos ejecuciones.

| Escenario | Resultado |
|---|---|
| S1 recargar (= reabrir) | Al cargar: **vieja**. `sw.js` pedido 1,8-2,0 s después del `load` con `max-age=0`; `index.html` con `no-cache`; 10 archivos (1,2 MB) + `sw.js`; recarga automática; **nueva 7,7-9,0 s después del `load`** |
| S2 volver a primer plano sin recargar (pestaña delante/detrás, congelar/reanudar, `visibilitychange`) y 20 s jugando | **0 comprobaciones, sigue la vieja.** Con `registration.update()`: `sw.js` pedido a los 10-12 ms, nueva en 7,5 s… **recargando con la partida en marcha** (tick 385-453 → 0, de vuelta al menú) |
| S3 página nueva (abrir la app instalada) | Primer pintado: **vieja**; `sw.js` 1,8-1,9 s después del `load`; nueva 6,7-8,5 s después del `load` |
| S4 app congelada en segundo plano + el enlace abierto en otra pestaña | La pestaña instala la nueva; la app se recarga sola y al reanudarla ya es la nueva (10-12 ms) |

Prototipo de la propuesta P-A (copia del proyecto en una carpeta temporal; no está en el repo; el código está en
I.6): **P1** vuelta de recientes en mitad de partida → comprobación a los 10 ms de volver, versión nueva lista a los
0,6 s, **la partida sigue 5 s sin recargar**, aviso en el menú de pausa, al tocarlo → nueva. **P2** antes del primer
«Jugar» → se aplica sola (una recarga, como hoy). **P3** versión nueva esperando + cerrar y reabrir → **la nueva desde
el primer fotograma, sin recarga**. Hallazgo del prototipo: en modo `prompt`, vite-plugin-pwa **no recarga** al
aceptar si la página no estaba controlada al arrancar (primera visita); el prototipo recarga él mismo en
`controllerchange`.

Límites: Chromium de escritorio con pantalla de móvil y WebGL por software (las cargas tardan 6 s); no es el Pixel.
«Volver de recientes» se emula; que Android no compruebe al reanudar se apoya en la especificación de Service
Workers (solo navegación, `update()` y la regla de 24 h) y en S2.

### I.5 Propuestas (sin aplicar), de mejor a peor

**P-A (recomendada) — modo `prompt` + búsqueda al volver y cada 30 min + aplicar solo en un momento seguro.**
- Qué hace: `registerType: 'prompt'` (sin `skipWaiting`); `registration.update()` al volver a primer plano y cada
  30 min con la app visible; cuando hay versión nueva instalada: si estás en el menú antes del primer «Jugar», se
  aplica sola (una recarga de 1-2 s); si ya jugaste, aparece un aviso en el menú (que es la pantalla de pausa);
  **nunca recarga en mitad de una jugada**. Si no tocas el aviso, la próxima vez que abras la app ya es la nueva
  desde el primer fotograma (P3).
- Pros: arregla la causa principal y la secundaria; no interrumpe partidas (importante en F2 con partidos de
  verdad); Guillem sabe cuándo hay versión nueva.
- Contras: ~50 líneas (módulo nuevo, un aviso en el menú, 2 textos); cambia la decisión del 2026-10-02 en
  DECISIONS.md («autoUpdate… para recibir siempre la última versión al reabrir»); hay que tocar el aviso.
- Riesgo: bajo. Si algo falla, el comportamiento por defecto del navegador sigue: versión nueva al cerrar todas las
  ventanas de la app y reabrir. Test: pasar los escenarios P1-P3 a `pwaUpdate.spec.ts`.
- Textos nuevos (i18n):

  | Clave | ca | es | en |
  |---|---|---|---|
  | `update.available` | Hi ha una versió nova. Toca per actualitzar. | Hay una versión nueva. Toca para actualizar. | A new version is available. Tap to update. |
  | `update.updating` | Actualitzant… | Actualizando… | Updating… |

- Qué vería Guillem: vuelve a la app desde recientes → está en pausa, como siempre → a los pocos segundos aparece
  la franja «Hi ha una versió nova. Toca per actualitzar.» → la toca → «Actualitzant…», 1-2 s en negro → menú con la
  versión nueva en Configuració. Si prefiere seguir jugando, toca «Continuar» y no pasa nada.

**P-B (mínima) — dejar autoUpdate y añadir solo `update()` al volver a primer plano (y cada 30 min en pausa).**
- Pros: ~10 líneas, sin textos ni cambios visibles. Arregla la causa principal.
- Contras: la recarga sigue siendo automática: al volver de recientes estás en pausa, pero si tocas «Continuar» en
  los 3-8 s que tarda la descarga, la página se recarga con la partida en marcha. No arregla la secundaria.
- Riesgo: medio (recargas por sorpresa). Textos: ninguno. Qué vería Guillem: al volver a la app, a veces un
  parpadeo y vuelta al menú unos segundos después.

**P-C — autoUpdate retrasando la recarga (`onNeedReload`) hasta un momento seguro.** No recomendada: el service
worker nuevo ya está activo y ha borrado de su caché los archivos viejos, mientras la página sigue con el código
viejo; si esa página carga entonces un trozo que se baja bajo demanda (el archivo principal tiene 8 `import()`;
en la prueba, 8 de los 11 archivos cambiados eran esos trozos de Babylon —cargadores de texturas y utilidades—,
que cambian de nombre en cada versión), GitHub Pages ya no lo tiene → error de carga.
Riesgo alto para lo que ahorra respecto a P-A.

**P-D (complemento opcional de P-A) — `version.json`.** El build escribe `version.json` con la versión; al volver a la
app se pide con `cache: 'no-store'` y, si es distinta, se llama a `update()` y el aviso dice el número
(«Versió nova v0.1.30…»). Pros: el aviso puede decir qué versión llega. Contras: un archivo y un paso de build más,
y es redundante con `update()`, que ya compara `sw.js`. Texto extra: `update.availableVersion` («Hi ha la versió
{version}. Toca per actualitzar.» / «Hay la versión {version}. Toca para actualizar.» / «Version {version} is
available. Tap to update.»).

### I.6 Parche propuesto para P-A (NO aplicado)

`vite.config.ts`:
```diff
-      registerType: 'autoUpdate',
+      registerType: 'prompt',
@@ workbox
         clientsClaim: true,
-        skipWaiting: true,
```

`src/pwa/updates.ts` (nuevo; es el del prototipo probado):
```ts
import { registerSW } from 'virtual:pwa-register';

/** Background check while the app is visible. Not game feel, so it is not in tuning.ts. */
const CHECK_EVERY_MS = 30 * 60 * 1000;

export interface UpdateHooks {
  /** True when reloading now loses nothing (main menu before the first "Jugar"). */
  canApplyNow: () => boolean;
  /** A new version is installed and waiting: show the banner and call apply() on tap. */
  onReady: (apply: () => void) => void;
}

export function setupUpdates(hooks: UpdateHooks): void {
  if (!('serviceWorker' in navigator)) return;
  let reg: ServiceWorkerRegistration | undefined;
  let ready = false;
  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW: (_url, r) => {
      reg = r;
    },
    onNeedRefresh: () => {
      if (ready) return; // workbox-window may report the same waiting worker twice
      ready = true;
      const apply = (): void => {
        // The plugin only reloads when the page was already controlled at start (not on a
        // first visit), so reload ourselves when the new version takes control.
        navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
        void updateSW(true); // SKIP_WAITING → the waiting version activates → controllerchange
      };
      if (hooks.canApplyNow()) apply();
      else hooks.onReady(apply);
    },
  });
  const check = (): void => {
    if (!reg || ready || reg.installing || !navigator.onLine) return;
    reg.update().catch(() => undefined); // offline / server error: try again next time
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.setInterval(() => {
    if (document.visibilityState === 'visible') check();
  }, CHECK_EVERY_MS);
}
```

`src/main.ts`: quitar `import { registerSW }` y `registerSW({ immediate: true })`, y después de crear el menú:
```ts
setupUpdates({
  canApplyNow: () => game.paused && !menu.hasStarted,
  onReady: (apply) => menu.showUpdateBanner(apply),
});
```
`src/ui/menu.ts`: `get hasStarted()` (devuelve `started`) y `showUpdateBanner(apply)`: un botón `#update-banner`
con `update.available` al final de `#main-menu`; al tocarlo cambia a `update.updating` y llama a `apply()`.
Más: los 2 textos en `ca/es/en.json`, el estilo de la franja en `styles.css`, entrada en DECISIONS.md, y
`pwaUpdate.spec.ts` con las aserciones de P1-P3 (con el código de hoy, S1-S4 describen el comportamiento viejo).

### I.7 Qué puede hacer Guillem HOY para forzar la versión nueva (Pixel 8a)

Antes: espera al aviso de que el despliegue ha terminado (la v0.1.29 quedó desplegada a las 12:37 UTC = 14:37 en
España). La versión que debes ver te la doy en el informe.

**A. Cerrar y reabrir (lo normal)**
1. Con PATINS abierta, desliza desde el borde inferior hacia arriba y mantén un momento (o toca el botón cuadrado si
   usas los 3 botones): se abren las apps recientes.
2. Busca la tarjeta de PATINS y deslízala hacia arriba para cerrarla.
3. Abre PATINS desde su icono.
4. Quédate en el menú **sin tocar «Jugar»** unos 15 segundos. Si hay versión nueva, la pantalla parpadeará una vez:
   es la versión nueva entrando.
5. Toca «Configuració» y mira la línea de abajo: «Versió v0.1.xx (…)». (También sale en la línea de diagnóstico
   del panel ⚙.)
6. Si aún es la vieja, repite los pasos 1-5 una vez más (la segunda vez entra directamente).

**B. Si sigue la vieja: abrir el enlace en Chrome**
1. Abre Chrome (el navegador, no la app) y entra en https://manrou6.github.io/hockey-game/
2. Espera 15 segundos en el menú (puede parpadear una vez) y comprueba la versión en «Configuració».
3. Cierra la app PATINS desde recientes (pasos A1-A2) y ábrela desde el icono: comparte los datos con Chrome y ya
   debería estar en la nueva.

**C. Último recurso: borrar los datos del juego** (se borran también los valores del panel ⚙ y la configuración)
1. En el juego, abre el panel ⚙ y toca «Copiar valors»; pégalo en el chat para no perderlos.
2. Chrome → menú ⋮ (arriba a la derecha) → «Configuración» → «Configuración de sitios» → «Todos los sitios».
3. Busca «manrou6.github.io» y tócalo.
4. Toca «Borrar y restablecer» (puede llamarse «Eliminar datos y restablecer permisos») y confirma.
5. Con internet, abre PATINS desde el icono: descarga la versión actual. Comprueba la versión en «Configuració».

### I.8 Decisiones pendientes

1. **P-A (recomendada) o P-B (mínima)**: P-A cambia la decisión del 2026-10-02 (autoUpdate) y añade un aviso
   visible; hay que preguntarlo a Guillem antes de aplicarla. P-B es técnica e invisible, pero recarga por sorpresa.
2. Con P-A: ¿aplicar sola antes del primer «Jugar» (propuesto) o mostrar el aviso siempre?
3. ¿Añadir P-D (el aviso dice el número de versión)?
4. ¿Mostrar la versión también en el menú principal, en pequeño, para no tener que entrar en Configuració?
5. ¿Ejecutar `pwaUpdate.spec.ts` en el CI (~3 min más por dos builds) o dejarlo como prueba manual?

## §J Banco permanente de regresión del tacto

**Qué es.** Un solo comando que repite un subconjunto fijo y determinista de los bancos de pase, tiro, volea y rechaces (`tests/unit/bench`) y compara **550 cifras** con la línea base de la v0.1.29 (`tests/unit/bench/baseline/feel-v0.1.29.json`, versionada en git). Si alguna cifra se sale de su tolerancia, aparece o desaparece, el test **falla**: es una puerta de regresión del tacto, no un informe.

**Cómo se ejecuta** (en PC; no corre en `npm test` ni en el CI porque solo se activa con `PATINS_BENCH`):

| Comando | Qué hace |
|---|---|
| `npm run bench:feel` | Ejecuta el banco y compara con la línea base más reciente de `tests/unit/bench/baseline/` (o la que diga `PATINS_BENCH_BASELINE=feel-vX.Y.Z.json`). Imprime la tabla `métrica \| base \| ahora \| Δ` con `<<< CHANGED` en las que se salen y `~` en las que cambian dentro de la tolerancia, un resumen y la lista de marcadas. Falla si hay alguna marcada. |
| `npm run bench:feel:write` | Ejecuta el banco, imprime la comparación con la línea base anterior y escribe `baseline/feel-v<versión de package.json>.json`. Nunca falla. |

**Duración:** ~2 min en un núcleo (110-113 s de banco, 114 s de reloj con vitest; `--maxWorkers=1`), muy por debajo del límite de 10 min. Por bloque: cadenas 9 s, pases sueltos 9 s, pase al espacio 9 s, vuelo del alto fuerte / globo 13 s, sueltos por distancia real 6-7 s, puntería del alto fuerte 26-27 s, tiros 7 s, primer toque 3 s, media vuelta 1 s, volea 19-21 s, flujo real de la volea 7-8 s, rechaces 1 s.

**Tolerancias** (por unidad, en `TOLERANCE` de `tests/unit/bench/feelRegression.ts`): porcentajes ±1 pp, tiempos ±0,02 s, alturas y distancias ±0,02 m, velocidades ±0,2 m/s, recuentos (túneles) exactos. La simulación es determinista: con el código sin cambios **todas** las cifras salen idénticas (comprobado: dos ejecuciones → JSON idénticos byte a byte, y la comparación da 550 idénticas / 0 cambiadas). Las tolerancias solo deciden qué cambio cuenta como regresión. Con la línea base manipulada a propósito (un tiempo +0,05 s, un túnel, un % +0,5 pp) el test falla y marca exactamente las dos primeras; la tercera sale con `~`.

**Qué mide** (escenarios, semillas y tamaños de muestra = definición de la línea base; están en `feelRegression.ts`):

| Bloque | Escenarios (Mitjana salvo que se diga) | Cifras |
|---|---|---|
| Cadenas de pase | 5 pases entre los 3 jugadores, 300 cadenas; Lleugera / Mitjana / Forta × humano ideal / reactivo / primer toque | % completadas, tiempo medio de la cadena (s), % recepciones limpias |
| Pases sueltos | 150 pases por caso; 3 niveles × raso / alto fuerte / globo × 5-12 / 13-22 / 23-35 m | % con la bola, % control limpio |
| Pase al espacio | compañero corriendo; adelanto 1,0 / 1,4 (Mitjana) y 1,2 (Lleugera, Forta) × perseguir / soltar; pase cargado a tope | % con la bola, % limpio, tiempo (s), velocidad de llegada (m/s) |
| Vuelo del alto fuerte y del globo | 200 pases por distancia (alto fuerte 5-20 m, globo 8-20 m) | altura de la bola al llegar (m, mediana), % a 0,3-1,0 m, tiempo hasta él (s), altura máxima del globo |
| Sueltos por distancia real | 1200 pases alto fuerte y globo, por tramos 5-12 / 12-17 / 17-20 / 20-25 / 25-36 m | % con la bola, % limpio, % cogido en el aire |
| Puntería del alto fuerte | 8-16 m juntos, 300 por distancia; Mitjana y Forta × parado / a sprint × compañero quieto / corriendo; y apuntando 20° desviado | error de lanzamiento (m, media y p90), % con la bola, % limpio, % en el aire |
| Tiros | 300 por caso; rápido a 7 m (0/30/55°), 14 m (0/30°), 18 m; cargado a 14 y 18 m; parado / patinando / sprint; trencada y derrape; niveles Desactivada / Lleugera / Forta; alto y vaselina; tiempos y velocidad | % a puerta, % en la zona apuntada, % desequilibrado, salida (s), velocidad en la línea (m/s), vuelo (s) |
| Primer toque | pase raso desde el lado / detrás / delante, pulsando antes / después, 7 m 0° y 10 m 30° | % recepción limpia, % a puerta, retraso (s) |
| Media vuelta | 3 / 5 / 8 m, parado o alejándose, joystick suelto o apuntando | % que gira, tiempo desde que se pulsa (s), % a puerta |
| Volea | pase de compañero siguiendo el aviso de TIR (humano normal sd 0,07 s; bueno 0,04; torpe 0,10); alto fuerte 8 / 12 / 16 m, globo y raso; balón directo a la pala | % tiro, % en el aire, % buen timing, % a puerta |
| Flujo real de la volea | emulación de `game.ts` fotograma a fotograma (cámara lenta incluida); joystick a portería / suelto, parado / sprint, 8-16 m y 20 m | % con ventana de volea, % con aviso encendido, duración del aviso en tiempo real (s), % con cámara lenta |
| Rechaces | 41 bolas por caso a poste, larguero, red lateral y de arriba, fondo y esquina, a 20 y 28 m/s; bola normal y pesada | % gol, % que vuelve delante, velocidad del rechace (m/s), **túneles (debe ser 0)** |

**Cuándo y cómo actualizar la línea base.** Solo cuando un cambio de tacto es **intencionado**:
1. Hacer el cambio (número en `tuning.ts`, regla de la simulación…) y subir la versión en `package.json` como siempre.
2. `npm run bench:feel` → ver qué cifras se mueven y comprobar que son las esperadas (y que no se mueve nada más).
3. `npm run bench:feel:write` → escribe `feel-v<nueva versión>.json`; la anterior se queda como historia (el comparador usa siempre la de versión más alta). Si no se ha subido versión, sobrescribe la del mismo número y `git diff` muestra el cambio.
4. Subir el JSON nuevo **en el mismo PR**, y el PR **debe decirlo**: «cambia el tacto: línea base actualizada» con las cifras clave antes → después (la tabla impresa en el paso 2).

Nunca se regenera la línea base para «arreglar» un fallo que no se buscaba: eso es justo la regresión que el banco debe parar. Cambiar escenarios, semillas o tamaños de muestra del banco también cambia la definición de la línea base: se reescribe en el mismo cambio y se dice en el PR.

**Cambios técnicos hechos para el banco** (sin tocar `src/`, ni el comportamiento del juego): las funciones que estaban dentro de tres `.test.ts` pasan a módulos reutilizables, sin cambiar su código: `driveAimBench.ts` (`runDrive`), `volleyCueRealFlow.ts` (`runCase`) y `airPassBench.ts` (`runAirSingles`). La salida de esos tres bancos es **idéntica byte a byte** antes y después (comparada con `cmp`; `driveAimBench` con `PATINS_DRIVE_SEEDS=40`, los otros dos completos). Ficheros nuevos: `feelRegression.ts` (escenarios, tolerancias, comparación), `feelRegression.test.ts` (la puerta), `baseline/feel-v0.1.29.json`; scripts `bench:feel` y `bench:feel:write` en `package.json`.

**Lectura de la línea base v0.1.29** (para el revisor; las cifras exactas están en el JSON): los túneles son 0 en todos los casos (bola normal y pesada); el alto fuerte llega en el aire (~0,6 m) hasta 16 m y a ras de suelo a partir de ~18-20 m (ventana de volea con joystick a portería 100 % a 8-16 m, con el aviso encendido 0,32 s de tiempo real, y ~40 % a 20 m); el tiro rápido a 7 m de frente entra 94 / 96 / 90 % parado / patinando / sprint y el cargado a 14 m 91 %. Dos cifras que llaman la atención y que el banco solo registra: la volea de balón raso no es nunca en el aire (0 %), y el primer toque con el pase desde detrás nunca es limpio (0 %).

### Línea base v0.1.29 (550 cifras)

Claves = las del JSON (`bloque.caso.cifra`); `–` = sin dato (nada que promediar).

**Cadenas de pase** (`chain.*`)

| caso | done (%) | time (s) | clean (%) |
|---|---:|---:|---:|
| light.ideal | 92.3 | 1.84 | 94.5 |
| light.reactive | 99.3 | 2.91 | 99.7 |
| light.firstTouch | 95.0 | 2.60 | 79.0 |
| medium.ideal | 94.3 | 1.74 | 97.3 |
| medium.reactive | 100.0 | 2.87 | 99.1 |
| medium.firstTouch | 96.7 | 1.74 | 75.1 |
| strong.ideal | 92.7 | 1.81 | 94.0 |
| strong.reactive | 100.0 | 2.91 | 99.7 |
| strong.firstTouch | 98.0 | 1.72 | 81.9 |

**Pases sueltos (por distancia nominal)** (`single.*`)

| caso | has (%) | clean (%) |
|---|---:|---:|
| light.ground.5-12m | 98.7 | 98.7 |
| light.ground.13-22m | 98.7 | 98.7 |
| light.ground.23-35m | 98.7 | 98.7 |
| light.driven.5-12m | 98.7 | 98.0 |
| light.driven.13-22m | 98.7 | 87.3 |
| light.driven.23-35m | 94.7 | 60.0 |
| light.lob.5-12m | 98.7 | 95.3 |
| light.lob.13-22m | 98.7 | 83.3 |
| light.lob.23-35m | 92.0 | 64.7 |
| medium.ground.5-12m | 98.7 | 98.7 |
| medium.ground.13-22m | 98.7 | 98.0 |
| medium.ground.23-35m | 98.7 | 97.3 |
| medium.driven.5-12m | 98.7 | 98.0 |
| medium.driven.13-22m | 98.7 | 86.7 |
| medium.driven.23-35m | 96.0 | 60.0 |
| medium.lob.5-12m | 98.7 | 95.3 |
| medium.lob.13-22m | 98.7 | 82.0 |
| medium.lob.23-35m | 92.0 | 63.3 |
| strong.ground.5-12m | 98.7 | 98.7 |
| strong.ground.13-22m | 98.7 | 98.7 |
| strong.ground.23-35m | 98.7 | 98.7 |
| strong.driven.5-12m | 98.7 | 98.0 |
| strong.driven.13-22m | 98.7 | 86.0 |
| strong.driven.23-35m | 96.0 | 60.7 |
| strong.lob.5-12m | 98.7 | 95.3 |
| strong.lob.13-22m | 98.7 | 82.7 |
| strong.lob.23-35m | 88.7 | 63.3 |

**Pase al espacio** (`space.*`)

| caso | has (%) | clean (%) | time (s) | arrival (m/s) |
|---|---:|---:|---:|---:|
| medium.lead1.0.chase | 98.7 | 82.0 | 1.59 |  |
| medium.lead1.0.release | 99.3 | 72.0 | 1.27 |  |
| medium.lead1.4.chase | 86.0 | 71.3 | 1.90 |  |
| medium.lead1.4.release | 100.0 | 52.7 | 1.50 |  |
| light.lead1.2.chase | 95.3 | 78.7 | 1.74 |  |
| light.lead1.2.release | 100.0 | 60.0 | 1.39 |  |
| strong.lead1.2.chase | 80.0 | 39.3 | 1.95 |  |
| strong.lead1.2.release | 100.0 | 97.3 | 0.57 |  |
| medium.lead1.2.full.chase | 99.3 |  | 1.56 | 10.2 |
| medium.lead1.2.full.release | 62.7 |  | 0.87 | 13.5 |

**Vuelo del alto fuerte y del globo (desde detrás, receptor a 7 m de portería)** (`flight.*`)

| caso | heightAtHim (m) | comfy (%) | timeToHim (s) | apex (m) |
|---|---:|---:|---:|---:|
| drive.5m | 0.52 | 100.0 | 0.33 |  |
| drive.8m | 0.59 | 100.0 | 0.52 |  |
| drive.12m | 0.62 | 100.0 | 0.71 |  |
| drive.16m | 0.63 | 100.0 | 0.83 |  |
| drive.20m | 0.08 | 1.0 | 1.04 |  |
| lob.8m | 0.05 | 0.0 | 0.82 | 0.81 |
| lob.12m | 0.09 | 7.0 | 1.06 | 1.37 |
| lob.16m | 0.13 | 24.0 | 1.26 | 1.96 |
| lob.20m | 0.21 | 32.5 | 1.44 | 2.58 |

**Sueltos de alto fuerte y globo por distancia real** (`airSingle.*`)

| caso | has (%) | clean (%) | air (%) |
|---|---:|---:|---:|
| driven.5-12m | 99.3 | 98.2 | 98.6 |
| driven.12-17m | 98.9 | 92.9 | 96.5 |
| driven.17-20m | 98.8 | 81.4 | 18.6 |
| driven.20-25m | 98.0 | 59.4 | 0.0 |
| driven.25-36m | 85.2 | 48.0 | 0.0 |
| lob.5-12m | 99.3 | 97.8 |  |
| lob.12-17m | 98.6 | 83.7 |  |
| lob.17-20m | 98.8 | 82.0 |  |
| lob.20-25m | 96.0 | 70.8 |  |
| lob.25-36m | 85.6 | 51.7 |  |

**Puntería del alto fuerte (8-16 m juntos)** (`driveAim.*`)

| caso | launchErr (m) | launchErrP90 (m) | has (%) | clean (%) | air (%) |
|---|---:|---:|---:|---:|---:|
| medium.still-still | 0.18 | 0.37 | 100.0 | 95.0 | 98.5 |
| medium.still-run | 0.19 | 0.39 | 100.0 | 95.2 | 99.5 |
| medium.sprint-still | 0.29 | 0.59 | 100.0 | 95.9 | 99.0 |
| medium.sprint-run | 0.30 | 0.61 | 99.8 | 94.9 | 99.2 |
| medium.still-still.20degOff | 0.25 | 0.47 | 100.0 | 95.8 | 98.3 |
| medium.sprint-run.20degOff | 0.48 | 1.07 | 96.7 | 91.0 | 95.8 |
| strong.still-still | 0.18 | 0.38 | 100.0 | 95.1 | 98.5 |
| strong.still-run | 0.19 | 0.39 | 100.0 | 95.6 | 99.5 |
| strong.sprint-still | 0.29 | 0.60 | 100.0 | 95.6 | 99.0 |
| strong.sprint-run | 0.30 | 0.62 | 99.8 | 94.5 | 99.2 |
| strong.still-still.20degOff | 0.18 | 0.38 | 100.0 | 95.1 | 98.5 |
| strong.sprint-run.20degOff | 0.45 | 1.02 | 97.5 | 90.9 | 96.6 |

**Tiros** (`shot.*`)

| caso | onTarget (%) | inZone (%) | offBalance (%) | release (s) | speedAtGoal (m/s) | flight (s) |
|---|---:|---:|---:|---:|---:|---:|
| quick.7m0.stand | 94.3 | 86.3 |  |  |  |  |
| quick.7m0.skate | 96.0 | 89.3 |  |  |  |  |
| quick.7m0.sprint | 90.0 | 75.0 |  |  |  |  |
| quick.7m30.stand | 88.7 | 75.7 |  |  |  |  |
| quick.7m30.skate | 91.0 | 79.3 |  |  |  |  |
| quick.7m30.sprint | 85.7 | 65.0 |  |  |  |  |
| quick.7m55.stand | 80.3 | 56.0 |  |  |  |  |
| quick.7m55.skate | 83.0 | 60.0 |  |  |  |  |
| quick.7m55.sprint | 75.7 | 46.7 |  |  |  |  |
| quick.14m0.stand | 79.3 | 50.7 |  |  |  |  |
| quick.14m0.skate | 80.7 | 52.7 |  |  |  |  |
| quick.14m0.sprint | 70.7 | 39.3 |  |  |  |  |
| quick.14m30.stand | 71.3 | 38.3 |  |  |  |  |
| quick.14m30.skate | 73.7 | 42.7 |  |  |  |  |
| quick.14m30.sprint | 63.7 | 28.3 |  |  |  |  |
| quick.18m0.stand | 70.3 | 35.7 |  |  |  |  |
| quick.18m0.skate | 71.3 | 38.0 |  |  |  |  |
| quick.18m0.sprint | 63.0 | 28.7 |  |  |  |  |
| full.14m0.stand | 91.3 | 81.7 |  |  |  |  |
| full.14m0.skate | 95.7 | 93.0 |  |  |  |  |
| full.14m0.sprint | 97.7 | 97.0 |  |  |  |  |
| full.14m30.stand | 88.3 | 72.0 |  |  |  |  |
| full.14m30.skate | 94.0 | 90.3 |  |  |  |  |
| full.14m30.sprint | 94.7 | 92.7 |  |  |  |  |
| full.18m0.stand | 85.0 | 67.0 |  |  |  |  |
| full.18m0.skate | 88.7 | 78.3 |  |  |  |  |
| full.18m0.sprint | 91.7 | 86.0 |  |  |  |  |
| quick.7m0.cut | 65.3 |  | 100.0 |  |  |  |
| quick.7m30.cut | 63.0 |  | 100.0 |  |  |  |
| quick.7m0.skid | 64.7 |  | 100.0 |  |  |  |
| quick.7m30.skid | 63.0 |  | 100.0 |  |  |  |
| level.off.quick.7m0.stand | 69.3 | 33.7 |  |  |  |  |
| level.off.full.14m30.skate | 61.7 | 23.0 |  |  |  |  |
| level.light.quick.7m0.stand | 91.3 | 78.3 |  |  |  |  |
| level.light.full.14m30.skate | 91.7 | 81.7 |  |  |  |  |
| level.strong.quick.7m0.stand | 97.0 | 92.7 |  |  |  |  |
| level.strong.full.14m30.skate | 96.0 | 94.0 |  |  |  |  |
| high.quick.7m0.stand | 93.0 | 85.0 |  |  |  |  |
| chip.quick.10m0.stand | 64.0 | 21.3 |  |  |  |  |
| timing.quick.7m0.stand |  |  |  | 0.10 | 17.4 | 0.35 |
| timing.quick.14m0.stand |  |  |  | 0.10 | 15.9 | 0.75 |
| timing.half.7m0.stand |  |  |  | 0.50 | 19.0 | 0.30 |
| timing.half.14m0.stand |  |  |  | 0.50 | 17.6 | 0.66 |
| timing.full.7m0.stand |  |  |  | 0.85 | 24.7 | 0.21 |
| timing.full.14m0.stand |  |  |  | 0.85 | 23.0 | 0.49 |

**Tiro al primer toque** (`firstTouch.*`)

| caso | clean (%) | onTarget (%) | delay (s) |
|---|---:|---:|---:|
| side.before.7m0 | 12.3 | 80.7 | 0.00 |
| side.before.10m30 | 14.7 | 66.3 | 0.00 |
| side.after.7m0 | 12.3 | 84.3 | 0.13 |
| side.after.10m30 | 14.7 | 71.7 | 0.13 |
| behind.before.7m0 | 0.0 | 44.0 | 0.00 |
| behind.before.10m30 | 0.0 | 32.0 | 0.00 |
| behind.after.7m0 | 0.0 | 46.3 | 0.13 |
| behind.after.10m30 | 0.0 | 37.3 | 0.13 |
| front.before.7m0 | 87.0 | 80.3 | 0.00 |
| front.before.10m30 | 87.0 | 67.7 | 0.00 |
| front.after.7m0 | 87.0 | 86.7 | 0.13 |
| front.after.10m30 | 87.0 | 72.0 | 0.13 |

**Media vuelta** (`turn.*`)

| caso | turned (%) | timeFromPress (s) | onTarget (%) |
|---|---:|---:|---:|
| 3m.stand.released | 100.0 | 0.33 | 99.3 |
| 3m.stand.aim | 100.0 | 0.33 | 98.3 |
| 3m.away.released | 100.0 | 0.33 | 99.0 |
| 3m.away.aim | 100.0 | 0.33 | 98.3 |
| 5m.stand.released | 100.0 | 0.33 | 96.0 |
| 5m.stand.aim | 100.0 | 0.33 | 94.7 |
| 5m.away.released | 100.0 | 0.33 | 92.3 |
| 5m.away.aim | 100.0 | 0.33 | 93.0 |
| 8m.stand.released | 100.0 | 0.33 | 85.0 |
| 8m.stand.aim | 100.0 | 0.33 | 87.0 |
| 8m.away.released | 100.0 | 0.33 | 80.3 |
| 8m.away.aim | 100.0 | 0.33 | 84.0 |

**Volea de un pase de compañero (siguiendo el aviso de TIR)** (`volley.*`)

| caso | shot (%) | aerial (%) | goodTiming (%) | onTarget (%) |
|---|---:|---:|---:|---:|
| drive.8m.to7m0.sd0.07 | 100.0 | 99.0 | 84.8 | 56.0 |
| drive.12m.to7m0.sd0.07 | 100.0 | 99.0 | 84.8 | 53.0 |
| drive.16m.to7m0.sd0.07 | 100.0 | 99.0 | 84.8 | 49.5 |
| drive.12m.to7m30.sd0.07 | 100.0 | 99.0 | 84.8 | 50.5 |
| drive.12m.to9m0.sd0.07 | 100.0 | 99.0 | 84.8 | 46.5 |
| drive.12m.to7m0.sd0.04 | 100.0 | 100.0 | 99.0 | 49.5 |
| drive.12m.to7m0.sd0.10 | 100.0 | 93.0 | 68.3 | 56.5 |
| lob.12m.to7m0.sd0.07 | 100.0 | 72.5 | 86.9 | 60.0 |
| ground.12m.to7m0.sd0.07 | 61.0 | 0.0 | – | 53.0 |

**Volea de un balón directo a la pala** (`volleyDirect.*`)

| caso | strike (%) | goodTiming (%) | onTarget (%) |
|---|---:|---:|---:|
| 7m0.10mps.0.45m | 99.0 | 72.7 | 85.0 |
| 7m30.10mps.0.80m | 100.0 | 72.0 | 80.5 |
| 10m0.6mps.1.00m | 99.5 | 72.4 | 80.5 |

**Flujo real de la volea (game.ts, 60 Hz, velocidad 1)** (`realFlow.*`)

| caso | window (%) | cue (%) | cueTime (s) | slowMo (%) |
|---|---:|---:|---:|---:|
| stickAtGoal.stand.8-16m | 100.0 | 100.0 | 0.32 | 100.0 |
| stickAtGoal.stand.20m | 41.7 | 41.7 | 0.22 | 41.7 |
| stickAtGoal.sprint.8-16m | 100.0 | 100.0 | 0.32 | 100.0 |
| stickAtGoal.sprint.20m | 37.5 | 37.5 | 0.22 | 37.5 |
| stickReleased.stand.8-16m | 100.0 | 100.0 | 0.32 | 100.0 |
| stickReleased.stand.20m | 83.3 | 79.2 | 0.23 | 79.2 |
| stickReleased.sprint.8-16m | 100.0 | 100.0 | 0.32 | 100.0 |
| stickReleased.sprint.20m | 75.0 | 70.8 | 0.20 | 70.8 |

**Rechaces (bola normal; túneles también con la pesada)** (`rebound.*`)

| caso | goal (%) | front (%) | reboundSpeed (m/s) | tunnels (n) | tunnelsTotal (n) |
|---|---:|---:|---:|---:|---:|
| post.front8m.20mps | 22.0 | 63.4 | 13.2 | 0 |  |
| post.front8m.28mps | 24.4 | 56.1 | 17.6 | 0 |  |
| post.near8m30.20mps | 12.2 | 68.3 | 14.1 | 0 |  |
| post.near8m30.28mps | 2.4 | 85.4 | 19.3 | 0 |  |
| post.far8m-30.20mps | 31.7 | 51.2 | 13.6 | 0 |  |
| post.far8m-30.28mps | 39.0 | 51.2 | 18.6 | 0 |  |
| bar.front8m.20mps | 17.1 | 56.1 | 12.5 | 0 |  |
| bar.front8m.28mps | 19.5 | 63.4 | 18.7 | 0 |  |
| bar.front14m.20mps | 4.9 | 36.6 | 14.5 | 0 |  |
| bar.front14m.28mps | 9.8 | 51.2 | 18.5 | 0 |  |
| sideNet.5m75.20mps | 0.0 | 0.0 | 5.7 | 0 |  |
| sideNet.5m75.28mps | 0.0 | 0.0 | 8.1 | 0 |  |
| topNet.lob6m | 0.0 | 0.0 | 4.5 | 0 |  |
| endBoards.12m0.20mps | 0.0 | 100.0 | 12.1 | 0 |  |
| endBoards.12m0.28mps | 0.0 | 100.0 | 17.2 | 0 |  |
| endBoards.12m25.20mps | 0.0 | 82.9 | 12.7 | 0 |  |
| endBoards.12m25.28mps | 0.0 | 82.9 | 18.1 | 0 |  |
| corner.15m30.20mps | 0.0 | 41.5 | 12.4 | 0 |  |
| corner.15m30.28mps | 0.0 | 41.5 | 17.8 | 0 |  |
| normal |  |  |  |  | 0 |
| heavy |  |  |  |  | 0 |
