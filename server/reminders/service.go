// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package reminders

import (
	"fmt"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/mattermost/mattermost/server/public/model"
)

type Service struct {
	store Store
	mm    Mattermost
	clock Clock
	log   func(msg string, keyValuePairs ...any)
}

func NewService(store Store, mm Mattermost, clock Clock, log func(msg string, keyValuePairs ...any)) *Service {
	return &Service{store: store, mm: mm, clock: clock, log: log}
}

func (s *Service) nowMillis() int64 { return s.clock.Now().UnixMilli() }

// Create validates a reminder and stores it.
func (s *Service) Create(creatorID string, req CreateRequest) (*Reminder, error) {
	message := strings.TrimSpace(req.Message)
	if message == "" {
		return nil, userErr("Write what the reminder is about.")
	}
	if utf8.RuneCountInString(message) > MaxMessageRunes {
		return nil, userErr(fmt.Sprintf("Keep the reminder under %d characters.", MaxMessageRunes))
	}
	switch req.Repeat {
	case RepeatNever, RepeatDaily, RepeatWeekdays, RepeatWeekly:
	default:
		return nil, userErr("Unknown repeat option.")
	}
	loc, zoneErr := time.LoadLocation(req.TimeZone)
	if zoneErr != nil || req.TimeZone == "" {
		return nil, userErr("Unknown time zone.")
	}
	if err := s.checkAt(req.At); err != nil {
		return nil, err
	}
	if err := s.checkCreator(creatorID); err != nil {
		return nil, err
	}

	r := &Reminder{
		ID:        s.mm.NewID(),
		CreatorID: creatorID,
		Target:    req.Target,
		Message:   message,
		At:        req.At,
		Repeat:    req.Repeat,
		TimeZone:  req.TimeZone,
		Status:    StatusPending,
	}
	wall := time.UnixMilli(req.At).In(loc)
	r.Hour, r.Minute = wall.Hour(), wall.Minute()

	switch req.Target {
	case TargetMe:
		r.UserID = creatorID
	case TargetUser:
		if req.UserID == creatorID {
			r.Target, r.UserID = TargetMe, creatorID
			break
		}
		if err := s.checkRecipient(req.UserID); err != nil {
			return nil, err
		}
		r.UserID = req.UserID
	case TargetChannel:
		if err := s.checkChannel(creatorID, req.ChannelID); err != nil {
			return nil, err
		}
		r.ChannelID = req.ChannelID
	default:
		return nil, userErr("Choose who to remind.")
	}

	mine, err := s.List(creatorID)
	if err != nil {
		return nil, err
	}
	if len(mine) >= MaxPerUser {
		return nil, userErr(fmt.Sprintf("You already have %d reminders, the maximum.", MaxPerUser))
	}

	now := s.nowMillis()
	r.CreatedAt, r.UpdatedAt = now, now
	if err := s.store.Put(r); err != nil {
		return nil, err
	}
	s.mm.NotifyChanged(creatorID)
	return r, nil
}

// List returns the reminders the user created, soonest first.
func (s *Service) List(creatorID string) ([]*Reminder, error) {
	all, err := s.store.All()
	if err != nil {
		return nil, err
	}
	mine := make([]*Reminder, 0, len(all))
	for _, r := range all {
		if r.CreatorID == creatorID {
			mine = append(mine, r)
		}
	}
	sort.Slice(mine, func(i, j int) bool { return mine[i].At < mine[j].At })
	return mine, nil
}

func (s *Service) Delete(creatorID, id string) error {
	r, _, err := s.store.Get(id)
	if err != nil {
		return err
	}
	if r == nil || r.CreatorID != creatorID {
		return ErrNotFound
	}
	if err := s.store.Delete(id); err != nil {
		return err
	}
	s.mm.NotifyChanged(creatorID)
	return nil
}

// Snooze creates a one-off reminder to the user with the same text. It returns the time
// it will go off.
func (s *Service) Snooze(userID, message, option string) (time.Time, *time.Location, error) {
	user, err := s.mm.GetUser(userID)
	if err != nil || user == nil {
		return time.Time{}, nil, userErr("Your account can't use reminders right now.")
	}
	loc := userLocation(user)
	at, ok := snoozeUntil(option, s.clock.Now(), loc)
	if !ok {
		return time.Time{}, nil, userErr("Unknown snooze option.")
	}
	_, err = s.Create(userID, CreateRequest{Target: TargetMe, Message: message, At: at.UnixMilli(), TimeZone: loc.String()})
	return at, loc, err
}

// SendDue delivers every reminder whose time has come. Called by the cluster job.
func (s *Service) SendDue() {
	all, err := s.store.All()
	if err != nil {
		s.log("Failed to list reminders", "error", err.Error())
		return
	}
	now := s.nowMillis()
	for _, r := range all {
		due := r.Status == StatusPending && r.At <= now
		// A sender that stopped mid-way (server restart) left the reminder claimed. A repeated
		// reminder is better than a lost one, so it is simply delivered again.
		stale := r.Status == StatusSending && now-r.ClaimedAt > StaleSendingFor.Milliseconds()
		if !due && !stale {
			continue
		}
		_, raw, err := s.store.Get(r.ID)
		if err != nil || raw == nil {
			continue
		}
		s.deliver(r, raw)
	}
}

func (s *Service) deliver(r *Reminder, raw []byte) {
	claimed := *r
	claimed.Status = StatusSending
	claimed.ClaimedAt = s.nowMillis()
	ok, err := s.store.CompareAndSwap(raw, &claimed)
	if err != nil || !ok {
		return
	}

	if err := s.post(&claimed); err != nil {
		s.fail(&claimed, err.Error())
		return
	}

	if claimed.Repeat == RepeatNever {
		if err := s.store.Delete(claimed.ID); err != nil {
			s.log("Delivered reminder but could not remove it", "id", claimed.ID, "error", err.Error())
		}
		s.mm.NotifyChanged(claimed.CreatorID)
		return
	}
	nextAt, ok := next(&claimed, s.clock.Now())
	if !ok {
		s.fail(&claimed, "its next time couldn't be worked out")
		return
	}
	claimed.At = nextAt.UnixMilli()
	claimed.Status = StatusPending
	claimed.ClaimedAt = 0
	claimed.UpdatedAt = s.nowMillis()
	if err := s.store.Put(&claimed); err != nil {
		s.log("Failed to schedule the next reminder", "id", claimed.ID, "error", err.Error())
	}
	s.mm.NotifyChanged(claimed.CreatorID)
}

// post re-checks that the reminder may still be delivered, then delivers it.
func (s *Service) post(r *Reminder) error {
	creator, err := s.mm.GetUser(r.CreatorID)
	if err != nil || creator == nil || creator.DeleteAt != 0 {
		return userErr("the account that created it is deactivated")
	}

	switch r.Target {
	case TargetMe, TargetUser:
		if r.Target == TargetUser {
			if err := s.checkRecipient(r.UserID); err != nil {
				return err
			}
		}
		text := "⏰ **Reminder:** " + r.Message
		if r.Target == TargetUser {
			text = fmt.Sprintf("⏰ **Reminder from @%s:** %s", creator.Username, r.Message)
		}
		return s.mm.BotDM(r.UserID, s.personalPost(text, r.Message))
	case TargetChannel:
		if err := s.checkChannel(r.CreatorID, r.ChannelID); err != nil {
			return err
		}
		return s.mm.BotPost(&model.Post{
			ChannelId: r.ChannelID,
			Message:   fmt.Sprintf("⏰ **Reminder from @%s:** %s", creator.Username, r.Message),
		})
	default:
		return userErr("unknown recipient")
	}
}

// personalPost is a reminder DM with Snooze and Done buttons.
func (s *Service) personalPost(text, message string) *model.Post {
	action := func(id, name, kind, option string) *model.PostAction {
		return &model.PostAction{
			Id:    id,
			Name:  name,
			Type:  model.PostActionTypeButton,
			Style: "default",
			Integration: &model.PostActionIntegration{
				URL:     s.mm.ActionURL(),
				Context: map[string]any{"action": kind, "option": option, "message": message},
			},
		}
	}
	post := &model.Post{}
	post.AddProp("attachments", []*model.SlackAttachment{{
		Text: text,
		Actions: []*model.PostAction{
			action("snooze20m", "Snooze 20 min", "snooze", Snooze20Min),
			action("snooze1h", "Snooze 1 hour", "snooze", Snooze1Hour),
			action("snoozetomorrow", "Tomorrow 9:00", "snooze", SnoozeTomorrow),
			action("done", "Done", "done", ""),
		},
	}})
	return post
}

// fail drops a reminder that can't be delivered and tells its creator why.
func (s *Service) fail(r *Reminder, reason string) {
	if err := s.store.Delete(r.ID); err != nil {
		s.log("Failed to remove undeliverable reminder", "id", r.ID, "error", err.Error())
	}
	s.mm.NotifyChanged(r.CreatorID)

	var b strings.Builder
	fmt.Fprintf(&b, "Your reminder couldn't be delivered: %s.", strings.TrimSuffix(reason, "."))
	if r.Repeat != RepeatNever {
		b.WriteString(" It repeated, so it has been removed; create it again if you still need it.")
	}
	b.WriteString("\n\nThe reminder was:\n")
	for line := range strings.SplitSeq(r.Message, "\n") {
		b.WriteString("> " + line + "\n")
	}
	if err := s.mm.BotDM(r.CreatorID, &model.Post{Message: b.String()}); err != nil {
		s.log("Failed to DM reminder failure", "id", r.ID, "error", err.Error())
	}
}

func (s *Service) checkAt(at int64) error {
	now := s.clock.Now()
	t := time.UnixMilli(at)
	if t.Before(now.Add(MinLead)) {
		return userErr("Pick a time in the future.")
	}
	if t.After(now.Add(MaxLead)) {
		return userErr("Reminders can be set up to a year ahead.")
	}
	return nil
}

func (s *Service) checkCreator(userID string) error {
	user, err := s.mm.GetUser(userID)
	if err != nil || user == nil || user.DeleteAt != 0 {
		return userErr("Your account can't use reminders right now.")
	}
	return nil
}

func (s *Service) checkRecipient(userID string) error {
	user, err := s.mm.GetUser(userID)
	if err != nil || user == nil {
		return userErr("That person couldn't be found.")
	}
	if user.IsBot {
		return userErr("Reminders can only be sent to people.")
	}
	if user.DeleteAt != 0 {
		return userErr("That person's account is deactivated.")
	}
	return nil
}

func (s *Service) checkChannel(creatorID, channelID string) error {
	ch, err := s.mm.GetChannel(channelID)
	if err != nil || ch == nil {
		return userErr("The channel no longer exists.")
	}
	if ch.Type != model.ChannelTypeOpen && ch.Type != model.ChannelTypePrivate {
		return userErr("Channel reminders work in channels, not in direct messages.")
	}
	if ch.DeleteAt != 0 {
		return userErr("The channel has been archived.")
	}
	if !s.mm.CanPost(creatorID, channelID) {
		return userErr("You can't post in that channel.")
	}
	return nil
}

// userLocation is the time zone from the user's Mattermost profile, or UTC.
func userLocation(user *model.User) *time.Location {
	if loc, err := time.LoadLocation(model.GetPreferredTimezone(user.Timezone)); err == nil {
		return loc
	}
	return time.UTC
}
