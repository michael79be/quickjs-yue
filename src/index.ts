import { Yue } from './yue';

export * from './yue';
export * from './app';
export * from './attributedtext';
export * from './view/button';
export * from './canvas';
export * from './clipboard';
export * from './view/combobox';
export * from './view/container';
export * from './cursor';
export * from './view/datepicker';
export * from './view/entry';
export * from './filedialog';
export * from './font';
export * from './view/group';
export * from './image';
export * from './view/label';
export * from './menu';
export * from './messagebox';
export * from './notification';
export * from './notificationcenter';
export * from './painter';
export * from './view/picker';
export * from './view/progressbar';
export * from './responder';
export * from './view/scroll';
export * from './view/separator';
export * from './view/slider';
export * from './view/tab';
export * from './tray';
export * from './view/view';
export * from './window';

export class MessageLoop {
    /** Repeats while the message loop runs. Returns a function that cancels the timer. */
    static setTimer(interval: number, callback: () => void, yue: Yue = Yue.default): () => void {
        return yue.getEventBridge().setTimer(interval, callback);
    }

    static run(yue: Yue = Yue.default): void {
        yue.runMessageLoop();
    }

    static quit(yue: Yue = Yue.default): void {
        yue.quitMessageLoop();
    }
}
