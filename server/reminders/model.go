// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

// Package reminders holds the rules for reminders: who can be reminded, when they repeat,
// how they are stored and delivered. Mattermost, the KV store and the clock are behind
// interfaces so all of it is unit-testable.
package reminders

import "time"

// Target is who receives the reminder.
type Target string

const (
	TargetMe      Target = "me"      // a DM from the bot to the creator
	TargetUser    Target = "user"    // a DM from the bot to another person
	TargetChannel Target = "channel" // a bot post in a channel
)

// Repeat is how often a reminder recurs, at the same wall-clock time in its time zone.
type Repeat string

const (
	RepeatNever    Repeat = ""
	RepeatDaily    Repeat = "daily"
	RepeatWeekdays Repeat = "weekdays"
	RepeatWeekly   Repeat = "weekly"
)

type Status string

const (
	StatusPending Status = "pending"
	// StatusSending marks a reminder claimed by the sender, so it is delivered once even if
	// several Mattermost servers run the job.
	StatusSending Status = "sending"
)

// Limits.
const (
	MaxPerUser      = 200
	MaxMessageRunes = 4000
	MinLead         = 30 * time.Second
	MaxLead         = 366 * 24 * time.Hour
	StaleSendingFor = 10 * time.Minute
)

// Reminder is one reminder, one-off or repeating.
type Reminder struct {
	ID        string `json:"id"`
	CreatorID string `json:"creator_id"`
	Target    Target `json:"target"`
	UserID    string `json:"user_id,omitempty"`    // recipient for TargetMe / TargetUser
	ChannelID string `json:"channel_id,omitempty"` // for TargetChannel
	Message   string `json:"message"`
	At        int64  `json:"at"` // next delivery, Unix milliseconds
	Repeat    Repeat `json:"repeat,omitempty"`
	TimeZone  string `json:"time_zone"`
	Hour      int    `json:"hour"`   // wall-clock time repeats keep, in TimeZone
	Minute    int    `json:"minute"` //
	Status    Status `json:"status"`
	CreatedAt int64  `json:"created_at"`
	UpdatedAt int64  `json:"updated_at"`
	ClaimedAt int64  `json:"claimed_at,omitempty"`
}

// CreateRequest is what the web app sends from the reminder dialog.
type CreateRequest struct {
	Target    Target `json:"target"`
	UserID    string `json:"user_id"`
	ChannelID string `json:"channel_id"`
	Message   string `json:"message"`
	At        int64  `json:"at"`
	Repeat    Repeat `json:"repeat"`
	TimeZone  string `json:"time_zone"`
}

// Snooze choices offered on a delivered reminder.
const (
	Snooze20Min    = "20m"
	Snooze1Hour    = "1h"
	SnoozeTomorrow = "tomorrow"
)

// UserError is an error whose message is safe and meant to be shown to the user.
type UserError struct{ Msg string }

func (e *UserError) Error() string { return e.Msg }

func userErr(msg string) error { return &UserError{Msg: msg} }

// ErrNotFound is returned for unknown IDs and for other users' reminders alike.
var ErrNotFound = userErr("Reminder not found.")
