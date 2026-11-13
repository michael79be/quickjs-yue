# quickjs-yue

Yue bindings for Lua running on QuickJS Native through
[quickjs-lua](https://github.com/michael79be/quickjs-lua).

## Installation

```sh
npm install
```

During installation and build, the project downloads the prebuilt Yue 0.15.6
archives for every supported operating system and architecture. The native module is
compiled for Lua 5.4, matching the runtime provided by `quickjs-lua`. Windows
archives also include `WebView2Loader.dll`.

All operating systems and architectures supported by QuickJS Native are
supported: macOS arm64/x64, Linux x86/x64, and Windows x86/x64.

## Create a window

```ts
import { MessageLoop, Window } from 'quickjs-yue';

const win = new Window();
win.setTitle('quickjs-yue');
win.setContentSize(480, 320);
win.center();
win.activate();

MessageLoop.run();
```

Each `Window` stores its native Yue object in the persistent Lua state and
exposes only a numeric `handle` to TypeScript. Calls such as `win.center()`
evaluate against the Lua window table; Lua objects and native pointers never
cross into TypeScript. Closing the last window quits the message loop.

The Yue module search path can be customized by passing a `Yue` runtime to
`Window` and `MessageLoop`:

```ts
import { MessageLoop, Window, Yue } from 'quickjs-yue';

const runtime = new Yue({
    yueModulePaths: '/path/to/release/macos/arm64/?.so'
});
const win = new Window(runtime);
win.center();
MessageLoop.run(runtime);
```
