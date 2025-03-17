import { parse, format, differenceInMinutes, isWeekend, isWithinInterval } from 'date-fns';
import { AttendanceRecord, AnalysisResult, DailyAnalysis, Schedule, PreferencesConfig } from '../types';

function getCompanyWorkdays(allRecords: AttendanceRecord[], startDate: Date, endDate: Date): Set<string> {
  // Group all records by date to find days with at least one record
  const workdays = new Set<string>();
  
  allRecords.forEach(record => {
    const date = record['Fecha/Hora'].split(' ')[0];
    const recordDate = parse(date, 'yyyy-MM-dd', new Date());
    
    // Only include weekdays (Monday-Friday) within the date range
    if (
      !isWeekend(recordDate) &&
      isWithinInterval(recordDate, { start: startDate, end: endDate })
    ) {
      workdays.add(date);
    }
  });
  
  return workdays;
}

export const DEFAULT_PREFERENCES: PreferencesConfig = {
  regularSchedule: {
    startTime: 8 * 60,    // 8:00
    endTime: 17 * 60,     // 17:00
    lunchStart: 12 * 60,  // 12:00
    lunchEnd: 13 * 60     // 13:00
  },
  earlySchedule: {
    startTime: 7 * 60,    // 7:00
    endTime: 16 * 60,     // 16:00
    lunchStart: 12 * 60,  // 12:00
    lunchEnd: 13 * 60     // 13:00
  },
  duplicateThresholdMinutes: 5,
  lunchDuration: 60,
  overtimeThresholds: {
    fullHour: 55,
    halfHour: 25
  },
  lateThresholds: {
    fullHour: 35,
    halfHour: 5
  },
  showAllDays: true
};

function detectSchedule(records: AttendanceRecord[], preferences: PreferencesConfig): Schedule {
  // Get all entry times for non-weekend days
  const entryTimes = records
    .filter(record => {
      const date = parse(record['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
      return !isWeekend(date) && record['Tipo de registro'] === 'In';
    })
    .map(record => {
      const date = parse(record['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
      return date.getHours() * 60 + date.getMinutes();
    });

  // Get all departure times for non-weekend days
  const departureTimes = records
    .filter(record => {
      const date = parse(record['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
      return !isWeekend(date) && record['Tipo de registro'] === 'Out';
    })
    .map(record => {
      const date = parse(record['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
      return date.getHours() * 60 + date.getMinutes();
    });

  // Calculate average entry and departure times
  const avgEntryTime = entryTimes.reduce((sum, time) => sum + time, 0) / entryTimes.length;
  const avgDepartureTime = departureTimes.reduce((sum, time) => sum + time, 0) / departureTimes.length;

  // If average entry time is closer to 7:00 and average departure time is closer to 16:00,
  // consider it an early schedule
  const isEarlySchedule = 
    Math.abs(avgEntryTime - preferences.earlySchedule.startTime) < Math.abs(avgEntryTime - preferences.regularSchedule.startTime) &&
    Math.abs(avgDepartureTime - preferences.earlySchedule.endTime) < Math.abs(avgDepartureTime - preferences.regularSchedule.endTime);

  return isEarlySchedule ? preferences.earlySchedule : preferences.regularSchedule;
}

function filterDuplicateRecords(records: AttendanceRecord[], preferences: PreferencesConfig): AttendanceRecord[] {
  // Sort records by date/time
  const sortedRecords = [...records].sort((a, b) => 
    new Date(a['Fecha/Hora']).getTime() - new Date(b['Fecha/Hora']).getTime()
  );

  return sortedRecords.reduce((acc: AttendanceRecord[], current, index) => {
    if (index === 0) {
      return [current];
    }

    const prevRecord = acc[acc.length - 1];
    const prevTime = parse(prevRecord['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
    const currentTime = parse(current['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());

    // If the time difference is greater than the threshold or it's a different type of record,
    // add the current record
    if (
      differenceInMinutes(currentTime, prevTime) > preferences.duplicateThresholdMinutes ||
      current['Tipo de registro'] !== prevRecord['Tipo de registro'] ||
      current.Operacion !== prevRecord.Operacion
    ) {
      acc.push(current);
    }

    return acc;
  }, []);
}

export function analyzeAttendance(
  records: AttendanceRecord[],
  startDate: Date,
  endDate: Date,
  preferences: PreferencesConfig = DEFAULT_PREFERENCES
): AnalysisResult[] {
  // Get all company workdays first
  const companyWorkdays = getCompanyWorkdays(records, startDate, endDate);

  // Group records by name instead of user ID
  const userRecords = records.reduce((acc, record) => {
    const name = record.Nombre;
    if (!acc[name]) {
      acc[name] = [];
    }
    acc[name].push(record);
    return acc;
  }, {} as Record<string, AttendanceRecord[]>);

  return Object.entries(userRecords).map(([userName, userRecords]) => {
    // Filter out duplicate records
    const filteredRecords = filterDuplicateRecords(userRecords, preferences);
    
    // Detect schedule type for this user
    const schedule = detectSchedule(filteredRecords, preferences);
    
    const dailyRecords = groupByDay(filteredRecords);
    
    let totalLateDays = 0;
    let totalLateMinutes = 0;
    let totalAbsences = 0;
    let totalLateHours = 0;
    let totalOvertimeHours = 0;
    let totalSaturdayHours = 0;

    Object.entries(dailyRecords).forEach(([date, dayRecords]) => {
      const dateObj = parse(date, 'yyyy-MM-dd', new Date());
      
      // Skip if date is outside the selected range
      if (!isWithinInterval(dateObj, { start: startDate, end: endDate })) {
        return;
      }
      
      if (isWeekend(dateObj)) {
        // Calculate Saturday hours
        if (dayRecords.length >= 2) {
          const firstRecord = parse(dayRecords[0]['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
          const lastRecord = parse(dayRecords[dayRecords.length - 1]['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
          const hours = (differenceInMinutes(lastRecord, firstRecord) / 60);
          totalSaturdayHours += hours;
        }
        return;
      }

      // Analyze regular workday
      const { lateMinutes, overtimeHours, lateHours } = analyzeDayRecords(dayRecords, schedule, preferences);
      
      if (lateMinutes > 0) {
        totalLateDays++;
        totalLateMinutes += lateMinutes;
        totalLateHours += lateHours;
      }
      
      totalOvertimeHours += overtimeHours;
    });

    // Calculate absences by comparing user's workdays with all workdays in the company
    const userWorkdays = new Set<string>();
    Object.keys(dailyRecords).forEach(date => {
      const dateObj = parse(date, 'yyyy-MM-dd', new Date());
      if (!isWeekend(dateObj) && isWithinInterval(dateObj, { start: startDate, end: endDate })) {
        userWorkdays.add(date);
      }
    });
    
    // Find days where the person was absent
    companyWorkdays.forEach(date => {
      if (!userWorkdays.has(date)) {
        totalAbsences++;
      }
    });

    const roundedOvertimeHours = Math.round(totalOvertimeHours * 2) / 2;
    const roundedSaturdayHours = Math.round(totalSaturdayHours * 2) / 2;

    return {
      name: userName,
      schedule,
      daysRegistered: Object.keys(dailyRecords).filter(date => 
        isWithinInterval(parse(date, 'yyyy-MM-dd', new Date()), { start: startDate, end: endDate })
      ).length,
      absences: totalAbsences,
      lateHours: totalLateHours,
      lateDays: totalLateDays,
      lateMinutes: totalLateMinutes,
      overtimeHours: roundedOvertimeHours,
      saturdayHours: roundedSaturdayHours,
      totalHours: roundedOvertimeHours + roundedSaturdayHours,
      dailyRecords
    };
  });
}

function groupByDay(records: AttendanceRecord[]): Record<string, AttendanceRecord[]> {
  return records.reduce((acc, record) => {
    const date = record['Fecha/Hora'].split(' ')[0];
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(record);
    return acc;
  }, {} as Record<string, AttendanceRecord[]>);
}

export function analyzeDayRecords(
  records: AttendanceRecord[],
  schedule: Schedule,
  preferences: PreferencesConfig
): { lateMinutes: number; overtimeHours: number; lateHours: number } {
  let lateMinutes = 0;
  let lateHours = 0;
  let overtimeHours = 0;

  // Filter duplicates and sort by time
  const filteredRecords = filterDuplicateRecords(records, preferences);

  // Check if it's a Saturday
  if (filteredRecords.length > 0) {
    const firstRecord = parse(filteredRecords[0]['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
    if (firstRecord.getDay() === 6) {
      // Return 0 late minutes and hours for Saturdays
      return { lateMinutes: 0, overtimeHours, lateHours: 0 };
    }
  }

  // Calculate total worked minutes for the day
  let totalWorkedMinutes = 0;
  let earlyArrivalOvertime = 0;
  
  // Check morning arrival
  if (filteredRecords.length > 0) {
    const firstRecord = parse(filteredRecords[0]['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
    const lastRecord = parse(filteredRecords[filteredRecords.length - 1]['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
    const arrivalMinutes = firstRecord.getHours() * 60 + firstRecord.getMinutes();
    const departureMinutes = lastRecord.getHours() * 60 + lastRecord.getMinutes();
    
    // Calculate total worked minutes
    totalWorkedMinutes = differenceInMinutes(lastRecord, firstRecord);
    
    // Subtract lunch break duration if it exists
    const breakOutRecord = filteredRecords.find(r => r['Tipo de registro'] === 'Break' && r.Operacion === 'Out');
    const breakInRecord = filteredRecords.find(r => r['Tipo de registro'] === 'Break' && r.Operacion === 'In');
    
    if (breakOutRecord && breakInRecord) {
      const breakOut = parse(breakOutRecord['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
      const breakIn = parse(breakInRecord['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
      totalWorkedMinutes -= differenceInMinutes(breakIn, breakOut);
    }

    if (schedule === preferences.regularSchedule) {
      // Regular schedule overtime rules
      if (arrivalMinutes < schedule.startTime) {
        if (arrivalMinutes <= 7 * 60 + 5) { // Before 7:05
          earlyArrivalOvertime = 1;
        } else if (arrivalMinutes <= 7 * 60 + 30) { // Before 7:30
          earlyArrivalOvertime = 0.5;
        }
      } else if (arrivalMinutes > schedule.startTime) {
        const minutesLate = arrivalMinutes - schedule.startTime;
        lateMinutes += minutesLate;
        
        // Calculate late hours
        if (minutesLate > preferences.lateThresholds.halfHour && minutesLate <= preferences.lateThresholds.fullHour) {
          lateHours += 0.5;
        } else if (minutesLate > preferences.lateThresholds.fullHour) {
          lateHours += 1;
        }
      }
    } else {
      // Early schedule - no overtime for early arrival
      if (arrivalMinutes > schedule.startTime) {
        const minutesLate = arrivalMinutes - schedule.startTime;
        lateMinutes += minutesLate;
        
        if (minutesLate > preferences.lateThresholds.halfHour && minutesLate <= preferences.lateThresholds.fullHour) {
          lateHours += 0.5;
        } else if (minutesLate > preferences.lateThresholds.fullHour) {
          lateHours += 1;
        }
      }
    }
  }

  // Check evening departure
  if (filteredRecords.length > 0 && totalWorkedMinutes >= 480) {
    // Only count overtime if they worked at least 8 hours
    if (earlyArrivalOvertime > 0) {
      overtimeHours += earlyArrivalOvertime;
    }
    
    // Check for evening overtime
    const departureMinutes = parse(filteredRecords[filteredRecords.length - 1]['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date()).getHours() * 60 + 
      parse(filteredRecords[filteredRecords.length - 1]['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date()).getMinutes();
    
    if (departureMinutes >= schedule.endTime) {
      // Both schedules can earn overtime after their respective end times
      if (departureMinutes >= schedule.endTime + preferences.overtimeThresholds.fullHour) {
        overtimeHours += 1;
      } else if (departureMinutes >= schedule.endTime + preferences.overtimeThresholds.halfHour) {
        overtimeHours += 0.5;
      }
    }
  }

  // Check lunch break
  const breakOutRecord = filteredRecords.find(r => r['Tipo de registro'] === 'Break' && r.Operacion === 'Out');
  const breakInRecord = filteredRecords.find(r => r['Tipo de registro'] === 'Break' && r.Operacion === 'In');

  if (breakOutRecord && breakInRecord) {
    const breakOut = parse(breakOutRecord['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
    const breakIn = parse(breakInRecord['Fecha/Hora'], 'yyyy-MM-dd HH:mm:ss', new Date());
    const breakDuration = differenceInMinutes(breakIn, breakOut);
    
    if (breakDuration > preferences.lunchDuration) {
      const minutesLate = breakDuration - preferences.lunchDuration;
      lateMinutes += minutesLate;
      
      if (minutesLate > preferences.lateThresholds.halfHour && minutesLate <= preferences.lateThresholds.fullHour) {
        lateHours += 0.5;
      } else if (minutesLate > preferences.lateThresholds.fullHour) {
        lateHours += 1;
      }
    }
  }

  return { lateMinutes, overtimeHours, lateHours };
}