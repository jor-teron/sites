/*=============================================================================
  translation.js — Gemini Live Translate socket
  Needs CONFIG + appendTranslation / translationTurnEnded / flushEnQueue /
  setStatus from transcribe.js.
=============================================================================*/

/* Second WebSocket to Gemini Live Translate */
let wsTranslate = null;

/*----------------------------------------------------------------------------
  paintEn
  Fill or hide the English translation line on a block.
----------------------------------------------------------------------------*/
function paintEn(blockEl, enText) {
  if (!blockEl) return;
  let en = blockEl.querySelector(".en");
  if (!CONFIG.ENABLE_TRANSLATION) {
    if (en) {
      en.textContent = "";
      en.classList.remove("pending");
    }
    return;
  }
  if (!en) {
    en = document.createElement("div");
    en.className = "line en";
    blockEl.insertBefore(en, blockEl.firstChild.nextSibling);
  }
  const t = (enText || "").trim();
  en.textContent = t ? ("(ENG) " + t) : "";
}

/*----------------------------------------------------------------------------
  setEnPending
  Toggle the "translating…" marker on a block's English line.
  The marker is CSS ::after, so copyAll never picks it up.
----------------------------------------------------------------------------*/
function setEnPending(blockEl, on) {
  if (!blockEl) return;
  const en = blockEl.querySelector(".en");
  if (!en) return;
  if (on) en.classList.add("pending");
  else en.classList.remove("pending");
}

/*----------------------------------------------------------------------------
  sendTranslateSetup
  Live Translate needs AUDIO modality + translationConfig.
----------------------------------------------------------------------------*/
function sendTranslateSetup() {
  const setup = {
    setup: {
      model: "models/" + CONFIG.TRANSLATE_MODEL,
      generationConfig: {
        responseModalities: ["AUDIO"],
        translationConfig: {
          targetLanguageCode: CONFIG.TRANSLATE_TARGET,
          echoTargetLanguage: true
        }
      },
      inputAudioTranscription: {
        languageCodes: CONFIG.LANGUAGE_CODES
      },
      outputAudioTranscription: {}
    }
  };
  wsTranslate.send(JSON.stringify(setup));
}

/*----------------------------------------------------------------------------
  handleTranslateMessage
  Use outputTranscription as English meaning. turnComplete /
  generationComplete = the current stretch of English is finished.
----------------------------------------------------------------------------*/
function handleTranslateMessage(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return;
  }
  if (data.error) {
    const msg = data.error.message || JSON.stringify(data.error);
    setStatus("Translate error: " + msg, "err");
    return;
  }
  const content = data.serverContent || data.server_content;
  if (!content) return;

  const out =
    (content.outputTranscription && content.outputTranscription.text) ||
    (content.output_transcription && content.output_transcription.text) ||
    (content.interimOutputTranscription && content.interimOutputTranscription.text) ||
    (content.interim_output_transcription && content.interim_output_transcription.text);
  if (out) appendTranslation(out);

  const done =
    content.turnComplete || content.turn_complete ||
    content.generationComplete || content.generation_complete;
  if (done) translationTurnEnded();
}

/*----------------------------------------------------------------------------
  connectTranslateWs
  Second Live pipe. Failure does not stop transcription.
----------------------------------------------------------------------------*/
function connectTranslateWs(apiKey) {
  return new Promise(function (resolve) {
    if (!CONFIG.ENABLE_TRANSLATION) {
      resolve();
      return;
    }
    const url = CONFIG.WS_URL + "?key=" + encodeURIComponent(apiKey);
    const sock = new WebSocket(url);
    wsTranslate = sock;
    wsTranslate.onopen = function () {
      sendTranslateSetup();
      resolve();
    };
    wsTranslate.onmessage = function (ev) {
      /* Ignore a socket we already replaced or closed */
      if (sock !== wsTranslate) return;
      if (typeof ev.data === "string") {
        handleTranslateMessage(ev.data);
        return;
      }
      if (ev.data instanceof Blob) {
        ev.data.text().then(handleTranslateMessage).catch(function () {});
      }
    };
    wsTranslate.onerror = function () {
      setStatus("Translate socket error (caption still runs)", "err");
      resolve();
    };
    wsTranslate.onclose = function () {
      /* Do not stop the whole app if only translate drops; just stop
         waiting for English that will never come. */
      if (sock !== wsTranslate) return;
      wsTranslate = null;
      flushEnQueue();
      resolve();
    };
  });
}

/*----------------------------------------------------------------------------
  closeTranslateWs
  Close the translate socket if open.
----------------------------------------------------------------------------*/
function closeTranslateWs() {
  if (wsTranslate) {
    try { wsTranslate.close(); } catch (e) {}
    wsTranslate = null;
  }
}
