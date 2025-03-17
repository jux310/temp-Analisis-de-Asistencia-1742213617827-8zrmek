import { isSaturday, isSunday } from 'date-fns';
import { AttendanceRecord } from '../types';

interface DateStyleProps {
  date: Date;
  records: AttendanceRecord[];
  hasRecords: boolean;
  hasMissingRecords: boolean;
  isHoliday?: boolean;
}

/**
 * Returns the appropriate CSS classes for a date cell based on its status
 * @param props Date styling configuration
 * @returns String of Tailwind CSS classes
 * @throws Error if date is null or undefined
 */
export function getDateCellStyles(props: DateStyleProps): string {
  const { date, hasRecords, hasMissingRecords, isHoliday } = props;

  if (!date) {
    throw new Error('Date is required for styling');
  }

  const baseClasses = 'p-2 rounded shadow-sm text-sm';
  const statusClasses = [];

  // Handle weekends
  if (isSunday(date)) {
    return `${baseClasses} bg-gray-50 opacity-50`; // Sundays are dimmed
  }

  if (isSaturday(date)) {
    statusClasses.push(hasRecords ? 'bg-blue-50' : 'bg-gray-100');
    return `${baseClasses} ${statusClasses.join(' ')}`;
  }

  // Handle holidays
  if (isHoliday) {
    statusClasses.push('bg-orange-50');
    return `${baseClasses} ${statusClasses.join(' ')}`;
  }

  // Handle regular workdays
  if (!hasRecords) {
    statusClasses.push('bg-gray-100'); // No records
  } else if (hasMissingRecords) {
    statusClasses.push('bg-red-50'); // Missing or incomplete records
  } else {
    statusClasses.push('bg-white'); // Complete records
  }

  return `${baseClasses} ${statusClasses.join(' ')}`;
}