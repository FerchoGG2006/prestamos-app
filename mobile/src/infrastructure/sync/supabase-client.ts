import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Customer,
  Loan,
  Installment,
  Payment,
  CashMovement,
  Route,
  User,
  OfficeCompanyConfig,
} from '../../core/domain/types';

// Configuración por defecto o variables de entorno
export const DEFAULT_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const DEFAULT_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

class SupabaseSyncService {
  private client: SupabaseClient | null = null;
  private currentUrl = '';
  private currentKey = '';

  constructor() {
    if (DEFAULT_SUPABASE_URL && DEFAULT_SUPABASE_ANON_KEY) {
      this.initClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY);
    }
  }

  public initClient(url: string, anonKey: string): boolean {
    if (!url || !anonKey) return false;
    try {
      this.client = createClient(url.trim(), anonKey.trim(), {
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

  public isConnected(): boolean {
    return this.client !== null;
  }

  public getCredentials(): { url: string; anonKey: string } {
    return { url: this.currentUrl, anonKey: this.currentKey };
  }

  /**
   * Sube o actualiza la oficina en la nube (Multi-Tenant)
   */
  public async upsertOffice(officeId: string, config: OfficeCompanyConfig): Promise<boolean> {
    if (!this.client) return false;
    try {
      const { error } = await this.client.from('offices').upsert({
        id: officeId,
        company_name: config.companyName || 'Mi Oficina',
        tax_id: config.taxId || '',
        city: config.city || '',
        address: config.address || '',
        support_phone: config.supportPhone || '',
        recovery_pin: config.recoveryPin || '',
        settings: {
          defaultInterestRate: config.defaultInterestRate,
          defaultInstallmentsCount: config.defaultInstallmentsCount,
          defaultFrequency: config.defaultFrequency,
          paperworkFeeEnabled: config.paperworkFeeEnabled,
          paperworkRate: config.paperworkRate,
          routeInitialCashBase: config.routeInitialCashBase,
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

  /**
   * Sincroniza usuarios y rutas de la oficina
   */
  public async syncUsersAndRoutes(officeId: string, users: User[], routes: Route[]): Promise<boolean> {
    if (!this.client) return false;
    try {
      if (users.length > 0) {
        const payloadUsers = users.map((u) => ({
          id: u.id,
          office_id: officeId,
          name: u.name,
          username: (u.username || u.name).toLowerCase().trim(),
          password_hash: u.password || '',
          role: u.role,
          phone: u.phone || '',
          is_active: u.isActive !== false,
          assigned_route_ids: u.assignedRouteIds || [],
          updated_at: new Date().toISOString(),
        }));
        await this.client.from('users').upsert(payloadUsers);
      }

      if (routes.length > 0) {
        const payloadRoutes = routes.map((r) => ({
          id: r.id,
          office_id: officeId,
          name: r.name,
          code: r.code || r.name.slice(0, 4).toUpperCase(),
          collector_id: r.collectorId || null,
          target_administrative: r.targetAdministrative || 0,
          initial_cash_base: r.initialCashBase || 0,
          expected_customers_count: r.expectedCustomersCount || 0,
          is_active: r.isActive !== false,
          updated_at: new Date().toISOString(),
        }));
        await this.client.from('routes').upsert(payloadRoutes);
      }
      return true;
    } catch (err) {
      console.warn('[SupabaseSyncService] syncUsersAndRoutes error:', err);
      return false;
    }
  }

  /**
   * Sube todos los clientes, créditos, cuotas, cobros y movimientos de caja
   */
  public async pushFullPortfolio(
    officeId: string,
    data: {
      customers: Customer[];
      loans: Loan[];
      installments: Installment[];
      payments: Payment[];
      cashMovements: CashMovement[];
    }
  ): Promise<boolean> {
    if (!this.client) return false;
    try {
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
        await this.client.from('customers').upsert(custRows);
      }

      if (data.loans.length > 0) {
        const loanRows = data.loans.map((l) => ({
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
        await this.client.from('loans').upsert(loanRows);
      }

      if (data.installments.length > 0) {
        // En bloques de 200 cuotas para optimizar red
        const chunkSize = 200;
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
          await this.client.from('installments').upsert(chunk);
        }
      }

      if (data.payments.length > 0) {
        const payRows = data.payments.map((p) => ({
          id: p.id,
          office_id: officeId,
          loan_id: p.loanId,
          customer_id: p.customerId,
          collector_id: p.collectorId || null,
          route_id: null,
          session_id: p.sessionId || null,
          amount_received: p.amountReceived,
          payment_method: p.paymentMethod || 'CASH',
          digital_reference: '',
          notes: p.notes || '',
          status: p.status || 'COMPLETED',
          created_at: p.createdAt,
        }));
        await this.client.from('payments').upsert(payRows);
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
          created_at: cm.createdAt,
        }));
        await this.client.from('cash_movements').upsert(cmRows);
      }

      return true;
    } catch (err) {
      console.warn('[SupabaseSyncService] pushFullPortfolio error:', err);
      return false;
    }
  }

  /**
   * Descarga la cartera completa de una oficina desde la nube
   */
  public async pullFullPortfolio(officeId: string): Promise<{
    office?: any;
    users: User[];
    routes: Route[];
    customers: Customer[];
    loans: Loan[];
    installments: Installment[];
    payments: Payment[];
    cashMovements: CashMovement[];
  } | null> {
    if (!this.client) return null;
    try {
      const [
        { data: officeData },
        { data: usersData },
        { data: routesData },
        { data: custData },
        { data: loansData },
        { data: instData },
        { data: payData },
        { data: cmData },
      ] = await Promise.all([
        this.client.from('offices').select('*').eq('id', officeId).maybeSingle(),
        this.client.from('users').select('*').eq('office_id', officeId),
        this.client.from('routes').select('*').eq('office_id', officeId),
        this.client.from('customers').select('*').eq('office_id', officeId),
        this.client.from('loans').select('*').eq('office_id', officeId),
        this.client.from('installments').select('*').eq('office_id', officeId),
        this.client.from('payments').select('*').eq('office_id', officeId),
        this.client.from('cash_movements').select('*').eq('office_id', officeId),
      ]);

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
          createdAt: l.created_at,
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
          installmentsBreakdown: [],
          notes: p.notes,
          status: p.status,
          createdAt: p.created_at,
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
          createdAt: cm.created_at,
        })),
      };
    } catch (err) {
      console.warn('[SupabaseSyncService] pullFullPortfolio error:', err);
      return null;
    }
  }
}

export const supabaseSync = new SupabaseSyncService();
export const supabaseSyncService = supabaseSync;
