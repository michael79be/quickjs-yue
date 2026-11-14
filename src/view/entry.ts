import { View } from './view';
import { Yue } from '../yue';

export type EntryType = 'normal' | 'password';
export type EntryEvent = 'textChange' | 'activate';

const entrySignals = {
    textChange: 'ontextchange',
    activate: 'onactivate',
};

export class Entry {
    readonly handle: number;
    readonly view: View;
    private readonly yue: Yue;
    private readonly disconnectors: Array<() => void> = [];

    constructor(type: EntryType = 'normal', yue: Yue = Yue.default) {
        if (type !== 'normal' && type !== 'password') throw new TypeError('[Yue] Invalid Entry type.');
        this.yue = yue;
        this.yue.ensureGuiRuntime();
        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            local entry = assert(runtime.gui.Entry.createtype(${Yue.toLuaStringLiteral(type)}), 'Entry could not be created')
            runtime.next_entry_handle = runtime.next_entry_handle + 1
            runtime.entries[runtime.next_entry_handle] = entry
            return runtime.next_entry_handle
        `);
        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] Entry creation returned an invalid handle.');
        }
        this.handle = handle;
        try {
            this.view = new View(this.expression(), this.yue);
        } catch (error) {
            this.yue.eval(`_G.__quickjs_yue.entries[${handle}] = nil`);
            throw error;
        }
    }

    static create(yue: Yue = Yue.default): Entry {
        return new Entry('normal', yue);
    }

    static createType(type: EntryType, yue: Yue = Yue.default): Entry {
        return new Entry(type, yue);
    }

    on(event: EntryEvent, handler: () => void): () => void {
        if (!Object.prototype.hasOwnProperty.call(entrySignals, event) || typeof handler !== 'function') {
            throw new TypeError('[Yue] Invalid Entry event or handler.');
        }
        const disconnectSignal = this.yue.getEventBridge().connect(
            `entry:${this.handle}`, this.expression(), entrySignals[event], 'capture', (fields) => {
                if (fields.length !== 0) throw new Error('[Yue] Invalid Entry event.');
                handler();
            },
        );
        const disconnect = () => {
            disconnectSignal();
            const index = this.disconnectors.indexOf(disconnect);
            if (index !== -1) this.disconnectors.splice(index, 1);
        };
        this.disconnectors.push(disconnect);
        return disconnect;
    }

    setText(text: string): void {
        if (text.includes('\0')) throw new RangeError('Entry text cannot contain NUL.');
        this.call(`entry:settext(${Yue.toLuaStringLiteral(text)})`);
    }

    getText(): string {
        const text = this.call('return entry:gettext()');
        if (typeof text !== 'string') throw new Error('[Yue] Invalid Entry text.');
        return text;
    }

    dispose(): void {
        while (this.disconnectors.length > 0) this.disconnectors[0]();
        this.view.dispose();
        this.yue.eval(`_G.__quickjs_yue.entries[${this.handle}] = nil`);
    }

    private expression(): string {
        return `_G.__quickjs_yue.entries[${this.handle}]`;
    }

    private call(statement: string): string | number | boolean | null {
        return this.yue.eval(`
            local entry = assert(${this.expression()}, 'Entry is no longer available')
            ${statement}
        `);
    }
}
