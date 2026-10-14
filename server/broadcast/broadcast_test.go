// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package broadcast

import (
	"errors"
	"strings"
	"testing"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeMM struct {
	posts    map[string]*model.Post
	canPost  bool
	created  []*model.Post
	copyErr  error
	copiedOf []string
}

func newFake() *fakeMM {
	return &fakeMM{
		posts: map[string]*model.Post{
			"root": {Id: "root", UserId: "bob", ChannelId: "town", Message: "Campaign brief for the autumn launch is ready"},
		},
		canPost: true,
	}
}

func (f *fakeMM) GetPost(id string) (*model.Post, error) {
	if p, ok := f.posts[id]; ok {
		return p, nil
	}
	return nil, errors.New("not found")
}

func (f *fakeMM) CanPost(string, string) bool { return f.canPost }

func (f *fakeMM) CopyFileInfos(_ string, ids []string) ([]string, error) {
	if f.copyErr != nil {
		return nil, f.copyErr
	}
	f.copiedOf = ids
	out := make([]string, len(ids))
	for i, id := range ids {
		out[i] = "copy-" + id
	}
	return out, nil
}

func (f *fakeMM) CreatePost(p *model.Post) error {
	f.created = append(f.created, p)
	return nil
}

func (f *fakeMM) SiteURL() string { return "https://team.example.com/" }

func reply(msg string, marked bool) *model.Post {
	p := &model.Post{Id: "reply", UserId: "alice", ChannelId: "town", RootId: "root", Message: msg}
	if marked {
		p.AddProp(PropRequested, true)
	}
	return p
}

func TestMarkedReplyIsCopiedToTheChannel(t *testing.T) {
	mm := newFake()
	New(mm, func(string, ...any) {}).MessageHasBeenPosted(reply("Approved, ship it 🚀", true))
	require.Len(t, mm.created, 1)
	c := mm.created[0]
	assert.Equal(t, "alice", c.UserId)
	assert.Equal(t, "town", c.ChannelId)
	assert.Empty(t, c.RootId, "the copy is a channel message, not another reply")
	assert.Equal(t, "↪ _replied to a thread:_ [Campaign brief for the autumn launch is ready](https://team.example.com/_redirect/pl/reply?src=channel)\n\nApproved, ship it 🚀", c.Message)
	assert.Equal(t, "reply", c.GetProp(PropCopyOf))
	assert.Nil(t, c.GetProp(PropRequested), "the copy must never be copied again")
}

func TestUnmarkedOrNonReplyPostsAreLeftAlone(t *testing.T) {
	mm := newFake()
	b := New(mm, func(string, ...any) {})
	b.MessageHasBeenPosted(reply("just a reply", false))
	top := &model.Post{Id: "top", UserId: "alice", ChannelId: "town", Message: "hi"}
	top.AddProp(PropRequested, true)
	b.MessageHasBeenPosted(top)
	notBool := reply("x", false)
	notBool.AddProp(PropRequested, "true")
	b.MessageHasBeenPosted(notBool)
	assert.Empty(t, mm.created)
}

func TestNothingIsSentWhenTheThreadOrPermissionIsGone(t *testing.T) {
	mm := newFake()
	b := New(mm, func(string, ...any) {})
	mm.canPost = false
	b.MessageHasBeenPosted(reply("x", true))
	mm.canPost = true
	mm.posts["root"].DeleteAt = 1
	b.MessageHasBeenPosted(reply("x", true))
	mm.posts["root"].DeleteAt = 0
	mm.posts["root"].ChannelId = "elsewhere"
	b.MessageHasBeenPosted(reply("x", true))
	assert.Empty(t, mm.created)
}

func TestAttachmentsAreCopied(t *testing.T) {
	mm := newFake()
	r := reply("", true)
	r.FileIds = []string{"f1", "f2"}
	New(mm, func(string, ...any) {}).MessageHasBeenPosted(r)
	require.Len(t, mm.created, 1)
	assert.Equal(t, []string{"f1", "f2"}, mm.copiedOf)
	assert.Equal(t, model.StringArray{"copy-f1", "copy-f2"}, mm.created[0].FileIds)
	assert.False(t, strings.Contains(mm.created[0].Message, "\n\n"), "no empty body under the header")
}

func TestCopyStillGoesOutIfAttachmentsCannotBeCopied(t *testing.T) {
	mm := newFake()
	mm.copyErr = errors.New("storage down")
	r := reply("see attached", true)
	r.FileIds = []string{"f1"}
	New(mm, func(string, ...any) {}).MessageHasBeenPosted(r)
	require.Len(t, mm.created, 1)
	assert.Empty(t, mm.created[0].FileIds)
}

func TestLongOrBracketedThreadTextIsShortenedSafely(t *testing.T) {
	mm := newFake()
	mm.posts["root"].Message = "[Draft] " + strings.Repeat("word ", 40)
	New(mm, func(string, ...any) {}).MessageHasBeenPosted(reply("ok", true))
	header := strings.SplitN(mm.created[0].Message, "\n", 2)[0]
	assert.Contains(t, header, "[(Draft) word")
	assert.Contains(t, header, "…](https://team.example.com/_redirect/pl/reply?src=channel)")
}
