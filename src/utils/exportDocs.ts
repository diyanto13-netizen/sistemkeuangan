import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  ACADEMIC_MONTHS,
  DEFAULT_SCHOOL_SETTINGS,
  DEFAULT_TARIFF_BY_GRADE,
  detectGradeLevelFromClass,
  formatRupiah,
  normalizeWaNumber,
  SCHOOL_MAJORS,
  SchoolSettings,
  SPP_MONTHLY_FEE,
  Student,
  Transaction,
} from '../types';

function renderPdfLogo(
  doc: jsPDF,
  logoDataUrl: string,
  x: number,
  y: number,
  size: number
): boolean {
  if (!logoDataUrl || !logoDataUrl.startsWith('data:image/')) return false;
  try {
    const format = logoDataUrl.includes('image/jpeg') ? 'JPEG' : 'PNG';
    doc.addImage(logoDataUrl, format, x, y, size, size);
    return true;
  } catch {
    return false;
  }
}

/**
 * 1. Generate Kuitansi Pembayaran POS (PDF)
 */
export function generateReceiptPDF(
  tx: Transaction,
  remainingBalance: number,
  settings: SchoolSettings = DEFAULT_SCHOOL_SETTINGS
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });

  const hasLogo = renderPdfLogo(doc, settings.logoDataUrl, 14, 10, 14);
  const textX = hasLogo ? 31 : 14;

  // Header / Kop Sekolah
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  if (settings.schoolSubtitle) {
    doc.text(settings.schoolSubtitle.toUpperCase(), textX, 13);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(settings.schoolName.toUpperCase(), textX, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`${settings.schoolAddress} | ${settings.schoolContact}`, textX, 22.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('BUKTI PEMBAYARAN / KUITANSI RESMI SEKOLAH', textX, 26.5);

  doc.setDrawColor(160);
  doc.line(14, 29, 134, 29);

  // Meta Transaksi
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`No. Kuitansi : ${tx.receiptNo}`, 14, 35);
  doc.text(`Tanggal      : ${tx.txDate}`, 14, 40);
  doc.text(`Penyetor     : ${tx.payerName}`, 14, 45);

  doc.text(`NIS / Nama : ${tx.studentNis} - ${tx.studentName}`, 74, 35);
  doc.text(`Kelas      : ${tx.studentClass}`, 74, 40);
  doc.text(`Jurusan    : ${tx.studentMajor}`, 74, 45);

  const rows: (string | number)[][] = [];
  if (tx.sppAmount > 0) {
    const monthStr =
      tx.sppMonths.length > 0 ? ` (${tx.sppMonths.join(', ')})` : '';
    rows.push(['1', `Pembayaran SPP${monthStr}`, formatRupiah(tx.sppAmount)]);
  }
  if (tx.dspAmount > 0) {
    rows.push([
      String(rows.length + 1),
      'Dana Sumbangan Pendidikan (DSP)',
      formatRupiah(tx.dspAmount),
    ]);
  }
  if (tx.class11Amount > 0) {
    rows.push([
      String(rows.length + 1),
      'Pembiayaan Kelas XI',
      formatRupiah(tx.class11Amount),
    ]);
  }
  if (tx.class12Amount > 0) {
    rows.push([
      String(rows.length + 1),
      'Pembiayaan Kelas XII',
      formatRupiah(tx.class12Amount),
    ]);
  }

  autoTable(doc, {
    startY: 50,
    head: [['No', 'Uraian Pos Pembayaran', 'Nominal']],
    body: rows,
    foot: [
      ['', 'TOTAL PEMBAYARAN', formatRupiah(tx.totalAmount)],
      ['', 'SISA SALDO TAGIHAN', formatRupiah(remainingBalance)],
    ],
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
  });

  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY || 95;

  if (tx.notes) {
    doc.setFontSize(8);
    doc.text(`Catatan: ${tx.notes}`, 14, finalY + 7);
  }

  // Tanda tangan
  const signY = finalY + 16;
  const cashierDisplay = tx.cashierName || settings.cashierName;
  doc.setFontSize(8.5);
  doc.text('Penyetor,', 22, signY);
  doc.text(`(${tx.payerName})`, 18, signY + 18);

  doc.text(`${settings.schoolCity}, ${tx.txDate}`, 88, signY - 4);
  doc.text('Kasir / Bendahara Penerima,', 88, signY);
  doc.setFont('helvetica', 'bold');
  doc.text(`(${cashierDisplay})`, 88, signY + 18);
  if (settings.cashierNip) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(settings.cashierNip, 88, signY + 22);
  }

  doc.save(`Kuitansi_${tx.receiptNo}_${tx.studentNis}.pdf`);
}

/**
 * 2. Cetak Kartu SPP Siswa (PDF) - Mapping Bulan Juli - Juni
 */
export function generateSppCardPDF(
  student: Student,
  transactions: Transaction[],
  academicYear: string,
  settings: SchoolSettings = DEFAULT_SCHOOL_SETTINGS
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const hasLogo = renderPdfLogo(doc, settings.logoDataUrl, 14, 12, 18);
  const textX = hasLogo ? 36 : 14;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  if (settings.schoolSubtitle) {
    doc.text(settings.schoolSubtitle.toUpperCase(), textX, 15);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(settings.schoolName.toUpperCase(), textX, 21);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`${settings.schoolAddress} | ${settings.schoolContact}`, textX, 26);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(
    `KARTU KENDALI PEMBAYARAN SPP SISWA — TAHUN PELAJARAN ${academicYear}`,
    textX,
    31.5
  );

  doc.line(14, 34, 196, 34);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`NIS           : ${student.nis}`, 14, 41);
  doc.text(`Nama Siswa    : ${student.name}`, 14, 47);
  doc.text(`Kelas/Jurusan : ${student.className} / ${student.major}`, 14, 53);

  doc.text(`Sisa Tagihan SPP : ${formatRupiah(student.sppBalance)}`, 120, 41);
  doc.text(`Sisa Tagihan DSP : ${formatRupiah(student.dspBalance)}`, 120, 47);
  doc.text(`Total Tunggakan  : ${formatRupiah(student.totalBalance)}`, 120, 53);

  // Mapping bulan Juli - Juni
  const studentTxs = transactions.filter(
    (t) => t.studentId === student.id && t.sppAmount > 0
  );

  const tableRows = ACADEMIC_MONTHS.map((m, idx) => {
    const labelWithYear = `${m.name}`;
    const isPaidInStudentDoc = student.paidMonths.some(
      (pm) =>
        pm.toLowerCase().includes(m.name.toLowerCase()) ||
        pm.endsWith(`-${m.code}`)
    );
    const matchingTx = studentTxs.find((t) =>
      t.sppMonths.some((sm) => sm.toLowerCase().includes(m.name.toLowerCase()))
    );
    const isPaid = isPaidInStudentDoc || Boolean(matchingTx);

    return [
      String(idx + 1),
      labelWithYear,
      formatRupiah(SPP_MONTHLY_FEE),
      isPaid ? 'LUNAS' : 'BELUM BAYAR',
      matchingTx ? matchingTx.txDate : isPaid ? 'Tercatat' : '-',
      matchingTx ? matchingTx.receiptNo : '-',
      matchingTx ? matchingTx.cashierName : isPaid ? settings.cashierName : '-',
    ];
  });

  autoTable(doc, {
    startY: 59,
    head: [
      [
        'No',
        'Bulan',
        'Tarif SPP',
        'Status',
        'Tanggal Bayar',
        'No. Kuitansi',
        'Petugas',
      ],
    ],
    body: tableRows,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 3) {
        if (data.cell.raw === 'LUNAS') {
          data.cell.styles.textColor = [22, 163, 74];
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY || 175;
  const signY = finalY + 14;

  doc.setFontSize(9.5);
  doc.text('Mengetahui,', 20, signY);
  doc.text(`Kepala ${settings.schoolName},`, 20, signY + 5);
  doc.setFont('helvetica', 'bold');
  doc.text(`(${settings.principalName})`, 20, signY + 25);
  if (settings.principalNip) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(settings.principalNip, 20, signY + 30);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(
    `${settings.schoolCity}, ${new Date().toISOString().slice(0, 10)}`,
    130,
    signY
  );
  doc.text('Bendahara / Kasir Penerima,', 130, signY + 5);
  doc.setFont('helvetica', 'bold');
  doc.text(`(${settings.cashierName})`, 130, signY + 25);
  if (settings.cashierNip) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(settings.cashierNip, 130, signY + 30);
  }

  doc.save(`Kartu_SPP_${student.nis}_${student.name.replace(/\s+/g, '_')}.pdf`);
}

/**
 * 3. Cetak Buku Riwayat Pembayaran per Siswa (PDF)
 */
export function generateStudentHistoryPDF(
  student: Student,
  transactions: Transaction[],
  settings: SchoolSettings = DEFAULT_SCHOOL_SETTINGS
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const hasLogo = renderPdfLogo(doc, settings.logoDataUrl, 14, 12, 16);
  const textX = hasLogo ? 34 : 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.text('BUKU RIWAYAT TRANSAKSI KEUANGAN SISWA', textX, 17);
  doc.setFontSize(11);
  doc.text(settings.schoolName.toUpperCase(), textX, 23);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`${settings.schoolAddress} | ${settings.schoolContact}`, textX, 28);
  doc.line(14, 31, 196, 31);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`NIS / Nama    : ${student.nis} - ${student.name}`, 14, 38);
  doc.text(`Kelas/Jurusan : ${student.className} (${student.major})`, 14, 44);
  doc.text(`No. WhatsApp  : ${student.waNumber}`, 14, 50);

  doc.text(`Sisa SPP       : ${formatRupiah(student.sppBalance)}`, 125, 38);
  doc.text(`Sisa DSP       : ${formatRupiah(student.dspBalance)}`, 125, 44);
  doc.text(
    `Sisa Kls XI/XII: ${formatRupiah(student.class11Balance + student.class12Balance)}`,
    125,
    50
  );

  const studentTxs = transactions.filter((t) => t.studentId === student.id);
  const bodyRows = studentTxs.map((tx, idx) => [
    String(idx + 1),
    tx.txDate,
    tx.receiptNo,
    tx.category,
    tx.sppMonths.length > 0 ? tx.sppMonths.join(', ') : tx.notes || '-',
    tx.payerName,
    tx.cashierName,
    formatRupiah(tx.totalAmount),
  ]);

  const totalPaid = studentTxs.reduce((acc, cur) => acc + cur.totalAmount, 0);

  autoTable(doc, {
    startY: 56,
    head: [
      [
        'No',
        'Tanggal',
        'No. Kuitansi',
        'Pos',
        'Keterangan / Bulan',
        'Penyetor',
        'Kasir',
        'Nominal',
      ],
    ],
    body:
      bodyRows.length > 0
        ? bodyRows
        : [
            [
              '-',
              '-',
              '-',
              '-',
              'Belum ada riwayat transaksi',
              '-',
              '-',
              'Rp 0',
            ],
          ],
    foot: [
      ['', '', '', '', '', '', 'Total Terbayar', formatRupiah(totalPaid)],
      [
        '',
        '',
        '',
        '',
        '',
        '',
        'Sisa Tunggakan',
        formatRupiah(student.totalBalance),
      ],
    ],
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
  });

  doc.save(
    `Buku_Riwayat_${student.nis}_${student.name.replace(/\s+/g, '_')}.pdf`
  );
}

/**
 * 4. Ekspor Laporan Buku Kas / Rekap Harian ke PDF (dengan Kolom Tanda Tangan Resmi)
 */
export function generateCashbookPDF(
  transactions: Transaction[],
  title: string,
  periodLabel: string,
  settings: SchoolSettings = DEFAULT_SCHOOL_SETTINGS
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const hasLogo = renderPdfLogo(doc, settings.logoDataUrl, 14, 10, 18);
  const textX = hasLogo ? 36 : 14;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  if (settings.schoolSubtitle) {
    doc.text(settings.schoolSubtitle.toUpperCase(), textX, 13);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.text(settings.schoolName.toUpperCase(), textX, 18.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`${settings.schoolAddress} | ${settings.schoolContact}`, textX, 23.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`${title} | Periode: ${periodLabel}`, textX, 28.5);
  doc.line(14, 31, 283, 31);

  const rows = transactions.map((tx, idx) => [
    String(idx + 1),
    tx.txDate,
    tx.receiptNo,
    `${tx.studentNis} - ${tx.studentName}`,
    tx.studentClass,
    tx.category,
    formatRupiah(tx.sppAmount),
    formatRupiah(tx.dspAmount),
    formatRupiah(tx.class11Amount + tx.class12Amount),
    formatRupiah(tx.totalAmount),
    tx.cashierName,
  ]);

  const sumSpp = transactions.reduce((s, t) => s + t.sppAmount, 0);
  const sumDsp = transactions.reduce((s, t) => s + t.dspAmount, 0);
  const sumClass = transactions.reduce(
    (s, t) => s + t.class11Amount + t.class12Amount,
    0
  );
  const sumTotal = transactions.reduce((s, t) => s + t.totalAmount, 0);

  autoTable(doc, {
    startY: 35,
    head: [
      [
        'No',
        'Tanggal',
        'No. Kuitansi',
        'Siswa',
        'Kelas',
        'Pos',
        'SPP',
        'DSP',
        'Kls XI/XII',
        'Total Masuk',
        'Kasir',
      ],
    ],
    body:
      rows.length > 0
        ? rows
        : [
            [
              '-',
              '-',
              '-',
              'Tidak ada data transaksi pada periode ini',
              '-',
              '-',
              '-',
              '-',
              '-',
              'Rp 0',
              '-',
            ],
          ],
    foot: [
      [
        '',
        '',
        '',
        '',
        '',
        'TOTAL PENERIMAAN',
        formatRupiah(sumSpp),
        formatRupiah(sumDsp),
        formatRupiah(sumClass),
        formatRupiah(sumTotal),
        '',
      ],
    ],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
  });

  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY || 140;
  const signY = Math.min(finalY + 12, 168);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Mengetahui,', 30, signY);
  doc.text(`Kepala ${settings.schoolName}`, 30, signY + 5);
  doc.setFont('helvetica', 'bold');
  doc.text(`(${settings.principalName})`, 30, signY + 24);
  if (settings.principalNip) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(settings.principalNip, 30, signY + 29);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(
    `${settings.schoolCity}, ${new Date().toISOString().slice(0, 10)}`,
    205,
    signY
  );
  doc.text('Bendahara / Kasir Penerima', 205, signY + 5);
  doc.setFont('helvetica', 'bold');
  doc.text(`(${settings.cashierName})`, 205, signY + 24);
  if (settings.cashierNip) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(settings.cashierNip, 205, signY + 29);
  }

  doc.save(
    `Laporan_Buku_Kas_${settings.schoolName.replace(/\s+/g, '_')}_${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`
  );
}

/**
 * 5. Ekspor Tabel Laporan ke Excel (.xls) via SheetJS
 */
export function exportTransactionsToExcel(
  transactions: Transaction[],
  filenamePrefix = 'Buku_Kas_SMKS_PGRI_1'
): void {
  const sheetData = transactions.map((tx, idx) => ({
    No: idx + 1,
    Tanggal: tx.txDate,
    'No. Kuitansi': tx.receiptNo,
    NIS: tx.studentNis,
    'Nama Siswa': tx.studentName,
    Kelas: tx.studentClass,
    Jurusan: tx.studentMajor,
    Penyetor: tx.payerName,
    'Kategori Pos': tx.category,
    'Bulan SPP': tx.sppMonths.join(', '),
    'Nominal SPP (Rp)': tx.sppAmount,
    'Nominal DSP (Rp)': tx.dspAmount,
    'Pembiayaan Kelas XI (Rp)': tx.class11Amount,
    'Pembiayaan Kelas XII (Rp)': tx.class12Amount,
    'Total Bayar (Rp)': tx.totalAmount,
    Kasir: tx.cashierName,
    Catatan: tx.notes,
  }));

  const worksheet = XLSX.utils.json_to_sheet(sheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Buku_Kas');
  XLSX.writeFile(
    workbook,
    `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.xls`,
    { bookType: 'biff8' }
  );
}

/**
 * 6.Backup Database ke JSON & CSV Mandiri
 */
export function downloadDatabaseBackupJSON(
  students: Student[],
  transactions: Transaction[]
): void {
  const payload = {
    school: 'SMKS PGRI 1 Sukabumi',
    exportedAt: new Date().toISOString(),
    counts: {
      students: students.length,
      transactions: transactions.length,
    },
    students,
    transactions,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Backup_Firestore_SMKS_PGRI_1_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadDatabaseBackupCSV(
  students: Student[],
  transactions: Transaction[]
): void {
  const workbook = XLSX.utils.book_new();
  const studentRows = students.map((s) => ({
    ID: s.id,
    NIS: s.nis,
    Nama: s.name,
    Kelas: s.className,
    Tingkat: s.gradeLevel,
    Jurusan: s.major,
    WhatsApp: s.waNumber,
    SPP_Saldo: s.sppBalance,
    DSP_Saldo: s.dspBalance,
    Kelas11_Saldo: s.class11Balance,
    Kelas12_Saldo: s.class12Balance,
    Total_Tunggakan: s.totalBalance,
    Bulan_SPP_Lunas: s.paidMonths.join(';'),
  }));
  const txRows = transactions.map((t) => ({
    ID: t.id,
    Tanggal: t.txDate,
    No_Kuitansi: t.receiptNo,
    NIS: t.studentNis,
    Nama_Siswa: t.studentName,
    Kelas: t.studentClass,
    Penyetor: t.payerName,
    Pos: t.category,
    Nominal_SPP: t.sppAmount,
    Nominal_DSP: t.dspAmount,
    Nominal_Kelas11: t.class11Amount,
    Nominal_Kelas12: t.class12Amount,
    Total_Bayar: t.totalAmount,
    Bulan_SPP: t.sppMonths.join(';'),
    Kasir: t.cashierName,
  }));

  const studentCsv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(studentRows));
  const txCsv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(txRows));
  const combined = `# ARSIP MASTER DATA SISWA\n${studentCsv}\n\n# ARSIP TRANSAKSI PEMBAYARAN\n${txCsv}`;

  const blob = new Blob([combined], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Backup_CSV_SMKS_PGRI_1_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface ParsedImportStudentRow {
  rowNumber: number;
  nis: string;
  name: string;
  className: string;
  gradeLevel: 'X' | 'XI' | 'XII';
  major: string;
  waNumber: string;
  sppBalance: number;
  dspBalance: number;
  class11Balance: number;
  class12Balance: number;
  totalBalance: number;
  isValid: boolean;
  errorReason?: string;
}

/**
 * 7. Unduh Template Excel (.xlsx) untuk Impor Data Siswa Secara Massal
 */
export function downloadStudentImportTemplate(): void {
  const sampleRows = [
    {
      NIS: '20261011',
      Nama_Lengkap: 'Ahmad Fauzi Ridwan',
      Kelas: 'X TKJ 1',
      Jurusan: 'Teknik Komputer & Jaringan (TKJ)',
      No_WA: '081288991101',
      Tagihan_SPP: 3600000,
      Tagihan_DSP: 2500000,
      Pembiayaan_Kelas_XI: 0,
      Pembiayaan_Kelas_XII: 0,
    },
    {
      NIS: '20261012',
      Nama_Lengkap: 'Nadia Putri Lestari',
      Kelas: 'XI RPL 1',
      Jurusan: 'Rekayasa Perangkat Lunak (RPL)',
      No_WA: '081388991102',
      Tagihan_SPP: '',
      Tagihan_DSP: '',
      Pembiayaan_Kelas_XI: '',
      Pembiayaan_Kelas_XII: '',
    },
    {
      NIS: '20261013',
      Nama_Lengkap: 'Reza Maulana Akbar',
      Kelas: 'XII AKL 2',
      Jurusan: 'Akuntansi & Keuangan Lembaga (AKL)',
      No_WA: '085788991103',
      Tagihan_SPP: '',
      Tagihan_DSP: '',
      Pembiayaan_Kelas_XI: '',
      Pembiayaan_Kelas_XII: '',
    },
  ];

  const guideRows = [
    {
      Kolom: 'NIS',
      Status: 'WAJIB',
      Keterangan:
        'Nomor Induk Siswa unik (hanya huruf, angka, tanda hubung). Contoh: 20261011',
    },
    {
      Kolom: 'Nama_Lengkap',
      Status: 'WAJIB',
      Keterangan: 'Nama lengkap siswa (maksimal 120 karakter).',
    },
    {
      Kolom: 'Kelas',
      Status: 'WAJIB',
      Keterangan:
        'Awali dengan tingkat kelas X, XI, atau XII (Contoh: X TKJ 1, XI RPL 2, XII AKL 1). Sistem otomatis mendeteksi tingkat kelas.',
    },
    {
      Kolom: 'Jurusan',
      Status: 'OPSIONAL',
      Keterangan:
        'Kompetensi Keahlian (jika dikosongkan akan diisi otomatis berdasarkan kode kelas).',
    },
    {
      Kolom: 'No_WA',
      Status: 'WAJIB',
      Keterangan:
        'Nomor WhatsApp aktif orang tua/wali murid (Contoh: 081288991101 atau 6281288991101).',
    },
    {
      Kolom: 'Tagihan_SPP / DSP / Kelas XI / Kelas XII',
      Status: 'OPSIONAL',
      Keterangan:
        'Jika dikosongkan, sistem otomatis mengisi tarif standar SMKS PGRI 1 Sukabumi sesuai tingkat kelas (X, XI, atau XII). Isi 0 jika bebas biaya.',
    },
  ];

  const wb = XLSX.utils.book_new();
  const wsData = XLSX.utils.json_to_sheet(sampleRows);
  wsData['!cols'] = [
    { wch: 14 },
    { wch: 26 },
    { wch: 14 },
    { wch: 36 },
    { wch: 16 },
    { wch: 15 },
    { wch: 15 },
    { wch: 22 },
    { wch: 22 },
  ];

  const wsGuide = XLSX.utils.json_to_sheet(guideRows);
  wsGuide['!cols'] = [{ wch: 34 }, { wch: 12 }, { wch: 80 }];

  XLSX.utils.book_append_sheet(wb, wsData, 'Template_Impor_Siswa');
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Petunjuk_Pengisian');

  XLSX.writeFile(wb, 'Template_Impor_Siswa_SMKS_PGRI_1_Sukabumi.xlsx');
}

function inferMajorFromClass(className: string, rawMajor: string): string {
  const trimmed = rawMajor.trim();
  if (trimmed.length >= 2) {
    const matched = SCHOOL_MAJORS.find((m) =>
      m.toLowerCase().includes(trimmed.toLowerCase())
    );
    return (matched || trimmed).slice(0, 60);
  }
  const upper = className.toUpperCase();
  if (upper.includes('TKJ')) return 'Teknik Komputer & Jaringan (TKJ)';
  if (upper.includes('RPL')) return 'Rekayasa Perangkat Lunak (RPL)';
  if (upper.includes('AKL')) return 'Akuntansi & Keuangan Lembaga (AKL)';
  if (upper.includes('OTKP') || upper.includes('MPLB'))
    return 'Otomatisasi Tata Kelola Perkantoran (OTKP)';
  if (upper.includes('BDP') || upper.includes('PM'))
    return 'Bisnis Daring & Pemasaran (BDP)';
  if (upper.includes('TKR')) return 'Teknik Kendaraan Ringan (TKR)';
  return SCHOOL_MAJORS[0];
}

/**
 * 8. Parse & Validasi File Excel/CSV untuk Impor Siswa Massal
 */
export function parseStudentImportExcelBuffer(
  buffer: ArrayBuffer,
  existingNisList: string[]
): ParsedImportStudentRow[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: '',
  });

  const existingSet = new Set(existingNisList.map((n) => n.toLowerCase()));
  const seenInFile = new Set<string>();

  return rawRows.map((row, index) => {
    const rowNumber = index + 2; // Baris ke-1 adalah header Excel

    // Normalisasi key kolom agar fleksibel terhadap spasi/huruf besar-kecil
    const normMap: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      const cleanKey = k.trim().toLowerCase().replace(/[\s_-]+/g, '_');
      normMap[cleanKey] = v;
    }

    const rawNis = String(
      normMap['nis'] ?? normMap['nomor_induk_siswa'] ?? normMap['no_induk'] ?? ''
    ).trim();
    const cleanNis = rawNis.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);

    const cleanName = String(
      normMap['nama_lengkap'] ??
        normMap['nama_siswa'] ??
        normMap['nama'] ??
        normMap['name'] ??
        ''
    )
      .trim()
      .slice(0, 120);

    const cleanClass = String(
      normMap['kelas'] ?? normMap['class'] ?? normMap['rombel'] ?? ''
    )
      .trim()
      .slice(0, 30);

    const rawMajor = String(
      normMap['jurusan'] ?? normMap['kompetensi_keahlian'] ?? normMap['major'] ?? ''
    );
    const cleanMajor = inferMajorFromClass(cleanClass, rawMajor);

    const rawWa = String(
      normMap['no_wa'] ??
        normMap['wa'] ??
        normMap['whatsapp'] ??
        normMap['no_hp'] ??
        normMap['telepon'] ??
        ''
    ).trim();
    const cleanWa = normalizeWaNumber(rawWa || '081200000000');

    const gradeLevel = detectGradeLevelFromClass(cleanClass || 'X');
    const defaultTariff = DEFAULT_TARIFF_BY_GRADE[gradeLevel];

    const parseOptionalAmount = (val: unknown, fallback: number): number => {
      if (val === '' || val === null || val === undefined) return fallback;
      const numeric = Number(String(val).replace(/[^0-9.-]/g, ''));
      if (Number.isNaN(numeric)) return fallback;
      return Math.max(0, Math.min(100000000, Math.round(numeric)));
    };

    const sppBalance = parseOptionalAmount(
      normMap['tagihan_spp'] ?? normMap['spp'],
      defaultTariff.sppBalance
    );
    const dspBalance = parseOptionalAmount(
      normMap['tagihan_dsp'] ?? normMap['dsp'],
      defaultTariff.dspBalance
    );
    const class11Balance = parseOptionalAmount(
      normMap['pembiayaan_kelas_xi'] ?? normMap['kelas_xi'] ?? normMap['kelas_11'],
      defaultTariff.class11Balance
    );
    const class12Balance = parseOptionalAmount(
      normMap['pembiayaan_kelas_xii'] ?? normMap['kelas_xii'] ?? normMap['kelas_12'],
      defaultTariff.class12Balance
    );
    const totalBalance =
      sppBalance + dspBalance + class11Balance + class12Balance;

    const errors: string[] = [];
    if (!cleanNis) {
      errors.push('NIS kosong/tidak valid');
    } else if (existingSet.has(cleanNis.toLowerCase())) {
      errors.push(`NIS ${cleanNis} sudah terdaftar di database`);
    } else if (seenInFile.has(cleanNis.toLowerCase())) {
      errors.push(`NIS ${cleanNis} duplikat di dalam file Excel`);
    }

    if (!cleanName) {
      errors.push('Nama lengkap kosong');
    }
    if (!cleanClass) {
      errors.push('Kelas kosong');
    }

    if (cleanNis) {
      seenInFile.add(cleanNis.toLowerCase());
    }

    return {
      rowNumber,
      nis: cleanNis,
      name: cleanName,
      className: cleanClass,
      gradeLevel,
      major: cleanMajor,
      waNumber: cleanWa,
      sppBalance,
      dspBalance,
      class11Balance,
      class12Balance,
      totalBalance,
      isValid: errors.length === 0,
      errorReason: errors.length > 0 ? errors.join(', ') : undefined,
    };
  });
}


