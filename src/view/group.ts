import { Container } from './container';
import { View } from './view';
import { Yue } from '../yue';

export class Group {
    readonly handle: number;
    readonly view: View;
    private readonly yue: Yue;

    constructor(title: string, yue: Yue = Yue.default) {
        this.yue = yue;
        const luaTitle = Group.luaTitle(title);
        this.yue.ensureGuiRuntime();
        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            local group = assert(runtime.gui.Group.create(${luaTitle}), 'Group could not be created')
            -- GetContentView returns a View userdata unless a Container wrapper already exists.
            group:setcontentview(assert(runtime.gui.Container.create(), 'Container could not be created'))
            runtime.next_group_handle = runtime.next_group_handle + 1
            runtime.groups[runtime.next_group_handle] = group
            return runtime.next_group_handle
        `);
        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] Group creation returned an invalid handle.');
        }
        this.handle = handle;
        try {
            this.view = new View(this.expression(), this.yue);
        } catch (error) {
            this.yue.eval(`_G.__quickjs_yue.groups[${handle}] = nil`);
            throw error;
        }
    }

    static create(title: string, yue: Yue = Yue.default): Group {
        return new Group(title, yue);
    }

    getRuntime(): Yue {
        return this.yue;
    }

    setTitle(title: string): void {
        this.call(`group:settitle(${Group.luaTitle(title)})`);
    }

    getTitle(): string {
        const title = this.call('return group:gettitle()');
        if (typeof title !== 'string') throw new Error('[Yue] Invalid group title.');
        return title;
    }

    setContentView(content: Container): void {
        if (content.view.getRuntime() !== this.yue) {
            throw new Error('[Yue] Group and container belong to different runtimes.');
        }
        this.call(`
            local runtime = _G.__quickjs_yue
            local content = assert(runtime.containers[${content.handle}], 'Container is no longer available')
            assert(runtime.views[${content.view.handle}] == content, 'View is no longer available')
            if group:getcontentview() ~= content then
                assert(not content:getparent(), 'Container already has a parent')
                assert(not content:getwindow(), 'Container already belongs to a window')
                local ancestor = group
                while ancestor do
                    assert(ancestor ~= content, 'Cannot add an ancestor as group content')
                    ancestor = ancestor:getparent()
                end
                group:setcontentview(content)
            end
            runtime.container_owners[${content.handle}] = group
        `);
    }

    /** Returns an independent wrapper for the current content container. */
    getContentView(): Container {
        return new Container(this.yue, this);
    }

    dispose(): void {
        this.view.dispose();
        this.yue.eval(`_G.__quickjs_yue.groups[${this.handle}] = nil`);
    }

    private static luaTitle(title: string): string {
        if (title.includes('\0')) throw new RangeError('Group title cannot contain NUL.');
        return Yue.toLuaStringLiteral(title);
    }

    private expression(): string {
        return `_G.__quickjs_yue.groups[${this.handle}]`;
    }

    private call(statement: string): string | number | boolean | null {
        return this.yue.eval(`
            local group = assert(${this.expression()}, 'Group is no longer available')
            ${statement}
        `);
    }
}
