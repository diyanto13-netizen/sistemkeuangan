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
 * Format YYYY-MM-DD menjadi tanggal resmi Bahasa Indonesia (misal: "01 November 2026")
 */
function formatTanggalResmiIndonesia(dateStr: string): string {
  if (!dateStr) return '-';
  const months = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const yyyy = parts[0];
    const mmIdx = parseInt(parts[1], 10) - 1;
    const dd = parts[2];
    if (mmIdx >= 0 && mmIdx < 12) {
      return `${dd} ${months[mmIdx]} ${yyyy}`;
    }
  }
  return dateStr;
}

/**
 * Konversi nominal angka ke teks Terbilang Bahasa Indonesia untuk Kuitansi Resmi
 */
function nominalKeTerbilang(nilai: number): string {
  const n = Math.floor(Math.abs(nilai));
  if (n === 0) return 'Nol Rupiah';

  const satuan = [
    '',
    'Satu',
    'Dua',
    'Tiga',
    'Empat',
    'Lima',
    'Enam',
    'Tujuh',
    'Delapan',
    'Sembilan',
    'Sepuluh',
    'Sebelas',
  ];

  const konversi = (x: number): string => {
    if (x < 12) return satuan[x];
    if (x < 20) return `${konversi(x - 10)} Belas`;
    if (x < 100) {
      const depan = Math.floor(x / 10);
      const sisa = x % 10;
      return `${konversi(depan)} Puluh${sisa > 0 ? ' ' + konversi(sisa) : ''}`;
    }
    if (x < 200) {
      return `Seratus${x - 100 > 0 ? ' ' + konversi(x - 100) : ''}`;
    }
    if (x < 1000) {
      const depan = Math.floor(x / 100);
      const sisa = x % 100;
      return `${konversi(depan)} Ratus${sisa > 0 ? ' ' + konversi(sisa) : ''}`;
    }
    if (x < 2000) {
      return `Seribu${x - 1000 > 0 ? ' ' + konversi(x - 1000) : ''}`;
    }
    if (x < 1000000) {
      const depan = Math.floor(x / 1000);
      const sisa = x % 1000;
      return `${konversi(depan)} Ribu${sisa > 0 ? ' ' + konversi(sisa) : ''}`;
    }
    if (x < 1000000000) {
      const depan = Math.floor(x / 1000000);
      const sisa = x % 1000000;
      return `${konversi(depan)} Juta${sisa > 0 ? ' ' + konversi(sisa) : ''}`;
    }
    const depan = Math.floor(x / 1000000000);
    const sisa = x % 1000000000;
    return `${konversi(depan)} Miliar${sisa > 0 ? ' ' + konversi(sisa) : ''}`;
  };

  return `${konversi(n).replace(/\s+/g, ' ').trim()} Rupiah`;
}

/**
 * Helper untuk merender baris Label : Nilai dengan titik dua (:) yang 100% sejajar vertikal
 */
function drawAlignedField(
  doc: jsPDF,
  label: string,
  value: string,
  labelX: number,
  colonX: number,
  valueX: number,
  y: number,
  maxWidth: number,
  boldValue = false
): number {
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text(label, labelX, y);
  doc.text(':', colonX, y);

  doc.setFont('helvetica', boldValue ? 'bold' : 'normal');
  doc.setTextColor(15, 23, 42);
  const lines = doc.splitTextToSize(value || '-', maxWidth) as string[];
  doc.text(lines, valueX, y);
  return Math.max(1, lines.length);
}

/**
 * Helper untuk memeriksa apakah NIP valid untuk ditampilkan (bukan kosong atau sekadar tanda '-')
 */
function formatNipLine(nip?: string): string | null {
  if (!nip) return null;
  const cleaned = nip.trim();
  if (!cleaned || cleaned === '-' || cleaned === 'NIP. -' || cleaned === 'NIP: -') {
    return null;
  }
  return cleaned.toUpperCase().startsWith('NIP') ||
    cleaned.toUpperCase().startsWith('NUPTK')
    ? cleaned
    : `NIP/NUPTK: ${cleaned}`;
}

/**
 * Render Kop Surat Resmi Sekolah yang rapi, terpusat, tidak terpotong di tepi kanan,
 * dan dilengkapi garis ganda standar surat dinas/sekolah.
 */
function renderOfficialKopSurat(
  doc: jsPDF,
  settings: SchoolSettings,
  pageWidth: number,
  marginX = 14
): number {
  const logoSize = 21;
  const hasLogo = renderPdfLogo(doc, settings.logoDataUrl, marginX, 11, logoSize);

  // Area teks kop terpusat secara proporsional
  const centerX = hasLogo ? pageWidth / 2 + 8 : pageWidth / 2;
  const maxTextWidth = pageWidth - marginX * 2 - (hasLogo ? 30 : 6);

  let cursorY = 14;

  // 1. Sub-judul / Yayasan Penyelenggara
  if (settings.schoolSubtitle && settings.schoolSubtitle.trim()) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    const subLines = doc.splitTextToSize(
      settings.schoolSubtitle.trim().toUpperCase(),
      maxTextWidth
    ) as string[];
    doc.text(subLines, centerX, cursorY, { align: 'center' });
    cursorY += subLines.length * 4.5 + 1;
  }

  // 2. Nama Utama Sekolah
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  const nameLines = doc.splitTextToSize(
    settings.schoolName.trim().toUpperCase(),
    maxTextWidth
  ) as string[];
  doc.text(nameLines, centerX, cursorY + 1, { align: 'center' });
  cursorY += nameLines.length * 5.5 + 0.5;

  // 3. Alamat Lengkap Sekolah (Dibungkus otomatis agar tidak pernah terpotong)
  if (settings.schoolAddress && settings.schoolAddress.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    const addrLines = doc.splitTextToSize(
      settings.schoolAddress.trim(),
      maxTextWidth
    ) as string[];
    doc.text(addrLines, centerX, cursorY, { align: 'center' });
    cursorY += addrLines.length * 4;
  }

  // 4. Kontak Resmi Sekolah (Telp / Email / Website) pada baris tersendiri
  if (settings.schoolContact && settings.schoolContact.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    const contactLines = doc.splitTextToSize(
      settings.schoolContact.trim(),
      maxTextWidth
    ) as string[];
    doc.text(contactLines, centerX, cursorY, { align: 'center' });
    cursorY += contactLines.length * 3.8;
  }

  // Pastikan garis kop berada di bawah logo maupun teks
  const lineY = Math.max(cursorY + 2, hasLogo ? 34.5 : cursorY + 2);

  // Garis Ganda Kop Surat Resmi (Tebal di atas, tipis di bawah)
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.75);
  doc.line(marginX, lineY, pageWidth - marginX, lineY);
  doc.setLineWidth(0.25);
  doc.line(marginX, lineY + 1.1, pageWidth - marginX, lineY + 1.1);

  return lineY + 1.1;
}

/**
 * 1. Generate Kuitansi Pembayaran POS (PDF) — Tata Letak Resmi, Rapi & Presisi
 */
export function generateReceiptPDF(
  tx: Transaction,
  remainingBalance: number,
  settings: SchoolSettings = DEFAULT_SCHOOL_SETTINGS
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const marginX = 14;

  // 1. Render Kop Surat Resmi Sekolah
  const afterKopY = renderOfficialKopSurat(doc, settings, pageWidth, marginX);

  // 2. Judul Dokumen & Nomor Kuitansi (Terpusat di bawah garis kop)
  const titleY = afterKopY + 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(15, 23, 42);
  doc.text('BUKTI PEMBAYARAN / KUITANSI RESMI SEKOLAH', pageWidth / 2, titleY, {
    align: 'center',
  });

  // Garis bawah judul
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.35);
  doc.line(pageWidth / 2 - 48, titleY + 1.2, pageWidth / 2 + 48, titleY + 1.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(`NOMOR KUITANSI: ${tx.receiptNo}`, pageWidth / 2, titleY + 5.8, {
    align: 'center',
  });

  // 3. Kotak Informasi Transaksi & Identitas Siswa (2 Kolom Sejajar Presisi)
  const infoBoxY = titleY + 9.5;
  const infoBoxHeight = 25;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, infoBoxY, pageWidth - marginX * 2, infoBoxHeight, 1.8, 1.8, 'FD');

  // Garis pemisah vertikal tengah di dalam kotak info
  doc.setDrawColor(226, 232, 240);
  doc.line(pageWidth / 2, infoBoxY + 2.5, pageWidth / 2, infoBoxY + infoBoxHeight - 2.5);

  doc.setFontSize(8.8);
  const leftLabelX = marginX + 4;
  const leftColonX = marginX + 33;
  const leftValX = marginX + 36;
  const leftMaxW = pageWidth / 2 - leftValX - 4;

  const rightLabelX = pageWidth / 2 + 4;
  const rightColonX = pageWidth / 2 + 34;
  const rightValX = pageWidth / 2 + 37;
  const rightMaxW = pageWidth - marginX - rightValX - 3;

  // Baris 1
  drawAlignedField(
    doc,
    'No. Kuitansi',
    tx.receiptNo,
    leftLabelX,
    leftColonX,
    leftValX,
    infoBoxY + 6,
    leftMaxW,
    true
  );
  drawAlignedField(
    doc,
    'NIS / Nama Siswa',
    `${tx.studentNis} — ${tx.studentName}`,
    rightLabelX,
    rightColonX,
    rightValX,
    infoBoxY + 6,
    rightMaxW,
    true
  );

  // Baris 2
  drawAlignedField(
    doc,
    'Tanggal Bayar',
    formatTanggalResmiIndonesia(tx.txDate),
    leftLabelX,
    leftColonX,
    leftValX,
    infoBoxY + 12,
    leftMaxW
  );
  drawAlignedField(
    doc,
    'Kelas / Tingkat',
    tx.studentClass,
    rightLabelX,
    rightColonX,
    rightValX,
    infoBoxY + 12,
    rightMaxW
  );

  // Baris 3
  drawAlignedField(
    doc,
    'Diterima Dari',
    tx.payerName,
    leftLabelX,
    leftColonX,
    leftValX,
    infoBoxY + 18,
    leftMaxW
  );
  drawAlignedField(
    doc,
    'Kompetensi',
    tx.studentMajor,
    rightLabelX,
    rightColonX,
    rightValX,
    infoBoxY + 18,
    rightMaxW
  );

  // 4. Tabel Rincian Pos Pembayaran (Kolom Nominal Rata Kanan & Presisi)
  const rows: (string | number)[][] = [];
  if (tx.sppAmount > 0) {
    const monthStr =
      tx.sppMonths.length > 0
        ? `Bulan: ${tx.sppMonths.join(', ')}`
        : `Tahun Pelajaran ${tx.sppYear}`;
    rows.push([
      String(rows.length + 1),
      'SPP Bulanan',
      `Pembayaran SPP (${monthStr})`,
      formatRupiah(tx.sppAmount),
    ]);
  }
  if (tx.dspAmount > 0) {
    rows.push([
      String(rows.length + 1),
      'DSP',
      'Dana Sumbangan Pendidikan (DSP)',
      formatRupiah(tx.dspAmount),
    ]);
  }
  if (tx.class11Amount > 0) {
    rows.push([
      String(rows.length + 1),
      'Pembiayaan Kelas XI',
      'Pembayaran Praktikum / PKL Kelas XI',
      formatRupiah(tx.class11Amount),
    ]);
  }
  if (tx.class12Amount > 0) {
    rows.push([
      String(rows.length + 1),
      'Pembiayaan Kelas XII',
      'Pembayaran Ujian / Kegiatan Kelas XII',
      formatRupiah(tx.class12Amount),
    ]);
  }

  autoTable(doc, {
    startY: infoBoxY + infoBoxHeight + 5,
    margin: { left: marginX, right: marginX },
    head: [['No', 'Pos Pembayaran', 'Uraian / Rincian Pembayaran', 'Nominal (Rp)']],
    body: rows,
    foot: [
      ['', '', 'TOTAL PEMBAYARAN SAAT INI', formatRupiah(tx.totalAmount)],
      ['', '', 'SISA SALDO TAGIHAN SISWA', formatRupiah(remainingBalance)],
    ],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 3,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.25,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      valign: 'middle',
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      lineColor: [203, 213, 225],
      lineWidth: 0.25,
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 42, fontStyle: 'bold' },
      2: { cellWidth: 88, halign: 'left' },
      3: { cellWidth: 40, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index === 3) {
        data.cell.styles.halign = 'right';
      }
      if (data.section === 'head' && data.column.index === 0) {
        data.cell.styles.halign = 'center';
      }
      if (data.section === 'foot') {
        if (data.column.index === 2) {
          data.cell.styles.halign = 'right';
        }
        if (data.column.index === 3) {
          data.cell.styles.halign = 'right';
          if (data.row.index === 0) {
            data.cell.styles.textColor = [4, 120, 87]; // Emerald untuk Total Pembayaran
          }
        }
      }
    },
  });

  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY || 115;

  // 5. Kotak Terbilang & Catatan Transaksi
  const terbilangY = finalY + 4.5;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.roundedRect(marginX, terbilangY, pageWidth - marginX * 2, 13, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text('Terbilang :', marginX + 3.5, terbilangY + 5);
  doc.setFont('helvetica', 'bolditalic');
  doc.setTextColor(15, 23, 42);
  doc.text(`# ${nominalKeTerbilang(tx.totalAmount)} #`, marginX + 22, terbilangY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const noteText = tx.notes ? tx.notes : 'Pembayaran administrasi keuangan sekolah';
  doc.text(`Catatan   : ${noteText}`, marginX + 3.5, terbilangY + 10);

  // 6. Blok Tanda Tangan Resmi (Simetris Kiri & Kanan)
  const signTopY = terbilangY + 21;
  const leftCenterX = 52;
  const rightCenterX = 158;
  const cashierDisplay = (tx.cashierName || settings.cashierName || 'Bendahara Penerima').trim();
  const payerDisplay = (tx.payerName || tx.studentName).trim();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);

  // Kanan Atas: Kota & Tanggal Resmi
  doc.text(
    `${settings.schoolCity || 'Sukabumi'}, ${formatTanggalResmiIndonesia(tx.txDate)}`,
    rightCenterX,
    signTopY,
    { align: 'center' }
  );

  // Jabatan Penandatangan Kiri & Kanan (Sejajar Horizontal)
  doc.text('Penyetor / Wali Murid,', leftCenterX, signTopY + 5, { align: 'center' });
  doc.text('Kasir / Bendahara Penerima,', rightCenterX, signTopY + 5, {
    align: 'center',
  });

  // Ruang Tanda Tangan & Nama Terang
  const nameY = signTopY + 25;
  doc.setFont('helvetica', 'bold');
  doc.text(`( ${payerDisplay} )`, leftCenterX, nameY, { align: 'center' });
  doc.text(`( ${cashierDisplay} )`, rightCenterX, nameY, { align: 'center' });

  // Garis bawah tipis pada nama penandatangan
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.25);
  doc.line(leftCenterX - 26, nameY + 1.2, leftCenterX + 26, nameY + 1.2);
  doc.line(rightCenterX - 28, nameY + 1.2, rightCenterX + 28, nameY + 1.2);

  // Tampilkan NIP Kasir hanya jika diisi (bukan '-')
  const cashierNipFormatted = formatNipLine(settings.cashierNip);
  if (cashierNipFormatted) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(cashierNipFormatted, rightCenterX, nameY + 5, { align: 'center' });
  }

  // 7. Garis Potong & Catatan Kaki Validasi Kuitansi
  const footerLineY = nameY + 13;
  doc.setDrawColor(203, 213, 225);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.line(marginX, footerLineY, pageWidth - marginX, footerLineY);
  doc.setLineDashPattern([], 0);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Bukti pembayaran sah ${settings.schoolName} · Tercatat otomatis di database Cloud Firestore · Dicetak: ${formatTanggalResmiIndonesia(
      tx.txDate
    )}`,
    pageWidth / 2,
    footerLineY + 4.5,
    { align: 'center' }
  );

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
  const pageWidth = 210;
  const marginX = 14;

  const afterKopY = renderOfficialKopSurat(doc, settings, pageWidth, marginX);

  const titleY = afterKopY + 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `KARTU KENDALI PEMBAYARAN SPP SISWA — TAHUN PELAJARAN ${academicYear}`,
    pageWidth / 2,
    titleY,
    { align: 'center' }
  );

  // Kotak Biodata & Ringkasan Saldo Siswa
  const boxY = titleY + 4;
  const boxH = 22;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, boxY, pageWidth - marginX * 2, boxH, 1.8, 1.8, 'FD');

  doc.setFontSize(8.8);
  drawAlignedField(doc, 'NIS', student.nis, 18, 45, 48, boxY + 6, 52, true);
  drawAlignedField(doc, 'Nama Siswa', student.name, 18, 45, 48, boxY + 12, 52, true);
  drawAlignedField(
    doc,
    'Kelas / Jurusan',
    `${student.className} — ${student.major}`,
    18,
    45,
    48,
    boxY + 18,
    56
  );

  drawAlignedField(
    doc,
    'Sisa Tagihan SPP',
    formatRupiah(student.sppBalance),
    114,
    148,
    151,
    boxY + 6,
    42
  );
  drawAlignedField(
    doc,
    'Sisa Tagihan DSP',
    formatRupiah(student.dspBalance),
    114,
    148,
    151,
    boxY + 12,
    42
  );
  drawAlignedField(
    doc,
    'Total Tunggakan',
    formatRupiah(student.totalBalance),
    114,
    148,
    151,
    boxY + 18,
    42,
    true
  );

  // Mapping bulan Juli - Juni spesifik sesuai Tahun Pelajaran (academicYear)
  const studentTxs = transactions.filter(
    (t) => t.studentId === student.id && t.sppAmount > 0
  );

  const tableRows = ACADEMIC_MONTHS.map((m, idx) => {
    const labelWithYear = `${m.name} (${academicYear})`;
    const fullMonthKey = `${m.name} ${academicYear}`.toLowerCase();

    const isPaidInStudentDoc = (student.paidMonths || []).some((pm) => {
      const normPm = pm.trim().toLowerCase();
      if (normPm === fullMonthKey) return true;
      if (!normPm.includes('/') && normPm.startsWith(m.name.toLowerCase())) return true;
      return false;
    });

    const matchingTx = studentTxs.find((t) =>
      (t.sppMonths || []).some((sm) => {
        const normSm = sm.trim().toLowerCase();
        if (normSm === fullMonthKey) return true;
        if (
          !normSm.includes('/') &&
          (!t.sppYear || t.sppYear === academicYear) &&
          normSm.startsWith(m.name.toLowerCase())
        ) {
          return true;
        }
        return false;
      })
    );
    const isPaid = isPaidInStudentDoc || Boolean(matchingTx);

    return [
      String(idx + 1),
      labelWithYear,
      formatRupiah(SPP_MONTHLY_FEE),
      isPaid ? 'LUNAS' : 'BELUM BAYAR',
      matchingTx
        ? formatTanggalResmiIndonesia(matchingTx.txDate)
        : isPaid
        ? 'Tercatat'
        : '-',
      matchingTx ? matchingTx.receiptNo : '-',
      matchingTx ? matchingTx.cashierName : isPaid ? settings.cashierName : '-',
    ];
  });

  autoTable(doc, {
    startY: boxY + boxH + 5,
    margin: { left: marginX, right: marginX },
    head: [
      [
        'No',
        'Bulan',
        'Tarif SPP',
        'Status',
        'Tanggal Bayar',
        'No. Kuitansi',
        'Petugas Kasir',
      ],
    ],
    body: tableRows,
    theme: 'grid',
    styles: {
      fontSize: 8.8,
      cellPadding: 2.8,
      lineColor: [203, 213, 225],
      lineWidth: 0.25,
    },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 11, halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 3) {
        if (data.cell.raw === 'LUNAS') {
          data.cell.styles.textColor = [4, 120, 87];
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
      ?.finalY || 180;
  const signY = finalY + 12;
  const leftCenterX = 52;
  const rightCenterX = 156;
  const todayIso = new Date().toISOString().slice(0, 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);

  doc.text('Mengetahui,', leftCenterX, signY, { align: 'center' });
  doc.text(`Kepala ${settings.schoolName},`, leftCenterX, signY + 5, {
    align: 'center',
  });
  doc.setFont('helvetica', 'bold');
  doc.text(`( ${settings.principalName} )`, leftCenterX, signY + 24, {
    align: 'center',
  });
  const principalNipLine = formatNipLine(settings.principalNip);
  if (principalNipLine) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(principalNipLine, leftCenterX, signY + 28.5, { align: 'center' });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    `${settings.schoolCity || 'Sukabumi'}, ${formatTanggalResmiIndonesia(todayIso)}`,
    rightCenterX,
    signY,
    { align: 'center' }
  );
  doc.text('Bendahara / Kasir Penerima,', rightCenterX, signY + 5, {
    align: 'center',
  });
  doc.setFont('helvetica', 'bold');
  doc.text(`( ${settings.cashierName} )`, rightCenterX, signY + 24, {
    align: 'center',
  });
  const cashierNipLine = formatNipLine(settings.cashierNip);
  if (cashierNipLine) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(cashierNipLine, rightCenterX, signY + 28.5, { align: 'center' });
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
  const pageWidth = 210;
  const marginX = 14;

  const afterKopY = renderOfficialKopSurat(doc, settings, pageWidth, marginX);

  const titleY = afterKopY + 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(15, 23, 42);
  doc.text('BUKU RIWAYAT TRANSAKSI KEUANGAN SISWA', pageWidth / 2, titleY, {
    align: 'center',
  });

  const boxY = titleY + 4;
  const boxH = 22;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, boxY, pageWidth - marginX * 2, boxH, 1.8, 1.8, 'FD');

  doc.setFontSize(8.8);
  drawAlignedField(
    doc,
    'NIS / Nama',
    `${student.nis} — ${student.name}`,
    18,
    45,
    48,
    boxY + 6,
    56,
    true
  );
  drawAlignedField(
    doc,
    'Kelas / Jurusan',
    `${student.className} (${student.major})`,
    18,
    45,
    48,
    boxY + 12,
    56
  );
  drawAlignedField(doc, 'No. WhatsApp', student.waNumber, 18, 45, 48, boxY + 18, 56);

  drawAlignedField(
    doc,
    'Sisa SPP',
    formatRupiah(student.sppBalance),
    114,
    148,
    151,
    boxY + 6,
    42
  );
  drawAlignedField(
    doc,
    'Sisa DSP',
    formatRupiah(student.dspBalance),
    114,
    148,
    151,
    boxY + 12,
    42
  );
  drawAlignedField(
    doc,
    'Sisa Kls XI/XII',
    formatRupiah(student.class11Balance + student.class12Balance),
    114,
    148,
    151,
    boxY + 18,
    42
  );

  const studentTxs = transactions.filter((t) => t.studentId === student.id);
  const bodyRows = studentTxs.map((tx, idx) => [
    String(idx + 1),
    formatTanggalResmiIndonesia(tx.txDate),
    tx.receiptNo,
    tx.category,
    tx.sppMonths.length > 0 ? tx.sppMonths.join(', ') : tx.notes || '-',
    tx.payerName,
    tx.cashierName,
    formatRupiah(tx.totalAmount),
  ]);

  const totalPaid = studentTxs.reduce((acc, cur) => acc + cur.totalAmount, 0);

  autoTable(doc, {
    startY: boxY + boxH + 5,
    margin: { left: marginX, right: marginX },
    head: [
      [
        'No',
        'Tanggal',
        'No. Kuitansi',
        'Pos',
        'Keterangan / Bulan',
        'Penyetor',
        'Kasir',
        'Nominal (Rp)',
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
      ['', '', '', '', '', '', 'TOTAL TERBAYAR', formatRupiah(totalPaid)],
      [
        '',
        '',
        '',
        '',
        '',
        '',
        'SISA TUNGGAKAN',
        formatRupiah(student.totalBalance),
      ],
    ],
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      cellPadding: 2.5,
      lineColor: [203, 213, 225],
      lineWidth: 0.25,
    },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      7: { halign: 'right', fontStyle: 'bold' },
    },
  });

  doc.save(
    `Buku_Riwayat_${student.nis}_${student.name.replace(/\s+/g, '_')}.pdf`
  );
}

/**
 * 4. Ekspor Laporan Buku Kas / Laporan Bulanan / Rekap Harian ke PDF (dengan Rekap Kategori & Kolom Tanda Tangan Resmi)
 */
export function generateCashbookPDF(
  transactions: Transaction[],
  title: string,
  periodLabel: string,
  settings: SchoolSettings = DEFAULT_SCHOOL_SETTINGS
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = 297;
  const marginX = 14;

  const afterKopY = renderOfficialKopSurat(doc, settings, pageWidth, marginX);

  const titleY = afterKopY + 6.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`${title.toUpperCase()} — PERIODE: ${periodLabel.toUpperCase()}`, pageWidth / 2, titleY, {
    align: 'center',
  });

  const sumSpp = transactions.reduce((s, t) => s + t.sppAmount, 0);
  const sumDsp = transactions.reduce((s, t) => s + t.dspAmount, 0);
  const sumClass11 = transactions.reduce((s, t) => s + t.class11Amount, 0);
  const sumClass12 = transactions.reduce((s, t) => s + t.class12Amount, 0);
  const sumTotal = transactions.reduce((s, t) => s + t.totalAmount, 0);

  // Kotak Rekapitulasi Per Kategori (SPP, DSP, Kls XI, Kls XII, Total)
  const summaryBoxY = titleY + 3.5;
  const summaryBoxH = 14;
  const totalBoxWidth = pageWidth - marginX * 2;
  const colW = totalBoxWidth / 5;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.roundedRect(marginX, summaryBoxY, totalBoxWidth, summaryBoxH, 1.5, 1.5, 'FD');

  const summaryItems = [
    { label: 'REKAP POS SPP', value: formatRupiah(sumSpp) },
    { label: 'REKAP POS DSP', value: formatRupiah(sumDsp) },
    { label: 'PEMBIAYAAN KLS XI', value: formatRupiah(sumClass11) },
    { label: 'PEMBIAYAAN KLS XII', value: formatRupiah(sumClass12) },
    { label: `TOTAL (${transactions.length} TRANSAKSI)`, value: formatRupiah(sumTotal), highlight: true },
  ];

  summaryItems.forEach((item, idx) => {
    const cellX = marginX + idx * colW;
    if (idx > 0) {
      doc.setDrawColor(226, 232, 240);
      doc.line(cellX, summaryBoxY + 2, cellX, summaryBoxY + summaryBoxH - 2);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(100, 116, 139);
    doc.text(item.label, cellX + colW / 2, summaryBoxY + 5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    if (item.highlight) {
      doc.setTextColor(4, 120, 87);
    } else {
      doc.setTextColor(15, 23, 42);
    }
    doc.text(item.value, cellX + colW / 2, summaryBoxY + 11, { align: 'center' });
  });

  const rows = transactions.map((tx, idx) => [
    String(idx + 1),
    formatTanggalResmiIndonesia(tx.txDate),
    tx.receiptNo,
    `${tx.studentNis} - ${tx.studentName}`,
    tx.studentClass,
    tx.category,
    formatRupiah(tx.sppAmount),
    formatRupiah(tx.dspAmount),
    formatRupiah(tx.class11Amount),
    formatRupiah(tx.class12Amount),
    formatRupiah(tx.totalAmount),
    tx.cashierName,
  ]);

  autoTable(doc, {
    startY: summaryBoxY + summaryBoxH + 4,
    margin: { left: marginX, right: marginX },
    head: [
      [
        'No',
        'Tanggal',
        'No. Kuitansi',
        'NIS & Nama Siswa',
        'Kelas',
        'Pos',
        'SPP',
        'DSP',
        'Kls XI',
        'Kls XII',
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
              'Rp 0',
              'Rp 0',
              'Rp 0',
              'Rp 0',
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
        'REKAPITULASI TOTAL',
        formatRupiah(sumSpp),
        formatRupiah(sumDsp),
        formatRupiah(sumClass11),
        formatRupiah(sumClass12),
        formatRupiah(sumTotal),
        '',
      ],
    ],
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2,
      lineColor: [203, 213, 225],
      lineWidth: 0.25,
    },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
      9: { halign: 'right' },
      10: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if ((data.section === 'head' || data.section === 'foot') && data.column.index >= 6 && data.column.index <= 10) {
        data.cell.styles.halign = 'right';
      }
    },
  });

  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY || 140;

  // Pastikan ruang tanda tangan tidak terpotong ke margin bawah (Landscape A4: tinggi 210mm)
  let signY = finalY + 9;
  if (signY > 160) {
    doc.addPage();
    signY = 32;
  }

  const col1CenterX = 56;
  const col2CenterX = 148.5;
  const col3CenterX = 241;
  const todayIso = new Date().toISOString().slice(0, 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);

  // 1. Kolom Kiri: Mengetahui, Kepala Sekolah
  doc.text('Mengetahui,', col1CenterX, signY, { align: 'center' });
  doc.text(`Kepala ${settings.schoolName},`, col1CenterX, signY + 4.5, {
    align: 'center',
  });
  doc.setFont('helvetica', 'bold');
  doc.text(`( ${settings.principalName} )`, col1CenterX, signY + 23.5, {
    align: 'center',
  });
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.25);
  doc.line(col1CenterX - 28, signY + 24.5, col1CenterX + 28, signY + 24.5);
  const principalNipLine = formatNipLine(settings.principalNip);
  if (principalNipLine) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(principalNipLine, col1CenterX, signY + 28.5, { align: 'center' });
  }

  // 2. Kolom Tengah: Menyetujui, Bendahara Umum (Esih Sukaesih)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('Menyetujui,', col2CenterX, signY, { align: 'center' });
  doc.text('Bendahara Umum,', col2CenterX, signY + 4.5, {
    align: 'center',
  });
  doc.setFont('helvetica', 'bold');
  const treasurerDisplayName = (
    settings.treasurerName || DEFAULT_SCHOOL_SETTINGS.treasurerName || 'Esih Sukaesih'
  ).trim();
  doc.text(`( ${treasurerDisplayName} )`, col2CenterX, signY + 23.5, {
    align: 'center',
  });
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.25);
  doc.line(col2CenterX - 28, signY + 24.5, col2CenterX + 28, signY + 24.5);
  const treasurerNipLine = formatNipLine(settings.treasurerNip);
  if (treasurerNipLine) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(treasurerNipLine, col2CenterX, signY + 28.5, { align: 'center' });
  }

  // 3. Kolom Kanan: Kasir / Bendahara Penerima
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `${settings.schoolCity || 'Sukabumi'}, ${formatTanggalResmiIndonesia(todayIso)}`,
    col3CenterX,
    signY,
    { align: 'center' }
  );
  doc.text('Bendahara / Kasir Penerima,', col3CenterX, signY + 4.5, {
    align: 'center',
  });
  doc.setFont('helvetica', 'bold');
  doc.text(`( ${settings.cashierName} )`, col3CenterX, signY + 23.5, {
    align: 'center',
  });
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.25);
  doc.line(col3CenterX - 28, signY + 24.5, col3CenterX + 28, signY + 24.5);
  const cashierNipLine = formatNipLine(settings.cashierNip);
  if (cashierNipLine) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(cashierNipLine, col3CenterX, signY + 28.5, { align: 'center' });
  }

  doc.save(
    `${title.replace(/\s+/g, '_')}_${periodLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`
  );
}

/**
 * 5. Ekspor Tabel Laporan ke Excel (.xls) via SheetJS (Dilengkapi Baris Rekapitulasi Total Kategori)
 */
export function exportTransactionsToExcel(
  transactions: Transaction[],
  filenamePrefix = 'Buku_Kas_SMKS_PGRI_1'
): void {
  const sumSpp = transactions.reduce((s, t) => s + t.sppAmount, 0);
  const sumDsp = transactions.reduce((s, t) => s + t.dspAmount, 0);
  const sumClass11 = transactions.reduce((s, t) => s + t.class11Amount, 0);
  const sumClass12 = transactions.reduce((s, t) => s + t.class12Amount, 0);
  const sumTotal = transactions.reduce((s, t) => s + t.totalAmount, 0);

  const sheetData = transactions.map((tx, idx) => ({
    No: String(idx + 1),
    Tanggal: tx.txDate,
    'No. Kuitansi': tx.receiptNo,
    NIS: tx.studentNis,
    'Nama Siswa': tx.studentName,
    Kelas: tx.studentClass,
    Jurusan: tx.studentMajor,
    Penyetor: tx.payerName,
    'Kategori Pos': String(tx.category),
    'Bulan SPP': tx.sppMonths.join(', '),
    'Nominal SPP (Rp)': tx.sppAmount,
    'Nominal DSP (Rp)': tx.dspAmount,
    'Pembiayaan Kelas XI (Rp)': tx.class11Amount,
    'Pembiayaan Kelas XII (Rp)': tx.class12Amount,
    'Total Bayar (Rp)': tx.totalAmount,
    Kasir: tx.cashierName,
    Catatan: tx.notes,
  }));

  sheetData.push({
    No: '',
    Tanggal: '',
    'No. Kuitansi': '',
    NIS: '',
    'Nama Siswa': '',
    Kelas: '',
    Jurusan: '',
    Penyetor: '',
    'Kategori Pos': 'REKAPITULASI TOTAL',
    'Bulan SPP': `${transactions.length} Transaksi`,
    'Nominal SPP (Rp)': sumSpp,
    'Nominal DSP (Rp)': sumDsp,
    'Pembiayaan Kelas XI (Rp)': sumClass11,
    'Pembiayaan Kelas XII (Rp)': sumClass12,
    'Total Bayar (Rp)': sumTotal,
    Kasir: '',
    Catatan: '',
  });

  const worksheet = XLSX.utils.json_to_sheet(sheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan_Keuangan');
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

  // Abaikan baris yang benar-benar kosong di akhir sheet Excel
  const nonEmptyRows = rawRows.filter((row) =>
    Object.values(row).some((val) => String(val ?? '').trim() !== '')
  );

  return nonEmptyRows.map((row, index) => {
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
      if (typeof val === 'number') {
        if (Number.isNaN(val)) return fallback;
        return Math.max(0, Math.min(100000000, Math.round(val)));
      }
      const rawStr = String(val).trim();
      if (!rawStr) return fallback;
      // Hapus sen desimal (,00 atau .00 di akhir) lalu ambil seluruh digit angka Rupiah
      const withoutCents = rawStr.replace(/[,.]00$/, '');
      const digitsOnly = withoutCents.replace(/[^0-9-]/g, '');
      if (!digitsOnly || digitsOnly === '-') return fallback;
      const numeric = Number(digitsOnly);
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


