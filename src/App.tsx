import * as React from 'react';
import { useState, useEffect, FormEvent } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, setDoc, getDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { auth, db, signIn, logout } from './firebase';
import { cn } from './lib/utils';
import { 
  Calendar, 
  Music, 
  Users, 
  LayoutDashboard, 
  LogOut, 
  Plus, 
  Clock, 
  MapPin, 
  Search,
  CheckCircle2,
  Circle,
  MoreVertical,
  Guitar,
  Mic2,
  Drum,
  Piano,
  Music2,
  Megaphone,
  ShieldCheck,
  ExternalLink,
  Trash2,
  Terminal,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, isAfter, parseISO, isValid } from 'date-fns';
import { ko } from 'date-fns/locale';

// --- Types ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "알 수 없는 오류가 발생했습니다.";
      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error) errorMessage = `데이터베이스 오류: ${parsed.error}`;
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 bg-red-500/20 text-red-500 rounded-3xl flex items-center justify-center mb-6">
            <AlertTriangle size={40} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">문제가 발생했습니다</h2>
          <p className="text-zinc-500 mb-8 max-w-md">{errorMessage}</p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-white text-black font-bold px-8 py-3 rounded-2xl hover:bg-zinc-200 transition-all"
          >
            새로고침
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Types ---
type Tab = 'dashboard' | 'schedules' | 'setlist' | 'members' | 'admin';

interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  instrument?: string;
  role: 'admin' | 'member';
}

interface Schedule {
  id: string;
  title: string;
  description?: string;
  date: string;
  location?: string;
  type: 'practice' | 'performance' | 'meeting' | 'other';
  createdBy: string;
}

interface Song {
  id: string;
  title: string;
  artist: string;
  status: 'backlog' | 'practicing' | 'mastered';
  bpm?: number;
  key?: string;
  link?: string;
  notes?: string;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  link?: string;
  createdAt: any;
  createdBy: string;
}

// --- Utilities ---

const safeParseISO = (dateStr: string) => {
  if (!dateStr) return null;
  try {
    const date = parseISO(dateStr);
    return isValid(date) ? date : null;
  } catch (e) {
    return null;
  }
};

// --- Components ---

const Sidebar = ({ activeTab, setActiveTab, user, onEditProfile, onAdminClick }: { activeTab: Tab, setActiveTab: (tab: Tab) => void, user: UserProfile | null, onEditProfile: () => void, onAdminClick: () => void }) => {
  interface MenuItem {
    id: string;
    label: string;
    icon: any;
    onClick?: () => void;
  }

  const menuItems: MenuItem[] = [
    { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
    { id: 'schedules', label: '일정', icon: Calendar },
    { id: 'setlist', label: '셋리스트', icon: Music },
    { id: 'members', label: '멤버', icon: Users },
  ];

  if (user?.role === 'admin') {
    menuItems.push({ id: 'admin', label: 'ADMIN', icon: Terminal, onClick: onAdminClick });
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-64 bg-zinc-950 text-zinc-100 h-screen fixed left-0 top-0 flex-col border-r border-zinc-800 z-40">
        <div className="p-6">
          <h1 
            onClick={onAdminClick}
            className="text-2xl font-bold tracking-tighter flex items-center gap-3 italic cursor-pointer hover:text-red-500 transition-colors group"
          >
            RED BAND
          </h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={item.onClick ? item.onClick : () => setActiveTab(item.id as Tab)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 text-sm font-medium",
                activeTab === item.id 
                  ? "bg-red-600 text-white shadow-lg shadow-red-900/20" 
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              )}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-zinc-800">
          <div className="flex items-center gap-3 px-2 py-3 mb-4 group cursor-pointer hover:bg-zinc-900 rounded-xl transition-colors" onClick={onEditProfile}>
            <img src={user?.photoURL} alt="" className="w-10 h-10 rounded-full border border-zinc-700" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate group-hover:text-red-500 transition-colors">{user?.displayName}</p>
              <p className="text-xs text-zinc-500 truncate">{user?.instrument || '악기 설정하기'}</p>
            </div>
          </div>
          <button 
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-zinc-400 hover:text-red-400 transition-colors"
          >
            <LogOut size={16} />
            로그아웃
          </button>
        </div>
      </div>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-zinc-950/90 backdrop-blur-lg border-t border-zinc-800 px-6 py-3 flex justify-between items-center z-50 safe-area-inset-bottom">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={item.onClick ? item.onClick : () => setActiveTab(item.id as Tab)}
            className={cn(
              "flex flex-col items-center gap-1 transition-all duration-200",
              activeTab === item.id ? "text-red-500 scale-110" : "text-zinc-500"
            )}
          >
            <item.icon size={20} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">{item.label}</span>
          </button>
        ))}
      </div>

      {/* Mobile Top Bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-black/80 backdrop-blur-md border-b border-zinc-800 px-6 py-4 flex justify-between items-center z-40">
        <h1 
          onClick={onAdminClick}
          className="text-xl font-black tracking-tighter italic flex items-center gap-2 cursor-pointer"
        >
          RED BAND
        </h1>
        <button onClick={onEditProfile} className="relative active:scale-95 transition-transform">
          <img src={user?.photoURL} alt="" className="w-8 h-8 rounded-full border border-zinc-700" />
          {user?.role === 'admin' && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-600 rounded-full border-2 border-black" />
          )}
        </button>
      </div>
    </>
  );
};

const Dashboard = ({ schedules, songs, members, announcements }: { schedules: Schedule[], songs: Song[], members: UserProfile[], announcements: Announcement[] }) => {
  const upcomingSchedules = schedules
    .filter(s => {
      const date = safeParseISO(s.date);
      if (!date) return true; // Include non-standard dates as "upcoming"
      return isAfter(date, new Date());
    })
    .sort((a, b) => {
      const dateA = safeParseISO(a.date);
      const dateB = safeParseISO(b.date);
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateA.getTime() - dateB.getTime();
    })
    .slice(0, 3);

  const masteredSongs = songs.filter(s => s.status === 'mastered').length;
  const progress = songs.length > 0 ? (masteredSongs / songs.length) * 100 : 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h2 className="text-3xl font-bold tracking-tight">대시보드</h2>
        <p className="text-zinc-500 mt-1">밴드의 현재 상태를 한눈에 확인하세요.</p>
      </header>

      {/* Announcements Section */}
      {announcements.length > 0 && (
        <section className="bg-red-600/10 border border-red-600/20 rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Megaphone size={80} />
          </div>
          <div className="relative z-10">
            <h3 className="text-red-600 font-black text-xs uppercase tracking-widest mb-4 flex items-center gap-2">
              <Megaphone size={14} /> 중요 공지사항
            </h3>
            <div className="space-y-4">
              {announcements.slice(0, 2).map(ann => (
                <div key={ann.id} className="space-y-2">
                  <h4 className="text-lg font-bold text-white">{ann.title}</h4>
                  <p className="text-sm text-zinc-400 line-clamp-2">{ann.content}</p>
                  {ann.link && (
                    <a 
                      href={ann.link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600 hover:underline"
                    >
                      <ExternalLink size={12} /> 관련 링크 바로가기
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800">
          <p className="text-sm text-zinc-500 font-medium mb-1">다음 일정</p>
          <p className="text-2xl font-bold">{upcomingSchedules.length}개 예정</p>
        </div>
        <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800">
          <p className="text-sm text-zinc-500 font-medium mb-1">셋리스트 완성도</p>
          <div className="flex items-end gap-2">
            <p className="text-2xl font-bold">{Math.round(progress)}%</p>
            <p className="text-sm text-zinc-500 mb-1">({masteredSongs}/{songs.length})</p>
          </div>
          <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-3 overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className="bg-red-600 h-full"
            />
          </div>
        </div>
        <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800">
          <p className="text-sm text-zinc-500 font-medium mb-1">등록된 멤버</p>
          <p className="text-2xl font-bold">{members.length}명</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
          <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
            <h3 className="font-bold flex items-center gap-2">
              <Calendar size={18} className="text-red-600" />
              다가오는 일정
            </h3>
          </div>
          <div className="p-6 space-y-4">
            {upcomingSchedules.length > 0 ? upcomingSchedules.map(schedule => {
              const date = safeParseISO(schedule.date);
              return (
                <div key={schedule.id} className="flex gap-4 p-4 bg-zinc-950 rounded-xl border border-zinc-800">
                  <div className="flex flex-col items-center justify-center bg-red-600/10 text-red-600 w-14 h-14 rounded-lg font-bold">
                    {date ? (
                      <>
                        <span className="text-xs uppercase">{format(date, 'MMM', { locale: ko })}</span>
                        <span className="text-xl leading-none">{format(date, 'd')}</span>
                      </>
                    ) : (
                      <Calendar size={20} />
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold">{schedule.title}</h4>
                    <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
                      <span className="flex items-center gap-1">
                        <Clock size={12} /> 
                        {date ? format(date, 'HH:mm') : schedule.date || '시간 미정'}
                      </span>
                      {schedule.location && <span className="flex items-center gap-1"><MapPin size={12} /> {schedule.location}</span>}
                    </div>
                  </div>
                </div>
              );
            }) : (
              <p className="text-center py-8 text-zinc-500 text-sm italic">예정된 일정이 없습니다.</p>
            )}
          </div>
        </section>

        <section className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
          <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
            <h3 className="font-bold flex items-center gap-2">
              <Music size={18} className="text-red-600" />
              최근 연습 곡
            </h3>
          </div>
          <div className="p-6 space-y-3">
            {songs.slice(0, 5).map(song => (
              <div key={song.id} className="flex items-center justify-between p-3 hover:bg-zinc-800 rounded-xl transition-colors group">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    song.status === 'mastered' ? "bg-green-500" : song.status === 'practicing' ? "bg-red-600" : "bg-zinc-600"
                  )} />
                  <div>
                    <p className="font-medium text-sm">{song.title}</p>
                    <p className="text-xs text-zinc-500">{song.artist}</p>
                  </div>
                </div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">{song.status}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

const ScheduleList = ({ schedules, isAdmin }: { schedules: Schedule[], isAdmin: boolean }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newSchedule, setNewSchedule] = useState({ title: '', date: '', location: '', type: 'practice' as const });

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!newSchedule.title) return;
    
    try {
      await addDoc(collection(db, 'schedules'), {
        ...newSchedule,
        createdBy: auth.currentUser?.uid,
        createdAt: serverTimestamp()
      });
      setIsAdding(false);
      setNewSchedule({ title: '', date: '', location: '', type: 'practice' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'schedules');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 일정을 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(db, 'schedules', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `schedules/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">일정 관리</h2>
          <p className="text-zinc-500 mt-1">합주 및 공연 일정을 관리하세요.</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-red-900/20"
        >
          <Plus size={18} /> 일정 추가
        </button>
      </header>

      <div className="grid grid-cols-1 gap-4">
        {[...schedules].sort((a, b) => {
          const dateA = safeParseISO(a.date);
          const dateB = safeParseISO(b.date);
          if (!dateA && !dateB) return 0;
          if (!dateA) return 1;
          if (!dateB) return -1;
          return dateB.getTime() - dateA.getTime();
        }).map(schedule => {
          const date = safeParseISO(schedule.date);

          return (
            <div key={schedule.id} className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex flex-col items-center justify-center bg-zinc-950 border border-zinc-800 w-20 h-20 rounded-2xl font-bold shrink-0">
                {date ? (
                  <>
                    <span className="text-xs text-zinc-500 uppercase">{format(date, 'MMM', { locale: ko })}</span>
                    <span className="text-2xl text-red-600">{format(date, 'd')}</span>
                    <span className="text-[10px] text-zinc-600">{format(date, 'EEE', { locale: ko })}</span>
                  </>
                ) : (
                  <>
                    <Calendar size={24} className="text-zinc-700 mb-1" />
                    <span className="text-[10px] text-zinc-500 uppercase">미정</span>
                  </>
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn(
                    "text-[10px] uppercase font-black px-2 py-0.5 rounded border",
                    schedule.type === 'practice' ? "border-red-600/30 text-red-600 bg-red-600/5" :
                    schedule.type === 'performance' ? "border-red-500/30 text-red-500 bg-red-500/5" :
                    "border-zinc-700 text-zinc-500 bg-zinc-800"
                  )}>
                    {schedule.type}
                  </span>
                  <h3 className="text-lg font-bold">{schedule.title}</h3>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-500">
                  <span className="flex items-center gap-1.5">
                    <Clock size={14} className="text-zinc-600" /> 
                    {date ? format(date, 'HH:mm') : schedule.date || '시간 미정'}
                  </span>
                  {schedule.location && <span className="flex items-center gap-1.5"><MapPin size={14} className="text-zinc-600" /> {schedule.location}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(isAdmin || schedule.createdBy === auth.currentUser?.uid) && (
                  <button 
                    onClick={() => handleDelete(schedule.id)}
                    className="p-2 hover:bg-red-500/10 text-zinc-600 hover:text-red-500 rounded-lg transition-colors"
                  >
                    <LogOut size={16} className="rotate-180" />
                  </button>
                )}
                <button className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors">
                  <MoreVertical size={18} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-zinc-800">
                <h3 className="text-xl font-bold">새 일정 추가</h3>
              </div>
              <form onSubmit={handleAdd} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">제목</label>
                  <input 
                    type="text" 
                    required
                    value={newSchedule.title}
                    onChange={e => setNewSchedule({...newSchedule, title: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-600 transition-colors"
                    placeholder="정기 합주, 버스킹 등"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">일시 (선택)</label>
                    <input 
                      type="text" 
                      value={newSchedule.date}
                      onChange={e => setNewSchedule({...newSchedule, date: e.target.value})}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-600 transition-colors"
                      placeholder="2024-04-01 19:00 또는 자유 입력"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">유형</label>
                    <select 
                      value={newSchedule.type}
                      onChange={e => setNewSchedule({...newSchedule, type: e.target.value as any})}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-600 transition-colors"
                    >
                      <option value="practice">합주</option>
                      <option value="performance">공연</option>
                      <option value="meeting">회의</option>
                      <option value="other">기타</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">장소</label>
                  <input 
                    type="text" 
                    value={newSchedule.location}
                    onChange={e => setNewSchedule({...newSchedule, location: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-600 transition-colors"
                    placeholder="합주실 이름 등"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="flex-1 px-4 py-3 rounded-xl font-bold text-zinc-400 hover:bg-zinc-800 transition-colors"
                  >
                    취소
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-xl font-bold transition-all"
                  >
                    저장하기
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Setlist = ({ songs, isAdmin }: { songs: Song[], isAdmin: boolean }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [newSong, setNewSong] = useState({ 
    title: '', 
    artist: '', 
    status: 'backlog' as const, 
    link: '',
    bpm: undefined as number | undefined,
    key: '',
    notes: ''
  });

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!newSong.title || !newSong.artist) return;
    
    try {
      await addDoc(collection(db, 'songs'), {
        ...newSong,
        updatedAt: serverTimestamp()
      });
      setIsAdding(false);
      setNewSong({ title: '', artist: '', status: 'backlog', link: '', bpm: undefined, key: '', notes: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'songs');
    }
  };

  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingSong) return;
    
    try {
      const { id, ...data } = editingSong;
      await updateDoc(doc(db, 'songs', id), {
        ...data,
        updatedAt: serverTimestamp()
      });
      setEditingSong(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `songs/${editingSong.id}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    if (!window.confirm('이 곡을 셋리스트에서 삭제하시겠습니까?')) return;
    await deleteDoc(doc(db, 'songs', id));
  };

  const handleToggleStatus = async (song: Song) => {
    const nextStatus: Record<string, Song['status']> = {
      'backlog': 'practicing',
      'practicing': 'mastered',
      'mastered': 'backlog'
    };
    await updateDoc(doc(db, 'songs', song.id), {
      status: nextStatus[song.status],
      updatedAt: serverTimestamp()
    });
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">셋리스트</h2>
          <p className="text-zinc-500 mt-1">연습 중인 곡들의 진행 상황을 관리하세요.</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-red-900/20"
        >
          <Plus size={18} /> 곡 추가
        </button>
      </header>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        {/* Desktop Table */}
        <table className="w-full text-left hidden md:table">
          <thead>
            <tr className="border-b border-zinc-800 text-[10px] uppercase font-black text-zinc-500 tracking-widest">
              <th className="px-6 py-4">상태</th>
              <th className="px-6 py-4">제목 / 아티스트</th>
              <th className="px-6 py-4 hidden md:table-cell">악보</th>
              <th className="px-6 py-4 hidden md:table-cell text-right">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {songs.map(song => (
              <tr key={song.id} className="hover:bg-zinc-800/50 transition-colors group">
                <td className="px-6 py-4">
                  <button 
                    onClick={() => handleToggleStatus(song)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase transition-all hover:scale-105",
                      song.status === 'mastered' ? "bg-green-500/10 text-green-500 hover:bg-green-500/20" : 
                      song.status === 'practicing' ? "bg-red-600/10 text-red-600 hover:bg-red-600/20" : 
                      "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"
                    )}
                  >
                    {song.status === 'mastered' ? <CheckCircle2 size={10} /> : <Circle size={10} />}
                    {song.status}
                  </button>
                </td>
                <td className="px-6 py-4">
                  <div 
                    className="cursor-pointer group"
                    onClick={() => setEditingSong(song)}
                  >
                    <p className="font-bold text-sm group-hover:text-red-500 transition-colors">{song.title}</p>
                    <p className="text-xs text-zinc-500">{song.artist}</p>
                  </div>
                </td>
                <td className="px-6 py-4 hidden md:table-cell">
                  {song.link ? (
                    <a 
                      href={song.link} 
                      target="_blank" 
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-red-500 rounded-lg transition-all text-xs font-bold"
                      title="악보 보기"
                    >
                      <Music2 size={14} />
                      보기
                    </a>
                  ) : (
                    <button 
                      onClick={() => setEditingSong(song)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-600 hover:text-red-500 rounded-lg transition-all text-xs font-bold uppercase"
                    >
                      <Plus size={12} />
                      추가
                    </button>
                  )}
                </td>
                <td className="px-6 py-4 hidden md:table-cell text-right">
                  <div className="flex justify-end gap-2">
                    {isAdmin && (
                      <button 
                        onClick={() => handleDelete(song.id)}
                        className="p-2 text-zinc-600 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                    <button 
                      onClick={() => setEditingSong(song)}
                      className="p-2 text-zinc-600 hover:text-zinc-100 transition-colors"
                    >
                      <MoreVertical size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-zinc-800">
          {songs.map(song => (
            <div key={song.id} className="p-6 space-y-4">
              <div className="flex justify-between items-start gap-4">
                <div onClick={() => setEditingSong(song)} className="flex-1 min-w-0">
                  <h4 className="font-bold text-lg truncate active:text-red-500 transition-colors">{song.title}</h4>
                  <p className="text-sm text-zinc-500">{song.artist}</p>
                </div>
                <button 
                  onClick={() => handleToggleStatus(song)}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all",
                    song.status === 'mastered' ? "bg-green-500/10 text-green-500" : 
                    song.status === 'practicing' ? "bg-red-600/10 text-red-600" : 
                    "bg-zinc-800 text-zinc-500"
                  )}
                >
                  {song.status === 'mastered' ? <CheckCircle2 size={10} /> : <Circle size={10} />}
                  {song.status}
                </button>
              </div>
              <div className="flex items-center gap-3">
                {song.link ? (
                  <a 
                    href={song.link} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 py-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold"
                  >
                    <Music2 size={14} /> 악보 보기
                  </a>
                ) : (
                  <button 
                    onClick={() => setEditingSong(song)} 
                    className="flex-1 bg-zinc-800/50 text-zinc-600 py-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase"
                  >
                    <Plus size={12} /> 악보 추가
                  </button>
                )}
                {isAdmin && (
                  <button 
                    onClick={() => handleDelete(song.id)} 
                    className="p-3 bg-red-500/10 text-red-500 rounded-xl active:scale-95 transition-transform"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-zinc-800">
                <h3 className="text-xl font-bold">새 곡 추가</h3>
              </div>
              <form onSubmit={handleAdd} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">곡 제목</label>
                  <input 
                    type="text" 
                    required
                    value={newSong.title}
                    onChange={e => setNewSong({...newSong, title: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-600 transition-colors"
                    placeholder="곡 제목을 입력하세요"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">아티스트</label>
                  <input 
                    type="text" 
                    required
                    value={newSong.artist}
                    onChange={e => setNewSong({...newSong, artist: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-600 transition-colors"
                    placeholder="아티스트 이름을 입력하세요"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">악보 링크 (선택)</label>
                  <input 
                    type="url" 
                    value={newSong.link}
                    onChange={e => setNewSong({...newSong, link: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-600 transition-colors"
                    placeholder="https://..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">BPM (선택)</label>
                    <input 
                      type="number" 
                      value={newSong.bpm || ''}
                      onChange={e => setNewSong({...newSong, bpm: parseInt(e.target.value) || undefined})}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-600 transition-colors"
                      placeholder="120"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Key (선택)</label>
                    <input 
                      type="text" 
                      value={newSong.key}
                      onChange={e => setNewSong({...newSong, key: e.target.value})}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-600 transition-colors"
                      placeholder="Am, G, etc."
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">현재 상태</label>
                  <select 
                    value={newSong.status}
                    onChange={e => setNewSong({...newSong, status: e.target.value as any})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-600 transition-colors"
                  >
                    <option value="backlog">대기 중</option>
                    <option value="practicing">연습 중</option>
                    <option value="mastered">완료</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">메모 (선택)</label>
                  <textarea 
                    value={newSong.notes}
                    onChange={e => setNewSong({...newSong, notes: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-600 transition-colors min-h-[80px]"
                    placeholder="곡에 대한 메모를 입력하세요"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="flex-1 px-4 py-3 rounded-xl font-bold text-zinc-400 hover:bg-zinc-800 transition-colors"
                  >
                    취소
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-xl font-bold transition-all"
                  >
                    저장하기
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {editingSong && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
                <h3 className="text-xl font-bold">곡 정보 수정</h3>
                <button onClick={() => setEditingSong(null)} className="text-zinc-500 hover:text-white">
                  <Plus size={20} className="rotate-45" />
                </button>
              </div>
              <form onSubmit={handleUpdate} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">곡 제목</label>
                  <input 
                    type="text" 
                    required
                    value={editingSong.title}
                    onChange={e => setEditingSong({...editingSong, title: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-600 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">아티스트</label>
                  <input 
                    type="text" 
                    required
                    value={editingSong.artist}
                    onChange={e => setEditingSong({...editingSong, artist: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-600 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">악보 링크</label>
                  <input 
                    type="url" 
                    value={editingSong.link || ''}
                    onChange={e => setEditingSong({...editingSong, link: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-600 transition-colors"
                    placeholder="https://..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">BPM</label>
                    <input 
                      type="number" 
                      value={editingSong.bpm || ''}
                      onChange={e => setEditingSong({...editingSong, bpm: parseInt(e.target.value) || undefined})}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-600 transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Key</label>
                    <input 
                      type="text" 
                      value={editingSong.key || ''}
                      onChange={e => setEditingSong({...editingSong, key: e.target.value})}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-600 transition-colors"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">현재 상태</label>
                  <select 
                    value={editingSong.status}
                    onChange={e => setEditingSong({...editingSong, status: e.target.value as any})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-600 transition-colors"
                  >
                    <option value="backlog">대기 중</option>
                    <option value="practicing">연습 중</option>
                    <option value="mastered">완료</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">메모</label>
                  <textarea 
                    value={editingSong.notes || ''}
                    onChange={e => setEditingSong({...editingSong, notes: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-600 transition-colors min-h-[80px]"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setEditingSong(null)}
                    className="flex-1 px-4 py-3 rounded-xl font-bold text-zinc-400 hover:bg-zinc-800 transition-colors"
                  >
                    취소
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-xl font-bold transition-all"
                  >
                    수정 완료
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const MemberList = ({ members }: { members: UserProfile[] }) => {
  const getInstrumentIcon = (instrument?: string) => {
    switch (instrument?.toLowerCase()) {
      case 'guitar': case '기타': return <Guitar size={20} />;
      case 'vocal': case '보컬': return <Mic2 size={20} />;
      case 'drum': case '드럼': return <Drum size={20} />;
      case 'piano': case 'keyboard': case '키보드': return <Piano size={20} />;
      default: return <Music size={20} />;
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-bold tracking-tight">멤버</h2>
        <p className="text-zinc-500 mt-1">밴드 멤버들의 정보를 확인하세요.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {members.map(member => (
          <div key={member.uid} className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl flex items-center gap-4 hover:border-red-600/50 transition-colors group">
            <div className="relative">
              <img src={member.photoURL} alt="" className="w-16 h-16 rounded-2xl border border-zinc-800 object-cover" />
              <div className="absolute -bottom-2 -right-2 bg-red-600 text-white p-1.5 rounded-lg shadow-lg">
                {getInstrumentIcon(member.instrument)}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold truncate">{member.displayName}</h3>
                {member.role === 'admin' && (
                  <span className="text-[8px] font-black uppercase bg-red-600/10 text-red-500 px-1.5 py-0.5 rounded border border-red-600/20">ADMIN</span>
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">{member.instrument || '악기 미지정'}</p>
              <p className="text-[10px] text-zinc-600 mt-2 truncate">{member.email}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Main App ---

const AdminServer = ({ members, announcements, onExit }: { members: UserProfile[], announcements: Announcement[], onExit: () => void }) => {
  const [isAddingAnn, setIsAddingAnn] = useState(false);
  const [newAnn, setNewAnn] = useState({ title: '', content: '', link: '' });

  const handleAddAnn = async (e: FormEvent) => {
    e.preventDefault();
    if (!newAnn.title || !newAnn.content) return;
    
    await addDoc(collection(db, 'announcements'), {
      ...newAnn,
      createdBy: auth.currentUser?.uid,
      createdAt: serverTimestamp()
    });
    setIsAddingAnn(false);
    setNewAnn({ title: '', content: '', link: '' });
  };

  const handleDeleteAnn = async (id: string) => {
    if (!window.confirm('이 공지를 삭제하시겠습니까?')) return;
    await deleteDoc(doc(db, 'announcements', id));
  };

  const handlePromote = async (uid: string) => {
    if (!window.confirm('이 멤버를 관리자로 승격하시겠습니까?')) return;
    await updateDoc(doc(db, 'users', uid), { role: 'admin' });
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-mono p-6 md:p-8 space-y-8 animate-in fade-in duration-700 pb-24 md:pb-8">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-zinc-800 pb-8 gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-red-500">
            <ShieldCheck size={24} />
            <h2 className="text-sm font-bold tracking-[0.3em] uppercase">System Administrator</h2>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter italic">ADMIN SERVER <span className="text-zinc-800">v2.0</span></h1>
          <div className="flex flex-wrap items-center gap-4 text-[10px] text-zinc-500 uppercase tracking-widest">
            <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Server Online</span>
            <span>Region: Asia-Northeast1</span>
            <span>Auth: Verified</span>
          </div>
        </div>
        <button 
          onClick={onExit}
          className="w-full lg:w-auto px-6 py-3 rounded-none border border-zinc-800 text-xs font-bold hover:bg-white hover:text-black transition-all uppercase tracking-widest"
        >
          Go to Dashboard
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 space-y-8">
          <section className="border border-zinc-800 bg-zinc-950/50 p-6 md:p-8 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-red-600" />
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-lg font-bold flex items-center gap-3 italic">
                <Megaphone size={20} className="text-red-500" />
                BROADCAST CONTROL
              </h3>
              <button 
                onClick={() => setIsAddingAnn(true)}
                className="text-[10px] font-bold border border-red-600 text-red-500 px-4 py-2 hover:bg-red-600 hover:text-white transition-all uppercase tracking-widest"
              >
                New Broadcast
              </button>
            </div>
            
            <div className="space-y-4">
              {announcements.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-zinc-800 text-zinc-600 text-xs uppercase tracking-widest">
                  No active broadcasts found in database
                </div>
              ) : (
                announcements.map(ann => (
                  <div key={ann.id} className="border border-zinc-800 p-6 flex justify-between items-start group/item hover:border-zinc-600 transition-colors">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] bg-zinc-900 px-2 py-0.5 text-zinc-500 border border-zinc-800">ID: {ann.id.slice(0,8)}</span>
                        <h4 className="font-bold text-white uppercase tracking-tight">{ann.title}</h4>
                      </div>
                      <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl">{ann.content}</p>
                    </div>
                    <button 
                      onClick={() => handleDeleteAnn(ann.id)}
                      className="p-2 text-zinc-800 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="border border-zinc-800 p-8 space-y-4">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-[0.2em]">Server Stats</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] text-zinc-600 uppercase">Total Members</p>
                  <p className="text-2xl font-bold">{members.length}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-zinc-600 uppercase">Announcements</p>
                  <p className="text-2xl font-bold">{announcements.length}</p>
                </div>
              </div>
            </div>
            <div className="border border-zinc-800 p-8 space-y-4">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-[0.2em]">Security Status</h3>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                <p className="text-sm font-bold uppercase tracking-widest">Firewall Active</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <section className="border border-zinc-800 bg-zinc-950/50 p-6 relative">
            <div className="absolute top-0 right-0 w-1 h-full bg-zinc-700" />
            <h3 className="text-sm font-bold mb-6 flex items-center gap-3 italic uppercase tracking-widest">
              <Users size={18} className="text-zinc-500" />
              User Registry
            </h3>
            <div className="space-y-3">
              {members.filter(m => m.role !== 'admin').map(member => (
                <div key={member.uid} className="flex items-center justify-between p-3 border border-zinc-900 hover:border-zinc-700 transition-all group">
                  <div className="flex items-center gap-3">
                    <img src={member.photoURL} className="w-8 h-8 rounded-none border border-zinc-800 grayscale group-hover:grayscale-0 transition-all" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">{member.displayName}</p>
                      <p className="text-[9px] text-zinc-600 uppercase tracking-tighter">{member.instrument || 'NO_DATA'}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handlePromote(member.uid)}
                    className="text-[9px] font-bold text-zinc-700 hover:text-red-500 transition-colors uppercase tracking-widest border border-zinc-900 px-2 py-1"
                  >
                    Promote
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <AnimatePresence>
        {isAddingAnn && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-black border border-zinc-800 w-full max-w-xl p-8 space-y-8"
            >
              <h3 className="text-2xl font-black italic tracking-tighter uppercase">Initialize Broadcast</h3>
              <form onSubmit={handleAddAnn} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Subject</label>
                  <input 
                    type="text" 
                    required
                    value={newAnn.title}
                    onChange={e => setNewAnn({...newAnn, title: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-none px-4 py-4 text-sm font-mono focus:outline-none focus:border-red-600 transition-colors"
                    placeholder="BROADCAST_TITLE"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Payload</label>
                  <textarea 
                    required
                    rows={6}
                    value={newAnn.content}
                    onChange={e => setNewAnn({...newAnn, content: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-none px-4 py-4 text-sm font-mono focus:outline-none focus:border-red-600 transition-colors resize-none"
                    placeholder="BROADCAST_CONTENT_DATA..."
                  />
                </div>
                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsAddingAnn(false)}
                    className="flex-1 px-4 py-4 border border-zinc-800 font-bold text-zinc-500 hover:bg-zinc-900 transition-colors uppercase tracking-widest text-xs"
                  >
                    Abort
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-red-600 text-white px-4 py-4 font-bold hover:bg-red-700 transition-all uppercase tracking-widest text-xs"
                  >
                    Execute
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [user, loading] = useAuthState(auth);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [tempInstrument, setTempInstrument] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [isAdminPasswordModalOpen, setIsAdminPasswordModalOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Sync user profile
    const syncProfile = async () => {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        const isAdmin = user.email === 'woosinkim201313@gmail.com';
        const newProfile: UserProfile = {
          uid: user.uid,
          displayName: isAdmin ? (user.displayName || '김우신') : (user.displayName || 'Anonymous'),
          email: user.email || '',
          photoURL: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
          role: isAdmin ? 'admin' : 'member'
        };
        await setDoc(userRef, newProfile);
        setUserProfile(newProfile);
        if (isAdmin) {
          setIsProfileModalOpen(false);
        } else {
          setIsProfileModalOpen(true);
        }
      } else {
        const data = userSnap.data() as UserProfile;
        setUserProfile(data);
        if (data.role !== 'admin' && !data.instrument) {
          setIsProfileModalOpen(true);
        }
      }
    };
    syncProfile();

    // Listen to data
    const qSchedules = query(collection(db, 'schedules'), orderBy('date', 'asc'));
    const unsubSchedules = onSnapshot(qSchedules, (snap) => {
      setSchedules(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Schedule)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'schedules');
    });

    const qSongs = query(collection(db, 'songs'), orderBy('updatedAt', 'desc'));
    const unsubSongs = onSnapshot(qSongs, (snap) => {
      setSongs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Song)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'songs');
    });

    const qMembers = query(collection(db, 'users'));
    const unsubMembers = onSnapshot(qMembers, (snap) => {
      setMembers(snap.docs.map(doc => doc.data() as UserProfile));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    const qAnnouncements = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    const unsubAnnouncements = onSnapshot(qAnnouncements, (snap) => {
      setAnnouncements(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Announcement)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'announcements');
    });

    return () => {
      unsubSchedules();
      unsubSongs();
      unsubMembers();
      unsubAnnouncements();
    };
  }, [user]);

  const handleUpdateInstrument = async () => {
    if (!user || !tempInstrument) return;
    await updateDoc(doc(db, 'users', user.uid), {
      instrument: tempInstrument
    });
    setUserProfile(prev => prev ? { ...prev, instrument: tempInstrument } : null);
    setIsProfileModalOpen(false);
  };

  const handleSignIn = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await signIn();
    } catch (error: any) {
      console.error("Sign in error:", error);
      if (error.code === 'auth/cancelled-popup-request') {
        setAuthError("로그인 요청이 이미 진행 중이거나 취소되었습니다.");
      } else if (error.code === 'auth/popup-closed-by-user') {
        setAuthError("로그인 창이 닫혔습니다.");
      } else {
        setAuthError("로그인 중 오류가 발생했습니다.");
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleAdminTabClick = () => {
    setIsAdminPasswordModalOpen(true);
  };

  const handleAdminPasswordSubmit = (e: FormEvent) => {
    e.preventDefault();
    // In a real app, this would be checked against a hashed value in Firestore or a Cloud Function.
    // For this app, we'll use a simple band-specific secret key.
    if (adminPassword === '510504') {
      setIsAdminUnlocked(true);
      setActiveTab('admin');
      setIsAdminPasswordModalOpen(false);
      setAdminPassword('');
    } else {
      alert('비밀번호가 틀렸습니다.');
    }
  };

  const handleAdminExit = () => {
    setIsAdminUnlocked(false);
    setActiveTab('dashboard');
  };

  if (loading) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full space-y-8"
        >
          <div className="space-y-2">
            <h1 className="text-4xl font-black tracking-tighter text-white pt-4 uppercase">RED BAND</h1>
            <p className="text-zinc-500">밴드부의 모든 것을 한곳에서 관리하세요.</p>
          </div>

          <div className="bg-zinc-900 p-6 md:p-8 rounded-[2.5rem] border border-zinc-800 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-6">시작하기</h2>
            <button 
              onClick={handleSignIn}
              disabled={isSigningIn}
              className="w-full bg-white hover:bg-zinc-200 text-black font-bold py-4 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50"
            >
              {isSigningIn ? (
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                <img src="https://www.google.com/favicon.ico" alt="" className="w-5 h-5" />
              )}
              {isSigningIn ? '로그인 중...' : 'Google로 로그인'}
            </button>
            {authError && (
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-red-500 text-[10px] mt-4 font-bold uppercase tracking-wider"
              >
                {authError}
              </motion.p>
            )}
            <p className="text-[10px] text-zinc-600 mt-6 uppercase tracking-widest">
              By continuing, you agree to our terms of service
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  if (activeTab === 'admin' && isAdminUnlocked) {
    return (
      <AdminServer 
        members={members} 
        announcements={announcements} 
        onExit={() => {
          if (userProfile?.role !== 'admin') {
            setIsAdminUnlocked(false);
          }
          setActiveTab('dashboard');
        }} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        user={userProfile} 
        onEditProfile={() => setIsProfileModalOpen(true)} 
        onAdminClick={handleAdminTabClick}
      />
      
      <main className="md:ml-64 p-6 md:p-10 max-w-6xl mx-auto min-h-screen pt-24 md:pt-10 pb-24 md:pb-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'dashboard' && <Dashboard schedules={schedules} songs={songs} members={members} announcements={announcements} />}
            {activeTab === 'schedules' && <ScheduleList schedules={schedules} isAdmin={userProfile?.role === 'admin'} />}
            {activeTab === 'setlist' && <Setlist songs={songs} isAdmin={userProfile?.role === 'admin'} />}
            {activeTab === 'members' && <MemberList members={members} />}
          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {isAdminPasswordModalOpen && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-[2.5rem] p-6 md:p-8 shadow-2xl text-center"
            >
              <div className="w-20 h-20 bg-red-500/20 text-red-500 rounded-3xl mx-auto flex items-center justify-center mb-6">
                <ShieldCheck size={40} />
              </div>
              <h3 className="text-2xl font-bold mb-2">관리자 인증</h3>
              <p className="text-zinc-500 text-sm mb-8">관리자 센터에 접속하려면 비밀번호를 입력하세요.</p>
              
              <form onSubmit={handleAdminPasswordSubmit} className="space-y-4">
                <input 
                  type="password"
                  required
                  autoFocus
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-6 py-4 text-center text-xl tracking-[1em] focus:outline-none focus:border-red-600 transition-colors"
                  placeholder="••••"
                />
                <div className="flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsAdminPasswordModalOpen(false)}
                    className="flex-1 px-4 py-4 rounded-2xl font-bold text-zinc-400 hover:bg-zinc-800 transition-colors"
                  >
                    취소
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-white text-black font-bold py-4 rounded-2xl transition-all active:scale-95"
                  >
                    인증하기
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {isProfileModalOpen && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-[2.5rem] p-6 md:p-8 shadow-2xl text-center"
            >
              <div className="relative w-24 h-24 mx-auto mb-6 group">
                <img 
                  src={userProfile?.photoURL} 
                  alt="" 
                  className={cn(
                    "w-full h-full rounded-3xl object-cover border-2 border-zinc-800 transition-all",
                    userProfile?.role === 'admin' && "cursor-pointer hover:border-red-600 active:scale-95"
                  )}
                  onClick={() => {
                    if (userProfile?.role === 'admin') {
                      setIsProfileModalOpen(false);
                      setIsAdminPasswordModalOpen(true);
                    }
                  }}
                />
                {userProfile?.role === 'admin' && (
                  <div className="absolute -top-2 -right-2 bg-red-600 text-white p-1.5 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                    <ShieldCheck size={14} />
                  </div>
                )}
              </div>
              <h3 className="text-2xl font-bold mb-2">프로필 설정</h3>
              <p className="text-zinc-500 text-sm mb-8">밴드에서 담당하고 있는 악기를 선택해주세요.</p>
              
              <div className="grid grid-cols-2 gap-3 mb-8">
                {['보컬', '기타', '베이스', '드럼', '키보드', '기타 세션'].map(inst => (
                  <button
                    key={inst}
                    onClick={() => setTempInstrument(inst)}
                    className={cn(
                      "py-3 rounded-2xl border text-sm font-bold transition-all",
                      tempInstrument === inst 
                        ? "bg-red-600 border-red-600 text-white" 
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    )}
                  >
                    {inst}
                  </button>
                ))}
              </div>

              <button 
                onClick={handleUpdateInstrument}
                disabled={!tempInstrument}
                className="w-full bg-white text-black font-bold py-4 rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
              >
                완료하기
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
