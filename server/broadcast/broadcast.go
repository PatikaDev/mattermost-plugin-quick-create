// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

// Package broadcast implements "Also send to channel": a thread reply marked by the web app is
// copied into its channel as the same user, with a line linking back to the thread.
package broadcast

import (
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/mattermost/mattermost/server/public/model"
)

const (
	// PropRequested is set by the web app on a reply whose "Also send to channel" toggle is on.
	PropRequested = "qc_also_send_to_channel"
	// PropCopyOf marks the channel copy with the reply it came from.
	PropCopyOf = "qc_copy_of"

	rootPreviewRunes = 80
)

// Mattermost is the slice of the server API the broadcaster needs.
type Mattermost interface {
	GetPost(postID string) (*model.Post, error)
	CanPost(userID, channelID string) bool
	// CopyFileInfos duplicates the user's attachments so the copy can carry them too.
	CopyFileInfos(userID string, fileIDs []string) ([]string, error)
	CreatePost(post *model.Post) error
	SiteURL() string
}

type Broadcaster struct {
	mm  Mattermost
	log func(msg string, keyValuePairs ...any)
}

func New(mm Mattermost, log func(msg string, keyValuePairs ...any)) *Broadcaster {
	return &Broadcaster{mm: mm, log: log}
}

// Requested reports whether a just-posted reply asked to be sent to the channel too.
func Requested(post *model.Post) bool {
	if post == nil || post.RootId == "" || post.IsSystemMessage() {
		return false
	}
	v, _ := post.GetProp(PropRequested).(bool)
	return v
}

// MessageHasBeenPosted copies a marked reply into the channel.
func (b *Broadcaster) MessageHasBeenPosted(reply *model.Post) {
	if !Requested(reply) {
		return
	}
	root, err := b.mm.GetPost(reply.RootId)
	if err != nil || root == nil || root.DeleteAt != 0 || root.ChannelId != reply.ChannelId {
		return
	}
	if !b.mm.CanPost(reply.UserId, reply.ChannelId) {
		return
	}

	copyPost := &model.Post{
		UserId:    reply.UserId,
		ChannelId: reply.ChannelId,
		Message:   b.message(reply, root),
	}
	copyPost.AddProp(PropCopyOf, reply.Id)
	if len(reply.FileIds) > 0 {
		ids, err := b.mm.CopyFileInfos(reply.UserId, reply.FileIds)
		if err != nil {
			b.log("Could not copy attachments for the channel copy", "post_id", reply.Id, "error", err.Error())
		} else {
			copyPost.FileIds = ids
		}
	}
	if err := b.mm.CreatePost(copyPost); err != nil {
		b.log("Could not send the thread reply to the channel", "post_id", reply.Id, "error", err.Error())
	}
}

// message is "↪ replied to a thread: [first words of the thread](link to the reply)" above the
// reply's own text.
func (b *Broadcaster) message(reply, root *model.Post) string {
	preview := strings.Join(strings.Fields(root.Message), " ")
	switch {
	case preview == "":
		preview = "a message"
	case utf8.RuneCountInString(preview) > rootPreviewRunes:
		preview = string([]rune(preview)[:rootPreviewRunes]) + "…"
	}
	// Square brackets would end the link text early.
	preview = strings.NewReplacer("[", "(", "]", ")").Replace(preview)
	// The query keeps Mattermost from embedding a preview of the reply (it only embeds bare
	// permalinks), which would show the same text twice; the link still opens the thread.
	link := fmt.Sprintf("%s/_redirect/pl/%s?src=channel", strings.TrimRight(b.mm.SiteURL(), "/"), reply.Id)
	header := fmt.Sprintf("↪ _replied to a thread:_ [%s](%s)", preview, link)
	if strings.TrimSpace(reply.Message) == "" {
		return header
	}
	return header + "\n\n" + reply.Message
}
