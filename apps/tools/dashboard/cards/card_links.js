/* Card: Quick Links — name + URL tiles, add/edit/delete. Defaults: TV, WhatsApp Web, one empty slot. */
(function(){
  var DEF=[{id:'tv',name:'TV',url:'../../../tv/'},{id:'wa',name:'WhatsApp Web',url:'https://web.whatsapp.com/'}];
  MyDay.register({id:'links',title:'Quick Links',defaultOn:true,render:function(box,api){
    var el=api.el,items=api.store.get('links',null)||DEF.slice(),mode=box._mode||'view',form=box._form||null;
    function save(){api.store.set('links',items);box._form=null;api.rerender();}
    var grid=el('div',{'class':'links'});
    items.forEach(function(it){
      if(mode==='edit')grid.appendChild(el('button',{'class':'link',onclick:function(){box._form=it.id;api.rerender();}},[el('span',{'class':'ini',text:'✎'}),it.name]));
      else grid.appendChild(el('a',{'class':'link',href:it.url,target:/^https?:/.test(it.url)?'_blank':'_self',rel:'noopener'},[el('span',{'class':'ini',text:it.name.charAt(0).toUpperCase()}),it.name]));
    });
    grid.appendChild(el('button',{'class':'link emptyslot','aria-label':'Add link',onclick:function(){box._form='new';api.rerender();}},[el('span',{'class':'ini',text:'+'}),'Add link']));
    box.appendChild(grid);
    if(form){
      var it=form==='new'?null:items.filter(function(x){return x.id===form;})[0];
      var n=el('input',{type:'text',placeholder:'Name','aria-label':'Link name'}),u=el('input',{type:'url',placeholder:'https://…','aria-label':'Link URL'});
      n.value=it?it.name:'';u.value=it?it.url:'';setTimeout(function(){n.focus();},0);
      box.appendChild(el('div',{'class':'form'},[n,u,el('div',{'class':'row'},[
        el('button',{'class':'btn primary',text:'Save',onclick:function(){var nm=n.value.trim(),ur=u.value.trim();if(!nm||!ur)return;
          if(!/^(https?:|\.|\/)/.test(ur))ur='https://'+ur;if(it){it.name=nm;it.url=ur;}else items.push({id:api.store.uid(),name:nm,url:ur});save();}}),
        el('button',{'class':'btn',text:'Cancel',onclick:function(){box._form=null;api.rerender();}}),
        it?el('button',{'class':'btn danger',text:'Delete',onclick:function(){items=items.filter(function(x){return x!==it;});save();}}):null])]));
    }
    box.appendChild(el('div',{'class':'editbar'},[el('button',{'class':'btn small',text:mode==='edit'?'Done':'Edit links',onclick:function(){box._mode=mode==='edit'?'view':'edit';box._form=null;api.rerender();}})]));
  }});
})();
