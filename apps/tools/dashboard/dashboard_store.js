/* My Day — tiny localStorage wrapper. All keys prefixed "myday.". Also fmtTime (12-hour display). */
(function(){
  var P='myday.';
  window.MDStore={
    get:function(k,def){try{var v=localStorage.getItem(P+k);return v==null?def:JSON.parse(v);}catch(e){return def;}},
    set:function(k,v){try{localStorage.setItem(P+k,JSON.stringify(v));}catch(e){}},
    /* PD4.1: display-only 12-hour time. fmtTime(Date|ms|'HH:MM'[,compact]) -> '5:27 PM' (compact: hour only if :00, e.g. '3 PM') */
    fmtTime:function(v,compact){var h,m;if(typeof v==='string'){var p=v.split(':');h=+p[0];m=+p[1]||0;}else{var d=new Date(v);h=d.getHours();m=d.getMinutes();}
      var ap=h<12?'AM':'PM',h12=h%12||12;return (compact&&!m)?h12+' '+ap:h12+':'+(m<10?'0':'')+m+' '+ap;},
    uid:function(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
  };
})();
