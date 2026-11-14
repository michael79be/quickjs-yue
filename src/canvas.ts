import { Painter } from './painter';
import { Size } from './image';
import { Yue } from './yue';

/** An offscreen drawing surface. Draw on it with `getPainter()`. */
export class Canvas {
    readonly handle: number;
    private readonly yue: Yue;

    /** `luaExpression` evaluates to the native canvas. Prefer the `create*` factories. */
    constructor(luaExpression: string, yue: Yue = Yue.default) {
        this.yue = yue;
        this.yue.ensureGuiRuntime();

        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            local canvas = ${luaExpression}
            runtime.next_canvas_handle = runtime.next_canvas_handle + 1
            runtime.canvases[runtime.next_canvas_handle] = canvas
            return runtime.next_canvas_handle
        `);

        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] Canvas creation returned an invalid handle.');
        }
        this.handle = handle;
    }

    static create(size: Size, scaleFactor: number, yue: Yue = Yue.default): Canvas {
        const factor = Canvas.luaNumber(scaleFactor, 'scaleFactor');
        return new Canvas(`_G.__quickjs_yue.gui.Canvas.create(${Canvas.luaSize(size)}, ${factor})`, yue);
    }

    /** Uses the main screen's scale factor, which does not suit multi-monitor setups. */
    static createForMainScreen(size: Size, yue: Yue = Yue.default): Canvas {
        return new Canvas(`_G.__quickjs_yue.gui.Canvas.createformainscreen(${Canvas.luaSize(size)})`, yue);
    }

    getScaleFactor(): number {
        return Number(this.call('return canvas:getscalefactor()'));
    }

    getSize(): Size {
        const width = this.call('return canvas:getsize().width');
        const height = this.call('return canvas:getsize().height');
        return { width: Number(width), height: Number(height) };
    }

    getPainter(): Painter {
        return new Painter(`_G.__quickjs_yue.canvases[${this.handle}]:getpainter()`, this.yue);
    }

    /** Frees the native canvas. The instance cannot be used afterwards. */
    dispose(): void {
        this.yue.eval(`_G.__quickjs_yue.canvases[${this.handle}] = nil`);
    }

    private static luaNumber(value: number, name: string): string {
        if (!Number.isFinite(value) || value <= 0) {
            throw new RangeError(`${name} must be a finite positive number.`);
        }
        return String(value);
    }

    private static luaSize(size: Size): string {
        const width = Canvas.luaNumber(size.width, 'width');
        const height = Canvas.luaNumber(size.height, 'height');
        return `{ width = ${width}, height = ${height} }`;
    }

    private call(statement: string): string | number | boolean | null {
        return this.yue.eval(`
            local canvas = assert(_G.__quickjs_yue.canvases[${this.handle}], 'Canvas is no longer available')
            ${statement}
        `);
    }
}
