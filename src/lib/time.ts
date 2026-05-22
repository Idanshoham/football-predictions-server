// All time handling in this codebase MUST go through this module.
// Tournament is played in Israel; user-facing strings are always in Asia/Jerusalem.
// DB stores `timestamptz` (UTC); display happens here.

import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { differenceInMinutes } from 'date-fns';

export const ISRAEL_TZ = 'Asia/Jerusalem';

export function nowUtc(): Date {
  return new Date();
}

export function formatIsraelTime(
  input: Date | string,
  pattern = 'yyyy-MM-dd HH:mm',
): string {
  return formatInTimeZone(new Date(input), ISRAEL_TZ, pattern);
}

export function israelTime(input: Date | string): Date {
  return toZonedTime(new Date(input), ISRAEL_TZ);
}

export function isKickoffPassed(
  kickoffAt: Date | string,
  now: Date = nowUtc(),
): boolean {
  return now.getTime() >= new Date(kickoffAt).getTime();
}

export function minutesUntilKickoff(
  kickoffAt: Date | string,
  now: Date = nowUtc(),
): number {
  return differenceInMinutes(new Date(kickoffAt), now);
}

export function isInLiveWindow(
  kickoffAt: Date | string,
  now: Date = nowUtc(),
  windowMinutes = 180,
): boolean {
  const kickoff = new Date(kickoffAt).getTime();
  const start = kickoff - 5 * 60 * 1000;
  const end = kickoff + windowMinutes * 60 * 1000;
  return now.getTime() >= start && now.getTime() <= end;
}

export function isWithinReminderWindow(
  kickoffAt: Date | string,
  now: Date = nowUtc(),
  lowerMinutes = 100,
  upperMinutes = 140,
): boolean {
  const minutes = minutesUntilKickoff(kickoffAt, now);
  return minutes >= lowerMinutes && minutes <= upperMinutes;
}
