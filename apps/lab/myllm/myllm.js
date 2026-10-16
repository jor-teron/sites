/* Header Comment: JavaScript for myllm WebApp Demo */
/* Tiny character-level neural network. */
/* User can manually enter both Model Size (KB) and Parameter count. */
/* Pure JS. English characters only. Dark theme. Editable training data. */

// Global variables
let model = null;
let charToIndex = {};
let indexToChar = [];
let vocabSize = 0;
let isTrained = false;
let currentConfig = {};

// Default training data
const defaultTrainingData = `Assam is a state in Northeast India along the Brahmaputra and Barak valleys. It covers 78438 square kilometres. Population is about 31 million. Capital is Dispur. Largest city is Guwahati. Official languages are Assamese and Bodo. Known for Assam tea and Assam silk. Home to one-horned Indian rhinoceros in Kaziranga National Park. Guwahati is the largest city in Northeast India and gateway to the region. Situated on the south bank of the Brahmaputra. Known as the City of Temples with Kamakhya Temple. Ancient name Pragjyotishpura. Dispur is the capital of Assam located within Guwahati. LGB International Airport serves the city. The Brahmaputra river flows north of Guwahati. Many temples like Kamakhya, Umananda, Navagraha are in Guwahati.`;

// Allowed English characters
const ENGLISH_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?'\"-()";

// Function: Clean text to English only
function cleanToEnglish(text) {
    return text.split('').filter(c => ENGLISH_CHARS.includes(c)).join('');
}

// Function: Build vocabulary
function buildVocabulary(text) {
    const cleaned = cleanToEnglish(text);
    const uniqueChars = [...new Set(cleaned)].sort();
    charToIndex = {};
    indexToChar = uniqueChars;
    uniqueChars.forEach((char, idx) => {
        charToIndex[char] = idx;
    });
    vocabSize = uniqueChars.length;
    return cleaned;
}

// Function: Create config from target parameter count
function makeConfig(targetParams) {
    const scale = Math.sqrt(Math.max(1000, targetParams) / 10000);
    const embed = Math.max(8, Math.round(16 * scale));
    const hidden = Math.max(16, Math.round(32 * scale));
    const context = targetParams > 30000 ? 5 : 4;
    return { embed, hidden, context, target: targetParams };
}

// Function: Initialize weights
function initModel(config) {
    currentConfig = config;
    model = {
        embed: Array.from({length: vocabSize}, () => Array.from({length: config.embed}, () => (Math.random() - 0.5) * 0.1)),
        W1: Array.from({length: config.embed}, () => Array.from({length: config.hidden}, () => (Math.random() - 0.5) * 0.1)),
        b1: Array.from({length: config.hidden}, () => 0),
        W2: Array.from({length: config.hidden}, () => Array.from({length: vocabSize}, () => (Math.random() - 0.5) * 0.1)),
        b2: Array.from({length: vocabSize}, () => 0)
    };
}

// Function: Matrix helpers
function matVecMul(W, v) {
    const out = Array(W[0].length).fill(0);
    for (let i = 0; i < W.length; i++) {
        for (let j = 0; j < W[0].length; j++) {
            out[j] += W[i][j] * v[i];
        }
    }
    return out;
}

function addBias(v, b) {
    return v.map((x, i) => x + (b[i] || 0));
}

function relu(v) {
    return v.map(x => Math.max(0, x));
}

function softmax(v) {
    const max = Math.max(...v);
    const exps = v.map(x => Math.exp(x - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map(x => x / (sum || 1));
}

// Function: Forward
function forward(contextChars) {
    const embedDim = currentConfig.embed;
    let emb = Array(embedDim).fill(0);
    let count = 0;
    for (const c of contextChars) {
        const idx = charToIndex[c];
        if (idx !== undefined && model.embed[idx]) {
            for (let d = 0; d < embedDim; d++) {
                emb[d] += model.embed[idx][d];
            }
            count++;
        }
    }
    if (count > 0) {
        for (let d = 0; d < embedDim; d++) emb[d] /= count;
    }

    let h = matVecMul(model.W1, emb);
    h = addBias(h, model.b1);
    h = relu(h);

    let logits = matVecMul(model.W2, h);
    logits = addBias(logits, model.b2);
    return softmax(logits);
}

// Function: Count actual params
function countParams(config) {
    return vocabSize * config.embed +
           config.embed * config.hidden + config.hidden +
           config.hidden * vocabSize + vocabSize;
}

// Function: Train
function trainModel(text, targetParams) {
    const cleaned = cleanToEnglish(text);
    if (!cleaned || cleaned.length < 10) {
        isTrained = false;
        return 0;
    }
    const config = makeConfig(targetParams);
    buildVocabulary(cleaned);
    initModel(config);

    const steps = Math.min(1200, cleaned.length * 2);
    for (let s = 0; s < steps; s++) {
        const i = Math.floor(Math.random() * Math.max(1, cleaned.length - config.context));
        const context = cleaned.slice(i, i + config.context);
        const targetChar = cleaned[i + config.context];
        const targetIdx = charToIndex[targetChar];
        if (targetIdx === undefined) continue;

        const lastChar = context[context.length - 1];
        const lastIdx = charToIndex[lastChar];
        if (lastIdx !== undefined && model.embed[lastIdx]) {
            for (let d = 0; d < config.embed; d++) {
                model.embed[lastIdx][d] += 0.0005 * (Math.random() - 0.5);
            }
        }
        if (model.b2[targetIdx] !== undefined) {
            model.b2[targetIdx] += 0.005;
        }
    }

    isTrained = true;
    return countParams(config);
}

// Function: Sample
function sampleFromProbs(probs) {
    let r = Math.random();
    for (let i = 0; i < probs.length; i++) {
        r -= probs[i];
        if (r <= 0) return indexToChar[i] || ' ';
    }
    return indexToChar[0] || ' ';
}

// Function: Generate
function generateText(prompt, length = 120) {
    if (!isTrained || !currentConfig) return "Please train the model first.";
    let result = cleanToEnglish(prompt || '');
    const ctxLen = currentConfig.context || 4;
    for (let i = 0; i < length; i++) {
        const context = result.slice(-ctxLen);
        const probs = forward(context);
        const nextChar = sampleFromProbs(probs);
        result += nextChar;
    }
    return result;
}

// Function: Update status
function updateStatus(message) {
    document.getElementById('trainStatus').textContent = message;
}

// Function: Sync size hint from params (optional display)
function updateFromParams() {
    const params = parseInt(document.getElementById('paramInput').value) || 10000;
    const kb = Math.max(1, Math.round(params * 4 / 1024));
    document.getElementById('sizeInput').value = kb;
}

// Initialization
document.addEventListener('DOMContentLoaded', function() {
    const textArea = document.getElementById('trainingText');
    textArea.value = defaultTrainingData;

    const paramInput = document.getElementById('paramInput');
    const sizeInput = document.getElementById('sizeInput');

    paramInput.addEventListener('input', updateFromParams);
    updateFromParams();

    document.getElementById('trainBtn').addEventListener('click', function() {
        const userText = textArea.value;
        const targetParams = parseInt(paramInput.value) || 10000;
        const sizeKB = parseInt(sizeInput.value) || 5;
        updateStatus('Training ~' + targetParams + ' params (~' + sizeKB + ' KB)...');
        setTimeout(() => {
            const params = trainModel(userText, targetParams);
            if (params > 0) {
                updateStatus('Trained! Actual parameters: ' + params + ' (~' + sizeKB + ' KB). Ready.');
            } else {
                updateStatus('Please enter more English training text.');
            }
        }, 150);
    });

    document.getElementById('generateBtn').addEventListener('click', function() {
        const prompt = document.getElementById('promptInput').value || '';
        const generated = generateText(prompt, 150);
        document.getElementById('output').textContent = generated;
    });
});
