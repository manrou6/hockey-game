# Registro de decisiones

- 2026-10-02: Plataforma web 3D (TypeScript + Babylon.js, PWA). Nombre provisional PATINS; repo hockey-game.
- 2026-10-02: Despliegue opción A: Claude trabaja en rama, abre PR a `main` y la fusiona con CI en verde.
- 2026-10-02: TypeScript fijado a 5.9 (no 7.x) por estabilidad del tooling; Vite 8, Vitest 5, Babylon 9 (`@babylonjs/core` con imports profundos para tree-shaking).
- 2026-10-02: `@playwright/test` fijado a 1.56.1 para usar el Chromium preinstalado del entorno cloud; en CI se instala el mismo.
- 2026-10-02: Dos tsconfig: `tsconfig.json` (src + tests/unit, sin tipos de Node para que el juego no use APIs de Node) y `tsconfig.node.json` (configs + e2e).
- 2026-10-02: Base de Vite `/hockey-game/` en build y preview (GitHub Pages), `/` en dev.
- 2026-10-02: Versión visible = `package.json` version + commit corto (inyectados con `define`).
