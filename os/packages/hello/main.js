// Example app. start(os) runs at boot; open(os) runs from the panel.
// os = { storage, registry, wm, ui, log }
export async function start(os) {
  os.log('hello: started');
  await os.storage.writeFile('/home/hello.txt', 'Hello from Jor OS');
  os.log('hello: read back "' + (await os.storage.readFile('/home/hello.txt')) + '"');
}

export async function open(os) {
  const win = os.wm.createWindow({ title: 'Hello', width: 320, height: 220 });
  const text = (await os.storage.readFile('/home/hello.txt')) ?? '(no file)';
  const files = await os.storage.listFiles('/home');
  const p = document.createElement('p');
  p.textContent = text;
  const ul = document.createElement('ul');
  for (const f of files) {
    const li = document.createElement('li');
    li.textContent = f.name + (f.type === 'dir' ? '/' : '');
    ul.append(li);
  }
  win.body.append(p, document.createTextNode('Files in /home:'), ul);
  return win;
}
