import { View } from './view';
import { Yue } from '../yue';

export class ProgressBar {
    readonly handle: number;
    readonly view: View;
    private readonly yue: Yue;

    constructor(yue: Yue = Yue.default) {
        this.yue = yue;
        this.yue.ensureGuiRuntime();
        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            local progress = assert(runtime.gui.ProgressBar.create(), 'ProgressBar could not be created')
            runtime.next_progress_bar_handle = runtime.next_progress_bar_handle + 1
            runtime.progress_bars[runtime.next_progress_bar_handle] = progress
            return runtime.next_progress_bar_handle
        `);
        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] ProgressBar creation returned an invalid handle.');
        }
        this.handle = handle;
        try {
            this.view = new View(this.expression(), this.yue);
        } catch (error) {
            this.yue.eval(`_G.__quickjs_yue.progress_bars[${handle}] = nil`);
            throw error;
        }
    }

    static create(yue: Yue = Yue.default): ProgressBar {
        return new ProgressBar(yue);
    }

    setValue(percent: number): void {
        if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
            throw new RangeError('ProgressBar value must be between 0 and 100.');
        }
        this.call(`progress:setvalue(${percent})`);
    }

    getValue(): number {
        const value = this.call('return tostring(progress:getvalue())');
        if (typeof value !== 'string' || value === '' || !Number.isFinite(Number(value))) {
            throw new Error('[Yue] Invalid ProgressBar value.');
        }
        return Number(value);
    }

    setIndeterminate(indeterminate: boolean): void {
        if (typeof indeterminate !== 'boolean') throw new TypeError('ProgressBar indeterminate must be a boolean.');
        this.call(`progress:setindeterminate(${indeterminate})`);
    }

    isIndeterminate(): boolean {
        const value = this.call('return progress:isindeterminate()');
        if (typeof value !== 'boolean') throw new Error('[Yue] Invalid ProgressBar indeterminate state.');
        return value;
    }

    dispose(): void {
        this.view.dispose();
        this.yue.eval(`_G.__quickjs_yue.progress_bars[${this.handle}] = nil`);
    }

    private expression(): string {
        return `_G.__quickjs_yue.progress_bars[${this.handle}]`;
    }

    private call(statement: string): string | number | boolean | null {
        return this.yue.eval(`
            local progress = assert(${this.expression()}, 'ProgressBar is no longer available')
            ${statement}
        `);
    }
}
