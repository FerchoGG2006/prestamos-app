package com.cartera.ui.util;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class MotionUtilTest {
    @Test void motionUtilitiesCanInitializeWithoutCrashingApplication() {
        assertDoesNotThrow(() -> MotionUtil.OVERSHOOT.interpolate(0.0, 1.0, 0.5));
        assertEquals(0.0, MotionUtil.OVERSHOOT.interpolate(0.0, 1.0, 0.0));
        assertEquals(1.0, MotionUtil.OVERSHOOT.interpolate(0.0, 1.0, 1.0));
    }
}
