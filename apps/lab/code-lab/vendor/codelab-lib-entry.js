// Code Lab vendor bundle: @jupyterlab/services + a small CodeMirror 6 setup. Exposes window.CodeLabLib.
import { ServerConnection, KernelManager, KernelSpecManager } from '@jupyterlab/services';
import { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, indentUnit } from '@codemirror/language';
import { python } from '@codemirror/lang-python';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
globalThis.CodeLabLib = {
  ServerConnection, KernelManager, KernelSpecManager,
  cm: { EditorView, EditorState, Compartment, keymap, lineNumbers, drawSelection, highlightActiveLine,
    defaultKeymap, history, historyKeymap, indentWithTab, syntaxHighlighting, defaultHighlightStyle,
    indentOnInput, bracketMatching, indentUnit, python, closeBrackets, closeBracketsKeymap }
};
