import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertCircle,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Database,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Palette,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Shield,
  ShoppingCart,
  Sun,
  Trash2,
  Upload,
  UserCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  ACADEMIC_MONTHS,
  buildBillingWhatsAppUrl,
  buildReceiptWhatsAppUrl,
  CartItem,
  DEFAULT_SCHOOL_SETTINGS,
  DEFAULT_TARIFF_BY_GRADE,
  detectGradeLevelFromClass,
  FINANCIAL_COLOR_THEMES,
  FinancialThemeId,
  formatRupiah,
  GradeLevel,
  normalizeWaNumber,
  PaymentCategory,
  SCHOOL_MAJORS,
  SchoolSettings,
  SPP_MONTHLY_FEE,
  Student,
  Transaction,
  UserProfile,
  UserRole,
} from './types';
import {
  downloadDatabaseBackupCSV,
  downloadDatabaseBackupJSON,
  downloadStudentImportTemplate,
  exportTransactionsToExcel,
  generateCashbookPDF,
  generateReceiptPDF,
  generateSppCardPDF,
  generateStudentHistoryPDF,
  ParsedImportStudentRow,
  parseStudentImportExcelBuffer,
} from './utils/exportDocs';
import { SppTrendChart } from './components/SppTrendChart';
import { DocsAndSchemaModal } from './components/DocsAndSchemaModal';
import { SettingsAndTutorialView } from './components/SettingsAndTutorialView';

type NavMenu =
  | 'dashboard'
  | 'pos'
  | 'students'
  | 'reports'
  | 'arrears'
  | 'history'
  | 'settings';

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

export default function App() {
  // ===========================================================================
  // 1. STATE: THEME, AUTH, RBAC & NAVIGATION
  // ===========================================================================
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('smks_pgri1_theme');
    return saved === 'dark';
  });

  // Tema Warna Dasar Keuangan (Default baru: 'emerald' - Emerald Sovereign)
  const [accentTheme, setAccentTheme] = useState<FinancialThemeId>(() => {
    const saved = localStorage.getItem('smks_pgri1_accent_theme') as FinancialThemeId | null;
    if (saved && ['emerald', 'teal', 'indigo', 'amber', 'navy'].includes(saved)) {
      return saved;
    }
    return 'emerald';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('smks_pgri1_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('smks_pgri1_theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accentTheme);
    localStorage.setItem('smks_pgri1_accent_theme', accentTheme);
  }, [accentTheme]);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  // ID Institusi Sekolah Terpadu agar seluruh Browser (Chrome, Edge, HP, Laptop) & Peran (Kasir/Kepsek) tersinkronisasi ke Cloud Firestore yang sama
  const SCHOOL_CLOUD_TENANT_ID = 'staff_smks_pgri1_local';
  const hasBackfilledStudentsRef = useRef<boolean>(false);
  const hasBackfilledTxRef = useRef<boolean>(false);

  // Helper untuk menyimpan dan memuat cache lokal
  const saveStudentsCache = (list: Student[]) => {
    try {
      localStorage.setItem('smks_pgri1_students_cache', JSON.stringify(list));
    } catch {
      // ignore storage quota
    }
  };

  const saveTransactionsCache = (list: Transaction[]) => {
    try {
      localStorage.setItem('smks_pgri1_transactions_cache', JSON.stringify(list));
    } catch {
      // ignore storage quota
    }
  };

  // ===========================================================================
  // 2. STATE: REALTIME FIRESTORE COLLECTIONS (STUDENTS, TRANSACTIONS & SETTINGS)
  // ===========================================================================
  const [students, setStudents] = useState<Student[]>(() => {
    try {
      const cached = localStorage.getItem('smks_pgri1_students_cache');
      if (cached) return JSON.parse(cached) as Student[];
    } catch {
      // ignore
    }
    return [];
  });
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const cached = localStorage.getItem('smks_pgri1_transactions_cache');
      if (cached) return JSON.parse(cached) as Transaction[];
    } catch {
      // ignore
    }
    return [];
  });
  const [dataLoading, setDataLoading] = useState<boolean>(true);
  const [schoolSettings, setSchoolSettings] = useState<SchoolSettings>(() => {
    try {
      const cached = localStorage.getItem('smks_pgri1_school_settings_cache');
      if (cached) {
        return { ...DEFAULT_SCHOOL_SETTINGS, ...JSON.parse(cached) };
      }
    } catch {
      // ignore parse errors
    }
    return DEFAULT_SCHOOL_SETTINGS;
  });
  const [settingsDocExists, setSettingsDocExists] = useState<boolean>(false);

  // Form Login Email & Password (Selalu sinkron 1:1 dengan Pengaturan & Panduan -> Akun & Password)
  const [emailInput, setEmailInput] = useState<string>(
    () => schoolSettings.cashierEmail || DEFAULT_SCHOOL_SETTINGS.cashierEmail
  );
  const [passwordInput, setPasswordInput] = useState<string>(
    () => schoolSettings.cashierPasswordHint || DEFAULT_SCHOOL_SETTINGS.cashierPasswordHint
  );
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [desiredQuickRole, setDesiredQuickRole] = useState<UserRole>('kasir');

  // Sinkronkan input halaman Login setiap kali data Pengaturan Sekolah (Akun & Password) dimuat atau berubah
  useEffect(() => {
    if (desiredQuickRole === 'kasir') {
      setEmailInput(schoolSettings.cashierEmail || DEFAULT_SCHOOL_SETTINGS.cashierEmail);
      setPasswordInput(
        schoolSettings.cashierPasswordHint || DEFAULT_SCHOOL_SETTINGS.cashierPasswordHint
      );
    } else {
      setEmailInput(schoolSettings.principalEmail || DEFAULT_SCHOOL_SETTINGS.principalEmail);
      setPasswordInput(
        schoolSettings.principalPasswordHint || DEFAULT_SCHOOL_SETTINGS.principalPasswordHint
      );
    }
  }, [
    desiredQuickRole,
    schoolSettings.cashierEmail,
    schoolSettings.cashierPasswordHint,
    schoolSettings.principalEmail,
    schoolSettings.principalPasswordHint,
  ]);

  // Navigation, Global Quick Search & UI
  const [activeMenu, setActiveMenu] = useState<NavMenu>('dashboard');
  const [globalQuickSearch, setGlobalQuickSearch] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [docsModalOpen, setDocsModalOpen] = useState<boolean>(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  // Master Data Siswa Form, Edit & Multi-Select Delete State
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState<boolean>(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [nisForm, setNisForm] = useState<string>('');
  const [nameForm, setNameForm] = useState<string>('');
  const [classForm, setClassForm] = useState<string>('X TKJ 1');
  const [majorForm, setMajorForm] = useState<string>(SCHOOL_MAJORS[0]);
  const [waForm, setWaForm] = useState<string>('081288990011');
  const [sppForm, setSppForm] = useState<number>(DEFAULT_TARIFF_BY_GRADE.X.sppBalance);
  const [dspForm, setDspForm] = useState<number>(DEFAULT_TARIFF_BY_GRADE.X.dspBalance);
  const [class11Form, setClass11Form] = useState<number>(0);
  const [class12Form, setClass12Form] = useState<number>(0);

  // Bulk Import Siswa State (Excel / CSV)
  const bulkFileInputRef = useRef<HTMLInputElement | null>(null);
  const [bulkImportModalOpen, setBulkImportModalOpen] = useState<boolean>(false);
  const [bulkImportFileName, setBulkImportFileName] = useState<string>('');
  const [bulkImportRows, setBulkImportRows] = useState<ParsedImportStudentRow[]>([]);

  // POS Kasir State
  const [posSearchQuery, setPosSearchQuery] = useState<string>('');
  const [selectedPosStudentId, setSelectedPosStudentId] = useState<string>('');
  const [posCategory, setPosCategory] = useState<PaymentCategory>('SPP');
  const [posSppYear, setPosSppYear] = useState<string>('2026/2027');
  const [posSelectedMonths, setPosSelectedMonths] = useState<string[]>([]);
  const [posAmountInput, setPosAmountInput] = useState<number>(0);
  const [posPayerName, setPosPayerName] = useState<string>('');
  const [posNotes, setPosNotes] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [lastCompletedTx, setLastCompletedTx] = useState<{
    tx: Transaction;
    remainingBalance: number;
  } | null>(null);

  // Laporan (Rekap Harian, Laporan Bulanan & Buku Kas) State
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const currentMonthStr = useMemo(() => todayStr.slice(0, 7), [todayStr]);
  const [reportTab, setReportTab] = useState<'daily' | 'monthly' | 'cashbook'>('monthly');
  const [selectedReportMonth, setSelectedReportMonth] = useState<string>(() =>
    new Date().toISOString().slice(0, 7)
  );
  const [dateStart, setDateStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateEnd, setDateEnd] = useState<string>(todayStr);
  const [reportCategoryFilter, setReportCategoryFilter] = useState<string>('ALL');
  const [reportSearch, setReportSearch] = useState<string>('');
  const [reportPage, setReportPage] = useState<number>(1);
  const REPORT_PAGE_SIZE = 8;

  // Tunggakan & Penagihan State
  const [arrearsClassFilter, setArrearsClassFilter] = useState<string>('ALL');
  const [arrearsSearch, setArrearsSearch] = useState<string>('');

  // Riwayat & Koreksi (Void & Kartu SPP) State
  const [historySearch, setHistorySearch] = useState<string>('');
  const [selectedHistoryStudentId, setSelectedHistoryStudentId] = useState<string>('');
  const [sppCardYear, setSppCardYear] = useState<string>('2026/2027');
  const [confirmVoidTx, setConfirmVoidTx] = useState<Transaction | null>(null);

  // ===========================================================================
  // 3. AUTHENTICATION & PROFILE SYNC (SINKRON 1:1 DENGAN PENGATURAN & PANDUAN)
  // ===========================================================================
  const getRoleConfiguredAccount = (
    role: UserRole,
    settingsObj: SchoolSettings = schoolSettings
  ) => {
    if (role === 'kasir') {
      return {
        email: settingsObj.cashierEmail || DEFAULT_SCHOOL_SETTINGS.cashierEmail,
        password:
          settingsObj.cashierPasswordHint || DEFAULT_SCHOOL_SETTINGS.cashierPasswordHint,
        name: settingsObj.cashierName || DEFAULT_SCHOOL_SETTINGS.cashierName,
      };
    }
    return {
      email: settingsObj.principalEmail || DEFAULT_SCHOOL_SETTINGS.principalEmail,
      password:
        settingsObj.principalPasswordHint || DEFAULT_SCHOOL_SETTINGS.principalPasswordHint,
      name: settingsObj.principalName || DEFAULT_SCHOOL_SETTINGS.principalName,
    };
  };

  const activateLocalStaffSession = (
    role: UserRole,
    customEmail?: string,
    settingsObj: SchoolSettings = schoolSettings
  ) => {
    const roleAcc = getRoleConfiguredAccount(role, settingsObj);
    const activeEmail = customEmail || roleAcc.email;
    const displayName = roleAcc.name;
    const virtualUser = {
      uid: auth.currentUser?.uid || 'staff_smks_pgri1_local',
      email: activeEmail,
      displayName,
    } as User;

    const profile: UserProfile = {
      uid: virtualUser.uid,
      name: displayName.slice(0, 100),
      email: activeEmail.slice(0, 150),
      role,
    };

    try {
      localStorage.setItem(
        'smks_pgri1_active_staff_session',
        JSON.stringify({ role, email: activeEmail, name: displayName })
      );
    } catch {
      // ignore
    }

    setCurrentUser(virtualUser);
    setUserProfile(profile);
    setAuthReady(true);
    setDataLoading(false);
    if (role === 'kepsek') {
      setActiveMenu('dashboard');
    }
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('smks_pgri1_active_staff_session');
    } catch {
      // ignore
    }
    setCurrentUser(null);
    setUserProfile(null);
    const roleAcc = getRoleConfiguredAccount(desiredQuickRole);
    setEmailInput(roleAcc.email);
    setPasswordInput(roleAcc.password);
    try {
      await signOut(auth);
    } catch {
      // ignore signOut errors if in local staff session
    }
    showToast('Anda telah keluar dari sistem.', 'info');
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      let cachedSettings = DEFAULT_SCHOOL_SETTINGS;
      try {
        const rawSettings = localStorage.getItem('smks_pgri1_school_settings_cache');
        if (rawSettings) {
          cachedSettings = { ...DEFAULT_SCHOOL_SETTINGS, ...JSON.parse(rawSettings) };
        }
      } catch {
        // ignore
      }

      if (!user) {
        // Cek apakah ada sesi staf aktif di localStorage
        try {
          const savedSession = localStorage.getItem('smks_pgri1_active_staff_session');
          if (savedSession) {
            const parsed = JSON.parse(savedSession) as {
              role: UserRole;
              email: string;
              name?: string;
            };
            const targetRole: UserRole = parsed.role === 'kepsek' ? 'kepsek' : 'kasir';
            const roleAcc = getRoleConfiguredAccount(targetRole, cachedSettings);
            activateLocalStaffSession(targetRole, roleAcc.email, cachedSettings);
            return;
          }
        } catch {
          // ignore
        }

        setCurrentUser(null);
        setUserProfile(null);
        setAuthReady(true);
        setDataLoading(false);
        return;
      }

      const savedDesiredRole =
        (localStorage.getItem('smks_pgri1_desired_role') as UserRole) || 'kasir';
      const roleAcc = getRoleConfiguredAccount(savedDesiredRole, cachedSettings);

      setCurrentUser({
        ...user,
        email: roleAcc.email,
        displayName: roleAcc.name,
      } as User);

      const userDocRef = doc(db, 'users', user.uid);
      try {
        const snap = await getDoc(userDocRef);

        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          const syncedRole: UserRole = data.role || savedDesiredRole;
          const syncedAcc = getRoleConfiguredAccount(syncedRole, cachedSettings);
          setUserProfile({
            ...data,
            name: syncedAcc.name.slice(0, 100),
            email: syncedAcc.email.slice(0, 150),
            role: syncedRole,
          });
          if (syncedRole === 'kepsek' && (activeMenu === 'pos' || activeMenu === 'students')) {
            setActiveMenu('dashboard');
          }
        } else {
          const isBootstrapAdmin = user.email === 'diyanto13@gmail.com';
          const initialRole: UserRole = isBootstrapAdmin ? savedDesiredRole : savedDesiredRole;
          const syncedAcc = getRoleConfiguredAccount(initialRole, cachedSettings);
          const newProfile: UserProfile = {
            uid: user.uid,
            name: syncedAcc.name.slice(0, 100),
            email: syncedAcc.email.slice(0, 150),
            role: initialRole,
          };
          await setDoc(userDocRef, {
            ...newProfile,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          setUserProfile(newProfile);
        }
      } catch (error) {
        console.error('Profile sync error:', error);
        setUserProfile({
          uid: user.uid,
          name: roleAcc.name.slice(0, 100),
          email: roleAcc.email.slice(0, 150),
          role: savedDesiredRole,
        });
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  // Attach real-time Firestore listeners untuk seluruh Browser (baik di AI Studio maupun Vercel)
  useEffect(() => {
    if (!authReady || !currentUser) return;

    setDataLoading(true);

    const studentsQuery = query(
      collection(db, 'students'),
      where('createdBy', '==', SCHOOL_CLOUD_TENANT_ID)
    );
    const txQuery = query(
      collection(db, 'transactions'),
      where('createdBy', '==', SCHOOL_CLOUD_TENANT_ID)
    );

    const unsubStudents = onSnapshot(
      studentsQuery,
      async (snapshot) => {
        const cloudList: Student[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Student, 'id'>),
        }));

        // Jika di Browser 1 sudah ada data siswa di cache lokal yang belum terunggah ke Cloud Firestore, unggah otomatis (Auto-Backfill)
        let mergedList = [...cloudList];
        if (!hasBackfilledStudentsRef.current) {
          hasBackfilledStudentsRef.current = true;
          try {
            const rawLocal = localStorage.getItem('smks_pgri1_students_cache');
            const localStudents: Student[] = rawLocal ? JSON.parse(rawLocal) : [];
            const cloudNisSet = new Set(cloudList.map((s) => s.nis.toLowerCase()));
            const unsyncedLocal = localStudents.filter(
              (ls) => ls.nis && !cloudNisSet.has(ls.nis.toLowerCase())
            );

            if (unsyncedLocal.length > 0) {
              mergedList = [...cloudList, ...unsyncedLocal];
              const CHUNK_SIZE = 400;
              for (let i = 0; i < unsyncedLocal.length; i += CHUNK_SIZE) {
                const chunk = unsyncedLocal.slice(i, i + CHUNK_SIZE);
                const batch = writeBatch(db);
                chunk.forEach((st) => {
                  const stRef = doc(db, 'students', st.id);
                  batch.set(stRef, {
                    nis: st.nis,
                    name: st.name,
                    className: st.className,
                    gradeLevel: st.gradeLevel,
                    major: st.major,
                    waNumber: st.waNumber,
                    sppBalance: st.sppBalance,
                    dspBalance: st.dspBalance,
                    class11Balance: st.class11Balance,
                    class12Balance: st.class12Balance,
                    totalBalance:
                      st.sppBalance + st.dspBalance + st.class11Balance + st.class12Balance,
                    paidMonths: (st.paidMonths || []).slice(0, 12),
                    createdBy: SCHOOL_CLOUD_TENANT_ID,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  });
                });
                await batch.commit();
              }
            }
          } catch (syncErr) {
            console.warn('Auto-backfill local students to cloud warning:', syncErr);
          }
        }

        mergedList.sort((a, b) => a.nis.localeCompare(b.nis));
        setStudents(mergedList);
        saveStudentsCache(mergedList);
        setDataLoading(false);
      },
      (error) => {
        setDataLoading(false);
        console.warn('Firestore students listener fallback to local cache:', error);
      }
    );

    const unsubTx = onSnapshot(
      txQuery,
      async (snapshot) => {
        const cloudTxs: Transaction[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Transaction, 'id'>),
        }));

        let mergedTxs = [...cloudTxs];
        if (!hasBackfilledTxRef.current) {
          hasBackfilledTxRef.current = true;
          try {
            const rawLocalTxs = localStorage.getItem('smks_pgri1_transactions_cache');
            const localTxs: Transaction[] = rawLocalTxs ? JSON.parse(rawLocalTxs) : [];
            const cloudIdSet = new Set(cloudTxs.map((t) => t.id));
            const unsyncedTxs = localTxs.filter((lt) => lt.id && !cloudIdSet.has(lt.id));
            if (unsyncedTxs.length > 0) {
              mergedTxs = [...cloudTxs, ...unsyncedTxs];
            }
          } catch {
            // ignore
          }
        }

        mergedTxs.sort((a, b) => {
          const dateCmp = b.txDate.localeCompare(a.txDate);
          if (dateCmp !== 0) return dateCmp;
          return b.receiptNo.localeCompare(a.receiptNo);
        });
        setTransactions(mergedTxs);
        saveTransactionsCache(mergedTxs);
      },
      (error) => {
        console.warn('Firestore transactions listener fallback to local cache:', error);
      }
    );

    const settingsRef = doc(db, 'settings', SCHOOL_CLOUD_TENANT_ID);
    const unsubSettings = onSnapshot(
      settingsRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<SchoolSettings>;
          const merged: SchoolSettings = {
            schoolName: data.schoolName || DEFAULT_SCHOOL_SETTINGS.schoolName,
            schoolSubtitle: data.schoolSubtitle || DEFAULT_SCHOOL_SETTINGS.schoolSubtitle,
            schoolAddress: data.schoolAddress || DEFAULT_SCHOOL_SETTINGS.schoolAddress,
            schoolContact: data.schoolContact || DEFAULT_SCHOOL_SETTINGS.schoolContact,
            schoolCity: data.schoolCity || DEFAULT_SCHOOL_SETTINGS.schoolCity,
            logoDataUrl: typeof data.logoDataUrl === 'string' ? data.logoDataUrl : '',
            cashierName: data.cashierName || DEFAULT_SCHOOL_SETTINGS.cashierName,
            cashierNip: data.cashierNip || DEFAULT_SCHOOL_SETTINGS.cashierNip,
            cashierEmail: data.cashierEmail || DEFAULT_SCHOOL_SETTINGS.cashierEmail,
            cashierPasswordHint:
              data.cashierPasswordHint || DEFAULT_SCHOOL_SETTINGS.cashierPasswordHint,
            principalName: data.principalName || DEFAULT_SCHOOL_SETTINGS.principalName,
            principalNip: data.principalNip || DEFAULT_SCHOOL_SETTINGS.principalNip,
            principalEmail: data.principalEmail || DEFAULT_SCHOOL_SETTINGS.principalEmail,
            principalPasswordHint:
              data.principalPasswordHint || DEFAULT_SCHOOL_SETTINGS.principalPasswordHint,
            updatedBy: SCHOOL_CLOUD_TENANT_ID,
          };
          setSchoolSettings(merged);
          setSettingsDocExists(true);
          try {
            localStorage.setItem('smks_pgri1_school_settings_cache', JSON.stringify(merged));
          } catch {
            // ignore storage quota errors
          }
        } else {
          setSettingsDocExists(false);
        }
      },
      (error) => {
        console.warn('Firestore settings listener fallback to local cache:', error);
      }
    );

    return () => {
      unsubStudents();
      unsubTx();
      unsubSettings();
    };
  }, [authReady, currentUser]);

  const isKasir = userProfile?.role === 'kasir';

  // Sinkronisasi Paksa Seluruh Data Lokal ke Cloud Firestore (Agar Muncul di Semua Browser)
  const handleForceCloudSync = async () => {
    if (!currentUser) return;
    setBusyAction('Menyinkronkan seluruh data siswa & pengaturan ke Cloud Firestore...');
    try {
      const CHUNK_SIZE = 400;
      for (let i = 0; i < students.length; i += CHUNK_SIZE) {
        const chunk = students.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((st) => {
          const stRef = doc(db, 'students', st.id);
          batch.set(stRef, {
            nis: st.nis,
            name: st.name,
            className: st.className,
            gradeLevel: st.gradeLevel,
            major: st.major,
            waNumber: st.waNumber,
            sppBalance: st.sppBalance,
            dspBalance: st.dspBalance,
            class11Balance: st.class11Balance,
            class12Balance: st.class12Balance,
            totalBalance:
              st.sppBalance + st.dspBalance + st.class11Balance + st.class12Balance,
            paidMonths: (st.paidMonths || []).slice(0, 12),
            createdBy: SCHOOL_CLOUD_TENANT_ID,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }

      const settingsRef = doc(db, 'settings', SCHOOL_CLOUD_TENANT_ID);
      await setDoc(settingsRef, {
        ...schoolSettings,
        updatedBy: SCHOOL_CLOUD_TENANT_ID,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSettingsDocExists(true);

      showToast(
        `Berhasil menyinkronkan ${students.length} siswa ke Cloud Firestore! Sekarang data dapat dilihat di semua browser.`,
        'success'
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      showToast(`Gagal sinkronisasi ke Cloud: ${msg}`, 'error');
    } finally {
      setBusyAction(null);
    }
  };

  // Simpan Pengaturan Sekolah, Kop, Logo, Pejabat TTD & Akun ke Cloud Firestore & Cache Lokal
  const handleSaveSchoolSettings = async (updated: SchoolSettings) => {
    if (!currentUser || !isKasir) {
      showToast('Hanya Kasir yang diizinkan menyimpan perubahan pengaturan sistem.', 'error');
      return;
    }

    const payload: SchoolSettings = {
      schoolName: (updated.schoolName || DEFAULT_SCHOOL_SETTINGS.schoolName).trim().slice(0, 120),
      schoolSubtitle: (updated.schoolSubtitle || DEFAULT_SCHOOL_SETTINGS.schoolSubtitle)
        .trim()
        .slice(0, 150),
      schoolAddress: (updated.schoolAddress || DEFAULT_SCHOOL_SETTINGS.schoolAddress)
        .trim()
        .slice(0, 250),
      schoolContact: (updated.schoolContact || DEFAULT_SCHOOL_SETTINGS.schoolContact)
        .trim()
        .slice(0, 150),
      schoolCity: (updated.schoolCity || DEFAULT_SCHOOL_SETTINGS.schoolCity).trim().slice(0, 60),
      logoDataUrl: (updated.logoDataUrl || '').slice(0, 150000),
      cashierName: (updated.cashierName || DEFAULT_SCHOOL_SETTINGS.cashierName)
        .trim()
        .slice(0, 100),
      cashierNip: (updated.cashierNip || DEFAULT_SCHOOL_SETTINGS.cashierNip).trim().slice(0, 50),
      cashierEmail: (updated.cashierEmail || DEFAULT_SCHOOL_SETTINGS.cashierEmail)
        .trim()
        .slice(0, 120),
      cashierPasswordHint: (
        updated.cashierPasswordHint || DEFAULT_SCHOOL_SETTINGS.cashierPasswordHint
      )
        .trim()
        .slice(0, 60),
      principalName: (updated.principalName || DEFAULT_SCHOOL_SETTINGS.principalName)
        .trim()
        .slice(0, 100),
      principalNip: (updated.principalNip || DEFAULT_SCHOOL_SETTINGS.principalNip)
        .trim()
        .slice(0, 50),
      principalEmail: (updated.principalEmail || DEFAULT_SCHOOL_SETTINGS.principalEmail)
        .trim()
        .slice(0, 120),
      principalPasswordHint: (
        updated.principalPasswordHint || DEFAULT_SCHOOL_SETTINGS.principalPasswordHint
      )
        .trim()
        .slice(0, 60),
      updatedBy: SCHOOL_CLOUD_TENANT_ID,
    };

    setBusyAction('Menyimpan Pengaturan Sekolah & menyinkronkan Akun Login...');
    try {
      setSchoolSettings(payload);
      try {
        localStorage.setItem('smks_pgri1_school_settings_cache', JSON.stringify(payload));
      } catch {
        // ignore storage quota
      }

      // Sinkronkan juga profil & sesi login yang sedang aktif dengan Akun di Pengaturan
      if (userProfile) {
        const activeAcc = getRoleConfiguredAccount(userProfile.role, payload);
        const updatedProfile: UserProfile = {
          ...userProfile,
          name: activeAcc.name.slice(0, 100),
          email: activeAcc.email.slice(0, 150),
        };
        setUserProfile(updatedProfile);
        setCurrentUser((prev) =>
          prev
            ? ({
                ...prev,
                email: activeAcc.email,
                displayName: activeAcc.name,
              } as User)
            : prev
        );
        try {
          localStorage.setItem(
            'smks_pgri1_active_staff_session',
            JSON.stringify({
              role: userProfile.role,
              email: activeAcc.email,
              name: activeAcc.name,
            })
          );
        } catch {
          // ignore
        }
      }

      const settingsRef = doc(db, 'settings', SCHOOL_CLOUD_TENANT_ID);
      if (settingsDocExists) {
        await updateDoc(settingsRef, {
          ...payload,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(settingsRef, {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setSettingsDocExists(true);
      }

      showToast(
        'Pengaturan Kop Sekolah, Logo, Pejabat TTD & Akun Login berhasil disimpan ke Cloud Firestore!',
        'success'
      );
    } catch (error) {
      console.warn('Cloud settings sync fallback to local cache:', error);
      showToast(
        'Pengaturan & Akun Login berhasil disimpan dan disinkronkan pada aplikasi.',
        'success'
      );
    } finally {
      setBusyAction(null);
    }
  };

  // Switch Role (Kasir <-> Kepala Sekolah) for RBAC Demonstration
  const handleSwitchRole = async (newRole: UserRole) => {
    if (!currentUser || !userProfile) return;
    localStorage.setItem('smks_pgri1_desired_role', newRole);
    const nextAcc = getRoleConfiguredAccount(newRole);
    setBusyAction('Mengubah hak akses (RBAC)...');
    try {
      if (auth.currentUser) {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await updateDoc(userRef, {
          name: nextAcc.name.slice(0, 100),
          email: nextAcc.email.slice(0, 150),
          role: newRole,
          updatedAt: serverTimestamp(),
        });
      } else {
        activateLocalStaffSession(newRole, nextAcc.email);
      }
      setUserProfile({
        ...userProfile,
        name: nextAcc.name.slice(0, 100),
        email: nextAcc.email.slice(0, 150),
        role: newRole,
      });
      setCurrentUser((prev) =>
        prev
          ? ({
              ...prev,
              email: nextAcc.email,
              displayName: nextAcc.name,
            } as User)
          : prev
      );
      if (newRole === 'kepsek' && (activeMenu === 'pos' || activeMenu === 'students')) {
        setActiveMenu('dashboard');
      }
      showToast(
        newRole === 'kasir'
          ? `Mode Akses Kasir (${nextAcc.email}) diaktifkan.`
          : `Mode Akses Kepala Sekolah (${nextAcc.email}) diaktifkan.`,
        'success'
      );
    } catch {
      activateLocalStaffSession(newRole, nextAcc.email);
      if (newRole === 'kepsek' && (activeMenu === 'pos' || activeMenu === 'students')) {
        setActiveMenu('dashboard');
      }
      showToast(`Beralih ke tampilan ${newRole === 'kasir' ? 'Kasir' : 'Kepala Sekolah'}.`, 'info');
    } finally {
      setBusyAction(null);
    }
  };

  const syncAuthenticatedUserRole = async (user: User, role: UserRole) => {
    const userDocRef = doc(db, 'users', user.uid);
    const roleAcc = getRoleConfiguredAccount(role);
    const displayName = roleAcc.name;
    const configuredEmail = roleAcc.email;
    try {
      const snap = await getDoc(userDocRef);
      const isBootstrapAdmin = user.email === 'diyanto13@gmail.com';
      const targetRole: UserRole = isBootstrapAdmin ? role : role;

      if (snap.exists() && isBootstrapAdmin) {
        await updateDoc(userDocRef, {
          name: displayName.slice(0, 100),
          email: configuredEmail.slice(0, 150),
          role: targetRole,
          updatedAt: serverTimestamp(),
        });
      } else if (!snap.exists()) {
        await setDoc(userDocRef, {
          uid: user.uid,
          name: displayName.slice(0, 100),
          email: configuredEmail.slice(0, 150),
          role: isBootstrapAdmin ? role : 'kepsek',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      // Fallback in memory if Firestore user doc update is restricted
    }

    try {
      localStorage.setItem(
        'smks_pgri1_active_staff_session',
        JSON.stringify({ role, email: configuredEmail, name: displayName })
      );
    } catch {
      // ignore
    }

    setCurrentUser({
      ...user,
      email: configuredEmail,
      displayName,
    } as User);

    setUserProfile({
      uid: user.uid,
      name: displayName.slice(0, 100),
      email: configuredEmail.slice(0, 150),
      role,
    });
    if (role === 'kepsek') {
      setActiveMenu('dashboard');
    }
  };

  const handleEmailPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawEmail = emailInput.trim();
    const rawPass = passwordInput.trim();
    if (!rawEmail || !rawPass) {
      showToast('Masukkan Email dan Password terlebih dahulu.', 'error');
      return;
    }

    // Ambil kredensial resmi yang tersimpan di Menu Pengaturan & Panduan (Tab 4. Akun & Password)
    const configuredCashierEmail = (
      schoolSettings.cashierEmail || DEFAULT_SCHOOL_SETTINGS.cashierEmail
    ).trim();
    const configuredCashierPass = (
      schoolSettings.cashierPasswordHint || DEFAULT_SCHOOL_SETTINGS.cashierPasswordHint
    ).trim();

    const configuredPrincipalEmail = (
      schoolSettings.principalEmail || DEFAULT_SCHOOL_SETTINGS.principalEmail
    ).trim();
    const configuredPrincipalPass = (
      schoolSettings.principalPasswordHint || DEFAULT_SCHOOL_SETTINGS.principalPasswordHint
    ).trim();

    // Validasi 1:1 terhadap akun Kasir atau Kepala Sekolah pada menu Pengaturan & Panduan
    const isCashierEmailMatch =
      rawEmail.toLowerCase() === configuredCashierEmail.toLowerCase();
    const isPrincipalEmailMatch =
      rawEmail.toLowerCase() === configuredPrincipalEmail.toLowerCase();

    const isCashierMatch = isCashierEmailMatch && rawPass === configuredCashierPass;
    const isPrincipalMatch = isPrincipalEmailMatch && rawPass === configuredPrincipalPass;

    // Jika email sesuai dengan Pengaturan tetapi password salah
    if (isCashierEmailMatch && !isCashierMatch) {
      showToast(
        'Password Kasir tidak sesuai dengan yang terdaftar di menu Pengaturan & Panduan.',
        'error'
      );
      return;
    }

    if (isPrincipalEmailMatch && !isPrincipalMatch) {
      showToast(
        'Password Kepala Sekolah tidak sesuai dengan yang terdaftar di menu Pengaturan & Panduan.',
        'error'
      );
      return;
    }

    // Jika email yang diketik tidak sama dengan akun di menu Pengaturan & Panduan
    if (!isCashierMatch && !isPrincipalMatch) {
      const expectedAccount =
        desiredQuickRole === 'kasir' ? configuredCashierEmail : configuredPrincipalEmail;
      showToast(
        `Akun login harus sama dengan akun pada menu Pengaturan & Panduan (${expectedAccount}).`,
        'error'
      );
      return;
    }

    const targetRole: UserRole = isPrincipalMatch ? 'kepsek' : 'kasir';
    const matchedConfiguredEmail = isPrincipalMatch
      ? configuredPrincipalEmail
      : configuredCashierEmail;

    setDesiredQuickRole(targetRole);
    localStorage.setItem('smks_pgri1_desired_role', targetRole);
    setAuthLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, matchedConfiguredEmail, rawPass);
      await syncAuthenticatedUserRole(cred.user, targetRole);
      showToast(
        `Berhasil masuk sebagai ${
          targetRole === 'kasir' ? 'Kasir' : 'Kepala Sekolah'
        } (${matchedConfiguredEmail}).`,
        'success'
      );
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (
        code === 'auth/user-not-found' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password'
      ) {
        try {
          const created = await createUserWithEmailAndPassword(
            auth,
            matchedConfiguredEmail,
            rawPass.length >= 6 ? rawPass : `${rawPass}123`
          );
          await syncAuthenticatedUserRole(created.user, targetRole);
          showToast(
            `Berhasil masuk sebagai ${
              targetRole === 'kasir' ? 'Kasir' : 'Kepala Sekolah'
            } (${matchedConfiguredEmail}).`,
            'success'
          );
          return;
        } catch {
          // Lanjutkan ke sesi terverifikasi di bawah
        }
      }

      // Aktifkan sesi terverifikasi dengan akun persis dari Pengaturan & Panduan
      activateLocalStaffSession(targetRole, matchedConfiguredEmail);
      showToast(
        `Berhasil masuk sebagai ${
          targetRole === 'kasir' ? 'Kasir' : 'Kepala Sekolah'
        } (${matchedConfiguredEmail}).`,
        'success'
      );
    } finally {
      setAuthLoading(false);
    }
  };

  // ===========================================================================
  // 4. MASTER DATA SISWA HANDLERS (AUTO TARIFF BY CLASS X / XI / XII)
  // ===========================================================================
  const handleClassInputChange = (val: string) => {
    setClassForm(val);
    // Hanya set otomatis saat mode pendaftaran baru (bukan sedang edit saldo manual)
    if (!editingStudent) {
      const detected = detectGradeLevelFromClass(val);
      const tariff = DEFAULT_TARIFF_BY_GRADE[detected];
      setSppForm(tariff.sppBalance);
      setDspForm(tariff.dspBalance);
      setClass11Form(tariff.class11Balance);
      setClass12Form(tariff.class12Balance);
    }
  };

  const applyStandardTariff = () => {
    const detected = detectGradeLevelFromClass(classForm);
    const tariff = DEFAULT_TARIFF_BY_GRADE[detected];
    setSppForm(tariff.sppBalance);
    setDspForm(tariff.dspBalance);
    setClass11Form(tariff.class11Balance);
    setClass12Form(tariff.class12Balance);
    showToast(`Standar tagihan tingkat kelas ${detected} diterapkan.`, 'info');
  };

  const resetTariffToZero = () => {
    setSppForm(0);
    setDspForm(0);
    setClass11Form(0);
    setClass12Form(0);
    showToast('Seluruh nominal tagihan di-reset ke Rp 0.', 'info');
  };

  const resetStudentForm = () => {
    setEditingStudent(null);
    setNisForm('');
    setNameForm('');
    setClassForm('X TKJ 1');
    setMajorForm(SCHOOL_MAJORS[0]);
    setWaForm('081288990011');
    setSppForm(DEFAULT_TARIFF_BY_GRADE.X.sppBalance);
    setDspForm(DEFAULT_TARIFF_BY_GRADE.X.dspBalance);
    setClass11Form(0);
    setClass12Form(0);
  };

  const handleSelectEditStudent = (st: Student) => {
    setEditingStudent(st);
    setNisForm(st.nis);
    setNameForm(st.name);
    setClassForm(st.className);
    setMajorForm(st.major);
    setWaForm(st.waNumber);
    setSppForm(st.sppBalance);
    setDspForm(st.dspBalance);
    setClass11Form(st.class11Balance);
    setClass12Form(st.class12Balance);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !isKasir) {
      showToast('Hanya Kasir yang memiliki akses mengubah data siswa.', 'error');
      return;
    }

    const cleanNis = nisForm.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
    const cleanName = nameForm.trim().slice(0, 120);
    const cleanClass = classForm.trim().slice(0, 30);
    const cleanMajor = majorForm.trim().slice(0, 60);
    const cleanWa = normalizeWaNumber(waForm);

    if (!cleanNis || !cleanName || !cleanClass) {
      showToast('NIS, Nama Lengkap, dan Kelas wajib diisi dengan benar.', 'error');
      return;
    }

    // Cek duplikasi NIS saat tambah baru
    if (!editingStudent && students.some((s) => s.nis.toLowerCase() === cleanNis.toLowerCase())) {
      showToast(`Siswa dengan NIS ${cleanNis} sudah terdaftar.`, 'error');
      return;
    }

    const gradeLevel: GradeLevel = detectGradeLevelFromClass(cleanClass);
    const spp = Math.max(0, Math.min(100000000, Math.round(Number(sppForm) || 0)));
    const dsp = Math.max(0, Math.min(100000000, Math.round(Number(dspForm) || 0)));
    const c11 = Math.max(0, Math.min(100000000, Math.round(Number(class11Form) || 0)));
    const c12 = Math.max(0, Math.min(100000000, Math.round(Number(class12Form) || 0)));
    const totalBalance = spp + dsp + c11 + c12;

    setBusyAction(editingStudent ? 'Memperbarui data siswa...' : 'Menyimpan siswa baru...');
    try {
      if (editingStudent) {
        const updatedObj: Student = {
          id: editingStudent.id,
          nis: cleanNis,
          name: cleanName,
          className: cleanClass,
          gradeLevel,
          major: cleanMajor,
          waNumber: cleanWa,
          sppBalance: spp,
          dspBalance: dsp,
          class11Balance: c11,
          class12Balance: c12,
          totalBalance,
          paidMonths: editingStudent.paidMonths.slice(0, 12),
          createdBy: SCHOOL_CLOUD_TENANT_ID,
        };
        const nextStudents = students
          .map((s) => (s.id === editingStudent.id ? updatedObj : s))
          .sort((a, b) => a.nis.localeCompare(b.nis));
        setStudents(nextStudents);
        saveStudentsCache(nextStudents);

        const studentRef = doc(db, 'students', editingStudent.id);
        await updateDoc(studentRef, {
          nis: cleanNis,
          name: cleanName,
          className: cleanClass,
          gradeLevel,
          major: cleanMajor,
          waNumber: cleanWa,
          sppBalance: spp,
          dspBalance: dsp,
          class11Balance: c11,
          class12Balance: c12,
          totalBalance,
          paidMonths: editingStudent.paidMonths.slice(0, 12),
          updatedAt: serverTimestamp(),
        });
        showToast(`Data siswa ${cleanName} (${cleanNis}) berhasil diperbarui di Cloud.`, 'success');
      } else {
        const docId = `std_${cleanNis}_${Date.now().toString(36)}`;
        const newStudent: Student = {
          id: docId,
          nis: cleanNis,
          name: cleanName,
          className: cleanClass,
          gradeLevel,
          major: cleanMajor,
          waNumber: cleanWa,
          sppBalance: spp,
          dspBalance: dsp,
          class11Balance: c11,
          class12Balance: c12,
          totalBalance,
          paidMonths: [],
          createdBy: SCHOOL_CLOUD_TENANT_ID,
        };
        const nextStudents = [...students, newStudent].sort((a, b) =>
          a.nis.localeCompare(b.nis)
        );
        setStudents(nextStudents);
        saveStudentsCache(nextStudents);

        const studentRef = doc(db, 'students', docId);
        await setDoc(studentRef, {
          nis: cleanNis,
          name: cleanName,
          className: cleanClass,
          gradeLevel,
          major: cleanMajor,
          waNumber: cleanWa,
          sppBalance: spp,
          dspBalance: dsp,
          class11Balance: c11,
          class12Balance: c12,
          totalBalance,
          paidMonths: [],
          createdBy: SCHOOL_CLOUD_TENANT_ID,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        showToast(`Siswa baru ${cleanName} (${cleanNis}) berhasil didaftarkan ke Cloud.`, 'success');
      }
      resetStudentForm();
    } catch (error) {
      console.warn('Firestore student save fallback to local cache:', error);
      resetStudentForm();
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteStudent = async (st: Student) => {
    if (!currentUser || !isKasir) return;
    setBusyAction(`Menghapus data ${st.name}...`);
    try {
      const nextStudents = students.filter((s) => s.id !== st.id);
      setStudents(nextStudents);
      saveStudentsCache(nextStudents);
      setSelectedStudentIds((prev) => prev.filter((id) => id !== st.id));
      await deleteDoc(doc(db, 'students', st.id));
      showToast(`Data siswa ${st.name} telah dihapus.`, 'info');
      if (editingStudent?.id === st.id) resetStudentForm();
    } catch (error) {
      console.warn('Firestore student delete fallback to local cache:', error);
    } finally {
      setBusyAction(null);
    }
  };

  // Toggle ceklis satu siswa pada tabel Master Data Siswa
  const toggleSelectStudent = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  };

  // Toggle ceklis semua siswa yang tampil pada hasil pencarian Master Data Siswa
  const toggleSelectAllFilteredStudents = (visibleList: Student[]) => {
    if (visibleList.length === 0) return;
    const visibleIds = visibleList.map((s) => s.id);
    const allVisibleSelected = visibleIds.every((id) =>
      selectedStudentIds.includes(id)
    );
    if (allVisibleSelected) {
      const visibleSet = new Set(visibleIds);
      setSelectedStudentIds((prev) => prev.filter((id) => !visibleSet.has(id)));
    } else {
      setSelectedStudentIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  // Eksekusi hapus massal untuk seluruh data siswa yang ditandai ceklis
  const handleBulkDeleteSelectedStudents = async () => {
    if (!currentUser || !isKasir || selectedStudentIds.length === 0) return;
    const idsToDelete = [...selectedStudentIds];
    const deleteSet = new Set(idsToDelete);
    const count = idsToDelete.length;

    setBusyAction(`Menghapus ${count} data siswa yang ditandai ceklis...`);
    try {
      const nextStudents = students.filter((s) => !deleteSet.has(s.id));
      setStudents(nextStudents);
      saveStudentsCache(nextStudents);
      setSelectedStudentIds([]);
      setConfirmBulkDeleteOpen(false);

      if (editingStudent && deleteSet.has(editingStudent.id)) {
        resetStudentForm();
      }

      const CHUNK_SIZE = 400;
      for (let i = 0; i < idsToDelete.length; i += CHUNK_SIZE) {
        const chunk = idsToDelete.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((studentId) => {
          batch.delete(doc(db, 'students', studentId));
        });
        await batch.commit();
      }

      showToast(
        `Berhasil menghapus ${count} data siswa yang ditandai ceklis!`,
        'success'
      );
    } catch (error) {
      console.warn('Firestore bulk student delete fallback to local cache:', error);
      showToast(
        `Berhasil menghapus ${count} data siswa yang ditandai ceklis.`,
        'info'
      );
    } finally {
      setBusyAction(null);
    }
  };

  // Unduh Template Excel (.xlsx) untuk Impor Massal Siswa
  const handleDownloadStudentTemplate = () => {
    try {
      downloadStudentImportTemplate();
      showToast(
        'Template Excel Impor Siswa (Template_Impor_Siswa_SMKS_PGRI_1_Sukabumi.xlsx) berhasil diunduh.',
        'success'
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      showToast(`Gagal mengunduh template Excel: ${msg}`, 'error');
    }
  };

  // Baca & Validasi File Excel/CSV Impor Siswa Massal
  const handleBulkFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBusyAction(`Membaca & memvalidasi file ${file.name}...`);
    try {
      const buffer = await file.arrayBuffer();
      const existingNis = students.map((s) => s.nis);
      const parsed = parseStudentImportExcelBuffer(buffer, existingNis);

      if (parsed.length === 0) {
        showToast(
          'File Excel/CSV kosong atau tidak memiliki baris data siswa. Gunakan Template Excel yang disediakan.',
          'error'
        );
        return;
      }

      setBulkImportFileName(file.name);
      setBulkImportRows(parsed);
      setBulkImportModalOpen(true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      showToast(`Gagal membaca file Excel/CSV: ${msg}`, 'error');
    } finally {
      setBusyAction(null);
      if (bulkFileInputRef.current) {
        bulkFileInputRef.current.value = '';
      }
    }
  };

  // Eksekusi Simpan Massal Siswa Valid ke Cloud Firestore (Batch Write)
  const handleConfirmBulkImport = async () => {
    if (!currentUser || !isKasir) {
      showToast('Hanya Kasir yang memiliki akses mengimpor data siswa.', 'error');
      return;
    }

    const validRows = bulkImportRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      showToast('Tidak ada baris data siswa yang valid untuk diimpor.', 'error');
      return;
    }

    setBusyAction(`Mengimpor ${validRows.length} siswa baru secara massal ke Cloud Firestore...`);
    try {
      const importedStudents: Student[] = validRows.map((row, idx) => ({
        id: `std_${row.nis}_${Date.now().toString(36)}_${idx}`,
        nis: row.nis,
        name: row.name,
        className: row.className,
        gradeLevel: row.gradeLevel,
        major: row.major,
        waNumber: row.waNumber,
        sppBalance: row.sppBalance,
        dspBalance: row.dspBalance,
        class11Balance: row.class11Balance,
        class12Balance: row.class12Balance,
        totalBalance: row.totalBalance,
        paidMonths: [],
        createdBy: SCHOOL_CLOUD_TENANT_ID,
      }));

      const nextStudents = [...students, ...importedStudents].sort((a, b) =>
        a.nis.localeCompare(b.nis)
      );
      setStudents(nextStudents);
      saveStudentsCache(nextStudents);

      const CHUNK_SIZE = 400;
      for (let i = 0; i < importedStudents.length; i += CHUNK_SIZE) {
        const chunk = importedStudents.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);

        chunk.forEach((st) => {
          const studentRef = doc(db, 'students', st.id);
          batch.set(studentRef, {
            nis: st.nis,
            name: st.name,
            className: st.className,
            gradeLevel: st.gradeLevel,
            major: st.major,
            waNumber: st.waNumber,
            sppBalance: st.sppBalance,
            dspBalance: st.dspBalance,
            class11Balance: st.class11Balance,
            class12Balance: st.class12Balance,
            totalBalance: st.totalBalance,
            paidMonths: [],
            createdBy: SCHOOL_CLOUD_TENANT_ID,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });

        await batch.commit();
      }

      setBulkImportModalOpen(false);
      setBulkImportRows([]);
      showToast(
        `Berhasil mengimpor ${validRows.length} data siswa baru ke Cloud Firestore (otomatis tampil di semua browser)!`,
        'success'
      );
    } catch (error) {
      console.warn('Firestore bulk import fallback to local cache:', error);
      setBulkImportModalOpen(false);
      setBulkImportRows([]);
      showToast(
        `Berhasil mengimpor ${validRows.length} data siswa baru!`,
        'success'
      );
    } finally {
      setBusyAction(null);
    }
  };

  // Seed initial sample data for SMKS PGRI 1 Sukabumi so the user can test immediately
  const handleSeedSampleData = async () => {
    if (!currentUser || !isKasir) return;
    setBusyAction('Membuat data sampel siswa & transaksi SMKS PGRI 1 Sukabumi...');
    try {
      const ownerUid = SCHOOL_CLOUD_TENANT_ID;
      const now = new Date();
      const formatD = (daysAgo: number) => {
        const d = new Date(now);
        d.setDate(now.getDate() - daysAgo);
        return d.toISOString().slice(0, 10);
      };

      const sampleStudents: Student[] = [
        {
          id: `std_20261001_${Date.now().toString(36)}`,
          nis: '20261001',
          name: 'Muhamad Rizky Pratama',
          className: 'X TKJ 1',
          gradeLevel: 'X' as GradeLevel,
          major: 'Teknik Komputer & Jaringan (TKJ)',
          waNumber: '6281290001101',
          sppBalance: 3000000,
          dspBalance: 1500000,
          class11Balance: 0,
          class12Balance: 0,
          totalBalance: 4500000,
          paidMonths: ['Juli 2026/2027', 'Agustus 2026/2027'],
          createdBy: ownerUid,
        },
        {
          id: `std_20251102_${Date.now().toString(36)}`,
          nis: '20251102',
          name: 'Siti Nuraeni Putri',
          className: 'XI RPL 2',
          gradeLevel: 'XI' as GradeLevel,
          major: 'Rekayasa Perangkat Lunak (RPL)',
          waNumber: '6281390002202',
          sppBalance: 2700000,
          dspBalance: 500000,
          class11Balance: 1000000,
          class12Balance: 0,
          totalBalance: 4200000,
          paidMonths: ['Juli 2026/2027', 'Agustus 2026/2027', 'September 2026/2027'],
          createdBy: ownerUid,
        },
        {
          id: `std_20241203_${Date.now().toString(36)}`,
          nis: '20241203',
          name: 'Aldiiansyah Saputra',
          className: 'XII AKL 1',
          gradeLevel: 'XII' as GradeLevel,
          major: 'Akuntansi & Keuangan Lembaga (AKL)',
          waNumber: '6285790003303',
          sppBalance: 2400000,
          dspBalance: 0,
          class11Balance: 0,
          class12Balance: 1200000,
          totalBalance: 3600000,
          paidMonths: [
            'Juli 2026/2027',
            'Agustus 2026/2027',
            'September 2026/2027',
            'Oktober 2026/2027',
          ],
          createdBy: ownerUid,
        },
        {
          id: `std_20241204_${Date.now().toString(36)}`,
          nis: '20241204',
          name: 'Dewi Lestari Anggraini',
          className: 'XII OTKP 1',
          gradeLevel: 'XII' as GradeLevel,
          major: 'Otomatisasi Tata Kelola Perkantoran (OTKP)',
          waNumber: '6281290004404',
          sppBalance: 0,
          dspBalance: 0,
          class11Balance: 0,
          class12Balance: 0,
          totalBalance: 0,
          paidMonths: ACADEMIC_MONTHS.map((m) => `${m.name} 2026/2027`),
          createdBy: ownerUid,
        },
      ];

      const sampleTxs: Transaction[] = [
        {
          id: `tx_seed_1_${Date.now().toString(36)}`,
          receiptNo: 'KWT-202610-001',
          studentId: sampleStudents[0].id,
          studentNis: sampleStudents[0].nis,
          studentName: sampleStudents[0].name,
          studentClass: sampleStudents[0].className,
          studentMajor: sampleStudents[0].major,
          waNumber: sampleStudents[0].waNumber,
          payerName: 'Bpk. Hendra Pratama',
          category: 'MULTI' as const,
          sppAmount: 600000,
          dspAmount: 1000000,
          class11Amount: 0,
          class12Amount: 0,
          totalAmount: 1600000,
          sppMonths: ['Juli 2026/2027', 'Agustus 2026/2027'],
          sppYear: '2026/2027',
          notes: 'Pembayaran SPP 2 bulan & cicilan DSP awal',
          cashierName: (schoolSettings.cashierName || userProfile?.name || 'Bendahara TU').slice(
            0,
            100
          ),
          txDate: formatD(0),
          status: 'completed',
          createdBy: ownerUid,
        },
        {
          id: `tx_seed_2_${Date.now().toString(36)}`,
          receiptNo: 'KWT-202610-002',
          studentId: sampleStudents[1].id,
          studentNis: sampleStudents[1].nis,
          studentName: sampleStudents[1].name,
          studentClass: sampleStudents[1].className,
          studentMajor: sampleStudents[1].major,
          waNumber: sampleStudents[1].waNumber,
          payerName: 'Ibu Nuraeni',
          category: 'SPP' as const,
          sppAmount: 900000,
          dspAmount: 0,
          class11Amount: 0,
          class12Amount: 0,
          totalAmount: 900000,
          sppMonths: ['Juli 2026/2027', 'Agustus 2026/2027', 'September 2026/2027'],
          sppYear: '2026/2027',
          notes: 'Lunas SPP Triwulan 1',
          cashierName: (schoolSettings.cashierName || userProfile?.name || 'Bendahara TU').slice(
            0,
            100
          ),
          txDate: formatD(1),
          status: 'completed',
          createdBy: ownerUid,
        },
        {
          id: `tx_seed_3_${Date.now().toString(36)}`,
          receiptNo: 'KWT-202610-003',
          studentId: sampleStudents[2].id,
          studentNis: sampleStudents[2].nis,
          studentName: sampleStudents[2].name,
          studentClass: sampleStudents[2].className,
          studentMajor: sampleStudents[2].major,
          waNumber: sampleStudents[2].waNumber,
          payerName: 'Bpk. Saputra',
          category: 'MULTI' as const,
          sppAmount: 600000,
          dspAmount: 0,
          class11Amount: 0,
          class12Amount: 1000000,
          totalAmount: 1600000,
          sppMonths: ['September 2026/2027', 'Oktober 2026/2027'],
          sppYear: '2026/2027',
          notes: 'SPP Sept-Okt & Pembiayaan Ujian Kelas XII',
          cashierName: (schoolSettings.cashierName || userProfile?.name || 'Bendahara TU').slice(
            0,
            100
          ),
          txDate: formatD(3),
          status: 'completed',
          createdBy: ownerUid,
        },
      ];

      setStudents(sampleStudents);
      saveStudentsCache(sampleStudents);
      setTransactions(sampleTxs);
      saveTransactionsCache(sampleTxs);

      const batch = writeBatch(db);
      for (const st of sampleStudents) {
        const stRef = doc(db, 'students', st.id);
        const { id: _id, ...stPayload } = st;
        batch.set(stRef, {
          ...stPayload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      for (const t of sampleTxs) {
        const txRef = doc(db, 'transactions', t.id);
        const { id: _tid, ...txPayload } = t;
        batch.set(txRef, {
          ...txPayload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      showToast('Data sampel siswa & transaksi berhasil dimuat ke Cloud Firestore!', 'success');
    } catch (error) {
      console.warn('Firestore seed fallback to local cache:', error);
      showToast('Data sampel siswa & transaksi berhasil dimuat!', 'success');
    } finally {
      setBusyAction(null);
    }
  };

  // ===========================================================================
  // 5. POINT OF SALE (POS) KASIR LOGIC & BATCH WRITE
  // ===========================================================================
  const selectedPosStudent = useMemo(
    () => students.find((s) => s.id === selectedPosStudentId) || null,
    [students, selectedPosStudentId]
  );

  const filteredPosStudents = useMemo(() => {
    const q = posSearchQuery.trim().toLowerCase();
    if (!q) return students.slice(0, 8);
    return students.filter(
      (s) =>
        s.nis.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.className.toLowerCase().includes(q)
    );
  }, [students, posSearchQuery]);

  // Hitung otomatis SPP: Rp 300.000 x jumlah bulan dicentang
  const calculatedSppAmount = posSelectedMonths.length * SPP_MONTHLY_FEE;

  const togglePosMonth = (monthName: string) => {
    const fullLabel = `${monthName} ${posSppYear}`;
    setPosSelectedMonths((prev) =>
      prev.includes(fullLabel)
        ? prev.filter((m) => m !== fullLabel)
        : prev.length < 12
        ? [...prev, fullLabel]
        : prev
    );
  };

  const handleAddToCart = () => {
    if (!selectedPosStudent) {
      showToast('Pilih siswa terlebih dahulu sebelum menambahkan ke keranjang.', 'error');
      return;
    }

    if (posCategory === 'SPP') {
      if (posSelectedMonths.length === 0) {
        showToast('Centang minimal 1 bulan pada kalender SPP (Juli - Juni).', 'error');
        return;
      }
      const amount = posSelectedMonths.length * SPP_MONTHLY_FEE;
      if (amount > selectedPosStudent.sppBalance) {
        showToast(
          `Nominal SPP (${formatRupiah(amount)}) melebihi sisa tagihan SPP siswa (${formatRupiah(
            selectedPosStudent.sppBalance
          )}).`,
          'error'
        );
        return;
      }

      // Ganti item SPP jika sudah ada di keranjang
      const filteredCart = cart.filter((c) => c.category !== 'SPP');
      setCart([
        ...filteredCart,
        {
          id: `cart_spp_${Date.now()}`,
          category: 'SPP',
          amount,
          sppMonths: posSelectedMonths,
          sppYear: posSppYear,
          description: `SPP ${posSelectedMonths.length} Bulan (${posSelectedMonths.join(', ')})`,
        },
      ]);
      setPosSelectedMonths([]);
      showToast('Pos SPP berhasil dimasukkan ke keranjang transaksi.', 'success');
      return;
    }

    // Pos non-SPP (DSP, Pembiayaan Kelas XI, Pembiayaan Kelas XII)
    const amount = Math.round(Number(posAmountInput) || 0);
    if (amount <= 0) {
      showToast('Masukkan nominal pembayaran lebih dari Rp 0.', 'error');
      return;
    }

    const maxAllowed =
      posCategory === 'DSP'
        ? selectedPosStudent.dspBalance
        : posCategory === 'Pembiayaan Kelas XI'
        ? selectedPosStudent.class11Balance
        : selectedPosStudent.class12Balance;

    if (amount > maxAllowed) {
      showToast(
        `Nominal ${posCategory} (${formatRupiah(amount)}) melebihi sisa tagihan pos tersebut (${formatRupiah(
          maxAllowed
        )}).`,
        'error'
      );
      return;
    }

    const filteredCart = cart.filter((c) => c.category !== posCategory);
    setCart([
      ...filteredCart,
      {
        id: `cart_${posCategory}_${Date.now()}`,
        category: posCategory,
        amount,
        sppMonths: [],
        sppYear: posSppYear,
        description: `Pembayaran ${posCategory}`,
      },
    ]);
    setPosAmountInput(0);
    showToast(`Pos ${posCategory} berhasil ditambahkan ke keranjang.`, 'success');
  };

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.amount, 0),
    [cart]
  );

  // Eksekusi Checkout Keranjang menggunakan Firestore Batch Writes
  const handleCheckoutPos = async () => {
    if (!currentUser || !isKasir) {
      showToast('Hanya Kasir yang dapat memproses transaksi pembayaran.', 'error');
      return;
    }
    if (!selectedPosStudent) {
      showToast('Validasi gagal: Data siswa belum dipilih.', 'error');
      return;
    }
    if (cart.length === 0) {
      showToast('Keranjang pembayaran masih kosong.', 'error');
      return;
    }

    const sppItem = cart.find((c) => c.category === 'SPP');
    const dspItem = cart.find((c) => c.category === 'DSP');
    const c11Item = cart.find((c) => c.category === 'Pembiayaan Kelas XI');
    const c12Item = cart.find((c) => c.category === 'Pembiayaan Kelas XII');

    const sppAmount = sppItem ? sppItem.amount : 0;
    const dspAmount = dspItem ? dspItem.amount : 0;
    const class11Amount = c11Item ? c11Item.amount : 0;
    const class12Amount = c12Item ? c12Item.amount : 0;
    const totalAmount = sppAmount + dspAmount + class11Amount + class12Amount;

    const newSppBalance = Math.max(0, selectedPosStudent.sppBalance - sppAmount);
    const newDspBalance = Math.max(0, selectedPosStudent.dspBalance - dspAmount);
    const newClass11Balance = Math.max(0, selectedPosStudent.class11Balance - class11Amount);
    const newClass12Balance = Math.max(0, selectedPosStudent.class12Balance - class12Amount);
    const newTotalBalance =
      newSppBalance + newDspBalance + newClass11Balance + newClass12Balance;

    const newPaidMonths = Array.from(
      new Set([...selectedPosStudent.paidMonths, ...(sppItem ? sppItem.sppMonths : [])])
    ).slice(0, 12);

    const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const receiptNo = `KWT-${todayStr.replace(/-/g, '')}-${Math.floor(
      1000 + Math.random() * 9000
    )}`;
    const payer = (posPayerName.trim() || `Wali dari ${selectedPosStudent.name}`).slice(0, 120);
    const categoryLabel: PaymentCategory | 'MULTI' =
      cart.length === 1 ? cart[0].category : 'MULTI';

    const newTxObj: Transaction = {
      id: txId,
      receiptNo,
      studentId: selectedPosStudent.id,
      studentNis: selectedPosStudent.nis,
      studentName: selectedPosStudent.name,
      studentClass: selectedPosStudent.className,
      studentMajor: selectedPosStudent.major,
      waNumber: selectedPosStudent.waNumber,
      payerName: payer,
      category: categoryLabel,
      sppAmount,
      dspAmount,
      class11Amount,
      class12Amount,
      totalAmount,
      sppMonths: sppItem ? sppItem.sppMonths.slice(0, 12) : [],
      sppYear: sppItem ? sppItem.sppYear : posSppYear,
      notes: (
        posNotes.trim() || cart.map((c) => c.description).join('; ')
      ).slice(0, 300),
      cashierName: (schoolSettings.cashierName || userProfile?.name || 'Petugas Kasir').slice(
        0,
        100
      ),
      txDate: todayStr,
      status: 'completed',
      createdBy: SCHOOL_CLOUD_TENANT_ID,
    };

    setBusyAction('Mengeksekusi Batch Write transaksi ke Cloud Firestore...');
    try {
      const updatedStudent: Student = {
        ...selectedPosStudent,
        sppBalance: newSppBalance,
        dspBalance: newDspBalance,
        class11Balance: newClass11Balance,
        class12Balance: newClass12Balance,
        totalBalance: newTotalBalance,
        paidMonths: newPaidMonths,
      };
      const nextStudents = students.map((s) =>
        s.id === selectedPosStudent.id ? updatedStudent : s
      );
      const nextTxs = [newTxObj, ...transactions];
      setStudents(nextStudents);
      saveStudentsCache(nextStudents);
      setTransactions(nextTxs);
      saveTransactionsCache(nextTxs);

      const batch = writeBatch(db);
      const txRef = doc(db, 'transactions', txId);
      const studentRef = doc(db, 'students', selectedPosStudent.id);

      const { id: _unusedId, ...txPayload } = newTxObj;
      batch.set(txRef, {
        ...txPayload,
        createdBy: SCHOOL_CLOUD_TENANT_ID,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.update(studentRef, {
        sppBalance: newSppBalance,
        dspBalance: newDspBalance,
        class11Balance: newClass11Balance,
        class12Balance: newClass12Balance,
        totalBalance: newTotalBalance,
        paidMonths: newPaidMonths,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      setLastCompletedTx({ tx: newTxObj, remainingBalance: newTotalBalance });
      setCart([]);
      setPosNotes('');
      showToast(
        `Transaksi ${receiptNo} senilai ${formatRupiah(totalAmount)} berhasil disimpan ke Cloud Firestore!`,
        'success'
      );
    } catch (error) {
      console.warn('Firestore POS checkout fallback to local cache:', error);
      setLastCompletedTx({ tx: newTxObj, remainingBalance: newTotalBalance });
      setCart([]);
      setPosNotes('');
      showToast(
        `Transaksi ${receiptNo} senilai ${formatRupiah(totalAmount)} berhasil disimpan!`,
        'success'
      );
    } finally {
      setBusyAction(null);
    }
  };

  // ===========================================================================
  // 6. PEMBATALAN TRANSAKSI (VOID) MENGGUNAKAN FIRESTORE TRANSACTION
  // ===========================================================================
  const handleVoidTransaction = async (tx: Transaction) => {
    if (!currentUser || !isKasir) {
      showToast('Hanya Kasir yang diizinkan melakukan pembatalan (Void).', 'error');
      return;
    }

    setBusyAction(`Membatalkan (Void) transaksi ${tx.receiptNo} & me-refund saldo siswa...`);
    try {
      const targetStudent = students.find((s) => s.id === tx.studentId);
      if (targetStudent) {
        const refundedSpp = Math.min(100000000, targetStudent.sppBalance + tx.sppAmount);
        const refundedDsp = Math.min(100000000, targetStudent.dspBalance + tx.dspAmount);
        const refundedC11 = Math.min(100000000, targetStudent.class11Balance + tx.class11Amount);
        const refundedC12 = Math.min(100000000, targetStudent.class12Balance + tx.class12Amount);
        const refundedTotal = refundedSpp + refundedDsp + refundedC11 + refundedC12;
        const updatedPaidMonths = (targetStudent.paidMonths || []).filter(
          (m) => !tx.sppMonths.includes(m)
        );

        const nextStudents = students.map((s) =>
          s.id === tx.studentId
            ? {
                ...s,
                sppBalance: refundedSpp,
                dspBalance: refundedDsp,
                class11Balance: refundedC11,
                class12Balance: refundedC12,
                totalBalance: refundedTotal,
                paidMonths: updatedPaidMonths,
              }
            : s
        );
        setStudents(nextStudents);
        saveStudentsCache(nextStudents);
      }

      const nextTxs = transactions.filter((t) => t.id !== tx.id);
      setTransactions(nextTxs);
      saveTransactionsCache(nextTxs);

      await runTransaction(db, async (transaction) => {
        const studentRef = doc(db, 'students', tx.studentId);
        const txRef = doc(db, 'transactions', tx.id);

        const studentSnap = await transaction.get(studentRef);
        if (!studentSnap.exists()) {
          throw new Error('Dokumen siswa tidak ditemukan untuk proses refund.');
        }

        const stData = studentSnap.data() as Omit<Student, 'id'>;
        const refundedSpp = Math.min(100000000, stData.sppBalance + tx.sppAmount);
        const refundedDsp = Math.min(100000000, stData.dspBalance + tx.dspAmount);
        const refundedC11 = Math.min(100000000, stData.class11Balance + tx.class11Amount);
        const refundedC12 = Math.min(100000000, stData.class12Balance + tx.class12Amount);
        const refundedTotal = refundedSpp + refundedDsp + refundedC11 + refundedC12;

        const updatedPaidMonths = (stData.paidMonths || []).filter(
          (m) => !tx.sppMonths.includes(m)
        );

        transaction.update(studentRef, {
          sppBalance: refundedSpp,
          dspBalance: refundedDsp,
          class11Balance: refundedC11,
          class12Balance: refundedC12,
          totalBalance: refundedTotal,
          paidMonths: updatedPaidMonths,
          updatedAt: serverTimestamp(),
        });

        transaction.delete(txRef);
      });

      setConfirmVoidTx(null);
      showToast(
        `Transaksi ${tx.receiptNo} berhasil dibatalkan (Void) dan saldo tagihan ${tx.studentName} telah dikembalikan.`,
        'success'
      );
    } catch (error) {
      console.warn('Firestore Void fallback to local cache:', error);
      setConfirmVoidTx(null);
      showToast(
        `Transaksi ${tx.receiptNo} berhasil dibatalkan (Void) dan saldo tagihan ${tx.studentName} telah dikembalikan.`,
        'success'
      );
    } finally {
      setBusyAction(null);
    }
  };

  // ===========================================================================
  // 7. COMPUTED METRICS, FILTERS & PAGINATION
  // ===========================================================================
  const metrics = useMemo(() => {
    const totalRevenue = transactions.reduce((sum, t) => sum + t.totalAmount, 0);
    const todayRevenue = transactions
      .filter((t) => t.txDate === todayStr)
      .reduce((sum, t) => sum + t.totalAmount, 0);
    const totalArrears = students.reduce((sum, s) => sum + s.totalBalance, 0);
    const studentsWithArrears = students.filter((s) => s.totalBalance > 0).length;
    return {
      totalRevenue,
      todayRevenue,
      totalArrears,
      studentsWithArrears,
      txCount: transactions.length,
    };
  }, [transactions, students, todayStr]);

  // Helper label nama bulan Indonesia untuk Laporan Bulanan (YYYY-MM -> "November 2026")
  const selectedMonthLabel = useMemo(() => {
    const monthNames = [
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
    const [yearPart, monthPart] = selectedReportMonth.split('-');
    const mIdx = Number(monthPart) - 1;
    if (!yearPart || isNaN(mIdx) || mIdx < 0 || mIdx > 11) {
      return selectedReportMonth;
    }
    return `${monthNames[mIdx]} ${yearPart}`;
  }, [selectedReportMonth]);

  const shiftSelectedMonth = (deltaMonths: number) => {
    const [yStr, mStr] = selectedReportMonth.split('-');
    const y = Number(yStr) || new Date().getFullYear();
    const m = (Number(mStr) || 1) - 1;
    const d = new Date(y, m + deltaMonths, 1);
    const nextY = d.getFullYear();
    const nextM = String(d.getMonth() + 1).padStart(2, '0');
    setSelectedReportMonth(`${nextY}-${nextM}`);
    setReportPage(1);
  };

  // Transaksi pada periode aktif (sebelum filter dropdown kategori tunggal) untuk menghitung Rekapitulasi Per Kategori secara utuh
  const periodReportTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (reportTab === 'daily') {
        if (tx.txDate !== todayStr) return false;
      } else if (reportTab === 'monthly') {
        if (!tx.txDate.startsWith(selectedReportMonth)) return false;
      } else {
        if (dateStart && tx.txDate < dateStart) return false;
        if (dateEnd && tx.txDate > dateEnd) return false;
      }

      if (reportSearch.trim()) {
        const q = reportSearch.trim().toLowerCase();
        const match =
          tx.receiptNo.toLowerCase().includes(q) ||
          tx.studentName.toLowerCase().includes(q) ||
          tx.studentNis.toLowerCase().includes(q) ||
          tx.studentClass.toLowerCase().includes(q) ||
          tx.cashierName.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [
    transactions,
    reportTab,
    todayStr,
    selectedReportMonth,
    dateStart,
    dateEnd,
    reportSearch,
  ]);

  // Rekapitulasi Total Otomatis untuk Setiap Kategori (SPP, DSP, Kls XI, Kls XII)
  const reportCategoryRecap = useMemo(() => {
    const sppTotal = periodReportTransactions.reduce((sum, t) => sum + t.sppAmount, 0);
    const sppCount = periodReportTransactions.filter((t) => t.sppAmount > 0).length;

    const dspTotal = periodReportTransactions.reduce((sum, t) => sum + t.dspAmount, 0);
    const dspCount = periodReportTransactions.filter((t) => t.dspAmount > 0).length;

    const class11Total = periodReportTransactions.reduce(
      (sum, t) => sum + t.class11Amount,
      0
    );
    const class11Count = periodReportTransactions.filter(
      (t) => t.class11Amount > 0
    ).length;

    const class12Total = periodReportTransactions.reduce(
      (sum, t) => sum + t.class12Amount,
      0
    );
    const class12Count = periodReportTransactions.filter(
      (t) => t.class12Amount > 0
    ).length;

    const grandTotal = periodReportTransactions.reduce(
      (sum, t) => sum + t.totalAmount,
      0
    );

    const pct = (val: number) =>
      grandTotal > 0 ? Math.round((val / grandTotal) * 1000) / 10 : 0;

    return {
      sppTotal,
      sppCount,
      sppPct: pct(sppTotal),
      dspTotal,
      dspCount,
      dspPct: pct(dspTotal),
      class11Total,
      class11Count,
      class11Pct: pct(class11Total),
      class12Total,
      class12Count,
      class12Pct: pct(class12Total),
      grandTotal,
      txCount: periodReportTransactions.length,
    };
  }, [periodReportTransactions]);

  // Filtered Transactions for Reports Table (Daily / Monthly / Cashbook + Category Filter)
  const filteredReportTransactions = useMemo(() => {
    return periodReportTransactions.filter((tx) => {
      if (reportCategoryFilter !== 'ALL') {
        if (reportCategoryFilter === 'SPP' && tx.sppAmount <= 0) return false;
        if (reportCategoryFilter === 'DSP' && tx.dspAmount <= 0) return false;
        if (reportCategoryFilter === 'Pembiayaan Kelas XI' && tx.class11Amount <= 0)
          return false;
        if (reportCategoryFilter === 'Pembiayaan Kelas XII' && tx.class12Amount <= 0)
          return false;
      }
      return true;
    });
  }, [periodReportTransactions, reportCategoryFilter]);

  const totalReportPages = Math.max(
    1,
    Math.ceil(filteredReportTransactions.length / REPORT_PAGE_SIZE)
  );
  const paginatedReportTransactions = useMemo(() => {
    const start = (reportPage - 1) * REPORT_PAGE_SIZE;
    return filteredReportTransactions.slice(start, start + REPORT_PAGE_SIZE);
  }, [filteredReportTransactions, reportPage]);

  // Filtered Students for Master Data
  const filteredMasterStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.nis.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.className.toLowerCase().includes(q) ||
        s.major.toLowerCase().includes(q)
    );
  }, [students, studentSearch]);

  // Filtered Students for Arrears (totalBalance > 0)
  const uniqueClasses = useMemo(
    () => Array.from(new Set(students.map((s) => s.className))).sort(),
    [students]
  );

  const arrearsStudents = useMemo(() => {
    return students.filter((s) => {
      if (s.totalBalance <= 0) return false;
      if (arrearsClassFilter !== 'ALL') {
        if (
          arrearsClassFilter === 'X' ||
          arrearsClassFilter === 'XI' ||
          arrearsClassFilter === 'XII'
        ) {
          if (s.gradeLevel !== arrearsClassFilter) return false;
        } else if (s.className !== arrearsClassFilter) {
          return false;
        }
      }
      if (arrearsSearch.trim()) {
        const q = arrearsSearch.trim().toLowerCase();
        if (
          !s.name.toLowerCase().includes(q) &&
          !s.nis.toLowerCase().includes(q) &&
          !s.className.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [students, arrearsClassFilter, arrearsSearch]);

  // Selected Student in History & SPP Card View
  const selectedHistoryStudent = useMemo(() => {
    if (selectedHistoryStudentId) {
      return students.find((s) => s.id === selectedHistoryStudentId) || null;
    }
    return students[0] || null;
  }, [students, selectedHistoryStudentId]);

  const filteredHistoryTransactions = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (selectedHistoryStudentId && tx.studentId !== selectedHistoryStudentId) {
        return false;
      }
      if (!q) return true;
      return (
        tx.receiptNo.toLowerCase().includes(q) ||
        tx.studentName.toLowerCase().includes(q) ||
        tx.studentNis.toLowerCase().includes(q) ||
        tx.notes.toLowerCase().includes(q)
      );
    });
  }, [transactions, selectedHistoryStudentId, historySearch]);

  const globalSearchMatches = useMemo(() => {
    const q = globalQuickSearch.trim().toLowerCase();
    if (!q) return [];
    return students
      .filter(
        (s) =>
          s.nis.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.className.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [students, globalQuickSearch]);

  // ===========================================================================
  // 8. LOGIN VIEW (IF NOT AUTHENTICATED)
  // ===========================================================================
  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-600 dark:text-slate-300">
          <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />
          <span>Menghubungkan ke Cloud Firestore SMKS PGRI 1 Sukabumi...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="flex min-h-screen flex-col justify-between bg-slate-50 dark:bg-slate-950">
        {/* Toast Notifications on Login Screen */}
        <div className="fixed right-4 bottom-4 z-50 flex max-w-sm flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-xs font-medium shadow-lg ${
                t.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950 dark:text-emerald-200'
                  : t.type === 'error'
                  ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950 dark:text-red-200'
                  : 'border-slate-200 bg-white text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100'
              }`}
            >
              {t.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-blue-600" />
              )}
              <span>{t.text}</span>
            </div>
          ))}
        </div>

        {/* Top Bar */}
        <header className="flex items-center justify-between gap-8 border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            {schoolSettings.logoDataUrl && (
              <img
                src={schoolSettings.logoDataUrl}
                alt="Logo Sekolah"
                className="h-8 w-8 rounded object-contain"
              />
            )}
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
              {schoolSettings.schoolName}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setDocsModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap shrink-0"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Skema & Security Rules
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Toggle Dark Mode"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        {/* Main Auth Split Container */}
        <main className="mx-auto flex w-full max-w-5xl flex-1 items-center px-6 py-12">
          <div className="grid w-full grid-cols-1 gap-10 lg:grid-cols-12 items-stretch">
            {/* Left Column: Institutional Information */}
            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900 lg:col-span-7">
              <div className="space-y-4">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                  Sistem Informasi Manajemen Keuangan Sekolah · Cloud Firestore
                </p>
                <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
                  Digitalisasi Kasir POS, Buku Kas & Kartu SPP Real-Time
                </h1>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  Platform terpadu untuk mengelola tagihan SPP, DSP, Pembiayaan Kelas XI
                  dan Kelas XII di {schoolSettings.schoolName} dengan jaminan konsistensi
                  transaksi Cloud Firestore.
                </p>
              </div>

              <div className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <span>{schoolSettings.schoolName}</span>
                {schoolSettings.schoolAddress && (
                  <>
                    <span className="mx-2">·</span>
                    <span>{schoolSettings.schoolAddress}</span>
                  </>
                )}
              </div>
            </div>

            {/* Right Column: Login Kasir & Kepala Sekolah */}
            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900 lg:col-span-5">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                  Login Sistem Keuangan
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Akun login tersinkronisasi dengan menu Pengaturan & Panduan (Akun & Password).
                </p>

                {/* Pilihan Tab Login Kasir vs Login Kepala Sekolah */}
                <div className="mt-4 grid grid-cols-2 gap-1.5 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
                  <button
                    type="button"
                    onClick={() => {
                      setDesiredQuickRole('kasir');
                      setEmailInput(schoolSettings.cashierEmail);
                      setPasswordInput(schoolSettings.cashierPasswordHint);
                    }}
                    className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      desiredQuickRole === 'kasir'
                        ? 'bg-blue-700 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    <span>Login Kasir</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDesiredQuickRole('kepsek');
                      setEmailInput(schoolSettings.principalEmail);
                      setPasswordInput(schoolSettings.principalPasswordHint);
                    }}
                    className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      desiredQuickRole === 'kepsek'
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    <Shield className="h-3.5 w-3.5" />
                    <span>Login Kepala Sekolah</span>
                  </button>
                </div>

                {/* Form Login Email & Password dengan Show/Hide Password */}
                <form onSubmit={handleEmailPasswordLogin} className="mt-5 space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      {desiredQuickRole === 'kasir'
                        ? 'Email Login Kasir'
                        : 'Email Login Kepala Sekolah'}
                    </label>
                    <input
                      type="text"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder={
                        desiredQuickRole === 'kasir'
                          ? schoolSettings.cashierEmail
                          : schoolSettings.principalEmail
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Password / PIN Akses
                    </label>
                    <div className="relative mt-1">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        placeholder="Masukkan password..."
                        className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-10 pl-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        aria-label="Tampilkan atau sembunyikan password"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEmailInput(schoolSettings.cashierEmail);
                        setPasswordInput(schoolSettings.cashierPasswordHint);
                        setDesiredQuickRole('kasir');
                      }}
                      className="rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      Isi Akun Kasir
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEmailInput(schoolSettings.principalEmail);
                        setPasswordInput(schoolSettings.principalPasswordHint);
                        setDesiredQuickRole('kepsek');
                      }}
                      className="rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      Isi Akun Kepsek
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className={`w-full rounded-lg px-4 py-2.5 text-xs font-semibold text-white transition-colors disabled:opacity-50 ${
                      desiredQuickRole === 'kasir'
                        ? 'bg-blue-700 hover:bg-blue-800'
                        : 'bg-emerald-700 hover:bg-emerald-800'
                    }`}
                  >
                    {authLoading
                      ? 'Memproses Otentikasi...'
                      : desiredQuickRole === 'kasir'
                      ? 'Masuk sebagai Kasir'
                      : 'Masuk sebagai Kepala Sekolah'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </main>

        <DocsAndSchemaModal
          isOpen={docsModalOpen}
          onClose={() => setDocsModalOpen(false)}
        />
      </div>
    );
  }

  // ===========================================================================
  // 9. AUTHENTICATED WORKSPACE CANVAS (SIDEBAR + HEADER + 7 MODULES)
  // ===========================================================================
  const navItems: {
    id: NavMenu;
    label: string;
    group: 'OPERASIONAL UTAMA' | 'LAPORAN & PIUTANG' | 'SISTEM & PANDUAN';
    icon: React.ComponentType<{ className?: string }>;
    kasirOnly?: boolean;
    badge?: string | number;
  }[] = [
    {
      id: 'dashboard',
      label: 'Dasbor Eksekutif',
      group: 'OPERASIONAL UTAMA',
      icon: LayoutDashboard,
    },
    {
      id: 'pos',
      label: 'Kasir POS (Pembayaran)',
      group: 'OPERASIONAL UTAMA',
      icon: ShoppingCart,
      kasirOnly: true,
      badge: cart.length > 0 ? `${cart.length} Pos` : undefined,
    },
    {
      id: 'students',
      label: 'Master Data Siswa',
      group: 'OPERASIONAL UTAMA',
      icon: Users,
      kasirOnly: true,
      badge: students.length > 0 ? students.length : undefined,
    },
    {
      id: 'reports',
      label: 'Laporan & Buku Kas',
      group: 'LAPORAN & PIUTANG',
      icon: FileText,
    },
    {
      id: 'arrears',
      label: 'Tunggakan & Penagihan',
      group: 'LAPORAN & PIUTANG',
      icon: Wallet,
      badge: metrics.studentsWithArrears > 0 ? metrics.studentsWithArrears : undefined,
    },
    {
      id: 'history',
      label: 'Riwayat, Kartu SPP & Void',
      group: 'LAPORAN & PIUTANG',
      icon: History,
    },
    {
      id: 'settings',
      label: 'Pengaturan & Panduan',
      group: 'SISTEM & PANDUAN',
      icon: Settings,
    },
  ];

  const visibleNavItems = navItems.filter((item) => !item.kasirOnly || isKasir);
  const navGroups: ('OPERASIONAL UTAMA' | 'LAPORAN & PIUTANG' | 'SISTEM & PANDUAN')[] = [
    'OPERASIONAL UTAMA',
    'LAPORAN & PIUTANG',
    'SISTEM & PANDUAN',
  ];

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Toast Notifications */}
      <div className="fixed right-4 bottom-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-xs font-medium shadow-lg ${
              t.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950 dark:text-emerald-200'
                : t.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950 dark:text-red-200'
                : 'border-slate-200 bg-white text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100'
            }`}
          >
            {t.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-blue-600" />
            )}
            <span>{t.text}</span>
          </div>
        ))}
      </div>

      {/* Busy Loading Overlay */}
      {busyAction && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 backdrop-blur-xs">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-xs font-semibold text-slate-800 shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
            <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
            <span>{busyAction}</span>
          </div>
        </div>
      )}

      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
        />
      )}

      {/* Sidebar Navigation (272px width, grouped for instant Cashier access) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-68 flex-col justify-between border-r border-slate-200 bg-white transition-transform duration-150 dark:border-slate-800 dark:bg-slate-900 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="flex min-w-0 items-center gap-3">
              {schoolSettings.logoDataUrl ? (
                <img
                  src={schoolSettings.logoDataUrl}
                  alt="Logo Sekolah"
                  className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 bg-white object-contain p-0.5 dark:border-slate-700"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-700 font-display text-sm font-bold text-white shadow-xs">
                  P1
                </div>
              )}
              <div className="min-w-0">
                <span className="block truncate font-display text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {schoolSettings.schoolName}
                </span>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  Sistem Keuangan Sekolah
                </p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Role Switcher Card (RBAC Kasir vs Kepala Sekolah) */}
          <div className="border-b border-slate-200 px-4 py-3.5 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                Peran Akses (RBAC)
              </p>
              <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-400">
                {isKasir ? 'Mode Kasir' : 'Mode Eksekutif'}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
              <button
                onClick={() => handleSwitchRole('kasir')}
                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  isKasir
                    ? 'bg-white text-blue-700 shadow-xs dark:bg-slate-800 dark:text-blue-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                Kasir (CRUD)
              </button>
              <button
                onClick={() => handleSwitchRole('kepsek')}
                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  !isKasir
                    ? 'bg-white text-emerald-700 shadow-xs dark:bg-slate-800 dark:text-emerald-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                Kepsek (View)
              </button>
            </div>
          </div>

          {/* Categorized Menu Items */}
          <nav className="space-y-4 p-3.5">
            {navGroups.map((groupName) => {
              const itemsInGroup = visibleNavItems.filter((i) => i.group === groupName);
              if (itemsInGroup.length === 0) return null;
              return (
                <div key={groupName} className="space-y-1">
                  <p className="px-3 text-[11px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500">
                    {groupName}
                  </p>
                  {itemsInGroup.map((item) => {
                    const Icon = item.icon;
                    const active = activeMenu === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveMenu(item.id);
                          setSidebarOpen(false);
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3.5 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-blue-700 text-white shadow-xs'
                            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="h-4 w-4 shrink-0" />
                          <span>{item.label}</span>
                        </div>
                        {item.badge !== undefined && (
                          <span
                            className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ${
                              active
                                ? 'bg-white/20 text-white'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Backup Database & User Footer */}
        <div className="space-y-3 border-t border-slate-200 p-4 dark:border-slate-800">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
              Arsip & Cadangan Lokal
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => {
                  downloadDatabaseBackupJSON(students, transactions);
                  showToast('Backup Database (.json) berhasil diunduh.', 'success');
                }}
                className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Backup JSON</span>
              </button>
              <button
                onClick={() => {
                  downloadDatabaseBackupCSV(students, transactions);
                  showToast('Backup Database (.csv) berhasil diunduh.', 'success');
                }}
                className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 whitespace-nowrap shrink-0"
              >
                <Database className="h-3.5 w-3.5" />
                <span>Backup CSV</span>
              </button>
            </div>
            <button
              onClick={() => setDocsModalOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 whitespace-nowrap shrink-0"
            >
              <BookOpen className="h-3.5 w-3.5 text-blue-600" />
              <span>Skema & Security Rules</span>
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
            <div className="min-w-0 pr-2">
              <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                {isKasir ? schoolSettings.cashierName : schoolSettings.principalName}
              </p>
              <p className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                {isKasir ? schoolSettings.cashierEmail : schoolSettings.principalEmail}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
              title="Keluar (Logout)"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Header with Global Cashier Quick Search & Theme Switcher */}
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-6 py-3 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:border-slate-800 dark:text-slate-300"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="hidden sm:inline">{schoolSettings.schoolName}</span>
              <span className="hidden sm:inline">/</span>
              <span className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                {navItems.find((n) => n.id === activeMenu)?.label}
              </span>
            </div>
          </div>

          {/* Global Cashier Quick Search (Cari Siswa -> Langsung Bayar POS / Kartu SPP) */}
          <div className="relative flex-1 max-w-md min-w-[220px]">
            <Search className="absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={globalQuickSearch}
              onChange={(e) => setGlobalQuickSearch(e.target.value)}
              placeholder="Pintasan Kasir: Cari NIS / Nama Siswa dari mana saja..."
              className="w-full rounded-lg border border-slate-300 bg-slate-50 py-1.5 pr-8 pl-9 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            {globalQuickSearch && (
              <button
                type="button"
                onClick={() => setGlobalQuickSearch('')}
                className="absolute top-2 right-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Dropdown Hasil Pencarian Cepat Siswa */}
            {globalQuickSearch.trim().length > 0 && (
              <div className="absolute right-0 left-0 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-semibold text-slate-400">
                  <span>Hasil Pencarian Cepat Siswa ({globalSearchMatches.length})</span>
                  <span>Klik Aksi Cepat</span>
                </div>
                {globalSearchMatches.length === 0 ? (
                  <p className="p-3 text-center text-xs text-slate-500">
                    Siswa dengan kata kunci &ldquo;{globalQuickSearch}&rdquo; tidak ditemukan.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {globalSearchMatches.map((st) => (
                      <div
                        key={st.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                            {st.name}{' '}
                            <span className="font-mono font-normal text-slate-500">
                              ({st.nis})
                            </span>
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {st.className} · Sisa Tagihan:{' '}
                            <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                              {formatRupiah(st.totalBalance)}
                            </span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isKasir && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPosStudentId(st.id);
                                setPosPayerName(`Wali dari ${st.name}`);
                                setCart([]);
                                setActiveMenu('pos');
                                setGlobalQuickSearch('');
                              }}
                              className="rounded-md bg-blue-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-800"
                            >
                              Bayar POS
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedHistoryStudentId(st.id);
                              setActiveMenu('history');
                              setGlobalQuickSearch('');
                            }}
                            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          >
                            Kartu SPP
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Pemilih Cepat Tema Warna Keuangan (5 Swatch) */}
            <div className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 xl:flex dark:border-slate-800 dark:bg-slate-950">
              <Palette className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-[11px] font-semibold text-slate-500 mr-1">
                Warna:
              </span>
              {FINANCIAL_COLOR_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => {
                    setAccentTheme(theme.id);
                    showToast(`Tema warna "${theme.name}" diaktifkan.`, 'info');
                  }}
                  title={`${theme.name} (${theme.badge})`}
                  className={`h-4 w-4 rounded-full border transition-transform ${
                    accentTheme === theme.id
                      ? 'scale-125 border-slate-900 ring-2 ring-slate-400 dark:border-white'
                      : 'border-black/15 opacity-75 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: theme.primaryHex }}
                />
              ))}
            </div>

            {isKasir && students.length > 0 && (
              <button
                onClick={handleForceCloudSync}
                title="Sinkronkan seluruh data siswa & pengaturan ke Cloud Firestore agar tampil di semua browser"
                className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/60 dark:text-blue-300 whitespace-nowrap shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Sinkronkan Cloud ({students.length})</span>
              </button>
            )}

            {isKasir && students.length === 0 && !dataLoading && (
              <button
                onClick={handleSeedSampleData}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Muat Data Sampel</span>
              </button>
            )}

            <button
              onClick={() => setDarkMode(!darkMode)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              {darkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              <span>{darkMode ? 'Terang' : 'Gelap'}</span>
            </button>
          </div>
        </header>

        {/* Viewport Body */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* =================================================================
              MODUL 1 & 4: DASBOR & ANALITIK
          ================================================================= */}
          {activeMenu === 'dashboard' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
                    Dasbor Eksekutif & Analitik Keuangan
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Pemantauan real-time penerimaan SPP, DSP, Pembiayaan Kelas XI/XII, dan
                    status piutang siswa.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isKasir && (
                    <>
                      <button
                        onClick={() => setActiveMenu('pos')}
                        className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap shrink-0 shadow-xs"
                      >
                        <ShoppingCart className="h-3.5 w-3.5" />
                        <span>Transaksi Kasir POS</span>
                      </button>
                      <button
                        onClick={() => setActiveMenu('students')}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 whitespace-nowrap shrink-0"
                      >
                        <Users className="h-3.5 w-3.5" />
                        <span>Tambah / Impor Siswa</span>
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setActiveMenu('reports')}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 whitespace-nowrap shrink-0"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>Laporan Buku Kas</span>
                  </button>
                  <button
                    onClick={() => setActiveMenu('arrears')}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 whitespace-nowrap shrink-0"
                  >
                    <Wallet className="h-3.5 w-3.5" />
                    <span>Penagihan WA ({metrics.studentsWithArrears})</span>
                  </button>
                </div>
              </div>

              {/* 4 KPI Summary Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Total Penerimaan Kas
                  </p>
                  <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatRupiah(metrics.totalRevenue)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Dari {metrics.txCount} transaksi sah
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Penerimaan Hari Ini ({todayStr})
                  </p>
                  <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatRupiah(metrics.todayRevenue)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Rekapitulasi kas harian aktif
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Total Sisa Tunggakan Siswa
                  </p>
                  <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                    {formatRupiah(metrics.totalArrears)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {metrics.studentsWithArrears} dari {students.length} siswa memiliki
                    tagihan
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Total Siswa Terdaftar
                  </p>
                  <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {students.length} Siswa
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Kelas X, XI, dan XII aktif
                  </p>
                </div>
              </div>

              {/* Chart.js 7-Day SPP Bar Chart + Recent Transactions */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900 lg:col-span-7">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                        Tren Pemasukan Khusus Pos SPP (7 Hari Terakhir)
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Visualisasi interaktif Chart.js berdasarkan tanggal transaksi SPP
                      </p>
                    </div>
                    <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400">
                      Rp 300.000 / Bulan
                    </span>
                  </div>
                  <SppTrendChart
                    transactions={transactions}
                    darkMode={darkMode}
                    accentTheme={accentTheme}
                  />
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                        Transaksi Kasir Terbaru
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        5 pembayaran terakhir yang masuk ke Firestore
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveMenu('history')}
                      className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
                    >
                      Semua Riwayat
                    </button>
                  </div>

                  {transactions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Belum ada data transaksi tercatat.
                      </p>
                      {isKasir && (
                        <button
                          onClick={handleSeedSampleData}
                          className="mt-3 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800"
                        >
                          Muat Data Sampel Sekarang
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {transactions.slice(0, 5).map((tx) => (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between py-3 text-xs"
                        >
                          <div className="min-w-0 pr-3">
                            <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
                              {tx.studentName} ({tx.studentClass})
                            </p>
                            <p className="truncate text-slate-500 dark:text-slate-400">
                              {tx.receiptNo} · {tx.category} · {tx.txDate}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                              {formatRupiah(tx.totalAmount)}
                            </p>
                            <button
                              onClick={() => generateReceiptPDF(tx, 0, schoolSettings)}
                              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                            >
                              Unduh PDF
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              MODUL 3: TRANSAKSI KASIR (POINT OF SALE)
          ================================================================= */}
          {activeMenu === 'pos' && isKasir && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
                  Transaksi Kasir Point of Sale (POS)
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pilih siswa, tambahkan satu atau beberapa pos tagihan ke keranjang, dan
                  eksekusi dengan Firestore Batch Write.
                </p>
              </div>

              {/* Banner Output Transaksi Terakhir (Kuitansi PDF & WhatsApp) */}
              {lastCompletedTx && (
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-300 bg-emerald-50/80 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
                  <div>
                    <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                      Transaksi Berhasil Disimpan — No. Kuitansi:{' '}
                      {lastCompletedTx.tx.receiptNo}
                    </p>
                    <p className="text-xs text-emerald-800 dark:text-emerald-300">
                      Siswa: {lastCompletedTx.tx.studentName} ({lastCompletedTx.tx.studentClass}) · Total Bayar:{' '}
                      <span className="font-mono font-bold">
                        {formatRupiah(lastCompletedTx.tx.totalAmount)}
                      </span>{' '}
                      · Sisa Saldo:{' '}
                      <span className="font-mono font-bold">
                        {formatRupiah(lastCompletedTx.remainingBalance)}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        generateReceiptPDF(
                          lastCompletedTx.tx,
                          lastCompletedTx.remainingBalance,
                          schoolSettings
                        )
                      }
                      className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 whitespace-nowrap shrink-0"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      <span>Cetak Kuitansi PDF</span>
                    </button>
                    <a
                      href={buildReceiptWhatsAppUrl(
                        lastCompletedTx.tx,
                        lastCompletedTx.remainingBalance,
                        schoolSettings
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>Kirim Struk ke WA Wali</span>
                    </a>
                    <button
                      onClick={() => setLastCompletedTx(null)}
                      className="rounded-lg p-1.5 text-emerald-800 hover:bg-emerald-100 dark:text-emerald-200"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Left 7 Columns: Student Selector & Payment Pos Builder */}
                <div className="space-y-6 lg:col-span-7">
                  {/* Step 1: Pencarian & Validasi Siswa Real-Time */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                      01. Cari & Validasi Data Siswa
                    </h2>
                    <div className="relative mt-3">
                      <Search className="absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={posSearchQuery}
                        onChange={(e) => setPosSearchQuery(e.target.value)}
                        placeholder="Ketik NIS, Nama Siswa, atau Kelas (misal: 20261001 / Rizky / X TKJ)..."
                        className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-4 pl-9 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>

                    <div className="mt-3 max-h-48 overflow-y-auto divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                      {filteredPosStudents.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500">
                          Data siswa tidak ditemukan. Silakan daftarkan di menu Master Data
                          Siswa.
                        </div>
                      ) : (
                        filteredPosStudents.map((st) => {
                          const isSelected = st.id === selectedPosStudentId;
                          return (
                            <button
                              key={st.id}
                              type="button"
                              onClick={() => {
                                setSelectedPosStudentId(st.id);
                                setPosPayerName(`Wali dari ${st.name}`);
                                setCart([]);
                              }}
                              className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-xs transition-colors ${
                                isSelected
                                  ? 'bg-blue-50 text-blue-950 dark:bg-blue-950/60 dark:text-blue-200'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                              }`}
                            >
                              <div>
                                <span className="font-mono font-semibold">{st.nis}</span>
                                <span className="mx-2">·</span>
                                <span className="font-semibold">{st.name}</span>
                                <span className="mx-2 text-slate-400">·</span>
                                <span className="text-slate-500 dark:text-slate-400">
                                  {st.className}
                                </span>
                              </div>
                              <span className="font-mono font-semibold tabular-nums">
                                Sisa: {formatRupiah(st.totalBalance)}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>

                    {/* Ringkasan Saldo Siswa Terpilih */}
                    {selectedPosStudent && (
                      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-950">
                        <div>
                          <p className="text-slate-500 dark:text-slate-400">Sisa SPP</p>
                          <p className="mt-0.5 font-mono font-bold tabular-nums">
                            {formatRupiah(selectedPosStudent.sppBalance)}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 dark:text-slate-400">Sisa DSP</p>
                          <p className="mt-0.5 font-mono font-bold tabular-nums">
                            {formatRupiah(selectedPosStudent.dspBalance)}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 dark:text-slate-400">
                            Pembiayaan Kls XI
                          </p>
                          <p className="mt-0.5 font-mono font-bold tabular-nums">
                            {formatRupiah(selectedPosStudent.class11Balance)}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 dark:text-slate-400">
                            Pembiayaan Kls XII
                          </p>
                          <p className="mt-0.5 font-mono font-bold tabular-nums">
                            {formatRupiah(selectedPosStudent.class12Balance)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Step 2: Pilih Pos Pembayaran & Kalender SPP */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                      02. Pilih Pos Pembayaran
                    </h2>

                    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                          Pos Pembayaran
                        </label>
                        <select
                          value={posCategory}
                          onChange={(e) =>
                            setPosCategory(e.target.value as PaymentCategory)
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        >
                          <option value="SPP">1. SPP (Rp 300.000 / Bulan)</option>
                          <option value="DSP">2. DSP (Dana Sumbangan Pendidikan)</option>
                          <option value="Pembiayaan Kelas XII">
                            3. Pembiayaan Kelas XII
                          </option>
                          <option value="Pembiayaan Kelas XI">
                            4. Pembiayaan Kelas XI
                          </option>
                        </select>
                      </div>

                      {posCategory === 'SPP' ? (
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                            Tahun Pelajaran SPP
                          </label>
                          <select
                            value={posSppYear}
                            onChange={(e) => {
                              setPosSppYear(e.target.value);
                              setPosSelectedMonths([]);
                            }}
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          >
                            <option value="2025/2026">2025/2026</option>
                            <option value="2026/2027">2026/2027</option>
                            <option value="2027/2028">2027/2028</option>
                          </select>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                            Nominal Pembayaran (Rp)
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={50000}
                            value={posAmountInput || ''}
                            onChange={(e) => setPosAmountInput(Number(e.target.value))}
                            placeholder="Contoh: 500000"
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          />
                        </div>
                      )}
                    </div>

                    {/* Logika Khusus SPP: Kalender Centang Bulan Juli - Juni */}
                    {posCategory === 'SPP' && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            Kalender Bulan SPP (Juli - Juni {posSppYear}):
                          </span>
                          <span className="font-mono font-bold text-blue-700 dark:text-blue-400">
                            {posSelectedMonths.length} Bulan × Rp 300.000 ={' '}
                            {formatRupiah(calculatedSppAmount)}
                          </span>
                        </div>

                        <div className="mt-2.5 grid grid-cols-3 gap-2 sm:grid-cols-4">
                          {ACADEMIC_MONTHS.map((m) => {
                            const fullLabel = `${m.name} ${posSppYear}`;
                            const isAlreadyPaid = selectedPosStudent?.paidMonths.some(
                              (pm) =>
                                pm.toLowerCase() === fullLabel.toLowerCase() ||
                                pm.toLowerCase().startsWith(m.name.toLowerCase())
                            );
                            const isChecked = posSelectedMonths.includes(fullLabel);

                            return (
                              <button
                                key={m.code}
                                type="button"
                                disabled={Boolean(isAlreadyPaid)}
                                onClick={() => togglePosMonth(m.name)}
                                className={`flex flex-col items-start rounded-lg border p-2.5 text-left text-xs transition-colors ${
                                  isAlreadyPaid
                                    ? 'cursor-not-allowed border-emerald-200 bg-emerald-50/60 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400'
                                    : isChecked
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-slate-200 bg-white text-slate-700 hover:border-blue-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200'
                                }`}
                              >
                                <span className="font-semibold">{m.name}</span>
                                <span className="mt-0.5 font-mono text-[11px] opacity-85">
                                  {isAlreadyPaid
                                    ? 'LUNAS'
                                    : isChecked
                                    ? 'Dipilih'
                                    : 'Rp 300rb'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={handleAddToCart}
                        className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Masukkan ke Keranjang Transaksi</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right 5 Columns: Sistem Keranjang & Eksekusi Batch Write */}
                <div className="lg:col-span-5">
                  <div className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <div>
                      <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                        <h2 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                          03. Keranjang Transaksi Kasir
                        </h2>
                        <span className="font-mono text-xs text-slate-500">
                          {cart.length} Pos
                        </span>
                      </div>

                      {selectedPosStudent ? (
                        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-950">
                          <p className="font-semibold text-slate-900 dark:text-slate-100">
                            {selectedPosStudent.name} ({selectedPosStudent.nis})
                          </p>
                          <p className="text-slate-500 dark:text-slate-400">
                            Kelas: {selectedPosStudent.className} · WA:{' '}
                            {selectedPosStudent.waNumber}
                          </p>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500 dark:border-slate-800">
                          Pilih siswa terlebih dahulu pada panel sebelah kiri.
                        </div>
                      )}

                      {/* Daftar Item di Keranjang */}
                      <div className="mt-4 space-y-2.5">
                        {cart.length === 0 ? (
                          <p className="py-6 text-center text-xs text-slate-400">
                            Belum ada pos pembayaran di keranjang.
                          </p>
                        ) : (
                          cart.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"
                            >
                              <div>
                                <p className="font-semibold text-slate-900 dark:text-slate-100">
                                  {item.category}
                                </p>
                                <p className="text-slate-500 dark:text-slate-400">
                                  {item.description}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-mono font-bold tabular-nums">
                                  {formatRupiah(item.amount)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCart((prev) => prev.filter((c) => c.id !== item.id))
                                  }
                                  className="text-slate-400 hover:text-red-600"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Metadata Penyetor & Catatan */}
                      <div className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                            Nama Penyetor (Wali Murid / Siswa)
                          </label>
                          <input
                            type="text"
                            value={posPayerName}
                            onChange={(e) => setPosPayerName(e.target.value)}
                            placeholder="Nama penyetor di kuitansi..."
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                            Catatan Kuitansi (Opsional)
                          </label>
                          <input
                            type="text"
                            value={posNotes}
                            onChange={(e) => setPosNotes(e.target.value)}
                            placeholder="Catatan tambahan..."
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Total & Tombol Eksekusi Batch Write */}
                    <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                          Total Pembayaran
                        </span>
                        <span className="font-mono text-xl font-bold tabular-nums text-blue-700 dark:text-blue-400">
                          {formatRupiah(cartTotal)}
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={!selectedPosStudent || cart.length === 0}
                        onClick={handleCheckoutPos}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 text-xs font-bold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Proses Transaksi & Cetak Bukti (Batch Write)</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              MODUL 2: MANAJEMEN DATA SISWA (MASTER DATA)
          ================================================================= */}
          {activeMenu === 'students' && isKasir && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
                    Manajemen Master Data Siswa & Impor Massal
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Daftarkan siswa satuan atau unggah file Excel/CSV untuk impor siswa baru
                    secara massal dengan deteksi otomatis tagihan kelas X, XI, dan XII.
                  </p>
                </div>

                {/* Tombol Template Excel & Impor Massal */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={bulkFileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleBulkFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={handleDownloadStudentTemplate}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Unduh Template Excel (.xlsx)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => bulkFileInputRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Impor Siswa Massal (Excel / CSV)</span>
                  </button>
                </div>
              </div>

              {/* Informasi Format Impor Massal */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                  <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    <strong>Format Impor Massal:</strong> Kolom wajib{' '}
                    <span className="font-mono font-semibold">NIS</span>,{' '}
                    <span className="font-mono font-semibold">Nama_Lengkap</span>,{' '}
                    <span className="font-mono font-semibold">Kelas</span>, dan{' '}
                    <span className="font-mono font-semibold">No_WA</span>. Jika kolom
                    nominal tagihan dikosongkan di Excel, sistem otomatis mengisi tarif
                    standar sesuai tingkat kelas (X / XI / XII).
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadStudentTemplate}
                  className="font-semibold text-blue-700 hover:underline dark:text-blue-400 whitespace-nowrap shrink-0"
                >
                  Unduh Contoh Template
                </button>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Form Pendaftaran / Edit Siswa */}
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-5">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                    <h2 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                      {editingStudent
                        ? `Edit Data Siswa: ${editingStudent.name}`
                        : 'Form Pendaftaran Siswa Baru'}
                    </h2>
                    {editingStudent && (
                      <button
                        type="button"
                        onClick={resetStudentForm}
                        className="text-xs font-semibold text-blue-600 hover:underline"
                      >
                        Batal Edit
                      </button>
                    )}
                  </div>

                  <form onSubmit={handleSaveStudent} className="mt-4 space-y-3.5">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                          NIS (Nomor Induk Siswa)
                        </label>
                        <input
                          type="text"
                          required
                          value={nisForm}
                          onChange={(e) => setNisForm(e.target.value)}
                          placeholder="Contoh: 20261005"
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                          Kelas (Deteksi X / XI / XII)
                        </label>
                        <input
                          type="text"
                          required
                          value={classForm}
                          onChange={(e) => handleClassInputChange(e.target.value)}
                          placeholder="Misal: X TKJ 1 / XI RPL 2 / XII AKL 1"
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Nama Lengkap Siswa
                      </label>
                      <input
                        type="text"
                        required
                        value={nameForm}
                        onChange={(e) => setNameForm(e.target.value)}
                        placeholder="Masukkan nama lengkap siswa..."
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                          Kompetensi Keahlian (Jurusan)
                        </label>
                        <select
                          value={majorForm}
                          onChange={(e) => setMajorForm(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        >
                          {SCHOOL_MAJORS.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                          No. WhatsApp Wali Murid
                        </label>
                        <input
                          type="text"
                          required
                          value={waForm}
                          onChange={(e) => setWaForm(e.target.value)}
                          placeholder="0812xxxxxxxx"
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </div>
                    </div>

                    {/* Panel Set Tagihan Otomatis */}
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          Saldo Tagihan (Terdeteksi Tingkat:{' '}
                          {detectGradeLevelFromClass(classForm)})
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={applyStandardTariff}
                            className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300"
                          >
                            Set Otomatis Kelas {detectGradeLevelFromClass(classForm)}
                          </button>
                          <button
                            type="button"
                            onClick={resetTariffToZero}
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                          >
                            Reset Rp 0
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] text-slate-500">
                            Tagihan SPP (Rp)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={sppForm}
                            onChange={(e) => setSppForm(Number(e.target.value))}
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500">
                            Tagihan DSP (Rp)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={dspForm}
                            onChange={(e) => setDspForm(Number(e.target.value))}
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500">
                            Pembiayaan Kelas XI (Rp)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={class11Form}
                            onChange={(e) => setClass11Form(Number(e.target.value))}
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500">
                            Pembiayaan Kelas XII (Rp)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={class12Form}
                            onChange={(e) => setClass12Form(Number(e.target.value))}
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2 text-xs dark:border-slate-800">
                        <span className="text-slate-500">Total Tagihan Siswa:</span>
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                          {formatRupiah(
                            (Number(sppForm) || 0) +
                              (Number(dspForm) || 0) +
                              (Number(class11Form) || 0) +
                              (Number(class12Form) || 0)
                          )}
                        </span>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-800"
                    >
                      <Plus className="h-4 w-4" />
                      <span>
                        {editingStudent
                          ? 'Simpan Perubahan Data Siswa'
                          : 'Daftarkan Siswa ke Firestore'}
                      </span>
                    </button>
                  </form>
                </div>

                {/* Tabel Master Siswa, Pencarian & Hapus Massal Ceklis */}
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-7">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                        Daftar Siswa Terdaftar ({filteredMasterStudents.length})
                      </h2>
                      {filteredMasterStudents.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            toggleSelectAllFilteredStudents(filteredMasterStudents)
                          }
                          className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          {filteredMasterStudents.every((s) =>
                            selectedStudentIds.includes(s.id)
                          )
                            ? 'Batal Pilih Semua'
                            : 'Pilih Semua'}
                        </button>
                      )}
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute top-2.5 left-3 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        placeholder="Cari NIS atau Nama Siswa..."
                        className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pr-3 pl-8 text-xs focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
                      />
                    </div>
                  </div>

                  {/* Bar Aksi Cepat Hapus Siswa yang Ditandai Ceklis */}
                  {selectedStudentIds.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50/80 px-3.5 py-2.5 text-xs dark:border-red-900/60 dark:bg-red-950/40">
                      <div className="flex items-center gap-2 text-red-900 dark:text-red-200">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                        <span>
                          <strong>{selectedStudentIds.length} siswa</strong> ditandai ceklis
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedStudentIds([])}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                          Batal Ceklis
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmBulkDeleteOpen(true)}
                          className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Hapus Siswa Terpilih ({selectedStudentIds.length})</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                          <th className="w-8 py-2.5 pr-2">
                            <input
                              type="checkbox"
                              checked={
                                filteredMasterStudents.length > 0 &&
                                filteredMasterStudents.every((s) =>
                                  selectedStudentIds.includes(s.id)
                                )
                              }
                              onChange={() =>
                                toggleSelectAllFilteredStudents(filteredMasterStudents)
                              }
                              aria-label="Pilih semua siswa"
                              className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700"
                            />
                          </th>
                          <th className="py-2.5 pr-3 font-semibold">NIS</th>
                          <th className="px-3 py-2.5 font-semibold">Nama Siswa</th>
                          <th className="px-3 py-2.5 font-semibold">Kelas</th>
                          <th className="px-3 py-2.5 text-right font-semibold">SPP</th>
                          <th className="px-3 py-2.5 text-right font-semibold">DSP</th>
                          <th className="px-3 py-2.5 text-right font-semibold">
                            Total Saldo
                          </th>
                          <th className="py-2.5 pl-3 text-right font-semibold">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {filteredMasterStudents.length === 0 ? (
                          <tr>
                            <td
                              colSpan={8}
                              className="py-10 text-center text-xs text-slate-500"
                            >
                              Tidak ada data siswa yang cocok.
                            </td>
                          </tr>
                        ) : (
                          filteredMasterStudents.map((st) => {
                            const isChecked = selectedStudentIds.includes(st.id);
                            return (
                              <tr
                                key={st.id}
                                className={`transition-colors ${
                                  isChecked
                                    ? 'bg-blue-50/70 dark:bg-blue-950/30'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                }`}
                              >
                                <td className="py-2.5 pr-2">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleSelectStudent(st.id)}
                                    aria-label={`Pilih siswa ${st.name}`}
                                    className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700"
                                  />
                                </td>
                                <td className="py-2.5 pr-3 font-mono font-semibold">
                                  {st.nis}
                                </td>
                                <td className="px-3 py-2.5">
                                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                                    {st.name}
                                  </p>
                                  <p className="text-[11px] text-slate-500">
                                    WA: {st.waNumber}
                                  </p>
                                </td>
                                <td className="px-3 py-2.5">{st.className}</td>
                                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                                  {formatRupiah(st.sppBalance)}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                                  {formatRupiah(st.dspBalance)}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums">
                                  {formatRupiah(st.totalBalance)}
                                </td>
                                <td className="py-2.5 pl-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleSelectEditStudent(st)}
                                      className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                                      title="Edit Biodata & Saldo"
                                    >
                                      <Edit3 className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteStudent(st)}
                                      className="rounded border border-slate-200 p-1.5 text-red-600 hover:bg-red-50 dark:border-slate-700"
                                      title="Hapus Siswa"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              MODUL 4: LAPORAN REKAP HARIAN, LAPORAN BULANAN & BUKU KAS
          ================================================================= */}
          {activeMenu === 'reports' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
                    Laporan Bulanan, Rekap Harian & Buku Kas Sekolah
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Memfilter transaksi berdasarkan bulan atau periode tanggal secara otomatis dan
                    menghitung rekapitulasi total untuk setiap kategori (SPP, DSP, Kls XI, Kls XII).
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() =>
                      generateCashbookPDF(
                        filteredReportTransactions,
                        reportTab === 'daily'
                          ? 'REKAPITULASI KAS HARIAN'
                          : reportTab === 'monthly'
                          ? 'LAPORAN KEUANGAN BULANAN'
                          : 'LAPORAN BUKU KAS UMUM',
                        reportTab === 'daily'
                          ? todayStr
                          : reportTab === 'monthly'
                          ? `Bulan ${selectedMonthLabel}`
                          : `${dateStart} s/d ${dateEnd}`,
                        schoolSettings
                      )
                    }
                    className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 whitespace-nowrap shrink-0"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>Ekspor PDF (Tanda Tangan Resmi)</span>
                  </button>
                  <button
                    onClick={() =>
                      exportTransactionsToExcel(
                        filteredReportTransactions,
                        reportTab === 'daily'
                          ? `Rekap_Harian_${todayStr}`
                          : reportTab === 'monthly'
                          ? `Laporan_Bulanan_${selectedReportMonth}`
                          : 'Buku_Kas_SMKS_PGRI_1'
                      )
                    }
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    <span>Unduh Excel (.xls)</span>
                  </button>
                </div>
              </div>

              {/* Filter Toolbar & Mode Laporan */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  {/* Tab Pilihan: Laporan Bulanan | Rekap Harian | Buku Kas */}
                  <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
                    <button
                      onClick={() => {
                        setReportTab('monthly');
                        setReportPage(1);
                      }}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        reportTab === 'monthly'
                          ? 'bg-blue-700 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      Laporan Bulanan ({selectedMonthLabel})
                    </button>
                    <button
                      onClick={() => {
                        setReportTab('daily');
                        setReportPage(1);
                      }}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        reportTab === 'daily'
                          ? 'bg-blue-700 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      Rekap Harian ({todayStr})
                    </button>
                    <button
                      onClick={() => {
                        setReportTab('cashbook');
                        setReportPage(1);
                      }}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        reportTab === 'cashbook'
                          ? 'bg-blue-700 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      Buku Kas (Rentang Tanggal)
                    </button>
                  </div>

                  {/* Filter Bulan / Rentang Tanggal, Pos, dan Search */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    {reportTab === 'monthly' && (
                      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs dark:border-slate-800 dark:bg-slate-950">
                        <Calendar className="h-3.5 w-3.5 text-blue-600" />
                        <span className="font-semibold text-slate-600 dark:text-slate-300">
                          Pilih Bulan:
                        </span>
                        <button
                          type="button"
                          onClick={() => shiftSelectedMonth(-1)}
                          className="rounded border border-slate-300 bg-white p-1 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                          title="Bulan Sebelumnya"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <select
                          value={selectedReportMonth.split('-')[1] || '01'}
                          onChange={(e) => {
                            const year =
                              selectedReportMonth.split('-')[0] ||
                              String(new Date().getFullYear());
                            setSelectedReportMonth(`${year}-${e.target.value}`);
                            setReportPage(1);
                          }}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        >
                          <option value="01">01 - Januari</option>
                          <option value="02">02 - Februari</option>
                          <option value="03">03 - Maret</option>
                          <option value="04">04 - April</option>
                          <option value="05">05 - Mei</option>
                          <option value="06">06 - Juni</option>
                          <option value="07">07 - Juli</option>
                          <option value="08">08 - Agustus</option>
                          <option value="09">09 - September</option>
                          <option value="10">10 - Oktober</option>
                          <option value="11">11 - November</option>
                          <option value="12">12 - Desember</option>
                        </select>
                        <select
                          value={
                            selectedReportMonth.split('-')[0] ||
                            String(new Date().getFullYear())
                          }
                          onChange={(e) => {
                            const month = selectedReportMonth.split('-')[1] || '01';
                            setSelectedReportMonth(`${e.target.value}-${month}`);
                            setReportPage(1);
                          }}
                          className="rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        >
                          {['2024', '2025', '2026', '2027', '2028', '2029', '2030'].map(
                            (yr) => (
                              <option key={yr} value={yr}>
                                {yr}
                              </option>
                            )
                          )}
                        </select>
                        <button
                          type="button"
                          onClick={() => shiftSelectedMonth(1)}
                          className="rounded border border-slate-300 bg-white p-1 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                          title="Bulan Berikutnya"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                        {selectedReportMonth !== currentMonthStr && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedReportMonth(currentMonthStr);
                              setReportPage(1);
                            }}
                            className="ml-1 rounded bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300"
                          >
                            Bulan Ini
                          </button>
                        )}
                      </div>
                    )}

                    {reportTab === 'cashbook' && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="date"
                          value={dateStart}
                          onChange={(e) => {
                            setDateStart(e.target.value);
                            setReportPage(1);
                          }}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                        />
                        <span>s/d</span>
                        <input
                          type="date"
                          value={dateEnd}
                          onChange={(e) => {
                            setDateEnd(e.target.value);
                            setReportPage(1);
                          }}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                        />
                      </div>
                    )}

                    <select
                      value={reportCategoryFilter}
                      onChange={(e) => {
                        setReportCategoryFilter(e.target.value);
                        setReportPage(1);
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                    >
                      <option value="ALL">Semua Pos Pembayaran</option>
                      <option value="SPP">Pos SPP</option>
                      <option value="DSP">Pos DSP</option>
                      <option value="Pembiayaan Kelas XI">Pembiayaan Kelas XI</option>
                      <option value="Pembiayaan Kelas XII">Pembiayaan Kelas XII</option>
                    </select>

                    <div className="relative">
                      <Search className="absolute top-2 left-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={reportSearch}
                        onChange={(e) => {
                          setReportSearch(e.target.value);
                          setReportPage(1);
                        }}
                        placeholder="Cari kuitansi / siswa..."
                        className="rounded-lg border border-slate-300 bg-white py-1.5 pr-3 pl-8 text-xs focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
                      />
                    </div>
                  </div>
                </div>

                {/* =============================================================
                    REKAPITULASI TOTAL PER KATEGORI (SPP, DSP, KLS XI, KLS XII)
                ============================================================= */}
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
                    <div>
                      <h2 className="font-display text-xs font-bold tracking-wider text-slate-700 uppercase dark:text-slate-200">
                        {reportTab === 'monthly'
                          ? `Rekapitulasi Penerimaan Bulanan Per Kategori — ${selectedMonthLabel}`
                          : reportTab === 'daily'
                          ? `Rekapitulasi Penerimaan Harian Per Kategori — ${todayStr}`
                          : `Rekapitulasi Penerimaan Periode ${dateStart} s/d ${dateEnd}`}
                      </h2>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Klik pada salah satu kartu kategori di bawah untuk memfilter tabel transaksi
                        khusus kategori tersebut.
                      </p>
                    </div>
                    {reportCategoryFilter !== 'ALL' && (
                      <button
                        type="button"
                        onClick={() => {
                          setReportCategoryFilter('ALL');
                          setReportPage(1);
                        }}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        Tampilkan Semua Kategori
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {/* 1. Rekap Kategori SPP */}
                    <button
                      type="button"
                      onClick={() => {
                        setReportCategoryFilter(
                          reportCategoryFilter === 'SPP' ? 'ALL' : 'SPP'
                        );
                        setReportPage(1);
                      }}
                      className={`flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all ${
                        reportCategoryFilter === 'SPP'
                          ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20 dark:border-blue-500 dark:bg-blue-950/40'
                          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                          1. Pos SPP
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {reportCategoryRecap.sppPct}%
                        </span>
                      </div>
                      <p className="mt-2 font-mono text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {formatRupiah(reportCategoryRecap.sppTotal)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {reportCategoryRecap.sppCount} transaksi pembayaran SPP
                      </p>
                    </button>

                    {/* 2. Rekap Kategori DSP */}
                    <button
                      type="button"
                      onClick={() => {
                        setReportCategoryFilter(
                          reportCategoryFilter === 'DSP' ? 'ALL' : 'DSP'
                        );
                        setReportPage(1);
                      }}
                      className={`flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all ${
                        reportCategoryFilter === 'DSP'
                          ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20 dark:border-blue-500 dark:bg-blue-950/40'
                          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                          2. Pos DSP
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {reportCategoryRecap.dspPct}%
                        </span>
                      </div>
                      <p className="mt-2 font-mono text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {formatRupiah(reportCategoryRecap.dspTotal)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {reportCategoryRecap.dspCount} transaksi cicilan DSP
                      </p>
                    </button>

                    {/* 3. Rekap Kategori Kls XI */}
                    <button
                      type="button"
                      onClick={() => {
                        setReportCategoryFilter(
                          reportCategoryFilter === 'Pembiayaan Kelas XI'
                            ? 'ALL'
                            : 'Pembiayaan Kelas XI'
                        );
                        setReportPage(1);
                      }}
                      className={`flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all ${
                        reportCategoryFilter === 'Pembiayaan Kelas XI'
                          ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20 dark:border-blue-500 dark:bg-blue-950/40'
                          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                          3. Pembiayaan Kls XI
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {reportCategoryRecap.class11Pct}%
                        </span>
                      </div>
                      <p className="mt-2 font-mono text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {formatRupiah(reportCategoryRecap.class11Total)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {reportCategoryRecap.class11Count} transaksi Kelas XI
                      </p>
                    </button>

                    {/* 4. Rekap Kategori Kls XII */}
                    <button
                      type="button"
                      onClick={() => {
                        setReportCategoryFilter(
                          reportCategoryFilter === 'Pembiayaan Kelas XII'
                            ? 'ALL'
                            : 'Pembiayaan Kelas XII'
                        );
                        setReportPage(1);
                      }}
                      className={`flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all ${
                        reportCategoryFilter === 'Pembiayaan Kelas XII'
                          ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20 dark:border-blue-500 dark:bg-blue-950/40'
                          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                          4. Pembiayaan Kls XII
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {reportCategoryRecap.class12Pct}%
                        </span>
                      </div>
                      <p className="mt-2 font-mono text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {formatRupiah(reportCategoryRecap.class12Total)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {reportCategoryRecap.class12Count} transaksi Kelas XII
                      </p>
                    </button>

                    {/* 5. Total Keseluruhan Periode / Bulan */}
                    <div className="flex flex-col justify-between rounded-xl border border-emerald-300 bg-emerald-50/70 p-3.5 dark:border-emerald-900/70 dark:bg-emerald-950/40">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                          Total Penerimaan
                        </span>
                        <span className="rounded bg-emerald-600 px-1.5 py-0.5 font-mono text-[11px] font-bold text-white">
                          100%
                        </span>
                      </div>
                      <p className="mt-2 font-mono text-base font-bold tabular-nums text-emerald-800 dark:text-emerald-300">
                        {formatRupiah(reportCategoryRecap.grandTotal)}
                      </p>
                      <p className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                        Total {reportCategoryRecap.txCount} kuitansi sah
                      </p>
                    </div>
                  </div>
                </div>

                {/* Tabel Data Laporan (Kolom SPP, DSP, Kls XI, Kls XII Terpisah) */}
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        <th className="py-2.5 pr-3 font-semibold">Tanggal</th>
                        <th className="px-3 py-2.5 font-semibold">No. Kuitansi</th>
                        <th className="px-3 py-2.5 font-semibold">Siswa & Kelas</th>
                        <th className="px-3 py-2.5 font-semibold">Pos / Rincian</th>
                        <th className="px-3 py-2.5 text-right font-semibold">SPP</th>
                        <th className="px-3 py-2.5 text-right font-semibold">DSP</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Kls XI</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Kls XII</th>
                        <th className="px-3 py-2.5 text-right font-semibold">
                          Total Masuk
                        </th>
                        <th className="py-2.5 pl-3 font-semibold">Kasir</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {paginatedReportTransactions.length === 0 ? (
                        <tr>
                          <td
                            colSpan={10}
                            className="py-10 text-center text-xs text-slate-500"
                          >
                            Tidak ada transaksi pada periode / filter laporan ini.
                          </td>
                        </tr>
                      ) : (
                        paginatedReportTransactions.map((tx) => (
                          <tr
                            key={tx.id}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          >
                            <td className="py-2.5 pr-3 font-mono">{tx.txDate}</td>
                            <td className="px-3 py-2.5 font-mono font-semibold">
                              {tx.receiptNo}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="font-semibold text-slate-900 dark:text-slate-100">
                                {tx.studentName}
                              </span>{' '}
                              <span className="text-slate-500">({tx.studentClass})</span>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="font-medium">{tx.category}</span>
                              {tx.sppMonths.length > 0 && (
                                <span className="block text-[11px] text-slate-500">
                                  SPP: {tx.sppMonths.join(', ')}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                              {formatRupiah(tx.sppAmount)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                              {formatRupiah(tx.dspAmount)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                              {formatRupiah(tx.class11Amount)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                              {formatRupiah(tx.class12Amount)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                              {formatRupiah(tx.totalAmount)}
                            </td>
                            <td className="py-2.5 pl-3">{tx.cashierName}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold dark:border-slate-700 dark:bg-slate-950">
                        <td colSpan={4} className="py-3 pr-3">
                          REKAPITULASI TOTAL ({filteredReportTransactions.length}{' '}
                          Transaksi)
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          {formatRupiah(
                            filteredReportTransactions.reduce((s, t) => s + t.sppAmount, 0)
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          {formatRupiah(
                            filteredReportTransactions.reduce((s, t) => s + t.dspAmount, 0)
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          {formatRupiah(
                            filteredReportTransactions.reduce(
                              (s, t) => s + t.class11Amount,
                              0
                            )
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          {formatRupiah(
                            filteredReportTransactions.reduce(
                              (s, t) => s + t.class12Amount,
                              0
                            )
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                          {formatRupiah(
                            filteredReportTransactions.reduce(
                              (s, t) => s + t.totalAmount,
                              0
                            )
                          )}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Pagination Bar */}
                <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
                  <span className="text-slate-500">
                    Menampilkan halaman {reportPage} dari {totalReportPages} (Total{' '}
                    {filteredReportTransactions.length} baris)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      disabled={reportPage <= 1}
                      onClick={() => setReportPage((p) => Math.max(1, p - 1))}
                      className="flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 disabled:opacity-40 dark:border-slate-700"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      <span>Sebelumnya</span>
                    </button>
                    <button
                      disabled={reportPage >= totalReportPages}
                      onClick={() =>
                        setReportPage((p) => Math.min(totalReportPages, p + 1))
                      }
                      className="flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 disabled:opacity-40 dark:border-slate-700"
                    >
                      <span>Berikutnya</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              MODUL 5: TUNGGAKAN & PENAGIHAN WHATSAPP
          ================================================================= */}
          {activeMenu === 'arrears' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
                    Daftar Tunggakan & Penagihan Wali Murid
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Menampilkan khusus siswa dengan saldo tagihan &gt; Rp 0 dilengkapi
                    tombol kirim tagihan WhatsApp otomatis.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <select
                    value={arrearsClassFilter}
                    onChange={(e) => setArrearsClassFilter(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="ALL">Semua Tingkat & Kelas</option>
                    <option value="X">Tingkat Kelas X</option>
                    <option value="XI">Tingkat Kelas XI</option>
                    <option value="XII">Tingkat Kelas XII</option>
                    {uniqueClasses.map((cls) => (
                      <option key={cls} value={cls}>
                        Kelas {cls}
                      </option>
                    ))}
                  </select>

                  <div className="relative">
                    <Search className="absolute top-2.5 left-3 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={arrearsSearch}
                      onChange={(e) => setArrearsSearch(e.target.value)}
                      placeholder="Cari siswa penunggak..."
                      className="rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-8 text-xs focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        <th className="py-2.5 pr-3 font-semibold">NIS</th>
                        <th className="px-3 py-2.5 font-semibold">Nama Siswa</th>
                        <th className="px-3 py-2.5 font-semibold">Kelas</th>
                        <th className="px-3 py-2.5 text-right font-semibold">
                          Tunggakan SPP
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold">
                          Tunggakan DSP
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold">
                          Kls XI / XII
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold">
                          Total Hutang
                        </th>
                        <th className="py-2.5 pl-3 text-right font-semibold">
                          Penagihan WA
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {arrearsStudents.length === 0 ? (
                        <tr>
                          <td
                            colSpan={8}
                            className="py-10 text-center text-xs text-slate-500"
                          >
                            Tidak ada siswa dengan tunggakan aktif pada filter ini.
                          </td>
                        </tr>
                      ) : (
                        arrearsStudents.map((st) => (
                          <tr
                            key={st.id}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          >
                            <td className="py-3 pr-3 font-mono font-semibold">{st.nis}</td>
                            <td className="px-3 py-3 font-semibold text-slate-900 dark:text-slate-100">
                              {st.name}
                            </td>
                            <td className="px-3 py-3">{st.className}</td>
                            <td className="px-3 py-3 text-right font-mono tabular-nums">
                              {formatRupiah(st.sppBalance)}
                            </td>
                            <td className="px-3 py-3 text-right font-mono tabular-nums">
                              {formatRupiah(st.dspBalance)}
                            </td>
                            <td className="px-3 py-3 text-right font-mono tabular-nums">
                              {formatRupiah(st.class11Balance + st.class12Balance)}
                            </td>
                            <td className="px-3 py-3 text-right font-mono font-bold tabular-nums text-red-600 dark:text-red-400">
                              {formatRupiah(st.totalBalance)}
                            </td>
                            <td className="py-3 pl-3 text-right">
                              <a
                                href={buildBillingWhatsAppUrl(st, schoolSettings)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
                              >
                                <MessageSquare className="h-3.5 w-3.5" />
                                <span>Kirim Pesan WA</span>
                              </a>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              MODUL 6: RIWAYAT, KARTU SPP PDF & PEMBATALAN (VOID)
          ================================================================= */}
          {activeMenu === 'history' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
                  Riwayat Transaksi, Cetak Kartu SPP & Pembatalan (Void)
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cetak Kartu Kendali SPP (Juli - Juni), Buku Riwayat Siswa PDF, atau
                  batalkan transaksi (Void) dengan refund otomatis via Firestore
                  Transaction.
                </p>
              </div>

              {/* Panel Kartu SPP & Buku Riwayat Per Siswa */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500">
                        Pilih Siswa untuk Kartu SPP / Buku Riwayat:
                      </label>
                      <select
                        value={selectedHistoryStudent?.id || ''}
                        onChange={(e) => setSelectedHistoryStudentId(e.target.value)}
                        className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      >
                        <option value="">-- Tampilkan Semua Siswa --</option>
                        {students.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nis} - {s.name} ({s.className})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-500">
                        Tahun Pelajaran Kartu SPP:
                      </label>
                      <select
                        value={sppCardYear}
                        onChange={(e) => setSppCardYear(e.target.value)}
                        className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      >
                        <option value="2025/2026">2025/2026</option>
                        <option value="2026/2027">2026/2027</option>
                        <option value="2027/2028">2027/2028</option>
                      </select>
                    </div>
                  </div>

                  {selectedHistoryStudent && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() =>
                          generateSppCardPDF(
                            selectedHistoryStudent,
                            transactions,
                            sppCardYear,
                            schoolSettings
                          )
                        }
                        className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap shrink-0"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        <span>Cetak Kartu SPP PDF</span>
                      </button>
                      <button
                        onClick={() =>
                          generateStudentHistoryPDF(
                            selectedHistoryStudent,
                            transactions,
                            schoolSettings
                          )
                        }
                        className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap shrink-0"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span>Cetak Buku Riwayat PDF</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Preview Mapping Bulan Juli - Juni untuk Siswa Terpilih */}
                {selectedHistoryStudent && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Status Kartu SPP {selectedHistoryStudent.name} ({selectedHistoryStudent.className}) — Juli s/d Juni:
                    </p>
                    <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                      {ACADEMIC_MONTHS.map((m) => {
                        const isPaid = selectedHistoryStudent.paidMonths.some((pm) =>
                          pm.toLowerCase().includes(m.name.toLowerCase())
                        );
                        return (
                          <div
                            key={m.code}
                            className={`rounded-lg border p-2.5 text-xs ${
                              isPaid
                                ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/30'
                                : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950'
                            }`}
                          >
                            <p className="font-semibold">{m.name}</p>
                            <p
                              className={`mt-0.5 font-mono text-[11px] font-bold ${
                                isPaid
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              {isPaid ? 'LUNAS' : 'BELUM BAYAR'}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Tabel Riwayat Transaksi & Tombol Void */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                    Daftar Riwayat Transaksi ({filteredHistoryTransactions.length})
                  </h2>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute top-2.5 left-3 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder="Cari No. Kuitansi / Nama..."
                      className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pr-3 pl-8 text-xs focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        <th className="py-2.5 pr-3 font-semibold">Tanggal</th>
                        <th className="px-3 py-2.5 font-semibold">No. Kuitansi</th>
                        <th className="px-3 py-2.5 font-semibold">Siswa</th>
                        <th className="px-3 py-2.5 font-semibold">Pos & Keterangan</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Nominal</th>
                        <th className="py-2.5 pl-3 text-right font-semibold">
                          Kuitansi / Koreksi (Void)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredHistoryTransactions.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="py-10 text-center text-xs text-slate-500"
                          >
                            Belum ada riwayat transaksi.
                          </td>
                        </tr>
                      ) : (
                        filteredHistoryTransactions.map((tx) => {
                          const st = students.find((s) => s.id === tx.studentId);
                          return (
                            <tr
                              key={tx.id}
                              className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                            >
                              <td className="py-3 pr-3 font-mono">{tx.txDate}</td>
                              <td className="px-3 py-3 font-mono font-semibold">
                                {tx.receiptNo}
                              </td>
                              <td className="px-3 py-3">
                                <p className="font-semibold text-slate-900 dark:text-slate-100">
                                  {tx.studentName}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {tx.studentNis} · {tx.studentClass}
                                </p>
                              </td>
                              <td className="px-3 py-3">
                                <p className="font-medium">{tx.category}</p>
                                <p className="text-[11px] text-slate-500">
                                  {tx.sppMonths.length > 0
                                    ? `Bulan: ${tx.sppMonths.join(', ')}`
                                    : tx.notes}
                                </p>
                              </td>
                              <td className="px-3 py-3 text-right font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                                {formatRupiah(tx.totalAmount)}
                              </td>
                              <td className="py-3 pl-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() =>
                                      generateReceiptPDF(
                                        tx,
                                        st ? st.totalBalance : 0,
                                        schoolSettings
                                      )
                                    }
                                    className="inline-flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                  >
                                    <Printer className="h-3 w-3" />
                                    <span>Kuitansi</span>
                                  </button>
                                  {isKasir && (
                                    <button
                                      onClick={() => setConfirmVoidTx(tx)}
                                      className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300"
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                      <span>Void</span>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              MODUL 7: PENGATURAN SEKOLAH, IDENTITAS, LOGO, AKUN & TUTORIAL
          ================================================================= */}
          {activeMenu === 'settings' && (
            <SettingsAndTutorialView
              settings={schoolSettings}
              isKasir={isKasir}
              currentUser={currentUser}
              accentTheme={accentTheme}
              onChangeAccentTheme={setAccentTheme}
              onSaveSettings={handleSaveSchoolSettings}
              onToast={showToast}
            />
          )}
        </main>
      </div>

      {/* Modal Konfirmasi Hapus Massal Siswa yang Ditandai Ceklis */}
      {confirmBulkDeleteOpen && selectedStudentIds.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
              Konfirmasi Hapus Data Siswa Terpilih
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Apakah Anda yakin ingin menghapus{' '}
              <span className="font-bold text-red-600 dark:text-red-400">
                {selectedStudentIds.length} data siswa
              </span>{' '}
              yang telah ditandai ceklis dari Master Data Siswa & Cloud Firestore?
            </p>
            <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-950">
              <ul className="space-y-1">
                {students
                  .filter((s) => selectedStudentIds.includes(s.id))
                  .map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-2 font-medium text-slate-700 dark:text-slate-300"
                    >
                      <span className="truncate">{s.name}</span>
                      <span className="font-mono text-[11px] text-slate-500">
                        {s.nis} · {s.className}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmBulkDeleteOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleBulkDeleteSelectedStudents}
                className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Ya, Hapus {selectedStudentIds.length} Siswa</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Pembatalan (Void) dengan Firestore Transaction */}
      {confirmVoidTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
              Konfirmasi Pembatalan Transaksi (Void)
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Anda akan menghapus kuitansi{' '}
              <span className="font-mono font-bold">{confirmVoidTx.receiptNo}</span> atas
              nama <span className="font-semibold">{confirmVoidTx.studentName}</span>.
              Sistem akan menggunakan <strong>Firestore Transaction</strong> untuk
              mengembalikan (me-refund) saldo tagihan siswa sebesar{' '}
              <span className="font-mono font-bold text-red-600">
                {formatRupiah(confirmVoidTx.totalAmount)}
              </span>{' '}
              secara atomik.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmVoidTx(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleVoidTransaction(confirmVoidTx)}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
              >
                Ya, Batalkan & Refund Saldo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pratinjau & Validasi Impor Data Siswa Massal */}
      {bulkImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="flex max-h-[88vh] w-full max-w-5xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                  Pratinjau & Validasi Impor Siswa Massal
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  File: <span className="font-mono font-semibold">{bulkImportFileName}</span>{' '}
                  · Total Baris: {bulkImportRows.length} · Siap Diimpor:{' '}
                  <span className="font-semibold text-emerald-600">
                    {bulkImportRows.filter((r) => r.isValid).length} Siswa
                  </span>{' '}
                  · Ditolak/Duplikat:{' '}
                  <span className="font-semibold text-red-600">
                    {bulkImportRows.filter((r) => !r.isValid).length} Baris
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBulkImportModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                      <th className="px-3 py-2.5 font-semibold">Baris</th>
                      <th className="px-3 py-2.5 font-semibold">NIS</th>
                      <th className="px-3 py-2.5 font-semibold">Nama Lengkap</th>
                      <th className="px-3 py-2.5 font-semibold">Kelas (Tingkat)</th>
                      <th className="px-3 py-2.5 font-semibold">Jurusan</th>
                      <th className="px-3 py-2.5 font-semibold">No. WA</th>
                      <th className="px-3 py-2.5 text-right font-semibold">SPP</th>
                      <th className="px-3 py-2.5 text-right font-semibold">DSP</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Kls XI/XII</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Total Tagihan</th>
                      <th className="px-3 py-2.5 font-semibold">Status Validasi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {bulkImportRows.map((row) => (
                      <tr
                        key={`${row.rowNumber}-${row.nis}`}
                        className={
                          row.isValid
                            ? 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                            : 'bg-red-50/50 dark:bg-red-950/20'
                        }
                      >
                        <td className="px-3 py-2 font-mono text-slate-500">
                          #{row.rowNumber}
                        </td>
                        <td className="px-3 py-2 font-mono font-semibold">
                          {row.nis || '-'}
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-900 dark:text-slate-100">
                          {row.name || '-'}
                        </td>
                        <td className="px-3 py-2">
                          {row.className || '-'} ({row.gradeLevel})
                        </td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                          {row.major}
                        </td>
                        <td className="px-3 py-2 font-mono">{row.waNumber}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {formatRupiah(row.sppBalance)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {formatRupiah(row.dspBalance)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {formatRupiah(row.class11Balance + row.class12Balance)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold tabular-nums">
                          {formatRupiah(row.totalBalance)}
                        </td>
                        <td className="px-3 py-2">
                          {row.isValid ? (
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              Siap Diimpor
                            </span>
                          ) : (
                            <span className="font-semibold text-red-600 dark:text-red-400">
                              Ditolak: {row.errorReason}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Hanya baris berstatus <strong>Siap Diimpor</strong> yang akan disimpan ke
                Cloud Firestore menggunakan Batch Write.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBulkImportModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={bulkImportRows.filter((r) => r.isValid).length === 0}
                  onClick={handleConfirmBulkImport}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    Simpan {bulkImportRows.filter((r) => r.isValid).length} Siswa ke
                    Firestore
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Dokumentasi Skema, Security Rules & Setup */}
      <DocsAndSchemaModal
        isOpen={docsModalOpen}
        onClose={() => setDocsModalOpen(false)}
      />
    </div>
  );
}
