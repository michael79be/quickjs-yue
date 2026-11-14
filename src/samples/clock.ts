import * as os from 'os';
import { Container, Font, Label, MessageLoop, Window, Yue } from '../index';

const yue = Yue.default;
const isMac = os.platform === 'darwin';
const win = isMac
    ? new Window(yue, { frame: false, transparent: true, showTrafficLights: true })
    : new Window(yue);
if (!isMac) win.setTitle('Clock');
win.setContentSize(360, 190);

const border = isMac ? new Container(yue) : null;
if (border) {
    border.view.setBackgroundColor('#8a7b9abb');
    border.view.setMouseDownCanMoveWindow(true);
    border.view.setStyle({ padding: 1 });
}

const background = new Container(yue);
background.view.setBackgroundColor(isMac ? '#ca101827' : '#101827');
if (isMac) background.view.setMouseDownCanMoveWindow(true);
background.view.setStyle({
    flexGrow: 1,
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'center',
    padding: 20,
});

const baseFont = Font.default(yue);
const clockFont = baseFont.derive(43, 'medium', 'normal');
const time = new Label('', yue);

time.view.setFont(clockFont);
time.view.setColor('#f4f8ff');
if (isMac) time.view.setMouseDownCanMoveWindow(true);
time.view.setStyle({ height: 75 });
background.addChildView(time.view);
if (border) {
    border.addChildView(background.view);
    win.setContentView(border.view);
} else {
    win.setContentView(background.view);
}

function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const currentTime = `${hours}:${minutes}:${seconds}`;
    if (time.getText() !== currentTime) time.setText(currentTime);
}

updateClock();
const stopTimer = MessageLoop.setTimer(200, updateClock, yue);
win.center();
win.activate();

try {
    MessageLoop.run(yue);
} finally {
    stopTimer();
    time.dispose();
    background.dispose();
    if (border) border.dispose();
    clockFont.dispose();
    baseFont.dispose();
    yue.destroy();
}
