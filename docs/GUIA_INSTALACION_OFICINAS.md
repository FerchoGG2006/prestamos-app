# Guía de Instalación para Oficinas y Sucursales

Esta guía contiene las instrucciones paso a paso para el envío, distribución e instalación del **Sistema de Cartera y Cobros** en los equipos de las oficinas y sedes operativas.

---

## 1. Archivo para enviar a las oficinas

El archivo que se debe enviar a las sucursales u operadores es:

📦 **`Instalador-SistemaCartera-v1.0.0.exe`** *(ubicado en la carpeta `dist/`)*

> [!NOTE]
> **No se requiere instalar Java, Gradle ni configurar variables de entorno.** El instalador ya incluye su propio motor y dependencias integradas.

### Canales recomendados para el envío:
- **Enlace de descarga en la nube:** Google Drive, Microsoft OneDrive, Dropbox o WeTransfer.
- **Unidad USB:** Copiar el archivo directamente a una memoria USB para instalación presencial.
- **Red local compartida:** Si las oficinas están en red o VPN, copiar en una carpeta compartida accesible.

*(Alternativa: Para equipos que tengan políticas de seguridad que restrinjan ejecutar instaladores, se puede enviar `SistemaCartera-v1.0.0-Windows-x64.zip`, que es una versión portable sin instalación).*

---

## 2. Instrucciones de Instalación en la Oficina

Indicar al personal de la oficina los siguientes pasos sencillos:

1. **Descargar y Ejecutar:**
   - Hacer doble clic sobre **`Instalador-SistemaCartera-v1.0.0.exe`**.
   - Si Windows muestra la advertencia *"Windows protegió su PC"* (SmartScreen al ser un ejecutable nuevo), hacer clic en **"Más información"** y luego en **"Ejecutar de todas formas"**.

2. **Asistente de Instalación (En Español):**
   - El asistente mostrará la pantalla de bienvenida. Hacer clic en **"Siguiente"**.
   - Dejar la carpeta de instalación predeterminada (o seleccionar una preferencia) y hacer clic en **"Siguiente"**.
   - Asegurarse de que esté marcada la casilla **"Crear un icono en el Escritorio"** y hacer clic en **"Siguiente"**.
   - Hacer clic en **"Instalar"**. El proceso tardará unos 15-30 segundos.

3. **Primer Inicio:**
   - Al finalizar, dejar seleccionada la opción **"Ejecutar Sistema de Cartera y Cobros"** y presionar **"Finalizar"**.
   - Se abrirá automáticamente la pantalla de inicio de sesión con el tema nativo del sistema.

---

## 3. Acceso y Credenciales de Inicio

Al arrancar por primera vez, el sistema crea automáticamente la base de datos local y habilita los perfiles operativos predeterminados:

| Rol de Usuario | Nombre de Usuario | Contraseña | ¿Quién debe usarlo? |
|---|---|---|---|
| **Administrador** | `admin` | `123` | Gerencia / Jefe de Oficina: acceso completo a configuración, creación de usuarios, gestión de rutas, patrimonio de caja y respaldos. |
| **Supervisor** | `supervisor` | `123` | Supervisores de zona: monitoreo de cobros en vivo, liquidación diaria de rutas y aprobación de créditos. |
| **Cobrador** | `cobrador` | `123` | Cobradores en calle: vista simplificada de cobros del día, búsqueda por nombre/cédula y registro de pagos. |

> [!TIP]
> Por seguridad, una vez instalado en la oficina, el Administrador puede ingresar al módulo **"Configuración del Sistema"** -> **"Gestión de Usuarios y Seguridad"** para cambiar las contraseñas predeterminadas o crear cuentas individuales para el personal de esa sede.

---

## 4. Configuración Inicial Recomendada en la Oficina

1. **Rutas:** En *Configuración* -> *Rutas de Operación*, verificar o crear las rutas que corresponden a esa oficina (ej. *Ruta Norte*, *Ruta Centro*).
2. **Parámetros de Crédito:** En *Configuración* -> *Políticas de Préstamos*, ajustar tasas de interés, días de gracia o plazos autorizados según la política de la empresa.
3. **Caja Inicial:** En *Administrativo* -> *Patrimonio & Base*, ingresar el saldo base con el que abre la caja de esa sede.

---

## 5. Respaldo de Información

- Todos los datos se guardan localmente de forma segura en:  
  `C:\Users\<Usuario>\.sistema-cartera\cartera.db`
- Para generar una copia de seguridad al final de la jornada:  
  Ir a **Configuración** -> **Respaldos de Base de Datos** -> **"Crear Respaldo Ahora (.db)"**.
- Ese archivo `.db` se puede guardar en una memoria USB o subir a Google Drive al final del día como copia de contingencia.
