# PipGrid Firestore Security Specification

## 1. Data Invariants
1. **Default Deny**: No path is accessible unless explicitly matched and authorized.
2. **Verified Identity Only**: All client reads and writes require `request.auth != null` and `request.auth.token.email_verified == true`.
3. **Zero Privilege Escalation**: `/users/{userId}` creation strictly pins `role == 'user'`. `/admins/{userId}` is read-only for the owner (`request.auth.uid == userId`) and strictly denies all client writes.
4. **Master Gate Relational Sync**: Every subcollection write under `/users/{userId}/...` verifies parent `/users/{userId}` exists and `get(...).data.uid == request.auth.uid`.
5. **PII Isolation**: Email and Exness account ID live exclusively under `/users/{userId}/private/{docId}`, readable only by owner or verified admin (`samjakoyo26@gmail.com` or `/admins/{uid}`).
6. **Strict Schema & Bounds**: Every document enforces exact `keys().hasAll` + `keys().hasOnly`, `isValidId()`, string `.size()` limits, server timestamps (`request.time`), and immutable `uid` / `createdAt`.
7. **Secure List Queries**: `allow list` validates `resource.data.uid == request.auth.uid || isAdmin()` without calling `get()` or `exists()`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Read**: `GET /users/uid_alice` with `auth = null` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: `GET /users/uid_alice/private/info` with `email = 'samjakoyo26@gmail.com'`, `email_verified = false` -> `PERMISSION_DENIED`.
3. **Self-Assigned Admin Role**: `CREATE /users/uid_alice` with `{ uid: 'uid_alice', displayName: 'Alice', role: 'admin', createdAt: serverTimestamp, updatedAt: serverTimestamp }` -> `PERMISSION_DENIED`.
4. **Ghost / Shadow Field Injection**: `CREATE /users/uid_alice` with extra `{ isVerified: true }` -> `PERMISSION_DENIED`.
5. **Identity Spoofing on Subcollection**: `CREATE /users/uid_alice/savedSetups/s1` by `uid_bob` with `uid: 'uid_alice'` -> `PERMISSION_DENIED`.
6. **Cross-Tenant UID Hijack**: `CREATE /users/uid_alice/savedSetups/s1` by `uid_alice` with `uid: 'uid_bob'` -> `PERMISSION_DENIED`.
7. **ID Poisoning (Oversized / Invalid Chars)**: `CREATE /users/uid_alice/savedSetups/bad$id..` or 200-char ID -> `PERMISSION_DENIED`.
8. **Denial-of-Wallet String Overflow**: `CREATE /users/uid_alice/savedSetups/s1` with 2,000-character `notes` -> `PERMISSION_DENIED`.
9. **Client-Forged Timestamp**: `CREATE /users/uid_alice/savedSetups/s1` with `createdAt: Timestamp(2020-01-01)` instead of `request.time` -> `PERMISSION_DENIED`.
10. **Immutable Field Mutation**: `UPDATE /users/uid_alice/savedSetups/s1` attempting to alter `uid` or `createdAt` -> `PERMISSION_DENIED`.
11. **Direct Admin Registry Tampering**: `CREATE /admins/uid_bob` by `uid_bob` -> `PERMISSION_DENIED`.
12. **Unfiltered Collection Scraping**: `LIST /users/uid_alice/savedSetups` by `uid_bob` -> `PERMISSION_DENIED`.
