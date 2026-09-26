/**
 * Safe date formatter for Rentora bills and documents.
 * Guarantees no "Invalid Date" output and handles multiple date types.
 */
export const formatBillDate = (value: any): string => {
  if (value === null || value === undefined) return 'N/A';

  let date: Date | null = null;

  // 1. Check if value is a Firestore Timestamp (has toDate method or seconds property)
  // 1. Check if value is a Date object
  if (value instanceof Date) {
    date = value;
  }
  // 2. Check if value is a Firestore Timestamp (has toDate method or seconds property)
  else if (value && typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      date = value.toDate();
    } else if (typeof value.seconds === 'number') {
      date = new Date(value.seconds * 1000);
    }
  }
  // 3. Check if value is a number (timestamp millisecond)
  else if (typeof value === 'number') {
    date = new Date(value);
  }
  // 4. Check if value is a string
  else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 'N/A';

    // If it's already in format like "25 August 2026" or "25 Aug 2026", return it directly
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const lower = trimmed.toLowerCase();
    const hasMonthName = months.some(m => lower.includes(m));

    if (hasMonthName) {
      return trimmed;
    }

    // Try parsing ISO/standard string
    date = new Date(trimmed);
  }

  // Format valid Date object to "25 August 2026"
  if (date && !isNaN(date.getTime())) {
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // If Date parsing failed but the input is a string, return the raw string rather than "Invalid Date"
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return 'N/A';
};

export const formatShortBillDate = (value: any): string => {
  if (value === null || value === undefined) return 'N/A';

  let date: Date | null = null;

  if (value instanceof Date) {
    date = value;
  } else if (value && typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      date = value.toDate();
    } else if (typeof value.seconds === 'number') {
      date = new Date(value.seconds * 1000);
    }
  } else if (typeof value === 'number') {
    date = new Date(value);
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 'N/A';

    // Check if it's already formatted as DD-MMM-YYYY
    if (/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(trimmed)) {
      return trimmed;
    }

    date = new Date(trimmed);
  }

  if (date && !isNaN(date.getTime())) {
    const day = String(date.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return 'N/A';
};

export const parseDateSafely = (value: any): Date | null => {
  if (value === null || value === undefined) return null;

  // 1. If it's already a Date object
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  // 2. If it's a Firestore Timestamp
  if (value && typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      const d = value.toDate();
      return isNaN(d.getTime()) ? null : d;
    } else if (typeof value.seconds === 'number') {
      const d = new Date(value.seconds * 1000);
      return isNaN(d.getTime()) ? null : d;
    }
  }

  // 3. If it's a timestamp number
  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  // 4. If it's a string representation
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    // Parse formats like DD-MMM-YYYY (e.g. 17-Jul-2026)
    const match = trimmed.match(/^(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{4})$/);
    if (match) {
      const day = parseInt(match[1], 10);
      const monthStr = match[2].toLowerCase();
      const year = parseInt(match[3], 10);

      const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const monthIdx = months.indexOf(monthStr.substring(0, 3));

      if (monthIdx !== -1) {
        const d = new Date(year, monthIdx, day);
        return isNaN(d.getTime()) ? null : d;
      }
    }

    // Normal date parsing fallback
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
};


