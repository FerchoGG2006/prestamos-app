package com.cartera.customers.application;

import com.cartera.infrastructure.backup.DatabaseBackupService;
import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.entity.CustomerAttachmentEntity;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import com.cartera.infrastructure.persistence.repository.CustomerAttachmentRepository;
import com.cartera.infrastructure.persistence.repository.CustomerRepository;
import com.cartera.infrastructure.security.FinancialAccess;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
public class AttachmentService {

    private static final Set<String> ALLOWED_EXTENSIONS = Set.of("jpg", "jpeg", "png", "pdf", "mp4", "mov");
    private static final long MAX_FILE_BYTES = 100L * 1024 * 1024;

    private final CustomerAttachmentRepository files;
    private final CustomerRepository customers;
    private final FinancialAccess access;
    private final AuditLogRepository audit;
    private final DatabaseBackupService backups;

    public AttachmentService(
            CustomerAttachmentRepository files,
            CustomerRepository customers,
            FinancialAccess access,
            AuditLogRepository audit,
            DatabaseBackupService backups
    ) {
        this.files = files;
        this.customers = customers;
        this.access = access;
        this.audit = audit;
        this.backups = backups;
    }

    private void authorize(String customerId) {
        var customer = customers.findById(customerId)
                .orElseThrow(() -> new IllegalArgumentException("Cliente no encontrado."));
        access.collector(customer.getCollectorId());
    }

    public Path directory() {
        return backups.getDatabasePath().getParent().resolve("attachments");
    }

    public static String hash(Path file) throws Exception {
        var digest = MessageDigest.getInstance("SHA-256");
        try (var input = Files.newInputStream(file)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    @Transactional
    public CustomerAttachmentEntity attach(String id, String customer, Path source) {
        authorize(customer);
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("Falta identificador del adjunto.");
        }
        try {
            if (!Files.isRegularFile(source)) {
                throw new IllegalArgumentException("Seleccione un archivo existente.");
            }
            String name = source.getFileName().toString();
            int dot = name.lastIndexOf('.');
            String ext = dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
            if (!ALLOWED_EXTENSIONS.contains(ext)) {
                throw new IllegalArgumentException("Se admiten JPG, PNG, PDF, MP4 o MOV.");
            }
            long size = Files.size(source);
            if (size <= 0 || size > MAX_FILE_BYTES) {
                throw new IllegalArgumentException("El archivo debe ocupar entre 1 byte y 100 MB.");
            }
            String sha = hash(source);
            var old = files.findById(id);
            if (old.isPresent()) {
                var saved = old.get();
                if (!customer.equals(saved.getCustomerId()) || !sha.equals(saved.getSha256())) {
                    throw new IllegalArgumentException("Identificador de adjunto usado con otros datos.");
                }
                return saved;
            }
            Files.createDirectories(directory());
            String stored = UUID.randomUUID() + "." + ext;
            Path target = directory().resolve(stored);
            Files.copy(source, target);
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCompletion(int status) {
                    if (status != STATUS_COMMITTED) {
                        try {
                            Files.deleteIfExists(target);
                        } catch (Exception ex) {
                            LoggerFactory.getLogger(AttachmentService.class)
                                    .error("No se pudo limpiar adjunto revertido", ex);
                        }
                    }
                }
            });
            if (!sha.equals(hash(target))) {
                throw new IllegalStateException("La copia del adjunto no concilia.");
            }
            String mediaType = Set.of("mp4", "mov").contains(ext)
                    ? "VIDEO"
                    : (ext.equals("pdf") ? "DOCUMENTO" : "FOTO");
            var saved = files.save(new CustomerAttachmentEntity(
                    id, customer, name, stored, mediaType, size, sha, LocalDateTime.now().toString()
            ));
            audit.save(new AuditLogEntity(
                    UUID.randomUUID().toString(),
                    access.actor().userId(),
                    "CUSTOMER_ATTACHMENT",
                    id,
                    "ADJUNTAR_ARCHIVO",
                    null,
                    sha,
                    name,
                    LocalDateTime.now().toString()
            ));
            return saved;
        } catch (RuntimeException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalStateException("No se pudo guardar el adjunto.", ex);
        }
    }

    @Transactional(readOnly = true)
    public List<CustomerAttachmentEntity> list(String customer) {
        authorize(customer);
        return files.findByCustomerIdOrderByCreatedAtDesc(customer);
    }

    @Transactional(readOnly = true)
    public Path openPath(String id) {
        var saved = files.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("El archivo adjunto ya no existe."));
        authorize(saved.getCustomerId());
        Path path = directory().resolve(saved.getStoredName()).normalize();
        if (!path.startsWith(directory()) || !Files.isRegularFile(path)) {
            throw new IllegalStateException("Adjunto no disponible en disco.");
        }
        try {
            if (!saved.getSha256().equals(hash(path))) {
                throw new IllegalStateException("El adjunto cambió; requiere revisión.");
            }
        } catch (RuntimeException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
        return path;
    }

    @Transactional
    public void delete(String id, String reason) {
        var actor = access.manager();
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("Seleccione un adjunto para eliminar.");
        }
        if (reason == null || reason.isBlank()) {
            throw new IllegalArgumentException("Debe indicar un motivo para eliminar el adjunto.");
        }
        var saved = files.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("El archivo adjunto no existe."));
        Path target = directory().resolve(saved.getStoredName()).normalize();
        files.delete(saved);
        audit.save(new AuditLogEntity(
                UUID.randomUUID().toString(),
                actor.userId(),
                "CUSTOMER_ATTACHMENT",
                id,
                "ELIMINAR_ADJUNTO",
                saved.getOriginalName() + "|" + saved.getSha256(),
                null,
                reason.trim(),
                LocalDateTime.now().toString()
        ));
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                try {
                    if (target.startsWith(directory())) {
                        Files.deleteIfExists(target);
                    }
                } catch (Exception ex) {
                    LoggerFactory.getLogger(AttachmentService.class)
                            .warn("No se pudo borrar el archivo físico del adjunto eliminado", ex);
                }
            }
        });
    }
}
