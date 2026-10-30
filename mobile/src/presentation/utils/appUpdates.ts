import * as Updates from 'expo-updates';
import { Alert, Platform, Linking } from 'react-native';

export const CURRENT_APP_VERSION = '1.2.1';
export const CURRENT_VERSION_CODE = 4;

export interface AppVersionInfo {
  status?: string;
  app_name?: string;
  min_version: string;
  latest_version: string;
  version_code?: number;
  apk_url: string;
  force_update: boolean;
  release_notes?: string;
}

export interface ApkCheckResult {
  needsUpdate: boolean;
  isForce: boolean;
  versionInfo?: AppVersionInfo;
  error?: string;
}

/**
 * Compara dos versiones SemVer simples (ej. "1.2.0" vs "1.2.1").
 * Retorna:
 *  -1 si v1 < v2
 *   0 si v1 == v2
 *   1 si v1 > v2
 */
export function compareSemver(v1: string, v2: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/i, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0);

  const p1 = parse(v1);
  const p2 = parse(v2);
  const maxLen = Math.max(p1.length, p2.length);

  for (let i = 0; i < maxLen; i++) {
    const num1 = p1[i] ?? 0;
    const num2 = p2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * Escenario B: Comprueba y descarga parches OTA silenciosos en segundo plano con expo-updates.
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
          'Sistema al Día (OTA)',
          `Tu aplicación cuenta con el último parche en caliente disponible (v${CURRENT_APP_VERSION}).`
        );
      }
    }
  } catch (err: any) {
    console.warn('[Updates] Error al verificar actualización OTA:', err);
    if (!silent) {
      Alert.alert(
        'Sin Conexión OTA',
        'No fue posible consultar el servidor de parches en la nube. Verifica tu conexión a internet.'
      );
    }
  }
  return false;
}

/**
 * Escenario C: Consulta el endpoint de versionado del servidor para instaladores completos (.APK).
 * Compara la versión local contra min_version y latest_version.
 */
export async function checkApkVersion(
  serverUrl: string = 'http://192.168.1.10:8765',
  timeoutMs: number = 3500
): Promise<ApkCheckResult> {
  if (Platform.OS === 'web') {
    return { needsUpdate: false, isForce: false };
  }

  try {
    const cleanBaseUrl = serverUrl.replace(/\/+$/, '');
    const endpoint = `${cleanBaseUrl}/api/v1/app-version`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      return {
        needsUpdate: false,
        isForce: false,
        error: `Servidor respondió con código ${response.status}`,
      };
    }

    const data: AppVersionInfo = await response.json();

    // Verificación 1: ¿Versión menor que la mínima requerida? => Actualización obligatoria
    const belowMinVersion = compareSemver(CURRENT_APP_VERSION, data.min_version) < 0;

    // Verificación 2: ¿Versión menor que la última publicada?
    const belowLatestVersion = compareSemver(CURRENT_APP_VERSION, data.latest_version) < 0;

    // Verificación 3: Por version_code (si viene informado en el JSON)
    const belowVersionCode =
      typeof data.version_code === 'number' && CURRENT_VERSION_CODE < data.version_code;

    const needsUpdate = belowMinVersion || belowLatestVersion || belowVersionCode;
    const isForce = data.force_update === true || belowMinVersion;

    return {
      needsUpdate,
      isForce,
      versionInfo: data,
    };
  } catch (err: any) {
    // Si estamos offline o el servidor LAN no está encendido, silenciar error
    return {
      needsUpdate: false,
      isForce: false,
      error: err?.message || 'Error de conexión con servidor de versiones',
    };
  }
}

/**
 * Dispara la descarga e instalación del archivo .APK.
 * En Android, Linking.openURL invoca el gestor de descargas/navegador que descarga el APK
 * y abre el diálogo nativo del sistema: "¿Deseas instalar una actualización de esta aplicación?".
 */
export async function openApkDownload(apkUrl: string, serverUrl?: string): Promise<boolean> {
  try {
    let targetUrl = apkUrl;
    if (apkUrl.startsWith('/')) {
      const base = (serverUrl || 'http://192.168.1.10:8765').replace(/\/+$/, '');
      targetUrl = `${base}${apkUrl}`;
    }

    const supported = await Linking.canOpenURL(targetUrl);
    if (!supported) {
      Alert.alert(
        'Error de Descarga',
        `No fue posible abrir el enlace de descarga: ${targetUrl}`
      );
      return false;
    }

    await Linking.openURL(targetUrl);
    return true;
  } catch (err: any) {
    Alert.alert(
      'Error de Descarga',
      `Ocurrió un error al intentar iniciar la descarga del instalador: ${err?.message || err}`
    );
    return false;
  }
}

/**
 * Comprueba ambos escenarios de actualización (OTA y APK).
 */
export async function checkAllUpdates(options?: {
  silent?: boolean;
  serverUrl?: string;
  onApkUpdateFound?: (info: AppVersionInfo, isForce: boolean) => void;
}): Promise<void> {
  const silent = options?.silent ?? true;

  // 1. Probar parches OTA rápidos
  const otaApplied = await checkAndDownloadUpdate(silent);
  if (otaApplied) return;

  // 2. Probar si hay nuevo APK disponible
  const apkCheck = await checkApkVersion(options?.serverUrl);
  if (apkCheck.needsUpdate && apkCheck.versionInfo) {
    if (options?.onApkUpdateFound) {
      options.onApkUpdateFound(apkCheck.versionInfo, apkCheck.isForce);
    } else {
      Alert.alert(
        apkCheck.isForce ? '⚠️ Actualización Obligatoria' : '📦 Nueva Versión Disponible',
        `Está disponible la versión ${apkCheck.versionInfo.latest_version} de Kredia.\n\n${
          apkCheck.versionInfo.release_notes || 'Mejoras y correcciones en la aplicación.'
        }`,
        [
          ...(apkCheck.isForce ? [] : [{ text: 'Más tarde', style: 'cancel' as const }]),
          {
            text: 'Descargar e Instalar',
            style: 'default' as const,
            onPress: () => openApkDownload(apkCheck.versionInfo!.apk_url, options?.serverUrl),
          },
        ]
      );
    }
  } else if (!silent && !apkCheck.needsUpdate) {
    Alert.alert(
      'Sistema al Día',
      `Kredia móvil se encuentra en la versión más reciente (v${CURRENT_APP_VERSION}, compilación ${CURRENT_VERSION_CODE}). No hay actualizaciones de APK pendientes.`
    );
  }
}
