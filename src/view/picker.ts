import { pickerIndexedCall, pickerItems, pickerSelectedIndex, pickerText } from './pickerutils';
import { View } from './view';
import { Yue } from '../yue';

export type PickerEvent = 'selectionChange';

export class Picker {
    readonly handle: number;
    readonly view: View;
    private readonly yue: Yue;
    private readonly disconnectors: Array<() => void> = [];

    constructor(yue: Yue = Yue.default) {
        this.yue = yue;
        this.yue.ensureGuiRuntime();
        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            local picker = assert(runtime.gui.Picker.create(), 'Picker could not be created')
            runtime.next_picker_handle = runtime.next_picker_handle + 1
            runtime.pickers[runtime.next_picker_handle] = picker
            return runtime.next_picker_handle
        `);
        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] Picker creation returned an invalid handle.');
        }
        this.handle = handle;
        try {
            this.view = new View(this.expression(), this.yue);
        } catch (error) {
            this.yue.eval(`_G.__quickjs_yue.pickers[${handle}] = nil`);
            throw error;
        }
    }

    static create(yue: Yue = Yue.default): Picker {
        return new Picker(yue);
    }

    on(event: PickerEvent, handler: () => void): () => void {
        if (event !== 'selectionChange' || typeof handler !== 'function') {
            throw new TypeError('[Yue] Invalid Picker event or handler.');
        }
        const disconnectSignal = this.yue.getEventBridge().connect(
            `picker:${this.handle}`, this.expression(), 'onselectionchange', 'capture', (fields) => {
                if (fields.length !== 0) throw new Error('[Yue] Invalid Picker event.');
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

    addItem(title: string): void {
        this.call(`picker:additem(${pickerText(title, 'picker')})`);
    }

    /** `index` is zero-based. */
    removeItemAt(index: number): void {
        pickerIndexedCall((statement) => this.call(statement), 'picker', 'removeitemat', index);
    }

    clear(): void {
        this.call('picker:clear()');
    }

    getItems(): string[] {
        return pickerItems((statement) => this.call(statement), 'picker');
    }

    /** `index` is zero-based. */
    selectItemAt(index: number): void {
        pickerIndexedCall((statement) => this.call(statement), 'picker', 'selectitemat', index);
    }

    getSelectedItem(): string {
        const item = this.call('return picker:getselecteditem()');
        if (typeof item !== 'string') throw new Error('[Yue] Invalid Picker text.');
        return item;
    }

    /** Returns -1 if no item is selected. */
    getSelectedItemIndex(): number {
        return pickerSelectedIndex((statement) => this.call(statement), 'picker');
    }

    dispose(): void {
        while (this.disconnectors.length > 0) this.disconnectors[0]();
        this.view.dispose();
        this.yue.eval(`_G.__quickjs_yue.pickers[${this.handle}] = nil`);
    }

    private expression(): string {
        return `_G.__quickjs_yue.pickers[${this.handle}]`;
    }

    private call(statement: string): string | number | boolean | null {
        return this.yue.eval(`
            local picker = assert(${this.expression()}, 'Picker is no longer available')
            ${statement}
        `);
    }
}
