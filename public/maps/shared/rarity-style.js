(function(){
  function getRarityStyle(level){
    if(level === 'rare') return { ringColor:'#f59e0b', ringWidth:3, badgeBg:'#111111', badgeFg:'#ffffff', badgeText:'R' };
    if(level === 'super') return { ringColor:'#dc2626', ringWidth:3, badgeBg:'#111111', badgeFg:'#ffffff', badgeText:'SR' };
    if(level === 'mega') return { ringColor:'#7c3aed', ringWidth:3, badgeBg:'#111111', badgeFg:'#ffffff', badgeText:'MR' };
    return { ringColor:null, ringWidth:3, badgeBg:'#111111', badgeFg:'#ffffff', badgeText:null };
  }
  window.getRarityStyle = getRarityStyle;
})();