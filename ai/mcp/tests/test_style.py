"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/tests/test_style.py
Purpose:      Guard rails for v2.5: no UPPER_CASE module-level constants
              outside config.py (except the Linux kernel section of
              nscompat.py), and a docstring on every function and class
              in the production package.
Place:        mcp/tests/test_style.py
Version:      2.8
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+, unittest, ast, pathlib. Scans production
              modules recursively (test modules are not included).
"""
from __future__ import annotations

import ast
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.realpath(os.path.join(HERE, ".."))  # mcp/
ROOT = os.path.realpath(os.path.join(HERE, "..", ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

# Prefixes of Linux UAPI constants that may stay in nscompat.py.
# Everything else UPPER_CASE must be defined in config.py.
_KERNEL_PREFIXES = ("CLONE_", "MS_", "MNT_", "PR_", "RLIMIT_")


def _target_names(node):
    """Return the identifier names assigned to by an Assign or AnnAssign.

    Args:
        node (ast.AST): A module-level assignment node.

    Returns:
        list[str]: Simple names (star-unpack and attribute targets are skipped).
    """
    if isinstance(node, ast.AnnAssign):
        targets = [node.target]
    elif isinstance(node, ast.Assign):
        targets = node.targets
    else:
        return []
    names = []
    for target in targets:
        if isinstance(target, ast.Name):
            names.append(target.id)
        elif isinstance(target, ast.Tuple):
            for elt in target.elts:
                if isinstance(elt, ast.Name):
                    names.append(elt.id)
    return names


def _is_upper_constant(name):
    """Return True if name looks like a module-level CONSTANT.

    Args:
        name (str): An identifier.

    Returns:
        bool: True when the name is all caps, digits and underscores, has
        at least one letter, and is not a dunder such as __all__.
    """
    if name.startswith("__") and name.endswith("__"):
        return False
    if not name.isupper():
        return False
    return any(ch.isalpha() for ch in name)


def _iter_package_modules():
    """Yield every production Python module below mcp/.

    Yields:
        tuple[str, str]: The relative filename and its absolute path.
    """
    for current, dirs, files in os.walk(PKG):
        dirs[:] = sorted(name for name in dirs if name not in ("__pycache__", "tests"))
        for name in sorted(files):
            if name.endswith(".py"):
                path = os.path.join(current, name)
                yield os.path.relpath(path, PKG), path


class StyleTests(unittest.TestCase):
    """Structural checks that every production module follows v2.3 rules."""

    def test_no_module_level_constants_outside_config(self):
        """Fail if any production module defines its own UPPER_CASE constant.

        config.py may define any constant. nscompat.py may define names
        that start with a Linux UAPI prefix (CLONE_, MS_, MNT_, PR_,
        RLIMIT_). Imports of constants from config.py do not count
        (they are ImportFrom, not an assignment).
        """
        offenders = []
        for name, path in _iter_package_modules():
            if name == "config.py" or name.startswith("config/"):
                continue
            tree = ast.parse(Path_read(path), filename=path)
            for node in tree.body:
                if not isinstance(node, (ast.Assign, ast.AnnAssign)):
                    continue
                for ident in _target_names(node):
                    if not _is_upper_constant(ident):
                        continue
                    if name == "nscompat.py" and ident.startswith(_KERNEL_PREFIXES):
                        continue
                    offenders.append("%s:%s %s" % (name, node.lineno, ident))
        self.assertEqual(
            offenders,
            [],
            "UPPER_CASE module-level constants must live in config.py "
            "(kernel flags may stay in nscompat.py): %s" % offenders,
        )

    def test_every_function_and_class_has_a_docstring(self):
        """Fail if a production function, method or class has no docstring.

        Nested functions are included (for example the pipe readers in
        sandbox.py). Test modules under mcp/tests/ are not scanned; nested production packages are included.
        """
        missing = []
        for name, path in _iter_package_modules():
            tree = ast.parse(Path_read(path), filename=path)
            for node in ast.walk(tree):
                if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    continue
                if ast.get_docstring(node) is None:
                    missing.append("%s:%s %s" % (name, node.lineno, node.name))
        self.assertEqual(
            missing,
            [],
            "every function and class in mcp/*.py must have a docstring: %s" % missing,
        )


def Path_read(path):
    """Read a UTF-8 source file.

    Args:
        path (str): Absolute path of a .py file.

    Returns:
        str: The file contents.
    """
    with open(path, "r", encoding="utf-8") as fh:
        return fh.read()
