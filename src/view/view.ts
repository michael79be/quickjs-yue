import type { ClipboardDataType } from '../clipboard';
import type { Cursor } from '../cursor';
import type { Font } from '../font';
import type { Size } from '../image';
import type { Point, Rect } from '../painter';
import { Responder } from '../responder';
import { Window } from '../window';
import { Yue } from '../yue';

export type ViewEvent = 'sizeChanged' | 'focusIn' | 'focusOut';

const viewSignals = {
    sizeChanged: 'onsizechanged',
    focusIn: 'onfocusin',
    focusOut: 'onfocusout',
};

/** A wrapper around a native Yue view. View itself cannot be created directly. */
export class View {
    readonly handle: number;
    readonly responder: Responder;
    private readonly yue: Yue;
    private readonly disconnectors: Array<() => void> = [];

    /** Registers the view produced by a Lua expression. */
    constructor(luaExpression: string, yue: Yue = Yue.default) {
        this.yue = yue;
        this.yue.ensureGuiRuntime();
        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            local view = assert(${luaExpression}, 'View could not be created')
            runtime.next_view_handle = runtime.next_view_handle + 1
            runtime.views[runtime.next_view_handle] = view
            return runtime.next_view_handle
        `);
        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] View creation returned an invalid handle.');
        }
        this.handle = handle;
        this.responder = new Responder(this.yue, this.expression(), this.owner());
    }

    static fromWindow(window: Window): View {
        return new View(
            `assert(_G.__quickjs_yue.windows[${window.handle}], 'Window is no longer available'):getcontentview()`,
            window.getRuntime(),
        );
    }

    getRuntime(): Yue {
        return this.yue;
    }

    /** Events are notifications; focus handlers cannot consume native input. */
    on(event: ViewEvent, handler: () => void): () => void {
        if (!Object.prototype.hasOwnProperty.call(viewSignals, event) || typeof handler !== 'function') {
            throw new TypeError('[Yue] Invalid view event or handler.');
        }
        const disconnectSignal = this.yue.getEventBridge().connect(
            this.owner(), this.expression(), viewSignals[event], 'capture', (fields) => {
                if (fields.length !== 0) throw new Error('[Yue] Invalid view event.');
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

    offsetFromView(view: View): Point {
        if (view.yue !== this.yue) throw new Error('[Yue] Views belong to different runtimes.');
        const [x, y] = this.numbers(`view:offsetfromview(assert(${view.expression()}, 'View is no longer available'))`, ['x', 'y']);
        return { x, y };
    }

    offsetFromWindow(): Point {
        const [x, y] = this.numbers('view:offsetfromwindow()', ['x', 'y']);
        return { x, y };
    }

    setBounds(rect: Rect): void {
        this.call(`view:setbounds(${View.rect(rect)})`);
    }

    getBounds(): Rect {
        return this.getRect('view:getbounds()');
    }

    getBoundsInScreen(): Rect {
        return this.getRect('view:getboundsinscreen()');
    }

    layout(): void {
        this.call('view:layout()');
    }

    schedulePaint(): void {
        this.call('view:schedulepaint()');
    }

    schedulePaintRect(rect: Rect): void {
        this.call(`view:schedulepaintrect(${View.rect(rect)})`);
    }

    setVisible(visible: boolean): void {
        this.call(`view:setvisible(${visible})`);
    }

    isVisible(): boolean {
        return this.boolean('view:isvisible()');
    }

    isVisibleInHierarchy(): boolean {
        return this.boolean('view:isvisibleinhierarchy()');
    }

    setEnabled(enabled: boolean): void {
        this.call(`view:setenabled(${enabled})`);
    }

    isEnabled(): boolean {
        return this.boolean('view:isenabled()');
    }

    focus(): void {
        this.call('view:focus()');
    }

    hasFocus(): boolean {
        return this.boolean('view:hasfocus()');
    }

    setFocusable(focusable: boolean): void {
        this.call(`view:setfocusable(${focusable})`);
    }

    isFocusable(): boolean {
        return this.boolean('view:isfocusable()');
    }

    setMouseDownCanMoveWindow(canMove: boolean): void {
        this.call(`view:setmousedowncanmovewindow(${canMove})`);
    }

    isMouseDownCanMoveWindow(): boolean {
        return this.boolean('view:ismousedowncanmovewindow()');
    }

    /** macOS only. */
    setWantsLayer(wantsLayer: boolean): void {
        this.call(`view:setwantslayer(${wantsLayer})`);
    }

    /** macOS only. */
    wantsLayer(): boolean {
        return this.boolean('view:wantslayer()');
    }

    cancelDrag(): void {
        this.call('view:canceldrag()');
    }

    isDragging(): boolean {
        return this.boolean('view:isdragging()');
    }

    registerDraggedTypes(types: ClipboardDataType[]): void {
        this.call(`view:registerdraggedtypes({ ${types.map(Yue.toLuaStringLiteral).join(', ')} })`);
    }

    /** On Linux, setting a cursor may remove a view's background color. */
    setCursor(cursor: Cursor): void {
        if (cursor.getRuntime() !== this.yue) throw new Error('[Yue] Cursor and view belong to different runtimes.');
        this.call(`view:setcursor(assert(_G.__quickjs_yue.cursors[${cursor.handle}], 'Cursor is no longer available'))`);
    }

    setTooltip(tooltip: string): void {
        this.call(`view:settooltip(${Yue.toLuaStringLiteral(tooltip)})`);
    }

    addTooltipForRect(tooltip: string, rect: Rect): number {
        const id = this.call(`return view:addtooltipforrect(${Yue.toLuaStringLiteral(tooltip)}, ${View.rect(rect)})`);
        if (typeof id !== 'number' || !Number.isSafeInteger(id)) throw new Error('[Yue] Invalid tooltip ID.');
        return id;
    }

    removeTooltip(id: number): void {
        if (!Number.isSafeInteger(id)) throw new RangeError('Tooltip ID must be an integer.');
        this.call(`view:removetooltip(${id})`);
    }

    setFont(font: Font): void {
        if (font.getRuntime() !== this.yue) throw new Error('[Yue] Font and view belong to different runtimes.');
        this.call(`view:setfont(assert(_G.__quickjs_yue.fonts[${font.handle}], 'Font is no longer available'))`);
    }

    setColor(color: string): void {
        this.call(`view:setcolor(${Yue.toLuaStringLiteral(color)})`);
    }

    setBackgroundColor(color: string): void {
        this.call(`view:setbackgroundcolor(${Yue.toLuaStringLiteral(color)})`);
    }

    setStyle(styles: { [key: string]: string | number }): void {
        const fields = Object.keys(styles).map((key) => {
            const value = styles[key];
            if (typeof value !== 'string' && typeof value !== 'number') {
                throw new TypeError('Style values must be strings or numbers.');
            }
            const luaValue = typeof value === 'string' ? Yue.toLuaStringLiteral(value) : View.number(value);
            return `[${Yue.toLuaStringLiteral(key)}] = ${luaValue}`;
        });
        this.call(`view:setstyle({ ${fields.join(', ')} })`);
    }

    getComputedLayout(): string {
        const result = this.call('return view:getcomputedlayout()');
        if (typeof result !== 'string') throw new Error('[Yue] Invalid computed layout.');
        return result;
    }

    getMinimumSize(): Size {
        const [width, height] = this.numbers('view:getminimumsize()', ['width', 'height']);
        return { width, height };
    }

    getParent(): View | null {
        if (!this.boolean('view:getparent() ~= nil')) return null;
        return new View(`assert(${this.expression()}, 'View is no longer available'):getparent()`, this.yue);
    }

    getWindow(): Window | null {
        const handle = this.call(`
            local window = view:getwindow()
            if not window then return 0 end
            for handle, candidate in pairs(_G.__quickjs_yue.windows) do
                if candidate == window then return handle end
            end
            error('View belongs to an unregistered window')
        `);
        if (handle === 0) return null;
        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] Invalid window handle.');
        }
        return new Window(this.yue, handle);
    }

    /** Releases this wrapper and disconnects its event handlers. */
    dispose(): void {
        while (this.disconnectors.length > 0) this.disconnectors[0]();
        this.responder.dispose();
        this.yue.eval(`_G.__quickjs_yue.views[${this.handle}] = nil`);
    }

    private expression(): string {
        return `_G.__quickjs_yue.views[${this.handle}]`;
    }

    private owner(): string {
        return `view:${this.handle}`;
    }

    private call(statement: string): string | number | boolean | null {
        return this.yue.eval(`
            local view = assert(${this.expression()}, 'View is no longer available')
            ${statement}
        `);
    }

    private boolean(expression: string): boolean {
        const result = this.call(`return ${expression}`);
        if (typeof result !== 'boolean') throw new Error('[Yue] Invalid view boolean.');
        return result;
    }

    private numbers(expression: string, fields: string[]): number[] {
        const values = fields.map((field) => `tostring(value.${field})`).join(', ');
        const result = this.call(`local value = ${expression}; return table.concat({ ${values} }, ',')`);
        if (typeof result !== 'string') throw new Error('[Yue] Invalid view geometry.');
        const parts = result.split(',');
        if (parts.length !== fields.length) throw new Error('[Yue] Invalid view geometry.');
        return parts.map((part) => {
            const number = Number(part);
            if (part === '' || !Number.isFinite(number)) throw new Error('[Yue] Invalid view geometry.');
            return number;
        });
    }

    private getRect(expression: string): Rect {
        const [x, y, width, height] = this.numbers(expression, ['x', 'y', 'width', 'height']);
        return { x, y, width, height };
    }

    private static number(value: number): string {
        if (!Number.isFinite(value)) throw new RangeError('View values must be finite numbers.');
        return String(value);
    }

    private static rect(rect: Rect): string {
        return `{ x = ${View.number(rect.x)}, y = ${View.number(rect.y)}, ` +
            `width = ${View.number(rect.width)}, height = ${View.number(rect.height)} }`;
    }
}
