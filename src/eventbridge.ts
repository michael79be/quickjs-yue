import * as os from 'os';
import * as std from 'std';
import type { Yue } from './yue';

type EventHandler = (fields: string[]) => void;

export class EventBridge {
    private readonly handlers: Array<{ owner: string; handler: EventHandler } | undefined> = [];
    private readonly timers: Array<{ callback: () => void; interval: number; due: number } | undefined> = [];
    private nextHandler = 0;
    private nextTimer = 0;
    private timerCount = 0;
    private readonly readFd: number;
    private readonly temporaryPath: string | undefined;
    private buffered = '';
    private running = false;
    private quitRequested = false;

    constructor(
        private readonly yue: Yue,
        private readonly toLuaStringLiteral: (value: string) => string,
    ) {
        this.yue.ensureGuiRuntime();

        if (os.platform === 'win32') {
            const directory = std.getenv('TEMP') || std.getenv('TMP');
            if (!directory) {
                throw new Error('[Yue] TEMP or TMP is required for the event transport.');
            }
            let fd = -1;
            let path = '';
            for (let attempt = 0; attempt < 100; attempt++) {
                path = `${directory}\\quickjs-yue-${Math.random().toString(36).slice(2)}.tmp`;
                fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_RDWR | (os.O_BINARY || 0), 0o600);
                if (fd >= 0) break;
                if (fd !== -std.Error.EEXIST) {
                    throw new Error(`[Yue] Cannot create event file (error ${-fd}).`);
                }
            }
            if (fd < 0) throw new Error('[Yue] Cannot create a unique event file.');
            this.readFd = fd;
            this.temporaryPath = path;
            try {
                this.initialize(path, true);
            } catch (error) {
                os.close(fd);
                os.remove(path);
                throw error;
            }
        } else {
            const pipe = os.pipe();
            if (!pipe) throw new Error('[Yue] Cannot create event pipe.');
            const [readFd, writeFd] = pipe;
            this.readFd = readFd;
            try {
                const directory = os.platform === 'linux' ? '/proc/self/fd' : '/dev/fd';
                this.initialize(`${directory}/${writeFd}`, false);
            } catch (error) {
                os.close(readFd);
                throw error;
            } finally {
                os.close(writeFd);
            }
        }
    }

    register(owner: string, handler: EventHandler): number {
        const id = ++this.nextHandler;
        this.handlers[id] = { owner, handler };
        return id;
    }

    unregister(id: number): void {
        delete this.handlers[id];
    }

    setTimer(interval: number, callback: () => void): () => void {
        if (!Number.isSafeInteger(interval) || interval < 1 || interval > 2147483647) {
            throw new RangeError('Timer interval must be an integer between 1 and 2147483647 milliseconds.');
        }
        if (typeof callback !== 'function') throw new TypeError('Timer callback must be a function.');
        if (this.timerCount === 0) this.yue.eval('_G.__quickjs_yue.event_timer_wake = true');
        const id = ++this.nextTimer;
        this.timers[id] = { callback, interval, due: os.now() + interval };
        this.timerCount++;
        return () => {
            if (!this.timers[id]) return;
            if (this.timerCount === 1) this.yue.eval('_G.__quickjs_yue.event_timer_wake = false');
            delete this.timers[id];
            this.timerCount--;
        };
    }

    connect(
        owner: string,
        expression: string,
        signal: string,
        kind: 'mouse' | 'key' | 'capture',
        handler: EventHandler,
    ): () => void {
        const id = this.register(owner, handler);
        let connection: number;
        try {
            const result = this.yue.eval(`
                local runtime = _G.__quickjs_yue
                local responder = assert(${expression}, 'Responder is no longer available')
                return responder.${signal}:connect(function(_, event)
                    runtime.queue_event(${id}, '${kind}', event)
                    return false
                end)
            `);
            if (typeof result !== 'number' || !Number.isSafeInteger(result) || result < 0) {
                throw new Error('[Yue] Invalid signal connection.');
            }
            connection = result;
        } catch (error) {
            this.unregister(id);
            throw error;
        }
        let connected = true;
        return () => {
            if (!connected) return;
            this.yue.eval(`
                local responder = ${expression}
                if responder then responder.${signal}:disconnect(${connection}) end
            `);
            this.unregister(id);
            connected = false;
        };
    }

    run(): void {
        if (this.running) throw new Error('[Yue] MessageLoop is already running.');
        this.running = true;
        this.quitRequested = false;
        let timerStarted = false;
        try {
            this.yue.eval(`
                local runtime = _G.__quickjs_yue
                runtime.event_loop_quit = false
                runtime.event_timer_version = runtime.event_timer_version + 1
                runtime.event_timer_stopping = false
                runtime.event_timer_stopped = false
                local version = runtime.event_timer_version
                runtime.gui.MessageLoop.settimer(10, function()
                    if runtime.event_timer_version ~= version then return false end
                    if runtime.event_timer_stopping then
                        runtime.event_timer_stopped = true
                        runtime.gui.MessageLoop.quit()
                        return false
                    end
                    if #runtime.event_pending > 0 or runtime.event_timer_wake then
                        runtime.event_timer_yield = true
                        runtime.gui.MessageLoop.quit()
                    end
                    return true
                end)
            `);
            timerStarted = true;
            do {
                this.dispatch();
                if (this.quitRequested || this.loopQuit()) break;
                const timerYield = this.yue.eval(`
                    local runtime = _G.__quickjs_yue
                    runtime.event_timer_yield = false
                    runtime.gui.MessageLoop.run()
                    return runtime.event_timer_yield
                `);
                if (typeof timerYield !== 'boolean') {
                    throw new Error('[Yue] Message loop returned an invalid state.');
                }
                this.dispatch();
                if (!timerYield || this.quitRequested || this.loopQuit()) break;
            } while (true);
        } finally {
            try {
                if (timerStarted) {
                    // The timer retains a Lua callback until it has stopped.
                    this.yue.eval(`
                        local runtime = _G.__quickjs_yue
                        runtime.event_timer_stopping = true
                        while not runtime.event_timer_stopped do
                            runtime.gui.MessageLoop.run()
                        end
                    `);
                }
            } finally {
                this.running = false;
            }
        }
    }

    quit(): boolean {
        if (!this.running) return false;
        this.quitRequested = true;
        return true;
    }

    destroy(): void {
        if (this.running) throw new Error('[Yue] Cannot destroy a running message loop.');
        try {
            this.yue.eval(`
                local runtime = _G.__quickjs_yue
                assert(runtime.event_output:close())
                runtime.event_output = nil
                runtime.queue_event = nil
                runtime.retire_event_owner = nil
            `);
        } finally {
            os.close(this.readFd);
            if (this.temporaryPath !== undefined) {
                const error = os.remove(this.temporaryPath);
                if (error !== 0) throw new Error(`[Yue] Cannot remove event file (error ${error}).`);
            }
            this.handlers.length = 0;
            this.timers.length = 0;
            this.timerCount = 0;
        }
    }

    private initialize(path: string, file: boolean): void {
        this.yue.eval(`
            local runtime = _G.__quickjs_yue
            local output, err = io.open(${this.toLuaStringLiteral(path)}, ${file ? "'r+b'" : "'w'"})
            assert(output, err)
            runtime.event_output = output
            runtime.event_pending = ''
            runtime.event_timer_version = 0
            runtime.event_timer_wake = false
            runtime.event_is_file = ${file}
            runtime.queue_event = function(id, kind, event)
                local function encode(value)
                    return (tostring(value):gsub('.', function(char)
                        return string.format('%02x', string.byte(char))
                    end))
                end
                local fields = {tostring(id)}
                if kind ~= 'capture' then
                    fields[#fields + 1] = encode(event.type)
                    fields[#fields + 1] = tostring(event.modifiers)
                    fields[#fields + 1] = tostring(event.timestamp)
                    if kind == 'mouse' then
                        fields[#fields + 1] = tostring(event.button)
                        fields[#fields + 1] = tostring(event.positioninview.x)
                        fields[#fields + 1] = tostring(event.positioninview.y)
                        fields[#fields + 1] = tostring(event.positioninwindow.x)
                        fields[#fields + 1] = tostring(event.positioninwindow.y)
                    else
                        fields[#fields + 1] = encode(event.key)
                    end
                end
                runtime.event_pending = runtime.event_pending .. table.concat(fields, '\\t') .. '\\n'
            end
            runtime.retire_event_owner = function(owner)
                runtime.event_pending = runtime.event_pending .. '0\\t' .. owner .. '\\n'
            end
        `);
    }

    private loopQuit(): boolean {
        return this.yue.eval('return _G.__quickjs_yue.event_loop_quit') === true;
    }

    private dispatch(): void {
        for (;;) {
            let end: number;
            while ((end = this.buffered.indexOf('\n')) !== -1) {
                const fields = this.buffered.slice(0, end).split('\t');
                this.buffered = this.buffered.slice(end + 1);
                const id = Number(fields.shift());
                if (!Number.isSafeInteger(id) || id < 0) {
                    throw new Error('[Yue] Invalid event handler ID.');
                }
                if (id === 0) {
                    if (fields.length !== 1) throw new Error('[Yue] Invalid event owner.');
                    for (let handlerId = 1; handlerId < this.handlers.length; handlerId++) {
                        const entry = this.handlers[handlerId];
                        if (entry && entry.owner === fields[0]) delete this.handlers[handlerId];
                    }
                } else {
                    const entry = this.handlers[id];
                    if (entry) entry.handler(fields);
                }
            }
            const size = this.yue.eval(`
                local runtime = _G.__quickjs_yue
                -- A pipe write must fit without waiting for JavaScript to read it.
                local data = runtime.event_pending:sub(1, 512)
                if #data == 0 then return 0 end
                if runtime.event_is_file then assert(runtime.event_output:seek('set', 0)) end
                assert(runtime.event_output:write(data))
                assert(runtime.event_output:flush())
                runtime.event_pending = runtime.event_pending:sub(#data + 1)
                return #data
            `);
            if (typeof size !== 'number' || !Number.isInteger(size) || size < 0 || size > 512) {
                throw new Error('[Yue] Invalid event transport length.');
            }
            if (size === 0) break;
            if (this.temporaryPath !== undefined && os.seek(this.readFd, 0, 0) !== 0) {
                throw new Error('[Yue] Cannot seek event file.');
            }
            const bytes = new Uint8Array(size);
            let offset = 0;
            while (offset < size) {
                const count = os.read(this.readFd, bytes.buffer, offset, size - offset);
                if (count <= 0) throw new Error(`[Yue] Cannot read event transport (error ${count}).`);
                offset += count;
            }
            for (const byte of bytes) this.buffered += String.fromCharCode(byte);
        }
        const now = os.now();
        const lastTimer = this.nextTimer;
        for (let id = 1; id <= lastTimer; id++) {
            const timer = this.timers[id];
            if (timer && timer.due <= now) {
                timer.due = now + timer.interval;
                timer.callback();
                if (this.quitRequested) break;
            }
        }
    }
}
