const ids = [];
const remember = n => { ids.push(n.id); return n; };
const rgb = hex => ({r:parseInt(hex.slice(1,3),16)/255,g:parseInt(hex.slice(3,5),16)/255,b:parseInt(hex.slice(5,7),16)/255});
const paint = (hex,opacity=1) => ({type:'SOLID',color:rgb(hex),opacity});
const white='#F6F2FC', lavender='#BEA0EF', muted='#B6AEC9', ink='#0A0910';
await Promise.all([{family:'Cormorant Garamond',style:'Regular'},{family:'Manrope',style:'Regular'},{family:'Manrope',style:'Medium'}].map(f=>figma.loadFontAsync(f)));
figma.currentPage.name='Landing — Hero';
const hero=remember(figma.createFrame()); hero.name='Oblik OS / Hero / Desktop 1440'; hero.resize(1440,900); hero.x=160;hero.y=160;hero.fills=[paint(ink)];hero.clipsContent=true;
function rect(parent,name,x,y,w,h,fill,r=0){const n=remember(figma.createRectangle());parent.appendChild(n);n.name=name;n.resize(w,h);n.x=x;n.y=y;n.fills=fill;n.cornerRadius=r;return n;}
function text(parent,name,chars,size,color,font='Manrope',style='Regular',width){const n=remember(figma.createText());parent.appendChild(n);n.name=name;n.fontName={family:font,style};n.fontSize=size;n.characters=chars;n.fills=[paint(color)];n.textAutoResize='WIDTH_AND_HEIGHT';if(width){n.textAutoResize='HEIGHT';n.resize(width,Math.max(1,n.height));}return n;}
function stack(parent,name,direction,x,y,gap){const n=remember(figma.createAutoLayout(direction));parent.appendChild(n);n.name=name;n.fills=[];n.itemSpacing=gap;n.primaryAxisSizingMode='AUTO';n.counterAxisSizingMode='AUTO';n.x=x;n.y=y;return n;}
function gradient(a,b){return [{type:'GRADIENT_LINEAR',gradientTransform:[[1,0,0],[0,1,0]],gradientStops:[{position:0,color:{...rgb(a),a:1}},{position:1,color:{...rgb(b),a:1}}]}];}
const backdrop=rect(hero,'Photographic scene',0,0,1440,900,[paint('#14101E')]);
// Filled with the generated photographic asset in a following step.
rect(hero,'Left readability shade',0,0,760,900,[{type:'GRADIENT_LINEAR',gradientTransform:[[1,0,0],[0,1,0]],gradientStops:[{position:0,color:{...rgb(ink),a:.86}},{position:.63,color:{...rgb(ink),a:.65}},{position:1,color:{...rgb(ink),a:0}}]}]);
rect(hero,'Bottom vignette',0,720,1440,180,[{type:'GRADIENT_LINEAR',gradientTransform:[[0,1,0],[-1,0,1]],gradientStops:[{position:0,color:{...rgb(ink),a:0}},{position:1,color:{...rgb(ink),a:.9}}]}]);
const word=text(hero,'Background statement','ОСТАЁТСЯ СОБОЙ',166,lavender,'Cormorant Garamond');word.x=32;word.y=106;word.opacity=.24;word.letterSpacing={unit:'PERCENT',value:-4};if(word.width>1380)word.fontSize=166*1380/word.width;
const header=remember(figma.createFrame());hero.appendChild(header);header.name='Header';header.resize(1440,86);header.fills=[paint(ink,.68)];header.x=0;header.y=0;
const logo=remember(figma.createNodeFromSvg(LOGO_SVG));header.appendChild(logo);logo.name='Brand / supplied logo';logo.resize(170,170*99/445);logo.x=52;logo.y=24;logo.findAll().forEach(n=>ids.push(n.id));
rect(header,'Header separator',0,85,1440,1,[paint('#CBB6EC',.13)]);
const nav=stack(header,'Navigation','HORIZONTAL',458,33,34);for(const s of ['Возможности','Как работает','Для кого','Тарифы'])text(nav,s,s,14,white,'Manrope');
const login=text(header,'Sign in','Войти',14,white);login.x=1114;login.y=33;
function button(parent,name,label,primary){const n=stack(parent,name,'HORIZONTAL',0,0,20);n.paddingLeft=26;n.paddingRight=26;n.paddingTop=17;n.paddingBottom=17;n.cornerRadius=100;n.fills=primary?gradient('#CDB5FA','#B99AED'): [paint(ink,.22)];if(!primary){n.strokes=[paint('#BCA0EC',.8)];n.strokeWeight=1;}text(n,'Label',label,14,primary?ink:white,'Manrope','Medium');return n;}
const topButton=button(header,'Header CTA','Создать персонажа',true);topButton.x=1190;topButton.y=20;topButton.paddingTop=12;topButton.paddingBottom=12;topButton.paddingLeft=22;topButton.paddingRight=22;
const copy=stack(hero,'Hero copy','VERTICAL',56,357,25);
const heading=stack(copy,'Headline','VERTICAL',0,0,-2);
text(heading,'Headline line 1','Создай персонажа,',58,white,'Cormorant Garamond');
const l2=text(heading,'Headline line 2','который остаётся собой.',58,white,'Cormorant Garamond');l2.setRangeFills(8,l2.characters.length,[paint(lavender)]);
const sub=text(copy,'Supporting copy','Внешность, характер, память и контент —\nв одном профиле цифровой личности.',20,muted,'Manrope');sub.lineHeight={unit:'PIXELS',value:30};
const actions=stack(copy,'Actions','HORIZONTAL',0,0,12);actions.paddingTop=8;
const cta=button(actions,'Primary CTA','Создать персонажа бесплатно',true);text(cta,'Arrow','→',21,ink,'Manrope');
const demo=button(actions,'Demo CTA','Посмотреть, как работает',false);const play=text(demo,'Play','▷',21,lavender,'Manrope');demo.insertChild(0,play);demo.itemSpacing=12;demo.paddingLeft=20;demo.paddingRight=20;
function path(name,d){const v=remember(figma.createVector());hero.appendChild(v);v.name=name;v.vectorPaths=[{windingRule:'NONZERO',data:d}];v.fills=[];v.strokes=[paint(lavender,.7)];v.strokeWeight=1.2;return v;}
path('Core → Appearance','M 1182 493 C 1182 383 1060 420 1060 326');
path('Core → Memory','M 1210 492 C 1290 410 1275 418 1275 368');
path('Core → Content','M 1233 535 C 1290 535 1296 569 1296 600');
path('Core → Character','M 1160 543 C 1065 576 1045 616 1045 699');
function icon(parent,kind){let d='';if(kind==='person')d='<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>';if(kind==='memory')d='<ellipse cx="12" cy="5" rx="9" ry="4"/><path d="M3 5v14c0 5 18 5 18 0V5M3 12c0 5 18 5 18 0"/>';if(kind==='heart')d='<path d="M12 21 3 12C-3 4 7-2 12 6c5-8 15-2 9 6Z"/>';if(kind==='content')d='<rect x="2" y="2" width="20" height="20" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 19 6-6 4 3 4-6 5 7"/>';
const n=remember(figma.createNodeFromSvg('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="#BEA0EF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'+d+'</g></svg>'));parent.appendChild(n);n.name='Icon / '+kind;n.findAll().forEach(n=>ids.push(n.id));return n;}
function card(name,title,desc,kind,x,y,w){const f=stack(hero,name,'VERTICAL',x,y,11);f.resize(w,96);f.primaryAxisSizingMode='AUTO';f.counterAxisSizingMode='FIXED';f.paddingTop=17;f.paddingBottom=17;f.paddingLeft=18;f.paddingRight=18;f.cornerRadius=14;f.fills=gradient('#211D2B','#111017');f.opacity=.96;f.strokes=[paint(lavender,.56)];f.strokeWeight=1;f.effects=[{type:'DROP_SHADOW',color:{...rgb('#AA7FED'),a:.13},offset:{x:0,y:0},radius:18,spread:0,visible:true,blendMode:'NORMAL'}];const row=stack(f,'Card heading','HORIZONTAL',0,0,10);icon(row,kind);text(row,'Title',title,15,white,'Manrope','Medium');text(f,'Description',desc,12,muted,'Manrope','Regular',w-36);return f;}
card('Capability / Appearance','Внешность','Образ, стиль и детали','person',970,282,220);
card('Capability / Memory','Память','Факты и история героя','memory',1206,340,198);
card('Capability / Content','Контент','Тексты и изображения\nв вашем стиле','content',1190,617,214);
card('Capability / Character','Характер','Черты и манера общения','heart',954,711,236);
const core=stack(hero,'Character / SOFIA','VERTICAL',1108,472,11);core.resize(150,160);core.primaryAxisSizingMode='AUTO';core.counterAxisSizingMode='FIXED';core.paddingTop=16;core.paddingBottom=16;core.paddingLeft=16;core.paddingRight=16;core.cornerRadius=18;core.fills=[paint('#100D18',.93)];core.strokes=[paint(lavender,.9)];core.strokeWeight=1;core.effects=[{type:'DROP_SHADOW',color:{...rgb('#B194EC'),a:.24},offset:{x:0,y:0},radius:24,spread:0,visible:true,blendMode:'NORMAL'}];
const portrait=rect(core,'SOFIA portrait',0,0,118,84,[paint('#292233')],10);
const info=stack(core,'Identity','VERTICAL',0,0,4);text(info,'Name','SOFIA',16,white,'Manrope','Medium');text(info,'Profile label','Цифровая личность',9,muted,'Manrope');
const foot=text(hero,'Brand statement','ОДИН ОБРАЗ. СВОЙ ХАРАКТЕР. ВАША ИСТОРИЯ.',10,muted);foot.x=56;foot.y=840;foot.letterSpacing={unit:'PERCENT',value:13};
const marker=text(hero,'Section marker','01 / ОБЛИК',10,muted);marker.x=1290;marker.y=840;marker.letterSpacing={unit:'PERCENT',value:10};
figma.viewport.scrollAndZoomIntoView([hero]);
return {createdNodeIds:ids,heroId:hero.id,backdropId:backdrop.id,portraitId:portrait.id,headingWidth:l2.width,copyBounds:{width:copy.width,height:copy.height},size:{width:hero.width,height:hero.height}};
