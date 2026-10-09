// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package main

import (
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/pkg/errors"
)

// WebSocketEventChanged tells a user's open Mattermost tabs to refresh their reminders.
const WebSocketEventChanged = "reminders_changed"

// mattermostAdapter implements reminders.Mattermost on top of the plugin API.
type mattermostAdapter struct {
	p *Plugin
}

func (a mattermostAdapter) GetUser(userID string) (*model.User, error) {
	return a.p.client.User.Get(userID)
}

func (a mattermostAdapter) GetChannel(channelID string) (*model.Channel, error) {
	return a.p.client.Channel.Get(channelID)
}

func (a mattermostAdapter) CanPost(userID, channelID string) bool {
	return a.p.API.HasPermissionToChannel(userID, channelID, model.PermissionCreatePost)
}

func (a mattermostAdapter) BotDM(userID string, post *model.Post) error {
	if a.p.botID == "" {
		return errors.New("bot not ready")
	}
	return a.p.client.Post.DM(a.p.botID, userID, post)
}

func (a mattermostAdapter) BotPost(post *model.Post) error {
	if a.p.botID == "" {
		return errors.New("bot not ready")
	}
	post.UserId = a.p.botID
	return a.p.client.Post.CreatePost(post)
}

func (a mattermostAdapter) NotifyChanged(userID string) {
	a.p.API.PublishWebSocketEvent(WebSocketEventChanged, map[string]any{}, &model.WebsocketBroadcast{UserId: userID})
}

func (a mattermostAdapter) NewID() string { return model.NewId() }

func (a mattermostAdapter) ActionURL() string {
	return "/plugins/" + manifest.Id + "/api/v1/actions"
}
