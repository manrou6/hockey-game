# Revisión independiente del bloque 2 (FASE 3, 2026-10-11)

> Revisor independiente. Código revisado: `6699ad7` (**v0.1.30**, rama `ccr-c510413a-rbn6hg`). Las auditorías se escribieron sobre la **v0.1.29** (`00fc599`).
> Estado: **terminada**. Solo lectura: no cambia `src/`, `tests/` ni los demás documentos.

**En una línea:** de 70 cifras repetidas, 65 coinciden (las deterministas, exactas; las de rendimiento, en orden de magnitud). Lo que falla es texto que la v0.1.30 dejó desfasado y dos erratas; además hay un caso nuevo y cosmético que introduce la v0.1.30 (N-1). Correcciones en el apartado 4.

## 0. Cómo se ha revisado

- Todos los comandos, tal cual los da `docs/AUDITORIA_F1.md`, con `--maxWorkers=1`, en un worktree limpio de `6699ad7` (v0.1.30).
- Para separar «cambió por la v0.1.30» de «no se reproduce», he montado además una copia **v0.1.29** fuera del repositorio (scratchpad): el árbol de `6699ad7` con `src/` sustituido por el `src/` de `00fc599` (entre las dos versiones solo cambia `src/sim/world.ts`; los bancos son los mismos). Allí he repetido el banco de robustez (§B), el flujo real de la volea (B6 de §A) y el banco del tacto contra `feel-v0.1.29.json`.
- Leyenda de «¿Coincide?»: **Sí** = mismo valor en la v0.1.30; **Sí con v0.1.30** = en la v0.1.30 cambia, la diferencia la explica la v0.1.30 y en la copia v0.1.29 sale el valor del documento; **No** = no sale lo que dice el documento; **No reproducible** = no se pudo repetir aquí.

## 1. Reproducibilidad de las cifras (§A, §B, §C, §J)

### §A Criterios de aceptación de F1.5

| § | Cifra (cita doc:línea) | Comando | Valor reproducido | ¿Coincide? | Nota |
|---|---|---|---|---|---|
| A | U: «14 ficheros, 520 tests en verde» (AUDITORIA:27) | U | 14 ficheros, 520 tests en verde (4,9 s) | Sí | — |
| A | Fila 1: rápido 17,4 m/s a 7 m; carga completa 24,7 m/s a 7 m y 23,0 m/s a 14 m (AUDITORIA:44) | B1 `TIMING` | 17,4 / 24,7 / 23,0 m/s | Sí | — |
| A | Fila 2: sale 0,100 s tras pulsar (AUDITORIA:45) | B1 `TIMING` | 0,100 s | Sí | — |
| A | Fila 4: rápido raso 7 m de frente 94 % a puerta (AUDITORIA:47) | B1 `LEVEL medium quick 7 m 0°` | 94 % | Sí | — |
| A | Fila 5: 94 / 96 / 90 % parado / patinando / sprint (AUDITORIA:49) | B1 `ERRC quick 7 m 0°` (3.ª cifra) | 94 / 96 / 90 % | Sí | — |
| A | Fila 6: carga completa 14 m 91 / 96 / 98 % (AUDITORIA:50) | B1 `ERRC full 14 m 0°` | 91 / 96 / 98 % | Sí | — |
| A | Fila 7: 48 combinaciones, hoy ≥ techo; sprint 7 m 90 vs 86 %; 14 m 71 vs 65 %; trencada/derrape 35-65 vs 31-63 % (AUDITORIA:51) | B1 `ERRC` | 48 combinaciones válidas, en todas 3.ª ≥ 2.ª; 90/86, 71/65, 35-65 / 31-63 % | Sí | — |
| A | Fila 8: peor contexto 14 m a 30° a sprint 64 % (AUDITORIA:52) | B1 `ERRC quick 14 m 30°` | 64 % | Sí | — |
| A | Fila 10: primer toque tras raso limpio 83/88, 81/86, 77/79, 69/72 % (AUDITORIA:55) | B1 `FIRST front` | 83/88, 81/86, 77/79, 69/72 % | Sí | — |
| A | Fila 11: media vuelta 0,33 s desde que se pulsa (0,23 s desde que se suelta), 12 casos (AUDITORIA:56) | B1 `TURN` | 0,33 / 0,23 s en los 12 | Sí | — |
| A | Fila 12: gira 100 %; a puerta 98-99 / 92-96 / 80-87 % a 3 / 5 / 8 m (AUDITORIA:57) | B1 `TURN` | 100 %; 98-99 / 92-96 / 80-87 % | Sí | — |
| A | Fila 13: túneles 0; poste 2-39 % dentro y rechace 63-70 %; larguero 5-20 % dentro, 17-51 % por encima; valla de fondo 60-65 % (AUDITORIA:59) | B5 `REB` | 0 túneles; 2-39 % / 63-70 %; 5-20 % / 17-51 %; 60-65 % | Sí | El doc dice «los 20 casos»: el banco tiene **19 casos por tipo de bola** (38 en total). Errata menor |
| A | Fila 14: valla de fondo 48-56 % con la pesada (AUDITORIA:60) | B5 `REB heavy` | 48 / 48 / 55 / 56 % | Sí | — |
| A | Fila 16: buen timing normal 84-85 %, bueno 99 %, torpe 64-68 % (AUDITORIA:63) | B2 `VOLE` + B4 `VOLAH` | 85 % en las 9 filas `VOLE drive` (84,8 en el JSON); `VOLAH` normal 84-85, bueno 99, torpe 64-68 % | Sí | — |
| A | Fila 17: remata 100 %, en el aire 99 %, contacto 0,58-0,64 m, < 0,15 m 0 % (AUDITORIA:64) | B2 `VOLE drive` | 100 / 99 % / 0,58-0,64 m / 0 % | Sí | — |
| A | Fila 18: 5-18 m 100 % entre 0,3 y 1,0 m; p10 0,47 - p90 0,84; mediana 0,52-0,64; 20-25 m 1-10 % (AUDITORIA:65) | B2 `VOLP drive` | idéntico | Sí | — |
| A | Fila 19: pico máx. 1,33 m; media 0,52-1,21; 22 m 1,49 y 25 m 2,08 m (AUDITORIA:66) | B2 `VOLP drive` | idéntico | Sí | — |
| A | Fila 20: vuelo 0,52 / 0,71 / 0,83 s (AUDITORIA:67) | B2 `VOLP drive` | 0,52 / 0,71 / 0,83 s | Sí | — |
| A | Fila 22: vaselina pico 1,51 m a 12 m; 1,96-3,36 m a 16-25 m (AUDITORIA:69) | B2 `VOLP lob` | máx. 1,51 m a 12 m; 1,96-3,36 m (media del pico) | Sí | Mezcla máximo (1,51) y media (1,96-3,36); conviene decirlo |
| A | Fila 23: la tiene / limpia 99/99, 99/98, 99/98, 98/88, 100/90, 100/86 % (AUDITORIA:70) | B5 `SGL driven` | idéntico | Sí | — |
| A | Fila 24: sin Xut, limpia 91-100 %, nunca intocada (AUDITORIA:71) | B2 `VOLE drive` | 91-100 %, intocada 0 % | Sí | — |
| A | Fila 25: esquina 78-86, lateral 68-77, detrás 47-59 % (AUDITORIA:72) | B3 `VOLG drive` | 78-86 / 68-77 / 47-59 % | Sí | docs/03:75 da 77-86 / 68-78 / 45-59 (medido en la v0.1.28): ±1-2 puntos, el doc lo da por «coincide» |
| A | Fila 32: Mitjana 0,17 / 0,36 m parado y 0,27 / 0,56 m a sprint; tiene 100 %, limpia 94-96 %, aire 98-99 % (AUDITORIA:79) | B7 `DRIVE … 8-16` | idéntico | Sí | — |
| A | Fila 33: buen timing a 7 m 0°: 85 / 78 / 57 %; a 30°: 79 / 71 / 52 % (AUDITORIA:80) | B3 `VOLG` (on target del buen timing) | idéntico | Sí | — |
| A | Fila 34: mal timing 53-87 % (7 m 0°: 67-87 %); `VOLT` −0,20…+0,10 s 75-87 %; 17,5-17,8 vs 19,8 m/s (AUDITORIA:81) | B3 `VOLG`, `VOLT` | idéntico | Sí | — |
| A | Fila 26 (a): pase de 6-16 m, 100 / 100 / 100 % y 0 perdidos (AUDITORIA:73) | B6 (prueba «speed 1, 60 Hz») | 120 filas de 6-16 m: ventana y aviso 100 %, 0 sin tocar (v0.1.29 y v0.1.30) | Sí | — |
| A | Fila 26 (b): «también a 0,8× y 1,4× y a 120 Hz» 100 % y 0 perdidos (AUDITORIA:73) | B6 (prueba «game speed 0.8 / 1.4 and 120 Hz») | 1,4× y 120 Hz: 100 %, 0 sin tocar. **0,8× con el pasador a sprint: ventana 96 / 96 / 92 % a 8 / 12 / 16 m y 2-3 de 48 sin tocar** (motivo `nopasses`), igual en la v0.1.29 y en la v0.1.30 | **No** (parcial) | La frase es demasiado general. Ver corrección F-3 |
| A | Fila 26 (c) y Hallazgo 1: con pases a ≥ 17,9 m y el stick a la portería, ventana 33-46 %; sin tocar 11-14 de 24 (`goal`) y 5-14 de 24 (`goalSoft`) (AUDITORIA:73, :101) | B6 | **v0.1.29**: ventana 33-46 %, sin tocar 11-14 / 24 (`goal`) y 5-14 / 24 (`goalSoft`). **v0.1.30**: ventana 67-83 %, sin tocar 0-2 / 24 (igual que con el stick suelto) | Sí con v0.1.30 | Es el arreglo F6. La fila 26 y el Hallazgo 1 describen la v0.1.29; falta una nota «arreglado en la v0.1.30» (corrección F-1) |
| A | Fila 27: la cámara lenta empieza 0,18 s de juego antes del contacto, dura 0,33 s reales en los que pasan 0,22 s de juego (AUDITORIA:74) | B6 | «at 0.18 s; game 0.22 s in real 0.33 s» en todas las filas con ventana | Sí | — |
| A | Fila 29 / Hallazgo 2: el banco `cueTap` tal cual da 0/24 voleas (AUDITORIA:76, :103) | B6 (prueba «cue-reactive TIR tap») | 0/24 en las 8 filas de 6-18 m (todo `high-clean`), en la v0.1.29 y en la v0.1.30 | Sí | El banco **sigue sin corregir** en la v0.1.30 (pendiente, ver corrección F-6). El 24/24 con el banco corregido no lo he repetido (el doc dice que la copia temporal se borró) |

**§A: 30 cifras comprobadas; 29 coinciden (28 Sí + 1 Sí con v0.1.30) y 1 no (fila 26 b, a 0,8× con el pasador a sprint). Además, una errata de recuento (fila 13: «20 casos» son 19 por tipo de bola) que no cambia ninguna conclusión.**

### §B Robustez de la simulación

Comando: `PATINS_BENCH=1 npx vitest run tests/unit/bench/stressBench --maxWorkers=1` (completo, 179 s en la v0.1.30), y el mismo en la copia v0.1.29.

| § | Cifra (cita doc:línea) | Comando | Valor reproducido | ¿Coincide? | Nota |
|---|---|---|---|---|---|
| B | 2 400 000 ticks en B1; 546 000 en B5; 114 112 en B4; 2 018 322 en B2 (AUDITORIA:130-131, :162-166) | stressBench completo | B1 2 400 000; B5 426 000 + 120 000; B2 1 535 938 + 482 384 = 2 018 322; B4 **114 112 (v0.1.29) / 114 119 (v0.1.30)** | Sí / Sí con v0.1.30 | B4 cambia 7 ticks porque la v0.1.30 cambia las partidas |
| B | Cobertura de B1: 1744 tiros (113 de media vuelta), 233 voleas (342 acompañamientos), 1187 goles, 886 fuera, pases 1318 / 1335 / 738, 89 paredes, 5703 recepciones (115 bajando la bola alta), 14 393 trencadas, 39 070 frenadas, 22 293 cambios, 1519 bolas paradas (AUDITORIA:172-175) | `-t "B1"` | **v0.1.29: todas idénticas.** v0.1.30: 1787 tiros (114), 189 voleas (307), 1184 goles, 871 fuera, 1318 / 1321 / 735, 86 paredes, 5740 recepciones (139), 14 481, 39 150, 22 392, 1510 | Sí con v0.1.30 | Las partidas aleatorias divergen en cuanto un arreglo cambia un tick; no es un problema de reproducibilidad |
| B | Resumen: 0 NaN/Infinity, 0 túneles, 0 jugadores fuera, 0 bolas inalcanzables, 0 estados sin resolver (AUDITORIA:131-134, :191-198) | stressBench completo | 0 en las dos versiones (sin líneas `ISSUE` de esos tipos) | Sí | **Salvo** un caso nuevo en la v0.1.30: ver N-1 abajo |
| B | Determinismo: 60/60 idénticas dos veces y reproducidas; intercalado y foto + continuar: mundo completo distinto en 18-19 de 60 (`volley.height` 31, `volley.time` 12, `lastShot.targetY` 6) (AUDITORIA:197) | `-t "B3"` | v0.1.29: 19 y 18 de 60; campos 31 / 12 / 6. v0.1.30: 4 y 4 de 60, solo `lastShot.targetY` 8 | Sí / Sí con v0.1.30 | Es el arreglo parcial de F4 (queda `targetY`) |
| B | B4: 47,90-47,96 / 59,87-59,96 / 83,99-84,00 ticks por segundo real; error ≤ 4,3·10⁻¹³ s; 1,04 s reales → 42,0 / 42; tirones pierden el 24-31 % (AUDITORIA:198, :257-260) | `-t "B4"` | Idéntico (1863/7676 = 24 %, 2621/9602 = 27 %, 4159/13404 = 31 %) | Sí | — |
| B | B2: «100 % de los tiros a la boca son gol salvo 4»; apretón ≤ 1,1 cm dentro de la red (AUDITORIA:192, :251) | `-t "B2"` | 3 + 1 tiros a la boca sin gol; `sweep.inCageNet` 0,011 m | Sí | — |
| B | F1: 136 de 342 acompañamientos; B6 F1 5,59 m (AUDITORIA:206) | `-t "B1"`, `-t "B6"` | v0.1.29: 136 y 5,59 m. v0.1.30: 0 y 0,00 m | Sí con v0.1.30 | Arreglado |
| B | F2: B6 0,24 m fuera; con 1,2 m «fuera» (AUDITORIA:207) | `-t "B6"` | v0.1.29: 0,240 m y `out: true`. v0.1.30: −0,010 m (dentro); con 1,2 m **sigue `out: true`** | Sí con v0.1.30 | §B:235 esperaba «out: false» tras el arreglo; con 1,2 m la bola va por encima de la valla (1,0 m) y salir es físicamente correcto. El test `robustness.test.ts:80` solo exige `out = false` por debajo de la valla. Ajustar el texto (corrección F-4) |
| B | F3: 5 de 886 fueras; B6 F3 (17,60, 0,30) dentro de la jaula, expulsada 0,59 m (AUDITORIA:208) | `-t "B1"`, `-t "B6"` | v0.1.29: 5 de 886 y (17,60, 0,30) / 0,59 m. v0.1.30: 0; (17,06, 0,30) fuera de la jaula, 0,00 m | Sí con v0.1.30 | Arreglado |
| B | F4: B6 `volley.time` 0 → 0,25 s (AUDITORIA:209) | `-t "B6"` | v0.1.29: 0,000 → 0,250. v0.1.30: 0,000 → 0,000 | Sí con v0.1.30 | Arreglo parcial |
| B | F5: 3,8 cm; 422 ticks en B1 (AUDITORIA:210) | `-t "B6"`, `-t "B1"` | 3,8 cm en las dos; 422 (v0.1.29) / 333 (v0.1.30) ticks | Sí / Sí con v0.1.30 | No arreglado (decidido) |
| B | F6: 10-17 m recibido; 18 y 20 m no (a 5,1 y 4,8 m) (AUDITORIA:211) | `-t "B6"` | v0.1.29: idéntico. v0.1.30: recibido a 18 y 20 m (0,47 / 0,41 m) | Sí con v0.1.30 | Arreglado |
| B | I6: bola suelta a 47,0 m/s, jugador a 16 m/s, bola en el stick 2,3 m en un tick (semilla 40034 t110); valla 2,3 cm (semilla 40002 t415) (AUDITORIA:255-258, :248) | `-t "B5"` | v0.1.29: 46,955 m/s; 16,0; 2,328 m (s40034 t110); 0,023 m (s40002 t415). v0.1.30: igual salvo 1,884 m en s40034 t112 | Sí / Sí con v0.1.30 | — |
| B | Duración: 140 s en total; B1 79,5 s (AUDITORIA:149) | stressBench completo | 179 s; B1 101,5 s | Sí (orden de magnitud) | Máquina compartida |

**N-1 (nuevo, v0.1.30, gravedad baja).** En la v0.1.30, B1 imprime dos líneas que **no salían en la v0.1.29**: `ballInPost.loose` (semilla 998, tick 455: bola **1,1 cm dentro** de un poste o del larguero, en (17,21, −0,40, 1,15)) y `ballInPost.hold` (tick 456, 0,4 cm). En la v0.1.29 el máximo de `framePen.loose` era 0,000 m; en la v0.1.30, 0,011 m. Encaja con el arreglo F2 («si la pala entra en la jaula por fuera, la bola cae donde está»): una volea acompañada junto al larguero deja la bola tocándolo. Es cosmético (1 cm, un caso en 2,4 M ticks), pero contradice «0 dentro de un poste» y nadie lo ha anotado. Reproducir: `PATINS_BENCH=1 npx vitest run tests/unit/bench/stressBench --maxWorkers=1 -t "B1"` y buscar `ballInPost`.

**§B: 14 cifras comprobadas; las 14 se reproducen (6 iguales en la v0.1.30 y 8 «Sí con v0.1.30», confirmadas en la copia v0.1.29). Además, un caso nuevo (N-1) que introduce la v0.1.30.**

### §C Rendimiento

Comandos: `PATINS_BENCH=1 npx vitest run tests/unit/bench/perfBench.test.ts --reporter=verbose --maxWorkers=1` (2 ejecuciones completas + 3 de `-t "pass arrow|per-call cost"`, una de ellas en la copia v0.1.29) y, para el navegador, `npm run build && PATINS_PERF=1 npx playwright test tests/e2e/perfStress.spec.ts -g "quality medium@1/4"` y `-g "pass arrow while PASE"` (en una copia de la v0.1.30 fuera del repositorio con el puerto 4297, como hizo el auditor con el 4291). **No** he repetido las calidades `low`/`medium` a resolución completa ni el perfil de CPU de Chromium (C6 b, C7): unos 5 min más. Carga del contenedor durante las medidas: 0,7-2,7.

| § | Cifra (cita doc:línea) | Comando | Valor reproducido | ¿Coincide? | Nota |
|---|---|---|---|---|---|
| C | Tick normal p50 5,9 µs (3 jugadores) y 10,1 µs (10 entidades) (AUDITORIA:283, :354-355) | perfBench | 5,7 y 11,8 µs (máquina tranquila); 7,8 y 13,1 µs (con otro banco en marcha) | Sí (orden de magnitud) | — |
| C | Recuento de ticks por clase: 18 344 / 627 / 50 / 50 / 2529 y 19 192 / 528 / 103 / 61 / 1716 (AUDITORIA:362-366) | perfBench `TICKCAT` | idénticos | Sí | Determinista |
| C | Actividad por minuto: estrés 18 pases (8 / 7 / 3), 10 tiros, 33 recepciones, bola suelta 58 %; actual 9 / 8 / 14 (AUDITORIA:321) | perfBench `ACT` | idéntico | Sí | Determinista |
| C | Bytes por tick: 14,7 k / 20,6 k / 2,4 k / 8,3 k / 564 k / 704 k; IA de test 1,8 k (AUDITORIA:416-421) | perfBench `ALLOC` | 14 726 / 20 638 / 2405 / 8256 / 564 258 / 704 372; 1792 | Sí | — |
| C | `Math.hypot` → `Math.sqrt`: 630 → 373 KB y 949 → 568 KB por llamada (AUDITORIA:435-436) | perfBench `WHATIF` | 621 → 373 KB y 946 → 568 KB | Sí | — |
| C | `planPass` alto fuerte, carga 0: 331-392 / 500-544 / 622-658 / 1076-1118 µs a 6 / 10 / 16 / 25 m (AUDITORIA:375) | perfBench `CALL` (5 ejecuciones) | 318-618 / 498-970 / 622-1012 / 1148-1984 µs | Sí (orden de magnitud) | Hasta ×1,8 de una ejecución a otra |
| C | `planPass` vaselina, carga 0: 573-655 … 1260-1282 µs (AUDITORIA:377) | perfBench `CALL` | 620-1034 / 770-1031 / 1029-2265 / 1258-2794 µs | Sí (orden de magnitud) | Ídem |
| C | `predictContact` 1,84-2,11 µs; `collidePlayers` 1,47-1,85 µs (AUDITORIA:386, :388) | perfBench `CALL` | 1,76-2,51 µs; 1,37-1,74 µs | Sí | — |
| C | Flecha (Passada mantenida): alto fuerte 515-549 / 717-781 µs, vaselina 636-696 / 781-1032 µs (AUDITORIA:399-400) | perfBench `ARROW` (5 ejecuciones) | alto fuerte 541-922 / 820-1364 µs; vaselina 721-982 / 1036-1384 µs; sin Passada 2,9-7,8 µs | Sí (orden de magnitud) | La conclusión (×170-230 frente a sin Passada; pico de sim más claro, M1) se mantiene. En la copia v0.1.29, 715 / 744 µs: no es la v0.1.30 |
| C | Reparto: `planPass` 42,5-42,6 % del tiempo del estrés (AUDITORIA:445) | perfBench `PROF` | 44,8 % y 44,0 % | Sí | — |
| C | «Las cifras de Node se repiten con ±5 %» (AUDITORIA:279) | perfBench ×5 | `planPass` y flecha varían hasta ±30-40 % entre ejecuciones hoy | **No** | Los recuentos deterministas sí son exactos. Ver corrección F-9 |
| C | Empaquetado con `rolldown --minify`: `benchSim` 4,5 → 3,7 µs; `planPass` 0,62 → 0,31 y 0,90 → 0,47 ms (AUDITORIA:326-327) | — | — | No reproducible | El doc no da el comando ni el script (no está en el repo). Afecta a la conversión «×0,5 empaquetado» que usan el resumen y el presupuesto |
| C | Draw calls 35 (3 jugadores) y 93-95 con 10 entidades (táctica 95-99); 9,7-10,5k triángulos (AUDITORIA:462-467) | perfStress `medium@1/4` | 35-38 y 93-94 (táctica 97); 9,7-10,1k | Sí | El hallazgo «93-99 > 60 de docs/04» se mantiene |
| C | Sim por tick dentro del juego a ×1: 0,06 ms (3) y 0,11 ms (10) (AUDITORIA:462, :465) | perfStress `medium@1/4` | 0,06 y 0,12 ms | Sí | — |
| C | Trabajo JS por fotograma a ×4: 1,94 ms (3) y 3,15 ms (10); hilo principal 2,72 / 3,87 ms (AUDITORIA:463, :466) | perfStress `medium@1/4` | 3,24 y 6,14 ms; hilo principal 4,41 / 7,87 ms; con 10 entidades a ×4 la página ya no llega a 60 fps (49 fps) | Sí (orden de magnitud); **valor no** | ×1,7-1,9 más hoy. El margen del presupuesto (16,7 ms − hilo principal) baja de ~14 / ~12 ms a ~12 / ~9 ms: la conclusión «en régimen normal sobra CPU» se mantiene |
| C | Flecha en Chromium: ×1 0,18-0,20 ms con flecha y 0,07-0,12 sin; ×4 0,64-0,77 ms (AUDITORIA:406-407) | perfStress `-g "pass arrow"` | ×1 0,21 / 0,09 ms; ×4 1,10 / 0,30 ms; ×6 0,83 ms | Sí (orden de magnitud) | — |
| C | Primer fotograma con la flecha: render de 222 y 556 ms (shader) (AUDITORIA:510) | perfStress `-g "pass arrow"` | 232 ms (1 shader compilado) | Sí | — |
| C | `Math.hypot` 25-40 ns frente a `sqrt` 11-19 ns por paso en Chromium ×1 (AUDITORIA:424) | perfStress `REF` | 27 y 12 ns | Sí | — |

**§C: 18 cifras comprobadas; 16 coinciden (9 exactas o casi y 7 en orden de magnitud, que es lo que pide una medida ruidosa), 1 no (la repetibilidad «±5 %») y 1 no reproducible (el empaquetado). El método se reproduce: los mismos comandos dan las mismas líneas y los recuentos deterministas salen exactos. Las conclusiones de §C (picos de `planPass`, flecha cada tick, draw calls, tirón del shader, PLAN_F2 optimista) se sostienen; los valores absolutos del navegador a ×4 salen hoy ×1,7-1,9 más altos.**

### §J Banco permanente del tacto

| § | Cifra (cita doc:línea) | Comando | Valor reproducido | ¿Coincide? | Nota |
|---|---|---|---|---|---|
| J | `npm run bench:feel` contra la línea base más reciente: 550 idénticas (AUDITORIA:1205, :1218) | `npm run bench:feel -- --maxWorkers=1` | `BASELINE feel-v0.1.30.json` → **identical 550 / within 0 / outside 0 / new 0 / gone 0** | Sí | — |
| J | Con el código sin cambios, todas idénticas (AUDITORIA:1218) | copia v0.1.29 + `PATINS_BENCH_BASELINE=feel-v0.1.29.json` | identical 550 | Sí | La línea base v0.1.29 se reproduce byte a byte desde el código de la v0.1.29 |
| J | Las 550 cifras de las tablas del doc = `feel-v0.1.29.json` (AUDITORIA:1247-1501) | script de comparación (todas las celdas, redondeadas como en la tabla) | **550 de 550 iguales**, 0 claves de más o de menos | Sí | Comprobación completa, no por muestreo |
| J | Duración ~2 min (110-113 s de banco) (AUDITORIA:1214) | idem | 92,4 s y 90,9 s | Sí | — |
| J | Tolerancias ±1 pp, ±0,02 s, ±0,02 m, ±0,2 m/s, recuentos exactos (AUDITORIA:1216) | `feelRegression.ts:23` | idénticas | Sí | — |
| J | Lectura de la base: ventana con el stick a la portería 100 % a 8-16 m, aviso 0,32 s, ~40 % a 20 m; tiro 94 / 96 / 90 % y 91 %; volea de raso 0 % en el aire; primer toque desde detrás 0 % limpio (AUDITORIA:1245) | JSON v0.1.29 y v0.1.30 | v0.1.29: idéntico (41,7 / 37,5 %). v0.1.30: a 20 m **83 / 75 %** | Sí con v0.1.30 | — |
| J | v0.1.29 → v0.1.30: «543 de 550 idénticas, las 7 que cambian son las de F6» (PROGRESS:71; DECISIONS:138 «las otras 543 medidas idénticas») | `diff` de los dos JSON + regla de `feelRegression.ts:464` | **8 cifras distintas**: 7 fuera de tolerancia y 1 dentro (`realFlow.stickAtGoal.stand.20m.cueTime` 0,220 → 0,226 s). Idénticas: **542** | **No** (errata) | Las 8 son de F6. Corrección F-2 |
| J | «ventana / aviso / cámara lenta a 20 m con el stick a la portería 42 → 83 % parado y 38 → 75 % a sprint» (DECISIONS:138) | JSON v0.1.29 vs v0.1.30 | ventana 42 → 83 y 38 → 75 %; **aviso y cámara lenta 42 → 79 y 38 → 71 %** | **No** (parcial) | Corrección F-2 |

No he repetido la prueba de la línea base manipulada a propósito (AUDITORIA:1218): habría que tocar un JSON versionado.

**§J: 8 cifras comprobadas; 6 coinciden y 2 son erratas de la entrada v0.1.30 (no del banco).**

### Resumen de la reproducibilidad

| § | Comprobadas | Coinciden | No | No reproducible |
|---|---|---|---|---|
| A | 30 | 29 | 1 | 0 |
| B | 14 | 14 | 0 | 0 |
| C | 18 | 16 | 1 | 1 |
| J | 8 | 6 | 2 | 0 |
| **Total** | **70** | **65** | **4** | **1** |

## 2. Coherencia entre documentos

Documentos cruzados: `AUDITORIA_F1.md`, `PLAN_F1_6.md`, `PLAN_F2.md`, `DECISIONS.md`, `PROGRESS.md` y `03_JUGABILIDAD.md`, en `6699ad7`. Solo hechos del bloque 2 y de las v0.1.29 / v0.1.30. «F-n» remite a la lista de correcciones del apartado 4.

| # | Dónde (doc:línea ↔ doc:línea) | Contradicción | Cuál es correcto (evidencia) | Corrección propuesta |
|---|---|---|---|---|
| 1 | AUDITORIA:73 (fila 26, «Parcial»), :95-101 (Hallazgo 1), :109, :116 ↔ DECISIONS:138, docs/03:75, PROGRESS:71 | La auditoría sigue diciendo que el alto fuerte de más de 16,5 m se pierde al apuntar a la portería y que hay que decidirlo; DECISIONS y docs/03 dicen que la v0.1.30 lo arregló | La v0.1.30 (`world.ts:486`: `passAir > 0 \|\| passKind === PASS_DRIVE`; B6: 18-20 m con el stick a la portería, ventana 67-83 % y 0-2 / 24 sin tocar; antes 33-46 % y 11-14 / 24) | F-1 |
| 2 | AUDITORIA:109 («Qué tiene que probar Guillem»: «Con pases de unos 20 m sí puede perderse») ↔ DECISIONS:138 | Es la lista que puede acabar en el informe a Guillem y le pide comprobar un fallo que ya no existe | DECISIONS:138 (ver #1) | F-1 |
| 3 | AUDITORIA:670 (C4) y :701 (D.4, punto 2) ↔ docs/03:75, DECISIONS:138 | §D da C4/D4 como abierto («o se corrige el texto o se amplía en la v0.1.30; cambia el juego: Guillem») | Resuelto en la v0.1.30 por el agente principal como arreglo (docs/03:75 ya dice «desde la v0.1.30 también el largo»). §D lo había clasificado como «cambia el juego: Guillem» y el banco del tacto lo confirma (7 cifras fuera de tolerancia): Guillem debe saberlo | F-1; G-4 |
| 4 | PLAN_F1_6:38, :274, :422 (decisión 10) ↔ DECISIONS:138, `world.ts:486` | El plan dice que el arreglo solo cubre < 16,5 m y que «hoy se pierden 11-14 de 24»; la decisión 10 propone extenderlo «si la v0.1.30 no lo ha arreglado» | La v0.1.30 ya lo extendió al **alto fuerte** largo; la **vaselina** sigue fuera (la condición nueva no la incluye; nadie la ha medido) | F-5 |
| 5 | PROGRESS:71 ↔ DECISIONS:138 ↔ `feel-v0.1.29.json` / `feel-v0.1.30.json` | «543 de 550 idénticas, las 7 que cambian son las de F6» | 542 idénticas, 1 dentro de tolerancia (`stand.20m.cueTime` 0,220 → 0,226 s) y 7 fuera; las 8 son de F6 (diff de los JSON) | F-2 |
| 6 | DECISIONS:138 ↔ `feel-v0.1.30.json` | «ventana / aviso / cámara lenta … 42 → 83 % parado y 38 → 75 % a sprint» | La ventana sí; el aviso y la cámara lenta pasan a 79 % y 71 % | F-2 |
| 7 | PLAN_F2:14, :92, :511, :519 ↔ AUDITORIA:306-308 (resumen, punto 7) y :595-602 («¿Se sostienen las cifras de PLAN_F2?») | PLAN_F2 sigue diciendo «la IA cabe con margen (0,2-0,4 ms por tick en el Pixel)» y «física con 10 jugadores 0,05-0,07 ms»; §C mide 0,21-0,36 ms solo de física a ×4 dentro del juego (3-6× más) y estima la IA en ~1-2 ms | §C (medido en el navegador; yo reproduzco 0,38 ms por tick con 10 entidades a ×4) | F-7 |
| 8 | PLAN_F2:505, :712 ↔ AUDITORIA:601 | Objetivo de F2 «p95 ≤ 0,5 ms y máximo ≤ 1 ms por tick a ×4»: §C dice que **ya se supera hoy sin IA** (p95 0,8-1,1 ms, máx. 1,9-4,6 ms) por los picos de `planPass` | §C (lo confirmo: p95 1,0 ms y máx. 2,2 ms a ×4 con 10 entidades). La objeción de PLAN_F2:795-804 ya lo apunta | F-7 (técnico) |
| 9 | PLAN_F1_6:395 ↔ PLAN_F2:91 ↔ AUDITORIA:462-463 | Objetivo de F1.6 «sim ≤ 0,03 ms por tick con CPU ×4 (hoy 0,01)»; PLAN_F2 dice «hoy ~0,03 ms»; §C mide **0,08 ms** a ×4 dentro del juego con 3 jugadores (yo, 0,19 ms) | §C. El 0,01 viene de F0 (1 jugador, sin bola). La objeción O18 (PLAN_F1_6:557-560) ya lo señala, pero el objetivo sigue sin corregir | F-8 |
| 10 | PLAN_F1_6:394, :412 ↔ `feel-v0.1.30.json`, DECISIONS:138 | «idénticos a la línea base de la v0.1.29»; «tu visto bueno a la volea de la v0.1.29» | La base vigente es `feel-v0.1.30.json` (el comparador usa la de versión más alta) y la versión que Guillem probará es la v0.1.30 | F-5 |
| 11 | PROGRESS:15, PLAN_F1_6:8, :52, :75-76, :413 ↔ DECISIONS:128 ↔ DECISIONS:134 | «Opción A» = zona libre y «opción B» = Regat ↗ en el plan; en DECISIONS:128 A / B / C son las salidas al conflicto con «el regate sale al pulsar» (B = convertir el regate en aixecar si arrastras ↗ en 0,1 s) y el punto (2) es la decisión **definitiva** de Guillem: aixecar = ↗ sobre REGATE; la «zona libre» es la opción A de **otra** serie, la del gesto del remate (DECISIONS:134) | DECISIONS:128 (decisión registrada de Guillem). Ya lo señalan §D C1 (AUDITORIA:667) y la objeción O1 (PLAN_F1_6:445-449), pero el texto del plan y de PROGRESS:15 sigue igual | F-10 (nombres); G-1 (la decisión) |
| 12 | AUDITORIA:134-135 («6 fallos … todos arreglables sin cambiar el tacto»), :209 (F4 «¿Cambia el tacto? No»), :210 (F5 «No (≤ 4 cm)») ↔ DECISIONS:138 | DECISIONS deja sin arreglar el resto de F4 («el remate sin apuntar usa ese valor … arreglarlo cambia un poco ese remate») y F5 («unificarlo cambia las colisiones con la portería») | DECISIONS:138 es más preciso (F5 mueve la caja de la portería hasta 3,8 cm: cambiaría los rechaces del banco del tacto). §B no lo vio porque B3 no tuvo remates sin apuntar entre mundos | F-4 |
| 13 | AUDITORIA:240 («tras arreglar, `-t "B6"` debe imprimir F2 0 m fuera y `out: false`») ↔ salida de B6 en la v0.1.30 ↔ `tests/unit/robustness.test.ts:80` | Con la volea acompañada a 1,2 m la v0.1.30 sigue imprimiendo `out: true` | Es correcto que salga: la bola va por encima de la valla de 1,0 m (`src/config/rink.ts:12`); el test solo exige `out = false` por debajo de la valla | F-4 |
| 14 | DECISIONS:138 (v0.1.30 «sin cambiar el tacto») ↔ banco de robustez v0.1.30 | DECISIONS no menciona que el arreglo F2 deja un caso nuevo de bola 1,1 cm dentro del poste o del larguero (N-1) | El banco: `ballInPost.loose` (semilla 998, tick 455) solo en la v0.1.30 | F-3 |
| 15 | DECISIONS:130 (`highPenalty` 0,5) ↔ `src/config/tuning.ts:477` (0,1) ↔ AUDITORIA:105, :671 (C5) | Sigue sin anotarse que `volley.highPenalty` pasó de 0,5 a 0,1 en la v0.1.28 | El código | F-11 |
| 16 | PROGRESS:72 («prueba de la v0.1.28») y :79 («siguiente: prueba de Guillem de la v0.1.28») ↔ PROGRESS:70-71 | Ya señalado por §D C8 (AUDITORIA:674) y sin corregir | v0.1.30 (la última desplegada / por desplegar) | F-12 |
| 17 | PROGRESS:131-134 («Notas para la siguiente sesión»: «Próximo paso: F1 en modo plan») ↔ PROGRESS:6-20 y CLAUDE.md regla 8 | Una sesión nueva leería un siguiente paso de F0. Ya señalado en §D D.3 y sin corregir | PROGRESS:6-20 | F-12 |
| 18 | PROGRESS:9 | La misma línea dice «HECHA el 2026-10-10» y «En curso; la primera tanda se cortó…» | HECHA (6699ad7) | F-12 |
| 19 | AUDITORIA:73 (fila 26: «también a 0,8× y 1,4× … 100 / 100 / 100 % y 0 perdidos») ↔ salida de B6 | A 0,8× con el pasador a sprint: ventana 96 / 96 / 92 % y 2-3 de 48 sin tocar (motivo `nopasses`), en la v0.1.29 y en la v0.1.30 | La salida del banco | F-1 |
| 20 | AUDITORIA:1205, :1245 (§J: «compara con la línea base de la v0.1.29»; «~40 % a 20 m») ↔ `tests/unit/bench/baseline/feel-v0.1.30.json` | La base vigente es la v0.1.30 y a 20 m ahora es 75-83 % | El JSON v0.1.30 y la regla del comparador (AUDITORIA:1238, «usa siempre la de versión más alta») | F-1 |
| 21 | PROGRESS:70 («vibración … (32 + 14 ms)») ↔ DECISIONS:136, docs/03:75 | PROGRESS omite la pausa de 45 ms | DECISIONS:136 (`[32, 45, 14]`) | F-12 |
| 22 | AUDITORIA:116 (punto 6: corregir el banco `cueTap`) ↔ PROGRESS (pendientes) | El Hallazgo 2 (banco que da 0/24 por un error del propio banco) no figura en ninguna lista de pendientes; sigue sin corregir en la v0.1.30 | La salida de B6 (0/24 en la v0.1.30) | F-6 |
| 23 | docs/03:32 (bola alta: 12-14 m 99/97, 14-16 m 98/89, 16-17 m 100/87) ↔ AUDITORIA:70 (v0.1.29: 99/98, 98/88, 100/90) | Cifras de la v0.1.28 sin decir de qué versión son; la v0.1.29 mueve 16-17 m +3 puntos (DECISIONS:137 habla de «±1 punto», pero de otro banco) | AUDITORIA:70 (lo reproduzco) | F-13 (baja) |
| 24 | AUDITORIA:101 (Hallazgo 1: `pass.driveAirFull`) ↔ AUDITORIA:211 (F6) y DECISIONS:138 (`pass.driveAirEnd`) | Dos nombres para el límite de 16,5 m | Los dos valen 16,5 (`tuning.ts:399-400`); la condición depende de `passAir`, que es 0 a partir de `driveAirEnd` | F-1 (de paso) |

Coherente (comprobado, sin contradicción): las etiquetas **P12-P16** significan lo mismo en DECISIONS:135-137, AUDITORIA:79, :111, :117, PLAN_F1_6:34, :402, :418, :423 y PLAN_F2:30, :160, :318, :757 (P12 trencada, P13 alto fuerte al espacio, P14 cono, P15 `driveErrorFactor`, P16 cámara lenta fuerte); el resumen de §A (41 / 27 / 4) coincide con la cabecera (AUDITORIA:7); la cabecera de §B («7 hallazgos, 5 arreglados») coincide con DECISIONS:138 contando F4 como parcial; docs/03:75 ya describe la v0.1.30; PLAN_F1_6:145 reserva bien la v0.1.30 para los arreglos.

## 3. Veredicto: ¿se puede confiar en el bloque 2?

**Sí, en sus cifras; con retoques en su texto.** De 70 cifras repetidas con los comandos que da la propia auditoría, 65 coinciden; las de §A, §B y §J son deterministas y salen exactas (las de §B y §J, también en una copia del código de la v0.1.29, lo que separa limpiamente lo que cambió la v0.1.30). El banco del tacto hace lo que promete: 550 idénticas, y las 550 cifras de las tablas de §J son las del JSON. §C es ruidoso, como avisa, pero su método se reproduce y todas sus conclusiones (picos de `planPass`, la flecha, draw calls, PLAN_F2 optimista) se sostienen. Lo que falla no son medidas sino **texto desfasado**: la v0.1.30 resolvió el Hallazgo 1 / F6 y los documentos (§A, §D, PLAN_F1_6, §J) siguen describiendo el fallo; dos erratas en la entrada v0.1.30 («543», «83 %»); y tres correcciones de §D (C5, C8, notas de PROGRESS) siguen sin aplicar. Una cosa nueva: la v0.1.30 introduce un caso cosmético (N-1, bola 1 cm dentro del larguero) que nadie ha anotado.

## 4. Correcciones para el agente principal

### 4.1 Hechos: aplicar ya (texto exacto)

- **F-1 (AUDITORIA §A, §D, §J; v0.1.30).**
  - AUDITORIA:73, fila 26, al final de la columna «Qué falta»: añadir «**Arreglado en la v0.1.30 (F6):** con el stick a la portería, a 18-20 m la ventana pasa del 33-46 % al 67-83 % y los pases sin tocar de 11-14 a 0-2 de 24 (igual que con el stick suelto).» y cambiar «**Parcial**» por «Sí (v0.1.30)».
  - En la misma fila, sustituir «(también a 0,8× y 1,4× de velocidad de juego y a 120 Hz)» por «(también a 1,4× y a 120 Hz; a 0,8× con el pasador a sprint, 92-96 % y 2-3 de 48 pases que no llegan a su alcance)».
  - AUDITORIA:95, al principio del Hallazgo 1: «**(Arreglado en la v0.1.30, ver DECISIONS 2026-10-10; la vaselina sigue sin cubrir.)**».
  - AUDITORIA:109: sustituir «Con pases de unos 20 m sí puede perderse (Hallazgo 1).» por «Desde la v0.1.30, también con pases de unos 20 m.».
  - AUDITORIA:116, punto 2: «~~Decidir el Hallazgo 1~~ Hecho en la v0.1.30 (F6).».
  - AUDITORIA:670 (C4) y :701 (D.4 punto 2): añadir «(resuelto en la v0.1.30: docs/03:75 y `world.ts:486`)».
  - AUDITORIA:101: «`pass.driveAirFull`» → «`pass.driveAirEnd`» (como en §B y DECISIONS).
  - AUDITORIA:59, fila 13: «en los 20 casos» → «en los 19 casos por tipo de bola (38 en total)».
  - AUDITORIA:1205: «con la línea base de la v0.1.29 (`…feel-v0.1.29.json`…)» → «con la línea base más reciente (hoy `feel-v0.1.30.json`; la de la v0.1.29 queda como historia)». Y al final de AUDITORIA:1245: «En la v0.1.30 (F6) la ventana a 20 m con el stick a la portería pasa a 83 % parado y 75 % a sprint; el resto, idéntico.».
- **F-2 (cifras de la v0.1.30).**
  - PROGRESS:71: «banco del tacto: 543 de 550 medidas idénticas, las 7 que cambian son las de F6» → «banco del tacto: 542 de 550 idénticas, 1 dentro de la tolerancia y 7 fuera; las 8 son de F6».
  - DECISIONS:138: «(banco del tacto: ventana / aviso / cámara lenta a 20 m con el stick a la portería 42 → 83 % parado y 38 → 75 % a sprint; las otras 543 medidas idénticas)» → «(banco del tacto, a 20 m con el stick a la portería: ventana 42 → 83 % parado y 38 → 75 % a sprint; aviso y cámara lenta 42 → 79 % y 38 → 71 %; de las otras 542 medidas, ninguna cambia)».
- **F-3 (N-1).** DECISIONS:138, al final de «No arreglados»: «**Nuevo con la v0.1.30 (N-1, revisión del bloque 2):** el banco de robustez ve un caso (semilla 998, tick 455) en que la volea acompañada junto al larguero deja la bola 1,1 cm dentro del poste o del larguero (en la v0.1.29, 0); cosmético, a la lista con F5.». Y añadirlo a los pendientes de PROGRESS:71 («Pendiente (a la lista): F4 resto, F5, F7, N-1»).
- **F-4 (§B).** AUDITORIA:209, F4, columna «¿Cambia el tacto?»: «No» → «No (la parte de `volley.time/height`); el resto (`targetY`, `planTmp` de la volea) sí cambia un poco el remate sin apuntar (DECISIONS 2026-10-10)». AUDITORIA:210, F5: «No (≤ 4 cm)» → «Sí, un poco: mueve la caja de la portería hasta 3,8 cm y con ello los rechaces (no se arregló en la v0.1.30)». AUDITORIA:134: «todos arreglables sin cambiar el tacto» → «arreglables sin cambiar el tacto salvo F5 y el resto de F4». AUDITORIA:240: «F2 0 m fuera y «out: false»» → «F2 0 m fuera y «out: false» con la bola por debajo de la valla (a 1,2 m sigue saliendo por encima, que es correcto)».
- **F-5 (PLAN_F1_6).**
  - :38 (c): añadir al final «**Desde la v0.1.30** la condición también cubre el alto fuerte largo (`passKind === PASS_DRIVE`); no la vaselina.».
  - :274: «El arreglo de la v0.1.29 (`aerialPass`) solo cubre el alto fuerte de menos de 16,5 m.» → «El arreglo (`aerialPass`, v0.1.29 y v0.1.30) cubre el alto fuerte a cualquier distancia, pero no la vaselina.» y quitar «si la v0.1.30 no lo arregla antes,».
  - :422, decisión 10: «Y si la v0.1.30 no lo ha arreglado antes, aplicar la misma regla a todo pase por el aire dirigido a ti, incluidos la vaselina y el alto fuerte largo (el hallazgo 1 de §A: hoy se pierden 11-14 de 24 de 17,9-20 m si apuntas a la portería).» → «Y aplicar la misma regla a la vaselina dirigida a ti (el alto fuerte largo ya lo hace desde la v0.1.30); antes, medir la vaselina con `volleyCueRealFlow`.».
  - :394: «idénticos a la línea base de la v0.1.29» → «idénticos a la línea base vigente (hoy `feel-v0.1.30.json`)». :412: «la volea de la v0.1.29» → «la volea de la v0.1.30».
- **F-6 (banco `cueTap`).** Añadir a los pendientes de PROGRESS (entrada v0.1.30 o «Pendiente para F2»): «Banco `volleyCueRealFlow`, caso `cueTap`: corregir `cmd.shoot = f === tirPress` → `if (f === tirPress) cmd.shoot = true` (Hallazgo 2 de §A; hoy da 0/24 por un error del banco, no del juego).».
- **F-7 (PLAN_F2 y §C).** Debajo de la tabla de PLAN_F2:89-98 y al final de PLAN_F2:519 añadir: «**Medido después en la §C de la auditoría:** dentro del juego la física con 10 entidades cuesta 0,21-0,36 ms por tick a ×4 (no 0,05-0,07): ×4 sobre Node se queda corto (~10× en el navegador). La IA estimada pasa a ~1-2 ms por tick en el Pixel y hay que medirla en Chromium desde F2a (M9). El objetivo «p95 ≤ 0,5 ms y máx. ≤ 1 ms a ×4» ya se supera hoy sin IA por los picos de `planPass` (M1-M3 antes de F2).». Y en PLAN_F2:14: «(estimo 0,2-0,4 ms por tick en el Pixel)» → «(estimación inicial 0,2-0,4 ms; la §C de la auditoría la eleva a ~1-2 ms: se mide desde F2a)».
- **F-8 (PLAN_F1_6:395).** «sim ≤ 0,03 ms por tick con CPU ×4 (hoy 0,01)» → «sim en el navegador a ×4 ≤ 0,1 ms por tick con un rival (hoy 0,08 ms con 3 jugadores, §C6); los picos de `planPass` aparte».
- **F-9 (§C).** AUDITORIA:279: «Las cifras de Node se repiten con ±5 %» → «Los recuentos de Node son exactos; los tiempos se repiten con ±5 % en la misma sesión, pero entre sesiones `planPass` y la flecha varían hasta ±30-40 % (revisión del bloque 2)». AUDITORIA:326-327: añadir el comando o el script del empaquetado con `rolldown`, o marcar esas cifras como «medida puntual, sin script en el repo».
- **F-10 (nombres del gesto).** Aplicar ya la parte factual de O1: en PROGRESS:15 y en PLAN_F1_6:8, :52, :75, :413 sustituir «opción A» / «opción B» del gesto de aixecar por «Aixecar-Zona lliure» y «Aixecar-Regat ↗», y añadir en PLAN_F1_6:413: «Ojo: “Zona lliure” saca aixecar de REGATE, en contra de la decisión de Guillem del 2026-10-08 (DECISIONS:128, punto 2) y de docs/06:19.».
- **F-11 (DECISIONS).** Nueva línea al final de DECISIONS: «2026-10-11 (nota técnica, revisión del bloque 2): `volley.highPenalty` pasó de 0,5 a **0,1** en la v0.1.28 (`7ce7db7`) sin entrada propia; DECISIONS:130 conserva el 0,5 de la v0.1.27 como historia.».
- **F-12 (PROGRESS).** :72 y :79: «v0.1.28» → «v0.1.30». :9: borrar «En curso; la primera tanda se cortó por el límite de uso de la API (12:35-16:50 UTC) y se reanudó por tandas de 4 agentes:» → «Se hizo por tandas de 4 agentes (la primera se cortó por el límite de uso de la API, 12:35-16:50 UTC):». :70: «(32 + 14 ms)» → «(32 ms, pausa de 45 ms y 14 ms)». :131-134: sustituir las notas de F0 por «Siguiente paso: FASE 4 (resumen a Guillem) → prueba de Guillem de la v0.1.30 en el Pixel (volea, anillo dorado, cámara lenta, vibración, alto fuerte) → cierre de F1.5 → plan de F1.6 (decisiones del §9, gesto de aixecar).».
- **F-13 (baja).** docs/03:32: después de «Medido (pases sueltos…; la tiene / limpia):» añadir «(v0.1.28; en la v0.1.29: 12-14 m 99/98, 14-16 m 98/88, 16-17 m 100/90, 17-18 m 100/86 %, AUDITORIA §A fila 23)».

### 4.2 Preguntas de diseño (para Guillem, en el resumen de la FASE 4)

- **G-1 Gesto de aixecar.** El plan de F1.6 recomienda deslizar en la zona libre (saca aixecar de REGATE) frente a lo que decidiste el 2026-10-08 (arrastre ↗ sobre REGATE). ¿Mantienes REGATE ↗ o quieres probar los dos?
- **G-2 Vaselina dirigida a ti.** Con la vaselina, girar el joystick hacia la portería mientras vuela probablemente hace que tu jugador deje de ir a por ella (sin medir). ¿Aplicamos también a la vaselina «el joystick solo apunta»? (cambia el tacto: necesita tu sí).
- **G-3 Objetivos de la volea que no se cumplen** (AUDITORIA §A fila 34): «mal timing ≤ 55 % a puerta» y «~60 % de buen timing con ±0,04 s». ¿Se retiran (la ventana generosa fue decisión tuya) o el mal timing debe costar más precisión?
- **G-4 Aviso en una línea (no es pregunta):** la v0.1.30 hizo que el alto fuerte **largo** (más de 16,5 m) tampoco se pierda al apuntar a la portería: la ventana de volea a 20 m pasa del ~40 % al ~80 %. Es lo que ya decía docs/03, pero cambia el tacto a esa distancia; si no te gusta, se vuelve atrás.

