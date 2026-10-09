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
