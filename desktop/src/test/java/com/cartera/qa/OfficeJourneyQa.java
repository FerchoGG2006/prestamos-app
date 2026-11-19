package com.cartera.qa;

import com.cartera.collections.application.TodayCollectionsService;
import com.cartera.customers.application.CreateCustomerUseCase;
import com.cartera.history.application.CreditHistoryService;
import com.cartera.infrastructure.backup.DatabaseBackupService;
import com.cartera.infrastructure.persistence.entity.*;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.*;
import com.cartera.loans.application.*;
import com.cartera.payments.application.*;
import com.cartera.renewals.application.RenewLoanUseCase;
import com.cartera.reports.application.ExcelReportExporter;
import com.cartera.settlement.application.*;
import com.cartera.sync.application.MobileSyncProcessorService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.ConfigurableApplicationContext;

import java.math.BigDecimal;
import java.nio.file.*;
import java.sql.DriverManager;
import java.time.LocalDate;
import java.util.*;
import java.util.zip.ZipFile;

/** Diagnostic journey, explicitly separate from the green regression suite: records real failures. */
public final class OfficeJourneyQa {
    private final ConfigurableApplicationContext ctx;
    private final List<Map<String, String>> results = new ArrayList<>();
    private int sequence;
    private final Path home;
    private record Fixture(CustomerEntity customer, LoanEntity loan, String route) { }
    private interface Check { String run() throws Exception; }
    private <T> T bean(Class<T> type) { return ctx.getBean(type); }
    private static BigDecimal money(String value) { return new BigDecimal(value); }
    private static void equal(BigDecimal expected, BigDecimal actual) {
        if (expected.compareTo(actual) != 0) throw new AssertionError("Esperado " + expected + "; observado " + actual);
    }
    private static void require(boolean value, String message) { if (!value) throw new AssertionError(message); }
    private static void rejects(Check action) throws Exception {
        try { action.run(); } catch (Exception expected) { return; }
        throw new AssertionError("La operación debía rechazarse, pero fue aceptada");
    }
    private void check(String name, Check action) {
        var row = new LinkedHashMap<String, String>();
        row.put("id", "QA-" + String.format("%02d", results.size() + 1));
        row.put("scenario", name);
        try { row.put("evidence", action.run()); row.put("status", "PASS"); }
        catch (Throwable ex) { row.put("status", "FAIL"); row.put("evidence", ex.getClass().getSimpleName() + ": " + ex.getMessage()); }
        results.add(row);
        System.out.println(row);
    }
    private void admin() {
        require(bean(AuthService.class).authenticate("qaadmin", OfficeQaLauncher.PASSWORD).isPresent(), "Login QA falló");
    }
    private CustomerEntity customer(String label, String route) {
        return bean(CreateCustomerUseCase.class).execute(new CreateCustomerUseCase.CreateCustomerCommand(
                "QA " + label, "QA-" + (++sequence), "3000000000", null, "Calle ficticia 1", "Barrio QA",
                "Ciudad QA", "Prueba", "Negocio ficticio", "Solo QA", route, "usr-col-1", "usr-admin-1"));
    }
    private Fixture fixture(String label) {
        admin();
        String route = "qa-route-" + UUID.randomUUID();
        bean(RouteRepository.class).save(new RouteEntity(route, label, "usr-col-1", 1, LocalDate.now().toString()));
        var customer = customer(label, route);
        var loan = bean(CreateLoanUseCase.class).execute(new CreateLoanUseCase.CreateLoanCommand(customer.getId(), route,
                "usr-col-1", money("300000"), money("0.2"), money("360000"), 24, "DIARIO", LocalDate.now(),
                "usr-admin-1", money("15000")));
        return new Fixture(customer, loan, route);
    }
    private RecordPaymentUseCase.RecordPaymentCommand pay(Fixture f, String amount, String method, String key) {
        return new RecordPaymentUseCase.RecordPaymentCommand(f.loan().getId(), money(amount), method,
                "usr-col-1", LocalDate.now(), key);
    }
    private BigDecimal cash(String route) { return bean(CashMovementUseCase.class).availableBalance(route); }
    private BigDecimal debt(String loanId) {
        return bean(InstallmentRepository.class).findByLoanId(loanId).stream().map(InstallmentEntity::getPendingAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
    private int count(Path db, String table, String column, String value) throws Exception {
        try (var connection = DriverManager.getConnection("jdbc:sqlite:" + db);
             var query = connection.prepareStatement("SELECT count(*) FROM " + table + " WHERE " + column + " = ?")) {
            query.setString(1, value);
            try (var rows = query.executeQuery()) { rows.next(); return rows.getInt(1); }
        }
    }
    private OfficeJourneyQa(ConfigurableApplicationContext ctx, Path home) { this.ctx = ctx; this.home = home; }

    private int run() throws Exception {
        check("Login rechaza contraseña inválida", () -> {
            require(bean(AuthService.class).authenticate("qaadmin", "incorrecta").isEmpty(), "Aceptó clave incorrecta"); return "Acceso rechazado";
        });
        check("Login administrador y rol", () -> { admin(); require(UserSessionContext.requireSession().isAdmin(), "Rol incorrecto"); return "ADMIN"; });
        check("Cliente obligatorio y documento duplicado", () -> {
            var c = customer("Alta", "route-norte");
            rejects(() -> bean(CreateCustomerUseCase.class).execute(new CreateCustomerUseCase.CreateCustomerCommand(
                    "Duplicado", c.getDocumentNumber(), "3000000000", null, null, null, null, null, null, null,
                    "route-norte", "usr-col-1", "usr-admin-1")).getId());
            rejects(() -> bean(CreateCustomerUseCase.class).execute(new CreateCustomerUseCase.CreateCustomerCommand(
                    " ", "QA-INVALID", "3000000000", null, null, null, null, null, null, null,
                    "route-norte", "usr-col-1", "usr-admin-1")).getId());
            return "Cliente creado; duplicado y nombre vacío rechazados";
        });
        check("Nuevo crédito, cuotas y desembolso", () -> {
            var f=fixture("Crédito normal");
            var rows=bean(InstallmentRepository.class).findByLoanId(f.loan().getId());
            require(rows.size()==24,"No generó 24 cuotas");
            equal(money("360000"),debt(f.loan().getId())); equal(money("-285000"),cash(f.route()));
            return "24 cuotas, deuda 360000 y entrega neta 285000";
        });
        check("Cronograma mensual conserva total y fecha", () -> {
            var rows=bean(CreateLoanUseCase.class).simulatePlan(money("980000"),2,"MENSUAL",LocalDate.now());
            equal(money("980000"),rows.stream().map(CreateLoanUseCase.InstallmentPlanItem::amount).reduce(BigDecimal.ZERO,BigDecimal::add));
            require(rows.getFirst().dueDate().equals(LocalDate.now().plusMonths(1)),"Fecha mensual incorrecta"); return rows.toString();
        });
        check("Abono parcial y asignación independiente", () -> {
            var f=fixture("Abono parcial");
            var result=bean(RecordPaymentUseCase.class).execute(pay(f,"5000","EFECTIVO",UUID.randomUUID().toString()));
            equal(money("355000"),debt(f.loan().getId()));
            equal(money("5000"),bean(PaymentAllocationRepository.class).findByPaymentId(result.paymentId()).stream()
                    .map(PaymentAllocationEntity::getAmount).reduce(BigDecimal.ZERO,BigDecimal::add)); return "Saldo 355000 y asignaciones 5000";
        });
        check("Reintento de cobro no duplica", () -> {
            var f=fixture("Replay"); var cmd=pay(f,"5000","EFECTIVO",UUID.randomUUID().toString());
            var first=bean(RecordPaymentUseCase.class).execute(cmd); var again=bean(RecordPaymentUseCase.class).execute(cmd);
            require(first.paymentId().equals(again.paymentId())&&again.alreadyExisted(),"Duplicó cobro"); equal(money("355000"),debt(f.loan().getId())); return "Mismo Payment y saldo";
        });
        check("Cobros cero, negativos y por encima de deuda rechazados", () -> {
            var f=fixture("Cobros inválidos");
            for(String amount:List.of("0","-1","360001")) rejects(() -> bean(RecordPaymentUseCase.class).execute(pay(f,amount,"EFECTIVO",UUID.randomUUID().toString())).paymentId());
            equal(money("360000"),debt(f.loan().getId())); return "Sin alteración de saldo";
        });
        check("Pago adelantado distribuye varias cuotas", () -> {
            var f=fixture("Adelantado"); var result=bean(RecordPaymentUseCase.class).execute(pay(f,"30000","EFECTIVO",UUID.randomUUID().toString()));
            require(result.installmentsAffectedCount()==2,"Distribución incorrecta");
            require(bean(InstallmentRepository.class).findByLoanId(f.loan().getId()).stream().filter(i->"ADELANTADA".equals(i.getStatus())).count()==2,"No marcó cuotas adelantadas"); return "Dos cuotas adelantadas, saldo 330000";
        });
        check("Pago total finaliza crédito", () -> {
            var f=fixture("Pago total"); bean(RecordPaymentUseCase.class).execute(pay(f,"360000","EFECTIVO",UUID.randomUUID().toString()));
            equal(BigDecimal.ZERO,debt(f.loan().getId())); require("FINALIZADO".equals(bean(LoanRepository.class).findById(f.loan().getId()).orElseThrow().getStatus()),"Crédito sigue activo"); return "Deuda cero y FINALIZADO";
        });
        check("Nequi no debe aumentar efectivo físico", () -> {
            var f=fixture("Nequi"); var before=cash(f.route()); bean(RecordPaymentUseCase.class).execute(pay(f,"10000","NEQUI",UUID.randomUUID().toString()));
            equal(before,cash(f.route())); return "Efectivo sin variación";
        });
        check("Usuario sin sesión no debe registrar cobros", () -> {
            var f=fixture("Cobro sin sesión"); UserSessionContext.clear();
            try { rejects(() -> bean(RecordPaymentUseCase.class).execute(pay(f,"5000","EFECTIVO",UUID.randomUUID().toString())).paymentId()); }
            finally { admin(); } return "Rechazado";
        });
        check("Reversión restaura saldo y exige motivo", () -> {
            var f=fixture("Reversión"); var result=bean(RecordPaymentUseCase.class).execute(pay(f,"5000","EFECTIVO",UUID.randomUUID().toString()));
            rejects(() -> bean(ReversePaymentUseCase.class).execute(result.paymentId()," ").paymentId());
            bean(ReversePaymentUseCase.class).execute(result.paymentId(),"Prueba QA, pago registrado por error");
            equal(money("360000"),debt(f.loan().getId())); return "Saldo restaurado; pago ANULADO";
        });
        check("Reversión debe conservar asignaciones originales", () -> {
            var f=fixture("Historia reversión"); var result=bean(RecordPaymentUseCase.class).execute(pay(f,"5000","EFECTIVO",UUID.randomUUID().toString()));
            bean(ReversePaymentUseCase.class).execute(result.paymentId(),"Prueba QA");
            require(!bean(PaymentAllocationRepository.class).findByPaymentId(result.paymentId()).isEmpty(),"Se borraron las asignaciones originales"); return "Historial preservado";
        });
        check("Caja exige sesión y rechaza retiro superior a saldo", () -> {
            admin(); var service=bean(CashMovementUseCase.class); String key=UUID.randomUUID().toString();
            var cmd=new CashMovementUseCase.CashMovementCommand(key,"route-norte","INGRESO","APORTE",money("2000000"),"Capital ficticio QA","QA_APORTE");
            service.register(cmd); service.register(cmd); equal(money("2000000"),cash("route-norte"));
            rejects(() -> service.register(new CashMovementUseCase.CashMovementCommand(UUID.randomUUID().toString(),"route-norte","EGRESO","RETIRO",money("2000001"),"Inválido","QA")).getId());
            UserSessionContext.clear(); try { rejects(() -> service.register(cmd).getId()); } finally { admin(); } return "Aporte idempotente y controles correctos";
        });
        check("Renovación conserva identidad e interés administrativo", () -> {
            var f=fixture("Renovación"); var before=bean(TodayCollectionsService.class).getDailyMetricsForRoute(LocalDate.now(),f.route());
            var cmd=new RenewLoanUseCase.RenewLoanCommand(f.loan().getId(),money("700000"),money("0.4"),money("980000"),2,"MENSUAL",LocalDate.now(),money("35000"),"usr-admin-1");
            var preview=bean(RenewLoanUseCase.class).preview(cmd); var result=bean(RenewLoanUseCase.class).execute(cmd.withPreview(preview));
            equal(money("305000"),result.cashDisbursed());
            var after=bean(TodayCollectionsService.class).getDailyMetricsForRoute(LocalDate.now(),f.route());
            equal(before.totalAdministrativeCapital().add(money("280000")),after.totalAdministrativeCapital());
            equal(before.collectedToday(),after.collectedToday()); return "Neto 305000; Administrativo +280000; compensación no es recaudo";
        });
        check("Historial crediticio por documento", () -> {
            var f=fixture("Historial"); require(bean(CreditHistoryService.class).getReportByDocument(f.customer().getDocumentNumber()).isPresent(),"Sin historial"); return "Historial encontrado";
        });
        check("Cobro de cuota con la identidad textual usada por móvil", () -> {
            var f=fixture("Cuota móvil"); var row=bean(InstallmentRepository.class).findByLoanId(f.loan().getId()).getFirst();
            // Exact ID shape emitted by the mobile generator; preserve all other installment data.
            bean(InstallmentRepository.class).deleteById(row.getId());
            bean(InstallmentRepository.class).save(new InstallmentEntity(f.loan().getId()+"-cuota-1",f.loan().getId(),row.getInstallmentNumber(),row.getDueDate(),row.getAmount(),row.getPaidAmount(),row.getStatus()));
            bean(RecordPaymentUseCase.class).execute(pay(f,"5000","EFECTIVO",UUID.randomUUID().toString())); return "Cobro aceptado para identidad textual móvil";
        });
        check("Paquete móvil exportado es JSON y aísla ruta", () -> {
            var own=customer("Exportación sur", "route-sur");
            String raw=bean(MobileSyncProcessorService.class).exportRoutePackage("route-sur",LocalDate.now());
            var json=new ObjectMapper().readTree(raw); require(json.isObject(),"No es JSON");
            require("route-sur".equals(json.path("routeId").asText()),"Ruta incorrecta en paquete");
            require(json.path("customers").findValuesAsText("id").contains(own.getId()),"No exportó cliente propio");
            for(var customer:json.path("customers")) require("route-sur".equals(customer.path("routeId").asText()),"Filtró cliente de otra ruta");
            return "Exportación JSON válida, ruta y clientes aislados: "+raw.length()+" caracteres";
        });
        check("Paquete móvil malformado rechazado", () -> { rejects(() -> bean(MobileSyncProcessorService.class).importPackage("{invalid").summaryText()); return "Rechazado"; });
        check("Libro Excel contiene hojas válidas", () -> {
            var file=bean(ExcelReportExporter.class).exportAccountingWorkbook(home.resolve("qa-ledger.xlsx"));
            try(var zip=new ZipFile(file.toFile())) { require(zip.getEntry("xl/workbook.xml")!=null,"No es XLSX válido"); }
            return file.toString();
        });
        check("Cancelación de crédito normal compensa su desembolso", () -> {
            var f=fixture("Cancelación"); bean(CancelLoanUseCase.class).execute(f.loan().getId(),"Crédito ficticio cancelado en QA");
            equal(BigDecimal.ZERO,cash(f.route()));
            require("ANULADO".equals(bean(LoanRepository.class).findById(f.loan().getId()).orElseThrow().getStatus()),"Estado de cancelación incorrecto");
            return "Desembolso reintegrado y crédito anulado";
        });
        check("Cancelar migración no inventa entrada de caja", () -> {
            admin(); var c=customer("Migración", "route-norte");
            var loan=bean(CreateLoanUseCase.class).execute(new CreateLoanUseCase.CreateLoanCommand(c.getId(),"route-norte","usr-col-1",
                    money("300000"),money("0.2"),money("360000"),24,"DIARIO",LocalDate.now(),"usr-admin-1",BigDecimal.ZERO,
                    true,Set.of(),null,"Cartulina ficticia QA"));
            var before=cash("route-norte"); bean(CancelLoanUseCase.class).execute(loan.getId(),"Revertir migración ficticia");
            equal(before,cash("route-norte")); return "Sin dinero físico inventado";
        });
        check("Nueva deuda debe coincidir con la tasa indicada", () -> {
            var f=fixture("Términos inconsistentes");
            rejects(() -> bean(CreateLoanUseCase.class).execute(new CreateLoanUseCase.CreateLoanCommand(f.customer().getId(),f.route(),"usr-col-1",
                    money("300000"),money("0.2"),money("400000"),24,"DIARIO",LocalDate.now(),"usr-admin-1",money("15000"))).getId());
            return "Capital 300000 al 20% no acepta deuda 400000";
        });
        check("Importación real de renovación descuenta neto más papelería", () -> {
            var f=fixture("Renovación móvil"); var before=cash(f.route()); var mapper=new ObjectMapper();
            var pkg=mapper.createObjectNode().put("operatingDate",LocalDate.now().toString()).put("routeId",f.route()).put("collectorId","usr-col-1");
            String next="mobile-loan-"+UUID.randomUUID();
            pkg.putArray("newLoans").addObject().put("id",next).put("customerId",f.customer().getId()).put("routeId",f.route())
                    .put("collectorId","usr-col-1").put("principal",700000).put("interestRate",money("0.4")).put("totalAgreed",980000)
                    .put("installmentCount",2).put("frequency","MONTHLY").put("startDate",LocalDate.now().toString())
                    .put("previousLoanId",f.loan().getId());
            pkg.putArray("renewals").addObject().put("id","mobile-renewal-"+UUID.randomUUID()).put("previousLoanId",f.loan().getId())
                    .put("newLoanId",next).put("newPrincipal",700000).put("previousBalanceDeducted",360000)
                    .put("paperworkDeducted",35000).put("actualCashDisbursed",305000);
            var result=bean(MobileSyncProcessorService.class).importPackage(mapper.writeValueAsString(pkg));
            require(result.renewalsImported()==1,"No importó renovación: "+result.summaryText());
            equal(before.subtract(money("340000")),cash(f.route())); return "Base descuenta 340000";
        });
        check("Segunda ruta crea jornada en su ruta correcta", () -> {
            var summary=bean(SettlementUseCase.class).getOrCreateDaySummary("usr-col-2",LocalDate.now());
            var session=bean(CollectionSessionRepository.class).findById(summary.sessionId()).orElseThrow();
            require("route-sur".equals(session.getRouteId()),"Esperado route-sur; observado "+session.getRouteId()); return "Ruta correcta";
        });
        check("Gasto operativo queda registrado y auditado", () -> {
            var movement=bean(SettlementUseCase.class).registerRouteExpense("usr-col-1","route-norte",SettlementUseCase.CAT_GASTO_GASOLINA,money("10000"),"Gasolina ficticia QA","usr-admin-1");
            require(bean(CashMovementRepository.class).existsById(movement.getId()),"Gasto ausente"); return "Gasto 10000 registrado";
        });
        check("Arqueo excluye cobros Nequi del efectivo esperado", () -> {
            var summary=bean(SettlementUseCase.class).getOrCreateDaySummary("usr-col-1",LocalDate.now());
            var cashPayments=bean(PaymentRepository.class).findAll().stream().filter(p->"APLICADO".equals(p.getStatus())&&"EFECTIVO".equals(p.getMethod())).map(PaymentEntity::getAmount).reduce(BigDecimal.ZERO,BigDecimal::add);
            equal(cashPayments.subtract(summary.routeExpenses()).max(BigDecimal.ZERO),summary.netExpectedCash()); return "Solo efectivo";
        });
        Fixture afterClose=fixture("Cobro posterior al cierre");
        check("Descuadre sin justificación rechazado", () -> {
            var s=bean(SettlementUseCase.class).getOrCreateDaySummary("usr-col-1",LocalDate.now());
            rejects(() -> bean(SettlementUseCase.class).closeSettlement(s.sessionId(),s.netExpectedCash().subtract(money("1000")),BigDecimal.ZERO,null," ","usr-admin-1").getId()); return "Rechazado";
        });
        final String[] closedId={null};
        check("Liquidar y bloquear cierre repetido", () -> {
            var s=bean(SettlementUseCase.class).getOrCreateDaySummary("usr-col-1",LocalDate.now());
            var closed=bean(SettlementUseCase.class).closeSettlement(s.sessionId(),s.netExpectedCash(),BigDecimal.ZERO,null,"QA cierre exacto","usr-admin-1"); closedId[0]=closed.getId();
            rejects(() -> bean(SettlementUseCase.class).closeSettlement(s.sessionId(),s.netExpectedCash(),BigDecimal.ZERO,null,"Reintento","usr-admin-1").getId()); return "Cierre guardado y repetición rechazada";
        });
        check("Gasto posterior al cierre rechazado", () -> {
            rejects(() -> bean(SettlementUseCase.class).registerRouteExpense("usr-col-1","route-norte",SettlementUseCase.CAT_GASTO_OTRO,money("1000"),"No debe admitirse","usr-admin-1").getId()); return "Rechazado";
        });
        check("Respaldo automático contiene el cierre recién realizado", () -> {
            require(closedId[0]!=null,"Faltó cierre previo"); var file=bean(DatabaseBackupService.class).listBackups().getFirst();
            require(count(file,"daily_settlement","id",closedId[0])==1,"El respaldo automático no contiene el cierre confirmado"); return "Cierre recuperable";
        });
        check("Cobro posterior al cierre no altera la jornada cerrada", () -> {
            rejects(() -> bean(RecordPaymentUseCase.class).execute(pay(afterClose,"5000","EFECTIVO",UUID.randomUUID().toString())).paymentId()); return "Rechazado";
        });
        check("Respaldo manual SQLite íntegro", () -> {
            var file=bean(DatabaseBackupService.class).createBackup("QA manual tras commit");
            try(var c=DriverManager.getConnection("jdbc:sqlite:"+file);var statement=c.createStatement();var r=statement.executeQuery("PRAGMA integrity_check")) {
                require(r.next()&&"ok".equals(r.getString(1)),"Integridad SQLite inválida"); }
            return file.toString();
        });
        check("Persistencia reabrible con los clientes y movimientos guardados", () -> {
            var file=home.resolve(".sistema-cartera/cartera.db");
            require(count(file,"customer","status","ACTIVO")>10,"No se conservaron clientes QA");
            require(bean(AuditLogRepository.class).count()>0,"Sin auditoría"); return "Datos persistidos y auditados";
        });
        new ObjectMapper().writerWithDefaultPrettyPrinter().writeValue(home.resolve("journey-results.json").toFile(),results);
        long fail=results.stream().filter(r->"FAIL".equals(r.get("status"))).count();
        System.out.println("QA_RESULT total="+results.size()+" pass="+(results.size()-fail)+" fail="+fail+" report="+home.resolve("journey-results.json"));
        return Math.toIntExact(fail);
    }

    public static void main(String[] args) throws Exception {
        Path home=OfficeQaLauncher.isolate("service-journey");
        int failures;
        try(var context=OfficeQaLauncher.open()) {
            OfficeQaLauncher.seed(context);
            failures=new OfficeJourneyQa(context,home).run();
        } finally { UserSessionContext.clear(); }
        if(failures>0) System.exit(2); // Findings must not look like a successful quality gate.
    }
}
