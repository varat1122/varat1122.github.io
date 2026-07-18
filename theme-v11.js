(function(){
  const KEY='fdr-theme';
  const root=document.documentElement;
  const button=document.getElementById('themeToggle');
  if(!button)return;

  function setTheme(theme,saveChoice=true){
    const next=theme==='light'?'light':'dark';
    root.dataset.theme=next;
    button.setAttribute('aria-pressed',String(next==='light'));
    button.title=next==='dark'?'เปลี่ยนเป็น Light Mode':'เปลี่ยนเป็น Dark Mode';
    const icon=button.querySelector('.theme-icon');
    const label=button.querySelector('.theme-label');
    if(icon)icon.textContent=next==='dark'?'☀️':'🌙';
    if(label)label.textContent=next==='dark'?'Light Mode':'Dark Mode';
    if(saveChoice)localStorage.setItem(KEY,next);
  }

  setTheme(localStorage.getItem(KEY)||'dark',false);
  button.addEventListener('click',()=>setTheme(root.dataset.theme==='dark'?'light':'dark'));
})();