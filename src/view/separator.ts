import { View } from './view';
import { Yue } from '../yue';

export type Orientation = 'horizontal' | 'vertical';

export class Separator {
    readonly handle: number;
    readonly view: View;
    private readonly yue: Yue;

    constructor(orientation: Orientation, yue: Yue = Yue.default) {
        if (orientation !== 'horizontal' && orientation !== 'vertical') {
            throw new TypeError('[Yue] Invalid separator orientation.');
        }
        this.yue = yue;
        this.yue.ensureGuiRuntime();
        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            local separator = assert(runtime.gui.Separator.create(${Yue.toLuaStringLiteral(orientation)}), 'Separator could not be created')
            runtime.next_separator_handle = runtime.next_separator_handle + 1
            runtime.separators[runtime.next_separator_handle] = separator
            return runtime.next_separator_handle
        `);
        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] Separator creation returned an invalid handle.');
        }
        this.handle = handle;
        try {
            this.view = new View(this.expression(), this.yue);
        } catch (error) {
            this.yue.eval(`_G.__quickjs_yue.separators[${handle}] = nil`);
            throw error;
        }
    }

    static create(orientation: Orientation, yue: Yue = Yue.default): Separator {
        return new Separator(orientation, yue);
    }

    dispose(): void {
        this.view.dispose();
        this.yue.eval(`_G.__quickjs_yue.separators[${this.handle}] = nil`);
    }

    private expression(): string {
        return `_G.__quickjs_yue.separators[${this.handle}]`;
    }
}
