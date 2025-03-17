export interface AttendanceRecord {
  Departamento: string;
  'Nro. de usuario': number;
  'ID de usuario': number;
  Nombre: string;
  'Fecha/Hora': string;
  'Tipo de registro': 'In' | 'Out' | 'Break';
  Operacion?: string;
  'Descripción de la exepción': string;
  Turno: string;
  'Código de identificación': number;
  Identificación: string;
  'Código de tarea': number;
  'Dispositivo Nro.': number;
  Marcado: boolean;
}

export interface AnalysisResult {
  name: string;
  schedule?: {
    startTime: number;
    endTime: number;
    lunchStart: number;
    lunchEnd: number;
  };
  daysRegistered: number;
  lateDays: number;
  lateMinutes: number;
  absences: number;
  lateHours: number;
  overtimeHours: number;
  saturdayHours: number;
  totalHours: number;
  dailyRecords: Record<string, AttendanceRecord[]>;
}

export interface Holiday {
  fecha: string;
  tipo: string;
  nombre: string;
}

export interface Schedule {
  startTime: number;  // in minutes from midnight
  endTime: number;    // in minutes from midnight
  lunchStart: number; // in minutes from midnight
  lunchEnd: number;   // in minutes from midnight
}

export interface PreferencesConfig {
  regularSchedule: Schedule;
  earlySchedule: Schedule;
  duplicateThresholdMinutes: number;
  lunchDuration: number;
  overtimeThresholds: {
    fullHour: number;  // minutes after schedule end for full hour
    halfHour: number;  // minutes after schedule end for half hour
  };
  lateThresholds: {
    fullHour: number;  // minutes late for full hour
    halfHour: number;  // minutes late for half hour
  };
  showAllDays: boolean;  // Whether to show days without records
}
export interface DailyAnalysis {
  date: string;
  records: AttendanceRecord[];
  lateMinutes: number;
  overtimeHours: number;
  isSaturday: boolean;
  saturdayHours: number;
}