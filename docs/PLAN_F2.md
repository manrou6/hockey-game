# Plan F2: partido 5 contra 5, IA de compañeros y rivales

> **Propuesta para Guillem. No hay nada implementado.** Bloque 2, entregable G (2026-10-09). Está hecho sobre el código de la v0.1.29 (commit 00fc599) y sobre lo que deja F1.6 según `docs/PLAN_F1_6.md`, sobre todo el **rival de prueba** (`src/sim/ai/defender.ts`, modos Quiet / Encara, F1.6a), que F2 reutiliza en vez de duplicarlo. Fuentes: `docs/REFERENCIA_PARTIDOS.md` (informe de partidos reales), `docs/01`, `docs/03` (§2-§7), `docs/05`, `docs/06` (F2) y la lista «Pendiente para F2» de `PROGRESS.md` y `DECISIONS.md`. Las decisiones que cambian algo ya documentado en /docs están en el §15, cada una con una recomendación. **No se aplica ninguna sin el sí de Guillem** (CLAUDE.md). Los cambios técnicos internos se anotarán en DECISIONS.md al hacerse.

## 0. En 10 líneas (para Guillem)
1. F2 es el **partido completo 5 contra 5** (4 jugadores + portero por equipo) de 2 × 5 min. Incluye la IA de compañeros, rivales y portero, el cambio de jugador, las reglas base, el marcador y el modo Partit ràpid (docs/06).
2. **La IA juega con tus mismas reglas.** Produce las mismas órdenes que tu dedo (joystick, Passada, Xut, Regat) dentro de la misma simulación. No tiene trampas de velocidad. La dificultad cambia sus reflejos y sus decisiones, no su físico.
3. Se construye sobre el **rival de prueba de F1.6**: su forma de encarar y su stick que roba pasan a ser el defensa de F2.
4. **Orden:** cimientos (a), defensa de la IA (b, atacas tú contra ella), **desmarques y pase al espacio** (c, tu prioridad alta), ataque de la IA (d), defender tú (e), el partido completo (f) y una ronda de afinación (g).
5. **Defensa en «cuadro»** que cierra líneas de pase y de tiro sin ir a robar a lo loco, como en los partidos reales. **Ataque en rombo o en cuadrado** con rotaciones («la rueda») y posesiones de 5 a 40 s.
6. **Desmarques:** los compañeros corren solos al espacio y el que pasa sigue corriendo. El pase sabe hacia dónde va el compañero y tiene en cuenta que está acelerando (P3b + P4).
7. **Presión:** un rival encima ya separa la bola al conducir y estropea el pase. Propongo que también cuente en el tiro y en la recepción, y que importe hacia dónde está el rival. Todo con pesos en el panel (a 0 = como hoy).
8. Cada sub-paso trae su banco de pruebas (cientos de partidos IA contra IA con semillas fijas, cifras medibles) y una lista de qué probar en el Pixel.
9. **Rendimiento:** la IA cabe con margen (estimo 0,2-0,4 ms por tick en el Pixel). El peligro son los cálculos de los pases altos (~1 ms cada uno ya en el ordenador de pruebas): la IA no los usará para pensar.
10. Hay 15 decisiones en el §15. Las más importantes son la 1 a la 6.

## 1. Objetivo y alcance
**docs/06 F2:** 2 equipos completos; IA de equipo, jugador y portero (docs/03 §5 y §7); cambio de jugador; reglas base (saque inicial, gol, reinicios, faltas leves, libre indirecto, reloj parado, 2 partes); marcador TV básico; modo Partit ràpid con equipos de prueba. **Aceptación:** un partido completo de 2 × 5 min sin bloqueos, en el que la IA ataca, defiende y marca de forma creíble. El §16 lo convierte en cifras medibles.

**Lo que el informe de partidos reales pide para F2** (`REFERENCIA_PARTIDOS.md` §4):
- defensa en «cuadro» que cierra líneas de pase y de tiro, sin robar a lo loco (recomendación 2);
- ataque 2-2 / 1-2-1 con rotaciones («la rueda»);
- repliegue instantáneo al perder la bola;
- premiar la paciencia moviendo la bola por el perímetro (recomendación 10);
- posesión elástica de 5 a 40 s;
- compañeros que se ofrecen mejor para el pase.

**Lo pendiente para F2** (PROGRESS / DECISIONS):
- **«Pase al espacio» (P3b + P4), prioridad ALTA:** los compañeros se desmarcan solos, el que pasa sigue corriendo y el pase anticipa la aceleración del receptor (→ F2c).
- **P8** (llegada sincronizada del pase al espacio) y **P13** (alto fuerte por delante de un compañero que corre): se deciden con rivales (→ F2c).
- **P2** (frenada previa de la trencada más corta): solo si con rivales sigue siendo justa (→ F2b).
- **Pared con la valla con rivales**, y su versión con rebote **hacia un compañero** (idea b; también la decisión 13 del plan de F1.6) (→ F2b y F2d).
- **Alto fuerte largo** (llega botando, ~60 % de control limpio a más de 23 m) y **vaselina** (95 → 65 % de control limpio): se revisan cuando la IA los use (→ F2d).
- **P6:** solo si Guillem cambia la velocidad de juego a ≠ 100 %. No hace falta nada en F2: los tiempos de la IA son de tiempo de juego y escalan solos.
- **Cámara lenta del remate con rivales y en el modo online** (docs/03) (→ F2f y decisión 14).
- **Presión en el tiro** (`shot.ctxPressure`, hoy a 0; decisión 9 de F1.6) (→ F2b).
- Posicionamiento real por roles (hoy los compañeros del banco de F1.4 solo acompañan).

**Fuera de F2:**
- **F3:** faltas de equipo, libre directo, penalti, tarjetas, inferioridad, regla de 5 s, ley de la ventaja, árbitro visible, cambios al vuelo y banquillo, antijuego de 45 s como regla.
- **F4:** arte y animación. **F5:** liga, copa y carrera. **F7:** online.
- **El modo Entrenamiento conserva los compañeros del banco de F1.4** (`mates.ts`) para que los bancos de F1 sigan dando lo mismo.

**Requisitos previos** (docs/06: no se empieza una fase sin cerrar la anterior):
- F1 cerrada, en particular:
  - **F1.6a:** el rival de prueba (`ai/defender.ts`: encarar, stick, robo, estados);
  - **F1.6b-d:** los regates y el amago, a los que el defensa reacciona y que la IA también usará;
  - **F1.8:** el portero básico.
- Si F1.6g (juego por detrás de la portería) se recorta y pasa a F2 (riesgo 10 de F1.6), entra en F2d.

## 2. Punto de partida (v0.1.29 + F1.6, verificado en el código)
- **Una sola interfaz de órdenes.** `PlayerCommand` (`src/sim/commands.ts`) es lo que producen el táctil, el teclado y el mando. En `stepWorld` (`src/sim/world.ts`):
  - el jugador controlado recibe la orden del humano (`humanCommand`);
  - cada jugador con `bot = true` recibe la de `botCommand` (`src/sim/mates.ts`);
  - cualquier otro recibe `commands[i]`.
  
  La IA de F2 solo tiene que rellenar `PlayerCommand`, como ya hacen los compañeros del banco.
- **`mates.ts` es el banco de F1.4, no la IA de F2:**
  - dos puntos de apoyo fijos (3 m por delante y 5 m a cada lado del que lleva la bola);
  - ir al encuentro del pase (`interceptMove`, con punto de encuentro);
  - recoger bolas lentas;
  - devolver la bola si el control no cambia.
  
  Hay código fijado al **equipo 0**:
  - `findReceiver` y `nearestBot` filtran `p.team !== 0`;
  - `attackedSide` (`src/sim/shot.ts`) da «el equipo 0 ataca hacia +x» siempre, así que no hay cambio de campo en la segunda parte.
- **Recogida de una bola suelta con sesgo de índice.** El bucle de recepción recorre los jugadores por índice y se para en el primero que tiene la bola a tiro (`break`). Si dos sticks llegan a la vez en el mismo tick, gana siempre el índice más bajo, que es el equipo 0. Con rivales sería injusto: se arregla en F2a.
- **La presión ya existe, pero es simple.** `pressureOn` (`src/sim/dribble.ts`) es el rival más cercano a menos de 1,8 m y solo mira la distancia: no le importa si está delante o detrás, ni cuántos hay. Ya actúa en tres sitios:
  - separación de la bola al conducir: +0,4 m con presión máxima (`dribble.pressureSeparation`);
  - error del pase: +4° (`pass.errorPressure`);
  - tiro y remate en el aire: con peso 0 (`shot.ctxPressure`, F1.5c).
  
  La recepción no la usa.
- **Choques de la bola:**
  - **Con los cuerpos:** sí. Son cilindros comprobados en cada sub-paso de la bola, así que un tiro ya puede chocar con un defensor.
  - **Con los sticks:** no hasta F1.6a. Allí la pala del rival de prueba (~1 m por delante, barre ±70°) hace una tirada de robo si la bola pasa a ≤ 0,35 m. F2 la reutiliza para todos los defensores (§6).
- **Atributos.** `src/sim/feel.ts` devuelve los valores base (preparado para F2, DECISIONS 2026-10-02). Hoy en `PlayerState` solo están `control`, `passing`, `shotAccuracy` y `shotPower`. F1.6 añade `movesFor` (Regate) y `defenderFor` (Defensa). `simPurity.test.ts` obliga a leer esos números a través de `feel.ts`.
- **Cambio de jugador** (v0.1.17):
  - **Automático:** «mientras la bola está suelta para el equipo». Ojo: `ballLooseForTeam` también es verdadero cuando **la lleva un rival**, así que en defensa ya cambia solo al compañero más cercano a la bola (1,5 m de margen, 0,25 s, 0,6 s de recarga).
  - **Canvi:** al más cercano a la bola, o al siguiente si ya lo eres.
  
  En defensa, «el más cercano a la bola» no siempre es el que conviene (§7).
- **Azar.** Hay un solo `world.rng` (sfc32 con semilla). Lo gastan:
  - el desvío en la valla, la pérdida al conducir, la recepción y el error del pase y del tiro;
  - en F1.6, también el robo del rival de prueba.
- **Otras cosas que hay que generalizar:** reglas de pista libre (`freePlayBallRules`), un solo humano (`world.controlled`) y el estado del remate en el aire (`world.volley`), que solo existe para el jugador controlado.
- **Coste medido hoy** (micro-banco temporal de esta sesión, ya borrado; contenedor compartido por 8 agentes, así que las cifras son ruidosas):

| Qué | Coste en el contenedor | Pixel 8a estimado (×4)¹ |
|---|---|---|
| `stepWorld` con 3 jugadores (hoy) | 7-8 µs/tick | ~0,03 ms |
| `stepWorld` con 10 jugadores (bots del banco de F1.4, 5 de otro equipo) | 11-17 µs/tick | ~0,05-0,07 ms |
| `planPass` raso (al pie, 6-16 m) | 38-117 µs por llamada | 0,15-0,5 ms |
| `planPass` alto fuerte (6-16 m) | **0,55-1,13 ms** por llamada | **2-4,5 ms** |
| `planPass` vaselina (6-16 m) | **0,68-1,93 ms** por llamada | **2,7-7,7 ms** |
| `pressureOn` | 0,3 µs | — |
| `predictContact` (remate en el aire, 0,5 s por delante) | 2 µs | — |
| Percepción ingenua completa (100 distancias + 200 líneas de pase) | ~10 µs | ~0,04 ms |

¹ ×4 es el factor de «CPU ×4» que usa el repo para emular el Pixel en Playwright (PROGRESS, F0). La §C de la auditoría lo medirá de verdad. **Hallazgo para la §C:** la flecha del pase recalcula `planPass` **en cada tick** mientras mantienes Passada (`world.aimActive`). Con alto fuerte o vaselina eso es ~0,6-1,9 ms por tick en el contenedor, quizá varios ms en el Pixel. Hay que medirlo en el móvil (§11).

## 3. Arquitectura de la IA dentro de la simulación
### 3.1 Reglas de oro
1. **Pura y determinista.** Todo vive en `src/sim/ai/`: nada de DOM, render, audio, `Math.random` ni `Date.now` (lo comprueba `simPurity.test.ts`). Paso fijo de 60 Hz. Misma semilla + mismas órdenes del humano = el mismo partido, también a cualquier velocidad de juego y con la cámara lenta, porque solo cambia cuántos ticks se ejecutan por segundo real.
2. **La IA solo produce `PlayerCommand`**, igual que el humano:
   - mueve el joystick (`moveX/Y`, `sprint`);
   - pulsa, mantiene y suelta Passada y Xut (`pass`, `passHeld`, `passHeight`, `shoot`, `shootHeld`, `shootHeight`);
   - pulsa Regat;
   - usa las órdenes de F1.6 (`lift`, `shotFeint`).
   
   Pasa, tira, regatea y patina con **la misma física y la misma asistencia en la suelta**. La única diferencia es que la IA decide qué hacer y dónde apuntar.
3. **Atributos solo a través de `feel.ts`** (§3.7). Todo número de comportamiento va en `src/config/tuning.ts` (CLAUDE.md, regla 4), con su meta y sus etiquetas ca/es/en (`tuningMeta.test.ts`).
4. **Cero asignaciones de memoria por tick.** Objetos de trabajo reutilizados, como los que ya usa `world.ts` (`effective`, `botCtx`). Arrays y bucles por índice, nunca recorrer un `Map` o un `Set`: así el orden es fijo y el resultado, determinista.
5. **Dos fuentes de azar:**
   - `world.rng`, el de hoy, para lo que **ocurre** en el juego: rebotes, recepciones, errores y el robo del stick de F1.6;
   - `world.aiRng` (nuevo, con la misma semilla del partido) para lo que la IA **decide**.
   
   Así, sin IA (Entrenamiento y bancos de F1) no se gasta ningún número nuevo y todo sale **idéntico** a la línea base de la v0.1.29 (banco J).

### 3.2 Capas
Es lo que pide docs/03 §7: «equipo (táctica) → roles → jugador (decisiones con utilidad + steering)».

| Capa | Archivo | Qué decide | Cada cuánto |
|---|---|---|---|
| Percepción | `ai/perception.ts` | Una foto compartida del tick: distancias de todos con todos, rival más cercano a cada uno, quién tiene la bola, tiempo de cada jugador hasta la bola, líneas de pase del portador a cada compañero (abiertas o cerradas, holgura) y presión sobre el portador | Cada tick (~10-20 µs) |
| Equipo | `ai/team.ts` | **Fase** (§4.4), **forma** de ataque o de defensa, **reparto de roles**, marcajes, quién presiona y quién cubre, cuándo rotar («la rueda») | 10 Hz, desfasado entre equipos (equipo 0 en los ticks múltiplos de 6, equipo 1 en múltiplos de 6 + 3), y al momento en un cambio de posesión, un pase, un tiro o un reinicio |
| Formas | `ai/shapes.ts` | El punto de cada rol según la forma y la posición de la bola (§4) | Lo llama el equipo |
| Jugador con bola | `ai/carrier.ts` | Tirar, pasar (a quién, de qué tipo, al pie o al espacio), conducir, regatear (F1.6), proteger o hacer la pared con la valla (§4.5) | 20 Hz (cada 3 ticks), con compromiso mínimo |
| Jugador sin bola en ataque | `ai/offball.ts` | Ocupar su punto, ofrecer línea de pase, desmarcarse, seguir corriendo tras pasar (§5) | 10 Hz, desfasado por jugador |
| Jugador sin bola en defensa | `ai/defence.ts` (+ `ai/defender.ts` de F1.6a) | Encarar o contener, cubrir, cerrar líneas, marcar, interceptar, robar o tapar (§6) | 10 Hz; el encarar de F1.6 sigue cada tick |
| Pilotaje | `ai/steering.ts` | Llegar, perseguir, interceptar, esquivar compañeros y vallas, mirar a la bola. Convierte el objetivo en `moveX/Y` y `sprint` | Cada tick (barato) |
| Portero | `ai/goalkeeper.ts` (F1.8) | §9 | Cada tick (colocación) |
| Dificultad | `ai/difficulty.ts` | §3.6 | Al crear el partido |

`mates.ts` se queda para el modo Entrenamiento. El mundo sabe en qué modo está (`world.mode = 'training' | 'match'`).

### 3.3 Reflejos: percepción con retraso
Un humano reacciona tarde. La IA hace lo mismo: **decide con la foto de hace R ticks** (un anillo con las últimas ~24 fotos de posiciones y velocidades: 11 objetos × 4 números, muy poco).
- R depende de la dificultad (§3.6) y del atributo correspondiente.
- El pilotaje (esquivar, no chocar con la valla) usa siempre la foto actual.

Es el mismo concepto que la «reacción de 0,25 s» del rival de prueba de F1.6, generalizado. Así la IA no ve el futuro: una finta o una trencada le engañan durante su tiempo de reacción, como a una persona. Es lo que hace que la frenada previa de la trencada sea «el tiempo de reacción del rival» (docs/03 §1).

### 3.4 Modelos baratos para decidir (nunca `planPass` para pensar)
Para comparar opciones, la IA usa estimaciones de pocos microsegundos:
- **Tiempo de rodadura de un raso**, de una tabla precalculada `tiempo(distancia, velocidad de salida)` hecha con el mismo `roll()` de `src/sim/rolling.ts` (mismo modelo de fuerzas). Se recalcula si cambian los números de la bola en el panel (se comparan 4 valores por tick).
- **Tiempo de un jugador hasta un punto**, con el mismo modelo de aceleración que ya usa la pared con la valla (`wallPass.ts`: v(t) = vc − (vc − v0)·e^(−t/τ)), más su reacción.
- **¿Línea de pase cerrada?** Para cada rival, ¿llega con el stick (1 m) a algún punto de la línea (4 muestras) antes que la bola, con un margen de 0,15 s? De ahí sale una probabilidad de intercepción.
- **Peligro de un tiro** (una «xG» sencilla): distancia, ángulo, presión, cuerpos y sticks en la línea y colocación del portero. Se calibra con el banco del tiro (`shotBench`) y el portero de F1.8.

**Solo la acción elegida** pasa por el camino real: la IA aprieta el botón y, al soltarlo, `performPass` / `performShot` calculan el pase o el tiro exactamente igual que para el humano. Así el coste caro (planPass de un alto fuerte: ~1 ms) se paga una vez por pase y no varias veces por tick (§11).

### 3.5 Cómo aprieta los botones la IA
- **Pase:**
  - En el tick de la pulsación apunta el joystick al receptor o al punto del espacio. El receptor se fija al pulsar, como el tuyo (`lockPassTarget`).
  - Mantiene Passada los ticks que necesite: 1 = toque; para cargar, hasta 0,6 s.
  - Elige la altura con `passHeight` y suelta.
  - Su asistencia es un **perfil interno «IA»** (decisión técnica): el cono y la corrección de Forta, pero **respetando el apuntado al espacio** como Mitjana. Forta pone la bola a los pies (`spaceRespect` 0, P9 = no), así que con Forta la IA no podría pasar al espacio, y hoy los compañeros pasan con Forta (docs/03).
  - Su error sale de su atributo Pase y de la dificultad, con la misma fórmula que el tuyo (`passErrorSd`: sprint, presión, desequilibrio).
- **Trencada sin querer (P12):** apuntar de golpe a 54-80° de la marcha a sprint inicia una trencada y desvía el pase. La IA no pasa a más de ±50° de su marcha por encima de 5 m/s: primero frena o gira. Es la misma regla que tienes tú: no se la salta.
- **Tiro:** igual que el pase. Toque = tiro rápido; mantener = carga (si estima que tiene ≥ 0,6 s libres); `shootHeight` para alto o picado. La media vuelta sale sola cuando tira de espaldas cerca de la portería (`needsTurn`). El primer toque es pulsar Xut antes de recibir (búfer de 0,2 s).
- **Regates (F1.6):** Regat + joystick, con la misma elección por ángulo respecto al defensor (`moves.ts`). La IA elige el regate según la postura del defensor (§4.5).
- **Remate en el aire de la IA:** hoy `volleyStep` solo existe para el jugador controlado (`world.volley`). En F2d se propone una versión simplificada para la IA: predice el contacto con `predictContact` solo si el pase es para ella, y pulsa Xut con un error de timing según la dificultad. Es opcional; si no entra, la IA controla la bola alta y tira al primer toque.

### 3.6 Dificultad (docs/01: «afecta a la IA táctica, la reacción del portero y la asistencia al pase/tiro, nunca trampas de velocidad»)
| | Fàcil | **Normal** | Difícil | Llegenda |
|---|---|---|---|---|
| Reacción (R) | 0,35 s | **0,25 s** (la del rival de prueba de F1.6) | 0,18 s | 0,12 s |
| Calidad de decisión (temperatura de la elección por utilidad: cuánto se equivoca de opción) | alta | media | baja | mínima |
| Visión (cuántas opciones de pase mira) | 2 | 3 | 4 | todas, más los desmarques del lado débil |
| Agresividad (cuándo se tira a robar) | prudente | media | alta | alta, con buen timing |
| Error de pase y tiro (× el de su atributo) | ×1,3 | ×1 | ×0,85 | ×0,75 |
| Portero (F1.8): reacción | +0,08 s | 0 | −0,03 s | −0,05 s |

**Los compañeros del humano juegan siempre en Normal** (propuesta; decisión 11). Si fueran «Fàcil» en Fàcil, el humano sufriría con sus propios compañeros.

### 3.7 Atributos de jugador (`feel.ts`)
Los valores de `tuning.ts` son los de un jugador **medio (75)** (DECISIONS 2026-10-02). Cada atributo modula sus números dentro de un rango configurable (`attributes.*`, ±10-15 %). **Con 75 en todo, todo sale idéntico a hoy** (lo protege un test).

| Atributo (Ficha 4) | Qué modula | Rango inicial |
|---|---|---|
| `speed` | `skating.maxSpeed`, `sprintSpeed`, `dribble.sprintSpeedWithBall` | ±8 % |
| `acceleration` | `skating.accel`, empujón de sprint | ±12 % |
| `agility` | giro máximo, radio de giro, frenada previa de la trencada (`cut.prepTime`) y su salida | ±12 % |
| `control` | ya existe (separación, recepción) | — |
| `dribbling` | regates de F1.6 (`movesFor`) | lo de F1.6 |
| `passing` | ya existe (error del pase) | — |
| `shotPower`, `shotAccuracy` | ya existen (F1.5c) | — |
| `marking` | distancia de marcaje, reacción al desmarque | ±0,4 m, ±0,05 s |
| `tackling` | probabilidad y alcance del robo (`defenderFor`, F1.6a) | ±15 % |
| `physical` | «masa» en los choques (`collidePlayers` hoy usa masas iguales), proteger la bola | ±20 % |
| `stamina` | **nada en F2** (decisión 10: con los cambios, en F3) | — |
| `vision` | opciones de pase que mira la IA, ver los desmarques | ±1 opción |

Se calculan una vez por jugador al crear el partido (sin asignaciones por tick) y se recalculan si cambias los números en el panel.

### 3.8 El humano dentro de su equipo
El cerebro de equipo **reparte roles también contando con tu jugador** (por su posición), pero nunca le da órdenes. Tus compañeros se adaptan a lo que haces:
- si te vas al ala, el ala de tu lado ocupa otro hueco;
- en defensa, si tú presionas, los otros cubren y cierran líneas;
- si te quedas atrás, el que presiona es otro.

**Consecuencia importante:** con «el control pasa al receptor» (docs/03 §3), **siempre controlas al que lleva la bola en tu equipo**. Por eso, en tu equipo la IA solo juega **sin bola**: apoyos, desmarques y defensa. La IA con bola (`carrier.ts`) es para los rivales, para los partidos IA contra IA del banco y para el saque del portero.

## 4. Roles y formación 4+1
### 4.1 Roles
| Rol (i18n ca) | Qué hace en ataque | Qué hace en defensa | Posición de la Ficha 4 que lo suele jugar |
|---|---|---|---|
| **Porter** | Saca y juega con el stick (F1.8 + §9) | Su área | GK |
| **Defensa (tancament)** | El último: da salida, recibe atrás, equilibra (no sube a la vez que todos) | El último del cuadro, delante del portero | DEF |
| **Ala esquerra / dreta** | Las bandas: recibir, conducir, tiro exterior, desmarques al segundo palo | Los lados del cuadro | MID / FWD |
| **Pivot** | El más adelantado, cerca del área y a menudo de espaldas: recibe y hace la media vuelta (F1.5b), ocupa el espacio de detrás de la portería | El de delante del cuadro, el primero en presionar | FWD |

La Ficha 4 (`docs/ASSETS_SPEC.md`) guarda la posición como `GK / DEF / MID / FWD` («provisional, la ajusto en F2»). Propuesta: **mantener esos campos en los datos** y **repartir los roles en cada partido** según la forma y la posición, porque las rotaciones cambian quién hace qué (decisión 13).

### 4.2 Formas de ataque
Marco de referencia: «x de ataque» = metros hacia la portería que atacas (la línea de gol rival está en +17,2 y la propia en −17,2). El área llega hasta x = 11,8 y mide 9 m de ancho (y entre −4,5 y +4,5). «y» positiva = a la izquierda mirando hacia donde atacas. Todos los valores son iniciales (`shapes.*` en tuning).

| Rombo 1-2-1 | x | y |   | Cuadrado 2-2 | x | y |
|---|---|---|---|---|---|---|
| Defensa | 3,5 | 0 |   | Atrás izquierda | 6,0 | +4,0 |
| Ala izquierda | 9,5 | +6,5 |   | Atrás derecha | 6,0 | −4,0 |
| Ala derecha | 9,5 | −6,5 |   | Delante izquierda | 13,5 | +5,5 |
| Pivot | 14,0 | 0 |   | Delante derecha | 13,5 | −5,5 |

- **La forma se desplaza con la bola:** y + 0,35 × y de la bola; x + 0,25 × (x de la bola − 9), como mucho ±3 m. Siempre a ≥ 1,5 m de la valla.
- **Detrás de la portería:** con la bola a x > 15, el atacante de delante más cercano puede ocupar el hueco de detrás (x 18,8; y ±1,2), si F1.6g está hecho.
- **«La rueda»:** en ataque organizado, cada 6-10 s (al azar con `aiRng`) o tras 3 pases sin avanzar, los roles giran un puesto (ala izquierda → pivot → ala derecha → defensa → ala izquierda). Cada jugador va corriendo a su nuevo punto, y esa carrera es un desmarque. Nunca gira si el portador está apurado, y el defensa es siempre el último en salir de atrás.
- **Forma por equipo:** `style` y `defenseSystem` de la Ficha 4. Rombo para `balanced` / `attacking`; cuadrado para `defensive` / `counter`. Ajustable.

### 4.3 Formas de defensa
| Cuadro (2-2, por defecto) | x | y |   | Rombo 1-2-1 | x | y |
|---|---|---|---|---|---|---|
| Delante izquierda | −10,0 | +3,0 |   | Punta | −8,5 | 0 |
| Delante derecha | −10,0 | −3,0 |   | Lado izquierdo | −11,5 | +4,5 |
| Atrás izquierda | −13,8 | +2,5 |   | Lado derecho | −11,5 | −4,5 |
| Atrás derecha | −13,8 | −2,5 |   | Último | −14,8 | 0 |

- **El bloque se desliza hacia la bola:** y + 0,4 × y de la bola (como mucho ±3 m). La pareja de delante sube hasta 2 m cuando la bola está lejos (nunca más allá de x = −8).
- **Individual (`man`):** cada defensor marca a un atacante por el lado de la portería, a 1,2-2,0 m según `marking`. Reparto voraz por distancia, con histéresis: solo se reasigna si mejora > 2 m o tras 1 s.
- **Presión alta (`highPress`):** individual desde el campo rival, con el presionador más encima (1,2 m).
- **Cambio de sistema según el marcador** (docs/03 §7): perdiendo en los 2 últimos minutos → presión alta; ganando → cuadro. Con faltas de equipo cerca de la 10.ª (F3) → menos contacto.

### 4.4 Fases y transiciones
| Fase | Cuándo | Qué hace el equipo |
|---|---|---|
| **Ataque organizado** | Posesión estable en campo rival sin ventaja clara | Forma, circulación, «la rueda», paciencia |
| **Contraataque** | Robo o rechace con ≥ 1 compañero por delante de la bola y < 3 rivales entre la bola y su portería | 1-2 corren al espacio; el portador conduce o pasa rápido; dura 5-6 s como máximo, y luego pasa a ataque organizado |
| **Repliegue** | Pérdida de la bola | El más cercano **contiene** sin tirarse (retrasa); el resto esprinta a su punto del cuadro; objetivo: cuadro montado en ≤ 3 s («repliegue instantáneo», informe real) |
| **Defensa organizada** | Rival en ataque organizado | Cuadro, rombo, individual o presión alta (§4.3) |
| **Bola suelta** | Nadie la tiene | Solo va **uno** por equipo (el que llega antes); un segundo solo si llega < 0,3 s después y no deja al equipo sin último hombre. Evita la «melé» de todos a la bola |
| **Reinicio** | Saque, libre indirecto (F2f) | Posiciones de reinicio |

### 4.5 El jugador con bola de la IA (rivales y bancos IA contra IA)
Cada 3 ticks puntúa sus opciones y elige con una elección «suave» (con `aiRng` y la temperatura de su dificultad). Se compromete al menos 0,3 s salvo emergencia (un robo inminente).
- **Tirar:** si la «xG» supera un umbral que **baja con la paciencia** (de ≥ 0,25 al empezar la posesión a ≥ 0,08 a los 35 s, y más bajo tras ≥ 3 pases).
  - **Tipo de tiro:** carga completa si estima ≥ 0,6 s libre; rápido si hay presión; alto o picado si el portero está tumbado o hay un stick tumbado (F1.6d); primer toque o media vuelta si recibe en posición.
- **Pasar a un compañero:** probabilidad de que llegue (líneas, §3.4) × lo que gana (la xG del sitio del receptor y cuánto avanza) − el riesgo.
  - **Raso** si la línea está libre.
  - **Alto fuerte** si un stick o un cuerpo tapa la línea y el compañero está a ≤ 17 m (le llega por el aire, F1.5e).
  - **Vaselina** casi nunca: solo por encima de una muralla, a ≤ 15 m.
  - **Al espacio** a un compañero que se desmarca (§5).
  - **Pared con la valla** (`planWallPass`) si un defensor le tapa y la valla está cerca.
- **Conducir** hacia el espacio libre o hacia la portería.
- **Regatear (F1.6)** en un 1 contra 1 con espacio detrás del defensor:
  - defensor con la postura abierta → caño;
  - defensor plantado → canvi de costat;
  - finta para abrir;
  - amago si el defensor puede tirarse a tapar.
- **Proteger** con presión y sin opciones: dar la espalda al presionador o hacer la ruleta (F1.6c).
- **Estilo del equipo:** `counter` = posesiones cortas y verticales; `balanced` = circular; `attacking` = más tiros; `defensive` = más paciencia y menos riesgo.
- **Posesión de 45 s:** la regla con pérdida es de F3 (antijuego). En F2 la IA busca tirar antes de los ~35 s para que las posesiones sean creíbles.

## 5. Desmarques, líneas de apoyo y pase al espacio (P3b + P4, prioridad ALTA)
**Lo que ya hay** (v0.1.22-v0.1.24, P7):
- el pase reconoce a un compañero que corre aunque apuntes por delante de él (+52° más allá del cono);
- la bola va al punto de su trayectoria que cruza tu apuntado, hasta 2 s por delante;
- un toque llega despacio y seguro (7 m/s); cargado llega más rápido (hasta 13 m/s).

**Lo que falta** (cierre de F1.4):
- que los compañeros **corran solos** al espacio;
- que el que pasa **siga corriendo**;
- que el pase **anticipe su aceleración**. Hoy supone velocidad constante (`spaceMeet` y el adelanto de `pass.lead` 0,5 en `planPass`), así que a un compañero que acaba de arrancar la bola le llega por detrás.

### 5.1 Tipos de desmarque (`offball.ts`)
| Desmarque | Quién | Cuándo | Hacia dónde |
|---|---|---|---|
| **De ruptura** | El ala del lado débil o el pivot | El portador puede pasar (no está apurado) y hay espacio entre un defensor y la valla o la portería | Espalda de la defensa, segundo palo |
| **De apoyo** | El más cercano al portador apurado | Presión ≥ 0,5 sobre el portador | 4-7 m hacia el portador, con línea limpia |
| **Pasa y va** (P3b) | El que acaba de pasar | Tras su pase, si hay espacio por delante | 1-1,5 s hacia el hueco libre, como opción de pared |
| **Arrastre** | Un compañero de delante | El portador conduce hacia un defensor | Se lleva a su marcador para abrir el hueco |
| **Rotación** | «La rueda» (§4.2) | Ataque organizado | Al punto del rol siguiente |

- **Límites, para no romper la forma:**
  - como máximo **un desmarque de ruptura y un apoyo a la vez**;
  - el defensa (tancament) no se desmarca si los demás están por delante;
  - cada carrera se mantiene (compromiso de 1-1,5 s) para que se lea y no tiemble.
- **Con el humano llevando la bola,** tus compañeros hacen todo esto. Tras tu pase, tu antiguo jugador pasa a ser IA y hace el «pasa y va»: así la pared con un compañero sale sola, sin la devolución automática de la v0.1.20, que solo funciona con «el control pasa al receptor» = No.

### 5.2 Líneas de apoyo
Cada atacante sin bola, cada 10 Hz, prueba **9 puntos**: el de su rol más 8 en un anillo de 2,5 m alrededor. Se queda con el mejor según:
- línea de pase limpia desde el portador (holgura ≥ 1,2 m respecto a los sticks rivales);
- distancia de 4 a 12 m;
- no quedarse por detrás del portador salvo para apoyarle;
- ≥ 4 m de separación con otros compañeros;
- dentro de su forma.

Coste: 4 jugadores × 9 puntos × 5 rivales = 180 comprobaciones, unos 10 µs, una vez cada 6 ticks. Al llegar se queda quieto hasta que su punto se aleje (el `botSettled` de hoy, sin tics).

### 5.3 P4: el pase anticipa la aceleración del que se desmarca
- **La intención es pública.** Cada jugador de la IA publica su **intención de carrera** en su estado: punto de destino, velocidad objetivo, sprint sí o no, y hasta cuándo (`runX/runY/runSpeed/runUntil` en `PlayerState`). Es estado de la simulación, determinista.
- **`planPass` predice la trayectoria del receptor** con el modelo de aceleración de la pared con la valla (`travelled(t)` de `wallPass.ts`), hacia el punto de su intención:
  - si el receptor es de la IA y tiene una carrera activa, la usa;
  - si no la tiene (o es el humano), usa velocidad constante, como hoy.
  
  Sirve tanto para el pase al pie (adelanto) como para el pase al espacio (`spaceMeet`).
- **Tú sigues eligiendo cuánto por delante** (P7: Mitjana respeta tu apuntado al 100 %). Lo nuevo es que el «camino» del compañero sobre el que cae la bola es el real, no una recta a la velocidad de ese instante.
- **P13** (alto fuerte por delante de un compañero que corre: con Mitjana a 20° la tiene el 79-81 %, a 29° el 47-49 %). Con la intención conocida, la opción (a) de P13 («que lo encuentre donde estará cuando llegue la bola») sale casi gratis. Se mide y se decide en F2c (decisión 7).

### 5.4 P8: ¿llegada sincronizada?
El riesgo ya anotado en docs/03: una bola al espacio que llega despacio (7 m/s) es fácil de interceptar. En F2c se **mide con la defensa de la IA** (`runSpace` ampliado):
- % de pases al espacio interceptados con la llegada de hoy;
- frente a P8 (calcular la velocidad para que bola y compañero lleguen a la vez, entre un mínimo y un máximo).

Guillem decide con la tabla (decisión 7). Regla de diseño de la v0.1.24: ningún cambio puede bajar la velocidad de un pase al pie.

### 5.5 Aviso del desmarque
Para pasar al espacio hay que **ver** la carrera. Con la cámara TV a 21 m una cápsula que arranca se lee mal. Propuesta (decisión 6): una **marca discreta en el suelo** bajo el compañero que pide la bola, por ejemplo una flecha corta celeste hacia donde va, mientras dura su carrera. Interruptor en Configuració, encendido de fábrica. La animación de «pedirla» (brazo) llega en F4.

## 6. Defensa de la IA
### 6.1 Sobre el rival de prueba de F1.6
`ai/defender.ts` (F1.6a) ya tiene lo esencial de un defensor 1 contra 1:
- **Encara:** se mantiene entre la bola y su portería a ~1,8 m, se desliza de lado y hacia atrás hasta 3 m/s, con 0,25 s de reacción.
- **Stick con tirada de robo:** pala a ~1 m que barre ±70°; si la bola pasa a ≤ 0,35 m, se tira una vez.
- **Estados:** plantado, reaccionando, picado (se ha comprometido a un lado), tapando (stick al suelo tras un amago) y recuperando.
- **Postura abierta o cerrada** (F1.6c).

**F2 no lo duplica: lo generaliza.**
- El defensor deja de ser «el rival de prueba delante de ti». Ahora es **cualquier jugador que defiende**, de cualquiera de los dos equipos, con un **objetivo que le da el cerebro de equipo** (a quién encarar, qué punto ocupar).
- Su API pasa de «un rival fijo contra el jugador controlado» a `defendStep(world, i, assignment, out)`.
- Los modos Apagat / Quiet / Encara se quedan para el **modo Entrenamiento** (el reto «regatear a un defensa estático» de docs/06 F1) y para el banco de regates (`dribbleBench`), que sigue sirviendo de regresión.

### 6.2 Papeles en defensa (los reparte `team.ts` cada 10 Hz)
| Papel | Quién | Qué hace | Base |
|---|---|---|---|
| **Presionador** | El que llega antes al portador por el lado de su portería | **Contener** (Encara de F1.6): a 1,5-1,8 m, frente a él, imitando sus movimientos laterales; solo intenta robar en los momentos buenos (§6.4) | `defender.ts` |
| **Cobertura** | El segundo más cercano | 3-4 m por detrás del presionador, en la línea portador → portería: si el portador lo supera, encara él | nuevo |
| **Cerrar líneas** | Los otros dos | En su punto del cuadro, corridos hacia la línea de pase al atacante más peligroso (el pivot); su stick tapa esa línea | nuevo |
| **Lado débil** | El más lejano | Vigila el desmarque al segundo palo y vuelve al cuadro | nuevo |

- **El humano es un comodín.** Si tu jugador está presionando, nadie más presiona y el reparto se rehace sin ti.
- **Sin melés.** Nunca hay más de un presionador, más un segundo solo en el «2 contra 1» de un portador acorralado contra la valla.

### 6.3 Intercepciones y la «muralla de sticks»
- **Intercepción:** cuando sale un pase rival, cada defensor calcula si llega con el stick a algún punto de la línea antes que la bola (§3.4, con su reacción). Solo va si su margen es ≥ 0,1 s y no deja un hueco peor (no sale el último del cuadro). La intercepción real es la de siempre: la tirada de recepción (`receiveBall`) cuando la bola llega a su pala, más la tirada de robo del stick de F1.6a si la bola pasa cerca. No hay que inventar nada.
- **Muralla de sticks** (decisión 5): el stick **pasivo** de todos los que defienden (el modelo de F1.6a, a ras de suelo) también **desvía rasos** que le pasan cerca: pases y tiros. Los pases y tiros altos (alto fuerte, vaselina, tiro alto y picado) pasan por encima. Es justo para lo que existen («el picado o bombeado se usa sobre todo para saltar una muralla de sticks», informe real) y da sentido al gesto de altura que ya tienes. Interruptor y números en el panel, para comparar con y sin.
- **Bloqueo de tiros:** los cuerpos ya bloquean. Ante una carga de tiro, el defensor en la línea de tiro **se tira a tapar** (estado «tapando» de F1.6d) y, si era un amago, queda tumbado: el premio del amago.

### 6.4 Robar sin «ir a lo loco»
El presionador **no se tira** por defecto. Solo prueba el stick (una tirada de F1.6a con más alcance) en los momentos en que el portador es vulnerable:
- la bola separada (sprint, giro cerrado, toque pesado de recepción);
- de espaldas;
- en la frenada previa de la trencada;
- cargando un tiro de arrastre («se puede robar mientras carga», idea a del informe real);
- recogiendo un pase.

La agresividad (dificultad y atributo `tackling`) baja ese umbral. Si falla, pasa a «recuperando» 0,4 s y el atacante se va: es el riesgo y la recompensa. Esto es lo que deja jugar a los regates de F1.6 contra un defensor de verdad.

### 6.5 Faltas (preparación para F3)
- Cada contacto queda registrado con su tipo: entrada por detrás, empujón con velocidad, stick al cuerpo.
- **En F2 solo se pitan las faltas leves claras** → libre indirecto (decisión 9).
- Las faltas de equipo, las tarjetas y las directas son de F3.
- La IA ya evita las entradas por detrás (es «disciplinada»). En F3 se le dará más o menos contacto según las faltas de equipo (docs/03 §7).

## 7. Defender tú: robo, contener y cambio de jugador
### 7.1 Controles (docs/03 §3, ya escrito; ningún botón nuevo)
docs/03 §3 dice: «En defensa: PASE → cambiar jugador, TIRO → entrada/robo, REGATE (mantener) → presionar». Se aplica cuando **un rival lleva la bola** (`ball.owner` es del otro equipo). Así no se pisa con lo que ya hacen esos botones sin bola:

| Botón | El rival lleva la bola | Bola suelta (como hoy) |
|---|---|---|
| **Passada** | **Canvi** (cambiar de jugador) | Pase al primer toque en el búfer |
| **Xut** | **Entrada / robo** | Primer toque o remate en el aire |
| **Regat mantenido** | **Contener** (tu jugador se coloca solo delante del portador) | — |
| **Canvi** | Canvi | Canvi |

- **Entrada (Xut):** un golpe de stick de 0,15 s de parte activa con el modelo de stick de F1.6a, con un poco más de alcance (+0,3 m) y de probabilidad.
  - Probabilidad: tu `tackling` frente al Control y al Regate del portador, y el momento (§6.4).
  - Si fallas: 0,4 s recuperando.
  - Desde detrás o con contacto fuerte: falta leve (§6.5).
- **Contener (Regat mantenido):** la simulación lleva a tu jugador como el Encara de F1.6. El joystick ajusta lado y distancia, y al soltar Regat vuelves al control libre. Es el «jockey» del FIFA. Hace falta un campo `dribbleHeld` en `PlayerCommand` (hoy Regat solo es una pulsación).
- Con la bola, Regat sigue siendo el regate de F1.6, y en la opción B de F1.6, Regat ↗ = aixecar. En defensa no hay bola que levantar, así que no se pisa.

### 7.2 Cambio de jugador en defensa (decisión 2)
**Problema:** hoy, cuando un rival lleva la bola, el cambio automático te pasa al compañero **más cercano a la bola**. Si estabas marcando al pivot a propósito, te lo quita. Y el más cercano puede estar ya superado (detrás del portador).

| Opción | Cómo funciona | A favor | En contra |
|---|---|---|---|
| **A. Automático** (hoy) | Al más cercano a la bola, con histéresis | No hay que pensar | Te quita el jugador cuando no quieres; a veces te da uno superado |
| **B. Assistit** (propuesta) | Automático **solo en momentos claros**: sale un pase rival (al defensor que llega antes al receptor), tu jugador queda superado (el portador está ≥ 2 m más cerca de tu portería que tú) o la bola queda suelta. **Nunca** mientras mueves el joystick con intención (≥ 30 % del recorrido en los últimos 0,3 s) ni durante una entrada | Lo hace solo cuando lo agradeces; no te quita la marca | Algo más de reglas que afinar |
| **C. Manual** | Solo Canvi / Passada (y el cambio al receptor en ataque) | Control total | Exige pulsar mucho; difícil en el móvil |

- **Recomendación:** **B por defecto** y un ajuste en Configuració «Canvi en defensa: Automàtic / Assistit / Manual».
- **A quién te lleva Canvi en defensa:** al **mejor defensor**, no al más cercano: el que antes llega al camino del portador por el lado de tu portería, penalizando a los superados. Si vuelves a pulsar, al siguiente de esa lista.
- **Anillo del siguiente:** un anillo pequeño (blanco) bajo el compañero al que irías al pulsar Canvi, solo en defensa. Se puede quitar en el panel.
- **Sin parpadeos:** la histéresis de la v0.1.17 se mantiene (≤ 2 cambios en 5 s con la bola oscilando, test existente). Tras un cambio el joystick no se bloquea.

## 8. Presión rival en el error del tiro y del pase
### 8.1 Hoy
`pressureOn(p)` = el rival más cercano a menos de 1,8 m, de 0 (lejos) a 1 (en contacto). Ya actúa sola en cuanto hay rivales:
- **Conducción:** separación +0,4 m con presión máxima. Con F1.6 el rival de prueba ya la provoca.
- **Pase:** +4° de error con presión máxima (`pass.errorPressure`).
- **Tiro y remate en el aire:** el factor existe en el contexto del error (F1.5c), pero su peso es **0** (`shot.ctxPressure`).
- **Recepción:** no cuenta.

### 8.2 Propuesta: presión «de la acción»
Una función nueva, `actionPressure(p, dirección)`. La de hoy se queda tal cual para la conducción, donde funciona.
- **Cercanía:** cada rival a menos de 2,5 m aporta su cercanía c = (R − hueco) / R.
- **Hacia dónde está:** el rival **delante** (en ±60° de la dirección del pase o del tiro: tapa) pesa 1; **de lado** 0,7; **detrás** 0,4 (molesta el cuerpo, no la línea).
- **Si se acerca:** hasta +0,3 si viene a más de 3 m/s.
- **Varios rivales:** se combinan sin pasar de 1 (1 − Π(1 − cᵢ·wᵢ)). Dos rivales encima presionan más que uno.
- `pressure.directional` = 0 reproduce exactamente `pressureOn` (compatibilidad).

**Dónde se aplica** (cada peso en una sección «Pressió» del panel; **todos los pesos nuevos a 0 = v0.1.29 / F1.6 idéntico**):

| Consumidor | Hoy | Propuesta inicial (se mide antes de fijarla) |
|---|---|---|
| Error del pase | +4° (`errorPressure`), presión simple | La misma, con la presión de la acción |
| Error del tiro (y remate en el aire) | `ctxPressure` 0 | 0,5-0,8 (presión máxima = +50-80 % del error base, menos lo que quite la asistencia, `ctxAssist`) |
| Recepción | nada | `receive.pressurePenalty` 0,15-0,25 de dificultad con presión máxima (un receptor marcado controla peor) |
| Primer toque | nada aparte | lo hereda de la recepción (su error ya crece con la dificultad de la recepción) |

**Cómo se calibra (F2b):** banco del tiro y del pase con un defensor a 0,5 / 1 / 1,5 / 2,5 m delante, de lado y detrás.
- Objetivo propuesto: **tiro rápido raso a 7 m de frente con presión máxima: 75-85 % entre los palos** (hoy 94 % sin presión). Carga completa a 14 m con presión: −10 a −15 puntos.
- Ningún caso sin presión cambia.
- Se comprueba que el peor caso (presión + sprint + ángulo + distancia) no quede por debajo de lo razonable: a definir con Guillem, porque su «techo de dureza» de F1.5c se fijó sin rivales.
- Guillem decide los pesos con la tabla (decisión 4).

## 9. Portero: qué hace F1.8 y qué añade F2
**F1.8 (antes de F2), portero IA básico** (docs/03 §5 y lo que reserva `REFERENCIA_PARTIDOS`):
- colocación en el arco según el ángulo de la bola;
- postura agachada, «mariposa» ante tiros desde el área, estirada;
- modelo de parada determinista (`world.rng`) con `reflexes`, `positioning`, `stretch`;
- rechaces con la física de siempre;
- reacción a amagos con la señal `p.shotFeintTick` de F1.6d.

**Lo que F1.8 debe dejar preparado para F2** (contrato):
1. El portero es un `PlayerState` con `role = 'gk'`, su perfil en `feel.ts` (`goalkeeperFor`) y su cuerpo para la bola (protecciones más anchas que el cilindro de un jugador).
2. Se mueve con `PlayerCommand`, ampliado con un campo de postura (`gkStance`: de pie / agachado / mariposa / estirada a un lado). Así el control manual del portero en directas (F3, docs/03 §5) usa la misma vía.
3. `ai/goalkeeper.ts` es una función `goalkeeperStep(world, i, out)` sin estado global, igual para los dos porteros.
4. Eventos de parada, rechace y bola atrapada (§10.4).

**F2 añade:**
- **Saque del portero:** cuando ataja la bola, la juega en ≤ 3 s con un pase de la IA (`carrier.ts` restringido a pasar) a un compañero libre. Si es de tu equipo, al salir el pase controlas al receptor. **El humano nunca controla al portero en juego** (docs/03 §5).
- **Anticipa el pase atrás** (docs/03 §5) cuando la bola está detrás de la portería o en el pivot.
- **Sale en el 1 contra 1** con un atacante solo (`rushing`).
- **Coordinación:** si el portero está fuera de sitio, el último del cuadro cubre la línea de gol.

## 10. Cambios en la simulación y en las interfaces
### 10.1 Estado
| Dónde | Qué se añade | Para qué |
|---|---|---|
| `PlayerState` | `role`, `attrs` (los 13 atributos de pista o los 5 de portero de la Ficha 4), `runX/runY/runSpeed/runUntil` (intención pública, §5.3), estado de entrada y recuperación (lo de F1.6a generalizado), `gkStance` (F1.8) | Roles, atributos, P4, defensa |
| `world.ai` (nuevo, un registro por jugador) | Decisión actual y desde cuándo, objetivo, compromiso, a quién marca, punto del rol, próximo tick de decisión | El cerebro privado de cada jugador |
| `world.teams[2]` | Lado (dirección de ataque en cada parte), sistema defensivo, forma de ataque, estilo, fase, roles (índice de jugador por rol), presionador, cobertura, marcajes, próxima rotación | Cerebro de equipo |
| `world.match` | Parte, reloj (corriendo o parado), resultado, reinicio en curso (tipo, equipo, punto, cuenta atrás), posesión (equipo, desde qué tick, pases) | Reglas base (F2f) y métricas |
| `world` | `mode` ('training' / 'match'), `aiRng`, anillo de fotos para la percepción con retraso, `difficulty`, `humanTeam` | §3 |

**Un solo humano en F2.** `world.controlled` se queda. Si sale barato, el estado que solo existe para el humano (`volley`, `latchDir`, `aimPlan`, `shotAim`…) se agrupa en un «asiento» (`HumanSeat`), porque el online 1 contra 1 (F7) necesitará dos. Si toca los bancos de F1, se deja para F7. Es una decisión técnica.

### 10.2 Órdenes (`PlayerCommand`)
- `dribbleHeld` (Regat mantenido = contener, §7.1).
- Las de F1.6: `lift`, `shotFeint`, `swipeStrike`, `swipeAimX/Y`, `swipeHeight`.
- La de F1.8: `gkStance`.
- **Nada específico de la IA:** la IA no tiene órdenes que tú no tengas (por ejemplo, «pasa al jugador 3»). Apunta con el joystick.

### 10.3 Arreglos y generalizaciones (F2a)
- `findReceiver`, `nearestBot`, `nearestTeammate`, `supportSide` y `ballLooseForTeam`: por **equipo del jugador**, no el equipo 0 fijo.
- `attackedSide` según el lado del equipo en esa parte (cambio de campo en la segunda parte).
- **Recogida justa:** si varios sticks tienen la bola a tiro en el mismo tick, la intenta primero **el más cercano a la pala**; con empate exacto, uno al azar con `world.rng`. Ya no gana el índice.
- `freePlayBallRules` → `rules/match.ts` en modo partido. En Entrenamiento sigue igual.
- `createMatch(seed, local, visitante, opciones)` junto a `createWorld` (Entrenamiento): los bancos de F1 siguen usando `createWorld`.

### 10.4 Eventos de juego
`world.gameEvents` (se vacía cada tick, como `world.events` de la bola): cambio de posesión, pase lanzado (de, para, tipo), intercepción, robo o entrada (éxito o no), falta (tipo, punto), tiro (de, a puerta o no), parada, gol, reinicio y fin de parte.
- Sirven para el marcador y las estadísticas, el audio y la vibración (F4) y los disparadores de la IA (re-decidir al momento).
- Sobre todo, para **medir en los bancos** sin mirar dentro de la IA.

### 10.5 Datos y ajustes
- **Equipos de prueba** en `src/data/teams.json`, con el formato de la Ficha 4: 2 equipos inventados de 10 jugadores con atributos alrededor de 75 (decisión 12). Los carga `src/game` y pasa a la simulación solo datos (la simulación no lee archivos).
- **Tuning nuevo:** `ai`, `shapes`, `defence`, `tackle`, `pressure`, `attributes`, `match`, `difficulty`, cada valor con meta y etiquetas ca/es/en.
- **Para no inflar el panel** (coordinar con la §E de la auditoría): un grupo «IA» con ~20 mandos de tacto (reacción, agresividad, distancias de contener y cubrir, paciencia, pesos de presión, muralla de sticks…). El resto, en `tuning.ts` con su meta, como ajustes avanzados.

### 10.6 Tests nuevos
- **Determinismo con 10 jugadores:** un partido IA contra IA de 2 × 5 min con la misma semilla da el mismo estado final (el `JSON.stringify` de `determinism.test.ts`), también a velocidad de juego 80 / 100 / 140 %.
- **Separación del azar:** con la IA apagada (Entrenamiento), `world.aiRng` no se toca y `stepWorld` es idéntico tick a tick a la v0.1.29.
- `simPurity.test.ts` cubre `src/sim/ai/` y `src/sim/rules/` (ya recorre subcarpetas).
- **Atributos:** todo a 75 = idéntico. Los extremos (40 y 99) dan los rangos de la tabla del §3.7.
- **Recogida justa:** dos sticks a la misma distancia → no gana siempre el mismo índice.
- **Reglas base:** saque, gol, fuera, falta leve, reloj y cambio de campo (unitarios en `tests/unit/rules/`).

## 11. Rendimiento con 10 entidades (8 jugadores + 2 porteros)
**Presupuesto supuesto:** ≤ 1-2 ms de simulación por tick en el Pixel 8a.
- A 60 fps y velocidad de juego 100 % hay ~1 tick por fotograma; a 140 %, ~1,4.
- Si un fotograma se retrasa, el bucle recupera hasta 5 ticks (`sim.maxStepsPerFrame`). Ese fotograma de recuperación es el peligroso.
- **Objetivo propuesto para F2** (el de F1.6 es ≤ 0,03 ms/tick con CPU ×4 y un rival): **p95 ≤ 0,5 ms y máximo ≤ 1 ms por tick con CPU ×4**, en un partido IA contra IA completo.

**Estimación de la IA** (contenedor → Pixel ×4; se mide en cada sub-paso):

| Parte | Contenedor | Pixel estimado |
|---|---|---|
| Física de hoy con 10 jugadores | 11-17 µs | 0,05-0,07 ms |
| Percepción (cada tick) | 10-20 µs | 0,04-0,08 ms |
| Equipo (10 Hz, prorrateado) | ~3 µs | ~0,01 ms |
| Apoyos y desmarques (10 Hz, 9 puntos × 5 rivales, prorrateado) | ~5 µs | ~0,02 ms |
| Jugador con bola (20 Hz, líneas a 4 compañeros, prorrateado) | ~5 µs | ~0,02 ms |
| Defensa (intercepciones al salir un pase, contener cada tick) | ~5-10 µs | ~0,02-0,04 ms |
| Pilotaje de 10 jugadores | ~3 µs | ~0,01 ms |
| Sticks en los sub-pasos de la bola (10 palas × hasta 24 sub-pasos) | ~5-10 µs | ~0,02-0,04 ms |
| **Total típico** | **~50-80 µs** | **~0,2-0,35 ms** |

**Lo que puede pasarse del presupuesto:**
1. **`planPass` de pases altos: ~0,55-1,9 ms por llamada en el contenedor.** La IA nunca lo usa para comparar opciones (§3.4), pero cada pase alto que sale lo llama una vez: un pico de 2-8 ms en el Pixel en ese tick (estimado).
   - **Mitigación:** una tabla precalculada de salidas del alto fuerte y la vaselina (ángulo y velocidad por distancia y carga), hecha al crear el partido y al cambiar los números de la bola. El cálculo exacto sigue disponible para el humano y para los tests.
   - **Hallazgo para la §C:** la flecha del pase ya hace ese cálculo **cada tick** mientras mantienes Passada con alto fuerte o vaselina. Puede costar fotogramas hoy. Se puede recalcular solo si el joystick se mueve más de 1° o cada 4 ticks.
2. **Fotograma de recuperación** (5 ticks seguidos) con decisiones coincidentes. Mitigación: decisiones desfasadas (cada jugador en su tick), nunca todas en el mismo.
3. **`predictContact` para todos** (si la IA remata en el aire): solo para el receptor de un pase en el aire, nunca para los 10.
4. **Intercepciones calculadas cada tick:** solo al salir un pase y en la cadencia de decisión.
5. **Render** (no es la simulación, pero cuenta en el móvil): 10 cápsulas con stick, dorsal y anillo. Con dorsales en un atlas (no una textura por jugador) y materiales por color, dentro de los presupuestos de docs/04 (≤ 60 draw calls como objetivo).

**Banco de rendimiento** `aiCostBench` (con PATINS_BENCH): µs por tick (mediana, p95, máximo) en 20 partidos IA contra IA, separando física e IA. Se repite en cada sub-paso, y `perf.spec.ts` (Playwright, CPU ×4) con el partido 5 contra 5.

## 12. Sub-pasos
**Al final de cada sub-paso** (CLAUDE.md):
- build OK, Vitest OK, Playwright OK;
- banco J sin cambios en Entrenamiento;
- determinismo con 10 jugadores;
- commit, versión **0.2.N**, PROGRESS.md, despliegue y lista de qué probar.

Cada sub-paso puede necesitar 1-2 versiones.

**Bancos comunes** (todos con `PATINS_BENCH`, no corren en el CI):
- **`matchBench.ts`:** partidos IA contra IA de 2 × 5 min (36.000 ticks) con semillas fijas, los dos equipos iguales (atributos 75).
- **`humanAttackBench`:** un «humano» de guion (el de `passBench`: reacción de 0,25 s, toque de 0,1 s, error de apuntado) con políticas sencillas: circular, penetrar, tirar de lejos.

### F2a: Cimientos del partido
- **Qué se hace:**
  - `createMatch`: 2 equipos 4 + portero (F1.8) con los datos de prueba, roles, lado de ataque y atributos por `feel.ts` (75 = idéntico).
  - Los arreglos del §10.3: el equipo 0 fijo y la recogida justa.
  - `aiRng`, `gameEvents` y el **esqueleto de la IA**: percepción con retraso, cadencias, pilotaje y reparto de roles.
  - **IA mínima, para poder jugar ya:**
    - en defensa, el más cercano encara (Encara de F1.6) y el resto va a su punto del cuadro;
    - en ataque, conduce hacia la portería, pasa al compañero con la línea más limpia y tira a ≤ 10 m.
  - Gol → saque desde el centro para el que lo recibe. Fuera → la bola al rival junto a la valla (provisional hasta F2f).
  - Entrada temporal desde el panel: «Partit de prova 5 contra 5». El menú llega en F2f.
- **Banco y objetivos:**
  - 20 partidos IA contra IA de 2 × 2 min: **0** NaN, 0 jugadores o bolas fuera de la pista, 0 excepciones.
  - Mismo resultado con la misma semilla.
  - Coste: p95 ≤ 0,1 ms y máximo ≤ 0,25 ms por tick en el contenedor.
  - Banco J (Entrenamiento) **idéntico**.
- **Tests:** §10.6.
- **Qué probar en el móvil:**
  - [ ] Panel → «Partit de prova»: salen 10 jugadores; los rivales de otro color y los porteros distintos.
  - [ ] Los rivales te encaran y se colocan delante de su portería.
  - [ ] Puedes pasar entre tus compañeros y tirar; tras un gol, saque del centro.
  - [ ] ¿Sigue yendo a 60 fps? (línea de rendimiento de `?debug=1`).
- **Riesgos:** coste del render con 10 jugadores; cámara TV con 10 jugadores (¿se lee la jugada?).

### F2b: La defensa de la IA (atacas tú contra ella)
- **Qué se hace:**
  - Formas defensivas (cuadro, rombo, individual, presión alta) y su deslizamiento con la bola.
  - Papeles (presionador con el Encara de F1.6, cobertura, cerrar líneas, lado débil).
  - Intercepciones y **muralla de sticks** (decisión 5).
  - Robo «en los momentos buenos»; tapar ante cargas y amagos.
  - Repliegue.
  - **Presión de la acción** y sus pesos medidos (§8; decisión 4).
  - Revisar con defensores **P2** (trencada) y la **pared con la valla**.
- **Banco y objetivos** (`humanAttackBench` contra la defensa Normal y `matchBench` con la IA mínima de F2a en ataque):
  - Pase raso al pie de un compañero libre (holgura ≥ 2 m): llega **≥ 90 %**. Con un defensor en la línea: se intercepta **40-70 %**. El alto fuerte por encima de esa línea llega **≥ 75 %**.
  - Tiros contra el cuadro desde fuera del área: **≥ 55 %** del total.
  - Cuadro montado tras una pérdida: mediana **≤ 3 s**.
  - Atacar recto sin regate ni pase contra el presionador: pierde la bola **≥ 60 %** (que pasar y regatear compense).
  - **P2** (dato para la decisión 8): la trencada con bola a 7-9 m/s contra el presionador lo supera el **x %** con la frenada previa de 0,3 s y con 0,15-0,2 s. Objetivo de diseño: 40-60 %.
  - **Pared con la valla** con un defensor delante (Mitjana): recuperas la bola **≥ 60 %**.
  - Tabla del tiro y del pase con presión (§8.2).
  - Melé: con bola suelta, ≥ 3 jugadores del mismo equipo a < 2 m de ella menos del **5 %** del tiempo.
- **Qué probar en el móvil:**
  - [ ] Los rivales se cierran en cuadro delante de su área y no se tiran a lo loco.
  - [ ] Cuando mueves la bola de lado a lado, el cuadro se desliza.
  - [ ] Un raso por en medio de dos rivales a menudo lo cortan; un alto fuerte por encima, no.
  - [ ] Con un rival encima, fallas un poco más el pase (y el tiro, si se activa).
  - [ ] Si conduces recto contra uno, te la quita; con un regate de F1.6, lo pasas.
  - [ ] ¿La trencada sigue siendo justa contra ellos?
- **Riesgos:** demasiado buena (todo interceptado) o demasiado tonta; la muralla de sticks puede convertir el raso en inútil (se ajusta con su interruptor y su alcance).

### F2c: Desmarques y pase al espacio (P3b + P4; P8 y P13 medidos)
- **Qué se hace:**
  - Los desmarques del §5.1 con sus límites y las líneas de apoyo (§5.2).
  - La **intención pública** y **P4** en `planPass` (§5.3).
  - El «pasa y va» del que acaba de pasar.
  - El **aviso del desmarque** (decisión 6).
  - Medición de **P8** y **P13** con la defensa de F2b.
- **Banco y objetivos** (`runSpace` ampliado: compañero que **arranca** de 0 a sprint y compañero que ya corre; con y sin defensores):
  - **Antes de tocar:** medir cuántos pases al espacio a un compañero que acelera llegan hoy (se espera que la bola llegue por detrás).
  - Con P4, sin rivales: **≥ 90 %** (los pases a un compañero que ya corre siguen en 94-99 %, cifras de la v0.1.23-v0.1.24); con la defensa Normal, **≥ 70 %**.
  - P8 (decisión 7): % interceptados con llegada a 7 m/s frente a llegada sincronizada, y en cuánto tiempo la tiene el compañero.
  - Con el humano llevando la bola en ataque organizado: **≥ 1 desmarque cada 4 s**; nunca más de 1 de ruptura a la vez.
  - El pasa y va sale **≥ 70 %** de las veces que hay espacio.
  - **Protección:** cadenas de pases y pases sueltos (Entrenamiento) idénticos; el pase al pie a un compañero sin carrera, idéntico.
- **Qué probar en el móvil:**
  - [ ] Llevando la bola, un compañero arranca hacia el espacio y ves su marca en el suelo.
  - [ ] Pásale por delante: la bola le encuentra corriendo.
  - [ ] Después de pasar, tu jugador anterior sigue corriendo y se la puedes devolver (pared).
  - [ ] ¿Los desmarques se leen con la cámara TV?
  - [ ] ¿Te gusta cómo llega la bola al espacio (despacio y segura o a la vez que él)?
- **Riesgos:** demasiados desmarques rompen la forma; un pase al espacio lento, interceptado (P8).

### F2d: El ataque de la IA
- **Qué se hace:**
  - Formas de ataque (rombo y cuadrado) con «la rueda» y el uso de detrás de la portería.
  - El jugador con bola (§4.5), con el perfil de pase «IA», al espacio a sus corredores (lo de F2c) y la pared con la valla.
  - Tiros con su tipo, primer toque y media vuelta.
  - Regates y amago (F1.6) contra tus defensores.
  - Contraataque, posesión elástica y estilo de equipo.
  - Saque del portero (§9).
  - **Opcionales al final** (si cabe; si no, F3 o después):
    - el rebote en la valla de fondo hacia un compañero (idea b, decisión 13 de F1.6);
    - el remate en el aire de la IA simplificado (§3.5).
  - Revisar el alto fuerte largo y la vaselina si la IA los usa.
- **Banco y objetivos** (`matchBench`, 100 partidos, Normal contra Normal):
  - Duración de las posesiones: p10 **≤ 6 s**, mediana **10-20 s**, p90 **≥ 25 s** («de 5 a 40 s»).
  - Pases por posesión: mediana **3-6**, p90 **≥ 9** (cadenas de 10-15 posibles).
  - Pases completados: **78-90 %**.
  - Tiros por posesión: **0,3-0,5**.
  - Goles por partido: dentro del objetivo (decisión 12).
  - **Paciencia premiada:** el % de gol de los tiros tras ≥ 5 pases supera al de los tiros tras 0-1 pases en ataque organizado.
  - Contraataque tras un robo: tiro en **≤ 6 s** en ≥ 30 % de los robos con ventaja.
  - **Equilibrio:** posesión entre equipos iguales 45-55 %; victorias del equipo 0 de 44-56 % (sin sesgo de índice).
  - Coste: p95 ≤ 0,12 ms y máximo ≤ 0,35 ms por tick en el contenedor.
- **Qué probar en el móvil:**
  - [ ] Los rivales mueven la bola de lado a lado, a veces 8-10 pases, y rotan.
  - [ ] Cuando te roban, salen rápido; si no encuentran hueco, tiran de lejos.
  - [ ] Te intentan regatear y a veces amagan el tiro.
  - [ ] Tu portero saca la bola a un compañero.
  - [ ] ¿Se siente como un partido de verdad?
- **Riesgos:** ataque «perfecto» (demasiados pases precisos) o caótico; la IA abusa de un truco (por ejemplo, siempre la misma pared); posesiones demasiado largas o cortas.

### F2e: Defender tú (robo, contener y cambio de jugador)
- **Qué se hace:**
  - Los controles de defensa del §7.1: Xut = entrada, Regat mantenido = contener (`dribbleHeld`), Passada = Canvi cuando el rival lleva la bola.
  - El cambio en defensa con los modos A / B / C (decisión 2) y el «mejor defensor».
  - El anillo del siguiente.
  - Registro de la falta leve de una entrada por detrás.
- **Banco y objetivos** («humano» de guion que defiende):
  - **Entrada:**
    - de frente en un momento bueno (bola separada, carga, frenada previa): **40-60 %**;
    - de frente con la bola pegada: **≤ 20 %**;
    - por detrás: falta **≥ 80 %**.
  - **Contener:** el atacante de la IA tarda de mediana **≥ 2 s** en superarte sin regate.
  - **Cambio:**
    - ≤ 2 cambios en 5 s con la bola oscilando;
    - 0 cambios durante una entrada;
    - con un pase rival en Assistit, controlas al defensor que llega antes al receptor en **≤ 0,3 s** el **≥ 90 %** de las veces;
    - 0 cambios mientras mueves el joystick con intención.
- **Qué probar en el móvil:**
  - [ ] Cerca del que lleva la bola, Xut: intentas robar; si fallas te quedas atrás un momento.
  - [ ] Mantén Regat: tu jugador se pone delante del rival y le sigue.
  - [ ] Passada o Canvi en defensa: ¿te da el jugador que esperabas? ¿Se ve el anillo blanco?
  - [ ] ¿El cambio automático te ayuda o te molesta? Prueba los tres modos en Configuració.

### F2f: El partido (reglas base, marcador, Partit ràpid y dificultad)
- **Qué se hace:**
  - **Reglas base** (`src/sim/rules/`):
    - **Saque inicial:** centro, los rivales a ≥ 3 m [VERIFICAR distancia].
    - **Gol:** saque del que lo recibe.
    - **Bola fuera de la valla:** libre indirecto para el rival donde salió [VERIFICAR en el reglamento].
    - **Falta leve:** libre indirecto, con los rivales a la distancia reglamentaria [VERIFICAR].
    - **Reloj a reloj parado:** se para en gol, fuera y falta, y vuelve a correr al primer toque.
    - **2 partes** con cambio de campo y descanso.
    - **Duración** 3 / 5 / 8 / 12 min por parte (5 por defecto, docs/01).
  - **Marcador TV básico** (abreviaturas, resultado, reloj, parte) y estadísticas de final (tiros, a puerta, posesión, pases).
  - **Menú Partit ràpid:** equipos de prueba, duración, dificultad y estadio único.
  - **Dificultad** (§3.6).
  - Revisión de la **cámara lenta con rivales** (decisión 14).
  - Todo texto en ca/es/en.
- **Banco y objetivos:**
  - **100 partidos completos de 2 × 5 min** IA contra IA (Normal, más 20 en Fàcil y 20 en Llegenda): **0 bloqueos**, es decir:
    - nunca una bola muerta sin dueño y sin reinicio durante > 5 s;
    - nunca un reinicio que no se ejecuta;
    - 0 NaN y 0 excepciones.
  - Tiempo de juego exacto: 2 × 300 s.
  - Cada regla con su test unitario.
  - **Dificultad:** Llegenda gana a Fàcil **≥ 80 %**; Normal contra Normal ~50 %.
  - Cámaras lentas por minuto con rivales: medir.
- **Qué probar en el móvil:**
  - [ ] Menú → Partit ràpid → elige equipos, 5 min y Normal: partido completo.
  - [ ] Saque, gol y saque, bola fuera, descanso con cambio de campo y final con estadísticas.
  - [ ] Prueba Fàcil y Llegenda: ¿se nota?
  - [ ] ¿La cámara lenta de la volea molesta con rivales?

### F2g: Ronda de afinación 4 y cierre de F2
- **Qué se hace:**
  - Guillem juega 2-3 días, graba 30 s y dice 3 cosas que se sienten mal (docs/03 §9). Pega «PATINS tuning vX»: pasan a ser los valores de fábrica.
  - Se repiten todos los bancos.
  - Se actualizan docs/03 §5 y §7 (con lo decidido), DECISIONS y PROGRESS.
  - Se verifican los criterios del §16 y se despliega con el enlace y la lista de qué probar.

## 13. Métricas y objetivos (resumen)
| Qué | Objetivo | Banco |
|---|---|---|
| Sin bloqueos ni errores | 0 en 100 partidos de 2 × 5 min | matchBench |
| Determinismo | Misma semilla = mismo partido, a 80 / 100 / 140 % de velocidad de juego | determinism.test |
| Coste de la simulación por tick | Contenedor p95 ≤ 0,12 ms y máximo ≤ 0,35 ms; Pixel (CPU ×4) p95 ≤ 0,5 ms y máximo ≤ 1 ms | aiCostBench, perf.spec |
| Posesión | p10 ≤ 6 s, mediana 10-20 s, p90 ≥ 25 s | matchBench |
| Pases | Mediana 3-6 por posesión, p90 ≥ 9; completados 78-90 % | matchBench |
| Tiros | 0,3-0,5 por posesión; contra el cuadro ≥ 55 % desde fuera | matchBench, humanAttackBench |
| Goles | Objetivo de la decisión 12 | matchBench |
| Paciencia | % de gol tras ≥ 5 pases > tras 0-1 pases | matchBench |
| Repliegue | Cuadro montado en ≤ 3 s (mediana) | matchBench |
| Melé | ≥ 3 del mismo equipo junto a la bola suelta < 5 % del tiempo | matchBench |
| Equilibrio | Posesión 45-55 %; victorias del equipo 0 entre 44 y 56 % | matchBench |
| Pase al espacio (P4) | A un compañero que acelera ≥ 90 % sin rivales, ≥ 70 % con la defensa Normal | runSpace ampliado |
| Presión en el tiro | Rápido a 7 m de frente con presión máxima: 75-85 % entre los palos | shotBench con defensor |
| Defender tú | Entrada en momento bueno 40-60 %, con la bola pegada ≤ 20 %; contener ≥ 2 s; cambio ≤ 0,3 s tras un pase rival | humanDefendBench |
| Dificultad | Llegenda gana a Fàcil ≥ 80 % | matchBench |
| **Protección** | Entrenamiento (sin IA): banco J idéntico a la línea base de la v0.1.29 (o a la de F1 cerrada) | Banco J |

Todas son **propuestas iniciales**: tras la ronda 4, Guillem puede pedir otra cosa y los objetivos se reescriben en DECISIONS.

## 14. Riesgos
1. **IA que lo sabe todo.** Ve las posiciones exactas y calcula al instante. Mitigación: percepción con retraso (§3.3), visión limitada, elección «suave» y error por dificultad. Se prueba con Guillem: «¿parece justa?».
2. **Melé y temblores.** Todos a la bola, o jugadores que dudan entre dos puntos. Mitigación: un solo jugador a la bola suelta, compromiso mínimo en cada decisión, histéresis en los roles y llegada sin tics (`botSettled`).
3. **El pase al espacio lento, presa fácil** (P8). Se mide en F2c antes de cambiar nada.
4. **La trencada y los regates contra un defensor de verdad** pueden quedar imparables o inútiles (P2). Se mide en F2b con los objetivos de F1.6 como referencia.
5. **La muralla de sticks** puede hacer inútil el raso. Interruptor, alcance ajustable y objetivo de intercepción 40-70 % con un defensor en la línea.
6. **Picos de coste:** `planPass` de pases altos y fotogramas de recuperación (§11). Mitigación: tablas precalculadas, decisiones desfasadas y banco de coste en cada sub-paso.
7. **Romper el determinismo** al recorrer jugadores en otro orden, con un `Map` o un `Set`, o al leer el reloj. Mitigación: test de determinismo con 10 jugadores en cada sub-paso. **Online (F7):** `Math.sin`, `atan2` y compañía pueden dar bits distintos en otros motores de JavaScript (Safari frente a Chrome). Con el servidor autoritativo previsto en docs/06 no afecta al resultado, pero las repeticiones entre dispositivos distintos podrían separarse. Se anota para F7.
8. **Cambiar sin querer los bancos de F1.** Los compañeros del banco de F1.4 (`mates.ts`) y el azar se quedan intactos en Entrenamiento: banco J idéntico en cada sub-paso.
9. **El cambio de jugador en defensa,** que molesta o no ayuda. Tres modos en Configuració y prueba de Guillem (decisión 2).
10. **Legibilidad con la cámara TV:** con 10 jugadores en cápsulas de colores, ¿se ven los desmarques, el cuadro y quién presiona? Aviso del desmarque (decisión 6) y anillo del siguiente. Si no basta, la cámara Alta/táctica o adelantar algo de F4.
11. **Alcance:** 7 sub-pasos grandes. Si hay que recortar, salen primero los opcionales de F2d (rebote en la valla de fondo hacia un compañero y remate en el aire de la IA), y después el rombo defensivo y la presión alta (el cuadro y el individual bastan para la aceptación).
12. **Reglas por verificar** (distancias en el saque y en los libres, bola fuera = libre indirecto): marcadas [VERIFICAR]. Guillem puede contrastarlas con el reglamento 2026, como hizo con la bola alta.

## 15. Decisiones que debe tomar Guillem
1. **Orden de F2:** cimientos → defensa de la IA → **desmarques y pase al espacio** → ataque de la IA → defender tú → partido → afinación. El pase al espacio (tu prioridad alta) va en tercer lugar porque necesita defensores para medir si lo interceptan (P8). Recomendación: sí. Alternativa: adelantarlo al segundo lugar, medirlo sin rivales y repetir la medición después.
2. **Cambio de jugador en defensa:** A Automàtic (hoy) / **B Assistit** / C Manual (§7.2). Canvi y Passada te llevan al «mejor defensor», con un anillo blanco bajo el siguiente. Recomendación: **B por defecto**, con los tres modos en Configuració.
3. **Controles de defensa** (los de docs/03 §3, solo cuando el rival lleva la bola): Passada = Canvi, Xut = entrada, Regat mantenido = contener. Ningún botón nuevo. Recomendación: sí.
4. **Presión en el tiro y en la recepción:** activar `shot.ctxPressure` (la decisión 9 de F1.6 la pasa a F2) y la penalización nueva en la recepción, con la presión que mira dónde está el rival (§8). Los valores se proponen con la tabla medida en F2b. Recomendación: sí, con el objetivo «tiro rápido a 7 m con presión máxima: 75-85 % entre los palos».
5. **Muralla de sticks:** los sticks de los defensores desvían los rasos y los altos pasan por encima. Recomendación: sí, con interruptor en el panel.
6. **Aviso del desmarque:** una marca discreta en el suelo bajo el compañero que pide la bola. Recomendación: sí, encendido de fábrica y con interruptor en Configuració.
7. **P8 y P13 (pase al espacio con rivales):** se deciden con los datos de F2c. Recomendación previa: dejar la llegada a 7 m/s salvo que la intercepten mucho más que a un pase al pie; para P13, la opción (a) usando la intención del compañero (§5.3).
8. **P2 (trencada más corta):** se decide con los datos de F2b. Recomendación previa: no cambiar (0,3 s) salvo que contra el defensor que contiene la trencada supere menos del 40 %.
9. **Faltas en F2:** solo las leves claras (entrada por detrás, empujón fuerte) → libre indirecto; sin faltas de equipo ni tarjetas hasta F3. La IA no hace entradas por detrás. Recomendación: sí.
10. **Resistencia (stamina):** no en F2; en F3 con los cambios al vuelo (gastarla sin poder cambiar no tiene sentido). Recomendación: F3.
11. **Dificultad:** los 4 niveles cambian reflejos, calidad de decisión, visión, agresividad y error (nunca la velocidad), y **tus compañeros juegan siempre en Normal**. Recomendación: sí.
12. **Goles por partido de 2 × 5 min** (IA Normal contra Normal): objetivo **3-7**. El real (~7 en 50 min) daría ~1,5 en 10 min, poco divertido. Recomendación: 3-7, y lo ajustas en la ronda 4.
13. **Equipos y roles:** 2 equipos de prueba inventados en `src/data/teams.json` hasta que pases la Ficha 4; roles por partido (porter, defensa, ales, pivot) a partir de las posiciones GK / DEF / MID / FWD de la Ficha 4. Recomendación: sí.
14. **Cámara lenta del remate con rivales:** se queda encendida fuera de línea (ralentiza a todos por igual: es justa) y se apagará en el online (F7), donde no se puede ralentizar a dos personas a la vez. P16 (cámara lenta «fuerte») sigue aparte. Recomendación: sí.
15. **Sistema defensivo por defecto de la IA:** el **cuadro** del informe real; rombo, individual y presión alta según el equipo y el marcador. Recomendación: sí.

## 16. Criterios de aceptación de F2 (cómo se verificarán)
| Criterio (docs/06) | Cómo |
|---|---|
| 2 equipos completos 4 + portero | `createMatch`, e2e de partido (10 jugadores visibles, captura en `docs/screenshots`) |
| IA de equipo, jugador y portero (docs/03 §5 y §7) | matchBench (posesión, pases, tiros, goles, repliegue, equilibrio), humanAttackBench, prueba de Guillem |
| Cambio de jugador | `switch.test.ts` (histéresis, modos A / B / C, mejor defensor), humanDefendBench |
| Reglas base (saque, gol, reinicios, faltas leves, libre indirecto, reloj parado, 2 partes) | Tests unitarios en `tests/unit/rules/`, 100 partidos sin bloqueos |
| Marcador TV básico y Partit ràpid | e2e `match.spec.ts` (menú → partido → final), `i18n.test.ts` |
| «Un partido completo de 2 × 5 min sin bloqueos» | matchBench: 0 bloqueos en 100 partidos, más un partido completo de Guillem en el Pixel |
| «La IA ataca, defiende y marca de forma creíble» | Objetivos del §13 y el visto bueno de Guillem en la ronda 4 |
| 60 fps en el Pixel 8a con 10 jugadores | `perf.spec.ts` (CPU ×4) + línea de rendimiento de Guillem (`?debug=1`) |
| Nada de F1 cambia en Entrenamiento | Banco J idéntico, `determinism.test.ts`, `simPurity.test.ts` |

## Objeciones
*(Crítico de diseño independiente, fase 3 del bloque 2, 2026-10-10. Todo lo citado se ha comprobado en el código de la v0.1.29, en las auditorías de `docs/audit/` y en `docs/PLAN_F1_6.md`. No reescribe el plan: señala dónde falla y propone un cambio concreto.)*

**O1 — Defender con Xut y Passada choca con el búfer del primer toque** · Gravedad **Alta**
- *Qué falla:* cuando el rival lleva la bola, el plan hace Xut = entrada y Passada = Canvi (§7.1, :377-386). Pero soltar Xut sin la bola ya deja el tiro en el búfer 0,2 s (`bufShoot`, shot.ts:66-73) y pone `shotSinceRelease` a 0, que arma el remate en el aire. Soltar Passada deja el pase en el búfer (`bufPass`). Y en cuanto un jugador recoge la bola, `ballActions` dispara lo que hay en el búfer (world.ts:596-597).
- *Por qué importa:*
  - Una entrada que gana la bola, si la recoges en menos de 0,2 s, **sale disparada como tiro al primer toque**.
  - Passada = Canvi elimina justo el pase al primer toque tras interceptar, que es la salida a la contra («de ajedrez estático a un 1 contra 1 vertiginoso», REFERENCIA §1.7).
  - Además, Canvi ya existe en su propio botón (auditoría D, C2).
- *Propuesta:*
  - La entrada **vacía el búfer** de Xut y no arma el remate.
  - Passada **sigue siendo pase** en defensa (búfer para el primer toque tras robar); Canvi se queda en Canvi.
  - En defensa, las etiquetas y los iconos de Xut y Regat cambian («Entrada», «Contenir»); hoy nada lo indica.
  - Test: «entrada con éxito → 0 tiros en los 0,3 s siguientes».

**O2 — Contener y entrar a la vez no se puede hacer con un pulgar** · Gravedad **Media**
- *Qué falla:* contener = mantener Regat, y al soltar vuelves al control libre (:390). La entrada es Xut (:386). Regat está justo encima de Xut (Regat y 178-262, Xut y 278-378; tuning.ts:740-754), y el pulgar derecho no puede mantener uno y tocar el otro.
- *Por qué importa:* la secuencia natural, «contener y robar en el momento bueno» (§6.4), obliga a soltar Regat (pierdes el contener), bajar 1,5-2 cm y tocar Xut: unos 0,15-0,25 s, justo cuando el momento bueno dura poco.
- *Propuesta:* durante el contener, la entrada se hace con un golpe del joystick hacia el portador (pulgar izquierdo), o un toque de Xut mantiene el contener 0,3 s más. Métrica: «de pulsar a la entrada activa ≤ 0,1 s mientras contienes».

**O3 — Rendimiento: el pico de `planPass` ya existe hoy y el objetivo es imposible tal como está escrito** · Gravedad **Alta**
- *Qué falla:*
  - La flecha del pase llama a `planPass` en **cada tick** mientras mantienes Passada (world.ts:614-617). Con alto fuerte o vaselina, eso es ~0,55-1,9 ms por llamada en el contenedor, ~2-7,7 ms en el Pixel según la estimación del propio plan (:94-95, :100).
  - El objetivo es «máximo ≤ 1 ms por tick» (:505). Pero una sola suelta de un pase alto del humano ya cuesta 2-4,5 ms (estimado).
  - La mitigación de la IA, una «tabla precalculada» (:523), contradice el §3.4: «performPass calcula el pase exactamente igual que para el humano» (:151). Los pases de la IA volarían distinto que los tuyos.
  - Y la §C de la auditoría, a la que el plan remite (:100, :524), **no existe** (no hay `docs/audit/C.md`; PROGRESS la tiene sin hacer).
- *Por qué importa:* a 140 % de velocidad, o en un fotograma de recuperación de 5 ticks, la flecha sola puede pasar de 33 ms, el límite de docs/03:157, y eso **ya en la v0.1.29**. P4 (§5.3) mete además la predicción de la aceleración dentro de `planPass`.
- *Propuesta:*
  - Antes de F2a: medir en el Pixel con `?debug=1` mientras se mantiene un globo largo, y medir también el render con 10 cápsulas, sticks, dorsales y anillos (draw calls frente al techo de docs/04). Es la §C que falta.
  - Recalcular la flecha solo cuando el joystick o la carga cambian (una decisión técnica).
  - Hacer `planPass` barato (solución analítica, o la tabla también para el humano, la misma para todos).
  - Reescribir el objetivo como «máximo ≤ 1 ms excepto el tick de una suelta», con ese pico acotado aparte.

**O4 — Objetos de trabajo a nivel de módulo: la regla 4 receta el problema que encontró la auditoría** · Gravedad **Alta**
- *Qué falla:* la regla de oro 4 dice «objetos de trabajo reutilizados, como los que ya usa `world.ts` (`effective`, `botCtx`)» (:113). Esos temporales a nivel de módulo son justo los que, según la auditoría B (F4), dejan pasar datos de un mundo a otro, y según la auditoría E (E.3.4, punto 3) nada comprueba dos mundos intercalados. `botCtx.players` incluso guarda referencias al último mundo. La IA añade la percepción, el anillo de fotos, las tablas en caché que dependen del `tuning` (:146) y los repartos de roles.
- *Por qué importa:* los bancos de F2 crean cientos de mundos con ajustes distintos (`tuningWith`). Una tabla en caché a nivel de módulo puede contaminar un partido con los números de otro. Y el online de F7 (*rollback*, servidor) lo necesita bit a bit.
- *Propuesta:* todo el estado de trabajo de la IA dentro del mundo (`world.scratch`) o pasado como argumento, y las cachés con la clave del `tuning`. Como condición para cerrar F2a: el hash de determinismo con dos mundos intercalados (auditoría E, R1), con IA.

**O5 — En tu equipo la IA «nunca lleva la bola»… salvo cuando sí: el ajuste del panel y el portero** · Gravedad **Media**
- *Qué falla:*
  - «Siempre controlas al que lleva la bola, así que en tu equipo la IA solo juega sin bola» (:203). Eso solo es cierto con `mates.switchControl` = 1, un ajuste del panel (tuning.ts:643) que DECISIONS:135 (6) da como posiblemente tocado en el móvil de Guillem. Con 0, el compañero que recibe **te devuelve la bola** (mates.ts), un comportamiento de banco de pruebas.
  - Si el portero es un jugador `bot` de tu equipo, `nearestTeammate` (world.ts:654-669) lo acepta como candidato del cambio automático, de Canvi y del pase perdido. En tu área, el más cercano a la bola suele ser **el portero**, y docs/03 §5 dice que no lo controlas.
- *Por qué importa:* el partido haría cosas absurdas según cómo esté un ajuste del panel, o te daría el control del portero.
- *Propuesta:* en el modo partido, `switchControl` forzado a 1 o el portador de la IA también para tus compañeros. Excluir `role = 'gk'` de los candidatos del cambio, con un test para cada caso.

**O6 — Las métricas de equilibrio no tienen potencia estadística** · Gravedad **Media-Alta**
- *Qué falla:* «victorias del equipo 0 entre 44 y 56 %» y «posesión 45-55 %» con 100 partidos (:637, :720). Con 3-7 goles por partido habrá ~15-25 % de empates, así que equipos iguales ganan ~40 % cada uno: el 44-56 % falla aunque no haya sesgo. Además, el error típico con n = 100 es de ±5 puntos (±10 al 95 %). «Llegenda gana a Fàcil ≥ 80 %» (:692) con 20 partidos tiene ±18 puntos.
- *Por qué importa:* el banco dará rojos y verdes al azar y se acabará ajustando la IA para que pase.
- *Propuesta:*
  - Cada semilla jugada dos veces, cambiando de lado y de índices (partidos espejo), comparando la diferencia de goles media con su intervalo.
  - El sesgo de índice se mide con su test unitario (§10.6), no con victorias.
  - Para la dificultad, la diferencia de goles por partido con un intervalo, o n ≥ 200 partidos cortos.

**O7 — Métricas IA contra IA que se calibran solas** · Gravedad **Media**
- *Qué falla:*
  - Posesión, pases por posesión, pases completados y tiros por posesión (:630-634) son los números con los que se **afina** la IA (temperatura, umbrales de la xG). Con equipos iguales, una IA degenerada que se equivoque igual en los dos equipos también los cumple.
  - «Paciencia premiada» (:635) compara con los tiros tras 0-1 pases en ataque organizado, que por definición son tiros lejanos y malos: gana siempre.
  - «Tiros contra el cuadro ≥ 55 % desde fuera» (:579) depende de qué política del humano de guion se use.
  - «Cuadro montado ≤ 3 s» no define «montado».
  - «≥ 1 desmarque cada 4 s» (:606) se cumple con carreras inútiles.
- *Por qué importa:* el criterio de docs/06, «la IA ataca, defiende y marca de forma creíble», quedaría en verde sin serlo.
- *Propuesta:*
  - Anclar las cifras a REFERENCIA (cadenas de 10-15 pases, posesiones de 5-40 s) y medir **contra el humano de guion** con cada política por separado («penetrar: llega a tirar dentro del área ≤ X %»; «circular: más goles por posesión que tirar de lejos», que es la recomendación 10 aplicada a ti).
  - Definir «cuadro montado» (los 4 a ≤ 1,5 m de su punto) y «desmarque útil» (abre una línea con holgura ≥ 1,2 m).

**O8 — El cambio en defensa Assistit: reglas y métricas que se contradicen** · Gravedad **Media**
- *Qué falla:* la opción B «nunca» cambia mientras mueves el joystick con intención (≥ 30 % del recorrido en 0,3 s; :399). En el móvil, el pulgar izquierdo está casi siempre en el joystick, así que en la práctica B ≈ Manual. A la vez, la métrica exige que «con un pase rival controlas al defensor que llega antes en ≤ 0,3 s el ≥ 90 %» (:662). Las dos cosas solo se cumplen si el humano de guion deja el joystick suelto. Y «0 cambios mientras mueves el joystick» (:663) es la propia regla, no una medida.
- *Por qué importa:* es la decisión 2, una de las más importantes, y se tomaría con métricas que dependen del guion.
- *Propuesta:* para un pase rival, cambiar aunque muevas el joystick, pero con el joystick «enganchado» (como `latchDir` tras un pase, world.ts:172-180) hasta que lo sueltes o lo gires. Medir con el humano de guion **moviendo el joystick** el 80 % del tiempo y con contadores en el móvil (cambios por minuto, «te ha quitado la marca»).

**O9 — El orden retrasa lo que Guillem pidió primero y la primera partida jugable** · Gravedad **Media**
- *Qué falla:*
  - El pase al espacio (P3b + P4) es la «prioridad ALTA» (:29) y va tercero (:744), con el argumento de que P8 necesita defensores. Pero P4 (que el pase anticipe la aceleración, con la intención pública) **no** los necesita: el plan mismo lo mide «sin rivales ≥ 90 %» (:604).
  - Además, Guillem no puede jugar un partido de verdad (marcador, reloj, saques) hasta F2f, el sexto sub-paso.
  - F2a (:545-566) mete en un sub-paso `createMatch`, los arreglos del equipo 0, `aiRng`, `gameEvents`, la percepción con retraso, las cadencias, el pilotaje, el reparto de roles, una IA mínima para los dos lados y los reinicios: no cabe en una sesión (CLAUDE.md, regla 2).
- *Por qué importa:* la primera opinión de Guillem sobre «se siente partido» llega tarde, cuando ya está casi todo construido.
- *Propuesta:*
  - Partir F2c: c1 = desmarques + P4 + «pasa y va» justo después de F2a; c2 = P8 y P13 después de F2b.
  - Que F2a acabe con un **partido completo y mínimo** de 2 × 2 min (reloj, marcador, saque tras gol y tras fuera) para que Guillem lo pruebe ya.
  - Partir F2a en a1 (cimientos y tests) y a2 (IA mínima y partido).

**O10 — Un perfil de asistencia «IA» y una puntería exacta: no son «tus mismas reglas»** · Gravedad **Media**
- *Qué falla:*
  - El perfil interno «IA» (cono y corrección de Forta, pero respetando el espacio como Mitjana) se presenta como «decisión técnica» (:158). Pero docs/03:91 dice «los compañeros de la IA pasan siempre con asistencia Fuerte»: cambiarlo es cambiar un documento de diseño, y eso lo decide Guillem.
  - La IA apunta el joystick a un ángulo exacto (:155), mientras tu pulgar tiene error; el banco del pase ya lo modela con ±8°.
- *Por qué importa:* el pilar «la IA juega con tus mismas reglas, sin trampas» (:7, :111) no se cumpliría.
- *Propuesta:* añadirlo como decisión de Guillem. Darle a la IA un error de apuntado del joystick según la dificultad y la Visión (sd en grados, en el panel), además del error del pase.

**O11 — La IA usaría alturas ilegales a propósito** · Gravedad **Media**
- *Qué falla:* la IA tira «alto o picado» si el portero está tumbado (:257) y usa la vaselina «a ≤ 15 m» (:261). Según docs/02 («Choques con el juego actual»), el picado llega a 1,84 m de media a 10 m y la vaselina pasa de 1,50 m desde ~12 m. El art. 6.3 y el 15.1.d hacen falta técnica cualquier bola por encima de 1,50 m.
- *Por qué importa:* cuando F3 aplique la regla, el repertorio de la IA se romperá o pitará faltas contra sí misma.
- *Propuesta:* desde F2, la IA solo elige acciones cuyo punto más alto previsto sea ≤ 1,50 m (en la tabla de salidas del O3), y lo comprueba un test. Si Guillem decide «regla estricta» en F3, el humano tendrá el mismo límite.

**O12 — Tres capas de defensa nuevas a la vez sobre el tiro: no se sabrá cuál lo estropea** · Gravedad **Media**
- *Qué falla:* F2b añade a la vez la muralla de sticks que desvía rasos (:356), el bloqueo «se tira a tapar» ante **cualquier** carga (:357), el robo mientras cargas (:364) y la presión en el error del tiro (:428), todo encima del portero de F1.8. El tiro cargado de F1.5a, el preciso y potente, quedaría castigado tres veces. El techo de dureza de F1.5c se fijó sin rivales (:435).
- *Por qué importa:* si a Guillem le parece «imposible marcar», no habrá forma de saber qué capa lo causa.
- *Propuesta:* activarlas de una en una, con su interruptor y la variación de los bancos J y `shotBench` en cada paso: portero → muralla → tapar → robo en la carga → presión. Fijar con Guillem el **peor caso aceptable** antes de F2b, no después.

**O13 — La compatibilidad de la «presión de la acción» no es exacta como está escrita** · Gravedad **Baja-Media**
- *Qué falla:* «`pressure.directional` = 0 reproduce exactamente `pressureOn`» (:421). Pero la nueva usa un radio de 2,5 m y combina varios rivales con 1 − Π(1 − cᵢwᵢ), mientras `pressureOn` usa `pressureRadius` 1,8 m y el máximo (dribble.ts:29-38).
- *Por qué importa:* la promesa «todos los pesos a 0 = idéntico» se rompería sin que nadie lo note, y con ella la protección del banco J en partido.
- *Propuesta:* que el modo de compatibilidad use el mismo radio y el máximo, y añadir un test de igualdad bit a bit con `pressureOn` en 10 000 posiciones al azar.

**O14 — «Regat mantenido = contener» cambia el significado de docs/03** · Gravedad **Baja-Media**
- *Qué falla:* docs/03:77 dice «REGATE (mantener) → **presionar**». El plan lo convierte en **contener** (retrasar a distancia, el «jockey» del FIFA; :390), que es casi lo contrario de presionar.
- *Por qué importa:* es un cambio de diseño documentado y, según CLAUDE.md, hay que preguntar antes.
- *Propuesta:* añadirlo como decisión de Guillem: contener (recomendado, coherente con «no robar a lo loco») o presionar.

**O15 — Coherencia con F1.6: trabajo duplicado y lo de detrás de la portería se recorta dos veces** · Gravedad **Media**
- *Qué falla:*
  - `defender.ts` nace en F1.6a «contra el jugador controlado» y aquí se reescribe como `defendStep(world, i, assignment, out)` (:340).
  - La recogida justa llega en F2a (:479), cuando los porcentajes de los regates de F1.6 ya están medidos con el sesgo de índice a favor del humano (world.ts:558-599).
  - El rebote en la valla de fondo hacia un compañero, la recomendación n.º 1 del informe real, pasa de F1.6 (decisión 13) a «opcional al final de F2d» y es lo primero que se recorta (:626, :740).
  - El coste de hoy no coincide: ~0,03 ms aquí (:91) frente a 0,01 en PLAN_F1_6:395.
- *Por qué importa:* se programa dos veces lo mismo, se miden cifras que luego cambian y se recorta lo más importante del juego detrás de la portería.
- *Propuesta:* escribir la API del defensor y la recogida justa una sola vez, en F1.6a; hacer el autopase por la valla de fondo y las esquinas en F1.6g (objeción O9 de F1.6) y aquí solo la versión hacia un compañero, **no** recortable; usar una sola cifra de partida, medida en el Pixel.

**O16 — F2 depende de un F1.8 sin plan, y el panel crecerá cientos de filas** · Gravedad **Baja-Media**
- *Qué falla:*
  - Los requisitos previos piden F1.8 (portero) cerrado (:48), y el §9 escribe su «contrato», pero no hay plan de F1.8. Las metas de goles (decisión 12) y la «xG» (:149) dependen por completo de ese portero.
  - Por otro lado, añadir `ai`, `shapes`, `defence`, `tackle`, `pressure`, `attributes`, `match` y `difficulty` (:490) con meta y etiquetas en 3 idiomas, cuando la auditoría E ya cuenta 356 ajustes (y el 90 % de las claves de i18n son del panel), choca con «el resto en tuning.ts como ajustes avanzados» (:491): `tuningMeta.test` exige que cada número esté en el panel exactamente una vez.
- *Por qué importa:* sin F1.8 no se pueden calibrar los objetivos de F2, y el panel deja de ser útil para Guillem.
- *Propuesta:*
  - Un plan corto de F1.8 antes de F2, que fije también el portero provisional del O7 de F1.6.
  - Decidir (técnico, en DECISIONS) que las tablas de formas y de dificultad son **datos** (`src/data/*.json`, validados por un test), no ajustes de tacto. Aplicar antes las pestañas «Bàsic» / «Avançat» de la auditoría E (R3).

**O17 — Demasiadas decisiones, y algunas ya están tomadas** · Gravedad **Baja**
- *Qué falla:* el §15 tiene 15 decisiones. Algunas ya están en los documentos: la 9 (docs/06 F2 ya dice «faltas leves, libre indirecto») y la 15 (docs/03:144, «cada equipo tiene uno preferido»). Otras son técnicas: la 13 (`teams.json`) y la 1 (orden de trabajo).
- *Por qué importa:* entre los dos planes suman 31 decisiones, y el resumen final admite como mucho 8.
- *Propuesta:* dejar para Guillem la 2, la 3 (con O1 y O14), la 4, la 5, la 6 y la 11, y añadir el perfil de pase de la IA (O10). El resto, «decide Claude».

**Lo que cambiaría primero**
- Que la entrada vacíe el búfer, que Passada siga siendo pase en defensa y que los botones muestren su función en defensa (O1), más una entrada posible sin soltar el contener (O2).
- Medir y arreglar ya el recálculo de `planPass` en cada tick, y escribir un objetivo de coste alcanzable sin aproximar los pases de la IA (O3).
- El estado de trabajo de la IA dentro del mundo y el hash con dos mundos intercalados como condición de F2a (O4).
- Partidos espejo e intervalos en lugar de ventanas de victorias, y métricas contra el humano de guion (O6, O7).
- Adelantar desmarques + P4 y un partido mínimo jugable a F2a/F2c1; la API del defensor y la recogida justa, una sola vez en F1.6a (O9, O15).
