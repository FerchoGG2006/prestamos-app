# Bug Verification: Desfase en Base y Administrativo tras Renovación de Crédito

- **Slug**: renewal-base-admin-metrics
- **Tested**: 2026-11-16T18:56:30-05:00
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

El síntoma original ya no se reproduce: la Base descuenta exactamente el desembolso total de la renovación (efectivo neto + papelería), la Cartera en calle refleja el nuevo total pactado menos el saldo anterior, y el Administrativo sube únicamente el interés nuevo. No se encontraron regresiones en las pruebas de calculadora ni en el typecheck de TypeScript.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | `renewal-metrics.test.js` con valores exactos (`Base 500k`, `Cartera 620k`, `Admin 1.12M`) | pass | Resultado: `Base 340.000`, `Cartera 1.060.000`, `Admin 1.400.000` |
| New / updated tests | `renewal-metrics.test.ts` compilado y ejecutado en Node v24.20.0 | pass | Exit code 0 |
| Regression suite | `calculator.test.ts` compilado y ejecutado en Node v24.20.0 | pass | 6/6 pruebas financieras superadas |
| Lint / type-check | `cd mobile; npm run typecheck` | pass | `tsc --noEmit` exit code 0 |

## Output Excerpts

```text
✅ Test de renovación superado: {
  before: { base: 500000, cartera: 620000, admin: 1120000 },
  after: { base: 340000, cartera: 1060000, admin: 1400000 }
}
¡TODAS LAS PRUEBAS FINANCIERAS FUERON SUPERADAS AL 100%!
```

## Residual Risks

- El servidor estático en el puerto `8082` sirve `mobile\dist`; para ver el cambio en `http://localhost:8082` es necesario reconstruir `mobile\dist`.

## Recommendation

Close the bug — verified end-to-end.

## Nueva verificación local — 2026-11-17

**Resultado: partial para el cierre integral; pruebas automatizadas y paquete local verificados.** Se conserva arriba el registro histórico; su afirmación de cierre end-to-end no acredita la sesión de Antigravity del usuario.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `cd mobile; npm run test:finance` | pass, exit 0 | Seis casos de calculadora y dos escenarios de renovación; las aserciones fallan el proceso si son falsas. |
| Caso exacto de usuario | pass | 700.000 al 40%, saldo 620.000, papelería 35.000: efectivo 45.000, Base 420.000, cartera 980.000, Administrativo 1.400.000. |
| Reapertura de datos con orden antiguo | pass | Importar copia con préstamos en orden inverso mantiene los valores y una sola renovación; no se vuelve a conceder el crédito. |
| Compensación y recaudo | pass | La renovación no aumenta collectedToday. |
| `cd mobile; npm run typecheck` | pass, exit 0 | TypeScript sin errores. |
| Expo export local | pass, exit 0 | `node node_modules/expo/bin/cli export --platform web --output-dir dist`; bundle index-eab9c4678aaa37c4f7249ec668edeb94.js. |
| Navegación a localhost:8082 | pass | Browser CUA mostró Kredia y etiqueta web 1.2.14 LOCAL (2026-11-17). |
| Valores en sesión real de Antigravity | pending | El navegador de comprobación abre en login; no se iniciaron operaciones financieras ni se modificaron los datos reales del usuario. |

No se publicó en producción. Para prueba compartida, refrescar la misma sesión/origen de Antigravity, comprobar la etiqueta LOCAL y revisar la renovación ya registrada, sin crear otra. Valores esperados si no hubo otras operaciones: Base 420.000, cartera 980.000, Administrativo 1.400.000.
