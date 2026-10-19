/*
================================================================================
File: local-ai-chat-models.js
Project: local-ai-chat
Description: Model list and RAM hints for Local AI Chat.
Purpose: One place for the selectable models (id, label, kind, q4 files and
         approx q4 download size) plus a device-RAM cue for each model.
Author: Grok
Date: 2026-10-19 (R2: new file; 5 models, all dtype q4)
================================================================================
*/

/**
 * Selectable models. All load with dtype 'q4' (user's choice).
 * mb = approx q4 download size in MB, checked on 2026-10-19 via
 * https://huggingface.co/api/models/<id>/tree/main/onnx
 * files = the q4 ONNX files transformers.js fetches (used for the cache check).
 * kind 'chat' = text-generation with chat template; 't5' = text2text-generation.
 */
export const MODELS = [
    {
        id: 'Xenova/LaMini-Flan-T5-77M',
        label: 'LaMini T5 77M',
        kind: 't5',
        mb: 170, // encoder 78 + decoder_merged 92
        files: ['onnx/encoder_model_q4.onnx', 'onnx/decoder_model_merged_q4.onnx'],
        hint: 'Tiny, short one-shot answers (no conversation memory)'
    },
    {
        id: 'HuggingFaceTB/SmolLM2-135M-Instruct',
        label: 'SmolLM2 135M',
        kind: 'chat',
        mb: 182,
        files: ['onnx/model_q4.onnx'],
        hint: 'Default. Light and quick'
    },
    {
        id: 'onnx-community/gemma-3-270m-it-ONNX',
        label: 'Gemma 3 270M',
        kind: 'chat',
        mb: 323, // model_q4.onnx (0.2) + model_q4.onnx_data (323)
        files: ['onnx/model_q4.onnx', 'onnx/model_q4.onnx_data'],
        externalData: true,
        hint: "Google's tiny chat model, good for its size"
    },
    {
        id: 'HuggingFaceTB/SmolLM2-360M-Instruct',
        label: 'SmolLM2 360M',
        kind: 'chat',
        mb: 388,
        files: ['onnx/model_q4.onnx'],
        hint: 'Middle option, smarter than 135M'
    },
    {
        id: 'onnx-community/Qwen2.5-0.5B-Instruct',
        label: 'Qwen2.5 0.5B',
        kind: 'chat',
        mb: 786,
        files: ['onnx/model_q4.onnx'],
        hint: 'Smartest, heaviest'
    }
];

export const DEFAULT_MODEL = 'HuggingFaceTB/SmolLM2-135M-Instruct';

/**
 * Finds a model definition by id (falls back to the default model).
 * @param {string} id - Model id
 * @returns {object} Model definition
 */
export function getModel(id) {
    return MODELS.find(m => m.id === id) || MODELS.find(m => m.id === DEFAULT_MODEL);
}

/**
 * Rough RAM needed to load a model, in GB.
 * Rule of thumb: while loading, the browser briefly holds ~3 copies of the
 * download (fetched buffer, cache write / working copy, ONNX session), plus
 * ~1.5 GB base for the OS share, browser and the page itself:
 *     needed GB ≈ download MB × 3 / 1000 + 1.5
 * @param {object} model - Model definition
 * @returns {number} GB
 */
export function neededRamGB(model) {
    return model.mb * 3 / 1000 + 1.5;
}

/**
 * RAM cue for this device. navigator.deviceMemory is Chrome-only and rounded
 * (a 4 GB laptop reports 4); undefined -> no cue.
 * light: need ≤ 55% of device RAM, ok: ≤ 70%, else heavy.
 * @param {object} model - Model definition
 * @returns {''|'light'|'ok'|'heavy'} Cue
 */
export function ramCue(model) {
    const mem = navigator.deviceMemory;
    if (!mem) return '';
    const need = neededRamGB(model);
    if (need <= mem * 0.55) return 'light';
    if (need <= mem * 0.7) return 'ok';
    return 'heavy';
}

/**
 * Text shown in the model <select> option, e.g. 'SmolLM2 135M · light'.
 * @param {object} model - Model definition
 * @returns {string} Option label
 */
export function optionLabel(model) {
    const cue = ramCue(model);
    if (!cue) return model.label;
    return `${model.label} · ${cue === 'heavy' ? 'heavy for this device' : cue}`;
}
