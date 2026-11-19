package com.cartera.infrastructure.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "customer_attachment")
public class CustomerAttachmentEntity {

    @Id
    private String id;

    @Column(name = "customer_id", nullable = false)
    private String customerId;

    @Column(name = "original_name", nullable = false)
    private String originalName;

    @Column(name = "stored_name", nullable = false, unique = true)
    private String storedName;

    @Column(name = "media_type", nullable = false)
    private String mediaType;

    @Column(name = "byte_size", nullable = false)
    private Long byteSize;

    @Column(nullable = false)
    private String sha256;

    @Column(name = "created_at", nullable = false)
    private String createdAt;

    public CustomerAttachmentEntity() {
    }

    public CustomerAttachmentEntity(
            String id,
            String customerId,
            String originalName,
            String storedName,
            String mediaType,
            Long byteSize,
            String sha256,
            String createdAt
    ) {
        this.id = id;
        this.customerId = customerId;
        this.originalName = originalName;
        this.storedName = storedName;
        this.mediaType = mediaType;
        this.byteSize = byteSize;
        this.sha256 = sha256;
        this.createdAt = createdAt;
    }

    public String getId() { return id; }
    public String getCustomerId() { return customerId; }
    public String getOriginalName() { return originalName; }
    public String getStoredName() { return storedName; }
    public String getMediaType() { return mediaType; }
    public Long getByteSize() { return byteSize; }
    public String getSha256() { return sha256; }
    public String getCreatedAt() { return createdAt; }
}
