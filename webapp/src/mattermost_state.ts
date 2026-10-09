// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

// Read-only helpers over the host webapp's Redux state (set once in initialize).

import type {Store} from 'redux';

import type {GlobalState} from '@mattermost/types/store';

import {resolveTimeZone} from './time';

let store: Store<GlobalState> | null = null;

export function setStore(s: Store<GlobalState>) {
    store = s;
}

export function dispatch(action: unknown) {
    store?.dispatch(action as never);
}

function state(): GlobalState | null {
    return store ? store.getState() : null;
}

function currentUser() {
    const s = state();
    if (!s) {
        return undefined;
    }
    return s.entities.users.profiles[s.entities.users.currentUserId];
}

export function userTimeZone(): string {
    return resolveTimeZone(currentUser()?.timezone as never);
}

// Mattermost's "Clock display: 24-hour" preference.
export function uses24h(): boolean {
    const prefs = state()?.entities.preferences.myPreferences as Record<string, {value?: string}> | undefined;
    return prefs?.['display_settings--use_military_time']?.value === 'true';
}

export function currentTeamId(): string {
    return state()?.entities.teams.currentTeamId || '';
}

export function currentUserId(): string {
    return state()?.entities.users.currentUserId || '';
}

// True for public and private channels — where a channel reminder can be posted.
export function isChannel(channelId: string): boolean {
    const type = state()?.entities.channels.channels[channelId]?.type;
    return type === 'O' || type === 'P';
}

export function usernameOf(userId: string): string | undefined {
    return state()?.entities.users.profiles[userId]?.username;
}

// "~town-square", "@alice", or a group's names — for showing where a message will go.
export function channelLabel(channelId: string): string {
    const s = state();
    const channel = s?.entities.channels.channels[channelId];
    if (!s || !channel) {
        return 'a conversation';
    }
    if (channel.type === 'D') {
        const me = s.entities.users.currentUserId;
        const otherId = channel.name.split('__').find((id) => id !== me) || me;
        const other = s.entities.users.profiles[otherId];
        return other ? `@${other.username}` : 'a direct message';
    }
    if (channel.type === 'G') {
        return channel.display_name || 'a group message';
    }
    return `~${channel.display_name || channel.name}`;
}
