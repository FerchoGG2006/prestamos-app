import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { verifyPassword } from '../../core/utils/security';
import {
  OfficialReceiptData,
  OfficialReceiptStatus,
  OfficialReceiptType,
} from '../../core/utils/whatsapp-receipt';
import {
  Customer,
  Loan,
  Installment,
  Payment,
  Renewal,
  DailySettlement,
  CashMovement,
  Route,
  User,
  OfficeCompanyConfig,
  PaymentPromise,
  NonPaymentVisit,
  PromiseStatus,
  NonPaymentReason,
} from '../../core/domain/types';

export interface ImmutableFinancialEventRow {
  id: string;
  office_id: string;
  idempotency_key: string;
  event_type:
    | 'OFFICE_OPENING_BALANCE'
    | 'LOAN_DISBURSED'
    | 'PAYMENT_RECEIVED'
    | 'PAYMENT_REVERSED'
    | 'RENEWAL_EXECUTED'
    | 'EXPENSE_RECORDED'
    | 'CAPITAL_INJECTED'
    | 'OFFICE_WITHDRAWAL'
    | 'PAPERWORK_WITHDRAWAL'
    | 'LOAN_CANCELLED'
    | 'SETTLEMENT_CLOSED'
    | 'ADJUSTMENT_ENTRY';
  entity_type: string;
  entity_id: string;
  route_id: string | null;
  customer_id: string | null;
  actor_user_id: string | null;
  amount: number;
  cash_delta: number;
  digital_delta: number;
  portfolio_delta: number;
  payload: Record<string, any>;
  occurred_at: string;
}

function toBogotaTimestamptz(localDateOrTs?: string): string {
  if (!localDateOrTs) return new Date().toISOString();
  const s = localDateOrTs.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T12:00:00-05:00`;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return `${s.replace(' ', 'T')}-05:00`;
  return s;
}

// Configuración por defecto o variables de entorno
export const DEFAULT_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const DEFAULT_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

class SupabaseSyncService {
  private client: SupabaseClient | null = null;
  private currentUrl = '';
  private currentKey = '';
  private sessionToken = '';

  constructor() {
    if (DEFAULT_SUPABASE_URL && DEFAULT_SUPABASE_ANON_KEY) {
      this.initClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY);
    }
  }

  public initClient(url: string, anonKey: string, sessionToken?: string): boolean {
    if (!url || !anonKey) return false;
    try {
      const tok = sessionToken !== undefined ? sessionToken.trim() : this.sessionToken;
      this.sessionToken = tok;
      this.client = createClient(url.trim(), anonKey.trim(), {
        global: {
          headers: tok ? { 'x-kredia-session': tok } : {},
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
      this.currentUrl = url.trim();
      this.currentKey = anonKey.trim();
      return true;
    } catch (e) {
      console.warn('[SupabaseSyncService] Failed to init client:', e);
      return false;
    }
  }

  public setSessionToken(token: string): void {
    const clean = (token || '').trim();
    if (clean === this.sessionToken && this.client) return;
    this.sessionToken = clean;
    if (this.currentUrl && this.currentKey) {
      this.initClient(this.currentUrl, this.currentKey, clean);
    }
  }

  public getSessionToken(): string {
    return this.sessionToken;
  }

  public isConnected(): boolean {
    return this.client !== null;
  }

  public getCredentials(): { url: string; anonKey: string } {
    return { url: this.currentUrl, anonKey: this.currentKey };
  }

  /**
   * Fusiona mapas de base de inicio diaria por ruta/fecha usando marca de tiempo más reciente (LWW)
   * para evitar que un cobrador sobrescriba la base definida por el Administrador.
   */
  private mergeOpeningBaseSettings(
    remoteSettings: any,
    localConfig: OfficeCompanyConfig
  ): {
    dailyOpeningBaseByRouteDate: Record<string, number>;
    dailyOpeningBaseMeta: Record<string, { amount: number; updatedAt: string }>;
  } {
    const remoteMap: Record<string, number> =
      remoteSettings && typeof remoteSettings.dailyOpeningBaseByRouteDate === 'object'
        ? remoteSettings.dailyOpeningBaseByRouteDate
        : {};
    const remoteMeta: Record<string, { amount: number; updatedAt: string }> =
      remoteSettings && typeof remoteSettings.dailyOpeningBaseMeta === 'object'
        ? remoteSettings.dailyOpeningBaseMeta
        : {};
    const localMap = localConfig.dailyOpeningBaseByRouteDate || {};
    const localMeta = localConfig.dailyOpeningBaseMeta || {};

    const mergedMap: Record<string, number> = {};
    const mergedMeta: Record<string, { amount: number; updatedAt: string }> = {};
    const allKeys = new Set([
      ...Object.keys(remoteMap),
      ...Object.keys(remoteMeta),
      ...Object.keys(localMap),
      ...Object.keys(localMeta),
    ]);

    for (const key of allKeys) {
      const rEntry = remoteMeta[key];
      const lEntry = localMeta[key];
      if (rEntry && lEntry) {
        if (lEntry.updatedAt >= rEntry.updatedAt) {
          mergedMeta[key] = lEntry;
          mergedMap[key] = Math.max(0, Number(lEntry.amount) || 0);
        } else {
          mergedMeta[key] = rEntry;
          mergedMap[key] = Math.max(0, Number(rEntry.amount) || 0);
        }
      } else if (lEntry) {
        mergedMeta[key] = lEntry;
        mergedMap[key] = Math.max(0, Number(lEntry.amount) || 0);
      } else if (rEntry) {
        mergedMeta[key] = rEntry;
        mergedMap[key] = Math.max(0, Number(rEntry.amount) || 0);
      } else if (typeof localMap[key] === 'number') {
        mergedMap[key] = Math.max(0, Number(localMap[key]) || 0);
      } else if (typeof remoteMap[key] === 'number') {
        mergedMap[key] = Math.max(0, Number(remoteMap[key]) || 0);
      }
    }

    return {
      dailyOpeningBaseByRouteDate: mergedMap,
      dailyOpeningBaseMeta: mergedMeta,
    };
  }

  private isTerminalPromiseStatus(status?: string): boolean {
    const s = String(status || '').toUpperCase();
    return s === 'CUMPLIDA' || s === 'CANCELADA' || s === 'INCUMPLIDA';
  }

  private normalizePromiseWire(raw: any): any | null {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    const customerId = String(raw.customerId || '').trim();
    const promisedDate = String(raw.promisedDate || '').trim();
    if (!id || !customerId || !promisedDate) return null;
    const amountRaw = typeof raw.amount === 'number' ? raw.amount : Number(raw.promisedAmount ?? raw.amount ?? 0);
    const amount = Number.isFinite(amountRaw) ? Math.max(0, Math.round(amountRaw)) : 0;
    const statusRaw = String(raw.status || 'PENDIENTE').trim().toUpperCase();
    const status: PromiseStatus =
      statusRaw === 'CUMPLIDA' || statusRaw === 'CANCELADA' || statusRaw === 'INCUMPLIDA'
        ? (statusRaw as PromiseStatus)
        : 'PENDIENTE';
    const createdAt = String(raw.createdAt || '').trim();
    const updatedAt = String(raw.updatedAt || createdAt).trim();
    return {
      id,
      customerId,
      loanId: raw.loanId ? String(raw.loanId).trim() : null,
      ...(raw.collectorId ? { collectorId: String(raw.collectorId).trim() } : {}),
      amount,
      promisedDate,
      status,
      notes: String(raw.notes || ''),
      createdAt,
      updatedAt,
    };
  }

  private mergePromisesSettings(remoteSettings: any, localPromises?: PaymentPromise[]): any[] {
    const byId = new Map<string, any>();
    const remoteArr = Array.isArray(remoteSettings?.desktopPromises) ? remoteSettings.desktopPromises : [];
    for (const r of remoteArr) {
      const norm = this.normalizePromiseWire(r);
      if (norm) byId.set(norm.id, norm);
    }
    for (const lp of localPromises || []) {
      const norm = this.normalizePromiseWire({
        id: lp.id,
        customerId: lp.customerId,
        loanId: lp.loanId,
        collectorId: lp.collectorId,
        amount: lp.promisedAmount,
        promisedDate: lp.promisedDate,
        status: lp.status,
        notes: lp.notes || '',
        createdAt: lp.createdAt,
        updatedAt: lp.updatedAt || lp.createdAt,
      });
      if (!norm) continue;
      const prev = byId.get(norm.id);
      if (!prev) {
        byId.set(norm.id, norm);
      } else {
        const prevTerm = this.isTerminalPromiseStatus(prev.status);
        const locTerm = this.isTerminalPromiseStatus(norm.status);
        if (locTerm && !prevTerm) {
          byId.set(norm.id, { ...prev, ...norm });
        } else if (prevTerm && !locTerm) {
          // Conservar estado terminal remoto (ej. resuelta en Desktop)
          byId.set(norm.id, { ...norm, ...prev });
        } else if ((norm.updatedAt || '') > (prev.updatedAt || '')) {
          byId.set(norm.id, { ...prev, ...norm });
        }
      }
    }
    return Array.from(byId.values())
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || a.id.localeCompare(b.id))
      .slice(0, 500);
  }

  private normalizeVisitWire(raw: any): any | null {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    const customerId = String(raw.customerId || '').trim();
    const loanId = String(raw.loanId || '').trim();
    const createdAt = String(raw.createdAt || '').trim();
    const date = String(raw.date || (createdAt.length >= 10 ? createdAt.slice(0, 10) : '')).trim();
    if (!id || !customerId || !loanId || !date) return null;
    const validReasons: NonPaymentReason[] = ['NO_ESTABA', 'LOCAL_CERRADO', 'PASAR_TARDE', 'SIN_DINERO', 'OTRO'];
    const reasonRaw = String(raw.reason || 'OTRO').trim().toUpperCase() as NonPaymentReason;
    const reason: NonPaymentReason = validReasons.includes(reasonRaw) ? reasonRaw : 'OTRO';
    const reasonLabel = String(raw.reasonLabel || 'No pagó').trim();
    return {
      id,
      customerId,
      loanId,
      reason,
      reasonLabel,
      notes: String(raw.notes || ''),
      date,
      createdAt,
    };
  }

  private mergeNonPaymentVisitsSettings(remoteSettings: any, localVisits?: NonPaymentVisit[]): any[] {
    const byId = new Map<string, any>();
    const remoteArr = Array.isArray(remoteSettings?.nonPaymentVisits) ? remoteSettings.nonPaymentVisits : [];
    for (const r of remoteArr) {
      const norm = this.normalizeVisitWire(r);
      if (norm) byId.set(norm.id, norm);
    }
    for (const lv of localVisits || []) {
      const norm = this.normalizeVisitWire(lv);
      if (!norm) continue;
      const prev = byId.get(norm.id);
      if (!prev || (norm.createdAt || '') > (prev.createdAt || '')) {
        byId.set(norm.id, norm);
      }
    }
    // Deduplicar por customerId::date conservando la visita más reciente
    const byCustomerDate = new Map<string, any>();
    for (const v of byId.values()) {
      const key = `${v.customerId}::${v.date}`;
      const existing = byCustomerDate.get(key);
      if (!existing || (v.createdAt || '') >= (existing.createdAt || '')) {
        byCustomerDate.set(key, v);
      }
    }
    return Array.from(byCustomerDate.values())
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || a.id.localeCompare(b.id))
      .slice(0, 500);
  }

  /**
   * Sube o actualiza la oficina en la nube (Multi-Tenant)
   */
  public async upsertOffice(
    officeId: string,
    config: OfficeCompanyConfig,
    followUp?: { promises?: PaymentPromise[]; nonPaymentVisits?: NonPaymentVisit[] }
  ): Promise<boolean> {
    if (!this.client) return false;
    try {
      const { data: existingOffice } = await this.client
        .from('offices')
        .select('settings')
        .eq('id', officeId)
        .maybeSingle();
      const mergedOpening = this.mergeOpeningBaseSettings(existingOffice?.settings, config);
      const mergedPromises = this.mergePromisesSettings(existingOffice?.settings, followUp?.promises);
      const mergedVisits = this.mergeNonPaymentVisitsSettings(existingOffice?.settings, followUp?.nonPaymentVisits);

      const { error } = await this.client.from('offices').upsert({
        id: officeId,
        company_name: config.companyName || 'Mi Oficina',
        tax_id: config.taxId || '',
        city: config.city || '',
        address: config.address || '',
        support_phone: config.supportPhone || '',
        recovery_pin: config.recoveryPin || '',
        settings: {
          ...(existingOffice?.settings && typeof existingOffice.settings === 'object'
            ? existingOffice.settings
            : {}),
          defaultInterestRate: config.defaultInterestRate,
          defaultInstallmentsCount: config.defaultInstallmentsCount,
          defaultFrequency: config.defaultFrequency,
          excludeSundays: config.excludeSundays,
          paperworkFeeEnabled: config.paperworkFeeEnabled,
          paperworkRate: config.paperworkRate,
          routeInitialCashBase: config.routeInitialCashBase,
          dailyOpeningBaseByRouteDate: mergedOpening.dailyOpeningBaseByRouteDate,
          dailyOpeningBaseMeta: mergedOpening.dailyOpeningBaseMeta,
          ...(mergedPromises.length > 0 ? { desktopPromises: mergedPromises } : {}),
          ...(mergedVisits.length > 0 ? { nonPaymentVisits: mergedVisits } : {}),
        },
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      return true;
    } catch (err) {
      console.warn('[SupabaseSyncService] upsertOffice error:', err);
      return false;
    }
  }

  private normalizeCloudRole(role?: string): 'ADMIN' | 'COBRADOR' | 'SUPERVISOR' | 'SUPER_ADMIN' {
    const r = String(role || 'COBRADOR').trim().toUpperCase();
    if (r === 'ADMIN' || r === 'SUPERVISOR' || r === 'SUPER_ADMIN' || r === 'COBRADOR') {
      return r;
    }
    if (r === 'COLLECTOR') return 'COBRADOR';
    return 'COBRADOR';
  }

  /**
   * Consulta ligera de los IDs de rutas vigentes en el servidor para la oficina.
   * Permite evitar que un dispositivo con caché vieja resucite rutas eliminadas.
   */
  public async fetchOfficeRouteIds(officeId: string): Promise<string[] | null> {
    if (!this.client || !officeId) return null;
    try {
      const { data, error } = await this.client
        .from('routes')
        .select('id')
        .eq('office_id', officeId);
      if (error || !Array.isArray(data)) return null;
      return data
        .map((r: any) => String(r?.id || '').trim())
        .filter(Boolean);
    } catch {
      return null;
    }
  }

  /**
   * Sincroniza usuarios y rutas de la oficina verificando errores reales de Supabase/PostgreSQL.
   */
  public async syncUsersAndRoutes(
    officeId: string,
    users: User[],
    routes: Route[]
  ): Promise<{
    ok: boolean;
    error?: string;
    usernameConflict?: boolean;
    sessionExpired?: boolean;
    networkError?: boolean;
  }> {
    if (!this.client) {
      return { ok: false, error: 'Servicio en la nube no configurado.', networkError: true };
    }
    try {
      // Filtrar usuarios fantasma sin username o sin contraseña hasheada (evita filas rotas con pw_len = 0)
      const validUsers = users.filter(
        (u) => Boolean((u.username || '').trim()) && Boolean((u.password || '').trim())
      );
      if (validUsers.length > 0) {
        const payloadUsers = validUsers.map((u) => ({
          id: u.id,
          office_id: officeId,
          name: u.name || u.username || 'Usuario',
          username: (u.username || u.name).toLowerCase().trim(),
          password_hash: u.password || '',
          role: this.normalizeCloudRole(u.role),
          phone: u.phone || '',
          is_active: u.isActive !== false,
          assigned_route_ids: u.assignedRouteIds || [],
          updated_at: new Date().toISOString(),
        }));
        const { error: usersErr } = await this.client
          .from('users')
          .upsert(payloadUsers, { onConflict: 'id' });
        if (usersErr) {
          const code = String(usersErr.code || '');
          const msg = String(usersErr.message || '');
          const lower = `${code} ${msg}`.toLowerCase();
          if (
            code === '23505' ||
            lower.includes('uq_users_global_username') ||
            lower.includes('uq_office_username') ||
            lower.includes('duplicate key')
          ) {
            return {
              ok: false,
              usernameConflict: true,
              error:
                'Ese nombre de usuario ya está registrado en otra cuenta o ruta de Kredia. Elige un usuario distinto (ej. nombre.ruta1).',
            };
          }
          if (code === '42501' || lower.includes('row-level security') || lower.includes('permission')) {
            return {
              ok: false,
              sessionExpired: true,
              error: 'Tu sesión expiró. Cierra sesión e inicia nuevamente para guardar cambios de seguridad.',
            };
          }
          return {
            ok: false,
            error: `No se pudieron guardar los usuarios en la nube: ${msg || code}`,
          };
        }
      }

      if (routes.length > 0) {
        const validUserIds = new Set(validUsers.map((u) => u.id));
        const payloadRoutes = routes.map((r) => ({
          id: r.id,
          office_id: officeId,
          name: r.name,
          code: r.code || r.name.slice(0, 4).toUpperCase(),
          collector_id: r.collectorId && validUserIds.has(r.collectorId) ? r.collectorId : null,
          target_administrative: r.targetAdministrative || 0,
          initial_cash_base: r.initialCashBase || 0,
          expected_customers_count: r.expectedCustomersCount || 0,
          is_active: r.isActive !== false,
          updated_at: new Date().toISOString(),
        }));
        const { error: routesErr } = await this.client
          .from('routes')
          .upsert(payloadRoutes, { onConflict: 'id' });
        if (routesErr) {
          const code = String(routesErr.code || '');
          const lower = `${code} ${routesErr.message || ''}`.toLowerCase();
          if (code === '42501' || lower.includes('row-level security') || lower.includes('permission')) {
            return {
              ok: false,
              sessionExpired: true,
              error: 'Tu sesión expiró. Cierra sesión e inicia nuevamente para guardar cambios en rutas.',
            };
          }
          return {
            ok: false,
            error: `No se pudieron guardar las rutas en la nube: ${routesErr.message || routesErr.code}`,
          };
        }
      }
      return { ok: true };
    } catch (err: any) {
      console.warn('[SupabaseSyncService] syncUsersAndRoutes error:', err);
      const msg = String(err?.message || err || '');
      const isNet = /network|fetch|timeout|failed to fetch|offline/i.test(msg);
      return {
        ok: false,
        networkError: isNet,
        error: msg || 'Error de conexión al sincronizar usuarios y rutas.',
      };
    }
  }

  /**
   * Sube todos los clientes, créditos, cuotas, cobros, renovaciones, liquidaciones y movimientos de caja.
   * Retorna resultado explícito { ok, error } para que el motor NUNCA pise datos locales si el PUSH falló.
   */
  public async pushFullPortfolio(
    officeId: string,
    data: {
      customers: Customer[];
      loans: Loan[];
      installments: Installment[];
      payments: Payment[];
      renewals?: Renewal[];
      settlements?: DailySettlement[];
      cashMovements: CashMovement[];
    }
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this.client) return { ok: false, error: 'Cliente Supabase no inicializado.' };
    try {
      const chunkSize = 200;

      if (data.customers.length > 0) {
        const custRows = data.customers.map((c) => ({
          id: c.id,
          office_id: officeId,
          route_id: c.routeId || null,
          assigned_collector_id: c.assignedCollectorId || null,
          full_name: c.fullName,
          document_number: c.documentNumber,
          phone: c.phone || '',
          whatsapp_phone: c.whatsappPhone || '',
          address: c.address || '',
          neighborhood: c.neighborhood || '',
          city: c.city || '',
          occupation: c.occupation || '',
          business_name: c.businessName || '',
          order_index: c.orderIndex || 0,
          status: c.status || 'ACTIVE',
          notes: c.notes || '',
          references: c.references || [],
          updated_at: new Date().toISOString(),
        }));
        for (let i = 0; i < custRows.length; i += chunkSize) {
          const { error } = await this.client.from('customers').upsert(custRows.slice(i, i + chunkSize));
          if (error) throw error;
        }
      }

      if (data.loans.length > 0) {
        // Primero créditos base (sin previousLoanId), luego renovaciones
        const sortedLoans = [...data.loans].sort((a, b) => (a.previousLoanId ? 1 : 0) - (b.previousLoanId ? 1 : 0));
        const loanRows = sortedLoans.map((l) => ({
          id: l.id,
          office_id: officeId,
          route_id: l.routeId || null,
          customer_id: l.customerId,
          collector_id: l.collectorId || null,
          loan_number: l.loanNumber,
          principal: l.principal,
          interest_rate: l.interestRate,
          interest_amount: l.interestAmount,
          total_agreed: l.totalAgreed,
          installment_count: l.installmentCount,
          installment_amount: l.installmentAmount,
          frequency: l.frequency,
          start_date: l.startDate,
          end_date: l.endDate || null,
          fixed_due_date: l.fixedDueDate || null,
          status: l.status,
          previous_loan_id: l.previousLoanId || null,
          notes: l.notes || '',
          updated_at: new Date().toISOString(),
        }));
        for (let i = 0; i < loanRows.length; i += chunkSize) {
          const { error } = await this.client.from('loans').upsert(loanRows.slice(i, i + chunkSize));
          if (error) throw error;
        }
      }

      if (data.installments.length > 0) {
        for (let i = 0; i < data.installments.length; i += chunkSize) {
          const chunk = data.installments.slice(i, i + chunkSize).map((inst) => ({
            id: inst.id,
            office_id: officeId,
            loan_id: inst.loanId,
            installment_number: inst.installmentNumber,
            due_date: inst.dueDate,
            amount: inst.expectedAmount,
            paid_amount: inst.paidAmount || 0,
            pending_amount: inst.pendingAmount,
            status: inst.status,
            last_payment_date: inst.lastPaymentDate || null,
            updated_at: new Date().toISOString(),
          }));
          const { error } = await this.client.from('installments').upsert(chunk);
          if (error) throw error;
        }
      }

      if (data.payments.length > 0) {
        const payRows = data.payments.map((p) => ({
          id: p.id,
          office_id: officeId,
          idempotency_key: p.idempotencyKey || p.id,
          loan_id: p.loanId,
          customer_id: p.customerId,
          collector_id: p.collectorId || null,
          route_id: null,
          session_id: p.sessionId || null,
          amount_received: p.amountReceived,
          payment_method: p.paymentMethod || 'CASH',
          digital_reference: '',
          installments_breakdown: p.installmentsBreakdown || [],
          notes: p.notes || '',
          status: p.status || 'COMPLETED',
          local_created_at: p.createdAt,
          created_at: toBogotaTimestamptz(p.createdAt),
        }));
        for (let i = 0; i < payRows.length; i += chunkSize) {
          const chunk = payRows.slice(i, i + chunkSize);
          const { error } = await this.client.from('payments').upsert(chunk);
          if (error) {
            const msg = String(error.message || error.code || '');
            if (msg.includes('23505') || msg.includes('idempotency') || msg.includes('409')) {
              for (const row of chunk) {
                const { error: rowErr } = await this.client
                  .from('payments')
                  .upsert(row, { onConflict: 'id', ignoreDuplicates: true });
                if (rowErr) {
                  console.warn('[SupabaseSyncService] Pago omitido por idempotencia:', row.id, rowErr.message);
                }
              }
            } else {
              throw error;
            }
          }
        }
      }

      if (data.renewals && data.renewals.length > 0) {
        const renRows = data.renewals.map((r) => ({
          id: r.id,
          office_id: officeId,
          customer_id: r.customerId,
          previous_loan_id: r.previousLoanId,
          new_loan_id: r.newLoanId,
          collector_id: r.collectorId || null,
          new_principal: r.newPrincipal,
          previous_balance_deducted: r.previousBalanceDeducted || 0,
          paperwork_deducted: r.paperworkDeducted || 0,
          actual_cash_disbursed: r.actualCashDisbursed || 0,
          local_created_at: r.createdAt,
          created_at: toBogotaTimestamptz(r.createdAt),
        }));
        for (let i = 0; i < renRows.length; i += chunkSize) {
          const { error } = await this.client.from('renewals').upsert(renRows.slice(i, i + chunkSize));
          if (error) throw error;
        }
      }

      if (data.settlements && data.settlements.length > 0) {
        const setRows = data.settlements.map((s) => ({
          id: s.id,
          office_id: officeId,
          session_id: s.sessionId || null,
          route_id: s.routeId || null,
          collector_id: s.collectorId || null,
          settlement_date: s.date,
          status: s.status || 'SETTLED',
          payload: s,
          settled_at: s.settledAt || new Date().toISOString(),
        }));
        for (let i = 0; i < setRows.length; i += chunkSize) {
          const { error } = await this.client.from('daily_settlements').upsert(setRows.slice(i, i + chunkSize));
          if (error) throw error;
        }
      }

      if (data.cashMovements.length > 0) {
        const cmRows = data.cashMovements.map((cm) => ({
          id: cm.id,
          office_id: officeId,
          route_id: cm.routeId || null,
          collector_id: cm.collectorId || null,
          session_id: cm.sessionId || null,
          type: cm.type,
          category: cm.category,
          amount: cm.amount,
          reference_id: cm.referenceId || null,
          description: cm.description || '',
          local_created_at: cm.createdAt,
          created_at: toBogotaTimestamptz(cm.createdAt),
        }));
        for (let i = 0; i < cmRows.length; i += chunkSize) {
          const { error } = await this.client.from('cash_movements').upsert(cmRows.slice(i, i + chunkSize));
          if (error) throw error;
        }
      }

      // Libro Mayor Financiero Inmutable (Append-Only): insertar hechos financieros sin mutar ni duplicar
      const ledgerEvents = this.buildImmutableEventsFromPortfolio(officeId, data);
      if (ledgerEvents.length > 0) {
        await this.appendFinancialEventsBatch(ledgerEvents);
      }

      return { ok: true };
    } catch (err: any) {
      const errMsg = err?.message || String(err || 'Error desconocido al subir cartera');
      console.warn('[SupabaseSyncService] pushFullPortfolio error:', errMsg);
      return { ok: false, error: errMsg };
    }
  }

  /**
   * Inserta hechos financieros inmutables en public.financial_events (APPEND-ONLY, idempotente).
   */
  public async appendFinancialEventsBatch(events: ImmutableFinancialEventRow[]): Promise<boolean> {
    if (!this.client || events.length === 0) return false;
    try {
      const chunkSize = 100;
      for (let i = 0; i < events.length; i += chunkSize) {
        const chunk = events.slice(i, i + chunkSize);
        const { error } = await this.client
          .from('financial_events')
          .upsert(chunk, { onConflict: 'office_id,idempotency_key', ignoreDuplicates: true });
        if (error) throw error;
      }
      return true;
    } catch (err) {
      console.warn('[SupabaseSyncService] appendFinancialEventsBatch error:', err);
      return false;
    }
  }

  /**
   * Genera hechos inmutables deterministas (estilo Datomic/Nubank) a partir de operaciones financieras.
   */
  public buildImmutableEventsFromPortfolio(
    officeId: string,
    data: {
      loans: Loan[];
      payments: Payment[];
      renewals?: Renewal[];
      cashMovements: CashMovement[];
    }
  ): ImmutableFinancialEventRow[] {
    const events: ImmutableFinancialEventRow[] = [];
    const loanById = new Map(data.loans.map((l) => [l.id, l]));
    const renewalByNewLoanId = new Map((data.renewals || []).map((r) => [r.newLoanId, r]));

    // 1. Préstamos nuevos (no renovaciones)
    for (const l of data.loans) {
      if (l.previousLoanId || l.status === 'CANCELLED') continue;
      const isMigrated = Boolean(
        l.notes?.startsWith('Migrado de cartulina física') ||
        l.notes?.startsWith('Migrado de cartulina fisica')
      );
      events.push({
        id: `evt-loan-${l.id}`,
        office_id: officeId,
        idempotency_key: `loan:${l.id}`,
        event_type: isMigrated ? 'OFFICE_OPENING_BALANCE' : 'LOAN_DISBURSED',
        entity_type: 'LOAN',
        entity_id: l.id,
        route_id: l.routeId || null,
        customer_id: l.customerId,
        actor_user_id: l.collectorId || null,
        amount: l.principal,
        cash_delta: isMigrated ? 0 : -l.principal,
        digital_delta: 0,
        portfolio_delta: l.totalAgreed,
        payload: { loanNumber: l.loanNumber, principal: l.principal, totalAgreed: l.totalAgreed, migrated: isMigrated },
        occurred_at: toBogotaTimestamptz(l.startDate || l.createdAt),
      });
    }

    // 2. Renovaciones
    for (const r of data.renewals || []) {
      const newLoan = loanById.get(r.newLoanId);
      const newTotal = newLoan ? newLoan.totalAgreed : r.newPrincipal;
      events.push({
        id: `evt-ren-${r.id}`,
        office_id: officeId,
        idempotency_key: `renewal:${r.id}`,
        event_type: 'RENEWAL_EXECUTED',
        entity_type: 'RENEWAL',
        entity_id: r.id,
        route_id: newLoan?.routeId || null,
        customer_id: r.customerId,
        actor_user_id: r.collectorId || null,
        amount: r.actualCashDisbursed,
        cash_delta: -r.actualCashDisbursed,
        digital_delta: 0,
        portfolio_delta: newTotal - (r.previousBalanceDeducted || 0),
        payload: {
          previousLoanId: r.previousLoanId,
          newLoanId: r.newLoanId,
          newPrincipal: r.newPrincipal,
          previousBalanceDeducted: r.previousBalanceDeducted,
          paperworkDeducted: r.paperworkDeducted,
          actualCashDisbursed: r.actualCashDisbursed,
        },
        occurred_at: toBogotaTimestamptz(r.createdAt),
      });
    }

    // 3. Pagos recibidos y reversos
    for (const p of data.payments) {
      const loan = loanById.get(p.loanId);
      const isDigital = p.paymentMethod === 'NEQUI' || p.paymentMethod === 'TRANSFER' || p.paymentMethod === 'OTHER';
      const isReversed = p.status === 'REVERSED';
      events.push({
        id: `evt-pay-${p.id}`,
        office_id: officeId,
        idempotency_key: `payment:${p.idempotencyKey || p.id}`,
        event_type: 'PAYMENT_RECEIVED',
        entity_type: 'PAYMENT',
        entity_id: p.id,
        route_id: loan?.routeId || null,
        customer_id: p.customerId,
        actor_user_id: p.collectorId || null,
        amount: p.amountReceived,
        cash_delta: isDigital ? 0 : p.amountReceived,
        digital_delta: isDigital ? p.amountReceived : 0,
        portfolio_delta: -p.amountReceived,
        payload: { loanId: p.loanId, method: p.paymentMethod, breakdownCount: (p.installmentsBreakdown || []).length },
        occurred_at: toBogotaTimestamptz(p.createdAt),
      });

      if (isReversed) {
        events.push({
          id: `evt-rev-${p.id}`,
          office_id: officeId,
          idempotency_key: `payment-reversal:${p.id}`,
          event_type: 'PAYMENT_REVERSED',
          entity_type: 'PAYMENT',
          entity_id: p.id,
          route_id: loan?.routeId || null,
          customer_id: p.customerId,
          actor_user_id: p.collectorId || null,
          amount: p.amountReceived,
          cash_delta: isDigital ? 0 : -p.amountReceived,
          digital_delta: isDigital ? -p.amountReceived : 0,
          portfolio_delta: p.amountReceived,
          payload: { reversedPaymentId: p.id, method: p.paymentMethod },
          occurred_at: toBogotaTimestamptz(p.createdAt),
        });
      }
    }

    // 4. Movimientos operativos de caja (inyecciones, gastos, retiros, ajustes)
    for (const cm of data.cashMovements) {
      if (
        cm.category === 'COLLECTION' ||
        cm.category === 'LOAN_DISBURSEMENT' ||
        cm.category === 'RENEWAL_DISBURSEMENT' ||
        cm.category === 'PAYMENT_REVERSAL'
      ) {
        continue;
      }
      let eventType: ImmutableFinancialEventRow['event_type'] = 'ADJUSTMENT_ENTRY';
      let cashDelta = cm.type === 'INCOME' ? cm.amount : -cm.amount;
      if (cm.category === 'CAPITAL_INJECTION') {
        eventType = 'CAPITAL_INJECTED';
        cashDelta = cm.amount;
      } else if (cm.category === 'EXPENSE') {
        eventType = 'EXPENSE_RECORDED';
        cashDelta = -cm.amount;
      } else if (cm.category === 'RECAUDO_OFICINA') {
        eventType = 'OFFICE_WITHDRAWAL';
        cashDelta = -cm.amount;
      } else if (cm.category === 'RETIRO_PAPELERIA') {
        eventType = 'PAPERWORK_WITHDRAWAL';
        cashDelta = -cm.amount;
      } else if (cm.category === 'LOAN_CANCELLATION') {
        eventType = 'LOAN_CANCELLED';
        cashDelta = cm.amount;
      }

      events.push({
        id: `evt-cm-${cm.id}`,
        office_id: officeId,
        idempotency_key: `cash:${cm.id}`,
        event_type: eventType,
        entity_type: 'CASH_MOVEMENT',
        entity_id: cm.id,
        route_id: cm.routeId || null,
        customer_id: null,
        actor_user_id: cm.collectorId || null,
        amount: cm.amount,
        cash_delta: cashDelta,
        digital_delta: 0,
        portfolio_delta: 0,
        payload: { category: cm.category, description: cm.description || '' },
        occurred_at: toBogotaTimestamptz(cm.createdAt),
      });
    }

    return events;
  }

  /**
   * Descarga paginada (>1.000 registros) de una tabla operativa filtrada por office_id.
   */
  private async fetchAllOfficeRows(table: string, officeId: string): Promise<any[]> {
    if (!this.client) return [];
    const pageSize = 1000;
    const allRows: any[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await this.client
        .from(table)
        .select('*')
        .eq('office_id', officeId)
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allRows.push(...data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }
    return allRows;
  }

  /**
   * Descarga la cartera completa de una oficina desde la nube (con paginación completa >1.000 filas)
   */
  public async pullFullPortfolio(officeId: string): Promise<{
    office?: any;
    users: User[];
    routes: Route[];
    customers: Customer[];
    loans: Loan[];
    installments: Installment[];
    payments: Payment[];
    renewals: Renewal[];
    settlements: DailySettlement[];
    cashMovements: CashMovement[];
  } | null> {
    if (!this.client) return null;
    try {
      const [
        officeRes,
        usersData,
        routesData,
        custData,
        loansData,
        instData,
        payData,
        renData,
        setData,
        cmData,
      ] = await Promise.all([
        this.client.from('offices').select('*').eq('id', officeId).maybeSingle(),
        this.fetchAllOfficeRows('users', officeId),
        this.fetchAllOfficeRows('routes', officeId),
        this.fetchAllOfficeRows('customers', officeId),
        this.fetchAllOfficeRows('loans', officeId),
        this.fetchAllOfficeRows('installments', officeId),
        this.fetchAllOfficeRows('payments', officeId),
        this.fetchAllOfficeRows('renewals', officeId),
        this.fetchAllOfficeRows('daily_settlements', officeId),
        this.fetchAllOfficeRows('cash_movements', officeId),
      ]);
      if (officeRes.error) throw officeRes.error;
      const officeData = officeRes.data;

      return {
        office: officeData,
        users: (usersData || []).map((u: any): User => ({
          id: u.id,
          name: u.name,
          username: u.username,
          password: u.password_hash,
          email: u.email || `${u.username || 'user'}@oficina.com`,
          role: u.role,
          phone: u.phone,
          isActive: u.is_active,
          assignedRouteIds: u.assigned_route_ids || [],
          createdAt: u.created_at || new Date().toISOString(),
        })),
        routes: (routesData || []).map((r: any): Route => ({
          id: r.id,
          name: r.name,
          code: r.code,
          collectorId: r.collector_id || '',
          targetAdministrative: Number(r.target_administrative) || 0,
          initialCashBase: Number(r.initial_cash_base) || 0,
          expectedCustomersCount: Number(r.expected_customers_count) || 0,
          isActive: r.is_active,
          createdAt: r.created_at || new Date().toISOString(),
        })),
        customers: (custData || []).map((c: any): Customer => ({
          id: c.id,
          routeId: c.route_id,
          assignedCollectorId: c.assigned_collector_id || '',
          fullName: c.full_name,
          documentNumber: c.document_number,
          phone: c.phone,
          whatsappPhone: c.whatsapp_phone,
          address: c.address,
          neighborhood: c.neighborhood,
          city: c.city,
          occupation: c.occupation,
          businessName: c.business_name,
          orderIndex: c.order_index,
          status: c.status,
          notes: c.notes,
          references: c.references || [],
          createdAt: c.created_at || new Date().toISOString(),
          updatedAt: c.updated_at || new Date().toISOString(),
        })),
        loans: (loansData || []).map((l: any): Loan => ({
          id: l.id,
          routeId: l.route_id,
          customerId: l.customer_id,
          collectorId: l.collector_id || '',
          loanNumber: l.loan_number,
          principal: Number(l.principal),
          interestRate: Number(l.interest_rate),
          interestType: 'FLAT_INITIAL_CAPITAL',
          interestAmount: Number(l.interest_amount),
          totalAgreed: Number(l.total_agreed),
          installmentCount: Number(l.installment_count),
          installmentAmount: Number(l.installment_amount),
          frequency: l.frequency,
          startDate: l.start_date,
          endDate: l.end_date,
          fixedDueDate: l.fixed_due_date,
          status: l.status,
          previousLoanId: l.previous_loan_id,
          notes: l.notes,
          createdAt: l.start_date || l.created_at,
          updatedAt: l.updated_at,
        })),
        installments: (instData || []).map((i: any): Installment => ({
          id: i.id,
          loanId: i.loan_id,
          installmentNumber: Number(i.installment_number),
          dueDate: i.due_date,
          expectedAmount: Number(i.amount),
          paidAmount: Number(i.paid_amount),
          pendingAmount: Number(i.pending_amount),
          status: i.status,
          lastPaymentDate: i.last_payment_date,
        })),
        payments: (payData || []).map((p: any): Payment => ({
          id: p.id,
          idempotencyKey: p.idempotency_key || p.id,
          loanId: p.loan_id,
          customerId: p.customer_id,
          collectorId: p.collector_id || '',
          sessionId: p.session_id || '',
          amountReceived: Number(p.amount_received),
          paymentMethod: p.payment_method || 'CASH',
          installmentsBreakdown: Array.isArray(p.installments_breakdown) ? p.installments_breakdown : [],
          notes: p.notes,
          status: p.status,
          createdAt: p.local_created_at || p.created_at,
        })),
        renewals: (renData || []).map((r: any): Renewal => ({
          id: r.id,
          customerId: r.customer_id,
          previousLoanId: r.previous_loan_id,
          newLoanId: r.new_loan_id,
          collectorId: r.collector_id || '',
          newPrincipal: Number(r.new_principal),
          previousBalanceDeducted: Number(r.previous_balance_deducted) || 0,
          paperworkDeducted: Number(r.paperwork_deducted) || 0,
          actualCashDisbursed: Number(r.actual_cash_disbursed) || 0,
          createdAt: r.local_created_at || r.created_at,
        })),
        settlements: (setData || []).map((s: any): DailySettlement => ({
          ...(s.payload || {}),
          id: s.id,
          sessionId: s.session_id || s.payload?.sessionId || '',
          date: s.settlement_date || s.payload?.date || '',
          routeId: s.route_id || s.payload?.routeId || '',
          collectorId: s.collector_id || s.payload?.collectorId || '',
          status: s.status || s.payload?.status || 'SETTLED',
          settledAt: s.settled_at || s.payload?.settledAt || '',
        })),
        cashMovements: (cmData || []).map((cm: any) => ({
          id: cm.id,
          routeId: cm.route_id,
          collectorId: cm.collector_id,
          sessionId: cm.session_id,
          type: cm.type,
          category: cm.category,
          amount: Number(cm.amount),
          referenceId: cm.reference_id,
          description: cm.description,
          createdAt: cm.local_created_at || cm.created_at,
        })),
      };
    } catch (err) {
      console.warn('[SupabaseSyncService] pullFullPortfolio error:', err);
      return null;
    }
  }

  /**
   * Verifica el estado comercial de la licencia de una oficina.
   * Bajo RLS estricto, si el token x-kredia-session expiró o falta, `offices` retorna null sin error:
   * en ese caso reporta `sessionInvalid: true` en lugar de suspender falsamente la oficina.
   */
  public async checkOfficeLicense(officeId: string): Promise<{
    active: boolean;
    status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
    expiresAt: string | null;
    sessionInvalid?: boolean;
    networkError?: boolean;
  }> {
    if (!this.client || !officeId) {
      return { active: false, status: 'ACTIVE', expiresAt: null, sessionInvalid: true };
    }
    try {
      const { data, error } = await this.client
        .from('offices')
        .select('license_status, license_expires_at')
        .eq('id', officeId)
        .maybeSingle();

      if (error) {
        return { active: false, status: 'ACTIVE', expiresAt: null, networkError: true };
      }
      if (!data) {
        return { active: false, status: 'ACTIVE', expiresAt: null, sessionInvalid: true };
      }

      const expiresAt = data.license_expires_at || null;
      const isExpired = Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now());
      const rawStatus = (data.license_status || 'ACTIVE') as 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
      const effectiveStatus = rawStatus === 'ACTIVE' && isExpired ? 'EXPIRED' : rawStatus;

      return {
        active: effectiveStatus === 'ACTIVE',
        status: effectiveStatus,
        expiresAt,
      };
    } catch {
      return { active: false, status: 'ACTIVE', expiresAt: null, networkError: true };
    }
  }

  /**
   * Renueva silenciosamente la vigencia deslizante de 365 días del token x-kredia-session activo.
   */
  public async refreshCloudSession(): Promise<{
    ok: boolean;
    officeId?: string;
    expiresAt?: string;
    sessionInvalid?: boolean;
    licenseStatus?: string;
    networkError?: boolean;
  }> {
    if (!this.client || !this.sessionToken) {
      return { ok: false, sessionInvalid: true };
    }
    try {
      const { data, error } = await this.client.rpc('refresh_kredia_session');
      if (error) {
        return { ok: false, networkError: true };
      }
      if (!data?.ok) {
        return {
          ok: false,
          sessionInvalid: Boolean(data?.session_invalid),
          licenseStatus: data?.license_status ? String(data.license_status) : undefined,
        };
      }
      return {
        ok: true,
        officeId: data.office_id ? String(data.office_id) : undefined,
        expiresAt: data.expires_at ? String(data.expires_at) : undefined,
      };
    } catch {
      return { ok: false, networkError: true };
    }
  }

  /**
   * Elimina de forma segura una ruta vacía (0 clientes y 0 créditos) en el servidor
   * para impedir que reaparezca en futuros ciclos de sincronización.
   */
  public async deleteEmptyRoute(routeId: string): Promise<{
    ok: boolean;
    deleted?: boolean;
    alreadyAbsent?: boolean;
    sessionInvalid?: boolean;
    networkError?: boolean;
    error?: string;
  }> {
    if (!this.client || !this.sessionToken) {
      return { ok: false, sessionInvalid: true, error: 'Tu sesión expiró. Inicia sesión nuevamente.' };
    }
    try {
      const { data, error } = await this.client.rpc('delete_empty_route', {
        p_route_id: routeId,
      });
      if (error) {
        const msg = String(error.message || '');
        const isNet = /network|fetch|timeout|failed to fetch|offline/i.test(msg);
        return {
          ok: false,
          networkError: isNet,
          error: msg || 'No se pudo eliminar la ruta en el servidor.',
        };
      }
      if (!data?.ok) {
        return {
          ok: false,
          sessionInvalid: Boolean(data?.session_invalid),
          error: data?.error || 'No se pudo eliminar la ruta.',
        };
      }
      return {
        ok: true,
        deleted: Boolean(data.deleted),
        alreadyAbsent: Boolean(data.already_absent),
      };
    } catch (err: any) {
      return {
        ok: false,
        networkError: true,
        error: err?.message || 'Sin conexión para eliminar la ruta.',
      };
    }
  }

  /**
   * Renueva únicamente el token criptográfico de sesión RLS (x-kredia-session) vía RPC,
   * SIN descargar ni sobrescribir la cartera local (diseñado para rescate seguro de cambios locales).
   */
  public async reauthenticateCloudSession(
    username: string,
    password: string
  ): Promise<{
    ok: boolean;
    error?: string;
    sessionToken?: string;
    officeId?: string;
    activationCode?: string;
    companyName?: string;
    licenseStatus?: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
    licensePlan?: 'LIFETIME' | 'MONTHLY' | 'ANNUAL';
    licenseExpiresAt?: string | null;
    authenticatedUserId?: string;
    authenticatedUsername?: string;
  }> {
    if (!this.client) {
      return { ok: false, error: 'Servicio en la nube no configurado.' };
    }
    const cleanUser = username.trim().toLowerCase();
    if (!cleanUser || !password) {
      return { ok: false, error: 'Ingresa tu usuario y contraseña.' };
    }
    try {
      const { data: authData, error: rpcErr } = await this.client.rpc('authenticate_kredia_user', {
        p_username: cleanUser,
        p_password: password,
      });
      if (rpcErr) throw rpcErr;
      if (!authData || !authData.ok || !authData.session_token || !authData.office || !authData.user) {
        return {
          ok: false,
          error: authData?.error || 'Credenciales incorrectas o licencia inactiva.',
        };
      }
      const sessionToken = String(authData.session_token);
      this.setSessionToken(sessionToken);
      const officeRow = authData.office;
      return {
        ok: true,
        sessionToken,
        officeId: officeRow.id,
        activationCode: officeRow.activation_code || '',
        companyName: officeRow.company_name || 'Mi Oficina',
        licenseStatus: (officeRow.license_status || 'ACTIVE') as 'ACTIVE' | 'SUSPENDED' | 'EXPIRED',
        licensePlan: (officeRow.license_plan || 'LIFETIME') as 'LIFETIME' | 'MONTHLY' | 'ANNUAL',
        licenseExpiresAt: officeRow.license_expires_at || null,
        authenticatedUserId: authData.user.id,
        authenticatedUsername: authData.user.username,
      };
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message || 'Error de conexión al renovar sesión en la nube.',
      };
    }
  }

  /**
   * Autentica y vincula automáticamente el dispositivo usando únicamente Usuario y Contraseña
   * creados previamente por el vendedor/administrador en la nube.
   */
  public async loginWithCloudCredentials(
    username: string,
    password: string
  ): Promise<{
    ok: boolean;
    error?: string;
    sessionToken?: string;
    officeId?: string;
    activationCode?: string;
    companyName?: string;
    licenseStatus?: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
    licensePlan?: 'LIFETIME' | 'MONTHLY' | 'ANNUAL';
    licenseExpiresAt?: string | null;
    settings?: Partial<OfficeCompanyConfig>;
    users?: User[];
    routes?: Route[];
    portfolio?: {
      customers: Customer[];
      loans: Loan[];
      installments: Installment[];
      payments: Payment[];
      renewals?: Renewal[];
      settlements?: DailySettlement[];
      cashMovements: CashMovement[];
    };
    authenticatedUser?: User;
  }> {
    if (!this.client) {
      return {
        ok: false,
        error: 'El servicio en la nube no está configurado. Contacta al administrador del sistema.',
      };
    }

    const cleanUser = username.trim().toLowerCase();
    if (!cleanUser || !password) {
      return { ok: false, error: 'Ingresa tu usuario y contraseña.' };
    }

    try {
      // Autenticación segura en servidor (verifica contraseña PBKDF2 / sha256 y licencia sin exponer hashes)
      const { data: authData, error: rpcErr } = await this.client.rpc('authenticate_kredia_user', {
        p_username: cleanUser,
        p_password: password,
      });

      if (rpcErr) throw rpcErr;
      if (!authData || !authData.ok || !authData.session_token || !authData.office || !authData.user) {
        return {
          ok: false,
          error: authData?.error || 'Credenciales incorrectas o usuario no registrado.',
        };
      }

      const sessionToken = String(authData.session_token);
      this.setSessionToken(sessionToken);

      const officeRow = authData.office;
      const matchedRow = authData.user;
      const effectiveStatus = (officeRow.license_status || 'ACTIVE') as 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
      const expiresAt = officeRow.license_expires_at || null;

      const portfolio = await this.pullFullPortfolio(officeRow.id);
      if (!portfolio) {
        return { ok: false, error: 'No se pudo cargar la información de la oficina.' };
      }

      const authenticatedUser =
        portfolio.users.find((u) => u.id === matchedRow.id) || {
          id: matchedRow.id,
          name: matchedRow.name,
          username: matchedRow.username,
          password: '',
          email: `${matchedRow.username}@oficina.com`,
          role: matchedRow.role,
          phone: matchedRow.phone || '',
          isActive: matchedRow.is_active !== false,
          assignedRouteIds: matchedRow.assigned_route_ids || [],
          createdAt: matchedRow.created_at || new Date().toISOString(),
        };

      return {
        ok: true,
        sessionToken,
        officeId: officeRow.id,
        activationCode: officeRow.activation_code || '',
        companyName: officeRow.company_name || 'Mi Oficina',
        licenseStatus: effectiveStatus,
        licensePlan: officeRow.license_plan || 'LIFETIME',
        licenseExpiresAt: expiresAt,
        settings: {
          ...(officeRow.settings || {}),
          taxId: officeRow.tax_id || '',
          city: officeRow.city || '',
          address: officeRow.address || '',
          supportPhone: officeRow.support_phone || '',
          recoveryPin: officeRow.recovery_pin || '',
        },
        users: portfolio.users,
        routes: portfolio.routes,
        portfolio: {
          customers: portfolio.customers,
          loans: portfolio.loans,
          installments: portfolio.installments,
          payments: portfolio.payments,
          renewals: portfolio.renewals,
          settlements: portfolio.settlements,
          cashMovements: portfolio.cashMovements,
        },
        authenticatedUser,
      };
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message || 'Error de conexión al validar credenciales.',
      };
    }
  }

  /**
   * Vincula un dispositivo validando código de activación, estado de licencia y credenciales del usuario.
   */
  public async verifyAndLinkOffice(
    activationCode: string,
    username: string,
    password: string
  ): Promise<{
    ok: boolean;
    error?: string;
    officeId?: string;
    activationCode?: string;
    companyName?: string;
    licenseStatus?: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
    licensePlan?: 'LIFETIME' | 'MONTHLY' | 'ANNUAL';
    licenseExpiresAt?: string | null;
    settings?: Partial<OfficeCompanyConfig>;
    users?: User[];
    routes?: Route[];
    portfolio?: {
      customers: Customer[];
      loans: Loan[];
      installments: Installment[];
      payments: Payment[];
      renewals?: Renewal[];
      settlements?: DailySettlement[];
      cashMovements: CashMovement[];
    };
    authenticatedUser?: User;
  }> {
    if (!this.client) {
      return {
        ok: false,
        error: 'El servicio en la nube no está configurado. Verifica la conexión o las variables de Supabase.',
      };
    }

    const cleanCode = activationCode.trim().toUpperCase();
    const cleanUser = username.trim().toLowerCase();
    if (!cleanCode || !cleanUser || !password) {
      return { ok: false, error: 'Ingresa código de activación, usuario y contraseña.' };
    }

    try {
      let officeRow: any = null;
      const rpcRes = await this.client.rpc('lookup_office_by_activation_code', {
        p_activation_code: cleanCode,
      });
      if (!rpcRes.error && Array.isArray(rpcRes.data) && rpcRes.data.length > 0) {
        officeRow = rpcRes.data[0];
      } else {
        const directRes = await this.client
          .from('offices')
          .select('*')
          .ilike('activation_code', cleanCode)
          .maybeSingle();
        officeRow = directRes.data;
      }

      if (!officeRow) {
        return { ok: false, error: 'Código de activación no encontrado. Verifica con tu distribuidor.' };
      }

      const expiresAt = officeRow.license_expires_at || null;
      const isExpired = Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now());
      const effectiveStatus =
        officeRow.license_status === 'ACTIVE' && isExpired
          ? 'EXPIRED'
          : (officeRow.license_status || 'ACTIVE');

      if (effectiveStatus !== 'ACTIVE') {
        return {
          ok: false,
          error:
            effectiveStatus === 'EXPIRED'
              ? 'La licencia de esta oficina ha vencido. Contacta al proveedor para renovarla.'
              : 'La licencia de esta oficina está suspendida.',
        };
      }

      const portfolio = await this.pullFullPortfolio(officeRow.id);
      if (!portfolio) {
        return { ok: false, error: 'No se pudo descargar la información de la oficina.' };
      }

      const matchedUser = portfolio.users.find(
        (u) => (u.username || '').trim().toLowerCase() === cleanUser && u.isActive !== false
      );
      if (!matchedUser) {
        return { ok: false, error: 'Usuario no encontrado o inactivo en esta oficina.' };
      }

      const storedHash = matchedUser.password || '';
      const passwordValid = storedHash ? verifyPassword(password, storedHash) : false;
      if (!passwordValid) {
        return { ok: false, error: 'Contraseña incorrecta para este usuario.' };
      }

      return {
        ok: true,
        officeId: officeRow.id,
        activationCode: officeRow.activation_code || cleanCode,
        companyName: officeRow.company_name || 'Mi Oficina',
        licenseStatus: effectiveStatus,
        licensePlan: officeRow.license_plan || 'LIFETIME',
        licenseExpiresAt: expiresAt,
        settings: {
          ...(officeRow.settings || {}),
          taxId: officeRow.tax_id || '',
          city: officeRow.city || '',
          address: officeRow.address || '',
          supportPhone: officeRow.support_phone || '',
          recoveryPin: officeRow.recovery_pin || '',
        },
        users: portfolio.users,
        routes: portfolio.routes,
        portfolio: {
          customers: portfolio.customers,
          loans: portfolio.loans,
          installments: portfolio.installments,
          payments: portfolio.payments,
          renewals: portfolio.renewals,
          settlements: portfolio.settlements,
          cashMovements: portfolio.cashMovements,
        },
        authenticatedUser: matchedUser,
      };
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message || 'Error de red al validar la oficina.',
      };
    }
  }

  private mapRemoteReceiptRow(
    raw: any,
    fallback?: Partial<OfficialReceiptData>
  ): OfficialReceiptData {
    const typeRaw = String(raw?.receipt_type || fallback?.receiptType || 'PAYMENT').toUpperCase();
    const receiptType: OfficialReceiptType =
      typeRaw === 'LOAN' || typeRaw === 'RENEWAL' ? typeRaw : 'PAYMENT';
    const statusRaw = String(raw?.status || fallback?.status || 'APPROVED').toUpperCase();
    const status: OfficialReceiptStatus =
      statusRaw === 'REVERSED' || statusRaw === 'CANCELLED' ? statusRaw : 'APPROVED';
    return {
      receiptCode: String(raw?.receipt_code || fallback?.receiptCode || ''),
      receiptType,
      entityId: String(fallback?.entityId || raw?.entity_id || raw?.receipt_code || ''),
      companyName: String(raw?.company_name || fallback?.companyName || 'Kredia'),
      routeName: String(raw?.route_name ?? fallback?.routeName ?? ''),
      customerName: String(raw?.customer_name || fallback?.customerName || 'Cliente'),
      customerDocument: String(fallback?.customerDocument || ''),
      customerPhone: String(fallback?.customerPhone || ''),
      loanNumber: String(raw?.loan_number ?? fallback?.loanNumber ?? ''),
      amount: Number(raw?.amount ?? fallback?.amount ?? 0),
      status,
      issuedAtDisplay: String(raw?.issued_at_display || fallback?.issuedAtDisplay || ''),
      payload:
        raw?.payload && typeof raw.payload === 'object'
          ? raw.payload
          : (fallback?.payload || {}),
      isCloudVerified: String(raw?.receipt_code || '').startsWith('KRD-'),
    };
  }

  /**
   * Publica (de forma idempotente e inmutable) un comprobante oficial en Supabase.
   * Si ya existía para (office_id, receipt_type, entity_id), devuelve el original inalterado.
   */
  public async issueOfficialReceipt(
    draft: OfficialReceiptData
  ): Promise<{ ok: boolean; receipt: OfficialReceiptData; error?: string }> {
    if (!this.client || !this.sessionToken) {
      return {
        ok: false,
        receipt: draft,
        error: 'Sin conexión a la nube. Comprobante emitido en modo local.',
      };
    }
    try {
      const { data, error } = await this.client.rpc('issue_official_receipt', {
        p_receipt_type: draft.receiptType,
        p_entity_id: draft.entityId,
        p_company_name: draft.companyName,
        p_route_name: draft.routeName || '',
        p_customer_name: draft.customerName,
        p_customer_document: draft.customerDocument || '',
        p_loan_number: draft.loanNumber || '',
        p_amount: Math.max(0, Math.round(draft.amount)),
        p_issued_at_display: draft.issuedAtDisplay,
        p_payload: draft.payload || {},
      });
      if (error) {
        return { ok: false, receipt: draft, error: error.message };
      }
      if (!data?.ok || !data?.receipt) {
        return {
          ok: false,
          receipt: draft,
          error: data?.error || 'No se pudo emitir el comprobante oficial.',
        };
      }
      return {
        ok: true,
        receipt: this.mapRemoteReceiptRow(data.receipt, draft),
      };
    } catch (err: any) {
      return {
        ok: false,
        receipt: draft,
        error: err?.message || 'Error de red publicando comprobante.',
      };
    }
  }

  /**
   * Consulta pública de un comprobante oficial por su código único KRD-... (sin login).
   */
  public async getPublicOfficialReceipt(
    receiptCode: string,
    overrideUrl?: string,
    overrideKey?: string
  ): Promise<{ ok: boolean; receipt?: OfficialReceiptData; error?: string }> {
    const cleanCode = (receiptCode || '').trim().toUpperCase();
    if (!cleanCode || !cleanCode.startsWith('KRD-')) {
      return { ok: false, error: 'Código de comprobante inválido.' };
    }
    const url = (overrideUrl || this.currentUrl || DEFAULT_SUPABASE_URL).trim();
    const key = (overrideKey || this.currentKey || DEFAULT_SUPABASE_ANON_KEY).trim();
    if (!url || !key) {
      return { ok: false, error: 'Servicio de verificación no disponible.' };
    }
    try {
      const anonClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await anonClient.rpc('get_official_receipt', {
        p_code: cleanCode,
      });
      if (error) {
        return { ok: false, error: error.message || 'No se pudo consultar el comprobante.' };
      }
      if (!data?.ok || !data?.receipt) {
        return { ok: false, error: data?.error || 'Comprobante no encontrado.' };
      }
      return {
        ok: true,
        receipt: this.mapRemoteReceiptRow(data.receipt),
      };
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message || 'Error de conexión al verificar el comprobante.',
      };
    }
  }

  /**
   * Marca un comprobante oficial publicado como REVERSED o CANCELLED cuando un admin anula la operación.
   */
  public async voidOfficialReceipt(
    receiptType: OfficialReceiptType,
    entityId: string,
    newStatus: 'REVERSED' | 'CANCELLED'
  ): Promise<boolean> {
    if (!this.client || !this.sessionToken || !entityId) return false;
    try {
      const { data, error } = await this.client.rpc('void_official_receipt', {
        p_receipt_type: receiptType,
        p_entity_id: entityId,
        p_new_status: newStatus,
      });
      return !error && Boolean(data?.ok);
    } catch {
      return false;
    }
  }
}

export const supabaseSync = new SupabaseSyncService();
export const supabaseSyncService = supabaseSync;
