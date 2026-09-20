# Sistema de Cartera — módulo JavaFX

Este módulo reemplaza progresivamente la UI Expo/React/Electron. Es una aplicación JavaFX nativa: no contiene servidor web, rutas URL, WebView ni una interfaz localhost.

## Prerrequisitos

- JDK 21 LTS
- Gradle 8.10+ (Maven no se utiliza en este proyecto)

## Ejecutar y verificar

```powershell
cd desktop
gradle test
gradle run
```

La base SQLite se ubicará en `%USERPROFILE%/.sistema-cartera/cartera.db`. Flyway aplica el esquema inicial antes de que la UI se muestre.

El siguiente paso de implementación es conectar los casos de uso y repositorios transaccionales a las pantallas JavaFX, empezando por clientes, créditos y pagos.
