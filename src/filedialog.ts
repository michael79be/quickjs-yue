import type { Window } from './window';
import { Yue } from './yue';

export interface FileDialogFilter {
    description: string;
    extensions: string[];
}

export class FileDialog {
    static readonly optionPickFolders = 1;
    static readonly optionMultiSelect = 2;
    static readonly optionShowHidden = 4;

    readonly handle: number;
    private readonly yue: Yue;
    private readonly kind: 'open' | 'save';
    private options = 0;
    private filtersSet = false;

    constructor(luaExpression: string, yue: Yue = Yue.default, kind: 'open' | 'save' = 'open') {
        this.yue = yue;
        this.kind = kind;
        this.yue.ensureGuiRuntime();
        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            local dialog = assert(${luaExpression}, 'File dialog could not be created')
            runtime.next_file_dialog_handle = runtime.next_file_dialog_handle + 1
            runtime.file_dialogs[runtime.next_file_dialog_handle] = dialog
            return runtime.next_file_dialog_handle
        `);
        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] File dialog creation returned an invalid handle.');
        }
        this.handle = handle;
    }

    /** Returns null until a selection is accepted, or after cancellation. */
    getResult(): string | null {
        const result = this.call(`
            if not _G.__quickjs_yue.file_dialog_accepted[${this.handle}] then return nil end
            return dialog:getresult()
        `);
        if (result !== null && typeof result !== 'string') throw new Error('[Yue] Invalid file dialog result.');
        return result;
    }

    /** Shows the dialog and blocks until it is accepted or cancelled. */
    run(): boolean {
        return this.execute('dialog:run()');
    }

    /** Shows the dialog as a modal child of `window` and blocks until it closes. */
    runForWindow(window: Window): boolean {
        if (window.getRuntime() !== this.yue) throw new Error('[Yue] File dialog and window belong to different runtimes.');
        return this.execute(`dialog:runforwindow(assert(_G.__quickjs_yue.windows[${window.handle}], 'Window is no longer available'))`);
    }

    setTitle(title: string): void {
        this.call(`dialog:settitle(${FileDialog.text(title)})`);
    }

    setButtonLabel(label: string): void {
        this.call(`dialog:setbuttonlabel(${FileDialog.text(label)})`);
    }

    setFilename(filename: string): void {
        this.call(`dialog:setfilename(${FileDialog.text(filename)})`);
    }

    setFolder(folder: string): void {
        this.call(`dialog:setfolder(${FileDialog.text(folder)})`);
    }

    /** Options can be added but not removed from an existing dialog. */
    setOptions(options: number): void {
        if (!Number.isInteger(options) || options < 0 || options > 7) {
            throw new RangeError('Invalid file dialog options.');
        }
        if ((options & this.options) !== this.options) {
            throw new Error('File dialog options cannot be removed; create a new dialog instead.');
        }
        if (this.kind === 'save' && (options & (FileDialog.optionPickFolders | FileDialog.optionMultiSelect)) !== 0) {
            throw new Error('Folder selection and multiple selection are only supported by open dialogs.');
        }
        this.call(`dialog:setoptions(${options})`);
        this.options = options;
    }

    /** Filters can be set once per dialog; extensions omit the leading dot. */
    setFilters(filters: FileDialogFilter[]): void {
        if (!Array.isArray(filters)) throw new TypeError('File dialog filters must be an array.');
        if (this.filtersSet) throw new Error('File dialog filters can only be set once.');
        const entries = filters.map((filter) => {
            if (!filter || typeof filter !== 'object' || !Array.isArray(filter.extensions) || filter.extensions.length === 0) {
                throw new TypeError('Each file dialog filter must contain a description and extensions.');
            }
            const description = FileDialog.text(filter.description);
            const extensions = filter.extensions.map((extension) => {
                if (typeof extension !== 'string' || extension === '' || extension.startsWith('.') ||
                    extension.includes('/') || extension.includes('\\')) {
                    throw new RangeError('File extensions must be non-empty and omit the leading dot.');
                }
                return FileDialog.text(extension);
            });
            return `{ description = ${description}, extensions = { ${extensions.join(', ')} } }`;
        });
        this.call(`dialog:setfilters({ ${entries.join(', ')} })`);
        this.filtersSet = true;
    }

    dispose(): void {
        this.yue.eval(`
            local runtime = _G.__quickjs_yue
            runtime.file_dialog_accepted[${this.handle}] = nil
            runtime.file_dialog_results[${this.handle}] = nil
            runtime.file_dialogs[${this.handle}] = nil
        `);
    }

    call(statement: string): string | number | boolean | null {
        return this.yue.eval(`
            local dialog = assert(_G.__quickjs_yue.file_dialogs[${this.handle}], 'File dialog is no longer available')
            ${statement}
        `);
    }

    private execute(expression: string): boolean {
        const accepted = this.call(`
            local runtime = _G.__quickjs_yue
            runtime.file_dialog_accepted[${this.handle}] = nil
            local accepted = ${expression}
            assert(type(accepted) == 'boolean', 'Invalid file dialog response')
            runtime.file_dialog_accepted[${this.handle}] = accepted
            return accepted
        `);
        if (typeof accepted !== 'boolean') throw new Error('[Yue] Invalid file dialog response.');
        return accepted;
    }

    private static text(value: string): string {
        if (typeof value !== 'string' || value.includes('\0')) {
            throw new RangeError('File dialog text must be a string without NUL.');
        }
        return Yue.toLuaStringLiteral(value);
    }
}

export class FileOpenDialog {
    readonly fileDialog: FileDialog;

    constructor(yue: Yue = Yue.default) {
        this.fileDialog = new FileDialog('_G.__quickjs_yue.gui.FileOpenDialog.create()', yue, 'open');
    }

    static create(yue: Yue = Yue.default): FileOpenDialog {
        return new FileOpenDialog(yue);
    }

    /** Returns an empty array until a selection is accepted, or after cancellation. */
    getResults(): string[] {
        const handle = this.fileDialog.handle;
        const count = this.fileDialog.call(`
            if not _G.__quickjs_yue.file_dialog_accepted[${handle}] then return 0 end
            local results = dialog:getresults()
            _G.__quickjs_yue.file_dialog_results[${handle}] = results
            return #results
        `);
        try {
            if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
                throw new Error('[Yue] Invalid file dialog result count.');
            }
            const results: string[] = [];
            for (let index = 1; index <= count; index++) {
                const result = this.fileDialog.call(`
                    return (assert(_G.__quickjs_yue.file_dialog_results[${handle}][${index}], 'File dialog result is missing'))
                `);
                if (typeof result !== 'string') throw new Error('[Yue] Invalid file dialog result.');
                results.push(result);
            }
            return results;
        } finally {
            this.fileDialog.call(`_G.__quickjs_yue.file_dialog_results[${handle}] = nil`);
        }
    }

    dispose(): void {
        this.fileDialog.dispose();
    }
}

export class FileSaveDialog {
    readonly fileDialog: FileDialog;

    constructor(yue: Yue = Yue.default) {
        this.fileDialog = new FileDialog('_G.__quickjs_yue.gui.FileSaveDialog.create()', yue, 'save');
    }

    static create(yue: Yue = Yue.default): FileSaveDialog {
        return new FileSaveDialog(yue);
    }

    dispose(): void {
        this.fileDialog.dispose();
    }
}
