export {Buffer} from 'buffer'; export const process={env:{},browser:true,nextTick:(f,...a)=>queueMicrotask(()=>f(...a))};
