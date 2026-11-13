# quickjs-yue

Experimental Lua bindings for Yue, running on QuickJS Native through
[quickjs-lua](https://github.com/michael79be/quickjs-lua). The first example
creates a native window using `yue.gui`.

## Installation

```sh
npm install
```

During installation and build, the project downloads the prebuilt Yue 0.15.6
archive for the current operating system and architecture. The native module is
compiled for Lua 5.4, matching the runtime provided by `quickjs-lua`. Windows
archives also include `WebView2Loader.dll`.

All operating systems and architectures supported by QuickJS Native are
supported: macOS arm64/x64, Linux x86/x64, and Windows x86/x64. To download
every variant for cross-platform bundling, run:

```sh
npm run download:native -- --all
```

The QuickJS Native target names are also accepted, for example
`node postbuild.mjs linux-32`, `node postbuild.mjs windows-32`,
`node postbuild.mjs macos-intel`, or `node postbuild.mjs macos-universal`.
The modules are stored separately by operating system and architecture.

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

The downloaded native module is installed under a platform-specific directory:
`release/macos/arm64/yue/gui.so`, `release/linux/x64/yue/gui.so`, or
`release/windows/x64/yue/gui.dll`.

By default, module lookup checks the current platform's `release/` directory
near the current directory and executable, as well as
`node_modules/quickjs-yue/release/`.

Lua support in Yue is experimental. See the
[Yue Lua guide](https://github.com/yue/yue/blob/v0.15.6/docs/guides/lua/getting_started.md)
for the available APIs.
