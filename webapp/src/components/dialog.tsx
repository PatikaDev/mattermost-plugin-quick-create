// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import React, {useEffect} from 'react';
import ReactDOM from 'react-dom';

type Props = {
    title: string;
    confirmLabel: string;
    busy: boolean;
    canConfirm: boolean;
    error: string;
    onConfirm: () => void;
    onClose: () => void;
    children: React.ReactNode;
};

// The shared modal shell: title, fields, error line, Cancel / confirm. Escape closes it.
export default function Dialog({title, confirmLabel, busy, canConfirm, error, onConfirm, onClose, children}: Props) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return ReactDOM.createPortal((
        <div
            className='qc-overlay'
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
            <form
                className='qc-dialog qc-dialog--wide'
                role='dialog'
                aria-modal='true'
                aria-labelledby='qc-dialog-title'
                onSubmit={(e) => {
                    e.preventDefault();
                    if (canConfirm && !busy) {
                        onConfirm();
                    }
                }}
            >
                <h2 id='qc-dialog-title'>{title}</h2>
                <div className='qc-form'>{children}</div>
                {error && <p className='qc-error'>{error}</p>}
                <div className='qc-dialog__actions'>
                    <button
                        type='button'
                        className='btn btn-tertiary'
                        onClick={onClose}
                    >
                        {'Cancel'}
                    </button>
                    <button
                        type='submit'
                        className='btn btn-primary'
                        disabled={busy || !canConfirm}
                    >
                        {busy ? 'Saving…' : confirmLabel}
                    </button>
                </div>
            </form>
        </div>
    ), document.body);
}

// Pill buttons for picking one of a few options.
export function Segmented<T extends string>({label, value, options, onChange}: {
    label: string;
    value: T;
    options: Array<{value: T; label: string}>;
    onChange: (v: T) => void;
}) {
    return (
        <div
            className='qc-field'
            role='group'
            aria-label={label}
        >
            <span className='qc-field__label'>{label}</span>
            <div className='qc-segmented'>
                {options.map((o) => (
                    <button
                        key={o.value}
                        type='button'
                        aria-pressed={o.value === value}
                        onClick={() => onChange(o.value)}
                    >
                        {o.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
