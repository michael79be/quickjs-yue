import { Image } from './image';
import { Window } from './window';
import { Yue } from './yue';

export type MessageBoxType = 'none' | 'information' | 'warning' | 'error';

interface MessageBoxButton {
    title: string;
    response: number;
}

/**
 * A window showing some text and buttons. It is configured in TypeScript and only created
 * in Lua when shown. Only the blocking `run` methods are supported, because responses
 * cannot be delivered to a callback.
 */
export class MessageBox {
    private readonly yue: Yue;
    private readonly buttons: MessageBoxButton[] = [];
    private type: MessageBoxType | undefined;
    private title: string | undefined;
    private text: string | undefined;
    private informativeText: string | undefined;
    private image: Image | undefined;
    private defaultResponse: number | undefined;
    private cancelResponse: number | undefined;

    constructor(yue: Yue = Yue.default) {
        this.yue = yue;
    }

    /** On macOS there is no visual difference between `information` and `warning`. */
    setType(type: MessageBoxType): void {
        this.type = type;
    }

    /** Ignored on macOS, where the message box has no title. */
    setTitle(title: string): void {
        this.title = title;
    }

    setText(text: string): void {
        this.text = text;
    }

    setInformativeText(text: string): void {
        this.informativeText = text;
    }

    setImage(image: Image): void {
        this.image = image;
    }

    getImage(): Image | undefined {
        return this.image;
    }

    /** The `response` ID is returned by `run` when the button is clicked. */
    addButton(title: string, response: number): void {
        MessageBox.checkResponse(response);
        this.buttons.push({ title, response });
    }

    /** The button with this ID is clicked when the user presses Enter. */
    setDefaultResponse(response: number): void {
        MessageBox.checkResponse(response);
        this.defaultResponse = response;
    }

    /** Returned when the user presses Esc or closes the window. Yue's default is -1. */
    setCancelResponse(response: number): void {
        MessageBox.checkResponse(response);
        this.cancelResponse = response;
    }

    /** Shows the message box, waits for it to close and returns the response ID. */
    run(): number {
        return this.execute('return box:run()');
    }

    /** Shows the message box as a child of `window` and returns the response ID. */
    runForWindow(window: Window): number {
        return this.execute(`
            local window = assert(
                _G.__quickjs_yue.windows[${window.handle}],
                'Window is no longer available'
            )
            return box:runforwindow(window)
        `);
    }

    private static checkResponse(response: number): void {
        if (!Number.isSafeInteger(response)) {
            throw new RangeError('response must be an integer.');
        }
    }

    private execute(runStatement: string): number {
        this.yue.ensureGuiRuntime();
        const response = this.yue.evalModal(this.createScript(runStatement));
        if (typeof response !== 'number') {
            throw new Error('[Yue] The message box did not return a response.');
        }
        return response;
    }

    private createScript(runStatement: string): string {
        const statements: string[] = [];
        if (this.type !== undefined) {
            statements.push(`box:settype(${Yue.toLuaStringLiteral(this.type)})`);
        }
        if (this.title !== undefined) {
            statements.push(`if box.settitle then box:settitle(${Yue.toLuaStringLiteral(this.title)}) end`);
        }
        if (this.text !== undefined) {
            statements.push(`box:settext(${Yue.toLuaStringLiteral(this.text)})`);
        }
        if (this.informativeText !== undefined) {
            statements.push(`box:setinformativetext(${Yue.toLuaStringLiteral(this.informativeText)})`);
        }
        if (this.image !== undefined) {
            statements.push(`box:setimage(_G.__quickjs_yue.images[${this.image.handle}])`);
        }
        for (const button of this.buttons) {
            statements.push(`box:addbutton(${Yue.toLuaStringLiteral(button.title)}, ${button.response})`);
        }
        if (this.defaultResponse !== undefined) {
            statements.push(`box:setdefaultresponse(${this.defaultResponse})`);
        }
        if (this.cancelResponse !== undefined) {
            statements.push(`box:setcancelresponse(${this.cancelResponse})`);
        }

        return `
            local box = _G.__quickjs_yue.gui.MessageBox.create()
            ${statements.join('\n            ')}
            ${runStatement}
        `;
    }
}
