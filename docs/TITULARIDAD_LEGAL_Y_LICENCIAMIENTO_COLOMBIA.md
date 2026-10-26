# Marco de Titularidad de Software, Licenciamiento Comercial y Cumplimiento en Colombia — Kredia

**Última actualización:** 26 de octubre de 2026  
**Alcance:** Aplicación de Escritorio Windows (`Java 21 + JavaFX + Spring Boot + SQLite`) y Aplicación Operativa de Ruta (`Kredia`).

> **Advertencia de Alcance:** Este documento estructura la defensa de propiedad intelectual del proveedor del software, la separación contractual entre el proveedor tecnológico y la oficina operadora de crédito, el inventario de componentes de terceros (SBOM) y los lineamientos de protección de datos personales en Colombia (Ley 1581 de 2012). **No sustituye el concepto de un abogado colombiano para la operación crediticia particular de cada cliente.**

---

## 1. Definición del Rol del Negocio y Separación de Responsabilidades

El modelo comercial de **Kredia** corresponde exclusivamente al de **Proveedor de Software de Gestión Operativa y Contable de Cartera (Licenciante)**.

| Aspecto | Responsabilidad del Proveedor del Software (Kredia) | Responsabilidad Exclusiva del Cliente (Oficina Operadora / Acreedor) |
|---|---|---|
| **Objeto** | Proveer la herramienta informática para registro de clientes, cronogramas de cuotas, recaudos, cuadre de ruta, arqueo y respaldos. | Otorgar préstamos con capital propio, definir condiciones financieras y ejecutar la gestión de cobranza conforme a la ley. |
| **Tasas e Intereses** | Permitir parametrizar la tasa pactada por operación y conservar inmutable la tasa histórica de cada contrato sin recalcular préstamos antiguos. | Verificar y cumplir los límites de interés remuneratorio y moratorio certificados por la **Superintendencia Financiera de Colombia** según la modalidad legal aplicable. |
| **Datos Personales (Ley 1581 de 2012)** | Proveer controles de acceso por rol, registro de autorización previa y herramientas de exportación/eliminación. | Actuar como **Responsable del Tratamiento**, recabar la autorización previa, expresa e informada de cada titular (deudor/codeudor) y atender consultas o reclamos (Habeas Data). |
| **Propiedad de la Base de Datos** | Garantizar en todo momento la lectura y exportación íntegra (`JSON` / `CSV`) de la cartera del cliente, incluso ante suspensión o terminación de la suscripción. | Custodiar sus copias de seguridad locales y responder por la veracidad y legalidad de los registros ingresados. |

---

## 2. Titularidad del Código y Guía de Registro ante la DNDA (Colombia)

En Colombia, la protección del soporte lógico (software) se rige por la **Ley 23 de 1982**, la **Decisión Andina 351 de 1993** y el **Decreto 1360 de 1989**. El trámite oficial de registro de soporte lógico ante la **Dirección Nacional de Derecho de Autor (DNDA)** es **gratuito**, en línea y tiene un término administrativo de **15 días hábiles**.

### 2.1 Documentos de Titularidad Interna (Checklist de Propiedad Intelectual)
1. **Declaración de Autoría Original:** Suscrita por el(los) autor(es) desarrollador(es) de Kredia, dejando constancia de los módulos creados originalmente (`com.cartera.*` en Desktop y `src/*` en Mobile).
2. **Contratos de Cesión Patrimonial o Obra por Encargo:** Si intervienen diseñadores o desarrolladores externos, debe firmarse cesión expresa de derechos patrimoniales con reconocimiento de firma o formalidad aplicable conforme al Art. 183 de la Ley 23 de 1982 (modificado por la Ley 1915 de 2018).
3. **Etiquetado de Versión para Depósito:** Conservar un paquete `.zip` con el hash SHA-256 de la versión comercial registrada (`v1.0.0`).

### 2.2 Paso a Paso para Registrar el Software en la DNDA (`derechodeautor.gov.co`)
1. Ingresar al portal oficial de la **DNDA** ([https://www.derechodeautor.gov.co](https://www.derechodeautor.gov.co)) → *Trámites y Servicios* → *Registro en Línea de Obras* → **Registro de Soporte Lógico (Software)**.
2. Completar los datos del **Autor(es)** (persona natural creadora) y del **Titular de Derechos Patrimoniales** (persona natural o jurídica que comercializa Kredia).
3. Adjuntar los **3 elementos exigidos por el Decreto 1360 de 1989**:
   - **Programa de computador (extracto del código fuente):** PDF con las primeras y últimas 25 páginas del código fuente original de los módulos principales (`LoanService.java`, `PaymentService.java`, `SettlementService.java`, `local-store.ts`, `calculator.ts`), sin incluir librerías de terceros.
   - **Descripción del programa (Memoria descriptiva):** Documento técnico resumiendo la arquitectura (Escritorio JavaFX + SQLite y App Operativa de Ruta con sincronización LAN), módulos funcionales y flujo de datos.
   - **Material auxiliar (Manual de usuario / Guía de instalación):** Adjuntar [`docs/GUIA_INSTALACION_OFICINAS.md`](file:///c:/Users/ASUS/prestamos-app-1/docs/GUIA_INSTALACION_OFICINAS.md).

---

## 3. Inventario de Software de Terceros (SBOM) y Compatibilidad de Licencias

Ninguna de las dependencias utilizadas en Kredia impone obligaciones *copyleft* restrictivas (como GPL pura o AGPL) que obliguen a liberar el código fuente propietario al distribuir el instalador comercial:

### 3.1 Módulo de Escritorio Windows (`desktop/build.gradle`)
| Componente | Versión | Licencia | Uso en el Sistema | Compatibilidad Comercial |
|---|---|---|---|---|
| **Eclipse Temurin / OpenJDK 21** | 21 LTS | `GPL-2.0 WITH Classpath-exception-2.0` | Runtime embebido vía `jpackage` | **Permitido** comercialmente gracias a la *Classpath Exception*. |
| **OpenJFX (JavaFX)** | 21.0.2 | `GPL-2.0 WITH Classpath-exception-2.0` | Interfaz gráfica nativa de escritorio | **Permitido** comercialmente gracias a la *Classpath Exception*. |
| **Spring Boot** (`starter-data-jpa`, `validation`) | 3.4.2 | `Apache-2.0` | Inyección de dependencias y transacciones | **Permitido** (licencia permisiva). |
| **SQLite JDBC (`org.xerial:sqlite-jdbc`)** | 3.45.1.0 | `Apache-2.0` | Motor de base de datos local embebido | **Permitido** (licencia permisiva). |
| **Hibernate Community Dialects** | 6.6.5.Final | `LGPL-2.1` | Dialecto SQLite para JPA | **Permitido** como librería enlazada dinámicamente sin modificar su fuente. |
| **Flyway Core (`org.flywaydb:flyway-core`)** | 10.8.1 | `Apache-2.0` | Migraciones versionadas de esquema SQL | **Permitido** (licencia permisiva). |
| **AtlantaFX (`io.github.mkpaz:atlantafx-base`)** | 2.0.1 | `MIT` | Sistema de temas visuales para JavaFX | **Permitido** (licencia permisiva). |
| **Ikonli (`ikonli-javafx`, `ikonli-feather-pack`)** | 12.3.1 | `Apache-2.0` | Iconografía vectorial en escritorio | **Permitido** (licencia permisiva). |
| **Jackson Databind** | 2.18.2 | `Apache-2.0` | Serialización JSON en sincronización LAN y respaldos | **Permitido** (licencia permisiva). |

### 3.2 Módulo Móvil / Ruta (`mobile/package.json`)
| Componente | Versión | Licencia | Uso en el Sistema | Compatibilidad Comercial |
|---|---|---|---|---|
| **React / React Native** | 19.1.0 / 0.81.5 | `MIT` | Renderizado de vistas operativas | **Permitido** (licencia permisiva). |
| **Expo SDK** | 54.0.0 | `MIT` | Empaquetado móvil y almacenamiento local | **Permitido** (licencia permisiva). |
| **Lucide React Native** | 1.16.0 | `ISC` / `MIT` | Iconografía financiera | **Permitido** (licencia permisiva). |
| **AsyncStorage** | 2.2.0 | `MIT` | Persistencia local en dispositivo de ruta | **Permitido** (licencia permisiva). |

---

## 4. Modelo de Licenciamiento, Activación y Garantía de Salida de Datos

### 4.1 Planes Comerciales Definidos
1. **Piloto de Evaluación (14 días):** 1 oficina local + hasta 2 rutas de cobro para validación en campo.
2. **Plan Oficina Local:** 1 equipo de escritorio Windows + respaldos locales ilimitados.
3. **Plan Oficina + Rutas (Estándar Comercial):** 1 equipo de escritorio + sincronización Wi-Fi local con rutas móviles asignadas.
4. **Plan Multi-Oficina:** Licenciamiento por sede adicional con aislamiento total de cartera.

### 4.2 Regla Ética y Técnica Ante Vencimiento de Suscripción (No Secuestro de Datos)
Si la suscripción de una oficina vence y supera el **periodo de gracia offline de 14 días**:
- **Se restringe únicamente:** La creación de nuevos préstamos y la apertura de nuevas rutas.
- **NUNCA se bloquea:**
  1. El inicio de sesión del Administrador.
  2. La consulta en modo lectura de todos los clientes, préstamos, cuotas, abonos y liquidaciones históricas.
  3. La descarga de la **Copia de Seguridad Completa (`.json`)** y del **Reporte Contable en Excel (`.csv`)**.

---

## 5. Cláusulas Base para Contrato de Licencia (EULA) y Protección de Datos (Ley 1581 de 2012)

### Cláusula A — Naturaleza Tecnológica del Servicio
> *"EL PROVEEDOR otorga a EL CLIENTE una licencia de uso no exclusiva, intransferible y temporal sobre el software KREDIA. EL PROVEEDOR no es una entidad financiera, no capta recursos del público, no otorga créditos, no participa en la gestión de cobranza ni define las tasas de interés, plazos, recargos o condiciones contractuales que EL CLIENTE pacte con sus deudores."*

### Cláusula B — Parametrización Financiera y Cumplimiento Legal
> *"EL CLIENTE declara y acepta que es el único responsable de parametrizar en el sistema las tasas de interés remuneratorio, moratorio, comisiones o gastos de papelería conforme a la legislación colombiana vigente y a las certificaciones emitidas por la Superintendencia Financiera de Colombia. La herramienta informática conserva la tasa pactada en cada contrato individual y no recalcula retroactivamente obligaciones previas."*

### Cláusula C — Tratamiento de Datos Personales (Ley 1581 de 2012 y Decreto 1377 de 2013)
> *"Para efectos de la Ley Estatutaria 1581 de 2012, EL CLIENTE ostenta la calidad de RESPONSABLE DEL TRATAMIENTO respecto de los datos personales de sus clientes, deudores, codeudores, referencias y cobradores. EL CLIENTE se obliga a recabar y conservar la prueba de la autorización previa, expresa e informada de cada titular antes de registrar su información en el software, absteniéndose de utilizar mecanismos de cobro intimidatorios, difamatorios o contrarios a la dignidad humana."*
