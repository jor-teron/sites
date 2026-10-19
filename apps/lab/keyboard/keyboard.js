    /**
     * Sticky modifier flags.
     * caps stays until tapped again.
     * shift / ctrl / alt stay until the next non-modifier key (one-shot),
     * or until tapped again to cancel.
     */
    var mods = {
      shift: false,
      caps: false,
      ctrl: false,
      alt: false
    };

    /** Status line element */
    var statusEl = document.getElementById("status");

    /**
     * paintMods
     * Refresh modifier button .on class and the status text.
     */
    function paintMods() {
      document.querySelectorAll("button.mod").forEach(function (btn) {
        var name = btn.getAttribute("data-mod");
        if (mods[name]) btn.classList.add("on");
        else btn.classList.remove("on");
      });
    }

    /**
     * setStatus
     * Show active modifiers plus the last sent key.
     */
    function setStatus(lastKey) {
      var bits = [];
      if (mods.ctrl) bits.push("Ctrl");
      if (mods.alt) bits.push("Alt");
      if (mods.shift) bits.push("Shift");
      if (mods.caps) bits.push("Caps");
      var prefix = bits.length ? bits.join("+") + " + " : "";
      statusEl.textContent = prefix + lastKey;
    }

    /**
     * sendKey
     * Payload you will later forward on the same channel as the gamepad.
     */
    function sendKey(payload) {
      console.log(payload);
      setStatus(payload.key);
      if (navigator.vibrate) {
        navigator.vibrate(18);
      }
    }

    /**
     * resolveLetter
     * Apply Caps and Shift to a letter key.
     */
    function resolveLetter(base) {
      var upper = mods.shift !== mods.caps;
      return upper ? base.toUpperCase() : base.toLowerCase();
    }

    /**
     * resolveSymbol
     * If Shift is on and the key has data-shift, use that glyph.
     */
    function resolveSymbol(btn) {
      var shifted = btn.getAttribute("data-shift");
      if (mods.shift && shifted !== null) return shifted;
      return btn.getAttribute("data-key");
    }

    /**
     * tapMod
     * Toggle a modifier and update the UI.
     */
    function tapMod(name) {
      mods[name] = !mods[name];
      paintMods();
      setStatus("(" + name + (mods[name] ? " on" : " off") + ")");
    }

    /**
     * consumeOneShotMods
     * After a real key, drop Shift / Ctrl / Alt. Caps stays.
     */
    function consumeOneShotMods() {
      mods.shift = false;
      mods.ctrl = false;
      mods.alt = false;
      paintMods();
    }

    /**
     * onKeyButton
     * Handle one physical tap on the board.
     */
    function onKeyButton(btn) {
      var modName = btn.getAttribute("data-mod");
      if (modName) {
        tapMod(modName);
        return;
      }

      var raw = btn.getAttribute("data-key");
      var outKey = raw;

      if (btn.classList.contains("letter")) {
        outKey = resolveLetter(raw);
      } else if (btn.getAttribute("data-shift") !== null) {
        outKey = resolveSymbol(btn);
      }

      sendKey({
        type: "key",
        key: outKey,
        ctrl: mods.ctrl,
        alt: mods.alt,
        shift: mods.shift,
        caps: mods.caps
      });

      consumeOneShotMods();
    }

    /**
     * Bind touchend + click on every key.
     * touchend avoids the 300ms mobile click delay.
     */
    document.querySelectorAll("button.key").forEach(function (btn) {
      btn.addEventListener("touchend", function (ev) {
        ev.preventDefault();
        onKeyButton(btn);
      });
      btn.addEventListener("click", function () {
        onKeyButton(btn);
      });
    });

    paintMods();
