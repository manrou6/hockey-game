# CLAUDE.md — PATINS (nombre provisional)

Juego de hockey sobre patines (rink hockey) para móvil, 3D low-poly heroico facetado (decisión de arte de Guillem, 2026-10-07; ver docs/04), cámara de retransmisión TV, reglamento World Skate 2026. Este archivo manda sobre cualquier otra preferencia de estilo de código.

## Quién es el usuario
- Guillem. NO programa (implicación en código = 0). Prueba el juego en un Google Pixel 8a (Android, Chrome) y en PC.
- Nunca le pidas editar código ni usar terminal. Si algo requiere una acción manual suya (descargar un asset con login, crear una cuenta, activar GitHub Pages), dale pasos numerados, clic a clic, en español.
- Comunícate en español. Código, nombres de archivos y comentarios en inglés.
- Antes de cambiar una decisión de diseño documentada en /docs, pregunta. Cambios técnicos internos: decide tú y anótalos en docs/DECISIONS.md.

## Documentación (leer antes de cada fase)
- docs/01_GDD.md — visión, pilares, modos, equipos
- docs/02_REGLAMENTO.md — reglas WSE adaptadas al juego
- docs/03_JUGABILIDAD.md — física, controles, regates, cámara, IA
- docs/04_ARTE_AUDIO.md — dirección visual, assets, licencias, presupuestos
- docs/05_ARQUITECTURA.md — stack, estructura, rendimiento, tests, despliegue
- docs/06_ROADMAP.md — fases y criterios de aceptación
- docs/PROGRESS.md — estado actual (lo mantienes tú)
- docs/DECISIONS.md — registro de decisiones (lo mantienes tú)

## Stack (no cambiar sin preguntar)
- TypeScript estricto + Vite + Babylon.js (render) + simulación propia determinista a 60 Hz (sin motor de físicas externo para el juego).
- PWA instalable, orientación horizontal, pantalla completa. Despliegue en GitHub Pages vía GitHub Actions.
- i18n: ca (por defecto), es, en. Ningún texto visible hardcodeado.
- Tests: Vitest (lógica/simulación) + Playwright (smoke test móvil y capturas).

## Reglas de trabajo
1. Empieza cada fase en modo plan: lee docs, propone plan con sub-pasos, espera aprobación.
2. Trabaja en sub-pasos pequeños. Al final de cada sub-paso: build OK, tests OK, commit con mensaje claro, actualizar docs/PROGRESS.md.
3. La simulación (src/sim) NUNCA importa nada de render, DOM ni audio. Debe ser determinista (semilla, paso fijo, sin Math.random directo, sin Date.now).
4. Todo número de "game feel" va en src/config/tuning.ts, nunca disperso en el código.
5. Rendimiento: objetivo 60 fps estables en Pixel 8a. Comprueba presupuestos de docs/05 antes de añadir arte.
6. Licencias: solo assets CC0 o con licencia que permita uso en juegos, registrados en CREDITS.md. Prohibido usar nombres, escudos, patrocinadores o equipaciones de clubes reales.
7. Antes de dar una fase por terminada: verifica cada criterio de aceptación de docs/06_ROADMAP.md, despliega, y dale a Guillem el enlace y una lista corta de "qué probar".
8. Si te quedas sin contexto o la sesión se corta, PROGRESS.md debe permitir que otra sesión continúe sin preguntar nada.

## Formato del informe final de cada sesión (para Guillem)
- Qué está hecho (3-6 viñetas)
- Enlace para probar
- Qué probar en el móvil (checklist)
- Problemas conocidos
- Siguiente sub-paso propuesto
