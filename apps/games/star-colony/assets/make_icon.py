"""Rebuild the original 128 px icon with Pillow; no external images."""
from pathlib import Path
from PIL import Image, ImageDraw
im = Image.new('RGB', (512, 512), '#102b3a')
d = ImageDraw.Draw(im)
for x, y, r in [(51,54,4),(390,78,5),(444,148,3),(120,95,3),(340,36,3),(465,40,3)]:
    d.ellipse((x-r,y-r,x+r,y+r), fill='#e8f9ff')
d.ellipse((-90,270,620,750), fill='#31586a')
d.ellipse((-70,310,610,700), fill='#487484')
d.line((120,395,410,395), fill='#b0d8cc', width=10)
d.ellipse((110,178,354,424), fill='#79d3c7')
d.rectangle((110,300,354,400), fill='#79d3c7')
d.arc((110,178,354,424),180,360, fill='#d8fff3',width=11)
d.arc((174,178,290,424),180,360, fill='#b2ede0',width=6)
d.line((114,300,350,300), fill='#d8fff3', width=8)
d.rounded_rectangle((198,329,268,400),radius=14,fill='#244d61')
d.rectangle((355,300,368,393), fill='#b2d4d9')
d.polygon([(315,240),(443,216),(470,298),(343,322)], fill='#72a7d2')
for a,b in [((350,235),(378,315)),((396,225),(424,306)),((327,279),(454,255))]:
    d.line((a,b), fill='#d7edfa',width=5)
d.rounded_rectangle((90,396,382,414),radius=8,fill='#d9f3df')
im.resize((128, 128), Image.Resampling.LANCZOS).save(Path(__file__).resolve().parent.parent / 'star-colony_icon.png')
