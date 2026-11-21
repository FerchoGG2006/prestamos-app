# Contracts: Multi-Office Registry, Licensing & Device Linking

## 1. Register Office (Vendor Console -> Cloud Registry)
- **Input**: `companyName`, `ownerName`, `adminName`, `adminUsername`, `adminPassword`, `licensePlan` (`LIFETIME` | `MONTHLY` | `ANNUAL`), `licenseExpiresAt` (optional), `routesCount` (optional).
- **Output**: Created `Office` with immutable `id` (`off-<uuid8>`), unique `activationCode` (`KRD-XXXX-XXXX`), `licenseStatus: 'ACTIVE'`, and initial `ADMIN` user.

## 2. Link Device (Desktop or Mobile -> Cloud Registry)
- **Input**: `activationCode`, `username`, `password`.
- **Validation**:
  1. Office exists for `activationCode`.
  2. `license_status === 'ACTIVE'` and (`license_expires_at === null` or `license_expires_at > now()`).
  3. User exists in `users` for that `office_id` with matching `username` and valid password.
- **Output**: Returns `office` metadata, `routes`, `users`, and initial portfolio for that `office_id` only.

## 3. Sync Guard (Cloud Sync)
- Before `pushFullPortfolio` or `pullFullPortfolio`, verify `officeId` is non-empty and `license_status === 'ACTIVE'` (and not expired).
- All upserts and queries filter strictly by `office_id = officeConfig.officeId`.
