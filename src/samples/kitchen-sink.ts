import * as os from 'os';
import {
    App, AttributedText, Button, Canvas, Clipboard, ComboBox, Container, Cursor,
    DatePicker, Entry, FileOpenDialog, FileSaveDialog, Font, Group, Image, Label,
    Menu, MenuBar, MenuItem, MessageBox, MessageLoop, Notification, NotificationCenter, Picker,
    ProgressBar, Scroll, Separator, Slider, Tab, Tray, Window, Yue,
} from '../index';
import type { View } from '../index';

class KitchenSink {
    private readonly yue = Yue.default;
    private readonly resources: Array<{ dispose(): void }> = [];
    private readonly window = new Window(this.yue);
    private readonly root = this.own(new Container(this.yue));
    private readonly tabs = this.own(new Tab(this.yue));
    private readonly status = this.own(new Label('Ready', this.yue));
    private readonly clipboard = Clipboard.get(this.yue);
    private image: Image | null = null;
    private tray: Tray | null = null;
    private trayMenu: Menu | null = null;
    private stopTimer: (() => void) | null = null;

    run(): void {
        try {
            this.build();
            this.window.center();
            this.window.activate();
            MessageLoop.run(this.yue);
        } finally {
            if (this.stopTimer) this.stopTimer();
            if (this.tray) this.tray.remove();
            if (this.trayMenu) this.trayMenu.dispose();
            this.window.responder.dispose();
            for (let index = this.resources.length - 1; index >= 0; index--) {
                this.resources[index].dispose();
            }
            this.yue.destroy();
        }
    }

    private build(): void {
        App.setName('Yue Kitchen Sink', this.yue);
        if (os.platform !== 'darwin') App.setID('org.quickjs-yue.kitchensink', this.yue);
        this.window.setTitle('Yue Kitchen Sink');
        this.window.setContentSize(760, 680);
        this.root.view.setStyle({ flexDirection: 'column', alignItems: 'stretch', padding: 16 });
        this.tabs.view.setStyle({ flexGrow: 1 });
        this.root.addChildView(this.tabs.view);
        this.status.view.setStyle({ height: 28, marginTop: 8 });
        this.root.addChildView(this.status.view);
        this.window.setContentView(this.root.view);

        this.controlsPage();
        this.dialogsPage();
        this.graphicsPage();
        this.systemPage();
        this.installMenu();
        this.window.responder.on('mouseDown', (event) => {
            this.status.setText(`Mouse button: ${event.button}`);
        });
    }

    private controlsPage(): void {
        const page = this.page('Controls');
        const group = this.own(new Group('Input controls', this.yue));
        group.view.setStyle({ height: 330, marginBottom: 12 });
        page.addChildView(group.view);
        const content = this.own(new Container(this.yue));
        content.view.setStyle({ flexDirection: 'column', alignItems: 'stretch', padding: 10 });
        group.setContentView(content);

        const entry = this.own(new Entry('normal', this.yue));
        entry.setText('Edit this text');
        entry.on('textChange', () => this.status.setText(`Entry: ${entry.getText()}`));
        entry.on('activate', () => this.status.setText(`Entered: ${entry.getText()}`));
        this.field(content, 'Entry', entry.view);

        const password = this.own(new Entry('password', this.yue));
        this.field(content, 'Password', password.view);

        const combo = this.own(new ComboBox(this.yue));
        for (const item of ['One', 'Two', 'Three']) combo.addItem(item);
        combo.selectItemAt(0);
        combo.on('textChange', () => this.status.setText(`ComboBox: ${combo.getText()}`));
        combo.on('selectionChange', () => this.status.setText(`ComboBox: ${combo.getText()}`));
        this.field(content, 'ComboBox', combo.view);

        const picker = this.own(new Picker(this.yue));
        for (const item of ['Red', 'Green', 'Blue']) picker.addItem(item);
        picker.on('selectionChange', () => this.status.setText(`Picker: ${picker.getSelectedItem()}`));
        this.field(content, 'Picker', picker.view);

        const date = this.own(new DatePicker({ elements: DatePicker.elementYearMonthDay }, this.yue));
        date.on('dateChange', () => this.status.setText(`Date: ${new Date(date.getDate() * 1000).toDateString()}`));
        this.field(content, 'DatePicker', date.view);

        const checkbox = this.own(new Button({ title: 'Checkbox', type: 'checkbox' }, this.yue));
        checkbox.on('click', () => this.status.setText(`Checkbox: ${checkbox.isChecked() ? 'checked' : 'unchecked'}`));
        this.field(content, 'Button', checkbox.view);

        const separator = this.own(new Separator('horizontal', this.yue));
        separator.view.setStyle({ height: 2, marginBottom: 12 });
        page.addChildView(separator.view);

        const progress = this.own(new ProgressBar(this.yue));
        progress.setValue(40);
        const slider = this.own(new Slider(this.yue));
        slider.setRange(0, 100);
        slider.setValue(40);
        slider.on('valueChange', () => {
            const value = Math.max(0, Math.min(100, Math.round(slider.getValue())));
            progress.setValue(value);
            this.status.setText(`Slider: ${value}%`);
        });
        this.field(page, 'Slider', slider.view);
        this.field(page, 'ProgressBar', progress.view);
    }

    private dialogsPage(): void {
        const page = this.page('Dialogs');
        this.text(page, 'Dialogs are opened only when you click a button.');
        this.button(page, 'Open a file', () => this.openFile());
        this.button(page, 'Choose a save path', () => {
            const dialog = new FileSaveDialog(this.yue);
            try {
                dialog.fileDialog.setTitle('Choose a save path');
                dialog.fileDialog.setFilename('example.txt');
                const accepted = dialog.fileDialog.runForWindow(this.window);
                this.status.setText(accepted ? `Save path: ${dialog.fileDialog.getResult()}` : 'Save cancelled');
            } finally {
                dialog.dispose();
            }
        });
        this.button(page, 'Show a message box', () => {
            const box = new MessageBox(this.yue);
            box.setType('information');
            box.setText('Hello from Yue');
            box.setInformativeText('This is a native message box.');
            box.addButton('OK', 1);
            box.setDefaultResponse(1);
            this.status.setText(`MessageBox response: ${box.runForWindow(this.window)}`);
        });
        this.text(page, 'Choosing a save path does not create or modify a file.');
    }

    private graphicsPage(): void {
        const page = this.page('Graphics');
        const font = this.own(Font.default(this.yue));
        const headingFont = this.own(font.derive(20, 'medium', 'normal'));
        const styled = this.own(AttributedText.create('AttributedText and Font', {
            font: headingFont, color: '#3478d4',
        }, this.yue));
        const label = this.own(new Label(styled, this.yue));
        label.view.setStyle({ height: 36, marginBottom: 8 });
        page.addChildView(label.view);

        const cursor = this.own(Cursor.createWithType('crosshair', this.yue));
        const preview = this.own(new Button('Choose an image to preview', this.yue));
        preview.view.setCursor(cursor);
        preview.view.setStyle({ height: 72, marginBottom: 8 });
        preview.on('click', () => this.perform(() => {
            const dialog = new FileOpenDialog(this.yue);
            try {
                dialog.fileDialog.setTitle('Choose an image');
                dialog.fileDialog.setFilters([{ description: 'Images', extensions: ['png', 'jpg', 'jpeg'] }]);
                if (!dialog.fileDialog.runForWindow(this.window)) {
                    this.status.setText('Image selection cancelled');
                    return;
                }
                const path = dialog.fileDialog.getResult();
                if (path === null || path === '') throw new Error('No image path returned.');
                const image = this.own(Image.createFromPath(path, this.yue));
                if (image.isEmpty()) throw new Error('The selected image could not be decoded.');
                preview.setImage(image);
                this.image = image;
                const size = image.getSize();
                this.status.setText(`Image: ${size.width} × ${size.height}`);
            } finally {
                dialog.dispose();
            }
        }));
        page.addChildView(preview.view);
        this.text(page, 'The image button also demonstrates a custom cursor.');
        this.button(page, 'Draw on an offscreen Canvas', () => {
            const canvas = Canvas.create({ width: 240, height: 100 }, 1, this.yue);
            try {
                const painter = canvas.getPainter();
                painter.setFillColor('#3478d4');
                painter.fillRect({ x: 0, y: 0, width: 240, height: 100 });
                painter.drawAttributedText(styled, { x: 12, y: 20, width: 216, height: 60 });
                if (this.image) painter.drawImage(this.image, { x: 195, y: 55, width: 32, height: 32 });
                this.status.setText('Canvas and Painter: offscreen drawing completed');
            } finally {
                canvas.dispose();
            }
        });
        this.text(page, 'Canvas is offscreen: this binding does not expose a drawable view.');
    }

    private systemPage(): void {
        const page = this.page('System');
        this.text(page, 'Clipboard actions use the text entered below.');
        const entry = this.own(new Entry('normal', this.yue));
        entry.setText('Hello from Yue');
        this.field(page, 'Clipboard', entry.view);
        this.button(page, 'Copy text', () => {
            this.clipboard.setText(entry.getText());
            this.status.setText('Text copied to clipboard');
        });
        this.button(page, 'Read clipboard', () => {
            entry.setText(this.clipboard.getText());
            this.status.setText('Clipboard text read');
        });
        this.button(page, 'Toggle tray item', () => this.toggleTray());
        this.button(page, 'Send notification', () => {
            if (os.platform === 'darwin') {
                this.status.setText('macOS notifications require a bundled application');
                return;
            }
            const notification = this.own(new Notification(this.yue));
            notification.setTitle('Yue Kitchen Sink');
            notification.setBody('This is a native notification.');
            notification.show();
            this.status.setText('Notification requested');
        });
        this.button(page, 'Clear this app’s notifications', () => {
            if (os.platform === 'darwin') {
                this.status.setText('macOS notifications require a bundled application');
                return;
            }
            NotificationCenter.clear(this.yue);
            this.status.setText('Application notifications cleared');
        });

        const clock = this.own(new Label('', this.yue));
        clock.view.setStyle({ height: 28 });
        page.addChildView(clock.view);
        clock.setText(`Timer: ${new Date().toTimeString().slice(0, 8)}`);
        this.stopTimer = MessageLoop.setTimer(1000, () => {
            clock.setText(`Timer: ${new Date().toTimeString().slice(0, 8)}`);
        }, this.yue);

        const scroll = this.own(new Scroll(this.yue));
        scroll.view.setStyle({ height: 130, marginTop: 8 });
        const content = this.own(new Container(this.yue));
        content.view.setStyle({ flexDirection: 'column', alignItems: 'stretch', padding: 8 });
        for (let index = 1; index <= 12; index++) this.text(content, `Scroll content ${index}`);
        scroll.setContentView(content.view);
        scroll.setContentSize({ width: 600, height: 384 });
        page.addChildView(scroll.view);
    }

    private installMenu(): void {
        const open = this.own(new MenuItem({ label: 'Open…' }, this.yue));
        open.on('click', () => this.perform(() => this.openFile()));
        const menu = this.own(new Menu([open], this.yue));
        const root = this.own(new MenuItem({ label: 'File', submenu: menu }, this.yue));
        const bar = this.own(new MenuBar([root], this.yue));
        if (os.platform === 'darwin') App.setApplicationMenu(bar, this.yue);
        else this.window.setMenuBar(bar);
    }

    private openFile(): void {
        const dialog = new FileOpenDialog(this.yue);
        try {
            dialog.fileDialog.setTitle('Choose a file');
            const accepted = dialog.fileDialog.runForWindow(this.window);
            this.status.setText(accepted ? `File: ${dialog.fileDialog.getResult()}` : 'Open cancelled');
        } finally {
            dialog.dispose();
        }
    }

    private toggleTray(): void {
        if (this.tray) {
            this.tray.remove();
            this.tray = null;
            this.status.setText('Tray item removed');
            return;
        }
        let tray: Tray;
        if (os.platform === 'darwin') {
            tray = Tray.createWithTitle('Yue', this.yue);
        } else {
            if (!this.image) {
                this.status.setText('Choose an image in Graphics before creating a tray item');
                return;
            }
            tray = Tray.createWithImage(this.image, this.yue);
        }
        this.tray = tray;
        try {
            if (!this.trayMenu) {
                const item = this.own(new MenuItem({ label: 'Hello from the tray' }, this.yue));
                item.on('click', () => this.status.setText('Tray menu clicked'));
                this.trayMenu = new Menu([item], this.yue);
            }
            tray.setMenu(this.trayMenu);
        } catch (error) {
            tray.remove();
            this.tray = null;
            throw error;
        }
        this.status.setText('Tray item created');
    }

    private page(title: string): Container {
        const page = this.own(new Container(this.yue));
        page.view.setStyle({ flexDirection: 'column', alignItems: 'stretch', padding: 16 });
        this.tabs.addPage(title, page.view);
        return page;
    }

    private field(parent: Container, title: string, view: View): void {
        const row = this.own(new Container(this.yue));
        row.view.setStyle({ height: 38, flexDirection: 'row', alignItems: 'center', marginBottom: 4 });
        const label = this.own(new Label(title, this.yue));
        label.view.setStyle({ width: 120 });
        view.setStyle({ flexGrow: 1 });
        row.addChildView(label.view);
        row.addChildView(view);
        parent.addChildView(row.view);
    }

    private text(parent: Container, text: string): void {
        const label = this.own(new Label(text, this.yue));
        label.view.setStyle({ height: 28 });
        parent.addChildView(label.view);
    }

    private button(parent: Container, title: string, action: () => void): void {
        const button = this.own(new Button(title, this.yue));
        button.view.setStyle({ height: 34, marginBottom: 8 });
        button.on('click', () => this.perform(action));
        parent.addChildView(button.view);
    }

    private perform(action: () => void): void {
        try {
            action();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.status.setText(`Error: ${message}`);
            console.error(error);
        }
    }

    private own<T extends { dispose(): void }>(resource: T): T {
        this.resources.push(resource);
        return resource;
    }
}

new KitchenSink().run();
