// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package reminders

import (
	"time"
	_ "time/tzdata" // the Mattermost image may not ship zoneinfo
)

// next returns the first occurrence of r strictly after `after`, keeping r's wall-clock
// time in its time zone across DST changes. If the server was down, missed occurrences
// are skipped rather than delivered in a burst.
func next(r *Reminder, after time.Time) (time.Time, bool) {
	loc, err := time.LoadLocation(r.TimeZone)
	if err != nil {
		return time.Time{}, false
	}
	cur := time.UnixMilli(r.At).In(loc)
	for i := 1; i <= 400; i++ {
		d := time.Date(cur.Year(), cur.Month(), cur.Day()+i, r.Hour, r.Minute, 0, 0, loc)
		if !d.After(after) || !matches(r.Repeat, d, cur) {
			continue
		}
		return d, true
	}
	return time.Time{}, false
}

func matches(repeat Repeat, d, first time.Time) bool {
	switch repeat {
	case RepeatDaily:
		return true
	case RepeatWeekdays:
		return d.Weekday() != time.Saturday && d.Weekday() != time.Sunday
	case RepeatWeekly:
		return d.Weekday() == first.Weekday()
	default:
		return false
	}
}

// snoozeUntil turns a snooze choice into a time, in the user's time zone.
func snoozeUntil(option string, now time.Time, loc *time.Location) (time.Time, bool) {
	switch option {
	case Snooze20Min:
		return now.Add(20 * time.Minute), true
	case Snooze1Hour:
		return now.Add(time.Hour), true
	case SnoozeTomorrow:
		n := now.In(loc)
		return time.Date(n.Year(), n.Month(), n.Day()+1, 9, 0, 0, 0, loc), true
	default:
		return time.Time{}, false
	}
}
