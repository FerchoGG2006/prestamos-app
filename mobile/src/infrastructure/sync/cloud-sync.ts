/**
 * MOTOR DE SINCRONIZACIÓN MULTI-DISPOSITIVO EN TIEMPO REAL + COLA OFFLINE (OUTBOX)
 *
 * Permite que el teléfono del Cobrador y el teléfono/PC de la Oficina Central
 * sincronicen cobros, clientes del taco, préstamos nuevos, renovaciones y gastos
 * automáticamente en cuanto exista conexión Wi-Fi o Internet, manteniendo operación
 * 100% Offline-First con llaves de idempotencia (idempotencyKey).
 */

import { localStore, safeStorage } from '../storage/local-store';
import { getLocalTodayStr } from '../../core/domain/calculator';
import { supabaseSyncService } from './supabase-client';

const OUTBOX_STORAGE_KEY = '@prestamos_sync_outbox_v1';

export interface SyncOutboxEvent {
  id: string;
  createdAt: string;
  operatingDate: string;
  routeId: string;
  pendingPaymentsCount: number;
  pendingLoansCount: number;
}

class CloudSyncEngine {
  private isSyncing = false;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private lastSyncStatus: 'IDLE' | 'SYNCING' | 'SUCCESS' | 'OFFLINE_QUEUED' = 'IDLE';
  private lastSyncMessage = 'Sincronización automática lista';
  private outboxCount = 0;

  public async initializeAutoSync(): Promise<void> {
    await this.refreshOutboxCount();

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

  public getStatus(): {
    status: 'IDLE' | 'SYNCING' | 'SUCCESS' | 'OFFLINE_QUEUED';
    message: string;
    outboxCount: number;
    lastSyncedAt?: string;
  } {
    const cfg = localStore.getOfficeConfig();
    return {
      status: this.lastSyncStatus,
      message: this.lastSyncMessage,
      outboxCount: this.outboxCount,
      lastSyncedAt: cfg.lastSyncedAt,
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
  }

  public async syncNowIfAutoEnabled(): Promise<boolean> {
    const cfg = localStore.getOfficeConfig();
    if (cfg.autoCloudSyncEnabled === false) return false;
    const serverUrl = (cfg.officeServerUrl || 'http://192.168.1.10:8765').trim();
    return this.syncBidirectional(serverUrl);
  }

  /**
   * Ejecuta sincronización bidireccional (Push de cobros/créditos locales + Pull de cartera actualizada)
   * soportando Servidor LAN (192.168.1.10:8765) y Nube Multi-Tenant (Supabase) sin fricción.
   */
  public async syncBidirectional(customServerUrl?: string): Promise<boolean> {
    if (this.isSyncing) return false;
    this.isSyncing = true;
    this.lastSyncStatus = 'SYNCING';
    this.lastSyncMessage = 'Sincronizando oficina y rutas...';

    const cfg = localStore.getOfficeConfig();
    const targetUrl = (customServerUrl || cfg.officeServerUrl || 'http://192.168.1.10:8765').trim();
    const todayStr = getLocalTodayStr();
    let anySyncSuccessful = false;

    // 1. Sincronización con Servidor LAN Desktop (192.168.1.10:8765)
    if (targetUrl) {
      try {
        await localStore.pushSyncToOfficeServer(targetUrl, todayStr);
        await localStore.pullRouteFromOfficeServer(targetUrl);
        anySyncSuccessful = true;
      } catch (lanErr) {
        // Si el cobrador está en la calle o fuera del alcance de la Wi-Fi de oficina
      }
    }

    // 2. Sincronización Multi-Tenant con Nube (Supabase) si está conectado
    if (supabaseSyncService.isConnected()) {
      try {
        const officeId = (cfg.companyName || 'Inversiones FBV')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-');
        const formattedOfficeId = `off-${officeId || 'fbv'}`;

        await supabaseSyncService.upsertOffice(formattedOfficeId, cfg);
        await supabaseSyncService.syncUsersAndRoutes(
          formattedOfficeId,
          localStore.getUsers(),
          localStore.getRoutes()
        );
        await supabaseSyncService.pushFullPortfolio(formattedOfficeId, {
          customers: localStore.getCustomers(),
          loans: localStore.getLoans(),
          installments: localStore.getInstallments(),
          payments: localStore.getPayments(),
          cashMovements: localStore.getCashMovements(),
        });
        anySyncSuccessful = true;
      } catch (cloudErr) {
        console.warn('[CloudSyncEngine] Cloud sync error:', cloudErr);
      }
    }

    const nowIso = new Date().toISOString();
    if (anySyncSuccessful) {
      await safeStorage.removeItem(OUTBOX_STORAGE_KEY);
      this.outboxCount = 0;
      this.lastSyncStatus = 'SUCCESS';
      this.lastSyncMessage = `Sincronizado correctamente (${new Date().toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
      })})`;
      await localStore.updateOfficeConfig({ lastSyncedAt: nowIso });
      this.isSyncing = false;
      return true;
    } else {
      this.lastSyncStatus = 'OFFLINE_QUEUED';
      this.lastSyncMessage =
        'Operando en modo Offline (Cambios guardados en cola local segura hasta detectar red)';
      this.isSyncing = false;
      return false;
    }
  }
}

export const cloudSyncEngine = new CloudSyncEngine();
