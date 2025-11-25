import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Bell, Tag, Clock, Calendar, Check, Trash2, Edit2, Download } from 'lucide-react';

const defaultCategories = [
  { id: 1, name: '업무', color: '#BFDBFE' }, // Pastel Blue
  { id: 2, name: '개인', color: '#A7F3D0' }, // Pastel Green
  { id: 3, name: '중요', color: '#FECACA' }, // Pastel Red
  { id: 4, name: '약속', color: '#FDE68A' }, // Pastel Yellow
];

const defaultReminderOptions = [
  { id: 'day', label: '하루 전', minutes: 1440 },
  { id: '6hours', label: '6시간 전', minutes: 360 },
  { id: '1hour', label: '1시간 전', minutes: 60 },
  { id: '10min', label: '10분 전', minutes: 10 },
];

// localStorage 헬퍼 함수
const storage = {
  get: (key, defaultValue) => {
    try {
      const item = localStorage.getItem(key);
      if (!item) return defaultValue;
      const parsed = JSON.parse(item);
      // 배열이어야 하는데 아닌 경우 처리
      if (Array.isArray(defaultValue) && !Array.isArray(parsed)) return defaultValue;
      return parsed;
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
  const [reminderOptions, setReminderOptions] = useState(() => {
    const options = storage.get('calendar-reminders', defaultReminderOptions);
    // 5시간 전 옵션 제거 마이그레이션
    return options.filter(opt => opt.id !== '5hours');
  });
  const [showEventModal, setShowEventModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [customReminderTime, setCustomReminderTime] = useState('');
  const [customReminderUnit, setCustomReminderUnit] = useState('minutes'); // minutes, hours, days
  const [touchDragEvent, setTouchDragEvent] = useState(null);
  const [touchGhostPos, setTouchGhostPos] = useState({ x: 0, y: 0 });

  const [notifications, setNotifications] = useState([]);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [draggedEvent, setDraggedEvent] = useState(null); // 드래그 중인 일정

  const [newEvent, setNewEvent] = useState({
    title: '',
    date: '',
    time: '',
    categoryId: 1,
    reminders: [],
    description: ''
  });
  const [newCategory, setNewCategory] = useState({ name: '', color: '#BFDBFE' });

  // Persistence
  useEffect(() => { storage.set('calendar-events', events); }, [events]);
  useEffect(() => { storage.set('calendar-categories', categories); }, [categories]);
  useEffect(() => { storage.set('calendar-reminders', reminderOptions); }, [reminderOptions]);

  // Notifications
  useEffect(() => {
    if ('Notification' in window) {
      Notification.requestPermission();
    }
  }, []);

  // Check Reminders
  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      events.forEach(event => {
        if (!event.reminders) return;
        event.reminders.forEach(reminderId => {
          const option = reminderOptions.find(o => o.id === reminderId);
          if (!option) return;

          const eventTime = new Date(`${event.date}T${event.time || '00:00'}`);
          const diff = eventTime - now;
          const minutesDiff = Math.floor(diff / 1000 / 60);

          if (minutesDiff === option.minutes) {
            const notifId = Date.now();
            // Avoid duplicate notifications (simple check)
            setNotifications(prev => {
              if (prev.some(n => n.title === event.title && n.message === option.label + ' 알림')) return prev;
              if (Notification.permission === 'granted') {
                new Notification(event.title, { body: option.label + ' 알림' });
              }
              return [...prev, {
                id: notifId,
                title: event.title,
                message: option.label + ' 알림',
                color: categories.find(c => c.id === event.categoryId)?.color || '#BFDBFE'
              }];
            });
          }
        });
      });
    };

    const interval = setInterval(checkReminders, 60000);
    return () => clearInterval(interval);
  }, [events, reminderOptions, categories]);

  // PWA Install
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowInstallBanner(false);
    }
  };

  // Custom Reminder Logic
  const handleAddCustomReminder = () => {
    if (!customReminderTime || isNaN(customReminderTime)) return;

    const time = parseInt(customReminderTime);
    let minutes = 0;
    let label = '';

    switch (customReminderUnit) {
      case 'minutes':
        minutes = time;
        label = `${time}분 전`;
        break;
      case 'hours':
        minutes = time * 60;
        label = `${time}시간 전`;
        break;
      case 'days':
        minutes = time * 1440;
        label = `${time}일 전`;
        break;
    }

    const id = `custom-${Date.now()}`;
    if (!reminderOptions.find(o => o.minutes === minutes)) {
      const newOptions = [...reminderOptions, { id, label, minutes }];
      setReminderOptions(newOptions);
      storage.set('calendar-reminders', newOptions);
    }
    setCustomReminderTime('');
  };

  // Drag and Drop Handlers (Desktop)
  const handleDragStart = (e, event) => {
    setDraggedEvent(event);
    e.dataTransfer.effectAllowed = 'move';
    e.target.style.opacity = '0.5';
  };

  const handleDragEnd = (e) => {
    setDraggedEvent(null);
    e.target.style.opacity = '1';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, day) => {
    e.preventDefault();
    if (!draggedEvent) return;
    updateEventDate(draggedEvent, day);
    setDraggedEvent(null);
  };

  // Touch Drag Handlers (Mobile)
  const handleTouchStart = (e, event) => {
    // e.preventDefault(); // 스크롤 방지를 위해 필요할 수 있음 (상황에 따라)
    const touch = e.touches[0];
    setTouchDragEvent(event);
    setTouchGhostPos({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchMove = (e) => {
    if (!touchDragEvent) return;
    const touch = e.touches[0];
    setTouchGhostPos({ x: touch.clientX, y: touch.clientY });

    // 스크롤 방지 (드래그 중일 때만)
    if (e.cancelable) e.preventDefault();
  };

  const handleTouchEnd = (e) => {
    if (!touchDragEvent) return;

    const touch = e.changedTouches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    const dayCell = element?.closest('.day-cell');

    if (dayCell) {
      const dayStr = dayCell.getAttribute('data-day');
      if (dayStr) {
        updateEventDate(touchDragEvent, parseInt(dayStr));
      }
    }

    setTouchDragEvent(null);
  };

  const updateEventDate = (event, day) => {
    const newDate = formatDate(day);
    if (event.date !== newDate) {
      const updatedEvent = { ...event, date: newDate };
      setEvents(prev => prev.map(ev => ev.id === event.id ? updatedEvent : ev));
    }
  };

  // Helpers
  const getDaysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getStartingDay = (date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const daysInMonth = getDaysInMonth(currentDate);
  const startingDay = getStartingDay(currentDate);
  const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  const formatDate = (day) => {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${month}-${d}`;
  };

  const formatTodayDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  const isToday = (day) => formatDate(day) === formatTodayDate();
  const getEventsForDate = (day) => {
    const dateStr = formatDate(day);
    return events.filter(e => e.date === dateStr);
  };

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  const handleDateClick = (day) => setSelectedDate(formatDate(day));

  const handleAddEvent = () => {
    if (!newEvent.title || !newEvent.date) return;
    if (editingEvent) {
      setEvents(events.map(e => e.id === editingEvent.id ? { ...newEvent, id: editingEvent.id } : e));
      setEditingEvent(null);
    } else {
      setEvents([...events, { ...newEvent, id: Date.now() }]);
    }
    setShowEventModal(false);
    setNewEvent({ title: '', date: selectedDate || formatTodayDate(), time: '', categoryId: categories[0]?.id || 1, reminders: [], description: '' });
  };

  const handleDeleteEvent = (id) => setEvents(events.filter(e => e.id !== id));

  const handleEditEvent = (event) => {
    setEditingEvent(event);
    setNewEvent(event);
    setShowEventModal(true);
  };

  const handleAddCategory = () => {
    if (!newCategory.name) return;
    setCategories([...categories, { ...newCategory, id: Date.now() }]);
    setNewCategory({ name: '', color: '#BFDBFE' });
  };

  const handleDeleteCategory = (id) => setCategories(categories.filter(c => c.id !== id));

  const toggleReminder = (id) => {
    setNewEvent(prev => ({
      ...prev,
      reminders: prev.reminders.includes(id)
        ? prev.reminders.filter(r => r !== id)
        : [...prev.reminders, id]
    }));
  };

  const dismissNotification = (id) => setNotifications(prev => prev.filter(n => n.id !== id));

  const displayDate = selectedDate || formatTodayDate();
  const displayEvents = events.filter(e => e.date === displayDate);

  return (
    <div className="min-h-screen bg-white pb-20 md:pb-8">
      {/* ... (Styles remain same) */}

      {/* Touch Ghost Element */}
      {touchDragEvent && (
        <div
          className="fixed z-[9999] pointer-events-none px-2 py-1 rounded bg-indigo-500 text-white text-xs shadow-xl opacity-90"
          style={{
            left: touchGhostPos.x,
            top: touchGhostPos.y,
            transform: 'translate(-50%, -150%)', // 손가락 위로 띄움
          }}
        >
          {touchDragEvent.title}
        </div>
      )}

      {/* ... (Notifications and Install Banner remain same) */}

      <div className="max-w-7xl mx-auto w-full">
        {/* ... (Header remains same) */}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 캘린더 (왼쪽/상단) */}
          <div className="lg:col-span-2 h-fit">
            {/* ... (Day Headers remain same) */}

            {/* 캘린더 그리드 */}
            <div className="grid grid-cols-7 gap-1 md:gap-2">
              {Array.from({ length: startingDay }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[100px] md:min-h-[140px]" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dayEvents = getEventsForDate(day);
                const isSelected = selectedDate === formatDate(day);
                const dayOfWeek = (startingDay + i) % 7;

                return (
                  <div
                    key={day}
                    data-day={day} // 터치 드롭을 위한 식별자
                    onClick={() => handleDateClick(day)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, day)}
                    className={`day-cell min-h-[100px] md:min-h-[140px] rounded-xl flex flex-col items-center relative p-1 md:p-2 cursor-pointer
                      ${isToday(day) ? 'bg-indigo-50' : 'hover:bg-slate-50'}
                      ${isSelected && !isToday(day) ? 'ring-2 ring-indigo-200' : ''}
                      ${draggedEvent && draggedEvent.date !== formatDate(day) ? 'hover:bg-indigo-50/50 transition-colors' : ''}
                    `}
                  >
                    <span className={`text-sm md:text-lg font-medium mb-1 md:mb-2 ${isToday(day) ? 'text-indigo-600' :
                      dayOfWeek === 0 ? 'text-red-400' :
                        dayOfWeek === 6 ? 'text-blue-400' : 'text-slate-700'
                      }`}>
                      {day}
                    </span>
                    {dayEvents.length > 0 && (
                      <div className="w-full space-y-1">
                        {dayEvents
                          .sort((a, b) => {
                            if (!a.time && !b.time) return 0;
                            if (!a.time) return -1;
                            if (!b.time) return 1;
                            return a.time.localeCompare(b.time);
                          })
                          .slice(0, 4)
                          .map(event => {
                            const category = categories.find(c => c.id === event.categoryId);
                            return (
                              <div
                                key={event.id}
                                draggable="true"
                                onDragStart={(e) => handleDragStart(e, event)}
                                onDragEnd={handleDragEnd}
                                onTouchStart={(e) => handleTouchStart(e, event)}
                                onTouchMove={handleTouchMove}
                                onTouchEnd={handleTouchEnd}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditEvent(event);
                                }}
                                className="w-full h-6 md:h-6 rounded px-1.5 flex items-center overflow-hidden cursor-move hover:opacity-80 transition-opacity touch-none" // touch-none으로 브라우저 기본 동작 방지
                                style={{ backgroundColor: category?.color || '#BFDBFE' }}
                              >
                                <span className="text-[10px] md:text-xs text-slate-700 truncate w-full font-medium leading-none pointer-events-none">
                                  {event.title}
                                </span>
                              </div>
                            );
                          })}
                        {dayEvents.length > 4 && (
                          <div className="text-[10px] md:text-xs text-slate-400 text-center leading-none pt-1">
                            +{dayEvents.length - 4}개
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 사이드바 (오른쪽/하단) */}
          <div className="space-y-6">
            {/* ... (Selected Date Events remain same) */}

            {/* ... (Category Manager remains same) */}

            {/* 알림 설정 (데스크탑) */}
            <div className="hidden md:block clean-card rounded-3xl p-6">
              <h3 className="title-font text-lg font-semibold mb-4 text-slate-900 flex items-center gap-2">
                <Bell size={20} className="text-indigo-400" />
                알림 설정
              </h3>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={customReminderTime}
                    onChange={e => setCustomReminderTime(e.target.value)}
                    className="w-16 px-2 py-2 text-sm"
                    placeholder="30"
                  />
                  <select
                    value={customReminderUnit}
                    onChange={e => setCustomReminderUnit(e.target.value)}
                    className="flex-1 px-2 py-2 text-sm bg-white"
                  >
                    <option value="minutes">분 전</option>
                    <option value="hours">시간 전</option>
                    <option value="days">일 전</option>
                  </select>
                  <button
                    onClick={handleAddCustomReminder}
                    className="px-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl transition-colors"
                  >
                    <Plus size={20} />
                  </button>
                </div>
                <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
                  {reminderOptions.map(option => (
                    <div
                      key={option.id}
                      className="flex items-center justify-between p-2 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/50 transition-all group"
                    >
                      <span className="text-sm font-medium text-slate-700">{option.label}</span>
                      <button
                        onClick={() => {
                          const newOptions = reminderOptions.filter(o => o.id !== option.id);
                          setReminderOptions(newOptions);
                          storage.set('calendar-reminders', newOptions);
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ... (Upcoming Events remain same) */}
          </div>
        </div>
      </div>

      {/* ... (Bottom Nav remains same) */}

      {/* ... (Event Modal remains same) */}

      {/* ... (Category Modal remains same) */}

      {/* 알림 설정 모달 */}
      {showReminderModal && (
        <div
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-end md:items-center justify-center z-50"
          onClick={() => setShowReminderModal(false)}
        >
          <div
            className="modal-enter bg-white rounded-t-3xl md:rounded-3xl p-6 w-full md:max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="title-font text-xl font-semibold text-slate-900">알림 설정</h3>
              <button
                onClick={() => setShowReminderModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              <div className="p-4 bg-indigo-50 rounded-xl">
                <h4 className="font-medium text-indigo-900 mb-2">기본 알림 시간</h4>
                <p className="text-sm text-indigo-700">
                  새 일정을 만들 때 기본으로 선택될 알림 시간을 설정합니다.
                </p>
              </div>

              <div className="space-y-2">
                {reminderOptions.map(option => (
                  <div
                    key={option.id}
                    className="flex items-center justify-between p-4 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/50 transition-all group"
                  >
                    <span className="font-medium text-slate-700">{option.label}</span>
                    <button
                      onClick={() => {
                        const newOptions = reminderOptions.filter(o => o.id !== option.id);
                        setReminderOptions(newOptions);
                        storage.set('calendar-reminders', newOptions);
                      }}
                      className="p-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-100">
                <h4 className="font-medium text-slate-900 mb-3">새 알림 시간 추가</h4>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={customReminderTime}
                    onChange={e => setCustomReminderTime(e.target.value)}
                    className="w-20 px-3 py-2"
                    placeholder="30"
                  />
                  <select
                    value={customReminderUnit}
                    onChange={e => setCustomReminderUnit(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white"
                  >
                    <option value="minutes">분 전</option>
                    <option value="hours">시간 전</option>
                    <option value="days">일 전</option>
                  </select>
                  <button
                    onClick={handleAddCustomReminder}
                    className="px-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl transition-colors"
                  >
                    <Plus size={20} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
