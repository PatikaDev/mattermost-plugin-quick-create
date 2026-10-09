// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package main

import (
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
	"github.com/mattermost/mattermost/server/public/pluginapi"
	"github.com/mattermost/mattermost/server/public/pluginapi/cluster"
	"github.com/pkg/errors"

	"github.com/PatikaDev/mattermost-plugin-quick-create/server/reminders"
)

// Plugin implements the interface expected by the Mattermost server to communicate between the server and plugin processes.
type Plugin struct {
	plugin.MattermostPlugin

	client  *pluginapi.Client
	router  *mux.Router
	service *reminders.Service
	botID   string
	sender  *cluster.Job

	// configurationLock synchronizes access to the configuration.
	configurationLock sync.RWMutex

	// configuration is the active plugin configuration. Consult getConfiguration and
	// setConfiguration for usage.
	configuration *configuration
}

type realClock struct{}

func (realClock) Now() time.Time { return time.Now() }

// OnActivate is invoked when the plugin is activated. If an error is returned, the plugin will be deactivated.
func (p *Plugin) OnActivate() error {
	p.client = pluginapi.NewClient(p.API, p.Driver)

	botID, err := p.client.Bot.EnsureBot(&model.Bot{
		Username:    "reminders",
		DisplayName: "Reminders",
		Description: "Delivers the reminders you set with Quick Create.",
	})
	if err != nil {
		return errors.Wrap(err, "failed to ensure bot")
	}
	p.botID = botID

	p.service = reminders.NewService(
		reminders.NewKVStore(&p.client.KV),
		mattermostAdapter{p: p},
		realClock{},
		func(msg string, keyValuePairs ...any) { p.API.LogWarn(msg, keyValuePairs...) },
	)
	p.router = p.initRouter()

	// cluster.Schedule runs the job on exactly one node of a cluster at a time.
	job, err := cluster.Schedule(p.API, "SendReminders", cluster.MakeWaitForInterval(time.Minute), p.service.SendDue)
	if err != nil {
		return errors.Wrap(err, "failed to schedule the reminder sender")
	}
	p.sender = job

	return nil
}

// OnDeactivate is invoked when the plugin is deactivated.
func (p *Plugin) OnDeactivate() error {
	if p.sender != nil {
		if err := p.sender.Close(); err != nil {
			p.API.LogError("Failed to stop the reminder sender", "err", err)
		}
	}
	return nil
}

// See https://developers.mattermost.com/extend/plugins/server/reference/
