package co.kredia.desktop.domain;

import co.kredia.desktop.domain.FinancialModels.InstallmentRecord;
import java.math.BigDecimal;
import java.util.List;

/**
 * Regla Financiera (AGENTS.md):
 * "Do not invent delinquency rules. Keep its calculator/configuration abstract until the business provides the formula."
 *
 * Esta interfaz mantiene abstracto el calculo de mora/recargos para que la formula de negocio
 * sea inyectable y configurable sin acoplarla al libro mayor.
 */
public interface DelinquencyCalculator {

    record DelinquencyEvaluation(
            boolean hasOverdueInstallments,
            int overdueInstallmentsCount,
            BigDecimal overdueInstallmentsBalance,
            BigDecimal configuredSurchargeAmount
    ) {}

    DelinquencyEvaluation evaluate(List<InstallmentRecord> installments, String operatingDate);

    /**
     * Implementacion base que contabiliza unicamente las cuotas cuya fecha de vencimiento
     * es anterior a la fecha operativa y mantienen saldo pendiente > 0, manteniendo el recargo
     * adicional en BigDecimal.ZERO hasta que el negocio provea una formula de mora especifica.
     */
    final class FactualOverdueObservationalCalculator implements DelinquencyCalculator {
        @Override
        public DelinquencyEvaluation evaluate(List<InstallmentRecord> installments, String operatingDate) {
            int count = 0;
            BigDecimal balance = BigDecimal.ZERO;
            for (InstallmentRecord inst : installments) {
                if (inst.pendingAmount().compareTo(BigDecimal.ZERO) > 0
                        && inst.dueDate().compareTo(operatingDate) < 0) {
                    count++;
                    balance = balance.add(inst.pendingAmount());
                }
            }
            return new DelinquencyEvaluation(count > 0, count, balance, BigDecimal.ZERO);
        }
    }
}
