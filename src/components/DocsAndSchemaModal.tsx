import React, { useState } from 'react';
import { Check, Copy, Download, FileCode, ShieldCheck, Database, BookOpen, X } from 'lucide-react';
import { firebaseConfig } from '../firebase';

interface DocsAndSchemaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DocsAndSchemaModal: React.FC<DocsAndSchemaModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'schema' | 'rules' | 'guide' | 'html'>('schema');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const schemaText = `// ============================================================================
// STRUKTUR SKEMA CLOUD FIRESTORE — SMKS PGRI 1 SUKABUMI
// ============================================================================

1. Koleksi: "users" (Path: /users/{userId})
   Dokumen menyimpan profil petugas dan hak akses Role-Based Access Control (RBAC):
   {
     "uid": "string (Firebase Auth UID)",
     "name": "string (Nama lengkap petugas / kepala sekolah)",
     "email": "string (Email resmi terverifikasi)",
     "role": "'kasir' | 'kepsek'", // kasir = Full CRUD, kepsek = Read-Only Eksekutif
     "createdAt": "Timestamp (serverTimestamp)",
     "updatedAt": "Timestamp (serverTimestamp)"
   }

2. Koleksi: "students" (Path: /students/{studentId})
   Dokumen master data siswa dan saldo tagihan per pos pembayaran:
   {
     "nis": "string (Nomor Induk Siswa, misal: '20261001')",
     "name": "string (Nama Lengkap Siswa)",
     "className": "string (Misal: 'X TKJ 1', 'XI RPL 2', 'XII AKL 1')",
     "gradeLevel": "'X' | 'XI' | 'XII'",
     "major": "string (Kompetensi Keahlian / Jurusan)",
     "waNumber": "string (Nomor WhatsApp Wali Murid format 628xxx)",
     "sppBalance": "number (Sisa Tagihan SPP, standar Rp 3.600.000/thn)",
     "dspBalance": "number (Sisa Tagihan DSP)",
     "class11Balance": "number (Sisa Pembiayaan Kelas XI)",
     "class12Balance": "number (Sisa Pembiayaan Kelas XII)",
     "totalBalance": "number (sppBalance + dspBalance + class11Balance + class12Balance)",
     "paidMonths": "string[] (Daftar bulan SPP lunas, misal: ['Juli 2026', 'Agustus 2026'])",
     "createdBy": "string (UID pembuat data)",
     "createdAt": "Timestamp",
     "updatedAt": "Timestamp"
   }

3. Koleksi: "transactions" (Path: /transactions/{transactionId})
   Dokumen transaksi pembayaran kasir Point of Sale (POS):
   {
     "receiptNo": "string (Nomor Kuitansi, misal: 'KWT-20261031-8421')",
     "studentId": "string (Referensi ID dokumen pada koleksi students)",
     "studentNis": "string",
     "studentName": "string",
     "studentClass": "string",
     "studentMajor": "string",
     "waNumber": "string",
     "payerName": "string (Nama penyetor / wali murid)",
     "category": "'SPP' | 'DSP' | 'Pembiayaan Kelas XII' | 'Pembiayaan Kelas XI' | 'MULTI'",
     "sppAmount": "number (Nominal pos SPP dalam transaksi ini)",
     "dspAmount": "number (Nominal pos DSP dalam transaksi ini)",
     "class11Amount": "number (Nominal pos Pembiayaan Kelas XI)",
     "class12Amount": "number (Nominal pos Pembiayaan Kelas XII)",
     "totalAmount": "number (Total nominal transaksi)",
     "sppMonths": "string[] (Bulan SPP yang dicentang saat bayar)",
     "sppYear": "string (Tahun ajaran SPP, misal '2026/2027')",
     "notes": "string (Catatan tambahan kasir)",
     "cashierName": "string (Nama petugas kasir)",
     "txDate": "string (Format YYYY-MM-DD untuk filter Rekap Harian & Buku Kas)",
     "status": "'completed'",
     "createdBy": "string (UID petugas)",
     "createdAt": "Timestamp",
     "updatedAt": "Timestamp"
   }`;

  const rulesText = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }

    function isSignedIn() {
      return request.auth != null;
    }
    function isVerified() {
      return isSignedIn() && request.auth.token.email_verified == true;
    }
    function isValidId(id) {
      return id is string && id.size() >= 1 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\\\-]+$');
    }
    function incoming() { return request.resource.data; }
    function existing() { return resource.data; }

    function isAdmin() {
      return isVerified() && (
        exists(/databases/$(database)/documents/admins/$(request.auth.uid)) ||
        request.auth.token.email == 'diyanto13@gmail.com'
      );
    }

    function isKasir() {
      return isVerified() && (
        isAdmin() ||
        (
          exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'kasir'
        )
      );
    }

    // Users RBAC Profile
    match /users/{userId} {
      allow get: if isSignedIn() && isValidId(userId) && (request.auth.uid == userId || isAdmin());
      allow list: if isSignedIn() && existing().uid == request.auth.uid;
      allow create, update: if isVerified() && isValidId(userId) && (request.auth.uid == userId || isAdmin());
      allow delete: if false;
    }

    // Master Data Siswa
    match /students/{studentId} {
      allow get: if isSignedIn() && isValidId(studentId) && (existing().createdBy == request.auth.uid || isAdmin());
      allow list: if isSignedIn() && existing().createdBy == request.auth.uid;
      allow create, update, delete: if isVerified() && isValidId(studentId) && isKasir();
    }

    // Transaksi Kasir POS (Batch Write & Atomic Refund Void)
    match /transactions/{transactionId} {
      allow get: if isSignedIn() && isValidId(transactionId) && (existing().createdBy == request.auth.uid || isAdmin());
      allow list: if isSignedIn() && existing().createdBy == request.auth.uid;
      allow create: if isVerified() && isValidId(transactionId) && isKasir() &&
        exists(/databases/$(database)/documents/students/$(incoming().studentId)) &&
        getAfter(/databases/$(database)/documents/students/$(incoming().studentId)).data.updatedAt == request.time;
      allow update: if false;
      allow delete: if isVerified() && isValidId(transactionId) && isKasir() &&
        getAfter(/databases/$(database)/documents/students/$(existing().studentId)).data.updatedAt == request.time;
    }
  }
}`;

  const guideText = `PANDUAN SETUP FIREBASE CONSOLE (SMKS PGRI 1 SUKABUMI)
====================================================================

1. Buat Project di Firebase Console:
   - Buka https://console.firebase.google.com/
   - Klik "Add project" / "Tambah proyek", beri nama misal: "keuangan-smks-pgri1-sukabumi".
   - Proyek Anda saat ini di AI Studio telah otomatis terhubung ke Project ID: "${firebaseConfig.projectId}".

2. Aktifkan Firebase Authentication:
   - Pada menu kiri Firebase Console, pilih "Build" -> "Authentication" -> klik "Get started".
   - Pilih tab "Sign-in method".
   - Aktifkan "Google" (sudah aktif secara otomatis pada environment ini).
   - Aktifkan "Email/Password" -> Toggle "Enable" -> Klik "Save".
   - Tambahkan akun Kasir & Kepala Sekolah pada tab "Users" jika ingin menggunakan login Email/Password.

3. Aktifkan Cloud Firestore Database:
   - Pada menu kiri, pilih "Build" -> "Firestore Database" -> klik "Create database".
   - Pilih lokasi server terdekat (misal: asia-southeast2 / Jakarta atau asia-southeast1 / Singapore).
   - Buka tab "Rules", tempelkan (paste) kode Firebase Security Rules dari tab sebelahnya, lalu klik "Publish".

4. Salin Objek firebaseConfig:
   - Klik ikon roda gigi (Project Settings) -> "General".
   - Gulir ke bawah ke bagian "Your apps", pilih ikon Web (</>).
   - Salin objek konstanta firebaseConfig:
     const firebaseConfig = ${JSON.stringify(firebaseConfig, null, 2)};`;

  const getActiveContent = () => {
    if (activeTab === 'schema') return schemaText;
    if (activeTab === 'rules') return rulesText;
    if (activeTab === 'guide') return guideText;
    return guideText;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getActiveContent());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Dokumentasi Arsitektur, Skema Firestore & Security Rules
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              SMKS PGRI 1 Sukabumi · Project ID: {firebaseConfig.projectId}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-6 py-2.5 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('schema')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'schema'
                  ? 'bg-blue-700 text-white'
                  : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Database className="h-3.5 w-3.5" />
              1. Skema Firestore
            </button>
            <button
              onClick={() => setActiveTab('rules')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'rules'
                  ? 'bg-blue-700 text-white'
                  : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              2. Security Rules
            </button>
            <button
              onClick={() => setActiveTab('guide')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'guide'
                  ? 'bg-blue-700 text-white'
                  : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              3. Panduan Setup Firebase
            </button>
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Tersalin' : 'Salin Kode'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100 dark:border-slate-800">
            {getActiveContent()}
          </pre>
        </div>
      </div>
    </div>
  );
};
