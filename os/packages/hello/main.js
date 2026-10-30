// Example app. Every app exports start(os); os = { storage, registry, log }.
export async function start(os) {
  os.log('hello: started');
  await os.storage.writeFile('/home/hello.txt', 'Hello from Jor OS');
  os.log('hello: read back "' + (await os.storage.readFile('/home/hello.txt')) + '"');
}
