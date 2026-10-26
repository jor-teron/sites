/* Card: Todo — today's tasks, checkbox, priority high/med/low, add/delete. Open first (by priority), done at bottom. */
(function(){
  var PR={high:0,med:1,low:2};
  MyDay.register({id:'todo',title:'Todo',defaultOn:true,render:function(box,api){
    var el=api.el,items=api.store.get('todo',[]);
    function save(){api.store.set('todo',items);api.rerender();}
    items.sort(function(a,b){return (a.done-b.done)||(PR[a.pri]-PR[b.pri])||(a.t-b.t);});
    var ul=el('ul',{'class':'list'});
    if(!items.length)box.appendChild(el('div',{'class':'empty',text:'No tasks yet. Add one below.'}));
    items.forEach(function(it){
      var cb=el('input',{type:'checkbox','class':'chk','aria-label':'Done: '+it.text});cb.checked=!!it.done;
      cb.addEventListener('change',function(){it.done=cb.checked;save();});
      ul.appendChild(el('li',{'class':it.done?'done':''},[cb,el('span',{'class':'pri '+it.pri,text:it.pri}),el('span',{'class':'txt grow',text:it.text}),
        el('button',{'class':'btn small danger','aria-label':'Delete '+it.text,text:'✕',onclick:function(){items=items.filter(function(x){return x!==it;});save();}})]));
    });
    box.appendChild(ul);
    var inp=el('input',{type:'text',placeholder:'New task…','aria-label':'New task'}),sel=el('select',{'aria-label':'Priority'});
    ['high','med','low'].forEach(function(p){var o=el('option',{value:p,text:p});if(p==='med')o.selected=true;sel.appendChild(o);});
    function add(){var t=inp.value.trim();if(!t)return;items.push({id:api.store.uid(),text:t,pri:sel.value,done:false,t:Date.now()});save();var n=box.querySelector('input[type=text]');if(n)n.focus();}
    inp.addEventListener('keydown',function(e){if(e.key==='Enter')add();});
    box.appendChild(el('div',{'class':'addrow'},[inp,sel,el('button',{'class':'btn primary',text:'Add',onclick:add})]));
    var left=items.filter(function(x){return !x.done;}).length;api.setCount(left+' left');
  }});
})();
