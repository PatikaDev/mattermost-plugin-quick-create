// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import React, {useEffect, useState} from 'react';

import {deleteReminder, getUser, type Reminder} from '../api';
import {channelLabel, userTimeZone, usernameOf, uses24h} from '../mattermost_state';
import {store, useStore} from '../store';
import {formatSendAt, repeatLabel} from '../time';

const PREVIEW_CHARS = 280;

// "You", "@alice" or "~Town Square".
function useRecipient(r: Reminder): string {
    const known = r.user_id ? usernameOf(r.user_id) : undefined;
    const [username, setUsername] = useState(known);
    useEffect(() => {
        if (r.target === 'user' && r.user_id && !known) {
            getUser(r.user_id).then((u) => setUsername(u.username), () => undefined);
        }
    }, [r.target, r.user_id, known]);

    if (r.target === 'me') {
        return 'You';
    }
    if (r.target === 'channel' && r.channel_id) {
        return channelLabel(r.channel_id);
    }
    return username ? `@${username}` : 'Someone';
}

function Item({reminder, timeZone, use24h}: {reminder: Reminder; timeZone: string; use24h: boolean}) {
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const recipient = useRecipient(reminder);
    const repeats = repeatLabel(reminder.repeat, reminder.at, reminder.time_zone || timeZone);
    const text = reminder.message.length > PREVIEW_CHARS ? `${reminder.message.slice(0, PREVIEW_CHARS)}…` : reminder.message;

    const remove = async () => {
        setBusy(true);
        setError('');
        try {
            await deleteReminder(reminder.id);
            await store.refresh();
        } catch (err) {
            setError((err as Error).message);
            setBusy(false);
        }
    };

    return (
        <li className='qc-item'>
            <div className='qc-item__meta'>
                <span className='qc-item__where'>{recipient}</span>
                <span className='qc-item__when'>{formatSendAt(reminder.at, timeZone, use24h)}</span>
            </div>
            <div className='qc-item__text'>{text}</div>
            {repeats && <div className='qc-muted qc-item__repeat'>{`Repeats ${repeats}`}</div>}
            {error && <div className='qc-error'>{error}</div>}
            <div className='qc-item__actions'>
                {confirmDelete ? (
                    <>
                        <span className='qc-muted'>{'Delete this reminder?'}</span>
                        <button
                            type='button'
                            className='btn btn-sm btn-danger'
                            disabled={busy}
                            onClick={remove}
                        >
                            {'Delete'}
                        </button>
                        <button
                            type='button'
                            className='btn btn-sm btn-tertiary'
                            onClick={() => setConfirmDelete(false)}
                        >
                            {'Keep'}
                        </button>
                    </>
                ) : (
                    <button
                        type='button'
                        className='btn btn-sm btn-tertiary'
                        onClick={() => setConfirmDelete(true)}
                    >
                        {'Delete'}
                    </button>
                )}
            </div>
        </li>
    );
}

export default function RemindersPanel() {
    const {items, loaded, error} = useStore();
    useEffect(() => {
        store.refresh();
    }, []);
    const timeZone = userTimeZone();
    const use24h = uses24h();

    return (
        <div className='qc-panel'>
            {error && <p className='qc-error'>{error}</p>}
            {loaded && items.length === 0 && (
                <div className='qc-empty qc-muted'>
                    <p>{'No reminders yet.'}</p>
                    <p>{'Click ⊕ in the message box and choose Reminder.'}</p>
                </div>
            )}
            <ul className='qc-list'>
                {items.map((r) => (
                    <Item
                        key={r.id}
                        reminder={r}
                        timeZone={timeZone}
                        use24h={use24h}
                    />
                ))}
            </ul>
        </div>
    );
}
