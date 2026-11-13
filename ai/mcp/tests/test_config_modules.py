"""Compatibility tests for the modular configuration package."""
from __future__ import annotations

import unittest

from mcp import config
from mcp.config import client_text
from mcp.config.limits import audit, command, files, jail, misc, runtime, selftest, workspace


class ConfigModuleCompatibilityTests(unittest.TestCase):
    """Ensure domain modules preserve the historical config namespace."""

    def test_operational_constants_are_exported_from_domain_modules(self):
        """Representative values are identical through package and domain imports."""
        pairs = (
            (config.MAX_READ, files.MAX_READ),
            (config.DEFAULT_TIMEOUT, command.DEFAULT_TIMEOUT),
            (config.DEFAULT_MEMORY_MB, command.DEFAULT_MEMORY_MB),
            (config.JAIL_UID, jail.JAIL_UID),
            (config.DEFAULT_WORKSPACE_SIZE, workspace.DEFAULT_WORKSPACE_SIZE),
            (config.DEFAULT_AUDIT_ENABLED, audit.DEFAULT_AUDIT_ENABLED),
            (config.SELFTEST_PASS, selftest.SELFTEST_PASS),
            (config.DEFAULT_SANDBOX_MODE, runtime.DEFAULT_SANDBOX_MODE),
            (config.USERNS_HELP, misc.USERNS_HELP),
        )
        for public_value, domain_value in pairs:
            self.assertEqual(public_value, domain_value)

    def test_client_text_compatibility_reexports_operational_constants(self):
        """Existing direct imports from client_text continue to work."""
        self.assertEqual(client_text.MAX_READ, config.MAX_READ)
        self.assertEqual(client_text.DEFAULT_TIMEOUT, config.DEFAULT_TIMEOUT)
        self.assertEqual(client_text.JAIL_UID, config.JAIL_UID)

    def test_config_loader_remains_public(self):
        """Config and ConfigError remain exported from mcp.config."""
        self.assertTrue(callable(config.Config))
        self.assertTrue(issubclass(config.ConfigError, Exception))


if __name__ == "__main__":
    unittest.main()
