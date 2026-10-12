package com.cartera.infrastructure.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "system_setting")
public class SystemSettingEntity {
    @Id
    @Column(name = "setting_key")
    private String settingKey;

    @Column(name = "setting_value", nullable = false)
    private String settingValue;

    @Column(name = "updated_at", nullable = false)
    private String updatedAt;

    public SystemSettingEntity() {}

    public SystemSettingEntity(String settingKey, String settingValue, String updatedAt) {
        this.settingKey = settingKey;
        this.settingValue = settingValue;
        this.updatedAt = updatedAt;
    }

    public String getSettingKey() { return settingKey; }
    public void setSettingKey(String settingKey) { this.settingKey = settingKey; }
    public String getSettingValue() { return settingValue; }
    public void setSettingValue(String settingValue) { this.settingValue = settingValue; }
    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }
}
