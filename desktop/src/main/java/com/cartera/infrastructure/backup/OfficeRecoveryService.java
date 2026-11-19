package com.cartera.infrastructure.backup;

import com.cartera.customers.application.AttachmentService;
import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import com.cartera.infrastructure.security.FinancialAccess;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/** Recovery publishes a NEW office directory; it never replaces a running database. */
@Service
public class OfficeRecoveryService {

    private static final int MAX_SUPPORTED_SCHEMA_VERSION = 3;
    private static final long MAX_UNCOMPRESSED_BYTES = 512L * 1024 * 1024;
    private static final int MAX_ZIP_ENTRIES = 10_000;

    private final DatabaseBackupService backups;
    private final FinancialAccess access;
    private final AuditLogRepository audit;

    public OfficeRecoveryService(
            DatabaseBackupService backups,
            FinancialAccess access,
            AuditLogRepository audit
    ) {
        this.backups = backups;
        this.access = access;
        this.audit = audit;
    }

    public record Validation(long customers, long loans, long payments, long settlements, int schema) { }

    private static Connection readOnly(Path db) throws Exception {
        if (!Files.isRegularFile(db)) {
            throw new IllegalArgumentException("El respaldo no existe.");
        }
        return DriverManager.getConnection("jdbc:sqlite:" + db.toAbsolutePath().toUri() + "?mode=ro");
    }

    public static Validation inspect(Path db) {
        try (var connection = readOnly(db); var statement = connection.createStatement()) {
            try (var row = statement.executeQuery("PRAGMA integrity_check")) {
                if (!row.next() || !"ok".equals(row.getString(1))) {
                    throw new IllegalArgumentException("SQLite no supera integridad.");
                }
            }
            try (var row = statement.executeQuery("PRAGMA foreign_key_check")) {
                if (row.next()) {
                    throw new IllegalArgumentException("El respaldo contiene referencias inconsistentes.");
                }
            }
            for (String table : List.of(
                    "customer", "loan", "payment", "payment_allocation",
                    "daily_settlement", "app_user", "route", "audit_log", "system_setting"
            )) {
                try (var row = statement.executeQuery("SELECT count(*) FROM " + table)) {
                    if (!row.next()) {
                        throw new IllegalArgumentException("Esquema incompleto.");
                    }
                }
            }
            int version;
            try (var row = statement.executeQuery(
                    "SELECT max(CAST(version AS INTEGER)) FROM flyway_schema_history WHERE success=1"
            )) {
                row.next();
                version = row.getInt(1);
            }
            if (version < 1 || version > MAX_SUPPORTED_SCHEMA_VERSION) {
                throw new IllegalArgumentException("Versión de esquema no compatible: " + version);
            }
            return new Validation(
                    count(statement, "customer"),
                    count(statement, "loan"),
                    count(statement, "payment"),
                    count(statement, "daily_settlement"),
                    version
            );
        } catch (RuntimeException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("Respaldo no válido: " + ex.getMessage(), ex);
        }
    }

    private static long count(Statement statement, String table) throws Exception {
        try (var rows = statement.executeQuery("SELECT count(*) FROM " + table)) {
            rows.next();
            return rows.getLong(1);
        }
    }

    public Path exportOffice(Path target) {
        var actor = access.manager();
        if (Files.exists(target)) {
            throw new IllegalArgumentException("El archivo destino ya existe.");
        }
        Path partial = target.resolveSibling(target.getFileName() + ".partial-" + UUID.randomUUID());
        try {
            Path db = backups.createBackup("Paquete recuperable de oficina");
            inspect(db);
            try (var output = new ZipOutputStream(Files.newOutputStream(partial));
                 var connection = readOnly(db);
                 var statement = connection.createStatement()) {
                add(output, "cartera.db", db);
                if (tableExists(statement, "customer_attachment")) {
                    Path attachmentsDir = backups.getDatabasePath().getParent().resolve("attachments");
                    try (var rows = statement.executeQuery("SELECT stored_name, sha256 FROM customer_attachment")) {
                        while (rows.next()) {
                            String name = rows.getString(1);
                            Path file = attachmentsDir.resolve(name).normalize();
                            if (!file.getParent().equals(attachmentsDir)
                                    || !Files.isRegularFile(file)
                                    || !rows.getString(2).equals(AttachmentService.hash(file))) {
                                throw new IllegalStateException("Falta un adjunto o su integridad cambió: " + name);
                            }
                            add(output, "attachments/" + name, file);
                        }
                    }
                }
            }
            Files.move(partial, target);
            audit.save(new AuditLogEntity(
                    UUID.randomUUID().toString(),
                    actor.userId(),
                    "OFFICE_BACKUP",
                    target.getFileName().toString(),
                    "EXPORTAR_OFICINA",
                    null,
                    AttachmentService.hash(target),
                    "Paquete SQLite y adjuntos",
                    LocalDateTime.now().toString()
            ));
            return target;
        } catch (Exception ex) {
            try {
                Files.deleteIfExists(partial);
            } catch (Exception ignored) {
            }
            throw new IllegalStateException("No se pudo exportar la oficina: " + ex.getMessage(), ex);
        }
    }

    private static boolean tableExists(Statement statement, String name) throws Exception {
        try (var rows = statement.executeQuery(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='" + name + "'"
        )) {
            return rows.next();
        }
    }

    private static void add(ZipOutputStream out, String name, Path file) throws Exception {
        out.putNextEntry(new ZipEntry(name));
        Files.copy(file, out);
        out.closeEntry();
    }

    public Path recover(Path source, Path destinationParent, String reason) {
        var actor = access.manager();
        if (reason == null || reason.isBlank()) {
            throw new IllegalArgumentException("Motivo obligatorio.");
        }
        if (!Files.isDirectory(destinationParent)) {
            throw new IllegalArgumentException("Seleccione una carpeta destino existente.");
        }
        Path normalizedParent = destinationParent.toAbsolutePath().normalize();
        Path stage = normalizedParent.resolve("Oficina-recuperada-" + UUID.randomUUID());
        try {
            Files.createDirectory(stage);
            if (source.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".db")) {
                inspect(source);
                Files.copy(source, stage.resolve("cartera.db"));
            } else {
                long total = 0;
                int entries = 0;
                try (var input = new ZipInputStream(Files.newInputStream(source))) {
                    ZipEntry entry;
                    Set<String> seen = new HashSet<>();
                    while ((entry = input.getNextEntry()) != null) {
                        String name = entry.getName();
                        if (entry.isDirectory()) {
                            continue;
                        }
                        if (++entries > MAX_ZIP_ENTRIES
                                || !seen.add(name)
                                || !(name.equals("cartera.db")
                                || name.matches("attachments/[a-zA-Z0-9-]+\\.[a-zA-Z0-9]+"))) {
                            throw new IllegalArgumentException("Contenido de paquete no permitido.");
                        }
                        Path target = stage.resolve(name).normalize();
                        if (!target.startsWith(stage)) {
                            throw new IllegalArgumentException("Ruta de archivo inválida.");
                        }
                        Files.createDirectories(target.getParent());
                        try (var output = Files.newOutputStream(target, StandardOpenOption.CREATE_NEW)) {
                            byte[] bytes = new byte[8192];
                            int read;
                            while ((read = input.read(bytes)) != -1) {
                                total += read;
                                if (total > MAX_UNCOMPRESSED_BYTES) {
                                    throw new IllegalArgumentException("El paquete supera 512 MB descomprimido.");
                                }
                                output.write(bytes, 0, read);
                            }
                        }
                    }
                }
            }
            inspect(stage.resolve("cartera.db"));
            try (var connection = readOnly(stage.resolve("cartera.db"));
                 var statement = connection.createStatement()) {
                if (tableExists(statement, "customer_attachment")) {
                    Path attachmentsDir = stage.resolve("attachments");
                    try (var rows = statement.executeQuery("SELECT stored_name, sha256 FROM customer_attachment")) {
                        while (rows.next()) {
                            Path attachment = attachmentsDir.resolve(rows.getString(1)).normalize();
                            if (!attachment.startsWith(attachmentsDir)
                                    || !Files.isRegularFile(attachment)
                                    || !rows.getString(2).equals(AttachmentService.hash(attachment))) {
                                throw new IllegalArgumentException("El paquete no recupera todos sus adjuntos.");
                            }
                        }
                    }
                }
            }
            audit.save(new AuditLogEntity(
                    UUID.randomUUID().toString(),
                    actor.userId(),
                    "OFFICE_RECOVERY",
                    stage.getFileName().toString(),
                    "PREPARAR_RECUPERACION",
                    null,
                    stage.toString(),
                    reason,
                    LocalDateTime.now().toString()
            ));
            return stage;
        } catch (Exception ex) {
            try {
                if (stage.getParent().equals(normalizedParent) && Files.exists(stage)) {
                    try (var paths = Files.walk(stage)) {
                        for (var path : paths.sorted(Comparator.reverseOrder()).toList()) {
                            Files.delete(path);
                        }
                    }
                }
            } catch (Exception cleanup) {
                ex.addSuppressed(cleanup);
            }
            throw new IllegalStateException("No se publicó ninguna oficina recuperada: " + ex.getMessage(), ex);
        }
    }
}
