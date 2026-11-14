import * as os from 'os';
import { View } from './view';
import { Yue } from '../yue';

export type SliderEvent = 'valueChange' | 'slidingComplete';

const sliderSignals = {
    valueChange: 'onvaluechange',
    slidingComplete: 'onslidingcomplete',
};

export class Slider {
    readonly handle: number;
    readonly view: View;
    private readonly yue: Yue;
    private readonly disconnectors: Array<() => void> = [];

    constructor(yue: Yue = Yue.default) {
        this.yue = yue;
        this.yue.ensureGuiRuntime();
        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            local slider = assert(runtime.gui.Slider.create(), 'Slider could not be created')
            runtime.next_slider_handle = runtime.next_slider_handle + 1
            runtime.sliders[runtime.next_slider_handle] = slider
            return runtime.next_slider_handle
        `);
        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] Slider creation returned an invalid handle.');
        }
        this.handle = handle;
        try {
            this.view = new View(this.expression(), this.yue);
        } catch (error) {
            this.yue.eval(`_G.__quickjs_yue.sliders[${handle}] = nil`);
            throw error;
        }
    }

    static create(yue: Yue = Yue.default): Slider {
        return new Slider(yue);
    }

    on(event: SliderEvent, handler: () => void): () => void {
        if (!Object.prototype.hasOwnProperty.call(sliderSignals, event) || typeof handler !== 'function') {
            throw new TypeError('[Yue] Invalid Slider event or handler.');
        }
        const disconnectSignal = this.yue.getEventBridge().connect(
            `slider:${this.handle}`, this.expression(), sliderSignals[event], 'capture', (fields) => {
                if (fields.length !== 0) throw new Error('[Yue] Invalid Slider event.');
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

    setValue(value: number): void {
        const number = Slider.number(value, 'value');
        if (os.platform === 'win32') this.checkWindowsPosition(number);
        this.call(`slider:setvalue(${number})`);
    }

    getValue(): number {
        return this.readNumber('slider:getvalue()', 'value');
    }

    setStep(step: number): void {
        const number = Slider.number(step, 'step');
        if (number <= 0) throw new RangeError('Slider step must be positive.');
        if (os.platform === 'win32') this.checkWindowsPosition(number);
        this.call(`slider:setstep(${number})`);
    }

    getStep(): number {
        return this.readNumber('slider:getstep()', 'step');
    }

    setRange(minimum: number, maximum: number): void {
        const min = Slider.number(minimum, 'minimum');
        const max = Slider.number(maximum, 'maximum');
        const span = Math.fround(max - min);
        if (min >= max || !Number.isFinite(span) ||
            (os.platform === 'win32' && !Number.isFinite(Math.fround(10000 / span)))) {
            throw new RangeError('Slider range must have a finite positive width.');
        }
        this.call(`slider:setrange(${min}, ${max})`);
    }

    getRange(): [number, number] {
        const result = this.call(`
            local minimum, maximum = slider:getrange()
            return tostring(minimum) .. ',' .. tostring(maximum)
        `);
        if (typeof result !== 'string') throw new Error('[Yue] Invalid Slider range.');
        const values = result.split(',');
        if (values.length !== 2 || values.some((value) => value === '' || !Number.isFinite(Number(value)))) {
            throw new Error('[Yue] Invalid Slider range.');
        }
        return [Number(values[0]), Number(values[1])];
    }

    dispose(): void {
        while (this.disconnectors.length > 0) this.disconnectors[0]();
        this.view.dispose();
        this.yue.eval(`_G.__quickjs_yue.sliders[${this.handle}] = nil`);
    }

    private checkWindowsPosition(value: number): void {
        const [min, max] = this.getRange();
        const scale = Math.fround(10000 / Math.fround(max - min));
        const position = Math.fround(value * scale);
        if (!Number.isFinite(position) || position < -2147483648 || position >= 2147483648) {
            throw new RangeError('Slider value exceeds the Windows native range.');
        }
    }

    private static number(value: number, name: string): number {
        if (typeof value !== 'number') throw new RangeError(`Slider ${name} must be a finite 32-bit float.`);
        const number = Math.fround(value);
        if (!Number.isFinite(number)) {
            throw new RangeError(`Slider ${name} must be a finite 32-bit float.`);
        }
        return number;
    }

    private readNumber(expression: string, name: string): number {
        const value = this.call(`return tostring(${expression})`);
        if (typeof value !== 'string' || value === '' || !Number.isFinite(Number(value))) {
            throw new Error(`[Yue] Invalid Slider ${name}.`);
        }
        return Number(value);
    }

    private expression(): string {
        return `_G.__quickjs_yue.sliders[${this.handle}]`;
    }

    private call(statement: string): string | number | boolean | null {
        return this.yue.eval(`
            local slider = assert(${this.expression()}, 'Slider is no longer available')
            ${statement}
        `);
    }
}
