// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import React, {useEffect, useRef, useState} from 'react';
import ReactDOM from 'react-dom';

import {BellIcon, PlusIcon, PollIcon, TodoIcon} from './icons';
import PollDialog from './poll_dialog';
import ReminderDialog from './reminder_dialog';
import TodoDialog from './todo_dialog';

// What Mattermost passes to toolbar plugins (the same on 10.11, 11.x and 12.x).
type Props = {
    draft: {channelId: string; rootId?: string};
};

type Open = 'poll' | 'todo' | 'reminder' | null;

export default function CreateButton({draft}: Props) {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [open, setOpen] = useState<Open>(null);

    useEffect(() => {
        if (!menuOpen) {
            return undefined;
        }
        const onDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (!buttonRef.current?.contains(target) && !(target as Element).closest?.('.qc-menu')) {
                setMenuOpen(false);
            }
        };
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [menuOpen]);

    const channelId = draft?.channelId;

    const rect = buttonRef.current?.getBoundingClientRect();
    const menuStyle: React.CSSProperties = rect ? {
        bottom: (window.innerHeight - rect.top) + 8,
        left: Math.max(8, Math.min(rect.left - 100, window.innerWidth - 248)),
        width: 240,
    } : {};

    const items = [
        {key: 'poll', label: 'Poll', icon: <PollIcon/>, onClick: () => setOpen('poll')},
        {key: 'todo', label: 'Todo', icon: <TodoIcon/>, onClick: () => setOpen('todo')},
        {key: 'reminder', label: 'Reminder', icon: <BellIcon/>, onClick: () => setOpen('reminder')},
    ];

    return (
        <>
            <button
                ref={buttonRef}
                type='button'
                className={`qc-toolbar-button${menuOpen ? ' qc-toolbar-button--active' : ''}`}
                aria-label='Create poll, todo or reminder'
                title='Create a poll, todo or reminder'
                disabled={!channelId}
                onClick={() => setMenuOpen(!menuOpen)}
            >
                <PlusIcon/>
            </button>

            {menuOpen && ReactDOM.createPortal((
                <div
                    className='qc-menu'
                    role='menu'
                    style={menuStyle}
                >
                    <div className='qc-menu__title'>{'Create'}</div>
                    {items.map((item) => (
                        <button
                            key={item.key}
                            type='button'
                            role='menuitem'
                            className='qc-menu__item'
                            onClick={() => {
                                setMenuOpen(false);
                                item.onClick();
                            }}
                        >
                            <span className='qc-menu__item-label'>
                                {item.icon}
                                {item.label}
                            </span>
                        </button>
                    ))}
                </div>
            ), document.body)}

            {open === 'poll' && (
                <PollDialog
                    channelId={channelId}
                    rootId={draft.rootId || ''}
                    onClose={() => setOpen(null)}
                />
            )}
            {open === 'todo' && <TodoDialog onClose={() => setOpen(null)}/>}
            {open === 'reminder' && (
                <ReminderDialog
                    channelId={channelId}
                    onClose={() => setOpen(null)}
                />
            )}
        </>
    );
}
