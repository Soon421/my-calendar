import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Bell, Tag, Clock, Calendar, Check, Trash2, Edit2, Download, BellRing } from 'lucide-react';

const defaultCategories = [
  { id: 1, name: '업무', color: '#3B82F6' },
  { id: 2, name: '개인', color: '#10B981' },
  { id: 3, name: '중요', color: '#EF4444' },
  { id: 4, name: '약속', color: '#F59E0B' },
];

const reminderOptions = [
  { id: 'day', label: '하루 전', minutes: 1440 },
  { id: '5hours', label: '5시간 전', minutes: 300 },
  { id: '1hour', label: '1시간 전', minutes: 60 },
  { id: '10min', label: '10분 전', minutes: 10 },
];

// localStorage 헬퍼 함수
const storage = {
  get: (key, defaultValue) => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Storage error:', e);
    }
  }
};

export default function App() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [events, setEvents] = useState(() => storage.get('calendar-events', []));
  const [categories, setCategories] = useState(() => storage.get('calendar-categories', defaultCategories));
  const [showEventModal, setShowEventModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notificationPermission, setNotificationPermission] = useState('default');
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [sentReminders, setSentReminders] = useState(() => storage.get('sent-reminders', []));
  
  const today = new Date();
  
  const [newEvent, setNewEvent] = useState({
    title: '',
    date: '',
    time: '',
    categoryId: 1,
    reminders: ['1hour'],
    description: ''
  });
  
  const [newCategory, setNewCategory] = useState({
    name: '',
    color: '#6366F1'
  });

  // localStorage에 저장
  useEffect(() => {
    storage.set('calendar-events', events);
  }, [events]);

  useEffect(() => {
    storage.set('calendar-categories', categories);
  }, [categories]);

  useEffect(() => {
    storage.set('sent-reminders', sentReminders);
  }, [sentReminders]);

  // 알림 권한 확인
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  // PWA 설치 프롬프트 처리
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // 알림 권한 요청
  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      return permission === 'granted';
    }
    return false;
  };

  // 시스템 알림 보내기
  const sendSystemNotification = useCallback((title, body, tag) => {
    if (notificationPermission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/favicon.svg',
          badge: '/favicon.svg',
          tag,
          vibrate: [200, 100, 200],
          requireInteraction: true
        });
      } catch (e) {
        console.log('Notification error:', e);
      }
    }
  }, [notificationPermission]);

  // 알림 체크 - 매 분마다 실행
  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      
      events.forEach(event => {
        if (!event.time || !event.date) return;
        
        const eventTime = new Date(`${event.date}T${event.time}`);
        if (isNaN(eventTime.getTime())) return;
        
        event.reminders.forEach(reminderId => {
          const reminder = reminderOptions.find(r => r.id === reminderId);
          if (!reminder) return;
          
          const reminderTime = new Date(eventTime.getTime() - reminder.minutes * 60000);
          const reminderKey = `${event.id}-${reminderId}`;
          
          // 알림 시간이 되었고, 아직 보내지 않았으면
          const diffMinutes = (reminderTime - now) / 60000;
          if (diffMinutes <= 0 && diffMinutes > -1 && !sentReminders.includes(reminderKey)) {
            const category = categories.find(c => c.id === event.categoryId);
            
            // 인앱 알림
            setNotifications(prev => [...prev, {
              id: Date.now(),
              eventId: event.id,
              reminderId,
              title: event.title,
              message: `${reminder.label} - ${event.title}`,
              color: category?.color || '#6366F1',
              time: now
            }]);
            
            // 시스템 알림
            sendSystemNotification(
              `📅 ${event.title}`,
              `${reminder.label}에 일정이 있습니다!\n${event.date} ${event.time}`,
              reminderKey
            );
            
            // 보낸 알림 기록
            setSentReminders(prev => [...prev, reminderKey]);
          }
        });
      });
    };

    checkReminders();
    const interval = setInterval(checkReminders, 60000); // 1분마다 체크
    return () => clearInterval(interval);
  }, [events, categories, sentReminders, sendSystemNotification]);

  // 앱 설치
  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBanner(false);
    }
    setDeferredPrompt(null);
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    return { daysInMonth, startingDay };
  };

  const { daysInMonth, startingDay } = getDaysInMonth(currentDate);

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const formatDate = (day) => {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    return `${year}-${month}-${dayStr}`;
  };

  const formatTodayDate = () => {
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const dayStr = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${dayStr}`;
  };

  const getEventsForDate = (day) => {
    const dateStr = formatDate(day);
    return events.filter(e => e.date === dateStr);
  };

  const handleDateClick = (day) => {
    const dateStr = formatDate(day);
    setSelectedDate(dateStr);
    setNewEvent(prev => ({ ...prev, date: dateStr }));
  };

  const handleAddEvent = () => {
    if (!newEvent.title || !newEvent.date || !newEvent.time) return;
    
    if (editingEvent) {
      setEvents(prev => prev.map(e => 
        e.id === editingEvent.id ? { ...newEvent, id: editingEvent.id } : e
      ));
      setEditingEvent(null);
    } else {
      setEvents(prev => [...prev, { ...newEvent, id: Date.now() }]);
    }
    
    setNewEvent({
      title: '',
      date: selectedDate || '',
      time: '',
      categoryId: 1,
      reminders: ['1hour'],
      description: ''
    });
    setShowEventModal(false);
  };

  const handleEditEvent = (event) => {
    setEditingEvent(event);
    setNewEvent(event);
    setShowEventModal(true);
  };

  const handleDeleteEvent = (eventId) => {
    setEvents(prev => prev.filter(e => e.id !== eventId));
  };

  const handleAddCategory = () => {
    if (!newCategory.name) return;
    setCategories(prev => [...prev, { ...newCategory, id: Date.now() }]);
    setNewCategory({ name: '', color: '#6366F1' });
    setShowCategoryModal(false);
  };

  const handleDeleteCategory = (categoryId) => {
    if (categories.length <= 1) return;
    setCategories(prev => prev.filter(c => c.id !== categoryId));
    setEvents(prev => prev.map(e => 
      e.categoryId === categoryId ? { ...e, categoryId: categories[0].id } : e
    ));
  };

  const toggleReminder = (reminderId) => {
    setNewEvent(prev => ({
      ...prev,
      reminders: prev.reminders.includes(reminderId)
        ? prev.reminders.filter(r => r !== reminderId)
        : [...prev.reminders, reminderId]
    }));
  };

  const dismissNotification = (notifId) => {
    setNotifications(prev => prev.filter(n => n.id !== notifId));
  };

  const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  
  const isToday = (day) => {
    return day === today.getDate() && 
           currentDate.getMonth() === today.getMonth() && 
           currentDate.getFullYear() === today.getFullYear();
  };

  const displayDate = selectedDate || formatTodayDate();
  const displayEvents = events.filter(e => e.date === displayDate).sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div className="min-h-screen p-4 pb-8">
      {/* 스타일 */}
      <style>{`
        .title-font { font-family: 'Space Grotesk', sans-serif; }
        .glass { 
          background: rgba(255,255,255,0.05); 
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.1);
        }
        .glass-hover:active {
          background: rgba(255,255,255,0.1);
        }
        @media (hover: hover) {
          .glass-hover:hover {
            background: rgba(255,255,255,0.1);
          }
        }
        .glow { box-shadow: 0 0 30px rgba(99, 102, 241, 0.3); }
        .day-cell { 
          transition: all 0.15s ease;
          -webkit-user-select: none;
          user-select: none;
        }
        .day-cell:active { transform: scale(0.95); }
        .event-dot { animation: pulse 2s infinite; }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .modal-enter { animation: modalIn 0.25s ease; }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .notification-slide { animation: slideIn 0.4s ease; }
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .banner-slide { animation: bannerIn 0.5s ease; }
        @keyframes bannerIn {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        input, textarea, select {
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.15);
          color: white;
          border-radius: 12px;
          transition: all 0.2s;
        }
        input:focus, textarea:focus, select:focus {
          outline: none;
          border-color: #6366F1;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
        }
        input::placeholder, textarea::placeholder {
          color: rgba(255,255,255,0.4);
        }
      `}</style>

      {/* 인앱 알림 */}
      <div className="fixed top-4 right-4 left-4 z-50 space-y-2 pointer-events-none">
        {notifications.slice(-3).map(notif => (
          <div 
            key={notif.id} 
            className="notification-slide glass rounded-2xl p-4 flex items-center gap-3 pointer-events-auto"
            style={{ borderLeft: `4px solid ${notif.color}` }}
          >
            <BellRing size={20} style={{ color: notif.color }} className="flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{notif.title}</p>
              <p className="text-sm text-slate-400 truncate">{notif.message}</p>
            </div>
            <button 
              onClick={() => dismissNotification(notif.id)} 
              className="text-slate-400 hover:text-white p-1 flex-shrink-0"
            >
              <X size={18} />
            </button>
          </div>
        ))}
      </div>

      {/* PWA 설치 배너 */}
      {showInstallBanner && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 banner-slide">
          <div className="glass rounded-2xl p-4 flex items-center gap-4 max-w-lg mx-auto">
            <Download size={24} className="text-indigo-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium">앱 설치하기</p>
              <p className="text-sm text-slate-400">홈 화면에 추가하여 더 빠르게 사용하세요</p>
            </div>
            <button 
              onClick={handleInstall}
              className="px-4 py-2 bg-indigo-500 rounded-xl text-sm font-medium"
            >
              설치
            </button>
            <button 
              onClick={() => setShowInstallBanner(false)}
              className="p-1 text-slate-400"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="title-font text-2xl md:text-3xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              My Calendar
            </h1>
            <p className="text-slate-400 text-sm mt-1">일정을 스마트하게 관리하세요</p>
          </div>
          <div className="flex gap-2">
            {notificationPermission !== 'granted' && (
              <button 
                onClick={requestNotificationPermission}
                className="glass glass-hover rounded-xl p-3"
                title="알림 허용"
              >
                <Bell size={18} className="text-yellow-400" />
              </button>
            )}
            <button 
              onClick={() => setShowCategoryModal(true)}
              className="glass glass-hover rounded-xl p-3"
            >
              <Tag size={18} />
            </button>
            <button 
              onClick={() => {
                setEditingEvent(null);
                setNewEvent({
                  title: '',
                  date: selectedDate || formatTodayDate(),
                  time: '',
                  categoryId: categories[0]?.id || 1,
                  reminders: ['1hour'],
                  description: ''
                });
                setShowEventModal(true);
              }}
              className="bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl p-3 glow"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        {/* 캘린더 */}
        <div className="glass rounded-3xl p-4 md:p-6 mb-6">
          {/* 월 네비게이션 */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="glass glass-hover p-2.5 rounded-xl">
              <ChevronLeft size={20} />
            </button>
            <h2 className="title-font text-lg md:text-xl font-semibold">
              {currentDate.getFullYear()}년 {monthNames[currentDate.getMonth()]}
            </h2>
            <button onClick={nextMonth} className="glass glass-hover p-2.5 rounded-xl">
              <ChevronRight size={20} />
            </button>
          </div>

          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {dayNames.map((day, i) => (
              <div 
                key={day} 
                className={`text-center py-2 text-xs font-medium ${
                  i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'
                }`}
              >
                {day}
              </div>
            ))}
          </div>

          {/* 캘린더 그리드 */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startingDay }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayEvents = getEventsForDate(day);
              const isSelected = selectedDate === formatDate(day);
              const dayOfWeek = (startingDay + i) % 7;
              
              return (
                <button
                  key={day}
                  onClick={() => handleDateClick(day)}
                  className={`day-cell aspect-square rounded-xl flex flex-col items-center justify-center relative p-1
                    ${isToday(day) ? 'bg-gradient-to-br from-indigo-500 to-purple-500 glow' : 'glass glass-hover'}
                    ${isSelected && !isToday(day) ? 'ring-2 ring-indigo-400' : ''}
                  `}
                >
                  <span className={`text-sm font-medium ${
                    isToday(day) ? 'text-white' : 
                    dayOfWeek === 0 ? 'text-red-400' : 
                    dayOfWeek === 6 ? 'text-blue-400' : ''
                  }`}>
                    {day}
                  </span>
                  {dayEvents.length > 0 && (
                    <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                      {dayEvents.slice(0, 3).map(event => {
                        const category = categories.find(c => c.id === event.categoryId);
                        return (
                          <div 
                            key={event.id}
                            className="event-dot w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: category?.color || '#6366F1' }}
                          />
                        );
                      })}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 선택된 날짜의 일정 */}
        <div className="glass rounded-3xl p-4 md:p-6">
          <h3 className="title-font text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar size={18} className="text-indigo-400" />
            {displayDate} 일정
          </h3>
          
          <div className="space-y-3">
            {displayEvents.map(event => {
              const category = categories.find(c => c.id === event.categoryId);
              return (
                <div 
                  key={event.id}
                  className="glass rounded-xl p-4 border-l-4"
                  style={{ borderLeftColor: category?.color || '#6366F1' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate">{event.title}</h4>
                      <div className="flex items-center gap-2 mt-1 text-sm text-slate-400">
                        <Clock size={14} />
                        <span>{event.time}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span 
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: `${category?.color}20`, color: category?.color }}
                        >
                          {category?.name}
                        </span>
                        {event.reminders.length > 0 && (
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <Bell size={12} />
                            {event.reminders.length}개 알림
                          </span>
                        )}
                      </div>
                      {event.description && (
                        <p className="text-sm text-slate-400 mt-2 line-clamp-2">{event.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button 
                        onClick={() => handleEditEvent(event)}
                        className="p-2 hover:bg-white/10 rounded-lg"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDeleteEvent(event.id)}
                        className="p-2 hover:bg-red-500/20 rounded-lg text-red-400"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {displayEvents.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                <Calendar size={36} className="mx-auto mb-3 opacity-50" />
                <p>일정이 없습니다</p>
                <button 
                  onClick={() => {
                    setEditingEvent(null);
                    setNewEvent({
                      title: '',
                      date: displayDate,
                      time: '',
                      categoryId: categories[0]?.id || 1,
                      reminders: ['1hour'],
                      description: ''
                    });
                    setShowEventModal(true);
                  }}
                  className="mt-3 text-indigo-400 text-sm"
                >
                  + 일정 추가하기
                </button>
              </div>
            )}
          </div>

          {/* 카테고리 미리보기 */}
          <div className="mt-6 pt-4 border-t border-white/10">
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <span 
                  key={cat.id}
                  className="px-3 py-1 rounded-full text-xs"
                  style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                >
                  {cat.name}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 다가오는 일정 */}
        {events.filter(e => new Date(`${e.date}T${e.time}`) >= new Date()).length > 0 && (
          <div className="mt-6 glass rounded-3xl p-4 md:p-6">
            <h3 className="title-font text-lg font-semibold mb-4">다가오는 일정</h3>
            <div className="space-y-2">
              {events
                .filter(e => new Date(`${e.date}T${e.time}`) >= new Date())
                .sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`))
                .slice(0, 5)
                .map(event => {
                  const category = categories.find(c => c.id === event.categoryId);
                  return (
                    <div 
                      key={event.id}
                      className="glass glass-hover rounded-xl p-3 flex items-center gap-3"
                      onClick={() => {
                        setSelectedDate(event.date);
                        const [year, month] = event.date.split('-');
                        setCurrentDate(new Date(parseInt(year), parseInt(month) - 1));
                      }}
                    >
                      <div 
                        className="w-2 h-10 rounded-full flex-shrink-0"
                        style={{ backgroundColor: category?.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium truncate">{event.title}</h4>
                        <p className="text-sm text-slate-400">{event.date} {event.time}</p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* 일정 추가/수정 모달 */}
      {showEventModal && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-filter backdrop-blur-sm flex items-end md:items-center justify-center z-50"
          onClick={() => setShowEventModal(false)}
        >
          <div 
            className="modal-enter glass rounded-t-3xl md:rounded-3xl p-6 w-full md:max-w-md max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="title-font text-xl font-semibold">
                {editingEvent ? '일정 수정' : '새 일정'}
              </h3>
              <button 
                onClick={() => setShowEventModal(false)} 
                className="p-2 hover:bg-white/10 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">제목</label>
                <input
                  type="text"
                  value={newEvent.title}
                  onChange={e => setNewEvent(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-4 py-3"
                  placeholder="일정 제목"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">날짜</label>
                  <input
                    type="date"
                    value={newEvent.date}
                    onChange={e => setNewEvent(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full px-4 py-3"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">시간</label>
                  <input
                    type="time"
                    value={newEvent.time}
                    onChange={e => setNewEvent(prev => ({ ...prev, time: e.target.value }))}
                    className="w-full px-4 py-3"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">카테고리</label>
                <div className="flex flex-wrap gap-2">
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setNewEvent(prev => ({ ...prev, categoryId: cat.id }))}
                      className={`px-3 py-2 rounded-xl text-sm transition-all ${
                        newEvent.categoryId === cat.id 
                          ? 'ring-2 ring-white/50' 
                          : 'opacity-50'
                      }`}
                      style={{ backgroundColor: `${cat.color}30`, color: cat.color }}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">
                  <Bell size={14} className="inline mr-1" />
                  알림 설정
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {reminderOptions.map(option => (
                    <button
                      key={option.id}
                      onClick={() => toggleReminder(option.id)}
                      className={`px-3 py-2.5 rounded-xl text-sm flex items-center justify-between transition-all ${
                        newEvent.reminders.includes(option.id)
                          ? 'bg-indigo-500/30 border border-indigo-400'
                          : 'glass'
                      }`}
                    >
                      <span>{option.label}</span>
                      {newEvent.reminders.includes(option.id) && <Check size={16} />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">메모 (선택)</label>
                <textarea
                  value={newEvent.description}
                  onChange={e => setNewEvent(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-3 resize-none"
                  rows={3}
                  placeholder="추가 메모"
                />
              </div>

              <button
                onClick={handleAddEvent}
                disabled={!newEvent.title || !newEvent.date || !newEvent.time}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-medium transition-all"
              >
                {editingEvent ? '수정 완료' : '일정 추가'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 카테고리 관리 모달 */}
      {showCategoryModal && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-filter backdrop-blur-sm flex items-end md:items-center justify-center z-50"
          onClick={() => setShowCategoryModal(false)}
        >
          <div 
            className="modal-enter glass rounded-t-3xl md:rounded-3xl p-6 w-full md:max-w-md max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="title-font text-xl font-semibold">카테고리 관리</h3>
              <button 
                onClick={() => setShowCategoryModal(false)} 
                className="p-2 hover:bg-white/10 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            {/* 기존 카테고리 */}
            <div className="space-y-2 mb-6">
              {categories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between glass rounded-xl p-3">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span>{cat.name}</span>
                  </div>
                  {categories.length > 1 && (
                    <button 
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="p-2 hover:bg-red-500/20 rounded-lg text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* 새 카테고리 추가 */}
            <div className="border-t border-white/10 pt-6">
              <h4 className="text-sm font-medium text-slate-400 mb-4">새 카테고리</h4>
              <div className="space-y-4">
                <input
                  type="text"
                  value={newCategory.name}
                  onChange={e => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-3"
                  placeholder="카테고리 이름"
                />
                <div>
                  <label className="block text-sm text-slate-400 mb-2">색상</label>
                  <div className="flex gap-2 flex-wrap">
                    {['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#84CC16'].map(color => (
                      <button
                        key={color}
                        onClick={() => setNewCategory(prev => ({ ...prev, color }))}
                        className={`w-9 h-9 rounded-full transition-all ${
                          newCategory.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110' : ''
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleAddCategory}
                  disabled={!newCategory.name}
                  className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-500 disabled:opacity-50 rounded-xl font-medium transition-all"
                >
                  추가
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
