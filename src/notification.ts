import { Image } from './image';
import { Yue } from './yue';

export interface NotificationAction {
    title: string;
    info: string;
}

/**
 * Sends a native notification. Set the app's name and ID with `App` first. On macOS only
 * bundled apps can send notifications. Methods marked with a platform only exist there.
 */
export class Notification {
    readonly handle: number;
    private readonly yue: Yue;

    constructor(yue: Yue = Yue.default) {
        this.yue = yue;
        this.yue.ensureGuiRuntime();

        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            runtime.next_notification_handle = runtime.next_notification_handle + 1
            runtime.notifications[runtime.next_notification_handle] = runtime.gui.Notification.create()
            return runtime.next_notification_handle
        `);

        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] Notification creation returned an invalid handle.');
        }
        this.handle = handle;
    }

    /** Displays the notification, or updates it if it is already displayed. */
    show(): void {
        this.call('notification:show()');
    }

    close(): void {
        this.call('notification:close()');
    }

    setTitle(title: string): void {
        this.call(`notification:settitle(${Yue.toLuaStringLiteral(title)})`);
    }

    setBody(body: string): void {
        this.call(`notification:setbody(${Yue.toLuaStringLiteral(body)})`);
    }

    /** Custom data attached to the notification, passed to the `NotificationCenter` events. */
    setInfo(info: string): void {
        this.call(`notification:setinfo(${Yue.toLuaStringLiteral(info)})`);
    }

    getInfo(): string {
        return this.string('return notification:getinfo()');
    }

    setActions(actions: NotificationAction[]): void {
        const entries = actions.map((action) => {
            const title = Yue.toLuaStringLiteral(action.title);
            const info = Yue.toLuaStringLiteral(action.info);
            return `{ title = ${title}, info = ${info} }`;
        });
        this.call(`notification:setactions({ ${entries.join(', ')} })`);
    }

    setSilent(silent: boolean): void {
        this.call(`notification:setsilent(${silent})`);
    }

    setImage(image: Image): void {
        this.call(`notification:setimage(_G.__quickjs_yue.images[${image.handle}])`);
    }

    /** Faster than `setImage` when the image is stored on disk. */
    setImagePath(path: string): void {
        this.call(`notification:setimagepath(${Yue.toLuaStringLiteral(path)})`);
    }

    /** Windows only. The most common values are `appLogoOverride` and `hero`. */
    setImagePlacement(placement: string | null): void {
        const value = placement === null ? 'nil' : Yue.toLuaStringLiteral(placement);
        this.call(`notification:setimageplacement(${value})`);
    }

    /** macOS and Windows only. */
    setHasReplyButton(has: boolean): void {
        this.call(`notification:sethasreplybutton(${has})`);
    }

    /** macOS and Windows only. */
    setResponsePlaceholder(placeholder: string): void {
        this.call(`notification:setresponseplaceholder(${Yue.toLuaStringLiteral(placeholder)})`);
    }

    /** macOS and Windows only. Showing a notification with a displayed identifier updates it. */
    setIdentifier(identifier: string): void {
        this.call(`notification:setidentifier(${Yue.toLuaStringLiteral(identifier)})`);
    }

    /** macOS and Windows only. */
    getIdentifier(): string {
        return this.string('return notification:getidentifier()');
    }

    /** Windows only. Raw toast XML, or `null` to remove it. */
    setXML(xml: string | null): void {
        const value = xml === null ? 'nil' : Yue.toLuaStringLiteral(xml);
        this.call(`notification:setxml(${value})`);
    }

    /** Windows only. */
    getXML(): string {
        return this.string('return notification:getxml()');
    }

    /** Frees the native notification. The instance cannot be used afterwards. */
    dispose(): void {
        this.yue.eval(`_G.__quickjs_yue.notifications[${this.handle}] = nil`);
    }

    private string(statement: string): string {
        const value = this.call(statement);
        if (typeof value !== 'string') {
            throw new Error('[Yue] Expected a string result.');
        }
        return value;
    }

    private call(statement: string): string | number | boolean | null {
        return this.yue.eval(`
            local notification = assert(
                _G.__quickjs_yue.notifications[${this.handle}],
                'Notification is no longer available'
            )
            ${statement}
        `);
    }
}
