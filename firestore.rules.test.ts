/**
 * Firestore Security Rules Test Suite (Dirty Dozen Verification)
 * Verifies that all 12 adversarial payloads in security_spec.md return PERMISSION_DENIED.
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  collection: string;
  docId: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: {
    uid: string;
    email: string;
    email_verified: boolean;
  } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Unverified Admin Email Spoof',
    collection: 'students',
    docId: 'std_1',
    operation: 'create',
    auth: { uid: 'spoof_uid', email: 'diyanto13@gmail.com', email_verified: false },
    payload: { nis: '1001', name: 'Budi' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Self-Assigned Cashier Role Escalation',
    collection: 'users',
    docId: 'user_regular',
    operation: 'create',
    auth: { uid: 'user_regular', email: 'guest@example.com', email_verified: true },
    payload: {
      uid: 'user_regular',
      name: 'Guest',
      email: 'guest@example.com',
      role: 'kasir',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field Injection on Student',
    collection: 'students',
    docId: 'std_1',
    operation: 'create',
    auth: { uid: 'admin_1', email: 'diyanto13@gmail.com', email_verified: true },
    payload: {
      nis: '1001',
      name: 'Siti Aminah',
      isScholarship: true, // Ghost field not in hasOnly
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Cross-User Student PII Read',
    collection: 'students',
    docId: 'std_owned_by_a',
    operation: 'get',
    auth: { uid: 'user_b', email: 'userb@example.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Unfiltered Student List Scraping',
    collection: 'students',
    docId: '*',
    operation: 'list',
    auth: { uid: 'user_b', email: 'userb@example.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'ID Poisoning Attack',
    collection: 'students',
    docId: 'invalid$id!@#',
    operation: 'create',
    auth: { uid: 'admin_1', email: 'diyanto13@gmail.com', email_verified: true },
    payload: { nis: '1001', name: 'Valid Name' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Denial-of-Wallet String Overflow',
    collection: 'students',
    docId: 'std_1',
    operation: 'update',
    auth: { uid: 'admin_1', email: 'diyanto13@gmail.com', email_verified: true },
    payload: { name: 'A'.repeat(500) },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Negative Balance Injection',
    collection: 'students',
    docId: 'std_1',
    operation: 'update',
    auth: { uid: 'admin_1', email: 'diyanto13@gmail.com', email_verified: true },
    payload: { sppBalance: -300000 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Orphaned Transaction Creation',
    collection: 'transactions',
    docId: 'tx_1',
    operation: 'create',
    auth: { uid: 'admin_1', email: 'diyanto13@gmail.com', email_verified: true },
    payload: { studentId: 'non_existent_student', totalAmount: 300000 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Non-Atomic Transaction Write',
    collection: 'transactions',
    docId: 'tx_1',
    operation: 'create',
    auth: { uid: 'admin_1', email: 'diyanto13@gmail.com', email_verified: true },
    payload: { studentId: 'std_1', totalAmount: 300000, atomicStudentUpdate: false },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Non-Atomic Transaction Void (Delete)',
    collection: 'transactions',
    docId: 'tx_1',
    operation: 'delete',
    auth: { uid: 'admin_1', email: 'diyanto13@gmail.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Client Timestamp Forgery',
    collection: 'students',
    docId: 'std_1',
    operation: 'create',
    auth: { uid: 'admin_1', email: 'diyanto13@gmail.com', email_verified: true },
    payload: { createdAt: '2020-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
];
