import { View } from './view';
import { Yue } from '../yue';

export interface DatePickerOptions {
    elements?: number;
    hasStepper?: boolean;
}

export class DatePicker {
    static readonly elementYearMonth = 0x00c0;
    static readonly elementYearMonthDay = 0x00e0;
    static readonly elementHourMinute = 0x000c;
    static readonly elementHourMinuteSecond = 0x000e;

    readonly handle: number;
    readonly view: View;
    private readonly yue: Yue;
    private readonly disconnectors: Array<() => void> = [];

    constructor(options: DatePickerOptions = {}, yue: Yue = Yue.default) {
        this.yue = yue;
        const fields: string[] = [];
        if (options.elements !== undefined) {
            const elements = options.elements;
            if (!Number.isInteger(elements) ||
                ![0x00c0, 0x00e0, 0x000c, 0x000e, 0x00cc, 0x00ce, 0x00ec, 0x00ee].includes(elements)) {
                throw new RangeError('Invalid DatePicker elements.');
            }
            fields.push(`elements = ${elements}`);
        }
        if (options.hasStepper !== undefined) {
            if (typeof options.hasStepper !== 'boolean') throw new TypeError('hasStepper must be a boolean.');
            fields.push(`hasstepper = ${options.hasStepper}`);
        }
        this.yue.ensureGuiRuntime();
        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            local picker = assert(runtime.gui.DatePicker.create({ ${fields.join(', ')} }), 'DatePicker could not be created')
            runtime.next_date_picker_handle = runtime.next_date_picker_handle + 1
            runtime.date_pickers[runtime.next_date_picker_handle] = picker
            return runtime.next_date_picker_handle
        `);
        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] DatePicker creation returned an invalid handle.');
        }
        this.handle = handle;
        try {
            this.view = new View(this.expression(), this.yue);
        } catch (error) {
            this.yue.eval(`_G.__quickjs_yue.date_pickers[${handle}] = nil`);
            throw error;
        }
    }

    static create(options: DatePickerOptions = {}, yue: Yue = Yue.default): DatePicker {
        return new DatePicker(options, yue);
    }

    on(event: 'dateChange', handler: () => void): () => void {
        if (event !== 'dateChange' || typeof handler !== 'function') {
            throw new TypeError('[Yue] Invalid DatePicker event or handler.');
        }
        const disconnectSignal = this.yue.getEventBridge().connect(
            `datePicker:${this.handle}`, this.expression(), 'ondatechange', 'capture', (fields) => {
                if (fields.length !== 0) throw new Error('[Yue] Invalid DatePicker event.');
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

    /** `time` is a whole number of seconds since the Unix epoch. */
    setDate(time: number): void {
        this.call(`picker:setdate(${DatePicker.time(time)})`);
    }

    /** Returns whole seconds since the Unix epoch. */
    getDate(): number {
        const value = this.call('return tostring(picker:getdate())');
        return DatePicker.readTime(value);
    }

    /** Use null for an unbounded endpoint. Values are Unix seconds. */
    setRange(minimum: number | null, maximum: number | null): void {
        const min = minimum === null ? 'nil' : DatePicker.time(minimum);
        const max = maximum === null ? 'nil' : DatePicker.time(maximum);
        if (minimum !== null && maximum !== null && minimum > maximum) {
            throw new RangeError('DatePicker minimum must not exceed its maximum.');
        }
        this.call(`picker:setrange(${min}, ${max})`);
    }

    getRange(): [number | null, number | null] {
        const result = this.call(`
            local minimum, maximum = picker:getrange()
            return tostring(minimum) .. ',' .. tostring(maximum)
        `);
        if (typeof result !== 'string') throw new Error('[Yue] Invalid DatePicker range.');
        const values = result.split(',');
        if (values.length !== 2) throw new Error('[Yue] Invalid DatePicker range.');
        return [
            values[0] === 'nil' ? null : DatePicker.readTime(values[0]),
            values[1] === 'nil' ? null : DatePicker.readTime(values[1]),
        ];
    }

    hasStepper(): boolean {
        const value = this.call('return picker:hasstepper()');
        if (typeof value !== 'boolean') throw new Error('[Yue] Invalid DatePicker stepper state.');
        return value;
    }

    dispose(): void {
        while (this.disconnectors.length > 0) this.disconnectors[0]();
        this.view.dispose();
        this.yue.eval(`_G.__quickjs_yue.date_pickers[${this.handle}] = nil`);
    }

    private static time(value: number): string {
        if (!Number.isInteger(value) || value === 0 || value < -2147483648 || value > 2147483647) {
            throw new RangeError('DatePicker time must be a non-zero signed 32-bit Unix second.');
        }
        return String(value);
    }

    private static readTime(value: string | number | boolean | null): number {
        if (typeof value !== 'string' || !/^-?\d+$/.test(value)) {
            throw new Error('[Yue] Invalid DatePicker time.');
        }
        const time = Number(value);
        if (!Number.isSafeInteger(time) || time === 0) throw new Error('[Yue] Invalid DatePicker time.');
        return time;
    }

    private expression(): string {
        return `_G.__quickjs_yue.date_pickers[${this.handle}]`;
    }

    private call(statement: string): string | number | boolean | null {
        return this.yue.eval(`
            local picker = assert(${this.expression()}, 'DatePicker is no longer available')
            ${statement}
        `);
    }
}
