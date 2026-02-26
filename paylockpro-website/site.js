// PayLock Pro Website - Shared JavaScript
(function(){
  // Scrolled nav
  const nav=document.getElementById('navbar');
  if(nav){window.addEventListener('scroll',()=>{nav.classList.toggle('scrolled',window.scrollY>50)});}
  // Close mobile menu on link click
  document.querySelectorAll('.nav-links a').forEach(a=>{a.addEventListener('click',()=>{document.getElementById('navLinks')?.classList.remove('open')})});
  // Set portal links - use absolute backend URL when on custom domain
  const BACKEND_URL = 'https://client-app-staging-1.preview.emergentagent.com';
  const isBackendServed = window.location.pathname.startsWith('/api/website');
  const portalUrl = isBackendServed ? '/api/portal' : (BACKEND_URL + '/api/portal');
  document.querySelectorAll('[data-portal-link]').forEach(el=>{if(el.href&&el.href.includes('PORTAL_URL'))el.href=portalUrl;});
  document.querySelectorAll('a[href="PORTAL_URL"]').forEach(el=>{el.href=portalUrl;});
  // Fix relative page links to use /api/website/ prefix when served from backend
  const base=window.location.pathname;
  if(base.startsWith('/api/website')){
    document.querySelectorAll('a[href]').forEach(a=>{
      const h=a.getAttribute('href');
      if(h&&h.endsWith('.html')&&!h.startsWith('http')&&!h.startsWith('/')){
        const name=h.replace('.html','');
        if(name==='index')a.setAttribute('href','/api/website');
        else a.setAttribute('href','/api/website/'+name);
      }
    });
    // Fix css/js references
    document.querySelectorAll('link[rel="stylesheet"][href="style.css"]').forEach(l=>{l.href='/api/website/style.css';});
  }
  // Reveal on scroll
  const obs=new IntersectionObserver((entries)=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('revealed');obs.unobserve(e.target)}})},{threshold:.1,rootMargin:'0px 0px -50px 0px'});
  document.querySelectorAll('.feature-card,.step,.price-card,.int-badge,.contact-info-card,.sec-feat').forEach(el=>{el.style.opacity='0';el.style.transform='translateY(20px)';el.style.transition='opacity .5s ease,transform .5s ease';obs.observe(el)});
  // Add revealed class style
  const s=document.createElement('style');
  s.textContent='.revealed{opacity:1!important;transform:translateY(0)!important}';
  document.head.appendChild(s);
  // Stagger delays
  document.querySelectorAll('.features-grid,.pricing-grid,.integrations-row,.steps-container').forEach(g=>{
    Array.from(g.children).forEach((c,i)=>{c.style.transitionDelay=i*80+'ms'});
  });
})();
