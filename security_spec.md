# Security Specification — Sistem Keuangan SMKS PGRI 1 Sukabumi

## 1. Data Invariants

1. **Default-Deny Catch-All**: Every path not explicitly matched is denied (`allow read, write: if false;`).
2. **Identity & Verification Invariant**: Every write operation requires an authenticated user (`request.auth != null`) with `request.auth.token.email_verified == true`.
3. **Path Variable Hardening**: Every document ID (`userId`, `adminId`, `studentId`, `transactionId`) on single-document operations (`get`, `create`, `update`, `delete`) must satisfy `isValidId(id)` (`id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$')`).
4. **Role & Privilege Escalation Guard**:
   - Users cannot self-assign `kasir` role on `/users/{userId}` creation unless they are a verified admin (`isAdmin()`). Non-admin users can only initialize `role == 'kepsek'` (read-only).
   - Non-admin users cannot mutate `role` during profile updates.
5. **PII Isolation & Query Enforcer**:
   - `/users/{userId}` can only be read (`get`) by the document owner (`request.auth.uid == userId`) or `isAdmin()`. `list` on `/users` is denied for non-admins.
   - `/students/{studentId}` and `/transactions/{transactionId}` enforce `existing().createdBy == request.auth.uid` on `get` and `list` so queries cannot scrape records across unauthorized accounts.
6. **Relational & Atomic Consistency**:
   - A `Transaction` cannot be created unless the referenced `/students/$(incoming().studentId)` document exists, belongs to `request.auth.uid`, and is updated atomically in the same batch (`getAfter(/databases/$(database)/documents/students/$(incoming().studentId)).data.updatedAt == request.time`).
   - Deleting (voiding) a `Transaction` requires atomic refund update on `/students/$(existing().studentId)` (`getAfter(/databases/$(database)/documents/students/$(existing().studentId)).data.updatedAt == request.time`).
7. **Temporal & Immutable Fields**:
   - `createdAt == request.time` on `create`, and `incoming().createdAt == existing().createdAt` on `update`.
   - `updatedAt == request.time` on both `create` and `update`.
   - `createdBy == request.auth.uid` on `create`, and `incoming().createdBy == existing().createdBy` on `update`.

## 2. The "Dirty Dozen" Payloads

1. **Unverified Admin Email Spoof**: Authenticated user with `email == 'diyanto13@gmail.com'` but `email_verified == false` attempting to create a student.
2. **Self-Assigned Cashier Role Escalation**: Non-admin user creating `/users/{uid}` with `role: 'kasir'`.
3. **Shadow Field Injection on Student**: Creating `/students/std_1` with required fields plus ghost field `"isScholarship": true`.
4. **Cross-User Student PII Read**: User B (`uid_b`) attempting `get` on `/students/std_1` where `createdBy == 'uid_a'`.
5. **Unfiltered Student List Scraping**: User B attempting `list` on `/students` without matching `resource.data.createdBy == request.auth.uid`.
6. **ID Poisoning Attack**: Creating `/students/bad$id!@#` with invalid characters in document ID.
7. **Denial-of-Wallet String Overflow**: Updating `/students/std_1` with a `name` string of 5,000 characters (`size() > 120`).
8. **Negative Balance Injection**: Updating `/students/std_1` with `sppBalance: -500000`.
9. **Orphaned Transaction Creation**: Creating `/transactions/tx_1` referencing a non-existent `studentId: 'ghost_student'`.
10. **Non-Atomic Transaction Write**: Creating `/transactions/tx_1` without updating `/students/$(studentId)` in the same batch (`getAfter` timestamp check fails).
11. **Non-Atomic Transaction Void (Delete)**: Deleting `/transactions/tx_1` without refunding `/students/$(studentId)` in the same transaction.
12. **Client Timestamp Forgery**: Creating `/students/std_1` with a forged past/future `createdAt` timestamp (`createdAt != request.time`).
