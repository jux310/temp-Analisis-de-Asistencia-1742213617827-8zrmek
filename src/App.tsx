import React, { useState, useEffect } from 'react';
import { FileUp, FileSpreadsheet, AlertCircle, Clock, Settings, Download, ArrowLeft, ArrowRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { parse, isWithinInterval, format, differenceInMinutes, startOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { AttendanceRecord, AnalysisResult } from './types';
import { analyzeAttendance, analyzeDayRecords, DEFAULT_PREFERENCES } from './utils/attendanceAnalysis';
import { getDateCellStyles } from './utils/dateStyles';
import PreferencesDialog from './components/PreferencesDialog';
import ColumnVisibilityMenu, { Column } from './components/ColumnVisibilityMenu';
import FortnightSelector, { getFortnightDates } from './components/FortnightSelector';

const DEFAULT_COLUMNS: Column[] = [
  { id: 'name', label: 'Nombre', visible: true },
  { id: 'schedule', label: 'Horario', visible: true },
  { id: 'absences', label: 'Inasistencias', visible: true },
  { id: 'daysRegistered', label: 'Días Registrados', visible: false },
  { id: 'lateDays', label: 'Llegadas Tarde', visible: false },
  { id: 'lateMinutes', label: 'Minutos Tarde', visible: false },
  { id: 'lateHours', label: 'Horas Tarde', visible: true },
  { id: 'overtimeHours', label: 'Horas Extra', visible: false },
  { id: 'saturdayHours', label: 'Horas Sábados', visible: false },
  { id: 'totalHours', label: 'Total Horas', visible: true },
];

const STORAGE_KEYS = {
  PREFERENCES: 'attendance-preferences',
  COLUMNS: 'attendance-columns'
} as const;

function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch (error) {
    console.error('Error loading from storage:', error);
    return defaultValue;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Error saving to storage:', error);
  }
}

function exportToExcel(results: AnalysisResult[], visibleColumns: Column[]) {
  // Create worksheet data
  const wsData = results.map(result => {
    const row: Record<string, any> = {};
    
    visibleColumns.forEach(col => {      
      switch (col.id) {
        case 'name':
          row['Nombre'] = result.name;
          break;
        case 'schedule':
          row['Horario'] = result.schedule?.startTime === DEFAULT_PREFERENCES.earlySchedule.startTime
            ? 'Temprano (7:00 - 16:00)'
            : 'Regular (8:00 - 17:00)';
          break;
        case 'absences':
          row['Inasistencias'] = result.absences;
          break;
        case 'daysRegistered':
          row['Días Registrados'] = result.daysRegistered;
          break;
        case 'lateDays':
          row['Llegadas Tarde'] = result.lateDays;
          break;
        case 'lateMinutes':
          row['Minutos Tarde'] = result.lateMinutes;
          break;
        case 'lateHours':
          row['Horas Tarde'] = result.lateHours;
          break;
        case 'overtimeHours':
          row['Horas Extra'] = result.overtimeHours;
          break;
        case 'saturdayHours':
          row['Horas Sábados'] = result.saturdayHours;
          break;
        case 'totalHours':
          row['Total Horas'] = result.totalHours;
          break;
      }
    });
    
    return row;
  });

  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(wsData);

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Asistencia');

  // Generate Excel file
  XLSX.writeFile(wb, 'analisis-asistencia.xlsx');
}

function App() {
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [error, setError] = useState<string>('');
  const [selectedPeriod, setSelectedPeriod] = useState(() => ({
    month: startOfMonth(new Date()),
    fortnight: 1 as 1 | 2
  }));
  const [rawRecords, setRawRecords] = useState<AttendanceRecord[]>([]);
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null);
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState(() => 
    loadFromStorage(STORAGE_KEYS.PREFERENCES, DEFAULT_PREFERENCES)
  );
  const [columns, setColumns] = useState<Column[]>(() => 
    loadFromStorage(STORAGE_KEYS.COLUMNS, DEFAULT_COLUMNS)
  );
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const selectedRowRef = React.useRef<HTMLTableRowElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [markedPeople, setMarkedPeople] = useState<Set<string>>(new Set());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoadingHolidays, setIsLoadingHolidays] = useState(false);
  const [holidayError, setHolidayError] = useState<string>('');
  const [holidayYear, setHolidayYear] = useState<number>(() => new Date().getFullYear());

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.PREFERENCES, preferences);
  }, [preferences]);

  useEffect(() => {
    async function fetchHolidays() {
      setIsLoadingHolidays(true);
      setHolidayError('');
      try {
        const response = await fetch(`https://api.argentinadatos.com/v1/feriados/${holidayYear}`);
        if (!response.ok) throw new Error('Error al obtener feriados');
        const data = await response.json();
        setHolidays(data);
      } catch (error) {
        console.error('Error fetching holidays:', error);
        setHolidayError('No se pudieron cargar los feriados');
      } finally {
        setIsLoadingHolidays(false);
      }
    }

    fetchHolidays();
  }, [holidayYear]);

  useEffect(() => {
    if (selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  }, [selectedIndex]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!results.length) return;

      // Filter out marked people for navigation
      const navigableResults = results.filter(r => !markedPeople.has(r.name));
      if (!navigableResults.length) return;
      
      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          setSelectedIndex(prev => {
            const newIndex = prev <= 0 ? navigableResults.length - 1 : prev - 1;
            setExpandedPerson(navigableResults[newIndex].name);
            return newIndex;
          });
          break;
        case 'ArrowDown':
          event.preventDefault();
          setSelectedIndex(prev => {
            const newIndex = prev >= navigableResults.length - 1 ? 0 : prev + 1;
            setExpandedPerson(navigableResults[newIndex].name);
            return newIndex;
          });
          break;
        case 'ArrowLeft':
        case 'ArrowRight':
          event.preventDefault();
          setSelectedIndex(prev => {
            const newIndex = event.key === 'ArrowLeft'
              ? (prev <= 0 ? navigableResults.length - 1 : prev - 1)
              : (prev >= navigableResults.length - 1 ? 0 : prev + 1);
            setExpandedPerson(navigableResults[newIndex].name);
            return newIndex;
          });
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [results, markedPeople]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.COLUMNS, columns);
  }, [columns]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const records = XLSX.utils.sheet_to_json(worksheet) as AttendanceRecord[];
      
      setRawRecords(records);
      
      // Get min and max dates from records
      const dates = records.map(r => parse(r['Fecha/Hora'].split(' ')[0], 'yyyy-MM-dd', new Date()));
      const firstDate = new Date(Math.min(...dates.map(d => d.getTime())));
      
      setSelectedPeriod({
        month: startOfMonth(firstDate),
        fortnight: firstDate.getDate() <= 15 ? 1 : 2
      });
      
      const { start, end } = getFortnightDates(firstDate, firstDate.getDate() <= 15 ? 1 : 2);
      
      const analysisResults = analyzeAttendance(records, start, end, preferences);
      setResults(analysisResults);
      setError('');
    } catch (err) {
      setError('Error al procesar el archivo. Asegúrese de que el formato sea correcto.');
      console.error(err);
    }
  };

  const handlePeriodChange = (newPeriod: { month: Date; fortnight: 1 | 2 }) => {
    if (!rawRecords.length) return;

    try {
      const { start, end } = getFortnightDates(newPeriod.month, newPeriod.fortnight);
      const newYear = newPeriod.month.getFullYear();
      
      // If the year has changed, update holidayYear to fetch new holidays
      if (newYear !== holidayYear) {
        setHolidayYear(newYear);
      }
      
      setSelectedPeriod(newPeriod);
      
      const analysisResults = analyzeAttendance(rawRecords, start, end, preferences);
      setResults(analysisResults);
      setError('');
    } catch (err) {
      setError('Error al procesar las fechas.');
      console.error(err);
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    // Check if the file is an Excel file
    if (!file.name.match(/\.(xls|xlsx)$/i)) {
      setError('Por favor, seleccione un archivo Excel (.xls o .xlsx)');
      return;
    }

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const records = XLSX.utils.sheet_to_json(worksheet) as AttendanceRecord[];
      
      setRawRecords(records);
      
      const dates = records.map(r => parse(r['Fecha/Hora'].split(' ')[0], 'yyyy-MM-dd', new Date()));
      const firstDate = new Date(Math.min(...dates.map(d => d.getTime())));
      
      setSelectedPeriod({
        month: startOfMonth(firstDate),
        fortnight: firstDate.getDate() <= 15 ? 1 : 2
      });
      
      const { start, end } = getFortnightDates(firstDate, firstDate.getDate() <= 15 ? 1 : 2);
      
      const analysisResults = analyzeAttendance(records, start, end, preferences);
      setResults(analysisResults);
      setError('');
    } catch (err) {
      setError('Error al procesar el archivo. Asegúrese de que el formato sea correcto.');
      console.error(err);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = parse(dateStr, 'yyyy-MM-dd HH:mm:ss', new Date());
    return format(date, 'HH:mm');
  };

  const formatDate = (dateStr: string) => {
    const date = parse(dateStr, 'yyyy-MM-dd', new Date());
    return format(date, "EEEE d 'de' MMMM", { locale: es });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="fixed top-4 right-4 z-10 flex gap-2">
        {results.length > 0 && (
          <button
            onClick={() => exportToExcel(results, columns)}
            className="p-2 text-gray-600 hover:text-gray-800 bg-white rounded-full shadow-md hover:shadow-lg transition-all"
            title="Descargar Excel"
          >
            <Download className="w-6 h-6" />
          </button>
        )}
        <ColumnVisibilityMenu
          columns={columns}
          onChange={setColumns}
        />
        <button
          onClick={() => setShowPreferences(true)}
          className="p-2 text-gray-600 hover:text-gray-800 bg-white rounded-full shadow-md hover:shadow-lg transition-all"
          title="Preferencias"
        >
          <Settings className="w-6 h-6" />
        </button>
      </div>
      <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4 flex items-center justify-center gap-3">
            <FileSpreadsheet className="w-10 h-10 text-red-500" />
            Análisis de Asistencia
          </h1>
          <p className="text-lg text-gray-600">
            Cargue su archivo XLS/XLSX para analizar los registros de asistencia
          </p>
        </div>

        <div className="max-w-6xl mx-auto">
          <label
            htmlFor="file-upload"
            className={`flex justify-center w-full h-32 px-4 transition bg-white border-2 border-dashed rounded-md appearance-none cursor-pointer focus:outline-none ${
              isDragging 
                ? 'border-indigo-500 bg-indigo-50' 
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <span className="flex flex-col items-center justify-center space-y-2">
              <FileUp className="w-6 h-6 text-gray-600" />
              <span className={`font-medium ${isDragging ? 'text-indigo-600' : 'text-gray-600'}`}>
                {isDragging 
                  ? 'Suelte el archivo aquí'
                  : 'Haga clic para seleccionar un archivo o arrástrelo aquí'
                }
              </span>
              <span className="text-sm text-gray-500">
                Solo archivos Excel (.xls, .xlsx)
              </span>
            </span>
            <input
              id="file-upload"
              type="file"
              className="hidden"
              accept=".xls,.xlsx"
              onChange={handleFileUpload}
            />
          </label>

          {error && (
            <div className="mt-4 p-4 bg-red-50 rounded-md">
              <div className="flex">
                <AlertCircle className="h-5 w-5 text-red-400" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">{error}</h3>
                </div>
              </div>
            </div>
          )}

          {rawRecords.length > 0 && (
            <div className="mt-6 bg-white p-4 rounded-lg shadow-sm">
              <div className="flex flex-col items-center space-y-4">
                <FortnightSelector
                  value={selectedPeriod}
                  onChange={handlePeriodChange}
                />
                
                {/* Holidays Display */}
                <div className="w-full max-w-2xl">
                  {isLoadingHolidays ? (
                    <div className="text-center text-sm text-gray-500">
                      Cargando feriados...
                    </div>
                  ) : holidayError ? (
                    <div className="text-center text-sm text-red-500">
                      {holidayError}
                    </div>
                  ) : holidays.length === 0 ? (
                    <div className="text-center text-sm text-gray-500">
                      No se pudieron cargar los feriados
                    </div>
                  ) : holidays.filter(holiday => {
                      const holidayDate = parse(holiday.fecha, 'yyyy-MM-dd', new Date());
                      const { start, end } = getFortnightDates(selectedPeriod.month, selectedPeriod.fortnight);
                      return isWithinInterval(holidayDate, { start, end });
                    }).length === 0 ? (
                    <div className="text-center text-sm text-gray-500">
                      No hay feriados en esta quincena
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {holidays
                        .filter(holiday => {
                          const holidayDate = parse(holiday.fecha, 'yyyy-MM-dd', new Date());
                          const holidayMonth = holidayDate.getMonth();
                          const holidayYear = holidayDate.getFullYear();
                          const selectedMonth = selectedPeriod.month.getMonth();
                          const selectedYear = selectedPeriod.month.getFullYear();
                          
                          // Only show holidays from the selected month and year
                          if (holidayMonth !== selectedMonth || holidayYear !== selectedYear) {
                            return false;
                          }
                          
                          const day = holidayDate.getDate();
                          return selectedPeriod.fortnight === 1 
                            ? day >= 1 && day <= 15
                            : day >= 16;
                        })
                        .map(holiday => (
                          <div
                            key={holiday.fecha}
                            className="flex items-center gap-2 text-sm bg-orange-50 p-2 rounded-md"
                          >
                            <div className="w-2 h-2 rounded-full bg-orange-400" />
                            <span className="font-medium">
                              {format(parse(holiday.fecha, 'yyyy-MM-dd', new Date()), "EEEE d 'de' MMMM", { locale: es })}
                            </span>
                            <span className="text-gray-600">
                              - {holiday.nombre} ({holiday.tipo})
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {results.length > 0 && (
            <div className="mt-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Resultados del Análisis</h2>
              
              {/* Main Results Table */}
              <div className="space-y-8">
                <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="w-10 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <span className="sr-only">Marcar</span>
                        </th>
                        {columns.filter(col => col.visible).map(column => (
                          <th
                            key={column.id}
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {results.filter(r => !markedPeople.has(r.name)).map((result, index) => (
                        <React.Fragment key={index}>
                          <tr 
                            className={`hover:bg-gray-50 cursor-pointer ${
                              expandedPerson === result.name ? 'bg-gray-50' : ''
                            }`}
                            ref={selectedIndex === index ? selectedRowRef : null}
                            onClick={() => {
                              setSelectedIndex(index);
                              setExpandedPerson(
                                expandedPerson === result.name ? null : result.name
                              );
                            }}
                          >
                            <td className="w-10 px-2 py-4 whitespace-nowrap text-center" onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={markedPeople.has(result.name)}
                                onChange={() => {
                                  const newMarked = new Set(markedPeople);
                                  if (markedPeople.has(result.name)) {
                                    newMarked.delete(result.name);
                                  } else {
                                    newMarked.add(result.name);
                                  }
                                  setMarkedPeople(newMarked);
                                }}
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded cursor-pointer"
                              />
                            </td>
                            {columns.filter(col => col.visible).map(column => {
                              let content;
                              switch (column.id) {
                                case 'name':
                                  content = (
                                    <span className={`font-medium ${
                                      Object.entries(result.dailyRecords).some(([date, records]) => {
                                        const dateObj = parse(date, 'yyyy-MM-dd', new Date());
                                        const { start, end } = getFortnightDates(selectedPeriod.month, selectedPeriod.fortnight);
                                        
                                        // Solo verificar días dentro del rango seleccionado
                                        if (!isWithinInterval(dateObj, { start, end })) {
                                          return false;
                                        }
                                        
                                        // Ignorar fines de semana
                                        if (dateObj.getDay() === 0 || dateObj.getDay() === 6) {
                                          return false;
                                        }
                                        
                                        const hasEntryRecord = records.some(r => r['Tipo de registro'] === 'In');
                                        const hasExitRecord = records.some(r => r['Tipo de registro'] === 'Out');
                                        
                                        const schedule = result.schedule || preferences.regularSchedule;
                                        const scheduleStart = schedule.startTime;
                                        const scheduleEnd = schedule.endTime;
                                        
                                        let entryTime = 0;
                                        let exitTime = 0;
                                        
                                        if (hasEntryRecord) {
                                          const entryRecord = records.find(r => r['Tipo de registro'] === 'In');
                                          const entryDate = parse(entryRecord!['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
                                          entryTime = entryDate.getHours() * 60 + entryDate.getMinutes();
                                        }
                                        
                                        if (hasExitRecord) {
                                          const exitRecord = records.find(r => r['Tipo de registro'] === 'Out');
                                          const exitDate = parse(exitRecord!['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
                                          exitTime = exitDate.getHours() * 60 + exitDate.getMinutes();
                                        }
                                        
                                        const isVeryLate = entryTime > scheduleStart + 60;
                                        const isVeryEarly = hasExitRecord && exitTime < scheduleEnd - 60;
                                        
                                        return !hasEntryRecord || !hasExitRecord || isVeryLate || isVeryEarly;
                                      })
                                        ? 'text-red-600'
                                        : 'text-gray-900'
                                    }`}>{result.name}</span>
                                  );
                                  break;
                                case 'schedule':
                                  content = (
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                      result.schedule?.startTime === preferences.earlySchedule.startTime
                                        ? 'bg-purple-100 text-purple-800'
                                        : 'bg-blue-100 text-blue-800'
                                    }`}>
                                      {result.schedule?.startTime === preferences.earlySchedule.startTime ? (
                                        `${Math.floor(preferences.earlySchedule.startTime / 60)}:${String(preferences.earlySchedule.startTime % 60).padStart(2, '0')} - ${Math.floor(preferences.earlySchedule.endTime / 60)}:${String(preferences.earlySchedule.endTime % 60).padStart(2, '0')}`
                                      ) : (
                                        `${Math.floor(preferences.regularSchedule.startTime / 60)}:${String(preferences.regularSchedule.startTime % 60).padStart(2, '0')} - ${Math.floor(preferences.regularSchedule.endTime / 60)}:${String(preferences.regularSchedule.endTime % 60).padStart(2, '0')}`
                                      )}
                                    </span>
                                  );
                                  break;
                                case 'absences':
                                  content = (
                                    <span className="font-medium text-gray-500">
                                      {result.absences}
                                    </span>
                                  );
                                  break;
                                case 'daysRegistered':
                                  content = result.daysRegistered;
                                  break;
                                case 'lateDays':
                                  content = result.lateDays || '-';
                                  break;
                                case 'lateMinutes':
                                  content = result.lateMinutes || '-';
                                  break;
                                case 'lateHours':
                                  content = (
                                    <span className="font-bold text-gray-900">
                                      {result.lateHours || '-'}
                                    </span>
                                  );
                                  break;
                                case 'overtimeHours':
                                  content = result.overtimeHours || '-';
                                  break;
                                case 'saturdayHours':
                                  content = result.saturdayHours || '-';
                                  break;
                                case 'totalHours':
                                  content = (
                                    <span className="font-bold text-gray-900">
                                      {result.totalHours || '-'}
                                    </span>
                                  );
                                  break;
                              }
                              return (
                                <td key={column.id} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {content}
                                </td>
                              );
                            })}
                          </tr>
                          {expandedPerson === result.name && (
                            <tr>
                              <td colSpan={columns.filter(col => col.visible).length + 1} className="px-6 py-4 bg-gray-50">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {(() => {
                                    const { start, end } = getFortnightDates(selectedPeriod.month, selectedPeriod.fortnight);
                                    const allDays = preferences.showAllDays 
                                      ? eachDayOfInterval({ start, end })
                                      : Object.keys(result.dailyRecords)
                                        .map(date => parse(date, 'yyyy-MM-dd', new Date()))
                                        .filter(date => isWithinInterval(date, { start, end }));

                                    return allDays.map(dateObj => {
                                      const date = format(dateObj, 'yyyy-MM-dd');
                                      const records = result.dailyRecords[date] || [];
                                      
                                      const isSaturday = dateObj.getDay() === 6;
                                      const isSunday = dateObj.getDay() === 0;
                                      const hasRecords = records.length > 0;

                                      if (isSunday) return null;

                                      const { lateMinutes, overtimeHours, lateHours } = analyzeDayRecords(
                                        records,
                                        result.schedule || preferences.regularSchedule,
                                        preferences
                                      );

                                      // Check for incomplete records based on new criteria
                                      const hasEntryRecord = records.some(r => r['Tipo de registro'] === 'In');
                                      const hasExitRecord = records.some(r => r['Tipo de registro'] === 'Out');
                                      
                                      const schedule = result.schedule || preferences.regularSchedule;
                                      const scheduleStart = schedule.startTime;
                                      const scheduleEnd = schedule.endTime;
                                      
                                      let entryTime = 0;
                                      let exitTime = 0;
                                      
                                      if (hasEntryRecord) {
                                        const entryRecord = records.find(r => r['Tipo de registro'] === 'In');
                                        const entryDate = parse(entryRecord!['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
                                        entryTime = entryDate.getHours() * 60 + entryDate.getMinutes();
                                      }
                                      
                                      if (hasExitRecord) {
                                        const exitRecord = records.find(r => r['Tipo de registro'] === 'Out');
                                        const exitDate = parse(exitRecord!['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
                                        exitTime = exitDate.getHours() * 60 + exitDate.getMinutes();
                                      }
                                      
                                      const isVeryLate = entryTime > scheduleStart + 60;
                                      const isVeryEarly = hasExitRecord && exitTime < scheduleEnd - 60;
                                      
                                      const hasMissingRecords = !isSaturday && (
                                        !hasEntryRecord || 
                                        !hasExitRecord || 
                                        isVeryLate || 
                                        isVeryEarly
                                      );
                                      
                                      let saturdayHours = 0;
                                      
                                      if (isSaturday && records.length >= 2) {
                                        const firstRecord = parse(records[0]['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
                                        const lastRecord = parse(records[records.length - 1]['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
                                        saturdayHours = Math.round((differenceInMinutes(lastRecord, firstRecord) / 60) * 2) / 2;
                                      }

                                      return (
                                        <div 
                                          key={date} 
                                          className={getDateCellStyles({
                                            date: dateObj,
                                            records,
                                            hasRecords,
                                            hasMissingRecords,
                                            isHoliday: holidays.some(holiday => 
                                              format(parse(holiday.fecha, 'yyyy-MM-dd', new Date()), 'yyyy-MM-dd') === date
                                            )
                                          })}
                                        >
                                          <h4 className="font-medium text-gray-900 mb-1 capitalize text-xs">
                                            {formatDate(date)}
                                          </h4>
                                          {hasRecords ? (
                                            <div className="space-y-1">
                                              {records.map((record, idx) => (
                                                <div key={idx} className="flex items-center gap-1 text-xs">
                                                  <Clock className="w-3 h-3 text-gray-400" />
                                                  <span className="text-gray-600">
                                                    {formatTime(record['Fecha/Hora'])}
                                                  </span>
                                                  <span className="text-gray-400">
                                                    ({record['Tipo de registro']})
                                                  </span>
                                                </div>
                                              ))}
                                              {lateMinutes > 0 && (
                                                <div className="text-xs text-red-500">
                                                  {lateMinutes} minutos tarde
                                                </div>
                                              )}
                                              {overtimeHours > 0 && (
                                                <div className="text-xs text-green-500">
                                                  {overtimeHours} horas extra
                                                </div>
                                              )}
                                              {isSaturday && saturdayHours > 0 && (
                                                <div className="text-xs text-blue-500">
                                                  {saturdayHours} horas sábado
                                                </div>
                                              )}
                                              {hasMissingRecords && (
                                                <div className="text-xs text-red-500">
                                                  Registro incompleto
                                                </div>
                                              )}
                                            </div>
                                          ) : (
                                            <div className="text-xs text-gray-400">
                                              Sin registros
                                            </div>
                                          )}
                                        </div>
                                      );
                                    });
                                  })()}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {markedPeople.size > 0 && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Personas Marcadas</h3>
                    <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="w-10 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" onClick={e => e.stopPropagation()}>
                              <span className="sr-only">Desmarcar</span>
                            </th>
                            {columns.filter(col => col.visible).map(column => (
                              <th
                                key={column.id}
                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                              >
                                {column.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {results.filter(r => markedPeople.has(r.name)).map((result, index) => (
                            <React.Fragment key={index}>
                              <tr 
                                className={`hover:bg-gray-50 cursor-pointer ${
                                  expandedPerson === result.name ? 'bg-gray-50' : ''
                                }`}
                                onClick={() => {
                                  setExpandedPerson(
                                    expandedPerson === result.name ? null : result.name
                                  );
                                }}
                              >
                              <td className="w-10 px-2 py-4 whitespace-nowrap text-center" onClick={e => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={true}
                                  onChange={() => {
                                    const newMarked = new Set(markedPeople);
                                    newMarked.delete(result.name);
                                    setMarkedPeople(newMarked);
                                  }}
                                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded cursor-pointer"
                                />
                              </td>
                              {columns.filter(col => col.visible).map(column => {
                                let content;
                                switch (column.id) {
                                  case 'name':
                                    content = (
                                      <span className={`font-medium ${
                                        Object.entries(result.dailyRecords).some(([date, records]) => {
                                          const dateObj = parse(date, 'yyyy-MM-dd', new Date());
                                          const { start, end } = getFortnightDates(selectedPeriod.month, selectedPeriod.fortnight);
                                          
                                          if (!isWithinInterval(dateObj, { start, end })) {
                                            return false;
                                          }
                                          
                                          if (dateObj.getDay() === 0 || dateObj.getDay() === 6) {
                                            return false;
                                          }
                                          
                                          const hasEntryRecord = records.some(r => r['Tipo de registro'] === 'In');
                                          const hasExitRecord = records.some(r => r['Tipo de registro'] === 'Out');
                                          
                                          const schedule = result.schedule || preferences.regularSchedule;
                                          const scheduleStart = schedule.startTime;
                                          const scheduleEnd = schedule.endTime;
                                          
                                          let entryTime = 0;
                                          let exitTime = 0;
                                          
                                          if (hasEntryRecord) {
                                            const entryRecord = records.find(r => r['Tipo de registro'] === 'In');
                                            const entryDate = parse(entryRecord!['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
                                            entryTime = entryDate.getHours() * 60 + entryDate.getMinutes();
                                          }
                                          
                                          if (hasExitRecord) {
                                            const exitRecord = records.find(r => r['Tipo de registro'] === 'Out');
                                            const exitDate = parse(exitRecord!['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
                                            exitTime = exitDate.getHours() * 60 + exitDate.getMinutes();
                                          }
                                          
                                          const isVeryLate = entryTime > scheduleStart + 60;
                                          const isVeryEarly = hasExitRecord && exitTime < scheduleEnd - 60;
                                          
                                          return !hasEntryRecord || !hasExitRecord || isVeryLate || isVeryEarly;
                                        })
                                          ? 'text-red-600'
                                          : 'text-gray-900'
                                      }`}>{result.name}</span>
                                    );
                                    break;
                                  case 'schedule':
                                    content = (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        result.schedule?.startTime === preferences.earlySchedule.startTime
                                          ? 'bg-purple-100 text-purple-800'
                                          : 'bg-blue-100 text-blue-800'
                                      }`}>
                                        {result.schedule?.startTime === preferences.earlySchedule.startTime ? (
                                          `${Math.floor(preferences.earlySchedule.startTime / 60)}:${String(preferences.earlySchedule.startTime % 60).padStart(2, '0')} - ${Math.floor(preferences.earlySchedule.endTime / 60)}:${String(preferences.earlySchedule.endTime % 60).padStart(2, '0')}`
                                        ) : (
                                          `${Math.floor(preferences.regularSchedule.startTime / 60)}:${String(preferences.regularSchedule.startTime % 60).padStart(2, '0')} - ${Math.floor(preferences.regularSchedule.endTime / 60)}:${String(preferences.regularSchedule.endTime % 60).padStart(2, '0')}`
                                        )}
                                      </span>
                                    );
                                    break;
                                  case 'absences':
                                    content = (
                                      <span className="font-medium text-gray-500">
                                        {result.absences}
                                      </span>
                                    );
                                    break;
                                  case 'daysRegistered':
                                    content = result.daysRegistered;
                                    break;
                                  case 'lateDays':
                                    content = result.lateDays || '-';
                                    break;
                                  case 'lateMinutes':
                                    content = result.lateMinutes || '-';
                                    break;
                                  case 'lateHours':
                                    content = (
                                      <span className="font-bold text-gray-900">
                                        {result.lateHours || '-'}
                                      </span>
                                    );
                                    break;
                                  case 'overtimeHours':
                                    content = result.overtimeHours || '-';
                                    break;
                                  case 'saturdayHours':
                                    content = result.saturdayHours || '-';
                                    break;
                                  case 'totalHours':
                                    content = (
                                      <span className="font-bold text-gray-900">
                                        {result.totalHours || '-'}
                                      </span>
                                    );
                                    break;
                                }
                                return (
                                  <td key={column.id} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {content}
                                  </td>
                                );
                              })}
                            </tr>
                            {expandedPerson === result.name && (
                              <tr>
                                <td colSpan={columns.filter(col => col.visible).length + 1} className="px-6 py-4 bg-gray-50">
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {(() => {
                                      const { start, end } = getFortnightDates(selectedPeriod.month, selectedPeriod.fortnight);
                                      const allDays = preferences.showAllDays 
                                        ? eachDayOfInterval({ start, end })
                                        : Object.keys(result.dailyRecords)
                                          .map(date => parse(date, 'yyyy-MM-dd', new Date()))
                                          .filter(date => isWithinInterval(date, { start, end }));

                                      return allDays.map(dateObj => {
                                        const date = format(dateObj, 'yyyy-MM-dd');
                                        const records = result.dailyRecords[date] || [];
                                        
                                        const isSaturday = dateObj.getDay() === 6;
                                        const isSunday = dateObj.getDay() === 0;
                                        const hasRecords = records.length > 0;

                                        if (isSunday) return null;

                                        const { lateMinutes, overtimeHours, lateHours } = analyzeDayRecords(
                                          records,
                                          result.schedule || preferences.regularSchedule,
                                          preferences
                                        );

                                        const hasEntryRecord = records.some(r => r['Tipo de registro'] === 'In');
                                        const hasExitRecord = records.some(r => r['Tipo de registro'] === 'Out');
                                        
                                        const schedule = result.schedule || preferences.regularSchedule;
                                        const scheduleStart = schedule.startTime;
                                        const scheduleEnd = schedule.endTime;
                                        
                                        let entryTime = 0;
                                        let exitTime = 0;
                                        
                                        if (hasEntryRecord) {
                                          const entryRecord = records.find(r => r['Tipo de registro'] === 'In');
                                          const entryDate = parse(entryRecord!['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
                                          entryTime = entryDate.getHours() * 60 + entryDate.getMinutes();
                                        }
                                        
                                        if (hasExitRecord) {
                                          const exitRecord = records.find(r => r['Tipo de registro'] === 'Out');
                                          const exitDate = parse(exitRecord!['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
                                          exitTime = exitDate.getHours() * 60 + exitDate.getMinutes();
                                        }
                                        
                                        const isVeryLate = entryTime > scheduleStart + 60;
                                        const isVeryEarly = hasExitRecord && exitTime < scheduleEnd - 60;
                                        
                                        const hasMissingRecords = !isSaturday && (
                                          !hasEntryRecord || 
                                          !hasExitRecord || 
                                          isVeryLate || 
                                          isVeryEarly
                                        );
                                        
                                        let saturdayHours = 0;
                                        
                                        if (isSaturday && records.length >= 2) {
                                          const firstRecord = parse(records[0]['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
                                          const lastRecord = parse(records[records.length - 1]['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
                                          saturdayHours = Math.round((differenceInMinutes(lastRecord, firstRecord) / 60) * 2) / 2;
                                        }

                                        return (
                                          <div 
                                            key={date} 
                                            className={getDateCellStyles({
                                              date: dateObj,
                                              records,
                                              hasRecords,
                                              hasMissingRecords,
                                              isHoliday: holidays.some(holiday => 
                                                format(parse(holiday.fecha, 'yyyy-MM-dd', new Date()), 'yyyy-MM-dd') === date
                                              )
                                            })}
                                          >
                                            <h4 className="font-medium text-gray-900 mb-1 capitalize text-xs">
                                              {formatDate(date)}
                                            </h4>
                                            {hasRecords ? (
                                              <div className="space-y-1">
                                                {records.map((record, idx) => (
                                                  <div key={idx} className="flex items-center gap-1 text-xs">
                                                    <Clock className="w-3 h-3 text-gray-400" />
                                                    <span className="text-gray-600">
                                                      {formatTime(record['Fecha/Hora'])}
                                                    </span>
                                                    <span className="text-gray-400">
                                                      ({record['Tipo de registro']})
                                                    </span>
                                                  </div>
                                                ))}
                                                {lateMinutes > 0 && (
                                                  <div className="text-xs text-red-500">
                                                    {lateMinutes} minutos tarde
                                                  </div>
                                                )}
                                                {overtimeHours > 0 && (
                                                  <div className="text-xs text-green-500">
                                                    {overtimeHours} horas extra
                                                  </div>
                                                )}
                                                {isSaturday && saturdayHours > 0 && (
                                                  <div className="text-xs text-blue-500">
                                                    {saturdayHours} horas sábado
                                                  </div>
                                                )}
                                                {hasMissingRecords && (
                                                  <div className="text-xs text-red-500">
                                                    Registro incompleto
                                                  </div>
                                                )}
                                              </div>
                                            ) : (
                                              <div className="text-xs text-gray-400">
                                                Sin registros
                                              </div>
                                            )}
                                          </div>
                                        );
                                      });
                                    })()}
                                  </div>
                                </td>
                              </tr>
                            )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Keyboard Navigation Legend */}
              <div className="mt-8 bg-white p-4 rounded-lg shadow-sm">
                <h3 className="text-sm font-medium text-gray-900 mb-3">Información</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <ArrowLeft className="w-4 h-4" />
                        <ArrowRight className="w-4 h-4" />
                      </span>
                      <span>Navegar entre personas</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-red-600">Nombre en rojo</span>
                      <span className="text-gray-600">indica registros incompletos o irregulares</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {showPreferences && (
        <PreferencesDialog
          isOpen={showPreferences}
          onClose={() => setShowPreferences(false)}
          preferences={preferences}
          onSave={setPreferences}
        />
      )}
    </div>
  );
}

export default App;