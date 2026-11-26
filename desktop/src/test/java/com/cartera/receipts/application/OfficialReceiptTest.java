package com.cartera.receipts.application;

import com.cartera.infrastructure.persistence.entity.InstallmentEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.entity.PaymentEntity;
import com.cartera.receipts.application.OfficialReceiptService.OfficialReceiptModel;
import com.cartera.ui.util.OfficialReceiptPdfGenerator;
import com.cartera.ui.util.WhatsAppReceiptUtil;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class OfficialReceiptTest {

    @Test
    void historicalRemainingBalanceOnRenewedLoanNeverShowsZeroForPastPayment() {
        LoanEntity renewedLoan = new LoanEntity();
        renewedLoan.setId("loan-ren-1");
        renewedLoan.setTotalAgreed(new BigDecimal("600000"));
        renewedLoan.setInstallmentCount(40);
        renewedLoan.setStatus("RENEWED");

        List<InstallmentEntity> zeroedInstallments = new ArrayList<>();
        for (int i = 1; i <= 40; i++) {
            InstallmentEntity inst = new InstallmentEntity();
            inst.setId("inst-" + i);
            inst.setLoanId("loan-ren-1");
            inst.setInstallmentNumber(i);
            inst.setAmount(new BigDecimal("15000"));
            inst.setPaidAmount(new BigDecimal("15000"));
            inst.setStatus("PAGADA");
            zeroedInstallments.add(inst);
        }

        List<PaymentEntity> payments = new ArrayList<>();
        for (int i = 1; i <= 17; i++) {
            PaymentEntity p = new PaymentEntity();
            p.setId("pay-" + String.format("%02d", i));
            p.setLoanId("loan-ren-1");
            p.setAmount(new BigDecimal("15000"));
            p.setStatus("COMPLETED");
            p.setCreatedAt("2026-11-" + String.format("%02d", i) + "T10:00:00Z");
            payments.add(p);
        }

        PaymentEntity pay17 = payments.get(16);
        BigDecimal histBalance = OfficialReceiptService.calculateHistoricalRemainingBalance(
                renewedLoan, zeroedInstallments, payments, pay17);

        assertEquals(0, new BigDecimal("345000").compareTo(histBalance),
                "Pago #17 de 40 en crédito renovado debe preservar saldo histórico exacto de $345.000");
    }

    @Test
    void pdfGeneratorEmbedsKrediaLogoAndVerifiedFields() {
        OfficialReceiptModel receipt = new OfficialReceiptModel(
                "KRD-261126-ABCDEF12",
                "PAYMENT",
                "pay-17",
                "Inversiones FBV",
                "Ruta 1",
                "María José Pérez",
                "1045678901",
                "3009876543",
                "#00040",
                new BigDecimal("15000"),
                "APPROVED",
                "26/11/26 07:30:00",
                "Pago de cuota · Cuota 17 de 40",
                "Cuota 17 de 40",
                new BigDecimal("15000"),
                new BigDecimal("345000"),
                "EFECTIVO",
                null,
                null,
                0,
                "",
                null,
                null,
                null,
                "",
                "",
                "Carlos Ruiz",
                "Gracias por su pago puntual",
                true
        );

        byte[] pdf = OfficialReceiptPdfGenerator.generatePdf(receipt);
        String latin1 = new String(pdf, StandardCharsets.ISO_8859_1);

        assertTrue(latin1.startsWith("%PDF-1.4"), "Debe ser PDF 1.4 válido");
        assertTrue(latin1.trim().endsWith("%%EOF"), "Debe cerrar con %%EOF");
        assertTrue(latin1.contains("/Filter /DCTDecode"), "Debe incrustar el logo JPEG de Kredia");
        assertTrue(latin1.contains("INVERSIONES FBV"), "Debe incluir el nombre de la oficina arriba");
        assertTrue(latin1.contains("Comprobante oficial verificado por"), "Debe incluir el footer de Kredia");
        assertTrue(latin1.contains("KRD-261126-ABCDEF12"), "Debe mostrar el código oficial");

        String waMsg = WhatsAppReceiptUtil.formatOfficialReceiptWhatsAppMessage(receipt);
        assertTrue(waMsg.contains("https://cartera-movil.expo.app/?r=KRD-261126-ABCDEF12"));
        assertFalse(waMsg.contains("15.000"), "El mensaje antifraude en la nube no debe llevar cifras editables");
    }

    @Test
    void shortenedAccountStatementAndSettlementHaveCleanFormatting() {
        String statement = WhatsAppReceiptUtil.formatAccountStatement(
                "Inversiones FBV", "Juan", "123", "loan-1",
                new BigDecimal("500000"), new BigDecimal("600000"),
                new BigDecimal("150000"), new BigDecimal("450000"),
                10, 40, 2, "2026-11-27"
        );
        assertFalse(statement.contains("\u00A0"));
        assertTrue(statement.contains("Mora:"));
        assertTrue(statement.split("\n").length <= 5);

        String cuadre = WhatsAppReceiptUtil.generateDailySettlementMessage(
                "Inversiones FBV", "Ruta 1", "2026-11-26", "Carlos",
                new BigDecimal("450000"), new BigDecimal("380000"), new BigDecimal("70000"),
                new BigDecimal("200000"), new BigDecimal("20000"), new BigDecimal("410000"),
                true, new BigDecimal("410000"), BigDecimal.ZERO,
                BigDecimal.ZERO, new BigDecimal("410000"), "", ""
        );
        assertFalse(cuadre.contains("━━━━━━━━━━"));
        assertTrue(cuadre.split("\n").length <= 9);
    }
}
