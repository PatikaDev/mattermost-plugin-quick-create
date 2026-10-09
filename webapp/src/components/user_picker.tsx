// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import React, {useEffect, useState} from 'react';

import {searchUsers, type UserSummary} from '../api';
import {currentTeamId, currentUserId} from '../mattermost_state';

function displayName(u: UserSummary): string {
    const full = [u.first_name, u.last_name].filter(Boolean).join(' ');
    return full ? `@${u.username} · ${full}` : `@${u.username}`;
}

type Props = {
    value: UserSummary | null;
    onChange: (u: UserSummary | null) => void;
    autoFocus?: boolean;
};

// Search the team's people by name or username; excludes bots, deactivated accounts and you.
export default function UserPicker({value, onChange, autoFocus}: Props) {
    const [term, setTerm] = useState('');
    const [results, setResults] = useState<UserSummary[]>([]);
    const [active, setActive] = useState(0);

    useEffect(() => {
        if (value || !term.trim()) {
            setResults([]);
            return undefined;
        }
        let cancelled = false;
        const timer = window.setTimeout(async () => {
            try {
                const me = currentUserId();
                const users = (await searchUsers(term.trim(), currentTeamId())).filter((u) => u.id !== me);
                if (!cancelled) {
                    setResults(users);
                    setActive(0);
                }
            } catch {
                if (!cancelled) {
                    setResults([]);
                }
            }
        }, 200);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [term, value]);

    if (value) {
        return (
            <span className='qc-chip'>
                {displayName(value)}
                <button
                    type='button'
                    aria-label='Remove'
                    onClick={() => onChange(null)}
                >
                    {'×'}
                </button>
            </span>
        );
    }

    const pick = (u: UserSummary) => {
        onChange(u);
        setTerm('');
    };

    return (
        <div className='qc-picker'>
            <input
                className='qc-input'
                type='text'
                placeholder='Search by name or @username'
                aria-label='Person'
                autoFocus={autoFocus}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => {
                    if (!results.length) {
                        return;
                    }
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setActive((active + 1) % results.length);
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setActive(((active - 1) + results.length) % results.length);
                    } else if (e.key === 'Enter') {
                        e.preventDefault();
                        pick(results[active]);
                    }
                }}
            />
            {results.length > 0 && (
                <ul
                    className='qc-picker__list'
                    role='listbox'
                >
                    {results.map((u, i) => (
                        <li
                            key={u.id}
                            role='option'
                            aria-selected={i === active}
                            className={`qc-picker__option${i === active ? ' qc-picker__option--active' : ''}`}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                pick(u);
                            }}
                        >
                            {displayName(u)}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
