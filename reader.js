'use strict';
async function readSharedItinerary(){
  const token=new URLSearchParams(location.hash.slice(1)).get('k');
  if(!token||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new Error('请打开同行人发给你的完整链接。当前链接缺少访问凭证，无法查看行程。');
  if(!crypto.subtle)throw new Error('请使用 Safari 或其他支持安全连接的浏览器打开完整链接。');
  const bytes=Uint8Array.from(atob(token.replace(/-/g,'+').replace(/_/g,'/')+'='),c=>c.charCodeAt(0));
  const status=document.getElementById('updated');if(status)status.textContent='正在解锁行程…';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  let response;
  try{response=await fetch('./itinerary.enc?rev=4',{cache:'no-store',credentials:'omit',signal:controller.signal});}
  catch(error){if(error?.name==='AbortError')throw new Error('网络连接较慢，行程下载超时。请切换网络后刷新页面。');throw error;}
  finally{clearTimeout(timer);}
  if(!response.ok)throw new Error('行程暂未加载，请稍后刷新。');
  const encrypted=new Uint8Array(await response.arrayBuffer());
  try{
    const key=await crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['decrypt']);
    const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:encrypted.slice(0,12)},key,encrypted.slice(12));
    return JSON.parse(new TextDecoder().decode(clear));
  }catch{throw new Error('链接不完整或已失效，请向同行人索取最新的完整分享链接。');}
}
