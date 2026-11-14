# quickjs-yue

Yue bindings for Lua running on QuickJS Native through
[quickjs-lua](https://github.com/michael79be/quickjs-lua).

## Installation

```sh
npm install https://github.com/michael79be/quickjs-yue
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

`Window` exposes its responder through `win.responder`. Its `setCapture()`,
`releaseCapture()`, and `hasCapture()` methods manage mouse capture.
Responder events can be subscribed to with `on`:

```ts
const unsubscribe = win.responder.on('keyDown', (event) => {
    console.log(event.key);
});
// Call unsubscribe() to disconnect the handler.
```

Events are delivered as notifications: handlers cannot consume native mouse or
keyboard events. Delivery uses a pipe on macOS and Linux and a temporary file
on Windows; the message loop periodically returns to JavaScript to dispatch
events.

`MessageLoop.setTimer(milliseconds, callback)` runs a repeating callback while
the message loop is active. Call the returned function to cancel the timer.
While a blocking dialog or popup menu is open, JavaScript event and timer
callbacks are deferred until it closes.

`View` is a base class and cannot be created directly by Yue. Wrap a window's
content view with `View.fromWindow(win)`; it also exposes a `responder`.
Call `dispose()` when the wrapper is no longer needed. Size and focus events
are notifications. Drag/drop delegates requiring immediate return values are
not yet available.

`Button` exposes its view as `button.view`. For example:

```ts
import { Button, MessageLoop, Window } from 'quickjs-yue';

const win = new Window();
const button = new Button('OK');
button.on('click', () => console.log('Clicked'));
win.setContentView(button.view);
win.center();
win.activate();
MessageLoop.run();
button.dispose();
```

Call `button.dispose()` when the wrapper is no longer needed.

`ComboBox` lets users choose an item or enter text. Its `view` can be placed in
a window or container. Use `addItem`, `removeItemAt`, `getItems`, `clear`,
`selectItemAt`, `getSelectedItem`, `getSelectedItemIndex`, `setText` and
`getText` to manage it; indices are zero-based and `-1` means no selection.
Duplicate items are allowed. Subscribe to `textChange` and `selectionChange`
with `on`; these are notifications of user changes. Call `dispose()` when
the wrapper is no longer needed.

`Picker` lets users choose one item from a list and exposes `picker.view`.
Use `addItem`, `removeItemAt`, `getItems`, `clear`, `selectItemAt`,
`getSelectedItem` and `getSelectedItemIndex` to manage it. Indices are
zero-based; `-1` means no selection. Yue selects the first item by default and
merges duplicates; their ordering may differ by platform. Item text cannot
contain NUL. Subscribe to user selection
changes with `on('selectionChange', ...)` and call `dispose()` when finished.

`ProgressBar` exposes `progress.view`. Use `setValue` and `getValue` for
percentages from 0 to 100, or `setIndeterminate` and `isIndeterminate` for
indeterminate progress. Setting a value disables indeterminate mode. In Yue
0.15.6, Windows displays only whole percentages and `getValue()` always
returns 0. Call `dispose()` when finished.

`Separator` displays a horizontal or vertical line. Create it with
`new Separator('horizontal')` or `new Separator('vertical')`, use
`separator.view` to place it, and call `dispose()` when finished.

`Slider` exposes `slider.view`. Use `setValue`, `getValue`, `setStep`,
`getStep`, `setRange` and `getRange` to configure it; the default range is
0 to 100. Values are 32-bit floats and the range must have a positive width.
Subscribe to `valueChange` and `slidingComplete` with `on`; completion is
emitted for pointer releases, not keyboard adjustments. On macOS, the step
controls the alternate increment. In Yue 0.15.6, Windows has 10,000 positions
and does not correctly apply nonzero range minima. Call `dispose()` when done.

`Scroll` exposes `scroll.view` and can display any `View` with
`setContentView`. `getContentView()` returns a separate wrapper; dispose it
when finished. Use `setContentSize`, `getContentSize`, `setScrollPosition`,
`getScrollPosition` and `getMaximumScrollPosition` to manage scrolling.
Scrollbar policies are `always`, `never` and `automatic`; on macOS, `always`
is reported as `automatic`. Overlay scrollbars are available on macOS and
Linux, and elasticity settings on macOS only. Subscribe to `scroll` with
`on`; it is a notification. In Yue 0.15.6, macOS vertical positioning can be
incorrect for non-flipped content views; use a `Container` as content to
avoid this. On Linux, the maximum vertical position may be incorrect.
Dispose the `Scroll` wrapper when finished.

`Tab` exposes `tab.view`. Use `addPage(title, view)`, `removePage`, `pageCount`,
`pageAt`, `selectPageAt`, `getSelectedPageIndex` and `getSelectedPage` to
manage pages. Indices are zero-based; no selection is `-1` or `null`.
Returned page wrappers must be disposed separately. `selectedPageChange`
notifications also occur for programmatic selection. Dispose the `Tab`
wrapper when finished. To avoid a Yue 0.15.6 Windows crash, pages before the
selected page cannot be removed, and the selected page can be removed only
when it is the last page.

`Menu` and `MenuBar` expose their common operations through `menuBase`:
`append`, `insert`, `remove`, `itemCount` and `itemAt`. Indices are zero-based;
`itemAt` returns an independent wrapper or `null`. Construct `MenuItem` with a
type or options such as `{ label, checked, submenu }`, and subscribe to click
notifications with `on('click', handler)`. Native roles and accelerators are
also supported; macOS role items execute their native action without emitting
`click`. `validate` delegates require synchronous callbacks and are not
available. Menus reject cycles, duplicate items and multiple owners. In Yue
0.15.6, Windows does not apply item visibility to the native menu.

Use `App.setApplicationMenu` on macOS, `Window.setMenuBar` on Windows and
Linux, and `Tray.setMenu` for a tray menu. Their getters return independent
wrappers. `App.getApplicationMenu` reports menus set through this binding.
`Menu.popup` and `popupAt` block until dismissed. Dispose each menu, item and
returned wrapper when no longer needed; disposal does not remove an item from
its menu. A window's menu bar cannot be reused after the window closes; replace
it before closing the window if it needs to be reused.

`FileOpenDialog` and `FileSaveDialog` expose their common API through
`fileDialog`. Configure the title, button label, filename, folder, options and
filters before calling `run()` or `runForWindow(window)`; both block and return
whether a selection was accepted. `getResult()` returns `null` before acceptance
or after cancellation. For an open dialog, `getResults()` returns all selected
paths, or an empty array after cancellation; use it for multiple selection.
On Windows, `getResult()` may be empty when multiple selection is enabled.

Options are bitmasks using `FileDialog.optionPickFolders`, `optionMultiSelect`
and `optionShowHidden`. Options can be added but not removed from an existing
dialog. Folder and multiple selection are supported only by open dialogs.
`setFilters` can be called once per dialog; each filter has a `description`
and a nonempty array of extensions without leading dots (use `*` for all
files). On macOS, sandbox restrictions may cause the initial folder to be
ignored. Dispose the dialog when finished.

`DatePicker` exposes its view as `picker.view`. Pass an `elements` bitmask
using `DatePicker.elementYearMonth`, `elementYearMonthDay`, `elementHourMinute`
or `elementHourMinuteSecond`, and optionally `hasStepper`, to its constructor.
`setDate`, `getDate`, `setRange` and `getRange` use whole Unix seconds, displayed
in local time; range endpoints can be `null` for no bound. Yue's Lua binding
accepts only signed 32-bit seconds and reserves zero for a null time, so the
Unix epoch itself cannot be represented.
Subscribe to `dateChange` with `on` and call `dispose()` when finished. Yue
0.15.6 does not emit this event for date edits on Linux, and its Linux picker
does not support a stepper.

`Entry` is a single-line text field with `entry.view`. Create a normal field
with `new Entry()` or a masked field with `new Entry('password')`. Use
`setText` and `getText` for its contents, and `on('textChange', ...)` or
`on('activate', ...)` for user edits and Enter. Call `dispose()` when finished.
The password type masks the display; `getText()` still returns the actual text.
Text containing NUL is not supported by the Lua bridge.

Build the digital clock example with
`npx rollup --config rollup.config.ts --configPlugin typescript --input src/samples/clock.ts --dir dist`,
then run `dist/clock.js` with QuickJS Native. On macOS, it has a transparent
titlebar, native window buttons and a custom border; drag its background or
time display to move it. Other platforms use a normal window titled "Clock".

Build the basic calculator with
`npx rollup --config rollup.config.ts --configPlugin typescript --input src/samples/calculator.ts --dir dist`,
then run `dist/calculator.js` with QuickJS Native. It supports the four basic
operations, percentages, sign changes and repeated equals. Press Enter to
calculate, just like the equals button. On macOS, the Belgian AZERTY keyboard
also supports Shift+= for addition, Shift+$ for multiplication and Shift+ù
for percentages.

Build the interactive kitchen-sink example with
`npx rollup --config rollup.config.ts --configPlugin typescript --input src/samples/kitchen-sink.ts --dir dist`,
then run `dist/kitchen-sink.js` with QuickJS Native. Its tabs demonstrate
controls, dialogs, graphics, menus, clipboard and tray. Canvas drawing is
offscreen. On Windows and Linux, choose an image before creating a tray item.

On macOS, create an app and copy its native dependencies after bundling:

```sh
npx quickjs-native bundle dist/kitchen-sink.js --platform macos --app
node postbuild.mjs --app-libraries release/kitchen-sink.app
```

Use `--platform macos-intel` on Intel. The Lua dylib installed by `quickjs-lua`
must contain the target architecture; a universal app needs a universal dylib.
For an installed package, use `node node_modules/quickjs-yue/postbuild.mjs`
instead. The `--app-libraries` option copies existing libraries without
downloading them.

Pass `{ frame: false, transparent: true }` as the second argument to `Window`
to create a transparent frameless window. Transparent framed windows are not
supported by Yue. Add `showTrafficLights: true` to display the native window
buttons on macOS.

`Container` groups child views and exposes its own view as `container.view`.
Use `addChildView`, `addChildViewAt`, `removeChildView`, `childCount` and
`childAt` to manage children; indices are zero-based. `childAt` returns a new
view wrapper that must be disposed separately. Call `container.dispose()` when
the container wrapper is no longer needed. The synchronous `ondraw` event is
not yet available through the JavaScript event bridge.

`Label` displays text and exposes its view as `label.view`. Create it with
`new Label('text')`, and release it with `label.dispose()`.

`Group` displays a title and a border around a content `Container`. Its view is
available as `group.view`; `group.getContentView()` returns a separate wrapper
for the current container, and `group.setContentView(container)` replaces it.
Only unattached containers from the same runtime can be installed; add other
views as children of the content container. Titles cannot contain NUL.
Dispose each container wrapper and the group wrapper when no longer needed.

Use `AttributedText.create('text', { color: '#ff0000', wrap: true })` for
styled text. Pass it to `Label.createWithAttributedText(text)`, or use
`label.setAttributedText(text)`. `label.getAttributedText()` returns a separate
wrapper for the same native text; dispose each wrapper when no longer needed.
After modifying that text, call `label.setAttributedText(text)` again to
refresh the label's layout and display. `Painter.drawAttributedText()` can draw
it on a canvas.

`setFontFor` and `setColorFor` use zero-based, end-exclusive UTF-16 indices;
`-1` means the rest of the text. These range methods are unavailable on
Windows. Text containing NUL is not supported by the Lua bridge.

Create fonts with `Font.default()`, `Font.create()` or `Font.createFromPath()`,
and apply them to text views with `view.setFont(font)`. Call `font.dispose()`
when the wrapper is no longer needed. Yue may use a default font when a font
file cannot be loaded.

Create cursors with `Cursor.createWithType()` and apply them with
`view.setCursor(cursor)`. Call `cursor.dispose()` when the wrapper is no longer
needed.

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
