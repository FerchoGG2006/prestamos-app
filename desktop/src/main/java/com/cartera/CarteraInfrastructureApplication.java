package com.cartera;

import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.time.ZoneId;
import java.util.Locale;
import java.util.TimeZone;

/** Internal composition root. It deliberately exposes no browser-facing server. */
@SpringBootApplication
public class CarteraInfrastructureApplication {

    public static final ZoneId APP_ZONE_ID = ZoneId.of("America/Bogota");

    static {
        TimeZone.setDefault(TimeZone.getTimeZone(APP_ZONE_ID));
        Locale.setDefault(Locale.forLanguageTag("es-CO"));
    }

    public CarteraInfrastructureApplication() {
        TimeZone.setDefault(TimeZone.getTimeZone(APP_ZONE_ID));
        Locale.setDefault(Locale.forLanguageTag("es-CO"));
    }
}
