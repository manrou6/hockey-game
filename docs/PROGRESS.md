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
- [ ] F0.7 Cierre: e2e móvil horizontal + captura, medición rendimiento, criterios, deploy, informe

## Cómo trabajar en este repo
- `npm ci` → instalar. `npm run dev` → servidor local. `npm run build` → typecheck + build.
- `npm test` → Vitest (tests/unit). `npm run e2e` → Playwright (requiere `npm run build` antes;
  viewport Pixel 8a horizontal, Chromium con SwiftShader).
- En este entorno cloud Playwright usa Chromium de /opt/pw-browsers (por eso @playwright/test fijado a 1.56.1).
- Versión visible: `package.json` "version" (0.F.N); subir N en cada sub-paso.

## Notas para la siguiente sesión
- Nada pendiente fuera de la lista anterior.
