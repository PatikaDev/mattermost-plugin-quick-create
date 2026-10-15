// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import React, {useEffect, useRef, useState} from 'react';
import ReactDOM from 'react-dom';

import {alsoSend, useAlsoSend} from '../broadcast';
import {channelLabel} from '../mattermost_state';

type Props = {
    draft: {channelId: string; rootId?: string};
};

// Finds the message box around the toolbar and adds an empty host element right under the
// text area, where Slack shows its "Also send to #channel" checkbox. Mattermost only offers
// plugins a toolbar slot, so the row is portalled there. The host sits after React's own
// nodes for the text area, so Mattermost keeps rendering its children around it unchanged.
function useRowHost(anchor: React.RefObject<HTMLElement>, active: boolean): HTMLElement | null {
    const [host, setHost] = useState<HTMLElement | null>(null);
    useEffect(() => {
        const cell = active ? anchor.current?.closest('.AdvancedTextEditor__cell') : null;
        const textarea = cell?.querySelector('textarea');
        const textBlock = textarea && Array.from(cell!.children).find((child) => child.contains(textarea));
        if (!textBlock) {
            setHost(null);
            return undefined;
        }
        const el = document.createElement('div');
        el.className = 'qc-also-send-host';
        textBlock.after(el);
        setHost(el);
        return () => {
            el.remove();
        };
    }, [anchor, active]);
    return host;
}

// "Also send to ~channel" under the text of thread reply boxes.
export default function AlsoSendToggle({draft}: Props) {
    const rootId = draft?.rootId || '';
    const anchor = useRef<HTMLSpanElement>(null);
    const checked = useAlsoSend(rootId);
    const host = useRowHost(anchor, Boolean(rootId));

    if (!rootId) {
        return null;
    }
    const label = channelLabel(draft.channelId);
    return (
        <>
            <span
                ref={anchor}
                className='qc-also-send-anchor'
                aria-hidden='true'
            />
            {host && ReactDOM.createPortal((
                <label className='qc-also-send'>
                    <input
                        type='checkbox'
                        checked={checked}
                        onChange={() => alsoSend.toggle(rootId)}
                    />
                    <span>
                        {'Also send to '}
                        <strong>{label}</strong>
                    </span>
                </label>
            ), host)}
        </>
    );
}
