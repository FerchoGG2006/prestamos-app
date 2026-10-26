# Sistema de Cartera y Cobros (Windows Desktop)

Aplicación nativa de escritorio para administración de cartera, otorgamiento de microcréditos, control de cobradores y liquidación diaria multi-ruta. Desarrollada con **JavaFX 21** y **Spring Boot 3.4** sobre base de datos transaccional SQLite con migraciones Flyway.

---

## 🚀 Descarga y Entrega a Oficinas (Sin instalar Java)

El aplicativo ha sido empaquetado para distribución en Windows (x64) con **su propio entorno de ejecución (JRE 21) integrado**. Las oficinas y usuarios finales **no necesitan tener Java ni Gradle instalados**.

📖 **[Ver Guía Paso a Paso para Instalación en Oficinas](file:///c:/Users/ASUS/prestamos-app-1/docs/GUIA_INSTALACION_OFICINAS.md)**

### Opción 1: Instalador Oficial (.EXE) — RECOMENDADO PARA OFICINAS
Archivo autoejecutable con asistente de instalación completo en español:
📁 **`dist/Instalador-SistemaCartera-v1.0.0.exe`** (~78 MB)

**Ventajas:**
- Doble clic y sigue el asistente (Siguiente -> Instalar).
- Crea accesos directos en el **Escritorio** y en el **Menú Inicio**.
- Registra el desinstalador estándar en el Panel de Control / Configuración de Windows.
- No requiere descomprimir archivos.

### Opción 2: Archivo ZIP Portable
Para equipos con restricciones o para llevar en una memoria USB:
📁 **`dist/SistemaCartera-v1.0.0-Windows-x64.zip`** (~86 MB)

1. Descomprime en `C:\SistemaCartera`.
2. Haz doble clic en `crear-acceso-directo.bat` para poner el ícono en el Escritorio.
3. Ejecuta `SistemaCartera.exe`.

---

## 🔐 Configuración Inicial de Acceso y Seguridad

Al instalar la aplicación en una oficina nueva:
1. Defina inmediatamente las credenciales del **Administrador de la Oficina** y de cada **Ruta de Cobro** desde el *Panel Operativo -> 4. Credenciales*.
2. Las contraseñas se almacenan de forma segura mediante derivación criptográfica **PBKDF2-HMAC-SHA256** con sal aleatoria de 128 bits (`PasswordHasher.java`). No se admiten contraseñas en texto plano.
3. La sincronización en red local (LAN) valida límites de tamaño de trama, control de frecuencia por IP y clave opcional de oficina (`X-Office-Sync-Pin`).

📖 **[Ver Marco de Titularidad, Registro DNDA, Licenciamiento y Cumplimiento en Colombia](file:///c:/Users/ASUS/prestamos-app-1/docs/TITULARIDAD_LEGAL_Y_LICENCIAMIENTO_COLOMBIA.md)**

---

## 🛠️ Generación del Paquete de Instalación

Para volver a generar el paquete distribuible desde el código fuente:

### En Windows (1-Clic):
Ejecuta el script:
```cmd
empaquetar-windows.bat
```

### O vía Gradle:
```powershell
cd desktop
.\gradlew.bat packageZip
```
Esto ejecutará automáticamente:
1. Pruebas unitarias y de integración.
2. Compilación de clases y dependencias JavaFX.
3. Creación del runtime nativo con `jpackage` (`dist/SistemaCartera/SistemaCartera.exe`).
4. Empaque del archivo ZIP distribuible (`dist/SistemaCartera-v1.0.0-Windows-x64.zip`).

---

## 💻 Ejecución en Modo Desarrollo

Si deseas ejecutar la aplicación directamente en modo desarrollo sin empaquetar:
- Ejecuta **`ejecutar.bat`** en la raíz del proyecto.
- O ejecuta `.\gradlew.bat run` dentro del directorio `desktop`.

---

## 💾 Persistencia y Copias de Seguridad

- **Base de datos local:** Se almacena de forma segura en `%USERPROFILE%\.sistema-cartera\cartera.db`.
- **Copias de seguridad:** Disponibles en la pestaña *Configuración* -> *Respaldos de Base de Datos* (exporta e importa copias íntegras de SQLite).
- **Exportación de Informes:** Disponibles en la pestaña *Informes y Auditoría* (exportación directa en formato compatible con Excel).