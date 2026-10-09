// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import React, {useState} from 'react';

import Dialog, {Segmented} from './dialog';
import UserPicker from './user_picker';

import {createReminder, type Repeat, type Target, type UserSummary} from '../api';
import {channelLabel, isChannel, userTimeZone, uses24h} from '../mattermost_state';
import {store} from '../store';
import {formatSendAt, fromInputs, quickOptions, repeatLabel, toInputs} from '../time';

type Props = {channelId: string; onClose: () => void};

const CUSTOM = 'custom';

export default function ReminderDialog({channelId, onClose}: Props) {
    const timeZone = userTimeZone();
    const use24h = uses24h();
    const [now] = useState(Date.now());
    const options = quickOptions(now, timeZone);
    const tomorrow = options.find((o) => o.key === 'tomorrow')!.sendAt;

    const [target, setTarget] = useState<Target>('me');
    const [person, setPerson] = useState<UserSummary | null>(null);
    const [message, setMessage] = useState('');
    const [when, setWhen] = useState<string>('hour');
    const [date, setDate] = useState(toInputs(tomorrow, timeZone).date);
    const [time, setTime] = useState(toInputs(tomorrow, timeZone).time);
    const [repeat, setRepeat] = useState<Repeat>('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const inChannel = isChannel(channelId);
    const at = when === CUSTOM ? fromInputs(date, time, timeZone) : options.find((o) => o.key === when)?.sendAt ?? null;
    const inFuture = at !== null && at > Date.now() + 30000;
    const canConfirm = Boolean(message.trim()) && inFuture && (target !== 'user' || Boolean(person));

    let who = 'you';
    if (target === 'user') {
        who = person ? `@${person.username}` : 'them';
    } else if (target === 'channel') {
        who = channelLabel(channelId);
    }
    const repeats = at === null ? '' : repeatLabel(repeat, at, timeZone);

    const confirm = async () => {
        if (at === null) {
            return;
        }
        setBusy(true);
        setError('');
        try {
            await createReminder({
                target,
                user_id: target === 'user' && person ? person.id : '',
                channel_id: target === 'channel' ? channelId : '',
                message: message.trim(),
                at,
                repeat,
                time_zone: timeZone,
            });
            store.showToast({text: `I'll remind ${who} ${formatSendAt(at, timeZone, use24h)}${repeats ? `, ${repeats}` : ''}`, view: 'reminders'});
            store.refresh();
            onClose();
        } catch (err) {
            setError((err as Error).message);
            setBusy(false);
        }
    };

    const targets: Array<{value: Target; label: string}> = [{value: 'me', label: 'Me'}, {value: 'user', label: 'Someone else'}];
    if (inChannel) {
        targets.push({value: 'channel', label: channelLabel(channelId)});
    }

    return (
        <Dialog
            title='New reminder'
            confirmLabel='Create reminder'
            busy={busy}
            canConfirm={canConfirm}
            error={error}
            onConfirm={confirm}
            onClose={onClose}
        >
            <Segmented
                label='Remind'
                value={target}
                options={targets}
                onChange={setTarget}
            />
            {target === 'user' && (
                <UserPicker
                    value={person}
                    onChange={setPerson}
                    autoFocus={true}
                />
            )}
            <label className='qc-field'>
                <span className='qc-field__label'>{'About'}</span>
                <textarea
                    autoFocus={target !== 'user'}
                    maxLength={4000}
                    placeholder='e.g. Send the weekly report'
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                />
            </label>
            <div className='qc-row'>
                <label className='qc-field'>
                    <span className='qc-field__label'>{'When'}</span>
                    <select
                        value={when}
                        onChange={(e) => setWhen(e.target.value)}
                    >
                        {options.map((o) => (
                            <option
                                key={o.key}
                                value={o.key}
                            >
                                {o.label}
                            </option>
                        ))}
                        <option value={CUSTOM}>{'Custom…'}</option>
                    </select>
                </label>
                <label className='qc-field'>
                    <span className='qc-field__label'>{'Repeat'}</span>
                    <select
                        value={repeat}
                        onChange={(e) => setRepeat(e.target.value as Repeat)}
                    >
                        <option value=''>{'Never'}</option>
                        <option value='daily'>{'Every day'}</option>
                        <option value='weekdays'>{'Every weekday (Mon–Fri)'}</option>
                        <option value='weekly'>{'Every week'}</option>
                    </select>
                </label>
            </div>
            {when === CUSTOM && (
                <div className='qc-row'>
                    <label className='qc-field'>
                        <span className='qc-field__label'>{'Date'}</span>
                        <input
                            type='date'
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                        />
                    </label>
                    <label className='qc-field'>
                        <span className='qc-field__label'>{'Time'}</span>
                        <input
                            type='time'
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                        />
                    </label>
                </div>
            )}
            <p className='qc-muted'>
                {inFuture && at !== null ? `Reminds ${who} ${formatSendAt(at, timeZone, use24h)}${repeats ? `, ${repeats}` : ''} · ` : 'Pick a time in the future · '}
                {`Time zone: ${timeZone}`}
            </p>
        </Dialog>
    );
}
