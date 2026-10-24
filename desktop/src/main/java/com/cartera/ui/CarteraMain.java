package com.cartera.ui;

import javafx.application.Application;

/**
 * Standard JVM entry point for packaging and distribution.
 * Having a main method in a class that does NOT extend javafx.application.Application
 * allows the Java launcher to start JavaFX from the classpath without requiring module-path flags.
 */
public final class CarteraMain {

    private CarteraMain() {}

    public static void main(String[] args) {
        Application.launch(CarteraApplication.class, args);
    }
}
