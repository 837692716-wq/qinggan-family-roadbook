/* No private itinerary is embedded in this public shell. Read from TREK's authenticated API. */
'use strict';
const $=id=>document.getElementById(id);
const palette=['#e4572e','#bc870c','#2e86ab','#2a9d8f','#6654a3','#d1495b','#64748b'];
let data, map, layer, active='drive', currentBounds, markers=new Map();
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const safeHref=raw=>{try{const u=new URL(raw,location.origin);return (u.protocol==='https:'||u.protocol==='http:')?u.href:null;}catch{return null;}};
const dateOf=t=>t.name.match(/^10\/(\d{2}) 道路总览/)?'2026-10-'+t.name.match(/^10\/(\d{2})/)[1]:null;
const cleanName=p=>p.name.replace('酒店（金标）','（金标）').replace('（文化广场店）','').replace('（武威火车站万达广场店）','');
const isHotel=p=>/酒店|美宿|如家/.test(p.name);
const labelFor=p=>isHotel(p)?'宿':/充电/.test(p.name)?'电':/面|泡馍|美食|回民/.test(p.name)?'食':null;
const places=()=>data.places.filter(p=>!p.route_geometry);
const tracks=()=>data.places.filter(p=>dateOf(p)&&p.route_geometry);
const pointIdsFor=day=>new Set((day?.assignments||[]).map(a=>a.place.id));

function makeLink(href,text){const a=el('a',text);a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;}
function popup(p){const d=el('div');d.append(el('h3',p.name));if(p.description)d.append(el('p',p.description));if(p.address)d.append(el('p',p.address));const link=safeHref(p.website);if(link&&new URL(link).hostname==='uri.amap.com')d.append(makeLink(link,'高德查看 / 导航 ↗'));return d;}
function getSelection(){
  if(active==='all')return {points:places(),routes:tracks(),day:null};
  if(active==='drive'){const ids=new Set(data.days.filter(d=>d.date>='2026-10-01'&&d.date<='2026-10-06').flatMap(d=>[...pointIdsFor(d)]));return {points:places().filter(p=>ids.has(p.id)),routes:tracks().filter(t=>dateOf(t)!=='2026-10-07'),day:null};}
  const day=data.days.find(d=>d.date===active), ids=pointIdsFor(day);
  const morning=[];
  // Include both the morning hotel and the hotel checked into that night.
  for(const a of data.accommodations||[]){const start=data.days.find(d=>d.id===a.start_day_id),end=data.days.find(d=>d.id===a.end_day_id);if(start&&end&&active>=start.date&&active<=end.date){ids.add(a.place_id);if(active>start.date)morning.push(a.place_id);}}
  const ordered=[...new Set([...morning,...(day?.assignments||[]).map(a=>a.place.id),...ids])];
  return {points:ordered.map(id=>places().find(p=>p.id===id)).filter(Boolean),routes:tracks().filter(t=>dateOf(t)===active),day};
}
function choose(next){active=next;const u=new URL(location.href);u.searchParams.set('day',next);history.replaceState(null,'',u);render();}
function button(text,fn,cls){const b=el('button',text,cls);b.type='button';b.addEventListener('click',fn);return b;}
function renderDates(){
  $('dates').replaceChildren();
  const options=[['drive','青甘自驾','10/1—10/6'],['all','全部行程','西安＋青甘'],...data.days.map(d=>[d.date,d.date.slice(5).replace('-','/'),d.date<'2026-10-01'?'两人城市段':d.date==='2026-10-07'?'分头返程':'四人同行'])];
  for(const [id,name,small] of options){const b=button(name,()=>choose(id));b.setAttribute('aria-pressed',String(id===active));b.append(el('span',small));$('dates').append(b);}
  const selected=$('dates').querySelector('[aria-pressed="true"]');
  if(selected)$('dates').scrollLeft=selected.offsetLeft-$('dates').offsetLeft-($('dates').clientWidth-selected.offsetWidth)/2;
}
function addRouteCard(t){
  const card=el('article',undefined,'card card-route');card.style.setProperty('--c',t.route_color);card.append(el('h3',t.name.replace(' 道路总览｜',' · ')),el('p',t.description));
  const actions=el('div',undefined,'actions');actions.append(button('看这一天',()=>choose(dateOf(t))));card.append(actions);$('cards').append(card);
}
function addPointCard(p,index){
  const c=el('article',undefined,'card'),top=el('div',undefined,'card-top');top.append(el('span',labelFor(p)||String(index+1),'badge'),el('h3',p.name));c.append(top);
  const noCoord=p.lat==null||p.lng==null;
  c.append(el('p',p.address||p.description||'','address'));
  if(isHotel(p)){const note=(p.notes||'').split('\n\n定位说明')[0];c.append(el('p',note));}
  if(p.id===12)c.append(el('p','位置提示：大雁塔以东，须专程绕行；不是顺路餐位。'));
  const actions=el('div',undefined,'actions');
  if(!noCoord){actions.append(button('地图定位',()=>{map.setView([p.lat,p.lng],15);markers.get(p.id)?.openPopup();$('map').scrollIntoView({block:'center',behavior:'smooth'});}));const href=safeHref(p.website);if(href&&new URL(href).hostname==='uri.amap.com')actions.append(makeLink(href,'高德导航 ↗'));}
  else c.append(el('p','未标精确停车点：沿正规停车带现场择点，不沿旧坐标进入土路。'));
  c.append(actions);$('cards').append(c);
}
function render(){
  renderDates();layer.clearLayers();markers.clear();$('cards').replaceChildren();$('legend').replaceChildren();
  const {points,routes,day}=getSelection();let bounds=[];
  routes.forEach(t=>{let line;try{line=JSON.parse(t.route_geometry);}catch{return;}if(!Array.isArray(line)||line.length<2)return;const color=t.route_color||'#315a48';
    L.polyline(line,{color:'#fffdf7',weight:8,opacity:.92,interactive:false}).addTo(layer);
    L.polyline(line,{color,weight:4,opacity:.95}).bindPopup(popup(t)).on('click',()=>{}).addTo(layer);bounds.push(...line);
    const b=button(dateOf(t).slice(5).replace('-','/'),()=>choose(dateOf(t)));const i=el('i');i.style.setProperty('--c',color);b.prepend(i);$('legend').append(b);
  });
  points.forEach((p,i)=>{if(p.lat==null||p.lng==null)return;const pos=[p.lat,p.lng],color=isHotel(p)?'#183c35':/充电/.test(p.name)?'#608137':'#b75030';
    const badge=el('div',labelFor(p)||String(i+1),'pin'+(isHotel(p)?' pin-hotel':''));badge.style.setProperty('--c',color);
    const marker=L.marker(pos,{icon:L.divIcon({className:'point-icon',html:badge,iconSize:[26,26],iconAnchor:[13,13]}),title:p.name}).addTo(layer).bindPopup(popup(p));
    marker.bindTooltip(cleanName(p),{direction:'top',offset:[0,-12],className:'point-label',permanent:active!=='all'&&active!=='drive'&&points.length<=6});markers.set(p.id,marker);bounds.push(pos);
  });
  if(bounds.length){currentBounds=L.latLngBounds(bounds);map.fitBounds(currentBounds,{padding:[35,55],maxZoom:14});}
  $('day-label').textContent=day?day.date+' / '+(day.date<'2026-10-01'?'CITY WALK':'ON THE ROAD'):'ROUTE INDEX / 旅途索引';
  $('day-title').textContent=day?(day.title||day.date):active==='drive'?'青甘，六天一环。':'从西安到河西，再到青海。';
  $('day-meta').textContent=routes.length===1?routes[0].description:`${points.filter(p=>p.lat!=null).length} 个可定位地点 · ${routes.length} 条道路轨迹`;
  $('scope-note').textContent=day?(routes.length?(day.date==='2026-10-07'?'7号不设游玩；灰色路线仅供父母送机参考，未默认延长租车。':'实线沿已查询的道路绘制。绿色方形为住宿；“电”为补能参考。点击点位后可打开高德。'):'城市段不伪造高铁、地铁或步行轨迹；这里展示已核实地点。以已购交通和预约时间为准。'):'彩色实线＝高德道路轨迹，不是点位之间的直线。点选日期可放大当天；34个点已定位，二尕公路停车点保留现场择点。';
  if(!day){routes.forEach(addRouteCard);if(active==='all'){const heading=el('h3','城市与旅途地点');$('cards').append(heading);points.forEach(addPointCard);}}
  else points.forEach(addPointCard);
  $('schedule').hidden=!day; $('schedule').open=!!day;
  $('schedule-body').textContent=day?[day.notes,...(routes.map(t=>t.notes))].filter(Boolean).join('\n\n'):'';
  document.querySelector('.panel').scrollTop=0;
}
async function init(){
  try{
    data=await readSharedItinerary();
    $('updated').textContent='更新于 '+new Date(data.publishedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
    if(!Array.isArray(data.places)||!Array.isArray(data.days))throw new Error('行程数据格式不匹配，未显示未经核验的地图。');
    $('content').hidden=false;$('stats').replaceChildren();for(const [value,label]of [[places().filter(p=>p.lat!=null).length,'定位点'],[tracks().length,'道路轨迹'],['1','现场择点']]){const d=el('div');d.append(el('strong',String(value)),el('small',label));$('stats').append(d);}
    map=L.map('map',{zoomControl:false,scrollWheelZoom:true,preferCanvas:true,minZoom:2,maxZoom:18,maxBounds:[[-85,-180],[85,180]],maxBoundsViscosity:1}).setView([37.9,102],7);L.control.zoom({position:'topright',zoomInTitle:'放大',zoomOutTitle:'缩小'}).addTo(map);L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
    layer=L.layerGroup().addTo(map);
    try{
      const basemap=L.maplibreGL({style:'https://tiles.openfreemap.org/styles/liberty',interactive:false,attribution:'<a href="https://openfreemap.org/">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
      const gl=basemap.getMaplibreMap();
      gl.on('error',()=>{$('tile-warning').hidden=false;});
      gl.on('idle',()=>{$('tile-warning').hidden=true;});
    }catch{$('tile-warning').hidden=false;}
    $('fit').addEventListener('click',()=>{if(currentBounds)map.fitBounds(currentBounds,{padding:[35,55],maxZoom:14});});
    const wanted=new URL(location.href).searchParams.get('day');if(wanted&&(['all','drive'].includes(wanted)||data.days.some(d=>d.date===wanted)))active=wanted;render();
  }catch(error){$('error').hidden=false;$('error').textContent=error.message;$('stats').textContent='未完成加载';}
}
init();
