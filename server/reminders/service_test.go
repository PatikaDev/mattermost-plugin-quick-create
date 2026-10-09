// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package reminders

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- fakes ---

type memStore struct {
	data    map[string][]byte
	casFail bool
}

func newMemStore() *memStore { return &memStore{data: map[string][]byte{}} }

func (m *memStore) Get(id string) (*Reminder, []byte, error) {
	raw, ok := m.data[id]
	if !ok {
		return nil, nil, nil
	}
	var r Reminder
	if err := json.Unmarshal(raw, &r); err != nil {
		return nil, nil, err
	}
	return &r, raw, nil
}

func (m *memStore) Put(r *Reminder) error {
	raw, err := json.Marshal(r)
	m.data[r.ID] = raw
	return err
}

func (m *memStore) CompareAndSwap(old []byte, r *Reminder) (bool, error) {
	if m.casFail || string(m.data[r.ID]) != string(old) {
		return false, nil
	}
	return true, m.Put(r)
}

func (m *memStore) Delete(id string) error {
	delete(m.data, id)
	return nil
}

func (m *memStore) All() ([]*Reminder, error) {
	var out []*Reminder
	for id := range m.data {
		r, _, err := m.Get(id)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, nil
}

type sent struct {
	to   string // user ID for DMs, channel ID for channel posts
	post *model.Post
}

type fakeMM struct {
	users    map[string]*model.User
	channels map[string]*model.Channel
	canPost  map[string]bool // userID+channelID
	dms      []sent
	posts    []sent
	failPost error
	nextID   int
}

func newFakeMM() *fakeMM {
	return &fakeMM{
		users: map[string]*model.User{
			"alice": {Id: "alice", Username: "alice", Timezone: model.StringMap{"useAutomaticTimezone": "false", "manualTimezone": "Europe/Istanbul"}},
			"bob":   {Id: "bob", Username: "bob"},
			"bot":   {Id: "bot", Username: "somebot", IsBot: true},
			"gone":  {Id: "gone", Username: "gone", DeleteAt: 1},
		},
		channels: map[string]*model.Channel{
			"town": {Id: "town", Name: "town-square", Type: model.ChannelTypeOpen},
			"dm":   {Id: "dm", Name: "alice__bob", Type: model.ChannelTypeDirect},
			"old":  {Id: "old", Name: "old", Type: model.ChannelTypeOpen, DeleteAt: 1},
		},
		canPost: map[string]bool{"alice/town": true, "alice/old": true, "alice/dm": true},
	}
}

func (f *fakeMM) GetUser(id string) (*model.User, error) {
	if u, ok := f.users[id]; ok {
		return u, nil
	}
	return nil, errors.New("not found")
}

func (f *fakeMM) GetChannel(id string) (*model.Channel, error) {
	if c, ok := f.channels[id]; ok {
		return c, nil
	}
	return nil, errors.New("not found")
}

func (f *fakeMM) CanPost(userID, channelID string) bool { return f.canPost[userID+"/"+channelID] }

func (f *fakeMM) BotDM(userID string, post *model.Post) error {
	if f.failPost != nil {
		return f.failPost
	}
	f.dms = append(f.dms, sent{userID, post})
	return nil
}

func (f *fakeMM) BotPost(post *model.Post) error {
	if f.failPost != nil {
		return f.failPost
	}
	f.posts = append(f.posts, sent{post.ChannelId, post})
	return nil
}

func (f *fakeMM) NotifyChanged(string) {}

func (f *fakeMM) NewID() string {
	f.nextID++
	return fmt.Sprintf("id%024d", f.nextID)
}

func (f *fakeMM) ActionURL() string { return "/plugins/x/api/v1/actions" }

type fakeClock struct{ now time.Time }

func (c *fakeClock) Now() time.Time { return c.now }

func newTestService(now time.Time) (*Service, *memStore, *fakeMM, *fakeClock) {
	st, mm, clock := newMemStore(), newFakeMM(), &fakeClock{now: now}
	return NewService(st, mm, clock, func(string, ...any) {}), st, mm, clock
}

func userMsg(t *testing.T, err error) string {
	t.Helper()
	var ue *UserError
	require.ErrorAs(t, err, &ue)
	return ue.Msg
}

var istanbul, _ = time.LoadLocation("Europe/Istanbul")

// Wednesday 2026-10-07 15:00 in Istanbul.
var wed = time.Date(2026, 10, 7, 15, 0, 0, 0, istanbul)

func req(target Target, at time.Time) CreateRequest {
	return CreateRequest{Target: target, Message: "Send the weekly report", At: at.UnixMilli(), TimeZone: "Europe/Istanbul"}
}

// --- create ---

func TestCreateStoresWallClockTime(t *testing.T) {
	s, st, _, _ := newTestService(wed)
	r, err := s.Create("alice", req(TargetMe, wed.Add(18*time.Hour))) // Thu 09:00
	require.NoError(t, err)
	assert.Equal(t, "alice", r.UserID)
	assert.Equal(t, 9, r.Hour)
	assert.Equal(t, 0, r.Minute)
	assert.Equal(t, StatusPending, r.Status)
	assert.Len(t, st.data, 1)
}

func TestCreateValidation(t *testing.T) {
	cases := map[string]struct {
		mutate func(*CreateRequest)
		want   string
	}{
		"empty message":      {func(r *CreateRequest) { r.Message = "  " }, "Write what"},
		"too long":           {func(r *CreateRequest) { r.Message = strings.Repeat("a", MaxMessageRunes+1) }, "under 4000"},
		"past":               {func(r *CreateRequest) { r.At = wed.Add(-time.Minute).UnixMilli() }, "future"},
		"too far":            {func(r *CreateRequest) { r.At = wed.Add(400 * 24 * time.Hour).UnixMilli() }, "year ahead"},
		"bad zone":           {func(r *CreateRequest) { r.TimeZone = "Mars/Olympus" }, "time zone"},
		"bad repeat":         {func(r *CreateRequest) { r.Repeat = "hourly" }, "repeat"},
		"no target":          {func(r *CreateRequest) { r.Target = "" }, "who to remind"},
		"bot recipient":      {func(r *CreateRequest) { r.Target, r.UserID = TargetUser, "bot" }, "only be sent to people"},
		"deactivated":        {func(r *CreateRequest) { r.Target, r.UserID = TargetUser, "gone" }, "deactivated"},
		"unknown user":       {func(r *CreateRequest) { r.Target, r.UserID = TargetUser, "nobody" }, "couldn't be found"},
		"channel is a DM":    {func(r *CreateRequest) { r.Target, r.ChannelID = TargetChannel, "dm" }, "not in direct messages"},
		"archived channel":   {func(r *CreateRequest) { r.Target, r.ChannelID = TargetChannel, "old" }, "archived"},
		"no post permission": {func(r *CreateRequest) { r.Target, r.ChannelID = TargetChannel, "nope" }, "no longer exists"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			s, _, _, _ := newTestService(wed)
			r := req(TargetMe, wed.Add(time.Hour))
			tc.mutate(&r)
			_, err := s.Create("alice", r)
			assert.Contains(t, userMsg(t, err), tc.want)
		})
	}
}

func TestCreateChannelNeedsPostPermission(t *testing.T) {
	s, _, mm, _ := newTestService(wed)
	mm.canPost["alice/town"] = false
	r := req(TargetChannel, wed.Add(time.Hour))
	r.ChannelID = "town"
	_, err := s.Create("alice", r)
	assert.Contains(t, userMsg(t, err), "can't post")
}

func TestCreateForYourselfViaSomeoneElseBecomesMe(t *testing.T) {
	s, _, _, _ := newTestService(wed)
	r := req(TargetUser, wed.Add(time.Hour))
	r.UserID = "alice"
	got, err := s.Create("alice", r)
	require.NoError(t, err)
	assert.Equal(t, TargetMe, got.Target)
}

func TestCreateEnforcesPerUserLimit(t *testing.T) {
	s, _, _, _ := newTestService(wed)
	for range MaxPerUser {
		_, err := s.Create("alice", req(TargetMe, wed.Add(time.Hour)))
		require.NoError(t, err)
	}
	_, err := s.Create("alice", req(TargetMe, wed.Add(time.Hour)))
	assert.Contains(t, userMsg(t, err), "maximum")
}

func TestListAndDeleteAreOwnerOnly(t *testing.T) {
	s, _, _, _ := newTestService(wed)
	r, err := s.Create("alice", req(TargetMe, wed.Add(2*time.Hour)))
	require.NoError(t, err)
	_, err = s.Create("alice", req(TargetMe, wed.Add(time.Hour)))
	require.NoError(t, err)

	mine, err := s.List("alice")
	require.NoError(t, err)
	require.Len(t, mine, 2)
	assert.Less(t, mine[0].At, mine[1].At)

	others, err := s.List("bob")
	require.NoError(t, err)
	assert.Empty(t, others)
	assert.ErrorIs(t, s.Delete("bob", r.ID), ErrNotFound)
	require.NoError(t, s.Delete("alice", r.ID))
}

// --- delivery ---

func TestOneOffReminderIsDMedWithButtonsThenRemoved(t *testing.T) {
	s, st, mm, clock := newTestService(wed)
	_, err := s.Create("alice", req(TargetMe, wed.Add(time.Hour)))
	require.NoError(t, err)

	s.SendDue() // not due yet
	assert.Empty(t, mm.dms)

	clock.now = wed.Add(time.Hour)
	s.SendDue()
	require.Len(t, mm.dms, 1)
	assert.Equal(t, "alice", mm.dms[0].to)
	atts := mm.dms[0].post.Attachments()
	require.Len(t, atts, 1)
	assert.Equal(t, "⏰ **Reminder:** Send the weekly report", atts[0].Text)
	require.Len(t, atts[0].Actions, 4)
	assert.Equal(t, "/plugins/x/api/v1/actions", atts[0].Actions[0].Integration.URL)
	assert.Equal(t, "Send the weekly report", atts[0].Actions[0].Integration.Context["message"])
	assert.Empty(t, st.data)

	s.SendDue()
	assert.Len(t, mm.dms, 1, "delivered once")
}

func TestReminderForSomeoneElseNamesTheCreator(t *testing.T) {
	s, _, mm, clock := newTestService(wed)
	r := req(TargetUser, wed.Add(time.Hour))
	r.UserID = "bob"
	_, err := s.Create("alice", r)
	require.NoError(t, err)
	clock.now = wed.Add(time.Hour)
	s.SendDue()
	require.Len(t, mm.dms, 1)
	assert.Equal(t, "bob", mm.dms[0].to)
	assert.Equal(t, "⏰ **Reminder from @alice:** Send the weekly report", mm.dms[0].post.Attachments()[0].Text)
}

func TestChannelReminderIsPostedByTheBotWithoutButtons(t *testing.T) {
	s, _, mm, clock := newTestService(wed)
	r := req(TargetChannel, wed.Add(time.Hour))
	r.ChannelID = "town"
	_, err := s.Create("alice", r)
	require.NoError(t, err)
	clock.now = wed.Add(time.Hour)
	s.SendDue()
	require.Len(t, mm.posts, 1)
	assert.Equal(t, "town", mm.posts[0].to)
	assert.Equal(t, "⏰ **Reminder from @alice:** Send the weekly report", mm.posts[0].post.Message)
	assert.Empty(t, mm.posts[0].post.Attachments())
}

func TestRepeatingReminderMovesToItsNextTime(t *testing.T) {
	cases := map[string]struct {
		repeat Repeat
		first  time.Time
		want   time.Time
	}{
		// Thu 09:00 → Fri 09:00
		"daily": {RepeatDaily, time.Date(2026, 10, 8, 9, 0, 0, 0, istanbul), time.Date(2026, 10, 9, 9, 0, 0, 0, istanbul)},
		// Fri 09:00 → Mon 09:00
		"weekdays skip the weekend": {RepeatWeekdays, time.Date(2026, 10, 9, 9, 0, 0, 0, istanbul), time.Date(2026, 10, 12, 9, 0, 0, 0, istanbul)},
		// Thu → next Thu
		"weekly": {RepeatWeekly, time.Date(2026, 10, 8, 9, 0, 0, 0, istanbul), time.Date(2026, 10, 15, 9, 0, 0, 0, istanbul)},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			s, st, mm, clock := newTestService(wed)
			r := req(TargetMe, tc.first)
			r.Repeat = tc.repeat
			created, err := s.Create("alice", r)
			require.NoError(t, err)

			clock.now = tc.first
			s.SendDue()
			require.Len(t, mm.dms, 1)
			got, _, err := st.Get(created.ID)
			require.NoError(t, err)
			require.NotNil(t, got)
			assert.Equal(t, tc.want.UnixMilli(), got.At, "next: %s", time.UnixMilli(got.At).In(istanbul))
			assert.Equal(t, StatusPending, got.Status)
		})
	}
}

func TestRepeatKeepsWallClockTimeAcrossDST(t *testing.T) {
	berlin, _ := time.LoadLocation("Europe/Berlin")
	sat := time.Date(2026, 3, 28, 9, 0, 0, 0, berlin) // clocks go forward on Sunday 29 March
	s, st, _, clock := newTestService(sat.Add(-time.Hour))
	r := CreateRequest{Target: TargetMe, Message: "standup", At: sat.UnixMilli(), Repeat: RepeatDaily, TimeZone: "Europe/Berlin"}
	created, err := s.Create("alice", r)
	require.NoError(t, err)
	clock.now = sat
	s.SendDue()
	got, _, _ := st.Get(created.ID)
	next := time.UnixMilli(got.At).In(berlin)
	assert.Equal(t, 29, next.Day())
	assert.Equal(t, 9, next.Hour())
	assert.Equal(t, 23*time.Hour, next.Sub(sat), "the DST day is 23 hours long")
}

func TestRepeatAfterDowntimeSkipsMissedTimes(t *testing.T) {
	s, st, mm, clock := newTestService(wed)
	first := time.Date(2026, 10, 8, 9, 0, 0, 0, istanbul)
	r := req(TargetMe, first)
	r.Repeat = RepeatDaily
	created, err := s.Create("alice", r)
	require.NoError(t, err)

	clock.now = first.Add(3*24*time.Hour + time.Hour) // server was down until Sun 10:00
	s.SendDue()
	assert.Len(t, mm.dms, 1, "one late reminder, not a burst")
	got, _, _ := st.Get(created.ID)
	assert.Equal(t, time.Date(2026, 10, 12, 9, 0, 0, 0, istanbul).UnixMilli(), got.At)
}

func TestUndeliverableReminderIsRemovedAndCreatorTold(t *testing.T) {
	s, st, mm, clock := newTestService(wed)
	r := req(TargetUser, wed.Add(time.Hour))
	r.UserID = "bob"
	r.Repeat = RepeatDaily
	_, err := s.Create("alice", r)
	require.NoError(t, err)

	mm.users["bob"].DeleteAt = 1
	clock.now = wed.Add(time.Hour)
	s.SendDue()
	assert.Empty(t, st.data)
	require.Len(t, mm.dms, 1)
	assert.Equal(t, "alice", mm.dms[0].to)
	msg := mm.dms[0].post.Message
	assert.Contains(t, msg, "couldn't be delivered: That person's account is deactivated.")
	assert.Contains(t, msg, "It repeated, so it has been removed")
	assert.Contains(t, msg, "> Send the weekly report")
}

func TestChannelReminderFailsWhenCreatorLostAccess(t *testing.T) {
	s, _, mm, clock := newTestService(wed)
	r := req(TargetChannel, wed.Add(time.Hour))
	r.ChannelID = "town"
	_, err := s.Create("alice", r)
	require.NoError(t, err)
	mm.canPost["alice/town"] = false
	clock.now = wed.Add(time.Hour)
	s.SendDue()
	assert.Empty(t, mm.posts)
	require.Len(t, mm.dms, 1)
	assert.Contains(t, mm.dms[0].post.Message, "You can't post in that channel")
}

func TestReminderFromDeactivatedCreatorIsDropped(t *testing.T) {
	s, st, mm, clock := newTestService(wed)
	r := req(TargetChannel, wed.Add(time.Hour))
	r.ChannelID = "town"
	_, err := s.Create("alice", r)
	require.NoError(t, err)
	mm.users["alice"].DeleteAt = 1
	clock.now = wed.Add(time.Hour)
	s.SendDue()
	assert.Empty(t, mm.posts)
	assert.Empty(t, st.data)
}

func TestLostClaimMeansNoDelivery(t *testing.T) {
	s, st, mm, clock := newTestService(wed)
	_, err := s.Create("alice", req(TargetMe, wed.Add(time.Hour)))
	require.NoError(t, err)
	st.casFail = true // another server claimed it first
	clock.now = wed.Add(time.Hour)
	s.SendDue()
	assert.Empty(t, mm.dms)
	assert.Len(t, st.data, 1)
}

func TestStaleClaimIsDeliveredAgain(t *testing.T) {
	s, st, mm, clock := newTestService(wed)
	created, err := s.Create("alice", req(TargetMe, wed.Add(time.Hour)))
	require.NoError(t, err)
	created.Status = StatusSending
	created.ClaimedAt = wed.Add(time.Hour).UnixMilli()
	require.NoError(t, st.Put(created))

	clock.now = wed.Add(time.Hour + 5*time.Minute)
	s.SendDue()
	assert.Empty(t, mm.dms, "still within the claim window")

	clock.now = wed.Add(time.Hour + StaleSendingFor + time.Minute)
	s.SendDue()
	assert.Len(t, mm.dms, 1)
}

func TestDeliveryErrorRemovesTheReminder(t *testing.T) {
	s, st, mm, clock := newTestService(wed)
	r := req(TargetChannel, wed.Add(time.Hour))
	r.ChannelID = "town"
	_, err := s.Create("alice", r)
	require.NoError(t, err)
	mm.failPost = errors.New("boom")
	clock.now = wed.Add(time.Hour)
	s.SendDue()
	assert.Empty(t, st.data)
}

// --- snooze ---

func TestSnoozeCreatesAOneOffReminderInTheUsersZone(t *testing.T) {
	s, st, _, _ := newTestService(wed)
	at, loc, err := s.Snooze("alice", "Send the report", SnoozeTomorrow)
	require.NoError(t, err)
	assert.Equal(t, "Europe/Istanbul", loc.String())
	assert.Equal(t, time.Date(2026, 10, 8, 9, 0, 0, 0, istanbul).UnixMilli(), at.UnixMilli())

	at, _, err = s.Snooze("alice", "Send the report", Snooze20Min)
	require.NoError(t, err)
	assert.Equal(t, wed.Add(20*time.Minute).UnixMilli(), at.UnixMilli())

	mine, _ := s.List("alice")
	require.Len(t, mine, 2)
	assert.Equal(t, TargetMe, mine[0].Target)
	assert.Equal(t, "Send the report", mine[0].Message)
	assert.Len(t, st.data, 2)
}

func TestSnoozeWithoutTimezoneUsesUTC(t *testing.T) {
	s, _, _, _ := newTestService(wed)
	_, loc, err := s.Snooze("bob", "x", Snooze1Hour)
	require.NoError(t, err)
	assert.Equal(t, "UTC", loc.String())
}

func TestSnoozeRejectsUnknownOption(t *testing.T) {
	s, _, _, _ := newTestService(wed)
	_, _, err := s.Snooze("alice", "x", "forever")
	assert.Contains(t, userMsg(t, err), "Unknown snooze")
}
