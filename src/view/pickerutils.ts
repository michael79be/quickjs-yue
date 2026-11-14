import { Yue } from '../yue';

type PickerKind = 'combo' | 'picker';
type PickerCall = (statement: string) => string | number | boolean | null;

function name(kind: PickerKind): string {
    return kind === 'combo' ? 'ComboBox' : 'Picker';
}

export function pickerText(text: string, kind: PickerKind): string {
    if (text.includes('\0')) throw new RangeError(`${name(kind)} text cannot contain NUL.`);
    return Yue.toLuaStringLiteral(text);
}

export function pickerItems(call: PickerCall, kind: PickerKind): string[] {
    const items = call(`
        local items = ${kind}:getitems()
        local encoded = {}
        for i, item in ipairs(items) do
            encoded[i] = (item:gsub('.', function(char)
                return string.format('%02x', string.byte(char))
            end)) .. '\\n'
        end
        return table.concat(encoded)
    `);
    if (typeof items !== 'string') throw new Error(`[Yue] Invalid ${name(kind)} text.`);
    if (items === '') return [];
    if (!items.endsWith('\n')) throw new Error(`[Yue] Invalid ${name(kind)} items.`);
    return items.slice(0, -1).split('\n').map((item) => {
        if (!/^(?:[0-9a-f]{2})*$/i.test(item)) throw new Error(`[Yue] Invalid ${name(kind)} item.`);
        return decodeURIComponent(item.replace(/(..)/g, '%$1'));
    });
}

export function pickerIndexedCall(
    call: PickerCall, kind: PickerKind, method: 'removeitemat' | 'selectitemat', index: number,
): void {
    if (!Number.isSafeInteger(index) || index < 0 || index >= 2147483647) {
        throw new RangeError(`${name(kind)} index must be a non-negative integer.`);
    }
    call(`
        assert(${index} < #${kind}:getitems(), '${name(kind)} index is out of range')
        ${kind}:${method}(${index + 1})
    `);
}

export function pickerSelectedIndex(call: PickerCall, kind: PickerKind): number {
    const index = call(`return ${kind}:getselecteditemindex()`);
    if (typeof index !== 'number' || !Number.isSafeInteger(index) || (index !== -1 && index < 1)) {
        throw new Error(`[Yue] Invalid ${name(kind)} selection index.`);
    }
    return index === -1 ? -1 : index - 1;
}
