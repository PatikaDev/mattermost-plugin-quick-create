import {expect, type Browser, type Locator, type Page} from '@playwright/test';

export const PASSWORD = 'Test-Passw0rd!';
export const TEAM = 'e2e';
const PLUGIN = '/plugins/dev.patika.quick-create/api/v1';

// Mattermost only accepts session cookies on API calls that identify as its web app.
async function request<T>(page: Page, method: string, url: string, body?: unknown): Promise<T> {
    return page.evaluate(async ([m, u, b]) => {
        const csrf = document.cookie.split('; ').find((c) => c.startsWith('MMCSRF='))?.split('=')[1] || '';
        const res = await fetch(u as string, {
            method: m as string,
            headers: {'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json', 'X-CSRF-Token': csrf},
            body: b === undefined ? undefined : JSON.stringify(b),
        });
        const text = await res.text();
        return text ? JSON.parse(text) : null;
    }, [method, url, body] as const) as Promise<T>;
}

export const http = <T = any>(page: Page, method: string, url: string, body?: unknown) => request<T>(page, method, url, body);
export const api = <T = any>(page: Page, method: string, path: string, body?: unknown) => request<T>(page, method, `/api/v4${path}`, body);
export const pluginApi = <T = any>(page: Page, method: string, path: string, body?: unknown) => request<T>(page, method, PLUGIN + path, body);

// Log in through the real form (API logins don't set the browser session cookies),
// then switch off first-run tours, which would swallow clicks.
export async function login(page: Page, username: string) {
    await page.goto('/login');
    const loginField = page.locator('#input_loginId');
    const viewInBrowser = page.getByText('View in Browser');
    await expect(loginField.or(viewInBrowser)).toBeVisible();
    if (await viewInBrowser.isVisible()) {
        await viewInBrowser.click();
    }
    await loginField.fill(username);
    await page.locator('input[type=password]').fill(PASSWORD);
    await page.getByRole('button', {name: 'Log in'}).click();
    await page.waitForURL((url) => !url.toString().includes('/login'));

    const me = await api(page, 'GET', '/users/me');
    const pref = (category: string, name: string, value: string) => ({user_id: me.id, category, name, value});
    await api(page, 'PUT', '/users/me/preferences', [
        pref('onboarding_task_list', 'onboarding_task_list_show', 'false'),
        pref('onboarding_task_list', 'onboarding_task_list_open', 'false'),
        pref('recommended_next_steps', 'hide', 'true'),
        pref('tutorial_step', me.id, '999'),
        pref('crt_thread_pane_step', me.id, '999'),
    ]);
    return me as {id: string; username: string};
}

export async function newSession(browser: Browser, username: string) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const me = await login(page, username);
    return {context, page, me};
}

export async function openChannel(page: Page, channel: string) {
    await page.goto(`/${TEAM}/channels/${channel}`);
    for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Escape');
    }
    await expect(page.locator('#post_textbox')).toBeVisible();
}

// The message box (channel or thread reply) around a textarea.
export function composer(page: Page, textboxId: 'post_textbox' | 'reply_textbox'): Locator {
    return page.locator(`#${textboxId}`).locator('xpath=ancestor::*[.//button[@aria-label="Create poll, todo or reminder"]][1]');
}

// ⊕ in the message box → Poll / Todo / Reminder.
export async function create(page: Page, textboxId: 'post_textbox' | 'reply_textbox', item: 'Poll' | 'Todo' | 'Reminder') {
    await composer(page, textboxId).getByRole('button', {name: 'Create poll, todo or reminder'}).click();
    await page.getByRole('menuitem', {name: item, exact: true}).click();
}

// Polls until `fn` returns a truthy value (the server job runs once a minute).
export async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs = 150_000): Promise<T> {
    const end = Date.now() + timeoutMs;
    for (;;) {
        const value = await fn();
        if (value) {
            return value;
        }
        if (Date.now() > end) {
            throw new Error('timed out waiting');
        }
        await new Promise((r) => setTimeout(r, 3000));
    }
}
