const SESSION_TIMEZONE = 'Asia/Singapore';

const formatDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    if (raw.includes('T')) return raw.split('T')[0];
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
      const [day, month, year] = raw.split('/');
      return `${year}-${month}-${day}`;
    }
  }
  return null;
};

const formatSessionDate = (value, options = {}) => {
  const iso = formatDateOnly(value);
  if (!iso) return 'TBC';
  const date = new Date(`${iso}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return 'TBC';
  return date.toLocaleDateString('en-SG', { timeZone: SESSION_TIMEZONE, ...options });
};

const formatSessionDateLong = (value) =>
  formatSessionDate(value, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const formatSessionTime = (value, options = {}) => {
  if (!value) return 'TBC';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleTimeString('en-SG', {
      timeZone: SESSION_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...options
    });
  }
  return String(value).slice(0, 5);
};

const parseDbDateAsUtc = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/[zZ]$|[+-]\\d{2}:?\\d{2}$/.test(raw)) return new Date(raw);
  if (/^\\d{4}-\\d{2}-\\d{2} /.test(raw)) return new Date(raw.replace(' ', 'T'));
  if (/^\\d{4}-\\d{2}-\\d{2}T/.test(raw)) return new Date(raw);
  return new Date(raw);
};

const formatSgDateTime = (value) => {
  const date = parseDbDateAsUtc(value);
  if (!date || Number.isNaN(date.getTime())) return 'TBC';
  return date.toLocaleString('en-SG', { timeZone: SESSION_TIMEZONE });
};

const toSessionDateTime = (dateValue, timeValue) => {
  const iso = formatDateOnly(dateValue);
  if (!iso) return null;
  const time = timeValue ? String(timeValue).slice(0, 5) : '00:00';
  const date = new Date(`${iso}T${time}:00+08:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const isPastSession = (dateValue, timeValue) => {
  const date = toSessionDateTime(dateValue, timeValue);
  if (!date) return false;
  return date.getTime() <= Date.now();
};

module.exports = {
  formatDateOnly,
  formatSessionDate,
  formatSessionDateLong,
  formatSessionTime,
  parseDbDateAsUtc,
  formatSgDateTime,
  toSessionDateTime,
  isPastSession,
  SESSION_TIMEZONE
};
