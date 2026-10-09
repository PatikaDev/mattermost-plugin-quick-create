// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import {buildPollCommand, cleanPollText, pollOptions} from './poll';

const defaults = {votes: 1, anonymous: false, anonymousCreator: false, progress: false, publicAddOption: false};

describe('buildPollCommand', () => {
    it('quotes the question and every option', () => {
        expect(buildPollCommand('Lunch?', ['Pizza', 'Döner', 'Salad', 'Soup'], defaults)).
            toBe('/poll "Lunch?" "Pizza" "Döner" "Salad" "Soup"');
    });

    it('drops empty options', () => {
        expect(pollOptions(['A', '  ', '', 'B'])).toEqual(['A', 'B']);
    });

    it('adds the chosen settings as Matterpoll flags', () => {
        expect(buildPollCommand('Q', ['A', 'B', 'C'], {votes: 2, anonymous: true, anonymousCreator: true, progress: true, publicAddOption: true})).
            toBe('/poll "Q" "A" "B" "C" --anonymous --anonymous-creator --progress --public-add-option --votes=2');
        expect(buildPollCommand('Q', ['A', 'B'], {...defaults, votes: 0})).toBe('/poll "Q" "A" "B" --votes=0');
    });
});

describe('cleanPollText', () => {
    it('replaces quotes Matterpoll would split on and keeps one line', () => {
        expect(cleanPollText('Say "hi" or “bye”\nnow ')).toBe('Say ʺhiʺ or ʺbyeʺ now');
    });
});
