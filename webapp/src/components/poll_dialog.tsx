// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import React, {useRef, useState} from 'react';

import Dialog from './dialog';

import {runCommand} from '../api';
import {currentTeamId} from '../mattermost_state';
import {buildPollCommand, MAX_OPTIONS, pollOptions} from '../poll';

type Props = {channelId: string; rootId: string; onClose: () => void};

type Row = {id: number; text: string};

export default function PollDialog({channelId, rootId, onClose}: Props) {
    const nextId = useRef(3);
    const inputs = useRef<Record<number, HTMLInputElement | null>>({});
    const [question, setQuestion] = useState('');
    const [rows, setRows] = useState<Row[]>([{id: 0, text: ''}, {id: 1, text: ''}, {id: 2, text: ''}]);
    const [focusId, setFocusId] = useState<number | null>(null);
    const [votes, setVotes] = useState(1);
    const [anonymous, setAnonymous] = useState(false);
    const [anonymousCreator, setAnonymousCreator] = useState(false);
    const [progress, setProgress] = useState(false);
    const [publicAddOption, setPublicAddOption] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const filled = pollOptions(rows.map((r) => r.text));
    const canConfirm = Boolean(question.trim()) && filled.length >= 2;
    const maxVotes = Math.max(filled.length, 1);
    const effectiveVotes = votes > maxVotes ? maxVotes : votes;

    const addRow = () => {
        if (rows.length >= MAX_OPTIONS) {
            return;
        }
        const id = nextId.current++;
        setRows([...rows, {id, text: ''}]);
        setFocusId(id);
    };

    const confirm = async () => {
        setBusy(true);
        setError('');
        try {
            const command = buildPollCommand(question, rows.map((r) => r.text), {votes: effectiveVotes, anonymous, anonymousCreator, progress, publicAddOption});
            await runCommand(command, channelId, currentTeamId(), rootId);
            onClose();
        } catch (err) {
            setError((err as Error).message);
            setBusy(false);
        }
    };

    const voteChoices = [];
    for (let n = 1; n <= maxVotes; n++) {
        voteChoices.push(n);
    }

    return (
        <Dialog
            title='New poll'
            confirmLabel='Create poll'
            busy={busy}
            canConfirm={canConfirm}
            error={error}
            onConfirm={confirm}
            onClose={onClose}
        >
            <label className='qc-field'>
                <span className='qc-field__label'>{'Question'}</span>
                <input
                    type='text'
                    autoFocus={true}
                    maxLength={500}
                    placeholder='e.g. Where should we have the team lunch?'
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                />
            </label>
            <div
                className='qc-field'
                role='group'
                aria-label='Options'
            >
                <span className='qc-field__label'>{'Options'}</span>
                {rows.map((row, i) => (
                    <div
                        key={row.id}
                        className='qc-option'
                    >
                        <input
                            ref={(el) => {
                                inputs.current[row.id] = el;
                                if (el && focusId === row.id) {
                                    el.focus();
                                    setFocusId(null);
                                }
                            }}
                            type='text'
                            maxLength={200}
                            aria-label={`Option ${i + 1}`}
                            placeholder={`Option ${i + 1}`}
                            value={row.text}
                            onChange={(e) => setRows(rows.map((r) => (r.id === row.id ? {...r, text: e.target.value} : r)))}
                            onKeyDown={(e) => {
                                // Enter moves to the next option (adding one at the end) instead of submitting.
                                if (e.key !== 'Enter') {
                                    return;
                                }
                                e.preventDefault();
                                const next = rows[i + 1];
                                if (next) {
                                    inputs.current[next.id]?.focus();
                                } else if (row.text.trim()) {
                                    addRow();
                                }
                            }}
                        />
                        <button
                            type='button'
                            className='qc-option__remove'
                            aria-label={`Remove option ${i + 1}`}
                            disabled={rows.length <= 2}
                            onClick={() => setRows(rows.filter((r) => r.id !== row.id))}
                        >
                            {'×'}
                        </button>
                    </div>
                ))}
                {rows.length < MAX_OPTIONS && (
                    <button
                        type='button'
                        className='qc-add-option'
                        onClick={addRow}
                    >
                        {'+ Add option'}
                    </button>
                )}
            </div>
            <label className='qc-field'>
                <span className='qc-field__label'>{'Votes per person'}</span>
                <select
                    value={effectiveVotes}
                    onChange={(e) => setVotes(Number(e.target.value))}
                >
                    {voteChoices.map((n) => (
                        <option
                            key={n}
                            value={n}
                        >
                            {n === 1 ? '1 (single choice)' : String(n)}
                        </option>
                    ))}
                    <option value={0}>{'Unlimited'}</option>
                </select>
            </label>
            <div className='qc-checks'>
                <Check
                    label='Anonymous votes'
                    hint="Don't show who voted for what"
                    checked={anonymous}
                    onChange={setAnonymous}
                />
                <Check
                    label='Hide my name'
                    hint="Don't show who created the poll"
                    checked={anonymousCreator}
                    onChange={setAnonymousCreator}
                />
                <Check
                    label='Show results while voting'
                    hint='Show how many votes each option has'
                    checked={progress}
                    onChange={setProgress}
                />
                <Check
                    label='Let everyone add options'
                    checked={publicAddOption}
                    onChange={setPublicAddOption}
                />
            </div>
        </Dialog>
    );
}

function Check({label, hint, checked, onChange}: {label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void}) {
    return (
        <label className='qc-check'>
            <input
                type='checkbox'
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
            />
            <span>
                {label}
                {hint && <span className='qc-muted'>{` — ${hint}`}</span>}
            </span>
        </label>
    );
}
