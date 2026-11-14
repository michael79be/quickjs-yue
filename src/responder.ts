import { Yue } from './yue';
import type { Point } from './painter';

export interface ResponderInputEvent {
    type: string;
    modifiers: number;
    timestamp: number;
}

export type ResponderMouseEvent = ResponderInputEvent & {
    button: number;
    positionInView: Point;
    positionInWindow: Point;
};

export type ResponderKeyEvent = ResponderInputEvent & {
    key: string;
};

export interface ResponderEvents {
    mouseDown: ResponderMouseEvent;
    mouseUp: ResponderMouseEvent;
    mouseMove: ResponderMouseEvent;
    mouseEnter: ResponderMouseEvent;
    mouseLeave: ResponderMouseEvent;
    keyDown: ResponderKeyEvent;
    keyUp: ResponderKeyEvent;
    captureLost: void;
}

const signals = {
    mouseDown: { name: 'onmousedown', kind: 'mouse' },
    mouseUp: { name: 'onmouseup', kind: 'mouse' },
    mouseMove: { name: 'onmousemove', kind: 'mouse' },
    mouseEnter: { name: 'onmouseenter', kind: 'mouse' },
    mouseLeave: { name: 'onmouseleave', kind: 'mouse' },
    keyDown: { name: 'onkeydown', kind: 'key' },
    keyUp: { name: 'onkeyup', kind: 'key' },
    captureLost: { name: 'oncapturelost', kind: 'capture' },
} as const;

export class Responder {
    private readonly disconnectors: Array<() => void> = [];

    constructor(
        private readonly yue: Yue,
        private readonly expression: string,
        private readonly owner: string,
    ) {}

    /** Events are notifications; their handlers cannot consume native input. */
    on<K extends keyof ResponderEvents>(
        event: K,
        handler: (data: ResponderEvents[K]) => void,
    ): () => void {
        if (!Object.prototype.hasOwnProperty.call(signals, event) || typeof handler !== 'function') {
            throw new TypeError('[Yue] Invalid responder event or handler.');
        }
        const signal = signals[event];
        const disconnectSignal = this.yue.getEventBridge().connect(this.owner, this.expression, signal.name, signal.kind, (fields) => {
            handler(Responder.decodeEvent(signal.kind, fields) as ResponderEvents[K]);
        });
        const disconnect = () => {
            disconnectSignal();
            const index = this.disconnectors.indexOf(disconnect);
            if (index !== -1) this.disconnectors.splice(index, 1);
        };
        this.disconnectors.push(disconnect);
        return disconnect;
    }

    dispose(): void {
        while (this.disconnectors.length > 0) {
            this.disconnectors[0]();
        }
    }

    setCapture(): void {
        this.callResponder('responder:setcapture()');
    }

    releaseCapture(): void {
        this.callResponder('responder:releasecapture()');
    }

    hasCapture(): boolean {
        const result = this.callResponder('return responder:hascapture()');
        if (typeof result !== 'boolean') {
            throw new Error('[Yue] Responder capture state is not a boolean.');
        }
        return result;
    }

    private callResponder(statement: string): string | number | boolean | null {
        return this.yue.eval(`
            local responder = assert(${this.expression}, 'Responder is no longer available')
            ${statement}
        `);
    }

    private static decodeEvent(
        kind: 'mouse' | 'key' | 'capture',
        fields: string[],
    ): ResponderMouseEvent | ResponderKeyEvent | undefined {
        if (kind === 'capture') {
            if (fields.length !== 0) throw new Error('[Yue] Invalid capture event.');
            return undefined;
        }
        if (fields.length !== (kind === 'mouse' ? 8 : 4)) {
            throw new Error('[Yue] Invalid responder event.');
        }
        const number = (index: number): number => {
            const value = Number(fields[index]);
            if (fields[index] === '' || !Number.isFinite(value)) {
                throw new Error('[Yue] Invalid responder event number.');
            }
            return value;
        };
        const text = (index: number): string => {
            const value = fields[index];
            if (!/^(?:[0-9a-f]{2})*$/i.test(value)) {
                throw new Error('[Yue] Invalid responder event string.');
            }
            return decodeURIComponent(value.replace(/(..)/g, '%$1'));
        };
        const common = { type: text(0), modifiers: number(1), timestamp: number(2) };
        if (kind === 'key') return { ...common, key: text(3) };
        return {
            ...common,
            button: number(3),
            positionInView: { x: number(4), y: number(5) },
            positionInWindow: { x: number(6), y: number(7) },
        };
    }
}
