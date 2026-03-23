import React, { useState, useMemo, useEffect } from 'react';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LabelList 
} from 'recharts';
import { 
  Users, UserMinus, AlertCircle, CheckCircle, TrendingUp, Plus, UserPlus, Briefcase, Search,
  Edit2, Trash2, Save, X
} from 'lucide-react';

// --- โหลด Tailwind CSS อัตโนมัติ (แก้ไขปัญหา Plain Text บน CodeSandbox) ---
if (typeof window !== 'undefined' && !document.getElementById('tailwind-script')) {
  const script = document.createElement('script');
  script.id = 'tailwind-script';
  script.src = 'https://cdn.tailwindcss.com';
  document.head.appendChild(script);
}

// --- ตั้งค่า Firebase Cloud Storage ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

// ใช้ Config จากโปรเจกต์ Firebase ของคุณเอง
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
// ตั้งชื่อ Collection หลักสำหรับเก็บข้อมูลบริษัท
const companyDataId = 'company_data';

// --- ข้อมูลเริ่มต้น ---
const INITIAL_HEADCOUNT = 153; 
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];
const REASON_OPTIONS = [
  "ได้งานใหม่ / ค่าตอบแทนดีกว่า",
  "กลับต่างจังหวัด / ภูมิลำเนา",
  "เปลี่ยนสายงาน",
  "ศึกษาต่อ",
  "ปัญหาสุขภาพ",
  "ดูแลครอบครัว",
  "เกษียณอายุ",
  "ไม่ผ่านทดลองงาน",
  "อื่นๆ"
];

const initialResignState = { name: '', department: '', date: '', type: 'Voluntary', regrettable: 'Yes', reason: REASON_OPTIONS[0], customReason: '', backfillStatus: 'Open' };

export default function RecruitmentDashboard() {
  const [user, setUser] = useState(null);
  const [resignations, setResignations] = useState([]);
  const [hires, setHires] = useState([]);
  
  const [showResignForm, setShowResignForm] = useState(false);
  const [newResign, setNewResign] = useState(initialResignState);

  const [showHireForm, setShowHireForm] = useState(false);
  const [newHire, setNewHire] = useState({ month: 'Jan', count: 1 });

  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [itemToDelete, setItemToDelete] = useState(null);
  
  // สเตทสำหรับเช็คว่าโหลด CSS เสร็จหรือยัง
  const [isLoaded, setIsLoaded] = useState(false);

  // --- 1. จัดการการ Login (ยืนยันตัวตนก่อนดึงข้อมูล) ---
  useEffect(() => {
    // หน่วงเวลาเล็กน้อยให้หน้าเว็บพร้อมทำงาน
    const timer = setTimeout(() => setIsLoaded(true), 500);

    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            await signInWithCustomToken(auth, __initial_auth_token);
          } catch (err) {
            await signInAnonymously(auth);
          }
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth error:", error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  // --- 2. โหลดข้อมูลจาก Cloud (เปลี่ยนเป็น "โฟลเดอร์ส่วนกลาง" Public Data) ---
  useEffect(() => {
    if (!user) return; // ต้องมี User ก่อนถึงจะดึงข้อมูลได้
    
    // ดึงข้อมูลคนลาออกจาก Public Data
    const resignationsRef = collection(db, companyDataId, 'public', 'resignations');
    const unsubResignations = onSnapshot(resignationsRef, (snapshot) => {
      const data = [];
      snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
      setResignations(data);
    }, (error) => console.error("Error fetching resignations: ", error));

    // ดึงข้อมูลคนเข้ารับจาก Public Data
    const hiresRef = collection(db, companyDataId, 'public', 'hires');
    const unsubHires = onSnapshot(hiresRef, (snapshot) => {
      const data = [];
      snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
      setHires(data);
    }, (error) => console.error("Error fetching hires: ", error));

    return () => {
      unsubResignations();
      unsubHires();
    };
  }, [user]);

  // --- Logic การคำนวณตามสูตร ---
  const dashboardData = useMemo(() => {
    let currentHC = INITIAL_HEADCOUNT;
    let ytdTotalOut = 0;
    let ytdVoluntary = 0;
    let ytdInvoluntary = 0;
    let ytdRegrettable = 0;
    let ytdNonRegrettable = 0;

    const monthlyStats = MONTHS.map(month => {
      const monthIndex = MONTHS.indexOf(month);
      
      const ins = hires.filter(h => h.month === month).reduce((sum, h) => sum + Number(h.count || 0), 0);
      
      const outsThisMonth = resignations.filter(r => {
        if (!r.date) return false;
        const rMonth = new Date(r.date).getMonth();
        return rMonth === monthIndex;
      });

      const totalOut = outsThisMonth.length;
      const vol = outsThisMonth.filter(r => r.type === 'Voluntary').length;
      const invol = outsThisMonth.filter(r => r.type === 'Involuntary').length;
      const reg = outsThisMonth.filter(r => r.regrettable === 'Yes').length;
      const nonReg = outsThisMonth.filter(r => r.regrettable === 'No').length;

      ytdTotalOut += totalOut;
      ytdVoluntary += vol;
      ytdInvoluntary += invol;
      ytdRegrettable += reg;
      ytdNonRegrettable += nonReg;

      const beginning = currentHC;
      const ending = beginning + ins - totalOut;
      const average = (beginning + ending) / 2;

      currentHC = ending;

      return {
        month,
        beginning,
        ins,
        totalOut,
        ending,
        average,
        vol,
        invol,
        reg,
        nonReg,
        turnoverRate: average > 0 ? Number(((totalOut / average) * 100).toFixed(2)) : 0,
        volRate: average > 0 ? Number(((vol / average) * 100).toFixed(2)) : 0,
        involRate: average > 0 ? Number(((invol / average) * 100).toFixed(2)) : 0,
      };
    });

    const ytdAverageHC = (INITIAL_HEADCOUNT + currentHC) / 2;

    return {
      monthlyStats,
      ytd: {
        endingHC: currentHC,
        averageHC: ytdAverageHC,
        totalOut: ytdTotalOut,
        turnoverRate: ytdAverageHC > 0 ? ((ytdTotalOut / ytdAverageHC) * 100).toFixed(2) : 0,
        voluntary: ytdVoluntary,
        involuntary: ytdInvoluntary,
        regrettable: ytdRegrettable,
        nonRegrettable: ytdNonRegrettable
      }
    };
  }, [resignations, hires]);

  const hiresStats = useMemo(() => {
    return MONTHS.map(month => {
      const count = hires.filter(h => h.month === month).reduce((sum, h) => sum + Number(h.count || 0), 0);
      return { month, count };
    });
  }, [hires]);

  const reasonStats = useMemo(() => {
    const counts = {};
    resignations.forEach(r => {
      const reasonKey = r.reason || 'ไม่ระบุเหตุผล';
      counts[reasonKey] = (counts[reasonKey] || 0) + 1;
    });
    return Object.keys(counts).map((key, index) => ({ 
      name: key, 
      value: counts[key],
      fill: COLORS[index % COLORS.length]
    }));
  }, [resignations]);

  const departmentStats = useMemo(() => {
    const counts = {};
    let totalOut = 0;
    resignations.forEach(r => {
      const deptKey = r.department || 'ไม่ระบุแผนก';
      counts[deptKey] = (counts[deptKey] || 0) + 1;
      totalOut++;
    });
    return Object.keys(counts)
      .map(key => ({ 
        department: key, 
        count: counts[key],
        percent: totalOut > 0 ? ((counts[key] / totalOut) * 100).toFixed(1) : 0
      }))
      .sort((a, b) => b.count - a.count);
  }, [resignations]);

  // --- 3. ฟังก์ชันบันทึกข้อมูล (เซฟลง Public Data) ---
  const handleAddResignation = async (e) => {
    e.preventDefault();
    if (!user || !newResign.name || !newResign.date) return;
    try {
      const finalReason = newResign.reason === 'อื่นๆ' ? newResign.customReason : newResign.reason;
      const resignDataToSave = { ...newResign, reason: finalReason };
      delete resignDataToSave.customReason;

      const resignationsRef = collection(db, companyDataId, 'public', 'resignations');
      await addDoc(resignationsRef, resignDataToSave);
      setShowResignForm(false);
      setNewResign(initialResignState);
    } catch (error) {
      console.error("Error adding document: ", error);
    }
  };

  const handleAddHire = async (e) => {
    e.preventDefault();
    if (!user) return;
    try {
      const hiresRef = collection(db, companyDataId, 'public', 'hires');
      await addDoc(hiresRef, newHire);
      setShowHireForm(false);
    } catch (error) {
      console.error("Error adding document: ", error);
    }
  };

  const updateBackfillStatus = async (id, newStatus) => {
    if (!user) return;
    try {
      const docRef = doc(db, companyDataId, 'public', 'resignations', id);
      await updateDoc(docRef, { backfillStatus: newStatus });
    } catch (error) {
      console.error("Error updating document: ", error);
    }
  };

  const handleEditClick = (person) => {
    setEditingId(person.id);
    const isPredefined = REASON_OPTIONS.includes(person.reason);
    setEditFormData({
      ...person,
      dropdownReason: isPredefined ? person.reason : 'อื่นๆ',
      customReason: isPredefined ? '' : (person.reason || '')
    });
  };

  const handleSaveEdit = async () => {
    if (!user || !editingId) return;
    try {
      const finalReason = editFormData.dropdownReason === 'อื่นๆ' ? editFormData.customReason : editFormData.dropdownReason;
      const { id, dropdownReason, customReason, ...updateData } = editFormData;
      updateData.reason = finalReason;

      const docRef = doc(db, companyDataId, 'public', 'resignations', editingId);
      await updateDoc(docRef, updateData);
      setEditingId(null);
    } catch (error) {
      console.error("Error updating document: ", error);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditFormData({});
  };

  const confirmDelete = async () => {
    if (!user || !itemToDelete) return;
    try {
      const docRef = doc(db, companyDataId, 'public', 'resignations', itemToDelete);
      await deleteDoc(docRef);
      setItemToDelete(null);
    } catch (error) {
      console.error("Error deleting document: ", error);
    }
  };

  const totalHiresYTD = hires.reduce((sum, h) => sum + Number(h.count || 0), 0);

  // ป้องกันกราฟพังระหว่างรอ CSS โหลด
  if (!isLoaded) {
    return <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif' }}>กำลังโหลดหน้าแดชบอร์ด...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans text-gray-800">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-7 w-7 md:h-8 md:w-8 text-indigo-600" />
            Recruitment & Turnover Dashboard
          </h1>
          <p className="text-gray-500 mt-1 text-sm md:text-base">ติดตามอัตราการเข้า-ออกของพนักงาน และบริหารจัดการตำแหน่งว่าง</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button 
            onClick={() => setShowHireForm(!showHireForm)}
            className="flex-1 md:flex-none flex justify-center items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 shadow-sm transition-colors"
          >
            <UserPlus className="h-4 w-4 text-green-600" />
            เพิ่มคนเข้า (In)
          </button>
          <button 
            onClick={() => setShowResignForm(!showResignForm)}
            className="flex-1 md:flex-none flex justify-center items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm transition-colors"
          >
            <Plus className="h-4 w-4" />
            เพิ่มคนออก (Out)
          </button>
        </div>
      </div>

      {/* Forms */}
      {showResignForm && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
          <h3 className="text-lg font-semibold mb-4 text-gray-800 border-b pb-2">แบบฟอร์มบันทึกพนักงานลาออก</h3>
          <form onSubmit={handleAddResignation} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">ชื่อ-นามสกุล</label>
                <input type="text" required value={newResign.name} onChange={e => setNewResign({...newResign, name: e.target.value})} className="w-full p-2 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="ระบุชื่อพนักงาน" />
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
                <select value={newResign.type} onChange={e => setNewResign({...newResign, type: e.target.value})} className="w-full p-2 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
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
              <div className="lg:col-span-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">เหตุผลที่ออก (Reason)</label>
                <div className="flex gap-2">
                  <select value={newResign.reason} onChange={e => setNewResign({...newResign, reason: e.target.value})} className="w-1/2 p-2 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                    {REASON_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  {newResign.reason === 'อื่นๆ' && (
                    <input type="text" value={newResign.customReason} onChange={e => setNewResign({...newResign, customReason: e.target.value})} className="w-1/2 p-2 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="โปรดระบุเหตุผลอื่นๆ" />
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowResignForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md">ยกเลิก</button>
              <button type="submit" className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 shadow-sm">บันทึกข้อมูล</button>
            </div>
          </form>
        </div>
      )}

      {showHireForm && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
          <h3 className="text-lg font-semibold mb-4 text-gray-800 border-b pb-2">อัปเดตจำนวนรับเข้า</h3>
          <form onSubmit={handleAddHire} className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">เดือน</label>
              <select value={newHire.month} onChange={e => setNewHire({...newHire, month: e.target.value})} className="w-32 p-2 border rounded-md text-sm bg-white">
                {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">จำนวนรับเข้า (คน)</label>
              <input type="number" min="1" required value={newHire.count} onChange={e => setNewHire({...newHire, count: e.target.value})} className="w-24 p-2 border rounded-md text-sm outline-none" />
            </div>
            <button type="submit" className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 shadow-sm">บันทึกพนักงานใหม่</button>
            <button type="button" onClick={() => setShowHireForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md">ยกเลิก</button>
          </form>
        </div>
      )}

      {/* Metrics Dashboards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        
        {/* แถวที่ 1: ติดตามการไหลของจำนวนพนักงาน (Headcount Flow) */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <p className="text-xs font-medium text-gray-500">Beginning HC (Jan 2026)</p>
            <Users className="h-4 w-4 text-gray-400" />
          </div>
          <div className="mt-2">
            <h2 className="text-2xl font-bold text-gray-900">{INITIAL_HEADCOUNT} <span className="text-sm font-normal text-gray-500">คน</span></h2>
            <p className="text-[10px] text-gray-600 mt-1 bg-gray-100 inline-block px-2 py-0.5 rounded-full">พนักงานตั้งต้นเมื่อเริ่มปี</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <p className="text-xs font-medium text-gray-500">พนักงานรับเข้าสะสม (YTD In)</p>
            <UserPlus className="h-4 w-4 text-green-500" />
          </div>
          <div className="mt-2">
            <h2 className="text-2xl font-bold text-gray-900">+{totalHiresYTD} <span className="text-sm font-normal text-gray-500">คน</span></h2>
            <p className="text-[10px] text-green-700 mt-1 bg-green-50 inline-block px-2 py-0.5 rounded-full">รับเข้าตั้งแต่ต้นปี</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <p className="text-xs font-medium text-gray-500">พนักงานลาออก (YTD Out)</p>
            <UserMinus className="h-4 w-4 text-red-500" />
          </div>
          <div className="mt-2">
            <h2 className="text-2xl font-bold text-gray-900">-{dashboardData.ytd.totalOut} <span className="text-sm font-normal text-gray-500">คน</span></h2>
            <p className="text-[10px] text-red-700 mt-1 bg-red-50 inline-block px-2 py-0.5 rounded-full">ลาออกตั้งแต่ต้นปี</p>
          </div>
        </div>

        <div className="bg-indigo-50 rounded-xl p-4 shadow-sm border border-indigo-100 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <p className="text-xs font-semibold text-indigo-800">Ending HC (พนักงานสุทธิ)</p>
            <CheckCircle className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="mt-2">
            <h2 className="text-2xl font-bold text-indigo-700">{dashboardData.ytd.endingHC} <span className="text-sm font-normal text-indigo-500">คน</span></h2>
            <p className="text-[10px] text-indigo-700 mt-1 bg-white/60 inline-block px-2 py-0.5 rounded-full font-medium">
              เริ่ม {INITIAL_HEADCOUNT} + เข้า {totalHiresYTD} - ออก {dashboardData.ytd.totalOut}
            </p>
          </div>
        </div>

        {/* แถวที่ 2: วิเคราะห์อัตราการลาออก (Turnover Analysis) */}
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

      {/* Charts Section - ใส่ style height กันกราฟพัง */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100 w-full">
          <h3 className="text-lg font-semibold mb-6 text-gray-800">แนวโน้ม Turnover Rate รายเดือน (%)</h3>
          <div style={{ width: '100%', height: 300, minHeight: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dashboardData.monthlyStats} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
                <RechartsTooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value, name) => [`${value}%`, name === 'turnoverRate' ? 'Overall Rate' : name]}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Line type="monotone" dataKey="turnoverRate" name="Overall %" stroke="#4F46E5" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
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
                <RechartsTooltip 
                  cursor={{ fill: '#F3F4F6' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value) => [`${value} คน`, 'จำนวนรับเข้า']}
                />
                <Bar dataKey="count" name="จำนวนรับเข้า" radius={[4, 4, 0, 0]} fill="#10B981">
                  <LabelList 
                    dataKey="count" 
                    position="top" 
                    content={(props) => {
                      const { x, y, width, value } = props;
                      if (value === 0) return null;
                      return (
                        <text x={x + width / 2} y={y - 8} fill="#10B981" textAnchor="middle" fontSize="11" fontWeight="600">
                          +{value}
                        </text>
                      );
                    }} 
                  />
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
                  <RechartsTooltip 
                    cursor={{ fill: '#F3F4F6' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value) => [`${value} คน`, 'จำนวนลาออก']}
                  />
                  <Bar dataKey="count" name="จำนวนลาออก" radius={[4, 4, 0, 0]}>
                    <LabelList 
                      dataKey="count" 
                      position="top" 
                      content={(props) => {
                        const { x, y, width, value, index } = props;
                        const percent = departmentStats[index]?.percent;
                        return (
                          <text x={x + width / 2} y={y - 8} fill="#6B7280" textAnchor="middle" fontSize="11" fontWeight="600">
                            {value} คน ({percent}%)
                          </text>
                        );
                      }} 
                    />
                    {departmentStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                <p className="text-sm">ยังไม่มีข้อมูล</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 w-full lg:col-span-2">
          <h3 className="text-lg font-semibold mb-6 text-gray-800">สัดส่วนเหตุผลการลาออก</h3>
          <div className="flex justify-center items-center w-full h-[300px]">
            {reasonStats.length > 0 ? (
              <div className="w-full max-w-[600px] h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 20, right: 30, left: 30, bottom: 20 }}>
                    <Pie
                      data={reasonStats}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={5}
                      dataKey="value"
                      labelLine={true}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(1)}%)`}
                      style={{ fontSize: '11px', fontWeight: '500' }}
                    >
                      {reasonStats.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Legend iconType="circle" layout="vertical" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                <p className="text-sm">ยังไม่มีข้อมูลการลาออก</p>
              </div>
            )}
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
          <div className="relative w-full md:w-auto">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-gray-400" />
            <input type="text" placeholder="ค้นหาพนักงาน..." className="pl-9 pr-4 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-full md:w-64" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-white text-xs uppercase text-gray-500 tracking-wider">
                <th className="p-4 font-medium border-b">ชื่อพนักงาน</th>
                <th className="p-4 font-medium border-b">แผนก</th>
                <th className="p-4 font-medium border-b">วันที่ลาออก</th>
                <th className="p-4 font-medium border-b">ประเภท / Impact</th>
                <th className="p-4 font-medium border-b">เหตุผล</th>
                <th className="p-4 font-medium border-b text-center">สถานะการหาคนแทน</th>
                <th className="p-4 font-medium border-b text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-gray-100">
              {resignations.slice().reverse().map((person) => (
                editingId === person.id ? (
                  <tr key={person.id} className="bg-indigo-50/30">
                    <td className="p-3"><input type="text" className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 outline-none" value={editFormData.name} onChange={e => setEditFormData({...editFormData, name: e.target.value})} /></td>
                    <td className="p-3"><input type="text" className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 outline-none" value={editFormData.department} onChange={e => setEditFormData({...editFormData, department: e.target.value})} /></td>
                    <td className="p-3"><input type="date" className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 outline-none" value={editFormData.date} onChange={e => setEditFormData({...editFormData, date: e.target.value})} /></td>
                    <td className="p-3">
                      <div className="flex flex-col gap-2">
                        <select className="p-1.5 border border-gray-300 rounded text-xs bg-white focus:ring-2 focus:ring-indigo-500 outline-none" value={editFormData.type} onChange={e => setEditFormData({...editFormData, type: e.target.value})}>
                          <option value="Voluntary">Voluntary</option>
                          <option value="Involuntary">Involuntary</option>
                        </select>
                        <select className="p-1.5 border border-gray-300 rounded text-xs bg-white focus:ring-2 focus:ring-indigo-500 outline-none" value={editFormData.regrettable} onChange={e => setEditFormData({...editFormData, regrettable: e.target.value})}>
                          <option value="Yes">Regrettable</option>
                          <option value="No">Non-Regret</option>
                        </select>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        <select className="w-full p-1.5 border border-gray-300 rounded text-xs bg-white focus:ring-2 focus:ring-indigo-500 outline-none" value={editFormData.dropdownReason} onChange={e => setEditFormData({...editFormData, dropdownReason: e.target.value})}>
                          {REASON_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                        {editFormData.dropdownReason === 'อื่นๆ' && (
                          <input type="text" className="w-full p-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="ระบุเหตุผล" value={editFormData.customReason} onChange={e => setEditFormData({...editFormData, customReason: e.target.value})} />
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <select value={editFormData.backfillStatus} onChange={e => setEditFormData({...editFormData, backfillStatus: e.target.value})} className="text-xs font-semibold rounded-md px-3 py-2 border border-gray-300 outline-none w-32 text-center bg-white focus:ring-2 focus:ring-indigo-500">
                        <option value="Open">เปิดรับ (Open)</option>
                        <option value="In Progress">กำลังหา (In Progress)</option>
                        <option value="Hired">ได้คนแล้ว (Hired)</option>
                        <option value="No Backfill">ยุบตำแหน่ง</option>
                      </select>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex justify-center gap-2">
                        <button onClick={handleSaveEdit} className="p-1.5 bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors" title="บันทึก"><Save className="w-4 h-4" /></button>
                        <button onClick={handleCancelEdit} className="p-1.5 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors" title="ยกเลิก"><X className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ) : (
                <tr key={person.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      {person.name}
                      {person.reason === 'แจ้งล่วงหน้า (Planned)' && <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-semibold">Planned</span>}
                    </div>
                  </td>
                  <td className="p-4 text-gray-600">{person.department}</td>
                  <td className="p-4 text-gray-600">{person.date}</td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1 items-start">
                      <span className={`px-2 py-0.5 text-[10px] rounded-full uppercase font-medium ${person.type === 'Voluntary' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                        {person.type}
                      </span>
                      <span className={`px-2 py-0.5 text-[10px] rounded-full uppercase font-medium ${person.regrettable === 'Yes' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                        {person.regrettable === 'Yes' ? 'Regrettable' : 'Non-Regret'}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 text-gray-600 truncate max-w-[150px]" title={person.reason}>{person.reason || '-'}</td>
                  <td className="p-4 text-center">
                    <select 
                      value={person.backfillStatus}
                      onChange={(e) => updateBackfillStatus(person.id, e.target.value)}
                      className={`text-xs font-semibold rounded-md px-3 py-1.5 border-0 outline-none cursor-pointer w-32 text-center
                        ${person.backfillStatus === 'Open' ? 'bg-red-50 text-red-600 ring-1 ring-inset ring-red-500/20' : 
                          person.backfillStatus === 'In Progress' ? 'bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-500/20' : 
                          'bg-green-50 text-green-600 ring-1 ring-inset ring-green-500/20'}`}
                    >
                      <option value="Open">เปิดรับ (Open)</option>
                      <option value="In Progress">กำลังหา (In Progress)</option>
                      <option value="Hired">ได้คนแล้ว (Hired)</option>
                      <option value="No Backfill">ยุบตำแหน่ง</option>
                    </select>
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
              {resignations.length === 0 && (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-gray-500">ไม่มีประวัติการลาออก</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pop-up Modal สำหรับยืนยันการลบ */}
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

    </div>
  );
}
