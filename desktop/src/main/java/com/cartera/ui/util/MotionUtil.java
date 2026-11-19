package com.cartera.ui.util;

import javafx.animation.FadeTransition;
import javafx.animation.Interpolator;
import javafx.animation.KeyFrame;
import javafx.animation.KeyValue;
import javafx.animation.ParallelTransition;
import javafx.animation.PauseTransition;
import javafx.animation.ScaleTransition;
import javafx.animation.SequentialTransition;
import javafx.animation.Timeline;
import javafx.animation.TranslateTransition;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.ButtonBase;
import javafx.scene.control.Label;
import javafx.scene.layout.HBox;
import javafx.scene.layout.StackPane;
import javafx.util.Duration;

import java.util.List;

/**
 * Utilidad centralizada de Motion Design y UX para JavaFX.
 * Aplica principios de animación ágil (&lt; 300 ms): easing orgánico,
 * anticipación y follow-through táctil, staging de foco y feedback claro.
 */
public final class MotionUtil {

    public enum ToastType {
        SUCCESS, INFO, ERROR
    }

    /** Curva ease-out ágil para entradas de vistas y tarjetas. */
    public static final Interpolator EASE_OUT = Interpolator.SPLINE(0.22, 1.0, 0.36, 1.0);

    /** Curva estándar para transiciones simétricas. */
    public static final Interpolator EASE_IN_OUT = Interpolator.SPLINE(0.4, 0.0, 0.2, 1.0);

    /** Curva de retorno táctil; JavaFX exige los cuatro controles dentro de [0,1]. */
    public static final Interpolator OVERSHOOT = Interpolator.SPLINE(0.34, 1.0, 0.64, 1.0);

    private static final String ACTIVE_TRANSITION_KEY = "cartera.motion.activeTransition";
    private static final String TACTILE_INSTALLED_KEY = "cartera.motion.tactileInstalled";
    private static final String ACTIVE_TOAST_KEY = "cartera.motion.activeToast";

    private MotionUtil() {
    }

    /**
     * Transición de entrada para cambio de vista principal (Staging + Slow in/out &lt; 200ms).
     * Cancela cualquier animación previa en el nodo para respetar el umbral de Doherty (&lt; 400ms).
     */
    public static void transitionView(Node view) {
        if (view == null) return;
        cancelActiveTransition(view);

        view.setOpacity(0.0);
        view.setTranslateY(10.0);

        FadeTransition fade = new FadeTransition(Duration.millis(180), view);
        fade.setFromValue(0.0);
        fade.setToValue(1.0);
        fade.setInterpolator(EASE_OUT);

        TranslateTransition slide = new TranslateTransition(Duration.millis(190), view);
        slide.setFromY(10.0);
        slide.setToY(0.0);
        slide.setInterpolator(EASE_OUT);

        ParallelTransition parallel = new ParallelTransition(fade, slide);
        parallel.setOnFinished(e -> {
            view.setOpacity(1.0);
            view.setTranslateY(0.0);
            view.getProperties().remove(ACTIVE_TRANSITION_KEY);
        });
        view.getProperties().put(ACTIVE_TRANSITION_KEY, parallel);
        parallel.play();
    }

    /**
     * Instala respuesta táctil (squash &amp; stretch + follow-through) en botones.
     * Mantiene duración corta (&lt; 140ms) para no entorpecer operaciones de alta frecuencia.
     */
    public static void installTactileButton(ButtonBase button) {
        if (button == null || Boolean.TRUE.equals(button.getProperties().get(TACTILE_INSTALLED_KEY))) {
            return;
        }
        button.getProperties().put(TACTILE_INSTALLED_KEY, Boolean.TRUE);

        button.setOnMouseEntered(e -> {
            if (!button.isDisabled()) {
                animateTranslateY(button, -1.5, 110);
            }
        });
        button.setOnMouseExited(e -> {
            animateTranslateY(button, 0.0, 110);
            animateScale(button, 1.0, 110, EASE_OUT);
        });
        button.setOnMousePressed(e -> {
            if (!button.isDisabled()) {
                animateScale(button, 0.965, 75, EASE_IN_OUT);
            }
        });
        button.setOnMouseReleased(e -> {
            if (!button.isDisabled()) {
                animateScale(button, 1.0, 130, OVERSHOOT);
            }
        });
    }

    /**
     * Instala respuesta táctil en múltiples botones a la vez.
     */
    public static void installTactileButtons(ButtonBase... buttons) {
        if (buttons == null) return;
        for (ButtonBase btn : buttons) {
            installTactileButton(btn);
        }
    }

    /**
     * Micro-vibración horizontal para errores de validación o credenciales (Exaggerated feedback, 210ms).
     */
    public static void shakeError(Node node) {
        if (node == null) return;
        cancelActiveTransition(node);

        Timeline timeline = new Timeline(
                new KeyFrame(Duration.ZERO, new KeyValue(node.translateXProperty(), 0)),
                new KeyFrame(Duration.millis(40), new KeyValue(node.translateXProperty(), -7, EASE_IN_OUT)),
                new KeyFrame(Duration.millis(90), new KeyValue(node.translateXProperty(), 7, EASE_IN_OUT)),
                new KeyFrame(Duration.millis(140), new KeyValue(node.translateXProperty(), -4, EASE_IN_OUT)),
                new KeyFrame(Duration.millis(180), new KeyValue(node.translateXProperty(), 3, EASE_IN_OUT)),
                new KeyFrame(Duration.millis(210), new KeyValue(node.translateXProperty(), 0, EASE_OUT))
        );
        timeline.setOnFinished(e -> {
            node.setTranslateX(0);
            node.getProperties().remove(ACTIVE_TRANSITION_KEY);
        });
        node.getProperties().put(ACTIVE_TRANSITION_KEY, timeline);
        timeline.play();
    }

    /**
     * Pulso sutil de confirmación para hitos importantes (ej. pago registrado o acceso exitoso).
     */
    public static void pulseSuccess(Node node) {
        if (node == null) return;
        ScaleTransition up = new ScaleTransition(Duration.millis(100), node);
        up.setToX(1.03);
        up.setToY(1.03);
        up.setInterpolator(EASE_OUT);

        ScaleTransition down = new ScaleTransition(Duration.millis(140), node);
        down.setToX(1.0);
        down.setToY(1.0);
        down.setInterpolator(OVERSHOOT);

        new SequentialTransition(up, down).play();
    }

    /**
     * Entrada escalonada sutil para tarjetas de resumen (máximo 6 para mantener agilidad &lt; 300ms).
     */
    public static void staggerCards(List<? extends Node> cards) {
        if (cards == null || cards.isEmpty()) return;
        int limit = Math.min(cards.size(), 6);
        for (int i = 0; i < limit; i++) {
            Node card = cards.get(i);
            card.setOpacity(0.0);
            card.setTranslateY(8.0);

            Duration delay = Duration.millis(i * 32.0);
            FadeTransition fade = new FadeTransition(Duration.millis(180), card);
            fade.setDelay(delay);
            fade.setFromValue(0.0);
            fade.setToValue(1.0);
            fade.setInterpolator(EASE_OUT);

            TranslateTransition slide = new TranslateTransition(Duration.millis(200), card);
            slide.setDelay(delay);
            slide.setFromY(8.0);
            slide.setToY(0.0);
            slide.setInterpolator(EASE_OUT);

            new ParallelTransition(fade, slide).play();
        }
    }

    /**
     * Muestra una notificación flotante no bloqueante sobre el StackPane raíz.
     */
    public static void showToast(StackPane host, String message, ToastType type) {
        if (host == null || message == null || message.isBlank()) return;

        Object existing = host.getProperties().get(ACTIVE_TOAST_KEY);
        if (existing instanceof Node oldToast) {
            host.getChildren().remove(oldToast);
        }

        String iconText = switch (type) {
            case SUCCESS -> "✓";
            case ERROR -> "!";
            case INFO -> "i";
        };
        String styleClass = switch (type) {
            case SUCCESS -> "ux-toast-success";
            case ERROR -> "ux-toast-error";
            case INFO -> "ux-toast-info";
        };

        Label icon = new Label(iconText);
        icon.getStyleClass().add("ux-toast-icon");

        Label text = new Label(message);
        text.getStyleClass().add("ux-toast-text");
        text.setWrapText(true);

        HBox toast = new HBox(10, icon, text);
        toast.setAlignment(Pos.CENTER_LEFT);
        toast.getStyleClass().addAll("ux-toast", styleClass);
        toast.setMaxWidth(440);
        toast.setMaxHeight(javafx.scene.layout.Region.USE_PREF_SIZE);
        toast.setMouseTransparent(true);

        StackPane.setAlignment(toast, Pos.BOTTOM_CENTER);
        StackPane.setMargin(toast, new Insets(0, 24, 28, 24));

        host.getProperties().put(ACTIVE_TOAST_KEY, toast);
        host.getChildren().add(toast);

        toast.setOpacity(0.0);
        toast.setTranslateY(16.0);
        toast.setScaleX(0.96);
        toast.setScaleY(0.96);

        FadeTransition fadeIn = new FadeTransition(Duration.millis(180), toast);
        fadeIn.setToValue(1.0);
        fadeIn.setInterpolator(EASE_OUT);

        TranslateTransition slideIn = new TranslateTransition(Duration.millis(200), toast);
        slideIn.setToY(0.0);
        slideIn.setInterpolator(OVERSHOOT);

        ScaleTransition scaleIn = new ScaleTransition(Duration.millis(200), toast);
        scaleIn.setToX(1.0);
        scaleIn.setToY(1.0);
        scaleIn.setInterpolator(OVERSHOOT);

        PauseTransition hold = new PauseTransition(Duration.millis(2300));

        FadeTransition fadeOut = new FadeTransition(Duration.millis(160), toast);
        fadeOut.setToValue(0.0);
        fadeOut.setInterpolator(EASE_IN_OUT);

        TranslateTransition slideOut = new TranslateTransition(Duration.millis(160), toast);
        slideOut.setToY(10.0);
        slideOut.setInterpolator(EASE_IN_OUT);

        SequentialTransition sequence = new SequentialTransition(
                new ParallelTransition(fadeIn, slideIn, scaleIn),
                hold,
                new ParallelTransition(fadeOut, slideOut)
        );
        sequence.setOnFinished(e -> {
            host.getChildren().remove(toast);
            if (host.getProperties().get(ACTIVE_TOAST_KEY) == toast) {
                host.getProperties().remove(ACTIVE_TOAST_KEY);
            }
        });
        sequence.play();
    }

    private static void animateScale(Node node, double target, double millis, Interpolator interpolator) {
        Timeline tl = new Timeline(
                new KeyFrame(Duration.millis(millis),
                        new KeyValue(node.scaleXProperty(), target, interpolator),
                        new KeyValue(node.scaleYProperty(), target, interpolator))
        );
        tl.play();
    }

    private static void animateTranslateY(Node node, double target, double millis) {
        Timeline tl = new Timeline(
                new KeyFrame(Duration.millis(millis),
                        new KeyValue(node.translateYProperty(), target, EASE_OUT))
        );
        tl.play();
    }

    private static void cancelActiveTransition(Node node) {
        Object active = node.getProperties().remove(ACTIVE_TRANSITION_KEY);
        if (active instanceof javafx.animation.Animation anim) {
            anim.stop();
        }
    }
}
