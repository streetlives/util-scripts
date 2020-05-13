import moment from 'moment';
import { groupBy } from './utils';

export const getDaysInRange = (range) => {
  const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  const dayRange = range.toLowerCase();

  if (!dayRange.includes('-')) {
    const dayIndex = weekdays.findIndex(weekday => dayRange.startsWith(weekday));
    if (dayIndex === -1) {
      throw new Error(`Invalid day: ${dayRange}`);
    }

    return [dayIndex + 1];
  }

  const startingDay = dayRange.split(/[-–]/)[0].trim();
  const endingDay = dayRange.split(/[-–]/)[1].trim();

  const individualDays = [];
  const startingIndex = weekdays.findIndex(weekday => startingDay.startsWith(weekday));
  const endingIndex = weekdays.findIndex(weekday => endingDay.startsWith(weekday));

  if (startingIndex === -1 || endingIndex === -1) {
    throw new Error(`Invalid days: ${dayRange}`);
  }

  for (let i = startingIndex; i !== endingIndex; i = (i + 1) % weekdays.length) {
    individualDays.push(i + 1);
  }
  individualDays.push(endingIndex + 1);

  return individualDays;
};

export const filterDuplicateDays = (schedule) => {
  const hoursByDay = groupBy(schedule, 'day');

  return Object.keys(hoursByDay).reduce(({ deduped, skipped }, day) => {
    const hoursForDay = hoursByDay[day];

    const hasDifferentHours = hoursForDay.some(
      ({ start, end }) => hoursForDay.some(
        ({ start: otherStart, end: otherEnd }) => start !== otherStart || end !== otherEnd,
      ),
    );

    if (hasDifferentHours) {
      return { deduped, skipped: [...skipped, day] };
    }
    return { deduped: [...deduped, hoursForDay[0]], skipped };
  }, { deduped: [], skipped: [] });
};

export const to24HourFormat = time => moment(time, ['h:mmA']).format('HH:mm');

export const ensureMinutesSpecified = time => time.replace(
  /^([\d]+)([^:\d]|$)/,
  (_, hour, next) => `${hour}:00${next}`,
);

export const ensureAmPmSpecified = ({ start, end }) => {
  if (start.endsWith('am') || start.endsWith('pm')) return { start, end };

  const startHour = parseInt(start.split(':')[0], 10) % 12;
  const endHour = parseInt(end.split(':')[0], 10) % 12;

  const endSign = end.slice(end.length - 2);

  if (startHour <= endHour) {
    return { start: `${start}${endSign}`, end };
  }
  return { start: `${start}${endSign === 'am' ? 'pm' : 'am'}`, end };
};

export default {
  getDaysInRange,
  filterDuplicateDays,
  to24HourFormat,
  ensureMinutesSpecified,
  ensureAmPmSpecified,
};
