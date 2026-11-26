package com.cartera.receipts.application;

import com.cartera.infrastructure.licensing.OfficeLicensingService;
import com.cartera.infrastructure.licensing.SupabaseRegistryClient;
import com.cartera.infrastructure.persistence.entity.InstallmentEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.entity.PaymentEntity;
import com.cartera.ui.util.WhatsAppReceiptUtil;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.CompletableFuture;

/**
 * Servicio de emisión, publicación inmutable en la nube (Supabase) y cálculo de saldo histórico
 * para comprobantes oficiales verificables (Pagos, Préstamos Nuevos y Renovaciones).
 */
@Service
public class OfficialReceiptService {

    private static final Logger LOG = LoggerFactory.getLogger(OfficialReceiptService.class);
    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");
    private static final DateTimeFormatter DISPLAY_FMT = DateTimeFormatter.ofPattern("dd/MM/yy HH:mm:ss");
    private static volatile OfficialReceiptService INSTANCE;

    public record DetailRow(String label, String value, boolean highlight, boolean danger) {
        public static DetailRow normal(String label, String value) { return new DetailRow(label, value, false, false); }
        public static DetailRow highlight(String label, String value) { return new DetailRow(label, value, true, false); }
        public static DetailRow danger(String label, String value) { return new DetailRow(label, value, false, true); }
    }

    public record OfficialReceiptModel(
            String receiptCode,
            String receiptType, // PAYMENT | LOAN | RENEWAL
            String entityId,
            String companyName,
            String routeName,
            String customerName,
            String customerDocument,
            String customerPhone,
            String loanNumber,
            BigDecimal amount,
            String status, // APPROVED | REVERSED | CANCELLED
            String issuedAtDisplay,
            String subtitle,
            String installmentLabel,
            BigDecimal installmentAmount,
            BigDecimal remainingBalance,
            String paymentMethod,
            BigDecimal principal,
            BigDecimal totalAgreed,
            int installmentCount,
            String frequencyLabel,
            BigDecimal paperworkFee,
            BigDecimal netCashDelivered,
            BigDecimal previousBalanceDeducted,
            String firstDueDate,
            String fixedDueDate,
            String collectorName,
            String footerMessage,
            boolean cloudVerified
    ) {
        public String title() {
            return switch (receiptType != null ? receiptType.toUpperCase() : "PAYMENT") {
                case "LOAN" -> "Comprobante de préstamo";
                case "RENEWAL" -> "Comprobante de renovación";
                default -> "Comprobante de pago";
            };
        }

        public OfficialReceiptModel withCloudCode(String code, String remoteStatus) {
            boolean verified = code != null && code.startsWith("KRD-");
            return new OfficialReceiptModel(
                    verified ? code : receiptCode,
                    receiptType,
                    entityId,
                    companyName,
                    routeName,
                    customerName,
                    customerDocument,
                    customerPhone,
                    loanNumber,
                    amount,
                    (remoteStatus != null && !remoteStatus.isBlank()) ? remoteStatus : status,
                    issuedAtDisplay,
                    subtitle,
                    installmentLabel,
                    installmentAmount,
                    remainingBalance,
                    paymentMethod,
                    principal,
                    totalAgreed,
                    installmentCount,
                    frequencyLabel,
                    paperworkFee,
                    netCashDelivered,
                    previousBalanceDeducted,
                    firstDueDate,
                    fixedDueDate,
                    collectorName,
                    footerMessage,
                    verified
            );
        }

        public List<DetailRow> buildDetailRows() {
            List<DetailRow> rows = new ArrayList<>();
            rows.add(DetailRow.normal("Fecha y hora", issuedAtDisplay != null && !issuedAtDisplay.isBlank() ? issuedAtDisplay : nowDisplay()));
            rows.add(DetailRow.normal("Cliente", customerName != null && !customerName.isBlank() ? customerName : "Cliente"));
            if (routeName != null && !routeName.isBlank()) {
                rows.add(DetailRow.normal("Ruta", routeName));
            }
            if (loanNumber != null && !loanNumber.isBlank()) {
                rows.add(DetailRow.normal("Crédito", loanNumber));
            }

            String type = receiptType != null ? receiptType.toUpperCase() : "PAYMENT";
            if ("PAYMENT".equals(type)) {
                if (installmentLabel != null && !installmentLabel.isBlank()) {
                    rows.add(DetailRow.normal("Cuota", installmentLabel));
                }
                if (installmentAmount != null && installmentAmount.compareTo(BigDecimal.ZERO) > 0) {
                    rows.add(DetailRow.normal("Valor cuota", WhatsAppReceiptUtil.formatCurrencyPlain(installmentAmount)));
                }
                if (paymentMethod != null && !paymentMethod.isBlank()) {
                    rows.add(DetailRow.normal("Medio de pago", normalizeMethodLabel(paymentMethod)));
                }
                BigDecimal rem = remainingBalance != null ? remainingBalance.max(BigDecimal.ZERO) : BigDecimal.ZERO;
                rows.add(DetailRow.highlight("Saldo pendiente",
                        rem.compareTo(BigDecimal.ZERO) <= 0 ? "$ 0 (Cancelado)" : WhatsAppReceiptUtil.formatCurrencyPlain(rem)));
            } else if ("LOAN".equals(type)) {
                if (frequencyLabel != null && !frequencyLabel.isBlank()) {
                    String plazo = (fixedDueDate != null && !fixedDueDate.isBlank())
                            ? "Fecha fija (" + fixedDueDate + ")"
                            : installmentCount + " cuotas (" + frequencyLabel + ")";
                    rows.add(DetailRow.normal("Modalidad", plazo));
                }
                if (principal != null) {
                    rows.add(DetailRow.normal("Capital prestado", WhatsAppReceiptUtil.formatCurrencyPlain(principal)));
                }
                if (paperworkFee != null && paperworkFee.compareTo(BigDecimal.ZERO) > 0) {
                    rows.add(DetailRow.normal("Papelería", "- " + WhatsAppReceiptUtil.formatCurrencyPlain(paperworkFee)));
                }
                if (netCashDelivered != null) {
                    rows.add(DetailRow.highlight("Efectivo entregado", WhatsAppReceiptUtil.formatCurrencyPlain(netCashDelivered)));
                }
                if (totalAgreed != null) {
                    rows.add(DetailRow.highlight("Total a pagar", WhatsAppReceiptUtil.formatCurrencyPlain(totalAgreed)));
                }
                if (installmentAmount != null && installmentAmount.compareTo(BigDecimal.ZERO) > 0) {
                    rows.add(DetailRow.normal("Valor cuota", WhatsAppReceiptUtil.formatCurrencyPlain(installmentAmount)));
                }
                if (firstDueDate != null && !firstDueDate.isBlank()) {
                    rows.add(DetailRow.normal("Primer cobro", firstDueDate));
                }
            } else if ("RENEWAL".equals(type)) {
                if (principal != null) {
                    rows.add(DetailRow.normal("Nuevo capital", WhatsAppReceiptUtil.formatCurrencyPlain(principal)));
                }
                if (previousBalanceDeducted != null && previousBalanceDeducted.compareTo(BigDecimal.ZERO) > 0) {
                    rows.add(DetailRow.normal("Saldo anterior liquidado", "- " + WhatsAppReceiptUtil.formatCurrencyPlain(previousBalanceDeducted)));
                }
                if (paperworkFee != null && paperworkFee.compareTo(BigDecimal.ZERO) > 0) {
                    rows.add(DetailRow.normal("Papelería", "- " + WhatsAppReceiptUtil.formatCurrencyPlain(paperworkFee)));
                }
                BigDecimal net = netCashDelivered != null ? netCashDelivered : (amount != null ? amount : BigDecimal.ZERO);
                rows.add(DetailRow.highlight("Efectivo entregado", WhatsAppReceiptUtil.formatCurrencyPlain(net)));
                if (totalAgreed != null) {
                    rows.add(DetailRow.highlight("Nuevo total a pagar", WhatsAppReceiptUtil.formatCurrencyPlain(totalAgreed)));
                }
                if (installmentAmount != null && installmentAmount.compareTo(BigDecimal.ZERO) > 0) {
                    String cuotaTxt = (fixedDueDate != null && !fixedDueDate.isBlank())
                            ? "Fecha fija (" + fixedDueDate + ")"
                            : WhatsAppReceiptUtil.formatCurrencyPlain(installmentAmount) + " (" + installmentCount + " " + (frequencyLabel != null ? frequencyLabel : "") + ")";
                    rows.add(DetailRow.normal("Nueva cuota", cuotaTxt.trim()));
                }
            }

            rows.add(DetailRow.normal("Código verificación", receiptCode != null ? receiptCode : "LOCAL"));
            return rows;
        }
    }

    private final OfficeLicensingService licensingService;
    private final SupabaseRegistryClient registryClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public OfficialReceiptService(OfficeLicensingService licensingService, SupabaseRegistryClient registryClient) {
        this.licensingService = licensingService;
        this.registryClient = registryClient;
        INSTANCE = this;
    }

    public static OfficialReceiptService getInstance() {
        return INSTANCE;
    }

    /**
     * Publica el comprobante en Supabase si hay sesión de nube activa; si falla o no hay internet, devuelve el borrador local.
     */
    public static OfficialReceiptModel publishOrFallback(OfficialReceiptModel draft) {
        OfficialReceiptService svc = INSTANCE;
        if (svc == null || draft == null) {
            return draft;
        }
        return svc.publish(draft);
    }

    public OfficialReceiptModel publish(OfficialReceiptModel draft) {
        if (draft == null) return null;
        try {
            String url = licensingService.getSupabaseUrl();
            String key = licensingService.getSupabaseKey();
            if (url == null || url.isBlank() || key == null || key.isBlank()) {
                return draft;
            }
            if (registryClient.getActiveSessionToken() == null || registryClient.getActiveSessionToken().isBlank()) {
                return draft;
            }

            ObjectNode payload = objectMapper.createObjectNode();
            if (draft.subtitle() != null) payload.put("subtitle", draft.subtitle());
            if (draft.paymentMethod() != null) payload.put("paymentMethod", normalizeMethodLabel(draft.paymentMethod()));
            if (draft.installmentLabel() != null) payload.put("installmentLabel", draft.installmentLabel());
            if (draft.installmentAmount() != null) payload.put("installmentAmount", draft.installmentAmount().setScale(0, RoundingMode.HALF_UP));
            if (draft.remainingBalance() != null) {
                BigDecimal rem = draft.remainingBalance().max(BigDecimal.ZERO).setScale(0, RoundingMode.HALF_UP);
                payload.put("remainingBalance", rem);
                payload.put("isPaidOff", rem.compareTo(BigDecimal.ZERO) <= 0);
            }
            if (draft.principal() != null) payload.put("principal", draft.principal().setScale(0, RoundingMode.HALF_UP));
            if (draft.totalAgreed() != null) payload.put("totalAgreed", draft.totalAgreed().setScale(0, RoundingMode.HALF_UP));
            if (draft.installmentCount() > 0) payload.put("installmentCount", draft.installmentCount());
            if (draft.frequencyLabel() != null) payload.put("frequencyLabel", draft.frequencyLabel());
            if (draft.paperworkFee() != null) payload.put("paperworkFee", draft.paperworkFee().setScale(0, RoundingMode.HALF_UP));
            if (draft.netCashDelivered() != null) payload.put("netCashDelivered", draft.netCashDelivered().setScale(0, RoundingMode.HALF_UP));
            if (draft.previousBalanceDeducted() != null) payload.put("previousBalanceDeducted", draft.previousBalanceDeducted().setScale(0, RoundingMode.HALF_UP));
            if (draft.firstDueDate() != null && !draft.firstDueDate().isBlank()) payload.put("firstDueDate", draft.firstDueDate());
            if (draft.fixedDueDate() != null && !draft.fixedDueDate().isBlank()) payload.put("fixedDueDate", draft.fixedDueDate());
            if (draft.collectorName() != null) payload.put("collectorName", draft.collectorName());
            if (draft.footerMessage() != null && !draft.footerMessage().isBlank()) payload.put("footerMessage", draft.footerMessage());

            JsonNode res = registryClient.issueOfficialReceipt(
                    url,
                    key,
                    draft.receiptType(),
                    draft.entityId(),
                    draft.companyName(),
                    draft.routeName(),
                    draft.customerName(),
                    draft.customerDocument(),
                    draft.loanNumber(),
                    draft.amount(),
                    draft.issuedAtDisplay(),
                    payload
            );
            if (res != null && res.path("ok").asBoolean(false)) {
                JsonNode rec = res.path("receipt");
                String code = rec.path("receipt_code").asText("");
                String status = rec.path("status").asText("APPROVED");
                if (!code.isBlank()) {
                    return draft.withCloudCode(code, status);
                }
            }
        } catch (Exception ex) {
            LOG.warn("No se pudo publicar comprobante en nube (usando respaldo local): {}", ex.getMessage());
        }
        return draft;
    }

    public static void voidReceiptAsync(String receiptType, String entityId, String newStatus) {
        OfficialReceiptService svc = INSTANCE;
        if (svc == null || entityId == null || entityId.isBlank()) return;
        CompletableFuture.runAsync(() -> {
            try {
                String url = svc.licensingService.getSupabaseUrl();
                String key = svc.licensingService.getSupabaseKey();
                if (url != null && !url.isBlank() && key != null && !key.isBlank()) {
                    svc.registryClient.voidOfficialReceipt(url, key, receiptType, entityId, newStatus);
                }
            } catch (Exception ignored) {}
        });
    }

    /**
     * Calcula el saldo restante HISTÓRICO exacto inmediatamente después de `targetPayment` usando BigDecimal.
     * Evita que pagos anteriores de créditos renovados o liquidados después muestren $0 erróneamente.
     */
    public static BigDecimal calculateHistoricalRemainingBalance(
            LoanEntity loan,
            List<InstallmentEntity> loanInstallments,
            List<PaymentEntity> allLoanPayments,
            PaymentEntity targetPayment
    ) {
        if (loan == null || targetPayment == null) return BigDecimal.ZERO;
        BigDecimal totalAgreed = loan.getTotalAgreed() != null ? loan.getTotalAgreed() : BigDecimal.ZERO;

        List<PaymentEntity> validPayments = new ArrayList<>();
        if (allLoanPayments != null) {
            for (PaymentEntity p : allLoanPayments) {
                if (p == null) continue;
                String st = p.getStatus() != null ? p.getStatus().toUpperCase() : "COMPLETED";
                if (!"REVERSED".equals(st) && !"ANNULLED".equals(st)) {
                    validPayments.add(p);
                }
            }
        }
        validPayments.sort(Comparator
                .comparing((PaymentEntity p) -> p.getCreatedAt() != null ? p.getCreatedAt() : "")
                .thenComparing(p -> p.getId() != null ? p.getId() : ""));

        int targetIdx = -1;
        for (int i = 0; i < validPayments.size(); i++) {
            if (targetPayment.getId() != null && targetPayment.getId().equals(validPayments.get(i).getId())) {
                targetIdx = i;
                break;
            }
        }

        String loanStatus = loan.getStatus() != null ? loan.getStatus().toUpperCase() : "ACTIVE";
        if ("RENEWED".equals(loanStatus) || "RENOVADO".equals(loanStatus) || "CANCELLED".equals(loanStatus)) {
            BigDecimal paidUpToTarget = BigDecimal.ZERO;
            if (targetIdx >= 0) {
                for (int i = 0; i <= targetIdx; i++) {
                    BigDecimal amt = validPayments.get(i).getAmount();
                    if (amt != null) paidUpToTarget = paidUpToTarget.add(amt);
                }
            } else if (targetPayment.getAmount() != null) {
                paidUpToTarget = targetPayment.getAmount();
            }
            return totalAgreed.subtract(paidUpToTarget).max(BigDecimal.ZERO);
        }

        BigDecimal currentRem = BigDecimal.ZERO;
        if (loanInstallments != null && !loanInstallments.isEmpty()) {
            for (InstallmentEntity inst : loanInstallments) {
                if (inst.getPendingAmount() != null && inst.getPendingAmount().compareTo(BigDecimal.ZERO) > 0) {
                    currentRem = currentRem.add(inst.getPendingAmount());
                }
            }
        } else {
            BigDecimal totalPaid = validPayments.stream()
                    .map(p -> p.getAmount() != null ? p.getAmount() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            currentRem = totalAgreed.subtract(totalPaid).max(BigDecimal.ZERO);
        }

        BigDecimal laterPayments = BigDecimal.ZERO;
        if (targetIdx >= 0) {
            for (int i = targetIdx + 1; i < validPayments.size(); i++) {
                BigDecimal amt = validPayments.get(i).getAmount();
                if (amt != null) laterPayments = laterPayments.add(amt);
            }
        }

        BigDecimal historical = currentRem.add(laterPayments).max(BigDecimal.ZERO);
        return totalAgreed.compareTo(BigDecimal.ZERO) > 0 ? historical.min(totalAgreed) : historical;
    }

    public static String nowDisplay() {
        return LocalDateTime.now(BOGOTA).format(DISPLAY_FMT);
    }

    public static String formatIsoToDisplay(String raw) {
        if (raw == null || raw.isBlank()) return nowDisplay();
        try {
            return Instant.parse(raw.trim()).atZone(BOGOTA).format(DISPLAY_FMT);
        } catch (Exception ignored) {
            return raw.trim();
        }
    }

    public static String localCode(String entityId) {
        if (entityId == null || entityId.isBlank()) return "LOCAL-0001";
        String clean = entityId.replaceAll("[^a-zA-Z0-9]", "").toUpperCase();
        if (clean.length() > 8) clean = clean.substring(clean.length() - 8);
        return "LOCAL-" + (clean.isEmpty() ? "0001" : clean);
    }

    public static String normalizeMethodLabel(String method) {
        if (method == null) return "Efectivo";
        return switch (method.trim().toUpperCase()) {
            case "NEQUI" -> "Nequi";
            case "TRANSFER", "TRANSFERENCIA" -> "Transferencia";
            case "OTHER", "OTRO" -> "Otro";
            default -> "Efectivo";
        };
    }

    public static String normalizeFrequencyLabel(String freq) {
        if (freq == null) return "Diario";
        return switch (freq.trim().toUpperCase()) {
            case "WEEKLY", "SEMANAL" -> "Semanal";
            case "BIWEEKLY", "QUINCENAL" -> "Quincenal";
            case "MONTHLY", "MENSUAL" -> "Mensual";
            case "FIXED_DATE", "FECHA FIJA", "FECHA_FIJA" -> "Fecha Fija";
            default -> "Diario";
        };
    }
}
