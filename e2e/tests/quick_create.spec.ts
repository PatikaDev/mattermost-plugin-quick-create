import {expect, test, type Page} from '@playwright/test';

import {api, create, http, login, newSession, openChannel, pluginApi, TEAM, waitFor} from './helpers';

const todoList = (page: Page, list: 'my' | 'in' | 'out') => http(page, 'GET', `/plugins/com.mattermost.plugin-todo/list?list=${list}`) as Promise<Array<{message: string}>>;

async function clearReminders(page: Page) {
    for (const r of await pluginApi<any[]>(page, 'GET', '/reminders') || []) {
        await pluginApi(page, 'DELETE', `/reminders/${r.id}`);
    }
}

test.describe('Quick Create', () => {
    test.beforeEach(async ({page}) => {
        await login(page, 'admin');
        await clearReminders(page);
    });

    test('Poll takes any number of options and posts a Matterpoll poll', async ({page}) => {
        await openChannel(page, 'town-square');
        await create(page, 'post_textbox', 'Poll');

        const dialog = page.getByRole('dialog').filter({hasText: 'New poll'});
        const question = `Where should we eat? ${Date.now()}`;
        await dialog.getByLabel('Question').fill(question);
        await dialog.getByLabel('Option 1', {exact: true}).fill('Pizza');
        await dialog.getByLabel('Option 2', {exact: true}).fill('Döner');
        await dialog.getByLabel('Option 3', {exact: true}).fill('Salad');
        await dialog.getByLabel('Option 3', {exact: true}).press('Enter'); // Enter adds a row instead of submitting
        await dialog.getByLabel('Option 4', {exact: true}).fill('The "new" place');
        await dialog.getByRole('button', {name: '+ Add option'}).click();
        await dialog.getByLabel('Option 5', {exact: true}).fill('Soup');
        await dialog.getByLabel('Votes per person').selectOption('2');
        await dialog.getByLabel(/Anonymous votes/).check();
        await dialog.getByLabel(/Show results while voting/).check();
        await dialog.getByRole('button', {name: 'Create poll'}).click();
        await expect(dialog).toHaveCount(0);

        const post = page.locator('.post').filter({hasText: question}).last();
        await expect(post).toBeVisible();
        for (const option of ['Pizza', 'Döner', 'Salad', 'The ʺnewʺ place', 'Soup']) {
            await expect(post.getByRole('button', {name: new RegExp(`^${option}`)})).toBeVisible();
        }
        await expect(post).toContainText('anonymous');
    });

    test('Todo for yourself lands in your Todo list', async ({page}) => {
        await openChannel(page, 'town-square');
        await create(page, 'post_textbox', 'Todo');
        const title = `Review the release notes ${Date.now()}`;
        await page.getByRole('dialog').getByLabel('Todo', {exact: true}).fill(title);
        await page.getByRole('button', {name: 'Add todo'}).click();

        await expect(page.getByText('Added to your todos')).toBeVisible();
        expect((await todoList(page, 'my')).map((t) => t.message)).toContain(title);
    });

    test('Todo for someone else is sent to them', async ({page, browser}) => {
        await openChannel(page, 'town-square');
        await create(page, 'post_textbox', 'Todo');
        const title = `Update the onboarding doc ${Date.now()}`;
        await page.getByRole('dialog').getByLabel('Todo', {exact: true}).fill(title);
        await page.getByRole('button', {name: 'Someone else'}).click();
        await page.getByLabel('Person').fill('memb');
        await page.getByRole('option', {name: /@member/}).click();
        await page.getByRole('button', {name: 'Send todo'}).click();

        await expect(page.getByText('Todo sent to @member')).toBeVisible();
        const {context, page: mPage} = await newSession(browser, 'member');
        expect((await todoList(mPage, 'in')).map((t) => t.message)).toContain(title);
        await context.close();
    });

    test('Reminder dialog creates a reminder that shows in the panel and can be deleted', async ({page}) => {
        await openChannel(page, 'town-square');
        await create(page, 'post_textbox', 'Reminder');
        const text = `Send the weekly report ${Date.now()}`;
        await page.getByLabel('About').fill(text);
        await page.getByLabel('When').selectOption('tomorrow');
        await page.getByLabel('Repeat').selectOption('weekdays');
        await expect(page.getByText(/Reminds you .*every weekday/)).toBeVisible();
        await page.getByRole('button', {name: 'Create reminder'}).click();

        await expect(page.getByText(/^I'll remind you /)).toBeVisible();
        const [r] = await pluginApi<any[]>(page, 'GET', '/reminders');
        expect(r).toMatchObject({target: 'me', message: text, repeat: 'weekdays', time_zone: 'Europe/Istanbul'});
        expect(new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(r.at))).toBe('09:00');

        await page.getByRole('button', {name: 'View', exact: true}).click();
        const row = page.locator('.qc-item').filter({hasText: text});
        await expect(row).toContainText('Repeats every weekday');
        await row.getByRole('button', {name: 'Delete'}).click();
        await row.getByRole('button', {name: 'Delete'}).click(); // confirm
        await expect(row).toHaveCount(0);
        expect(await pluginApi<any[]>(page, 'GET', '/reminders')).toEqual([]);
    });

    test('a personal reminder arrives as a bot DM, and Snooze sets it again', async ({page}) => {
        const text = `Check the deploy ${Date.now()}`;
        await pluginApi(page, 'POST', '/reminders', {target: 'me', user_id: '', channel_id: '', message: text, at: Date.now() + 35_000, repeat: '', time_zone: 'Europe/Istanbul'});

        const me = await api(page, 'GET', '/users/me');
        const bot = await api(page, 'GET', '/users/username/reminders');
        const dm = await api(page, 'POST', '/channels/direct', [me.id, bot.id]);
        const delivered = await waitFor(async () => {
            const posts = await api(page, 'GET', `/channels/${dm.id}/posts?per_page=5`);
            return Object.values<any>(posts.posts).find((p) => JSON.stringify(p.props?.attachments || '').includes(text));
        });

        await page.goto(`/${TEAM}/messages/@reminders`);
        const card = page.locator(`#post_${delivered.id}`);
        await expect(card).toContainText('Reminder:');
        await card.getByRole('button', {name: 'Snooze 1 hour'}).click();
        await expect(card).toContainText('Snoozed until');
        await expect(card.getByRole('button', {name: 'Snooze 1 hour'})).toHaveCount(0);

        const [again] = await pluginApi<any[]>(page, 'GET', '/reminders');
        expect(again).toMatchObject({target: 'me', message: text});
        expect(again.at).toBeGreaterThan(Date.now() + (55 * 60 * 1000));
    });

    test('a channel reminder is posted by the bot and a repeating one moves to the next day', async ({page}) => {
        const town = await api(page, 'GET', `/teams/name/${TEAM}/channels/name/town-square`);
        const text = `Standup in 5 minutes ${Date.now()}`;
        const first = Date.now() + 35_000;
        const created = await pluginApi(page, 'POST', '/reminders', {target: 'channel', user_id: '', channel_id: town.id, message: text, at: first, repeat: 'daily', time_zone: 'Europe/Istanbul'});

        const posted = await waitFor(async () => {
            const posts = await api(page, 'GET', `/channels/${town.id}/posts?per_page=20`);
            return Object.values<any>(posts.posts).find((p) => p.message.includes(text));
        });
        expect(posted.message).toBe(`⏰ **Reminder from @admin:** ${text}`);
        const bot = await api(page, 'GET', '/users/username/reminders');
        expect(posted.user_id).toBe(bot.id);

        const [r] = await pluginApi<any[]>(page, 'GET', '/reminders');
        expect(r.id).toBe(created.id);
        // Repeats keep the wall-clock minute (the dialog only offers whole minutes).
        expect(r.at).toBe((Math.floor(created.at / 60_000) * 60_000) + (24 * 60 * 60 * 1000));
    });
});
