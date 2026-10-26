/* My Day — tiny localStorage wrapper. All keys prefixed "myday.". */
(function(){
  var P='myday.';
  window.MDStore={
    get:function(k,def){try{var v=localStorage.getItem(P+k);return v==null?def:JSON.parse(v);}catch(e){return def;}},
    set:function(k,v){try{localStorage.setItem(P+k,JSON.stringify(v));}catch(e){}},
    uid:function(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
  };
})();
