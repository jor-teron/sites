/* BUB-1: twenty authored layouts. A–F are the six symbol/colour families.
 * Dots are gaps; odd rows have nine cells. No imported artwork or level data. */
(function(root){
  const levels = [
    ['First flight',6,['AABBBBAA..','AA....AA.']],
    ['Twin arches',6,['AABBCCBBAA','AA..CC.AA','BBCC..CCBB']],
    ['Lanterns',6,['AAA.BB.CCC','A...BB..C','BBB.AA.BBB','BB..AA.BB']],
    ['Colour shelves',6,['AABBCCDDAA','ABBCCDDAA','BBCCDDAABB','BCCDDAABB']],
    ['Hanging gardens',5,['AABBAABBAA','AA..AA.AA','CC..DD..CC','C...DD..C','AA......AA']],
    ['Butterfly',5,['AABBBBCCAA','AA.DD.CAA','..DDDDDD..','..CC.CC..']],
    ['Stepping stones',5,['AABBCCDDEE','ABBCCDDEE','.AABBCCDD.','..BBCCDD.','...AABB...']],
    ['Four corners',5,['AABBDDBBAA','AA.CC..AA','BB.CC..BB','BB....BB.','AABB..BBAA']],
    ['Rainbows',5,['AABBCCDDEE','ABBCCDDEE','BBCCDDEEFF','BCCDDEEFF','CCDDEEFFAA']],
    ['Chandelier',5,['AABBAABBAA','.BB..BB..','..CCCCCC..','..CC.CC..','..DDDDDD..','...DDDD..']],
    ['Six banners',5,['AABBCCDDEE','ABBCCDDEE','AABBCCDDEE','ABBCCDDEE','BB..FF..BB','....FF...']],
    ['Honeycomb',4,['AAAABBAAAA','AACCBBCCA','..CCCCCC..','DD.CC.DD.','DD..EE..DD','....EE...']],
    ['Hourglass',4,['AABBCCDDEE','.BBCCDD..','..CCDDEE..','...DDDD..','..EEFFEE..','.EEFFEE..']],
    ['Frozen falls',4,['AABBCCDDEE','ABBCCDDEE','AA..CC..EE','A...CC..E','BB..DD..FF','B...DD..F']],
    ['Kite strings',4,['AAAABBAAAA','CC..BB.CC','CC..DD..CC','EE..DD.EE','EE..FF..EE','....FF...','....AA....']],
    ['Terraces',4,['AABBCCDDEE','ABBCCDDEE','BBCCDDEEFF','BCCDDEEFF','CCDDEEFFAA','CDDEEFFAA']],
    ['Star curtain',4,['AABBAABBAA','AA.CC..AA','DDCCCCCCDD','DD.EE.DD.','FFEEEEEEFF','FF.AA.FF.','...AAAA...']],
    ['Deep reef',4,['AABBCCDDEE','ABBCCDDEE','BBCCDDEEFF','BCCDDEEFF','CCDDEEFFAA','CDDEEFFAA','DD..FF..BB']],
    ['Crystal caves',4,['AAAABBAAAA','CC..BB.CC','CCDDEEDDCC','DD.EE.DD.','EEFFAAFFEE','FF.AA.FF.','AA..BB..AA']],
    ['Final constellation',4,['AABBCCDDEE','ABBCCDDEE','BBCCDDEEFF','BC....EFF','CCDD..FFAA','CDDEEFFAA','DD..FF..BB','DD..FF.BB']]
  ];
  root.BubbleLevels = levels;
  if(typeof module !== 'undefined') module.exports=levels;
})(typeof window !== 'undefined' ? window : globalThis);
