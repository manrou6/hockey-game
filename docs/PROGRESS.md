# Estado actual

Fase actual: **F0 — Cimientos** (plan aprobado por Guillem el 2026-10-02, opción A de despliegue:
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
| Enlace abre en el Pixel / se instala como app | Pendiente de Guillem | requiere el móvil real |
| 60 fps estables | Pendiente de Guillem | entorno sin GPU; presupuesto: 9 draw calls (≤120), 2,2k triángulos (≤200k), 0,01 ms/tick sim con CPU ×4, descarga 1,7 MB (≤25 MB) |
| El jugador patina con inercia | OK (falta sensación de Guillem) | unit `skating.test` (0→7 m/s ≈1,75 s, planeo, frenada ≈0,6 s, radio de giro) |

## Notas para la siguiente sesión
- F0 queda cerrada en código. Falta que Guillem pruebe en el Pixel 8a (instalar, fps con ?debug=1, sensación de patinaje) antes de empezar F1 (regla del roadmap).
- Si Guillem reporta "se siente pesado / lento", tocar `TUNING.skating` (accel, maxTurnRate, turnRadius*, glide*) y `TUNING.camera`.
- Rendimiento real: pedir a Guillem captura del panel `?debug=1` (fps, frame p95) en el Pixel.
