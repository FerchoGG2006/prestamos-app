package com.cartera.ui.util;

import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import static org.junit.jupiter.api.Assertions.*;

class CurrencyInputUtilTest {

    @Test
    void parsesColombianThousandsAndPlainAmountsCorrectly() {
        assertEquals(new BigDecimal("300000"), CurrencyInputUtil.parseAmount("300000"));
        assertEquals(new BigDecimal("300000"), CurrencyInputUtil.parseAmount("300.000"));
        assertEquals(new BigDecimal("300000"), CurrencyInputUtil.parseAmount("$ 300.000"));
        assertEquals(new BigDecimal("300000"), CurrencyInputUtil.parseAmount("300,000"));
        assertEquals(new BigDecimal("1500000"), CurrencyInputUtil.parseAmount("1.500.000"));
        assertEquals(new BigDecimal("1500000"), CurrencyInputUtil.parseAmount("$ 1,500,000"));
        assertEquals(new BigDecimal("20.5"), CurrencyInputUtil.parseAmount("20.5"));
        assertEquals(new BigDecimal("15000.50"), CurrencyInputUtil.parseAmount("15.000,50"));
        assertEquals(BigDecimal.ZERO, CurrencyInputUtil.parseAmount(""));
        assertEquals(BigDecimal.ZERO, CurrencyInputUtil.parseAmount(null));
    }

    @Test
    void parseRequiredAmountThrowsOnBlank() {
        assertThrows(NumberFormatException.class, () -> CurrencyInputUtil.parseRequiredAmount(""));
        assertThrows(NumberFormatException.class, () -> CurrencyInputUtil.parseRequiredAmount("   "));
        assertThrows(NumberFormatException.class, () -> CurrencyInputUtil.parseRequiredAmount(null));
        assertEquals(new BigDecimal("15000"), CurrencyInputUtil.parseRequiredAmount("$ 15.000"));
    }
}
