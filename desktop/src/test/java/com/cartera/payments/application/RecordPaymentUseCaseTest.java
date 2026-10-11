package com.cartera.payments.application;

import com.cartera.collections.application.TodayCollectionsService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class RecordPaymentUseCaseTest {
    @Autowired
    private RecordPaymentUseCase recordPaymentUseCase;

    @Autowired
    private TodayCollectionsService collectionsService;

    @Test
    void testExecutePaymentSuccessfully() {
        LocalDate today = LocalDate.now();
        var items = collectionsService.getTodayCollectionItems(today);
        assertFalse(items.isEmpty(), "Debe haber clientes inicializados");

        var firstPending = items.stream().filter(i -> !i.isPaidToday()).findFirst().orElseThrow();
        BigDecimal amountToPay = firstPending.installmentPending();

        String idempotencyKey = UUID.randomUUID().toString();
        var command = new RecordPaymentUseCase.RecordPaymentCommand(
                firstPending.loanId(),
                amountToPay,
                "EFECTIVO",
                "usr-col-1",
                today,
                idempotencyKey
        );

        var result = recordPaymentUseCase.execute(command);
        assertNotNull(result.paymentId());
        assertEquals(amountToPay, result.allocatedAmount());
        assertTrue(result.installmentsAffectedCount() >= 1);

        // Test de idempotencia: si enviamos la misma clave, no debe duplicar el cobro
        var repeatResult = recordPaymentUseCase.execute(command);
        assertEquals(result.paymentId(), repeatResult.paymentId());

        // Verificar que las métricas del día reflejen el cobro
        var metrics = collectionsService.getDailyMetrics(today);
        assertTrue(metrics.collectedToday().compareTo(BigDecimal.ZERO) > 0);
    }
}
