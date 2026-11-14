export async function nativeBefore(ui,results){
 await ui.mode('immersive');
 for(const menu of ['items','pets','status']){
  await ui.toolbar(menu);await ui.settle(350);
  if(menu==='pets'){await ui.action('pet-name0');await ui.settle(1500);}
  const evidence=await ui.page.evaluate(()=>({cards:sa.ui.cards.map(c=>({id:c.id,primaryAction:c.primaryAction??null,category:c.category??null})),portrait:sa.ui.portraits.map(p=>({image:p.image,animated:!!p.animation})),stats:sa.ui.panelInfo?.stats??null}));
  results.checks.push({case:'baseline native '+menu,passed:true,evidence});
  await ui.snapshot('before-'+menu);await ui.closePanels();
 }
}
