# Guía de Lanzamiento a Google Play Store (.AAB) e Instalación Directa (.APK) Sin Expo Go

Esta guía detalla cómo publicar **Cartera Móvil** en **Google Play Store** y cómo instalarla de forma 100% autónoma en cualquier teléfono Android **sin necesidad de instalar Expo Go**.

---

## 🚀 1. Solución Definitiva Sin Expo Go: Dos Formatos Nativos

La aplicación ya está configurada en [`mobile/app.json`](file:///c:/Users/ASUS/prestamos-app-1/mobile/app.json) y [`mobile/eas.json`](file:///c:/Users/ASUS/prestamos-app-1/mobile/eas.json) con firma digital de producción y bloqueo de permisos innecesarios para cumplir las políticas de Google Play:

| Formato | Perfil EAS | ¿Para qué sirve? | ¿Requiere Expo Go? |
|---|---|---|---|
| **`.AAB` (Android App Bundle)** | `production` | Subir oficialmente a **Google Play Console (Play Store)** para que cualquier oficina o cobrador la descargue desde la tienda. | ❌ **NO** (100% Nativa) |
| **`.APK` (Instalador Directo)** | `preview` | Enviar por **WhatsApp, Telegram o enlace directo** e instalar en 1 toque sin pasar por la Play Store. | ❌ **NO** (100% Nativa) |

---

## 🛠️ 2. Cómo Generar el Archivo `.AAB` (Play Store) o `.APK` (1 Clic)

En la carpeta raíz del proyecto tienes dos ejecutables listos:

1. **Para publicar en Google Play Store o elegir formato (`publicar-play-store-aab.bat`)**:
   - Haz doble clic en **`publicar-play-store-aab.bat`**.
   - Elige la opción **`[1]`** para generar el archivo **`.aab`** oficial de Google Play Store, o la opción **`[2]`** para generar el archivo **`.apk`** directo.
2. **Para generar directamente el `.APK` instalable por WhatsApp (`compilar-apk-android.bat`)**:
   - Haz doble clic en **`compilar-apk-android.bat`**.

Al finalizar la compilación en la nube de EAS, aparecerá en consola un enlace de descarga directa (también disponible en tu panel [expo.dev](https://expo.dev/accounts/ferchogg2007/projects/cartera-movil/builds)).

---

## 🏪 3. Paso a Paso para Subir el `.AAB` a Google Play Store

1. **Crear o abrir tu cuenta en Google Play Console**:
   - Ingresa a [play.google.com/console](https://play.google.com/console) (costo único de registro de desarrollador de Google: $25 USD de por vida).
2. **Crear la aplicación**:
   - Haz clic en **"Crear aplicación"**.
   - **Nombre de la app**: `Cartera Móvil` (o el nombre comercial que prefieras).
   - **Idioma predeterminado**: Español (Latinoamérica).
   - **Tipo**: Aplicación -> Gratuita.
3. **Subir el paquete `.aab`**:
   - En el menú izquierdo de Google Play Console, entra a **Pruebas y lanzamiento -> Producción** (o *Prueba cerrada / Prueba interna* si deseas distribuirla de inmediato por correo a las oficinas sin esperar revisión pública).
   - Haz clic en **"Crear nueva versión"**.
   - En la sección **Paquetes de aplicaciones**, sube el archivo **`.aab`** generado con `publicar-play-store-aab.bat`.
4. **Completar la Ficha de Play Store y Seguridad de Datos**:
   - **Seguridad de los datos**: Indica que la aplicación opera con almacenamiento local en el dispositivo (Offline-First) y no comparte ni vende datos personales a terceros.
   - **Ícono y gráficos**: Puedes usar directamente el ícono de alta resolución incluido en `mobile/assets/icon.png`.
   - **Acceso a la aplicación (para el revisor de Google)**: En la sección *"Acceso a la aplicación"*, proporciona una credencial de prueba (por ejemplo: Usuario `admin` / Contraseña `123`) para que el revisor automático de Google Play pueda verificar la pantalla de inicio de sesión.

---

## 🏢 4. Nuevo Flujo de Oficina: Creación de Credenciales de Admin y Configuración de Rutas

Tanto en la **App Móvil** como en el **Sistema de Escritorio (Windows)**, la pantalla de inicio de sesión ahora incluye el botón:
👉 **«Configurar Oficina, Admin y Rutas (Crear Credenciales)»**

Con este asistente en **3 pasos**:
1. **Paso 1 (Oficina y Administrador)**: La oficina define su Nombre Comercial, Ciudad, Teléfono y crea el **Usuario y Contraseña exclusivos del Administrador**.
2. **Paso 2 (¿Cuántas rutas tendrá la oficina?)**: La oficina elige cuántas rutas va a operar (`1`, `2`, `3`, `4`, `5` o hasta `20` rutas) y configura las reglas del negocio a su gusto (Tasa de interés %, cobro o no de papelería, exclusión de domingos y permisos de cobradores en calle).
3. **Paso 3 (Configuración y Credenciales de cada Ruta)**: Por cada una de las rutas elegidas, la oficina personaliza el **Nombre de la Ruta**, **Nombre del Cobrador**, **Base de Efectivo Inicial**, **Usuario de la Ruta** y **Contraseña de la Ruta**.
4. **Resumen y Hoja de Credenciales**: Al guardar, el sistema genera un resumen listo para compartir por WhatsApp con las credenciales de cada ruta.
