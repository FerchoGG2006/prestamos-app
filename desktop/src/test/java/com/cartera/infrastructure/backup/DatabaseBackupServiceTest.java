package com.cartera.infrastructure.backup;

import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.transaction.PlatformTransactionManager;
import javax.sql.DataSource;
import java.nio.file.*;
import java.sql.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DatabaseBackupServiceTest {
    @TempDir Path directory;
    @Test void missingActiveDatabaseCannotBecomeATextFileNamedDb() throws Exception {
        var source = directory.resolve("missing.db");
        var ds = mock(DataSource.class); var connection = mock(Connection.class); var metadata = mock(DatabaseMetaData.class);
        when(ds.getConnection()).thenReturn(connection); when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getURL()).thenReturn("jdbc:sqlite:" + source);
        var audit = mock(AuditLogRepository.class);
        var service = new DatabaseBackupService(audit, ds, mock(PlatformTransactionManager.class));
        assertEquals(source, service.getDatabasePath());
        assertThrows(IllegalStateException.class, () -> service.createBackup("Missing database test"));
        assertNotNull(service.getLastFailure());
        try (var files = Files.list(directory)) { assertEquals(0, files.count()); }
        verifyNoInteractions(audit);
    }
}
