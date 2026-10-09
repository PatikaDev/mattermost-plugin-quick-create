// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

package main

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/PatikaDev/mattermost-plugin-quick-create/server/reminders"
)

const maxBodyBytes = 64 * 1024

// initRouter serves <siteURL>/plugins/dev.patika.quick-create/api/v1/…
func (p *Plugin) initRouter() *mux.Router {
	router := mux.NewRouter()
	router.Use(p.MattermostAuthorizationRequired)

	api := router.PathPrefix("/api/v1").Subrouter()
	api.HandleFunc("/reminders", p.handleList).Methods(http.MethodGet)
	api.HandleFunc("/reminders", p.handleCreate).Methods(http.MethodPost)
	api.HandleFunc("/reminders/{id:[a-z0-9]{26}}", p.handleDelete).Methods(http.MethodDelete)
	// Called by Mattermost when someone clicks Snooze or Done on a delivered reminder.
	api.HandleFunc("/actions", p.handleAction).Methods(http.MethodPost)
	return router
}

func (p *Plugin) ServeHTTP(c *plugin.Context, w http.ResponseWriter, r *http.Request) {
	p.router.ServeHTTP(w, r)
}

// MattermostAuthorizationRequired lets only logged-in users through; Mattermost sets the
// header after authenticating the session (and checking CSRF for cookie-authenticated writes).
func (p *Plugin) MattermostAuthorizationRequired(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Mattermost-User-ID") == "" {
			http.Error(w, "Not authorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func userID(r *http.Request) string { return r.Header.Get("Mattermost-User-ID") }

func (p *Plugin) handleList(w http.ResponseWriter, r *http.Request) {
	items, err := p.service.List(userID(r))
	if err != nil {
		p.writeError(w, err)
		return
	}
	p.writeJSON(w, http.StatusOK, items)
}

func (p *Plugin) handleCreate(w http.ResponseWriter, r *http.Request) {
	var req reminders.CreateRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes)).Decode(&req); err != nil {
		p.writeError(w, &reminders.UserError{Msg: "Invalid request."})
		return
	}
	item, err := p.service.Create(userID(r), req)
	if err != nil {
		p.writeError(w, err)
		return
	}
	p.writeJSON(w, http.StatusCreated, item)
}

func (p *Plugin) handleDelete(w http.ResponseWriter, r *http.Request) {
	if err := p.service.Delete(userID(r), mux.Vars(r)["id"]); err != nil {
		p.writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleAction handles Snooze and Done on a reminder DM. The buttons are replaced by a short
// note so they can't be clicked twice.
func (p *Plugin) handleAction(w http.ResponseWriter, r *http.Request) {
	var req model.PostActionIntegrationRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes)).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	uid := userID(r)
	post, err := p.client.Post.GetPost(req.PostId)
	if err != nil || post.UserId != p.botID {
		http.Error(w, "Not a reminder", http.StatusBadRequest)
		return
	}

	kind, _ := req.Context["action"].(string)
	option, _ := req.Context["option"].(string)
	message, _ := req.Context["message"].(string)

	var note string
	switch kind {
	case "snooze":
		at, loc, err := p.service.Snooze(uid, message, option)
		if err != nil {
			var userErr *reminders.UserError
			text := "Couldn't snooze the reminder. Please try again."
			if errors.As(err, &userErr) {
				text = userErr.Msg
			} else {
				p.API.LogError("Snooze failed", "error", err.Error())
			}
			p.writeJSON(w, http.StatusOK, &model.PostActionIntegrationResponse{EphemeralText: text})
			return
		}
		note = "💤 Snoozed until " + at.In(loc).Format("Mon, Jan 2 15:04")
	case "done":
		note = "✅ Done"
	default:
		http.Error(w, "Unknown action", http.StatusBadRequest)
		return
	}

	attachments := post.Attachments()
	for _, a := range attachments {
		a.Actions = nil
		a.Footer = note
	}
	post.AddProp("attachments", attachments)
	p.writeJSON(w, http.StatusOK, &model.PostActionIntegrationResponse{Update: post})
}

func (p *Plugin) writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		p.API.LogError("Failed to write response", "error", err.Error())
	}
}

// writeError shows user-facing errors as they are and hides internal ones.
func (p *Plugin) writeError(w http.ResponseWriter, err error) {
	var userErr *reminders.UserError
	switch {
	case errors.Is(err, reminders.ErrNotFound):
		p.writeJSON(w, http.StatusNotFound, map[string]string{"message": err.Error()})
	case errors.As(err, &userErr):
		p.writeJSON(w, http.StatusBadRequest, map[string]string{"message": userErr.Msg})
	default:
		p.API.LogError("Quick Create request failed", "error", err.Error())
		p.writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Something went wrong. Please try again."})
	}
}
