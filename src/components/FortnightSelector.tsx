import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, setDate, addDays, subDays, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

interface FortnightSelectorProps {
  value: {
    month: Date;
    fortnight: 1 | 2;
  };
  onChange: (newValue: { month: Date; fortnight: 1 | 2 }) => void;
}

export function getFortnightDates(month: Date, fortnight: 1 | 2) {
  const start = fortnight === 1 
    ? setDate(month, 1)  // First day of month
    : setDate(month, 16); // 16th day of month
  
  const end = fortnight === 1
    ? setDate(month, 15) // 15th day of month
    : endOfMonth(month);

  return { start, end };
}

export default function FortnightSelector({ value, onChange }: FortnightSelectorProps) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => value.month);

  const handlePrevMonth = () => {
    setCalendarMonth(prev => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    setCalendarMonth(prev => addMonths(prev, 1));
  };

  const handlePrevFortnight = () => {
    if (value.fortnight === 1) {
      // If we're in the first fortnight, go to the second fortnight of the previous month
      const newMonth = new Date(value.month);
      newMonth.setMonth(newMonth.getMonth() - 1);
      onChange({ month: newMonth, fortnight: 2 });
    } else {
      // If we're in the second fortnight, go to the first fortnight of the same month
      onChange({ ...value, fortnight: 1 });
    }
  };

  const handleNextFortnight = () => {
    if (value.fortnight === 2) {
      // If we're in the second fortnight, go to the first fortnight of the next month
      const newMonth = new Date(value.month);
      newMonth.setMonth(newMonth.getMonth() + 1);
      onChange({ month: newMonth, fortnight: 1 });
    } else {
      // If we're in the first fortnight, go to the second fortnight of the same month
      onChange({ ...value, fortnight: 2 });
    }
  };

  const handleDateSelect = (date: Date) => {
    const newMonth = startOfMonth(date);
    const fortnight = date.getDate() <= 15 ? 1 : 2;
    onChange({ month: newMonth, fortnight });
    setShowCalendar(false);
  };

  const generateCalendarDays = () => {
    const days = [];
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(calendarMonth);
    
    // Get the first day of the month and adjust for starting on Monday
    let startDay = monthStart.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1; // Convert Sunday (0) to 6, and shift others back by 1
    
    // Add previous month's days
    for (let i = 0; i < startDay; i++) {
      const date = subDays(monthStart, startDay - i);
      days.push({ date, isCurrentMonth: false });
    }
    
    // Add current month's days
    for (let date = monthStart; date <= monthEnd; date = addDays(date, 1)) {
      days.push({ date, isCurrentMonth: true });
    }
    
    // Add next month's days to complete the grid
    const remainingDays = 42 - days.length; // 6 rows * 7 days = 42
    for (let i = 1; i <= remainingDays; i++) {
      const date = addDays(monthEnd, i);
      days.push({ date, isCurrentMonth: false });
    }
    
    return days;
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          onClick={handlePrevFortnight}
          className="p-2 text-gray-600 hover:text-gray-800 bg-white rounded-lg shadow-sm hover:shadow transition-all"
          title="Quincena anterior"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <button
          onClick={() => setShowCalendar(!showCalendar)}
          className="px-4 py-2 bg-white rounded-lg shadow-sm hover:shadow transition-all min-w-64 text-center flex items-center justify-center gap-2"
        >
          <CalendarIcon className="w-4 h-4 text-gray-500" />
          <span className="text-gray-900 font-medium">
            {format(value.month, 'MMMM yyyy', { locale: es })}
          </span>
          <span className="text-gray-600">
            ({value.fortnight === 1 ? '1ra' : '2da'} Quincena)
          </span>
        </button>

        <button
          onClick={handleNextFortnight}
          className="p-2 text-gray-600 hover:text-gray-800 bg-white rounded-lg shadow-sm hover:shadow transition-all"
          title="Quincena siguiente"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {showCalendar && (
        <div className="absolute top-full mt-2 bg-white rounded-lg shadow-lg p-4 z-50">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={handlePrevMonth}
              className="p-1 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
              title="Mes anterior"
            >
              <ChevronsLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-medium text-gray-900">
              {format(calendarMonth, 'MMMM yyyy', { locale: es })}
            </span>
            <button
              onClick={handleNextMonth}
              className="p-1 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
              title="Mes siguiente"
            >
              <ChevronsRight className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => (
              <div key={day} className="text-center text-xs font-medium text-gray-500 py-1">
                {day}
              </div>
            ))}
            {generateCalendarDays().map(({ date, isCurrentMonth }, index) => (
              <button
                key={index}
                onClick={() => handleDateSelect(date)}
                className={`
                  p-2 text-sm rounded-md hover:bg-gray-100 relative
                  ${isCurrentMonth ? 'text-gray-900' : 'text-gray-400'}
                  ${date.getTime() === value.month.getTime() && date.getDate() === value.month.getDate() ? 'bg-indigo-50 text-indigo-600 font-medium' : ''}
                `}
              >
                {date.getDate()}
                {isCurrentMonth && date.getDate() === 15 && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-red-400 rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}