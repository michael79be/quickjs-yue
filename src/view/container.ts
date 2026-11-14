import type { Size } from '../image';
import type { Group } from './group';
import { View } from './view';
import { Yue } from '../yue';

export class Container {
    readonly handle: number;
    readonly view: View;
    private readonly yue: Yue;

    constructor(yue: Yue = Yue.default, group?: Group) {
        this.yue = yue;
        if (group && group.getRuntime() !== yue) {
            throw new Error('[Yue] Group and container belong to different runtimes.');
        }
        this.yue.ensureGuiRuntime();
        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            ${group ? `local owner = assert(runtime.groups[${group.handle}], 'Group is no longer available')` : ''}
            local container = assert(${group ? 'owner:getcontentview()' : 'runtime.gui.Container.create()'}, 'Container could not be created')
            runtime.next_container_handle = runtime.next_container_handle + 1
            runtime.containers[runtime.next_container_handle] = container
            ${group ? 'runtime.container_owners[runtime.next_container_handle] = owner' : ''}
            return runtime.next_container_handle
        `);
        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] Container creation returned an invalid handle.');
        }
        this.handle = handle;
        try {
            this.view = new View(this.expression(), this.yue);
        } catch (error) {
            this.yue.eval(`
                _G.__quickjs_yue.containers[${handle}] = nil
                _G.__quickjs_yue.container_owners[${handle}] = nil
            `);
            throw error;
        }
    }

    static create(yue: Yue = Yue.default): Container {
        return new Container(yue);
    }

    getPreferredSize(): Size {
        const result = this.call(`
            local size = container:getpreferredsize()
            return tostring(size.width) .. ',' .. tostring(size.height)
        `);
        if (typeof result !== 'string') throw new Error('[Yue] Invalid preferred size.');
        const parts = result.split(',');
        if (parts.length !== 2 || parts.some((part) => part === '' || !Number.isFinite(Number(part)))) {
            throw new Error('[Yue] Invalid preferred size.');
        }
        return { width: Number(parts[0]), height: Number(parts[1]) };
    }

    getPreferredHeightForWidth(width: number): number {
        return this.measure(`container:getpreferredheightforwidth(${Container.dimension(width)})`);
    }

    getPreferredWidthForHeight(height: number): number {
        return this.measure(`container:getpreferredwidthforheight(${Container.dimension(height)})`);
    }

    addChildView(view: View): void {
        this.add(view);
    }

    /** `index` is zero-based; an index equal to childCount() appends. */
    addChildViewAt(view: View, index: number): void {
        if (!Number.isSafeInteger(index) || index < 0) throw new RangeError('Child index must be a non-negative integer.');
        this.add(view, index);
    }

    removeChildView(view: View): void {
        this.checkRuntime(view);
        this.call(`
            local child = assert(_G.__quickjs_yue.views[${view.handle}], 'View is no longer available')
            assert(child:getparent() == container, 'View is not a child of this container')
            container:removechildview(child)
        `);
    }

    childCount(): number {
        const count = this.call('return container:childcount()');
        if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
            throw new Error('[Yue] Invalid child count.');
        }
        return count;
    }

    /** Returns a new view wrapper, or null when `index` is out of range. */
    childAt(index: number): View | null {
        if (!Number.isSafeInteger(index) || index < 0) throw new RangeError('Child index must be a non-negative integer.');
        if (index >= this.childCount()) return null;
        return new View(`assert(${this.expression()}, 'Container is no longer available'):childat(${index + 1})`, this.yue);
    }

    dispose(): void {
        this.view.dispose();
        this.yue.eval(`
            _G.__quickjs_yue.containers[${this.handle}] = nil
            _G.__quickjs_yue.container_owners[${this.handle}] = nil
        `);
    }

    private add(view: View, index?: number): void {
        this.checkRuntime(view);
        const operation = index === undefined ? 'container:addchildview(child)' :
            `assert(${index} <= container:childcount(), 'Child index is out of range')
             container:addchildviewat(child, ${index + 1})`;
        this.call(`
            local child = assert(_G.__quickjs_yue.views[${view.handle}], 'View is no longer available')
            assert(not child:getparent(), 'View already has a parent')
            local ancestor = container
            while ancestor do
                assert(ancestor ~= child, 'Cannot add a container to itself or its descendant')
                ancestor = ancestor:getparent()
            end
            ${operation}
        `);
    }

    private checkRuntime(view: View): void {
        if (view.getRuntime() !== this.yue) throw new Error('[Yue] Container and view belong to different runtimes.');
    }

    private measure(expression: string): number {
        const result = this.call(`return tostring(${expression})`);
        if (typeof result !== 'string' || result === '' || !Number.isFinite(Number(result))) {
            throw new Error('[Yue] Invalid preferred dimension.');
        }
        return Number(result);
    }

    private static dimension(value: number): string {
        if (!Number.isFinite(value) || value < 0) throw new RangeError('Dimension must be a finite non-negative number.');
        return String(value);
    }

    private expression(): string {
        return `_G.__quickjs_yue.containers[${this.handle}]`;
    }

    private call(statement: string): string | number | boolean | null {
        return this.yue.eval(`
            local container = assert(${this.expression()}, 'Container is no longer available')
            ${statement}
        `);
    }
}
