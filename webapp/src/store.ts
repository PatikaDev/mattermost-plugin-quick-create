// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

// The user's reminders and the confirmation toast, shared by the button, the panel and the
// toast. Refreshed on demand and whenever the server says it changed (websocket).

import {useEffect, useState} from 'react';

import {listReminders, type Reminder} from './api';

export type Toast = {text: string; view?: 'reminders'};

export type StoreState = {
    items: Reminder[];
    loaded: boolean;
    error: string;
    toast: Toast | null;
};

let state: StoreState = {items: [], loaded: false, error: '', toast: null};
const listeners = new Set<() => void>();

function set(patch: Partial<StoreState>) {
    state = {...state, ...patch};
    listeners.forEach((l) => l());
}

export const store = {
    getState: (): StoreState => state,

    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },

    async refresh(): Promise<void> {
        try {
            const items = await listReminders();
            set({items: items || [], loaded: true, error: ''});
        } catch (err) {
            set({loaded: true, error: (err as Error).message});
        }
    },

    showToast(toast: Toast) {
        set({toast});
    },

    dismissToast() {
        set({toast: null});
    },
};

// Only hooks available since React 16.8: the host webapp's React is used at runtime.
export function useStore(): StoreState {
    const [s, setS] = useState(store.getState());
    useEffect(() => store.subscribe(() => setS(store.getState())), []);
    return s;
}
