import { Yue } from './yue';

export interface Size {
    width: number;
    height: number;
}

/** A native image, kept in the Lua state and referenced from TypeScript by a numeric handle. */
export class Image {
    readonly handle: number;
    private readonly yue: Yue;

    /** Registers the native image produced by a Lua expression. Prefer the `create*` factories. */
    constructor(luaExpression: string, yue: Yue = Yue.default) {
        this.yue = yue;
        this.yue.ensureGuiRuntime();

        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            local image = ${luaExpression}
            if image == nil then
                error('Image could not be created', 0)
            end
            runtime.next_image_handle = runtime.next_image_handle + 1
            runtime.images[runtime.next_image_handle] = image
            return runtime.next_image_handle
        `);

        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] Image creation returned an invalid handle.');
        }
        this.handle = handle;
    }

    static createEmpty(yue: Yue = Yue.default): Image {
        return new Image(`_G.__quickjs_yue.gui.Image.createempty()`, yue);
    }

    /** Reads the image at `path`. `@2x` and `Template` in the file name are honored by Yue. */
    static createFromPath(path: string, yue: Yue = Yue.default): Image {
        return new Image(`_G.__quickjs_yue.gui.Image.createfrompath(${Yue.toLuaStringLiteral(path)})`, yue);
    }

    /** Decodes encoded image data such as PNG or JPEG. */
    static createFromBuffer(buffer: Uint8Array, scaleFactor = 1, yue: Yue = Yue.default): Image {
        const factor = Image.luaNumber(scaleFactor, 'scaleFactor');
        return new Image(`_G.__quickjs_yue.gui.Image.createfrombuffer(${Image.luaBytes(buffer)}, ${factor})`, yue);
    }

    clear(): void {
        this.call('image:clear()');
    }

    isEmpty(): boolean {
        return this.call('return image:isempty()') === true;
    }

    /** macOS only. */
    setTemplate(isTemplate: boolean): void {
        this.call(`image:settemplate(${isTemplate})`);
    }

    isTemplate(): boolean {
        return this.call('return image:istemplate()') === true;
    }

    getSize(): Size {
        const width = this.call('return image:getsize().width');
        const height = this.call('return image:getsize().height');
        return { width: Number(width), height: Number(height) };
    }

    getScaleFactor(): number {
        return Number(this.call('return image:getscalefactor()'));
    }

    getRuntime(): Yue {
        return this.yue;
    }

    /** Returns a new image; `color` is a Yue color string such as `#ff0000`. */
    tint(color: string): Image {
        return new Image(
            `_G.__quickjs_yue.images[${this.handle}]:tint(${Yue.toLuaStringLiteral(color)})`,
            this.yue
        );
    }

    /** Returns a new image resized to `size` (in DIP). */
    resize(size: Size, scaleFactor = 1): Image {
        const width = Image.luaNumber(size.width, 'width');
        const height = Image.luaNumber(size.height, 'height');
        const factor = Image.luaNumber(scaleFactor, 'scaleFactor');
        return new Image(
            `_G.__quickjs_yue.images[${this.handle}]:resize({ width = ${width}, height = ${height} }, ${factor})`,
            this.yue
        );
    }

    toPNG(): Uint8Array {
        return this.encode('image:topng()');
    }

    /** `quality` ranges from 0 to 100. */
    toJPEG(quality = 90): Uint8Array {
        if (!Number.isInteger(quality) || quality < 0 || quality > 100) {
            throw new RangeError('quality must be an integer between 0 and 100.');
        }
        return this.encode(`image:tojpeg(${quality})`);
    }

    /** Frees the native image. The instance cannot be used afterwards. */
    dispose(): void {
        this.yue.eval(`_G.__quickjs_yue.images[${this.handle}] = nil`);
    }

    private static luaNumber(value: number, name: string): string {
        if (!Number.isFinite(value) || value <= 0) {
            throw new RangeError(`${name} must be a finite positive number.`);
        }
        return String(value);
    }

    private static luaBytes(bytes: Uint8Array): string {
        let literal = '"';
        for (const byte of bytes) {
            literal += `\\x${byte.toString(16).padStart(2, '0')}`;
        }
        return `${literal}"`;
    }

    private encode(expression: string): Uint8Array {
        const hex = this.call(`
            local data = ${expression}
            return (data:gsub('.', function(char) return string.format('%02x', char:byte()) end))
        `);
        if (typeof hex !== 'string') {
            throw new Error('[Yue] Image encoding failed.');
        }
        const bytes = new Uint8Array(hex.length / 2);
        for (let index = 0; index < bytes.length; index++) {
            bytes[index] = parseInt(hex.substr(index * 2, 2), 16);
        }
        return bytes;
    }

    private call(statement: string): string | number | boolean | null {
        return this.yue.eval(`
            local image = assert(_G.__quickjs_yue.images[${this.handle}], 'Image is no longer available')
            ${statement}
        `);
    }
}
