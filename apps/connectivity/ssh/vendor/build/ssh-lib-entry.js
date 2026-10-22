import * as ssh from '@microsoft/dev-tunnels-ssh';
const {ChannelRequestMessage}=ssh;
class PtyReq extends ChannelRequestMessage{constructor(c,r){super('pty-req',true);this.c=c;this.r=r;}
 onWrite(w){super.onWrite(w);w.writeString('xterm-256color','ascii');w.writeUInt32(this.c);w.writeUInt32(this.r);w.writeUInt32(0);w.writeUInt32(0);w.writeBinary(Buffer.from([0]));}}
class WinCh extends ChannelRequestMessage{constructor(c,r){super('window-change',false);this.c=c;this.r=r;}
 onWrite(w){super.onWrite(w);w.writeUInt32(this.c);w.writeUInt32(this.r);w.writeUInt32(0);w.writeUInt32(0);}}
window.SSHLib={...ssh,PtyReq,WinCh,Buffer};
