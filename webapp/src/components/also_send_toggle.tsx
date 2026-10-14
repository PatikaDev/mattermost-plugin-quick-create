// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import React from 'react';

import {alsoSend, useAlsoSend} from '../broadcast';
import {channelLabel} from '../mattermost_state';

type Props = {
    draft: {channelId: string; rootId?: string};
};

// "Also send to ~channel" in thread reply boxes only.
export default function AlsoSendToggle({draft}: Props) {
    const rootId = draft?.rootId || '';
    const on = useAlsoSend(rootId);
    if (!rootId) {
        return null;
    }
    const label = `Also send to ${channelLabel(draft.channelId)}`;
    return (
        <button
            type='button'
            className={`qc-toolbar-button qc-also-send${on ? ' qc-also-send--on' : ''}`}
            aria-label={label}
            aria-pressed={on}
            title={on ? `${label} — on` : label}
            onClick={() => alsoSend.toggle(rootId)}
        >
            <svg
                width={18}
                height={18}
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                strokeLinecap='round'
                strokeLinejoin='round'
                aria-hidden='true'
            >
                <path d='M4 5v6a4 4 0 0 0 4 4h12'/>
                <path d='M16 11l4 4-4 4'/>
            </svg>
            {on && <span className='qc-also-send__label'>{label}</span>}
        </button>
    );
}
