# Resumen del encargo del 9-11 de octubre (v0.1.29, v0.1.30 y bloque 2)

**Probar:** https://manrou6.github.io/hockey-game/ (versión **0.1.30**; se ve en Configuració y en el panel ⚙).

| Hecho | Resultado |
|---|---|
| v0.1.29 | La volea no se activaba porque, al apuntar a portería, el receptor dejaba de ir a por la bola. Arreglado: ahora se activa el 100 %. Anillo dorado en la bola, cámara lenta que se nota, vibración y alto fuerte más preciso |
| v0.1.30 | 5 fallos raros arreglados (Canvi en la volea, alto fuerte largo, bola fuera dentro de la portería…) |
| Auditoría | F1.5: 27 de 41 criterios cumplidos y 4 que solo esperan tu prueba. Simulación robusta. Rendimiento, documentación, código y actualización de la app revisados |
| Bancos | `bench:feel` vigila 550 medidas del tacto en cada cambio |
| Planes | F1.6 y F2, con las objeciones de un crítico independiente |
| Revisión | 65 de 70 cifras reproducidas; las 5 restantes cambian por la v0.1.30 |

**Qué probar en el móvil:** alto fuerte con el joystick a portería (¿ves el anillo y llega?) · ¿notas la cámara lenta? · ¿vibra el remate perfecto? · alto fuerte a sprint.

**Decisiones tuyas** (detalle en DECISIONS.md, AUDITORIA_F1.md y PLAN_F1_6.md):

| # | Decisión | Recomiendo |
|---|---|---|
| 1 | ¿Te gusta ya la volea? Si es que sí, cierro F1.5 | Probar la 0.1.30 |
| 2 | P16 · Cámara lenta más fuerte (antes, al 50 %, hasta el remate) | Probar si la actual no basta |
| 3 | P12 · Al pasar a sprint, mover el joystick de lado no hace trencada | Sí (a) |
| 4 | P13 · Alto fuerte por delante de un compañero que corre | (a) que le encuentre |
| 5 | La vaselina dirigida a ti también: el joystick solo apunta | Sí, medirlo antes |
| 6 | Aviso «Hi ha una versió nova, toca per actualitzar»: nunca recarga a media partida | Sí |
| 7 | Panel ⚙ dividido en «Bàsic» (~35 ajustes) y «Avançat» | Sí |
| 8 | Gesto de aixecar: Regat ↗ (lo que elegiste) o deslizar en la zona libre | Probar los dos en la ronda 3 |

**Problemas conocidos:** a sprint, apuntar muy de lado desvía el alto fuerte (P12). Los pases altos son caros de calcular (§C: arreglar antes de F2). En iPhone no hay vibración.

**Siguiente:** tu prueba de la 0.1.30 → cierre de F1.5 → F1.6, empezando por el rival de prueba.
