// Copyright (c) 2026-present Patika. All Rights Reserved.
// See LICENSE for license information.

import manifest from 'manifest';
import React from 'react';
import type {Store} from 'redux';

import type {GlobalState} from '@mattermost/types/store';

import type {PluginRegistry} from 'types/mattermost-webapp';

import {markPost} from './broadcast';
import AlsoSendToggle from './components/also_send_toggle';
import CreateButton from './components/create_button';
import {BellIcon} from './components/icons';
import RemindersPanel from './components/reminders_panel';
import Toast from './components/toast';
import {dispatch, setStore} from './mattermost_state';
import {store as reminders} from './store';

import './styles.css';

export default class Plugin {
    public async initialize(registry: PluginRegistry, store: Store<GlobalState>) {
        setStore(store);

        // The ⊕ button in every message box (channel and thread reply).
        registry.registerPostEditorActionComponent(CreateButton);

        // "Also send to ~channel" in thread reply boxes: the hook marks the reply, the server
        // posts the channel copy.
        registry.registerPostEditorActionComponent(AlsoSendToggle);
        registry.registerMessageWillBePostedHook(async (post) => markPost(post));

        // The "Reminders" panel, opened from the app bar / channel header.
        const {showRHSPlugin, toggleRHSPlugin} = registry.registerRightHandSidebarComponent(RemindersPanel, 'Reminders');
        registry.registerChannelHeaderButtonAction(
            <BellIcon label='Reminders'/>,
            () => dispatch(toggleRHSPlugin),
            'Reminders',
            'Reminders',
        );

        registry.registerRootComponent(() => <Toast onViewReminders={() => dispatch(showRHSPlugin)}/>);

        // Keep every open tab in sync when reminders are delivered, snoozed or deleted.
        registry.registerWebSocketEventHandler(`custom_${manifest.id}_reminders_changed`, () => {
            reminders.refresh();
        });
    }
}

declare global {
    interface Window {
        registerPlugin(pluginId: string, plugin: Plugin): void;
    }
}

window.registerPlugin(manifest.id, new Plugin());
