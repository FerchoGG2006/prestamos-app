# Data Model: Multi-Office Registry, Licensing & Device Linking

**Feature**: `004-multi-office-licensing`

## 1. Supabase Cloud Schema Extensions (`offices`)

Existing `public.offices` table gains commercial licensing & linking columns:

| Column | Type | Constraints / Default | Description |
|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | Immutable unique office ID (e.g. `off-fbv-001`, `off-8f3a9c12`) |
| `company_name` | `TEXT` | `NOT NULL` | Editable commercial name |
| `activation_code` | `TEXT` | `UNIQUE` | Unique code used to link devices (e.g. `KRD-XXXX-XXXX`) |
| `license_status` | `TEXT` | `NOT NULL DEFAULT 'ACTIVE'` | `ACTIVE`, `SUSPENDED`, or `EXPIRED` |
| `license_plan` | `TEXT` | `DEFAULT 'LIFETIME'` | `LIFETIME`, `MONTHLY`, `ANNUAL` |
| `license_expires_at` | `TIMESTAMPTZ` | `NULL` | Optional expiration timestamp (`NULL` = no expiration) |
| `owner_name` | `TEXT` | `DEFAULT ''` | Commercial contact / buyer name |
| `notes` | `TEXT` | `DEFAULT ''` | Vendor notes |

## 2. Local Office Configuration (`OfficeCompanyConfig` / `SystemSettingEntity`)

Added fields to local office configuration on both Desktop and Mobile:

| Field | Type | Description |
|---|---|---|
| `officeId` | `string` | Immutable ID of the linked office (`''` when unlinked) |
| `activationCode` | `string` | Activation code used to link the device |
| `licenseStatus` | `'ACTIVE' \| 'SUSPENDED' \| 'EXPIRED'` | Last verified license status |
| `licenseExpiresAt` | `string \| null` | Optional ISO expiration date |
| `isSetupCompleted` | `boolean` | `false` on fresh install until linked/configured |

## 3. State Transitions

### Device Link State
- `UNLINKED` (`officeId === ''` and no legacy local data) -> Shows **Vincular Oficina** screen.
- `LEGACY_UNLINKED` (`officeId === ''` and existing local FBV/portfolio data detected) -> Preserves local data, prompts/allows **Respaldar y Vincular a Oficina** without data loss.
- `LINKED_ACTIVE` (`officeId !== ''` and `licenseStatus === 'ACTIVE'`) -> Normal login & sync enabled.
- `LINKED_BLOCKED` (`licenseStatus === 'SUSPENDED' | 'EXPIRED'`) -> Blocks cloud sync and new device linking with clear commercial message; preserves local offline data.
