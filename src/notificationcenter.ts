import { Yue } from './yue';

export interface COMServerOptions {
    writeRegistry?: boolean;
    arguments?: string;
    toastActivatorCLSID?: string;
}

/** Notification-wide APIs. Events cannot be received because they need callbacks into TypeScript. */
export class NotificationCenter {
    /** Removes all notifications sent by this app. */
    static clear(yue: Yue = Yue.default): void {
        NotificationCenter.run(yue, 'center:clear()');
    }

    /** Windows only. Returns false if `toastActivatorCLSID` is invalid. Call before subscribing to events. */
    static setCOMServerOptions(options: COMServerOptions, yue: Yue = Yue.default): boolean {
        const fields: string[] = [];
        if (options.writeRegistry !== undefined) {
            fields.push(`write_registry = ${options.writeRegistry}`);
        }
        if (options.arguments !== undefined) {
            fields.push(`arguments = ${Yue.toLuaStringLiteral(options.arguments)}`);
        }
        if (options.toastActivatorCLSID !== undefined) {
            fields.push(`toast_activator_clsid = ${Yue.toLuaStringLiteral(options.toastActivatorCLSID)}`);
        }
        return NotificationCenter.run(yue, `return center:setcomserveroptions({ ${fields.join(', ')} })`) === true;
    }

    /** Windows only. */
    static registerCOMServer(yue: Yue = Yue.default): boolean {
        return NotificationCenter.run(yue, 'return center:registercomserver()') === true;
    }

    /** Windows only. */
    static removeCOMServerFromRegistry(yue: Yue = Yue.default): void {
        NotificationCenter.run(yue, 'center:removecomserverfromregistry()');
    }

    /** Windows only. */
    static getToastActivatorCLSID(yue: Yue = Yue.default): string {
        const value = NotificationCenter.run(yue, 'return center:gettoastactivatorclsid()');
        if (typeof value !== 'string') {
            throw new Error('[Yue] Expected a string result.');
        }
        return value;
    }

    private static run(yue: Yue, statement: string): string | number | boolean | null {
        return yue.eval(`
            local center = require('yue.gui').notificationcenter
            ${statement}
        `);
    }
}
