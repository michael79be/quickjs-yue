import { Image } from '../image';
import { View } from './view';
import { Yue } from '../yue';
import * as os from 'os';

export type ButtonType = 'normal' | 'checkbox' | 'radio' | 'disclosure';

export type ButtonStyle =
    | 'rounded'
    | 'regular-square'
    | 'thick-square'
    | 'thicker-square'
    | 'disclosure'
    | 'shadowless-square'
    | 'circular'
    | 'textured-square'
    | 'help-button'
    | 'small-square'
    | 'textured-rounded'
    | 'round-rect'
    | 'recessed'
    | 'rounded-disclosure'
    | 'inline';

export type ControlSize = 'mini' | 'small' | 'regular' | 'large';

export interface ButtonOptions {
    title?: string;
    type?: ButtonType;
}

export class Button {
    readonly handle: number;
    readonly view: View;
    private readonly yue: Yue;
    private readonly disconnectors: Array<() => void> = [];

    constructor(options: string | ButtonOptions, yue: Yue = Yue.default) {
        this.yue = yue;
        const argument = Button.creationArgument(options);
        this.yue.ensureGuiRuntime();
        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            local button = assert(runtime.gui.Button.create(${argument}), 'Button could not be created')
            runtime.next_button_handle = runtime.next_button_handle + 1
            runtime.buttons[runtime.next_button_handle] = button
            return runtime.next_button_handle
        `);
        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] Button creation returned an invalid handle.');
        }
        this.handle = handle;
        try {
            this.view = new View(this.expression(), this.yue);
        } catch (error) {
            this.yue.eval(`_G.__quickjs_yue.buttons[${handle}] = nil`);
            throw error;
        }
    }

    static create(options: string | ButtonOptions, yue: Yue = Yue.default): Button {
        return new Button(options, yue);
    }

    on(event: 'click', handler: () => void): () => void {
        if (event !== 'click' || typeof handler !== 'function') {
            throw new TypeError('[Yue] Invalid button event or handler.');
        }
        const disconnectSignal = this.yue.getEventBridge().connect(
            `button:${this.handle}`, this.expression(), 'onclick', 'capture', (fields) => {
                if (fields.length !== 0) throw new Error('[Yue] Invalid button click event.');
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

    makeDefault(): void {
        this.call('button:makedefault()');
    }

    setTitle(title: string): void {
        this.call(`button:settitle(${Yue.toLuaStringLiteral(title)})`);
    }

    getTitle(): string {
        const title = this.call('return button:gettitle()');
        if (typeof title !== 'string') throw new Error('[Yue] Invalid button title.');
        return title;
    }

    setChecked(checked: boolean): void {
        this.call(`button:setchecked(${checked})`);
    }

    isChecked(): boolean {
        const checked = this.call('return button:ischecked()');
        if (typeof checked !== 'boolean') throw new Error('[Yue] Invalid button checked state.');
        return checked;
    }

    setImage(image: Image): void {
        if (image.getRuntime() !== this.yue) throw new Error('[Yue] Image and button belong to different runtimes.');
        this.call(`button:setimage(assert(_G.__quickjs_yue.images[${image.handle}], 'Image is no longer available'))`);
    }

    getImage(): Image | null {
        const exists = this.call('return button:getimage() ~= nil');
        if (typeof exists !== 'boolean') throw new Error('[Yue] Invalid button image.');
        if (!exists) return null;
        return new Image(`assert(${this.expression()}, 'Button is no longer available'):getimage()`, this.yue);
    }

    /** macOS only. */
    setButtonStyle(style: ButtonStyle): void {
        this.call(`button:setbuttonstyle(${Yue.toLuaStringLiteral(style)})`);
    }

    /** macOS only. */
    setControlSize(size: ControlSize): void {
        this.call(`button:setcontrolsize(${Yue.toLuaStringLiteral(size)})`);
    }

    /** macOS only. */
    setHasBorder(hasBorder: boolean): void {
        this.call(`button:sethasborder(${hasBorder})`);
    }

    /** macOS only. */
    hasBorder(): boolean {
        const hasBorder = this.call('return button:hasborder()');
        if (typeof hasBorder !== 'boolean') throw new Error('[Yue] Invalid button border state.');
        return hasBorder;
    }

    dispose(): void {
        while (this.disconnectors.length > 0) this.disconnectors[0]();
        this.view.dispose();
        this.yue.eval(`_G.__quickjs_yue.buttons[${this.handle}] = nil`);
    }

    private expression(): string {
        return `_G.__quickjs_yue.buttons[${this.handle}]`;
    }

    private call(statement: string): string | number | boolean | null {
        return this.yue.eval(`
            local button = assert(${this.expression()}, 'Button is no longer available')
            ${statement}
        `);
    }

    private static creationArgument(options: string | ButtonOptions): string {
        if (typeof options === 'string') return Yue.toLuaStringLiteral(options);
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new TypeError('Button options must be a title or an object.');
        }
        const fields: string[] = [];
        if (options.title !== undefined) {
            if (typeof options.title !== 'string') throw new TypeError('Button title must be a string.');
            fields.push(`title = ${Yue.toLuaStringLiteral(options.title)}`);
        }
        if (options.type !== undefined) {
            if (options.type !== 'normal' && options.type !== 'checkbox' &&
                options.type !== 'radio' && options.type !== 'disclosure') {
                throw new TypeError('Invalid button type.');
            }
            if (options.type === 'disclosure' && os.platform !== 'darwin') {
                throw new Error('[Yue] Disclosure buttons are only available on macOS.');
            }
            fields.push(`type = ${Yue.toLuaStringLiteral(options.type)}`);
        }
        return `{ ${fields.join(', ')} }`;
    }
}
