import { MessageLoop, Window } from '../index';

const win = new Window();
win.setTitle('quickjs-yue');
win.setContentSize(480, 320);
win.center();
win.activate();

MessageLoop.run();
