import * as Updates from 'expo-updates';
import { Alert, Platform, Linking } from 'react-native';

export const CURRENT_APP_VERSION = '1.2.2';
export const CURRENT_VERSION_CODE = 6;
export const CLOUD_VERSION_URL =
  'https://raw.githubusercontent.com/FerchoGG2006/prestamos-app/feat/ui-ux-audit-handoff/version.json';

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
 * Escenario C: Consulta el endpoint de versionado para instaladores completos (.APK).
 * Intenta primero consultar la nube (GitHub raw) para que funcione en calle con datos móviles (4G/5G).
 * Si la nube no responde, hace fallback al servidor LAN de la oficina.
 */
export async function checkApkVersion(
  serverUrl: string = 'http://192.168.1.10:8765',
  timeoutMs: number = 3500
): Promise<ApkCheckResult> {
  if (Platform.OS === 'web') {
    return { needsUpdate: false, isForce: false };
  }

  const fetchVersionJson = async (url: string): Promise<AppVersionInfo | null> => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        return (await res.json()) as AppVersionInfo;
      }
    } catch {
      // Ignorar y permitir fallback
    }
    return null;
  };

  try {
    // 1. Intentar primero con la URL de versiones en la nube (accesible desde 4G/5G en calle)
    let data = await fetchVersionJson(CLOUD_VERSION_URL);

    // 2. Fallback al servidor LAN de la oficina si la nube no responde
    if (!data) {
      const cleanBaseUrl = serverUrl.replace(/\/+$/, '');
      const endpoint = `${cleanBaseUrl}/api/v1/app-version`;
      data = await fetchVersionJson(endpoint);
    }

    if (!data) {
      return {
        needsUpdate: false,
        isForce: false,
        error: 'No se pudo contactar el servidor de versiones (nube ni LAN)',
      };
    }

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
    return {
      needsUpdate: false,
      isForce: false,
      error: err?.message || 'Error de conexión con servidor de versiones',
    };
  }
}

const FLAG_GRANT_READ_URI_PERMISSION = 0x00000001;
const FLAG_ACTIVITY_NEW_TASK = 0x10000000;

/**
 * Descarga el APK dentro de la app (cacheDirectory) y abre el instalador nativo de Android
 * mediante un content:// URI del FileProvider de expo-file-system (evita FileUriExposedException).
 * Requiere el permiso REQUEST_INSTALL_PACKAGES declarado en app.json.
 *
 * Los módulos se cargan de forma diferida: en APK antiguos que no los incluyen,
 * la función devuelve false y se usa la descarga por navegador.
 */
export async function downloadAndInstallApk(
  apkUrl: string,
  onProgress?: (fraction: number) => void
): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  let FileSystem: typeof import('expo-file-system/legacy');
  let IntentLauncher: typeof import('expo-intent-launcher');
  try {
    FileSystem = require('expo-file-system/legacy');
    IntentLauncher = require('expo-intent-launcher');
  } catch {
    return false; // Binario sin módulos nativos de instalación
  }

  const target = `${FileSystem.cacheDirectory}kredia-update.apk`;
  await FileSystem.deleteAsync(target, { idempotent: true });

  const task = FileSystem.createDownloadResumable(apkUrl, target, {}, (p) => {
    if (p.totalBytesExpectedToWrite > 0) {
      onProgress?.(p.totalBytesWritten / p.totalBytesExpectedToWrite);
    }
  });
  const result = await task.downloadAsync();
  if (!result || result.status !== 200) {
    throw new Error(`Descarga fallida (HTTP ${result?.status ?? 'sin respuesta'})`);
  }

  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      type: 'application/vnd.android.package-archive',
      flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK,
    });
  } catch {
    // Android 8+: si Kredia no tiene permiso para instalar apps, abrir el switch
    // "Permitir desde esta fuente" y pedir al usuario que vuelva a tocar Instalar.
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES,
      { data: 'package:com.cartera.movil' }
    );
    Alert.alert(
      'Permiso necesario',
      'Activa "Permitir desde esta fuente" para Kredia, regresa y toca otra vez "Descargar e instalar".'
    );
  }
  return true;
}

/**
 * Dispara la descarga e instalación del archivo .APK.
 * Primero intenta la instalación interna (descarga + instalador nativo). Si el binario no
 * la soporta, usa Linking.openURL para que el navegador descargue el APK.
 */
export async function openApkDownload(
  apkUrl: string,
  serverUrl?: string,
  onProgress?: (fraction: number) => void
): Promise<boolean> {
  try {
    let targetUrl = apkUrl;
    if (apkUrl.startsWith('/')) {
      const base = (serverUrl || 'http://192.168.1.10:8765').replace(/\/+$/, '');
      targetUrl = `${base}${apkUrl}`;
    }

    try {
      if (await downloadAndInstallApk(targetUrl, onProgress)) return true;
    } catch (installErr) {
      console.warn('[Updates] Instalación interna falló, usando navegador:', installErr);
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
