package com.cartera.infrastructure.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "customer")
public class CustomerEntity {
    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(name = "document_number", nullable = false, unique = true)
    private String documentNumber;

    @Column(name = "phone", nullable = false)
    private String phone;

    @Column(name = "alt_phone")
    private String altPhone;

    @Column(name = "address")
    private String address;

    @Column(name = "neighborhood")
    private String neighborhood;

    @Column(name = "city")
    private String city;

    @Column(name = "occupation")
    private String occupation;

    @Column(name = "business_name")
    private String businessName;

    @Column(name = "notes")
    private String notes;

    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "route_id")
    private String routeId;

    @Column(name = "collector_id")
    private String collectorId;

    @Column(name = "created_at", nullable = false)
    private String createdAt;

    public CustomerEntity() {}

    public CustomerEntity(String id, String fullName, String documentNumber, String phone, String altPhone,
                          String address, String neighborhood, String city, String occupation, String businessName,
                          String notes, String status, String routeId, String collectorId, String createdAt) {
        this.id = id;
        this.fullName = fullName;
        this.documentNumber = documentNumber;
        this.phone = phone;
        this.altPhone = altPhone;
        this.address = address;
        this.neighborhood = neighborhood;
        this.city = city;
        this.occupation = occupation;
        this.businessName = businessName;
        this.notes = notes;
        this.status = status;
        this.routeId = routeId;
        this.collectorId = collectorId;
        this.createdAt = createdAt;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public String getDocumentNumber() { return documentNumber; }
    public void setDocumentNumber(String documentNumber) { this.documentNumber = documentNumber; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getAltPhone() { return altPhone; }
    public void setAltPhone(String altPhone) { this.altPhone = altPhone; }
    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    public String getNeighborhood() { return neighborhood; }
    public void setNeighborhood(String neighborhood) { this.neighborhood = neighborhood; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
    public String getOccupation() { return occupation; }
    public void setOccupation(String occupation) { this.occupation = occupation; }
    public String getBusinessName() { return businessName; }
    public void setBusinessName(String businessName) { this.businessName = businessName; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getRouteId() { return routeId; }
    public void setRouteId(String routeId) { this.routeId = routeId; }
    public String getCollectorId() { return collectorId; }
    public void setCollectorId(String collectorId) { this.collectorId = collectorId; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
