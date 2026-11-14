import * as os from 'os';
import { Button, Container, Font, Label, MessageLoop, Window, Yue } from '../index';

type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
type Operator = '+' | '−' | '×' | '÷';
type CalculatorKey = Digit | Operator | 'AC' | '.' | '±' | '%' | '=' | 'Backspace';

class Calculator {
    entry = '0';
    private value = 0;
    private accumulator = 0;
    operator: Operator | null = null;
    waiting = false;
    private lastOperator: Operator | null = null;
    private lastOperand = 0;
    private error = false;

    press(key: CalculatorKey): void {
        if (key === 'AC') {
            this.clear();
        } else if (Calculator.isDigit(key)) {
            this.digit(key);
        } else if (key === '.') {
            this.decimal();
        } else if (key === '±') {
            this.negate();
        } else if (key === '%') {
            this.percent();
        } else if (key === 'Backspace') {
            this.backspace();
        } else if (Calculator.isOperator(key)) {
            this.chooseOperator(key);
        } else if (key === '=') {
            this.equals();
        }
    }

    private clear(): void {
        this.entry = '0';
        this.value = 0;
        this.accumulator = 0;
        this.operator = null;
        this.waiting = false;
        this.lastOperator = null;
        this.lastOperand = 0;
        this.error = false;
    }

    private digit(digit: Digit): void {
        if (this.error) this.clear();
        if (this.waiting) {
            this.entry = '0';
            this.waiting = false;
            if (!this.operator) this.lastOperator = null;
        }
        if (this.entry.includes('e')) this.entry = '0';
        if (this.entry.replace(/\D/g, '').length >= 9 && this.entry !== '0') return;
        this.entry = this.entry === '0' ? digit : this.entry === '-0' ? `-${digit}` : this.entry + digit;
        this.value = Number(this.entry);
    }

    private decimal(): void {
        if (this.error) this.clear();
        if (this.waiting) {
            this.entry = '0';
            this.value = 0;
            this.waiting = false;
            if (!this.operator) this.lastOperator = null;
        }
        if (this.entry.includes('e')) {
            this.entry = '0';
            this.value = 0;
        }
        if (!this.entry.includes('.')) this.entry += '.';
    }

    private negate(): void {
        if (this.error) return;
        if (this.waiting && this.operator) {
            this.entry = '-0';
            this.value = 0;
        } else {
            this.entry = this.entry.startsWith('-') ? this.entry.slice(1) : `-${this.entry}`;
            this.value = -this.value;
        }
        this.waiting = false;
        if (!this.operator) this.lastOperator = null;
    }

    private percent(): void {
        if (this.error) return;
        const relative = this.operator === '+' || this.operator === '−';
        const value = relative ? this.accumulator * this.value / 100 : this.value / 100;
        if (this.showResult(value)) {
            this.waiting = false;
            if (!this.operator) this.lastOperator = null;
        }
    }

    private backspace(): void {
        if (this.error || this.waiting || this.entry.includes('e')) return;
        this.entry = this.entry.slice(0, -1);
        if (this.entry === '' || this.entry === '-') this.entry = '0';
        this.value = Number(this.entry);
    }

    private chooseOperator(operator: Operator): void {
        if (this.error) return;
        if (this.operator && !this.waiting) {
            if (!this.showResult(this.calculate(this.accumulator, this.value, this.operator))) return;
        }
        this.accumulator = this.value;
        this.operator = operator;
        this.waiting = true;
        this.lastOperator = null;
    }

    private equals(): void {
        if (this.error) return;
        if (this.operator) {
            const operand = this.waiting ? this.accumulator : this.value;
            const operator = this.operator;
            if (!this.showResult(this.calculate(this.accumulator, operand, operator))) return;
            this.lastOperator = operator;
            this.lastOperand = operand;
            this.operator = null;
        } else if (this.lastOperator) {
            if (!this.showResult(this.calculate(this.value, this.lastOperand, this.lastOperator))) return;
        }
        this.waiting = true;
    }

    private calculate(left: number, right: number, operator: Operator): number {
        switch (operator) {
            case '+': return left + right;
            case '−': return left - right;
            case '×': return left * right;
            case '÷': return left / right;
        }
        throw new Error('Invalid calculator operator.');
    }

    private showResult(value: number): boolean {
        if (!Number.isFinite(value)) {
            this.entry = 'Error';
            this.error = true;
            this.operator = null;
            this.lastOperator = null;
            return false;
        }
        this.value = Number(value.toPrecision(12));
        const displayValue = Number(this.value.toPrecision(9));
        this.entry = String(displayValue);
        if (this.entry.length > 11) this.entry = displayValue.toExponential(5).replace(/\.?0+e/, 'e');
        return true;
    }

    static isDigit(key: string): key is Digit {
        return /^\d$/.test(key);
    }

    static isOperator(key: string): key is Operator {
        return key === '+' || key === '−' || key === '×' || key === '÷';
    }
}

class CalculatorApp {
    private readonly yue = Yue.default;
    private readonly isMac = os.platform === 'darwin';
    private readonly calculator = new Calculator();
    private readonly win: Window;
    private readonly border: Container | null;
    private readonly background: Container;
    private readonly titlebar: Container;
    private readonly baseFont: Font;
    private readonly displayFont: Font;
    private readonly smallDisplayFont: Font;
    private readonly buttonFont: Font;
    private readonly display: Label;
    private readonly rows: Container[] = [];
    private readonly cells: Container[] = [];
    private readonly buttons: Button[] = [];
    private readonly operatorButtons: Array<{ key: Operator; cell: Container; button: Button }> = [];

    constructor() {
        this.win = this.isMac
            ? new Window(this.yue, { frame: false, transparent: true, showTrafficLights: true })
            : new Window(this.yue);
        if (!this.isMac) this.win.setTitle('Calculator');
        this.win.setContentSize(320, 520);

        this.border = this.isMac ? new Container(this.yue) : null;
        if (this.border) {
            this.border.view.setBackgroundColor('#5b5b5f');
            this.border.view.setMouseDownCanMoveWindow(true);
            this.border.view.setStyle({ padding: 1 });
        }

        this.background = new Container(this.yue);
        this.background.view.setBackgroundColor('#202124');
        if (this.isMac) this.background.view.setMouseDownCanMoveWindow(true);
        this.background.view.setStyle({ flexGrow: 1, flexDirection: 'column', alignItems: 'stretch', padding: 16 });

        this.titlebar = new Container(this.yue);
        this.titlebar.view.setStyle({ height: 28 });
        if (this.isMac) this.titlebar.view.setMouseDownCanMoveWindow(true);
        this.background.addChildView(this.titlebar.view);

        this.baseFont = Font.default(this.yue);
        this.displayFont = this.baseFont.derive(44, 'light', 'normal');
        this.smallDisplayFont = this.baseFont.derive(29, 'light', 'normal');
        this.buttonFont = this.baseFont.derive(14, 'normal', 'normal');
        this.display = new Label('0', this.yue);
        this.display.setAlign('end');
        this.display.setVAlign('end');
        this.display.view.setFont(this.displayFont);
        this.display.view.setColor('#f6f6f7');
        this.display.view.setStyle({ flexGrow: 1, marginBottom: 14 });
        if (this.isMac) this.display.view.setMouseDownCanMoveWindow(true);
        this.background.addChildView(this.display.view);

        this.createButtons();
        if (this.border) {
            this.border.addChildView(this.background.view);
            this.win.setContentView(this.border.view);
        } else {
            this.win.setContentView(this.background.view);
        }
        this.win.responder.on('keyDown', (event) => this.handleKey(event.key, event.modifiers));
    }

    run(): void {
        this.win.center();
        this.win.activate();
        try {
            MessageLoop.run(this.yue);
        } finally {
            for (const button of this.buttons) button.dispose();
            for (const cell of this.cells) cell.dispose();
            for (const row of this.rows) row.dispose();
            this.display.dispose();
            this.titlebar.dispose();
            this.background.dispose();
            if (this.border) this.border.dispose();
            this.buttonFont.dispose();
            this.smallDisplayFont.dispose();
            this.displayFont.dispose();
            this.baseFont.dispose();
            this.yue.destroy();
        }
    }

    private createButtons(): void {
        const keys: CalculatorKey[][] = [
            ['AC', '±', '%', '÷'],
            ['7', '8', '9', '×'],
            ['4', '5', '6', '−'],
            ['1', '2', '3', '+'],
            ['0', '.', '='],
        ];
        for (let rowIndex = 0; rowIndex < keys.length; rowIndex++) {
            const row = new Container(this.yue);
            row.view.setStyle({
                height: 65, flexDirection: 'row', justifyContent: 'space-between',
                marginBottom: rowIndex === 4 ? 0 : 8,
            });
            this.background.addChildView(row.view);
            this.rows.push(row);
            for (const key of keys[rowIndex]) {
                const operator = Calculator.isOperator(key) || key === '=';
                const utility = ['AC', '±', '%'].includes(key);
                const button = new Button(key, this.yue);
                button.view.setFont(this.buttonFont);
                button.view.setStyle({ flexGrow: 1 });
                if (this.isMac) {
                    const cell = new Container(this.yue);
                    cell.view.setStyle({ width: key === '0' ? 138 : 65, height: 65, alignItems: 'stretch' });
                    cell.view.setMouseDownCanMoveWindow(false);
                    cell.view.setBackgroundColor(operator ? '#ff9f0a' : utility ? '#a5a5a8' : '#505154');
                    button.setHasBorder(false);
                    button.view.setColor(utility ? '#202124' : '#ffffff');
                    cell.addChildView(button.view);
                    row.addChildView(cell.view);
                    this.cells.push(cell);
                    if (Calculator.isOperator(key)) this.operatorButtons.push({ key, cell, button });
                } else {
                    button.view.setStyle({ width: key === '0' ? 138 : 65, height: 65 });
                    row.addChildView(button.view);
                }
                button.on('click', () => this.press(key));
                this.buttons.push(button);
            }
        }
    }

    private press(key: CalculatorKey): void {
        this.calculator.press(key);
        this.display.setText(this.calculator.entry);
        this.display.view.setFont(this.calculator.entry.length > 10 ? this.smallDisplayFont : this.displayFont);
        if (this.isMac) {
            for (const item of this.operatorButtons) {
                const selected = this.calculator.operator === item.key && this.calculator.waiting;
                item.cell.view.setBackgroundColor(selected ? '#f5f5f5' : '#ff9f0a');
                item.button.view.setColor(selected ? '#ee8d00' : '#ffffff');
            }
        }
    }

    private handleKey(input: string, modifiers: number): void {
        const key = input.toLowerCase();
        // Yue reports unshifted key codes, not the characters typed on macOS.
        const macShift = this.isMac && (modifiers & (1 << 17)) !== 0;
        if (macShift && key === '=') this.press('+');
        else if (macShift && key === ']') this.press('×');
        else if (macShift && key === "'") this.press('%');
        else if (Calculator.isDigit(key)) this.press(key);
        else if (key === '.' || key === ',' || key === 'decimal') this.press('.');
        else if (key === '+' || key === 'add' || key === 'plus') this.press('+');
        else if (key === '-' || key === 'subtract' || key === 'minus') this.press('−');
        else if (key === '*' || key === 'multiply') this.press('×');
        else if (key === '/' || key === 'divide') this.press('÷');
        else if (key === '=' || key === 'enter' || key === 'return') this.press('=');
        else if (key === 'escape' || key === 'esc') this.press('AC');
        else if (key === 'backspace') this.press('Backspace');
        else if (key === '%') this.press('%');
    }
}

new CalculatorApp().run();
