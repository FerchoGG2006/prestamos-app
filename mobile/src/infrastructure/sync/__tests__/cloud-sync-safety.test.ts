import { localStore, safeStorage } from '../../storage/local-store';
import { cloudSyncEngine } from '../cloud-sync';
import { supabaseSyncService } from '../supabase-client';

const assert = {
  equal<T>(actual: T, expected: T, msg?: string) {
    if (actual !== expected) {
      throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  },
  deepEqual(actual: unknown, expected: unknown, msg?: string) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  },
};

export const cloudSyncSafetyTests = (async () => {
  const origIsConnected = supabaseSyncService.isConnected.bind(supabaseSyncService);
  const origSetToken = supabaseSyncService.setSessionToken.bind(supabaseSyncService);
  const origCheckLicense = supabaseSyncService.checkOfficeLicense.bind(supabaseSyncService);
  const origUpsertOffice = supabaseSyncService.upsertOffice.bind(supabaseSyncService);
  const origSyncUsersRoutes = supabaseSyncService.syncUsersAndRoutes.bind(supabaseSyncService);
  const origPush = supabaseSyncService.pushFullPortfolio.bind(supabaseSyncService);
  const origPull = supabaseSyncService.pullFullPortfolio.bind(supabaseSyncService);
  const origReauth = supabaseSyncService.reauthenticateCloudSession.bind(supabaseSyncService);

  const restoreMocks = () => {
    supabaseSyncService.isConnected = origIsConnected;
    supabaseSyncService.setSessionToken = origSetToken;
    supabaseSyncService.checkOfficeLicense = origCheckLicense;
    supabaseSyncService.upsertOffice = origUpsertOffice;
    supabaseSyncService.syncUsersAndRoutes = origSyncUsersRoutes;
    supabaseSyncService.pushFullPortfolio = origPush;
    supabaseSyncService.pullFullPortfolio = origPull;
    supabaseSyncService.reauthenticateCloudSession = origReauth;
  };

  try {
    await localStore.initialize();
    await localStore.updateOfficeConfig({
      officeId: 'off-fbv-001',
      companyName: 'Inversiones FBV',
      licenseStatus: 'ACTIVE',
      cloudSessionToken: '',
      officeServerUrl: '',
    });
    await safeStorage.removeItem('@prestamos_remembered_credentials');

    // 1. Sin token y sin credenciales recordadas -> expone NEEDS_CLOUD_AUTH y NO marca SUSPENDED
    supabaseSyncService.isConnected = () => true;
    const syncedNoToken = await cloudSyncEngine.syncBidirectional('');
    assert.equal(syncedNoToken, false);
    assert.equal(cloudSyncEngine.getStatus().status, 'NEEDS_CLOUD_AUTH');
    assert.equal(cloudSyncEngine.getStatus().needsCloudAuth, true);
    assert.equal(localStore.getOfficeConfig().licenseStatus, 'ACTIVE');

    // 2. Token vencido (sessionInvalid: true) -> NO suspende licencia, expone NEEDS_CLOUD_AUTH
    await localStore.updateOfficeConfig({ cloudSessionToken: 'expired-tok' });
    supabaseSyncService.setSessionToken = () => {};
    supabaseSyncService.checkOfficeLicense = async () => ({
      active: false,
      status: 'ACTIVE',
      expiresAt: null,
      sessionInvalid: true,
    });
    const syncedExpired = await cloudSyncEngine.syncBidirectional('');
    assert.equal(syncedExpired, false);
    assert.equal(cloudSyncEngine.getStatus().status, 'NEEDS_CLOUD_AUTH');
    assert.equal(localStore.getOfficeConfig().licenseStatus, 'ACTIVE');

    // 3. Fallo en pushFullPortfolio ABORTA pullFullPortfolio/merge (protección anti-pérdida)
    let pullCalled = false;
    supabaseSyncService.checkOfficeLicense = async () => ({
      active: true,
      status: 'ACTIVE',
      expiresAt: null,
    });
    supabaseSyncService.upsertOffice = async () => true;
    supabaseSyncService.syncUsersAndRoutes = async () => true;
    supabaseSyncService.pushFullPortfolio = async () => ({ ok: false, error: 'Simulated network timeout' });
    supabaseSyncService.pullFullPortfolio = async () => {
      pullCalled = true;
      return null;
    };
    const syncedPushFail = await cloudSyncEngine.syncBidirectional('');
    assert.equal(syncedPushFail, false);
    assert.equal(pullCalled, false, 'pullFullPortfolio must NEVER execute when pushFullPortfolio fails');
    assert.equal(cloudSyncEngine.getStatus().status, 'ERROR');

    // 4. Recuperación silenciosa con credenciales recordadas de la MISMA oficina -> PUSH primero, luego PULL
    const callOrder: string[] = [];
    await localStore.updateOfficeConfig({ cloudSessionToken: '' });
    await safeStorage.setItem(
      '@prestamos_remembered_credentials',
      JSON.stringify({ username: 'admin-fbv', password: 'SecretPassword1!' })
    );
    supabaseSyncService.reauthenticateCloudSession = async () => {
      callOrder.push('reauth');
      return {
        ok: true,
        sessionToken: 'fresh-rls-token-123',
        officeId: 'off-fbv-001',
        activationCode: 'KRD-FBV1-2026',
        companyName: 'Inversiones FBV',
        licenseStatus: 'ACTIVE',
        licensePlan: 'LIFETIME',
        licenseExpiresAt: null,
        authenticatedUserId: 'usr-adm-1',
      };
    };
    supabaseSyncService.pushFullPortfolio = async () => {
      callOrder.push('push');
      return { ok: true };
    };
    supabaseSyncService.pullFullPortfolio = async () => {
      callOrder.push('pull');
      return {
        office: null,
        users: [],
        routes: [],
        customers: [],
        loans: [],
        installments: [],
        payments: [],
        renewals: [],
        settlements: [],
        cashMovements: [],
      };
    };
    const syncedRecovered = await cloudSyncEngine.syncBidirectional('');
    assert.equal(syncedRecovered, true);
    assert.deepEqual(callOrder, ['reauth', 'push', 'pull']);
    assert.equal(localStore.getOfficeConfig().cloudSessionToken, 'fresh-rls-token-123');
    assert.equal(cloudSyncEngine.getStatus().status, 'SUCCESS');
    assert.equal(cloudSyncEngine.getStatus().needsCloudAuth, false);

    // 5. Protección multi-oficina: reconectar con usuario de OTRA oficina debe rechazarse sin mezclar datos
    supabaseSyncService.reauthenticateCloudSession = async () => ({
      ok: true,
      sessionToken: 'other-office-token',
      officeId: 'off-otra-999',
      companyName: 'Otra Oficina',
      licenseStatus: 'ACTIVE',
    });
    const wrongOfficeRes = await cloudSyncEngine.reconnectCloudSession('otro', 'pass');
    assert.equal(wrongOfficeRes.ok, false);
    assert.equal(localStore.getOfficeConfig().officeId, 'off-fbv-001');

    // 6. Protección monotónica en mergeCloudPortfolio: no degradar crédito RENOVADO ni cuota más pagada
    await localStore.applyLinkedOfficeBundle({
      officeId: 'off-fbv-001',
      activationCode: 'KRD-FBV1-2026',
      companyName: 'Inversiones FBV',
      licenseStatus: 'ACTIVE',
      users: [],
      routes: [],
      portfolio: {
        customers: [],
        loans: [
          {
            id: 'loan-mono-1',
            loanNumber: '#001',
            customerId: 'c1',
            routeId: 'route-1',
            collectorId: 'usr-col-1',
            principal: 100000,
            interestRate: 0.2,
            interestType: 'FLAT_INITIAL_CAPITAL',
            interestAmount: 20000,
            totalAgreed: 120000,
            installmentCount: 10,
            installmentAmount: 12000,
            frequency: 'DAILY',
            startDate: '2026-11-20',
            endDate: '2026-11-30',
            status: 'RENEWED',
            createdAt: '2026-11-20',
            updatedAt: '2026-11-23',
          },
        ],
        installments: [
          {
            id: 'inst-mono-1',
            loanId: 'loan-mono-1',
            installmentNumber: 1,
            dueDate: '2026-11-21',
            expectedAmount: 12000,
            paidAmount: 12000,
            pendingAmount: 0,
            status: 'PAGADA',
          },
        ],
        payments: [],
        renewals: [],
        settlements: [],
        cashMovements: [],
      },
      preserveLocalPortfolio: false,
    });

    await localStore.mergeCloudPortfolio({
      users: [],
      routes: [],
      customers: [],
      loans: [
        {
          id: 'loan-mono-1',
          loanNumber: '#001',
          customerId: 'c1',
          routeId: 'route-1',
          collectorId: 'usr-col-1',
          principal: 100000,
          interestRate: 0.2,
          interestType: 'FLAT_INITIAL_CAPITAL',
          interestAmount: 20000,
          totalAgreed: 120000,
          installmentCount: 10,
          installmentAmount: 12000,
          frequency: 'DAILY',
          startDate: '2026-11-20',
          endDate: '2026-11-30',
          status: 'ACTIVE',
          createdAt: '2026-11-20',
          updatedAt: '2026-11-20',
        },
      ],
      installments: [
        {
          id: 'inst-mono-1',
          loanId: 'loan-mono-1',
          installmentNumber: 1,
          dueDate: '2026-11-21',
          expectedAmount: 12000,
          paidAmount: 0,
          pendingAmount: 12000,
          status: 'PENDIENTE',
        },
      ],
      payments: [],
      renewals: [],
      settlements: [],
      cashMovements: [],
    });

    assert.equal(localStore.getLoans()[0].status, 'RENEWED');
    assert.equal(localStore.getInstallments()[0].paidAmount, 12000);

    console.log('PASS cloud-sync-safety.test.ts (6/6 assertions)');
  } finally {
    restoreMocks();
  }
})();
