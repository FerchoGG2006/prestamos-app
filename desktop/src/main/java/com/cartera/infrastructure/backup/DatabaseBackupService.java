package com.cartera.infrastructure.backup;

import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import com.cartera.infrastructure.security.UserSessionContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.*;
import javax.sql.DataSource;
import java.nio.file.*;
import java.sql.*;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Stream;

/** Consistent, verified SQLite snapshots; automatic copies run only after commit. */
@Service
public class DatabaseBackupService {
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(DatabaseBackupService.class);
    private final AuditLogRepository auditLogRepository;
    private final DataSource dataSource;
    private final TransactionTemplate auditTransaction;
    private volatile String lastFailure;

    public DatabaseBackupService(AuditLogRepository auditLogRepository, DataSource dataSource, PlatformTransactionManager manager) {
        this.auditLogRepository = auditLogRepository;
        this.dataSource = dataSource;
        this.auditTransaction = new TransactionTemplate(manager);
        this.auditTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }
    private static final int MAX_RETAINED_BACKUPS = 30;

    public Path getDatabasePath() {
        try (var connection = dataSource.getConnection()) {
            String url = connection.getMetaData().getURL();
            if (!url.startsWith("jdbc:sqlite:") || url.contains(":memory:") || url.contains("mode=memory"))
                throw new IllegalStateException("El respaldo requiere una base SQLite persistida en disco.");
            String rawPath = url.substring("jdbc:sqlite:".length());
            int queryIdx = rawPath.indexOf('?');
            if (queryIdx >= 0) {
                rawPath = rawPath.substring(0, queryIdx);
            }
            if (rawPath.startsWith("file:")) {
                rawPath = rawPath.substring("file:".length());
            }
            return Paths.get(rawPath).toAbsolutePath().normalize();
        } catch (SQLException ex) { throw new IllegalStateException("No se pudo identificar la base activa.", ex); }
    }
    public Path getBackupsDirectory() { return getDatabasePath().getParent().resolve("backups"); }
    public String getLastFailure() { return lastFailure; }

    public void createAfterCommit(String reason) {
        String actor = UserSessionContext.getSession().map(s -> s.userId()).orElse(null);
        if (!TransactionSynchronizationManager.isSynchronizationActive()) { snapshot(reason, actor); return; }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() {
                try { snapshot(reason, actor); }
                catch (RuntimeException ex) {
                    lastFailure = ex.getMessage();
                    LOG.error("El cierre quedó confirmado, pero falló su respaldo: {}", lastFailure, ex);
                }
            }
        });
    }
    public Path createBackup(String reason) {
        if (TransactionSynchronizationManager.isActualTransactionActive())
            throw new IllegalStateException("Solicite el respaldo después de confirmar la transacción.");
        return snapshot(reason, UserSessionContext.getSession().map(s -> s.userId()).orElse(null));
    }
    private Path snapshot(String reason, String actor) {
        Path partial = null;
        try {
            Path source = getDatabasePath();
            if (!Files.isRegularFile(source)) throw new IllegalStateException("No existe la base de datos activa.");
            Path dir = getBackupsDirectory(); Files.createDirectories(dir);
            String name = "cartera_" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd_HHmmss_SSS")) + "_" + UUID.randomUUID();
            partial = dir.resolve(name + ".partial");
            Path target = dir.resolve(name + ".db");
            // SQLite copies the committed database, including WAL contents, into a standalone file.
            try (var connection = DriverManager.getConnection("jdbc:sqlite:" + source);
                 var statement = connection.createStatement()) {
                statement.execute("PRAGMA busy_timeout = 5000");
                statement.execute("VACUUM INTO '" + partial.toString().replace("'", "''") + "'");
            }
            try (var connection = DriverManager.getConnection("jdbc:sqlite:" + partial);
                 var statement = connection.createStatement()) {
                try (var rows = statement.executeQuery("PRAGMA integrity_check")) {
                    if (!rows.next() || !"ok".equalsIgnoreCase(rows.getString(1)))
                        throw new IllegalStateException("El respaldo no superó la verificación de integridad.");
                }
                try (var fkRows = statement.executeQuery("PRAGMA foreign_key_check")) {
                    if (fkRows.next()) {
                        throw new IllegalStateException("El respaldo contiene referencias foráneas inconsistentes.");
                    }
                }
            }
            Files.move(partial, target);
            pruneOldBackups(dir);
            try {
                auditTransaction.executeWithoutResult(status -> auditLogRepository.save(new AuditLogEntity(
                        UUID.randomUUID().toString(), actor, "DATABASE_BACKUP", target.getFileName().toString(),
                        "CREAR_BACKUP", null, "Archivo verificado: " + target.getFileName(),
                        reason == null ? "Copia de seguridad" : reason, LocalDateTime.now().toString())));
            } catch (Exception auditEx) {
                LOG.warn("Respaldo creado en {}, pero falló el registro en auditoría: {}", target.getFileName(), auditEx.getMessage());
            }
            lastFailure = null;
            return target;
        } catch (Exception ex) {
            if (partial != null) try { Files.deleteIfExists(partial); } catch (Exception cleanup) { ex.addSuppressed(cleanup); }
            lastFailure = "No se pudo crear la copia de seguridad: " + ex.getMessage();
            throw new IllegalStateException(lastFailure, ex);
        }
    }

    private void pruneOldBackups(Path dir) {
        try {
            List<Path> backups = listBackups();
            if (backups.size() <= MAX_RETAINED_BACKUPS) return;
            for (int i = MAX_RETAINED_BACKUPS; i < backups.size(); i++) {
                try {
                    Files.deleteIfExists(backups.get(i));
                } catch (Exception delEx) {
                    LOG.warn("No se pudo rotar respaldo antiguo {}: {}", backups.get(i).getFileName(), delEx.getMessage());
                }
            }
        } catch (Exception ex) {
            LOG.warn("No se pudo aplicar retención de respaldos en {}: {}", dir, ex.getMessage());
        }
    }
    public List<Path> listBackups() {
        Path dir = getBackupsDirectory();
        if (!Files.exists(dir)) return List.of();
        try (Stream<Path> stream = Files.list(dir)) {
            return stream.filter(p -> p.getFileName().toString().endsWith(".db"))
                .sorted(Comparator.comparing((Path p) -> p.getFileName().toString()).reversed()).toList();
        } catch (java.io.IOException ex) { throw new IllegalStateException("No se pudieron consultar los respaldos.", ex); }
    }
    public int getBackupCount() { return listBackups().size(); }
}
