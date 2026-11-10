# Original Arrow Escape tile, rendered at 4x and downsampled to 128 px.
from PIL import Image, ImageDraw
im=Image.new('RGB',(512,512),'#182433');d=ImageDraw.Draw(im)
for x in range(48,480,104):
    for y in range(48,480,104): d.rounded_rectangle((x,y,x+88,y+88),16,fill='#25374a')
for points,col in [([(92,300),(92,92),(300,92)],'#73cafa'), ([(404,196),(404,404),(196,404)],'#f7c677')]:
    d.line(points,fill=col,width=25,joint='curve')
    x,y=points[-1];dx=x-points[-2][0];dy=y-points[-2][1]
    if dx>0:d.polygon([(x+24,y),(x-12,y-27),(x-12,y+27)],fill=col)
    else:d.polygon([(x-24,y),(x+12,y-27),(x+12,y+27)],fill=col)
im.resize((128,128),Image.Resampling.LANCZOS).save(__file__.replace('assets/icon-source.py','arrow-escape_icon.png'))
