// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import React, {useState} from 'react';

import Dialog, {Segmented} from './dialog';
import UserPicker from './user_picker';

import {addTodo, type UserSummary} from '../api';
import {store} from '../store';

type For = 'me' | 'someone';

export default function TodoDialog({onClose}: {onClose: () => void}) {
    const [title, setTitle] = useState('');
    const [notes, setNotes] = useState('');
    const [forWhom, setForWhom] = useState<For>('me');
    const [person, setPerson] = useState<UserSummary | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const canConfirm = Boolean(title.trim()) && (forWhom === 'me' || Boolean(person));

    const confirm = async () => {
        setBusy(true);
        setError('');
        try {
            const sendTo = forWhom === 'someone' && person ? person.username : '';
            await addTodo(title.trim(), notes.trim(), sendTo);
            store.showToast({text: sendTo ? `Todo sent to @${sendTo}` : 'Added to your todos'});
            onClose();
        } catch (err) {
            setError((err as Error).message);
            setBusy(false);
        }
    };

    return (
        <Dialog
            title='New todo'
            confirmLabel={forWhom === 'someone' ? 'Send todo' : 'Add todo'}
            busy={busy}
            canConfirm={canConfirm}
            error={error}
            onConfirm={confirm}
            onClose={onClose}
        >
            <label className='qc-field'>
                <span className='qc-field__label'>{'Todo'}</span>
                <input
                    type='text'
                    autoFocus={true}
                    maxLength={300}
                    placeholder='e.g. Review the release notes'
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                />
            </label>
            <label className='qc-field'>
                <span className='qc-field__label'>{'Notes '}<span className='qc-muted'>{'(optional)'}</span></span>
                <textarea
                    maxLength={2000}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
            </label>
            <Segmented
                label='For'
                value={forWhom}
                options={[{value: 'me', label: 'Me'}, {value: 'someone', label: 'Someone else'}]}
                onChange={setForWhom}
            />
            {forWhom === 'someone' && (
                <div className='qc-field'>
                    <UserPicker
                        value={person}
                        onChange={setPerson}
                        autoFocus={true}
                    />
                    <span className='qc-muted'>{'They get it in their Todo list and can accept or decline it.'}</span>
                </div>
            )}
        </Dialog>
    );
}
