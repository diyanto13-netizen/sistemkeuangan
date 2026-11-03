import { Timestamp } from 'firebase/firestore';

export type UserRole = 'kasir' | 'kepsek';

export type FinancialThemeId = 'emerald' | 'teal' | 'indigo' | 'amber' | 'navy';

export interface FinancialColorTheme {
  id: FinancialThemeId;
  name: string;
  badge: string;
  primaryHex: string;
  secondaryHex: string;
  surfaceHex: string;
  swatchClass: string;
  psychology: string;
  usageRef: string;
}

export const FINANCIAL_COLOR_THEMES: FinancialColorTheme[] = [
  {
    id: 'emerald',
    name: 'Emerald Sovereign',
    badge: 'Direkomendasikan (Default Baru)',
    primaryHex: '#047857',
    secondaryHex: '#065f46',
    surfaceHex: '#ECFDF5',
    swatchClass: 'bg-[#047857]',
    psychology:
      'Melambangkan pertumbuhan kas, kemakmuran institusi, stabilitas, dan keseimbangan akuntansi. Sangat nyaman di mata kasir untuk pemakaian jangka panjang.',
    usageRef: 'Private Banking, Wealth Management, & Sistem Kas Institusi Modern',
  },
  {
    id: 'teal',
    name: 'Teal Sapphire Fintech',
    badge: 'Modern Treasury',
    primaryHex: '#0F766E',
    secondaryHex: '#115E59',
    surfaceHex: '#F0FDFA',
    swatchClass: 'bg-[#0F766E]',
    psychology:
      'Perpaduan ketenangan biru dan ketajaman hijau zamrud. Memberikan kontras tinggi pada tabel buku kas, angka rupiah, dan status pembayaran.',
    usageRef: 'Fintech Korporat, Digital Treasury, & Dashboard Analitik Keuangan',
  },
  {
    id: 'indigo',
    name: 'Executive Royal Indigo',
    badge: 'Enterprise ERP',
    primaryHex: '#4338CA',
    secondaryHex: '#3730A3',
    surfaceHex: '#EEF2FF',
    swatchClass: 'bg-[#4338CA]',
    psychology:
      'Mencerminkan integritas sistem, presisi teknologi finansial, dan kewibawaan manajerial tingkat eksekutif.',
    usageRef: 'Sistem ERP Pemerintahan, Stripe Financial Suite, & Perbankan Digital',
  },
  {
    id: 'amber',
    name: 'Sovereign Amber Gold',
    badge: 'Executive Prestige',
    primaryHex: '#B45309',
    secondaryHex: '#92400E',
    surfaceHex: '#FFFBEB',
    swatchClass: 'bg-[#B45309]',
    psychology:
      'Nuansa emas-perunggu formal yang berpadu dengan latar slate/grafit, menghadirkan kesan eksklusif, prestisius, dan audit resmi.',
    usageRef: 'Lembaga Keuangan Eksekutif, Audit Internal, & Yayasan Pendidikan',
  },
  {
    id: 'navy',
    name: 'Classic Corporate Navy',
    badge: 'Warna Default Sebelumnya',
    primaryHex: '#1D4ED8',
    secondaryHex: '#1E40AF',
    surfaceHex: '#EFF6FF',
    swatchClass: 'bg-[#1D4ED8]',
    psychology:
      'Biru korporat klasik yang melambangkan keamanan, kepatuhan prosedur, dan kepercayaan publik.',
    usageRef: 'Perbankan Konvensional & Administrasi Tata Usaha',
  },
];

export type GradeLevel = 'X' | 'XI' | 'XII';

export type PaymentCategory =
  | 'SPP'
  | 'DSP'
  | 'Pembiayaan Kelas XII'
  | 'Pembiayaan Kelas XI';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Student {
  id: string;
  nis: string;
  name: string;
  className: string;
  gradeLevel: GradeLevel;
  major: string;
  waNumber: string;
  sppBalance: number;
  dspBalance: number;
  class11Balance: number;
  class12Balance: number;
  totalBalance: number;
  paidMonths: string[];
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Transaction {
  id: string;
  receiptNo: string;
  studentId: string;
  studentNis: string;
  studentName: string;
  studentClass: string;
  studentMajor: string;
  waNumber: string;
  payerName: string;
  category: PaymentCategory | 'MULTI';
  sppAmount: number;
  dspAmount: number;
  class11Amount: number;
  class12Amount: number;
  totalAmount: number;
  sppMonths: string[];
  sppYear: string;
  notes: string;
  cashierName: string;
  txDate: string; // YYYY-MM-DD
  status: 'completed';
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CartItem {
  id: string;
  category: PaymentCategory;
  amount: number;
  sppMonths: string[];
  sppYear: string;
  description: string;
}

export const SPP_MONTHLY_FEE = 300000;

export const ACADEMIC_MONTHS = [
  { code: '07', name: 'Juli' },
  { code: '08', name: 'Agustus' },
  { code: '09', name: 'September' },
  { code: '10', name: 'Oktober' },
  { code: '11', name: 'November' },
  { code: '12', name: 'Desember' },
  { code: '01', name: 'Januari' },
  { code: '02', name: 'Februari' },
  { code: '03', name: 'Maret' },
  { code: '04', name: 'April' },
  { code: '05', name: 'Mei' },
  { code: '06', name: 'Juni' },
];

export const DEFAULT_TARIFF_BY_GRADE: Record<
  GradeLevel,
  {
    sppBalance: number;
    dspBalance: number;
    class11Balance: number;
    class12Balance: number;
  }
> = {
  X: {
    sppBalance: 3600000, // 12 bulan x Rp 300.000
    dspBalance: 2500000, // DSP awal kelas X
    class11Balance: 0,
    class12Balance: 0,
  },
  XI: {
    sppBalance: 3600000,
    dspBalance: 1000000,
    class11Balance: 1500000, // Praktikum & PKL Kelas XI
    class12Balance: 0,
  },
  XII: {
    sppBalance: 3600000,
    dspBalance: 0,
    class11Balance: 0,
    class12Balance: 2200000, // Ujian Kompetensi & Kelulusan Kelas XII
  },
};

export const SCHOOL_MAJORS = [
  'Teknik Komputer & Jaringan (TKJ)',
  'Rekayasa Perangkat Lunak (RPL)',
  'Akuntansi & Keuangan Lembaga (AKL)',
  'Otomatisasi Tata Kelola Perkantoran (OTKP)',
  'Bisnis Daring & Pemasaran (BDP)',
  'Teknik Kendaraan Ringan (TKR)',
];

/**
 * Deteksi otomatis tingkat kelas ("X", "XI", "XII") dari input string kelas.
 * Urutan pengecekan XII -> XI -> X agar tidak salah mendeteksi awalan X.
 */
export function detectGradeLevelFromClass(classInput: string): GradeLevel {
  const normalized = classInput.trim().toUpperCase();
  if (/\bXII\b|^XII|\b12\b|^12/.test(normalized)) {
    return 'XII';
  }
  if (/\bXI\b|^XI|\b11\b|^11/.test(normalized)) {
    return 'XI';
  }
  return 'X';
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(amount || 0)));
}

export function normalizeWaNumber(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return '6281200000000';
  if (digits.startsWith('0')) {
    return '62' + digits.slice(1);
  }
  if (digits.startsWith('8')) {
    return '62' + digits;
  }
  return digits.slice(0, 20);
}

export interface SchoolSettings {
  schoolName: string;
  schoolSubtitle: string;
  schoolAddress: string;
  schoolContact: string;
  schoolCity: string;
  logoDataUrl: string;
  cashierName: string;
  cashierNip: string;
  cashierEmail: string;
  cashierPasswordHint: string;
  principalName: string;
  principalNip: string;
  principalEmail: string;
  principalPasswordHint: string;
  treasurerName?: string;
  treasurerNip?: string;
  bankName?: string;
  bankAccountNo?: string;
  bankAccountHolder?: string;
  updatedBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export const DEFAULT_SCHOOL_SETTINGS: SchoolSettings = {
  schoolName: 'SMKS PGRI 1 SUKABUMI',
  schoolSubtitle: 'YAYASAN PEMBINA LEMBAGA PENDIDIKAN PGRI KOTA SUKABUMI',
  schoolAddress: 'Jl. Pelabuhan II, Kota Sukabumi, Jawa Barat',
  schoolContact: 'Telp: (0266) 221xxx | Email: info@smkspgri1sukabumi.sch.id',
  schoolCity: 'Sukabumi',
  logoDataUrl: '',
  cashierName: 'Dra. Hj. Siti Aminah, M.MPd',
  cashierNip: 'NIP/NUPTK. 19780512 200501 2 008',
  cashierEmail: 'kasir@smkspgri1.sch.id',
  cashierPasswordHint: 'SmksPgri1#2026',
  principalName: 'Drs. H. Dadang Suryana, M.Pd',
  principalNip: 'NIP/NUPTK. 19690410 199412 1 002',
  principalEmail: 'kepsek@smkspgri1.sch.id',
  principalPasswordHint: 'SmksPgri1#2026',
  treasurerName: 'Esih Sukaesih',
  treasurerNip: '',
  bankName: 'Bank BRI',
  bankAccountNo: '0092-0101-11495-39',
  bankAccountHolder: 'SMK PGRI 1',
};

export function buildReceiptWhatsAppUrl(
  tx: Transaction,
  remainingBalance: number,
  settings: SchoolSettings = DEFAULT_SCHOOL_SETTINGS
): string {
  const phone = normalizeWaNumber(tx.waNumber);
  const details: string[] = [];
  if (tx.sppAmount > 0) {
    const monthsLabel = tx.sppMonths.length > 0 ? ` (${tx.sppMonths.join(', ')})` : '';
    details.push(`- SPP${monthsLabel}: ${formatRupiah(tx.sppAmount)}`);
  }
  if (tx.dspAmount > 0) {
    details.push(`- DSP: ${formatRupiah(tx.dspAmount)}`);
  }
  if (tx.class11Amount > 0) {
    details.push(`- Pembiayaan Kelas XI: ${formatRupiah(tx.class11Amount)}`);
  }
  if (tx.class12Amount > 0) {
    details.push(`- Pembiayaan Kelas XII: ${formatRupiah(tx.class12Amount)}`);
  }

  const message = [
    `*BUKTI PEMBAYARAN RESMI*`,
    `*${settings.schoolName.toUpperCase()}*`,
    `----------------------------------------`,
    `No. Kuitansi : ${tx.receiptNo}`,
    `Tanggal      : ${tx.txDate}`,
    `Siswa        : ${tx.studentName} (${tx.studentNis})`,
    `Kelas        : ${tx.studentClass} - ${tx.studentMajor}`,
    `Penyetor     : ${tx.payerName}`,
    `----------------------------------------`,
    `*Rincian Pembayaran:*`,
    ...details,
    `----------------------------------------`,
    `*Total Bayar : ${formatRupiah(tx.totalAmount)}*`,
    `Sisa Tagihan : ${formatRupiah(remainingBalance)}`,
    `Petugas Kasir: ${tx.cashierName || settings.cashierName}`,
    ``,
    `Terima kasih atas pembayaran Bapak/Ibu Wali Murid. Simpan pesan ini sebagai bukti pembayaran digital yang sah.`,
  ].join('\n');

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function buildBillingWhatsAppUrl(
  student: Student,
  settings: SchoolSettings = DEFAULT_SCHOOL_SETTINGS
): string {
  const phone = normalizeWaNumber(student.waNumber);
  const lines: string[] = [];
  if (student.sppBalance > 0) {
    lines.push(`- Tunggakan SPP: ${formatRupiah(student.sppBalance)}`);
  }
  if (student.dspBalance > 0) {
    lines.push(`- Tunggakan DSP: ${formatRupiah(student.dspBalance)}`);
  }
  if (student.class11Balance > 0) {
    lines.push(`- Pembiayaan Kelas XI: ${formatRupiah(student.class11Balance)}`);
  }
  if (student.class12Balance > 0) {
    lines.push(`- Pembiayaan Kelas XII: ${formatRupiah(student.class12Balance)}`);
  }

  const bankName = settings.bankName || 'Bank BRI';
  const bankAccountNo = settings.bankAccountNo || '0092-0101-11495-39';
  const bankAccountHolder = settings.bankAccountHolder || 'SMK PGRI 1';

  const message = [
    `Yth. Bapak/Ibu Orang Tua / Wali Murid dari:`,
    `*${student.name}* (NIS: ${student.nis} / Kelas: ${student.className})`,
    ``,
    `Melalui pesan ini kami dari *Bagian Keuangan ${settings.schoolName}* menginformasikan rincian administrasi keuangan siswa per tanggal ${new Date().toISOString().slice(0, 10)}:`,
    ``,
    `*Rincian Tagihan Aktif:*`,
    ...lines,
    `----------------------------------------`,
    `*Total Tagihan: ${formatRupiah(student.totalBalance)}*`,
    ``,
    `*Metode Pembayaran:*`,
    `1. *Loket Kasir Sekolah (Tunai):*`,
    `   Dapat dibayarkan langsung ke Petugas Kasir Tata Usaha ${settings.schoolName} (${settings.schoolAddress}) pada hari dan jam kerja operasional sekolah.`,
    ``,
    `2. *Pembayaran Secara Transfer Bank (Non-Tunai):*`,
    `   - Bank: *${bankName}*`,
    `   - No. Rekening: *${bankAccountNo}*`,
    `   - Atas Nama: *${bankAccountHolder}*`,
    ``,
    `*Catatan Penting:*`,
    `Apabila telah melakukan pembayaran via Transfer Bank, mohon kirimkan foto/bukti transfer ke nomor WhatsApp ini agar petugas kasir dapat memverifikasi dan mencatatkan Kuitansi Resmi.`,
    ``,
    `Apabila pembayaran sudah diselesaikan sebelumnya, mohon abaikan pesan ini. Terima kasih atas perhatian dan kerja sama Bapak/Ibu.`,
  ].join('\n');

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

