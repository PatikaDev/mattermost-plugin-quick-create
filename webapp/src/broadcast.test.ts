// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import {alsoSend, markPost as mark, PROP_REQUESTED, type OutgoingPost} from './broadcast';

const markPost = (post: OutgoingPost) => mark(post);

describe('also send to channel', () => {
    it('marks the next reply in a thread with the toggle on, then turns the toggle off', () => {
        alsoSend.toggle('root1');
        const {post} = markPost({root_id: 'root1', message: 'ship it', props: {existing: 1}});
        expect(post.props).toEqual({existing: 1, [PROP_REQUESTED]: true});
        expect(alsoSend.isOn('root1')).toBe(false);

        const second = markPost({root_id: 'root1', message: 'again'});
        expect(second.post.props).toBeUndefined();
    });

    it('leaves other threads and channel messages alone', () => {
        alsoSend.toggle('root2');
        expect(markPost({root_id: 'other', message: 'x'}).post.props).toBeUndefined();
        expect(markPost({message: 'top-level'}).post.props).toBeUndefined();
        expect(alsoSend.isOn('root2')).toBe(true);
        alsoSend.toggle('root2');
        expect(alsoSend.isOn('root2')).toBe(false);
    });

    it('notifies subscribers when the toggle changes', () => {
        const listener = jest.fn();
        const unsubscribe = alsoSend.subscribe(listener);
        alsoSend.toggle('root3');
        markPost({root_id: 'root3'});
        expect(listener).toHaveBeenCalledTimes(2);
        unsubscribe();
    });
});
