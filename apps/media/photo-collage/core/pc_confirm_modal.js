/**
 * Photo Collage — Custom in-app confirm dialog controller (core/pc_confirm_modal.js)
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.PhotoCollageCore = root.PhotoCollageCore || {};
  root.PhotoCollageCore.confirmModal = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function createConfirmModalController(deps) {
    var dom = deps && deps.dom ? deps.dom : {};
    var doc = (deps && deps.doc) || (typeof document !== 'undefined' ? document : null);
    var pending = null;

    function isOpen() {
      return Boolean(dom.confirmModal && !dom.confirmModal.hidden);
    }

    function close(confirmed) {
      var active = pending;
      pending = null;
      if (dom.confirmModal) {
        dom.confirmModal.hidden = true;
      }
      if (confirmed && active && typeof active.onConfirm === 'function') {
        active.onConfirm();
      } else if (!confirmed && active && typeof active.onCancel === 'function') {
        active.onCancel();
      }
      if (active && active.returnFocus && typeof active.returnFocus.focus === 'function') {
        try { active.returnFocus.focus(); } catch (_) {}
      }
    }

    function open(options) {
      var opts = options || {};
      if (!dom.confirmModal) {
        if (typeof opts.onConfirm === 'function') opts.onConfirm();
        return;
      }

      if (dom.confirmTitle) {
        dom.confirmTitle.textContent = opts.title || 'Confirm Action';
      }
      if (dom.confirmMessage) {
        dom.confirmMessage.textContent = opts.message || '';
      }
      if (dom.btnConfirmCancel) {
        dom.btnConfirmCancel.textContent = opts.cancelText || 'Cancel';
      }
      if (dom.btnConfirmOk) {
        dom.btnConfirmOk.textContent = opts.confirmText || 'Confirm';
        dom.btnConfirmOk.className = opts.danger === false ? 'btn primary' : 'btn danger-solid';
      }

      pending = {
        onConfirm: opts.onConfirm || null,
        onCancel: opts.onCancel || null,
        returnFocus: doc && doc.activeElement ? doc.activeElement : null
      };

      dom.confirmModal.hidden = false;
      if (dom.btnConfirmCancel && typeof dom.btnConfirmCancel.focus === 'function') {
        try { dom.btnConfirmCancel.focus(); } catch (_) {}
      }
    }

    function attachConfirmModalEvents() {
      if (dom.btnConfirmClose) {
        dom.btnConfirmClose.addEventListener('click', function () { close(false); });
      }
      if (dom.btnConfirmCancel) {
        dom.btnConfirmCancel.addEventListener('click', function () { close(false); });
      }
      if (dom.btnConfirmOk) {
        dom.btnConfirmOk.addEventListener('click', function () { close(true); });
      }
      if (dom.confirmModal) {
        dom.confirmModal.addEventListener('click', function (e) {
          if (e.target === dom.confirmModal) {
            close(false);
          }
        });
      }
      if (doc) {
        doc.addEventListener('keydown', function (e) {
          if (e.key === 'Escape' && isOpen()) {
            e.preventDefault();
            close(false);
          }
        });
      }
    }

    return {
      open: open,
      close: close,
      isOpen: isOpen,
      attachConfirmModalEvents: attachConfirmModalEvents
    };
  }

  return {
    createConfirmModalController: createConfirmModalController
  };
});
