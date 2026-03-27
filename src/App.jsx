import React, { useState, useMemo, useEffect } from 'react';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LabelList 
} from 'recharts';
import { 
  Users, UserMinus, AlertCircle, CheckCircle, TrendingUp, Plus, UserPlus, Briefcase, Search,
  Edit2, Trash2, Save, X, Download, LogOut, Lock, Filter, ChevronLeft, ChevronRight, Clock, Star, Info, ChevronDown, ChevronUp
} from 'lucide-react';

// --- โหลด Tailwind CSS อัตโนมัติ ---
if (typeof window !== 'undefined' && !document.getElementById('tailwind-script')) {
  const script = document.createElement('script');
  script.id = 'tailwind-script';
  script.src = 'https://cdn.tailwindcss.com';
  document.head.appendChild(script);
}

// --- ตั้งค่า Firebase Cloud Storage ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

// 🔴 นำลิงก์ Raw Image ที่ก๊อปปี้มา วางในเครื่องหมายคำพูดด้านล่างนี้ครับ 🔴
const COMPANY_LOGO_URL = "https://github.com/wraksakwamdee-creator/turnover-dashboard/blob/main/public/logo.png?raw=true";

const firebaseConfig = {
  apiKey: "AIzaSyCz1G9X2IgcThyIPWDmcUDvcu583QhVYzQ",
  authDomain: "recruitment-and-turnover-7d589.firebaseapp.com",
  projectId: "recruitment-and-turnover-7d589",
  storageBucket: "recruitment-and-turnover-7d589.firebasestorage.app",
  messagingSenderId: "708058093460",
  appId: "1:708058093460:web:77339e904c90733b966181"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const companyDataId = 'company_data';

// --- ข้อมูลเริ่มต้น ---
const INITIAL_HEADCOUNT = 153; 
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];
const TENURE_COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981'];

const VOLUNTARY_REASONS = [
  "ได้งานใหม่ / ค่าตอบแทนดีกว่า", "กลับต่างจังหวัด / ภูมิลำเนา", "เปลี่ยนสายงาน", 
  "ศึกษาต่อ", "ปัญหาสุขภาพ", "ดูแลครอบครัว", "เกษียณอายุ", "อื่นๆ"
];
const INVOLUNTARY_REASONS = [
  "ไม่ผ่านทดลองงาน", "ผลการปฏิบัติงานไม่ถึงเกณฑ์", "ทุจริต / ทำผิดกฎระเบียบ", 
  "ปรับลดโครงสร้างองค์กร (Layoff)", "อื่นๆ"
];
const getReasonOptions = (type) => type === 'Involuntary' ? INVOLUNTARY_REASONS : VOLUNTARY_REASONS;

const getTenureCategory = (joinDate, resignDate) => {
  if (!joinDate || !resignDate) return 'ไม่ระบุ';
  const start = new Date(joinDate); const end = new Date(resignDate);
  if (end < start) return 'ไม่ระบุ';
  const diffYears = (end - start) / (1000 * 60 * 60 * 24 * 365.25);
  if (diffYears < 1) return '< 1 ปี';
  if (diffYears <= 3) return '1-3 ปี';
  if (diffYears <= 5) return '3-5 ปี';
  return '> 5 ปี';
};

const getTimeToFill = (resignDate, hiredDate) => {
  if (!resignDate || !hiredDate) return null;
  const start = new Date(resignDate); const end = new Date(hiredDate);
  const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 ? diffDays : 0;
};

const MonthlyTrendTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-3 border border-gray-100 shadow-md rounded-lg">
        <p className="font-semibold text-gray-800 mb-2">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} style={{ color: entry.color }} className="text-xs mb-1 font-medium">
            {entry.name}: {entry.value}%
          </p>
        ))}
        <div className="mt-2 pt-2 border-t border-gray-100">
           <p className="text-xs text-yellow-600 font-medium mb-1">Regrettable: {data.regRate}%</p>
           <p className="text-xs text-green-600 font-medium">Non-Regret: {data.nonRegRate}%</p>
        </div>
      </div>
    );
  }
  return null;
};

const initialResignState = { 
  name: '', department: '', joinDate: '', date: '', type: 'Voluntary', regrettable: 'Yes', criticality: 'Non-Critical',
  reason: VOLUNTARY_REASONS[0], customReason: '', remarks: '', backfillStatus: 'Open', hiredDate: '' 
};

export default function RecruitmentDashboard() {
  const [user, setUser] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [resignations, setResignations] = useState([]);
  const [hires, setHires] = useState([]);
  
  const [showResignForm, setShowResignForm] = useState(false);
  const [newResign, setNewResign] = useState(initialResignState);
  const [showHireForm, setShowHireForm] = useState(false);
  
  // 🔴 เปลี่ยน state ของฟอร์มรับเข้าใหม่ เพื่อรองรับการเพิ่มหลายรายการและฟิลด์ใหม่
  const [newHire, setNewHire] = useState({ month: 'Jan', year: new Date().getFullYear().toString() });
  const [hireEntries, setHireEntries] = useState([{ name: '', position: '', department: '', company: 'PCHI', joinDate: '', count: 1 }]);
  
  // 🔴 เพิ่ม State สำหรับจัดการการ กาง/หุบ ตารางรับเข้า
  const [expandedHireGroups, setExpandedHireGroups] = useState(new Set());
  
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [itemToDelete, setItemToDelete] = useState(null);
  const [hireToDelete, setHireToDelete] = useState(null); // เพิ่ม State เก็บ id สำหรับลบข้อมูลรับเข้า
  
  // 🔴 เพิ่ม State สำหรับจัดการการแก้ไขข้อมูล "รับเข้า"
  const [editingHireId, setEditingHireId] = useState(null);
  const [editHireFormData, setEditHireFormData] = useState({});
  
  // States สำหรับ ตัวกรอง และ ค้นหา และ แบ่งหน้าตาราง
  const [filterYear, setFilterYear] = useState('All');
  const [filterDept, setFilterDept] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [addFormError, setAddFormError] = useState('');
  const [editFormError, setEditFormError] = useState('');

  // --- 1. จัดการการ Login ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsLoaded(true);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      setLoginError('อีเมล หรือ รหัสผ่านไม่ถูกต้อง');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  // --- 2. โหลดข้อมูลจาก Cloud ---
  useEffect(() => {
    if (!user) return;
    const resignationsRef = collection(db, companyDataId, 'public', 'resignations');
    const unsubResignations = onSnapshot(resignationsRef, (snapshot) => {
      const data = []; snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() })); setResignations(data);
    }, (error) => console.error("Error fetching resignations: ", error));

    const hiresRef = collection(db, companyDataId, 'public', 'hires');
    const unsubHires = onSnapshot(hiresRef, (snapshot) => {
      const data = []; snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() })); setHires(data);
    }, (error) => console.error("Error fetching hires: ", error));

    return () => { unsubResignations(); unsubHires(); };
  }, [user]);

  // --- ดึงรายการปี และแผนกที่มีในระบบ เพื่อสร้าง Dropdown ตัวกรอง ---
  const availableYears = useMemo(() => {
    const years = new Set(resignations.map(r => r.date ? r.date.substring(0, 4) : null).filter(Boolean));
    hires.forEach(h => { if(h.year) years.add(h.year); else years.add('2026'); });
    return Array.from(years).sort().reverse();
  }, [resignations, hires]);

  const availableDepts = useMemo(() => {
    const depts = new Set(resignations.map(r => r.department).filter(Boolean));
    return Array.from(depts).sort();
  }, [resignations]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterYear, filterDept]);

  // --- ประมวลผลข้อมูลตามตัวกรอง (Global Filter) ---
  const processedResignations = useMemo(() => {
    return resignations.filter(r => {
      const matchYear = filterYear === 'All' || (r.date && r.date.startsWith(filterYear));
      const matchDept = filterDept === 'All' || r.department === filterDept;
      return matchYear && matchDept;
    });
  }, [resignations, filterYear, filterDept]);

  const processedHires = useMemo(() => {
    return hires.filter(h => {
      const hYear = h.year || '2026';
      return filterYear === 'All' || hYear === filterYear;
    });
  }, [hires, filterYear]);

  // --- Logic การคำนวณตามสูตร (ใช้ข้อมูลที่กรองแล้ว) ---
  const dashboardData = useMemo(() => {
    let currentHC = INITIAL_HEADCOUNT;
    let ytdTotalOut = 0; let ytdVoluntary = 0; let ytdInvoluntary = 0; let ytdRegrettable = 0; let ytdNonRegrettable = 0;

    const monthlyStats = MONTHS.map(month => {
      const monthIndex = MONTHS.indexOf(month);
      const ins = processedHires.filter(h => h.month === month).reduce((sum, h) => sum + Number(h.count || 0), 0);
      const outsThisMonth = processedResignations.filter(r => {
        if (!r.date) return false; return new Date(r.date).getMonth() === monthIndex;
      });

      const totalOut = outsThisMonth.length;
      const vol = outsThisMonth.filter(r => r.type === 'Voluntary').length;
      const invol = outsThisMonth.filter(r => r.type === 'Involuntary').length;
      const reg = outsThisMonth.filter(r => r.regrettable === 'Yes').length;
      const nonReg = outsThisMonth.filter(r => r.regrettable === 'No').length;

      ytdTotalOut += totalOut; ytdVoluntary += vol; ytdInvoluntary += invol; ytdRegrettable += reg; ytdNonRegrettable += nonReg;
      const beginning = currentHC; const ending = beginning + ins - totalOut; const average = (beginning + ending) / 2;
      currentHC = ending;

      const regRate = average > 0 ? Number(((reg / average) * 100).toFixed(2)) : 0;
      const nonRegRate = average > 0 ? Number(((nonReg / average) * 100).toFixed(2)) : 0;

      return {
        month, beginning, ins, totalOut, ending, average, vol, invol, reg, nonReg,
        turnoverRate: average > 0 ? Number(((totalOut / average) * 100).toFixed(2)) : 0,
        volRate: average > 0 ? Number(((vol / average) * 100).toFixed(2)) : 0,
        involRate: average > 0 ? Number(((invol / average) * 100).toFixed(2)) : 0,
        regRate, nonRegRate
      };
    });

    const ytdAverageHC = (INITIAL_HEADCOUNT + currentHC) / 2;

    return {
      monthlyStats,
      ytd: {
        endingHC: currentHC, averageHC: ytdAverageHC, totalOut: ytdTotalOut,
        turnoverRate: ytdAverageHC > 0 ? ((ytdTotalOut / ytdAverageHC) * 100).toFixed(2) : 0,
        voluntary: ytdVoluntary, involuntary: ytdInvoluntary,
        regrettable: ytdRegrettable, nonRegrettable: ytdNonRegrettable
      }
    };
  }, [processedResignations, processedHires]);

  const hiresStats = useMemo(() => {
    return MONTHS.map(month => {
      const count = processedHires.filter(h => h.month === month).reduce((sum, h) => sum + Number(h.count || 0), 0);
      return { month, count };
    });
  }, [processedHires]);

  const reasonStats = useMemo(() => {
    const counts = {};
    processedResignations.forEach(r => { counts[r.reason || 'ไม่ระบุเหตุผล'] = (counts[r.reason || 'ไม่ระบุเหตุผล'] || 0) + 1; });
    return Object.keys(counts).map((key, index) => ({ name: key, value: counts[key], fill: COLORS[index % COLORS.length] }));
  }, [processedResignations]);

  const departmentStats = useMemo(() => {
    const counts = {}; let totalOut = 0;
    processedResignations.forEach(r => { counts[r.department || 'ไม่ระบุแผนก'] = (counts[r.department || 'ไม่ระบุแผนก'] || 0) + 1; totalOut++; });
    return Object.keys(counts).map(key => ({ department: key, count: counts[key], percent: totalOut > 0 ? ((counts[key] / totalOut) * 100).toFixed(1) : 0 })).sort((a, b) => b.count - a.count);
  }, [processedResignations]);

  const tenureStats = useMemo(() => {
    const counts = { '< 1 ปี': 0, '1-3 ปี': 0, '3-5 ปี': 0, '> 5 ปี': 0 }; let totalOut = 0;
    processedResignations.forEach(r => {
      const cat = getTenureCategory(r.joinDate, r.date);
      if (counts[cat] !== undefined) { counts[cat]++; totalOut++; }
    });
    return Object.keys(counts).map((key, index) => ({
      tenure: key, count: counts[key], percent: totalOut > 0 ? ((counts[key] / totalOut) * 100).toFixed(1) : 0, fill: TENURE_COLORS[index]
    }));
  }, [processedResignations]);

  // กราฟสรุปสถานะหาคนแทน
  const backfillStats = useMemo(() => {
    const counts = { 'Open': 0, 'In Progress': 0, 'Hired': 0, 'No Backfill': 0 };
    processedResignations.forEach(r => {
      const status = r.backfillStatus || 'Open';
      if (counts[status] !== undefined) counts[status]++;
    });
    return Object.keys(counts).map(key => ({
      name: key,
      value: counts[key],
      fill: key === 'Open' ? '#ef4444' : key === 'In Progress' ? '#3b82f6' : key === 'Hired' ? '#10b981' : '#9ca3af'
    }));
  }, [processedResignations]);

  // คำนวณ Time-to-Fill เฉลี่ย
  const averageTimeToFill = useMemo(() => {
    const hiredRoles = processedResignations.filter(r => r.backfillStatus === 'Hired' && r.hiredDate && r.date);
    if (hiredRoles.length === 0) return 0;
    const totalDays = hiredRoles.reduce((sum, r) => sum + getTimeToFill(r.date, r.hiredDate), 0);
    return Math.round(totalDays / hiredRoles.length);
  }, [processedResignations]);

  // --- ฟังก์ชันจัดการ Dynamic Rows สำหรับฟอร์มรับเข้า ---
  const handleAddHireRow = () => {
    setHireEntries([...hireEntries, { name: '', position: '', department: '', company: 'PCHI', joinDate: '', count: 1 }]);
  };

  const handleRemoveHireRow = (index) => {
    setHireEntries(hireEntries.filter((_, i) => i !== index));
  };

  const handleHireEntryChange = (index, field, value) => {
    const newEntries = [...hireEntries];
    newEntries[index][field] = value;
    setHireEntries(newEntries);
  };

  // --- 3. ฟังก์ชันบันทึกข้อมูล ---
  const handleAddResignation = async (e) => {
    e.preventDefault(); if (!user || !newResign.name || !newResign.date) return;
    
    setAddFormError('');
    if (newResign.joinDate && new Date(newResign.joinDate) > new Date(newResign.date)) {
      setAddFormError('Join Date cannot be after the Effective Date.');
      return;
    }
    if (newResign.backfillStatus === 'Hired' && !newResign.hiredDate) {
      setAddFormError('Please select a Hired Date when the status is "Hired".');
      return;
    }

    try {
      const finalReason = newResign.reason === 'อื่นๆ' ? newResign.customReason : newResign.reason;
      const resignDataToSave = { ...newResign, reason: finalReason }; delete resignDataToSave.customReason;
      await addDoc(collection(db, companyDataId, 'public', 'resignations'), resignDataToSave);
      setShowResignForm(false); setNewResign(initialResignState);
    } catch (error) { console.error("Error adding document: ", error); }
  };

  const handleAddHire = async (e) => {
    e.preventDefault(); if (!user) return;
    try {
      // บันทึกข้อมูลพนักงานใหม่ทุกคนใน Array พร้อมๆ กัน (รวมฟิลด์ใหม่)
      const promises = hireEntries.map(entry => {
        return addDoc(collection(db, companyDataId, 'public', 'hires'), {
          year: newHire.year,
          month: newHire.month,
          name: entry.name,
          position: entry.position,
          department: entry.department,
          company: entry.company,
          joinDate: entry.joinDate,
          count: Number(entry.count) || 1
        });
      });
      await Promise.all(promises);
      
      // เคลียร์ช่องกรอกรายชื่อให้กลับมาเป็น 1 ช่องว่างๆ หลังกดบันทึกสำเร็จ
      setHireEntries([{ name: '', position: '', department: '', company: 'PCHI', joinDate: '', count: 1 }]);
    } catch (error) { console.error("Error adding documents: ", error); }
  };

  // 🔴 เพิ่มฟังก์ชันสำหรับการแก้ไขข้อมูลรับเข้า
  const handleEditHireClick = (hire) => {
    setEditingHireId(hire.id);
    setEditHireFormData({
      ...hire,
      name: hire.name || '',
      position: hire.position || '',
      department: hire.department || '',
      company: hire.company || 'PCHI',
      joinDate: hire.joinDate || '',
      year: hire.year || new Date().getFullYear().toString(),
      month: hire.month || 'Jan',
      count: hire.count || 1
    });
  };

  const handleSaveHireEdit = async () => {
    if (!user || !editingHireId) return;
    try {
      const { id, ...updateData } = editHireFormData;
      updateData.count = Number(updateData.count) || 1;
      await updateDoc(doc(db, companyDataId, 'public', 'hires', editingHireId), updateData);
      setEditingHireId(null);
    } catch (error) { console.error("Error updating hire document: ", error); }
  };

  const handleCancelHireEdit = () => {
    setEditingHireId(null);
    setEditHireFormData({});
  };

  // เปลี่ยนฟังก์ชันลบข้อมูลรับเข้า ให้ไปทำงานผ่าน Modal ยืนยันก่อน
  const confirmDeleteHire = async () => {
    if (!user || !hireToDelete) return; 
    await deleteDoc(doc(db, companyDataId, 'public', 'hires', hireToDelete));
    setHireToDelete(null);
  };

  const handleStatusChange = async (person, newStatus) => {
    if (!user) return;
    try {
      const updateData = { backfillStatus: newStatus };
      if (newStatus === 'Hired' && !person.hiredDate) updateData.hiredDate = new Date().toISOString().split('T')[0];
      else if (newStatus !== 'Hired') updateData.hiredDate = '';
      await updateDoc(doc(db, companyDataId, 'public', 'resignations', person.id), updateData);
    } catch (error) { console.error("Error updating document: ", error); }
  };

  const handleEditClick = (person) => {
    setEditingId(person.id);
    const options = getReasonOptions(person.type); const isPredefined = options.includes(person.reason);
    setEditFormData({
      ...person, dropdownReason: isPredefined ? person.reason : 'อื่นๆ', customReason: isPredefined ? '' : (person.reason || ''),
      remarks: person.remarks || '', joinDate: person.joinDate || '', hiredDate: person.hiredDate || '',
      criticality: person.criticality || 'Non-Critical'
    });
  };

  const handleSaveEdit = async () => {
    if (!user || !editingId) return;

    setEditFormError('');
    if (editFormData.joinDate && editFormData.date && new Date(editFormData.joinDate) > new Date(editFormData.date)) {
      setEditFormError('Join Date cannot be after Effective Date.');
      return;
    }
    if (editFormData.backfillStatus === 'Hired' && !editFormData.hiredDate) {
      setEditFormError('Please specify Hired Date.');
      return;
    }

    try {
      const finalReason = editFormData.dropdownReason === 'อื่นๆ' ? editFormData.customReason : editFormData.dropdownReason;
      const { id, dropdownReason, customReason, ...updateData } = editFormData; updateData.reason = finalReason;
      if (updateData.backfillStatus !== 'Hired') updateData.hiredDate = '';
      await updateDoc(doc(db, companyDataId, 'public', 'resignations', editingId), updateData);
      setEditingId(null);
    } catch (error) { console.error("Error updating document: ", error); }
  };

  const handleCancelEdit = () => { setEditingId(null); setEditFormData({}); setEditFormError(''); };

  const confirmDelete = async () => {
    if (!user || !itemToDelete) return;
    await deleteDoc(doc(db, companyDataId, 'public', 'resignations', itemToDelete)); setItemToDelete(null);
  };

  // --- ข้อมูลสำหรับแสดงในตาราง (ผ่าน Filter และ Search พร้อมเรียงลำดับตามวันที่) ---
  const searchedResignations = useMemo(() => {
    let filtered = [...processedResignations];
    
    // ค้นหาตามชื่อหรือแผนก
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(person => 
        (person.name && person.name.toLowerCase().includes(term)) || 
        (person.department && person.department.toLowerCase().includes(term))
      );
    }
    
    // บังคับเรียงลำดับตามวันที่ Effective Date (จากใหม่ล่าสุด ไป เก่าสุด)
    return filtered.sort((a, b) => {
      const dateA = new Date(a.date || 0);
      const dateB = new Date(b.date || 0);
      return dateB - dateA;
    });
  }, [processedResignations, searchTerm]);

  // --- ระบบแบ่งหน้าตาราง (Pagination) ---
  const totalPages = Math.ceil(searchedResignations.length / itemsPerPage) || 1;
  const paginatedResignations = useMemo(() => {
    // ไม่ต้อง reverse แล้ว เพราะข้อมูลถูกเรียงมาแล้วจาก searchedResignations
    const startIndex = (currentPage - 1) * itemsPerPage;
    return searchedResignations.slice(startIndex, startIndex + itemsPerPage);
  }, [searchedResignations, currentPage]);

  // --- 🔴 จัดกลุ่มและเรียงประวัติการรับเข้าตาม ปี และ เดือน ---
  const groupedHires = useMemo(() => {
    const groups = {};
    hires.forEach(h => {
      const key = `${h.year || '2026'}-${h.month}`;
      if (!groups[key]) {
        groups[key] = { year: h.year || '2026', month: h.month, totalCount: 0, entries: [] };
      }
      groups[key].totalCount += Number(h.count || 0);
      groups[key].entries.push(h);
    });

    // แปลงเป็น Array และเรียงลำดับ ปีล่าสุด > เดือนล่าสุด
    return Object.values(groups).sort((a, b) => {
      const yearA = parseInt(a.year, 10);
      const yearB = parseInt(b.year, 10);
      if (yearA !== yearB) return yearB - yearA; 
      
      const monthA = MONTHS.indexOf(a.month);
      const monthB = MONTHS.indexOf(b.month);
      return monthB - monthA; 
    });
  }, [hires]);

  const toggleHireGroup = (key) => {
    const newSet = new Set(expandedHireGroups);
    if (newSet.has(key)) newSet.delete(key);
    else newSet.add(key);
    setExpandedHireGroups(newSet);
  };

  const handleExportCSV = () => {
    if (processedResignations.length === 0) return;
    const headers = ['ชื่อพนักงาน', 'แผนก', 'วันที่เริ่มงาน', 'วันที่ลาออก', 'อายุงาน', 'ประเภท', 'ความสำคัญ (Critical)', 'ผลกระทบ', 'เหตุผล', 'หมายเหตุ', 'สถานะหาคนแทน', 'วันที่ได้คน', 'Time-to-Fill (วัน)'];
    const csvData = processedResignations.map(r => [
      r.name || '', r.department || '-', r.joinDate || '-', r.date || '', getTenureCategory(r.joinDate, r.date), r.type || '',
      r.criticality || 'Non-Critical', r.regrettable === 'Yes' ? 'Regrettable' : 'Non-Regret', r.reason || '-', r.remarks || '-', r.backfillStatus || '', r.hiredDate || '-',
      r.backfillStatus === 'Hired' && r.hiredDate ? getTimeToFill(r.date, r.hiredDate) : '-'
    ]);
    const csvContent = [headers.join(','), ...csvData.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.setAttribute('download', `turnover_data_${filterYear}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const totalHiresYTD = processedHires.reduce((sum, h) => sum + Number(h.count || 0), 0);
  const currentReasonOptions = getReasonOptions(newResign.type);

  const today = new Date();
  const formattedToday = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

  if (!isLoaded) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 font-sans">กำลังโหลดระบบ...</div>;

  // --- หน้าจอ Login ---
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 font-sans p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
          <div className="flex justify-center mb-6">
            <img 
              src={COMPANY_LOGO_URL}
              alt="Company Logo" 
              className="h-16 w-auto object-contain mb-2"
              onError={(e) => {
                e.target.style.display = 'none';
                document.getElementById('login-fallback-icon').style.display = 'flex';
              }}
            />
            <div id="login-fallback-icon" className="p-4 bg-indigo-50 rounded-full" style={{ display: COMPANY_LOGO_URL.includes('วางลิงก์') ? 'flex' : 'none' }}>
              <Lock className="w-8 h-8 text-indigo-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">Recruitment Dashboard</h2>
          <p className="text-center text-gray-500 text-sm mb-8">กรุณาเข้าสู่ระบบเพื่อจัดการข้อมูลพนักงาน</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล (Email)</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" placeholder="hr@yourcompany.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน (Password)</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" placeholder="••••••••" />
            </div>
            {loginError && <p className="text-red-500 text-sm font-medium text-center">{loginError}</p>}
            <button type="submit" className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm transition-colors mt-4">
              เข้าสู่ระบบ
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans text-gray-800">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3">
            <img 
              src={COMPANY_LOGO_URL}
              alt="Company Logo" 
              className="h-10 md:h-12 w-auto object-contain"
              onError={(e) => {
                e.target.style.display = 'none';
                document.getElementById('header-fallback-icon').style.display = 'block';
              }}
            />
            <Users id="header-fallback-icon" className="h-7 w-7 md:h-8 md:w-8 text-indigo-600" style={{ display: COMPANY_LOGO_URL.includes('วางลิงก์') ? 'block' : 'none' }} />
            <span className="hidden md:inline border-l-2 border-gray-300 h-8 mx-2"></span>
            Recruitment Dashboard
          </h1>
          <p className="text-gray-500 mt-1 text-sm md:text-base">ติดตามอัตราการเข้า-ออกของพนักงาน และบริหารจัดการตำแหน่งว่าง</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button onClick={() => { setShowHireForm(!showHireForm); setShowResignForm(false); }} className="flex-1 md:flex-none flex justify-center items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 shadow-sm transition-colors">
            <UserPlus className="h-4 w-4 text-green-600" /> เพิ่มคนเข้า
          </button>
          <button onClick={() => { setShowResignForm(!showResignForm); setShowHireForm(false); }} className="flex-1 md:flex-none flex justify-center items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm transition-colors">
            <Plus className="h-4 w-4" /> เพิ่มคนออก
          </button>
          <button onClick={handleLogout} className="flex-none flex justify-center items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors" title="ออกจากระบบ">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Global Filters Section */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-8 flex flex-col md:flex-row items-center gap-4">
        <div className="flex items-center gap-2 text-gray-600 font-medium">
          <Filter className="w-5 h-5 text-indigo-500" />
          ตัวกรองข้อมูล:
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="p-2 border border-gray-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 min-w-[120px]">
            <option value="All">ทุกปี (All Years)</option>
            {availableYears.map(year => <option key={year} value={year}>ปี {year}</option>)}
          </select>
          <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className="p-2 border border-gray-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 min-w-[150px]">
            <option value="All">ทุกแผนก (All Depts)</option>
            {availableDepts.map(dept => <option key={dept} value={dept}>{dept}</option>)}
          </select>
        </div>
        {(filterYear !== 'All' || filterDept !== 'All') && (
          <div className="text-xs text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full font-medium ml-auto">
            กำลังแสดงข้อมูลตัวกรองที่เลือก
          </div>
        )}
      </div>

      {/* Forms */}
      {showResignForm && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-indigo-200 mb-8">
          <h3 className="text-lg font-semibold mb-4 text-gray-800 border-b pb-2">แบบฟอร์มบันทึกพนักงานลาออก</h3>
          <form onSubmit={handleAddResignation} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อ-นามสกุล</label>
                <input type="text" required value={newResign.name} onChange={e => setNewResign({...newResign, name: e.target.value})} className="w-full p-2 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="ระบุชื่อพนักงาน" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">วันที่เริ่มงาน (Join Date)</label>
                <input type="date" value={newResign.joinDate} onChange={e => setNewResign({...newResign, joinDate: e.target.value})} className="w-full p-2 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">วันที่ออก (Effective Date)</label>
                <input type="date" required value={newResign.date} onChange={e => setNewResign({...newResign, date: e.target.value})} className="w-full p-2 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">แผนก</label>
                <input type="text" value={newResign.department} onChange={e => setNewResign({...newResign, department: e.target.value})} className="w-full p-2 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="เช่น Sales" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ประเภท (Type)</label>
                <select 
                  value={newResign.type} 
                  onChange={e => {
                    const newType = e.target.value; const newOptions = getReasonOptions(newType);
                    setNewResign({...newResign, type: newType, reason: newOptions[0], customReason: ''});
                  }} 
                  className="w-full p-2 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  <option value="Voluntary">ลาออกเอง (Voluntary)</option>
                  <option value="Involuntary">ให้ออก (Involuntary)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ผลกระทบ (Regrettable)</label>
                <select value={newResign.regrettable} onChange={e => setNewResign({...newResign, regrettable: e.target.value})} className="w-full p-2 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                  <option value="Yes">ไม่อยากให้ออก (Yes)</option>
                  <option value="No">ออกได้ (No)</option>
                </select>
              </div>
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <label className="block text-xs font-medium text-gray-600">ระดับความสำคัญ (Criticality)</label>
                  <div className="group relative flex items-center">
                    <Info className="w-3.5 h-3.5 text-gray-400 cursor-help hover:text-indigo-500 transition-colors" />
                    {/* Tooltip อธิบาย Criteria ที่จะโผล่มาตอน Hover */}
                    <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 p-3 bg-gray-800 text-white rounded-lg shadow-xl z-50 pointer-events-none">
                      <p className="font-semibold text-xs mb-1 text-indigo-200 border-b border-gray-600 pb-1">เกณฑ์ตำแหน่ง Critical Role:</p>
                      <ul className="list-disc pl-4 space-y-1 text-[10px] leading-relaxed">
                        <li><span className="font-medium text-white">Revenue:</span> กระทบรายได้/เป้าหมายธุรกิจ</li>
                        <li><span className="font-medium text-white">Niche Skill:</span> ทักษะเฉพาะ หาคนแทนยาก</li>
                        <li><span className="font-medium text-white">Bottleneck:</span> งานส่วนอื่นสะดุดหากขาดตำแหน่งนี้</li>
                        <li><span className="font-medium text-white">Leadership:</span> ระดับบริหาร/ผู้นำทีม</li>
                      </ul>
                      {/* ลูกศรชี้ลง */}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
                    </div>
                  </div>
                </div>
                <select value={newResign.criticality} onChange={e => setNewResign({...newResign, criticality: e.target.value})} className="w-full p-2 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                  <option value="Non-Critical">Non-Critical Role</option>
                  <option value="Critical">🔥 Critical Role</option>
                </select>
              </div>
              <div className="lg:col-span-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">สถานะหาคนแทน</label>
                <select value={newResign.backfillStatus} onChange={e => setNewResign({...newResign, backfillStatus: e.target.value})} className="w-full p-2 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                  <option value="Open">เปิดรับ (Open)</option>
                  <option value="No Backfill">ยุบตำแหน่ง</option>
                  <option value="Hired">ได้คนแล้ว (Hired)</option>
                </select>
              </div>
              {newResign.backfillStatus === 'Hired' && (
                <div className="lg:col-span-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">วันที่ได้คน (Hired Date)</label>
                  <input type="date" value={newResign.hiredDate} onChange={e => setNewResign({...newResign, hiredDate: e.target.value})} className="w-full p-2 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
              )}
              <div className="lg:col-span-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">เหตุผลที่ออก (Reason)</label>
                <div className="flex gap-2">
                  <select value={newResign.reason} onChange={e => setNewResign({...newResign, reason: e.target.value})} className="w-1/2 p-2 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                    {currentReasonOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  {newResign.reason === 'อื่นๆ' && (
                    <input type="text" value={newResign.customReason} onChange={e => setNewResign({...newResign, customReason: e.target.value})} className="w-1/2 p-2 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="โปรดระบุเหตุผลอื่นๆ" />
                  )}
                </div>
              </div>
              <div className="lg:col-span-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">หมายเหตุ (สำหรับ HR)</label>
                <input type="text" value={newResign.remarks} onChange={e => setNewResign({...newResign, remarks: e.target.value})} className="w-full p-2 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-yellow-50" placeholder="บันทึกข้อมูลเพิ่มเติม (ไม่บังคับ)" />
              </div>
            </div>
            {addFormError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm font-medium rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> {addFormError}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => {setShowResignForm(false); setAddFormError('');}} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md">ปิดหน้าต่าง</button>
              <button type="submit" className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 shadow-sm">บันทึกคนออก</button>
            </div>
          </form>
        </div>
      )}

      {showHireForm && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-green-200 mb-8 flex flex-col xl:flex-row gap-8">
          <div className="flex-[1.8] border-b xl:border-b-0 xl:border-r border-gray-200 pb-6 xl:pb-0 xl:pr-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-800 border-b pb-2">อัปเดตข้อมูลพนักงานรับเข้าใหม่ (Add Hires)</h3>
            <form onSubmit={handleAddHire} className="flex flex-col gap-4">
              
              <div className="flex gap-4 p-3 bg-gray-50 rounded-lg border border-gray-100 mb-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">ปี (Year)</label>
                  <input type="number" required value={newHire.year} onChange={e => setNewHire({...newHire, year: e.target.value})} className="w-full p-2 border rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">เดือนที่รับเข้า (Month)</label>
                  <select value={newHire.month} onChange={e => setNewHire({...newHire, month: e.target.value})} className="w-full p-2 border rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500">
                    {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-end border-b pb-1">
                  <label className="block text-xs font-semibold text-gray-800">รายชื่อพนักงานที่รับเข้าในเดือนนี้</label>
                  <span className="text-[10px] text-gray-500">*หากเพิ่มทีละหลายคนโดยไม่ระบุชื่อ ให้ใส่เฉพาะจำนวนคน</span>
                </div>
                
                {hireEntries.map((entry, index) => (
                  <div key={index} className="flex flex-col gap-3 bg-gray-50 p-4 rounded-xl border border-gray-100 relative shadow-sm">
                    {/* ปุ่มลบรายการ (แสดงเมื่อมีมากกว่า 1 รายการ) */}
                    {hireEntries.length > 1 && (
                      <button type="button" onClick={() => handleRemoveHireRow(index)} className="absolute top-2 right-2 p-1.5 text-red-500 bg-white hover:bg-red-50 rounded-md transition-colors border border-red-100 shadow-sm z-10" title="ลบรายการนี้">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wider">ชื่อ-นามสกุล</label>
                        <input type="text" value={entry.name} onChange={e => handleHireEntryChange(index, 'name', e.target.value)} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white" placeholder="ระบุชื่อ (ถ้ามี)" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wider">ตำแหน่ง (Position)</label>
                        <input type="text" value={entry.position} onChange={e => handleHireEntryChange(index, 'position', e.target.value)} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white" placeholder="เช่น Sales Executive" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wider">แผนก (Department)</label>
                        <input type="text" value={entry.department} onChange={e => handleHireEntryChange(index, 'department', e.target.value)} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white" placeholder="เช่น Sales" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wider">บริษัท (Company)</label>
                        <select value={entry.company} onChange={e => handleHireEntryChange(index, 'company', e.target.value)} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-medium">
                          <option value="PCHI">PCHI</option>
                          <option value="MSS">MSS</option>
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wider">วันที่เริ่มงาน (Join Date)</label>
                        <input type="date" value={entry.joinDate} onChange={e => handleHireEntryChange(index, 'joinDate', e.target.value)} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-700" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wider">จำนวนพนักงาน (Count)</label>
                        <input type="number" min="1" required value={entry.count} onChange={e => handleHireEntryChange(index, 'count', e.target.value)} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-semibold text-green-700" title="จำนวนคน" />
                      </div>
                    </div>
                  </div>
                ))}
                
                <button type="button" onClick={handleAddHireRow} className="flex items-center justify-center gap-1 text-xs text-indigo-600 font-semibold hover:text-indigo-700 w-full mt-1 px-3 py-2.5 border border-dashed border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors bg-white">
                  <Plus className="w-4 h-4" /> เพิ่มรายชื่อพนักงานคนต่อไป
                </button>
              </div>

              <div className="flex gap-2 mt-2 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => setShowHireForm(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors">ปิดหน้าต่าง</button>
                <button type="submit" className="flex-1 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 shadow-sm transition-colors">บันทึกข้อมูลรับเข้า ({hireEntries.length} รายการ)</button>
              </div>
            </form>
          </div>

          <div className="flex-[1.2]">
            <h3 className="text-sm font-semibold mb-4 text-gray-800 bg-gray-100 p-2 rounded-md">ประวัติการเพิ่มข้อมูลรับเข้า (Manage)</h3>
            <div className="max-h-[500px] overflow-y-auto border border-gray-100 rounded-md">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0 shadow-sm z-10">
                  <tr>
                    <th className="p-2 border-b w-8"></th>
                    <th className="p-2 border-b">ข้อมูล / รายชื่อ</th>
                    <th className="p-2 border-b text-center">จำนวน</th>
                    <th className="p-2 border-b text-center w-24">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedHires.length > 0 ? (
                    groupedHires.map(group => {
                      const key = `${group.year}-${group.month}`;
                      const isExpanded = expandedHireGroups.has(key);
                      
                      return (
                        <React.Fragment key={key}>
                          {/* บรรทัดหลัก (เดือน/ปี) - คลิกเพื่อกาง/หุบ */}
                          <tr onClick={() => toggleHireGroup(key)} className="border-b bg-indigo-50/40 hover:bg-indigo-50 cursor-pointer group transition-colors">
                            <td className="p-2 text-center text-indigo-400 group-hover:text-indigo-600">
                              {isExpanded ? <ChevronUp className="w-4 h-4 inline-block" /> : <ChevronDown className="w-4 h-4 inline-block" />}
                            </td>
                            <td className="p-2 font-bold text-gray-800">{group.month} {group.year}</td>
                            <td className="p-2 text-green-700 font-bold text-center">+{group.totalCount}</td>
                            <td className="p-2 text-center">
                              <span className="text-[10px] bg-white border border-gray-200 text-gray-600 px-2 py-1 rounded-md shadow-sm whitespace-nowrap">
                                {group.entries.length} รายการ
                              </span>
                            </td>
                          </tr>
                          
                          {/* บรรทัดย่อย (รายชื่อพนักงาน) - แสดงเมื่อกางออกเท่านั้น */}
                          {isExpanded && group.entries.map((h, i) => (
                            editingHireId === h.id ? (
                              /* --- 🔴 โหมดแก้ไข (Edit Mode) --- */
                              <tr key={`edit-${h.id}`} className={`bg-indigo-50/30 ${i === group.entries.length - 1 ? 'border-b-2 border-gray-200' : 'border-b border-gray-100'}`}>
                                <td className="p-2 border-r border-gray-50"></td>
                                <td className="p-2 py-3 pl-4">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                                    <input type="text" placeholder="ชื่อ-นามสกุล" value={editHireFormData.name} onChange={e => setEditHireFormData({...editHireFormData, name: e.target.value})} className="w-full p-1.5 border border-gray-300 rounded text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
                                    <div className="flex gap-2">
                                      <select value={editHireFormData.company} onChange={e => setEditHireFormData({...editHireFormData, company: e.target.value})} className="w-1/3 p-1.5 border border-gray-300 rounded text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                                        <option value="PCHI">PCHI</option>
                                        <option value="MSS">MSS</option>
                                      </select>
                                      <input type="text" placeholder="ตำแหน่ง" value={editHireFormData.position} onChange={e => setEditHireFormData({...editHireFormData, position: e.target.value})} className="w-2/3 p-1.5 border border-gray-300 rounded text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
                                    </div>
                                    <input type="text" placeholder="แผนก" value={editHireFormData.department} onChange={e => setEditHireFormData({...editHireFormData, department: e.target.value})} className="w-full p-1.5 border border-gray-300 rounded text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
                                    <input type="date" title="วันที่เริ่มงาน" value={editHireFormData.joinDate} onChange={e => setEditHireFormData({...editHireFormData, joinDate: e.target.value})} className="w-full p-1.5 border border-gray-300 rounded text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-gray-600 bg-white" />
                                  </div>
                                  <div className="flex gap-2">
                                    <select value={editHireFormData.month} onChange={e => setEditHireFormData({...editHireFormData, month: e.target.value})} className="w-1/2 p-1.5 border border-gray-300 rounded text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                                      {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                    <input type="number" placeholder="ปี" value={editHireFormData.year} onChange={e => setEditHireFormData({...editHireFormData, year: e.target.value})} className="w-1/2 p-1.5 border border-gray-300 rounded text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
                                  </div>
                                </td>
                                <td className="p-2 align-top pt-4 text-center">
                                  <input type="number" min="1" value={editHireFormData.count} onChange={e => setEditHireFormData({...editHireFormData, count: e.target.value})} className="w-14 p-1.5 border border-gray-300 rounded text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-center font-bold text-green-700 mx-auto block bg-white" />
                                </td>
                                <td className="p-2 text-center align-top pt-3">
                                  <div className="flex justify-center gap-1.5">
                                    <button onClick={handleSaveHireEdit} className="p-1.5 bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors" title="บันทึก"><Save className="w-3.5 h-3.5" /></button>
                                    <button onClick={handleCancelHireEdit} className="p-1.5 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors" title="ยกเลิก"><X className="w-3.5 h-3.5" /></button>
                                  </div>
                                </td>
                              </tr>
                            ) : (
                              /* --- โหมดแสดงผลปกติ (Read Mode) --- */
                              <tr key={h.id} className={`bg-white hover:bg-gray-50 ${i === group.entries.length - 1 ? 'border-b-2 border-gray-200' : 'border-b border-gray-100'}`}>
                                <td className="p-2 border-r border-gray-50"></td>
                                <td className="p-2 py-3 pl-4">
                                  <div className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
                                    {h.name || <span className="text-gray-400 italic">ไม่ระบุชื่อ</span>}
                                    {h.company && (
                                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${h.company === 'MSS' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                        {h.company}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-gray-500 ml-3.5 mt-1 grid grid-cols-1 gap-0.5">
                                    <div><span className="font-medium">ต/น:</span> {h.position || '-'} | <span className="font-medium">แผนก:</span> {h.department || '-'}</div>
                                    {h.joinDate && <div><span className="font-medium">เริ่มงาน:</span> {h.joinDate}</div>}
                                  </div>
                                </td>
                                <td className="p-2 text-green-600 font-semibold text-center text-xs align-top pt-3">+{h.count}</td>
                                <td className="p-2 text-center align-top pt-2">
                                  {/* 🔴 เพิ่มปุ่ม Edit (ดินสอ) ข้างๆ ถังขยะ */}
                                  <div className="flex justify-center gap-1.5">
                                    <button onClick={() => handleEditHireClick(h)} className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors" title="แก้ไขข้อมูล">
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => setHireToDelete(h.id)} className="p-1.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-md transition-colors" title="ลบข้อมูล">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          ))}
                        </React.Fragment>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="4" className="p-4 text-center text-xs text-gray-400">ยังไม่มีประวัติการรับเข้า</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Metrics Dashboards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <p className="text-xs font-medium text-gray-500">Beginning HC (Jan 2026)</p>
            <Users className="h-4 w-4 text-gray-400" />
          </div>
          <div className="mt-2">
            <h2 className="text-2xl font-bold text-gray-900">{INITIAL_HEADCOUNT} <span className="text-sm font-normal text-gray-500">คน</span></h2>
            <p className="text-[10px] text-gray-600 mt-1 bg-gray-100 inline-block px-2 py-0.5 rounded-full">ฐานตั้งต้น (Jan 2026)</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <p className="text-xs font-medium text-gray-500">พนักงานรับเข้าสะสม (YTD In)</p>
            <UserPlus className="h-4 w-4 text-green-500" />
          </div>
          <div className="mt-2">
            <h2 className="text-2xl font-bold text-gray-900">+{totalHiresYTD} <span className="text-sm font-normal text-gray-500">คน</span></h2>
            <p className="text-[10px] text-green-700 mt-1 bg-green-50 inline-block px-2 py-0.5 rounded-full">รับเข้าตามตัวกรอง</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <p className="text-xs font-medium text-gray-500">พนักงานลาออก (YTD Out)</p>
            <UserMinus className="h-4 w-4 text-red-500" />
          </div>
          <div className="mt-2">
            <h2 className="text-2xl font-bold text-gray-900">-{dashboardData.ytd.totalOut} <span className="text-sm font-normal text-gray-500">คน</span></h2>
            <p className="text-[10px] text-red-700 mt-1 bg-red-50 inline-block px-2 py-0.5 rounded-full">ลาออกตามตัวกรอง</p>
          </div>
        </div>

        <div className="bg-indigo-50 rounded-xl p-4 shadow-sm border border-indigo-100 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-indigo-800">Ending HC (สุทธิ)</p>
              <p className="text-[10px] text-indigo-600 mt-0.5 font-medium">ณ วันนี้ {formattedToday}</p>
            </div>
            <CheckCircle className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="mt-2">
            <h2 className="text-2xl font-bold text-indigo-700">{dashboardData.ytd.endingHC} <span className="text-sm font-normal text-indigo-500">คน</span></h2>
            <p className="text-[10px] text-indigo-700 mt-1 bg-white/60 inline-block px-2 py-0.5 rounded-full font-medium">
              เริ่ม {INITIAL_HEADCOUNT} + เข้า {totalHiresYTD} - ออก {dashboardData.ytd.totalOut}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <p className="text-xs font-medium text-gray-500">Overall Turnover Rate</p>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2">
            <h2 className="text-2xl font-bold text-gray-900">{dashboardData.ytd.turnoverRate}%</h2>
            <p className="text-[10px] text-gray-500 mt-1">จากฐานพนักงานเฉลี่ย {dashboardData.ytd.averageHC} คน</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <p className="text-xs font-medium text-gray-500">Voluntary (ลาออกเอง)</p>
            <AlertCircle className="h-4 w-4 text-orange-500" />
          </div>
          <div className="mt-2">
            <h2 className="text-2xl font-bold text-gray-900">{dashboardData.ytd.voluntary} <span className="text-sm font-normal text-gray-500">คน</span></h2>
            <p className="text-[10px] text-orange-600 mt-1 bg-orange-50 inline-block px-2 py-0.5 rounded-full">
              {dashboardData.ytd.averageHC > 0 ? ((dashboardData.ytd.voluntary/dashboardData.ytd.averageHC)*100).toFixed(2) : 0}%
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <p className="text-xs font-medium text-gray-500">Involuntary (ให้ออก)</p>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </div>
          <div className="mt-2">
            <h2 className="text-2xl font-bold text-gray-900">{dashboardData.ytd.involuntary} <span className="text-sm font-normal text-gray-500">คน</span></h2>
            <p className="text-[10px] text-red-600 mt-1 bg-red-50 inline-block px-2 py-0.5 rounded-full">
               {dashboardData.ytd.averageHC > 0 ? ((dashboardData.ytd.involuntary/dashboardData.ytd.averageHC)*100).toFixed(2) : 0}%
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <p className="text-xs font-medium text-gray-500">Impact (ผลกระทบ)</p>
            <Briefcase className="h-4 w-4 text-yellow-500" />
          </div>
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-gray-900">{dashboardData.ytd.regrettable}</span>
              <span className="text-sm text-gray-400">/</span>
              <span className="text-lg font-bold text-gray-900">{dashboardData.ytd.nonRegrettable}</span>
            </div>
            <div className="flex gap-1 mt-1">
              <span className="text-[10px] text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full">เสียดาย: {dashboardData.ytd.regrettable}</span>
              <span className="text-[10px] text-green-700 bg-green-50 px-2 py-0.5 rounded-full">ออกได้: {dashboardData.ytd.nonRegrettable}</span>
            </div>
          </div>
        </div>

      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100 w-full">
          <h3 className="text-lg font-semibold mb-6 text-gray-800">แนวโน้ม Turnover Rate รายเดือน (%)</h3>
          <div style={{ width: '100%', height: 300, minHeight: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dashboardData.monthlyStats} margin={{ top: 25, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
                <RechartsTooltip content={<MonthlyTrendTooltip />} cursor={{ fill: 'transparent' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Line type="monotone" dataKey="turnoverRate" name="Overall %" stroke="#4F46E5" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }}>
                  <LabelList dataKey="turnoverRate" position="top" offset={10} formatter={(value) => `${value}%`} style={{ fontSize: '11px', fill: '#4F46E5', fontWeight: 'bold' }} />
                </Line>
                <Line type="monotone" dataKey="volRate" name="Voluntary %" stroke="#F97316" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="involRate" name="Involuntary %" stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 w-full">
          <h3 className="text-lg font-semibold mb-6 text-gray-800">จำนวนพนักงานรับเข้าต่อเดือน (Hires)</h3>
          <div style={{ width: '100%', height: 300, minHeight: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hiresStats} margin={{ top: 25, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} allowDecimals={false} />
                <RechartsTooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} formatter={(value) => [`${value} คน`, 'จำนวนรับเข้า']} />
                <Bar dataKey="count" name="จำนวนรับเข้า" radius={[4, 4, 0, 0]} fill="#10B981">
                  <LabelList dataKey="count" position="top" content={(props) => { const { x, y, width, value } = props; if (value === 0) return null; return <text x={x + width / 2} y={y - 8} fill="#10B981" textAnchor="middle" fontSize="11" fontWeight="600">+{value}</text>; }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 w-full">
          <h3 className="text-lg font-semibold mb-6 text-gray-800">จำนวนคนลาออกแยกตามแผนก</h3>
          <div style={{ width: '100%', height: 300, minHeight: 300 }}>
            {departmentStats.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departmentStats} margin={{ top: 25, right: 20, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="department" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} allowDecimals={false} />
                  <RechartsTooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} formatter={(value) => [`${value} คน`, 'จำนวนลาออก']} />
                  <Bar dataKey="count" name="จำนวนลาออก" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="count" position="top" content={(props) => { const { x, y, width, value, index } = props; const percent = departmentStats[index]?.percent; return <text x={x + width / 2} y={y - 8} fill="#6B7280" textAnchor="middle" fontSize="11" fontWeight="600">{value} คน ({percent}%)</text>; }} />
                    {departmentStats.map((entry, index) => ( 
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} /> 
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200"><p className="text-sm">ยังไม่มีข้อมูล</p></div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 w-full">
          <h3 className="text-lg font-semibold mb-6 text-gray-800">สัดส่วนเหตุผลการลาออก</h3>
          <div className="flex justify-center items-center w-full h-[300px]">
            {reasonStats.length > 0 ? (
              <div className="w-full max-w-[600px] h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 20, right: 30, left: 30, bottom: 20 }}>
                    <Pie data={reasonStats} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={5} dataKey="value" labelLine={true} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(1)}%)`} style={{ fontSize: '11px', fontWeight: '500' }}>
                      {reasonStats.map((entry, index) => ( 
                        <Cell key={`cell-${index}`} fill={entry.fill} stroke="#ffffff" strokeWidth={2} /> 
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Legend iconType="circle" layout="vertical" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200"><p className="text-sm">ยังไม่มีข้อมูล</p></div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 w-full relative">
          <div className="flex justify-between items-start mb-6">
            <h3 className="text-lg font-semibold text-gray-800">อายุงานก่อนลาออก (Tenure)</h3>
            <div className="bg-red-50 text-red-700 text-[10px] font-semibold px-2 py-1.5 rounded-md flex items-center gap-1.5 border border-red-100 shadow-sm" title="พนักงานที่ลาออกในช่วงปีแรก">
              <AlertCircle className="w-3.5 h-3.5" />
              Early Attrition (&lt; 1 ปี): <span className="text-sm">{tenureStats.find(t => t.tenure === '< 1 ปี')?.count || 0}</span> คน
            </div>
          </div>
          <div style={{ width: '100%', height: 280, minHeight: 280 }}>
            {tenureStats.some(s => s.count > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tenureStats} margin={{ top: 25, right: 20, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="tenure" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} allowDecimals={false} />
                  <RechartsTooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} formatter={(value) => [`${value} คน`, 'จำนวนลาออก']} />
                  <Bar dataKey="count" name="จำนวนลาออก" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="count" position="top" content={(props) => { const { x, y, width, value, index } = props; if (value === 0) return null; const percent = tenureStats[index]?.percent; return <text x={x + width / 2} y={y - 8} fill="#6B7280" textAnchor="middle" fontSize="11" fontWeight="600">{value} คน ({percent}%)</text>; }} />
                    {tenureStats.map((entry, index) => ( 
                      <Cell key={`cell-${index}`} fill={entry.fill} /> 
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200"><p className="text-sm">ยังไม่มีข้อมูลวันที่เริ่มงาน</p></div>
            )}
          </div>
        </div>

        {/* --- Recruitment & Backfill Overview Combo --- */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 w-full lg:col-span-2 flex flex-col md:flex-row gap-8 items-center">
          <div className="w-full md:w-1/2">
            <h3 className="text-lg font-semibold mb-2 text-gray-800">สรุปสถานะการหาคนแทน (Backfill)</h3>
            <div className="flex justify-center items-center w-full h-[250px]">
              {backfillStats.some(s => s.value > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <Pie data={backfillStats} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" labelLine={false} label={({ name, value }) => `${name}: ${value}`} style={{ fontSize: '11px', fontWeight: '600' }}>
                      {backfillStats.map((entry, index) => ( 
                        <Cell key={`cell-${index}`} fill={entry.fill} stroke="#ffffff" strokeWidth={2} /> 
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} formatter={(value) => [`${value} ตำแหน่ง`, 'จำนวน']} />
                    <Legend iconType="circle" layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200"><p className="text-sm">ยังไม่มีตำแหน่งว่าง</p></div>
              )}
            </div>
          </div>
          
          <div className="w-full md:w-1/2 flex flex-col justify-center gap-4 md:border-l border-gray-100 md:pl-8 pt-4 md:pt-0">
            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-5 rounded-xl border border-indigo-100 shadow-sm relative overflow-hidden">
              <div className="absolute -right-4 -bottom-4 opacity-10"><Clock className="w-24 h-24 text-indigo-500" /></div>
              <div className="flex justify-between items-start mb-2 relative z-10">
                <span className="text-sm font-semibold text-indigo-900">Average Time-to-Fill</span>
                <Clock className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="text-4xl font-black text-indigo-700 mt-1 relative z-10">
                {averageTimeToFill} <span className="text-lg font-bold text-indigo-500">วัน (Days)</span>
              </div>
              <p className="text-xs font-medium text-indigo-600/80 mt-2 relative z-10">ระยะเวลาเฉลี่ยในการหาพนักงานใหม่เข้าทดแทน</p>
            </div>
            
            <div className="bg-gradient-to-br from-orange-50 to-red-50 p-5 rounded-xl border border-red-100 shadow-sm relative overflow-hidden">
              <div className="absolute -right-4 -bottom-4 opacity-10"><Briefcase className="w-24 h-24 text-red-500" /></div>
              <div className="flex justify-between items-start mb-2 relative z-10">
                <span className="text-sm font-semibold text-red-900">Active Open Roles</span>
                <Briefcase className="w-5 h-5 text-red-600" />
              </div>
              <div className="text-4xl font-black text-red-700 mt-1 relative z-10">
                {backfillStats.find(s => s.name === 'Open')?.value || 0} <span className="text-lg font-bold text-red-500">ตำแหน่ง</span>
              </div>
              <p className="text-xs font-medium text-red-600/80 mt-2 relative z-10">จำนวนตำแหน่งว่างทั้งหมดที่กำลังรอการสรรหา</p>
            </div>
          </div>
        </div>

      </div>

      {/* Recruitment Action Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 md:p-6 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50/50">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-gray-500" />
            ตารางการจัดการหาคนแทน (Backfill Tracker)
          </h3>
          <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
            <div className="relative w-full md:w-auto">
              <Search className="h-4 w-4 absolute left-3 top-2.5 text-gray-400" />
              <input type="text" placeholder="ค้นหาชื่อ หรือ แผนก..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-full md:w-64" />
            </div>
            <button onClick={handleExportCSV} disabled={processedResignations.length === 0} className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Download className="h-4 w-4 text-gray-600" /> Export CSV
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1050px]">
            <thead>
              <tr className="bg-white text-xs uppercase text-gray-500 tracking-wider">
                <th className="p-4 font-medium border-b w-[15%]">ชื่อพนักงาน</th>
                <th className="p-4 font-medium border-b w-[10%]">แผนก</th>
                <th className="p-4 font-medium border-b w-[12%]">อายุงาน (Tenure)</th>
                <th className="p-4 font-medium border-b w-[18%]">ประเภท / Impact</th>
                <th className="p-4 font-medium border-b w-[20%]">เหตุผล</th>
                <th className="p-4 font-medium border-b text-center w-[15%]">สถานะการหาคนแทน</th>
                <th className="p-4 font-medium border-b text-center w-[10%]">จัดการ</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-gray-100">
              {paginatedResignations.map((person) => (
                editingId === person.id ? (
                  <tr key={person.id} className="bg-indigo-50/30">
                    <td className="p-3"><input type="text" className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 outline-none" value={editFormData.name} onChange={e => setEditFormData({...editFormData, name: e.target.value})} /></td>
                    <td className="p-3"><input type="text" className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 outline-none" value={editFormData.department} onChange={e => setEditFormData({...editFormData, department: e.target.value})} /></td>
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        <input type="date" title="เริ่มงาน" className="w-full p-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-indigo-500 outline-none" value={editFormData.joinDate} onChange={e => setEditFormData({...editFormData, joinDate: e.target.value})} />
                        <input type="date" title="ลาออก" className="w-full p-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-indigo-500 outline-none" value={editFormData.date} onChange={e => setEditFormData({...editFormData, date: e.target.value})} />
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col gap-2">
                        <select className="p-1.5 border border-gray-300 rounded text-xs bg-white focus:ring-2 focus:ring-indigo-500 outline-none" value={editFormData.type} onChange={e => { const newType = e.target.value; const newOpts = getReasonOptions(newType); setEditFormData({...editFormData, type: newType, dropdownReason: newOpts[0], customReason: ''}); }}>
                          <option value="Voluntary">Voluntary</option>
                          <option value="Involuntary">Involuntary</option>
                        </select>
                        <select className="p-1.5 border border-gray-300 rounded text-xs bg-white focus:ring-2 focus:ring-indigo-500 outline-none" value={editFormData.regrettable} onChange={e => setEditFormData({...editFormData, regrettable: e.target.value})}>
                          <option value="Yes">Regrettable</option>
                          <option value="No">Non-Regret</option>
                        </select>
                        <select className="p-1.5 border border-gray-300 rounded text-xs bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-medium" value={editFormData.criticality} onChange={e => setEditFormData({...editFormData, criticality: e.target.value})}>
                          <option value="Non-Critical">Non-Critical</option>
                          <option value="Critical">🔥 Critical</option>
                        </select>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        <select className="w-full p-1.5 border border-gray-300 rounded text-xs bg-white focus:ring-2 focus:ring-indigo-500 outline-none" value={editFormData.dropdownReason} onChange={e => setEditFormData({...editFormData, dropdownReason: e.target.value})}>
                          {getReasonOptions(editFormData.type).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                        {editFormData.dropdownReason === 'อื่นๆ' && <input type="text" className="w-full p-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="ระบุเหตุผล" value={editFormData.customReason} onChange={e => setEditFormData({...editFormData, customReason: e.target.value})} />}
                        <input type="text" className="w-full p-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-indigo-500 outline-none bg-yellow-50 mt-1" placeholder="หมายเหตุ (HR)" value={editFormData.remarks || ''} onChange={e => setEditFormData({...editFormData, remarks: e.target.value})} />
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex justify-center gap-2 relative">
                        <button onClick={handleSaveEdit} className="p-1.5 bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors" title="บันทึก"><Save className="w-4 h-4" /></button>
                        <button onClick={handleCancelEdit} className="p-1.5 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors" title="ยกเลิก"><X className="w-4 h-4" /></button>
                        {editFormError && (
                          <div className="absolute top-full mt-2 right-0 bg-red-600 text-white text-[10px] py-1 px-2 rounded shadow-lg whitespace-nowrap z-50 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> {editFormError}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                <tr key={person.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 font-medium text-gray-900">
                    <div className="flex flex-col items-start gap-1">
                      <div className="flex items-center gap-2">
                        {person.name}
                        {person.reason === 'แจ้งล่วงหน้า (Planned)' && <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-semibold">Planned</span>}
                      </div>
                      {person.criticality === 'Critical' && (
                        <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 mt-1">
                          <Star className="w-3 h-3 fill-current" /> Critical
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-gray-600">{person.department}</td>
                  <td className="p-4 text-gray-600"><div className="font-medium text-gray-800">ออก: {person.date}</div>{person.joinDate && <div className="text-[10px] text-gray-500">เริ่ม: {person.joinDate}</div>}{person.joinDate && person.date && <div className="text-[10px] font-bold text-indigo-600 mt-0.5">อายุงาน: {getTenureCategory(person.joinDate, person.date)}</div>}</td>
                  <td className="p-4"><div className="flex flex-col gap-1 items-start"><span className={`px-2 py-0.5 text-[10px] rounded-full uppercase font-medium ${person.type === 'Voluntary' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>{person.type}</span><span className={`px-2 py-0.5 text-[10px] rounded-full uppercase font-medium ${person.regrettable === 'Yes' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>{person.regrettable === 'Yes' ? 'Regrettable' : 'Non-Regret'}</span></div></td>
                  <td className="p-4 text-gray-600 max-w-xs"><div className="truncate font-medium text-gray-800" title={person.reason}>{person.reason || '-'}</div>{person.remarks && <div className="text-[10px] text-gray-500 mt-1 leading-tight line-clamp-2" title={person.remarks}>หมายเหตุ: {person.remarks}</div>}</td>
                  <td className="p-4 text-center">
                    <select value={person.backfillStatus} onChange={(e) => handleStatusChange(person, e.target.value)} className={`text-xs font-semibold rounded-md px-3 py-1.5 border-0 outline-none cursor-pointer w-full max-w-[130px] text-center ${person.backfillStatus === 'Open' ? 'bg-red-50 text-red-600 ring-1 ring-inset ring-red-500/20' : person.backfillStatus === 'In Progress' ? 'bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-500/20' : person.backfillStatus === 'No Backfill' ? 'bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-500/20' : 'bg-green-50 text-green-600 ring-1 ring-inset ring-green-500/20'}`}>
                      <option value="Open">เปิดรับ (Open)</option><option value="In Progress">กำลังหา (In Progress)</option><option value="Hired">ได้คนแล้ว (Hired)</option><option value="No Backfill">ยุบตำแหน่ง</option>
                    </select>
                    {person.backfillStatus === 'Hired' && person.hiredDate && <div className="text-[10px] text-green-700 mt-1 font-medium bg-green-50 rounded px-1 py-0.5 inline-block">ใช้เวลาหา: {getTimeToFill(person.date, person.hiredDate)} วัน</div>}
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex justify-center gap-2">
                      <button onClick={() => handleEditClick(person)} className="p-1.5 text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors" title="แก้ไขข้อมูล"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => setItemToDelete(person.id)} className="p-1.5 text-red-600 bg-red-50 rounded-md hover:bg-red-100 transition-colors" title="ลบข้อมูล"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
                )
              ))}
              {paginatedResignations.length === 0 && <tr><td colSpan="7" className="p-8 text-center text-gray-500">{searchTerm ? `ไม่พบข้อมูลพนักงานที่ตรงกับ "${searchTerm}"` : 'ไม่มีประวัติการลาออกในหมวดหมู่นี้'}</td></tr>}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-white">
            <span className="text-sm text-gray-500">
              กำลังแสดงหน้าที่ <span className="font-semibold text-gray-900">{currentPage}</span> จากทั้งหมด <span className="font-semibold text-gray-900">{totalPages}</span> หน้า (รวม {searchedResignations.length} รายการ)
            </span>
            <div className="flex gap-2">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                disabled={currentPage === 1}
                className="p-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                disabled={currentPage === totalPages}
                className="p-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pop-up Modal สำหรับยืนยันการลบข้อมูล (ลาออก) */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 animate-in fade-in">
          <div className="bg-white p-6 rounded-xl shadow-xl max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold mb-2 text-gray-900">ยืนยันการลบข้อมูล</h3>
            <p className="text-gray-600 text-sm mb-6">คุณต้องการลบรายการของพนักงานคนนี้ใช่หรือไม่? ข้อมูลทั้งหมดที่เกี่ยวข้องและกราฟจะถูกคำนวณใหม่ทันที</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setItemToDelete(null)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">ยกเลิก</button>
              <button onClick={confirmDelete} className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">ลบข้อมูล</button>
            </div>
          </div>
        </div>
      )}

      {/* 🔴 Pop-up Modal สำหรับยืนยันการลบข้อมูล (รับเข้า) */}
      {hireToDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 animate-in fade-in">
          <div className="bg-white p-6 rounded-xl shadow-xl max-w-sm w-full mx-4 border-t-4 border-red-500">
            <h3 className="text-lg font-bold mb-2 text-gray-900 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" /> ยืนยันการลบประวัติรับเข้า
            </h3>
            <p className="text-gray-600 text-sm mb-6">คุณต้องการลบประวัติการรับเข้าของพนักงานท่านนี้ใช่หรือไม่? ตัวเลขพนักงานรับเข้าสะสมจะถูกหักออกทันที</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setHireToDelete(null)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">ยกเลิก</button>
              <button onClick={confirmDeleteHire} className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm">ลบข้อมูล</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
