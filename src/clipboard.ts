import { Image } from './image';
import { Yue } from './yue';

export type ClipboardType = 'copy-paste' | 'drag' | 'find' | 'font' | 'selection';
export type ClipboardDataType = 'text' | 'html' | 'image' | 'file-paths';

export type ClipboardData =
    | { type: 'text' | 'html'; value: string }
    | { type: 'image'; value: Image }
    | { type: 'file-paths'; value: string[] }
    | { type: 'none'; value: null };

export type ClipboardContent = Exclude<ClipboardData, { type: 'none' }>;

/** A native clipboard. */
export class Clipboard {
    private readonly yue: Yue;
    private readonly luaType: string;

    /** `drag`, `find` and `font` are only available on macOS, `selection` only on Linux. */
    constructor(type: ClipboardType = 'copy-paste', yue: Yue = Yue.default) {
        this.yue = yue;
        this.luaType = Yue.toLuaStringLiteral(type);
    }

    static get(yue: Yue = Yue.default): Clipboard {
        return new Clipboard('copy-paste', yue);
    }

    static fromType(type: ClipboardType, yue: Yue = Yue.default): Clipboard {
        return new Clipboard(type, yue);
    }

    clear(): void {
        this.run('clipboard:clear()');
    }

    setText(text: string): void {
        this.run(`clipboard:settext(${Yue.toLuaStringLiteral(text)})`);
    }

    getText(): string {
        const value = this.run('return clipboard:gettext()');
        return typeof value === 'string' ? value : '';
    }

    isDataAvailable(type: ClipboardDataType): boolean {
        return this.run(`return clipboard:isdataavailable(${Yue.toLuaStringLiteral(type)})`) === true;
    }

    /** Replaces the clipboard content with all the given objects, each in its own format. */
    setData(objects: ClipboardContent[]): void {
        const entries = objects.map((object) => {
            const type = Yue.toLuaStringLiteral(object.type);
            if (object.type === 'file-paths') {
                const paths = object.value.map(Yue.toLuaStringLiteral).join(', ');
                return `{ type = ${type}, value = { ${paths} } }`;
            }
            if (object.type === 'image') {
                return `{ type = ${type}, value = _G.__quickjs_yue.images[${object.value.handle}] }`;
            }
            return `{ type = ${type}, value = ${Yue.toLuaStringLiteral(object.value)} }`;
        });
        this.run(`clipboard:setdata({ ${entries.join(', ')} })`);
    }

    getData(type: ClipboardDataType): ClipboardData {
        const result = this.run(`
            local data = clipboard:getdata(${Yue.toLuaStringLiteral(type)})
            if data.type == 'file-paths' then
                return #data.value
            end
            return data.type
        `);

        if (typeof result === 'number') {
            const paths: string[] = [];
            for (let index = 1; index <= result; index++) {
                const path = this.run(`return clipboard:getdata('file-paths').value[${index}]`);
                paths.push(String(path));
            }
            return { type: 'file-paths', value: paths };
        }

        if (result === 'image') {
            const image = new Image(
                `require('yue.gui').Clipboard.fromtype(${this.luaType}):getdata('image').value`,
                this.yue
            );
            return { type: 'image', value: image };
        }

        if (result === 'text' || result === 'html') {
            const value = this.run(`return clipboard:getdata(${Yue.toLuaStringLiteral(result)}).value`);
            return { type: result, value: typeof value === 'string' ? value : '' };
        }
        return { type: 'none', value: null };
    }

    private run(statement: string): string | number | boolean | null {
        return this.yue.eval(`
            local clipboard = require('yue.gui').Clipboard.fromtype(${this.luaType})
            ${statement}
        `);
    }
}
