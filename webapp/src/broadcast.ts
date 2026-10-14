// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

// "Also send to channel": which thread reply boxes have the toggle on. The MessageWillBePosted
// hook marks the next reply from such a thread, and the server copies it into the channel.

import {useEffect, useState} from 'react';

export const PROP_REQUESTED = 'qc_also_send_to_channel';

const enabled = new Set<string>(); // root post IDs
const listeners = new Set<() => void>();

function changed() {
    listeners.forEach((l) => l());
}

export const alsoSend = {
    isOn: (rootId: string) => enabled.has(rootId),

    toggle(rootId: string) {
        if (enabled.has(rootId)) {
            enabled.delete(rootId);
        } else {
            enabled.add(rootId);
        }
        changed();
    },

    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
};

export type OutgoingPost = {root_id?: string; message?: string; props?: Record<string, unknown>};

// Marks a reply whose thread has the toggle on, then switches the toggle off (like Slack).
export function markPost<T extends OutgoingPost>(post: T): {post: T} {
    const rootId = post.root_id || '';
    if (!rootId || !enabled.has(rootId)) {
        return {post};
    }
    enabled.delete(rootId);
    changed();
    return {post: {...post, props: {...(post.props || {}), [PROP_REQUESTED]: true}}};
}

// Only hooks available since React 16.8: the host webapp's React is used at runtime.
export function useAlsoSend(rootId: string): boolean {
    const [on, setOn] = useState(alsoSend.isOn(rootId));
    useEffect(() => {
        setOn(alsoSend.isOn(rootId));
        return alsoSend.subscribe(() => setOn(alsoSend.isOn(rootId)));
    }, [rootId]);
    return on;
}
