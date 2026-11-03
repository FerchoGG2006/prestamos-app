package com.cartera.ui;

import javafx.application.Application;

import java.time.ZoneId;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Standard JVM entry point for packaging and distribution.
 * Having a main method in a class that does NOT extend javafx.application.Application
 * allows the Java launcher to start JavaFX from the classpath without requiring module-path flags.
 */
public final class CarteraMain {

    public static final ZoneId APP_ZONE_ID = ZoneId.of("America/Bogota");
    public static final Locale APP_LOCALE = Locale.forLanguageTag("es-CO");

    private CarteraMain() {}

    public static void configureRegionalDefaults() {
        TimeZone.setDefault(TimeZone.getTimeZone(APP_ZONE_ID));
        Locale.setDefault(APP_LOCALE);
    }

    public static void main(String[] args) {
        configureRegionalDefaults();
        Application.launch(CarteraApplication.class, args);
    }
}
