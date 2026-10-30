import * as Updates from 'expo-updates';
import { Alert, Platform } from 'react-native';

/**
 * Comprueba y descarga actualizaciones OTA en segundo plano o bajo demanda.
 * Si se encuentra y descarga una nueva versión, ofrece reiniciar la app para aplicarla de inmediato.
 *
 * @param silent Si es true, no muestra alertas cuando no hay actualización o hay error de red.
 */
export async function checkAndDownloadUpdate(silent: boolean = true): Promise<boolean> {
  if (__DEV__ || Platform.OS === 'web') {
    if (!silent) {
      Alert.alert(
        'Modo Desarrollo / Web',
        'Las actualizaciones OTA en la nube aplican exclusivamente a la app instalada en dispositivos móviles (Android / iOS).'
      );
    }
    return false;
  }

  try {
    const check = await Updates.checkForUpdateAsync();
    if (check.isAvailable) {
      const fetchResult = await Updates.fetchUpdateAsync();
      if (fetchResult.isNew) {
        Alert.alert(
          '🚀 Nueva Actualización Lista',
          'Se han descargado las últimas mejoras y correcciones del sistema. ¿Deseas reiniciar la aplicación ahora para aplicarlas?',
          [
            { text: 'Más tarde', style: 'cancel' },
            {
              text: 'Reiniciar Ahora',
              style: 'default',
              onPress: async () => {
                try {
                  await Updates.reloadAsync();
                } catch {
                  // Fallback si reload falla
                }
              },
            },
          ]
        );
        return true;
      }
    } else {
      if (!silent) {
        Alert.alert(
          'Sistema al Día',
          'Tu aplicación cuenta con la versión más reciente disponible (v1.2.1). No hay actualizaciones pendientes.'
        );
      }
    }
  } catch (err: any) {
    console.warn('[Updates] Error al verificar actualización:', err);
    if (!silent) {
      Alert.alert(
        'Sin Conexión con Servidor de Actualizaciones',
        'No fue posible consultar las actualizaciones en este momento. Verifica tu conexión a internet.'
      );
    }
  }
  return false;
}
