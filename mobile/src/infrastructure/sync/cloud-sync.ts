/**
 * MOTOR DE SINCRONIZACIÓN MULTI-DISPOSITIVO EN TIEMPO REAL + COLA OFFLINE (OUTBOX)
 *
 * Permite que el teléfono del Cobrador y el teléfono/PC de la Oficina Central
 * sincronicen cobros, clientes del taco, préstamos nuevos, renovaciones y gastos
 * automáticamente en cuanto exista conexión Wi-Fi o Internet, manteniendo operación
 * 100% Offline-First con llaves de idempotencia (idempotencyKey).
 *
 * Reglas de seguridad de datos:
 * 1. PUSH SIEMPRE antes de PULL: si `pushFullPortfolio` falla, NUNCA se ejecuta `mergeCloudPortfolio`
 *    para impedir sobrescribir cambios locales no subidos con datos más viejos de la nube.
 * 2. Si el token de sesión RLS (`cloudSessionToken`) falta o venció, intenta renovarlo
 *    silenciosamente con las credenciales recordadas de la MISMA oficina (sin tocar datos locales)
 *    y, si no es posible, expone estado explícito `NEEDS_CLOUD_AUTH` en la UI.
 */

import { localStore, safeStorage } from '../storage/local-store';
import { getLocalTodayStr } from '../../core/domain/calculator';
import { supabaseSyncService } from './supabase-client';

const OUTBOX_STORAGE_KEY = '@prestamos_sync_outbox_v1';
const REMEMBERED_CREDENTIALS_KEY = '@prestamos_remembered_credentials';

export type CloudSyncState =
  | 'IDLE'
  | 'SYNCING'
  | 'SUCCESS'
  | 'NEEDS_CLOUD_AUTH'
  | 'OFFLINE_QUEUED'
  | 'ERROR';

export interface SyncOutboxEvent {
  id: string;
  createdAt: string;
  operatingDate: string;
  routeId: string;
  pendingPaymentsCount: number;
  pendingLoansCount: number;
}

export interface CloudSyncStatusSnapshot {
  status: CloudSyncState;
  message: string;
  outboxCount: number;
  lastSyncedAt?: string;
  needsCloudAuth: boolean;
}

class CloudSyncEngine {
  private isSyncing = false;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private startupSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSyncStatus: CloudSyncState = 'IDLE';
  private lastSyncMessage = 'Sincronización automática lista';
  private outboxCount = 0;
  private sessionInvalidDetected = false;
  private listeners: Set<() => void> = new Set();

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitStatusChange(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
  }

  public async initializeAutoSync(): Promise<void> {
    await this.refreshOutboxCount();

    const cfg = localStore.getOfficeConfig();
    if (supabaseSyncService.isConnected() && !cfg.cloudSessionToken?.trim()) {
      this.lastSyncStatus = 'NEEDS_CLOUD_AUTH';
      this.lastSyncMessage = 'Sesión de nube pendiente — reconectando para subir cambios locales...';
      this.emitStatusChange();
    }

    // Escuchar cambios en localStore para encolar en el Outbox cuando hay nuevos cobros o créditos
    localStore.subscribe(() => {
      this.enqueueCurrentSnapshotIfNeeded().catch(() => {});
    });

    // En Web/PWA: sincronizar inmediatamente cuando el teléfono recupera señal de Internet / Wi-Fi
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('online', () => {
        this.syncNowIfAutoEnabled().catch(() => {});
      });
    }

    // Primer intento pronto tras arrancar (recupera token y sube pendientes sin esperar 60s)
    if (!this.startupSyncTimer) {
      this.startupSyncTimer = setTimeout(() => {
        this.startupSyncTimer = null;
        this.syncNowIfAutoEnabled().catch(() => {});
      }, 1500);
    }

    // Sincronización periódica ligera cada 60 segundos si está habilitada
    if (!this.syncTimer) {
      this.syncTimer = setInterval(() => {
        this.syncNowIfAutoEnabled().catch(() => {});
      }, 60000);
    }
  }

  private async refreshOutboxCount(): Promise<number> {
    try {
      const raw = await safeStorage.getItem(OUTBOX_STORAGE_KEY);
      if (!raw) {
        this.outboxCount = 0;
        return 0;
      }
      const parsed = JSON.parse(raw);
      this.outboxCount = Array.isArray(parsed) ? parsed.length : 0;
      return this.outboxCount;
    } catch {
      this.outboxCount = 0;
      return 0;
    }
  }

  public getStatus(): CloudSyncStatusSnapshot {
    const cfg = localStore.getOfficeConfig();
    const missingToken = supabaseSyncService.isConnected() && !cfg.cloudSessionToken?.trim();
    const needsCloudAuth =
      this.lastSyncStatus === 'NEEDS_CLOUD_AUTH' || this.sessionInvalidDetected || missingToken;
    return {
      status: needsCloudAuth && this.lastSyncStatus === 'IDLE' ? 'NEEDS_CLOUD_AUTH' : this.lastSyncStatus,
      message:
        needsCloudAuth && this.lastSyncStatus === 'IDLE'
          ? 'Reconecta tu cuenta para sincronizar tus cambios con la nube'
          : this.lastSyncMessage,
      outboxCount: this.outboxCount,
      lastSyncedAt: cfg.lastSyncedAt,
      needsCloudAuth,
    };
  }

  private async enqueueCurrentSnapshotIfNeeded(): Promise<void> {
    const todayStr = getLocalTodayStr();
    const payments = localStore.getPayments();
    const loans = localStore.getLoans();
    const session = localStore.getActiveSession();

    const entry: SyncOutboxEvent = {
      id: `outbox-${todayStr}`,
      createdAt: new Date().toISOString(),
      operatingDate: todayStr,
      routeId: session?.routeId || 'route-norte',
      pendingPaymentsCount: payments.length,
      pendingLoansCount: loans.length,
    };

    await safeStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify([entry]));
    this.outboxCount = 1;
    this.emitStatusChange();
  }

  /**
   * Intenta renovar el token criptográfico RLS usando las credenciales recordadas del dispositivo,
   * validando estrictamente que corresponda a la MISMA oficina local (sin borrar datos locales).
   */
  public async tryRecoverCloudSessionFromRememberedCredentials(): Promise<boolean> {
    if (!supabaseSyncService.isConnected()) return false;
    try {
      const raw = await safeStorage.getItem(REMEMBERED_CREDENTIALS_KEY);
      if (!raw) return false;
      const creds = JSON.parse(raw);
      const username = typeof creds?.username === 'string' ? creds.username.trim() : '';
      const password = typeof creds?.password === 'string' ? creds.password.trim() : '';
      if (!username || !password) return false;

      const res = await this.applyTokenOnlyReauth(username, password);
      return res.ok;
    } catch {
      return false;
    }
  }

  private async applyTokenOnlyReauth(
    username: string,
    password: string
  ): Promise<{ ok: boolean; error?: string }> {
    const res = await supabaseSyncService.reauthenticateCloudSession(username, password);
    if (!res.ok || !res.sessionToken || !res.officeId) {
      return { ok: false, error: res.error || 'No se pudo validar tu sesión en la nube.' };
    }

    const cfg = localStore.getOfficeConfig();
    const localOfficeId = (cfg.officeId || '').trim();
    if (localOfficeId && localOfficeId !== res.officeId) {
      return {
        ok: false,
        error:
          'Esas credenciales pertenecen a otra oficina distinta a la guardada en este dispositivo. Usa el usuario de esta oficina para no mezclar datos.',
      };
    }

    await localStore.updateOfficeConfig({
      officeId: res.officeId,
      activationCode: res.activationCode || cfg.activationCode || '',
      companyName: cfg.companyName || res.companyName || 'Mi Oficina',
      licenseStatus: res.licenseStatus || 'ACTIVE',
      licensePlan: res.licensePlan || cfg.licensePlan || 'LIFETIME',
      licenseExpiresAt: res.licenseExpiresAt ?? cfg.licenseExpiresAt ?? null,
      cloudSessionToken: res.sessionToken,
    });
    this.sessionInvalidDetected = false;
    return { ok: true };
  }

  /**
   * Flujo interactivo de reconexión segura desde la UI:
   * 1) Renueva el token RLS sin tocar cartera local.
   * 2) Sube (PUSH) primero todos los datos locales acumulados y luego fusiona (PULL).
   */
  public async reconnectCloudSession(
    username: string,
    password: string
  ): Promise<{ ok: boolean; message: string }> {
    const reauth = await this.applyTokenOnlyReauth(username, password);
    if (!reauth.ok) {
      this.sessionInvalidDetected = true;
      this.lastSyncStatus = 'NEEDS_CLOUD_AUTH';
      this.lastSyncMessage = reauth.error || 'Credenciales incorrectas.';
      this.emitStatusChange();
      return { ok: false, message: this.lastSyncMessage };
    }

    const synced = await this.syncBidirectional();
    const st = this.getStatus();
    if (synced) {
      return { ok: true, message: st.message };
    }
    return { ok: false, message: st.message || 'Sesión renovada, pero la sincronización falló.' };
  }

  public async syncNowIfAutoEnabled(): Promise<boolean> {
    const cfg = localStore.getOfficeConfig();
    if (cfg.autoCloudSyncEnabled === false) return false;
    const serverUrl = (cfg.officeServerUrl || 'http://192.168.1.10:8765').trim();
    return this.syncBidirectional(serverUrl);
  }

  /**
   * Ejecuta sincronización bidireccional (Push de cobros/créditos locales + Pull de cartera actualizada)
   * soportando Servidor LAN (192.168.1.10:8765) y Nube Multi-Tenant (Supabase) sin pérdida de datos.
   */
  public async syncBidirectional(customServerUrl?: string): Promise<boolean> {
    if (this.isSyncing) return false;
    this.isSyncing = true;
    this.lastSyncStatus = 'SYNCING';
    this.lastSyncMessage = 'Sincronizando oficina y rutas...';
    this.emitStatusChange();

    let cfg = localStore.getOfficeConfig();
    const targetUrl = (customServerUrl || cfg.officeServerUrl || 'http://192.168.1.10:8765').trim();
    const todayStr = getLocalTodayStr();
    let anySyncSuccessful = false;
    let cloudAuthNeeded = false;
    let cloudErrorMessage = '';

    // 1. Sincronización con Servidor LAN Desktop (192.168.1.10:8765) si está disponible
    if (targetUrl) {
      try {
        await localStore.pushSyncToOfficeServer(targetUrl, todayStr);
        await localStore.pullRouteFromOfficeServer(targetUrl);
        anySyncSuccessful = true;
      } catch {
        // Normal cuando el cobrador/administrador está fuera de la Wi-Fi local de oficina
      }
    }

    // 2. Sincronización Multi-Tenant con Nube (Supabase) con token de sesión RLS estricto
    if (supabaseSyncService.isConnected()) {
      try {
        // Si falta token o falta officeId (ej. sesión heredada pre-RLS), intentar recuperación silenciosa sin borrar datos
        if (!cfg.cloudSessionToken?.trim() || !cfg.officeId?.trim()) {
          const recovered = await this.tryRecoverCloudSessionFromRememberedCredentials();
          if (recovered) {
            cfg = localStore.getOfficeConfig();
          }
        }

        if (!cfg.officeId?.trim() || !cfg.cloudSessionToken?.trim()) {
          this.sessionInvalidDetected = true;
          cloudAuthNeeded = true;
          cloudErrorMessage = 'Reconecta tu usuario y contraseña para subir tus cambios locales a la nube.';
        } else {
          supabaseSyncService.setSessionToken(cfg.cloudSessionToken.trim());
          let immutableOfficeId = cfg.officeId.trim();
          let licenseCheck = await supabaseSyncService.checkOfficeLicense(immutableOfficeId);

          // Si el token expiró o fue revocado (sessionInvalid), intentar renovación silenciosa una sola vez
          if (licenseCheck.sessionInvalid) {
            const recovered = await this.tryRecoverCloudSessionFromRememberedCredentials();
            if (recovered) {
              cfg = localStore.getOfficeConfig();
              immutableOfficeId = cfg.officeId!.trim();
              supabaseSyncService.setSessionToken(cfg.cloudSessionToken!.trim());
              licenseCheck = await supabaseSyncService.checkOfficeLicense(immutableOfficeId);
            }
          }

          if (licenseCheck.sessionInvalid) {
            this.sessionInvalidDetected = true;
            cloudAuthNeeded = true;
            cloudErrorMessage = 'Tu sesión de nube venció. Toca aquí para reconectar y subir tus datos locales.';
          } else if (licenseCheck.networkError) {
            cloudErrorMessage = 'Sin conexión estable con la nube. Cambios guardados de forma segura en el teléfono.';
          } else if (!licenseCheck.active) {
            console.warn(
              `[CloudSyncEngine] Sincronización bloqueada: licencia ${licenseCheck.status} para oficina ${immutableOfficeId}`
            );
            await localStore.updateOfficeConfig({
              licenseStatus: licenseCheck.status,
              licenseExpiresAt: licenseCheck.expiresAt,
            });
            cloudErrorMessage =
              licenseCheck.status === 'EXPIRED'
                ? 'La licencia de la oficina ha vencido.'
                : 'La licencia de la oficina está suspendida.';
          } else {
            this.sessionInvalidDetected = false;
            await supabaseSyncService.upsertOffice(immutableOfficeId, cfg);
            await supabaseSyncService.syncUsersAndRoutes(
              immutableOfficeId,
              localStore.getUsers(),
              localStore.getRoutes()
            );

            // REGLA DE ORO: PUSH primero; solo ejecutar PULL + MERGE si PUSH completó 100% sin errores
            const pushResult = await supabaseSyncService.pushFullPortfolio(immutableOfficeId, {
              customers: localStore.getCustomers(),
              loans: localStore.getLoans(),
              installments: localStore.getInstallments(),
              payments: localStore.getPayments(),
              renewals: localStore.getRenewals(),
              settlements: localStore.getSettlements(),
              cashMovements: localStore.getCashMovements(),
            });

            if (!pushResult.ok) {
              cloudErrorMessage = `No se pudieron subir los cambios locales (${pushResult.error || 'error de red'}). Tus datos locales permanecen intactos.`;
            } else {
              const remoteSnapshot = await supabaseSyncService.pullFullPortfolio(immutableOfficeId);
              if (remoteSnapshot) {
                await localStore.mergeCloudPortfolio(remoteSnapshot);
              }
              anySyncSuccessful = true;
            }
          }
        }
      } catch (cloudErr: any) {
        console.warn('[CloudSyncEngine] Cloud sync error:', cloudErr);
        cloudErrorMessage = cloudErr?.message || 'Error temporal al sincronizar con la nube.';
      }
    }

    const nowIso = new Date().toISOString();
    if (anySyncSuccessful && !cloudAuthNeeded && !cloudErrorMessage) {
      await safeStorage.removeItem(OUTBOX_STORAGE_KEY);
      this.outboxCount = 0;
      this.lastSyncStatus = 'SUCCESS';
      this.lastSyncMessage = `Sincronizado (${new Date().toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
      })})`;
      await localStore.updateOfficeConfig({ lastSyncedAt: nowIso });
      this.isSyncing = false;
      this.emitStatusChange();
      return true;
    }

    if (cloudAuthNeeded) {
      this.lastSyncStatus = 'NEEDS_CLOUD_AUTH';
      this.lastSyncMessage = cloudErrorMessage || 'Reconecta tu cuenta para sincronizar con la nube.';
    } else if (cloudErrorMessage) {
      this.lastSyncStatus = 'ERROR';
      this.lastSyncMessage = cloudErrorMessage;
    } else {
      this.lastSyncStatus = 'OFFLINE_QUEUED';
      this.lastSyncMessage =
        'Operando en modo Offline (Cambios guardados en cola local segura hasta detectar red)';
    }

    this.isSyncing = false;
    this.emitStatusChange();
    return anySyncSuccessful;
  }
}

export const cloudSyncEngine = new CloudSyncEngine();
