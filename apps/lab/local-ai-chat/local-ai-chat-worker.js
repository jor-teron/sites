/*
================================================================================
File: local-ai-chat-worker.js
Project: local-ai-chat
Description: Module Web Worker that loads and runs the language model.
Purpose: Keeps transformers.js (model load + generation) off the page's main
         thread, so the page repaints while a reply streams. The page
         terminates this worker on model switch, which frees all WASM memory.
Author: Grok
Date: 2026-10-19 (R3: new file)
================================================================================

Messages (page → worker):
  { type: 'load', model: { id, kind, externalData } }
  { type: 'generate', input, kind }   input = chat messages array or T5 string
  { type: 'stop' }                    ends the current reply early
Messages (worker → page):
  { type: 'progress', file, loaded, total }  while a model file is read/fetched
  { type: 'starting' }                       files loaded, session starting
  { type: 'loaded', device }
  { type: 'token', text, tokens, seconds }   text = new piece; tokens = count so far
  { type: 'done', text, tokens, seconds, tps, stopped }
  { type: 'error', stage: 'load'|'generate', message }
*/

import { pipeline, env, TextStreamer, InterruptableStoppingCriteria }
    from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.0';

// Remote Hub + browser Cache Storage (shared with the page's cache helpers)
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

let generator = null;
let busy = false;
const stopper = new InterruptableStoppingCriteria();

/**
 * True when WebGPU has an adapter inside this worker.
 * @returns {Promise<boolean>}
 */
async function hasWebGPU() {
    if (!self.navigator?.gpu) return false;
    try {
        return !!(await self.navigator.gpu.requestAdapter());
    } catch {
        return false;
    }
}

/**
 * Loads the pipeline for a model (dtype q4, user's choice).
 * @param {{id:string, kind:string, externalData?:boolean}} model
 */
async function load(model) {
    const device = (await hasWebGPU()) ? 'webgpu' : 'wasm';
    const task = model.kind === 't5' ? 'text2text-generation' : 'text-generation';
    const options = {
        dtype: 'q4',
        device,
        progress_callback: (p) => {
            if (!/\.onnx/.test(p.file || '')) return;
            if (p.status === 'progress' && p.total) {
                postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total });
            } else if (p.status === 'done') {
                postMessage({ type: 'starting' });
            }
        }
    };
    if (model.externalData) options.use_external_data_format = true;
    generator = await pipeline(task, model.id, options);
    postMessage({ type: 'loaded', device });
}

/**
 * Generates one reply, streaming text pieces back to the page.
 * Token count comes from token_callback_function (real tokens);
 * callback_function delivers decoded text pieces (about a word each).
 * @param {Array|string} input - Pipeline input
 * @param {string} kind - 'chat' or 't5'
 */
async function generate(input, kind) {
    let text = '';
    let tokens = 0;
    const start = performance.now();
    const secs = () => (performance.now() - start) / 1000;
    stopper.reset();

    const streamer = new TextStreamer(generator.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        token_callback_function: (ids) => { tokens += ids.length; },
        callback_function: (piece) => {
            if (!piece) return;
            text += piece;
            postMessage({ type: 'token', text: piece, tokens, seconds: secs() });
        }
    });

    // T5 is best greedy; chat models sample lightly
    const genOpts = kind === 't5'
        ? { max_new_tokens: 150, do_sample: false, repetition_penalty: 1.2 }
        : { max_new_tokens: 150, temperature: 0.6, top_p: 0.9, do_sample: true };
    const output = await generator(input, { ...genOpts, streamer, stopping_criteria: stopper });

    // Fallback: take the text from the final result if streaming gave nothing
    if (!text.trim()) {
        const generated = output?.[0]?.generated_text;
        if (Array.isArray(generated)) {
            const last = generated[generated.length - 1];
            text = last && last.role === 'assistant' ? (last.content || '') : '';
        } else if (typeof generated === 'string') {
            text = generated;
        }
    }
    const seconds = secs();
    postMessage({
        type: 'done',
        text: text.trim(),
        tokens,
        seconds,
        tps: seconds > 0 && tokens > 0 ? tokens / seconds : 0,
        stopped: stopper.interrupted
    });
}

self.addEventListener('message', async (e) => {
    const msg = e.data || {};
    if (msg.type === 'stop') {
        stopper.interrupt();
        return;
    }
    if (busy) return; // page guards this too
    busy = true;
    try {
        if (msg.type === 'load') {
            await load(msg.model);
        } else if (msg.type === 'generate') {
            if (!generator) throw new Error('Model not loaded');
            await generate(msg.input, msg.kind);
        }
    } catch (err) {
        console.error(err);
        postMessage({ type: 'error', stage: msg.type === 'load' ? 'load' : 'generate', message: err?.message || String(err) });
    }
    busy = false;
});
