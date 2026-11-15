"""
ai-mcp — MCP server for a sandboxed workspace

File:         mcp/tests/test_escape.py
Purpose:      Escape tests for both isolation layers (file tools + ns/chroot jail).
Place:        mcp/tests/test_escape.py
Version:      2.8
Project:      ai-mcp
Author:       Jor Teron
Licence:      All rights reserved.
Dependencies: Python 3.8+, unittest, helpers, mcp.tools.
"""
from __future__ import annotations

import os
import shutil
import socket
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.realpath(os.path.join(HERE, "..", "..")))

from helpers import (  # noqa: E402
    USERNS_NOTE,
    USERNS_OK,
    LOOPBACK_OK,
    LOOPBACK_NOTE,
    call_tool,
    make_cfg,
    start_server,
    tool_payload,
    write_text,
)
from mcp import tools  # noqa: E402


class FileLayerEscapeTests(unittest.TestCase):
    """Layer-0/file-tool confinement, independent of the command jail."""

    def setUp(self):
        self.cfg = make_cfg(sandbox="none")
        self.secret = os.path.join(self.cfg._tmp, "outside-secret.txt")
        write_text(self.secret, "OUTSIDE_SECRET")

    def tearDown(self):
        shutil.rmtree(self.cfg._tmp, ignore_errors=True)

    def test_dotdot(self):
        # From /workspace a single .. stays inside the sandbox root.
        # Two levels (../../) leave MCP_ROOT and must be refused.
        with self.assertRaises(ValueError):
            tools.resolve_user_path("../../outside-secret.txt", self.cfg)
        with self.assertRaises(ValueError):
            tools.resolve_user_path("../../etc/passwd", self.cfg)
        with self.assertRaises(ValueError):
            tools.resolve_user_path("foo/../../../outside-secret.txt", self.cfg)

    def test_symlink_file(self):
        os.symlink(self.secret, os.path.join(self.cfg.workspace, "link.txt"))
        with self.assertRaises(ValueError) as ctx:
            tools.tool_read_file({"path": "link.txt"}, self.cfg)
        self.assertIn("outside MCP_ROOT", str(ctx.exception))

    def test_symlink_dir(self):
        os.symlink(self.cfg._tmp, os.path.join(self.cfg.workspace, "out"))
        with self.assertRaises(ValueError):
            tools.tool_read_file({"path": "out/outside-secret.txt"}, self.cfg)

    def test_absolute_host_path(self):
        # Jail-absolute /etc/hostname is sandbox/etc/hostname, not the host file.
        with self.assertRaises(ValueError) as ctx:
            tools.tool_read_file({"path": "/etc/hostname"}, self.cfg)
        self.assertIn("does not exist", str(ctx.exception))
        # A host path of a secret is remapped and must not reveal the file.
        with self.assertRaises(ValueError):
            tools.tool_read_file({"path": self.secret}, self.cfg)

    def test_write_through_symlink_blocked(self):
        os.symlink(self.secret, os.path.join(self.cfg.workspace, "wlink"))
        with self.assertRaises(ValueError):
            tools.tool_write_file({"path": "wlink", "content": "pwned"}, self.cfg)
        with open(self.secret, encoding="utf-8") as fh:
            self.assertEqual(fh.read(), "OUTSIDE_SECRET")


@unittest.skipUnless(LOOPBACK_OK, LOOPBACK_NOTE)
@unittest.skipUnless(USERNS_OK, "unprivileged userns unavailable: %s" % USERNS_NOTE)
class JailEscapeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cfg = make_cfg(sandbox="ns")
        write_text(os.path.join(cls.cfg.workspace, "inside.txt"), "INSIDE_OK")
        write_text(os.path.join(cls.cfg.root, "root-inside.txt"), "ROOT_OK")
        cls.secret = os.path.join(cls.cfg._tmp, "outside-secret.txt")
        write_text(cls.secret, "OUTSIDE_SECRET")
        cls.httpd, cls.thread, cls.url = start_server(cls.cfg)

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        shutil.rmtree(cls.cfg._tmp, ignore_errors=True)

    def _run(self, command, timeout=15):
        status, _, parsed = call_tool(
            self.url, "run_command", {"command": command, "timeout": timeout}
        )
        self.assertEqual(status, 200, parsed)
        data = tool_payload(parsed)
        combined = str(data.get("stdout") or "") + str(data.get("stderr") or "")
        self.assertNotIn("mcp-sandbox:", combined, data)
        return data

    def test_command_stays_in_workspace(self):
        data = self._run("pwd && echo sandboxed > marked.txt && cat inside.txt && id")
        self.assertEqual(data["exit_code"], 0, data)
        # Default cwd is /workspace (the sandbox folder is /).
        self.assertIn("/workspace", data["stdout"], data["stdout"])
        self.assertNotIn("/work" + chr(10), data["stdout"] + chr(10))
        self.assertIn("INSIDE_OK", data["stdout"])
        self.assertIn("uid=1000", data["stdout"])
        self.assertTrue(os.path.isfile(os.path.join(self.cfg.workspace, "marked.txt")))
        self.assertFalse(os.path.isfile(os.path.join(self.cfg.root, "marked.txt")))

    def test_sandbox_is_jail_root(self):
        # A file created at / must appear in the host sandbox root, not in
        # workspace/ and not only on the ephemeral jail tmpfs.
        data = self._run("echo AT_ROOT > /from-root.txt && cat /root-inside.txt && ls /workspace")
        self.assertEqual(data["exit_code"], 0, data)
        self.assertIn("ROOT_OK", data["stdout"])
        self.assertTrue(os.path.isfile(os.path.join(self.cfg.root, "from-root.txt")))
        with open(os.path.join(self.cfg.root, "from-root.txt"), encoding="utf-8") as fh:
            self.assertIn("AT_ROOT", fh.read())
        self.assertFalse(os.path.isfile(os.path.join(self.cfg.workspace, "from-root.txt")))

    def test_dotdot_cannot_leave_jail(self):
        data = self._run("cat ../outside-secret.txt 2>&1; echo EXIT:$?")
        combined = (data.get("stdout") or "") + (data.get("stderr") or "")
        self.assertNotIn("OUTSIDE_SECRET", combined)
        self.assertNotIn("EXIT:0", combined.splitlines()[-1] if combined else "")

    def test_outside_file_not_visible(self):
        data = self._run("cat '%s'" % self.secret)
        combined = (data.get("stdout") or "") + (data.get("stderr") or "")
        self.assertNotIn("OUTSIDE_SECRET", combined)
        self.assertNotEqual(data["exit_code"], 0)

    def test_host_paths_not_reachable(self):
        # Regression for the reported escape: cd /home/www/ai and read host paths.
        data = self._run(
            "cd /home/www/ai 2>&1; echo EXIT:$?; "
            "test -e /home/www/ai && echo HAS_AI || echo NO_AI; "
            "test -e /home && echo HAS_HOME || echo NO_HOME; "
            "test -e /etc/shadow && echo HAS_SHADOW || echo NO_SHADOW"
        )
        combined = (data.get("stdout") or "") + (data.get("stderr") or "")
        self.assertIn("NO_AI", combined)
        self.assertIn("NO_HOME", combined)
        self.assertIn("NO_SHADOW", combined)
        self.assertNotIn("EXIT:0", combined)

    def test_etc_is_minimal_and_not_host(self):
        # Our jail /etc/passwd has a 'user' entry; it must not be the host's passwd.
        data = self._run("cat /etc/passwd; echo '---'; cat /etc/hostname 2>&1; ls /etc")
        self.assertEqual(data["exit_code"], 0, data)
        self.assertIn("user:x:1000", data["stdout"])
        # A typical host passwd would mention the real login; do not require a
        # specific hostname file, but /etc/shadow (host secret) must be absent.
        data2 = self._run("test -e /etc/shadow && echo HAS_SHADOW || echo NO_SHADOW")
        self.assertIn("NO_SHADOW", data2["stdout"])

    def test_usr_is_read_only(self):
        data = self._run("echo ok > /usr/aimcp-should-fail 2>&1; echo EXIT:$?")
        combined = data["stdout"] + data["stderr"]
        self.assertIn("EXIT:", combined)
        self.assertFalse(combined.strip().endswith("EXIT:0"))
        # The failed write must not appear in the host sandbox/usr mountpoint.
        self.assertFalse(os.path.lexists(os.path.join(self.cfg.root, "usr", "aimcp-should-fail")))

    def test_system_mounts_not_written_to_host_sandbox(self):
        # /tmp, /etc and /dev are private tmpfs; writes stay off the host.
        data = self._run(
            "echo tmp-secret > /tmp/jail-tmp.txt && "
            "echo etc-secret > /etc/jail-etc.txt && "
            "ls /tmp/jail-tmp.txt /etc/jail-etc.txt && "
            "echo DONE"
        )
        self.assertEqual(data["exit_code"], 0, data)
        self.assertIn("DONE", data["stdout"])
        self.assertFalse(os.path.lexists(os.path.join(self.cfg.root, "tmp", "jail-tmp.txt")))
        self.assertFalse(os.path.lexists(os.path.join(self.cfg.root, "etc", "jail-etc.txt")))
        # /etc/passwd inside the jail must not have been copied to the host.
        host_passwd = os.path.join(self.cfg.root, "etc", "passwd")
        self.assertFalse(os.path.isfile(host_passwd))

    def test_file_tool_escape_still_blocked(self):
        # /etc/hostname is a jail path (sandbox/etc/hostname), not the host file.
        status, _, parsed = call_tool(self.url, "read_file", {"path": "/etc/hostname"})
        self.assertTrue(parsed["result"]["isError"])
        status, _, parsed = call_tool(self.url, "read_file", {"path": self.secret})
        self.assertTrue(parsed["result"]["isError"])
        text = parsed["result"]["content"][0]["text"]
        self.assertNotIn("OUTSIDE_SECRET", text)

    def test_symlink_in_workspace_cannot_escape_command(self):
        os.symlink(self.secret, os.path.join(self.cfg.workspace, "escape-link"))
        # Following the symlink from inside the jail should not reveal the host file:
        # the target path is outside the mounted tree.
        data = self._run("cat escape-link 2>&1; echo EXIT:$?")
        combined = (data.get("stdout") or "") + (data.get("stderr") or "")
        self.assertNotIn("OUTSIDE_SECRET", combined)

    def test_proc_is_namespaced(self):
        # /proc must be the jail's PID namespace, not the host's.
        data = self._run(
            "python3 -c \""
            "import os, pathlib; "
            "pids=[p.name for p in pathlib.Path('/proc').iterdir() if p.name.isdigit()]; "
            "print('PIDCOUNT', len(pids)); "
            "print('PIDS', ','.join(sorted(pids, key=lambda s: int(s)))); "
            "print('SELF', os.getpid())"
            "\""
        )
        self.assertEqual(data["exit_code"], 0, data)
        # A namespaced /proc should have a tiny number of PIDs (bash, python, maybe pid 1).
        self.assertIn("PIDCOUNT", data["stdout"], data)
        line = [l for l in data["stdout"].splitlines() if l.startswith("PIDCOUNT")][0]
        count = int(line.split()[1])
        self.assertLess(count, 20, data["stdout"])
        # Must not be able to walk out via /proc/1/root to the host's /.
        data2 = self._run(
            "python3 -c \""
            "import os; "
            "print('ROOTS', os.path.exists('/proc/1/root/etc/shadow')); "
            "print('HOSTPROC', os.path.exists('/proc/1/root/home/box') or os.path.exists('/proc/1/root/workspace'))"
            "\" 2>&1"
        )
        combined = (data2.get("stdout") or "") + (data2.get("stderr") or "")
        self.assertNotIn("ROOTS True", combined)
        # The old host root was detached after pivot_root.
        data3 = self._run("test -e /old && echo HAS_OLD || echo NO_OLD")
        self.assertIn("NO_OLD", data3["stdout"])

    def test_mount_not_allowed(self):
        data = self._run("mkdir -p /tmp/mnt && mount -t tmpfs tmpfs /tmp/mnt")
        combined = (data.get("stdout") or "") + (data.get("stderr") or "")
        self.assertNotEqual(data["exit_code"], 0, data)
        # The mount point must still be empty of a tmpfs we created.
        data2 = self._run("python3 -c \"import pathlib; print(pathlib.Path('/proc/mounts').read_text())\"")
        self.assertNotIn(" /tmp/mnt ", data2.get("stdout") or "", data2)

    def test_network_is_off(self):
        data = self._run(
            "python3 - <<'PY'\n"
            "import socket\n"
            "try:\n"
            "    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)\n"
            "    s.settimeout(2)\n"
            "    s.connect(('1.1.1.1', 53))\n"
            "    print('NET_OPEN')\n"
            "    s.close()\n"
            "except Exception as e:\n"
            "    print('NET_BLOCKED', type(e).__name__)\n"
            "PY"
        )
        combined = (data.get("stdout") or "") + (data.get("stderr") or "")
        self.assertIn("NET_BLOCKED", combined, data)
        self.assertNotIn("NET_OPEN", combined)
        # An empty net namespace typically raises OSError (ENETUNREACH) rather
        # than timing out. Accept any exception name, but require a block.
        self.assertRegex(combined, r"NET_BLOCKED \S+")

    def test_git_status_inside_jail(self):
        data = self._run("pwd && git status && git config --get user.name && echo GIT_OK")
        self.assertEqual(data["exit_code"], 0, data)
        self.assertIn("/workspace", data["stdout"])
        self.assertIn("GIT_OK", data["stdout"])
        # A freshly inited repo has no commits yet, or is "on branch".
        status_out = data["stdout"].lower()
        self.assertTrue(
            "no commits" in status_out or "on branch" in status_out or "git_ok" in status_out,
            data,
        )
        self.assertNotIn("not a git repository", status_out)

    def test_setuid_does_not_elevate(self):
        # Host setuid binaries (passwd, su, sudo) must not grant host root
        # or even jail uid 0: we run as mapped uid 1000 with no_new_privs.
        data = self._run(
            "id; "
            "python3 -c 'import os; print(\"euid\", os.geteuid())'; "
            "(sudo -n id 2>&1 || true); "
            "(su -c id 2>&1 || true); "
            "(passwd -S 2>&1 || true); "
            "echo DONE"
        )
        combined = (data.get("stdout") or "") + (data.get("stderr") or "")
        self.assertIn("DONE", combined, combined)
        self.assertIn("uid=1000", combined)
        self.assertNotIn("uid=0(root)", combined)
        self.assertNotIn("euid 0", combined)

    def test_no_sys_and_no_host_tmp(self):
        data = self._run(
            "ls /sys 2>&1 | head; echo ---; "
            "test -e /sys/class && echo HAS_SYS || echo NO_SYS; "
            "ls /tmp; echo TMP_OK"
        )
        self.assertIn("NO_SYS", data["stdout"] + data["stderr"])
