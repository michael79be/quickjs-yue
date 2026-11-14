import { pickerIndexedCall, pickerItems, pickerSelectedIndex, pickerText } from './pickerutils';
import { View } from './view';
import { Yue } from '../yue';

export type ComboBoxEvent = 'textChange' | 'selectionChange';

const comboBoxSignals = {
    textChange: 'ontextchange',
    selectionChange: 'onselectionchange',
};

export class ComboBox {
    readonly handle: number;
    readonly view: View;
    private readonly yue: Yue;
    private readonly disconnectors: Array<() => void> = [];

    constructor(yue: Yue = Yue.default) {
        this.yue = yue;
        this.yue.ensureGuiRuntime();
        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            local combo = assert(runtime.gui.ComboBox.create(), 'ComboBox could not be created')
            runtime.next_combo_box_handle = runtime.next_combo_box_handle + 1
            runtime.combo_boxes[runtime.next_combo_box_handle] = combo
            return runtime.next_combo_box_handle
        `);
        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] ComboBox creation returned an invalid handle.');
        }
        this.handle = handle;
        try {
            this.view = new View(this.expression(), this.yue);
        } catch (error) {
            this.yue.eval(`_G.__quickjs_yue.combo_boxes[${handle}] = nil`);
            throw error;
        }
    }

    static create(yue: Yue = Yue.default): ComboBox {
        return new ComboBox(yue);
    }

    on(event: ComboBoxEvent, handler: () => void): () => void {
        if (!Object.prototype.hasOwnProperty.call(comboBoxSignals, event) || typeof handler !== 'function') {
            throw new TypeError('[Yue] Invalid ComboBox event or handler.');
        }
        const disconnectSignal = this.yue.getEventBridge().connect(
            `comboBox:${this.handle}`, this.expression(), comboBoxSignals[event], 'capture', (fields) => {
                if (fields.length !== 0) throw new Error('[Yue] Invalid ComboBox event.');
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
        this.call(`combo:settext(${pickerText(text, 'combo')})`);
    }

    getText(): string {
        return this.string('return combo:gettext()');
    }

    addItem(title: string): void {
        this.call(`combo:additem(${pickerText(title, 'combo')})`);
    }

    /** `index` is zero-based. */
    removeItemAt(index: number): void {
        pickerIndexedCall((statement) => this.call(statement), 'combo', 'removeitemat', index);
    }

    clear(): void {
        this.call('combo:clear()');
    }

    getItems(): string[] {
        return pickerItems((statement) => this.call(statement), 'combo');
    }

    /** `index` is zero-based. */
    selectItemAt(index: number): void {
        pickerIndexedCall((statement) => this.call(statement), 'combo', 'selectitemat', index);
    }

    getSelectedItem(): string {
        return this.string('return combo:getselecteditem()');
    }

    /** Returns -1 if no item is selected. */
    getSelectedItemIndex(): number {
        return pickerSelectedIndex((statement) => this.call(statement), 'combo');
    }

    dispose(): void {
        while (this.disconnectors.length > 0) this.disconnectors[0]();
        this.view.dispose();
        this.yue.eval(`_G.__quickjs_yue.combo_boxes[${this.handle}] = nil`);
    }

    private expression(): string {
        return `_G.__quickjs_yue.combo_boxes[${this.handle}]`;
    }

    private string(statement: string): string {
        const result = this.call(statement);
        if (typeof result !== 'string') throw new Error('[Yue] Invalid ComboBox text.');
        return result;
    }

    private call(statement: string): string | number | boolean | null {
        return this.yue.eval(`
            local combo = assert(${this.expression()}, 'ComboBox is no longer available')
            ${statement}
        `);
    }
}
