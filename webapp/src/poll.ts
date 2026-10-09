// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

// Builds Matterpoll's `/poll "Question" "A" "B" --setting` command from the poll dialog, so
// polls can have any number of options (Matterpoll's own dialog stops at three).

export const MAX_OPTIONS = 20;

export type PollSettings = {
    votes: number; // votes per person; 0 = unlimited
    anonymous: boolean;
    anonymousCreator: boolean;
    progress: boolean;
    publicAddOption: boolean;
};

// Matterpoll splits the command on `" "` and on straight quotes, and treats curly quotes as
// straight ones, so a typed quote would cut the text. Use a look-alike that it leaves alone,
// and keep everything on one line.
export function cleanPollText(text: string): string {
    return text.replace(/[\r\n]+/g, ' ').replace(/["“”]/g, 'ʺ').trim();
}

export function pollOptions(options: string[]): string[] {
    return options.map(cleanPollText).filter(Boolean);
}

export function buildPollCommand(question: string, options: string[], s: PollSettings): string {
    const parts = [cleanPollText(question), ...pollOptions(options)].map((p) => `"${p}"`);
    const flags: string[] = [];
    if (s.anonymous) {
        flags.push('--anonymous');
    }
    if (s.anonymousCreator) {
        flags.push('--anonymous-creator');
    }
    if (s.progress) {
        flags.push('--progress');
    }
    if (s.publicAddOption) {
        flags.push('--public-add-option');
    }
    if (s.votes !== 1) {
        flags.push(`--votes=${s.votes}`);
    }
    return ['/poll', ...parts, ...flags].join(' ');
}
