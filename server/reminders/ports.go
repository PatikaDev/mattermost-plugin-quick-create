// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package reminders

import (
	"time"

	"github.com/mattermost/mattermost/server/public/model"
)

// Store persists reminders. Implementations must make CompareAndSwap atomic.
type Store interface {
	Get(id string) (*Reminder, []byte, error) // returns nil, nil, nil when missing
	Put(r *Reminder) error
	CompareAndSwap(old []byte, r *Reminder) (bool, error)
	Delete(id string) error
	All() ([]*Reminder, error)
}

// Mattermost is the slice of the server API the service needs.
type Mattermost interface {
	GetUser(userID string) (*model.User, error)
	GetChannel(channelID string) (*model.Channel, error)
	CanPost(userID, channelID string) bool
	// BotDM sends post to userID as a direct message from the plugin's bot.
	BotDM(userID string, post *model.Post) error
	// BotPost posts in post.ChannelId as the plugin's bot.
	BotPost(post *model.Post) error
	NotifyChanged(userID string)
	NewID() string
	// ActionURL is the integration URL that buttons on delivered reminders call.
	ActionURL() string
}

// Clock is the time source (fixed in tests).
type Clock interface {
	Now() time.Time
}
