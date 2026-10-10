/*
  File: disk.js
  Project: devbench
  Role: Approximate disk speed via the Origin Private File System.
  Writes then reads a fixed buffer. Not a raw-drive benchmark.
  Exposes window.DevbenchDisk.run(onProgress).
*/

/* Total bytes written and read. 64 MiB. */
const DEVBENCH_DISK_BYTES = 64 * 1024 * 1024;

/* Chunk size for each write and read call. */
const DEVBENCH_DISK_CHUNK = 1024 * 1024;

/* File name inside OPFS. Removed after the test. */
const DEVBENCH_DISK_NAME = "devbench-speed.bin";

/*
  Fill a chunk with a changing byte so the browser cannot skip the write.
*/
function devbenchFillChunk(chunk, seed) {
  for (var i = 0; i < chunk.length; i += 4096) {
    chunk[i] = (seed + i) & 255;
  }
}

/*
  Run write then read on OPFS.
  onProgress receives 0..1 across both phases.
  Resolves with writeMBps and readMBps. Needs a secure context (https or localhost).
*/
async function devbenchRunDisk(onProgress) {
  if (!navigator.storage || !navigator.storage.getDirectory) {
    throw new Error("OPFS not available. Open via https or localhost.");
  }
  var root = await navigator.storage.getDirectory();
  var handle = await root.getFileHandle(DEVBENCH_DISK_NAME, { create: true });
  var chunk = new Uint8Array(DEVBENCH_DISK_CHUNK);
  var writes = DEVBENCH_DISK_BYTES / DEVBENCH_DISK_CHUNK;

  var writable = await handle.createWritable();
  var writeStart = performance.now();
  for (var w = 0; w < writes; w++) {
    devbenchFillChunk(chunk, w);
    await writable.write(chunk);
    if (typeof onProgress === "function") {
      onProgress((w + 1) / writes * 0.5);
    }
  }
  await writable.close();
  var writeSec = (performance.now() - writeStart) / 1000;

  var file = await handle.getFile();
  var readStart = performance.now();
  for (var r = 0; r < writes; r++) {
    await file.slice(r * DEVBENCH_DISK_CHUNK, (r + 1) * DEVBENCH_DISK_CHUNK).arrayBuffer();
    if (typeof onProgress === "function") {
      onProgress(0.5 + (r + 1) / writes * 0.5);
    }
  }
  var readSec = (performance.now() - readStart) / 1000;
  await root.removeEntry(DEVBENCH_DISK_NAME);

  var mb = DEVBENCH_DISK_BYTES / (1024 * 1024);
  return {
    megabytes: mb,
    writeMBps: mb / writeSec,
    readMBps: mb / readSec
  };
}

/* Public disk API used by devbench.js. */
window.DevbenchDisk = {
  run: devbenchRunDisk
};
