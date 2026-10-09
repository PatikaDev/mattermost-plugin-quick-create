// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

// Wall-clock maths in the user's Mattermost time zone (which may differ from the
// browser's), using only Intl — no date library.

export type Wall = {year: number; month: number; day: number; hour: number; minute: number; weekday: number};

const WEEKDAYS: Record<string, number> = {Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6};

function parts(utcMs: number, timeZone: string): Wall {
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
    const p: Record<string, string> = {};
    for (const part of fmt.formatToParts(new Date(utcMs))) {
        p[part.type] = part.value;
    }
    return {
        year: Number(p.year),
        month: Number(p.month),
        day: Number(p.day),
        hour: Number(p.hour) % 24,
        minute: Number(p.minute),
        weekday: WEEKDAYS[p.weekday] ?? 0,
    };
}

export function wallClock(utcMs: number, timeZone: string): Wall {
    return parts(utcMs, timeZone);
}

function offsetMs(utcMs: number, timeZone: string): number {
    const w = parts(utcMs, timeZone);
    const asIfUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
    return asIfUtc - (Math.floor(utcMs / 60000) * 60000);
}

// The UTC instant at which the given local date and time occurs in timeZone.
// month is 1-12. For a time skipped by a DST jump, the result lands just after the jump.
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): number {
    const asIfUtc = Date.UTC(year, month - 1, day, hour, minute);
    const first = asIfUtc - offsetMs(asIfUtc, timeZone);
    return asIfUtc - offsetMs(first, timeZone);
}

function addDays(w: Wall, days: number): {year: number; month: number; day: number} {
    const d = new Date(Date.UTC(w.year, w.month - 1, w.day + days));
    return {year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate()};
}

export type QuickOption = {key: string; label: string; sendAt: number};

// The shortcuts offered for a reminder's time.
export function quickOptions(nowMs: number, timeZone: string): QuickOption[] {
    const today = wallClock(nowMs, timeZone);

    // In 1 hour, rounded up to the next 5 minutes so it reads naturally.
    const inAnHour = Math.ceil((nowMs + (60 * 60 * 1000)) / (5 * 60 * 1000)) * (5 * 60 * 1000);

    const tomorrow = addDays(today, 1);
    const tomorrowAt9 = zonedToUtc(tomorrow.year, tomorrow.month, tomorrow.day, 9, 0, timeZone);

    // Next Monday — a week from today if today is Monday.
    const daysToMonday = ((8 - today.weekday) % 7) || 7;
    const monday = addDays(today, daysToMonday);
    const mondayAt9 = zonedToUtc(monday.year, monday.month, monday.day, 9, 0, timeZone);

    // In 20 minutes, rounded up to the next 5 minutes.
    const in20 = Math.ceil((nowMs + (20 * 60 * 1000)) / (5 * 60 * 1000)) * (5 * 60 * 1000);

    return [
        {key: '20min', label: 'In 20 minutes', sendAt: in20},
        {key: 'hour', label: 'In 1 hour', sendAt: inAnHour},
        {key: 'tomorrow', label: 'Tomorrow at 9:00', sendAt: tomorrowAt9},
        {key: 'monday', label: 'Next Monday at 9:00', sendAt: mondayAt9},
    ];
}

export function formatSendAt(utcMs: number, timeZone: string, use24h: boolean, locale?: string): string {
    return new Intl.DateTimeFormat(locale, {
        timeZone,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: use24h ? 'h23' : 'h12',
    }).format(new Date(utcMs));
}

const pad = (n: number) => String(n).padStart(2, '0');

// Values for <input type="date"> / <input type="time"> in the user's time zone.
export function toInputs(utcMs: number, timeZone: string): {date: string; time: string} {
    const w = wallClock(utcMs, timeZone);
    return {date: `${w.year}-${pad(w.month)}-${pad(w.day)}`, time: `${pad(w.hour)}:${pad(w.minute)}`};
}

export function fromInputs(date: string, time: string, timeZone: string): number | null {
    const d = (/^(\d{4})-(\d{2})-(\d{2})$/).exec(date);
    const t = (/^(\d{2}):(\d{2})$/).exec(time);
    if (!d || !t) {
        return null;
    }
    return zonedToUtc(Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2]), timeZone);
}

type UserTimezone = {useAutomaticTimezone?: string | boolean; automaticTimezone?: string; manualTimezone?: string};

export function resolveTimeZone(tz: UserTimezone | undefined): string {
    const browser = new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    if (!tz) {
        return browser;
    }
    const automatic = tz.useAutomaticTimezone === true || tz.useAutomaticTimezone === 'true';
    const zone = automatic ? tz.automaticTimezone : tz.manualTimezone;
    return zone || browser;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// "every weekday", "every Tuesday", … for a reminder whose first time is firstMs.
export function repeatLabel(repeat: string | undefined, firstMs: number, timeZone: string): string {
    switch (repeat) {
    case 'daily':
        return 'every day';
    case 'weekdays':
        return 'every weekday (Mon–Fri)';
    case 'weekly':
        return `every ${WEEKDAY_NAMES[wallClock(firstMs, timeZone).weekday]}`;
    default:
        return '';
    }
}
