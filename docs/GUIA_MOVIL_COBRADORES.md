# Guía para la Aplicación Móvil en Celulares Android (Cobradores)

Esta guía explica cómo ejecutar o generar la aplicación móvil **Cartera Móvil** para los teléfonos celulares de los cobradores.

---

## ⚠️ ¿Por qué dio error al enviar el `.exe` por WhatsApp?
- El archivo `Instalador-SistemaCartera-v1.0.0.exe` es un instalador para **computadores con Windows (PC o Laptop)**.
- Cuando una persona intenta abrir un archivo `.exe` directamente desde WhatsApp en un teléfono Android o iPhone, el teléfono no lo reconoce y muestra el error:  
  *«Puede que no dispongas de una aplicación compatible para abrir este tipo de contenido»*.
- Para instalar en el **computador de la oficina**: deben abrir WhatsApp en la PC (**WhatsApp Web** en `web.whatsapp.com`), descargar el archivo `.exe` allí y hacer doble clic.
- Para instalar en los **celulares de los cobradores**: los teléfonos Android requieren un archivo **`.apk`** o abrir la app con **Expo Go**.

---

## Opción A: Generar el archivo `.apk` descargable para enviar por WhatsApp

Para generar un archivo `.apk` autónomo que los cobradores puedan instalar directamente en sus celulares:

1. En la raíz del proyecto, ejecuta el archivo:
   👉 **`compilar-apk-android.bat`**
2. Se iniciará el servicio de compilación en la nube **EAS Build** de Expo.
3. Si es tu primera vez:
   - Te pedirá iniciar sesión o crear una cuenta gratuita en [expo.dev](https://expo.dev).
   - Puedes crear una cuenta gratis en 1 minuto con tu correo.
4. Al terminar el proceso, te entregará un **enlace directo de descarga para el archivo `.apk`**.
5. Descargas ese archivo `.apk` y **ya lo puedes reenviar por WhatsApp** a cualquier teléfono Android. Los cobradores solo deberán tocarlo en WhatsApp y presionar "Instalar".

---

## Opción B: Usar la App de Inmediato en Celulares (Sin compilar APK)

Si necesitas que un cobrador o tú prueben la app en el celular en este mismo instante:

1. En el celular Android, entra a **Google Play Store** e instala la aplicación gratuita **Expo Go**.
2. En tu computador, ejecuta:
   👉 **`iniciar-movil-cobradores.bat`**
3. En la pantalla de la computadora aparecerá un código QR grande.
4. Abre la app **Expo Go** en el celular, presiona **"Scan QR code"** y apunta al código de la pantalla.
5. ¡Listo! La aplicación **Cartera Móvil** se cargará de inmediato en el teléfono con todas sus funciones de cobro, cuadre diario y almacenamiento local.
