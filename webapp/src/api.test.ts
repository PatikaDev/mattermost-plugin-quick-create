/**
 * @jest-environment jsdom
 */
// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import {addTodo, createReminder, runCommand, searchUsers} from './api';
import {store} from './store';

const fetchMock = jest.fn();

beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
    document.cookie = 'MMCSRF=csrf-token-123';
});

const ok = (body: unknown, status = 200) => ({ok: true, status, text: async () => (body === undefined ? '' : JSON.stringify(body))});
const fail = (status: number, body: unknown) => ({ok: false, status, json: async () => body});

describe('api', () => {
    it('creates reminders with the headers Mattermost requires for cookie-authenticated writes', async () => {
        fetchMock.mockResolvedValue(ok({id: 'r'}, 201));
        await createReminder({target: 'me', user_id: '', channel_id: '', message: 'hi', at: 1, repeat: '', time_zone: 'UTC'});
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('/plugins/dev.patika.quick-create/api/v1/reminders');
        expect(init.method).toBe('POST');
        expect(init.headers).toMatchObject({'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': 'csrf-token-123'});
    });

    it('runs /poll through the command API so Matterpoll can open its dialog', async () => {
        fetchMock.mockResolvedValue(ok({}));
        await runCommand('/poll', 'chan', 'team', 'root');
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('/api/v4/commands/execute');
        expect(JSON.parse(init.body)).toEqual({command: '/poll', channel_id: 'chan', team_id: 'team', root_id: 'root'});
    });

    it('explains a missing Matterpoll plugin', async () => {
        fetchMock.mockResolvedValue(fail(404, {message: "Command with a trigger of 'poll' not found."}));
        await expect(runCommand('/poll', 'c', 't', '')).rejects.toThrow('Polls need the Matterpoll plugin');
    });

    it('adds todos through the Todo plugin, empty send_to for yourself', async () => {
        fetchMock.mockResolvedValue(ok(undefined));
        await addTodo('Review', 'notes', '');
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('/plugins/com.mattermost.plugin-todo/add');
        expect(JSON.parse(init.body)).toEqual({message: 'Review', description: 'notes', send_to: '', post_id: ''});
    });

    it('explains a missing Todo plugin', async () => {
        fetchMock.mockResolvedValue(fail(404, {}));
        await expect(addTodo('x', '', '')).rejects.toThrow('Todos need the Todo plugin');
    });

    it('leaves bots and deactivated accounts out of people search', async () => {
        fetchMock.mockResolvedValue(ok({users: [{id: 'a', username: 'alice'}, {id: 'b', username: 'bot', is_bot: true}, {id: 'c', username: 'gone', delete_at: 5}]}));
        expect((await searchUsers('a', 'team')).map((u) => u.username)).toEqual(['alice']);
        expect(fetchMock.mock.calls[0][0]).toBe('/api/v4/users/autocomplete?name=a&in_team=team&limit=10');
    });
});

describe('store', () => {
    it('loads reminders and keeps the last error visible', async () => {
        fetchMock.mockResolvedValueOnce(ok([{id: 'a'}]));
        await store.refresh();
        expect(store.getState()).toMatchObject({loaded: true, error: '', items: [{id: 'a'}]});

        fetchMock.mockResolvedValueOnce(fail(500, {message: 'Something went wrong. Please try again.'}));
        await store.refresh();
        expect(store.getState().error).toBe('Something went wrong. Please try again.');
        expect(store.getState().items).toEqual([{id: 'a'}]);
    });
});
