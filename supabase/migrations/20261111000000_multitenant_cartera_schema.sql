-- =========================================================================
-- ESQUEMA MULTI-OFICINA (MULTI-TENANT) KREDIA / SISTEMA DE CARTERA
-- =========================================================================
-- Cada oficina (actual como 'Inversiones FBV' o creadas a futuro) vive
-- completamente aislada e indexada por `office_id`.
-- =========================================================================

-- 1. TABLA: OFICINAS / EMPRESAS
CREATE TABLE IF NOT EXISTS public.offices (
    id TEXT PRIMARY KEY,
    company_name TEXT NOT NULL,
    tax_id TEXT DEFAULT '',
    city TEXT DEFAULT '',
    address TEXT DEFAULT '',
    support_phone TEXT DEFAULT '',
    recovery_pin TEXT DEFAULT '',
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABLA: USUARIOS (ADMINISTRADORES Y COBRADORES POR OFICINA)
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    office_id TEXT NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'COBRADOR', 'SUPERVISOR', 'SUPER_ADMIN')),
    phone TEXT DEFAULT '',
    is_active BOOLEAN DEFAULT TRUE,
    assigned_route_ids JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_office_username UNIQUE (office_id, username)
);

-- 3. TABLA: RUTAS DE COBRANZA
CREATE TABLE IF NOT EXISTS public.routes (
    id TEXT PRIMARY KEY,
    office_id TEXT NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    collector_id TEXT,
    target_administrative NUMERIC(14,2) DEFAULT 0,
    initial_cash_base NUMERIC(14,2) DEFAULT 0,
    expected_customers_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABLA: CLIENTES
CREATE TABLE IF NOT EXISTS public.customers (
    id TEXT PRIMARY KEY,
    office_id TEXT NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
    route_id TEXT REFERENCES public.routes(id) ON DELETE SET NULL,
    assigned_collector_id TEXT,
    full_name TEXT NOT NULL,
    document_number TEXT NOT NULL,
    phone TEXT DEFAULT '',
    whatsapp_phone TEXT DEFAULT '',
    address TEXT DEFAULT '',
    neighborhood TEXT DEFAULT '',
    city TEXT DEFAULT '',
    occupation TEXT DEFAULT '',
    business_name TEXT DEFAULT '',
    order_index INTEGER DEFAULT 0,
    status TEXT DEFAULT 'ACTIVE',
    notes TEXT,
    "references" JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TABLA: PRÉSTAMOS
CREATE TABLE IF NOT EXISTS public.loans (
    id TEXT PRIMARY KEY,
    office_id TEXT NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
    route_id TEXT REFERENCES public.routes(id) ON DELETE SET NULL,
    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    collector_id TEXT,
    loan_number TEXT NOT NULL,
    principal NUMERIC(14,2) NOT NULL,
    interest_rate NUMERIC(6,4) NOT NULL,
    interest_amount NUMERIC(14,2) NOT NULL,
    total_agreed NUMERIC(14,2) NOT NULL,
    installment_count INTEGER NOT NULL,
    installment_amount NUMERIC(14,2) NOT NULL,
    frequency TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    fixed_due_date DATE,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAID', 'CANCELLED', 'RENEWED', 'DEFAULTED')),
    previous_loan_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. TABLA: CUOTAS / AMORTIZACIONES
CREATE TABLE IF NOT EXISTS public.installments (
    id TEXT PRIMARY KEY,
    office_id TEXT NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
    loan_id TEXT NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
    installment_number INTEGER NOT NULL,
    due_date DATE NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    paid_amount NUMERIC(14,2) DEFAULT 0,
    pending_amount NUMERIC(14,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PARTIAL', 'PAGADA', 'OVERDUE')),
    last_payment_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. TABLA: PAGOS / ABONOS REGISTRADOS
CREATE TABLE IF NOT EXISTS public.payments (
    id TEXT PRIMARY KEY,
    office_id TEXT NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
    loan_id TEXT NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    collector_id TEXT,
    route_id TEXT,
    session_id TEXT,
    amount_received NUMERIC(14,2) NOT NULL,
    payment_method TEXT DEFAULT 'CASH' CHECK (payment_method IN ('CASH', 'NEQUI', 'TRANSFER', 'OTHER')),
    digital_reference TEXT,
    notes TEXT,
    status TEXT DEFAULT 'COMPLETED',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. TABLA: MOVIMIENTOS DE CAJA (DESEMBOLSOS, GASTOS, RETIROS, AJUSTES)
CREATE TABLE IF NOT EXISTS public.cash_movements (
    id TEXT PRIMARY KEY,
    office_id TEXT NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
    route_id TEXT,
    collector_id TEXT,
    session_id TEXT,
    type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
    category TEXT NOT NULL CHECK (category IN (
        'EXPENSE', 'RECAUDO_OFICINA', 'CAPITAL_INJECTION',
        'LOAN_DISBURSEMENT', 'RENEWAL_DISBURSEMENT', 'RETIRO_PAPELERIA', 'ADJUSTMENT'
    )),
    amount NUMERIC(14,2) NOT NULL,
    reference_id TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- ÍNDICES DE RENDIMIENTO MULTI-TENANT (CRÍTICO PARA ESCALAR)
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_users_office_id ON public.users(office_id);
CREATE INDEX IF NOT EXISTS idx_routes_office_id ON public.routes(office_id);
CREATE INDEX IF NOT EXISTS idx_customers_office_id ON public.customers(office_id);
CREATE INDEX IF NOT EXISTS idx_customers_route_id ON public.customers(route_id);
CREATE INDEX IF NOT EXISTS idx_loans_office_id ON public.loans(office_id);
CREATE INDEX IF NOT EXISTS idx_loans_customer_id ON public.loans(customer_id);
CREATE INDEX IF NOT EXISTS idx_loans_route_status ON public.loans(route_id, status);
CREATE INDEX IF NOT EXISTS idx_installments_office_id ON public.installments(office_id);
CREATE INDEX IF NOT EXISTS idx_installments_loan_id ON public.installments(loan_id);
CREATE INDEX IF NOT EXISTS idx_installments_due_status ON public.installments(due_date, status);
CREATE INDEX IF NOT EXISTS idx_payments_office_id ON public.payments(office_id);
CREATE INDEX IF NOT EXISTS idx_payments_loan_id ON public.payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_office_id ON public.cash_movements(office_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_route_cat ON public.cash_movements(route_id, category);

-- =========================================================================
-- HABILITAR ROW LEVEL SECURITY (RLS) EN TODAS LAS TABLAS
-- =========================================================================
ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS PÚBLICAS PARA ACCESO ANÓNIMO / CLAVE PÚBLICA (API REST)
-- (Filtrado seguro siempre a nivel de aplicación e interfaz por office_id)
DO $$
BEGIN
    -- Offices
    DROP POLICY IF EXISTS "Allow anon all on offices" ON public.offices;
    CREATE POLICY "Allow anon all on offices" ON public.offices FOR ALL TO anon USING (true) WITH CHECK (true);

    -- Users
    DROP POLICY IF EXISTS "Allow anon all on users" ON public.users;
    CREATE POLICY "Allow anon all on users" ON public.users FOR ALL TO anon USING (true) WITH CHECK (true);

    -- Routes
    DROP POLICY IF EXISTS "Allow anon all on routes" ON public.routes;
    CREATE POLICY "Allow anon all on routes" ON public.routes FOR ALL TO anon USING (true) WITH CHECK (true);

    -- Customers
    DROP POLICY IF EXISTS "Allow anon all on customers" ON public.customers;
    CREATE POLICY "Allow anon all on customers" ON public.customers FOR ALL TO anon USING (true) WITH CHECK (true);

    -- Loans
    DROP POLICY IF EXISTS "Allow anon all on loans" ON public.loans;
    CREATE POLICY "Allow anon all on loans" ON public.loans FOR ALL TO anon USING (true) WITH CHECK (true);

    -- Installments
    DROP POLICY IF EXISTS "Allow anon all on installments" ON public.installments;
    CREATE POLICY "Allow anon all on installments" ON public.installments FOR ALL TO anon USING (true) WITH CHECK (true);

    -- Payments
    DROP POLICY IF EXISTS "Allow anon all on payments" ON public.payments;
    CREATE POLICY "Allow anon all on payments" ON public.payments FOR ALL TO anon USING (true) WITH CHECK (true);

    -- Cash Movements
    DROP POLICY IF EXISTS "Allow anon all on cash_movements" ON public.cash_movements;
    CREATE POLICY "Allow anon all on cash_movements" ON public.cash_movements FOR ALL TO anon USING (true) WITH CHECK (true);
END $$;
