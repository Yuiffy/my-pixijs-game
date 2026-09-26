/** Test-only Pointer Lock boundary. Never asks the OS to capture the user's mouse. */
function installVirtualPointerLock() {
  let locked = null;
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked });
  HTMLElement.prototype.requestPointerLock = function requestPointerLock() {
    locked = this;
    setTimeout(() => document.dispatchEvent(new Event('pointerlockchange')), 0);
    return Promise.resolve();
  };
  document.exitPointerLock = () => {
    if (!locked) return;
    locked = null;
    setTimeout(() => document.dispatchEvent(new Event('pointerlockchange')), 0);
  };
}
module.exports = { installVirtualPointerLock };
