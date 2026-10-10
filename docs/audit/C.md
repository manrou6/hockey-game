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
