# Estado actual

Fase actual: **F1 — Game feel: conducción, pase, tiro** (plan aprobado 2026-10-02).
F0 — Cimientos: CERRADA (2026-10-02), detalle más abajo.

## Plan F1 (aprobado)
Prioridad de Guillem: que conducción, pase y tiro se sientan bien por encima de todo; Entrenamiento y portero al final.
Condiciones de Guillem: (1) 2 compañeros "pared" quietos en la pista libre para afinar el pase; (2) afinación guardada en el
móvil = solo los valores cambiados, aplicada siempre hasta "Restablir"; si Claude cambia el valor de fábrica de un ajuste,
el guardado de ese ajuste se borra y sale aviso; (3) si en F1.3 los botones no son cómodos, adelantar el editor de posición
de botones (F1.7) a F1.3; (4) calidad por defecto Mitjana hasta F4 (Alta = nativa probada: 59,6 fps, p95 17,5 ms).
- [x] F1.1 Afinación desde el móvil (panel táctil, guardado de cambios, copiar valores, aviso de valores de fábrica cambiados) + bloqueo de orientación durante la partida + etiqueta de resolución clara (v0.1.1)
- [x] F1.2 Bola física 3D (bote, rodadura, valla ~0,7, postes/larguero con colisión continua, red, gol) + render bola/stick + cámara sigue bola (v0.1.2)
- [x] F1.2b (pedido por Guillem) Sistema de cámara con presets: TV lateral (defecto) / Cercana / Alta-táctica; botón 🎥 en pantalla + opción en Configuració; se recuerda; transición suave; parámetros por preset en tuning + panel; docs/03 §6 y DECISIONS actualizados; tests de no tapar HUD (v0.1.3). Pendiente: Guillem confirma 60 fps de las 3 cámaras en el Pixel.
- [x] F1.3 Conducción (pegada al stick, separación solo con sprint / giro muy cerrado / presión, Control reduce, pérdida si supera la separación segura), botones PASE/TIRO/REGATE (mantener REGATE = sprint), teclado J/K/L/Espacio, mando, buffer 150 ms, stick acompaña la bola, pase/tiro PROVISIONALES; tamaño de bola compensado por distancia + multiplicador por cámara (v0.1.4)
- [x] Ronda de afinación 1, primera impresión de Guillem: conducción bien; botones cómodos por ahora. Cambio pedido: sprint analógico en el joystick (no en Regat) + sección "Botons" en el panel (v0.1.5)
- [x] Ronda 1, ajustes de tacto (v0.1.6): +12 % velocidad/aceleración, sprint 10 m/s con empujón al entrar, frenada de 4 ruedas (derrape) que separa la bola
- [x] Ronda 1 cerrada: valores de Guillem fijados como fábrica (v0.1.7)
- [x] Trencada (corte lateral que redirige), opción A + interruptor "solo con sprint" (v0.1.7)
- [x] Trencada equilibrada (v0.1.8): frenada previa 0,5 s, salida al 38 % con empujón suave y 0,6 s sin sprint, recarga desde el final; capa `src/sim/feel.ts` para atributos (F2)
- [x] Frenada previa de la trencada 0,5 → 0,3 s a petición de Guillem (v0.1.9)
- [x] Giro de la trencada 0,25 → 0,18 s: maniobra completa ~0,48 s (v0.1.10)
- [x] Guillem confirma que la trencada está bien (v0.1.10, cerrada)
- [ ] F1.4 Pase (plan aprobado 2026-10-02; decisiones en DECISIONS.md: toque/mantener, asistencia Ligera + selector, control al receptor por defecto, compañeros que se mueven, escala de recepción, anillo)
  - [x] F1.4a Banco de pruebas: 2 compañeros (apoyo, ir a por el pase, recoger bola lenta, devolución si el control no cambia), control al receptor (FIFA) con interruptor (Sí por defecto), joystick "bloqueado" tras el cambio hasta soltar/girar, recepción automática con joystick suelto, anillo de jugador controlado + números, sección "Companys i control" en el panel, asistencia mínima PROVISIONAL al compañero (v0.1.11)
  - [x] F1.4b Pase real: toque = raso / mantener = elevado (sale al soltar, arco en el botón, umbral 0,2 s ajustable), receptor por cono, asistencia Desactivada/Ligera (defecto)/Fuerte en Configuració, fuerza automática (raso y elevado) con anticipación, error por situación y atributo Pase (`passFor`), anillo celeste bajo el receptor (interruptor), secciones "Passada" y "Assistència a la passada" en el panel, compañeros con algo de variación de ritmo/posición (v0.1.12)
  - [x] v0.1.13 (pedido por Guillem tras probar la v0.1.12): pase alto fuerte con vuelo guiado (3 niveles en el botón: raso / alto fuerte / vaselina, arco blanco/naranja/morado) + precisión del pase (receptor fijado al pulsar, anticipación sin castigo, el receptor sabe que el pase es suyo y llega a tiempo, zona de recepción 1 m, el que pasa no choca con su bola). Forta ya ayuda más que Lleugera. Detalle y cifras en DECISIONS.md.
  - [x] v0.1.14 (pedido por Guillem: "teledirigidos"): pases altos con física real (balística inversa, sin vuelo guiado), menos imán (asistencia solo al soltar, zona de recepción 0,65 m, receptor sin garantías), flecha de pase en el suelo (color/longitud por tipo y fuerza, interruptor en Configuració, longitud/grosor en el panel). Cifras medidas en DECISIONS.md.
  - [x] v0.1.15 (pedido por Guillem): pases largos con más potencia (el alto fuerte sube el ángulo si no llega; error de fuerza de los altos a la mitad; nuevos valores por defecto) — alcance de valla a valla. Revisado el cambio de control en ataque: pendiente de respuesta de Guillem sobre el pase fallado (ver informe).
  - [x] v0.1.16 (pedido por Guillem): raso más fuerte (llega a ~10 m/s, sale a 13-24 m/s) + pase perdido → control al compañero más cercano a la bola (interruptor). (potencia/altura resuelto en v0.1.17: opción A)
  - [x] v0.1.17 (pedido por Guillem): potencia y altura del pase separadas (deslizar arriba / U / LB), raso más fuerte y alto fuerte más lento, cambio de jugador automático (bola suelta, con histéresis) y manual (botón Canvi, Q, Y). Pendiente: confirmación de Guillem → F1.4c.
  - [x] F1.4c Recepción (v0.1.18): una tirada determinista por aproximación → limpio / pesado / rebote / pasa de largo según velocidad relativa, de dónde viene, altura y bote, estado del receptor (sprint, derrape, trencada), estirarse (zona de recepción) y atributo Control; pase al primer toque (error ×1,6 y más tras una recepción difícil); anillo de color bajo el receptor (verde/amarillo/naranja/rojo, interruptor); `src/sim/receive.ts` + `receiveFor` en feel.ts; sección "Recepció" en el panel (sustituye `pass.receiveReach`, `pass.receiveMaxRelSpeed` y `dribble.pickupMaxRelSpeed`). Probada por Guillem (v0.1.18), ajustes en la v0.1.19.
  - [x] v0.1.19 (pedido por Guillem tras probar la v0.1.18): gesto de la altura del pase = arrastrar en diagonal (arriba-izquierda alto fuerte, arriba-derecha vaselina; distancia y inclinación en el panel; investigado por qué no salía el alto fuerte), silueta de la bola a través de la valla cercana (interruptor, intensidad, distancia y tamaño en el panel), pases cortos más suaves y recepción menos estricta (cadenas de pases 61 % → 79 % llegan a 8). Cifras en DECISIONS.md. Pendiente: confirmación de Guillem → F1.4d.
  - [x] F1.4d (v0.1.20): lados del gesto de altura invertidos (arriba-derecha = alto fuerte, arriba-izquierda = vaselina), pared con la valla (asistencia que calcula el rebote para que vuelva a tu pala; anillos naranja/verde; sección "Passada a la tanca (paret)" en el panel), devolución rápida de los compañeros (si sigues corriendo, a los 0,1 s; con el control sin pasar al receptor), línea base de la ronda de afinación del pase en DECISIONS.md. Pendiente: prueba de Guillem → ronda de afinación del pase con él (candidatos en DECISIONS.md) → cierre de F1.4.
  - [x] v0.1.21 (pedido por Guillem: «poco frenético, cuesta encadenar»): banco de pruebas del pase (`tests/unit/bench`), números retocados (cadenas completadas 87 % → 99 %, 5 pases en 3,7 → 2,9 s; primer toque con control limpio 69 % → 79 %), nivel de asistencia **Mitjana** por defecto (4 niveles en Configuració), ajuste global **Velocitat de joc** (80-140 %) en el panel, `docs/REFERENCIA_PARTIDOS.md` (informe de partidos reales, ideas extra y tabla por fases). Propuestas de diseño sin aplicar (P1-P6) en DECISIONS.md. Pendiente: Guillem prueba la v0.1.21 (¿qué velocidad de juego le gusta?) y decide las propuestas.
  - [ ] Cierre de F1.4 tras la prueba de Guillem (pared con la valla, devolución rápida, propuestas P1-P6) → plan de F1.5 (diré qué ideas de `docs/REFERENCIA_PARTIDOS.md` incorporo)
- Pendiente para F2 (IA de equipo): posicionamiento real de los compañeros por roles y desmarques (en el banco de pruebas solo acompañan con un poco de variación).
- [ ] F1.5 Tiro rápido/cargado, deslizar al soltar, cono de precisión, gol a portería vacía → ronda de afinación 2
- [ ] F1.6 Regates (≥5) + defensa estático + combo → ronda 3
- [ ] F1.7 Gestos, editor de botones, vibración, mando, pantalla de controles
- [ ] F1.8 Portero IA básico
- [ ] F1.9 Modo Entrenamiento (libre + 3 retos)
- [ ] F1.10 Cierre F1

Fase F0

Fase F0 (plan aprobado por Guillem el 2026-10-02, opción A de despliegue:
Claude abre PR a `main` y la fusiona cuando CI está en verde).

Rama de trabajo: `ccr-c510413a-rbn6hg` → PR a `main` → GitHub Pages
(https://manrou6.github.io/hockey-game/).

## Sub-pasos F0
- [x] F0.1 Esqueleto Vite + TS estricto + Babylon, carpetas (docs/05), tuning.ts, Vitest + Playwright (v0.0.1)
- [x] F0.2 GitHub Actions (build, tests, deploy Pages) + PWA (manifest, SW, icono, horizontal, pantalla completa) (v0.0.2)
- [x] F0.3 Bucle a paso fijo 60 Hz + interpolación, RNG con semilla, test determinismo, panel debug ?debug=1 (v0.0.3)
- [x] F0.4 Pista con medidas, vallas, porterías, iluminación, cámara TV (v0.0.4)
- [x] F0.5 Jugador cápsula con inercia, colisión valla/porterías, teclado + joystick virtual + mando (v0.0.5)
- [x] F0.6 i18n ca/es/en, menú, pausa, ajustes (idioma, calidad) con versión (v0.0.6)
- [x] F0.7 Cierre: e2e móvil horizontal + capturas (docs/screenshots), medición rendimiento, criterios, deploy (v0.0.7)

## Cómo trabajar en este repo
- `npm ci` → instalar. `npm run dev` → servidor local. `npm run build` → typecheck + build.
- `npm test` → Vitest (tests/unit). `npm run e2e` → Playwright (requiere `npm run build` antes;
  viewport Pixel 8a horizontal, Chromium con SwiftShader).
- En este entorno cloud Playwright usa Chromium de /opt/pw-browsers (por eso @playwright/test fijado a 1.56.1).
- Versión visible: `package.json` "version" (0.F.N); subir N en cada sub-paso.
- Afinación: `src/config/tuning.ts` (valores de fábrica) + `src/config/tuningMeta.ts` (rango/paso/unidad, orden en el panel) + etiquetas `tuning.<ruta>` en i18n. Todo número nuevo de tuning necesita meta + etiqueta (lo exige `tests/unit/tuningMeta.test.ts`). Cuando Guillem pegue "PATINS tuning vX" en el chat: copiar esos valores como nuevos valores de fábrica en tuning.ts (sus guardados de esas rutas se borrarán solos con aviso).

## Correcciones tras prueba de Guillem
- v0.0.8: en vertical la pantalla "gira el mòbil" se quedaba bloqueada si el Pixel tiene la rotación automática desactivada. Ahora es opaca y tiene botón "Jugar en horitzontal" (pantalla completa + bloqueo horizontal); redimensionado extra tras girar. Test e2e `rotation.spec`.

- v0.0.9 (petición de Guillem): sin pantalla de "gira el mòbil"; en vertical el juego se dibuja girado 90° (horizontal siempre) y el joystick convierte coordenadas. Cambiar la calidad ya no recarga la página (se aplica al momento), así no se pierde la pantalla completa ni el horizontal.

## Verificación de criterios F0 (2026-10-02)
| Criterio (docs/06) | Estado | Cómo se comprobó |
|---|---|---|
| Vite + TS + Babylon, PWA, horizontal, pantalla completa, icono | OK | build; e2e `pwa.spec` (manifest fullscreen/landscape, SW activo) |
| GitHub Actions: build + tests + deploy Pages | OK | `.github/workflows/deploy.yml`, CI verde en cada push |
| Bucle paso fijo + interpolación, panel debug ?debug=1 | OK | unit `fixedStepLoop`, `determinism`; e2e `debug.spec` |
| Pista con medidas, vallas, porterías, iluminación | OK | unit `rink.test`; capturas |
| Jugador cápsula con joystick virtual y teclado (+ mando) | OK | unit `skating.test`; e2e `controls.spec`, `smoke.spec` |
| i18n ca/es/en + ajustes con versión | OK | unit `i18n.test`; e2e `menu.spec` |
| Enlace abre en el Pixel / se instala como app | OK | Guillem, Pixel 8a, v0.0.9 |
| 60 fps estables | OK | Guillem, Pixel 8a, `?debug=1` patinando: 59,5 fps, frame avg 16,79 / p95 17,60 / máx 19,7 ms, cpu avg 1,27 ms (calidad media, 1599×719). Presupuesto: 9 draw calls (≤120), 2,2k triángulos (≤200k), 0,01 ms/tick sim con CPU ×4, descarga 1,7 MB (≤25 MB) |
| El jugador patina con inercia | OK | Guillem: "el patinaje ya está bien" (se revisará con bola/regates en F1); unit `skating.test` (0→7 m/s ≈1,75 s, planeo, frenada ≈0,6 s, radio de giro) |

## Notas para la siguiente sesión
- F0 cerrada y probada por Guillem en el Pixel 8a. Orientación: se abre en horizontal y gira al otro lado si gira el móvil; Guillem está conforme.
- Próximo paso: F1 en modo plan (leer docs/03 §1-5 y docs/06 F1, proponer sub-pasos, esperar aprobación).
- Si Guillem reporta "se siente pesado / lento", tocar `TUNING.skating` (accel, maxTurnRate, turnRadius*, glide*) y `TUNING.camera`.
- Rendimiento real: pedir a Guillem captura del panel `?debug=1` (fps, frame p95) en el Pixel.
