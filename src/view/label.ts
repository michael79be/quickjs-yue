import { AttributedText } from '../attributedtext';
import { View } from './view';
import { Yue } from '../yue';

export type TextAlign = 'start' | 'center' | 'end';

export class Label {
    readonly handle: number;
    readonly view: View;
    private readonly yue: Yue;

    constructor(text: string | AttributedText, yue: Yue = typeof text === 'string' ? Yue.default : text.getRuntime()) {
        this.yue = yue;
        let creation: string;
        if (typeof text === 'string') {
            creation = `runtime.gui.Label.create(${Label.luaText(text)})`;
        } else {
            if (text.getRuntime() !== yue) throw new Error('[Yue] Label and text belong to different runtimes.');
            creation = `runtime.gui.Label.createwithattributedtext(` +
                `assert(runtime.attributed_texts[${text.handle}], 'AttributedText is no longer available'))`;
        }
        this.yue.ensureGuiRuntime();
        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            local label = assert(${creation}, 'Label could not be created')
            runtime.next_label_handle = runtime.next_label_handle + 1
            runtime.labels[runtime.next_label_handle] = label
            return runtime.next_label_handle
        `);
        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] Label creation returned an invalid handle.');
        }
        this.handle = handle;
        try {
            this.view = new View(this.expression(), this.yue);
        } catch (error) {
            this.yue.eval(`_G.__quickjs_yue.labels[${handle}] = nil`);
            throw error;
        }
    }

    static create(text: string, yue: Yue = Yue.default): Label {
        return new Label(text, yue);
    }

    static createWithAttributedText(text: AttributedText, yue: Yue = text.getRuntime()): Label {
        return new Label(text, yue);
    }

    setText(text: string): void {
        this.call(`label:settext(${Label.luaText(text)})`);
    }

    getText(): string {
        const text = this.call('return label:gettext()');
        if (typeof text !== 'string') throw new Error('[Yue] Invalid label text.');
        return text;
    }

    setAlign(align: TextAlign): void {
        this.call(`label:setalign(${Yue.toLuaStringLiteral(align)})`);
    }

    setVAlign(align: TextAlign): void {
        this.call(`label:setvalign(${Yue.toLuaStringLiteral(align)})`);
    }

    setAttributedText(text: AttributedText): void {
        if (text.getRuntime() !== this.yue) throw new Error('[Yue] Label and text belong to different runtimes.');
        this.call(`label:setattributedtext(assert(_G.__quickjs_yue.attributed_texts[${text.handle}], 'AttributedText is no longer available'))`);
    }

    getAttributedText(): AttributedText {
        return new AttributedText(`assert(${this.expression()}, 'Label is no longer available'):getattributedtext()`, this.yue);
    }

    dispose(): void {
        this.view.dispose();
        this.yue.eval(`_G.__quickjs_yue.labels[${this.handle}] = nil`);
    }

    private expression(): string {
        return `_G.__quickjs_yue.labels[${this.handle}]`;
    }

    private call(statement: string): string | number | boolean | null {
        return this.yue.eval(`
            local label = assert(${this.expression()}, 'Label is no longer available')
            ${statement}
        `);
    }

    private static luaText(text: string): string {
        if (text.includes('\0')) throw new RangeError('Label text cannot contain NUL.');
        return Yue.toLuaStringLiteral(text);
    }
}
