// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import manifest from 'manifest';

export type Target = 'me' | 'user' | 'channel';
export type Repeat = '' | 'daily' | 'weekdays' | 'weekly';

export type Reminder = {
    id: string;
    creator_id: string;
    target: Target;
    user_id?: string;
    channel_id?: string;
    message: string;
    at: number;
    repeat?: Repeat;
    time_zone: string;
};

export type CreateReminderRequest = {
    target: Target;
    user_id: string;
    channel_id: string;
    message: string;
    at: number;
    repeat: Repeat;
    time_zone: string;
};

export type UserSummary = {
    id: string;
    username: string;
    first_name?: string;
    last_name?: string;
    nickname?: string;
    is_bot?: boolean;
    delete_at?: number;
};

declare global {
    interface Window {
        basename?: string;
    }
}

const root = () => window.basename || '';

// Cookie-authenticated requests must identify as the web app, and writes need the CSRF token.
function headers(): Record<string, string> {
    const csrf = document.cookie.split('; ').find((c) => c.startsWith('MMCSRF='))?.split('=')[1] || '';
    return {'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf};
}

export class HttpError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
    const res = await fetch(root() + url, {
        method,
        headers: headers(),
        credentials: 'same-origin',
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
        let message = 'Something went wrong. Please try again.';
        try {
            const data = await res.json();
            message = data.message || data.error || message;
        } catch {
            // Non-JSON error body: keep the generic message.
        }
        throw new HttpError(message, res.status);
    }
    const text = res.status === 204 ? '' : await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
}

const plugin = `/plugins/${manifest.id}/api/v1`;

export const listReminders = () => call<Reminder[]>('GET', `${plugin}/reminders`);
export const createReminder = (req: CreateReminderRequest) => call<Reminder>('POST', `${plugin}/reminders`, req);
export const deleteReminder = (id: string) => call<void>('DELETE', `${plugin}/reminders/${id}`);

// Runs a slash command as if typed in the message box (used for Matterpoll's /poll).
export async function runCommand(command: string, channelId: string, teamId: string, rootId: string): Promise<void> {
    try {
        await call('POST', '/api/v4/commands/execute', {command, channel_id: channelId, team_id: teamId, root_id: rootId});
    } catch (err) {
        if (err instanceof HttpError && err.status === 404) {
            throw new Error('Polls need the Matterpoll plugin. Ask your admin to enable it.');
        }
        throw err;
    }
}

// The Todo plugin's own endpoint (mattermost-community/mattermost-plugin-todo). An empty
// sendTo adds to your own list.
export async function addTodo(message: string, description: string, sendTo: string): Promise<void> {
    try {
        await call('POST', '/plugins/com.mattermost.plugin-todo/add', {message, description, send_to: sendTo, post_id: ''});
    } catch (err) {
        if (err instanceof HttpError && err.status === 404) {
            throw new Error('Todos need the Todo plugin. Ask your admin to enable it.');
        }
        throw err;
    }
}

export async function searchUsers(term: string, teamId: string): Promise<UserSummary[]> {
    const q = new URLSearchParams({name: term, in_team: teamId, limit: '10'});
    const res = await call<{users?: UserSummary[]}>('GET', `/api/v4/users/autocomplete?${q}`);
    return (res?.users || []).filter((u) => !u.is_bot && !u.delete_at);
}

export const getUser = (id: string) => call<UserSummary>('GET', `/api/v4/users/${id}`);
