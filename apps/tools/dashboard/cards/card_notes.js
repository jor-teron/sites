/* Card: Notes — sticky notes, add/edit/delete. */
(function(){
  MyDay.register({id:'notes',title:'Notes',defaultOn:true,render:function(box,api){
    var el=api.el,items=api.store.get('notes',[]),editing=box._edit||null;
    function save(){box._edit=null;api.store.set('notes',items);api.rerender();}
    var grid=el('div',{'class':'notes'});
    if(!items.length&&editing!=='new')box.appendChild(el('div',{'class':'empty',text:'No notes. Tap “New note”.'}));
    function editor(it){
      var ta=el('textarea',{rows:'3','aria-label':'Note text'});ta.value=it?it.text:'';
      setTimeout(function(){ta.focus();},0);
      return el('div',{'class':'note'},[ta,el('div',{'class':'row'},[
        el('button',{'class':'btn small',text:'Save',onclick:function(){var t=ta.value.trim();if(!t){box._edit=null;api.rerender();return;}
          if(it)it.text=t;else items.unshift({id:api.store.uid(),text:t});save();}}),
        el('button',{'class':'btn small',text:'Cancel',onclick:function(){box._edit=null;api.rerender();}})])]);
    }
    if(editing==='new')grid.appendChild(editor(null));
    items.forEach(function(it){
      if(editing===it.id){grid.appendChild(editor(it));return;}
      grid.appendChild(el('div',{'class':'note'},[el('div',{'class':'body',text:it.text}),el('div',{'class':'row'},[
        el('button',{'class':'btn small',text:'Edit',onclick:function(){box._edit=it.id;api.rerender();}}),
        el('button',{'class':'btn small danger',text:'Delete','aria-label':'Delete note',onclick:function(){if(confirm('Delete this note?')){items=items.filter(function(x){return x!==it;});save();}}})])]));
    });
    box.appendChild(grid);
    box.appendChild(el('div',{'class':'editbar'},[el('button',{'class':'btn primary',text:'+ New note',onclick:function(){box._edit='new';api.rerender();}})]));
  }});
})();
