/**
 * Puntos 18 y 30: Rastreo de operaciones lentas (OpenTelemetry-style Spans)
 * y Monitoreo de Velocidad de Usuarios Reales (RUM - Real User Monitoring).
 */

export interface TelemetrySpan {
  traceId: string;
  operation: string;
  durationMs: number;
  timestamp: string;
  isSlow: boolean;
}

class PerformanceTelemetryMonitor {
  private recentSpans: TelemetrySpan[] = [];
  private slowThresholdMs = 80;
  private fcpMs: number | null = null;
  private lcpMs: number | null = null;
  private isRumInitialized = false;

  public initRealUserMonitoring(): void {
    if (this.isRumInitialized) return;
    this.isRumInitialized = true;

    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      try {
        const paintObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name === 'first-contentful-paint') {
              this.fcpMs = Math.round(entry.startTime);
            }
          }
        });
        paintObserver.observe({ type: 'paint', buffered: true });
      } catch {}

      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries[entries.length - 1];
          if (last) {
            this.lcpMs = Math.round(last.startTime);
          }
        });
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      } catch {}
    }
  }

  private nowMs(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  public recordSpan(operation: string, durationMs: number): void {
    const rounded = Math.round(durationMs * 100) / 100;
    const isSlow = rounded >= this.slowThresholdMs;
    const span: TelemetrySpan = {
      traceId: `tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      operation,
      durationMs: rounded,
      timestamp: new Date().toISOString(),
      isSlow,
    };

    this.recentSpans.unshift(span);
    if (this.recentSpans.length > 60) {
      this.recentSpans.pop();
    }
  }

  public traceSync<T>(operation: string, fn: () => T): T {
    const start = this.nowMs();
    try {
      return fn();
    } finally {
      this.recordSpan(operation, this.nowMs() - start);
    }
  }

  public async traceAsync<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = this.nowMs();
    try {
      return await fn();
    } finally {
      this.recordSpan(operation, this.nowMs() - start);
    }
  }

  public getMetricsSummary(): {
    fcpMs: number | null;
    lcpMs: number | null;
    averageSpanMs: number;
    slowOperationsCount: number;
    recentSpans: TelemetrySpan[];
  } {
    const total = this.recentSpans.reduce((acc, s) => acc + s.durationMs, 0);
    const avg =
      this.recentSpans.length > 0
        ? Math.round((total / this.recentSpans.length) * 100) / 100
        : 0;
    const slowCount = this.recentSpans.filter((s) => s.isSlow).length;
    return {
      fcpMs: this.fcpMs,
      lcpMs: this.lcpMs,
      averageSpanMs: avg,
      slowOperationsCount: slowCount,
      recentSpans: this.recentSpans.slice(0, 10),
    };
  }
}

export const perfMonitor = new PerformanceTelemetryMonitor();
