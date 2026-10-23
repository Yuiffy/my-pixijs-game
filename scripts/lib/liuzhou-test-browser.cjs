// Every disposable test context, including touch contexts, installs these before
// creating a page. Native Pointer Lock can warp the Windows cursor even headless.
exports.quietContext = async (browser, options) => {
  const context = await browser.newContext(options);
  await context.addInitScript(() => {
    let captured = null;
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => captured });
    HTMLElement.prototype.requestPointerLock = function () {
      captured = this;
      queueMicrotask(() => document.dispatchEvent(new Event('pointerlockchange')));
      return Promise.resolve();
    };
    document.exitPointerLock = () => {
      captured = null;
      queueMicrotask(() => document.dispatchEvent(new Event('pointerlockchange')));
    };
    if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
  });
  return context;
};
