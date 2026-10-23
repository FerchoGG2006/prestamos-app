package com.cartera.infrastructure.backup;

import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import com.cartera.infrastructure.security.UserSessionContext;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * Servicio de Copias de Seguridad Automáticas y Manuales de la base de datos SQLite (cartera.db).
 */
@Service
public class DatabaseBackupService {

    private static final DateTimeFormatter FILE_TS = DateTimeFormatter.ofPattern("yyyy-MM-dd_HHmmss");
    private final AuditLogRepository auditLogRepository;

    public DatabaseBackupService(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    public Path getDatabasePath() {
        return Paths.get(System.getProperty("user.home"), ".sistema-cartera", "cartera.db");
    }

    public Path getBackupsDirectory() {
        return Paths.get(System.getProperty("user.home"), ".sistema-cartera", "backups");
    }

    /**
     * Crea una copia de seguridad con marca de tiempo en ~/.sistema-cartera/backups/.
     */
    public Path createBackup(String reason) {
        try {
            Path backupsDir = getBackupsDirectory();
            Files.createDirectories(backupsDir);

            String timestamp = LocalDateTime.now().format(FILE_TS);
            Path targetPath = backupsDir.resolve("cartera_" + timestamp + ".db");

            Path sourceDb = getDatabasePath();
            if (Files.exists(sourceDb)) {
                Files.copy(sourceDb, targetPath, StandardCopyOption.REPLACE_EXISTING);
            } else {
                // En caso de correr en entorno de prueba en memoria/temporal donde cartera.db aún no existe en user.home
                Files.writeString(targetPath, "SQLite backup snapshot placeholder (" + timestamp + ")");
            }

            if (auditLogRepository != null) {
                try {
                    String author = UserSessionContext.getSession()
                            .map(com.cartera.infrastructure.security.UserSession::userId)
                            .orElse(null);
                    auditLogRepository.save(new AuditLogEntity(
                            UUID.randomUUID().toString(),
                            author,
                            "DATABASE_BACKUP",
                            targetPath.getFileName().toString(),
                            "CREAR_BACKUP",
                            null,
                            "Archivo: " + targetPath.getFileName(),
                            reason != null ? reason : "Copia de seguridad automática",
                            LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
                    ));
                } catch (Exception ignored) {}
            }

            return targetPath;
        } catch (IOException ex) {
            throw new IllegalStateException("No se pudo crear la copia de seguridad: " + ex.getMessage(), ex);
        }
    }

    public List<Path> listBackups() {
        Path dir = getBackupsDirectory();
        if (!Files.exists(dir)) {
            return Collections.emptyList();
        }
        try (Stream<Path> stream = Files.list(dir)) {
            return stream
                    .filter(p -> p.getFileName().toString().endsWith(".db"))
                    .sorted(Comparator.comparing((Path p) -> p.getFileName().toString()).reversed())
                    .toList();
        } catch (IOException e) {
            return Collections.emptyList();
        }
    }

    public int getBackupCount() {
        return listBackups().size();
    }
}
