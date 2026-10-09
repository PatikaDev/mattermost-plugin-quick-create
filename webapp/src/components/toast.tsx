// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import React, {useEffect} from 'react';

import {store, useStore} from '../store';

// The confirmation after creating something ("Todo sent to @alice", "I'll remind you …").
export default function Toast({onViewReminders}: {onViewReminders: () => void}) {
    const {toast} = useStore();

    useEffect(() => {
        if (!toast) {
            return undefined;
        }
        const timer = window.setTimeout(store.dismissToast, 6000);
        return () => window.clearTimeout(timer);
    }, [toast]);

    if (!toast) {
        return null;
    }
    return (
        <div
            className='qc-toast'
            role='status'
        >
            <span>{toast.text}</span>
            {toast.view === 'reminders' && (
                <button
                    type='button'
                    className='qc-toast__link'
                    onClick={() => {
                        store.dismissToast();
                        onViewReminders();
                    }}
                >
                    {'View'}
                </button>
            )}
            <button
                type='button'
                className='qc-toast__close'
                aria-label='Dismiss'
                onClick={store.dismissToast}
            >
                {'×'}
            </button>
        </div>
    );
}
