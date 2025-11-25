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
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-8 px-2 pt-2">
          <h1 className="title-font text-3xl font-bold text-slate-900">
            {currentDate.getFullYear()}년 {monthNames[currentDate.getMonth()]}
          </h1>
          <div className="flex gap-2">
            <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600">
              <ChevronLeft size={24} />
            </button>
            <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600">
              <ChevronRight size={24} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 캘린더 (왼쪽/상단) */}
          <div className="lg:col-span-2 h-fit">
            {/* 요일 헤더 */}
            <div className="grid grid-cols-7 gap-1 mb-4">
              {dayNames.map((day, i) => (
                <div
                  key={day}
                  className={`text-center text-sm font-medium ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'
                    }`}
                >
                  {day}
                </div>
              ))}
            </div>

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
            {/* 선택된 날짜의 일정 */}
            <div className="clean-card rounded-3xl p-4 md:p-6 h-fit sticky top-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="title-font text-xl font-semibold flex items-center gap-2 text-slate-900">
                  <Calendar size={20} className="text-indigo-400" />
                  {displayDate}
                </h3>
                <button
                  onClick={() => {
                    setEditingEvent(null);
                    setNewEvent({
                      title: '',
                      date: selectedDate || formatTodayDate(),
                      time: '',
                      categoryId: categories[0]?.id || 1,
                      reminders: [],
                      description: ''
                    });
                    setShowEventModal(true);
                  }}
                  className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors"
                >
                  <Plus size={20} />
                </button>
              </div>

              <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                {displayEvents.map(event => {
                  const category = categories.find(c => c.id === event.categoryId);
                  return (
                    <div
                      key={event.id}
                      className="clean-card clean-hover rounded-xl p-4 border-l-4 transition-colors group"
                      style={{ borderLeftColor: category?.color || '#BFDBFE' }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium truncate text-lg text-slate-900">{event.title}</h4>
                          <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                            <Clock size={14} />
                            <span>{event.time || '하루 종일'}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-3 flex-wrap">
                            <span
                              className="text-xs px-2.5 py-1 rounded-full font-medium"
                              style={{ backgroundColor: `${category?.color}40`, color: '#1E293B' }}
                            >
                              {category?.name}
                            </span>
                            {event.reminders.length > 0 && (
                              <span className="flex items-center gap-1 text-xs text-slate-400">
                                <Bell size={12} />
                                {event.reminders.length}개
                              </span>
                            )}
                          </div>
                          {event.description && (
                            <p className="text-sm text-slate-500 mt-3 line-clamp-2 leading-relaxed">{event.description}</p>
                          )}
                        </div>
                        <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleEditEvent(event)}
                            className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteEvent(event.id)}
                            className="p-2 hover:bg-red-50 rounded-lg text-red-400"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {displayEvents.length === 0 && (
                  <div className="text-center py-12 text-slate-500">
                    <Calendar size={48} className="mx-auto mb-4 opacity-20" />
                    <p className="text-lg">일정이 없습니다</p>
                  </div>
                )}
              </div>
            </div>

            {/* 카테고리 관리 (데스크탑) */}
            <div className="hidden md:block clean-card rounded-3xl p-6">
              <h3 className="title-font text-lg font-semibold mb-4 text-slate-900 flex items-center gap-2">
                <Tag size={20} className="text-indigo-400" />
                카테고리 관리
              </h3>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCategory.name}
                    onChange={e => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
                    className="flex-1 px-3 py-2 text-sm"
                    placeholder="새 카테고리"
                  />
                  <input
                    type="color"
                    value={newCategory.color}
                    onChange={e => setNewCategory(prev => ({ ...prev, color: e.target.value }))}
                    className="w-10 h-10 rounded-xl p-1 cursor-pointer bg-white border border-slate-200"
                  />
                  <button
                    onClick={handleAddCategory}
                    className="px-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl transition-colors"
                  >
                    <Plus size={20} />
                  </button>
                </div>
                <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
                  {categories.map(cat => (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between p-2 rounded-xl border border-slate-100 bg-slate-50 group"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="text-sm font-medium text-slate-700">{cat.name}</span>
                      </div>
                      {categories.length > 1 && (
                        <button
                          onClick={() => handleDeleteCategory(cat.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

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

            {/* 다가오는 일정 */}
            {events.filter(e => new Date(`${e.date}T${e.time}`) >= new Date()).length > 0 && (
              <div className="clean-card rounded-3xl p-4 md:p-6">
                <h3 className="title-font text-lg font-semibold mb-4 text-slate-900">다가오는 일정</h3>
                <div className="space-y-2">
                  {events
                    .filter(e => new Date(`${e.date}T${e.time}`) >= new Date())
                    .sort((a, b) => new Date(`${a.date}T${b.time}`) - new Date(`${b.date}T${b.time}`))
                    .slice(0, 3)
                    .map(event => {
                      const category = categories.find(c => c.id === event.categoryId);
                      return (
                        <div
                          key={event.id}
                          className="clean-card clean-hover rounded-xl p-3 flex items-center gap-3 cursor-pointer"
                          onClick={() => {
                            setSelectedDate(event.date);
                            const [year, month] = event.date.split('-');
                            setCurrentDate(new Date(parseInt(year), parseInt(month) - 1));
                          }}
                        >
                          <div
                            className="w-1.5 h-8 rounded-full flex-shrink-0"
                            style={{ backgroundColor: category?.color }}
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium truncate text-slate-900">{event.title}</h4>
                            <p className="text-xs text-slate-500">{event.date} {event.time || '하루 종일'}</p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 하단 네비게이션 바 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-2 pb-6 md:pb-2 z-40 flex justify-around items-center md:hidden">
        <button className="p-3 text-indigo-500 flex flex-col items-center gap-1">
          <Calendar size={24} />
          <span className="text-[10px] font-medium">캘린더</span>
        </button>
        <button
          onClick={() => setShowCategoryModal(true)}
          className="p-3 text-slate-400 hover:text-indigo-500 flex flex-col items-center gap-1 transition-colors"
        >
          <Tag size={24} />
          <span className="text-[10px] font-medium">카테고리</span>
        </button>
        <button
          onClick={() => setShowReminderModal(true)}
          className="p-3 text-slate-400 hover:text-indigo-500 flex flex-col items-center gap-1 transition-colors"
        >
          <Bell size={24} />
          <span className="text-[10px] font-medium">설정</span>
        </button>
      </div>

      {/* 일정 추가/수정 모달 */}
      {showEventModal && (
        <div
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-end md:items-center justify-center z-50"
          onClick={() => setShowEventModal(false)}
        >
          <div
            className="modal-enter bg-white rounded-t-3xl md:rounded-3xl p-6 w-full md:max-w-md max-h-[85vh] overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="title-font text-xl font-semibold text-slate-900">
                {editingEvent ? '일정 수정' : '새 일정'}
              </h3>
              <button
                onClick={() => setShowEventModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-500 mb-2">제목</label>
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
                  <label className="block text-sm text-slate-500 mb-2">날짜</label>
                  <input
                    type="date"
                    value={newEvent.date}
                    onChange={e => setNewEvent(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full px-4 py-3"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-500 mb-2">시간</label>
                  <input
                    type="time"
                    value={newEvent.time}
                    onChange={e => setNewEvent(prev => ({ ...prev, time: e.target.value }))}
                    className="w-full px-4 py-3"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-500 mb-2">카테고리</label>
                <div className="flex flex-wrap gap-2">
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setNewEvent(prev => ({ ...prev, categoryId: cat.id }))}
                      className={`px-3 py-2 rounded-xl text-sm transition-all ${newEvent.categoryId === cat.id
                        ? 'ring-2 ring-offset-2 ring-indigo-200'
                        : 'opacity-70 hover:opacity-100'
                        }`}
                      style={{ backgroundColor: `${cat.color}40`, color: '#1E293B' }}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-500 mb-2">
                  <Bell size={14} className="inline mr-1" />
                  알림 설정
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {reminderOptions.map(option => (
                    <button
                      key={option.id}
                      onClick={() => toggleReminder(option.id)}
                      className={`px-3 py-2 rounded-xl text-sm transition-all border ${newEvent.reminders.includes(option.id)
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                      {newEvent.reminders.includes(option.id) && <Check size={14} className="inline mr-1" />}
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-500 mb-2">메모</label>
                <textarea
                  value={newEvent.description}
                  onChange={e => setNewEvent(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-3 h-24 resize-none"
                  placeholder="메모를 입력하세요"
                />
              </div>

              <button
                onClick={handleAddEvent}
                className="w-full py-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-medium text-lg shadow-lg shadow-indigo-200 transition-all active:scale-95"
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
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-end md:items-center justify-center z-50"
          onClick={() => setShowCategoryModal(false)}
        >
          <div
            className="modal-enter bg-white rounded-t-3xl md:rounded-3xl p-6 w-full md:max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="title-font text-xl font-semibold text-slate-900">카테고리 관리</h3>
              <button
                onClick={() => setShowCategoryModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategory.name}
                  onChange={e => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
                  className="flex-1 px-4 py-3"
                  placeholder="새 카테고리 이름"
                />
                <input
                  type="color"
                  value={newCategory.color}
                  onChange={e => setNewCategory(prev => ({ ...prev, color: e.target.value }))}
                  className="w-12 h-12 rounded-xl p-1 cursor-pointer bg-white border border-slate-200"
                />
                <button
                  onClick={handleAddCategory}
                  className="px-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl"
                >
                  <Plus size={20} />
                </button>
              </div>

              <div className="space-y-2 max-h-[40vh] overflow-y-auto custom-scrollbar pr-2">
                {categories.map(cat => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="font-medium text-slate-700">{cat.name}</span>
                    </div>
                    {categories.length > 1 && (
                      <button
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

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
