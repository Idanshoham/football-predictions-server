import {
  formatIsraelTime,
  isKickoffPassed,
  minutesUntilKickoff,
  isInLiveWindow,
  isWithinReminderWindow,
} from './time';

describe('time helpers', () => {
  describe('formatIsraelTime', () => {
    it('formats a UTC instant in Israel time', () => {
      // 2026-06-11 12:00 UTC → 15:00 Israel time (UTC+3 in summer/DST)
      const utc = new Date('2026-06-11T12:00:00Z');
      expect(formatIsraelTime(utc)).toBe('2026-06-11 15:00');
    });

    it('formats from an ISO string', () => {
      expect(formatIsraelTime('2026-06-11T12:00:00Z')).toBe('2026-06-11 15:00');
    });

    it('respects custom pattern', () => {
      const utc = new Date('2026-06-11T12:00:00Z');
      expect(formatIsraelTime(utc, 'HH:mm')).toBe('15:00');
    });
  });

  describe('isKickoffPassed', () => {
    it('returns false before kickoff', () => {
      const kickoff = new Date('2026-06-11T18:00:00Z');
      const now = new Date('2026-06-11T17:59:59Z');
      expect(isKickoffPassed(kickoff, now)).toBe(false);
    });

    it('returns true exactly at kickoff', () => {
      const kickoff = new Date('2026-06-11T18:00:00Z');
      expect(isKickoffPassed(kickoff, kickoff)).toBe(true);
    });

    it('returns true 1ms after kickoff', () => {
      const kickoff = new Date('2026-06-11T18:00:00Z');
      const now = new Date('2026-06-11T18:00:00.001Z');
      expect(isKickoffPassed(kickoff, now)).toBe(true);
    });
  });

  describe('minutesUntilKickoff', () => {
    it('returns positive minutes when in future', () => {
      const kickoff = new Date('2026-06-11T18:00:00Z');
      const now = new Date('2026-06-11T16:00:00Z');
      expect(minutesUntilKickoff(kickoff, now)).toBe(120);
    });

    it('returns negative after kickoff', () => {
      const kickoff = new Date('2026-06-11T18:00:00Z');
      const now = new Date('2026-06-11T19:30:00Z');
      expect(minutesUntilKickoff(kickoff, now)).toBe(-90);
    });
  });

  describe('isInLiveWindow', () => {
    it('false when 10 min before kickoff', () => {
      const kickoff = new Date('2026-06-11T18:00:00Z');
      const now = new Date('2026-06-11T17:50:00Z');
      expect(isInLiveWindow(kickoff, now)).toBe(false);
    });

    it('true when 1 min before kickoff', () => {
      const kickoff = new Date('2026-06-11T18:00:00Z');
      const now = new Date('2026-06-11T17:59:00Z');
      expect(isInLiveWindow(kickoff, now)).toBe(true);
    });

    it('true during the match', () => {
      const kickoff = new Date('2026-06-11T18:00:00Z');
      const now = new Date('2026-06-11T19:30:00Z');
      expect(isInLiveWindow(kickoff, now)).toBe(true);
    });

    it('false 4 hours after kickoff', () => {
      const kickoff = new Date('2026-06-11T18:00:00Z');
      const now = new Date('2026-06-11T22:01:00Z');
      expect(isInLiveWindow(kickoff, now)).toBe(false);
    });
  });

  describe('isWithinReminderWindow', () => {
    it('false when 3 hours before', () => {
      const kickoff = new Date('2026-06-11T18:00:00Z');
      const now = new Date('2026-06-11T15:00:00Z');
      expect(isWithinReminderWindow(kickoff, now)).toBe(false);
    });

    it('true when 2 hours before (120 min)', () => {
      const kickoff = new Date('2026-06-11T18:00:00Z');
      const now = new Date('2026-06-11T16:00:00Z');
      expect(isWithinReminderWindow(kickoff, now)).toBe(true);
    });

    it('true at the edge of 100 min before', () => {
      const kickoff = new Date('2026-06-11T18:00:00Z');
      const now = new Date('2026-06-11T16:20:00Z');
      expect(isWithinReminderWindow(kickoff, now)).toBe(true);
    });

    it('false when 30 min before', () => {
      const kickoff = new Date('2026-06-11T18:00:00Z');
      const now = new Date('2026-06-11T17:30:00Z');
      expect(isWithinReminderWindow(kickoff, now)).toBe(false);
    });
  });
});
