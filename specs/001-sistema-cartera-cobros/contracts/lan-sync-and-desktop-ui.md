# Interface Contracts: UI Nativa JavaFX & Sincronización LAN

## 1. Contratos de Vistas Operativas JavaFX (`com.cartera.ui`)

- **`LoginView`**: Autenticación por rol (`ADMIN` de oficina o `COLLECTOR` de ruta) validada contra `OfficeAccessService` (`PBKDF2-HMAC-SHA256`).
- **`MainWorkspaceView`**: Shell nativo JavaFX con navegación lateral por módulos autorizados según el rol activo.
- **`DashboardView`**: Indicadores financieros en vivo (cartera activa, recaudo del día, efectividad de cobro, caja disponible, alertas de mora/promesas).
- **`TodayCollectionsView` + `PaymentDialog` + `ReceiptDialog`**: Tabla operativa de cobros del día con filtro instantáneo, registro de abono parcial/completo/adelantado con 1-clic y comprobante de pago.
- **`LoansView` + `RenewLoanDialog`**: Creación de créditos nuevos y renovación de créditos vigentes con cálculo en vivo de saldo deducido, papelería y efectivo neto a entregar.
- **`CustomersView` + `CreditHistoryDialog`**: Directorio de clientes por ruta y expediente crediticio 360°.
- **`SettlementManagementView` + `CloseSettlementDialog` + `RouteExpenseDialog`**: Apertura/cierre de jornadas por ruta, registro de gastos operativos y arqueo de efectivo con justificación obligatoria ante descuadres.
- **`TreasuryManagementView` + `CapitalInjectionDialog`**: Control de tesorería general, inyecciones/retiros de capital y flujo de caja.
- **`ReportsView` + `ImportMobileSyncDialog`**: Exportación de reportes a Excel (`.xls`/TSV), gestión de respaldos SQLite y sincronización LAN con cobradores móviles.

## 2. Contrato de Sincronización LAN (`LanSyncServerService`)

- **Transporte**: HTTP local (`0.0.0.0:8765` por defecto en red LAN de la oficina).
- **Seguridad**:
  - Cabecera opcional/configurable `X-Office-Sync-Pin`.
  - Límite máximo de payload: `2 MB`.
  - Control de frecuencia (rate limiting) por dirección IP de origen.
- **Endpoints**:
  - `GET /api/sync/status`: Estado del nodo de oficina y rutas activas.
  - `GET /api/sync/pull?routeCode={code}`: Descarga de cartera actualizada, clientes y cuotas pendientes de la ruta para el dispositivo móvil.
  - `POST /api/sync/push`: Recepción transaccional e idempotente de pagos, promesas, gastos, préstamos nuevos y renovaciones capturados offline en la ruta móvil.
