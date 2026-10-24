# Sistema de Cartera y Cobros (Windows Desktop)

Aplicación nativa de escritorio para administración de cartera, otorgamiento de microcréditos, control de cobradores y liquidación diaria multi-ruta. Desarrollada con **JavaFX 21** y **Spring Boot 3.4** sobre base de datos transaccional SQLite con migraciones Flyway.

---

## 🚀 Descarga y Ejecución Inmediata (Sin instalar Java)

El aplicativo ha sido empaquetado en una distribución nativa para Windows (x64) que **incluye su propio entorno de ejecución (JRE 21)**. El usuario final **no necesita tener Java ni Gradle instalados**.

### Opción 1: Archivo ZIP Descargable
El archivo comprimido listo para transferir o subir a cualquier servidor de descargas se encuentra en:
📁 **`dist/SistemaCartera-v1.0.0-Windows-x64.zip`** (~86 MB)

**Pasos:**
1. Descomprime `SistemaCartera-v1.0.0-Windows-x64.zip` en tu equipo (ejemplo: `C:\SistemaCartera`).
2. Haz doble clic en **`crear-acceso-directo.bat`** para generar el acceso directo en tu Escritorio con el ícono oficial.
3. Abre la aplicación desde el acceso directo o ejecutando **`SistemaCartera.exe`**.

### Opción 2: Carpeta Portable Ya Lista
Si ya tienes el repositorio clonado o la carpeta compilada, puedes ejecutar directamente:
📁 **`dist/SistemaCartera/SistemaCartera.exe`**

---

## 🔑 Credenciales Predeterminadas (Primer Inicio)

Al abrir la aplicación por primera vez, se auto-inicializan los usuarios predeterminados con datos iniciales de prueba:

| Rol | Usuario | Contraseña | Permisos |
|---|---|---|---|
| **Administrador** | `admin` | `123` | Acceso total: Configuración, Usuarios, Rutas, Auditoría, Tesorería, Reportes |
| **Supervisor** | `supervisor` | `123` | Supervisión: Control de cobros, liquidaciones, clientes y cartera general |
| **Cobrador** | `cobrador` | `123` | Operativo: Vista optimizada de ruta de cobro diaria y registro de pagos |

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