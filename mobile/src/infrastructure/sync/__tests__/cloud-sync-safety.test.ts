import { localStore, safeStorage } from '../../storage/local-store';
import { cloudSyncEngine } from '../cloud-sync';
import { supabaseSyncService } from '../supabase-client';
import { hashPassword, isHashedPassword, verifyPassword } from '../../../core/utils/security';

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
    supabaseSyncService.syncUsersAndRoutes = async () => ({ ok: true });
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

    // 7. Sincronización bidireccional de Promesas y Visitas de No Pago (Desktop <-> Móvil en offices.settings)
    await localStore.recordPromise({
      customerId: 'c1',
      loanId: 'loan-mono-1',
      collectorId: 'usr-col-1',
      promisedAmount: 25000,
      promisedDate: '2026-11-26',
      todayStr: '2026-11-25',
      notes: 'Promesa móvil',
    });
    const localMobPromiseId = localStore.getPromises()[0].id;
    await localStore.recordNonPaymentVisit({
      customerId: 'c1',
      loanId: 'loan-mono-1',
      reason: 'LOCAL_CERRADO',
      reasonLabel: 'Negocio / local cerrado',
      notes: 'Cerrado a las 10am',
      date: '2026-11-25',
    });

    await localStore.mergeCloudPortfolio({
      office: {
        settings: {
          desktopPromises: [
            {
              id: 'prom-desktop-1',
              customerId: 'c1',
              loanId: 'loan-mono-1',
              amount: 40000,
              promisedDate: '2026-11-27',
              status: 'PENDIENTE',
              notes: 'Registrada desde computador',
              createdAt: '2026-11-25T15:00:00',
            },
            {
              id: localMobPromiseId,
              customerId: 'c1',
              loanId: 'loan-mono-1',
              amount: 25000,
              promisedDate: '2026-11-26',
              status: 'CUMPLIDA',
              notes: 'Promesa móvil',
              createdAt: '2026-11-25T14:00:00',
              updatedAt: '2026-11-25T16:00:00',
            },
          ],
          nonPaymentVisits: [
            {
              id: 'npv-desktop-1',
              customerId: 'c2',
              loanId: 'loan-mono-2',
              reason: 'NO_ESTABA',
              reasonLabel: 'No estaba en el domicilio',
              notes: 'Marcada en Desktop',
              date: '2026-11-25',
              createdAt: '2026-11-25T15:30:00Z',
            },
          ],
        },
      },
      users: [],
      routes: [],
      customers: [],
      loans: [],
      installments: [],
      payments: [],
      renewals: [],
      settlements: [],
      cashMovements: [],
    });

    const syncedDesktopPromise = localStore.getPromises().find((p) => p.id === 'prom-desktop-1');
    const resolvedLocalPromise = localStore.getPromises().find((p) => p.id === localMobPromiseId);
    const syncedDesktopVisit = localStore.getNonPaymentVisits('2026-11-25').find((v) => v.id === 'npv-desktop-1');
    const preservedMobileVisit = localStore.getNonPaymentVisits('2026-11-25').find((v) => v.customerId === 'c1');

    assert.equal(syncedDesktopPromise?.promisedAmount, 40000, 'Promesa creada en Desktop debe llegar al Móvil');
    assert.equal(resolvedLocalPromise?.status, 'CUMPLIDA', 'Estado terminal CUMPLIDA desde Desktop debe vencer a PENDIENTE');
    assert.equal(syncedDesktopVisit?.reason, 'NO_ESTABA', 'Visita No Pago creada en Desktop debe llegar al Móvil');
    assert.equal(preservedMobileVisit?.reason, 'LOCAL_CERRADO', 'Visita No Pago local del Móvil debe conservarse tras merge');

    // 8. Regresión mobile-route-credentials-sync:
    //    a) hashPassword es idempotente con PBKDF2 de escritorio (32hex$64hex) y sha256$
    const samplePbkdf2 = '0123456789abcdef0123456789abcdef$0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    assert.equal(isHashedPassword(samplePbkdf2), true, 'Debe reconocer hash PBKDF2 de escritorio');
    assert.equal(hashPassword(samplePbkdf2), samplePbkdf2, 'hashPassword NO debe re-hashear PBKDF2 de escritorio');

    //    b) updateRouteWithCredentials conserva clave existente si viene vacía, normaliza COLLECTOR->COBRADOR,
    //       rechaza claves prohibidas (cobrador/000000) y actualiza correctamente con nueva clave verificable
    await localStore.saveUsersAndRoutes(
      [
        {
          id: 'usr-col-edit-1',
          name: 'Cobrador Viejo',
          username: 'viejo1',
          password: samplePbkdf2,
          email: 'viejo1@oficina.com',
          role: 'COLLECTOR',
          routeId: 'rt-edit-1',
          assignedRouteIds: ['rt-edit-1'],
          isActive: true,
          createdAt: '2026-11-25',
        },
      ],
      [
        {
          id: 'rt-edit-1',
          name: 'Ruta 1',
          code: 'R1',
          collectorId: 'usr-col-edit-1',
          isActive: true,
          createdAt: '2026-11-25',
        },
      ]
    );

    const keptPassRes = await localStore.updateRouteWithCredentials({
      routeId: 'rt-edit-1',
      routeName: 'Ruta Norte Nueva',
      collectorName: 'Ruta Norte Nueva',
      username: 'cobrador.norte',
      password: '',
    });
    assert.equal(keptPassRes.route.name, 'Ruta Norte Nueva');
    assert.equal(keptPassRes.collector.username, 'cobrador.norte');
    assert.equal(keptPassRes.collector.role, 'COBRADOR', 'Debe normalizar COLLECTOR -> COBRADOR');
    assert.equal(keptPassRes.collector.password, samplePbkdf2, 'Clave vacía al editar debe conservar el hash PBKDF2');

    let forbiddenRejected = false;
    try {
      await localStore.updateRouteWithCredentials({
        routeId: 'rt-edit-1',
        routeName: 'Ruta Norte Nueva',
        collectorName: 'Ruta Norte Nueva',
        username: 'cobrador.norte',
        password: 'cobrador',
      });
    } catch {
      forbiddenRejected = true;
    }
    assert.equal(forbiddenRejected, true, 'Debe rechazar contraseñas prohibidas igual que LoginView');

    const newCredsRes = await localStore.updateRouteWithCredentials({
      routeId: 'rt-edit-1',
      routeName: 'Ruta Sur Activa',
      collectorName: 'Ruta Sur Activa',
      username: 'sur.cobro1',
      password: 'ClaveSegura2026!',
    });
    assert.equal(verifyPassword('ClaveSegura2026!', newCredsRes.collector.password || ''), true);
    assert.equal(isHashedPassword(newCredsRes.collector.password), true);

    //    c) Si syncUsersAndRoutes falla (ej. usuario duplicado global), syncBidirectional NO debe ejecutar pull/merge
    await localStore.updateOfficeConfig({ cloudSessionToken: 'valid-tok-123' });
    let pullCalledOnUserErr = false;
    supabaseSyncService.checkOfficeLicense = async () => ({
      active: true,
      status: 'ACTIVE',
      expiresAt: null,
    });
    supabaseSyncService.syncUsersAndRoutes = async () => ({
      ok: false,
      usernameConflict: true,
      error: 'Ese nombre de usuario ya está registrado en otra cuenta.',
    });
    supabaseSyncService.pullFullPortfolio = async () => {
      pullCalledOnUserErr = true;
      return null;
    };
    const syncBlockedOnUserErr = await cloudSyncEngine.syncBidirectional('');
    assert.equal(syncBlockedOnUserErr, false);
    assert.equal(pullCalledOnUserErr, false, 'NO debe ejecutar pull/merge si syncUsersAndRoutes falló');

    //    d) syncUsersAndRoutesNow sube inmediatamente usuarios y rutas con token activo
    let pushedNowUsers: any[] = [];
    let pushedNowRoutes: any[] = [];
    supabaseSyncService.syncUsersAndRoutes = async (_oid, u, r) => {
      pushedNowUsers = u;
      pushedNowRoutes = r;
      return { ok: true };
    };
    const immediateRes = await cloudSyncEngine.syncUsersAndRoutesNow();
    assert.equal(immediateRes.ok, true);
    assert.equal(pushedNowUsers.some((u) => u.username === 'sur.cobro1'), true);
    assert.equal(pushedNowRoutes.some((r) => r.name === 'Ruta Sur Activa'), true);

    console.log('PASS cloud-sync-safety.test.ts (18/18 assertions)');
  } finally {
    restoreMocks();
  }
})();
