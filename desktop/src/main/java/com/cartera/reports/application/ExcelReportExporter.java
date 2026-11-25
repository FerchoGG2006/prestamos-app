package com.cartera.reports.application;

import com.cartera.infrastructure.persistence.entity.*;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.settlement.application.CashLedger;
import com.cartera.settlement.application.SettlementUseCase;
import com.cartera.ui.util.UiLabels;
import org.springframework.stereotype.Service;

import java.io.FileOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Exportador Contable Ejecutivo Nativo en formato OpenXML (.xlsx) con 5 hojas financieras,
 * estilos profesionales, formato de moneda, porcentajes, paneles inmovilizados y autofiltros.
 */
@Service
public class ExcelReportExporter {

    private static final int STYLE_DEFAULT = 0;
    private static final int STYLE_TITLE_BANNER = 1;
    private static final int STYLE_SUBTITLE_BANNER = 2;
    private static final int STYLE_HEADER_NAVY = 3;
    private static final int STYLE_CURRENCY = 4;
    private static final int STYLE_PERCENT = 5;
    private static final int STYLE_BADGE_GREEN = 6;
    private static final int STYLE_BADGE_RED = 7;
    private static final int STYLE_BADGE_AMBER = 8;
    private static final int STYLE_TOTALS_LABEL = 9;
    private static final int STYLE_TOTALS_CURRENCY = 10;
    private static final int STYLE_CENTER = 11;

    private final LoanRepository loanRepository;
    private final InstallmentRepository installmentRepository;
    private final PaymentRepository paymentRepository;
    private final CustomerRepository customerRepository;
    private final CashMovementRepository cashMovementRepository;
    private final RouteRepository routeRepository;
    private final AppUserRepository userRepository;

    public ExcelReportExporter(
            LoanRepository loanRepository,
            InstallmentRepository installmentRepository,
            PaymentRepository paymentRepository,
            CustomerRepository customerRepository,
            CashMovementRepository cashMovementRepository,
            RouteRepository routeRepository,
            AppUserRepository userRepository
    ) {
        this.loanRepository = loanRepository;
        this.installmentRepository = installmentRepository;
        this.paymentRepository = paymentRepository;
        this.customerRepository = customerRepository;
        this.cashMovementRepository = cashMovementRepository;
        this.routeRepository = routeRepository;
        this.userRepository = userRepository;
    }

    public Path exportAccountingWorkbook(Path destinationPath) {
        return exportAccountingWorkbook(destinationPath, UserSessionContext.getSelectedRouteId());
    }

    public Path exportAccountingWorkbook(Path destinationPath, String routeFilter) {
        try {
            boolean filterByRoute = routeFilter != null && !routeFilter.isBlank()
                    && !"ALL".equalsIgnoreCase(routeFilter) && !"NONE".equalsIgnoreCase(routeFilter);
            String normalizedFilter = filterByRoute ? SettlementUseCase.normalizeRouteId(routeFilter) : "ALL";

            List<LoanEntity> allLoans = loanRepository != null ? loanRepository.findAll() : List.of();
            List<LoanEntity> loans = filterByRoute
                    ? allLoans.stream().filter(l -> normalizedFilter.equalsIgnoreCase(SettlementUseCase.normalizeRouteId(l.getRouteId()))).toList()
                    : allLoans;
            Set<String> scopedLoanIds = loans.stream().map(LoanEntity::getId).collect(Collectors.toSet());

            List<InstallmentEntity> allInstallments = installmentRepository != null ? installmentRepository.findAll() : List.of();
            List<InstallmentEntity> installments = filterByRoute
                    ? allInstallments.stream().filter(i -> scopedLoanIds.contains(i.getLoanId())).toList()
                    : allInstallments;

            List<PaymentEntity> allPayments = paymentRepository != null ? paymentRepository.findAll() : List.of();
            List<PaymentEntity> payments = filterByRoute
                    ? allPayments.stream().filter(p -> scopedLoanIds.contains(p.getLoanId())).toList()
                    : allPayments;

            List<CustomerEntity> customers = customerRepository != null ? customerRepository.findAll() : List.of();
            List<CashMovementEntity> allMovements = cashMovementRepository != null ? cashMovementRepository.findAll() : List.of();
            List<CashMovementEntity> movements = filterByRoute
                    ? allMovements.stream().filter(m -> normalizedFilter.equalsIgnoreCase(SettlementUseCase.normalizeRouteId(m.getRouteId()))).toList()
                    : allMovements;

            Map<String, CustomerEntity> customerMap = customers.stream()
                    .collect(Collectors.toMap(CustomerEntity::getId, c -> c, (a, b) -> a));
            Map<String, String> routeNames = routeRepository != null
                    ? routeRepository.findAll().stream().collect(Collectors.toMap(RouteEntity::getId, RouteEntity::getName, (a, b) -> a))
                    : Map.of();
            Map<String, String> userNames = userRepository != null
                    ? userRepository.findAll().stream().collect(Collectors.toMap(AppUserEntity::getId, u -> u.getFullName() != null ? u.getFullName() : u.getUsername(), (a, b) -> a))
                    : Map.of();
            String scopeLabel = filterByRoute
                    ? "Ruta: " + routeNames.getOrDefault(normalizedFilter, normalizedFilter)
                    : "Consolidado (Todas las Rutas)";

            try (ZipOutputStream zos = new ZipOutputStream(new FileOutputStream(destinationPath.toFile()))) {
                writeZipEntry(zos, "[Content_Types].xml", buildContentTypesXml());
                writeZipEntry(zos, "_rels/.rels", buildRootRelsXml());
                writeZipEntry(zos, "xl/workbook.xml", buildWorkbookXml());
                writeZipEntry(zos, "xl/_rels/workbook.xml.rels", buildWorkbookRelsXml());
                writeZipEntry(zos, "xl/styles.xml", buildStylesXml());

                writeZipEntry(zos, "xl/worksheets/sheet1.xml", buildSheet1ExecutiveSummary(loans, installments, payments, allPayments, customers, movements, routeNames, scopeLabel));
                writeZipEntry(zos, "xl/worksheets/sheet2.xml", buildSheet2ActivePortfolio(loans, installments, customerMap, routeNames, userNames));
                writeZipEntry(zos, "xl/worksheets/sheet3.xml", buildSheet3OverduePortfolio(loans, installments, customerMap, routeNames));
                writeZipEntry(zos, "xl/worksheets/sheet4.xml", buildSheet4PaymentHistory(payments, customerMap, userNames));
                writeZipEntry(zos, "xl/worksheets/sheet5.xml", buildSheet5DailyCashLedger(movements, allPayments, routeNames, userNames));
            }
            return destinationPath;
        } catch (IOException ex) {
            throw new IllegalStateException("No se pudo exportar el libro contable Excel: " + ex.getMessage(), ex);
        }
    }

    private void writeZipEntry(ZipOutputStream zos, String name, String xmlContent) throws IOException {
        ZipEntry entry = new ZipEntry(name);
        zos.putNextEntry(entry);
        zos.write(xmlContent.getBytes(StandardCharsets.UTF_8));
        zos.closeEntry();
    }

    private String buildContentTypesXml() {
        return """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
                  <Default Extension="xml" ContentType="application/xml"/>
                  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
                  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
                  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
                  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
                  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
                  <Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
                  <Override PartName="/xl/worksheets/sheet5.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
                </Types>
                """;
    }

    private String buildRootRelsXml() {
        return """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
                </Relationships>
                """;
    }

    private String buildWorkbookXml() {
        return """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
                          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
                  <sheets>
                    <sheet name="1_Resumen_Ejecutivo" sheetId="1" r:id="rId1"/>
                    <sheet name="2_Cartera_Activa" sheetId="2" r:id="rId2"/>
                    <sheet name="3_Cartera_En_Mora" sheetId="3" r:id="rId3"/>
                    <sheet name="4_Historial_Cobros" sheetId="4" r:id="rId4"/>
                    <sheet name="5_Libro_Diario_Caja" sheetId="5" r:id="rId5"/>
                  </sheets>
                </workbook>
                """;
    }

    private String buildWorkbookRelsXml() {
        return """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
                  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
                  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
                  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>
                  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet5.xml"/>
                  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
                </Relationships>
                """;
    }

    private String buildStylesXml() {
        return """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
                  <numFmts count="2">
                    <numFmt numFmtId="164" formatCode="&quot;$&quot; #,##0;(&quot;$&quot; #,##0);&quot;-&quot;"/>
                    <numFmt numFmtId="165" formatCode="0.0%"/>
                  </numFmts>
                  <fonts count="7">
                    <font><sz val="11"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
                    <font><b/><sz val="15"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
                    <font><b/><sz val="11"/><color rgb="FF1E40AF"/><name val="Calibri"/></font>
                    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
                    <font><b/><sz val="10"/><color rgb="FF166534"/><name val="Calibri"/></font>
                    <font><b/><sz val="10"/><color rgb="FF991B1B"/><name val="Calibri"/></font>
                    <font><b/><sz val="10"/><color rgb="FF92400E"/><name val="Calibri"/></font>
                  </fonts>
                  <fills count="9">
                    <fill><patternFill patternType="none"/></fill>
                    <fill><patternFill patternType="gray125"/></fill>
                    <fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/></patternFill></fill>
                    <fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/></patternFill></fill>
                    <fill><patternFill patternType="solid"><fgColor rgb="FF1E3A8A"/></patternFill></fill>
                    <fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/></patternFill></fill>
                    <fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/></patternFill></fill>
                    <fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/></patternFill></fill>
                    <fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/></patternFill></fill>
                  </fills>
                  <borders count="3">
                    <border><left/><right/><top/><bottom/><diagonal/></border>
                    <border>
                      <left style="thin"><color rgb="FFCBD5E1"/></left>
                      <right style="thin"><color rgb="FFCBD5E1"/></right>
                      <top style="thin"><color rgb="FFCBD5E1"/></top>
                      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
                      <diagonal/>
                    </border>
                    <border>
                      <left style="thin"><color rgb="FF94A3B8"/></left>
                      <right style="thin"><color rgb="FF94A3B8"/></right>
                      <top style="medium"><color rgb="FF1E293B"/></top>
                      <bottom style="double"><color rgb="FF1E293B"/></bottom>
                      <diagonal/>
                    </border>
                  </borders>
                  <cellStyleXfs count="1">
                    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
                  </cellStyleXfs>
                  <cellXfs count="12">
                    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
                    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
                    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
                    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
                    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
                    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
                    <xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
                    <xf numFmtId="0" fontId="5" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
                    <xf numFmtId="0" fontId="6" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
                    <xf numFmtId="0" fontId="2" fillId="8" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
                    <xf numFmtId="164" fontId="2" fillId="8" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
                    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
                  </cellXfs>
                </styleSheet>
                """;
    }

    private String buildSheet1ExecutiveSummary(
            List<LoanEntity> loans,
            List<InstallmentEntity> installments,
            List<PaymentEntity> payments,
            List<PaymentEntity> allPayments,
            List<CustomerEntity> customers,
            List<CashMovementEntity> movements,
            Map<String, String> routeNames,
            String scopeLabel
    ) {
        List<LoanEntity> validLoans = loans.stream()
                .filter(l -> !"ANULADO".equalsIgnoreCase(l.getStatus()) && !"CANCELLED".equalsIgnoreCase(l.getStatus()))
                .toList();
        Map<String, LoanEntity> validLoansById = validLoans.stream()
                .collect(Collectors.toMap(LoanEntity::getId, l -> l, (a, b) -> a));

        BigDecimal totalPrincipal = validLoans.stream().map(LoanEntity::getPrincipal).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalInterest = validLoans.stream().map(LoanEntity::getInterestAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalAgreed = validLoans.stream().map(LoanEntity::getTotalAgreed).reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal totalCollected = payments.stream()
                .filter(p -> "APLICADO".equalsIgnoreCase(p.getStatus()) || "REGISTRADO".equalsIgnoreCase(p.getStatus()))
                .map(PaymentEntity::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Set<String> activeLoanIds = validLoans.stream()
                .filter(l -> "ACTIVO".equalsIgnoreCase(l.getStatus()))
                .map(LoanEntity::getId)
                .collect(Collectors.toSet());

        String todayStr = LocalDate.now().toString();
        BigDecimal activePending = installments.stream()
                .filter(i -> activeLoanIds.contains(i.getLoanId()))
                .filter(i -> !"ANULADA".equalsIgnoreCase(i.getStatus()))
                .map(InstallmentEntity::getPendingAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal overdueAmount = installments.stream()
                .filter(i -> activeLoanIds.contains(i.getLoanId()))
                .filter(i -> !"ANULADA".equalsIgnoreCase(i.getStatus()))
                .filter(i -> i.getPendingAmount().compareTo(BigDecimal.ZERO) > 0 && i.getDueDate() != null && i.getDueDate().compareTo(todayStr) < 0)
                .map(InstallmentEntity::getPendingAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Separar Base Operativa física, Fondos Digitales y Papelería Disponible (Spec 008 / CashLedger)
        var paymentIndex = CashLedger.index(allPayments);
        BigDecimal operationalCash = BigDecimal.ZERO;
        BigDecimal digitalBalance = BigDecimal.ZERO;
        BigDecimal paperworkGenerated = BigDecimal.ZERO;
        BigDecimal paperworkWithdrawn = BigDecimal.ZERO;

        for (CashMovementEntity m : movements) {
            String cat = m.getCategory() != null ? m.getCategory().toUpperCase().trim() : "";
            BigDecimal amt = m.getAmount() != null ? m.getAmount() : BigDecimal.ZERO;

            if ("RETIRO_PAPELERIA".equals(cat)) {
                paperworkWithdrawn = paperworkWithdrawn.add(amt.max(BigDecimal.ZERO));
                continue;
            }
            if ("PAPELERIA_RENOVACION".equals(cat)) {
                if (m.getReferenceId() == null || validLoansById.containsKey(m.getReferenceId())) {
                    paperworkGenerated = paperworkGenerated.add(amt.max(BigDecimal.ZERO));
                }
            }
            boolean physical;
            try {
                physical = CashLedger.isPhysical(m, paymentIndex);
            } catch (Exception ex) {
                physical = false;
            }
            BigDecimal signed = BigDecimal.ZERO;
            if ("INGRESO".equalsIgnoreCase(m.getMovementType()) || "ENTRADA".equalsIgnoreCase(m.getMovementType())) {
                signed = amt;
            } else if ("EGRESO".equalsIgnoreCase(m.getMovementType()) || "SALIDA".equalsIgnoreCase(m.getMovementType())) {
                signed = amt.negate();
            }
            if (physical) {
                operationalCash = operationalCash.add(signed);
                if (("DESEMBOLSO".equals(cat) || "DESEMBOLSO_CREDITO".equals(cat) || "LOAN_DISBURSEMENT".equals(cat))
                        && signed.signum() < 0 && m.getReferenceId() != null) {
                    LoanEntity loan = validLoansById.get(m.getReferenceId());
                    if (loan != null && loan.getPrincipal() != null) {
                        BigDecimal retained = loan.getPrincipal().subtract(amt);
                        if (retained.compareTo(BigDecimal.ZERO) > 0) {
                            paperworkGenerated = paperworkGenerated.add(retained);
                            operationalCash = operationalCash.subtract(retained);
                        }
                    }
                }
            } else if (!"DESCUENTO_NOMINA_DESCUADRE".equals(cat)) {
                digitalBalance = digitalBalance.add(signed);
            }
        }
        BigDecimal paperworkAvailable = paperworkGenerated.subtract(paperworkWithdrawn).max(BigDecimal.ZERO);
        BigDecimal totalPhysicalBox = operationalCash.add(paperworkAvailable);
        BigDecimal administrativeCapital = activePending.add(operationalCash).add(digitalBalance);

        BigDecimal collectionRatio = totalAgreed.compareTo(BigDecimal.ZERO) > 0
                ? totalCollected.divide(totalAgreed, 4, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
        BigDecimal delinquencyRatio = activePending.compareTo(BigDecimal.ZERO) > 0
                ? overdueAmount.divide(activePending, 4, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        StringBuilder rows = new StringBuilder();
        int r = 1;
        rows.append(rowBanner(r++, "REPORTE CONTABLE Y AUDITORÍA EJECUTIVA — SISTEMA DE CARTERA", STYLE_TITLE_BANNER));
        rows.append(rowBanner(r++, "Alcance: " + scopeLabel + " | Generado el: " + LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss")), STYLE_SUBTITLE_BANNER));
        r++;

        rows.append(rowHeaders(r++, List.of("INDICADOR FINANCIERO / KPI", "VALOR", "ESTADO / INTERPRETACIÓN")));
        rows.append(rowKpiCurrency(r++, "Capital Total Colocado (Histórico)", totalPrincipal, "Colocación neta en contratos vigentes", STYLE_DEFAULT));
        rows.append(rowKpiCurrency(r++, "Intereses Proyectados Pactados", totalInterest, "Rentabilidad bruta contratada", STYLE_DEFAULT));
        rows.append(rowKpiCurrency(r++, "Total Cartera Pactada (Capital + Interés)", totalAgreed, "100% de obligaciones generadas", STYLE_DEFAULT));
        rows.append(rowKpiCurrency(r++, "Total Cobrado Histórico Aplicado", totalCollected, "Abonos efectivos en firme", STYLE_BADGE_GREEN));
        rows.append(rowKpiCurrency(r++, "Cartera Activa en Calle (Por Cobrar)", activePending, "Saldo vivo en préstamos activos", STYLE_DEFAULT));
        rows.append(rowKpiCurrency(r++, "Cartera Vencida / En Mora", overdueAmount, overdueAmount.signum() > 0 ? "RIESGO DE MORA ACTIVO" : "SIN MORA VENCIDA", overdueAmount.signum() > 0 ? STYLE_BADGE_RED : STYLE_BADGE_GREEN));
        rows.append(rowKpiCurrency(r++, "Base Operativa en Efectivo", operationalCash, "Efectivo físico operativo (sin papelería)", operationalCash.signum() < 0 ? STYLE_BADGE_RED : STYLE_DEFAULT));
        rows.append(rowKpiCurrency(r++, "Papelería Disponible en Caja", paperworkAvailable, "Separada (no suma al Administrativo)", STYLE_DEFAULT));
        rows.append(rowKpiCurrency(r++, "Base Física Total en Oficina (Base + Papelería)", totalPhysicalBox, "Efectivo físico total en caja", STYLE_DEFAULT));
        rows.append(rowKpiCurrency(r++, "Fondos Digitales (Nequi / Transferencias)", digitalBalance, "Saldos digitales separados", STYLE_DEFAULT));
        rows.append(rowKpiCurrency(r++, "Patrimonio Administrativo (Cartera + Base Op. + Digital)", administrativeCapital, "Valor operativo real (excluye papelería)", STYLE_BADGE_GREEN));
        rows.append(rowKpiPercent(r++, "Índice de Recuperación de Cartera (%)", collectionRatio, "Porcentaje cobrado sobre total pactado"));
        rows.append(rowKpiPercent(r++, "Índice de Morosidad sobre Cartera Activa (%)", delinquencyRatio, delinquencyRatio.compareTo(new BigDecimal("0.15")) > 0 ? "ALERTA DE MORA" : "SALUDABLE"));

        int lastKpiRow = r - 1;
        r++;
        rows.append(rowHeaders(r++, List.of("RESUMEN POR RUTA", "PRÉSTAMOS ACTIVOS", "CAPITAL ACTIVO")));
        Map<String, List<LoanEntity>> byRoute = validLoans.stream()
                .filter(l -> "ACTIVO".equalsIgnoreCase(l.getStatus()))
                .collect(Collectors.groupingBy(l -> l.getRouteId() != null && !l.getRouteId().isBlank() ? l.getRouteId() : "SIN_RUTA"));
        for (var entry : byRoute.entrySet()) {
            String rName = "SIN_RUTA".equals(entry.getKey()) ? "Sin ruta" : routeNames.getOrDefault(entry.getKey(), entry.getKey());
            BigDecimal sumPrin = entry.getValue().stream().map(LoanEntity::getPrincipal).reduce(BigDecimal.ZERO, BigDecimal::add);
            rows.append("<row r=\"").append(r).append("\">")
                    .append(cellStr(1, r, rName, STYLE_DEFAULT))
                    .append(cellNum(2, r, entry.getValue().size(), STYLE_CENTER))
                    .append(cellDec(3, r, sumPrin, STYLE_CURRENCY))
                    .append("</row>");
            r++;
        }

        return wrapWorksheet(rows.toString(), List.of(48, 24, 38), 4, "C" + lastKpiRow, 3);
    }

    private String buildSheet2ActivePortfolio(
            List<LoanEntity> loans,
            List<InstallmentEntity> installments,
            Map<String, CustomerEntity> customerMap,
            Map<String, String> routeNames,
            Map<String, String> userNames
    ) {
        Map<String, List<InstallmentEntity>> instByLoan = installments.stream()
                .collect(Collectors.groupingBy(InstallmentEntity::getLoanId));

        StringBuilder rows = new StringBuilder();
        int r = 1;
        rows.append(rowBanner(r++, "DETALLE GENERAL DE CARTERA Y CONTRATOS DE CRÉDITO", STYLE_TITLE_BANNER));
        rows.append(rowBanner(r++, "Incluye préstamos activos, finalizados, renovados y anulados con su respectivo avance financiero", STYLE_SUBTITLE_BANNER));
        r++;

        List<String> headers = List.of(
                "ID CONTRATO", "CLIENTE", "DOCUMENTO", "TELÉFONO", "RUTA", "COBRADOR",
                "MODALIDAD", "CAPITAL", "INTERÉS", "TOTAL PACTADO", "ABONADO", "SALDO PENDIENTE",
                "% AVANCE", "CUOTAS", "FECHA INICIO", "ESTADO"
        );
        rows.append(rowHeaders(r++, headers));

        BigDecimal sumPrincipal = BigDecimal.ZERO;
        BigDecimal sumInterest = BigDecimal.ZERO;
        BigDecimal sumTotal = BigDecimal.ZERO;
        BigDecimal sumPaid = BigDecimal.ZERO;
        BigDecimal sumPending = BigDecimal.ZERO;

        for (LoanEntity l : loans) {
            CustomerEntity c = customerMap.get(l.getCustomerId());
            String cName = c != null ? c.getFullName() : "Cliente #" + l.getCustomerId();
            String cDoc = c != null ? c.getDocumentNumber() : "-";
            String cPhone = c != null ? c.getPhone() : "-";
            String rName = (l.getRouteId() != null && !l.getRouteId().isBlank())
                    ? routeNames.getOrDefault(l.getRouteId(), l.getRouteId())
                    : "Sin ruta";
            String colName = userNames.getOrDefault(l.getCollectorId(), l.getCollectorId() != null ? l.getCollectorId() : "-");

            boolean isCancelled = "ANULADO".equalsIgnoreCase(l.getStatus()) || "CANCELLED".equalsIgnoreCase(l.getStatus());
            List<InstallmentEntity> lInsts = instByLoan.getOrDefault(l.getId(), List.of());
            BigDecimal paid = isCancelled
                    ? BigDecimal.ZERO
                    : lInsts.stream()
                            .filter(i -> !"ANULADA".equalsIgnoreCase(i.getStatus()))
                            .map(i -> i.getPaidAmount() != null ? i.getPaidAmount() : BigDecimal.ZERO)
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal pending = isCancelled
                    ? BigDecimal.ZERO
                    : l.getTotalAgreed().subtract(paid).max(BigDecimal.ZERO);
            long paidInstCount = isCancelled
                    ? 0
                    : lInsts.stream()
                            .filter(i -> "PAGADA".equalsIgnoreCase(i.getStatus()) || "ADELANTADA".equalsIgnoreCase(i.getStatus()))
                            .count();
            BigDecimal progress = (!isCancelled && l.getTotalAgreed().compareTo(BigDecimal.ZERO) > 0)
                    ? paid.divide(l.getTotalAgreed(), 4, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

            if (!isCancelled) {
                sumPrincipal = sumPrincipal.add(l.getPrincipal());
                sumInterest = sumInterest.add(l.getInterestAmount());
                sumTotal = sumTotal.add(l.getTotalAgreed());
                sumPaid = sumPaid.add(paid);
                sumPending = sumPending.add(pending);
            }

            int badgeStyle = STYLE_DEFAULT;
            if ("ACTIVO".equalsIgnoreCase(l.getStatus())) badgeStyle = STYLE_BADGE_AMBER;
            else if ("FINALIZADO".equalsIgnoreCase(l.getStatus())
                    || "COMPLETADO".equalsIgnoreCase(l.getStatus())
                    || "PAGADO".equalsIgnoreCase(l.getStatus())
                    || "RENOVADO".equalsIgnoreCase(l.getStatus())) badgeStyle = STYLE_BADGE_GREEN;
            else if (isCancelled) badgeStyle = STYLE_BADGE_RED;

            rows.append("<row r=\"").append(r).append("\">")
                    .append(cellStr(1, r, l.getId(), STYLE_DEFAULT))
                    .append(cellStr(2, r, cName, STYLE_DEFAULT))
                    .append(cellStr(3, r, cDoc, STYLE_CENTER))
                    .append(cellStr(4, r, cPhone, STYLE_CENTER))
                    .append(cellStr(5, r, rName, STYLE_DEFAULT))
                    .append(cellStr(6, r, colName, STYLE_DEFAULT))
                    .append(cellStr(7, r, l.getFrequency(), STYLE_CENTER))
                    .append(cellDec(8, r, l.getPrincipal(), STYLE_CURRENCY))
                    .append(cellDec(9, r, l.getInterestAmount(), STYLE_CURRENCY))
                    .append(cellDec(10, r, l.getTotalAgreed(), STYLE_CURRENCY))
                    .append(cellDec(11, r, paid, STYLE_CURRENCY))
                    .append(cellDec(12, r, pending, STYLE_CURRENCY))
                    .append(cellDec(13, r, progress, STYLE_PERCENT))
                    .append(cellStr(14, r, paidInstCount + "/" + l.getInstallmentCount(), STYLE_CENTER))
                    .append(cellStr(15, r, l.getStartDate(), STYLE_CENTER))
                    .append(cellStr(16, r, l.getStatus(), badgeStyle))
                    .append("</row>");
            r++;
        }

        int lastDataRow = Math.max(4, r - 1);
        // Fila de Totales (excluida del autoFilter para que no se mezcle al ordenar)
        rows.append("<row r=\"").append(r).append("\">")
                .append(cellStr(1, r, "TOTALES CARTERA VIGENTE", STYLE_TOTALS_LABEL))
                .append(cellStr(2, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(3, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(4, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(5, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(6, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(7, r, "", STYLE_TOTALS_LABEL))
                .append(cellDec(8, r, sumPrincipal, STYLE_TOTALS_CURRENCY))
                .append(cellDec(9, r, sumInterest, STYLE_TOTALS_CURRENCY))
                .append(cellDec(10, r, sumTotal, STYLE_TOTALS_CURRENCY))
                .append(cellDec(11, r, sumPaid, STYLE_TOTALS_CURRENCY))
                .append(cellDec(12, r, sumPending, STYLE_TOTALS_CURRENCY))
                .append(cellStr(13, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(14, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(15, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(16, r, "", STYLE_TOTALS_LABEL))
                .append("</row>");

        return wrapWorksheet(rows.toString(), List.of(20, 26, 16, 16, 18, 20, 14, 16, 16, 16, 16, 16, 12, 12, 14, 14), 4, "P" + lastDataRow, 16);
    }

    private String buildSheet3OverduePortfolio(
            List<LoanEntity> loans,
            List<InstallmentEntity> installments,
            Map<String, CustomerEntity> customerMap,
            Map<String, String> routeNames
    ) {
        Map<String, LoanEntity> activeLoanMap = loans.stream()
                .filter(l -> "ACTIVO".equalsIgnoreCase(l.getStatus()))
                .collect(Collectors.toMap(LoanEntity::getId, l -> l, (a, b) -> a));

        LocalDate today = LocalDate.now();
        String todayStr = today.toString();

        List<InstallmentEntity> overdueInsts = installments.stream()
                .filter(i -> activeLoanMap.containsKey(i.getLoanId()))
                .filter(i -> i.getPendingAmount() != null && i.getPendingAmount().compareTo(BigDecimal.ZERO) > 0)
                .filter(i -> i.getDueDate() != null && i.getDueDate().compareTo(todayStr) < 0)
                .sorted(Comparator.comparing(InstallmentEntity::getDueDate))
                .toList();

        StringBuilder rows = new StringBuilder();
        int r = 1;
        rows.append(rowBanner(r++, "AUDITORÍA DE CARTERA VENCIDA Y GESTIÓN DE MORA", STYLE_TITLE_BANNER));
        rows.append(rowBanner(r++, "Cuotas con fecha de vencimiento anterior a " + todayStr + " y saldo pendiente de pago", STYLE_SUBTITLE_BANNER));
        r++;

        List<String> headers = List.of(
                "CLIENTE", "DOCUMENTO", "TELÉFONO", "DIRECCIÓN / BARRIO", "RUTA",
                "ID CRÉDITO", "CUOTA #", "FECHA VENCIMIENTO", "DÍAS MORA",
                "VALOR CUOTA", "ABONADO", "SALDO VENCIDO", "NIVEL DE RIESGO"
        );
        rows.append(rowHeaders(r++, headers));

        BigDecimal totalOverdue = BigDecimal.ZERO;

        for (InstallmentEntity inst : overdueInsts) {
            LoanEntity loan = activeLoanMap.get(inst.getLoanId());
            CustomerEntity c = loan != null ? customerMap.get(loan.getCustomerId()) : null;
            String cName = c != null ? c.getFullName() : "Cliente";
            String cDoc = c != null ? c.getDocumentNumber() : "-";
            String cPhone = c != null ? c.getPhone() : "-";
            String cAddr = c != null ? ((c.getAddress() != null ? c.getAddress() : "") + " - " + (c.getNeighborhood() != null ? c.getNeighborhood() : "")) : "-";
            String rName = loan != null ? routeNames.getOrDefault(loan.getRouteId(), loan.getRouteId()) : "-";

            long daysOverdue = 1;
            try {
                daysOverdue = Math.max(1, ChronoUnit.DAYS.between(LocalDate.parse(inst.getDueDate()), today));
            } catch (Exception ignored) {}

            String risk = daysOverdue > 30 ? "CRÍTICO (+30d)" : (daysOverdue > 7 ? "ALTO (8-30d)" : "TEMPRANO (1-7d)");
            int riskStyle = daysOverdue > 7 ? STYLE_BADGE_RED : STYLE_BADGE_AMBER;

            totalOverdue = totalOverdue.add(inst.getPendingAmount());

            rows.append("<row r=\"").append(r).append("\">")
                    .append(cellStr(1, r, cName, STYLE_DEFAULT))
                    .append(cellStr(2, r, cDoc, STYLE_CENTER))
                    .append(cellStr(3, r, cPhone, STYLE_CENTER))
                    .append(cellStr(4, r, cAddr, STYLE_DEFAULT))
                    .append(cellStr(5, r, rName, STYLE_DEFAULT))
                    .append(cellStr(6, r, inst.getLoanId(), STYLE_DEFAULT))
                    .append(cellNum(7, r, inst.getInstallmentNumber(), STYLE_CENTER))
                    .append(cellStr(8, r, inst.getDueDate(), STYLE_CENTER))
                    .append(cellNum(9, r, daysOverdue, STYLE_CENTER))
                    .append(cellDec(10, r, inst.getAmount(), STYLE_CURRENCY))
                    .append(cellDec(11, r, inst.getPaidAmount(), STYLE_CURRENCY))
                    .append(cellDec(12, r, inst.getPendingAmount(), STYLE_CURRENCY))
                    .append(cellStr(13, r, risk, riskStyle))
                    .append("</row>");
            r++;
        }

        int lastDataRow = Math.max(4, r - 1);
        rows.append("<row r=\"").append(r).append("\">")
                .append(cellStr(1, r, "TOTAL MORA EXIGIBLE", STYLE_TOTALS_LABEL))
                .append(cellStr(2, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(3, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(4, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(5, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(6, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(7, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(8, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(9, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(10, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(11, r, "", STYLE_TOTALS_LABEL))
                .append(cellDec(12, r, totalOverdue, STYLE_TOTALS_CURRENCY))
                .append(cellStr(13, r, "", STYLE_TOTALS_LABEL))
                .append("</row>");

        return wrapWorksheet(rows.toString(), List.of(26, 16, 16, 28, 18, 20, 10, 16, 12, 16, 16, 16, 18), 4, "M" + lastDataRow, 13);
    }

    private String buildSheet4PaymentHistory(
            List<PaymentEntity> payments,
            Map<String, CustomerEntity> customerMap,
            Map<String, String> userNames
    ) {
        List<PaymentEntity> sortedPayments = payments.stream()
                .sorted(Comparator.comparing(PaymentEntity::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();

        StringBuilder rows = new StringBuilder();
        int r = 1;
        rows.append(rowBanner(r++, "HISTORIAL DETALLADO DE COBROS Y ABONOS DE CLIENTES", STYLE_TITLE_BANNER));
        rows.append(rowBanner(r++, "Registro completo de cobros aplicados y anulaciones auditadas", STYLE_SUBTITLE_BANNER));
        r++;

        List<String> headers = List.of(
                "ID RECIBO", "FECHA / HORA", "CLIENTE", "DOCUMENTO", "ID CRÉDITO",
                "COBRADOR", "MÉTODO PAGO", "MONTO PAGADO", "ESTADO", "MOTIVO ANULACIÓN / OBSERVACIÓN"
        );
        rows.append(rowHeaders(r++, headers));

        BigDecimal sumValidPayments = BigDecimal.ZERO;

        for (PaymentEntity p : sortedPayments) {
            CustomerEntity c = customerMap.get(p.getCustomerId());
            String cName = c != null ? c.getFullName() : "Cliente #" + p.getCustomerId();
            String cDoc = c != null ? c.getDocumentNumber() : "-";
            String colName = userNames.getOrDefault(p.getCollectorId(), p.getCollectorId() != null ? p.getCollectorId() : "-");

            boolean isValid = "APLICADO".equalsIgnoreCase(p.getStatus()) || "REGISTRADO".equalsIgnoreCase(p.getStatus());
            if (isValid) {
                sumValidPayments = sumValidPayments.add(p.getAmount());
            }

            rows.append("<row r=\"").append(r).append("\">")
                    .append(cellStr(1, r, p.getId(), STYLE_DEFAULT))
                    .append(cellStr(2, r, UiLabels.formatDateTime(p.getCreatedAt()), STYLE_CENTER))
                    .append(cellStr(3, r, cName, STYLE_DEFAULT))
                    .append(cellStr(4, r, cDoc, STYLE_CENTER))
                    .append(cellStr(5, r, p.getLoanId(), STYLE_DEFAULT))
                    .append(cellStr(6, r, colName, STYLE_DEFAULT))
                    .append(cellStr(7, r, p.getMethod(), STYLE_CENTER))
                    .append(cellDec(8, r, p.getAmount(), STYLE_CURRENCY))
                    .append(cellStr(9, r, p.getStatus(), isValid ? STYLE_BADGE_GREEN : STYLE_BADGE_RED))
                    .append(cellStr(10, r, p.getAnnulmentReason() != null ? p.getAnnulmentReason() : "-", STYLE_DEFAULT))
                    .append("</row>");
            r++;
        }

        int lastDataRow = Math.max(4, r - 1);
        rows.append("<row r=\"").append(r).append("\">")
                .append(cellStr(1, r, "TOTAL COBRADO VÁLIDO EN FIRME", STYLE_TOTALS_LABEL))
                .append(cellStr(2, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(3, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(4, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(5, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(6, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(7, r, "", STYLE_TOTALS_LABEL))
                .append(cellDec(8, r, sumValidPayments, STYLE_TOTALS_CURRENCY))
                .append(cellStr(9, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(10, r, "", STYLE_TOTALS_LABEL))
                .append("</row>");

        return wrapWorksheet(rows.toString(), List.of(22, 22, 26, 16, 20, 20, 16, 18, 14, 32), 4, "J" + lastDataRow, 10);
    }

    private String buildSheet5DailyCashLedger(
            List<CashMovementEntity> movements,
            List<PaymentEntity> allPayments,
            Map<String, String> routeNames,
            Map<String, String> userNames
    ) {
        var paymentIndex = CashLedger.index(allPayments);
        List<CashMovementEntity> sortedMovements = movements.stream()
                .sorted(Comparator.comparing(CashMovementEntity::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();

        StringBuilder rows = new StringBuilder();
        int r = 1;
        rows.append(rowBanner(r++, "LIBRO DIARIO MAYOR DE CAJA Y TESORERÍA", STYLE_TITLE_BANNER));
        rows.append(rowBanner(r++, "Entradas, desembolsos, gastos operativos de ruta, papelería y ajustes de auditoría", STYLE_SUBTITLE_BANNER));
        r++;

        List<String> headers = List.of(
                "ID MOVIMIENTO", "FECHA / HORA", "RUTA", "USUARIO / COBRADOR",
                "TIPO", "CATEGORÍA CONTABLE", "DESCRIPCIÓN", "REFERENCIA",
                "ENTRADA (+)", "SALIDA (-)"
        );
        rows.append(rowHeaders(r++, headers));

        BigDecimal totalPhysicalIn = BigDecimal.ZERO;
        BigDecimal totalPhysicalOut = BigDecimal.ZERO;

        for (CashMovementEntity m : sortedMovements) {
            boolean isIn = "INGRESO".equalsIgnoreCase(m.getMovementType()) || "ENTRADA".equalsIgnoreCase(m.getMovementType());
            boolean isOut = "EGRESO".equalsIgnoreCase(m.getMovementType()) || "SALIDA".equalsIgnoreCase(m.getMovementType());
            BigDecimal amt = m.getAmount() != null ? m.getAmount() : BigDecimal.ZERO;
            BigDecimal inVal = isIn ? amt : BigDecimal.ZERO;
            BigDecimal outVal = isOut ? amt : BigDecimal.ZERO;

            boolean physical = false;
            try {
                physical = CashLedger.isPhysical(m, paymentIndex);
            } catch (Exception ignored) {}
            boolean excludedFromOperational = "RETIRO_PAPELERIA".equalsIgnoreCase(m.getCategory())
                    || "DESCUENTO_NOMINA_DESCUADRE".equalsIgnoreCase(m.getCategory());
            if (physical && !excludedFromOperational) {
                totalPhysicalIn = totalPhysicalIn.add(inVal);
                totalPhysicalOut = totalPhysicalOut.add(outVal);
            }

            String rName = m.getRouteId() != null ? routeNames.getOrDefault(m.getRouteId(), m.getRouteId()) : "-";
            String uName = m.getCollectorId() != null ? userNames.getOrDefault(m.getCollectorId(), m.getCollectorId()) : "-";
            String typeLabel = isIn ? "INGRESO" : (isOut ? "EGRESO" : (m.getMovementType() != null ? m.getMovementType() : "-"));

            rows.append("<row r=\"").append(r).append("\">")
                    .append(cellStr(1, r, m.getId(), STYLE_DEFAULT))
                    .append(cellStr(2, r, UiLabels.formatDateTime(m.getCreatedAt()), STYLE_CENTER))
                    .append(cellStr(3, r, rName, STYLE_DEFAULT))
                    .append(cellStr(4, r, uName, STYLE_DEFAULT))
                    .append(cellStr(5, r, typeLabel, isIn ? STYLE_BADGE_GREEN : STYLE_BADGE_RED))
                    .append(cellStr(6, r, UiLabels.cashCategory(m.getCategory()), STYLE_DEFAULT))
                    .append(cellStr(7, r, m.getDescription(), STYLE_DEFAULT))
                    .append(cellStr(8, r, m.getReferenceId() != null ? m.getReferenceId() : "-", STYLE_DEFAULT))
                    .append(cellDec(9, r, inVal, STYLE_CURRENCY))
                    .append(cellDec(10, r, outVal, STYLE_CURRENCY))
                    .append("</row>");
            r++;
        }

        NumberFormat copFmt = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
        copFmt.setMaximumFractionDigits(0);
        int lastDataRow = Math.max(4, r - 1);
        rows.append("<row r=\"").append(r).append("\">")
                .append(cellStr(1, r, "TOTALES EFECTIVO FÍSICO (NETO: " + copFmt.format(totalPhysicalIn.subtract(totalPhysicalOut)) + ")", STYLE_TOTALS_LABEL))
                .append(cellStr(2, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(3, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(4, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(5, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(6, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(7, r, "", STYLE_TOTALS_LABEL))
                .append(cellStr(8, r, "", STYLE_TOTALS_LABEL))
                .append(cellDec(9, r, totalPhysicalIn, STYLE_TOTALS_CURRENCY))
                .append(cellDec(10, r, totalPhysicalOut, STYLE_TOTALS_CURRENCY))
                .append("</row>");

        return wrapWorksheet(rows.toString(), List.of(22, 22, 18, 20, 14, 24, 38, 20, 18, 18), 4, "J" + lastDataRow, 10);
    }

    private String wrapWorksheet(String sheetDataRows, List<Integer> colWidths, int headerRow, String lastAutoFilterCell, int bannerColSpan) {
        StringBuilder sb = new StringBuilder();
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n");
        sb.append("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">\n");
        sb.append("  <sheetViews><sheetView workbookViewId=\"0\">");
        sb.append("<pane ySplit=\"").append(headerRow).append("\" topLeftCell=\"A").append(headerRow + 1).append("\" activePane=\"bottomLeft\" state=\"frozen\"/>");
        sb.append("</sheetView></sheetViews>\n");
        sb.append("  <cols>\n");
        for (int i = 0; i < colWidths.size(); i++) {
            int colIdx = i + 1;
            sb.append("    <col min=\"").append(colIdx).append("\" max=\"").append(colIdx)
                    .append("\" width=\"").append(colWidths.get(i)).append("\" customWidth=\"1\"/>\n");
        }
        sb.append("  </cols>\n");
        sb.append("  <sheetData>\n").append(sheetDataRows).append("  </sheetData>\n");
        sb.append("  <autoFilter ref=\"A").append(headerRow).append(":").append(lastAutoFilterCell).append("\"/>\n");
        if (bannerColSpan > 1) {
            String endCol = colLetter(bannerColSpan);
            sb.append("  <mergeCells count=\"2\">\n");
            sb.append("    <mergeCell ref=\"A1:").append(endCol).append("1\"/>\n");
            sb.append("    <mergeCell ref=\"A2:").append(endCol).append("2\"/>\n");
            sb.append("  </mergeCells>\n");
        }
        sb.append("</worksheet>");
        return sb.toString();
    }

    private String rowBanner(int rowNum, String text, int style) {
        return "<row r=\"" + rowNum + "\" ht=\"24\" customHeight=\"1\">" + cellStr(1, rowNum, text, style) + "</row>\n";
    }

    private String rowHeaders(int rowNum, List<String> headers) {
        StringBuilder sb = new StringBuilder("<row r=\"").append(rowNum).append("\" ht=\"24\" customHeight=\"1\">");
        for (int i = 0; i < headers.size(); i++) {
            sb.append(cellStr(i + 1, rowNum, headers.get(i), STYLE_HEADER_NAVY));
        }
        sb.append("</row>\n");
        return sb.toString();
    }

    private String rowKpiCurrency(int rowNum, String label, BigDecimal val, String note, int noteStyle) {
        return "<row r=\"" + rowNum + "\">" +
                cellStr(1, rowNum, label, STYLE_DEFAULT) +
                cellDec(2, rowNum, val, STYLE_CURRENCY) +
                cellStr(3, rowNum, note, noteStyle) +
                "</row>\n";
    }

    private String rowKpiPercent(int rowNum, String label, BigDecimal ratio, String note) {
        return "<row r=\"" + rowNum + "\">" +
                cellStr(1, rowNum, label, STYLE_DEFAULT) +
                cellDec(2, rowNum, ratio, STYLE_PERCENT) +
                cellStr(3, rowNum, note, STYLE_DEFAULT) +
                "</row>\n";
    }

    private String cellStr(int colIdx, int rowNum, String val, int style) {
        String ref = colLetter(colIdx) + rowNum;
        String safe = escapeXml(val != null ? val : "");
        return "<c r=\"" + ref + "\" s=\"" + style + "\" t=\"inlineStr\"><is><t>" + safe + "</t></is></c>";
    }

    private String cellDec(int colIdx, int rowNum, BigDecimal val, int style) {
        String ref = colLetter(colIdx) + rowNum;
        BigDecimal v = val != null ? val : BigDecimal.ZERO;
        return "<c r=\"" + ref + "\" s=\"" + style + "\"><v>" + v.toPlainString() + "</v></c>";
    }

    private String cellNum(int colIdx, int rowNum, long val, int style) {
        String ref = colLetter(colIdx) + rowNum;
        return "<c r=\"" + ref + "\" s=\"" + style + "\"><v>" + val + "</v></c>";
    }

    private static String colLetter(int colIdx) {
        StringBuilder sb = new StringBuilder();
        int n = colIdx;
        while (n > 0) {
            int rem = (n - 1) % 26;
            sb.insert(0, (char) ('A' + rem));
            n = (n - 1) / 26;
        }
        return sb.toString();
    }

    private static String escapeXml(String input) {
        if (input == null || input.isEmpty()) return "";
        StringBuilder out = new StringBuilder(input.length());
        for (int i = 0; i < input.length(); i++) {
            char c = input.charAt(i);
            // Eliminar caracteres de control ilegales en XML 1.0 para evitar corrupción de .xlsx
            if (c < 0x20 && c != '\t' && c != '\n' && c != '\r') {
                continue;
            }
            switch (c) {
                case '&' -> out.append("&amp;");
                case '<' -> out.append("&lt;");
                case '>' -> out.append("&gt;");
                case '"' -> out.append("&quot;");
                case '\'' -> out.append("&apos;");
                default -> out.append(c);
            }
        }
        return out.toString();
    }
}
