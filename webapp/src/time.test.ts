// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import {formatSendAt, fromInputs, quickOptions, repeatLabel, resolveTimeZone, toInputs, wallClock, zonedToUtc} from './time';

describe('zonedToUtc', () => {
    it('converts a wall-clock time in a fixed-offset zone', () => {
        // Istanbul is UTC+3 all year.
        expect(new Date(zonedToUtc(2026, 10, 8, 9, 0, 'Europe/Istanbul')).toISOString()).toBe('2026-10-08T06:00:00.000Z');
    });

    it('handles daylight saving on both sides of the change', () => {
        // New York: EDT (UTC-4) before 2026-11-01, EST (UTC-5) after.
        expect(new Date(zonedToUtc(2026, 10, 31, 9, 0, 'America/New_York')).toISOString()).toBe('2026-10-31T13:00:00.000Z');
        expect(new Date(zonedToUtc(2026, 11, 2, 9, 0, 'America/New_York')).toISOString()).toBe('2026-11-02T14:00:00.000Z');
    });

    it('round-trips through wallClock', () => {
        const at = zonedToUtc(2026, 3, 29, 14, 30, 'Europe/Berlin');
        expect(wallClock(at, 'Europe/Berlin')).toMatchObject({year: 2026, month: 3, day: 29, hour: 14, minute: 30});
    });
});

describe('quickOptions', () => {
    // Wednesday 2026-10-07 15:12 in Istanbul (12:12 UTC).
    const now = Date.UTC(2026, 9, 7, 12, 12);
    const [in20, hour, tomorrow, monday] = quickOptions(now, 'Europe/Istanbul');

    it('rounds "in 20 minutes" up to the next 5 minutes', () => {
        expect(new Date(in20.sendAt).toISOString()).toBe('2026-10-07T12:35:00.000Z');
    });

    it('rounds "in 1 hour" up to the next 5 minutes', () => {
        expect(new Date(hour.sendAt).toISOString()).toBe('2026-10-07T13:15:00.000Z');
    });

    it('puts "tomorrow" at 9:00 in the user\'s time zone', () => {
        expect(new Date(tomorrow.sendAt).toISOString()).toBe('2026-10-08T06:00:00.000Z');
    });

    it('puts "next Monday" at 9:00, a week out when today is Monday', () => {
        expect(new Date(monday.sendAt).toISOString()).toBe('2026-10-12T06:00:00.000Z');
        const mondayNoon = Date.UTC(2026, 9, 12, 9, 0); // Monday 12:00 in Istanbul
        expect(new Date(quickOptions(mondayNoon, 'Europe/Istanbul')[3].sendAt).toISOString()).toBe('2026-10-19T06:00:00.000Z');
    });

    it('uses the user\'s zone, not UTC, to decide what "tomorrow" is', () => {
        // 23:30 UTC on Oct 7 is already Oct 8 in Tokyo, so tomorrow there is Oct 9.
        const late = Date.UTC(2026, 9, 7, 23, 30);
        expect(new Date(quickOptions(late, 'Asia/Tokyo')[2].sendAt).toISOString()).toBe('2026-10-09T00:00:00.000Z');
    });
});

describe('date/time inputs', () => {
    it('round-trips through the input values', () => {
        const at = zonedToUtc(2026, 12, 31, 23, 45, 'Europe/Istanbul');
        const {date, time} = toInputs(at, 'Europe/Istanbul');
        expect([date, time]).toEqual(['2026-12-31', '23:45']);
        expect(fromInputs(date, time, 'Europe/Istanbul')).toBe(at);
    });

    it('rejects malformed input', () => {
        expect(fromInputs('31/12/2026', '23:45', 'UTC')).toBeNull();
        expect(fromInputs('2026-12-31', '', 'UTC')).toBeNull();
    });
});

describe('resolveTimeZone', () => {
    it('follows the user\'s Mattermost setting', () => {
        expect(resolveTimeZone({useAutomaticTimezone: 'false', manualTimezone: 'Asia/Tokyo', automaticTimezone: 'Europe/Istanbul'})).toBe('Asia/Tokyo');
        expect(resolveTimeZone({useAutomaticTimezone: 'true', manualTimezone: 'Asia/Tokyo', automaticTimezone: 'Europe/Istanbul'})).toBe('Europe/Istanbul');
    });

    it('falls back to the browser zone', () => {
        expect(resolveTimeZone(undefined)).toBe(new Intl.DateTimeFormat().resolvedOptions().timeZone);
    });
});

describe('formatSendAt', () => {
    it('shows the time in the user\'s zone and clock style', () => {
        const at = zonedToUtc(2026, 10, 8, 9, 0, 'Europe/Istanbul');
        expect(formatSendAt(at, 'Europe/Istanbul', true, 'en-GB')).toMatch(/Thu.*8 Oct.*09:00/);
        expect(formatSendAt(at, 'Europe/Istanbul', false, 'en-US')).toMatch(/Thu.*Oct 8.*09:00\s?AM/i);
    });
});

describe('repeatLabel', () => {
    const wednesday = Date.UTC(2026, 9, 7, 6, 0); // 09:00 in Istanbul
    it('describes each repeat option', () => {
        expect(repeatLabel('', wednesday, 'Europe/Istanbul')).toBe('');
        expect(repeatLabel('daily', wednesday, 'Europe/Istanbul')).toBe('every day');
        expect(repeatLabel('weekdays', wednesday, 'Europe/Istanbul')).toBe('every weekday (Mon–Fri)');
        expect(repeatLabel('weekly', wednesday, 'Europe/Istanbul')).toBe('every Wednesday');
    });

    it('names the weekday in the reminder\'s time zone', () => {
        const lateWednesdayUtc = Date.UTC(2026, 9, 7, 23, 30); // already Thursday in Tokyo
        expect(repeatLabel('weekly', lateWednesdayUtc, 'Asia/Tokyo')).toBe('every Thursday');
    });
});
