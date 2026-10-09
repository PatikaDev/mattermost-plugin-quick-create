// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import React from 'react';

type IconProps = {size?: number; label?: string; children: React.ReactNode};

// With a label, the icon names its button for screen readers: Mattermost renders app-bar
// items as an unlabeled role="button" around the plugin's icon.
function Icon({size = 18, label, children}: IconProps) {
    return (
        <svg
            width={size}
            height={size}
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
            {...(label ? {role: 'img', 'aria-label': label} : {'aria-hidden': 'true'})}
        >
            {children}
        </svg>
    );
}

export const PlusIcon = ({size}: {size?: number}) => (
    <Icon size={size}>
        <circle
            cx='12'
            cy='12'
            r='9'
        />
        <path d='M12 8v8M8 12h8'/>
    </Icon>
);

export const PollIcon = ({size}: {size?: number}) => (
    <Icon size={size}>
        <path d='M5 20V10M12 20V4M19 20v-7'/>
    </Icon>
);

export const TodoIcon = ({size}: {size?: number}) => (
    <Icon size={size}>
        <rect
            x='4'
            y='4'
            width='16'
            height='16'
            rx='3'
        />
        <path d='M8.5 12.5l2.5 2.5 4.5-5'/>
    </Icon>
);

export const BellIcon = ({size, label}: {size?: number; label?: string}) => (
    <Icon
        size={size}
        label={label}
    >
        <path d='M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z'/>
        <path d='M10 20a2 2 0 0 0 4 0'/>
    </Icon>
);
