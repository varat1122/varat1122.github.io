// Use the displayed two-decimal Fair DR value consistently in comparisons.
(function(){
  const calculateExactFair=fair;
  fair=function(record){
    const value=calculateExactFair(record);
    if(value==null||!Number.isFinite(Number(value))) return null;
    return Math.round((Number(value)+Number.EPSILON)*100)/100;
  };
})();
