import { Image } from './image';
import { AttributedText } from './attributedtext';
import { Yue } from './yue';
import type { Canvas } from './canvas';

export interface Point {
    x: number;
    y: number;
}

export interface Vector2d {
    x: number;
    y: number;
}

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type BlendMode =
    | 'normal'
    | 'multiply'
    | 'screen'
    | 'overlay'
    | 'darken'
    | 'lighten'
    | 'color-dodge'
    | 'color-burn'
    | 'soft-light'
    | 'hard-light'
    | 'difference'
    | 'exclusion'
    | 'hue'
    | 'saturation'
    | 'color'
    | 'luminosity'
    | 'clear'
    | 'copy'
    | 'source-in'
    | 'source-out'
    | 'source-atop'
    | 'destination-over'
    | 'destination-in'
    | 'destination-atop'
    | 'xor';

/**
 * A graphic context. Yue only hands out painters through drawing events, which cannot
 * be received yet, or through `Canvas.getPainter()`. Colors are Yue color strings such as `#ff0000`.
 */
export class Painter {
    private readonly yue: Yue;
    private readonly source: string;

    /** `luaExpression` evaluates to the native painter. Prefer `Canvas.getPainter()`. */
    constructor(luaExpression: string, yue: Yue = Yue.default) {
        this.yue = yue;
        this.source = luaExpression;
    }

    /** Saves the entire state of the painter. */
    save(): void {
        this.call('painter:save()');
    }

    /** Restores the most recently saved state. */
    restore(): void {
        this.call('painter:restore()');
    }

    /** On Windows only `normal` and `copy` are supported. */
    setBlendMode(mode: BlendMode): void {
        this.call(`painter:setblendmode(${Yue.toLuaStringLiteral(mode)})`);
    }

    beginPath(): void {
        this.call('painter:beginpath()');
    }

    /** Closes the current path with a straight line back to its start. */
    closePath(): void {
        this.call('painter:closepath()');
    }

    moveTo(point: Point): void {
        this.call(`painter:moveto(${Painter.point(point)})`);
    }

    lineTo(point: Point): void {
        this.call(`painter:lineto(${Painter.point(point)})`);
    }

    bezierCurveTo(controlPoint1: Point, controlPoint2: Point, endPoint: Point): void {
        const points = [controlPoint1, controlPoint2, endPoint].map(Painter.point).join(', ');
        this.call(`painter:beziercurveto(${points})`);
    }

    /** Adds a clockwise arc; angles are in radians, measured from the positive x axis. */
    arc(center: Point, radius: number, startAngle: number, endAngle: number): void {
        const values = [radius, startAngle, endAngle].map((value) => Painter.number(value)).join(', ');
        this.call(`painter:arc(${Painter.point(center)}, ${values})`);
    }

    rect(rect: Rect): void {
        this.call(`painter:rect(${Painter.rect(rect)})`);
    }

    /** Intersects the clip area with the current path. */
    clip(): void {
        this.call('painter:clip()');
    }

    clipRect(rect: Rect): void {
        this.call(`painter:cliprect(${Painter.rect(rect)})`);
    }

    translate(offset: Vector2d): void {
        this.call(`painter:translate(${Painter.point(offset)})`);
    }

    /** `angle` is clockwise, in radians. */
    rotate(angle: number): void {
        this.call(`painter:rotate(${Painter.number(angle)})`);
    }

    scale(scale: Vector2d): void {
        this.call(`painter:scale(${Painter.point(scale)})`);
    }

    /** Sets both the stroke and the fill color. */
    setColor(color: string): void {
        this.call(`painter:setcolor(${Yue.toLuaStringLiteral(color)})`);
    }

    setStrokeColor(color: string): void {
        this.call(`painter:setstrokecolor(${Yue.toLuaStringLiteral(color)})`);
    }

    setFillColor(color: string): void {
        this.call(`painter:setfillcolor(${Yue.toLuaStringLiteral(color)})`);
    }

    setLineWidth(width: number): void {
        this.call(`painter:setlinewidth(${Painter.number(width)})`);
    }

    /** Draws the outline of the current path. */
    stroke(): void {
        this.call('painter:stroke()');
    }

    /** Fills the current path. */
    fill(): void {
        this.call('painter:fill()');
    }

    /** Fills the whole area with transparent color. */
    clear(): void {
        this.call('painter:clear()');
    }

    strokeRect(rect: Rect): void {
        this.call(`painter:strokerect(${Painter.rect(rect)})`);
    }

    fillRect(rect: Rect): void {
        this.call(`painter:fillrect(${Painter.rect(rect)})`);
    }

    /** Draws `image` scaled to fit `rect`. */
    drawImage(image: Image, rect: Rect): void {
        this.call(`painter:drawimage(_G.__quickjs_yue.images[${image.handle}], ${Painter.rect(rect)})`);
    }

    /** Draws the `source` portion of `image` scaled to fit `destination`. */
    drawImageFromRect(image: Image, source: Rect, destination: Rect): void {
        this.call(
            `painter:drawimagefromrect(_G.__quickjs_yue.images[${image.handle}], ` +
            `${Painter.rect(source)}, ${Painter.rect(destination)})`
        );
    }

    /** Draws `canvas` scaled to fit `rect`. */
    drawCanvas(canvas: Canvas, rect: Rect): void {
        this.call(`painter:drawcanvas(_G.__quickjs_yue.canvases[${canvas.handle}], ${Painter.rect(rect)})`);
    }

    /** Draws the `source` portion of `canvas` scaled to fit `destination`. */
    drawCanvasFromRect(canvas: Canvas, source: Rect, destination: Rect): void {
        this.call(
            `painter:drawcanvasfromrect(_G.__quickjs_yue.canvases[${canvas.handle}], ` +
            `${Painter.rect(source)}, ${Painter.rect(destination)})`
        );
    }

    drawAttributedText(text: AttributedText, rect: Rect): void {
        if (text.getRuntime() !== this.yue) throw new Error('[Yue] Painter and text belong to different runtimes.');
        this.call(
            `painter:drawattributedtext(assert(_G.__quickjs_yue.attributed_texts[${text.handle}], ` +
            `'AttributedText is no longer available'), ${Painter.rect(rect)})`
        );
    }

    private static number(value: number): string {
        if (!Number.isFinite(value)) {
            throw new RangeError('Painter values must be finite numbers.');
        }
        return String(value);
    }

    private static point(point: Point): string {
        return `{ x = ${Painter.number(point.x)}, y = ${Painter.number(point.y)} }`;
    }

    private static rect(rect: Rect): string {
        const values = [rect.x, rect.y, rect.width, rect.height].map((value) => Painter.number(value));
        return `{ x = ${values[0]}, y = ${values[1]}, width = ${values[2]}, height = ${values[3]} }`;
    }

    private call(statement: string): void {
        this.yue.eval(`
            local painter = assert(${this.source}, 'Painter is no longer available')
            ${statement}
        `);
    }
}
