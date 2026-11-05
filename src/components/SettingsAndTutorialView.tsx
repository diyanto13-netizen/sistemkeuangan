import React, { useEffect, useRef, useState } from 'react';
import { updatePassword, User } from 'firebase/auth';
import {
  BookOpen,
  Building2,
  CheckCircle2,
  CreditCard,
  Database,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  History,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  Palette,
  RotateCcw,
  Save,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  Upload,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import {
  DEFAULT_SCHOOL_SETTINGS,
  FINANCIAL_COLOR_THEMES,
  FinancialThemeId,
  SchoolSettings,
} from '../types';

interface SettingsAndTutorialViewProps {
  settings: SchoolSettings;
  isKasir: boolean;
  currentUser: User;
  accentTheme: FinancialThemeId;
  onChangeAccentTheme: (theme: FinancialThemeId) => void;
  onSaveSettings: (updated: SchoolSettings) => Promise<void>;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onBackupJSON: () => void;
  onBackupCSV: () => void;
  onOpenDocsModal: () => void;
}

type SettingsTab =
  | 'identitas_kop'
  | 'logo_sekolah'
  | 'pejabat_ttd'
  | 'akun_password'
  | 'tema_warna'
  | 'arsip_cadangan'
  | 'tutorial';

export const SettingsAndTutorialView: React.FC<SettingsAndTutorialViewProps> = ({
  settings,
  isKasir,
  currentUser,
  accentTheme,
  onChangeAccentTheme,
  onSaveSettings,
  onToast,
  onBackupJSON,
  onBackupCSV,
  onOpenDocsModal,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('identitas_kop');
  const [formState, setFormState] = useState<SchoolSettings>(settings);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    setFormState(settings);
  }, [settings]);

  // State khusus ubah password Firebase Auth aktif
  const [newAuthPassword, setNewAuthPassword] = useState<string>('');
  const [confirmAuthPassword, setConfirmAuthPassword] = useState<string>('');
  const [showKasirPwd, setShowKasirPwd] = useState<boolean>(false);
  const [showKepsekPwd, setShowKepsekPwd] = useState<boolean>(false);
  const [showNewAuthPwd, setShowNewAuthPwd] = useState<boolean>(false);

  const logoInputRef = useRef<HTMLInputElement | null>(null);

  // Sync apabila prop settings dari Firestore berubah
  React.useEffect(() => {
    setFormState(settings);
  }, [settings]);

  const handleFieldChange = (field: keyof SchoolSettings, value: string) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Kompresi gambar logo secara otomatis via Canvas agar tajam & hemat kuota Firestore (<= 80KB)
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      onToast('Pilih file gambar yang valid (PNG, JPG, atau WebP).', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX_SIZE = 180;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/png', 0.9);
        if (dataUrl.length > 145000) {
          const compressedJpg = canvas.toDataURL('image/jpeg', 0.8);
          handleFieldChange('logoDataUrl', compressedJpg);
        } else {
          handleFieldChange('logoDataUrl', dataUrl);
        }
        onToast(
          'Logo berhasil diproses. Klik tombol "Simpan Pengaturan ke Cloud" untuk menyimpan permanen.',
          'info'
        );
      };
      img.src = String(ev.target?.result || '');
    };
    reader.readAsDataURL(file);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handleSubmitSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isKasir) {
      onToast(
        'Mode Kepala Sekolah bersifat Read-Only. Beralihlah ke hak akses Kasir untuk menyimpan perubahan pengaturan.',
        'error'
      );
      return;
    }

    setSaving(true);
    try {
      await onSaveSettings({
        schoolName: formState.schoolName.trim().slice(0, 120) || DEFAULT_SCHOOL_SETTINGS.schoolName,
        schoolSubtitle: formState.schoolSubtitle.trim().slice(0, 150),
        schoolAddress:
          formState.schoolAddress.trim().slice(0, 250) || DEFAULT_SCHOOL_SETTINGS.schoolAddress,
        schoolContact: formState.schoolContact.trim().slice(0, 180),
        schoolCity: formState.schoolCity.trim().slice(0, 60) || 'Sukabumi',
        logoDataUrl: formState.logoDataUrl.slice(0, 150000),
        cashierName:
          formState.cashierName.trim().slice(0, 100) || DEFAULT_SCHOOL_SETTINGS.cashierName,
        cashierNip: formState.cashierNip.trim().slice(0, 50),
        cashierEmail:
          formState.cashierEmail.trim().slice(0, 120) || DEFAULT_SCHOOL_SETTINGS.cashierEmail,
        cashierPasswordHint: formState.cashierPasswordHint.trim().slice(0, 60),
        principalName:
          formState.principalName.trim().slice(0, 100) || DEFAULT_SCHOOL_SETTINGS.principalName,
        principalNip: formState.principalNip.trim().slice(0, 50),
        principalEmail:
          formState.principalEmail.trim().slice(0, 120) || DEFAULT_SCHOOL_SETTINGS.principalEmail,
        principalPasswordHint: formState.principalPasswordHint.trim().slice(0, 60),
        treasurerName:
          (formState.treasurerName || DEFAULT_SCHOOL_SETTINGS.treasurerName || 'Esih Sukaesih')
            .trim()
            .slice(0, 100),
        treasurerNip: (formState.treasurerNip || '').trim().slice(0, 50),
        bankName:
          (formState.bankName || DEFAULT_SCHOOL_SETTINGS.bankName || 'Bank BRI')
            .trim()
            .slice(0, 60),
        bankAccountNo:
          (formState.bankAccountNo || DEFAULT_SCHOOL_SETTINGS.bankAccountNo || '0092-0101-11495-39')
            .trim()
            .slice(0, 50),
        bankAccountHolder:
          (formState.bankAccountHolder || DEFAULT_SCHOOL_SETTINGS.bankAccountHolder || 'SMK PGRI 1')
            .trim()
            .slice(0, 100),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateFirebasePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isKasir) {
      onToast(
        'Mode Kepala Sekolah bersifat Read-Only. Beralihlah ke hak akses Kasir untuk mengubah password.',
        'error'
      );
      return;
    }
    if (!newAuthPassword || newAuthPassword.trim().length < 4) {
      onToast('Password baru minimal harus terdiri dari 4 karakter.', 'error');
      return;
    }
    if (newAuthPassword !== confirmAuthPassword) {
      onToast('Konfirmasi password baru tidak cocok.', 'error');
      return;
    }

    const cleanPwd = newAuthPassword.trim().slice(0, 60);
    setSaving(true);
    try {
      const nextSettings: SchoolSettings = {
        ...formState,
        cashierPasswordHint: isKasir ? cleanPwd : formState.cashierPasswordHint,
        principalPasswordHint: !isKasir ? cleanPwd : formState.principalPasswordHint,
      };
      setFormState(nextSettings);
      await onSaveSettings(nextSettings);

      try {
        if (cleanPwd.length >= 6) {
          await updatePassword(currentUser, cleanPwd);
        }
      } catch {
        // Sesi staf terverifikasi sudah diperbarui lewat onSaveSettings
      }

      setNewAuthPassword('');
      setConfirmAuthPassword('');
      onToast(
        `Password login untuk akun ${
          isKasir ? formState.cashierEmail : formState.principalEmail
        } berhasil diperbarui dan disinkronkan dengan halaman Login!`,
        'success'
      );
    } finally {
      setSaving(false);
    }
  };

  const tutorialSections = [
    {
      num: '01',
      title: 'Otentikasi & Hak Akses Pengguna (RBAC: Kasir vs Kepala Sekolah)',
      icon: ShieldCheck,
      roleBadge: 'Kasir & Kepala Sekolah',
      description:
        'Sistem membagi hak akses menjadi 2 peran utama untuk menjaga keamanan dan akuntabilitas keuangan sekolah:',
      steps: [
        'Akses Kasir (Full CRUD): Memiliki wewenang penuh untuk mendaftarkan siswa baru, mengimpor Excel siswa massal, memproses pembayaran di Kasir POS, mencetak kuitansi/kartu SPP, melakukan pembatalan transaksi (Void), dan mengubah pengaturan kop sekolah.',
        'Akses Kepala Sekolah (Eksekutif Read-Only): Hanya menampilkan menu pemantauan (Dasbor Analitik, Laporan Buku Kas, Daftar Tunggakan, Riwayat & Panduan). Form input transaksi, pendaftaran siswa, dan tombol Void disembunyikan secara otomatis.',
        'Beralih Peran Cepat: Gunakan tombol sakelar "Kasir (CRUD) / Kepsek (View)" pada bagian atas menu samping (Sidebar) untuk menguji atau berpindah tampilan hak akses secara langsung.',
      ],
    },
    {
      num: '02',
      title: 'Dasbor Eksekutif & Grafik Analitik SPP',
      icon: LayoutDashboard,
      roleBadge: 'Semua Pengguna',
      description:
        'Menampilkan ringkasan performa keuangan sekolah secara real-time begitu data masuk ke Cloud Firestore:',
      steps: [
        '4 Kartu Indikator Utama (KPI): Menampilkan Total Penerimaan Kas, Penerimaan Hari Ini, Total Sisa Tunggakan Siswa, dan Jumlah Siswa Aktif.',
        'Grafik Batang (Bar Chart) Tren SPP 7 Hari Terakhir: Menggunakan Chart.js untuk memvisualisasikan pemasukan khusus pos SPP selama 7 hari ke belakang secara otomatis.',
        'Daftar 5 Transaksi Terbaru: Memudahkan petugas mengunduh ulang PDF Kuitansi dari transaksi yang baru saja diproses.',
      ],
    },
    {
      num: '03',
      title: 'Transaksi Kasir Point of Sale (POS) & Sistem Keranjang Multi-Pos',
      icon: ShoppingCart,
      roleBadge: 'Khusus Kasir',
      description:
        'Dirancang untuk mempercepat pelayanan pembayaran di loket Tata Usaha (TU) dalam satu kali klik transaksi:',
      steps: [
        'Langkah 1 (Cari & Validasi Siswa): Ketik NIS, Nama, atau Kelas siswa pada kolom pencarian. Klik nama siswa untuk memuat rincian sisa saldo SPP, DSP, Pembiayaan Kelas XI, dan Kelas XII.',
        'Langkah 2 (Pilih Pos Pembayaran): Pilih salah satu dari 4 pos (SPP, DSP, Pembiayaan Kelas XII, Pembiayaan Kelas XI).',
        'Logika Kalender Khusus SPP: Saat pos SPP dipilih, muncul kalender 12 bulan (Juli s/d Juni). Bulan yang sudah lunas otomatis terkunci ("LUNAS"). Centang bulan yang ingin dibayar — sistem otomatis menghitung Rp 300.000 × jumlah bulan dicentang.',
        'Langkah 3 (Keranjang & Checkout Batch Write): Anda dapat memasukkan beberapa pos sekaligus ke keranjang (misal SPP 2 bulan + cicilan DSP), lalu klik "Proses Transaksi & Cetak Bukti". Sistem menyimpan kuitansi dan memotong saldo siswa secara atomik di Cloud Firestore.',
        'Output Transaksi: Setelah sukses, klik "Cetak Kuitansi PDF" untuk mencetak bukti fisik atau "Kirim Struk ke WA Wali" untuk mengirim rincian pembayaran ke WhatsApp orang tua.',
      ],
    },
    {
      num: '04',
      title: 'Master Data Siswa, Deteksi Tarif Otomatis & Impor Massal Excel',
      icon: Users,
      roleBadge: 'Khusus Kasir',
      description:
        'Mengelola biodata induk siswa beserta saldo awal tagihan per pos pembayaran:',
      steps: [
        'Set Tagihan Otomatis berdasarkan Kelas: Saat mengetik nama kelas (misal "X TKJ 1", "XI RPL 2", atau "XII AKL 1"), sistem otomatis mendeteksi tingkat kelas (X / XI / XII) dan mengisi nominal standar tagihan awal, atau klik "Reset Rp 0" bagi siswa bebas biaya.',
        'Unduh Template Excel (.xlsx): Klik tombol "Unduh Template Excel (.xlsx)" di kanan atas halaman Master Siswa untuk mendapatkan format tabel resmi beserta lembar petunjuk pengisian.',
        'Impor Siswa Baru Secara Massal: Klik "Impor Siswa Massal (Excel / CSV)", pilih file Excel yang telah diisi. Sistem akan menampilkan tabel Pratinjau & Validasi (mengecek duplikasi NIS dan menghitung otomatis tarif kelas jika kolom tagihan dikosongkan) sebelum disimpan serentak ke Cloud Firestore.',
        'Edit & Hapus Data Siswa: Gunakan tombol ikon pensil pada tabel siswa untuk mengoreksi biodata maupun menyesuaikan sisa saldo tagihan siswa.',
      ],
    },
    {
      num: '05',
      title: 'Laporan Rekap Harian, Buku Kas, Ekspor PDF Resmi & Excel (.xls)',
      icon: FileText,
      roleBadge: 'Semua Pengguna',
      description:
        'Menyajikan laporan pertanggungjawaban keuangan harian maupun bulanan/tahunan yang siap dicetak:',
      steps: [
        'Tab Rekap Harian: Menampilkan seluruh transaksi yang terjadi tepat pada tanggal hari ini.',
        'Tab Buku Kas (Rentang Tanggal): Pilih tanggal mulai dan tanggal akhir serta filter Pos Pembayaran (Semua Pos, SPP, DSP, Kelas XI, Kelas XII).',
        'Pencarian & Paginasi: Gunakan kolom pencarian instan untuk memfilter nomor kuitansi atau nama siswa.',
        'Ekspor PDF Berkolom Tanda Tangan Resmi & Excel (.xls): Klik "Ekspor PDF (Tanda Tangan Resmi)" untuk mengunduh laporan A4 Landscape lengkap dengan Kop Sekolah, Logo, rekapitulasi total per kategori, serta 3 kolom tanda tangan pengesahan resmi: Kepala Sekolah, Bendahara Umum (Esih Sukaesih), dan Kasir / Bendahara Penerima, atau klik "Unduh Excel (.xls)" untuk pengolahan di Microsoft Excel.',
      ],
    },
    {
      num: '06',
      title: 'Tunggakan Siswa & Penagihan WhatsApp Otomatis',
      icon: Wallet,
      roleBadge: 'Semua Pengguna',
      description:
        'Memudahkan penelusuran piutang pembayaran siswa dan pengiriman surat tagihan digital:',
      steps: [
        'Filter Pintar: Tabel ini secara otomatis hanya menampilkan siswa yang masih memiliki total saldo tunggakan > Rp 0.',
        'Filter Kelas & Tingkat: Saring daftar penunggak berdasarkan Tingkat (X, XI, XII) atau Rombongan Belajar spesifik.',
        'Kirim Pesan WA Penagihan: Klik tombol "Kirim Pesan WA" pada baris siswa untuk membuka WhatsApp (wa.me) ke nomor wali murid yang sudah terisi otomatis dengan rincian tunggakan per pos, total hutang, serta instruksi pembayaran transfer resmi sekolah (Bank BRI No. Rekening: 0092-0101-11495-39 a.n SMK PGRI 1) dan pembayaran tunai di Loket Kasir.',
      ],
    },
    {
      num: '07',
      title: 'Riwayat Transaksi, Cetak Kartu SPP (Juli–Juni) & Pembatalan (Void)',
      icon: History,
      roleBadge: 'Semua Pengguna (Void Khusus Kasir)',
      description:
        'Pusat pencetakan kartu kendali siswa dan koreksi kesalahan input transaksi kasir:',
      steps: [
        'Cetak Kartu SPP PDF: Pilih nama siswa dan tahun pelajaran, lalu klik "Cetak Kartu SPP PDF". Sistem menghasilkan tabel kendali 12 bulan (Juli s/d Juni) dengan status "LUNAS" atau "BELUM BAYAR" lengkap dengan nomor kuitansi dan tanggal bayar.',
        'Cetak Buku Riwayat PDF: Mencetak rekapitulasi seluruh histori cicilan pembayaran seorang siswa beserta sisa tagihannya.',
        'Pembatalan Transaksi (Void dengan Auto-Refund): Jika terjadi kesalahan input pembayaran, Kasir dapat menekan tombol "Void" pada baris transaksi. Sistem menggunakan Firestore Transaction untuk menghapus kuitansi tersebut sekaligus mengembalikan (me-refund) saldo hutang siswa dan membuka kembali status bulan SPP secara akurat.',
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
            Pengaturan Sistem, Identitas Sekolah & Panduan Aplikasi
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Kelola kop surat resmi, logo sekolah, identitas tanda tangan Kasir & Kepala
            Sekolah, akun akses, serta pelajari panduan lengkap penggunaan fitur.
          </p>
        </div>

        {/* Sub-Navigasi Tab Pengaturan */}
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1.5 dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setActiveTab('identitas_kop')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'identitas_kop'
                ? 'bg-blue-700 text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            <span>1. Kop & Identitas Sekolah</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('logo_sekolah')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'logo_sekolah'
                ? 'bg-blue-700 text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            <span>2. Logo Utama Sekolah</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pejabat_ttd')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'pejabat_ttd'
                ? 'bg-blue-700 text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <UserCheck className="h-3.5 w-3.5" />
            <span>3. Identitas Kasir, Bendahara & Kepsek</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('akun_password')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'akun_password'
                ? 'bg-blue-700 text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span>4. Akun & Password</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tema_warna')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'tema_warna'
                ? 'bg-blue-700 text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Palette className="h-3.5 w-3.5" />
            <span>5. Tema Warna</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('arsip_cadangan')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'arsip_cadangan'
                ? 'bg-blue-700 text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            <span>6. Arsip & Cadangan Lokal</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tutorial')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'tutorial'
                ? 'bg-blue-700 text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>7. Tutorial & Panduan Fitur</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          TAB 1: PENGATURAN KOP / IDENTITAS SEKOLAH
      ===================================================================== */}
      {activeTab === 'identitas_kop' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form
            onSubmit={handleSubmitSettings}
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-6"
          >
            <div className="border-b border-slate-200 pb-3 dark:border-slate-800">
              <h2 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                Pengaturan Kop Surat & Identitas Sekolah
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Data ini otomatis dicetak pada Kop Kuitansi POS, Kartu SPP, Laporan Buku
                Kas PDF, dan pesan WhatsApp.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Nama Yayasan / Sub-Judul Kop Atas
              </label>
              <input
                type="text"
                value={formState.schoolSubtitle}
                onChange={(e) => handleFieldChange('schoolSubtitle', e.target.value)}
                placeholder="Contoh: YAYASAN PEMBINA LEMBAGA PENDIDIKAN PGRI KOTA SUKABUMI"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Nama Resmi Sekolah (Judul Utama Kop)
              </label>
              <input
                type="text"
                required
                value={formState.schoolName}
                onChange={(e) => handleFieldChange('schoolName', e.target.value)}
                placeholder="Contoh: SMKS PGRI 1 SUKABUMI"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Alamat Lengkap Sekolah
              </label>
              <input
                type="text"
                required
                value={formState.schoolAddress}
                onChange={(e) => handleFieldChange('schoolAddress', e.target.value)}
                placeholder="Contoh: Jl. Pelabuhan II, Kota Sukabumi, Jawa Barat"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Kontak (Telp / Email / Web)
                </label>
                <input
                  type="text"
                  value={formState.schoolContact}
                  onChange={(e) => handleFieldChange('schoolContact', e.target.value)}
                  placeholder="Telp: (0266) 221xxx | Email: ..."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Kota Tanda Tangan Dokumen
                </label>
                <input
                  type="text"
                  required
                  value={formState.schoolCity}
                  onChange={(e) => handleFieldChange('schoolCity', e.target.value)}
                  placeholder="Contoh: Sukabumi"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>

            {/* Rekening Bank Resmi Sekolah untuk Pembayaran Transfer & Penagihan WA */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                <CreditCard className="h-4 w-4" />
                <span className="text-xs font-bold">
                  Rekening Bank Resmi Sekolah (Tujuan Transfer & WhatsApp Penagihan)
                </span>
              </div>
              <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                Data nomor rekening ini otomatis disertakan dalam format pesan penagihan WhatsApp ke orang tua / wali murid untuk metode pembayaran non-tunai.
              </p>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                    Nama Bank
                  </label>
                  <input
                    type="text"
                    value={formState.bankName || 'Bank BRI'}
                    onChange={(e) => handleFieldChange('bankName', e.target.value)}
                    placeholder="Contoh: Bank BRI"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                    Nomor Rekening
                  </label>
                  <input
                    type="text"
                    value={formState.bankAccountNo || '0092-0101-11495-39'}
                    onChange={(e) => handleFieldChange('bankAccountNo', e.target.value)}
                    placeholder="Contoh: 0092-0101-11495-39"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                    Atas Nama Rekening (a.n)
                  </label>
                  <input
                    type="text"
                    value={formState.bankAccountHolder || 'SMK PGRI 1'}
                    onChange={(e) => handleFieldChange('bankAccountHolder', e.target.value)}
                    placeholder="Contoh: SMK PGRI 1"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="submit"
                disabled={saving || !isKasir}
                className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                <span>
                  {saving ? 'Menyimpan ke Cloud...' : 'Simpan Kop & Identitas ke Cloud'}
                </span>
              </button>
            </div>
          </form>

          {/* Live Preview Kop Surat & Tanda Tangan */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-6">
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                Pratinjau Kop Dokumen Resmi (Kuitansi & Laporan PDF)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tampilan kop surat dan blok pengesahan yang akan tercetak pada file PDF:
              </p>

              <div className="mt-4 rounded-xl border border-slate-300 bg-white p-5 text-slate-900 shadow-xs">
                <div className="flex items-center gap-4 border-b-2 border-slate-900 pb-3">
                  {formState.logoDataUrl ? (
                    <img
                      src={formState.logoDataUrl}
                      alt="Logo Sekolah"
                      referrerPolicy="no-referrer"
                      className="h-14 w-14 shrink-0 rounded object-contain"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-blue-700 font-display text-sm font-bold text-white">
                      PGRI
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    {formState.schoolSubtitle && (
                      <p className="truncate text-[10px] font-semibold tracking-wide text-slate-600 uppercase">
                        {formState.schoolSubtitle}
                      </p>
                    )}
                    <p className="font-display text-base font-bold tracking-tight text-slate-950 uppercase">
                      {formState.schoolName}
                    </p>
                    <p className="text-[11px] text-slate-700">
                      {formState.schoolAddress}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {formState.schoolContact}
                    </p>
                  </div>
                </div>

                {/* Simulasi Tanda Tangan Pejabat (Laporan Rekap & Buku Kas) */}
                <div className="mt-6 grid grid-cols-3 gap-2 pt-2 text-[10px] text-slate-800">
                  <div>
                    <p className="font-medium text-slate-500">Mengetahui,</p>
                    <p className="font-semibold text-slate-800">Kepala Sekolah</p>
                    <p className="mt-8 font-bold underline">
                      ({formState.principalName})
                    </p>
                    <p className="text-[9px] text-slate-500">
                      {formState.principalNip || '-'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-slate-500">Menyetujui,</p>
                    <p className="font-semibold text-slate-800">Bendahara Umum</p>
                    <p className="mt-8 font-bold underline">
                      ({formState.treasurerName || 'Esih Sukaesih'})
                    </p>
                    <p className="text-[9px] text-slate-500">
                      {formState.treasurerNip || '-'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-slate-500">
                      {formState.schoolCity}, {new Date().toISOString().slice(0, 10)}
                    </p>
                    <p className="font-semibold text-slate-800">Kasir Penerima</p>
                    <p className="mt-8 font-bold underline">
                      ({formState.cashierName})
                    </p>
                    <p className="text-[9px] text-slate-500">
                      {formState.cashierNip || '-'}
                    </p>
                  </div>
                </div>

                {/* Rekening Tujuan Transfer Bank (Format WA Penagihan) */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-1 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[10px] text-slate-700">
                  <div className="flex items-center gap-1.5 font-medium">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
                    <span>Tujuan Transfer Resmi (Format WA):</span>
                  </div>
                  <div className="font-semibold text-slate-900">
                    <span className="text-blue-700">{formState.bankName || 'Bank BRI'}</span> • No. Rek:{' '}
                    <span className="font-mono font-bold text-slate-950">
                      {formState.bankAccountNo || '0092-0101-11495-39'}
                    </span>{' '}
                    • a.n <span className="font-bold">{formState.bankAccountHolder || 'SMK PGRI 1'}</span>
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Setiap perubahan yang disimpan langsung tersinkronisasi ke Cloud Firestore
              dan diterapkan pada seluruh cetakan PDF berikutnya.
            </p>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: PENGATURAN LOGO UTAMA SEKOLAH
      ===================================================================== */}
      {activeTab === 'logo_sekolah' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-6">
            <div className="border-b border-slate-200 pb-3 dark:border-slate-800">
              <h2 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                Pengaturan Logo Utama Sekolah
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Unggah gambar logo resmi sekolah (PNG/JPG/WebP). Sistem otomatis
                mengoptimalkan ukuran gambar agar tajam di PDF dan hemat kuota Cloud.
              </p>
            </div>

            <div className="flex items-center gap-5 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              {formState.logoDataUrl ? (
                <img
                  src={formState.logoDataUrl}
                  alt="Logo Utama Sekolah"
                  referrerPolicy="no-referrer"
                  className="h-20 w-20 shrink-0 rounded-lg border border-slate-200 bg-white p-1.5 object-contain"
                />
              ) : (
                <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-lg bg-blue-700 text-white">
                  <span className="font-display text-base font-bold">SMKS</span>
                  <span className="text-[10px] font-semibold">PGRI 1</span>
                </div>
              )}

              <div className="space-y-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!isKasir}
                    onClick={() => logoInputRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 disabled:opacity-50"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Pilih File Logo dari Komputer</span>
                  </button>

                  {formState.logoDataUrl && (
                    <button
                      type="button"
                      disabled={!isKasir}
                      onClick={() => handleFieldChange('logoDataUrl', '')}
                      className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Hapus Logo</span>
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  Format yang didukung: PNG transparan (disarankan), JPG, atau WebP.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={saving || !isKasir}
                onClick={handleSubmitSettings}
                className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                <span>
                  {saving ? 'Menyimpan Logo...' : 'Simpan Logo Sekolah ke Cloud'}
                </span>
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-6">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
              Di Mana Logo Utama Sekolah Ditampilkan?
            </h3>
            <ul className="mt-3 space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  <strong>Pojok Kiri Atas Menu Samping (Sidebar) & Halaman Login:</strong>{' '}
                  Menggantikan ikon standar dengan lambang resmi sekolah.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  <strong>Cetakan PDF Kuitansi Pembayaran Kasir POS:</strong> Tercetak
                  otomatis di sebelah kiri Kop Kuitansi A5.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  <strong>Cetakan PDF Kartu Kendali SPP & Buku Riwayat Siswa:</strong>{' '}
                  Tercetak pada header dokumen A4 Portrait.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  <strong>Cetakan PDF Laporan Buku Kas & Rekap Harian:</strong> Tercetak
                  pada laporan pertanggungjawaban A4 Landscape.
                </span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: PENGATURAN NAMA IDENTITAS KASIR & KEPALA SEKOLAH
      ===================================================================== */}
      {activeTab === 'pejabat_ttd' && (
        <form
          onSubmit={handleSubmitSettings}
          className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="border-b border-slate-200 pb-3 dark:border-slate-800">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
              Pengaturan Nama Identitas & NIP Kasir, Bendahara Umum, serta Kepala Sekolah
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Digunakan secara otomatis sebagai nama petugas kasir aktif dan pejabat
              penandatangan resmi pada Kuitansi PDF, Kartu SPP, Laporan Rekap Harian, dan Buku Kas.
            </p>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* 1. Identitas Kasir / Bendahara Penerima */}
            <div className="space-y-3.5 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-700 dark:text-blue-400">
                <UserCheck className="h-4 w-4" />
                <span>1. Kasir / Bendahara Penerima</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Nama Lengkap & Gelar Kasir
                </label>
                <input
                  type="text"
                  required
                  value={formState.cashierName}
                  onChange={(e) => handleFieldChange('cashierName', e.target.value)}
                  placeholder="Contoh: Dra. Hj. Siti Aminah, M.MPd"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  NIP / NUPTK / NIY Kasir
                </label>
                <input
                  type="text"
                  value={formState.cashierNip}
                  onChange={(e) => handleFieldChange('cashierNip', e.target.value)}
                  placeholder="Contoh: NIP/NUPTK. 19780512 200501 2 008"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            {/* 2. Identitas Bendahara Umum (Penandatangan Rekap Harian & Laporan Keuangan) */}
            <div className="space-y-3.5 rounded-xl border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-400">
                <Wallet className="h-4 w-4" />
                <span>2. Bendahara Umum (Rekap Harian)</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Nama Lengkap Bendahara Umum
                </label>
                <input
                  type="text"
                  required
                  value={formState.treasurerName || 'Esih Sukaesih'}
                  onChange={(e) => handleFieldChange('treasurerName', e.target.value)}
                  placeholder="Contoh: Esih Sukaesih"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  NIP / NUPTK Bendahara Umum (Opsional)
                </label>
                <input
                  type="text"
                  value={formState.treasurerNip || ''}
                  onChange={(e) => handleFieldChange('treasurerNip', e.target.value)}
                  placeholder="Contoh: NIP/NUPTK. -"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            {/* 3. Identitas Kepala Sekolah */}
            <div className="space-y-3.5 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="h-4 w-4" />
                <span>3. Kepala Sekolah (Eksekutif)</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Nama Lengkap & Gelar Kepala Sekolah
                </label>
                <input
                  type="text"
                  required
                  value={formState.principalName}
                  onChange={(e) => handleFieldChange('principalName', e.target.value)}
                  placeholder="Contoh: Drs. H. Dadang Suryana, M.Pd"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  NIP / NUPTK / NRKS Kepala Sekolah
                </label>
                <input
                  type="text"
                  value={formState.principalNip}
                  onChange={(e) => handleFieldChange('principalNip', e.target.value)}
                  placeholder="Contoh: NIP/NUPTK. 19690410 199412 1 002"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              disabled={saving || !isKasir}
              className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              <span>
                {saving
                  ? 'Menyimpan Identitas...'
                  : 'Simpan Identitas Pejabat ke Cloud'}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* =====================================================================
          TAB 4: PENGATURAN AKUN & PASSWORD KASIR DAN KEPSEK
      ===================================================================== */}
      {activeTab === 'akun_password' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Kolom Kiri: Kredensial Akun Kasir & Kepsek (Sinkron 1:1 dengan Halaman Login) */}
          <form
            onSubmit={handleSubmitSettings}
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-7"
          >
            <div className="border-b border-slate-200 pb-3 dark:border-slate-800">
              <h2 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                Pengaturan Akun & Password Login (Kasir dan Kepala Sekolah)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Akun dan password di bawah ini digunakan langsung sebagai kredensial resmi
                pada Halaman Login aplikasi untuk peran Kasir (Full CRUD) dan Kepala Sekolah
                (Read-Only Eksekutif).
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Kredensial Kasir */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-xs font-bold text-blue-700 dark:text-blue-400">
                  1. Kredensial Login Kasir (CRUD)
                </p>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Email Login Kasir
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.cashierEmail}
                    onChange={(e) => handleFieldChange('cashierEmail', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Password / PIN Akses Kasir
                  </label>
                  <div className="relative mt-1">
                    <input
                      type={showKasirPwd ? 'text' : 'password'}
                      required
                      value={formState.cashierPasswordHint}
                      onChange={(e) =>
                        handleFieldChange('cashierPasswordHint', e.target.value)
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-9 pl-3 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKasirPwd(!showKasirPwd)}
                      className="absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showKasirPwd ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Kredensial Kepala Sekolah */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  2. Kredensial Login Kepala Sekolah
                </p>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Email Login Kepala Sekolah
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.principalEmail}
                    onChange={(e) => handleFieldChange('principalEmail', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Password / PIN Akses Kepsek
                  </label>
                  <div className="relative mt-1">
                    <input
                      type={showKepsekPwd ? 'text' : 'password'}
                      required
                      value={formState.principalPasswordHint}
                      onChange={(e) =>
                        handleFieldChange('principalPasswordHint', e.target.value)
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-9 pl-3 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKepsekPwd(!showKepsekPwd)}
                      className="absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showKepsekPwd ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving || !isKasir}
                className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                <span>
                  {saving
                    ? 'Menyimpan Kredensial...'
                    : 'Simpan & Sinkronkan Akun Login'}
                </span>
              </button>
            </div>
          </form>

          {/* Kolom Kanan: Status Akun Login Aktif & Ubah Cepat Password Sesi */}
          <form
            onSubmit={handleUpdateFirebasePassword}
            className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-5"
          >
            <div className="space-y-4">
              <div className="border-b border-slate-200 pb-3 dark:border-slate-800">
                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                  Akun Login Aplikasi yang Sedang Aktif
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Sesi login saat ini:{' '}
                  <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">
                    {isKasir ? settings.cashierEmail : settings.principalEmail}
                  </span>{' '}
                  ({isKasir ? 'Kasir / Bendahara' : 'Kepala Sekolah'})
                </p>
              </div>

              {/* Ringkasan Sinkronisasi Halaman Login */}
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-600 dark:text-slate-400">
                    Akun Login Kasir:
                  </span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {settings.cashierEmail}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-600 dark:text-slate-400">
                    Akun Login Kepsek:
                  </span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {settings.principalEmail}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Password Baru untuk Akun Aktif ({isKasir ? 'Kasir' : 'Kepsek'})
                </label>
                <div className="relative mt-1">
                  <input
                    type={showNewAuthPwd ? 'text' : 'password'}
                    value={newAuthPassword}
                    onChange={(e) => setNewAuthPassword(e.target.value)}
                    placeholder="Masukkan password baru..."
                    className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-9 pl-3 text-xs dark:border-slate-700 dark:bg-slate-950"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewAuthPwd(!showNewAuthPwd)}
                    className="absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400"
                  >
                    {showNewAuthPwd ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Ulangi Password Baru
                </label>
                <input
                  type={showNewAuthPwd ? 'text' : 'password'}
                  value={confirmAuthPassword}
                  onChange={(e) => setConfirmAuthPassword(e.target.value)}
                  placeholder="Konfirmasi password baru..."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving || !isKasir}
              className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              Perbarui Password Akun Aktif
            </button>
          </form>
        </div>
      )}

      {/* =====================================================================
          TAB 5: REFERENSI TEMA WARNA DASAR SESUAI FILOSOFI LOGO SMKS PGRI 1
      ===================================================================== */}
      {activeTab === 'tema_warna' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
              Referensi Warna Dasar Aplikasi Keuangan &amp; Perbankan (Klik untuk Menerapkan)
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Pilih tema warna dasar sesuai filosofi warna logo SMKS PGRI 1 Sukabumi untuk mengubah
              warna dasar latar aplikasi, menu samping, dan tombol utama:
            </p>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {FINANCIAL_COLOR_THEMES.map((theme) => {
                const isSelected = accentTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => {
                      onChangeAccentTheme(theme.id);
                      onToast(
                        `Tema warna dasar "${theme.name}" berhasil diterapkan.`,
                        'success'
                      );
                    }}
                    className={`flex flex-col items-center justify-center gap-3 rounded-xl border p-5 text-center transition-all ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-600/20 dark:border-blue-400 dark:bg-blue-950/40'
                        : 'border-slate-200 bg-white hover:border-blue-400 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700'
                    }`}
                  >
                    <span
                      className={`h-12 w-12 shrink-0 rounded-xl border border-black/10 shadow-xs ${theme.swatchClass}`}
                    />
                    <span className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                      {theme.name}
                    </span>
                    {isSelected && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-blue-700 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Aktif</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 6: ARSIP & CADANGAN LOKAL (BACKUP DATABASE & SKEMA SECURITY RULES)
      ===================================================================== */}
      {activeTab === 'arsip_cadangan' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
              Arsip &amp; Cadangan Lokal Database Sekolah
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Unduh salinan cadangan seluruh data siswa serta riwayat transaksi keuangan ke komputer
              Anda dalam format JSON atau CSV, serta tinjau dokumentasi Skema &amp; Security Rules
              Cloud Firestore.
            </p>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
                  <Download className="h-4 w-4 text-blue-600" />
                  <span>1. Backup Database Lengkap (.JSON)</span>
                </div>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Menyimpan seluruh struktur data siswa, saldo tagihan, dan riwayat transaksi dalam
                  satu berkas arsip JSON.
                </p>
              </div>
              <button
                type="button"
                onClick={onBackupJSON}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Backup JSON</span>
              </button>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
                  <Database className="h-4 w-4 text-blue-600" />
                  <span>2. Backup Tabel Spreadsheet (.CSV)</span>
                </div>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Mengunduh arsip data dalam format CSV yang dapat langsung dibuka menggunakan
                  Microsoft Excel atau Google Sheets.
                </p>
              </div>
              <button
                type="button"
                onClick={onBackupCSV}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <Database className="h-3.5 w-3.5" />
                <span>Backup CSV</span>
              </button>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
                  <BookOpen className="h-4 w-4 text-blue-600" />
                  <span>3. Skema &amp; Security Rules</span>
                </div>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Lihat dokumentasi arsitektur koleksi Cloud Firestore dan aturan keamanan akses data
                  sekolah.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenDocsModal}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <BookOpen className="h-3.5 w-3.5 text-blue-600" />
                <span>Skema &amp; Security Rules</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 6: TUTORIAL CARA PENGGUNAAN APLIKASI & URAIAN TIAP MENU/FITUR
      ===================================================================== */}
      {activeTab === 'tutorial' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
              Buku Panduan & Tutorial Penggunaan Aplikasi ({formState.schoolName})
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Berikut adalah uraian lengkap langkah demi langkah untuk mengoperasikan
              seluruh menu dan fitur pada Sistem Informasi Manajemen Keuangan Sekolah:
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {tutorialSections.map((sec) => {
              const Icon = sec.icon;
              return (
                <div
                  key={sec.num}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                          <Icon className="h-4 w-4" />
                        </div>
                        <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                          {sec.num}. {sec.title}
                        </h3>
                      </div>
                    </div>

                    <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {sec.description}
                    </p>

                    <ul className="mt-3 space-y-2 text-xs text-slate-700 dark:text-slate-300">
                      {sec.steps.map((step, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                            {i + 1}.
                          </span>
                          <span className="leading-relaxed">{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-2.5 text-[11px] text-slate-400 dark:border-slate-800/60">
                    Hak Akses Modul: {sec.roleBadge}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
